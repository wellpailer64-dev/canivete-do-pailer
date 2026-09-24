"""
main.py - Canivete do Pailer
Versão completa com todas as funções da API
"""
import os
import json
import sys
import threading
import atexit
from concurrent.futures import ThreadPoolExecutor, as_completed

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
def converter_audio(folder_path, output_format):
    from Functions.convertermp3 import converter_pasta as converter_audio_pasta
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateConverterAudioProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        converter_audio_pasta(folder_path, output_format, callback_log=log)
        
        if _window:
            _window.evaluate_js("updateConverterAudioProgress({complete: true})")
            os.startfile(folder_path)
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def converter_audio_file(file_path, output_format):
    """Converte um único arquivo de áudio usando a mesma rotina do módulo."""
    from Functions.convertermp3 import converter_arquivo as converter_audio_arquivo

    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateConverterAudioProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        converter_audio_arquivo(file_path, output_format, callback_log=log)

        if _window:
            _window.evaluate_js("updateConverterAudioProgress({complete: true})")
            os.startfile(os.path.dirname(file_path) or os.getcwd())

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


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


def video_cutter_export(file_path, segments, output_format="mp4", qualidade="medium",
                        resolucao="original", usar_gpu=True, pasta_saida=None, sem_audio=False):
    """Exporta os trechos mantidos; progresso em veOnExport(evento)."""
    from Functions.video_cutter import exportar_video
    global _ve_export_stop
    stop = threading.Event()
    _ve_export_stop = stop

    def run():
        try:
            r = exportar_video(
                file_path, segments, output_format, qualidade, resolucao, bool(usar_gpu),
                pasta_saida or None,
                on_progress=lambda p, m: _ve_emit("veOnExport", {"pct": p, "message": m}),
                stop_event=stop,
                sem_audio=bool(sem_audio),
            )
            _ve_emit("veOnExport", {"done": True, **r})
        except Exception as e:
            _ve_emit("veOnExport", {"done": True, "success": False, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def video_cutter_cancel_export():
    from Functions.video_cutter import cancelar_exportacao
    if _ve_export_stop is not None:
        _ve_export_stop.set()
    cancelar_exportacao()
    return {"success": True}


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


def open_file(path):
    try:
        os.startfile(path)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def select_video_file(tool):
    if _window:
        file_types = (
            "Vídeos (*.mp4;*.mov;*.mkv;*.avi;*.webm;*.flv;*.wmv;*.m4v;*.ts;*.mts;*.m2ts;*.3gp;*.mpg;*.mpeg)",
            "Todos os arquivos (*.*)",
        )
        result = _window.create_file_dialog(
            _file_dialog_kind("OPEN", webview.OPEN_DIALOG), file_types=file_types
        )
        if result:
            file_path = result[0] if isinstance(result, (list, tuple)) else result
            return {"success": True, "path": file_path}
    return {"success": False}


# ========================================
# Tools: converter imagem
# ========================================
def converter_imagem(folder_path, output_format):
    from Functions.converterimagem import converter_pasta as converter_imagem_pasta
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateConverterImagemProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        converter_imagem_pasta(folder_path, output_format, callback_log=log)
        
        if _window:
            _window.evaluate_js("updateConverterImagemProgress({complete: true})")
            os.startfile(folder_path)
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def converter_imagem_file(file_path, output_format):
    """Converte um único arquivo de imagem (fallback para a pasta do arquivo)."""
    return converter_imagem(os.path.dirname(file_path) or os.getcwd(), output_format)


# ========================================
# Tools: favicon
# ========================================
def favicon_generator(image_path, site_name, theme_color):
    from Functions.faviconconverter import gerar_favicon
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateFaviconProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        def progress(pct, status):
            if _window:
                try:
                    _window.evaluate_js(f"updateFaviconProgress({{percent: {int(pct)}, log: '{_safe_msg(status)}'}})")
                except:
                    pass
        
        try:
            resultado = gerar_favicon(image_path, nome_site=site_name, cor_tema=theme_color, callback_log=log, callback_progresso=progress)
            
            if _window:
                # Chama o JS indicando completo para tocar o som
                _window.evaluate_js("updateFaviconProgress({complete: true})")
                if resultado.get("sucesso"):
                    if resultado.get("pasta"):
                        os.startfile(resultado["pasta"])
        except Exception as e:
            import traceback
            err_msg = str(e)
            full_error = traceback.format_exc()
            log(f"Erro ao gerar favicon: {err_msg}")
            # Log de emergência
            try:
                with open(os.path.join(os.getcwd(), "erro_favicon.txt"), "w") as f:
                    f.write(full_error)
            except: pass
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ========================================
# Tools: compressor imagem
# ========================================
def compressor_imagem(folder_path, force_fullhd=False):
    from Functions.compressor_imagem import listar_arquivos, comprimir_lista as comprimir_imagem_lista
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateCompressorImagemProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        arquivos = listar_arquivos(folder_path)
        if not arquivos:
            log("Nenhum arquivo de imagem/PDF encontrado.")
            if _window:
                _window.evaluate_js("updateCompressorImagemProgress({complete: true})")
            return

        def progresso(pct, status):
            if _window:
                try:
                    _window.evaluate_js(
                        f"updateCompressorImagemProgress({{percent: {pct}, log: '{_safe_msg(status)}'}})"
                    )
                except Exception:
                    pass

        pasta_saida = os.path.join(folder_path, "comprimidas")
        
        try:
            resultado = comprimir_imagem_lista(
                arquivos,
                pasta_saida,
                manter_original=True,
                callback_log=log,
                callback_progresso=progresso,
                force_fullhd=bool(force_fullhd),
            )
            log(
                f"Concluido: {resultado.get('ok', 0)}/{resultado.get('total', 0)} comprimidos | "
                f"{resultado.get('mantidos', 0)} mantidos | "
                f"{resultado.get('redimensionados', 0)} FullHD | "
                f"Reducao: {resultado.get('reducao_pct', 0):.1f}%"
            )
        except Exception as e:
            log(f"Erro: {e}")
        
        if _window:
            _window.evaluate_js("updateCompressorImagemProgress({complete: true})")
            if os.path.exists(pasta_saida):
                os.startfile(pasta_saida)
            else:
                os.startfile(folder_path)
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def compressor_imagem_file(file_path, force_fullhd=False):
    from Functions.compressor_imagem import comprimir_lista as comprimir_imagem_lista

    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateCompressorImagemProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        def progresso(pct, status):
            if _window:
                try:
                    _window.evaluate_js(
                        f"updateCompressorImagemProgress({{percent: {pct}, log: '{_safe_msg(status)}'}})"
                    )
                except Exception:
                    pass

        pasta_base = os.path.dirname(file_path) or os.getcwd()
        pasta_saida = os.path.join(pasta_base, "comprimidas")
        
        try:
            resultado = comprimir_imagem_lista(
                [file_path],
                pasta_saida,
                manter_original=True,
                callback_log=log,
                callback_progresso=progresso,
                force_fullhd=bool(force_fullhd),
            )
            log(
                f"Concluido: {resultado.get('ok', 0)}/{resultado.get('total', 0)} comprimidos | "
                f"{resultado.get('mantidos', 0)} mantidos | "
                f"{resultado.get('redimensionados', 0)} FullHD | "
                f"Reducao: {resultado.get('reducao_pct', 0):.1f}%"
            )
        except Exception as e:
            log(f"Erro: {e}")

        if _window:
            _window.evaluate_js("updateCompressorImagemProgress({complete: true})")
            if os.path.exists(pasta_saida):
                os.startfile(pasta_saida)
            else:
                os.startfile(pasta_base)

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ========================================
# Tools: compressor video
# ========================================
def compressor_video(folder_path, mode="copy", gpu="cpu"):
    from Functions.compressor_video import comprimir_lista as comprimir_video_lista, listar_videos
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateCompressorVideoProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        def progress(pct, status):
            if _window:
                try:
                    _window.evaluate_js(f"updateCompressorVideoProgress({{percent: {int(pct)}, status: '{_safe_msg(status)}'}})")
                except:
                    pass

        if os.path.isfile(folder_path):
            arquivos = [folder_path]
            pasta_base = os.path.dirname(folder_path) or os.getcwd()
        else:
            pasta_base = folder_path
            arquivos = listar_videos(folder_path)
            
        if not arquivos:
            log("Nenhum vídeo encontrado.")
            if _window:
                _window.evaluate_js("updateCompressorVideoProgress({complete: true})")
            return

        pasta_saida = os.path.join(pasta_base, "comprimidos") if str(mode).lower() != "overwrite" else pasta_base
        
        try:
            resultado = comprimir_video_lista(
                arquivos,
                pasta_saida,
                qualidade_crf=28,
                usar_gpu=str(gpu).lower() != "cpu",
                forcar_fullhd=False,
                manter_original=str(mode).lower() != "overwrite",
                callback_log=log,
                callback_progresso=progress,
            )
            log(f"Concluído: {resultado.get('ok', 0)}/{resultado.get('total', 0)} | Redução: {resultado.get('reducao_pct', 0):.1f}%")
            
            if _window:
                _window.evaluate_js("updateCompressorVideoProgress({complete: true})")
                os.startfile(pasta_saida if os.path.exists(pasta_saida) else pasta_base)
        except Exception as e:
            log(f"Erro: {e}")
            if _window:
                _window.evaluate_js("updateCompressorVideoProgress({complete: true})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def compressor_video_file(file_path, mode="copy", gpu="cpu"):
    return compressor_video(file_path, mode, gpu)



# ========================================
# Tools: video converter
# ========================================
def video_converter(folder_path, output_format):
    from Functions.videoconverter import converter_pasta, detectar_tipo_arquivo
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateVideoConverterProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        def progresso(pct, status):
            if _window:
                try:
                    _window.evaluate_js(
                        f"updateVideoConverterProgress({{percent: {pct}, status: '{_safe_msg(status)}'}})"
                    )
                except:
                    pass
        
        tipo = detectar_tipo_arquivo(folder_path)
        if tipo == "invalido":
            log("Caminho inválido ou não suportado")
            if _window:
                _window.evaluate_js("updateVideoConverterProgress({complete: true})")
            return
        
        resultado = converter_pasta(folder_path, output_format, loop_gif=True, callback_progresso=progresso, callback_log=log)
        
        if resultado.get("sucesso"):
            log(f"Processamento concluído: {resultado.get('sucessos', 0)}/{resultado.get('total', 0)} arquivos.")
            if os.path.exists(folder_path):
                os.startfile(folder_path)
        else:
            log(f"Erro: {resultado.get('erro', 'Nenhum arquivo processado')}")
        
        if _window:
            _window.evaluate_js("updateVideoConverterProgress({complete: true})")
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def video_converter_file(file_path, output_format):
    """Converte um único vídeo usando a rotina de arquivo do módulo."""
    from Functions.videoconverter import converter_arquivo as video_converter_arquivo, detectar_tipo_arquivo

    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateVideoConverterProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        def progresso(pct, status):
            if _window:
                try:
                    _window.evaluate_js(
                        f"updateVideoConverterProgress({{percent: {pct}, status: '{_safe_msg(status)}'}})"
                    )
                except:
                    pass

        tipo = detectar_tipo_arquivo(file_path)
        if tipo == "invalido":
            log("Formato não suportado")
            if _window:
                _window.evaluate_js("updateVideoConverterProgress({complete: true})")
            return

        pasta_base = os.path.dirname(file_path) or os.getcwd()
        resultado = video_converter_arquivo(file_path, output_format, loop_gif=True, callback_progresso=progresso, callback_log=log)

        if resultado.get("sucesso"):
            log(f"Convertido: {resultado.get('saida', '')}")
            pasta_saida = os.path.dirname(resultado.get("saida", "")) or pasta_base
            if os.path.exists(pasta_saida):
                os.startfile(pasta_saida)
        else:
            log(f"Erro: {resultado.get('erro', 'Desconhecido')}")

        if _window:
            _window.evaluate_js("updateVideoConverterProgress({complete: true})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def video_downloader_info(url):
    # Tenta descobrir a pasta raiz de forma absoluta e segura
    base_path = os.path.dirname(os.path.abspath(__file__))
    log_path = os.path.join(base_path, "erro_video_info.txt")
    
    # Sinal de vida: tenta criar o arquivo vazio só pra ver se tem permissão
    try:
        with open(os.path.join(base_path, "TESTE_ESCRITA.txt"), "w") as f:
            f.write("Python consegue escrever aqui")
    except:
        pass

    try:
        from Functions.videodownloader import extrair_info_video
        info = extrair_info_video(url)
        return {"success": True, "info": info}
    except Exception as e:
        import traceback
        err_msg = str(e)
        full_error = traceback.format_exc()
        
        try:
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(f"--- ERRO DE ANALISE ---\nURL: {url}\nERRO: {err_msg}\n\n{full_error}")
        except:
            pass
            
        return {"success": False, "error": f"Erro: {err_msg}. Log: {log_path}"}


def video_downloader(url, destino="", formato="mp4"):
    def run():
        def progresso(pct, msg):
            if _window:
                try:
                    _window.evaluate_js(
                        f"updateVideoDownloaderProgress({{percent: {pct}, log: '{_safe_msg(msg)}'}})"
                    )
                except:
                    pass

        try:
            output_dir = destino.strip() if destino else os.path.join(os.getcwd(), "videos_baixados")
            os.makedirs(output_dir, exist_ok=True)

            if str(formato).lower() == "mp3":
                from Functions.videodownloader import baixar_audio_mp3
                final_path = baixar_audio_mp3(url, output_dir, callback=progresso)
            else:
                from Functions.videodownloader import baixar_video_mp4
                final_path = baixar_video_mp4(url, output_dir, callback=progresso)

            if _window:
                _window.evaluate_js("updateVideoDownloaderProgress({percent: 100, complete: true})")
                if final_path and os.path.exists(final_path):
                    os.startfile(os.path.dirname(final_path))
        except Exception as e:
            if _window:
                _window.evaluate_js(
                    f"updateVideoDownloaderProgress({{log: 'Erro: {_safe_msg(str(e))}', error: true, complete: true}})"
                )

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


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
                if _window:
                    _window.evaluate_js("updateWebScraperProgress({log: 'Selecione uma pasta de destino para o download.', complete: true})")
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

            if _window:
                emit(percent=100, status="100% Concluído", complete=True)
                try:
                    os.startfile(pasta_final_para_abrir)
                except:
                    pass
        except Exception as e:
            if _window:
                _window.evaluate_js(f"updateWebScraperProgress({{log: 'Erro: {_safe_msg(str(e))}', complete: true}})")

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
    from Functions.cerebro_local import gerar_csv_com_cerebro, carregar_cerebro_md, get_cerebro_md_path
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
                emit("Carregue um arquivo .md primeiro!")
                return
            
            with open(cerebro_path, "r", encoding="utf-8") as f:
                cerebro_md = f.read().strip()
            if not cerebro_md:
                emit("Cérebro vazio!")
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
            emit(log_msg=f"CSV gerado: {nome_csv}.csv", percent=100)
            if _window:
                _window.evaluate_js("updateWebScraperProgress({complete: true})")
                os.startfile(os.path.dirname(csv_path))
        except Exception as e:
            if _window:
                _window.evaluate_js(f"updateWebScraperProgress({{log: 'Erro: {_safe_msg(str(e))}', complete: true}})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


# ========================================
# Tools: transcrever audio
# ========================================
def transcrever_audio(folder_path, model, language):
    from Functions.transcreveraudio import transcrever_pasta as transcrever_audio_pasta
    import json

    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateTranscreverAudioProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        def progress(pct, status):
            if _window:
                try:
                    _window.evaluate_js(f"updateTranscreverAudioProgress({{percent: {int(pct)}, status: '{_safe_msg(status)}'}})")
                except:
                    pass

        resultado = transcrever_audio_pasta(folder_path, modelo_key=model, idioma=language, callback_log=log, callback_progresso=progress)

        if _window:
            texto = resultado.get("texto_completo", "")
            pasta = resultado.get("pasta_origem", folder_path)
            payload = json.dumps({"complete": True, "texto": texto, "pasta_origem": pasta})
            _window.evaluate_js(f"updateTranscreverAudioProgress({payload})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def transcrever_audio_file(file_path, model, language):
    from Functions.transcreveraudio import transcrever_arquivo as transcrever_audio_arquivo
    import json

    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateTranscreverAudioProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        def progress(pct, status):
            if _window:
                try:
                    _window.evaluate_js(f"updateTranscreverAudioProgress({{percent: {int(pct)}, status: '{_safe_msg(status)}'}})")
                except:
                    pass

        pasta_base = os.path.dirname(file_path) or os.getcwd()
        resultado = transcrever_audio_arquivo(file_path, modelo_key=model, idioma=language, callback_log=log, callback_progresso=progress)

        if _window:
            texto = resultado.get("texto_completo", "")
            pasta = resultado.get("pasta_origem", pasta_base)
            payload = json.dumps({"complete": True, "texto": texto, "pasta_origem": pasta})
            _window.evaluate_js(f"updateTranscreverAudioProgress({payload})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


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


def remover_fundo(folder_path):
    from Functions.removerfundo import processar_imagem_preview, FORMATOS_SUPORTADOS
    import json
    global _rf_cache
    _rf_cache = []

    def run():
        global _rf_cache
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateRemoverFundoProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        def progress(pct, status):
            if _window:
                try:
                    _window.evaluate_js(f"updateRemoverFundoProgress({{percent: {int(pct)}, status: '{_safe_msg(status)}'}})")
                except:
                    pass

        arquivos = sorted([
            os.path.join(folder_path, f) for f in os.listdir(folder_path)
            if os.path.isfile(os.path.join(folder_path, f))
            and os.path.splitext(f)[1].lower() in FORMATOS_SUPORTADOS
        ])

        if not arquivos:
            log("Nenhuma imagem encontrada.")
            if _window:
                _window.evaluate_js("updateRemoverFundoProgress({complete: true})")
            return

        total = len(arquivos)
        resultados_js = []
        for i, path in enumerate(arquivos):
            r = processar_imagem_preview(path, callback_log=log)
            if r:
                _rf_cache.append({"nome": r["nome"], "resultado_pil": r["resultado_pil"]})
                resultados_js.append({
                    "nome": r["nome"],
                    "original_b64": r["original_b64"],
                    "resultado_b64": r["resultado_b64"],
                })
            progress(int((i + 1) / total * 100), f"{i+1}/{total}")

        if _window:
            if resultados_js:
                playConcluido_js = "if(typeof playConcluido==='function')playConcluido();"
                payload = json.dumps({"complete": True, "resultados": resultados_js})
                _window.evaluate_js(f"{playConcluido_js}updateRemoverFundoProgress({payload})")
            else:
                _window.evaluate_js("updateRemoverFundoProgress({complete: true})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


def remover_fundo_file(file_path):
    from Functions.removerfundo import processar_imagem_preview
    import json
    global _rf_cache
    _rf_cache = []

    def run():
        global _rf_cache
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateRemoverFundoProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass

        if _window:
            _window.evaluate_js("updateRemoverFundoProgress({percent: 10, status: 'Processando...'})")

        r = processar_imagem_preview(file_path, callback_log=log)

        if _window:
            if r:
                _rf_cache.append({"nome": r["nome"], "resultado_pil": r["resultado_pil"]})
                playConcluido_js = "if(typeof playConcluido==='function')playConcluido();"
                payload = json.dumps({"complete": True, "resultados": [{
                    "nome": r["nome"],
                    "original_b64": r["original_b64"],
                    "resultado_b64": r["resultado_b64"],
                }]})
                _window.evaluate_js(f"{playConcluido_js}updateRemoverFundoProgress({payload})")
            else:
                _window.evaluate_js("updateRemoverFundoProgress({complete: true})")

    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


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
    from Functions.organizador_de_imagens import (
        identificar_duplicadas,
        identificar_thumbs,
        limpar_pasta as organizar_imagens,
    )
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateOrganizadorImagensProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        def emit_p(p, status):
            if _window:
                _window.evaluate_js(f"updateOrganizadorImagensProgress({{percent: {p}}})")

        modo_norm = str(modo or "completa").lower()
        if modo_norm == "duplicadas":
            log("Identificando duplicadas...")
            identificar_duplicadas(folder_path, callback_log=log, callback_progresso=emit_p)
            emit_p(100, "Concluido")
            if _window:
                _window.evaluate_js("updateOrganizadorImagensProgress({complete: true})")
                os.startfile(folder_path)
            return

        if modo_norm == "thumbs":
            log("Identificando thumbs...")
            identificar_thumbs(folder_path, callback_log=log, callback_progresso=emit_p)
            emit_p(100, "Concluido")
            if _window:
                _window.evaluate_js("updateOrganizadorImagensProgress({complete: true})")
                os.startfile(folder_path)
            return

        # 1. Limpeza básica (0-70%)
        log("Iniciando organização...")
        def progress1(p, status):
            scaled = int(p * 0.70)
            emit_p(scaled, status)
            
        organizar_imagens(folder_path, callback_log=log, callback_progresso=progress1)
        
        # 2. Mover gráficos escapados (70-85%)
        log("Checando gráficos...")
        emit_p(75, "Checando gráficos...")
        _mover_graficos_de_imagens_em_alta(folder_path, callback_log=log)
        
        # 3. Renomear por contexto CLIP (85-100%)
        pasta_alta = os.path.join(folder_path, "imagens_em_alta")
        if os.path.exists(pasta_alta):
            log("Renomeando imagens por contexto...")
            # Como renomear não tem progresso nativo, vamos apenas saltar
            emit_p(90, "Renomeando...")
            _renomear_imagens_por_contexto(pasta_alta, callback_log=log)
        
        emit_p(100, "Concluído")
        if _window:
            _window.evaluate_js("updateOrganizadorImagensProgress({complete: true})")
            os.startfile(folder_path)
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


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
    
    def run():
        def log(msg):
            if _window:
                try:
                    _window.evaluate_js(f"updateTranscreverCenaProgress({{log: '{_safe_msg(msg)}'}})")
                except:
                    pass
        
        analisar_e_renomear_pasta(folder_path, callback_log=log)
        
        if _window:
            _window.evaluate_js("updateTranscreverCenaProgress({complete: true})")
            os.startfile(folder_path)
    
    threading.Thread(target=run, daemon=True).start()
    return {"success": True}


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
    from Functions.gdrive_dumper import verificar_gdrive_configurado
    try:
        ok = verificar_gdrive_configurado()
        return {"success": True, "configured": ok}
    except Exception as e:
        return {"success": False, "error": str(e)}


def gdrive_analyze(url):
    from Functions.gdrive_dumper import parse_link, calcular_tamanho_pasta, get_folder_name, verificar_gdrive_configurado
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
            if not verificar_gdrive_configurado():
                send(error="Google Drive não configurado no rclone. Execute 'rclone config' e crie o remote 'gdrive'.")
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


def _video_quality_to_crf(qualidade):
    """Converte preset do frontend para CRF numérico."""
    q = str(qualidade).strip().lower()
    tabela = {
        "ultra": 18,
        "high": 21,
        "medium": 23,
        "low": 28,
    }
    if q in tabela:
        return tabela[q]
    try:
        return int(q)
    except Exception:
        return 23


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
                            resolucao="original", usar_gpu=True, pasta_saida=None, sem_audio=False):
        return video_cutter_export(file_path, segments, output_format, qualidade, resolucao, usar_gpu,
                                   pasta_saida, sem_audio)

    def video_cutter_cancel_export(self):
        return video_cutter_cancel_export()

    def reveal_file(self, path):
        return reveal_file(path)

    def open_file(self, path):
        return open_file(path)

    def select_video_file(self, tool):
        return select_video_file(tool)

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

    def compressor_video(self, folder_path, mode="copy", gpu="cpu"):
        compressor_video(folder_path, mode, gpu)

    def compressor_video_file(self, file_path, mode="copy", gpu="cpu"):
        compressor_video_file(file_path, mode, gpu)

    # media tools
    def video_downloader_info(self, url):
        return video_downloader_info(url)

    def video_downloader(self, url, destino="", formato="mp4"):
        return video_downloader(url, destino, formato)

    def favicon_generator(self, image_path, site_name, theme_color):
        return favicon_generator(image_path, site_name, theme_color)

    def remover_fundo(self, folder_path):
        return remover_fundo(folder_path)

    def remover_fundo_file(self, file_path):
        return remover_fundo_file(file_path)

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


def main():
    global webview

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
            "Falha ao carregar a interface do Canivete do Pailer",
            format_webview_import_error(e),
        )
        return

    # Primeiro uso: verifica e instala dependências se necessário
    from first_run import precisa_instalar, executar_instalacao
    if precisa_instalar():
        executar_instalacao()

    # Inicializa modelos em background para não atrasar a abertura da janela
    def _setup_modelos():
        from Functions.setup_app import verificar_e_instalar_modelos
        verificar_e_instalar_modelos()
    threading.Thread(target=_setup_modelos, daemon=True).start()

    # Cria API com métodos explícitos

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
        title="Canivete do Pailer",
        url=html_path,
        js_api=api,
        width=_w,
        height=_h,
        min_size=(1000, 600),
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
        """Arrastar arquivo de vídeo para o editor (pywebview entrega o caminho real)."""
        try:
            from webview.dom import DOMEventHandler

            def _on_drop(e):
                files = (e.get("dataTransfer") or {}).get("files") or []
                for f in files:
                    p = f.get("pywebviewFullPath")
                    if p and os.path.splitext(p)[1].lower() in (
                            ".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".wmv", ".m4v",
                            ".ts", ".mts", ".m2ts", ".3gp", ".ogv", ".mpg", ".mpeg"):
                        window.evaluate_js(f"veOpenPath({json.dumps(p)})")
                        break

            window.dom.document.events.drop += DOMEventHandler(_on_drop, True, True)
        except Exception as e:
            print("[drop] indisponível:", e)

    window.events.loaded += _bind_drop
    atexit.register(gdrive_cancel)

    def _splash_sound():
        try:
            import winsound
            sound_path = os.path.join(base_dir, "identidade", "sound", "splash.wav")
            if os.path.exists(sound_path):
                winsound.PlaySound(sound_path, winsound.SND_FILENAME | winsound.SND_ASYNC)
        except Exception:
            pass

    webview.start(_splash_sound, debug=False)
    
    # Ao fechar
    _cleanup_temp_thumbs()
    return


if __name__ == "__main__":
    main()
