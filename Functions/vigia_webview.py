"""Vigia do navegador embutido (WebView2) do KANIVETE.

Por quê: em 2026-11-16 um msedgewebview2 do app foi a 14 GB (25 MB/s, app parado) e a máquina inteira travou, com 0,7 GB de
RAM livre. Ninguém viu a causa a tempo e o app não respondia nem ao CDP. Este vigia, numa thread à parte do Python (que segue
viva mesmo com a página presa), faz três coisas:

1. mede a memória de TODA a árvore msedgewebview2 filha deste processo a cada poucos segundos;
2. ao ver descontrole (valor absoluto, crescimento sustentado ou RAM do sistema acabando) grava as evidências em
   %APPDATA%/CaniveteDoPailer/vigia_webview.log (uma linha JSON por incidente: processos, CPU, pedidos de mídia recentes,
   o que cada thread do Python fazia);
3. contém: tenta salvar o projeto (veAutosave), mata o renderer mais pesado e, se não adiantar, a árvore inteira, antes que
   o Windows entre em paginação e derrube o PC todo.

Variáveis (para teste): KANIVETE_VIGIA=0 desliga; KANIVETE_VIGIA_ALTO_MB, _CRITICO_MB, _CRESCE_MBS mudam os limites.
"""
import collections
import json
import os
import sys
import threading
import time
import traceback

try:
    import psutil
except Exception:   # sem psutil o vigia simplesmente não existe
    psutil = None


def _env_int(nome, padrao):
    try:
        return int(os.environ.get(nome, padrao))
    except Exception:
        return padrao


ALTO_MB = _env_int("KANIVETE_VIGIA_ALTO_MB", 5000)         # grava incidente
CRITICO_MB = _env_int("KANIVETE_VIGIA_CRITICO_MB", 9000)   # contém
CRESCE_MBS = _env_int("KANIVETE_VIGIA_CRESCE_MBS", 12)     # MB/s sustentados por JANELA_S, acima de CRESCE_MIN_MB
CRESCE_MIN_MB = 2500
JANELA_S = 20
PASSO_S = 3
LIVRE_BAIXO_MB = 1500      # RAM livre do sistema que, com o WebView grande, já é emergência
CONTENCAO_DEPOIS_S = 20    # tempo entre matar o renderer e, se continuar, a árvore toda

_estado = {"thread": None, "contencao": 0.0, "ultimo_incidente": 0.0, "amostras": collections.deque(maxlen=400)}
_fn_salvar = {"f": None}   # callback que pede à página para salvar (definido pelo main)


def arquivo_log():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    pasta = os.path.join(base, "CaniveteDoPailer")
    try:
        os.makedirs(pasta, exist_ok=True)
    except OSError:
        pass
    return os.path.join(pasta, "vigia_webview.log")


def _tipo(p):
    try:
        cmd = p.cmdline()
    except Exception:
        return "?"
    for a in cmd:
        if a.startswith("--type="):
            return a[7:]
    return "navegador"


def _arvore():
    """Processos msedgewebview2 descendentes deste Python (a árvore do WebView2 do app)."""
    try:
        me = psutil.Process(os.getpid())
        return [p for p in me.children(recursive=True) if (p.name() or "").lower().startswith("msedgewebview2")]
    except Exception:
        return []


def _mb(p):
    try:
        m = p.memory_info()
        return (getattr(m, "private", None) or m.rss) / 1048576.0
    except Exception:
        return 0.0


def _pedidos_midia():
    try:
        from Functions import media_server
        return media_server.estatisticas()
    except Exception as e:
        return {"erro": str(e)}


def _threads_python():
    out = {}
    nomes = {t.ident: t.name for t in threading.enumerate()}
    for tid, quadro in sys._current_frames().items():
        pilha = traceback.extract_stack(quadro)[-4:]
        out[nomes.get(tid, str(tid))] = [f"{os.path.basename(f.filename)}:{f.lineno} {f.name}" for f in pilha]
    return out


