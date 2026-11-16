"""
media_server.py — Servidor HTTP local (127.0.0.1) para a interface reproduzir mídia.

Por que existe: a interface é carregada de dentro do executável e não enxerga de forma
confiável caminhos file:/// (espaços, acentos, pastas diferentes no .exe). Aqui cada
arquivo é registrado com um token aleatório e servido com suporte a Range (seek do <video>).
Só escuta em 127.0.0.1 e só entrega arquivos registrados.
"""
import collections
import mimetypes
import os
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote

# Recarregar o módulo (modo agente: vk_recarregar / tools/aplicar.py --py) NÃO pode zerar o registro: o servidor
# continua no ar e todas as prévias, áudios e miniaturas já abertos no app passariam a dar erro ("o player não
# conseguiu abrir este vídeo"). Por isso o estado é reaproveitado se já existir.
_registry = globals().get("_registry", {})
_versoes = globals().get("_versoes", {})   # caminho → (token, (mtime, tamanho)) da versão registrada
_memoria = globals().get("_memoria", {})    # token -> (bytes, tipo): arquivos que só existem na memória (camadas do Editor de Imagem)
_envios = globals().get("_envios", {})      # sessão -> {chave: bytes}: o que a página manda por POST /u/<sessão>/<chave> (salvar PSD)
_lock = globals().get("_lock") or threading.Lock()
_pedidos = globals().get("_pedidos") or collections.deque(maxlen=3000)   # (instante, token, início, bytes) dos últimos pedidos
_PEDACO_MAX = 64 * 1024 * 1024   # pedido "bytes=N-" (sem fim) devolve no máximo isto; o player pede o resto sozinho
_server = globals().get("_server")
_port = globals().get("_port", 0)

