"""
instancia_unica.py — Uma cópia só do app aberta.

Abrir o app de novo (atalho ou duplo clique num .vknv ou .iknv) com ele já aberto não cria outra janela na barra
de tarefas: o pedido vai para a cópia que já está rodando (que vem para a frente e abre o projeto).
A conversa é por um soquete só em 127.0.0.1, com um token gravado na pasta do usuário.
"""
import ctypes
import hashlib
import json
import os
import socket
import threading
import time
import uuid

_MUTEX = "Local\\CaniveteDoPailer_instancia"
_mutex = None


def dados_isolados():
    """Só o perfil de testes no D pode ter uma instância separada da do Pailer."""
    base = os.path.normcase(os.path.realpath(os.environ.get("APPDATA") or os.path.expanduser("~")))
    testes = os.path.normcase(os.path.realpath("D:/kanivete_testes"))
    try:
        return os.path.commonpath([base, testes]) == testes
    except ValueError:
        return False


def _nome_mutex():
    if not dados_isolados():
        return _MUTEX
    base = os.path.normcase(os.path.realpath(os.environ["APPDATA"]))
    return _MUTEX + "_teste_" + hashlib.sha256(base.encode("utf-8")).hexdigest()[:16]


def _pid_vivo(pid):
    try:
        pid = int(pid)
        if pid <= 0:
            return False
        k = ctypes.windll.kernel32
        k.OpenProcess.restype = ctypes.c_void_p
        k.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        k.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        k.CloseHandle.argtypes = [ctypes.c_void_p]
        h = k.OpenProcess(0x1000, False, pid)
        if not h:
            return False
        try:
            codigo = ctypes.c_ulong()
            return bool(k.GetExitCodeProcess(h, ctypes.byref(codigo))) and codigo.value == 259
        finally:
            k.CloseHandle(h)
    except (OSError, ValueError, TypeError, AttributeError):
        return False


def instancias_vivas():
    """Registro do app, inclusive cópias antigas sem mutex e modo agente desligado. Não depende do CDP."""
    arq = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "CaniveteDoPailer", "agente.json")
    try:
        with open(arq, encoding="utf-8") as f:
            lista = (json.load(f) or {}).get("instancias") or []
        return [i for i in lista if isinstance(i, dict) and i.get("pid") != os.getpid() and _pid_vivo(i.get("pid"))]
    except (OSError, ValueError, TypeError, AttributeError):
        return []


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
    _mutex = k.CreateMutexW(None, False, _nome_mutex())
    if not _mutex:
        raise OSError("Não consegui verificar a instância única do KANIVETE.")
    existe = k.GetLastError() == 183   # ERROR_ALREADY_EXISTS
    return existe or bool(instancias_vivas())


def enviar(pedido, espera=8.0):
    """Manda o pedido para a cópia aberta. False se ela não respondeu; isso não autoriza abrir outra."""
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
                    try:
                        p = json.loads(dados.decode("utf-8"))
                    except ValueError:
                        p = None
                    if isinstance(p, dict) and p.get("token") == token:
                        c.sendall(b"ok")
                        pedido = p
                    else:   # não é a outra cópia do app (um agente procurando a porta de controle): diz o que é
                        msg = ("ERRO: porta de instancia unica do KANIVETE (so recebe o pedido de outra copia do app). "
                               "Controle do agente: %APPDATA%\\CaniveteDoPailer\\agente.json\n").encode("utf-8")
                        if dados[:4] in (b"GET ", b"POST", b"HEAD"):
                            msg = (b"HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain; charset=utf-8\r\n"
                                   b"Content-Length: " + str(len(msg)).encode() + b"\r\nConnection: close\r\n\r\n" + msg)
                        c.sendall(msg)
            except Exception:
                continue
            if pedido:
                try:
                    ao_receber(pedido)
                except Exception as e:
                    print("[instância] pedido falhou:", e)

    threading.Thread(target=_loop, daemon=True).start()
    return srv.getsockname()[1]
