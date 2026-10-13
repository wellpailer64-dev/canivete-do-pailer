"""Modo agente: borda laranja nas janelas enquanto um agente (Claude, scripts de teste) está conectado na porta de
depuração do WebView2 — um toque visual para o usuário saber que alguém está mexendo no app.

Confere a cada ~0,7 s se há conexão TCP ESTABELECIDA na porta do modo agente (o lado do servidor é o WebView2).
Liga na hora; desliga só depois de alguns segundos sem conexão (os scripts conectam e desconectam a cada comando,
a borda não fica piscando). Avisa o frontend por on(True/False) — main.py chama agenteBorda(...) em todas as janelas.
"""
import threading
import time

PASSO = 0.7      # s entre conferências
SEGURA = 6.0     # s acesa depois da última conexão vista


def conectado(porta):
    import psutil
    try:
        for c in psutil.net_connections(kind="tcp"):
            if c.status == psutil.CONN_ESTABLISHED and c.laddr and c.laddr.port == porta:
                return True
    except Exception:
        pass
    return False


def iniciar(porta, on):
    def loop():
        acesa, visto = False, 0.0
        while True:
            agora = time.monotonic()
            if conectado(porta):
                visto = agora
            quer = agora - visto < SEGURA
            if quer != acesa:
                acesa = quer
                try:
                    on(acesa)
                except Exception:
                    pass
            time.sleep(PASSO)

    t = threading.Thread(target=loop, name="agente-borda", daemon=True)
    t.start()
    return t
