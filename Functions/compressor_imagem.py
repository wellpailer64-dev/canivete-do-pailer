import os
import shutil
import numpy as np
from PIL import Image, ImageOps, ImageSequence

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass


def _abrir_imagem(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".cr2":
        import rawpy
        with rawpy.imread(path) as raw:
            rgb = raw.postprocess()
        return Image.fromarray(rgb)
    return Image.open(path)

EXTENSOES_IMAGEM = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".heic", ".heif", ".cr2"
}
EXTENSOES_PDF = {".pdf"}
EXTENSOES_SUPORTADAS = EXTENSOES_IMAGEM | EXTENSOES_PDF
FULLHD_LANDSCAPE = (1920, 1080)
FULLHD_PORTRAIT = (1080, 1920)


def _fmt_tamanho(mb):
    if mb >= 1024:
        return f"{mb/1024:.2f} GB"
    return f"{mb:.1f} MB"


def listar_arquivos(caminho):
    encontrados = []
    for root, _, files in os.walk(caminho):
        for nome in files:
            ext = os.path.splitext(nome)[1].lower()
            if ext in EXTENSOES_SUPORTADAS:
                encontrados.append(os.path.join(root, nome))
    return encontrados


def _nome_seguro(destino):
    if not os.path.exists(destino):
        return destino
    base, ext = os.path.splitext(destino)
    n = 1
    while True:
        p = f"{base}_{n}{ext}"
        if not os.path.exists(p):
            return p
        n += 1


def _comprimir_pdf(entrada, saida):
    try:
        import fitz
    except Exception:
        return False, "PyMuPDF nao disponivel"

    try:
        doc = fitz.open(entrada)
        doc.save(saida, garbage=4, deflate=True, clean=True)
        doc.close()
        return True, None
    except Exception as e:
        return False, str(e)


def _fullhd_bounds(size):
    w, h = size
    return FULLHD_PORTRAIT if h > w else FULLHD_LANDSCAPE


def _scale_ratio_para_fullhd(size):
    w, h = size
    max_w, max_h = _fullhd_bounds(size)
    if w <= max_w and h <= max_h:
        return 1.0
    return min(max_w / max(w, 1), max_h / max(h, 1), 1.0)


def _aplicar_fullhd(img):
    ratio = _scale_ratio_para_fullhd(img.size)
    if ratio >= 0.999:
        return img, False

    try:
        rs = Image.Resampling.LANCZOS
    except Exception:
        rs = Image.LANCZOS

    novo_tamanho = (
        max(1, int(img.width * ratio)),
        max(1, int(img.height * ratio)),
    )
    return img.resize(novo_tamanho, rs), True


def _arquivo_acima_fullhd(path):
    try:
        with _abrir_imagem(path) as img:
            return _scale_ratio_para_fullhd(img.size) < 0.999, img.size
    except Exception:
        return False, None


def _salvar_gif_otimizado(entrada, saida, colors=256, frame_step=1, scale_ratio=1.0, force_fullhd=False):
    img = _abrir_imagem(entrada)
    frames = []
    durations = []

    base_duration = int(img.info.get("duration", 80) or 80)
    loop = img.info.get("loop", 0)
    fullhd_ratio = _scale_ratio_para_fullhd(img.size) if force_fullhd else 1.0
    scale_ratio = min(scale_ratio, fullhd_ratio)

    idx = 0
    for fr in ImageSequence.Iterator(img):
        if frame_step > 1 and (idx % frame_step != 0):
            idx += 1
            continue

        fr_rgba = fr.convert("RGBA")
        if scale_ratio < 0.999:
            nw = max(1, int(fr_rgba.width * scale_ratio))
            nh = max(1, int(fr_rgba.height * scale_ratio))
            try:
                rs = Image.Resampling.LANCZOS
            except Exception:
                rs = Image.LANCZOS
            fr_rgba = fr_rgba.resize((nw, nh), rs)

        fr_p = fr_rgba.convert("P", palette=Image.ADAPTIVE, colors=max(16, min(colors, 256)))
        frames.append(fr_p)
        durations.append(base_duration * max(1, frame_step))
        idx += 1

    if not frames:
        return False

    frames[0].save(
        saida,
        save_all=True,
        append_images=frames[1:],
        optimize=True,
        loop=loop,
        duration=durations,
        disposal=2,
    )
    return True


def _candidate_path(saida, idx):
    base, ext = os.path.splitext(saida)
    return f"{base}.__canivete_tmp_{idx}{ext}"


