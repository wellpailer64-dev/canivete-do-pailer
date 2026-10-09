"""Importar projeto do Premiere Pro (.prproj) no Editor Kanivete. Só LEITURA: o .prproj nunca é alterado.

O .prproj é um XML compactado (gzip) com um grafo plano de objetos que se referenciam por ObjectID/ObjectUID:
Sequence → TrackGroups (vídeo/áudio) → Track → TrackItem (Start/End na sequência) → SubClip → Clip
(InPoint/OutPoint na fonte, PlaybackSpeed) → Source (mídia ou sequência aninhada) → Media (caminho).
Efeitos ficam na ComponentChain do TrackItem: Motion (posição/escala/rotação), Opacity, e o resto.
Tempos em ticks: 254016000000 por segundo.

converter(path) devolve (dados, relatorio): `dados` no formato do .vknv (Functions/projeto.py), com todas as
sequências; o relatório diz o que não veio (efeitos de plugin, gráficos, mídia faltando...).
O formato não é documentado pela Adobe: testado com projeto do Premiere 2025 (Version 45).
"""
import gzip
import math
import os
import xml.etree.ElementTree as ET
from collections import Counter

TPS = 254016000000          # ticks por segundo
VIDEO_TG = '228cda18-3625-4d2d-951e-348879e4ed93'
EXT_AUDIO = {'.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma', '.aif', '.aiff'}
EXT_IMAGEM = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.psd', '.avif', '.heic'}
TRANS_VIDEO = {'AE.AE_Impact_Pop': 'pop', 'AE.ADBE Cross Dissolve New': 'dissolve', 'AE.AE_Impact_Dissolve': 'dissolve',
               'ADBE Cross Dissolve New': 'dissolve'}
# efeitos que viram propriedades do clipe (o resto entra no relatório)
EFEITOS_LIDOS = {'AE.ADBE Motion', 'AE.ADBE Opacity', 'AE.ADBE MPEG.SourceSettings', 'AE.ADBE Ultra Key',
                 'AE.Impact_Blur_FX', 'AE.ADBE Gaussian Blur 2', 'AE.ADBE Text', 'AE.ADBE Capsule',
                 'AE.ADBE Lumetri', 'AE.Mettle SkyBox Chromatic Aberrations'}
# Lumetri Color → Luz e Cor (efeito 'lc' do editor, mesmas escalas): (seção, nome do Param) → chave. A seção é o
# último Param booleano com nome antes dele (os nomes se repetem: Saturation em Color e em Adjustments).
LUMETRI_LC = {('Color', 'Temperature'): 'temp', ('Color', 'Tint'): 'tint', ('Color', 'Saturation'): 'sat',
              ('Light', 'Exposure'): 'exp', ('Light', 'Contrast'): 'ct', ('Light', 'Highlights'): 'hi',
              ('Light', 'Shadows'): 'sh', ('Light', 'Whites'): 'wh', ('Light', 'Blacks'): 'bl',
              ('Adjustments', 'Faded Film'): 'fade', ('Adjustments', 'Sharpen'): 'sharp',
              ('Adjustments', 'Vibrance'): 'vib', ('Adjustments', 'Saturation'): 'sat2', ('Vignette', 'Amount'): 'vig'}
EXT_SEM_PLAYER = {'.aegraphic', '.mogrt', '.aep'}   # Animation Composer / gráficos animados: o editor não toca


def _seg(ticks):
    return int(ticks) / TPS


class _Grafo:
    def __init__(self, raiz):
        self.id, self.uid = {}, {}
        for el in raiz:
            if 'ObjectID' in el.attrib:
                self.id[el.attrib['ObjectID']] = el
            if 'ObjectUID' in el.attrib:
                self.uid[el.attrib['ObjectUID']] = el
        self.raiz = raiz

    def ref(self, el):
        if el is None:
            return None
        if 'ObjectRef' in el.attrib:
            return self.id.get(el.attrib['ObjectRef'])
        if 'ObjectURef' in el.attrib:
            return self.uid.get(el.attrib['ObjectURef'])
        return None


def _num(txt, padrao=0.0):
    try:
        return float(str(txt).rstrip('.') if str(txt).endswith('.') else txt)
    except (TypeError, ValueError):
        return padrao


def _param_valor(pr):
    """Valor fixo de um parâmetro: o 2º campo do StartKeyframe ('tempo,valor,...')."""
    sk = pr.findtext('StartKeyframe') or ''
    partes = sk.split(',')
    return partes[1] if len(partes) > 1 else (pr.findtext('CurrentValue') or '')


def _param_keyframes(pr):
    """Quadros-chave: 'tempo,valor,interp,...;tempo,valor,...'. Devolve [(seg, valor_txt, interp)]."""
    if (pr.findtext('IsTimeVarying') or '').lower() != 'true':
        return []
    kf = (pr.findtext('Keyframes') or '').strip()
    out = []
    for item in kf.split(';'):
        p = item.split(',')
        if len(p) < 2 or not p[0].strip():
            continue
        try:
            out.append((_seg(p[0]), p[1], p[2] if len(p) > 2 else '0'))
        except ValueError:
            continue
    return out


