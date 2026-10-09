"""Ponte Kanivete ↔ Premiere Pro: conversa com o plugin UXP "Kanivete Ponte" (guia: Instructions/agente/ponte-premiere.md)
(tools/ponte_premiere/plugin — carregar uma vez pelo Adobe UXP Developer Tools: Add Plugin → manifest.json → Load).

    (linha de comando: tools/ponte_premiere.py, que chama este módulo)
    py -3.13 tools/ponte_premiere.py servidor               # (sem uso: o UXP nega http local) 127.0.0.1:8765
    py -3.13 tools/ponte_premiere.py info                   # comandos: info, efeitos_audio, ler_audio, aplicar_efeito,
    py -3.13 tools/ponte_premiere.py aplicar_efeito '{"t":0,"i":0,"nome":"Highpass","valores":{"Cutoff":120}}'
    py -3.13 tools/ponte_premiere.py js "return await ppro.AudioFilterFactory.getDisplayNames()"

O plugin pergunta /proximo (espera até 20 s), roda e devolve em /resposta; o cliente manda em /enviar e espera a
resposta. Sem dependências: http.server da biblioteca padrão."""
import json
import queue
import sys
import threading
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTA = 8765
_fila = queue.Queue()
_respostas = {}
_cond = threading.Condition()


class _H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, cod, obj=None):
        corpo = b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(cod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}")

    def do_GET(self):
        if self.path.startswith("/proximo"):
            try:
                self._json(200, _fila.get(timeout=20))
            except queue.Empty:
                self._json(204)
        elif self.path.startswith("/estado"):
            self._json(200, {"ok": True, "fila": _fila.qsize()})
        else:
            self._json(404, {"erro": "?"})

    def do_POST(self):
        if self.path.startswith("/resposta"):
            r = self._corpo()
            with _cond:
                _respostas[r.get("id")] = r
                _cond.notify_all()
            self._json(200, {"ok": True})
        elif self.path.startswith("/enviar"):
            p = self._corpo()
            p["id"] = uuid.uuid4().hex
            _fila.put(p)
            with _cond:
                if not _cond.wait_for(lambda: p["id"] in _respostas, timeout=float(p.get("espera") or 120)):
                    return self._json(504, {"ok": False, "erro": "o plugin não respondeu (Premiere aberto e plugin carregado?)"})
                self._json(200, _respostas.pop(p["id"]))
        else:
            self._json(404, {"erro": "?"})


def servidor():
    s = ThreadingHTTPServer(("127.0.0.1", PORTA), _H)
    print(f"ponte Premiere em http://127.0.0.1:{PORTA} (Ctrl+C para parar)", flush=True)
    s.serve_forever()


PASTA = r"D:\kanivete_testes\ponte_premiere"


