"""
main.py - Canivete do Pailer
Versão completa com todas as funções da API
"""
import os
import json
import sys
import threading
import atexit
import shutil
import tempfile
import hashlib
from concurrent.futures import ThreadPoolExecutor

# =========================
webview = None


def _safe_msg(msg):
    if msg is None:
        return ""
    # Escapa barras invertidas primeiro, depois aspas simples, depois quebras de linha
    return (
        str(msg)
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace('"', '\\"')
    )


# ========================================
# API state (window reference)
# ========================================
_window = None
_temp_thumbs = set()
_gdrive_stop_event = None
_gdrive_pause_event = None
_rf_cache = []  # [{"nome": str, "resultado_pil": PIL.Image}]

def _set_window(win):
    global _window
    _window = win


def _file_dialog_kind(name, fallback):
    try:
        return getattr(webview.FileDialog, name)
    except Exception:
        return fallback


def _js(fn, data):
    """Chama fn(data) no frontend com JSON seguro (aspas, barras e quebras de linha)."""
    if _window:
        try:
            _window.evaluate_js(f"{fn}({json.dumps(data, ensure_ascii=False)})")
        except Exception:
            pass


def _abrir_pasta(caminho):
    try:
        if caminho and os.path.exists(caminho):
            os.startfile(caminho if os.path.isdir(caminho) else os.path.dirname(caminho))
    except Exception:
        pass


def _registrar_erro(nome, exc):
    """Grava o traceback em logs/erros.log para diagnóstico."""
    import traceback
    from datetime import datetime
    try:
        from Functions.midia import logs_dir
        arq = os.path.join(logs_dir(), "erros.log")
        if os.path.isfile(arq) and os.path.getsize(arq) > 2_000_000:   # teto: fica a metade mais nova (crescia para sempre)
            with open(arq, "rb") as f:
                f.seek(-1_000_000, 2); resto = f.read()
            with open(arq, "wb") as f:
                f.write(resto)
        with open(arq, "a", encoding="utf-8") as f:
            f.write(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}] {nome}: {exc}\n{traceback.format_exc()}")
    except Exception:
        pass


def _tarefa(fn_js, trabalho):
    """
    Roda trabalho(log, progresso) numa thread. A UI SEMPRE recebe complete=true no fim,
    com error quando algo falha — a tela nunca fica travada em "processando".
    trabalho pode retornar {"resumo": str, "abrir": caminho, ...extras para o frontend}.
    """
    def log(msg):
        _js(fn_js, {"log": str(msg)})

    def progresso(pct, status=None):
        dados = {"percent": round(float(pct), 1)}
        if status:
            dados["status"] = str(status)
        _js(fn_js, dados)

    def run():
        try:
            r = trabalho(log, progresso) or {}
            abrir = r.pop("abrir", None)
            _js(fn_js, {"percent": 100, "complete": True, **r})
            _abrir_pasta(abrir)
        except Exception as e:
            _registrar_erro(fn_js, e)
            _js(fn_js, {"complete": True, "error": str(e) or type(e).__name__})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def _is_file(caminho):
    return bool(caminho) and os.path.isfile(caminho)


# ========================================
# Limpeza de thumbs temporárias
# ========================================
def _cleanup_temp_thumbs():
    """Remove todos os arquivos de thumbnail temporários registrados + varredura na raiz."""
    global _temp_thumbs
    import glob
    # Remove os registrados explicitamente
    for path in list(_temp_thumbs):
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
    _temp_thumbs.clear()
    
    # Varredura de segurança: remove qualquer temp_thumb_*.jpg que sobrou na raiz ou temp_thumbs/
    targets = [
        os.path.join(os.getcwd(), "temp_thumb_*.jpg"),
        os.path.join(os.getcwd(), "temp_thumbs", "*.*")
    ]
    for pattern in targets:
        for f in glob.glob(pattern):
            try:
                os.remove(f)
            except Exception:
                pass


# ========================================
# File/folder picker helpers
# ========================================
def select_folder(tool):
    if _window:
        result = _window.create_file_dialog(_file_dialog_kind("FOLDER", webview.FOLDER_DIALOG))
        if result:
            # PyWebView retorna uma tupla no folder dialog
            folder = result[0] if isinstance(result, (list, tuple)) else result
            return {"success": True, "path": folder}
    return {"success": False}


def select_file(tool):
    if _window:
        result = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG))
        if result:
            file_path = result[0] if isinstance(result, (list, tuple)) else result
            return {"success": True, "path": file_path}
    return {"success": False}


def select_image(tool):
    if _window:
        file_types = ('Imagens (*.png;*.jpg;*.jpeg;*.webp;*.ico;*.gif)', 'Todos os arquivos (*.*)')
        result = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), file_types=file_types)
        if result:
            file_path = result[0] if isinstance(result, (list, tuple)) else result
            return {"success": True, "path": file_path}
    return {"success": False}


