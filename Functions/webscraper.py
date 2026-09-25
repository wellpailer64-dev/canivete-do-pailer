import os
import re
import json
import zipfile
import urllib.parse
import urllib.request
from html import unescape
from html.parser import HTMLParser


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

IMAGE_EXT_RE = re.compile(r"\.(?:png|jpe?g|webp|gif|svg|bmp|tiff?|avif|ico)(?:$|[?#])", re.IGNORECASE)


def _split_srcset(srcset: str):
    itens = []
    for part in (srcset or "").split(","):
        p = part.strip()
        if not p:
            continue
        itens.append(p.split()[0].strip())
    return itens


def _extract_urls_from_css(texto: str):
    if not texto:
        return []
    urls = []
    for m in re.finditer(r"url\((['\"]?)(.*?)\1\)", texto, flags=re.IGNORECASE):
        u = (m.group(2) or "").strip()
        if u:
            urls.append(u)
    return urls


def _parece_url_imagem(url: str):
    u = (url or "").strip().lower()
    if not u or u.startswith("data:"):
        return False
    return bool(IMAGE_EXT_RE.search(u)) or "/image" in u


def _normalizar_imagem_url(base_url: str, src: str):
    src = (src or "").strip()
    if not src or src.startswith("data:"):
        return ""
    abs_url = urllib.parse.urljoin(base_url, src)
    return abs_url.split("#")[0]


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.images = []
        self.stylesheets = []
        self.videos = []
        self._texts = []
        self._in_title = False
        self._ignore_stack = []

    def _add_img(self, src):
        if src:
            self.images.append(src.strip())

    def _add_video(self, src):
        if src:
            self.videos.append(src.strip())

    def handle_starttag(self, tag, attrs):
        tag_l = tag.lower()
        attrs_d = {k.lower(): (v or "") for k, v in attrs}

        if tag_l == "title":
            self._in_title = True

        if tag_l in {"script", "style", "noscript"}:
            self._ignore_stack.append(tag_l)

        if tag_l == "img":
            for k in [
                "src", "data-src", "data-original", "data-lazy-src", "data-lazy", "data-url",
                "data-fallback-src", "data-image", "data-src-large", "data-thumb", "poster"
            ]:
                self._add_img(attrs_d.get(k))
            for u in _split_srcset(attrs_d.get("srcset", "")):
                self._add_img(u)
            for u in _split_srcset(attrs_d.get("data-srcset", "")):
                self._add_img(u)

        if tag_l == "source":
            self._add_img(attrs_d.get("src"))
            for u in _split_srcset(attrs_d.get("srcset", "")):
                self._add_img(u)
            for u in _split_srcset(attrs_d.get("data-srcset", "")):
                self._add_img(u)

        if tag_l == "image":
            self._add_img(attrs_d.get("href"))
            self._add_img(attrs_d.get("xlink:href"))

        if tag_l == "meta":
            prop = (attrs_d.get("property") or attrs_d.get("name") or attrs_d.get("itemprop") or "").lower()
            if prop in {"og:image", "og:image:url", "twitter:image", "twitter:image:src", "image"}:
                self._add_img(attrs_d.get("content"))

        if tag_l == "link":
            rel = (attrs_d.get("rel") or "").lower()
            if any(x in rel for x in ["icon", "apple-touch-icon", "image_src"]):
                self._add_img(attrs_d.get("href"))
            if "stylesheet" in rel and attrs_d.get("href"):
                self.stylesheets.append(attrs_d.get("href"))

        if tag_l == "a":
            href = attrs_d.get("href", "")
            if _parece_url_imagem(href):
                self._add_img(href)

            href_l = href.lower()
            if any(k in href_l for k in ["youtube.com", "youtu.be", "vimeo.com"]):
                self._add_video(href)

        if tag_l == "iframe":
            src = attrs_d.get("src", "")
            src_l = src.lower()
            if any(k in src_l for k in ["youtube.com", "youtu.be", "vimeo.com"]):
                self._add_video(src)

        style = attrs_d.get("style", "")
        for u in _extract_urls_from_css(style):
            self._add_img(u)

        for k, v in attrs_d.items():
            if k.startswith("data-") and v and _parece_url_imagem(v):
                self._add_img(v)

    def handle_endtag(self, tag):
        tag_l = tag.lower()
        if tag_l == "title":
            self._in_title = False
        if tag_l in {"script", "style", "noscript"} and self._ignore_stack:
            self._ignore_stack.pop()

    def handle_data(self, data):
        txt = (data or "").strip()
        if not txt:
            return
        if self._in_title:
            self.title = (self.title + " " + txt).strip()
            return
        if self._ignore_stack:
            return
        self._texts.append(txt)

    @property
    def full_text(self):
        joined = "\n".join(self._texts)
        joined = re.sub(r"\n{3,}", "\n\n", joined)
        return unescape(joined).strip()