def _clientes_cdp(procs):
    """Processos de fora ligados à porta de depuração (CDP) do navegador do WebView2: [(pid, nome, linha de comando curta)].
    Em 2026-11-16 o processo principal do WebView foi a 3,5 GB com um cliente playwright preso a uma página ocupada e voltou a
    150 MB no instante em que o cliente morreu."""
    try:
        nav = next((p for p in procs if _tipo(p) == "navegador"), None)
        if not nav:
            return []
        portas = {c.laddr.port for c in nav.net_connections(kind="tcp") if c.status == "LISTEN"}
        meus = {p.pid for p in procs} | {os.getpid()}
        out, vistos = [], set()
        for c in psutil.net_connections(kind="tcp"):
            if c.status == "ESTABLISHED" and c.raddr and c.raddr.port in portas and c.pid and c.pid not in meus and c.pid not in vistos:
                vistos.add(c.pid)
                q = psutil.Process(c.pid)
                out.append((q.pid, q.name(), " ".join(q.cmdline())[:140]))
        return out
    except Exception:
        return []


def _incidente(motivo, procs, total, cresce):
    agora = time.time()
    if agora - _estado["ultimo_incidente"] < 60:
        return
    _estado["ultimo_incidente"] = agora
    linha = {
        "quando": time.strftime("%Y-%m-%d %H:%M:%S"), "motivo": motivo, "total_mb": round(total), "cresce_mb_s": round(cresce, 1),
        "livre_mb": round(psutil.virtual_memory().available / 1048576),
        "processos": [{"pid": p.pid, "tipo": _tipo(p), "mb": round(_mb(p)), "cpu_s": round(sum(p.cpu_times()[:2]), 1)} for p in procs if p.is_running()],
        "python_mb": round(psutil.Process(os.getpid()).memory_info().rss / 1048576),
        "clientes_cdp": _clientes_cdp(procs), "midia": _pedidos_midia(), "threads_python": _threads_python(),
    }
    try:
        with open(arquivo_log(), "a", encoding="utf-8") as f:
            f.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except OSError:
        pass
    print("[vigia] incidente:", motivo, f"{total:.0f} MB", flush=True)


def _pedir_salvar():
    f = _fn_salvar["f"]
    if not f:
        return
    t = threading.Thread(target=lambda: _seguro(f), daemon=True)
    t.start()
    t.join(5)   # página presa não responde: não espera mais que isso


def _seguro(f):
    try:
        f()
    except Exception:
        pass


def _conter(procs, motivo):
    agora = time.time()
    if not _estado["contencao"]:
        _estado["contencao"] = agora
        _pedir_salvar()
        pesado = max(procs, key=_mb)
        if _tipo(pesado) == "navegador":   # o gordo é o processo principal: costuma ser um cliente CDP (playwright) preso
            for pid, nome, cmd in _clientes_cdp(procs):
                if "playwright" in cmd.lower():
                    print(f"[vigia] contenção ({motivo}): encerrando cliente CDP {pid}", flush=True)
                    _seguro(psutil.Process(pid).kill)
            return
        # o mais pesado entre as páginas e a placa; o Chromium recria o processo da placa sozinho
        candidatos = sorted([p for p in procs if _tipo(p) in ("renderer", "gpu-process")], key=_mb, reverse=True)
        alvo = candidatos[0] if candidatos else None
        if alvo:
            print(f"[vigia] contenção ({motivo}): encerrando {_tipo(alvo)} {alvo.pid}", flush=True)
            _seguro(alvo.kill)
        return
    if agora - _estado["contencao"] >= CONTENCAO_DEPOIS_S:
        print(f"[vigia] contenção ({motivo}): encerrando a árvore do WebView2", flush=True)
        for p in sorted(procs, key=_mb, reverse=True):
            _seguro(p.kill)
        _estado["contencao"] = 0.0


GPU_MB = _env_int("KANIVETE_VIGIA_GPU_MB", 2500)   # processo da placa acima disto e crescendo: recria só ele (sem esperar o crítico)


