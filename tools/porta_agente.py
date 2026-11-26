"""Porta CDP do KANIVETE aberto, lida do agente.json que o app grava ao abrir (main.py, _agente_registrar).

    from porta_agente import porta
    porta(9222)   # app do Pailer (faixa 9222-9231 das Preferências)
    porta(9333)   # app de teste (qualquer porta fora dessa faixa)

    py -3.13 tools/porta_agente.py [9222|9333]   -> mostra a porta escolhida e as cópias vistas

Regras:
- Lê os dois agente.json: o do %APPDATA% atual e o do app de teste (D:/Kanivete/Testes/appdata). Só conta cópia com
  estado "ligado", porta anotada e pid vivo.
- Nunca cruza os dois apps: pedido de teste (fora de 9222-9231) não cai no app do Pailer, e vice-versa.
- CANIVETE_AGENTE_PORTA vale se for do mesmo tipo do pedido.
- A porta pedida, se estiver viva no arquivo, ganha. Senão, só reutiliza uma única cópia do mesmo tipo.
  Mais de uma candidata exige escolha explícita; não troca de projeto pela data do registro.
  Nada achado -> devolve a pedida (isso não autoriza abrir outra cópia).
"""
import json
import os
import sys
import urllib.request

FAIXA_PAILER = range(9222, 9232)
TESTE_APPDATA = r"D:\Kanivete\Testes\appdata"


def _pid_vivo(pid):
    try:
        import ctypes
        kernel = ctypes.windll.kernel32
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        h = kernel.OpenProcess(0x1000, False, int(pid))   # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        codigo = ctypes.c_ulong()
        kernel.GetExitCodeProcess(h, ctypes.byref(codigo))
        kernel.CloseHandle(h)
        return codigo.value == 259   # STILL_ACTIVE
    except Exception:
        return False


def _responde(p, timeout=0.5):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{p}/json/version", timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def instancias():
    """Cópias vivas com o modo agente ligado: [{porta, pid, inicio, arquivo}], mais antigas primeiro."""
    pastas = {os.path.normcase(os.path.abspath(x)) for x in (os.environ.get("APPDATA"), TESTE_APPDATA) if x}
    vistas = []
    for pasta in pastas:
        arq = os.path.join(pasta, "CaniveteDoPailer", "agente.json")
        try:
            with open(arq, encoding="utf-8") as f:
                lista = (json.load(f) or {}).get("instancias") or []
        except Exception:
            continue
        for i in lista:
            if isinstance(i, dict) and i.get("estado") == "ligado" and i.get("porta") and _pid_vivo(i.get("pid", 0)):
                vistas.append({"porta": int(i["porta"]), "pid": i["pid"], "inicio": i.get("inicio", ""), "arquivo": arq})
    return sorted(vistas, key=lambda x: x["inicio"])


def porta(padrao=9222):
    padrao = int(padrao)
    mesmo_tipo = (lambda p: p in FAIXA_PAILER) if padrao in FAIXA_PAILER else (lambda p: p not in FAIXA_PAILER)
    try:
        env = int(os.environ.get("CANIVETE_AGENTE_PORTA") or 0)
    except ValueError:
        env = 0
    vivas = [i["porta"] for i in instancias() if mesmo_tipo(i["porta"])]
    if env and mesmo_tipo(env):
        if vivas and env not in vivas:
            raise RuntimeError(f'CANIVETE_AGENTE_PORTA={env} conflita com as instâncias registradas {vivas}; corrija a variável, não abra outra cópia.')
        return env
    if padrao in vivas:
        return padrao
    if len(set(vivas)) > 1:
        raise RuntimeError(f'Mais de uma instância candidata: {vivas}. Identifique o projeto e informe a porta; não escolhi a mais recente.')
    if vivas:
        return vivas[0]
    return padrao


def url(padrao=9222):
    return f"http://127.0.0.1:{porta(padrao)}"


if __name__ == "__main__":
    pedido = int(sys.argv[1]) if len(sys.argv) > 1 else 9222
    for i in instancias():
        print(f"  cópia: porta {i['porta']}  pid {i['pid']}  {i['inicio']}  ({i['arquivo']})")
    print(f"pedido {pedido} -> porta {porta(pedido)}")
