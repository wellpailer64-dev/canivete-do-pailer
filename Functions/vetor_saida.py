"""Vetor Kanivete — saídas para o mercado.
.ai  = PDF compatível com o Illustrator (texto editável, sem marcas) + o .aknv ANEXADO dentro (o Illustrator ignora o anexo;
       o Vetor reabre pelo anexo com fidelidade total). Uma prancheta por arquivo: o Illustrator abre PDF de várias páginas
       pedindo a página, então cada prancheta vira um .ai limpo (separadas=False junta tudo num arquivo de várias páginas).
.eps = PDF da prancheta → Ghostscript eps2write (baixado sob demanda, ver vetor_importar.baixar_ghostscript).
"""
import os, shutil, subprocess, tempfile

ANEXO = "vetor_kanivete.aknv"


def _nomes(caminho, n, ext):
    base = caminho[: -len(ext)] if caminho.lower().endswith(ext) else caminho
    return [base + ext] if n == 1 else [f"{base}_{i + 1:02d}{ext}" for i in range(n)]


def exportar_ai(doc_py, doc_salvar, caminho, op=None):
    from Functions import vetor_exportar, vetor_kanivete
    import pikepdf
    op = dict(op or {})
    pr = op.pop("pranchetas", None) or [p["id"] for p in doc_py.get("pranchetas") or []]
    separadas = op.pop("separadas", True) and len(pr) > 1
    op.update(padrao=op.get("padrao") if op.get("padrao") in ("rgb", "cmyk") else "cmyk", marcas=False, textoEditavel=op.get("textoEditavel", True))
    tmp = tempfile.mkdtemp(prefix="vk_ai_")
    try:
        ak = os.path.join(tmp, "doc.aknv"); vetor_kanivete.salvar(doc_salvar, ak); dados = open(ak, "rb").read()
        grupos = [[p] for p in pr] if separadas else [pr]
        saidas = []
        for destino, ids in zip(_nomes(caminho, len(grupos), ".ai"), grupos):
            pdfp = os.path.join(tmp, "p.pdf")
            r = vetor_exportar.exportar_pdf(doc_py, pdfp, dict(op, pranchetas=ids))
            if not r.get("success"):
                return r
            with pikepdf.open(pdfp) as pdf:
                pdf.attachments[ANEXO] = pikepdf.AttachedFileSpec(pdf, dados, filename=ANEXO, mime_type="application/zip",
                                                                  description="Documento editável do Vetor Kanivete")
                pdf.docinfo["/Creator"] = "Vetor Kanivete"
                os.makedirs(os.path.dirname(os.path.abspath(destino)) or ".", exist_ok=True)
                pdf.save(destino)
            saidas.append(destino)
        return {"success": True, "arquivos": saidas}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def aknv_anexado(caminho):
    """.ai/.pdf salvo pelo Vetor → caminho de um .aknv temporário com o documento original (ou None)."""
    try:
        import pikepdf
        with pikepdf.open(caminho) as pdf:
            if ANEXO not in pdf.attachments:
                return None
            dados = pdf.attachments[ANEXO].get_file().read_bytes()
        out = os.path.join(tempfile.gettempdir(), "vetor_kanivete", "anexo_" + os.path.splitext(os.path.basename(caminho))[0] + ".aknv")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "wb").write(dados)
        return out
    except Exception:
        return None


def exportar_eps(doc_py, caminho, op=None):
    from Functions import vetor_exportar, vetor_importar
    gs = vetor_importar.ghostscript()
    if not gs:
        r = vetor_importar.baixar_ghostscript()
        if not r.get("success"):
            return r
        gs = r["gs"]
    op = dict(op or {})
    pr = op.pop("pranchetas", None) or [p["id"] for p in doc_py.get("pranchetas") or []]
    op.update(padrao=op.get("padrao") if op.get("padrao") in ("rgb", "cmyk") else "cmyk", marcas=False, textoEditavel=False)
    tmp = tempfile.mkdtemp(prefix="vk_eps_")
    try:
        saidas = []
        for destino, pid in zip(_nomes(caminho, len(pr), ".eps"), pr):
            pdfp = os.path.join(tmp, "p.pdf")
            r = vetor_exportar.exportar_pdf(doc_py, pdfp, dict(op, pranchetas=[pid]))
            if not r.get("success"):
                return r
            q = subprocess.run([gs, "-dNOPAUSE", "-dBATCH", "-dSAFER", "-dQUIET", "-sDEVICE=eps2write", "-r600", f"-sOutputFile={destino}", pdfp],
                               capture_output=True, text=True, timeout=300, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if q.returncode != 0 or not os.path.isfile(destino):
                return {"success": False, "error": "o Ghostscript não gerou o EPS: " + (q.stderr or q.stdout or "")[-300:]}
            saidas.append(destino)
        return {"success": True, "arquivos": saidas}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