def _cor_premiere(txt):
    """Cor do Premiere: inteiro de 64 bits, ARGB com 16 bits por canal → '#rrggbb'."""
    try:
        h = f'{int(float(txt)):016x}'
    except (TypeError, ValueError):
        return None
    r, g, b = (int(h[i:i + 4], 16) >> 8 for i in (4, 8, 12))
    return f'#{r:02x}{g:02x}{b:02x}'


def _ultra_key(vals):
    """Ultra Key → Chroma Key do editor (editor-fx.js, 'key'). Os modelos são diferentes: conversão aproximada.
    Pedestal tira ruído do fundo (≈ recorte do preto), Choke encolhe a borda, Soften suaviza."""
    v = {'cor': _cor_premiere(vals.get('Key Color')) or '#00b140', 'ganho': 100, 'bal': 50,
         'preto': round(min(60.0, _num(vals.get('Pedestal'), 10) * 0.5), 1), 'branco': 100,
         'encolher': -round(min(10.0, _num(vals.get('Choke'), 0) / 10)),
         'suave': round(min(20.0, _num(vals.get('Soften'), 0) / 8), 1),
         'spill': 100, 'matte': 0}
    return v


def _interp(cod):
    # Premiere: 0 = linear, 4/5 = Bézier/automática, 1/2 = parar. Aproximado para as curvas do editor.
    return {'0': 'lin', '1': 'hold', '2': 'hold'}.get(str(cod), 'ease')