def _cleanup_paths(paths):
    for path in paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception:
            pass


def _salvar_menor_candidato(candidatos, saida):
    validos = [
        path for path in candidatos
        if path and os.path.exists(path) and os.path.getsize(path) > 0
    ]
    if not validos:
        return False, "Nenhum candidato valido gerado"

    melhor = min(validos, key=os.path.getsize)
    try:
        if os.path.exists(saida):
            os.remove(saida)
        shutil.move(melhor, saida)
    finally:
        _cleanup_paths([p for p in candidatos if p != melhor])

    return True, None


def _jpeg_save_kwargs(quality):
    return {
        "quality": quality,
        "optimize": True,
        "subsampling": 2,
    }


def _tem_alpha(img):
    return img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)


def _bom_o_suficiente(path, tamanho_original, alvo_ratio):
    return (
        path
        and os.path.exists(path)
        and os.path.getsize(path) > 0
        and os.path.getsize(path) <= tamanho_original * alvo_ratio
    )


def _finalizar_candidato(path, saida, candidatos):
    try:
        if os.path.exists(saida):
            os.remove(saida)
        shutil.move(path, saida)
    finally:
        _cleanup_paths([p for p in candidatos if p != path])
    return True, None


def _comprimir_imagem_otimizado_legacy(entrada, saida, force_fullhd=False):
    ext = os.path.splitext(entrada)[1].lower()
    tam_in = os.path.getsize(entrada)

    try:
        if ext == ".gif":
            # GIF: apenas otimizar sem reducir cores
            ok = _salvar_gif_otimizado(entrada, saida, colors=256, frame_step=1, scale_ratio=1.0, force_fullhd=force_fullhd)
            if not ok:
                return False, "GIF sem frames"
            if os.path.exists(saida) and os.path.getsize(saida) > 0:
                return True, None
            return False, "Falha ao salvar GIF"

        img = _abrir_imagem(entrada)
        img.load()
        modo = img.mode

        if ext in {".jpg", ".jpeg"}:
            # JPEG: qualidade alta (85) primeiro, sem subsampling para melhor qualidade
            rgb = img.convert("RGB")
            img.close()
            rgb.save(saida, format="JPEG", quality=85, optimize=True, subsampling=0)
            if os.path.exists(saida) and os.path.getsize(saida) > 0:
                return True, None
            return False, "Falha ao salvar JPEG"

        if ext == ".png":
            # PNG: sempre lossless - apenas compressão máxima, sem reducir cores
            if modo in ("RGB", "L", "RGBX", "LA"):
                img.save(saida, format="PNG", optimize=True, compress_level=9)
                img.close()
            else:
                # RGBA: preservar transparência, apenas compressão
                img.save(saida, format="PNG", optimize=True, compress_level=9)
            if os.path.exists(saida) and os.path.getsize(saida) > 0:
                return True, None
            return False, "Falha ao salvar PNG"

        if ext == ".webp":
            # WebP: lossless (quality=100) para máxima qualidade
            try:
                img.save(saida, format="WEBP", quality=100, method=6, lossless=True)
            except TypeError:
                img.save(saida, format="WEBP", quality=100, method=6)
            if os.path.exists(saida) and os.path.getsize(saida) > 0:
                return True, None
            return False, "Falha ao salvar WebP"

        if ext in {".bmp", ".tif", ".tiff", ".heic", ".heif", ".cr2"}:
            # Converter para JPEG qualidade alta
            rgb = img.convert("RGB")
            img.close()
            rgb.save(saida, format="JPEG", quality=85, optimize=True, subsampling=0)
            if os.path.exists(saida) and os.path.getsize(saida) > 0:
                return True, None
            return False, "Falha ao converter para JPEG"

        img.close()
        return False, "Formato nao suportado"

    except Exception as e:
        if os.path.exists(saida):
            try:
                os.remove(saida)
            except:
                pass
        return False, str(e)