def open_folder(path):
    try:
        os.startfile(path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ========================================
# Tools: converter audio
# ========================================
def converter_audio(caminho, output_format):
    from Functions.convertermp3 import converter_pasta, converter_arquivos

    def trabalho(log, progresso):
        if _is_file(caminho):
            r = converter_arquivos([caminho], output_format, progresso, log)
        else:
            r = converter_pasta(caminho, output_format, progresso, log)
        falhas = f" • {r['falhas']} falha(s)" if r["falhas"] else ""
        return {"resumo": f"{r['convertidos']} de {r['total']} convertido(s){falhas}",
                "abrir": caminho if r["convertidos"] else None}

    return _tarefa("updateConverterAudioProgress", trabalho)


def converter_audio_file(file_path, output_format):
    return converter_audio(file_path, output_format)


# ========================================
# Tools: cortar audio
# ========================================
def audio_cutter_prepare(file_path):
    from Functions.audio_cutter import preparar_preview

    return preparar_preview(file_path)


def audio_cutter_export(file_path, cuts, output_format="mp3", tracks=None, main_offset=0):
    from Functions.audio_cutter import exportar_audio
    import json

    def emit(data):
        if _window:
            try:
                _window.evaluate_js(f"updateAudioCutterProgress({json.dumps(data, ensure_ascii=False)})")
            except Exception:
                pass

    def run():
        def log(msg):
            emit({"log": msg})

        try:
            resultado = exportar_audio(file_path, cuts, output_format, tracks=tracks, main_offset=main_offset, callback_log=log)
            if resultado.get("success"):
                emit({
                    "complete": True,
                    "output_path": resultado.get("output_path"),
                    "output_folder": resultado.get("output_folder"),
                    "duration": resultado.get("duration"),
                })
                try:
                    os.startfile(resultado.get("output_folder") or os.path.dirname(file_path) or os.getcwd())
                except Exception:
                    pass
            else:
                emit({"error": resultado.get("error", "Erro ao exportar audio.")})
        except Exception as e:
            emit({"error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ========================================
# Tools: cortar video
# ========================================
_ve_prepare_stop = None
_ve_export_stop = None


def _ve_emit(fn, data):
    if _window:
        try:
            _window.evaluate_js(f"{fn}({json.dumps(data, ensure_ascii=False)})")
        except Exception:
            pass


def video_cutter_prepare(file_path):
    """Prepara o vídeo em background; eventos chegam em veOnPrepare(evento)."""
    from Functions.video_cutter import preparar
    global _ve_prepare_stop
    if _ve_prepare_stop is not None:
        _ve_prepare_stop.set()
    stop = threading.Event()
    _ve_prepare_stop = stop

    def run():
        try:
            preparar(file_path, lambda ev: None if stop.is_set() else _ve_emit("veOnPrepare", ev), stop)
        except Exception as e:
            _ve_emit("veOnPrepare", {"stage": "error", "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def ve_preparar_midia(path, mid, urgente=False, leve=False, fundo=False):
    """Outro vídeo do projeto (painel Projeto → timeline): prepara em background; eventos em veOnMidia({id, ...}).
    urgente = está na timeline: a prévia dele sai antes das dos vídeos que só estão no painel.
    leve = só no painel: dados e miniaturas; a prévia leve fica para quando ele for usado.
    fundo = prévia leve de um vídeo só do painel, com o app sem nada mais urgente (prioridade 2: uma conversão
    por vez e sempre com vaga livre para o que for para a timeline)."""
    from Functions.video_cutter import preparar_midia

    def run():
        try:
            preparar_midia(path, lambda ev: _ve_emit("veOnMidia", {"id": mid, **ev}),
                           prioridade=0 if urgente else 2 if fundo else 1, leve=bool(leve) and not urgente and not fundo)
        except Exception as e:
            _ve_emit("veOnMidia", {"id": mid, "stage": "error", "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def ve_inverter_midia(path, a, b, job):
    """Clipe invertido (Reverse Speed): gera a cópia de trás para frente do trecho [a, b] em background;
    eventos em veOnInverter({job, stage: 'pct'|'done'|'error', ...})."""
    from Functions.video_cutter import inverter_midia

    def run():
        try:
            r = inverter_midia(path, a, b, lambda p: _ve_emit("veOnInverter", {"job": job, "stage": "pct", "pct": p}))
        except Exception as e:
            r = {"success": False, "error": str(e)}
        if r.get("success"):
            _ve_emit("veOnInverter", {"job": job, "stage": "done", "path": r["path"]})
        else:
            _ve_emit("veOnInverter", {"job": job, "stage": "error", "error": r.get("error") or "erro"})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ── painel Texto do editor: transcrever a timeline / legendas ──
_ve_texto_stop = None


def ve_texto_modelos():
    from Functions import legendas
    return legendas.modelos_estado()


def ve_transcrever(clipes, total, idioma="pt"):
    """Transcreve a timeline em background; eventos em veOnTexto({stage, pct, msg} | {stage:'pronto', ...})."""
    from Functions import legendas
    global _ve_texto_stop
    if _ve_texto_stop is not None:
        _ve_texto_stop.set()
    stop = threading.Event()
    _ve_texto_stop = stop

    def run():
        try:
            r = legendas.transcrever(clipes, total, idioma,
                                     lambda p, msg: _ve_emit("veOnTexto", {"stage": "prog", "pct": p, "msg": msg}), stop)
            if not stop.is_set() or r.get("cancelled"):
                _ve_emit("veOnTexto", {"stage": "pronto", **r})
        except InterruptedError:
            _ve_emit("veOnTexto", {"stage": "pronto", "success": False, "cancelled": True})
        except Exception as e:
            _ve_emit("veOnTexto", {"stage": "pronto", "success": False, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def ve_transcrever_cancelar():
    if _ve_texto_stop is not None:
        _ve_texto_stop.set()
    return {"success": True}


# ── painel Projeto do editor: importar arquivos e pastas, ler .srt ──
_VE_EXT_PROJETO = (".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".f4v", ".wmv", ".asf", ".m4v", ".ts", ".mts",
                   ".m2ts", ".3gp", ".ogv", ".mpg", ".mpeg", ".m2v", ".mxf", ".r3d", ".braw", ".ari", ".arx",
                   ".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wma",
                   ".aif", ".aiff", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif",
                   ".srt", ".vtt", ".ass", ".ssa", ".sbv")   # .txt só escolhido/arrastado (numa pasta pode ser qualquer coisa)


def ve_importar_dialogo():
    """Janela "Importar" (vários arquivos) do painel Projeto."""
    if not _window:
        return {"success": False}
    tipos = ("Mídia (*.mp4;*.mov;*.mxf;*.mkv;*.avi;*.webm;*.flv;*.f4v;*.wmv;*.asf;*.m4v;*.ts;*.mts;*.m2ts;"
             "*.mpg;*.mpeg;*.m2v;*.r3d;*.braw;*.ari;*.arx;*.mp3;*.wav;*.flac;*.m4a;*.aac;*.ogg;"
             "*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp;*.psd;*.psb;*.srt;*.vtt;*.ass;*.ssa;*.sbv;*.txt)",
             "Legendas (*.srt;*.vtt;*.ass;*.ssa;*.sbv;*.txt)", "Todos os arquivos (*.*)")
    r = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), allow_multiple=True, file_types=tipos)
    if not r:
        return {"success": False, "cancelled": True}
    return {"success": True, "paths": list(r) if isinstance(r, (list, tuple)) else [r]}


def ve_listar_pasta(path, _nivel=0):
    """Pasta arrastada para o painel Projeto → árvore {nome, arquivos, pastas} só com o que o editor usa."""
    try:
        nomes = sorted(os.listdir(path), key=str.lower)
    except Exception as e:
        return {"success": False, "error": str(e)}
    arquivos, pastas = [], []
    for n in nomes:
        c = os.path.join(path, n)
        if os.path.isdir(c):
            if _nivel < 8:
                sub = ve_listar_pasta(c, _nivel + 1)
                if sub.get("success") and (sub["arquivos"] or sub["pastas"]):
                    pastas.append(sub)
        elif n.lower().endswith(_VE_EXT_PROJETO):
            arquivos.append(c)
    return {"success": True, "nome": os.path.basename(os.path.normpath(path)), "arquivos": arquivos, "pastas": pastas}


_ve_fhd_stop = None


def ve_otimizar_fullhd(itens):
    """Forçar Full HD (painel Projeto): itens = [[id, path]]; um por vez em background. Eventos em
    veOnOtimizar({id, pct} | {id, motor, aviso} | {id, done, success, saida, w, h, error, pulado} | {fim: true})."""
    from Functions import otimizar
    from Functions.video_cutter import motivo_sem_gpu
    global _ve_fhd_stop
    stop = threading.Event()
    _ve_fhd_stop = stop

    def run():
        for mid, path in itens or []:
            if stop.is_set():
                break
            try:
                r = otimizar.converter(
                    path, lambda p, mid=mid: _ve_emit("veOnOtimizar", {"id": mid, "pct": p}), stop,
                    lambda m, mid=mid: _ve_emit("veOnOtimizar", {"id": mid, "motor": m,
                                                                 "aviso": motivo_sem_gpu() if m == "CPU" else ""}))
            except Exception as e:
                r = {"success": False, "error": str(e)}
            _ve_emit("veOnOtimizar", {"id": mid, "done": True, **r})
        _ve_emit("veOnOtimizar", {"fim": True, "cancelado": stop.is_set()})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def ve_otimizar_cancelar():
    if _ve_fhd_stop is not None:
        _ve_fhd_stop.set()
    return {"success": True}


def ve_sincronizar_audio(ref_path, ref_s, ref_e, outro_path, outro_s, outro_e):
    """Sincronizar clipes: atraso do som do outro trecho em relação à referência (Functions/sincronizar.py)."""
    from Functions import sincronizar
    return sincronizar.atraso(ref_path, ref_s, ref_e, outro_path, outro_s, outro_e)


def ve_ler_legenda(path):
    """Legendas (.srt, .vtt, .ass/.ssa, .sbv, .txt) → [{st, en, texto}] (segundos)."""
    from Functions import legendas_formatos
    return legendas_formatos.ler(path)


def ve_fontes():
    """Famílias de fonte instaladas e os estilos de cada uma (Functions/fontes.py). Sem conseguir ler os
    arquivos, cai na lista simples de famílias do GDI."""
    try:
        from Functions import fontes
        est = fontes.listar()
        if est:
            return {"success": True, "fontes": list(est.keys()), "estilos": est}
    except Exception:
        pass
    try:
        import ctypes
        from ctypes import wintypes

        class LOGFONTW(ctypes.Structure):
            _fields_ = [("lfHeight", wintypes.LONG), ("lfWidth", wintypes.LONG), ("lfEscapement", wintypes.LONG),
                        ("lfOrientation", wintypes.LONG), ("lfWeight", wintypes.LONG), ("lfItalic", wintypes.BYTE),
                        ("lfUnderline", wintypes.BYTE), ("lfStrikeOut", wintypes.BYTE), ("lfCharSet", wintypes.BYTE),
                        ("lfOutPrecision", wintypes.BYTE), ("lfClipPrecision", wintypes.BYTE),
                        ("lfQuality", wintypes.BYTE), ("lfPitchAndFamily", wintypes.BYTE),
                        ("lfFaceName", wintypes.WCHAR * 32)]

        proc_t = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.POINTER(LOGFONTW), ctypes.c_void_p, wintypes.DWORD,
                                    wintypes.LPARAM)
        gdi32, user32 = ctypes.WinDLL("gdi32"), ctypes.WinDLL("user32")
        user32.GetDC.restype = wintypes.HDC
        user32.GetDC.argtypes = [wintypes.HWND]
        user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
        gdi32.EnumFontFamiliesExW.argtypes = [wintypes.HDC, ctypes.POINTER(LOGFONTW), proc_t, wintypes.LPARAM,
                                              wintypes.DWORD]
        nomes = set()

        def _cb(lf, _tm, _tipo, _lp):
            n = lf.contents.lfFaceName
            # "@" = variante vertical (CJK); tipo 1 = fonte bitmap antiga (não escala)
            if n and not n.startswith("@") and not (_tipo & 1):
                nomes.add(n)
            return 1

        cb = proc_t(_cb)
        hdc = user32.GetDC(None)
        lf = LOGFONTW()
        lf.lfCharSet = 1   # DEFAULT_CHARSET: todas
        gdi32.EnumFontFamiliesExW(hdc, ctypes.byref(lf), cb, 0, 0)
        user32.ReleaseDC(None, hdc)
        return {"success": True, "fontes": sorted(nomes, key=str.lower)}
    except Exception as e:
        return {"success": False, "error": str(e), "fontes": []}


def ve_salvar_png(dados):
    """PNG (data URL) de um texto do editor → arquivo na pasta de trabalho, para a exportação usar como imagem."""
    try:
        import base64
        import uuid
        from Functions import video_cutter as vc
        b = base64.b64decode(str(dados).split(",", 1)[-1])
        path = os.path.join(vc._work_dir(), f"texto_{uuid.uuid4().hex[:10]}.png")
        with open(path, "wb") as f:
            f.write(b)
        return {"success": True, "path": path}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_txa_lista(entradas):
    """Texto animado do editor: [[png, duração s], ...] → lista do demuxer concat (a camada do texto na exportação)."""
    try:
        import uuid
        from Functions import video_cutter as vc
        linhas = ["ffconcat version 1.0"]
        ultimo = None
        for arq, dur in entradas or []:
            if not arq or not os.path.isfile(arq):
                continue
            ultimo = arq.replace("\\", "/").replace("'", "'\\''")
            linhas += [f"file '{ultimo}'", f"duration {max(0.001, float(dur)):.6f}"]
        if not ultimo:
            return {"success": False, "error": "sem quadros"}
        linhas.append(f"file '{ultimo}'")   # o concat ignora a duração do último arquivo: repete ele
        path = os.path.join(vc._work_dir(), f"texto_{uuid.uuid4().hex[:10]}.ffconcat")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(linhas) + "\n")
        return {"success": True, "path": path}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_salvar_legenda(itens, formato="srt", nome="legendas", pasta=""):
    """Pergunta onde salvar e grava as legendas/transcrição no formato pedido (srt, vtt, ass, ssa, sbv, txt)."""
    from Functions import legendas_formatos as lf
    try:
        if not _window:
            return {"success": False}
        formato = formato if formato in lf.FORMATOS else "srt"
        conteudo = lf.escrever(itens or [], formato)
        r = _window.create_file_dialog(_file_dialog_kind("SAVE", webview.SAVE_DIALOG), directory=pasta or "",
                                       save_filename=f"{nome}.{formato}",
                                       file_types=(f"{lf.FORMATOS[formato]} (*.{formato})", "Todos os arquivos (*.*)"))
        if not r:
            return {"success": False, "cancelled": True}
        path = r[0] if isinstance(r, (list, tuple)) else r
        if not path.lower().endswith("." + formato):
            path += "." + formato
        with open(path, "w", encoding="utf-8-sig", newline="\r\n") as f:
            f.write(conteudo)
        return {"success": True, "path": path, "name": os.path.basename(path)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def video_cutter_add_audio(path):
    """Áudio solto na timeline (arrastado): conforma, forma de onda e duração."""
    from Functions.video_cutter import adicionar_audio
    return adicionar_audio(path)


def anti_noise_preparar(path):
    """Efeito Anti Noise: som limpo (DeepFilterNet3) do arquivo, feito uma vez; o editor mistura na Quantidade."""
    from Functions.anti_noise import preparar
    return preparar(path)


def video_cutter_audio_fonte():
    """Áudio conformado (PCM) da fonte aberta, para o mixer em tempo real do editor."""
    from Functions.video_cutter import audio_conformado
    return audio_conformado()


def video_cutter_add_media(path):
    """Registra uma imagem para usar como camada no editor (a URL é servida pelo media_server)."""
    from Functions import media_server
    ext = os.path.splitext(path or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"):
        return {"success": False, "error": "Formato de imagem não suportado no editor (use PNG, JPG, WEBP, GIF ou BMP)."}
    if not os.path.isfile(path):
        return {"success": False, "error": "Arquivo não encontrado."}
    return {"success": True, "kind": "image", "path": path, "url": media_server.register(path),
            "name": os.path.basename(path)}


def video_cutter_export(file_path, segments, output_format="mp4", qualidade="medium",
                        resolucao="original", usar_gpu=True, pasta_saida=None, sem_audio=False,
                        camadas=None, audio_segments=None, duracao=None, audio_clipes=None, legendas=None, quadro=None,
                        opcoes=None):
    """Exporta a timeline (base + camadas por cima); progresso em veOnExport(evento). quadro = [w, h] da sequência.
    opcoes = {nome, codec, bits, mbps} (diálogo de exportação)."""
    from Functions.video_cutter import exportar_video, motivo_sem_gpu
    global _ve_export_stop
    stop = threading.Event()
    _ve_export_stop = stop

    def run():
        aviso = ""
        try:
            # placa NVIDIA que não grava (driver antigo): avisa em vez de cair para a CPU calado
            aviso = motivo_sem_gpu() if usar_gpu else ""
            if aviso:
                _ve_emit("veOnExport", {"pct": 0, "message": aviso, "aviso_gpu": aviso})
            r = exportar_video(
                file_path, segments, output_format, qualidade, resolucao, bool(usar_gpu),
                pasta_saida or None,
                on_progress=lambda p, m: _ve_emit("veOnExport", {"pct": p, "message": m}),
                stop_event=stop,
                sem_audio=bool(sem_audio),
                camadas=camadas or [],
                audio_segmentos=audio_segments,
                duracao=duracao,
                audio_clipes=audio_clipes,
                legendas=legendas,
                quadro=quadro,
                opcoes=opcoes,
            )
            _ve_emit("veOnExport", {"done": True, **r, "aviso_gpu": aviso})
        except Exception as e:
            _ve_emit("veOnExport", {"done": True, "success": False, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ── cache de render em disco (Functions/render_cache.py) ──
def ve_render_listar(base, chave):
    from Functions import render_cache
    try:
        return render_cache.listar(base, chave)
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_render_trecho(base, chave, h, job):
    """Renderiza um trecho em background; progresso e fim chegam em veOnRender(evento)."""
    from Functions import render_cache

    def run():
        try:
            r = render_cache.renderizar(base, chave, h, job, lambda p: _ve_emit("veOnRender", {"hash": h, "pct": p}))
            _ve_emit("veOnRender", {"hash": h, "done": True, **r})
        except Exception as e:
            _ve_emit("veOnRender", {"hash": h, "done": True, "success": False, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def ve_render_cancelar():
    from Functions import render_cache
    return render_cache.cancelar()


def ve_comp_render(base, h, job):
    """Comp: renderiza a timeline de dentro com fundo transparente; progresso e fim em veOnComp(evento)."""
    from Functions import render_cache

    def run():
        try:
            r = render_cache.renderizar_comp(base, h, job, lambda p: _ve_emit("veOnComp", {"hash": h, "pct": p}))
            _ve_emit("veOnComp", {"hash": h, "done": True, **r})
        except Exception as e:
            _ve_emit("veOnComp", {"hash": h, "done": True, "success": False, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def ve_comp_cancelar():
    from Functions import render_cache
    return render_cache.cancelar_comp()


def ve_render_tocar(base, chave, hashes):
    from Functions import render_cache
    return render_cache.tocar(base, chave, hashes)


def ve_render_mover(base, chave_antiga, chave_nova):
    from Functions import render_cache
    return render_cache.mover_projeto(base, chave_antiga, chave_nova)


def ve_render_limpar(base, chave=None):
    from Functions import render_cache
    try:
        r = render_cache.limpar(base, chave or None)
        if not chave and isinstance(r, dict):   # "limpar todo o cache": prévias dos vídeos do projeto também
            from Functions.video_cutter import limpar_midia
            r["liberado"] = (r.get("liberado") or 0) + limpar_midia()
        return r
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_render_manutencao(base, max_gb=20, dias=30):
    from Functions import render_cache
    try:
        r = render_cache.manutencao(base, max_gb, dias)
        from Functions.video_cutter import manutencao_midia
        manutencao_midia()   # prévias dos vídeos do projeto (Canivete Media Cache): mesmas regras
        return r
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_render_info(base, chave=None):
    from Functions import render_cache
    try:
        return render_cache.info(base, chave or None)
    except Exception as e:
        return {"success": False, "error": str(e)}


def video_cutter_cancel_export():
    from Functions.video_cutter import cancelar_exportacao
    from Functions import transicoes
    if _ve_export_stop is not None:
        _ve_export_stop.set()
    transicoes.cancelar()
    cancelar_exportacao()
    return {"success": True}


def ve_psd_importar(path):
    """PSD/PSB → um PNG por camada + a árvore (Functions/psd_import.py); o editor monta a Comp (editor-psd.js)."""
    from Functions import psd_import
    try:
        return psd_import.importar(path)
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_ovt_render(base, h, job):
    """Transição de sobreposição (editor-ovt.js): o trecho da camada renderizado das trilhas de baixo com o efeito
    (Functions/transicoes.py). Espera terminar; devolve {success, path}."""
    from Functions import transicoes
    try:
        return transicoes.render(base, h, job)
    except Exception as e:
        return {"success": False, "error": str(e)}


def reveal_file(path):
    """Abre o Explorer com o arquivo selecionado."""
    try:
        if path and os.path.exists(path):
            import subprocess as _sp
            _sp.Popen(["explorer", "/select,", os.path.normpath(path)])
            return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    return {"success": False}


def _ve_layout_path():
    """Layout dos painéis do editor e workspaces salvos. Fica em %APPDATA% (o localStorage do WebView
    não sobrevive: modo privado e porta nova a cada abertura; e a pasta do app é trocada ao atualizar)."""
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    pasta = os.path.join(base, "CaniveteDoPailer")
    os.makedirs(pasta, exist_ok=True)
    return os.path.join(pasta, "editor_workspaces.json")


def ve_layout_load():
    try:
        with open(_ve_layout_path(), "r", encoding="utf-8") as f:
            return {"success": True, "data": json.load(f)}
    except FileNotFoundError:
        return {"success": True, "data": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_layout_save(dados):
    """Grava o JSON (texto) de uma vez: arquivo temporário + troca, para não corromper se o app fechar."""
    try:
        json.loads(dados)
        final = _ve_layout_path()
        tmp = final + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(dados)
        os.replace(tmp, final)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _prefs_path():
    """Preferências do app (idioma...). Mesma pasta do layout do editor (%APPDATA%/CaniveteDoPailer)."""
    return os.path.join(os.path.dirname(_ve_layout_path()), "preferencias.json")


def prefs_load():
    try:
        with open(_prefs_path(), "r", encoding="utf-8") as f:
            return {"success": True, "data": json.load(f)}
    except FileNotFoundError:
        return {"success": True, "data": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def prefs_save(dados):
    try:
        json.loads(dados)
        final = _prefs_path()
        tmp = final + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(dados)
        os.replace(tmp, final)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _janela_por_titulo(titulo):
    """Janela nativa (solta do editor) pelo título exato; None se não achar. Só Windows."""
    if os.name != "nt" or not titulo:
        return None
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    titulo = str(titulo)
    meus, outros = [], []
    # as janelas soltas são deste processo; a de reserva (pop-up padrão do WebView2) acrescenta
    # " — [InPrivate]" ao título e pertence ao processo do WebView2
    def _cada(h, _):
        n = u.GetWindowTextLengthW(h)
        if n and u.IsWindowVisible(h):
            b = ctypes.create_unicode_buffer(n + 1)
            u.GetWindowTextW(h, b, n + 1)
            if b.value == titulo or b.value.startswith(titulo + " "):
                (meus if _do_app(h) else outros).append(h)
        return True
    u.EnumWindows(ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)(_cada), 0)
    return (meus or outros or [None])[0]


def _do_app(hwnd):
    """A janela é deste processo (e não de outra cópia do app aberta ao mesmo tempo)?"""
    import ctypes
    from ctypes import wintypes
    d = wintypes.DWORD()
    ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(d))
    return d.value == os.getpid()


class _DpiReal:
    """Coordenadas em pixels reais do monitor (sem a escala do Windows), iguais em qualquer monitor."""
    def __enter__(self):
        import ctypes
        try:
            self._antes = ctypes.windll.user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))  # per-monitor v2
        except Exception:
            self._antes = None
        return self

    def __exit__(self, *a):
        import ctypes
        if self._antes:
            try:
                ctypes.windll.user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(self._antes))
            except Exception:
                pass


def ve_win_rect(titulo):
    """Posição/tamanho de uma janela solta do editor (px reais) e se está maximizada."""
    import ctypes
    from ctypes import wintypes
    hwnd = _janela_por_titulo(titulo)
    if not hwnd:
        return None
    u = ctypes.windll.user32
    with _DpiReal():
        wp = (ctypes.c_uint * 11)()   # WINDOWPLACEMENT: posição "normal" mesmo se maximizada
        wp[0] = ctypes.sizeof(wp)
        if not u.GetWindowPlacement(hwnd, ctypes.byref(wp)):
            r = wintypes.RECT()
            u.GetWindowRect(hwnd, ctypes.byref(r))
            return {"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top, "max": False}
        if u.IsZoomed(hwnd):
            x0, y0, x1, y1 = (ctypes.c_int(v).value for v in wp[7:11])
            return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "max": True}
        r = wintypes.RECT()
        u.GetWindowRect(hwnd, ctypes.byref(r))
        return {"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top, "max": False}


def _janela_principal():
    """Janela principal deste app (processo atual): a que não tem dona (as soltas do editor têm)."""
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    pid, achou = os.getpid(), []
    def _cada(h, _):
        dono = wintypes.DWORD()
        u.GetWindowThreadProcessId(h, ctypes.byref(dono))
        if dono.value == pid and u.IsWindowVisible(h) and u.GetWindowTextLengthW(h) and not u.GetWindow(h, 4):   # GW_OWNER
            achou.append(h)
            return False
        return True
    u.EnumWindows(ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)(_cada), 0)
    return achou[0] if achou else None


def ve_win_prepare(titulo):
    """Janela solta fica sempre acima da principal (como as flutuantes do Premiere), sem ficar acima de
    outros programas: a principal vira "dona" dela. Devolve False se a janela ainda não existe."""
    if os.name != "nt":
        return True
    import ctypes
    hwnd = _janela_por_titulo(titulo)
    if not hwnd:
        return False
    dono = _janela_principal()
    if dono:
        ctypes.windll.user32.SetWindowLongPtrW(hwnd, -8, dono)   # GWLP_HWNDPARENT = dona
    return True


def ve_win_hit(titulos, excluir=None):
    """Arrastar uma janela solta pela barra de título do Windows: a página não recebe eventos nisso.
    Diz qual das janelas do editor (`titulos`) está sob o cursor — a de cima, ignorando a que está sendo
    movida (`excluir`) — e onde o cursor está na área da página dela (px reais), além do botão esquerdo."""
    if os.name != "nt":
        return {"titulo": None, "down": False}
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    with _DpiReal():
        pt = wintypes.POINT()
        u.GetCursorPos(ctypes.byref(pt))
        down = bool(u.GetAsyncKeyState(0x01) & 0x8000)
        alvo = {}
        ignorar = _janela_por_titulo(excluir) if excluir else None
        def _titulo(h):
            n = u.GetWindowTextLengthW(h)
            b = ctypes.create_unicode_buffer(n + 1)
            u.GetWindowTextW(h, b, n + 1)
            return b.value
        def _dentro(h):
            r = wintypes.RECT()
            u.GetWindowRect(h, ctypes.byref(r))
            return r.left <= pt.x < r.right and r.top <= pt.y < r.bottom
        # janelas de cima para baixo: a primeira sob o cursor (fora a que se move) decide
        def _cada(h, _):
            if h == ignorar or not u.IsWindowVisible(h) or u.IsIconic(h) or not _dentro(h):
                return True
            t = _titulo(h)
            for cand in titulos or []:
                if (t == cand and _do_app(h)) or t.startswith(cand + " "):
                    alvo["h"], alvo["t"] = h, cand
            return False
        u.EnumWindows(ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)(_cada), 0)
        if not alvo:
            return {"titulo": None, "down": down}
        # área da página = janela interna do Chromium
        area = []
        def _filho(h, _):
            b = ctypes.create_unicode_buffer(64)
            u.GetClassNameW(h, b, 64)
            if b.value == "Chrome_RenderWidgetHostHWND" and u.IsWindowVisible(h):
                area.append(h)
                return False
            return True
        u.EnumChildWindows(alvo["h"], ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)(_filho), 0)
        r = wintypes.RECT()
        u.GetWindowRect(area[0] if area else alvo["h"], ctypes.byref(r))
        return {"titulo": alvo["t"], "x": pt.x - r.left, "y": pt.y - r.top, "down": down}


def ve_win_alpha(titulo, opacidade=1.0):
    """Janela solta semitransparente enquanto é arrastada, para ver a bússola de encaixe embaixo dela."""
    if os.name != "nt":
        return False
    import ctypes
    hwnd = _janela_por_titulo(titulo)
    if not hwnd:
        return False
    u = ctypes.windll.user32
    ex = u.GetWindowLongW(hwnd, -20)                     # GWL_EXSTYLE
    if not ex & 0x80000:
        u.SetWindowLongW(hwnd, -20, ex | 0x80000)        # WS_EX_LAYERED
    a = max(40, min(255, int(float(opacidade) * 255)))
    u.SetLayeredWindowAttributes(hwnd, 0, a, 2)          # LWA_ALPHA
    return True


def ve_win_place(titulo, x, y, w, h, maximizada=False):
    """Coloca a janela solta no lugar salvo (qualquer monitor). O WebView sozinho prende a janela
    no monitor do app; pelo Windows ela vai para onde estava."""
    import ctypes
    hwnd = _janela_por_titulo(titulo)
    if not hwnd:
        return False
    u = ctypes.windll.user32
    x, y, w, h = int(x), int(y), max(200, int(w)), max(150, int(h))
    # só aceita se o canto da barra de título cair num monitor que existe (monitor desligado = fica onde abriu)
    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
    ve_win_prepare(titulo)
    with _DpiReal():
        if not u.MonitorFromPoint(POINT(x + 40, y + 12), 0):   # MONITOR_DEFAULTTONULL
            return True   # monitor desligado: fica onde abriu (no monitor do app)
        u.ShowWindow(hwnd, 9)   # SW_RESTORE
        for _ in range(2):      # 2x: ao trocar de monitor com outra escala o Windows reajusta o tamanho
            u.SetWindowPos(hwnd, 0, x, y, w, h, 0x0014)   # SWP_NOZORDER | SWP_NOACTIVATE
        if maximizada:
            u.ShowWindow(hwnd, 3)   # SW_MAXIMIZE
    return True


def ve_project_save(path, dados, salvar_como=False, formato=None):
    """Salva o projeto .vknv. Sem caminho (ou 'salvar como'), pergunta onde salvar.
    Projeto antigo (.vcnvt): grava um .vknv com o mesmo nome ao lado (o antigo fica como estava).
    No 'salvar como' dá para escolher "Premiere Pro (XML)" (ou formato='xml', direto): grava um XML do Final Cut Pro 7
    que o Premiere importa (Functions/premiere_xml.py); o projeto continua sendo o .vknv de antes."""
    from Functions import projeto
    try:
        if str(path or "").lower().endswith(".xml") and not salvar_como:   # caminho já escolhido (agente/testes)
            return _ve_salvar_xml(path, dados)
        if formato == "xml":
            if not _window:
                return {"success": False}
            nome = os.path.splitext(os.path.basename(path))[0] if path else "Meu projeto"
            r = _window.create_file_dialog(
                _file_dialog_kind("SAVE", webview.SAVE_DIALOG),
                directory=os.path.dirname(path) if path else "", save_filename=nome + ".xml",
                file_types=("Projeto do Premiere Pro em XML (*.xml)",),
            )
            if not r:
                return {"success": False, "cancelled": True}
            return _ve_salvar_xml(r[0] if isinstance(r, (list, tuple)) else r, dados)
        if not path or salvar_como:
            if not _window:
                return {"success": False}
            sugestao = os.path.basename(projeto.com_extensao(path)) if path else "Meu projeto.vknv"
            pasta = os.path.dirname(path) if path else ""
            if not path:   # importado do Premiere: sugere um .vknv com o mesmo nome, ao lado do .prproj
                try:
                    origem = (json.loads(dados) if isinstance(dados, str) else dados).get("importado_de", {}).get("premiere")
                except Exception:
                    origem = None
                if origem:
                    sugestao = os.path.splitext(os.path.basename(origem))[0] + ".vknv"
                    pasta = os.path.dirname(origem)
            r = _window.create_file_dialog(
                _file_dialog_kind("SAVE", webview.SAVE_DIALOG),
                directory=pasta, save_filename=sugestao,
                file_types=("Projeto de vídeo do KANIVETE (*.vknv)", "Projeto do Premiere Pro em XML (*.xml)"),
            )
            if not r:
                return {"success": False, "cancelled": True}
            path = r[0] if isinstance(r, (list, tuple)) else r
            if str(path).lower().endswith(".xml"):
                return _ve_salvar_xml(path, dados)
        final = projeto.salvar(path, dados)
        return {"success": True, "path": final, "name": os.path.basename(final)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_premiere_ponte(acao, dados=None):
    """Ponte com o Premiere aberto (plugin UXP "Kanivete Ponte", Functions/ponte_premiere.py).
    acao 'info': {success, projeto, caminho} do projeto aberto no Premiere (ou o erro: plugin fechado).
    acao 'enviar': grava o XML (+ efeitos de áudio) numa pasta temporária; o plugin importa no projeto ABERTO do Premiere
    e aplica os efeitos clipe a clipe. O Editor pergunta o projeto antes (veEnviarPremiere)."""
    import re
    import time
    from Functions import ponte_premiere, premiere_xml
    try:
        if acao == "info":
            r = ponte_premiere.enviar("info", espera=6)
            if not r.get("ok"):
                return {"success": False, "error": r.get("erro") or "o plugin não respondeu"}
            res = r.get("resultado") or {}
            if not res.get("projeto"):
                return {"success": False, "error": "nenhum projeto aberto no Premiere"}
            return {"success": True, "projeto": res.get("projeto"), "caminho": res.get("caminho")}
        if acao == "enviar":
            d = json.loads(dados) if isinstance(dados, str) else dados
            nome = re.sub(r'[<>:"/\\|?*]+', "_", (d.get("sequences") or [{}])[0].get("name") or "Kanivete").strip() or "Kanivete"
            pasta = os.path.join(tempfile.gettempdir(), "kanivete_premiere", time.strftime("%Y%m%d_%H%M%S"))
            os.makedirs(pasta, exist_ok=True)
            xml, relatorio = premiere_xml.exportar(os.path.join(pasta, nome + ".xml"), d)
            r = ponte_premiere.importar(xml)
            if not r.get("ok"):
                return {"success": False, "error": r.get("erro") or "o Premiere não importou", "relatorio": relatorio}
            return {"success": True, "relatorio": relatorio, **(r.get("resultado") or {})}
        return {"success": False, "error": "ação desconhecida"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _ve_salvar_xml(path, dados):
    from Functions import premiere_xml
    final, relatorio = premiere_xml.exportar(path, dados)
    return {"success": True, "xml": True, "path": final, "name": os.path.basename(final), "relatorio": relatorio}


def ve_project_open(path=None):
    """Abre um .vknv (ou .vcnvt antigo; pergunta qual, se não vier o caminho) e avisa o que estiver faltando.
    Um .prproj (Premiere) é convertido só lendo (Functions/premiere.py) e abre como projeto novo, sem caminho:
    o Ctrl+S grava um .vknv e o arquivo do Premiere nunca é tocado."""
    from Functions import projeto
    try:
        if not path:
            if not _window:
                return {"success": False}
            r = _window.create_file_dialog(
                _file_dialog_kind("OPEN", webview.OPEN_DIALOG),
                file_types=("Projeto de vídeo do KANIVETE (*.vknv;*.vcnvt)", "Projeto do Premiere Pro (*.prproj)",
                            "Todos os arquivos (*.*)"),
            )
            if not r:
                return {"success": False, "cancelled": True}
            path = r[0] if isinstance(r, (list, tuple)) else r
        if str(path).lower().endswith(".prproj"):
            from Functions import premiere
            dados, relatorio = premiere.converter(path)
            faltando = [p for p in [dados.get("video")] + [m.get("path") for m in dados.get("media") or []]
                        if p and not os.path.isfile(p)]
            return {"success": True, "path": None, "name": os.path.basename(path), "data": dados,
                    "missing": faltando, "premiere": relatorio}
        dados, faltando = projeto.abrir(path)
        return {"success": True, "path": os.path.abspath(path), "name": os.path.basename(path),
                "data": dados, "missing": faltando}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── salvamento automático do editor (como o Auto-Save do Premiere) ──
def _autosave_dir():
    pasta = os.path.join(os.path.dirname(_ve_layout_path()), "autosave")
    os.makedirs(pasta, exist_ok=True)
    return pasta


def ve_autosave(chave, nome, dados):
    """Cópia de segurança do projeto aberto (nunca sobrescreve o .vknv do usuário).
    Guarda as 5 últimas de cada projeto e no máximo 40 no total."""
    from Functions import projeto
    import re
    import time as _t
    try:
        h = hashlib.sha1(str(chave or nome or "sem-projeto").encode("utf-8", "replace")).hexdigest()[:8]
        base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(nome or "projeto")).strip(" .")[:40] or "projeto"
        pasta = _autosave_dir()
        final = projeto.salvar(os.path.join(pasta, f"{base}-{h}-{_t.strftime('%Y%m%d-%H%M%S')}.vknv"), dados)
        todos = sorted((os.path.join(pasta, f) for f in os.listdir(pasta) if f.endswith((".vknv", ".vcnvt"))),
                       key=os.path.getmtime, reverse=True)
        deste = [f for f in todos if f"-{h}-" in os.path.basename(f)]
        for f in deste[5:] + [f for f in todos if f not in deste[:5]][40:]:
            try:
                os.remove(f)
            except OSError:
                pass
        return {"success": True, "path": final}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ve_autosave_lista():
    """Cópias automáticas mais recentes (a mais nova de cada projeto), para a tela inicial."""
    try:
        pasta = _autosave_dir()
        vistos, out = set(), []
        for f in sorted((os.path.join(pasta, f) for f in os.listdir(pasta) if f.endswith((".vknv", ".vcnvt"))),
                        key=os.path.getmtime, reverse=True):
            partes = os.path.splitext(os.path.basename(f))[0].rsplit("-", 3)
            h = partes[1] if len(partes) == 4 else f
            if h in vistos:
                continue
            vistos.add(h)
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    dados = json.load(fh)
            except Exception:
                continue
            info = dados.get("_autosave") or {}
            out.append({"path": f, "nome": partes[0] if len(partes) == 4 else os.path.basename(f),
                        "quando": os.path.getmtime(f) * 1000, "origem": info.get("origem")})
            if len(out) >= 6:
                break
        return {"success": True, "itens": out}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── AutoFrame (Functions/autoframe.py): vídeos no ritmo da música ──
_af = {"musica": {}, "midias": {}, "stop": None}


def _af_resumo_midia(d):
    from Functions import media_server
    r = {k: d.get(k) for k in ("path", "tipo", "nota", "w", "h", "dur", "rostos", "fx", "fy", "data", "caixa")}
    r["thumb"] = media_server.register(d["thumb"]) if d.get("thumb") and os.path.isfile(d["thumb"]) else None
    return r


def af_analisar(musica, itens):
    """Analisa a música e as mídias (pastas/arquivos) em segundo plano; eventos em veOnAF(evento)."""
    from Functions import autoframe as af
    if _af["stop"] is not None:
        _af["stop"].set()
    stop = threading.Event()
    _af["stop"] = stop

    def run():
        try:
            caminhos = af.listar(itens or [])
            _ve_emit("veOnAF", {"etapa": "lista", "n": len(caminhos)})
            resumo_musica = None
            if musica:
                _ve_emit("veOnAF", {"etapa": "musica", "pct": 0})
                dm = af.analisar_musica(musica, lambda p: _ve_emit("veOnAF", {"etapa": "musica", "pct": p}))
                _af["musica"][musica] = dm
                resumo_musica = {k: dm.get(k) for k in ("path", "dur", "bpm", "beats", "downbeats", "energia", "secoes", "drop", "refrao")}
            midias = []
            for i, pth in enumerate(caminhos):
                if stop.is_set():
                    return
                _ve_emit("veOnAF", {"etapa": "midia", "i": i, "n": len(caminhos), "path": pth})
                try:
                    d = af.analisar_midia(pth)
                except Exception as e:
                    d = None
                    print("[autoframe]", pth, e)
                if d:
                    _af["midias"][pth] = d
                    midias.append(_af_resumo_midia(d))
                    _ve_emit("veOnAF", {"etapa": "midia_ok", "midia": midias[-1]})
            # repetidas/quase iguais: vêm marcadas (o JS deixa de fora; um clique devolve)
            dup = af.repetidas([_af["midias"][m["path"]] for m in midias if m["path"] in _af["midias"]])
            for m in midias:
                if m["path"] in dup:
                    m["repetida_de"] = dup[m["path"]]
            _ve_emit("veOnAF", {"etapa": "fim", "musica": resumo_musica, "midias": midias})
        except Exception as e:
            _ve_emit("veOnAF", {"etapa": "erro", "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def _af_midias(paths):
    return [_af["midias"][p] for p in (paths or []) if p in _af["midias"]]


def af_recomendar(musica, paths, dur_alvo=None, inicio_modo="inicio", manual=None):
    from Functions import autoframe as af
    try:
        m = _af["musica"].get(musica) or af.analisar_musica(musica)
        ini = af.melhor_inicio(m, inicio_modo, dur_alvo or None, manual)
        return {"success": True, "inicio": ini, "modelos": af.recomendar(m, _af_midias(paths), dur_alvo or None, ini)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def af_planejar(musica, paths, modelo, dur_alvo=None, ordem="inteligente", semente=0, inicio_modo="inicio", manual=None, telas=True,
                cobrir=None, reserva=None):
    """cobrir = segundos de intro+encerramento: a duração passa a ser a que faz todas as mídias entrarem."""
    from Functions import autoframe as af
    try:
        m = _af["musica"].get(musica) or af.analisar_musica(musica)
        if cobrir is not None:
            ini0 = af.melhor_inicio(m, inicio_modo, None, manual)
            dur_alvo = af.dur_para_cobrir(m, modelo, len(paths), ini0, float(cobrir)) or dur_alvo
        ini = af.melhor_inicio(m, inicio_modo, dur_alvo or None, manual)
        midias = _af_midias(paths)
        r = af.planejar(m, midias, modelo, dur_alvo or None, ordem, semente, ini, bool(telas), reserva)
        # "usar todas": a duração fecha numa frase da música e pode ficar curta; cresce de 4 em 4 compassos até caber
        if cobrir is not None and dur_alvo:
            frase = 16 * 60.0 / max(m["bpm"], 1)
            for _ in range(8):
                if not r.get("success") or r["uso"]["usadas"] >= r["uso"]["total"] or dur_alvo >= m["dur"]:
                    break
                dur_alvo += frase
                ini = af.melhor_inicio(m, inicio_modo, dur_alvo, manual)
                r = af.planejar(m, midias, modelo, dur_alvo, ordem, semente, ini, bool(telas), reserva)
        return r
    except Exception as e:
        return {"success": False, "error": str(e)}


def af_escolher(tipo):
    """tipo: 'pasta' | 'midias' (várias fotos/vídeos) | 'musica'."""
    if not _window:
        return {"success": False}
    if tipo == "pasta":
        r = _window.create_file_dialog(_file_dialog_kind("FOLDER", webview.FOLDER_DIALOG))
    elif tipo == "musica":
        r = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), file_types=(
            "Música (*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.opus;*.mp4)", "Todos os arquivos (*.*)"))
    else:
        r = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), allow_multiple=True, file_types=(
            "Fotos e vídeos (*.jpg;*.jpeg;*.png;*.webp;*.bmp;*.heic;*.tif;*.tiff;*.mp4;*.mov;*.m4v;*.mkv;*.avi;*.webm;*.mts;*.m2ts;*.3gp;*.wmv)",
            "Todos os arquivos (*.*)"))
    if not r:
        return {"success": False, "cancelled": True}
    return {"success": True, "paths": list(r) if isinstance(r, (list, tuple)) else [r]}


def _capa_do_projeto(dados):
    """(arquivo, segundo) da capa: o primeiro quadro da timeline ativa — a camada de base no começo (trilha mais baixa
    com imagem/vídeo; vídeo com transparência e imagens por cima só se não houver outra). Sem clipes: o vídeo principal."""
    midias = {m.get("id"): m for m in dados.get("media") or [] if isinstance(m, dict)}
    seqs = dados.get("sequences") or [{"id": None, "clips": dados.get("clips") or []}]
    ativa = next((s for s in seqs if s.get("id") == dados.get("activeSequence") and not s.get("comp")), None)
    for seq in [ativa] + [s for s in seqs if s is not ativa and not s.get("comp")]:
        if not seq:
            continue
        cands = []
        for c in seq.get("clips") or []:
            if c.get("x") == "a":
                continue
            mid = c.get("m") or 0
            if mid == 0:
                arq, kind, alfa = dados.get("video"), "video", False
            else:
                m = midias.get(mid) or {}
                arq, kind, alfa = m.get("path"), m.get("kind"), bool(m.get("comp"))
            if kind not in ("video", "image") or not arq or not os.path.isfile(arq):
                continue
            ext = os.path.splitext(arq)[1].lower()
            camada = kind == "image" or alfa or ext == ".mov"   # logo, GC, assinatura (.mov com alfa)
            cands.append((float(c.get("st") or 0), camada, int(c.get("tr") or 0), arq, kind, float(c.get("s") or 0)))
        if cands:
            cands.sort(key=lambda x: (x[0], x[1], x[2]))
            _, _, _, arq, kind, s = cands[0]
            return arq, (0.0 if kind == "image" else s + 0.05)
    video = dados.get("video")
    return (video, 1.0) if video and os.path.isfile(video) else (None, 0)


def ve_project_thumb(path):
    """Miniatura de um projeto recente (tela inicial): o primeiro quadro da timeline ativa. Fica no disco e só é refeita
    quando o projeto muda (o endereço que o JS recebe vale nesta sessão do app; ele pede de novo a cada abertura)."""
    import subprocess
    from Functions import projeto, media_server
    from Functions.video_cutter import ffmpeg_path
    try:
        path = os.path.abspath(path or "")
        if not os.path.isfile(path):
            return {"success": False, "error": "Projeto não encontrado"}
        pasta = os.path.join(tempfile.gettempdir(), "canivete_editor_recentes",
                             hashlib.sha1(path.encode("utf-8", "ignore")).hexdigest()[:16])
        os.makedirs(pasta, exist_ok=True)
        capa = os.path.join(pasta, "capa.jpg")
        if os.path.isfile(capa) and os.path.getmtime(capa) >= os.path.getmtime(path):
            return {"success": True, "url": media_server.register(capa)}
        dados, _ = projeto.abrir(path)
        arq, t = _capa_do_projeto(dados)
        if not arq:
            return {"success": False, "error": "Projeto sem imagem para a capa"}
        tmp = capa + ".tmp.jpg"
        subprocess.run([ffmpeg_path(), "-y", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", arq, "-frames:v", "1",
                        "-vf", "scale=-2:240", "-q:v", "4", tmp],
                       capture_output=True, timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if not os.path.isfile(tmp):
            return {"success": False, "error": "Não foi possível tirar a capa"}
        os.replace(tmp, capa)
        return {"success": True, "url": media_server.register(capa)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def open_file(path):
    try:
        os.startfile(path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def select_video_file(tool):
    if _window:
        result = None
        try:
            file_types = (
                "Mídia e projetos (*.mp4;*.mov;*.mxf;*.mkv;*.avi;*.webm;*.flv;*.f4v;*.wmv;*.asf;*.m4v;*.ts;*.mts;*.m2ts;*.3gp;*.mpg;*.mpeg;*.m2v;*.r3d;*.braw;*.ari;*.arx;*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.opus;*.wma;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif;*.avif;*.vknv;*.vcnvt;*.prproj)",
                "Projeto de vídeo do KANIVETE (*.vknv;*.vcnvt)",
                "Projeto do Premiere Pro (*.prproj)",
                "Todos os arquivos (*.*)",
            )
            result = _window.create_file_dialog(
                _file_dialog_kind("OPEN", webview.OPEN_DIALOG), file_types=file_types
            )
        except Exception as e:
            print("[select_video_file] filtro falhou, usando seletor genérico:", e)
            result = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG))
        if result:
            file_path = result[0] if isinstance(result, (list, tuple)) else result
            return {"success": True, "path": file_path}
    return {"success": False}


# ========================================
# Tools: converter imagem
# ========================================
def converter_imagem(caminho, output_format):
    from Functions.converterimagem import converter_pasta, converter_arquivos

    def trabalho(log, progresso):
        if _is_file(caminho):
            r = converter_arquivos([caminho], output_format, progresso, log)
        else:
            r = converter_pasta(caminho, output_format, progresso, log)
        falhas = f" • {r['falhas']} falha(s)" if r["falhas"] else ""
        return {"resumo": f"{r['convertidos']} de {r['total']} convertida(s){falhas}",
                "abrir": r.get("pasta_saida") if r["convertidos"] else None}

    return _tarefa("updateConverterImagemProgress", trabalho)


def converter_imagem_file(file_path, output_format):
    return converter_imagem(file_path, output_format)


# ========================================
# Tools: favicon
# ========================================
def favicon_generator(image_path, site_name, theme_color):
    from Functions.faviconconverter import gerar_favicon

    def trabalho(log, progresso):
        r = gerar_favicon(image_path, nome_site=site_name, cor_tema=theme_color,
                          callback_log=log, callback_progresso=progresso)
        if not r.get("sucesso"):
            raise RuntimeError("Nenhum arquivo foi gerado. Veja o log.")
        return {"resumo": f"{len(r['arquivos'])} arquivos em favicon_gerados", "abrir": r.get("pasta")}

    return _tarefa("updateFaviconProgress", trabalho)


# ========================================
# Tools: compressor imagem
# ========================================
def compressor_imagem(caminho, force_fullhd=False):
    from Functions.compressor_imagem import listar_arquivos, comprimir_lista

    def trabalho(log, progresso):
        if _is_file(caminho):
            arquivos, base = [caminho], os.path.dirname(caminho)
        else:
            arquivos, base = listar_arquivos(caminho), caminho
        if not arquivos:
            raise RuntimeError("Nenhuma imagem ou PDF encontrado.")
        pasta_saida = os.path.join(base, "comprimidas")
        r = comprimir_lista(arquivos, pasta_saida, manter_original=True, callback_log=log,
                            callback_progresso=progresso, force_fullhd=bool(force_fullhd))
        economia = r["total_orig_mb"] - r["total_final_mb"]
        return {"resumo": f"{r['ok']} comprimida(s) • {r['mantidos']} já otimizada(s) • "
                          f"-{r['reducao_pct']:.0f}% ({economia:.1f} MB economizados)",
                "abrir": pasta_saida if r["ok"] else None}

    return _tarefa("updateCompressorImagemProgress", trabalho)


def compressor_imagem_file(file_path, force_fullhd=False):
    return compressor_imagem(file_path, force_fullhd)


# ========================================
# Tools: compressor video
# ========================================
def compressor_video(caminho, mode="copy", gpu="cpu", qualidade="equilibrada"):
    from Functions.compressor_video import comprimir_lista, listar_videos

    crf = {"alta": 23, "equilibrada": 26, "maxima": 30}.get(str(qualidade), 26)
    sobrescrever = str(mode).lower() == "overwrite"

    def trabalho(log, progresso):
        if _is_file(caminho):
            arquivos, base = [caminho], os.path.dirname(caminho)
        else:
            arquivos, base = listar_videos(caminho), caminho
        if not arquivos:
            raise RuntimeError("Nenhum vídeo encontrado.")
        pasta_saida = base if sobrescrever else os.path.join(base, "comprimidos")
        total = len(arquivos)
        atual = {"i": 0}

        def por_arquivo(i, _total, nome):
            atual["i"] = i - 1

        def prog(pct, status):
            if pct is None or pct < 0:
                progresso(-1, status)
            else:
                progresso((atual["i"] + pct / 100) / total * 100, f"{atual['i'] + 1}/{total} • {status}")

        r = comprimir_lista(arquivos, pasta_saida, qualidade_crf=crf,
                            usar_gpu=str(gpu).lower() != "cpu", manter_original=not sobrescrever,
                            callback_log=log, callback_progresso=prog, callback_arquivo=por_arquivo)
        mantidos = f" • {r['mantidos']} já otimizado(s)" if r.get("mantidos") else ""
        erros = f" • {r['erros']} erro(s)" if r["erros"] else ""
        return {"resumo": f"{r['ok']} de {r['total']} comprimido(s){mantidos}{erros} • -{r['reducao_pct']:.0f}%",
                "abrir": pasta_saida if r["ok"] else None}

    return _tarefa("updateCompressorVideoProgress", trabalho)


def compressor_video_file(file_path, mode="copy", gpu="cpu", qualidade="equilibrada"):
    return compressor_video(file_path, mode, gpu, qualidade)



# ========================================
# Tools: video converter
# ========================================
def video_converter(caminho, output_format):
    from Functions.videoconverter import converter_pasta, converter_lista

    def trabalho(log, progresso):
        if _is_file(caminho):
            r = converter_lista([caminho], output_format, callback_progresso=progresso, callback_log=log)
        else:
            r = converter_pasta(caminho, output_format, callback_progresso=progresso, callback_log=log)
        if not r.get("sucesso"):
            raise RuntimeError(r.get("erro") or "Nenhum arquivo foi convertido. Veja o log.")
        return {"resumo": f"{r['sucessos']} de {r['total']} convertido(s)", "abrir": r["saidas"][0]}

    return _tarefa("updateVideoConverterProgress", trabalho)


def video_converter_file(file_path, output_format):
    return video_converter(file_path, output_format)


def video_downloader_info(url):
    from Functions.videodownloader import extrair_info_video, explicar_erro
    try:
        return {"success": True, "info": extrair_info_video(url)}
    except Exception as e:
        _registrar_erro("video_downloader_info", e)
        return {"success": False, "error": explicar_erro(e)}


def video_downloader(url, destino="", formato="mp4", qualidade="compativel"):
    from Functions.videodownloader import baixar_audio_mp3, baixar_video_mp4, explicar_erro

    def trabalho(log, progresso):
        output_dir = (destino or "").strip() or os.path.join(os.path.expanduser("~"), "Downloads")
        os.makedirs(output_dir, exist_ok=True)
        try:
            if str(formato).lower() == "mp3":
                final = baixar_audio_mp3(url, output_dir, callback=progresso)
            else:
                final = baixar_video_mp4(url, output_dir, callback=progresso, qualidade=qualidade)
        except Exception as e:
            raise RuntimeError(explicar_erro(e))
        return {"resumo": os.path.basename(final), "abrir": final}

    return _tarefa("updateVideoDownloaderProgress", trabalho)


# ========================================
# Tools: web scraper
# ========================================
def web_scraper_analyze(url):
    from Functions.webscraper import analisar_pagina

    try:
        resultado = analisar_pagina(url)
        return {
            "success": True,
            "titulo": resultado.get("titulo", "Sem título"),
            "qtd_imagens": int(resultado.get("qtd_imagens", 0) or 0),
            "qtd_videos": int(resultado.get("qtd_videos", 0) or 0),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def web_scraper_download(url, mode, destino):
    from Functions.webscraper import analisar_pagina, baixar_imagens_zip, baixar_video_mp4 as baixar_video_url
    from Functions.organizador_de_imagens import limpar_pasta as organizar_imagens

    def run():
        def emit(percent=None, status=None, log_msg=None, complete=False):
            if _window:
                try:
                    parts = []
                    if percent is not None:
                        parts.append(f"percent: {int(max(0, min(100, percent)))}")
                    if status is not None:
                        parts.append(f"status: '{_safe_msg(status)}'")
                    if log_msg is not None:
                        parts.append(f"log: '{_safe_msg(log_msg)}'")
                    if complete:
                        parts.append("complete: true")
                    payload = ", ".join(parts)
                    _window.evaluate_js(f"updateWebScraperProgress({{{payload}}})")
                except:
                    pass

        def log(msg):
            emit(log_msg=msg)

        try:
            pasta_destino = (destino or "").strip()
            if not pasta_destino:
                _js("updateWebScraperProgress", {"complete": True, "error": "Selecione uma pasta de destino para o download."})
                return

            os.makedirs(pasta_destino, exist_ok=True)
            emit(percent=2, status="Analisando página...")
            resultado = analisar_pagina(url)
            tipo = (mode or "images").strip().lower()

            baixar_imgs = tipo in {"images", "images_videos"}
            baixar_vids = tipo in {"videos", "images_videos"}

            import re
            import zipfile
            titulo = (resultado.get("titulo") or "scraper").strip()
            pasta_nome = re.sub(r"[^a-zA-Z0-9._ -]", "_", titulo).strip(" ._") or "scraper"
            pasta_final_para_abrir = pasta_destino

            if baixar_imgs:
                imagens = resultado.get("imagens", []) or []
                log(f"Imagens encontradas: {len(imagens)}")
                if imagens:
                    pasta_extraida = os.path.join(pasta_destino, f"{pasta_nome}_imagens")
                    os.makedirs(pasta_extraida, exist_ok=True)
                    zip_path = os.path.join(pasta_destino, f"{pasta_nome}_imagens.zip")

                    emit(percent=5, status="Baixando imagens...")

                    def cb_zip(i, total, _img_url, _ok):
                        if total > 0:
                            p = 5 + int((i / total) * 50)  # 5..55
                            emit(percent=p, status=f"Baixando imagens... {i}/{total}")

                    resumo = baixar_imagens_zip(imagens, zip_path, callback=cb_zip)
                    log(f"Baixadas: {resumo.get('baixadas', 0)} | Puladas: {resumo.get('puladas', 0)}")

                    emit(percent=56, status="Extraindo arquivos...")
                    with zipfile.ZipFile(zip_path, "r") as zf:
                        membros = zf.infolist()
                        total_membros = len(membros)
                        for idx, membro in enumerate(membros, start=1):
                            zf.extract(membro, pasta_extraida)
                            if total_membros > 0:
                                p = 56 + int((idx / total_membros) * 14)  # 56..70
                                emit(percent=p, status=f"Extraindo... {idx}/{total_membros}")

                    if os.path.exists(zip_path):
                        os.remove(zip_path)
                    log("ZIP removido após extração.")

                    emit(percent=71, status="Convertendo e comprimindo para WEBP...")

                    from PIL import Image
                    exts_img = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".gif", ".webp", ".avif"}
                    arquivos_img = []
                    for root, _, files in os.walk(pasta_extraida):
                        for n in files:
                            ext = os.path.splitext(n)[1].lower()
                            if ext in exts_img:
                                arquivos_img.append(os.path.join(root, n))

                    conv_ok = 0
                    conv_fail = 0
                    bytes_in = 0
                    bytes_out = 0
                    target_bytes = 250 * 1024
                    reduzidas_uhd = 0
                    acima_250kb = 0
                    total_conv = len(arquivos_img)

                    lock = threading.Lock()
                    completed = [0]

                    def converter_imagem_webp(src):
                        nonlocal conv_ok, conv_fail, bytes_in, bytes_out, reduzidas_uhd, acima_250kb
                        tmp = ""
                        try:
                            with lock:
                                if os.path.exists(src):
                                    bytes_in += os.path.getsize(src)

                            stem, ext = os.path.splitext(src)
                            dst = stem + ".webp"
                            tmp = dst + ".tmp"

                            img = Image.open(src)
                            if img.mode in ("RGBA", "LA", "P"):
                                img = img.convert("RGBA")
                            else:
                                img = img.convert("RGB")

                            w, h = img.size
                            if w >= 3840 or h >= 2160:
                                ratio = min(1920 / float(w), 1080 / float(h), 1.0)
                                nw = max(1, int(w * ratio))
                                nh = max(1, int(h * ratio))
                                if (nw, nh) != (w, h) and min(nw, nh) >= 720:
                                    try:
                                        rs = Image.Resampling.LANCZOS
                                    except Exception:
                                        rs = Image.LANCZOS
                                    img = img.resize((nw, nh), rs)
                                    with lock:
                                        reduzidas_uhd += 1

                            qualities = [92, 88, 84, 80, 76, 72, 68, 64, 60]
                            atingiu_meta = False
                            for q in qualities:
                                img.save(tmp, format="WEBP", quality=q, method=6)
                                try:
                                    if os.path.getsize(tmp) <= target_bytes:
                                        atingiu_meta = True
                                        break
                                except Exception:
                                    pass

                            if not atingiu_meta:
                                with lock:
                                    acima_250kb += 1

                            if ext.lower() == ".webp":
                                os.replace(tmp, src)
                                with lock:
                                    bytes_out += os.path.getsize(src)
                            else:
                                if os.path.exists(dst):
                                    os.remove(dst)
                                os.replace(tmp, dst)
                                with lock:
                                    bytes_out += os.path.getsize(dst)
                                try:
                                    os.remove(src)
                                except Exception:
                                    pass

                            with lock:
                                conv_ok += 1
                        except Exception:
                            with lock:
                                conv_fail += 1
                            try:
                                if tmp and os.path.exists(tmp):
                                    os.remove(tmp)
                            except Exception:
                                pass
                        finally:
                            with lock:
                                completed[0] += 1
                                if total_conv > 0:
                                    p = 71 + int((completed[0] / total_conv) * 14)
                                    emit(percent=p, status=f"Convertendo para WEBP... {completed[0]}/{total_conv}")

                    with ThreadPoolExecutor(max_workers=5) as executor:
                        executor.map(converter_imagem_webp, arquivos_img)

                    log(
                        f"WEBP convertido/comprimido: {conv_ok} ok, {conv_fail} falhas, "
                        f"UHD reduzidas: {reduzidas_uhd}, acima de 250KB: {acima_250kb}"
                    )

                    emit(percent=86, status="Organizando imagens...")

                    def cb_org(pct, _msg):
                        # organizador envia 0..100 -> mapeia para 86..98
                        p = 86 + int((max(0, min(100, pct)) / 100) * 12)
                        emit(percent=p, status=f"Organizando... {int(max(0, min(100, pct)))}%")

                    rel = organizar_imagens(pasta_extraida, callback_progresso=cb_org, callback_log=log)
                    log("Organização concluída.")

                    # Segunda checagem para plantas/gráficos que podem ter escapado para imagens_em_alta
                    movidas_graf = _mover_graficos_de_imagens_em_alta(pasta_extraida, callback_log=log)

                    pasta_alta = os.path.join(pasta_extraida, "imagens_em_alta")
                    emit(percent=99, status="Renomeando imagens por contexto...")

                    def cb_ctx(i_ctx, t_ctx):
                        if t_ctx > 0:
                            emit(percent=99, status=f"Renomeando por contexto... {i_ctx}/{t_ctx}")

                    rel_ctx = _renomear_imagens_por_contexto(
                        pasta_alta,
                        callback_log=log,
                        callback_status=cb_ctx,
                    )
                    log(
                        f"Renomeação por contexto: {rel_ctx.get('renomeadas', 0)} / "
                        f"{rel_ctx.get('total', 0)}"
                    )

                    # Relatório na pasta raiz organizada
                    from datetime import datetime
                    rel_path = os.path.join(pasta_extraida, "relatorio_organizacao.txt")
                    aprendizado_path = os.path.join(pasta_extraida, "aprendizado_categorias.txt")
                    with open(rel_path, "w", encoding="utf-8") as f:
                        f.write("RELATORIO DE ORGANIZACAO - WEB SCRAPER\n")
                        f.write(f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                        f.write(f"URL: {url}\n")
                        f.write(f"Pasta: {pasta_extraida}\n")
                        f.write("\n")
                        if bytes_in > 0:
                            reducao = (1.0 - (bytes_out / bytes_in)) * 100.0
                            f.write(f"Conversao WEBP: {conv_ok} ok / {conv_fail} falhas\n")
                            f.write(f"Tamanho antes: {bytes_in / 1024 / 1024:.2f} MB\n")
                            f.write(f"Tamanho depois: {bytes_out / 1024 / 1024:.2f} MB\n")
                            f.write(f"Reducao apos conversao: {reducao:.1f}%\n")
                            f.write(f"Meta por arquivo: <= 250 KB\n")
                            f.write(f"Imagens UHD reduzidas para FullHD: {reduzidas_uhd}\n")
                            f.write(f"Arquivos ainda acima de 250 KB: {acima_250kb}\n")
                            f.write("\n")
                        f.write(f"Total analisado: {rel.get('total_analisado', 0)}\n")
                        f.write(f"Logos/ícones: {rel.get('logos_icones', 0)}\n")
                        f.write(f"Thumbs: {rel.get('thumbs', 0)}\n")
                        f.write(f"Graficos: {rel.get('graficos', 0)}\n")
                        f.write(f"Imagens em alta: {rel.get('imagens_em_alta', 0)}\n")
                        f.write(f"Duplicadas: {rel.get('duplicadas', 0)}\n")
                        f.write(f"Nao processadas: {rel.get('nao_processadas', 0)}\n")
                        f.write(f"Reclassificadas para graficos (pós-check): {movidas_graf}\n")
                        f.write("\n")
                        f.write("Renomeacao por contexto (imagens_em_alta):\n")
                        f.write(f"Total alvo: {rel_ctx.get('total', 0)}\n")
                        f.write(f"Renomeadas: {rel_ctx.get('renomeadas', 0)}\n")
                        f.write(f"Falhas: {rel_ctx.get('falhas', 0)}\n")
                        contagens = rel_ctx.get('contagens', {}) or {}
                        if contagens:
                            f.write("Categorias:\n")
                            for k in sorted(contagens.keys()):
                                f.write(f" - {k}: {contagens[k]}\n")

                    # Log de aprendizado para feedback manual do usuário
                    aprendizados = rel_ctx.get("aprendizados", []) or []
                    with open(aprendizado_path, "w", encoding="utf-8") as f:
                        f.write("APRENDIZADO DE CATEGORIAS - WEB SCRAPER\n")
                        f.write("Revise os rótulos e me envie este arquivo para melhorar as classes.\n\n")
                        for item in aprendizados:
                            f.write(f"ORIGINAL: {item.get('arquivo_original', '')}\n")
                            f.write(f"NOVO: {item.get('arquivo_novo', '')}\n")
                            f.write(f"CATEGORIA_ESCOLHIDA: {item.get('categoria', '')}\n")
                            f.write(f"DESCRICAO_RESUMIDA: {item.get('descricao', '')}\n")
                            f.write(f"CONFIANCA: {item.get('confianca', 0.0)*100:.1f}%\n")
                            top3 = item.get("top3", []) or []
                            if top3:
                                f.write("TOP3:\n")
                                for t in top3:
                                    f.write(f" - {t.get('label', '')}: {t.get('score', 0.0)*100:.1f}%\n")
                            f.write("CORRECAO_MANUAL: \n")
                            f.write("-" * 50 + "\n")

                    log("Aprendizado salvo: aprendizado_categorias.txt")

                    log("Relatório salvo: relatorio_organizacao.txt")
                    pasta_final_para_abrir = pasta_extraida
                else:
                    log("Nenhuma imagem para baixar.")

            if baixar_vids:
                videos = resultado.get("videos", []) or []
                log(f"Vídeos encontrados: {len(videos)}")
                if videos:
                    pasta_videos = os.path.join(pasta_destino, f"{pasta_nome}_videos")
                    os.makedirs(pasta_videos, exist_ok=True)

                    for i, v in enumerate(videos, start=1):
                        video_url = (v or {}).get("url", "") if isinstance(v, dict) else ""
                        if not video_url:
                            continue
                        log(f"Baixando vídeo {i}/{len(videos)}...")
                        if len(videos) > 0:
                            p = 80 + int((i / len(videos)) * 18) if not baixar_imgs else 90 + int((i / len(videos)) * 8)
                            emit(percent=p, status=f"Baixando vídeos... {i}/{len(videos)}")
                        try:
                            baixar_video_url(video_url, pasta_videos, callback=log)
                        except Exception as e:
                            log(f"Falha no vídeo {i}: {e}")
                    if not baixar_imgs:
                        pasta_final_para_abrir = pasta_videos
                else:
                    log("Nenhum vídeo para baixar.")

            _js("updateWebScraperProgress", {"percent": 100, "complete": True,
                                             "resumo": f"Salvo em {os.path.basename(pasta_final_para_abrir)}"})
            _abrir_pasta(pasta_final_para_abrir)
        except Exception as e:
            _registrar_erro("web_scraper_download", e)
            _js("updateWebScraperProgress", {"complete": True, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def web_scraper(url, tipo, destino):
    """Compatibilidade retroativa: mantém endpoint antigo."""
    mode_map = {
        "images": "images",
        "video": "videos",
        "info": "images",
    }
    return web_scraper_download(url, mode_map.get((tipo or "").lower(), "images"), destino)


def web_scraper_csv(url):
    from Functions.webscraper import analisar_pagina
    from Functions.cerebro_local import gerar_csv_com_cerebro, get_cerebro_md_path
    import re

    def run():
        def emit(log_msg=None, percent=None, complete=False):
            if _window:
                parts = []
                if log_msg is not None:
                    parts.append(f"log: '{_safe_msg(log_msg)}'")
                if percent is not None:
                    parts.append(f"percent: {percent}")
                if complete:
                    parts.append("complete: true")
                payload = ", ".join(parts)
                _window.evaluate_js(f"updateWebScraperProgress({{{payload}}})")

        try:
            cerebro_path = get_cerebro_md_path()
            if not cerebro_path or not os.path.exists(cerebro_path):
                _js("updateWebScraperProgress", {"complete": True, "error": "Carregue um arquivo de regras (.md) primeiro."})
                return
            
            with open(cerebro_path, "r", encoding="utf-8") as f:
                cerebro_md = f.read().strip()
            if not cerebro_md:
                _js("updateWebScraperProgress", {"complete": True, "error": "O arquivo de regras está vazio."})
                return

            emit(log_msg="Analisando página...", percent=10)
            resultado = analisar_pagina(url)
            titulo = resultado.get("titulo", "output")
            
            nome_csv = re.sub(r"[^\w\s-]", "", titulo).strip()
            nome_csv = re.sub(r"\s+", "_", nome_csv) or "output"
            
            emit(log_msg="Extraindo conteúdo...", percent=30)
            emit(log_msg="Processando com IA local...", percent=50)
            
            output_dir = os.path.join(os.getcwd(), "scraper_output")
            os.makedirs(output_dir, exist_ok=True)
            csv_path = os.path.join(output_dir, f"{nome_csv}.csv")

            emit(log_msg="Gerando CSV...", percent=70)
            csv_path = gerar_csv_com_cerebro(
                titulo=titulo,
                url=resultado.get("url", ""),
                texto_pagina=resultado.get("texto", ""),
                destino_csv=csv_path,
                cerebro_md=cerebro_md,
                callback_log=emit
            )
            _js("updateWebScraperProgress", {"percent": 100, "complete": True, "resumo": f"CSV gerado: {nome_csv}.csv"})
            _abrir_pasta(csv_path)
        except Exception as e:
            _registrar_erro("web_scraper_csv", e)
            _js("updateWebScraperProgress", {"complete": True, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ========================================
# Tools: transcrever audio
# ========================================
def transcrever_audio(caminho, model, language):
    from Functions.transcreveraudio import transcrever_pasta, transcrever_arquivo

    def trabalho(log, progresso):
        fn = transcrever_arquivo if _is_file(caminho) else transcrever_pasta
        r = fn(caminho, modelo_key=model, idioma=language, callback_log=log, callback_progresso=progresso)
        if not r.get("total"):
            raise RuntimeError("Nenhum áudio ou vídeo encontrado.")
        if not r.get("transcritos"):
            raise RuntimeError("Nenhum arquivo foi transcrito. Veja o log.")
        return {"resumo": f"{r['transcritos']} de {r['total']} transcrito(s) • legendas .srt em /transcricoes",
                "texto": r.get("texto_completo", ""),
                "pasta_origem": r.get("pasta_origem") or (os.path.dirname(caminho) if _is_file(caminho) else caminho)}

    return _tarefa("updateTranscreverAudioProgress", trabalho)


def transcrever_audio_file(file_path, model, language):
    return transcrever_audio(file_path, model, language)


def transcrever_salvar_txt(texto, pasta_origem):
    import datetime
    try:
        pasta_saida = os.path.join(pasta_origem, "transcricoes")
        os.makedirs(pasta_saida, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        path_txt = os.path.join(pasta_saida, f"transcricao_{timestamp}.txt")
        with open(path_txt, "w", encoding="utf-8") as f:
            f.write(texto)
        os.startfile(pasta_saida)
        return {"success": True, "path": path_txt}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ========================================
# Tools: Melhorar áudio (Sidon + OmniVoice, como o Adobe Podcast)
# ========================================
def melhorar_audio(caminho):
    from Functions.melhorar_audio import melhorar, recomecar

    def trabalho(log, progresso):
        recomecar()
        r = melhorar(caminho, log, progresso)
        n, falhas = len(r["feitos"]), r["falhas"]
        resumo = (f"{n} arquivo(s) melhorado(s) em {r['segundos']:.0f}s" if n != 1
                  else f"Pronto em {r['segundos']:.0f}s: {os.path.basename(r['feitos'][0])}")
        if falhas:
            resumo += f" • {len(falhas)} falha(s)"
        from Functions import media_server
        previas = [{"arquivo": p["arquivo"], "nome": os.path.basename(p["arquivo"]),
                    "orig": media_server.register(p["orig"]), "mel": media_server.register(p["mel"])}
                   for p in r.get("previas") or []]
        # sem "abrir": a tela mostra o player (antes/depois) e o botão Abrir pasta
        return {"resumo": resumo, "feitos": r["feitos"], "previas": previas}

    return _tarefa("updateMelhorarAudioProgress", trabalho)


def melhorar_audio_midia(caminho, mid):
    """Pocket Editor: gera só o som melhorado ("<nome>_melhorado.wav", no tempo do vídeo); o editor troca o áudio
    da mídia por ele e a imagem e os cortes ficam como estão."""
    from Functions.melhorar_audio import melhorar_arquivo, recomecar

    def trabalho(log, progresso):
        recomecar()
        saida = melhorar_arquivo(caminho, log, lambda v, m=None: progresso(v * 100 if v >= 0 else -1, m), so_audio=True)
        return {"saida": saida, "mid": mid, "origem": caminho}

    return _tarefa("veMelhorarAudioProgresso", trabalho)


def melhorar_audio_cancelar():
    from Functions.melhorar_audio import cancelar
    return cancelar()


# ========================================
# Tools: OmniVoice / geração de voz
# ========================================
def omnivoice_status():
    from Functions.omnivoice_tool import status
    try:
        return status()
    except Exception as e:
        _registrar_erro("omnivoice_status", e)
        return {"success": False, "error": str(e)}


def omnivoice_download():
    from Functions.omnivoice_tool import download_model

    def trabalho(log, progresso):
        r = download_model(callback_log=log, callback_progresso=progresso)
        return {"resumo": "OmniVoice pronto para uso", **r}

    return _tarefa("updateOmniVoiceProgress", trabalho)


def omnivoice_create_voice(name, audio_path, ref_text="", options=None):
    from Functions.omnivoice_tool import create_voice

    def trabalho(log, progresso):
        r = create_voice(name, audio_path, ref_text, options or {}, callback_log=log, callback_progresso=progresso)
        voz = (r.get("voice") or {}).get("name") or name
        return {"resumo": f"Voz salva: {voz}", **r}

    return _tarefa("updateOmniVoiceProgress", trabalho)


def omnivoice_update_voice(voice_id, name, ref_text):
    from Functions.omnivoice_tool import update_voice

    def trabalho(log, progresso):
        r = update_voice(voice_id, name, ref_text, callback_log=log, callback_progresso=progresso)
        voz = (r.get("voice") or {}).get("name") or name
        return {"resumo": f"Voz atualizada: {voz}", **r}

    return _tarefa("updateOmniVoiceProgress", trabalho)


def omnivoice_delete_voice(voice_id):
    from Functions.omnivoice_tool import delete_voice
    try:
        return delete_voice(voice_id)
    except Exception as e:
        _registrar_erro("omnivoice_delete_voice", e)
        return {"success": False, "error": str(e)}


def omnivoice_synthesize(voice_id, text, options=None):
    from Functions.omnivoice_tool import synthesize

    def trabalho(log, progresso):
        return synthesize(voice_id, text, options or {}, callback_log=log, callback_progresso=progresso)

    return _tarefa("updateOmniVoiceProgress", trabalho)


def omnivoice_save_output(path):
    try:
        if not path or not os.path.isfile(path):
            return {"success": False, "error": "Audio nao encontrado."}
        if not _window:
            return {"success": False}
        name = os.path.basename(path)
        folder = os.path.dirname(path)
        result = _window.create_file_dialog(
            _file_dialog_kind("SAVE", webview.SAVE_DIALOG),
            directory=folder,
            save_filename=name,
            file_types=("Audio WAV (*.wav)", "Todos os arquivos (*.*)"),
        )
        if not result:
            return {"success": False, "cancelled": True}
        dest = result[0] if isinstance(result, (list, tuple)) else result
        if not os.path.splitext(dest)[1]:
            dest += ".wav"
        shutil.copy2(path, dest)
        return {"success": True, "path": dest, "name": os.path.basename(dest)}
    except Exception as e:
        _registrar_erro("omnivoice_save_output", e)
        return {"success": False, "error": str(e)}


def remover_fundo(caminho, modelo="isnet"):
    from Functions.removerfundo import processar_imagem_preview, FORMATOS_SUPORTADOS, garantir_modelo
    global _rf_cache
    _rf_cache = []

    def trabalho(log, progresso):
        modelo_id = modelo if modelo in ("isnet", "birefnet-lite") else "isnet"
        garantir_modelo(modelo_id, callback_log=log,
                        callback_progresso=lambda p, s=None: progresso(p * 0.25, s))
        if _is_file(caminho):
            arquivos = [caminho]
        else:
            arquivos = sorted(os.path.join(caminho, f) for f in os.listdir(caminho)
                              if os.path.splitext(f)[1].lower() in FORMATOS_SUPORTADOS)
        if not arquivos:
            raise RuntimeError("Nenhuma imagem encontrada.")
        resultados = []
        for i, path in enumerate(arquivos):
            progresso(25 + i / len(arquivos) * 75, f"{i + 1}/{len(arquivos)} • {os.path.basename(path)}")
            r = processar_imagem_preview(path, callback_log=log, modelo_id=modelo_id)
            if r:
                _rf_cache.append({"nome": r["nome"], "resultado_pil": r["resultado_pil"]})
                resultados.append({k: r[k] for k in ("nome", "original_b64", "resultado_b64")})
        if not resultados:
            raise RuntimeError("Nenhuma imagem pôde ser processada. Veja o log.")
        return {"resumo": f"{len(resultados)} imagem(ns) prontas para revisar", "resultados": resultados}

    return _tarefa("updateRemoverFundoProgress", trabalho)


def remover_fundo_file(file_path, modelo="isnet"):
    return remover_fundo(file_path, modelo)


def remover_fundo_salvar(indices, pasta_destino):
    global _rf_cache
    try:
        os.makedirs(pasta_destino, exist_ok=True)
        saved = 0
        for i in indices:
            if 0 <= i < len(_rf_cache):
                item = _rf_cache[i]
                nome_base = os.path.splitext(item["nome"])[0]
                path_saida = os.path.join(pasta_destino, nome_base + "_sem_fundo.png")
                item["resultado_pil"].save(path_saida, format="PNG")
                saved += 1
        if saved > 0:
            os.startfile(pasta_destino)
        return {"success": True, "saved": saved}
    except Exception as e:
        return {"success": False, "error": str(e)}


def organizador_imagens(folder_path, modo="completa"):
    from Functions.organizador_de_imagens import identificar_duplicadas, identificar_thumbs, limpar_pasta

    def trabalho(log, progresso):
        modo_norm = str(modo or "completa").lower()
        if modo_norm == "duplicadas":
            identificar_duplicadas(folder_path, callback_log=log, callback_progresso=progresso)
            return {"resumo": "Duplicadas identificadas", "abrir": folder_path}
        if modo_norm == "thumbs":
            identificar_thumbs(folder_path, callback_log=log, callback_progresso=progresso)
            return {"resumo": "Thumbs identificadas", "abrir": folder_path}

        limpar_pasta(folder_path, callback_log=log, callback_progresso=lambda p, s=None: progresso(p * 0.7, s))
        progresso(75, "Checando gráficos...")
        _mover_graficos_de_imagens_em_alta(folder_path, callback_log=log)
        pasta_alta = os.path.join(folder_path, "imagens_em_alta")
        if os.path.isdir(pasta_alta):
            progresso(85, "Renomeando por contexto...")
            _renomear_imagens_por_contexto(
                pasta_alta, callback_log=log,
                callback_status=lambda i, t: progresso(85 + i / max(t, 1) * 15, f"Renomeando {i}/{t}"))
        return {"resumo": "Pasta organizada", "abrir": folder_path}

    return _tarefa("updateOrganizadorImagensProgress", trabalho)


def escanear_cameras_videos(folder_path):
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateOrganizadorVideosProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        def progresso(p, status):
            if _window:
                try:
                    _window.evaluate_js(f"updateOrganizadorVideosProgress({{percent: {p}, status: '{_safe_msg(status)}'}})")
                except:
                    pass

        try:
            from Functions.organizador_de_videos import escanear_cameras
            import json, base64
            cameras = escanear_cameras(folder_path, callback_log=log, callback_progresso=progresso)
            cameras_b64 = base64.b64encode(
                json.dumps(cameras, ensure_ascii=False).encode()
            ).decode()
            if _window:
                _window.evaluate_js(f"showCameraPopup(JSON.parse(atob('{cameras_b64}')))")
        except Exception as e:
            log(f"❌ Erro ao escanear: {e}")
            if _window:
                _window.evaluate_js("updateOrganizadorVideosProgress({complete: true})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def organizador_videos(folder_path, operadores=None, nome_projeto_premiere=None):
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateOrganizadorVideosProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        def progresso(p, status):
            if _window:
                try:
                    _window.evaluate_js(f"updateOrganizadorVideosProgress({{percent: {p}, status: '{_safe_msg(status)}'}})")
                except:
                    pass

        try:
            from Functions.organizador_de_videos import organizar_videos
            log("Iniciando organização (Logger Pro)...")
            organizar_videos(folder_path, callback_log=log, callback_progresso=progresso,
                             operadores=operadores,
                             nome_projeto_premiere=nome_projeto_premiere)
            if _window:
                _window.evaluate_js("updateOrganizadorVideosProgress({complete: true})")
                os.startfile(folder_path)
        except Exception as e:
            log(f"❌ Erro: {e}")
            if _window:
                _window.evaluate_js("updateOrganizadorVideosProgress({complete: true})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def transcrever_cena(folder_path):
    from Functions.transcrever_cena import analisar_e_renomear_pasta

    def trabalho(log, progresso):
        analisar_e_renomear_pasta(folder_path, callback_log=log)
        return {"resumo": "Cenas analisadas", "abrir": folder_path}

    return _tarefa("updateTranscreverCenaProgress", trabalho)


# ========================================
# Tools: cerebro
# ========================================
def cerebro_load():
    from Functions.cerebro_local import carregar_cerebro_md
    try:
        content = carregar_cerebro_md()
        return {"success": True, "content": content}
    except Exception as e:
        return {"success": False, "error": str(e)}


def cerebro_save(content):
    from Functions.cerebro_local import salvar_cerebro_md
    try:
        salvar_cerebro_md(content)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def cerebro_exists():
    from Functions.cerebro_local import get_cerebro_md_path
    try:
        path = get_cerebro_md_path()
        if path and os.path.exists(path):
            return {"success": True, "exists": True, "path": os.path.basename(path)}
        return {"success": True, "exists": False}
    except:
        return {"success": False}


def cerebro_remove():
    from Functions.cerebro_local import get_cerebro_md_path
    try:
        path = get_cerebro_md_path()
        if os.path.exists(path):
            os.remove(path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def cerebro_select_file():
    from Functions.cerebro_local import salvar_cerebro_md
    if _window:
        file_types = ('Markdown (*.md)', 'Todos os arquivos (*.*)')
        result = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), file_types=file_types)
        if result:
            file_path = result[0] if isinstance(result, (list, tuple)) else result
            try:
                salvar_cerebro_md(file_path)
                return {"success": True, "path": file_path}
            except Exception as e:
                return {"success": False, "error": str(e)}
    return {"success": False}


def gdrive_check():
    from Functions.gdrive_dumper import usa_client_proprio
    try:
        ok = usa_client_proprio()
        return {"success": True, "configured": ok}
    except Exception as e:
        return {"success": False, "error": str(e)}


def gdrive_analyze(url):
    from Functions.gdrive_dumper import parse_link, calcular_tamanho_pasta, get_folder_name, garantir_conexao
    import threading

    def run():
        def send(**data):
            if _window:
                _window.evaluate_js(f"updateGdriveAnalyze({json.dumps(data)})")

        def log(msg):
            send(log=str(msg))

        try:
            tipo, item_id = parse_link(url)
            if not item_id:
                send(error="URL inválida! Não encontrei o ID da pasta/arquivo.")
                return
            ok, erro = garantir_conexao(callback_log=log)
            if not ok:
                send(error=erro)
                return

            log("Obtendo informações...")
            nome = get_folder_name(item_id, callback_log=log, tipo=tipo)

            if tipo == "file":
                send(complete=True, totalSize="—", totalFiles=1, folderName=f"📄 {nome}")
                return

            log("Calculando tamanho (pastas grandes podem demorar)...")
            total_bytes, total_files, erro = calcular_tamanho_pasta(
                ["--drive-root-folder-id", item_id, "gdrive:"], callback_log=log)
            if erro:
                send(error=erro, allowDownload=True)
                return
            send(complete=True, totalSize=_format_size(total_bytes), totalFiles=total_files, folderName=nome)
        except Exception as e:
            send(error=f"Erro inesperado: {e}", allowDownload=True)

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def gdrive_dump(url, destino, perfil="rapida"):
    from Functions.gdrive_dumper import parse_link, dump_pasta
    import threading
    import traceback

    global _gdrive_stop_event, _gdrive_pause_event
    # Evita dois downloads simultâneos
    if _gdrive_stop_event is not None and not _gdrive_stop_event.is_set() and getattr(gdrive_dump, "_running", False):
        return {"success": False, "error": "Já existe um download em andamento."}
    _gdrive_stop_event = threading.Event()
    _gdrive_pause_event = threading.Event()
    stop_ev, pause_ev = _gdrive_stop_event, _gdrive_pause_event

    def run():
        gdrive_dump._running = True

        def emit(log_msg=None, percent=None, currentFile=None, complete=False, stats=None, success=None):
            if not _window:
                return
            payload = {
                "log": str(log_msg) if log_msg else "",
                "percent": percent if percent is not None else -1,
                "currentFile": currentFile or "",
                "complete": complete,
                "success": success,
            }
            if stats:
                payload.update({
                    "done": stats.get("done", ""),
                    "total": stats.get("total", ""),
                    "speed": stats.get("speed", ""),
                    "eta": stats.get("eta", ""),
                    "message": stats.get("message", ""),
                    "filesDone": stats.get("files_done", -1),
                    "filesTotal": stats.get("files_total", -1),
                    "checks": stats.get("checks", 0),
                    "errors": stats.get("errors", 0),
                    "elapsed": stats.get("elapsed", ""),
                    "transferring": stats.get("transferring", []),
                })
            try:
                _window.evaluate_js(f"updateGdriveProgress({json.dumps(payload)})")
            except Exception:
                pass

        try:
            tipo, item_id = parse_link(url)
            if not item_id:
                emit(log_msg="❌ URL inválida!", complete=True, success=False)
                return

            remote_args = [item_id] if tipo == "file" else ["--drive-root-folder-id", item_id, "gdrive:"]
            emit(log_msg="Iniciando download...", percent=0)

            success = dump_pasta(
                remote_args,
                destino,
                perfil=perfil,
                tipo=tipo,
                callback_log=lambda m: emit(log_msg=m),
                callback_progresso=lambda p, s: emit(percent=p, stats=s),
                callback_arquivo=lambda n, p: emit(currentFile=n),
                stop_event=stop_ev,
                pause_event=pause_ev,
            )

            if success:
                emit(log_msg="✅ Download concluído!", percent=100, complete=True, success=True)
                if os.path.exists(destino):
                    os.startfile(destino)
            elif stop_ev.is_set():
                emit(log_msg="⛔ Download cancelado.", complete=True, success=False)
            else:
                emit(complete=True, success=False)
        except Exception as e:
            traceback.print_exc()
            emit(log_msg=f"Erro crítico: {str(e)}", complete=True, success=False)
        finally:
            gdrive_dump._running = False

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


_update_info = None


def check_update():
    global _update_info
    from Functions.updater import check_update as _check
    try:
        _update_info = _check()
        return _update_info
    except Exception as e:
        return {"available": False, "error": str(e)}


def apply_update():
    from Functions.updater import apply_update as _apply
    info = _update_info or check_update()
    if not info or not info.get("available"):
        return {"success": False, "error": "Nenhuma atualização disponível."}

    def send(**data):
        if _window:
            try:
                _window.evaluate_js(f"updateAppUpdateProgress({json.dumps(data)})")
            except Exception:
                pass

    def run():
        ok, msg = _apply(info, callback_progresso=lambda p, m: send(percent=p, message=m))
        send(done=True, success=ok, message=msg)
        if ok and _window:
            import time as _t
            _t.sleep(1.5)
            try:
                _window.destroy()
            except Exception:
                os._exit(0)

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def gdrive_pause():
    global _gdrive_pause_event
    if _gdrive_pause_event is not None:
        _gdrive_pause_event.set()
    return {"success": True}


def gdrive_resume():
    global _gdrive_pause_event
    if _gdrive_pause_event is not None:
        _gdrive_pause_event.clear()
    return {"success": True}


def gdrive_cancel():
    global _gdrive_stop_event, _gdrive_pause_event
    if _gdrive_pause_event is not None:
        _gdrive_pause_event.clear()
    if _gdrive_stop_event is not None:
        _gdrive_stop_event.set()
    try:
        from Functions.gdrive_dumper import force_kill
        force_kill()
    except Exception:
        pass
    return {"success": True}


def _format_size(bytes_val):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_val < 1024:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.2f} PB"


_img_clip_model = None
_img_clip_processor = None

_CATEGORIAS_IMAGEM = [
    ("grafico", "architectural floor plan, apartment blueprint, technical drawing"),
    ("playground", "a children playground with toys, slides, swings"),
    ("piscina", "a swimming pool in a house or building"),
    ("saladeestar", "a modern living room interior"),
    ("cozinha", "a kitchen interior"),
    ("banheiro", "a bathroom interior"),
    ("quarto", "a bedroom interior"),
    ("areagourmet", "an outdoor gourmet area with grill"),
    ("jardim", "a garden with plants"),
    ("varanda", "a balcony or terrace"),
    ("fachada", "building facade exterior"),
    ("garagem", "a garage with cars"),
    ("quadra", "an outdoor sports court, soccer court, futsal court seen from above"),
    ("brinquedoteca", "an indoor kids playroom with ball pit, colorful toys"),
    ("portaria", "building entrance lobby concierge front desk, condominium gate"),
    ("academiaaolivre", "outdoor gym fitness equipment in open area"),
    ("fachadaaerea", "aerial drone view of building facade and condominium"),
    ("escritorio", "an office interior workspace"),
    ("academia", "a gym fitness interior"),
    ("salaodejogos", "a game room interior"),
    ("criancabrincando", "a child playing"),
    ("homembrincandocomfilho", "a man playing with his child"),
    ("homemtrabalhando", "a man working with drill or power tools on construction"),
    ("idosos", "elderly people together, senior woman and caregiver"),
    ("familia", "a family together"),
    ("pessoa", "a portrait of a person"),
    ("animal", "a pet or animal in scene"),
    ("corredor", "an indoor corridor hallway"),
    ("escada", "a staircase interior"),
    ("sala", "an indoor room"),
]

_DESC_CURTA = {
    "grafico": "gráfico/planta técnica",
    "playground": "playground infantil",
    "brinquedoteca": "brinquedoteca / espaço kids",
    "quadra": "quadra esportiva",
    "portaria": "portaria/entrada",
    "academiaaolivre": "academia ao ar livre",
    "fachadaaerea": "fachada aérea (drone)",
    "piscina": "área de piscina",
    "saladeestar": "sala de estar",
    "cozinha": "cozinha",
    "banheiro": "banheiro",
    "quarto": "quarto",
    "areagourmet": "área gourmet",
    "jardim": "jardim / área verde",
    "varanda": "varanda",
    "fachada": "fachada",
    "garagem": "garagem",
    "escritorio": "escritório",
    "academia": "academia",
    "salaodejogos": "sala de jogos",
    "criancabrincando": "criança brincando",
    "homembrincandocomfilho": "homem brincando com filho",
    "homemtrabalhando": "homem trabalhando",
    "idosos": "pessoas idosas",
    "familia": "família",
    "pessoa": "pessoas",
    "animal": "animal/pet",
    "corredor": "corredor",
    "escada": "escada",
    "sala": "ambiente interno",
    "imagem": "contexto indefinido",
}


def _slug_nome(texto):
    import unicodedata

    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode("ascii")
    t = t.lower()
    t = "".join(ch for ch in t if ch.isalnum())
    return t or "imagem"


def _carregar_clip_imagem(callback_log=None):
    global _img_clip_model, _img_clip_processor
    if _img_clip_model is not None and _img_clip_processor is not None:
        return True

    try:
        from transformers import CLIPModel, CLIPProcessor
        if callback_log:
            callback_log("Carregando classificador de contexto (CLIP)...")
        _img_clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        _img_clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        _img_clip_model.eval()
        return True
    except Exception as e:
        if callback_log:
            callback_log(f"Classificador indisponível: {e}")
        return False


def _detectar_contexto_imagem(path_img, callback_log=None):
    from PIL import Image

    if not _carregar_clip_imagem(callback_log=callback_log):
        return {"label": "imagem", "score": 0.0, "top3": []}

    try:
        import torch

        img = Image.open(path_img).convert("RGB")
        labels = [c[0] for c in _CATEGORIAS_IMAGEM]
        prompts = [c[1] for c in _CATEGORIAS_IMAGEM]
        inputs = _img_clip_processor(text=prompts, images=img, return_tensors="pt", padding=True, truncation=True)
        with torch.no_grad():
            outputs = _img_clip_model(**inputs)
            probs = outputs.logits_per_image[0].softmax(dim=0)
            idx = int(probs.argmax().item())
            score = float(probs[idx].item())

            topk = min(3, len(labels))
            vals, inds = torch.topk(probs, k=topk)
            top3 = []
            for v, i in zip(vals.tolist(), inds.tolist()):
                top3.append({"label": labels[int(i)], "score": float(v)})

        label = labels[idx]
        label = _ajustar_categoria_contexto(label, score, top3, path_img)

        # Se baixa confiança, usa categoria neutra para revisão futura
        if score < 0.33 and label not in {"playground", "brinquedoteca", "quadra"}:
            return {"label": "imagem", "score": score, "top3": top3}
        return {"label": label, "score": score, "top3": top3}
    except Exception:
        return {"label": "imagem", "score": 0.0, "top3": []}


def _ajustar_categoria_contexto(label, score, top3, path_img):
    """Regras práticas para reduzir erros comuns do domínio imobiliário."""
    nome = os.path.basename(path_img).lower()
    top = {x.get("label", ""): float(x.get("score", 0.0)) for x in (top3 or [])}

    # 1) Palavras-chave do arquivo têm prioridade alta
    if any(k in nome for k in ["playground", "babyplay", "brinquedoteca", "bola", "piscina_de_bolinha"]):
        return "playground" if "brinquedoteca" not in nome else "brinquedoteca"
    if any(k in nome for k in ["quadra", "futebol", "soccer", "futsal", "campo"]):
        return "quadra"
    if any(k in nome for k in ["planta", "implantacao", "mapa", "layout", "humanizada", "blueprint"]):
        return "grafico"
    if any(k in nome for k in ["portaria", "lobby", "hall_entrada", "acesso", "guarita"]):
        return "portaria"
    if any(k in nome for k in ["drone", "voo", "aereo", "aerea"]):
        return "fachadaaerea"
    if any(k in nome for k in ["furadeira", "obra", "construcao", "worker"]):
        return "homemtrabalhando"

    # 2) Evitar areagourmet confundindo playground/quadra
    if label == "areagourmet":
        if top.get("playground", 0.0) >= 0.20:
            return "playground"
        if top.get("quadra", 0.0) >= 0.18:
            return "quadra"
        if top.get("brinquedoteca", 0.0) >= 0.18:
            return "brinquedoteca"
        if top.get("quadra", 0.0) >= 0.12:
            return "quadra"

    # 3) Evitar animal em cenas de pessoas
    if label == "animal":
        pessoa_like = max(
            top.get("pessoa", 0.0),
            top.get("familia", 0.0),
            top.get("homembrincandocomfilho", 0.0),
            top.get("criancabrincando", 0.0),
        )
        if pessoa_like >= 0.10 or score < 0.50:
            return "pessoa" if top.get("pessoa", 0.0) >= top.get("familia", 0.0) else "familia"

    # 4) Varanda é frequentemente confundida com fachada/portaria
    if label == "varanda":
        if top.get("fachada", 0.0) >= 0.09:
            return "fachada"
        if top.get("portaria", 0.0) >= 0.09:
            return "portaria"
        if top.get("fachadaaerea", 0.0) >= 0.08:
            return "fachadaaerea"

    # 5) Homem com criança x homem trabalhando
    if label == "homembrincandocomfilho":
        if top.get("homemtrabalhando", 0.0) >= 0.08:
            return "homemtrabalhando"

    # 6) Academia interna x academia ao ar livre
    if label == "academia" and top.get("academiaaolivre", 0.0) >= 0.12:
        return "academiaaolivre"

    # 7) Plantas técnicas não devem virar sala/quarto
    if label in {"sala", "saladeestar", "quarto"} and top.get("grafico", 0.0) >= 0.12:
        return "grafico"

    return label


def _mover_graficos_de_imagens_em_alta(pasta_base, callback_log=None):
    """Move para /graficos itens de planta técnica que escaparam da organização."""
    from Functions.organizador_de_imagens import eh_grafico_arquitetonico
    from PIL import Image

    pasta_alta = os.path.join(pasta_base, "imagens_em_alta")
    pasta_graf = os.path.join(pasta_base, "graficos")
    os.makedirs(pasta_graf, exist_ok=True)

    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".avif"}
    movidas = 0
    if not os.path.isdir(pasta_alta):
        return 0

    for nome in os.listdir(pasta_alta):
        src = os.path.join(pasta_alta, nome)
        if not os.path.isfile(src):
            continue
        if os.path.splitext(nome)[1].lower() not in exts:
            continue

        nome_l = nome.lower()
        por_nome = any(k in nome_l for k in ["planta", "implantacao", "mapa", "layout", "humanizada", "blueprint"])
        por_visao = False
        if not por_nome:
            try:
                img = Image.open(src).convert("RGB")
                por_visao = bool(eh_grafico_arquitetonico(img))
            except Exception:
                por_visao = False

        if por_nome or por_visao:
            dst = os.path.join(pasta_graf, nome)
            base, ext = os.path.splitext(dst)
            idx = 2
            while os.path.exists(dst):
                dst = f"{base}_{idx}{ext}"
                idx += 1
            try:
                os.replace(src, dst)
                movidas += 1
            except Exception:
                pass

    if callback_log and movidas > 0:
        callback_log(f"Reclassificação: {movidas} arquivo(s) movido(s) para /graficos")
    return movidas


def _renomear_imagens_por_contexto(pasta_alta, callback_log=None, callback_status=None):
    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".avif"}
    arquivos = []
    if os.path.isdir(pasta_alta):
        for n in sorted(os.listdir(pasta_alta)):
            p = os.path.join(pasta_alta, n)
            if os.path.isfile(p) and os.path.splitext(n)[1].lower() in exts:
                arquivos.append(p)

    total = len(arquivos)
    if total == 0:
        return {"total": 0, "renomeadas": 0, "falhas": 0, "contagens": {}}

    lock = threading.Lock()
    deteccoes = []
    conv_fail = 0
    completed = [0]

    def detectar_contexto_parallel(path):
        nonlocal conv_fail, completed
        try:
            det = _detectar_contexto_imagem(path, callback_log=callback_log)
            with lock:
                deteccoes.append({"path": path, "det": det})
        except Exception:
            with lock:
                conv_fail += 1
        finally:
            with lock:
                completed[0] += 1
                if callback_status:
                    callback_status(completed[0], total)

    with ThreadPoolExecutor(max_workers=5) as executor:
        executor.map(detectar_contexto_parallel, arquivos)

    cont = {}
    ren = 0
    falhas = conv_fail
    aprendizados = []

    for item in deteccoes:
        old_path = item["path"]
        det = item["det"]
        try:
            lbl = _slug_nome(det.get("label", "imagem"))
            with lock:
                cont[lbl] = cont.get(lbl, 0) + 1
                idx = cont[lbl]
            ext = os.path.splitext(old_path)[1].lower()
            base_name = f"{lbl}{idx:02d}"
            new_path = os.path.join(pasta_alta, base_name + ext)
            n = 2
            while os.path.exists(new_path) and os.path.normcase(new_path) != os.path.normcase(old_path):
                new_path = os.path.join(pasta_alta, f"{base_name}_{n}{ext}")
                n += 1
            if os.path.normcase(new_path) != os.path.normcase(old_path):
                os.replace(old_path, new_path)
                ren += 1

            aprendizados.append({
                "arquivo_original": os.path.basename(old_path),
                "arquivo_novo": os.path.basename(new_path),
                "categoria": lbl,
                "descricao": _DESC_CURTA.get(lbl, lbl),
                "confianca": float(det.get("score", 0.0)),
                "top3": det.get("top3", []),
            })

            if callback_log:
                top3_txt = ", ".join(
                    f"{x.get('label')}({x.get('score', 0.0)*100:.0f}%)" for x in (det.get("top3") or [])
                )
                callback_log(
                    f"Contexto: {os.path.basename(new_path)} <= {lbl} ({_DESC_CURTA.get(lbl, lbl)}) ({det.get('score', 0.0)*100:.0f}%)"
                    + (f" | top: {top3_txt}" if top3_txt else "")
                )
        except Exception as e:
            falhas += 1
            if callback_log:
                callback_log(f"Falha ao renomear {os.path.basename(old_path)}: {e}")

    return {
        "total": total,
        "renomeadas": ren,
        "falhas": falhas,
        "contagens": cont,
        "aprendizados": aprendizados,
    }


# ========================================
# API bridge (one method per frontend call)
# ========================================
class ApiBridge:
    """Ponte estável entre `frontend/js/app.js` e funções Python."""

    # pickers
    def select_folder(self, tool):
        return select_folder(tool)

    def select_file(self, tool):
        return select_file(tool)

    def select_image(self, tool):
        return select_image(tool)

    def open_folder(self, path):
        return open_folder(path)

    # audio/image/video converters
    def converter_audio(self, folder_path, output_format):
        return converter_audio(folder_path, output_format)

    def converter_audio_file(self, file_path, output_format):
        return converter_audio_file(file_path, output_format)

    def audio_cutter_prepare(self, file_path):
        return audio_cutter_prepare(file_path)

    def audio_cutter_export(self, file_path, cuts, output_format="mp3", tracks=None, main_offset=0):
        return audio_cutter_export(file_path, cuts, output_format, tracks, main_offset)

    def video_cutter_prepare(self, file_path):
        return video_cutter_prepare(file_path)

    def video_cutter_export(self, file_path, segments, output_format="mp4", qualidade="medium",
                            resolucao="original", usar_gpu=True, pasta_saida=None, sem_audio=False,
                            camadas=None, audio_segments=None, duracao=None, audio_clipes=None, legendas=None, quadro=None,
                            opcoes=None):
        return video_cutter_export(file_path, segments, output_format, qualidade, resolucao, usar_gpu,
                                   pasta_saida, sem_audio, camadas, audio_segments, duracao, audio_clipes, legendas, quadro,
                                   opcoes)

    def ve_texto_modelos(self):
        return ve_texto_modelos()

    def ve_transcrever(self, clipes, total, idioma="pt"):
        return ve_transcrever(clipes, total, idioma)

    def ve_transcrever_cancelar(self):
        return ve_transcrever_cancelar()

    def ve_salvar_legenda(self, itens, formato="srt", nome="legendas", pasta=""):
        return ve_salvar_legenda(itens, formato, nome, pasta)

    def ve_fontes(self):
        return ve_fontes()

    def ie_curar(self, regiao, mascara, dx, dy, difusao=0):
        """Pincel de recuperação / Remendo (Functions/recuperar.py): clonagem de Poisson da origem no destino."""
        from Functions import recuperar
        try:
            return recuperar.curar(regiao, mascara, dx, dy, difusao)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ie_preencher_ia(self, regiao, mascara, expandir=None):
        """Editar › Preenchimento sensível ao conteúdo (Functions/preencher_conteudo.py, LaMa): trecho + máscara →
        trecho preenchido + a área usada. Baixa o modelo na primeira vez; o progresso vai para ieConteudoProgresso."""
        from Functions import preencher_conteudo
        try:
            prog = lambda p, msg: _js("ieConteudoProgresso", {"p": p, "msg": msg})
            preencher_conteudo.garantir_modelo(prog)
            return preencher_conteudo.preencher_b64(regiao, mascara, expandir, prog)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ie_ceu_mascara(self, foto, deslocar=0, esmaecer=0):
        """Editar › Substituição de céu (Functions/ceu.py, SkySeg): foto → máscara do céu + caixa + cor; baixa o modelo
        na primeira vez (progresso em ieConteudoProgresso)."""
        from Functions import ceu
        try:
            prog = lambda p, msg: _js("ieConteudoProgresso", {"p": p, "msg": msg})
            ceu.garantir_modelo(prog)
            return ceu.mascara_b64(foto, deslocar, esmaecer, prog)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ie_ceu_cor(self, ceu_png):
        """Cor da parte de baixo do céu novo (a luz que ele joga no primeiro plano)."""
        from Functions import ceu
        try:
            return {"success": True, "cor": ceu.cor_horizonte_b64(ceu_png)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ie_preencher_conteudo(self, regiao, mascara, raio=6):
        """Pincel de recuperação para manchas / Remendo sensível ao conteúdo: reconstrói pela vizinhança."""
        from Functions import recuperar
        try:
            return recuperar.preencher(regiao, mascara, raio)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ie_instalar_fonte(self, familia):
        """Instala uma família do Google Fonts para o usuário (Functions/fontes.py) e relê a lista."""
        from Functions import fontes
        return fontes.instalar_google(familia)

    def ve_preparar_midia(self, path, mid, urgente=False, leve=False, fundo=False):
        return ve_preparar_midia(path, mid, urgente, leve, fundo)

    def ve_area_transferencia(self, projeto=""):
        """Ctrl+V na timeline: o que foi copiado no Windows (arquivos, imagem ou texto)."""
        from Functions import area_transferencia
        try:
            return area_transferencia.ler(projeto)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ve_area_seq(self):
        from Functions import area_transferencia
        return {"seq": area_transferencia.sequencia()}

    def ve_inverter_midia(self, path, a, b, job):
        return ve_inverter_midia(path, a, b, job)

    def ve_priorizar_midia(self, path):
        from Functions.video_cutter import priorizar_midia
        priorizar_midia(path)
        return {"success": True}

    def ve_importar_dialogo(self):
        return ve_importar_dialogo()

    def ve_listar_pasta(self, path):
        return ve_listar_pasta(path)

    def ve_ler_legenda(self, path):
        return ve_ler_legenda(path)

    def ve_otimizar_fullhd(self, itens):
        return ve_otimizar_fullhd(itens)

    def ve_otimizar_cancelar(self):
        return ve_otimizar_cancelar()

    def ve_encoder_estado(self):
        """Kanivete Encoder: CPU, RAM, placa e o quadro em render agora (Functions/encoder_monitor.py)."""
        from Functions import encoder_monitor
        return encoder_monitor.estado()

    def ve_sincronizar_audio(self, ref_path, ref_s, ref_e, outro_path, outro_s, outro_e):
        return ve_sincronizar_audio(ref_path, ref_s, ref_e, outro_path, outro_s, outro_e)

    def ve_salvar_png(self, dados):
        return ve_salvar_png(dados)

    def ve_txa_lista(self, entradas):
        return ve_txa_lista(entradas)

    def video_cutter_audio_fonte(self):
        return video_cutter_audio_fonte()

    def video_cutter_add_audio(self, path):
        return video_cutter_add_audio(path)

    def anti_noise_preparar(self, path):
        return anti_noise_preparar(path)

    def video_cutter_add_media(self, path):
        return video_cutter_add_media(path)

    # Soundboard do editor (pack baixado no primeiro uso)
    def ve_sb_estado(self):
        from Functions import soundboard
        return soundboard.estado()

    def ve_sb_baixar(self):
        from Functions import soundboard
        return soundboard.baixar(lambda d: _ve_emit("veSbProgresso", d))

    def ve_sb_abrir_pasta(self):
        from Functions import soundboard
        _abrir_pasta(soundboard.pasta())
        return {"success": True}

    def ve_render_listar(self, base, chave):
        return ve_render_listar(base, chave)

    def ve_render_trecho(self, base, chave, h, job):
        return ve_render_trecho(base, chave, h, job)

    def ve_render_cancelar(self):
        return ve_render_cancelar()

    def ve_comp_render(self, base, h, job):
        return ve_comp_render(base, h, job)

    def ve_comp_cancelar(self):
        return ve_comp_cancelar()

    def ve_ovt_render(self, base, h, job):
        return ve_ovt_render(base, h, job)

    def ve_psd_importar(self, path):
        return ve_psd_importar(path)

    # Editor de Imagem (frontend/js/imagem-*.js, Functions/editor_imagem.py)
    def ie_abrir(self, path):
        from Functions import editor_imagem
        return editor_imagem.abrir(path, lambda p, nome: _js("ieProgresso", {"p": p, "nome": nome}))

    def ie_liberar(self, doc):
        from Functions import editor_imagem
        return editor_imagem.liberar(doc)

    def ie_mascara_assunto(self, png_b64, modelo="birefnet-lite"):
        """Photo Kanivete: máscara do assunto (Remover plano de fundo / Selecionar assunto) em PNG base64."""
        import hashlib
        from Functions.removerfundo import mascara_assunto_b64
        from Functions.midia import pasta_cache
        # mesma imagem + mesmo modelo = mesma máscara: guarda em disco (refazer uma arte não roda a IA de novo)
        pasta = pasta_cache("cache_recorte")
        arq = os.path.join(pasta, hashlib.sha1(f"{modelo}|{png_b64}".encode()).hexdigest() + ".txt")
        try:
            if os.path.exists(arq):
                with open(arq, encoding="ascii") as f:
                    return {"success": True, "png": f.read(), "cache": True}
            png = mascara_assunto_b64(png_b64, modelo)
            try:
                os.makedirs(pasta, exist_ok=True)
                with open(arq, "w", encoding="ascii") as f:
                    f.write(png)
                velhos = sorted((os.path.join(pasta, n) for n in os.listdir(pasta)), key=os.path.getmtime)
                for v in velhos[:-200]:
                    os.remove(v)
            except OSError:
                pass
            return {"success": True, "png": png}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ie_recorte_pro(self, png_b64):
        """Photo Kanivete: recorte profissional (Functions/recorte_pro.py) — cores sem o fundo misturado + máscara."""
        import hashlib
        from Functions.midia import pasta_cache
        pasta = pasta_cache("cache_recorte")
        # pro2_: recorte novo (2026-10-06: pessoa → matting, objeto → BEN2, GPU) — o cache do algoritmo antigo não volta
        arq = os.path.join(pasta, "pro2_" + hashlib.sha1(png_b64.encode()).hexdigest() + ".json")
        try:
            if os.path.exists(arq):
                with open(arq, encoding="ascii") as f:
                    return {"success": True, **json.load(f), "cache": True}
            from Functions.recorte_pro import recorte_b64
            r = recorte_b64(png_b64)
            try:
                os.makedirs(pasta, exist_ok=True)
                with open(arq, "w", encoding="ascii") as f:
                    json.dump(r, f)
                velhos = sorted((os.path.join(pasta, n) for n in os.listdir(pasta)), key=os.path.getmtime)
                for v in velhos[:-200]:
                    os.remove(v)
            except OSError:
                pass
            return {"success": True, **r}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Gerar imagem com IA (Functions/gerador_imagem.py): Z-Image-Turbo (padrão) / FLUX.2 klein (referências) via sd.cpp, sob demanda
    def ie_gerador_estado(self, modelo=None):
        from Functions import gerador_imagem
        return gerador_imagem.estado(modelo)

    def ie_gerador_baixar(self, modelo=None):
        from Functions import gerador_imagem
        return gerador_imagem.baixar(lambda d: _js("ieGeradorProgresso", d), modelo)

    def ie_gerar(self, spec):
        from Functions import gerador_imagem
        # (não pré-carregar o modelo de recorte aqui: com o gerador na placa a próxima geração falhava — a cena gera
        # tudo primeiro e recorta depois, ieCenaGerarTodas)
        return gerador_imagem.gerar(spec, lambda d: _js("ieGeradorProgresso", d))

    def ie_gerador_cancelar(self, job):
        from Functions import gerador_imagem
        return gerador_imagem.cancelar(job)

    def ie_gerador_parar(self):
        from Functions import gerador_imagem
        return gerador_imagem.parar()

    def ie_gerador_remover(self):
        from Functions import gerador_imagem
        return gerador_imagem.remover()

    def ie_fechar(self, doc):
        from Functions import editor_imagem
        return editor_imagem.fechar(doc)

    def ie_salvar_inicio(self, doc):
        from Functions import editor_imagem
        return editor_imagem.salvar_inicio(doc)

    def ie_salvar(self, spec):
        from Functions import editor_imagem
        try:
            return editor_imagem.salvar(spec)
        except Exception as e:
            import logging
            logging.exception("editor de imagem: salvar")
            return {"success": False, "error": str(e)}

    def ie_salvar_iknv(self, spec):
        from Functions import editor_imagem
        return editor_imagem.salvar_iknv(spec)

    def ie_exportar(self, spec):
        from Functions import editor_imagem
        return editor_imagem.exportar(spec)

    def ie_exportar_fatias(self, spec):
        from Functions import editor_imagem
        return editor_imagem.exportar_fatias(spec)

    def ie_dialogo_abrir(self, multiplos=True):
        if not _window:
            return {"success": False}
        # pywebview só aceita letras e espaços na descrição do filtro (vírgula derruba o diálogo)
        tipos = ("Imagens PSD e projetos (*.iknv;*.psd;*.psb;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif;*.tif;*.tiff)",
                 "Projeto de imagem do KANIVETE (*.iknv)", "Todos os arquivos (*.*)")
        try:
            r = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), allow_multiple=bool(multiplos), file_types=tipos)
        except ValueError as e:
            print("[ie_dialogo_abrir] filtro falhou, usando seletor genérico:", e)
            r = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), allow_multiple=bool(multiplos))
        paths = list(r or [])
        return {"success": bool(paths), "paths": paths}

    def ie_dialogo_salvar(self, nome, ext="psd", pasta=""):
        if not _window:
            return {"success": False}
        tipos = {"iknv": "Projeto de imagem do KANIVETE (*.iknv)", "psd": "Photoshop (*.psd)",
                 "psb": "Photoshop grande (*.psb)", "pdf": "PDF (*.pdf)", "png": "PNG (*.png)",
                 "jpg": "JPEG (*.jpg)", "webp": "WebP (*.webp)", "tif": "TIFF (*.tif)"}
        ext = ext if ext in tipos else "psd"
        # projeto (.iknv), PSD, PSB e PDF achatado aparecem juntos no Salvar como; vale a extensão escolhida no nome.
        salvaveis = ("iknv", "psd", "psb", "pdf")
        extras = tuple(tipos[k] for k in salvaveis if k != ext) if ext in salvaveis else ()
        r = _window.create_file_dialog(_file_dialog_kind("SAVE", webview.SAVE_DIALOG), directory=pasta or "",
                                       save_filename=f"{nome}.{ext}", file_types=(tipos[ext],) + extras + ("Todos os arquivos (*.*)",))
        if not r:
            return {"success": False, "cancelled": True}
        path = r[0] if isinstance(r, (list, tuple)) else r
        aceitas = ("." + ext,) + ((".iknv", ".psd", ".psb", ".pdf") if ext in salvaveis else ()) + ((".jpeg",) if ext == "jpg" else ())
        if not path.lower().endswith(aceitas):
            path += "." + ext
        return {"success": True, "path": path}

    def ie_colar_windows(self):
        from Functions import editor_imagem
        return editor_imagem.colar_windows()

    def ie_soltar_memoria(self, tokens):
        from Functions import media_server
        media_server.unregister_bytes(tokens)
        return {"success": True}

    def ie_existe(self, path):
        return {"existe": bool(path) and os.path.isfile(path)}

    def ie_prefs(self, dados=None):
        """Preferências do Editor de Imagem (estilos salvos, padrões dos efeitos, painéis, fontes recentes):
        %APPDATA%/CaniveteDoPailer/editor_imagem.json. Sem dados, lê tudo; com dados, grava tudo."""
        arq = os.path.join(os.path.dirname(_ve_layout_path()), "editor_imagem.json")
        try:
            if dados is None:
                if not os.path.isfile(arq):
                    return {"success": True, "prefs": {}}
                with open(arq, "r", encoding="utf-8") as f:
                    return {"success": True, "prefs": json.load(f)}
            tmp = arq + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(dados, f, ensure_ascii=False)
            os.replace(tmp, arq)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e), "prefs": {}}

    def ie_amostras(self, origem="photoshop"):
        """Painel Amostras: 'photoshop' = as do Photoshop instalado (com grupos); 'arquivo' = escolher um .aco/.ase."""
        try:
            from Functions import amostras
            if origem == "photoshop":
                lista, versao = amostras.do_photoshop()
                if lista is None:
                    return {"success": False, "error": "Photoshop não encontrado neste computador"}
                return {"success": True, "lista": lista, "origem": versao}
            if not _window:
                return {"success": False}
            r = _window.create_file_dialog(_file_dialog_kind("OPEN", webview.OPEN_DIALOG), allow_multiple=False, file_types=(
                "Amostras do Adobe (*.aco;*.ase)", "Todos os arquivos (*.*)"))
            if not r:
                return {"success": False, "cancelled": True}
            path = r[0]
            return {"success": True, "lista": amostras.ler_arquivo(path), "origem": os.path.splitext(os.path.basename(path))[0]}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ─────────── Vetor Kanivete (Functions/vetor_kanivete.py, vetor_importar.py, vetor_exportar.py) ───────────
    def vk_baixar_ghostscript(self):
        from Functions import vetor_importar
        return vetor_importar.baixar_ghostscript()

    def vk_exportar_ai(self, doc_py, doc_salvar, path, opcoes):
        from Functions import vetor_saida
        try:
            return vetor_saida.exportar_ai(doc_py, doc_salvar, path, opcoes)
        except Exception as e:
            import traceback
            return {"success": False, "error": str(e), "trace": traceback.format_exc()[-1200:]}

    # ── Sound Kanivete (Functions/sound_kanivete.py) ──
    def sk_info(self, path):
        from Functions import sound_kanivete
        try:
            return sound_kanivete.info(path)
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ── Kani: assistente de conversa (Functions/kani.py, frontend/js/kani.js) ──
    def kani_estado(self):
        from Functions import kani
        return kani.estado()

    def kani_baixar(self):
        from Functions import kani
        return kani.baixar(lambda d: _js("kaniProgresso", d))

    def kani_enviar(self, cid, mensagens, ferramenta=""):
        from Functions import kani
        return kani.conversar(cid, mensagens, ferramenta, lambda d: _js("kaniEvento", d))

    def kani_parar(self, cid):
        from Functions import kani
        return kani.cancelar(cid)

    def kani_voz(self, ligar=True):
        """Abre o chat: carrega a voz da Kani e deixa pronta; fecha: tira da memória."""
        from Functions import kani
        return kani.voz_ligar(bool(ligar))

    def kani_falar(self, texto, chave=""):
        """Lê a resposta com a voz da Kani (Fran, OmniVoice 12 passos); o áudio volta em kaniVoz({chave, url})."""
        from Functions import kani
        return kani.falar(texto, lambda d: _js("kaniVoz", d), chave)

    def sk_trecho(self, arq, k, sr=48000):
        """Trecho de 10 s em PCM s16le estéreo (prévia com precisão de amostra; som-motor.js)."""
        from Functions import media_server, sound_kanivete
        try:
            return {"success": True, "url": media_server.register(sound_kanivete.trecho(arq, k, sr))}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_auto(self, acao, proj=None, caminho=None, pid=None):
        """Salvamento automático do Sk: acao salvar|lista|ler|apagar (Functions/sound_kanivete.auto_*)."""
        from Functions import sound_kanivete as s
        try:
            if acao == "salvar":
                return s.auto_salvar(proj, caminho)
            if acao == "lista":
                return {"success": True, "itens": s.auto_lista()}
            if acao == "ler":
                return dict(s.auto_ler(pid), success=True)
            return s.auto_apagar(pid)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_gravar(self, acao, dispositivo=None, caminho=None, sr=48000, canais=1):
        """Microfone (Functions/sk_gravar.py): acao dispositivos|iniciar|estado|parar."""
        from Functions import sk_gravar as g
        try:
            if acao == "dispositivos":
                return g.dispositivos()
            if acao == "iniciar":
                return g.iniciar(dispositivo, caminho, sr, canais)
            if acao == "estado":
                return g.estado()
            return g.parar()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_ir(self, tamanho=1.2):
        """IR do reverb (a mesma da exportação) → URL para o ConvolverNode."""
        from Functions import media_server, sound_kanivete
        try:
            return {"success": True, "url": media_server.register(sound_kanivete.ir_reverb(tamanho))}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_espectro(self, arq, t0, t1, cols=1200, rows=256):
        """Espectrograma (PNG, frequência log 40 Hz → 22 kHz de baixo para cima) do trecho [t0, t1] do arquivo."""
        from Functions import media_server, sk_espectro
        try:
            return {"success": True, "url": media_server.register(sk_espectro.espectro(arq, t0, t1, cols, rows)), "fmin": sk_espectro.FMIN, "fmax": 22050}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_salvar(self, proj, caminho):
        from Functions import sound_kanivete
        return sound_kanivete.salvar(proj, caminho)

    def sk_abrir(self, caminho):
        from Functions import sound_kanivete
        return sound_kanivete.abrir(caminho)

    def sk_exportar(self, proj, caminho, op=None):
        from Functions import sound_kanivete
        try:
            return sound_kanivete.exportar(proj, caminho, op or {})
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_medir(self, proj, op=None):
        from Functions import sound_kanivete
        try:
            return sound_kanivete.medir_lufs(proj, op or {})
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_processar(self, arq, efeito, op=None):
        """Efeito que gera arquivo novo (limpar | melhorar): roda em thread; progresso e fim em skProgresso(dados)."""
        from Functions import sound_kanivete
        op = op or {}

        def trabalho(log, progresso):
            if efeito == "limpar":
                saida = sound_kanivete.limpar_ruido(arq, op.get("quantidade", 80), log, progresso)
            elif efeito == "melhorar":
                saida = sound_kanivete.melhorar_voz(arq, log, progresso)
            elif efeito == "reparar":
                from Functions import sk_espectro
                saida = sk_espectro.reparar(arq, op["t0"], op["t1"], op["f0"], op["f1"], op.get("modo", "preencher"), op.get("db", -30), progresso)
            elif efeito == "separar":
                from Functions import sk_espectro
                saida, inst = sk_espectro.separar(arq, progresso)
                return {"saida": saida, "instrumental": inst, "origem": arq, "efeito": efeito}
            else:
                raise RuntimeError(f"efeito desconhecido: {efeito}")
            return {"saida": saida, "origem": arq, "efeito": efeito}
        _tarefa("skProgresso", trabalho)
        return {"success": True}

    def sk_transcrever(self, proj, idioma="pt", faixas=None):
        """Mixagem (ou só as faixas pedidas) em 16 kHz mono → reconhecimento de fala (o mesmo das legendas do Editor).
        Palavras [início, fim, texto] voltam em skProgresso({palavras})."""
        from Functions import legendas, sound_kanivete

        def trabalho(log, progresso):
            pasta = tempfile.mkdtemp(prefix="sk_texto_")
            wav = os.path.join(pasta, "mix.wav")
            progresso(1, "Preparando o áudio")
            r = sound_kanivete.exportar(proj, wav, {"formato": "wav", "sr": 16000, "mono": True, "faixas": faixas})
            if not r.get("success"):
                raise RuntimeError(r.get("error") or "não preparou o áudio")
            t = legendas.transcrever_wav(wav, r["dur"], idioma, lambda p, m: progresso(p, m))
            shutil.rmtree(pasta, ignore_errors=True)
            if not t.get("success"):
                raise RuntimeError("transcrição cancelada")
            return {"palavras": t["palavras"], "efeito": "transcrever", "segundos": t["segundos"]}
        _tarefa("skProgresso", trabalho)
        return {"success": True}

    def sk_lufs(self, arq, de=0, dur=None):
        from Functions import sound_kanivete
        return sound_kanivete.lufs_trecho(arq, de, dur)

    def sk_silencios(self, arq, de=0, dur=None, limiar=-40, minimo=0.6):
        from Functions import sound_kanivete
        return sound_kanivete.silencios(arq, de, dur, limiar, minimo)

    def sk_pasta_padrao(self):
        """Documentos/Sound Kanivete (mixagens para o Editor quando o projeto ainda não foi salvo)."""
        p = os.path.join(os.path.expanduser("~"), "Documents", "Sound Kanivete")
        os.makedirs(p, exist_ok=True)
        return p

    def sk_vozes(self):
        from Functions.omnivoice_tool import status
        try:
            s = status()
            from Functions import media_server
            ref = lambda v: media_server.register(v["reference_audio"]) if v.get("reference_audio") and os.path.isfile(v["reference_audio"]) else None
            return {"success": True, "instalado": bool(s.get("installed")), "vozes": [{"id": v.get("id"), "nome": v.get("name"), "dur": v.get("duration"), "ref_url": ref(v)} for v in s.get("voices") or []]}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_voz_criar(self, nome, arq, op=None):
        """Voz nova do OmniVoice a partir de um arquivo (ou do trecho de/dur dele: o clipe escolhido no Sk). Sem
        ref_text, o OmniVoice transcreve a referência sozinho. Fim em skProgresso({voz})."""
        from Functions.omnivoice_tool import create_voice
        op = op or {}

        def trabalho(log, progresso):
            fonte, pasta = arq, None
            if op.get("dur"):
                import subprocess
                from Functions.midia import ffmpeg, NO_WINDOW
                pasta = tempfile.mkdtemp(prefix="sk_voz_")
                fonte = os.path.join(pasta, "referencia.wav")
                subprocess.run([ffmpeg(), "-y", "-v", "error", "-ss", f"{float(op.get('de') or 0):.3f}", "-t", f"{min(30.0, float(op['dur'])):.3f}", "-i", arq,
                                "-vn", "-ac", "1", "-ar", "24000", fonte], capture_output=True, timeout=120, creationflags=NO_WINDOW)
            try:
                r = create_voice(nome, fonte, op.get("ref_text") or "", {"reference_treatment": op.get("tratar", True)}, callback_log=log, callback_progresso=progresso)
            finally:
                if pasta:
                    shutil.rmtree(pasta, ignore_errors=True)
            return {"voz": r.get("voice"), "efeito": "criar_voz"}
        _tarefa("skProgresso", trabalho)
        return {"success": True}

    def sk_banco(self, acao="estado", vid=None):
        """Banco de vozes desenhadas (Functions/sk_banco_vozes.py): estado | baixar | adicionar (os dois últimos em
        thread, fim em skProgresso)."""
        from Functions import sk_banco_vozes as b
        try:
            if acao == "estado":
                return b.estado()
            if acao == "baixar":
                _tarefa("skProgresso", lambda log, prog: {"banco": b.baixar(prog), "efeito": "banco"})
            elif acao == "adicionar":
                _tarefa("skProgresso", lambda log, prog: {"voz": b.adicionar(vid, log, prog).get("voice"), "efeito": "banco_add"})
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_voz_desenhar(self, instruct, seed=0, texto=None):
        """Amostra de voz DESENHADA (gênero/idade/tom, sem referência) → skProgresso({saida, texto, seed})."""
        from Functions import omnivoice_tool as o

        def trabalho(log, progresso):
            pasta = os.path.join(o._tmp_dir(), "desenho")
            saida = os.path.join(pasta, f"desenho_{int(seed)}_{abs(hash(instruct)) % 10 ** 6}.wav")
            o.design_reference(instruct, saida, int(seed), texto or o.TEXTO_DESENHO, "pt", log, progresso)
            return {"saida": saida, "texto": texto or o.TEXTO_DESENHO, "seed": int(seed), "efeito": "desenho"}
        _tarefa("skProgresso", trabalho)
        return {"success": True}

    def sk_voz_apagar(self, voz_id):
        from Functions.omnivoice_tool import delete_voice
        try:
            return delete_voice(voz_id)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def sk_voz(self, voz_id, texto, op=None):
        """Fala por IA (OmniVoice) com uma voz salva; o .wav volta em skProgresso({saida}) e entra na timeline."""
        from Functions.omnivoice_tool import synthesize

        def trabalho(log, progresso):
            r = synthesize(voz_id, texto, op or {}, callback_log=log, callback_progresso=progresso)
            return {"saida": r.get("output_path") or r.get("path"), "efeito": "voz"}
        _tarefa("skProgresso", trabalho)
        return {"success": True}

    def sk_dialogo(self, modo, tipos=None, nome=""):
        """abrir | abrir_varios | salvar (tipos: filtros do pywebview, só letras/espaços na descrição)."""
        if not _window:
            return None
        import webview
        tipos = tuple(tipos or ("Todos (*.*)",))
        try:
            if modo == "salvar":
                r = _window.create_file_dialog(webview.SAVE_DIALOG, save_filename=nome or "Sem titulo.sknv", file_types=tipos)
            else:
                r = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=modo == "abrir_varios", file_types=tipos)
        except ValueError:
            r = _window.create_file_dialog(webview.SAVE_DIALOG if modo == "salvar" else webview.OPEN_DIALOG, allow_multiple=modo == "abrir_varios")
        if not r:
            return None
        if modo == "abrir_varios":
            return list(r)
        return r if isinstance(r, str) else r[0]

    def vk_illustrator_disponivel(self):
        from Functions import ponte_illustrator
        return ponte_illustrator.disponivel()

    def vk_exportar_ai_nativo(self, doc_py, path, opcoes=None):
        from Functions import ponte_illustrator
        try:
            return ponte_illustrator.exportar(doc_py, path, opcoes or {})
        except Exception as e:
            import traceback
            return {"success": False, "error": str(e), "trace": traceback.format_exc()[-1200:]}

    def vk_exportar_eps(self, doc_py, path, opcoes):
        from Functions import vetor_saida
        try:
            return vetor_saida.exportar_eps(doc_py, path, opcoes)
        except Exception as e:
            import traceback
            return {"success": False, "error": str(e), "trace": traceback.format_exc()[-1200:]}

    def vk_fonte_eixos(self, fam, estilo="Regular"):
        from Functions import vetor_kanivete
        return vetor_kanivete.fonte_eixos(fam, estilo)

    def vk_recarregar(self, prefixo="Functions."):
        """Modo agente: recarrega os módulos Python (Functions.*) sem reiniciar o app — a ponte importa dentro de cada
        função, então a próxima chamada já usa o código novo. Servidores filhos (sd-server, gs) não são tocados."""
        import importlib, sys as _sys
        feitos, erros = [], []
        # gerador_imagem guarda processo filho na GPU; media_server guarda o registro das mídias abertas (recarregar
        # deixava todas as prévias do projeto aberto sem endereço)
        vivos = {"Functions.gerador_imagem", "Functions.media_server"}
        for nome in sorted(n for n in list(_sys.modules) if n.startswith(prefixo) and _sys.modules[n] is not None and (n not in vivos or n == prefixo)):
            try:
                importlib.reload(_sys.modules[nome]); feitos.append(nome)
            except Exception as e:
                erros.append(f"{nome}: {e}")
        return {"success": not erros, "recarregados": len(feitos), "erros": erros}

    def vk_abrir(self, path):
        from Functions import vetor_kanivete
        try:
            return vetor_kanivete.abrir(path)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def vk_salvar(self, doc, path):
        from Functions import vetor_kanivete
        return vetor_kanivete.salvar(doc, path)

    def vk_texto_geometria(self, spec):
        from Functions import vetor_kanivete
        return vetor_kanivete.texto_geometria(spec)

    def vk_icone(self, nome, estilo="outline"):
        from Functions import vetor_kanivete
        return vetor_kanivete.icone_svg(nome, estilo)

    def vk_vetorizar(self, arquivo, cores=6, area_min=12, ignorar_fundo=True):
        from Functions import vetor_kanivete
        return vetor_kanivete.vetorizar(arquivo, cores, area_min, ignorar_fundo)

    # Cena 3D do Editor (frontend/js/editor-3d.js + Functions/cena3d.py): quadros do three.js → .mov ProRes 4444 com alfa
    def ve_c3d_inicio(self, base, h):
        from Functions import cena3d
        return cena3d.inicio(base, h)

    def ve_c3d_lote(self, sessao, pasta):
        from Functions import cena3d
        return cena3d.lote(sessao, pasta)

    def ve_c3d_fim(self, base, h, sessao, pasta, fps, n):
        from Functions import cena3d
        try:
            return cena3d.fim(base, h, sessao, pasta, fps, n)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ve_c3d_pasta(self, base):
        from Functions import cena3d
        return cena3d.pasta_vetor(base)

    def ve_3d_url(self, caminho):
        from Functions import cena3d
        return cena3d.url(caminho)

    def vk_blender_estado(self):
        from Functions import blender_render
        e = blender_render.estado()
        e["cache"] = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "CaniveteDoPailer", "blender")
        return e

    def vk_blender_instalar(self):
        from Functions import blender_render
        return blender_render.instalar(lambda d: _js("vkBlenderProgresso", d), esperar=True)

    def vk_blender_render(self, cena):
        from Functions import blender_render
        try:
            return blender_render.render(cena, lambda d: _js("vkBlenderProgresso", d))
        except Exception as e:
            import traceback
            return {"success": False, "error": str(e), "log": traceback.format_exc().splitlines()[-4:]}

    def vk_ler_texto(self, caminho):
        """Arquivo de texto (marca.json, CSS, HTML de cena) → {success, texto}; até 4 MB."""
        try:
            if os.path.getsize(caminho) > 4_000_000:
                return {"success": False, "error": "arquivo grande demais"}
            with open(caminho, encoding="utf-8-sig") as f:
                return {"success": True, "texto": f.read()}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def vk_ler_csv(self, caminho):
        from Functions import vetor_kanivete
        try:
            return vetor_kanivete.ler_csv(caminho)
        except Exception as e:
            return {"success": False, "error": f"não leu o CSV: {e}"}

    def vk_juntar_pdfs(self, lista, saida, padrao="x4"):
        from Functions import vetor_kanivete
        return vetor_kanivete.juntar_pdfs(lista, saida, padrao)

    def vk_ampliar(self, arquivo, escala=2, tipo="foto"):
        from Functions import ampliar_imagem
        try:
            return ampliar_imagem.ampliar(arquivo, escala, tipo)
        except Exception as e:
            return {"success": False, "error": f"não ampliou: {e}"}

    def vk_registrar_fontes(self, lista):
        from Functions import vetor_kanivete
        return vetor_kanivete.registrar_fontes(lista)

    def vk_autosalvar(self, doc, meta=None):
        from Functions import vetor_kanivete
        return vetor_kanivete.autosalvar(doc, meta)

    def vk_recuperaveis(self):
        from Functions import vetor_kanivete
        return vetor_kanivete.recuperaveis()

    def vk_recuperar(self, uid):
        from Functions import vetor_kanivete
        return vetor_kanivete.recuperar(uid)

    def vk_descartar_recuperacao(self, uid):
        from Functions import vetor_kanivete
        return vetor_kanivete.descartar_recuperacao(uid)

    def vk_bibliotecas_cor(self):
        from Functions import vetor_kanivete
        return vetor_kanivete.bibliotecas_cor()

    def vk_ler_biblioteca(self, arquivo, cond="FOGRA39"):
        from Functions import vetor_kanivete
        try:
            return vetor_kanivete.ler_biblioteca(arquivo, cond)
        except Exception as e:
            return {"success": False, "error": f"não leu a biblioteca: {e}"}

    def vk_qr(self, texto, correcao="M"):
        from Functions import vetor_kanivete
        return vetor_kanivete.qr_matriz(texto, correcao)

    def vk_fonte_glifos(self, fam, estilo="Regular"):
        from Functions import vetor_kanivete
        return vetor_kanivete.fonte_glifos(fam, estilo)

    def vk_exportar_fonte(self, spec):
        from Functions import vetor_fonte
        try:
            return vetor_fonte.exportar(spec)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def vk_booleana(self, op, formas):
        from Functions import vetor_kanivete
        return vetor_kanivete.booleana(op, formas)

    def vk_deslocar(self, formas, dist, junc="miter", miter=4):
        from Functions import vetor_kanivete
        return vetor_kanivete.deslocar(formas, dist, junc, miter)

    def vk_contornar_traco(self, formas):
        from Functions import vetor_kanivete
        return vetor_kanivete.contornar_traco(formas)

    def vk_regioes(self, formas):
        from Functions import vetor_kanivete
        return vetor_kanivete.regioes(formas)

    def vk_faca(self, formas, linha):
        from Functions import vetor_kanivete
        return vetor_kanivete.faca(formas, linha)

    def vk_canais_imagem(self, path, mascara=None, cond="FOGRA39"):
        from Functions import vetor_kanivete
        try:
            return vetor_kanivete.canais_imagem(path, mascara, cond)
        except Exception as e:
            return {"erro": str(e)}

    def vk_empacotar(self, doc, pasta, opcoes=None):
        from Functions import vetor_kanivete
        try:
            return vetor_kanivete.empacotar(doc, pasta, opcoes)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def vk_cores_tela(self, lista, cond="FOGRA39"):
        from Functions import vetor_kanivete
        return vetor_kanivete.cores_tela(lista, cond)

    def vk_rgb_para_cmyk(self, lista, cond="FOGRA39"):
        from Functions import vetor_kanivete
        return vetor_kanivete.rgb_para_cmyk(lista, cond)

    def vk_imagem_info(self, path):
        from Functions import vetor_kanivete
        return vetor_kanivete.imagem_info(path)

    def vk_vinculos_estado(self, lista):
        from Functions import vetor_kanivete
        return vetor_kanivete.vinculos_estado(lista)

    def vk_salvar_png(self, dados, path):
        from Functions import vetor_kanivete
        return vetor_kanivete.salvar_png(dados, path)

    def vk_perfis(self):
        from Functions import vetor_kanivete
        return vetor_kanivete.perfis_disponiveis()

    def vk_exportar_pdf(self, doc, path, opcoes):
        from Functions import vetor_exportar
        try:
            return vetor_exportar.exportar_pdf(doc, path, opcoes)
        except Exception as e:
            import traceback
            return {"success": False, "error": str(e), "trace": traceback.format_exc()[-1500:]}

    def vk_dialogo(self, modo, tipos=None, nome=""):
        """Janela nativa de abrir/salvar do Vetor Kanivete. modo: abrir | salvar | pasta."""
        if not _window:
            return None
        import webview
        if modo == "pasta":
            r = _window.create_file_dialog(webview.FOLDER_DIALOG)
        elif modo == "salvar":
            r = _window.create_file_dialog(webview.SAVE_DIALOG, save_filename=nome or "Sem titulo.aknv", file_types=tuple(tipos or ()))
        else:
            r = _window.create_file_dialog(webview.OPEN_DIALOG, file_types=tuple(tipos or ("Arquivos vetoriais (*.aknv;*.pdf;*.ai;*.eps;*.svg;*.pptx)", "Todos (*.*)")))
        if not r:
            return None
        return r if isinstance(r, str) else r[0]

    def ie_fonte_url(self, arquivo):
        """URL local de um arquivo de fonte instalado (a página carrega com FontFace: o nome GDI de 31 letras
        e famílias tipográficas não batem com o CSS). Só serve arquivos das pastas de fontes do Windows."""
        from Functions import fontes, media_server
        try:
            p = os.path.abspath(arquivo or "")
            if not os.path.isfile(p) or not any(os.path.normcase(p).startswith(os.path.normcase(os.path.abspath(d)) + os.sep)
                                                 for d in fontes._pastas()):
                return {"success": False}
            return {"success": True, "url": media_server.register(p)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ve_render_tocar(self, base, chave, hashes):
        return ve_render_tocar(base, chave, hashes)

    def ve_render_mover(self, base, chave_antiga, chave_nova):
        return ve_render_mover(base, chave_antiga, chave_nova)

    def ve_render_limpar(self, base, chave=None):
        return ve_render_limpar(base, chave)

    def ve_render_manutencao(self, base, max_gb=20, dias=30):
        return ve_render_manutencao(base, max_gb, dias)

    def ve_render_info(self, base, chave=None):
        return ve_render_info(base, chave)

    def video_cutter_cancel_export(self):
        return video_cutter_cancel_export()

    def reveal_file(self, path):
        return reveal_file(path)

    def open_file(self, path):
        return open_file(path)

    def select_video_file(self, tool):
        return select_video_file(tool)

    def ve_win_rect(self, titulo):
        return ve_win_rect(titulo)

    def ve_win_hit(self, titulos, excluir=None):
        return ve_win_hit(titulos, excluir)

    def ve_win_alpha(self, titulo, opacidade=1.0):
        return ve_win_alpha(titulo, opacidade)

    def ve_win_prepare(self, titulo):
        return ve_win_prepare(titulo)

    def ve_win_place(self, titulo, x, y, w, h, maximizada=False):
        return ve_win_place(titulo, x, y, w, h, maximizada)

    def ve_layout_load(self):
        return ve_layout_load()

    def ve_layout_save(self, dados):
        return ve_layout_save(dados)

    def ve_agente_midia(self, cmd, args=None):
        """Ferramentas do agente (Functions/agente_midia.py: midias, folha, storyboard, transcrever, batidas,
        analisar) num processo à parte e de prioridade baixa: o modelo de visão não pesa no editor.
        args = lista de argumentos da linha de comando. Devolve {success, saida} (JSON ou texto do comando)."""
        import subprocess
        base = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, os.path.abspath(__file__)]
        try:
            r = subprocess.run(base + ["--agente-midia", str(cmd)] + [str(a) for a in (args or [])],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=3600,
                               creationflags=0x00004000 | 0x08000000, cwd=os.path.dirname(os.path.abspath(__file__)))
            if r.returncode != 0:
                return {"success": False, "error": (r.stderr or "").strip()[-2000:]}
            return {"success": True, "saida": r.stdout}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def ve_agente_porta(self):
        """Porta do modo agente desta abertura (Preferências → Modo desenvolvedor)."""
        return {"porta": _PORTA_AGENTE}

    def prefs_load(self):
        return prefs_load()

    def prefs_save(self, dados):
        return prefs_save(dados)

    def ve_project_save(self, path, dados, salvar_como=False, formato=None):
        return ve_project_save(path, dados, salvar_como, formato)

    def ve_premiere_ponte(self, acao, dados=None):
        return ve_premiere_ponte(acao, dados)

    def ve_project_open(self, path=None):
        return ve_project_open(path)

    def af_analisar(self, musica, itens):
        return af_analisar(musica, itens)

    def af_recomendar(self, musica, paths, dur_alvo=None, inicio_modo="inicio", manual=None):
        return af_recomendar(musica, paths, dur_alvo, inicio_modo, manual)

    def af_planejar(self, musica, paths, modelo, dur_alvo=None, ordem="inteligente", semente=0, inicio_modo="inicio", manual=None, telas=True,
                    cobrir=None, reserva=None):
        return af_planejar(musica, paths, modelo, dur_alvo, ordem, semente, inicio_modo, manual, telas, cobrir, reserva)

    def af_escolher(self, tipo):
        return af_escolher(tipo)

    # AutoFrame Customizado: modelos de cliente (Functions/autoframe_modelos.py)
    def afm_listar(self):
        from Functions import autoframe_modelos
        return autoframe_modelos.listar()

    def afm_salvar(self, modelo):
        from Functions import autoframe_modelos
        return autoframe_modelos.salvar(modelo)

    def afm_apagar(self, mid):
        from Functions import autoframe_modelos
        return autoframe_modelos.apagar(mid)

    def afm_usou(self, mid, musica_i):
        from Functions import autoframe_modelos
        return autoframe_modelos.usou(mid, musica_i)

    def afm_escolher(self, tipo):
        """tipo: 'logo' (imagem) | 'video' (intro/encerramento) | 'musicas' (várias)."""
        if not _window:
            return {"success": False}
        abrir = _file_dialog_kind("OPEN", webview.OPEN_DIALOG)
        if tipo == "logo":
            r = _window.create_file_dialog(abrir, file_types=("Imagens (*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif)", "Todos os arquivos (*.*)"))
        elif tipo == "video":
            r = _window.create_file_dialog(abrir, file_types=("Vídeos (*.mp4;*.mov;*.m4v;*.webm;*.mkv)", "Todos os arquivos (*.*)"))
        else:
            r = _window.create_file_dialog(abrir, allow_multiple=True, file_types=(
                "Música (*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.opus)", "Todos os arquivos (*.*)"))
        from Functions import media_server
        paths = list(r or [])
        return {"success": bool(paths), "itens": [{"path": p, "url": media_server.register(p)} for p in paths]}

    def ve_autosave(self, chave, nome, dados):
        return ve_autosave(chave, nome, dados)

    def ve_autosave_lista(self):
        return ve_autosave_lista()

    def ve_project_thumb(self, path):
        return ve_project_thumb(path)

    def converter_imagem(self, folder_path, output_format):
        return converter_imagem(folder_path, output_format)

    def converter_imagem_file(self, file_path, output_format):
        return converter_imagem_file(file_path, output_format)

    def video_converter(self, folder_path, output_format):
        return video_converter(folder_path, output_format)

    def video_converter_file(self, file_path, output_format):
        return video_converter_file(file_path, output_format)

    # compressors
    def compressor_imagem(self, folder_path, force_fullhd=False):
        return compressor_imagem(folder_path, force_fullhd)

    def compressor_imagem_file(self, file_path, force_fullhd=False):
        return compressor_imagem_file(file_path, force_fullhd)

    def compressor_video(self, folder_path, mode="copy", gpu="cpu", qualidade="equilibrada"):
        return compressor_video(folder_path, mode, gpu, qualidade)

    def compressor_video_file(self, file_path, mode="copy", gpu="cpu", qualidade="equilibrada"):
        return compressor_video_file(file_path, mode, gpu, qualidade)

    # media tools
    def video_downloader_info(self, url):
        return video_downloader_info(url)

    def video_downloader(self, url, destino="", formato="mp4", qualidade="compativel"):
        return video_downloader(url, destino, formato, qualidade)

    def favicon_generator(self, image_path, site_name, theme_color):
        return favicon_generator(image_path, site_name, theme_color)

    def remover_fundo(self, folder_path, modelo="isnet"):
        return remover_fundo(folder_path, modelo)

    def remover_fundo_file(self, file_path, modelo="isnet"):
        return remover_fundo_file(file_path, modelo)

    def remover_fundo_salvar(self, indices, pasta_destino):
        return remover_fundo_salvar(indices, pasta_destino)

    # organizers/transcription
    def organizador_imagens(self, folder_path, modo="completa"):
        return organizador_imagens(folder_path, modo)

    def escanear_cameras_videos(self, folder_path):
        return escanear_cameras_videos(folder_path)

    def organizador_videos(self, folder_path, operadores=None, nome_projeto_premiere=None):
        return organizador_videos(folder_path, operadores, nome_projeto_premiere)

    def transcrever_audio(self, folder_path, model, language):
        return transcrever_audio(folder_path, model, language)

    def transcrever_audio_file(self, file_path, model, language):
        return transcrever_audio_file(file_path, model, language)

    def transcrever_salvar_txt(self, texto, pasta_origem):
        return transcrever_salvar_txt(texto, pasta_origem)

    def transcrever_cena(self, folder_path):
        return transcrever_cena(folder_path)

    def melhorar_audio(self, caminho):
        return melhorar_audio(caminho)

    def melhorar_audio_midia(self, caminho, mid):
        return melhorar_audio_midia(caminho, mid)

    def melhorar_audio_cancelar(self):
        return melhorar_audio_cancelar()

    def omnivoice_status(self):
        return omnivoice_status()

    def omnivoice_download(self):
        return omnivoice_download()

    def omnivoice_create_voice(self, name, audio_path, ref_text="", options=None):
        return omnivoice_create_voice(name, audio_path, ref_text, options or {})

    def omnivoice_update_voice(self, voice_id, name, ref_text):
        return omnivoice_update_voice(voice_id, name, ref_text)

    def omnivoice_delete_voice(self, voice_id):
        return omnivoice_delete_voice(voice_id)

    def omnivoice_synthesize(self, voice_id, text, options=None):
        return omnivoice_synthesize(voice_id, text, options or {})

    def omnivoice_save_output(self, path):
        return omnivoice_save_output(path)

    # scraper
    def web_scraper_analyze(self, url):
        return web_scraper_analyze(url)

    def web_scraper_download(self, url, mode, destino):
        return web_scraper_download(url, mode, destino)

    def web_scraper(self, url, tipo, destino):
        return web_scraper(url, tipo, destino)

    def web_scraper_csv(self, url):
        return web_scraper_csv(url)

    # cerebro
    def cerebro_load(self):
        return cerebro_load()

    def cerebro_save(self, content):
        return cerebro_save(content)

    def cerebro_exists(self):
        return cerebro_exists()

    def cerebro_remove(self):
        return cerebro_remove()

    def cerebro_select_file(self):
        return cerebro_select_file()

    # gdrive
    def gdrive_check(self):
        return gdrive_check()

    def gdrive_analyze(self, url):
        return gdrive_analyze(url)

    def gdrive_dump(self, url, destino, perfil="rapida"):
        return gdrive_dump(url, destino, perfil)

    # auto-update
    def check_update(self):
        return check_update()

    def apply_update(self):
        return apply_update()

    def gdrive_pause(self):
        return gdrive_pause()

    def gdrive_resume(self):
        return gdrive_resume()

    def gdrive_cancel(self):
        return gdrive_cancel()

    def sair_app(self):
        """Ctrl+Q: fecha o app (a página já perguntou sobre o projeto não salvo)."""
        if _window:
            # fora da thread da chamada: destroy espera a interface, que está respondendo a esta chamada
            threading.Thread(target=_window.destroy, daemon=True).start()
        return {"success": True}

    def toggle_fullscreen(self):
        if _window:
            _window.toggle_fullscreen()
        return {"success": True}

    def janela_cmd(self, acao):
        """Bolinhas da barra de título da página: 'fechar' (o mesmo do X), 'maximizar' (alterna), 'minimizar'."""
        hwnd = _hwnd_principal()
        if hwnd:
            _janela_cmd(hwnd, acao)
        return {"success": bool(hwnd)}

    def janela_propria(self):
        """A página mostra a barra de título dela só se a do Windows saiu (_barra_propria)."""
        return bool(_hwnd_principal())

    def janela_ativar(self):
        """Traz a janela principal para a frente (G / Ctrl+M apertados numa janela solta: o campo do diálogo
        recebe o foco, mas o teclado só chega nele com a janela principal ativa)."""
        hwnd = _hwnd_principal()
        if hwnd:
            import ctypes
            ctypes.windll.user32.SetForegroundWindow(hwnd)
        return {"success": bool(hwnd)}


def _liberar_janelas_flutuantes():
    """Painéis soltos do editor de vídeo: window.open('') vira uma janela nossa (Form do Windows com um
    WebView2 no mesmo ambiente do app), ligada à página principal — o painel é movido para lá e dá para
    levar a outro monitor. A janela padrão de pop-up do WebView2 mostraria a barra "about:blank" e o
    título "[InPrivate]"; se a nossa falhar, ela fica de reserva. Outros window.open seguem para o navegador."""
    try:
        from webview.platforms import edgechromium
    except Exception:
        return
    original = edgechromium.EdgeChrome.on_new_window_request
    pronto_original = edgechromium.EdgeChrome.on_webview_ready

    def on_webview_ready(self, sender, args):
        pronto_original(self, sender, args)
        if args.IsSuccess:
            _ligar_tela_cheia(self.form, sender.CoreWebView2)
            _barra_propria(self.form, sender.CoreWebView2)

    edgechromium.EdgeChrome.on_webview_ready = on_webview_ready

    def on_new_window_request(self, sender, args):
        if str(args.get_Uri()) != "about:blank":
            original(self, sender, args)
            return
        try:
            _janela_solta_propria(self, sender, args)
        except Exception as e:
            print(f"[janela solta] usando a janela padrão do WebView2: {e}")

    edgechromium.EdgeChrome.on_new_window_request = on_new_window_request


_barras = {}            # hwnd -> procedimento de janela (precisa ficar vivo enquanto a janela existir)
_hwnd_principal_val = [0]


def _hwnd_principal():
    return _hwnd_principal_val[0]


def _janela_cmd(hwnd, acao):
    """Botões da barra da página, como os nativos (WM_CLOSE passa pelos mesmos avisos do X)."""
    import ctypes
    u32 = ctypes.windll.user32
    if acao == "fechar":
        u32.PostMessageW(hwnd, 0x0010, 0, 0)                                  # WM_CLOSE
    elif acao == "minimizar":
        u32.PostMessageW(hwnd, 0x0112, 0xF020, 0)                             # SC_MINIMIZE
    elif acao == "maximizar":
        u32.PostMessageW(hwnd, 0x0112, 0xF120 if u32.IsZoomed(hwnd) else 0xF030, 0)   # SC_RESTORE / SC_MAXIMIZE


def _barra_propria(form, core, principal=True):
    """Sem a barra de título do Windows: a página desenha a dela (bolinhas e área de arrastar com CSS
    app-region: drag). Arrastar, Aero Snap, duplo clique para maximizar, sombra e as bordas de redimensionar
    continuam nativos: WM_NCCALCSIZE só devolve à área cliente a faixa da legenda. Falhou: fica a barra nativa."""
    try:
        import ctypes
        from ctypes import wintypes
        u32 = ctypes.windll.user32
        WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wintypes.HWND, ctypes.c_uint, wintypes.WPARAM, wintypes.LPARAM)
        u32.SetWindowLongPtrW.restype = ctypes.c_void_p
        u32.SetWindowLongPtrW.argtypes = (wintypes.HWND, ctypes.c_int, ctypes.c_void_p)
        u32.CallWindowProcW.restype = ctypes.c_ssize_t
        u32.CallWindowProcW.argtypes = (ctypes.c_void_p, wintypes.HWND, ctypes.c_uint, wintypes.WPARAM, wintypes.LPARAM)
        u32.GetWindowLongW.argtypes = (wintypes.HWND, ctypes.c_int)

        core.Settings.IsNonClientRegionSupportEnabled = True
        hwnd = int(form.Handle.ToInt64())
        anterior = [0]

        def proc(h, msg, wp, lp):
            if msg == 0x0083 and wp:                                          # WM_NCCALCSIZE
                r = ctypes.cast(lp, ctypes.POINTER(wintypes.RECT)).contents
                topo = r.top
                res = u32.CallWindowProcW(anterior[0], h, msg, wp, lp)
                if u32.GetWindowLongW(h, -16) & 0x00C00000:                     # WS_CAPTION (sem borda: tela cheia)
                    r.top = topo
                    if u32.IsZoomed(h):                                        # maximizada passa da tela pela borda
                        dpi = u32.GetDpiForWindow(h)
                        r.top += u32.GetSystemMetricsForDpi(33, dpi) + u32.GetSystemMetricsForDpi(92, dpi)
                return res
            return u32.CallWindowProcW(anterior[0], h, msg, wp, lp)

        cb = WNDPROC(proc)
        _barras[hwnd] = cb
        anterior[0] = u32.SetWindowLongPtrW(hwnd, -4, ctypes.cast(cb, ctypes.c_void_p))   # GWLP_WNDPROC
        u32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027)   # SWP_FRAMECHANGED|NOMOVE|NOSIZE|NOZORDER
        form.Disposed += lambda *_: _barras.pop(hwnd, None)
        if principal:
            _hwnd_principal_val[0] = hwnd
        return hwnd
    except Exception as exc:
        print("[barra de título] mantendo a nativa:", exc)
        return 0


def _ligar_tela_cheia(form, core):
    """requestFullscreen() na página (Alt+Enter no editor): sem isso o WebView2 só ocupa a área da janela.
    Enquanto houver um elemento em tela cheia a janela fica sem borda e maximizada (cobre a barra de tarefas);
    ao sair, volta como estava."""
    try:
        from System.Windows.Forms import FormBorderStyle, FormWindowState
        sem_borda = getattr(FormBorderStyle, "None")   # "None" é palavra reservada no Python
        antes = {}

        def mudou(c, _):
            try:
                if c.ContainsFullScreenElement:
                    antes.update(borda=form.FormBorderStyle, estado=form.WindowState)
                    form.WindowState = FormWindowState.Normal   # maximizar de novo já sem borda
                    form.FormBorderStyle = sem_borda
                    form.WindowState = FormWindowState.Maximized
                elif antes:
                    form.FormBorderStyle = antes.pop("borda")
                    form.WindowState = antes.pop("estado")
            except Exception as exc:
                print("[tela cheia] erro:", exc)

        core.ContainsFullScreenElementChanged += mudou
    except Exception as exc:
        print("[tela cheia] indisponível:", exc)


def _janela_solta_propria(chrome, sender, args):
    from webview.platforms import edgechromium as ec
    WinForms = ec.WinForms
    from System.Drawing import Color, Point, Size

    adiado = args.GetDeferral()
    form = WinForms.Form()
    form.Text = "Editor Kanivete"
    form.BackColor = Color.FromArgb(255, 8, 8, 8)
    try:
        form.Icon = chrome.form.Icon
    except Exception:
        pass
    form.Owner = chrome.form            # sempre acima da principal (como as flutuantes do Premiere)
    form.ShowInTaskbar = False
    feats = args.WindowFeatures
    if feats.HasPosition:
        form.StartPosition = WinForms.FormStartPosition.Manual
        form.Location = Point(int(feats.Left), int(feats.Top))
    if feats.HasSize:
        form.ClientSize = Size(int(feats.Width), int(feats.Height))

    wv = ec.WebView2()
    wv.CreationProperties = chrome.webview.CreationProperties   # mesma pasta de dados e modo privado
    wv.DefaultBackgroundColor = Color.FromArgb(255, 8, 8, 8)
    wv.Dock = WinForms.DockStyle.Fill
    form.Controls.Add(wv)

    # Arquivos do Windows soltos na janela solta: o drop dela (editor-dock.js) manda os File por
    # postMessageWithAdditionalObjects e o WebView2 entrega o caminho real (como o pywebview faz na principal)
    hwnd = [0]

    def _mensagem(c, e):
        try:
            msg = e.TryGetWebMessageAsString()
            if msg.startswith("ve-janela:"):          # bolinhas da barra da janela solta
                if hwnd[0]:
                    _janela_cmd(hwnd[0], msg.split(":", 1)[1])
                return
            if msg != "ve-drop":
                return
            objs = e.get_AdditionalObjects()
            caminhos = [{"path": str(f.Path), "pasta": os.path.isdir(str(f.Path))}
                        for f in list(objs or []) if getattr(f, "Path", None)]
            if caminhos and _window:
                # este evento roda na thread da interface; evaluate_js esperaria por ela mesma (trava o app)
                js = f"onArquivosSoltos({json.dumps(caminhos, ensure_ascii=False)})"
                threading.Thread(target=_window.evaluate_js, args=(js,), daemon=True).start()
        except Exception as exc:
            print("[janela solta drop] erro:", exc)

    def pronto(s, e):
        try:
            if e.IsSuccess:
                core = wv.CoreWebView2
                args.NewWindow = core
                core.DocumentTitleChanged += lambda c, _: setattr(form, "Text", str(c.DocumentTitle))
                core.WindowCloseRequested += lambda c, _: form.Close()
                core.WebMessageReceived += _mensagem
                hwnd[0] = _barra_propria(form, core, principal=False)
                _ligar_tela_cheia(form, core)
                st = core.Settings
                st.AreDefaultContextMenusEnabled = False
                st.AreBrowserAcceleratorKeysEnabled = False
                st.IsStatusBarEnabled = False
        finally:
            adiado.Complete()

    wv.CoreWebView2InitializationCompleted += pronto
    form.Show()
    wv.EnsureCoreWebView2Async(sender.Environment)


def _porta_agente():
    """Porta do modo agente (None = desligado). Aceita --agente, --agente=PORTA ou CANIVETE_AGENTE_PORTA."""
    valor = os.environ.get("CANIVETE_AGENTE_PORTA")
    for arg in sys.argv[1:]:
        if arg == "--agente":
            valor = valor or "9222"
        elif arg.startswith("--agente="):
            valor = arg.split("=", 1)[1]
    try:
        porta = int(valor) if valor else None
    except ValueError:
        return None
    return porta if porta and 1024 <= porta <= 65535 else None


_PORTA_AGENTE = None   # porta do modo agente desta abertura (None = desligado)


def _agente_nas_preferencias():
    """Modo agente ligado nas Preferências (Modo desenvolvedor → "Permitir que o Claude controle a janela"): toda
    abertura liga a porta, na primeira livre de 9222 a 9231 (uma segunda cópia do app pega a seguinte)."""
    try:
        with open(_prefs_path(), "r", encoding="utf-8") as f:
            d = json.load(f) or {}
    except Exception:
        return None
    if not (d.get("dev") and d.get("agente")):
        return None
    import socket
    for porta in range(9222, 9232):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.bind(("127.0.0.1", porta))
            return porta
        except OSError:
            continue
        finally:
            s.close()
    return None


def _agente_arquivo():
    """%APPDATA%/CaniveteDoPailer/agente.json: as cópias abertas com o modo agente ligado ({porta, pid, inicio})."""
    return os.path.join(os.path.dirname(_prefs_path()), "agente.json")


def _pid_vivo(pid):
    try:
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, int(pid))   # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        codigo = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(codigo))
        ctypes.windll.kernel32.CloseHandle(h)
        return codigo.value == 259   # STILL_ACTIVE
    except Exception:
        return False


def _agente_registrar(porta, sair=False):
    """Anota (ou tira, ao fechar) esta cópia em agente.json: o agente acha a porta sem varrer 9222–9231.
    Entradas de cópias que já fecharam saem na hora."""
    import time
    arq = _agente_arquivo()
    try:
        with open(arq, "r", encoding="utf-8") as f:
            lista = (json.load(f) or {}).get("instancias") or []
    except Exception:
        lista = []
    lista = [x for x in lista if isinstance(x, dict) and x.get("pid") != os.getpid() and _pid_vivo(x.get("pid", 0))]
    if not sair:
        lista.append({"porta": porta, "pid": os.getpid(), "inicio": time.strftime("%Y-%m-%d %H:%M:%S"),
                      "codigo": not getattr(sys, "frozen", False)})
    try:
        os.makedirs(os.path.dirname(arq), exist_ok=True)
        tmp = arq + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"instancias": lista}, f, ensure_ascii=False, indent=1)
        os.replace(tmp, arq)
    except Exception:
        pass


def _abrir_em_outra_copia():
    """App (.exe) já aberto: manda o projeto do duplo clique para ele e esta cópia não abre (senão ficavam dois
    ícones na barra e duas cópias disputando as prévias). Pelo código (python main.py) e no modo agente abre sempre.
    Devolve True se entregou o pedido; None se esta é a primeira cópia (e deve escutar as próximas)."""
    if not getattr(sys, "frozen", False) or _porta_agente():
        return False
    try:
        from Functions import instancia_unica, projeto
        if not instancia_unica.ja_aberta():
            return None
        return instancia_unica.enviar({"projeto": projeto.projeto_na_linha_de_comando()})
    except Exception as e:
        print("[instância] seguindo com uma cópia nova:", e)
        return False


def _receber_de_outra_copia(pedido):
    """Pedido de uma cópia aberta depois: traz a janela para a frente e abre o projeto dela."""
    if not _window:
        return
    if os.name == "nt":
        import ctypes
        hwnd = _janela_principal()
        if hwnd:
            u = ctypes.windll.user32
            if u.IsIconic(hwnd):
                u.ShowWindow(hwnd, 9)   # SW_RESTORE
            u.SetForegroundWindow(hwnd)
    if pedido.get("projeto"):
        _window.evaluate_js(f"abrirProjetoExterno({json.dumps(pedido['projeto'])})")


def main():
    global webview

    primeira_copia = _abrir_em_outra_copia()
    if primeira_copia:
        return

    from startup_diagnostics import (
        format_webview_import_error,
        preflight_problem,
        show_startup_error,
    )

    problem = preflight_problem()
    if problem:
        show_startup_error(*problem)
        return

    try:
        import webview as _webview
        webview = _webview
    except Exception as e:
        show_startup_error(
            "Falha ao carregar a interface do KANIVETE",
            format_webview_import_error(e),
        )
        return

    # Primeiro uso: verifica e instala dependências se necessário
    from first_run import precisa_instalar, executar_instalacao
    if precisa_instalar():
        executar_instalacao()

    # Cria API com métodos explícitos
    api = ApiBridge()
    
    # IMPORTANTE: Definir o diretório base para carregar o index.html de forma estável
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        bundle_dir = getattr(sys, "_MEIPASS", exe_dir)
        base_dir = exe_dir if os.path.exists(os.path.join(exe_dir, "frontend", "index.html")) else bundle_dir
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(base_dir, "frontend", "index.html")

    # Carrega geometria salva da sessão anterior
    _state_path = os.path.join(base_dir, "window_state.json")

    def _load_window_state():
        try:
            with open(_state_path, "r", encoding="utf-8") as f:
                import json as _json
                s = _json.load(f)
            return (
                int(s.get("width",  1200)),
                int(s.get("height",  800)),
                s.get("x"),
                s.get("y"),
            )
        except Exception:
            return 1200, 800, None, None

    def _save_window_state(win):
        try:
            import json as _json
            with open(_state_path, "w", encoding="utf-8") as f:
                _json.dump({
                    "width":  win.width,
                    "height": win.height,
                    "x":      win.x,
                    "y":      win.y,
                }, f)
        except Exception:
            pass

    _w, _h, _x, _y = _load_window_state()

    # Criar a janela ANTES de qualquer operação que use Tcl/Tkinter residual
    _create_kwargs = dict(
        title="KANIVETE",
        url=html_path,
        js_api=api,
        width=_w,
        height=_h,
        min_size=(1000, 600),
        maximized=True,   # abre ocupando a tela; F11 alterna tela cheia
    )
    if _x is not None and _y is not None:
        _create_kwargs["x"] = _x
        _create_kwargs["y"] = _y

    window = webview.create_window(**_create_kwargs)

    _set_window(window)

    def _on_window_closed():
        _save_window_state(window)
        gdrive_cancel()

    window.events.closed += _on_window_closed

    def _bind_drop():
        """Arrastar arquivos/pastas para qualquer ferramenta (pywebview entrega o caminho real)."""
        try:
            from webview.dom import DOMEventHandler

            def _on_drop(e):
                files = (e.get("dataTransfer") or {}).get("files") or []
                caminhos = [{"path": p, "pasta": os.path.isdir(p)}
                            for p in (f.get("pywebviewFullPath") for f in files) if p]
                if caminhos:
                    window.evaluate_js(f"onArquivosSoltos({json.dumps(caminhos)})")

            window.dom.document.events.drop += DOMEventHandler(_on_drop, True, True)
        except Exception as e:
            print("[drop] indisponível:", e)

    window.events.loaded += _bind_drop

    # Projeto aberto por duplo clique: .vknv/.vcnvt vai para o editor de vídeo, .iknv para o de imagem
    from Functions import projeto as _projeto
    _projeto.registrar_associacao()
    _proj_arg = _projeto.projeto_na_linha_de_comando()
    if _proj_arg:
        def _abrir_projeto_arg():
            try:
                window.evaluate_js(f"abrirProjetoExterno({json.dumps(_proj_arg)})")
            except Exception as e:
                print("[projeto] não abriu:", e)
        window.events.loaded += _abrir_projeto_arg
    atexit.register(gdrive_cancel)
    if primeira_copia is None:
        from Functions import instancia_unica
        instancia_unica.escutar(_receber_de_outra_copia)

    def _splash_sound():
        try:
            import winsound
            sound_path = os.path.join(base_dir, "identidade", "sound", "splash.wav")
            if os.path.exists(sound_path):
                winsound.PlaySound(sound_path, winsound.SND_FILENAME | winsound.SND_ASYNC)
        except Exception:
            pass

    # Modo agente (opcional): abre a porta de depuração do WebView2 (Chrome DevTools Protocol) só em
    # 127.0.0.1, para um agente de IA/automação ver e usar o painel (ex.: Playwright connect_over_cdp).
    # Liga com:  CaniveteDoPailer.exe --agente   (porta 9222)  ou  --agente=9333
    # ou com a variável de ambiente CANIVETE_AGENTE_PORTA=9222. Desligado por padrão.
    global _PORTA_AGENTE
    porta_agente = _porta_agente() or _agente_nas_preferencias()
    _PORTA_AGENTE = porta_agente
    if porta_agente:
        webview.settings["REMOTE_DEBUGGING_PORT"] = porta_agente
        print(f"[agente] depuração remota em http://127.0.0.1:{porta_agente}")
        _agente_registrar(porta_agente)   # agente.json: o agente acha esta cópia direto
        atexit.register(lambda: _agente_registrar(porta_agente, sair=True))

    # O servidor local do pywebview aceita só 5 conexões na fila (padrão do Python): ao abrir, a página
    # pede ~15 arquivos de uma vez e o Windows recusa o resto — um script do editor ficava sem carregar
    from wsgiref.simple_server import WSGIServer
    WSGIServer.request_queue_size = 128

    _liberar_janelas_flutuantes()
    webview.start(_splash_sound, debug=False)
    
    # Ao fechar
    _cleanup_temp_thumbs()
    return


if __name__ == "__main__":
    # ferramentas do agente pela linha de comando (também no exe): CaniveteDoPailer.exe --agente-midia analisar ...
    if len(sys.argv) > 1 and sys.argv[1] == "--agente-midia":
        from Functions import agente_midia
        agente_midia.main(sys.argv[2:])
        sys.exit(0)
    main()