def _normalizar_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise ValueError("URL vazia")
    if not re.match(r"^https?://", url, flags=re.IGNORECASE):
        url = "https://" + url
    return url


def _baixar_bytes(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _baixar_com_headers(url: str, timeout: int = 30, referer: str = ""):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), (r.headers.get("Content-Type") or "")


def analisar_pagina(url: str):
    url = _normalizar_url(url)
    html = _baixar_bytes(url, timeout=25)
    conteudo = html.decode("utf-8", errors="replace")

    parser = _PageParser()
    parser.feed(conteudo)

    # Captura imagens em CSS externos
    css_candidatos = []
    for css_href in parser.stylesheets:
        css_url = _normalizar_imagem_url(url, css_href)
        if not css_url:
            continue
        try:
            css_bytes = _baixar_bytes(css_url, timeout=20)
            css_txt = css_bytes.decode("utf-8", errors="replace")
            css_candidatos.extend(_extract_urls_from_css(css_txt))
        except Exception:
            pass

    imagens = []
    vistos = set()
    for src in parser.images:
        abs_url = _normalizar_imagem_url(url, src)
        if not abs_url:
            continue
        if abs_url not in vistos:
            vistos.add(abs_url)
            imagens.append(abs_url)

    # Fallback por regex no HTML bruto (CSS inline, JS embutido e srcset fora do parser)
    candidatos = []
    candidatos.extend(re.findall(r"https?://[^\s'\"<>]+", conteudo, flags=re.IGNORECASE))
    for m in re.findall(r"(?:src|href)=[\"']([^\"']+)[\"']", conteudo, flags=re.IGNORECASE):
        candidatos.append(m)
    for m in re.findall(r"srcset=[\"']([^\"']+)[\"']", conteudo, flags=re.IGNORECASE):
        candidatos.extend(_split_srcset(m))
    candidatos.extend(_extract_urls_from_css(conteudo))
    candidatos.extend(css_candidatos)

    for c in candidatos:
        if not _parece_url_imagem(c):
            continue
        abs_url = _normalizar_imagem_url(url, c)
        if not abs_url:
            continue
        if abs_url not in vistos:
            vistos.add(abs_url)
            imagens.append(abs_url)

    videos = _extrair_videos(url, conteudo, parser.videos)

    return {
        "url": url,
        "titulo": parser.title.strip() or "Sem titulo",
        "imagens": imagens,
        "qtd_imagens": len(imagens),
        "videos": videos,
        "qtd_videos": len(videos),
        "texto": parser.full_text,
    }