def _comprimir_imagem_multicandidatos(entrada, saida, force_fullhd=False):
    ext = os.path.splitext(entrada)[1].lower()
    tamanho_original = os.path.getsize(entrada)
    candidatos = []

    try:
        if ext == ".gif":
            perfis = [
                (128, 1, 1.0),
                (96, 2, 0.90),
            ]
            for idx, (colors, frame_step, scale_ratio) in enumerate(perfis, 1):
                tmp = _candidate_path(saida, idx)
                if _salvar_gif_otimizado(
                    entrada,
                    tmp,
                    colors=colors,
                    frame_step=frame_step,
                    scale_ratio=scale_ratio,
                    force_fullhd=force_fullhd,
                ):
                    candidatos.append(tmp)
                    if _bom_o_suficiente(tmp, tamanho_original, 0.80):
                        return _finalizar_candidato(tmp, saida, candidatos)
            return _salvar_menor_candidato(candidatos, saida)

        img = ImageOps.exif_transpose(_abrir_imagem(entrada))
        img.load()
        if force_fullhd:
            img, _ = _aplicar_fullhd(img)
        modo = img.mode

        if ext in {".jpg", ".jpeg"}:
            rgb = img.convert("RGB")
            img.close()
            for idx, quality in enumerate((72, 62, 52), 1):
                tmp = _candidate_path(saida, idx)
                rgb.save(tmp, format="JPEG", **_jpeg_save_kwargs(quality))
                candidatos.append(tmp)
                if _bom_o_suficiente(tmp, tamanho_original, 0.70):
                    return _finalizar_candidato(tmp, saida, candidatos)
            return _salvar_menor_candidato(candidatos, saida)

        if ext == ".png":
            tmp = _candidate_path(saida, 1)
            img.save(tmp, format="PNG", optimize=True, compress_level=9)
            candidatos.append(tmp)
            if _bom_o_suficiente(tmp, tamanho_original, 0.85):
                img.close()
                return _finalizar_candidato(tmp, saida, candidatos)

            if _tem_alpha(img):
                rgba = img.convert("RGBA")
                quant_method = getattr(Image, "Quantize", Image).FASTOCTREE
                for idx, colors in enumerate((128, 64), 2):
                    tmp = _candidate_path(saida, idx)
                    rgba.quantize(colors=colors, method=quant_method).save(
                        tmp, format="PNG", optimize=True, compress_level=9
                    )
                    candidatos.append(tmp)
                    if _bom_o_suficiente(tmp, tamanho_original, 0.75):
                        img.close()
                        return _finalizar_candidato(tmp, saida, candidatos)
            else:
                base = img.convert("RGB") if modo not in ("L", "P") else img
                for idx, colors in enumerate((128, 64), 2):
                    tmp = _candidate_path(saida, idx)
                    base.quantize(colors=colors).save(
                        tmp, format="PNG", optimize=True, compress_level=9
                    )
                    candidatos.append(tmp)
                    if _bom_o_suficiente(tmp, tamanho_original, 0.75):
                        img.close()
                        return _finalizar_candidato(tmp, saida, candidatos)

            img.close()
            return _salvar_menor_candidato(candidatos, saida)

        if ext == ".webp":
            for idx, quality in enumerate((72, 62, 52), 1):
                tmp = _candidate_path(saida, idx)
                img.save(tmp, format="WEBP", quality=quality, method=6)
                candidatos.append(tmp)
                if _bom_o_suficiente(tmp, tamanho_original, 0.70):
                    img.close()
                    return _finalizar_candidato(tmp, saida, candidatos)

            img.close()
            return _salvar_menor_candidato(candidatos, saida)

        if ext in {".bmp", ".tif", ".tiff", ".heic", ".heif", ".cr2"}:
            rgb = img.convert("RGB")
            img.close()
            for idx, quality in enumerate((72, 62, 52), 1):
                tmp = _candidate_path(saida, idx)
                rgb.save(tmp, format="JPEG", **_jpeg_save_kwargs(quality))
                candidatos.append(tmp)
                if _bom_o_suficiente(tmp, tamanho_original, 0.70):
                    return _finalizar_candidato(tmp, saida, candidatos)
            return _salvar_menor_candidato(candidatos, saida)

        img.close()
        return False, "Formato nao suportado"

    except Exception as e:
        _cleanup_paths(candidatos)
        if os.path.exists(saida):
            try:
                os.remove(saida)
            except:
                pass
        return False, str(e)


def comprimir_arquivo(entrada, saida, qualidade=75, force_fullhd=False):
    ext = os.path.splitext(entrada)[1].lower()
    if ext in EXTENSOES_PDF:
        return _comprimir_pdf(entrada, saida)
    return _comprimir_imagem_multicandidatos(entrada, saida, force_fullhd=force_fullhd)