def _gpu_inchada(procs, cresce):
    """Quase todo incidente de 2026-11 foi o gpu-process do WebView2 inchando (1,6 a 4,6 GB) com o app parado em
    playback/prévia. Matar só esse processo é seguro (o Chromium recria sozinho, a página não perde estado) e evita a
    trava de minutos que o pico causava. No máximo uma vez a cada 2 min."""
    agora = time.time()
    if agora - _estado.get("gpu_morta", 0) < 120 or cresce < CRESCE_MBS:
        return
    gpu = [p for p in procs if _tipo(p) == "gpu-process" and _mb(p) >= GPU_MB]
    if gpu:
        _estado["gpu_morta"] = agora
        print(f"[vigia] gpu-process {gpu[0].pid} com {_mb(gpu[0]):.0f} MB crescendo: recriando só ele", flush=True)
        _seguro(gpu[0].kill)


# --- saúde da página: tela branca / página que não responde mais ---------------------------------------------------
_SAUDE = {"url": None, "falhas": 0, "recargas": []}
SAUDE_PASSO_S = 6
SAUDE_FALHAS = 7          # ~45 s sem resposta, com a página parada (CPU baixa), antes de recarregar


def _responde(janela, espera=5.0):
    """True se a página respondeu a um 1+1 dentro do prazo (a chamada roda numa thread: página presa não prende o vigia)."""
    caixa = []

    def _t():
        try:
            caixa.append(janela.evaluate_js("1+1"))
        except Exception:
            caixa.append(None)

    t = threading.Thread(target=_t, daemon=True)
    t.start()
    t.join(espera)
    return bool(caixa) and caixa[0] == 2


def _cpu_renderer(procs):
    try:
        return sum(sum(p.cpu_times()[:2]) for p in procs if _tipo(p) == "renderer")
    except Exception:
        return 0.0


MAX_REINICIOS = 3   # reinícios seguidos (contados pelo ambiente) antes de desistir e deixar como está


def _reiniciar_app(motivo):
    """O navegador do WebView2 morreu (nenhum processo 'navegador' filho): a janela fica branca para sempre, recarregar não
    adianta e a cópia morta ainda segura a instância única (o próximo 'abrir' bate nela). Sobe uma cópia nova com os mesmos
    argumentos/ambiente (que espera esta sair, ver main.py) e encerra esta. Com o app do Pailer, o autosave já cobre o projeto."""
    n = int(os.environ.get("KANIVETE_REINICIOS") or 0)
    if n >= MAX_REINICIOS:
        return False
    try:
        import subprocess
        env = dict(os.environ)
        env["KANIVETE_REINICIO_PID"] = str(os.getpid())
        env["KANIVETE_REINICIOS"] = str(n + 1)
        if getattr(sys, "frozen", False):
            cmd = [sys.executable] + sys.argv[1:]
        else:
            cmd = [sys.executable, os.path.abspath(sys.argv[0])] + sys.argv[1:]
        flags = 0x00000008 | 0x08000000 | 0x00000200   # DETACHED_PROCESS | CREATE_NO_WINDOW | NEW_PROCESS_GROUP
        subprocess.Popen(cmd, env=env, cwd=os.getcwd(), creationflags=flags, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"[vigia] {motivo}: reiniciando o app ({n + 1}/{MAX_REINICIOS})", flush=True)
        try:
            m = sys.modules.get("__main__")
            if m is not None and hasattr(m, "_agente_registrar"):
                m._agente_registrar(sair=True)
        except Exception:
            pass
        time.sleep(0.5)
        os._exit(0)
    except Exception as e:
        print("[vigia] não consegui reiniciar:", e, flush=True)
    return False


