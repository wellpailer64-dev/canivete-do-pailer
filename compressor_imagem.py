import os
import shutil
import threading
from PIL import Image, ImageSequence

EXTENSOES_IMAGEM = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".heic", ".heif"
}
EXTENSOES_PDF = {".pdf"}
EXTENSOES_SUPORTADAS = EXTENSOES_IMAGEM | EXTENSOES_PDF


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


def _salvar_gif_otimizado(entrada, saida, colors=128, frame_step=1, scale_ratio=1.0):
    img = Image.open(entrada)
    frames = []
    durations = []

    base_duration = int(img.info.get("duration", 80) or 80)
    loop = img.info.get("loop", 0)

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


def _comprimir_imagem(entrada, saida, qualidade=75):
    ext = os.path.splitext(entrada)[1].lower()

    try:
        if ext == ".gif":
            # Perfil progressivo para GIF: tenta equilibrado e, se nao reduzir,
            # aplica uma segunda passada mais agressiva.
            if qualidade >= 85:
                colors, frame_step, scale_ratio = 192, 1, 1.0
            elif qualidade >= 70:
                colors, frame_step, scale_ratio = 128, 1, 1.0
            else:
                colors, frame_step, scale_ratio = 96, 2, 0.90

            ok = _salvar_gif_otimizado(
                entrada, saida,
                colors=colors,
                frame_step=frame_step,
                scale_ratio=scale_ratio,
            )
            if not ok:
                return False, "GIF sem frames"

            # Se ainda nao reduziu, tenta modo compacto.
            try:
                tam_in = os.path.getsize(entrada)
                tam_out = os.path.getsize(saida)
                if tam_out >= tam_in:
                    _salvar_gif_otimizado(
                        entrada, saida,
                        colors=max(48, colors // 2),
                        frame_step=max(2, frame_step),
                        scale_ratio=min(scale_ratio, 0.85),
                    )
            except Exception:
                pass

            return True, None

        img = Image.open(entrada)
        if ext in {".jpg", ".jpeg"}:
            rgb = img.convert("RGB")
            rgb.save(saida, format="JPEG", quality=max(35, min(qualidade, 95)), optimize=True)
            return True, None

        if ext == ".png":
            if qualidade <= 70 and img.mode in ("RGB", "RGBA", "P"):
                q = img.convert("P", palette=Image.ADAPTIVE, colors=256)
                q.save(saida, format="PNG", optimize=True, compress_level=9)
            else:
                img.save(saida, format="PNG", optimize=True, compress_level=9)
            return True, None

        if ext == ".webp":
            img.save(saida, format="WEBP", quality=max(35, min(qualidade, 95)), method=6)
            return True, None

        if ext in {".bmp", ".tif", ".tiff", ".heic", ".heif"}:
            rgb = img.convert("RGB")
            rgb.save(saida, format="JPEG", quality=max(35, min(qualidade, 95)), optimize=True)
            return True, None

        return False, "Formato nao suportado"
    except Exception as e:
        return False, str(e)


def comprimir_arquivo(entrada, saida, qualidade=75):
    ext = os.path.splitext(entrada)[1].lower()
    if ext in EXTENSOES_PDF:
        return _comprimir_pdf(entrada, saida)
    return _comprimir_imagem(entrada, saida, qualidade=qualidade)


def comprimir_lista(
    arquivos,
    pasta_saida,
    qualidade=75,
    manter_original=True,
    callback_progresso=None,
    callback_log=None,
    callback_arquivo=None,
    stop_event=None,
):
    os.makedirs(pasta_saida, exist_ok=True)

    total = len(arquivos)
    ok = 0
    erros = 0
    total_orig = 0.0
    total_final = 0.0

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

        tam_orig_mb = os.path.getsize(entrada) / 1024 / 1024
        total_orig += tam_orig_mb

        nome = os.path.basename(entrada)
        if ext in {".bmp", ".tif", ".tiff", ".heic", ".heif"}:
            nome = os.path.splitext(nome)[0] + ".jpg"

        if manter_original:
            destino = _nome_seguro(os.path.join(pasta_saida, nome))
            trabalho = destino
        else:
            destino = entrada
            trabalho = _nome_seguro(os.path.join(pasta_saida, f"__tmp_comp_{i}_{nome}"))

        sucesso, erro = comprimir_arquivo(entrada, trabalho, qualidade=qualidade)
        if not sucesso:
            if callback_log:
                callback_log(f"? {os.path.basename(entrada)}: {erro}")
            try:
                if os.path.exists(trabalho):
                    os.remove(trabalho)
            except Exception:
                pass
            erros += 1
            if callback_progresso:
                callback_progresso(int(i / max(total, 1) * 100), f"Processando... {i}/{total}")
            continue

        try:
            if not manter_original:
                os.replace(trabalho, destino)
        except Exception as e:
            if callback_log:
                callback_log(f"? Falha ao substituir: {e}")
            try:
                if os.path.exists(trabalho):
                    os.remove(trabalho)
            except Exception:
                pass
            erros += 1
            continue

        tam_final_mb = os.path.getsize(destino if not manter_original else trabalho) / 1024 / 1024
        total_final += tam_final_mb
        ok += 1

        if callback_log:
            reducao = (1.0 - (tam_final_mb / tam_orig_mb)) * 100 if tam_orig_mb > 0 else 0
            callback_log(
                f"? {os.path.basename(entrada)} -> {os.path.basename(destino if not manter_original else trabalho)} "
                f"({_fmt_tamanho(tam_orig_mb)} -> {_fmt_tamanho(tam_final_mb)}, {reducao:.0f}% )"
            )

        if callback_progresso:
            callback_progresso(int(i / max(total, 1) * 100), f"Processando... {i}/{total}")

    reducao_pct = (1.0 - (total_final / total_orig)) * 100 if total_orig > 0 else 0.0
    return {
        "total": total,
        "ok": ok,
        "erros": erros,
        "total_orig_mb": total_orig,
        "total_final_mb": total_final,
        "reducao_pct": reducao_pct,
    }