def comprimir_lista(
    arquivos,
    pasta_saida,
    qualidade=75,
    manter_original=True,
    callback_progresso=None,
    callback_log=None,
    callback_arquivo=None,
    stop_event=None,
    force_fullhd=False,
):
    os.makedirs(pasta_saida, exist_ok=True)

    total = len(arquivos)
    ok = 0
    erros = 0
    total_orig = 0.0
    total_final = 0.0
    mantidos = 0
    redimensionados = 0

    for i, entrada in enumerate(arquivos, 1):
        if stop_event and stop_event.is_set():
            break

        if callback_arquivo:
            callback_arquivo(i, total, os.path.basename(entrada))

        if not os.path.exists(entrada):
            erros += 1
            continue

        ext = os.path.splitext(entrada)[1].lower()
        if ext not in EXTENSOES_SUPORTADAS:
            erros += 1
            continue

        acima_fullhd = False
        tamanho_original_px = None
        if force_fullhd and ext in EXTENSOES_IMAGEM:
            acima_fullhd, tamanho_original_px = _arquivo_acima_fullhd(entrada)
            if acima_fullhd:
                redimensionados += 1

        tam_orig_bytes = os.path.getsize(entrada)
        tam_orig_mb = tam_orig_bytes / 1024 / 1024
        total_orig += tam_orig_mb

        nome = os.path.basename(entrada)
        if ext in {".bmp", ".tif", ".tiff", ".heic", ".heif", ".cr2"}:
            nome = os.path.splitext(nome)[0] + ".jpg"

        if manter_original:
            destino = _nome_seguro(os.path.join(pasta_saida, nome))
            trabalho = destino
        else:
            destino = entrada
            trabalho = _nome_seguro(os.path.join(pasta_saida, f"__tmp_comp_{i}_{nome}"))

        sucesso, erro = comprimir_arquivo(entrada, trabalho, force_fullhd=force_fullhd)
        if not sucesso:
            if callback_log:
                callback_log(f"✗ {os.path.basename(entrada)}: {erro}")
            erros += 1
            if callback_progresso:
                callback_progresso(int(i / max(total, 1) * 100), f"Processando {i}/{total}")
            continue

        if not os.path.exists(trabalho) or os.path.getsize(trabalho) <= 0:
            if callback_log:
                callback_log(f"✗ {os.path.basename(entrada)}: arquivo comprimido nao foi gerado")
            erros += 1
            if callback_progresso:
                callback_progresso(int(i / max(total, 1) * 100), f"Processando {i}/{total}")
            continue

        tam_trabalho_bytes = os.path.getsize(trabalho)
        if tam_trabalho_bytes >= tam_orig_bytes:
            try:
                if os.path.abspath(trabalho) != os.path.abspath(entrada):
                    os.remove(trabalho)
            except Exception:
                pass

            mantidos += 1
            total_final += tam_orig_mb

            if callback_log:
                tam_trabalho_mb = tam_trabalho_bytes / 1024 / 1024
                callback_log(
                    f"= {os.path.basename(entrada)}: original mantido "
                    f"({_fmt_tamanho(tam_orig_mb)}; tentativa gerou {_fmt_tamanho(tam_trabalho_mb)})"
                )

            if callback_progresso:
                callback_progresso(int(i / max(total, 1) * 100), f"Processando {i}/{total}")
            continue

        try:
            if not manter_original:
                os.replace(trabalho, destino)
        except Exception as e:
            if callback_log:
                callback_log(f"? Falha ao substituir: {e}")
            erros += 1
            continue

        tam_final_mb = os.path.getsize(destino if not manter_original else trabalho) / 1024 / 1024
        total_final += tam_final_mb
        ok += 1

        if callback_log:
            reducao = (1.0 - (tam_final_mb / tam_orig_mb)) * 100 if tam_orig_mb > 0 else 0
            extra = ""
            if acima_fullhd and tamanho_original_px:
                extra = f" | FullHD {tamanho_original_px[0]}x{tamanho_original_px[1]}"
            callback_log(
                f"✓ {os.path.basename(entrada)}: {_fmt_tamanho(tam_orig_mb)} -> {_fmt_tamanho(tam_final_mb)} (-{reducao:.0f}%){extra}"
            )

        if callback_progresso:
            callback_progresso(int(i / max(total, 1) * 100), f"Processando {i}/{total}")

    reducao_pct = (1.0 - (total_final / total_orig)) * 100 if total_orig > 0 else 0.0
    return {
        "total": total,
        "ok": ok,
        "erros": erros,
        "mantidos": mantidos,
        "redimensionados": redimensionados,
        "total_orig_mb": total_orig,
        "total_final_mb": total_final,
        "reducao_pct": reducao_pct,
    }
