"""
instancia_unica.py — Uma cópia só do app aberta.

Abrir o app de novo (atalho ou duplo clique num .vcnvt) com ele já aberto não cria outra janela na barra
de tarefas: o pedido vai para a cópia que já está rodando (que vem para a frente e abre o projeto).
A conversa é por um soquete só em 127.0.0.1, com um token gravado na pasta do usuário.
"""
import ctypes
import json
import os
import socket
import threading
import time
import uuid

_MUTEX = "Local\\CaniveteDoPailer_instancia"
_mutex = None


def _arquivo():
    base = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "CaniveteDoPailer")
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "instancia.json")


def ja_aberta():
    """True se outra cópia já está rodando (se esta é a primeira, fica com o mutex até fechar)."""
    global _mutex
    if os.name != "nt":
        return False
    k = ctypes.windll.kernel32
    k.CreateMutexW.restype = ctypes.c_void_p
    _mutex = k.CreateMutexW(None, False, _MUTEX)
    return k.GetLastError() == 183   # ERROR_ALREADY_EXISTS


def enviar(pedido, espera=8.0):
    """Manda o pedido para a cópia aberta. False se ela não respondeu (aí esta abre normalmente)."""
    fim = time.time() + espera
    while True:
        try:
            with open(_arquivo(), encoding="utf-8") as f:
                d = json.load(f)
            try:
                ctypes.windll.user32.AllowSetForegroundWindow(int(d["pid"]))   # deixa ela vir para a frente
            except Exception:
                pass
            with socket.create_connection(("127.0.0.1", int(d["porta"])), timeout=3) as s:
                s.sendall((json.dumps({"token": d["token"], **pedido}, ensure_ascii=False) + "\n").encode("utf-8"))
                if s.recv(8).startswith(b"ok"):
                    return True
        except Exception:
            pass
        if time.time() >= fim:   # a outra ainda está abrindo (sem soquete): tenta de novo por alguns segundos
            return False
        time.sleep(0.4)


def escutar(ao_receber):
    """Na primeira cópia: recebe os pedidos das próximas e chama ao_receber(pedido) (fora da thread da janela)."""
    token = uuid.uuid4().hex
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(("127.0.0.1", 0))
    srv.listen(5)
    tmp = _arquivo() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"pid": os.getpid(), "porta": srv.getsockname()[1], "token": token}, f)
    os.replace(tmp, _arquivo())

    def _loop():
        while True:
            try:
                c, _ = srv.accept()
            except OSError:
                return
            pedido = None
            try:
                with c:
                    c.settimeout(3)
                    dados = b""
                    while not dados.endswith(b"\n") and len(dados) < 65536:
                        parte = c.recv(4096)
                        if not parte:
                            break
                        dados += parte
                    p = json.loads(dados.decode("utf-8"))
                    if p.get("token") == token:
                        c.sendall(b"ok")
                        pedido = p
            except Exception:
                continue
            if pedido:
                try:
                    ao_receber(pedido)
                except Exception as e:
                    print("[instância] pedido falhou:", e)

    threading.Thread(target=_loop, daemon=True).start()
