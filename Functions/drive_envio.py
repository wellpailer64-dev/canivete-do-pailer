"""Envio automático de um arquivo pronto (render da fila) para uma pasta do Google Drive, com progresso.

Usa o rclone e a conexão "gdrive" do Baixar do Drive (gdrive_dumper). Antes de subir confere se a conta pode gravar na
pasta (um arquivo-teste vazio, apagado em seguida): a pasta de outra pessoa compartilhada só para ver recusava no FIM
do envio (403 insufficientParentPermissions, GaIA 2026-10-14) — agora avisa em segundos.

iniciar(arquivo, link) -> {success, id}; estado(id) -> {fase, pct, enviado, total, vel, eta, erro, link}; cancelar(id).
fase: 'conferindo' → 'enviando' → 'pronto' | 'erro' | 'cancelado'.
"""
import json
import os
import subprocess
import threading
import time

from Functions import gdrive_dumper as gd

_ENVIOS = {}
_SEQ = [0]
_TRAVA = threading.Lock()


def _rodar(args, timeout=60):
    return subprocess.run([gd._rclone_exe()] + args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=timeout, creationflags=gd._no_window())


def _explicar(texto):
    t = texto or ""
    if "insufficientParentPermissions" in t or "insufficientFilePermissions" in t or "403" in t:
        return "a sua conta do Google não tem permissão de EDITAR essa pasta (peça acesso de editor ao dono)"
    if "404" in t or "notFound" in t or "File not found" in t:
        return "pasta não encontrada (o link está certo e a pasta foi compartilhada com a sua conta?)"
    try:
        return gd._explicar_erro(t) or t.strip()[-300:]
    except Exception:
        return t.strip()[-300:]


def _conferir(pasta):
    """Pode gravar na pasta? Cria e apaga um arquivo vazio. Devolve None (ok) ou o erro explicado."""
    nome = f".kanivete_teste_{int(time.time())}"
    r = _rodar(["touch", f"gdrive:{nome}", "--drive-root-folder-id", pasta], 60)
    if r.returncode != 0:
        return _explicar(r.stderr)
    _rodar(["deletefile", f"gdrive:{nome}", "--drive-root-folder-id", pasta, "--drive-use-trash=false"], 60)
    return None


def _trabalho(env):
    pasta, arq = env["pasta"], env["arquivo"]
    try:
        ok, err = gd.garantir_conexao()
        if not ok:
            raise RuntimeError("sem conexão com o Google Drive: " + str(err or "conecte em Baixar do Drive"))
        erro = _conferir(pasta)
        if erro:
            raise RuntimeError(erro)
        if env["cancelar"]:
            env["fase"] = "cancelado"; return
        env["fase"] = "enviando"
        cmd = [gd._rclone_exe(), "copy", arq, "gdrive:", "--drive-root-folder-id", pasta, "--transfers", "1",
               "--drive-chunk-size", "64M", "--retries", "3", "--low-level-retries", "20",
               "--stats", "1s", "--use-json-log", "-v", "--stats-log-level", "NOTICE"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
                                errors="replace", creationflags=gd._no_window())
        env["proc"] = proc
        ultimo = ""
        for linha in proc.stderr:
            ultimo = linha if '"level":"error"' in linha else ultimo
            try:
                j = json.loads(linha)
            except Exception:
                continue
            st = j.get("stats")
            if st and st.get("totalBytes"):
                env["enviado"], env["total"] = st.get("bytes", 0), st["totalBytes"]
                env["pct"] = min(99.9, 100.0 * env["enviado"] / max(1, env["total"]))
                env["vel"], env["eta"] = st.get("speed") or 0, st.get("eta")
        proc.wait()
        if env["cancelar"]:
            env["fase"] = "cancelado"; return
        if proc.returncode != 0:
            raise RuntimeError(_explicar(ultimo))
        # link do arquivo (sem mexer no compartilhamento: quem vê a pasta vê o arquivo)
        r = _rodar(["lsjson", "gdrive:", "--drive-root-folder-id", pasta, "--files-only",
                    "--include", "/" + os.path.basename(arq).replace("[", "\\[").replace("]", "\\]")], 60)
        try:
            fid = next(x.get("ID") for x in json.loads(r.stdout or "[]") if x.get("Name") == os.path.basename(arq))
            env["link"] = f"https://drive.google.com/file/d/{fid}/view"
        except Exception:
            env["link"] = f"https://drive.google.com/drive/folders/{pasta}"
        env["pct"], env["fase"] = 100.0, "pronto"
    except Exception as e:
        env["fase"], env["erro"] = "erro", str(e)
    finally:
        env["fim"] = time.time()
        env.pop("proc", None)


def iniciar(arquivo, link):
    tipo, pasta = gd.parse_link(link)
    if tipo != "folder" or not pasta:
        return {"success": False, "error": "cole o link de uma PASTA do Google Drive"}
    if not arquivo or not os.path.isfile(arquivo):
        return {"success": False, "error": "arquivo não encontrado: " + str(arquivo)}
    with _TRAVA:
        _SEQ[0] += 1
        eid = _SEQ[0]
    env = {"id": eid, "arquivo": arquivo, "pasta": pasta, "fase": "conferindo", "pct": 0.0, "enviado": 0,
           "total": os.path.getsize(arquivo), "vel": 0, "eta": None, "erro": None, "link": None, "cancelar": False,
           "inicio": time.time(), "fim": None}
    _ENVIOS[eid] = env
    threading.Thread(target=_trabalho, args=(env,), daemon=True).start()
    return {"success": True, "id": eid}


def estado(eid):
    env = _ENVIOS.get(int(eid))
    if not env:
        return {"success": False, "error": "envio não encontrado"}
    return {"success": True, **{k: v for k, v in env.items() if k not in ("proc", "cancelar")}}


def cancelar(eid):
    env = _ENVIOS.get(int(eid))
    if not env:
        return {"success": False}
    env["cancelar"] = True
    p = env.get("proc")
    if p:
        try:
            gd._matar(p)
        except Exception:
            p.kill()
    return {"success": True}


def validar_link(link):
    tipo, pasta = gd.parse_link(link)
    return {"success": tipo == "folder", "pasta": pasta}