class _Conversor:
    def __init__(self, path):
        self.path = os.path.abspath(path)
        self.pasta = os.path.dirname(self.path)
        raiz = ET.fromstring(gzip.open(self.path).read())
        self.g = _Grafo(raiz)
        self.rel = {'ignorados': Counter(), 'convertidos': Counter(), 'avisos': [], 'faltando': [], 'seqs': []}
        self.midias = {}          # caminho em minúsculas → dict da mídia do vknv
        self.midia_lista = []
        self.seq_ids = {}         # uid da Sequence → id no vknv
        self.seq_midia = {}       # uid da Sequence → id da mídia 'timeline'
        self.lk_n = 0

    # ── mídia ──
    def _caminho(self, med):
        rel = (med.findtext('RelativePath') or '').strip()
        nome = os.path.basename(rel.replace('\\', '/')) or (med.findtext('Title') or '').strip()
        cands = []
        for campo in ('ActualMediaFilePath', 'FilePath'):
            for v in med.findall(campo):
                v = (v.text or '').strip()
                if not v:
                    continue
                cands.append(v)
                if nome:
                    cands.append(os.path.join(v, nome))
        if rel:
            cands.append(os.path.normpath(os.path.join(self.pasta, rel)))
        for c in cands:
            if os.path.isfile(c):
                return c, True
        arqs = [c for c in cands if os.path.splitext(c)[1]]
        return (arqs[0] if arqs else (cands[0] if cands else nome)), False

    def _midia(self, med, fonte):
        caminho, existe = self._caminho(med)
        chave = caminho.lower()
        if chave in self.midias:
            return self.midias[chave]
        ext = os.path.splitext(caminho)[1].lower()
        if not ext:
            return None   # gráfico/título do próprio Premiere (sem arquivo)
        kind = 'audio' if ext in EXT_AUDIO else 'image' if ext in EXT_IMAGEM else 'video'
        if kind == 'video' and fonte is not None and fonte.tag == 'AudioMediaSource' and self._so_audio(med):
            kind = 'audio'
        m = {'id': None, 'kind': kind, 'path': caminho, 'name': os.path.basename(caminho)}
        vs = self.g.ref(med.find('VideoStream'))
        if vs is not None:
            r = (vs.findtext('FrameRect') or '').split(',')
            if len(r) == 4:
                m['_w'], m['_h'] = int(_num(r[2])), int(_num(r[3]))
        if not existe:
            self.rel['faltando'].append(caminho)
        self.midias[chave] = m
        self.midia_lista.append(m)
        return m

    def _so_audio(self, med):
        return med.find('VideoStream') is None

    # ── sequências ──
    def _info_seq(self, seq):
        grupos = {}
        tgs = seq.find('TrackGroups')
        for tg in (tgs if tgs is not None else []):
            grupo = self.g.ref(tg.find('Second'))
            if grupo is not None:
                grupos[grupo.tag] = grupo
        vg = grupos.get('VideoTrackGroup')
        w, h, fps = 1920, 1080, 30.0
        if vg is not None:
            r = (vg.findtext('FrameRect') or '').split(',')
            if len(r) == 4:
                w, h = int(_num(r[2])), int(_num(r[3]))
            fr = _num(vg.findtext('TrackGroup/FrameRate'), 0)
            if fr:
                fps = TPS / fr
        return grupos, w, h, fps

    def converter(self):
        seqs = [e for e in self.g.raiz if e.tag == 'Sequence']
        for i, s in enumerate(seqs):
            self.seq_ids[s.attrib.get('ObjectUID')] = f'seq_pr_{i}'
        # mídia 'timeline' de cada sequência (para clipes aninhados e para o painel Projeto)
        for s in seqs:
            mid = {'id': None, 'kind': 'timeline', 'name': s.findtext('Name') or 'Sequência',
                   'sequenceId': self.seq_ids[s.attrib.get('ObjectUID')]}
            self.seq_midia[s.attrib.get('ObjectUID')] = mid
        sequencias = [self._sequencia(s) for s in seqs]
        sequencias = [s for s in sequencias if s]
        if not sequencias:
            raise ValueError('Nenhuma sequência encontrada no projeto do Premiere')
        ativa = max(sequencias, key=lambda s: len(s['clips']))
        # mídia principal (id 0) = o vídeo mais usado na timeline ativa; o resto ganha ids a partir de 1
        def mais_usado(clipes):
            uso = Counter(id(c['_m']) for c in clipes if c.get('_m') is not None and c['_m']['kind'] == 'video')
            por_id = {id(c['_m']): c['_m'] for c in clipes if c.get('_m') is not None}
            return por_id[uso.most_common(1)[0][0]] if uso else None
        base = mais_usado(ativa['clips']) or mais_usado([c for s in sequencias for c in s['clips']])
        prox = 1
        for m in self.midia_lista + list(self.seq_midia.values()):
            if m is base:
                m['id'] = 0
            else:
                m['id'] = prox
                prox += 1
        for s in sequencias:
            for c in s['clips']:
                m = c.pop('_m', None)
                if m is not None and m['id']:
                    c['m'] = m['id']
        media = []
        for m in self.midia_lista + list(self.seq_midia.values()):
            if m is base:
                continue
            o = {k: v for k, v in m.items() if not k.startswith('_')}
            if o['kind'] == 'image':
                o['w'], o['h'] = m.get('_w', 0), m.get('_h', 0)
            media.append(o)
        dados = {
            'app': 'KANIVETE', 'video': base['path'] if base else None, 'media': media, 'bins': [], 'm0': None,
            'sequences': sequencias, 'activeSequence': ativa['id'],
            'importado_de': {'premiere': self.path},
        }
        return dados, self._relatorio(sequencias)

    def _sequencia(self, seq):
        grupos, w, h, fps = self._info_seq(seq)
        sid = self.seq_ids[seq.attrib.get('ObjectUID')]
        clipes, itens = [], {}
        mixer, master = [], None
        for tipo, grupo in (('v', grupos.get('VideoTrackGroup')), ('a', grupos.get('AudioTrackGroup'))):
            if grupo is None:
                continue
            if tipo == 'a':
                mt = self.g.ref(grupo.find('MasterTrack'))
                master = self._mixer_trilha(mt.find('AudioTrack') if mt is not None else None)
            for k, tr in enumerate(grupo.findall('TrackGroup/Tracks/Track')):
                trilha = self.g.ref(tr)
                if trilha is None:
                    continue
                if tipo == 'a':
                    mixer.append(self._mixer_trilha(trilha.find('AudioTrack')))
                for ti in trilha.findall('.//ClipItems/TrackItems/TrackItem'):
                    item = self.g.ref(ti)
                    c = self._clipe(item, tipo, k, w, h) if item is not None else None
                    if c:
                        clipes.append(c)
                        itens[ti.attrib.get('ObjectRef')] = c
                for ti in trilha.findall('.//TransitionItems/TrackItems/TrackItem'):
                    item = self.g.ref(ti)
                    if item is not None:
                        self._transicao(item, tipo, k, clipes)
        self._vinculos(seq, itens)
        # vídeo com som do mesmo arquivo, mesmos tempos e vinculado: um clipe só (como o editor cria)
        nome = seq.findtext('Name') or 'Sequência'
        self.rel['seqs'].append((nome, len(clipes)))
        # Mixer de trilhas de áudio: volume/pan/M/S de cada trilha e o volume do Mix (Master) — editor-mixer.js
        trilhas = None
        if any(mixer):
            n = len(mixer)
            trilhas = {'v': [{} for _ in range(n)], 'a': mixer}
            self.rel['convertidos']['Mixer de trilhas (volume/pan/mudo/solo)'] += sum(1 for m in mixer if m)
        out = {'id': sid, 'name': nome, 'clips': clipes, 'trilhas': trilhas, 'w': w, 'h': h, 'markers': self._marcadores(seq),
               'legendas': [], 'inPt': None, 'outPt': None, 'playhead': 0, 'view': {'pps': 0, 'x': 0}, '_fps': fps}
        if master and master.get('vol'):
            out['master'] = {'vol': master['vol']}
            self.rel['convertidos']['Volume do Mix (Master)'] += 1
        return out

    def _mixer_trilha(self, at):
        """Volume (dB), pan (−100..100), mudo e solo de uma trilha de áudio, como no Mixer de trilhas do Premiere:
        o AudioFader da cadeia da trilha (Volume em ganho linear, Mute) e o Panner (Balance 0..1, 0,5 = centro).
        Automação (quadros-chave do volume/pan da trilha) não vem: fica o valor do começo."""
        o = {}
        if at is None:
            return o
        chain = self.g.ref(at.find('ComponentOwner/Components'))
        for comp in (chain.findall('.//Components/Component') if chain is not None else []):
            fader = self.g.ref(comp)
            if fader is None or fader.tag != 'AudioFader':
                continue
            for p in fader.findall('.//Params/Param'):
                pr = self.g.ref(p)
                nome = pr.findtext('Name') if pr is not None else None
                if nome == 'Volume' and _param_valor(pr):
                    lin = _num(_param_valor(pr), 1.0)
                    o['vol'] = round(20 * math.log10(lin), 2) if lin > 1.6e-5 else -96
                    if _param_keyframes(pr):
                        self.rel['ignorados']['Automação de volume da trilha (Mixer)'] += 1
                elif nome == 'Mute' and _param_valor(pr).strip().lower() == 'true':
                    o['mute'] = True
        pan = self.g.ref(at.find('Panner'))
        for p in (pan.findall('.//Params/Param') if pan is not None else []):
            pr = self.g.ref(p)
            if pr is not None and pr.findtext('Name') == 'Balance' and _param_valor(pr):
                o['pan'] = round((_num(_param_valor(pr), 0.5) * 2 - 1) * 100, 1)
                if _param_keyframes(pr):
                    self.rel['ignorados']['Automação de pan da trilha (Mixer)'] += 1
        if (at.findtext('Solo') or '').strip() == '1':
            o['solo'] = True
        fx = self._efeitos_audio(at.find('ComponentOwner/Components'))   # rack de efeitos da trilha (Mixer)
        if fx:
            o['fx'] = fx
        return {k: v for k, v in o.items() if v not in (0, 0.0)}

    def _clipe(self, item, tipo, k, W, H):
        cti = item.find('ClipTrackItem')
        if cti is None:
            return None
        st = _seg(cti.findtext('TrackItem/Start') or 0)
        fim = _seg(cti.findtext('TrackItem/End') or 0)
        sub = self.g.ref(cti.find('SubClip'))
        clip = self.g.ref(sub.find('Clip')) if sub is not None else None
        if clip is None or fim <= st:
            return None
        cl = clip.find('Clip')
        if cl is None:   # RemixClip (áudio remixado no Premiere): lê o clipe original de dentro dele
            orig = self.g.ref(clip.find('OriginalChildClip'))
            cl = orig.find('Clip') if orig is not None and orig.find('Clip') is not None else clip.find('.//Clip')
        if cl is None:
            self.rel['ignorados'][f'Clipe de tipo desconhecido ({clip.tag})'] += 1
            return None
        ent = _seg(cl.findtext('InPoint') or 0)
        sai = _seg(cl.findtext('OutPoint') or 0)
        vel = _num(cl.findtext('PlaybackSpeed'), 1.0) or 1.0
        fonte = self.g.ref(cl.find('Source'))
        nome_sub = (sub.findtext('Name') or '').strip()
        if fonte is None:
            self.rel['ignorados'][f'Clipe sem mídia: {nome_sub or "?"}'] += 1
            return None
        if fonte.tag.endswith('SequenceSource'):
            alvo = fonte.find('.//Sequence')
            m = self.seq_midia.get(alvo.attrib.get('ObjectURef')) if alvo is not None else None
            if m is None:
                return None
        else:
            med = self.g.ref(fonte.find('MediaSource/Media'))
            titulo = (med.findtext('Title') or '').strip() if med is not None else ''
            ext = os.path.splitext(self._caminho(med)[0])[1].lower() if med is not None else ''
            if ext in EXT_SEM_PLAYER:
                self.rel['ignorados'][f'Gráfico animado {ext} (Animation Composer etc.; o editor não toca)'] += 1
                return None
            m = self._midia(med, fonte) if med is not None else None
            if m is None and tipo == 'v':
                return self._clipe_sintetico(cti, titulo, nome_sub, k, st, fim, W, H)
            if m is None:
                return None
        if vel < 0:
            self.rel['ignorados']['Velocidade invertida (tocará para a frente)'] += 1
            vel = abs(vel)
        dur_tl = fim - st
        # o trecho da fonte segue a duração na timeline × velocidade (In/Out do Premiere às vezes sobram)
        e = ent + dur_tl * vel
        if sai and abs(sai - e) > 0.05 and vel == 1.0:
            self.rel['avisos'].append(f'{m["name"]}: In/Out ({ent:.2f}–{sai:.2f}s) não bate com a duração na timeline; usada a da timeline')
        c = {'tr': k, 'st': round(st, 6), 's': round(ent, 6), 'e': round(e, 6), '_m': m}
        if abs(vel - 1) > 1e-6:
            c['v'] = round(vel, 6)
        if m['kind'] == 'video':
            c['x'] = tipo
        elif m['kind'] == 'timeline':
            c['x'] = tipo
        elif m['kind'] == 'audio' and tipo == 'v':
            return None
        elif m['kind'] == 'image' and tipo == 'a':
            return None
        if tipo == 'v':
            self._efeitos(cti, c, m, W, H, ent)
        else:
            afx = self._efeitos_audio(cti.find('ComponentOwner/Components'))
            if afx:
                c['afx'] = afx
        return c

    def _efeitos_audio(self, owner):
        """Efeitos de áudio de uma cadeia (clipe ou trilha): cada AudioFilterComponent vira {"t": "pr_<nome>", "v":
        {"p0": 0..1, ...}} — os valores como o Premiere guarda (Functions/efeitos_pr.py, editor-afx-pr.js)."""
        from Functions import efeitos_pr
        chain = self.g.ref(owner) if owner is not None else None
        if chain is None:
            return []
        dados = efeitos_pr.dados()
        out = []
        for comp in chain.findall('.//Components/Component'):
            o = self.g.ref(comp)
            if o is None or o.tag != 'AudioFilterComponent':
                continue
            match = (o.findtext('FilterMatchName') or '').strip()
            e = dados.get(match)
            if e is None:
                self.rel['ignorados'][f'Efeito de áudio de terceiros ({match[:40]})'] += 1
                continue
            v, kf = {}, False
            for i, p in enumerate(o.findall('.//Params/Param')):
                pr = self.g.ref(p)
                if pr is None:
                    continue
                txt = (_param_valor(pr) or '').strip().lower()
                if not txt:   # o Premiere não grava o valor que está no padrão
                    d = e['p'][i]['d'] if i < len(e['p']) else 0
                    v[f'p{i}'] = int(d) if isinstance(d, bool) else d
                    continue
                v[f'p{i}'] = 1 if txt == 'true' else 0 if txt == 'false' else round(_num(txt, 0.0), 9)
                kf = kf or bool(_param_keyframes(pr))
            if kf:
                self.rel['ignorados'][f'Quadros-chave em {e["nome"]} (fica o valor do começo)'] += 1
            out.append({'id': f'pr{len(out)}_{self.lk_n}_{id(o) % 100000}', 't': efeitos_pr.tipo_de(e['nome']), 'on': True, 'v': v})
            self.rel['convertidos'][f'Efeito de áudio: {e["nome"]}' + ('' if e.get('som') else ' (sem prévia no Kanivete)')] += 1
        return out

    def _midia_fixa(self, kind, nome):
        chave = f'::{kind}'
        if chave not in self.midias:
            m = {'id': None, 'kind': kind, 'name': nome}
            self.midias[chave] = m
            self.midia_lista.append(m)
        return self.midias[chave]

    def _texto_do_grafico(self, cti):
        chain = self.g.ref(cti.find('ComponentOwner/Components'))
        if chain is None:
            return None
        for comp in chain.findall('.//Components/Component'):
            fx = self.g.ref(comp)
            if fx is not None and (fx.findtext('.//MatchName') == 'AE.ADBE Text'):
                t = fx.findtext('.//InstanceName') or ''
                t = t.replace(chr(13) + chr(10), chr(10)).replace(chr(13), chr(10)).strip()
                if t:
                    return t
        return None

    def _estilo_texto(self, cti, W, H):
        """Fonte, tamanho e posição do texto do Premiere (AE.ADBE Text). O Source Text é um FlatBuffers sem esquema
        público: as fontes vêm pelo nome PostScript (Familia-Estilo) e o tamanho é o float logo depois de um 4.0
        (visto em todos os textos do projeto "Respeite o seu voto"). Cor: não achada no blob (fica branca)."""
        import base64, re, struct
        chain = self.g.ref(cti.find('ComponentOwner/Components'))
        if chain is None:
            return {}
        for comp in chain.findall('.//Components/Component'):
            fx = self.g.ref(comp)
            if fx is None or fx.findtext('.//MatchName') != 'AE.ADBE Text':
                continue
            out, vals = {}, {}
            for i, pp in enumerate(fx.findall('.//Params/Param')):
                pr = self.g.ref(pp)
                if pr is None:
                    continue
                if i == 0:
                    b = b''   # o blob fica em StartKeyframeValue ou, com quadros-chave, dentro de Keyframes
                    for el in pr.iter():
                        txt = (el.text or '').strip()
                        if len(txt) > 40 and el.tag != 'Keyframes':
                            try:
                                b = base64.b64decode(txt + '==')
                                break
                            except Exception:
                                pass
                    nome_t = (fx.findtext('.//InstanceName') or '').strip()
                    if b:
                        self._blobs_texto = getattr(self, '_blobs_texto', None) or {}
                        self._blobs_texto.setdefault(nome_t, b)
                    else:   # cópia da sequência com o Source Text vazio: o estilo do mesmo texto noutra sequência
                        b = self._blob_texto(nome_t)
                    fontes = re.findall(rb'([A-Z][A-Za-z0-9]+)-([A-Za-z]+)\x00', b)
                    if fontes:
                        fam = re.sub(r'(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])', ' ', fontes[0][0].decode())
                        out['fonte'] = fam
                        out['neg'] = any(s.decode().lower() in ('semibold', 'bold', 'heavy', 'black', 'extrabold') for _, s in fontes)
                        out['ita'] = any('italic' in s.decode().lower() for _, s in fontes)
                    for j in range(0, len(b) - 7, 4):
                        if struct.unpack_from('<f', b, j)[0] == 4.0:
                            v = struct.unpack_from('<f', b, j + 4)[0]
                            if 4 <= v <= 1000:
                                out['tam'] = v
                                break
                elif pr.findtext('Name'):
                    vals.setdefault(pr.findtext('Name'), _param_valor(pr))
            esc = _num(vals.get('Scale'), 100) / 100
            if 'tam' in out:
                out['tam'] = round(out['tam'] * esc, 1)
            pos = str(vals.get('Position') or '')
            if ':' in pos:
                a, b2 = pos.split(':')[:2]
                out['x'], out['y'] = round(_num(a, .5) * W, 1), round(_num(b2, .5) * H, 1)
            return out
        return {}

    def _blob_texto(self, nome):
        import base64
        if getattr(self, '_blobs_todos', None) is None:
            self._blobs_todos = {}
            for fx in self.g.raiz.iter() if hasattr(self.g, 'raiz') else []:
                if fx.findtext('MatchName') != 'AE.ADBE Text':
                    continue
                pp = fx.findall('.//Params/Param')
                pr = self.g.ref(pp[0]) if pp else None
                txt = ((pr.findtext('StartKeyframeValue') if pr is not None else '') or '').strip()
                if len(txt) > 40:
                    try:
                        self._blobs_todos.setdefault((fx.findtext('.//InstanceName') or '').strip(), base64.b64decode(txt + '=='))
                    except Exception:
                        pass
        return self._blobs_todos.get(nome, b'')

    def _clipe_sintetico(self, cti, titulo, nome_sub, k, st, fim, W, H):
        """Camada de ajuste → mídia 'ajuste'; gráfico com texto → mídia 'texto' (só o texto; estilo padrão)."""
        dur = round(fim - st, 6)
        if 'adjustment layer' in (titulo + ' ' + nome_sub).lower() or 'camada de ajuste' in nome_sub.lower():
            m = self._midia_fixa('ajuste', 'Camada de ajuste')
            c = {'tr': k, 'st': round(st, 6), 's': 0, 'e': dur, '_m': m}
            self._efeitos(cti, c, m, W, H, 0)
            c.pop('p', None)   # camada de ajuste não tem posição
            c.pop('k', None)
            self.rel['convertidos']['Camada de ajuste'] += 1
            return c
        texto = self._texto_do_grafico(cti)
        if texto:
            m = self._midia_fixa('texto', 'Texto')
            tx = {'t': texto, 'fonte': 'Arial', 'tam': 90, 'neg': True, 'ita': False, 'alin': 'center', 'esp': 0, 'ent': 120,
                  'cor': '#ffffff', 'cOn': False, 'cCor': '#000000', 'cLarg': 6, 'fOn': False, 'fCor': '#000000', 'fOp': 60,
                  'fPad': 24, 'fRaio': 12, 'sOn': True, 'sCor': '#000000', 'sOp': 60, 'sDist': 6, 'sBlur': 10, 'sAng': 135}
            est = self._estilo_texto(cti, W, H)
            for a in ('fonte', 'tam', 'neg', 'ita'):
                if a in est:
                    tx[a] = est[a]
            c = {'tr': k, 'st': round(st, 6), 's': 0, 'e': dur, '_m': m, 'tx': tx,
                 'p': {'sc': 100, 'x': est.get('x', W / 2), 'y': est.get('y', H * 0.82), 'rot': 0, 'op': 100}}
            self.rel['convertidos']['Texto (fonte, tamanho e posição; cor branca)' if est else 'Texto (só o texto; fonte e estilo padrão do editor)'] += 1
            return c
        self.rel['ignorados'][f'Gráfico do Premiere sem texto ({titulo or "sem nome"})'] += 1
        return None

    def _efeitos(self, cti, c, m, W, H, ent):
        chain = self.g.ref(cti.find('ComponentOwner/Components'))
        if chain is None:
            return
        p, k, fx_lista = {}, {}, []
        for comp in chain.findall('.//Components/Component'):
            fx = self.g.ref(comp)
            if fx is None:
                continue
            mn = fx.findtext('.//MatchName') or fx.findtext('FilterMatchName') or '?'
            if mn not in EFEITOS_LIDOS:
                self.rel['ignorados'][f'Efeito {fx.findtext(".//DisplayName") or mn}'] += 1
                continue
            if mn in ('AE.ADBE Text', 'AE.ADBE Capsule'):
                continue   # texto: lido em _texto_do_grafico
            if mn in ('AE.Impact_Blur_FX', 'AE.ADBE Gaussian Blur 2'):
                vals = {}
                for pp in fx.findall('.//Params/Param'):
                    pr = self.g.ref(pp)
                    if pr is not None and pr.findtext('Name'):
                        vals.setdefault(pr.findtext('Name'), _param_valor(pr))
                # editor: 100% = sigma de 5% do lado menor (54 px em 1080); Impact Amount ≈ %, Blurriness em px
                amt = _num(vals.get('Amount'), 0) if mn == 'AE.Impact_Blur_FX' else _num(vals.get('Blurriness'), 0) / 54 * 100
                if amt > 0:
                    self.n_fx = getattr(self, 'n_fx', 0) + 1
                    fx_lista.append({'id': f'fpr{self.n_fx}', 't': 'blur', 'on': True, 'v': {'amt': round(min(100, amt), 1)}})
                    self.rel['convertidos']['Desfoque gaussiano'] += 1
                continue
            if mn == 'AE.Mettle SkyBox Chromatic Aberrations':
                vals = {}
                for pp in fx.findall('.//Params/Param'):
                    pr = self.g.ref(pp)
                    if pr is not None and pr.findtext('Name'):
                        vals.setdefault(pr.findtext('Name'), _param_valor(pr))
                v = {k: round(_num(vals.get(f'Aberration ({n})'), 0), 2) for k, n in (('r', 'Red'), ('g', 'Green'), ('b', 'Blue'))}
                v['raio'] = 60   # Falloff: no render do Premiere as bordas ficam sem franja e o centro com ~1,5 px
                if any(v.values()):
                    self.n_fx = getattr(self, 'n_fx', 0) + 1
                    fx_lista.append({'id': f'fpr{self.n_fx}', 't': 'ca', 'on': True, 'v': v})
                    self.rel['convertidos']['VR Chromatic Aberrations → Aberração cromática'] += 1
                continue
            if mn == 'AE.ADBE Lumetri':
                v, sec, anim = {}, '', False
                for pp in fx.findall('.//Params/Param'):
                    pr = self.g.ref(pp)
                    if pr is None:
                        continue
                    nome, val = pr.findtext('Name'), _param_valor(pr)
                    if str(val) in ('true', 'false') and nome and nome.strip():
                        sec = nome
                        continue
                    ch = LUMETRI_LC.get((sec, nome))
                    if ch:
                        v[ch] = _num(val, 0)
                        anim = anim or bool(_param_keyframes(pr))
                v['sat'] = v.get('sat', 100) * v.pop('sat2', 100) / 100
                if 'vig' in v:   # Premiere: -3 (escurece) a +3 (clareia); editor: 0 a 100, só escurece
                    v['vig'] = max(0.0, min(100.0, -v['vig'] / 3 * 100))
                padrao = {'sat': 100}
                v = {a: round(b, 2) for a, b in v.items() if abs(b - padrao.get(a, 0)) > 1e-3}
                if v:
                    self.n_fx = getattr(self, 'n_fx', 0) + 1
                    fx_lista.append({'id': f'fpr{self.n_fx}', 't': 'lc', 'on': True, 'v': v})
                    self.rel['convertidos']['Lumetri Color → Luz e Cor'] += 1
                    if anim:
                        self.rel['ignorados']['Lumetri animado (vem o valor fixo)'] += 1
                continue
            if mn == 'AE.ADBE Ultra Key':
                if any(f['t'] == 'key' for f in fx_lista):
                    self.rel['ignorados']['Segundo Ultra Key no mesmo clipe (o editor usa o primeiro)'] += 1
                    continue
                vals = {}
                for pp in fx.findall('.//Params/Param'):
                    pr = self.g.ref(pp)
                    if pr is not None and pr.findtext('Name'):
                        vals.setdefault(pr.findtext('Name'), _param_valor(pr))
                self.n_fx = getattr(self, 'n_fx', 0) + 1
                fx_lista.append({'id': f'fpr{self.n_fx}', 't': 'key', 'on': True, 'v': _ultra_key(vals)})
                self.rel['convertidos']['Ultra Key → Chroma Key (parâmetros aproximados)'] += 1
                continue
            for pp in fx.findall('.//Params/Param'):
                pr = self.g.ref(pp)
                if pr is None:
                    continue
                nome = pr.findtext('Name')
                kfs = _param_keyframes(pr)
                val = _param_valor(pr)
                if mn == 'AE.ADBE Motion':
                    if nome == 'Position':
                        def xy(t):
                            a, b = (t.split(':') + ['0.5'])[:2]
                            return _num(a, 0.5) * W, _num(b, 0.5) * H
                        x, y = xy(val)
                        p['x'], p['y'] = round(x, 2), round(y, 2)
                        if kfs:
                            k['x'] = [{'t': round(t, 5), 'v': round(xy(v)[0], 2), 'i': _interp(i)} for t, v, i in kfs]
                            k['y'] = [{'t': round(t, 5), 'v': round(xy(v)[1], 2), 'i': _interp(i)} for t, v, i in kfs]
                    elif nome == 'Scale':
                        p['sc'] = round(_num(val, 100), 3)
                        if kfs:
                            k['sc'] = [{'t': round(t, 5), 'v': round(_num(v, 100), 3), 'i': _interp(i)} for t, v, i in kfs]
                    elif nome == 'Rotation':
                        p['rot'] = round(_num(val, 0), 3)
                        if kfs:
                            k['rot'] = [{'t': round(t, 5), 'v': round(_num(v, 0), 3), 'i': _interp(i)} for t, v, i in kfs]
                    elif nome == 'Anchor Point':
                        a, b = (val.split(':') + ['0.5'])[:2]
                        if (abs(_num(a, .5) - .5) > 1e-4 or abs(_num(b, .5) - .5) > 1e-4) and m.get('_w'):
                            p['ax'], p['ay'] = round(_num(a) * m['_w'], 1), round(_num(b) * m['_h'], 1)
                    elif nome in ('Crop Left', 'Crop Top', 'Crop Right', 'Crop Bottom') and _num(val, 0):
                        self.rel['ignorados']['Corte de bordas (Crop) do Motion'] += 1
                    elif nome in ('Scale Height', 'Scale Width') and kfs:
                        self.rel['ignorados']['Escala não proporcional'] += 1
                elif mn == 'AE.ADBE Opacity' and nome == 'Opacity':
                    p['op'] = round(_num(val, 100), 2)
                    if kfs:
                        k['op'] = [{'t': round(t, 5), 'v': round(_num(v, 100), 2), 'i': _interp(i)} for t, v, i in kfs]
        if fx_lista:
            c['fx'] = fx_lista
        if k:
            self._ajusta_tempo_kf(k, c, ent)
            c['k'] = k
        if p:
            # sem Motion explícito o editor ajusta ao quadro; com Motion, a escala do Premiere é em pixels da mídia
            c['p'] = {'sc': 100, 'x': W / 2, 'y': H / 2, 'rot': 0, 'op': 100, **p}

    def _ajusta_tempo_kf(self, k, c, ent):
        """Quadros-chave vêm no tempo da mídia; em sequência aninhada há um deslocamento (ex.: 01:00:00:00)."""
        ts = [q['t'] for lst in k.values() for q in lst]
        fim = c['e']
        if ts and min(ts) > fim + 1 and min(ts) - ent > 60:
            desl = min(ts) - ent
            for lst in k.values():
                for q in lst:
                    q['t'] = round(q['t'] - desl, 5)
            self.rel['avisos'].append(f'quadros-chave deslocados em {desl:.0f}s (tempo de mídia aninhada)')

    def _transicao(self, item, tipo, k, clipes):
        tti = item.find('TransitionTrackItem')
        if tti is None:
            return
        st = _seg(tti.findtext('TrackItem/Start') or 0)
        fim = _seg(tti.findtext('TrackItem/End') or 0)
        mn = tti.findtext('MatchName') or ''
        nome = tti.findtext('DisplayName') or mn
        entra = (tti.findtext('HasIncomingClip') or '').lower() == 'true'
        sai = (tti.findtext('HasOutgoingClip') or '').lower() == 'true'
        d = round(max(0.05, fim - st), 4)
        mesma = [c for c in clipes if c['tr'] == k and c.get('x', tipo) == tipo]
        dur = lambda c: (c['e'] - c['s']) / c.get('v', 1)
        if tipo == 'v':
            t = TRANS_VIDEO.get(mn)
            if not t:
                self.rel['ignorados'][f'Transição {nome} (virou Dissolução cruzada)'] += 1
                t = 'dissolve'
            campo_in, campo_out, obj = 'tin', 'tout', {'t': t, 'd': d}
        else:
            campo_in, campo_out, obj = 'atin', 'atout', {'t': 'cp', 'd': d}
        if entra:
            alvo = min(mesma, key=lambda c: abs(c['st'] - (st if not sai else (st + fim) / 2)), default=None)
            if alvo is not None and (not sai or abs(alvo['st'] - (st + fim) / 2) < d):
                alvo[campo_in] = obj
                return
            alvo = min(mesma, key=lambda c: abs(c['st'] - st), default=None)
            if alvo is not None and abs(alvo['st'] - st) < d + 0.05:
                alvo[campo_in] = obj
                return
        if sai:
            alvo = min(mesma, key=lambda c: abs(c['st'] + dur(c) - fim), default=None)
            if alvo is not None and abs(alvo['st'] + dur(alvo) - fim) < d + 0.05:
                alvo[campo_out] = obj
                return
        self.rel['ignorados'][f'Transição {nome} sem clipe correspondente'] += 1

    def _vinculos(self, seq, itens):
        for lk in seq.findall('PersistentGroupContainer/LinkContainer/Links/Link'):
            link = self.g.ref(lk)
            if link is None:
                continue
            membros = [itens.get(t.attrib.get('ObjectRef')) for t in link.findall('.//TrackItems/TrackItem')]
            membros = [c for c in membros if c is not None]
            if len(membros) < 2:
                continue
            self.lk_n += 1
            for c in membros:
                c['lk'] = f'pr{self.lk_n}'

    def _marcadores(self, seq):
        out = []
        mo = seq.find('.//MarkerOwner/Markers')
        lista = self.g.ref(mo) if mo is not None else None
        if lista is None:
            return out
        for mk in lista.findall('Markers/Marker'):
            m = self.g.ref(mk.find('Second'))
            if m is None:
                continue
            t = _seg(m.findtext('.//Start') or m.findtext('.//InPoint') or 0)
            item = {'t': round(t, 4), 'cor': '#4ade80', 'nome': (m.findtext('.//Name') or '').strip()}
            d = _seg(m.findtext('.//Duration') or 0)
            if d > 0:
                item['d'] = round(d, 4)
            out.append(item)
        return out

    def _relatorio(self, sequencias):
        r = self.rel
        return {
            'sequencias': [{'nome': n, 'clipes': q} for n, q in r['seqs']],
            'ignorados': [{'o_que': k, 'qtd': v} for k, v in r['ignorados'].most_common()],
            'convertidos': [{'o_que': k, 'qtd': v} for k, v in r['convertidos'].most_common()],
            'faltando': sorted(set(r['faltando'])),
            'avisos': list(dict.fromkeys(r['avisos']))[:30],
        }


def converter(path):
    if not str(path).lower().endswith('.prproj'):
        raise ValueError('Não é um projeto do Premiere (.prproj)')
    conv = _Conversor(path)
    dados, rel = conv.converter()
    for s in dados['sequences']:
        s.pop('_fps', None)
    return dados, rel
