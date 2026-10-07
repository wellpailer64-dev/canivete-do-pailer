"""Exportar o projeto do Editor Kanivete (.vknv) como XML do Final Cut Pro 7 (xmeml v4), que o Premiere Pro abre
em Arquivo › Importar. É a volta do Functions/premiere.py (que lê o .prproj): Kanivete → XML → Premiere.

Vão: todas as timelines (sequências aninhadas viram clipes de sequência), cortes, trilhas (oculta/muda/travada),
vínculos vídeo+áudio, velocidade (Time Remap), clipe desligado, ganho (Audio Levels), Movimento (posição, escala,
rotação) e Opacidade com quadros-chave, Dissolver cruzado / Potência constante e marcadores da sequência.
Não vão (entram no relatório): efeitos do editor (Chroma Key, Luz e Cor, desfoque...), textos, camadas de ajuste,
cores sólidas, formas, desenhos, legendas, Cena 3D e transições que o Premiere não tem.

Convenções do xmeml (Apple, "Final Cut Pro XML Interchange Format"):
- start/end = quadros da sequência; in/out/duration do clipe = quadros da mídia JÁ com a velocidade aplicada.
- Basic Motion: scale em % dos pixels da mídia; center = (x − L/2)/Lm, (y − A/2)/Am, com L×A do quadro e Lm×Am da
  MÍDIA original (como o Premiere lê; conferido com logo PNG menor que o quadro).
- Quadros-chave: <when> no mesmo tempo do in/out (tempo da mídia, com a velocidade).
"""
import os
import uuid
from urllib.parse import quote
from xml.sax.saxutils import escape

_EXT_SO_AUDIO = (".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aif", ".aiff")
_SEM_XML = {"texto": "Textos", "ajuste": "Camadas de ajuste", "cor": "Cores sólidas", "forma": "Formas",
            "pincel": "Desenhos", "legenda": "Legendas"}
_FX_NOMES = {"key": "Chroma Key", "lc": "Luz e Cor", "blur": "Desfoque"}


def _rate(fps):
    """(timebase, ntsc) do xmeml: 29,97 → 30 + NTSC."""
    fps = float(fps or 30)
    base = round(fps)
    ntsc = abs(fps - base * 1000 / 1001) < 0.01 and abs(fps - base) > 0.001
    return base, ntsc


def _rate_xml(fps):
    base, ntsc = _rate(fps)
    return f"<rate><timebase>{base}</timebase><ntsc>{'TRUE' if ntsc else 'FALSE'}</ntsc></rate>"


def _fps_real(fps):
    base, ntsc = _rate(fps)
    return base * 1000 / 1001 if ntsc else float(base)


def _q(t, fps):
    return int(round(float(t or 0) * fps))


def _pathurl(p):
    return "file://localhost/" + quote(os.path.abspath(p).replace("\\", "/"), safe="/")


def _fps_probe(info):
    v = (info or {}).get("video") or {}
    for chave in ("avg_frame_rate", "r_frame_rate"):
        try:
            n, d = str(v.get(chave) or "0/1").split("/")
            if float(d) and float(n) / float(d) > 1:
                return float(n) / float(d)
        except (ValueError, ZeroDivisionError):
            pass
    return None


class _Relatorio:
    def __init__(self):
        self.ignorados = {}
        self.aproximados = {}

    def fora(self, o_que, n=1):
        self.ignorados[o_que] = self.ignorados.get(o_que, 0) + n

    def aprox(self, o_que, n=1):
        self.aproximados[o_que] = self.aproximados.get(o_que, 0) + n