def _extrair_videos(base_url: str, html: str, candidatos_parser):
    candidatos = list(candidatos_parser or [])
    candidatos.extend(re.findall(r"https?://[^\s'\"<>]+(?:youtube\.com|youtu\.be|vimeo\.com)[^\s'\"<>]*", html, flags=re.IGNORECASE))
    for m in re.findall(r"(?:src|href)=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE):
        m_l = m.lower()
        if any(k in m_l for k in ["youtube.com", "youtu.be", "vimeo.com"]):
            candidatos.append(m)

    vistos = set()
    out = []
    for c in candidatos:
        abs_url = _normalizar_imagem_url(base_url, c)
        if not abs_url:
            continue
        info = _info_video(abs_url)
        if not info:
            continue
        key = info.get("url")
        if key in vistos:
            continue
        vistos.add(key)
        out.append(info)
    return out


def _youtube_id(url: str):
    try:
        p = urllib.parse.urlparse(url)
        host = p.netloc.lower()
        if "youtu.be" in host:
            return p.path.strip("/").split("/")[0]
        qs = urllib.parse.parse_qs(p.query)
        if "v" in qs and qs["v"]:
            return qs["v"][0]
        m = re.search(r"/(embed|shorts)/([a-zA-Z0-9_-]{6,})", p.path)
        if m:
            return m.group(2)
    except Exception:
        return ""
    return ""


def _vimeo_id(url: str):
    try:
        p = urllib.parse.urlparse(url)
        m = re.search(r"/(?:video/)?(\d+)", p.path)
        if m:
            return m.group(1)
    except Exception:
        return ""
    return ""


def _info_video(url: str):
    u = (url or "").strip()
    ul = u.lower()

    if "youtube.com" in ul or "youtu.be" in ul:
        vid = _youtube_id(u)
        if not vid:
            return None
        watch = f"https://www.youtube.com/watch?v={vid}"
        return {
            "provider": "YouTube",
            "id": vid,
            "url": watch,
            "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "title": f"YouTube {vid}",
        }

    if "vimeo.com" in ul:
        vid = _vimeo_id(u)
        if not vid:
            return None
        watch = f"https://vimeo.com/{vid}"
        info = {
            "provider": "Vimeo",
            "id": vid,
            "url": watch,
            "thumb": "",
            "title": f"Vimeo {vid}",
        }
        try:
            oembed = "https://vimeo.com/api/oembed.json?url=" + urllib.parse.quote(watch, safe="")
            raw = _baixar_bytes(oembed, timeout=15)
            data = json.loads(raw.decode("utf-8", errors="replace"))
            info["thumb"] = data.get("thumbnail_url", "")
            info["title"] = data.get("title") or info["title"]
        except Exception:
            pass
        return info
    return None


def _nome_arquivo_da_url(url: str, idx: int) -> str:
    path = urllib.parse.urlparse(url).path or ""
    base = os.path.basename(path).strip()
    if not base:
        base = f"imagem_{idx:04d}.bin"
    base = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
    if "." not in base:
        base += ".bin"
    return base


def _ext_por_content_type(ct: str):
    c = (ct or "").lower()
    if "image/svg" in c:
        return ".svg"
    if "image/png" in c:
        return ".png"
    if "image/webp" in c:
        return ".webp"
    if "image/gif" in c:
        return ".gif"
    if "image/bmp" in c:
        return ".bmp"
    if "image/tiff" in c:
        return ".tiff"
    if "image/avif" in c:
        return ".avif"
    if "image/x-icon" in c or "image/vnd.microsoft.icon" in c:
        return ".ico"
    if "image/jpeg" in c or "image/jpg" in c:
        return ".jpg"
    return ""


def baixar_imagens_zip(imagens, destino_zip, callback=None, referer_url=""):
    if not imagens:
        raise ValueError("Nenhuma imagem para baixar")

    destino_zip = os.path.abspath(destino_zip)
    os.makedirs(os.path.dirname(destino_zip), exist_ok=True)

    baixadas = 0
    puladas = 0
    nomes_usados = set()

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _baixar(i_url):
        i, img_url = i_url
        try:
            return i, img_url, _baixar_com_headers(img_url, timeout=30, referer=referer_url)
        except Exception:
            return i, img_url, None

    # Download em paralelo; a escrita no zip fica numa thread só (zipfile não é thread-safe)
    feitos = 0
    with zipfile.ZipFile(destino_zip, "w", compression=zipfile.ZIP_STORED) as zf,             ThreadPoolExecutor(max_workers=8) as ex:
        for fut in as_completed([ex.submit(_baixar, par) for par in enumerate(imagens, start=1)]):
            i, img_url, res = fut.result()
            feitos += 1
            if res is None:
                puladas += 1
                if callback:
                    callback(feitos, len(imagens), img_url, False)
                continue
            data, ct = res
            nome = _nome_arquivo_da_url(img_url, i)
            ext_ct = _ext_por_content_type(ct)
            stem, ext = os.path.splitext(nome)
            if ext_ct and ext.lower() in {"", ".bin"}:
                nome = stem + ext_ct
            if nome in nomes_usados:
                stem, ext = os.path.splitext(nome)
                nome = f"{stem}_{i:04d}{ext}"
            nomes_usados.add(nome)
            zf.writestr(nome, data)
            baixadas += 1
            if callback:
                callback(feitos, len(imagens), img_url, True)

    return {
        "zip_path": destino_zip,
        "baixadas": baixadas,
        "puladas": puladas,
        "total": len(imagens),
    }


def salvar_texto_txt(titulo: str, url: str, texto: str, destino_txt: str):
    destino_txt = os.path.abspath(destino_txt)
    os.makedirs(os.path.dirname(destino_txt), exist_ok=True)
    with open(destino_txt, "w", encoding="utf-8") as f:
        f.write(f"TITULO: {titulo}\n")
        f.write(f"URL: {url}\n")
        f.write("=" * 80 + "\n\n")
        f.write((texto or "").strip())
        f.write("\n")
    return destino_txt


def baixar_video_mp4(video_url: str, destino_dir: str, callback=None):
    from Functions.videodownloader import baixar_video_mp4 as _baixar_video_mp4_unificado
    return _baixar_video_mp4_unificado(video_url, destino_dir, callback=callback)