def enviar(cmd, args=None, espera=120):
    """Manda um comando ao plugin pela PASTA (pedido_<id>.json → resposta_<id>.json; o UXP nega http local) e
    devolve {"ok", "resultado"|"erro"}. Não precisa do servidor."""
    import os
    import time
    os.makedirs(PASTA, exist_ok=True)
    pid = f"{time.strftime('%H%M%S')}_{uuid.uuid4().hex[:8]}"
    tmp = os.path.join(PASTA, f"pedido_{pid}.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"id": pid, "cmd": cmd, "args": args or {}}, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(PASTA, f"pedido_{pid}.json"))
    resp = os.path.join(PASTA, f"resposta_{pid}.json")
    fim = time.time() + espera
    while time.time() < fim:
        if os.path.isfile(resp):
            with open(resp, encoding="utf-8") as f:
                r = json.load(f)
            os.remove(resp)
            return r
        time.sleep(0.1)
    pedido = os.path.join(PASTA, f"pedido_{pid}.json")
    if os.path.isfile(pedido):
        os.remove(pedido)
    return {"ok": False, "erro": "o plugin não respondeu (Premiere aberto e painel Kanivete Ponte aberto?)"}


def enviar_rede(cmd, args=None, espera=120):
    """Manda um comando ao plugin (pelo servidor) e devolve {"ok", "resultado"|"erro"}."""
    dados = json.dumps({"cmd": cmd, "args": args or {}, "espera": espera}).encode("utf-8")
    req = urllib.request.Request(f"http://127.0.0.1:{PORTA}/enviar", data=dados, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=espera + 5) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8") or '{"ok": false}')


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if len(sys.argv) < 2 or sys.argv[1] == "servidor":
        servidor()
    else:
        cmd = sys.argv[1]
        arg = sys.argv[2] if len(sys.argv) > 2 else None
        if cmd == "importar":   # py -3.13 tools/ponte_premiere.py importar "projeto.xml"
            print(json.dumps(importar(arg), ensure_ascii=False, indent=1))
            sys.exit(0)
        args = {"codigo": arg} if cmd == "js" else (json.loads(arg) if arg else {})
        print(json.dumps(enviar(cmd, args), ensure_ascii=False, indent=1))


# ── volta Kanivete → Premiere: importa o XML no projeto aberto do Premiere e aplica os efeitos de áudio ──
_JS_IMPORTAR = r"""
const B = String.fromCharCode(92);
const XML = __PARTES__.join(B);
const EF = __EF__;
const projeto = await ppro.Project.getActiveProject();
if (!projeto) throw new Error('nenhum projeto aberto no Premiere');
if (__SO_TESTE__ && !projeto.path.includes('kanivete_testes')) throw new Error('projeto errado (teste): ' + projeto.path);
const antes = new Set((await projeto.getSequences()).map(s => s.guid ? String(s.guid) : s.name));
const ok = await projeto.importFiles([XML], true);
const novas = (await projeto.getSequences()).filter(s => !antes.has(s.guid ? String(s.guid) : s.name));
const log = { importou: ok, novas: novas.map(s => s.name), aplicados: 0, falhas: [] };
for (const [nome, itens] of Object.entries(EF)) {
  const seq = novas.find(s => s.name === nome) || novas.find(s => s.name.startsWith(nome)) || novas[0];
  if (!seq) { log.falhas.push('sequência não achada: ' + nome); continue; }
  const nT = await seq.getAudioTrackCount();
  for (const it of itens) {
    let alvo = null;
    for (const t of [it.t, ...Array.from({ length: nT }, (_, k) => k)]) {
      if (t >= nT) continue;
      for (const c of await h.clipesAudio(seq, t)) {
        if (Math.abs((await c.getStartTime()).seconds - it.ini) < 0.05) { alvo = c; break; }
      }
      if (alvo) break;
    }
    if (!alvo) { log.falhas.push(`clipe não achado: A${it.t + 1} em ${it.ini}s`); continue; }
    for (const ef of it.efeitos) {
      try {
        const comp = await ppro.AudioFilterFactory.createComponentByDisplayName(ef.nome, alvo);
        const cadeia = await alvo.getComponentChain();
        let feito = false;
        projeto.lockedAccess(() => { feito = projeto.executeTransaction(ca => ca.addAction(cadeia.createAppendComponentAction(comp)), 'Kanivete: ' + ef.nome); });
        if (!feito) throw new Error('recusado');
        const c2 = await alvo.getComponentChain(), idx = c2.getComponentCount() - 1;
        let erro = null;
        projeto.lockedAccess(() => {
          try {
            const k = c2.getComponentAtIndex(idx), acoes = [];
            for (const [i, v] of Object.entries(ef.valores)) {
              const p = k.getParam(+i);
              if (p) acoes.push(p.createSetValueAction(p.createKeyframe(typeof v === 'boolean' ? v : +v), true));
            }
            if (acoes.length) projeto.executeTransaction(ca => acoes.forEach(a => ca.addAction(a)), 'Kanivete: valores');
          } catch (e) { erro = e; }
        });
        if (erro) throw erro;
        log.aplicados++;
      } catch (e) { log.falhas.push(`${ef.nome} em A${it.t + 1} ${it.ini}s: ${e}`); }
    }
  }
}
return log;
"""


def importar(xml, so_teste=False, espera=600):
    """Importa no Premiere o XML exportado pelo Kanivete (Arquivo › Exportar para o Premiere) e aplica os efeitos de
    áudio do .kanivete-efeitos.json ao lado. so_teste: recusa se o projeto ativo não for de D:/kanivete_testes."""
    import os
    xml = os.path.abspath(xml)
    lado = os.path.splitext(xml)[0] + ".kanivete-efeitos.json"
    ef = json.load(open(lado, encoding="utf-8"))["sequencias"] if os.path.exists(lado) else {}
    partes = xml.replace("/", "\\").split("\\")
    codigo = (_JS_IMPORTAR.replace("__PARTES__", json.dumps(partes)).replace("__EF__", json.dumps(ef))
              .replace("__SO_TESTE__", "true" if so_teste else "false"))
    return enviar("js", {"codigo": codigo}, espera=espera)