class _Exportador:
    def __init__(self, dados, probe=None):
        self.d = dados
        self.fps = _fps_real(dados.get("fps") or 30)
        self.rel = _Relatorio()
        self.media = {0: {"id": 0, "kind": "video", "path": dados.get("video"),
                          "name": os.path.basename(dados.get("video") or "") or "Vídeo"}}
        for m in dados.get("media") or []:
            if m.get("id") is not None:
                self.media[m["id"]] = m
        self.seqs = {s["id"]: s for s in dados.get("sequences") or [] if s.get("id")}
        if not self.seqs:   # projeto antigo, uma timeline só
            self.seqs = {"seq": {"id": "seq", "name": "Sequência", "clips": dados.get("clips") or [],
                                 "trilhas": dados.get("trilhas") or {}, "markers": dados.get("markers") or [],
                                 "w": dados.get("w"), "h": dados.get("h")}}
        self._probe = probe
        self._info = {}
        self._file_ids = {}
        self._seq_ids = {sid: f"sequence-{i + 1}" for i, sid in enumerate(self.seqs)}
        self._emitidas = set()
        self._n_clip = 0
        self._n_master = 0

    # ── mídia ──
    def info(self, path):
        if path not in self._info:
            i = {}
            if path and os.path.isfile(path):
                if self._probe:
                    i = self._probe(path) or {}
                else:
                    from Functions import midia
                    i = midia.probe(path) or {}
            self._info[path] = i
        return self._info[path]

    def tam_midia(self, m):
        if m.get("kind") == "image" and m.get("w"):
            return m["w"], m["h"]
        i = self.info(m.get("path"))
        w, h = i.get("largura") or 0, i.get("altura") or 0
        # vídeo de celular: gravado deitado com a marca de girar 90° (o mesmo que video_cutter.probe faz)
        v = i.get("video") or {}
        rot = (v.get("tags") or {}).get("rotate", 0)
        for sd in v.get("side_data_list") or []:
            rot = sd.get("rotation", rot)
        try:
            if int(float(rot)) % 180 != 0:
                w, h = h, w
        except (TypeError, ValueError):
            pass
        return w, h

    def file_xml(self, m, fim_usado):
        """<file> completo na primeira vez, depois só a referência (como o Premiere grava)."""
        path = m.get("path")
        if path in self._file_ids:
            return f'<file id="{self._file_ids[path]}"/>'
        fid = f"file-{len(self._file_ids) + 1}"
        self._file_ids[path] = fid
        i = self.info(path)
        kind = m.get("kind")
        mfps = _fps_probe(i) or self.fps
        dur = i.get("duracao") or fim_usado
        frames = max(1, _q(dur, mfps if kind != "image" else self.fps))
        partes = [f'<file id="{fid}">', f"<name>{escape(os.path.basename(path))}</name>",
                  f"<pathurl>{escape(_pathurl(path))}</pathurl>", _rate_xml(mfps), f"<duration>{frames}</duration>",
                  "<media>"]
        if kind != "audio" and (i.get("video") or kind == "image" or not i):
            w, h = self.tam_midia(m)
            partes.append(f"<video><samplecharacteristics>{_rate_xml(mfps)}<width>{w or 1920}</width>"
                          f"<height>{h or 1080}</height><anamorphic>FALSE</anamorphic>"
                          "<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance>"
                          "</samplecharacteristics></video>")
        if kind in ("audio", "video") and (i.get("audio") or not i):
            a = i.get("audio") or {}
            sr = int(a.get("sample_rate") or 48000)
            ch = int(a.get("channels") or 2)
            partes.append(f"<audio><samplecharacteristics><depth>16</depth><samplerate>{sr}</samplerate>"
                          f"</samplecharacteristics><channelcount>{ch}</channelcount></audio>")
        partes.append("</media></file>")
        return "".join(partes)

    def mfps(self, m):
        if m.get("kind") == "image":
            return self.fps
        return _fps_probe(self.info(m.get("path"))) or self.fps

    # ── sequência ──
    def seq_dur(self, s):
        fim = 0.0
        for c in s.get("clips") or []:
            fim = max(fim, float(c.get("st") or 0) + (float(c.get("e") or 0) - float(c.get("s") or 0)) / abs(float(c.get("v") or 1)))
        return fim

    def sequencia_xml(self, sid):
        s = self.seqs[sid]
        xid = self._seq_ids[sid]
        if sid in self._emitidas:
            return f'<sequence id="{xid}"/>'
        self._emitidas.add(sid)
        w, h = int(s.get("w") or self.d.get("w") or 1920), int(s.get("h") or self.d.get("h") or 1080)
        trilhas = s.get("trilhas") or {}
        clips = [c for c in s.get("clips") or [] if c.get("tr", 0) >= 0]
        n_tr = max([c.get("tr", 0) + 1 for c in clips] + [len(trilhas.get("v") or []), len(trilhas.get("a") or []), 1])
        faixas_v = [[] for _ in range(n_tr)]
        faixas_a = [[] for _ in range(n_tr)]
        grupos = {}
        for c in sorted(clips, key=lambda c: float(c.get("st") or 0)):
            for item in self.itens_do_clipe(c, w, h):
                (faixas_v if item["tipo"] == "video" else faixas_a)[c["tr"]].append(item)
                grupos.setdefault(item["grupo"], []).append(item)
        # vínculos: posição (1-based) de cada clipe na faixa
        for faixas, tipo in ((faixas_v, "video"), (faixas_a, "audio")):
            for ti, faixa in enumerate(faixas):
                faixa.sort(key=lambda it: it["start"])
                for ci, it in enumerate(faixa):
                    it["trackindex"], it["clipindex"] = ti + 1, ci + 1
        dur = _q(self.seq_dur(s), self.fps)
        r = _rate_xml(self.fps)
        partes = [f'<sequence id="{xid}">', f"<uuid>{uuid.uuid4()}</uuid>", f"<duration>{dur}</duration>", r,
                  f"<name>{escape(s.get('name') or 'Sequência')}</name>", "<media><video><format><samplecharacteristics>",
                  f"{r}<width>{w}</width><height>{h}</height><anamorphic>FALSE</anamorphic>",
                  "<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance>",
                  "</samplecharacteristics></format>"]
        for ti, faixa in enumerate(faixas_v):
            prop = (trilhas.get("v") or [])[ti] if ti < len(trilhas.get("v") or []) else {}
            partes.append(self.faixa_xml(faixa, grupos, prop or {}, "hide"))
        partes.append("</video><audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics>"
                      "<depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>")
        for ti, faixa in enumerate(faixas_a):
            prop = (trilhas.get("a") or [])[ti] if ti < len(trilhas.get("a") or []) else {}
            partes.append(self.faixa_xml(faixa, grupos, prop or {}, "mute"))
        partes.append("</audio></media>")
        partes.append(f"<timecode>{r}<string>00:00:00:00</string><frame>0</frame>"
                      "<displayformat>NDF</displayformat></timecode>")
        for mk in s.get("markers") or []:
            ini = _q(mk.get("t"), self.fps)
            fim = ini + _q(mk.get("d"), self.fps) if mk.get("d") else -1
            partes.append(f"<marker><comment>{escape(str(mk.get('desc') or ''))}</comment>"
                          f"<name>{escape(str(mk.get('nome') or ''))}</name><in>{ini}</in><out>{fim}</out></marker>")
        if s.get("legendas"):
            self.rel.fora("Legendas da timeline (exporte em Arquivo › Exportar legendas e importe o .srt)")
        partes.append("</sequence>")
        return "".join(partes)

    def faixa_xml(self, faixa, grupos, prop, chave_off):
        partes = ["<track>"]
        for it in faixa:
            partes.append(self.clipitem_xml(it, grupos))
            partes.extend(it["transicoes"])
        partes.append(f"<enabled>{'FALSE' if prop.get(chave_off) else 'TRUE'}</enabled>"
                      f"<locked>{'TRUE' if prop.get('lock') else 'FALSE'}</locked></track>")
        return "".join(partes)

    # ── clipe ──
    def itens_do_clipe(self, c, w, h):
        m = self.media.get(c.get("m", 0))
        if not m:
            self.rel.fora("Clipes com mídia apagada")
            return []
        kind = m.get("kind")
        if kind in _SEM_XML:
            self.rel.fora(_SEM_XML[kind])
            return []
        if m.get("c3d"):
            self.rel.fora("Cenas 3D (renderize e importe o vídeo)")
            return []
        aninhada = m.get("sequenceId") if m.get("sequenceId") in self.seqs else None
        if not aninhada and not m.get("path"):
            self.rel.fora("Clipes sem arquivo")
            return []
        v = float(c.get("v") or 1)
        st, s, e = float(c.get("st") or 0), float(c.get("s") or 0), float(c.get("e") or 0)
        start = _q(st, self.fps)
        end = start + max(1, _q((e - s) / abs(v), self.fps))
        so_audio = kind == "audio" or str(m.get("path") or "").lower().endswith(_EXT_SO_AUDIO)
        tipos = []
        if not so_audio and c.get("x") != "a":
            tipos.append("video")
        if kind != "image" and c.get("x") != "v":
            tem_som = True
            if aninhada:
                tem_som = any(self.media.get(x.get("m", 0), {}).get("kind") in ("video", "audio")
                              for x in self.seqs[aninhada].get("clips") or [])
            elif kind == "video":
                i = self.info(m.get("path"))
                tem_som = bool(i.get("audio")) or not i
            if tem_som:
                tipos.append("audio")
        for f in c.get("fx") or []:
            if f.get("on") is not False:
                self.rel.fora(f"Efeito {_FX_NOMES.get(f.get('t'), f.get('t'))}")
        grupo = ("lk", c["lk"]) if c.get("lk") else ("c", id(c))
        itens = []
        for tipo in tipos:
            self._n_clip += 1
            itens.append({"id": f"clipitem-{self._n_clip}", "tipo": tipo, "c": c, "m": m, "aninhada": aninhada,
                          "start": start, "end": end, "grupo": grupo, "w": w, "h": h,
                          "transicoes": self.transicoes(c, tipo, start, end)})
        return itens

    def transicoes(self, c, tipo, start, end):
        r = _rate_xml(self.fps)
        saida = []
        chaves = (("tin", "start"), ("tout", "end")) if tipo == "video" else (("atin", "start"), ("atout", "end"))
        for chave, lado in chaves:
            t = c.get(chave)
            if not t:
                continue
            nome = t.get("t")
            if tipo == "video" and nome == "dissolve":
                ef = ("<name>Cross Dissolve</name><effectid>Cross Dissolve</effectid><effectcategory>Dissolve"
                      "</effectcategory><effecttype>transition</effecttype><mediatype>video</mediatype>"
                      "<wipecode>0</wipecode><wipeaccuracy>100</wipeaccuracy><startratio>0</startratio>"
                      "<endratio>1</endratio><reverse>FALSE</reverse>")
            elif tipo == "audio" and nome == "cp":
                ef = ("<name>Cross Fade (+3dB)</name><effectid>KGAudioTransCrossFade3dB</effectid>"
                      "<effectcategory>Dissolve</effectcategory><effecttype>transition</effecttype>"
                      "<mediatype>audio</mediatype>")
            else:
                self.rel.fora(f"Transição {nome}")
                continue
            d = max(1, _q(t.get("d") or 0.5, self.fps))
            if lado == "start":
                a, b, al = start, min(end, start + d), "start-black" if chave in ("tin", "atin") else "start"
            else:
                a, b, al = max(start, end - d), end, "end-black"
            saida.append(f"<transitionitem>{r}<start>{a}</start><end>{b}</end><alignment>{al}</alignment>"
                         f"<effect>{ef}</effect></transitionitem>")
        return saida

    def clipitem_xml(self, it, grupos):
        c, m, tipo = it["c"], it["m"], it["tipo"]
        v = float(c.get("v") or 1)
        mfps = self.fps if it["aninhada"] else self.mfps(m)
        s, e = float(c.get("s") or 0), float(c.get("e") or 0)
        if m.get("kind") == "image":
            ini, fim = 0, it["end"] - it["start"]
            dur_midia = fim
        else:
            ini = _q(s / abs(v), mfps)
            fim = ini + max(1, _q((e - s) / abs(v), mfps))
            if it["aninhada"]:
                dur_midia = _q(self.seq_dur(self.seqs[it["aninhada"]]) / abs(v), mfps)
            else:
                dur_midia = _q((self.info(m.get("path")).get("duracao") or e) / abs(v), mfps)
            dur_midia = max(dur_midia, fim)
        nome = m.get("nome") or m.get("name") or os.path.basename(m.get("path") or "") or "Clipe"
        self._n_master += 1
        partes = [f'<clipitem id="{it["id"]}">', f"<masterclipid>masterclip-{self._n_master}</masterclipid>",
                  f"<name>{escape(str(nome))}</name>",
                  f"<enabled>{'FALSE' if c.get('off') else 'TRUE'}</enabled>",
                  f"<duration>{dur_midia}</duration>", _rate_xml(mfps),
                  f"<start>{it['start']}</start><end>{it['end']}</end><in>{ini}</in><out>{fim}</out>"]
        if it["aninhada"]:
            partes.append(self.sequencia_xml(it["aninhada"]))
        else:
            partes.append(self.file_xml(m, e))
        if tipo == "audio":
            partes.append("<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>")
        if abs(v - 1) > 1e-6:
            partes.append(self.filtro_velocidade(v, tipo))
        if tipo == "video":
            partes.extend(self.filtros_video(c, m, it, mfps))
        elif c.get("g"):
            ganho = 10 ** (float(c["g"]) / 20)
            if ganho > 3.98107:
                self.rel.aprox("Ganho acima de +12 dB (limitado a +12)")
                ganho = 3.98107
            partes.append("<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid>"
                          "<effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype>"
                          "<mediatype>audio</mediatype><parameter authoringApp=\"PremierePro\"><parameterid>level"
                          "</parameterid><name>Level</name><valuemin>0</valuemin><valuemax>3.98109</valuemax>"
                          f"<value>{ganho:.5f}</value></parameter></effect></filter>")
        membros = grupos.get(it["grupo"]) or []
        if len(membros) > 1:
            for o in membros:
                partes.append(f"<link><linkclipref>{o['id']}</linkclipref><mediatype>{o['tipo']}</mediatype>"
                              f"<trackindex>{o.get('trackindex', 1)}</trackindex>"
                              f"<clipindex>{o.get('clipindex', 1)}</clipindex></link>")
        partes.append("</clipitem>")
        return "".join(partes)

    def filtro_velocidade(self, v, tipo):
        if v < 0:
            self.rel.aprox("Velocidade invertida (vai como Reverse)")
        return ("<filter><effect><name>Time Remap</name><effectid>timeremap</effectid><effectcategory>motion"
                f"</effectcategory><effecttype>motion</effecttype><mediatype>{tipo}</mediatype>"
                "<parameter authoringApp=\"PremierePro\"><parameterid>variablespeed</parameterid><name>variablespeed"
                "</name><valuemin>0</valuemin><valuemax>1</valuemax><value>0</value></parameter>"
                "<parameter authoringApp=\"PremierePro\"><parameterid>speed</parameterid><name>speed</name>"
                f"<valuemin>-100000</valuemin><valuemax>100000</valuemax><value>{abs(v) * 100:.4f}</value></parameter>"
                "<parameter authoringApp=\"PremierePro\"><parameterid>reverse</parameterid><name>reverse</name>"
                f"<value>{'TRUE' if v < 0 else 'FALSE'}</value></parameter>"
                "<parameter authoringApp=\"PremierePro\"><parameterid>frameblending</parameterid><name>frameblending"
                "</name><value>FALSE</value></parameter></effect></filter>")

    def props_padrao(self, m, w, h):
        sc = 100.0
        mw, mh = self.tam_midia(m) if not m.get("sequenceId") else (w, h)
        if mw and mh:
            caber = 100 * min(w / mw, h / mh)
            sc = min(100.0, caber) if m.get("kind") == "image" else caber
        return {"sc": sc, "x": w / 2, "y": h / 2, "rot": 0.0, "op": 100.0}

    def filtros_video(self, c, m, it, mfps):
        w, h = it["w"], it["h"]
        p = self.props_padrao(m, w, h)
        p.update({k: float(v) for k, v in (c.get("p") or {}).items() if k in p and v is not None})
        for extra in ("ax", "ay", "sx", "sy"):
            if (c.get("p") or {}).get(extra) not in (None, 0, 50, 100):
                self.rel.aprox("Ponto de ancoragem / escala não proporcional")
                break
        k = c.get("k") or {}
        v = abs(float(c.get("v") or 1))
        quando = lambda t: _q(float(t) / v, mfps)
        if any(q.get("i") not in (None, "lin") for ks in k.values() if isinstance(ks, list) for q in ks):
            self.rel.aprox("Quadros-chave com curva (vão como lineares)")
        if k.get("sx") or k.get("sy"):
            self.rel.fora("Quadros-chave de escala horizontal/vertical")

        def param(pid, nome, vmin, vmax, fixo, ks):
            corpo = f"<value>{fixo:.4f}</value>"
            if ks:
                corpo = "".join(f"<keyframe><when>{quando(q['t'])}</when><value>{float(q['v']):.4f}</value></keyframe>"
                                for q in ks)
            return (f"<parameter authoringApp=\"PremierePro\"><parameterid>{pid}</parameterid><name>{nome}</name>"
                    f"<valuemin>{vmin}</valuemin><valuemax>{vmax}</valuemax>{corpo}</parameter>")

        # o Premiere lê o centro em frações do tamanho ORIGINAL da mídia (não do quadro): conferido no Premiere com
        # PNGs menores que o quadro (logo 500×281 a 29%); para mídia do tamanho do quadro as duas contas coincidem
        mw, mh = (w, h) if m.get("sequenceId") else self.tam_midia(m)
        mw, mh = mw or w, mh or h

        def centro(x, y):
            return f"<value><horiz>{(x - w / 2) / mw:.6f}</horiz><vert>{(y - h / 2) / mh:.6f}</vert></value>"

        kx, ky = k.get("x") or [], k.get("y") or []
        if kx or ky:
            tempos = sorted({float(q["t"]) for q in kx + ky})
            corpo_c = "".join(f"<keyframe><when>{quando(t)}</when>"
                              f"{centro(_interp(kx, t, p['x']), _interp(ky, t, p['y']))}</keyframe>" for t in tempos)
        else:
            corpo_c = centro(p["x"], p["y"])
        # Basic Motion SEMPRE explícito: sem ele o Premiere aplica a regra dele e encolhe o vertical 1080×1920 a 56%
        saida = [("<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion"
                         "</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype>"
                         + param("scale", "Scale", 0, 10000, p["sc"], k.get("sc"))
                         + param("rotation", "Rotation", -8640, 8640, p["rot"], k.get("rot"))
                         + "<parameter authoringApp=\"PremierePro\"><parameterid>center</parameterid><name>Center"
                         f"</name>{corpo_c}</parameter></effect></filter>")]
        if abs(p["op"] - 100) > 1e-3 or k.get("op"):
            saida.append("<filter><effect><name>Opacity</name><effectid>opacity</effectid><effectcategory>motion"
                         "</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype>"
                         + param("opacity", "opacity", 0, 100, p["op"], k.get("op")) + "</effect></filter>")
        return saida

    # ── documento ──
    def xml(self, nome):
        ativa = self.d.get("activeSequence")
        ordem = ([ativa] if ativa in self.seqs else []) + [s for s in self.seqs if s != ativa]
        corpo = []
        for sid in ordem:
            if sid not in self._emitidas:
                corpo.append(self.sequencia_xml(sid))
        return ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4"><project>'
                f"<name>{escape(nome)}</name><children>{''.join(corpo)}</children></project></xmeml>\n")