def _laco_saude(janela):
    ultimo_cpu = None
    while True:
        time.sleep(SAUDE_PASSO_S)
        try:
            if _responde(janela):
                _SAUDE["falhas"] = 0
                if not _SAUDE["url"]:
                    try:
                        _SAUDE["url"] = janela.get_current_url()
                    except Exception:
                        pass
                ultimo_cpu = None
                continue
            procs = _arvore()
            cpu = _cpu_renderer(procs)
            ocupada = ultimo_cpu is not None and (cpu - ultimo_cpu) > SAUDE_PASSO_S * 0.5   # página gastando CPU = trabalhando
            ultimo_cpu = cpu
            if ocupada:
                _SAUDE["falhas"] = 0   # exportação/cálculo longo no JS: não é tela branca, não mexe
                continue
            _SAUDE["falhas"] += 1
            if _SAUDE["falhas"] >= 3 and not any(_tipo(p) == "navegador" for p in procs):
                # ~20 s sem resposta e sem processo do navegador: morto de vez (não é trabalho pesado nem travada)
                _incidente("WebView2 morreu (tela branca): reiniciando o app", procs, 0, 0.0)
                _reiniciar_app("navegador do WebView2 morto")
            if _SAUDE["falhas"] < SAUDE_FALHAS:
                continue
            agora = time.time()
            _SAUDE["recargas"] = [t for t in _SAUDE["recargas"] if agora - t < 600]
            if len(_SAUDE["recargas"]) >= 3 or not _SAUDE["url"]:   # não fica recarregando em laço
                continue
            _SAUDE["recargas"].append(agora)
            _SAUDE["falhas"] = 0
            _incidente("página sem resposta (tela branca): recarregando", procs, sum(_mb(p) for p in procs), 0.0)
            _estado["ultimo_incidente"] = 0.0
            print("[vigia] página sem resposta: recarregando", flush=True)
            for p in procs:   # renderer preso: sai da frente, o WebView2 cria outro ao recarregar
                if _tipo(p) == "renderer":
                    _seguro(p.kill)
            time.sleep(1.5)
            _seguro(lambda: janela.load_url(_SAUDE["url"]))
        except Exception:
            time.sleep(10)


def _laco():
    amostras = _estado["amostras"]
    while True:
        time.sleep(PASSO_S)
        try:
            procs = _arvore()
            if not procs:
                _estado["contencao"] = 0.0
                continue
            total = sum(_mb(p) for p in procs)
            agora = time.time()
            amostras.append((agora, total))
            cresce = 0.0
            ref = next((a for a in amostras if agora - a[0] <= JANELA_S + PASSO_S and agora - a[0] >= JANELA_S - PASSO_S), None)
            if ref:
                cresce = (total - ref[1]) / max(1.0, agora - ref[0])
            livre = psutil.virtual_memory().available / 1048576
            motivo = None
            critico = False
            if total >= CRITICO_MB:
                motivo, critico = f"WebView em {total:.0f} MB (limite crítico {CRITICO_MB})", True
            elif total >= LIVRE_BAIXO_MB * 2 and livre < LIVRE_BAIXO_MB:
                motivo, critico = f"RAM livre {livre:.0f} MB com WebView em {total:.0f} MB", True
            elif total >= CRESCE_MIN_MB and cresce >= CRESCE_MBS:
                motivo = f"WebView crescendo {cresce:.1f} MB/s ({total:.0f} MB)"
                critico = total >= ALTO_MB
            elif total >= ALTO_MB:
                motivo = f"WebView em {total:.0f} MB (alto)"
            if motivo:
                _incidente(motivo, procs, total, cresce)
                if critico:
                    _conter(procs, motivo)
                else:
                    _gpu_inchada(procs, cresce)
            else:
                _estado["contencao"] = 0.0
        except Exception:
            time.sleep(10)


def iniciar(salvar=None, janela=None):
    """Liga o vigia (uma vez). `salvar`: função que pede à página para salvar o projeto (rodada com 5 s de prazo)."""
    if psutil is None or os.environ.get("KANIVETE_VIGIA") == "0" or _estado["thread"] is not None:
        return False
    _fn_salvar["f"] = salvar
    t = threading.Thread(target=_laco, name="vigia-webview", daemon=True)
    _estado["thread"] = t
    t.start()
    if janela is not None and os.environ.get("KANIVETE_VIGIA_SAUDE") != "0":
        threading.Thread(target=_laco_saude, args=(janela,), name="vigia-saude", daemon=True).start()
    return True