mimetypes.add_type("video/mp4", ".m4v")
mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/ogg", ".ogg")


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _resolve(self):
        m = re.match(r"^/m/([A-Za-z0-9_-]+)/", self.path)
        if not m:
            return None
        with _lock:
            p = _registry.get(m.group(1))
        if p and os.path.isdir(p):   # pasta registrada (register_pasta): o nome do arquivo vem depois do token
            nome = unquote(self.path[m.end():].split("?", 1)[0])
            if not nome or "/" in nome or "\\" in nome or nome.startswith("."):
                return None
            return os.path.join(p, nome)
        return p

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self._serve(head=True)

    def do_GET(self):
        m = re.match(r"^/b/([A-Za-z0-9_-]+)/", self.path)
        if m:
            return self._serve_memoria(m.group(1))
        self._serve(head=False)

    def _serve_memoria(self, token):
        with _lock:
            item = _memoria.get(token)
        if not item:
            self.send_error(404)
            return
        dados, tipo = item
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(dados)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def do_POST(self):
        m = re.match(r"^/u/([A-Za-z0-9_-]+)/([A-Za-z0-9_.-]+)$", self.path)
        with _lock:
            caixa = _envios.get(m.group(1)) if m else None
        n = int(self.headers.get("Content-Length") or 0)
        if caixa is None or n <= 0 or n > 2_000_000_000:
            self.send_error(404)
            return
        partes, falta = [], n
        while falta > 0:
            b = self.rfile.read(min(1 << 20, falta))
            if not b:
                break
            partes.append(b)
            falta -= len(b)
        with _lock:
            caixa[m.group(2)] = b"".join(partes)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _serve(self, head):
        path = self._resolve()
        if not path or not os.path.isfile(path):
            self.send_error(404)
            return
        size = os.path.getsize(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        start, end = 0, size - 1
        status = 200
        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                elif m.group(2):  # sufixo: últimos N bytes
                    start = max(0, size - int(m.group(2)))
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206
        if status == 206 and not (m.group(2) if rng and m else ""):   # faixa aberta: não despeja o arquivo inteiro de uma vez
            end = min(end, start + _PEDACO_MAX - 1)
        length = end - start + 1
        if not head:
            tk = re.match(r"^/m/([A-Za-z0-9_-]+)/", self.path)
            _pedidos.append((time.time(), tk.group(1)[:8] if tk else "?", start, length))
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if head:
            return
        try:
            with open(path, "rb") as f:
                f.seek(start)
                restante = length
                while restante > 0:
                    bloco = f.read(min(1024 * 512, restante))
                    if not bloco:
                        break
                    self.wfile.write(bloco)
                    restante -= len(bloco)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass


def estatisticas(janela_s=60):
    """O que o servidor entregou nos últimos `janela_s` s: total de pedidos/bytes e os arquivos mais pedidos (diagnóstico do vigia)."""
    corte = time.time() - janela_s
    por = {}
    for t, tk, ini, n in list(_pedidos):
        if t >= corte:
            d = por.setdefault(tk, {"pedidos": 0, "mb": 0.0})
            d["pedidos"] += 1
            d["mb"] += n / 1048576
    top = sorted(por.items(), key=lambda kv: -kv[1]["pedidos"])[:5]
    return {"janela_s": janela_s, "pedidos": sum(v["pedidos"] for v in por.values()), "mb": round(sum(v["mb"] for v in por.values())),
            "top": [{"token": k, "pedidos": v["pedidos"], "mb": round(v["mb"])} for k, v in top]}


def _ensure_server():
    global _server, _port
    with _lock:
        if _server is not None:
            return
        _server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        _server.daemon_threads = True
        _port = _server.server_address[1]
    threading.Thread(target=_server.serve_forever, daemon=True).start()


def register(path):
    """Registra um arquivo e devolve a URL http://127.0.0.1:porta/m/<token>/<nome>.
    Arquivo regravado no mesmo lugar (data ou tamanho mudaram) ganha token novo: a URL muda e o player do editor
    recarrega em vez de misturar pedaços guardados do arquivo antigo (ex.: cópia Full HD refeita)."""
    _ensure_server()
    path = os.path.abspath(path)
    try:
        st = os.stat(path)
        versao = (st.st_mtime_ns, st.st_size)
    except OSError:
        versao = None
    with _lock:
        v = _versoes.get(path)
        if v and v[1] == versao and _registry.get(v[0]) == path:
            token = v[0]
        else:
            token = secrets.token_urlsafe(12)
            _registry[token] = path
            _versoes[path] = (token, versao)
    nome = quote(os.path.basename(path))
    return f"http://127.0.0.1:{_port}/m/{token}/{nome}"


def register_pasta(pasta):
    """Registra uma PASTA: URL base http://127.0.0.1:porta/m/<token>/ + nome do arquivo (ex.: as centenas de máscaras do
    Pincel Roto, sem um registro por arquivo). Só arquivos direto na pasta (sem subpasta, sem ..)."""
    _ensure_server()
    pasta = os.path.abspath(pasta)
    with _lock:
        v = _versoes.get(pasta)
        if v and _registry.get(v[0]) == pasta:
            token = v[0]
        else:
            token = secrets.token_urlsafe(12)
            _registry[token] = pasta
            _versoes[pasta] = (token, None)
    return f"http://127.0.0.1:{_port}/m/{token}/"


def unregister_prefix(folder):
    """Remove do registro tudo que estiver dentro de uma pasta (limpeza de previews)."""
    folder = os.path.abspath(folder)
    with _lock:
        for tok in [t for t, p in _registry.items() if p.startswith(folder)]:
            _registry.pop(tok, None)


def register_bytes(dados, nome="arquivo.png", tipo=None):
    """Serve bytes da memória (sem gravar em disco). Devolve (token, url); libere com unregister_bytes."""
    _ensure_server()
    token = secrets.token_urlsafe(12)
    with _lock:
        _memoria[token] = (bytes(dados), tipo or mimetypes.guess_type(nome)[0] or "application/octet-stream")
    return token, f"http://127.0.0.1:{_port}/b/{token}/{quote(nome)}"


def unregister_bytes(tokens):
    with _lock:
        for t in tokens or []:
            _memoria.pop(t, None)


def abrir_envio():
    """Caixa para a página mandar arquivos por POST. Devolve (sessão, url base terminada em /)."""
    _ensure_server()
    sessao = secrets.token_urlsafe(12)
    with _lock:
        _envios[sessao] = {}
    return sessao, f"http://127.0.0.1:{_port}/u/{sessao}/"


def fechar_envio(sessao):
    """Tira a caixa do servidor e devolve o que chegou ({chave: bytes})."""
    with _lock:
        return _envios.pop(sessao, None) or {}