def _interp(ks, t, padrao):
    if not ks:
        return padrao
    ks = sorted(ks, key=lambda q: float(q["t"]))
    if t <= float(ks[0]["t"]):
        return float(ks[0]["v"])
    for a, b in zip(ks, ks[1:]):
        ta, tb = float(a["t"]), float(b["t"])
        if ta <= t <= tb:
            if a.get("i") == "hold" or tb - ta < 1e-9:
                return float(a["v"])
            return float(a["v"]) + (float(b["v"]) - float(a["v"])) * (t - ta) / (tb - ta)
    return float(ks[-1]["v"])


def exportar(path, dados, probe=None):
    """Grava o XML (escrita atômica) e devolve o relatório {sequencias, ignorados, aproximados}."""
    if isinstance(dados, str):
        import json
        dados = json.loads(dados)
    base, ext = os.path.splitext(os.path.abspath(path))
    if base.lower().endswith(".vknv"):   # "Meu projeto.vknv" + filtro XML → "Meu projeto.xml"
        base = base[:-5]
    path = base + ".xml"
    ex = _Exportador(dados, probe)
    texto = ex.xml(os.path.basename(base))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(tmp, path)
    return path, {
        "sequencias": [{"nome": s.get("name") or "Sequência", "clipes": len(s.get("clips") or [])}
                       for s in ex.seqs.values()],
        "ignorados": [{"o_que": k, "qtd": n} for k, n in ex.rel.ignorados.items()],
        "aproximados": [{"o_que": k, "qtd": n} for k, n in ex.rel.aproximados.items()],
    }
