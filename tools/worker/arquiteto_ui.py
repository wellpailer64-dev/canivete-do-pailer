"""Interface local do Arquiteto B.

Abre um painel web em 127.0.0.1 para conversar com tools/worker/arquiteto.py
sem entrar no Canivete. Nao substitui o Claude; serve como bancada local.
"""
import json
import os
import queue
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ARQ = os.path.join(RAIZ, "tools", "worker", "arquiteto.py")
SAIDA = r"D:\kanivete_testes\arquiteto_local"
JOBS = {}


def ollama_modelos():
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2) as r:
            return [m.get("name") for m in json.load(r).get("models", []) if m.get("name")]
    except Exception:
        return []


def abrir_path(path):
    try:
        if path and os.path.exists(path):
            os.startfile(path if os.path.isdir(path) else os.path.dirname(path))
            return True
    except Exception:
        pass
    return False


def salvar_upload(nome, b64):
    import base64
    pasta = os.path.join(SAIDA, "uploads")
    os.makedirs(pasta, exist_ok=True)
    seguro = "".join(c if c.isalnum() or c in "._-" else "_" for c in os.path.basename(nome or "referencia.png"))
    path = os.path.join(pasta, time.strftime("%Y%m%d_%H%M%S_") + seguro)
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64.split(",", 1)[-1]))
    return path


class Job:
    def __init__(self, spec):
        self.id = time.strftime("job_%Y%m%d_%H%M%S")
        self.spec = spec
        self.q = queue.Queue()
        self.lines = []
        self.done = False
        self.code = None
        self.started = time.time()
        self.files = {}
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def log(self, line):
        self.lines.append(line)
        if len(self.lines) > 800:
            self.lines = self.lines[-500:]
        self.q.put(line)
        self._capture_files(line)

    def _capture_files(self, line):
        s = line.strip()
        for k in ("html", "meta", "salvar", "contrato"):
            prefix = k + "   :"
            if s.startswith(prefix) or s.startswith(k + " :"):
                self.files[k] = s.split(":", 1)[1].strip()

    def command(self):
        spec = self.spec
        cmd = [sys.executable, ARQ, spec.get("modo") or "cena", spec.get("pedido") or ""]
        for k in ("perfil", "modelo", "formato"):
            v = spec.get(k)
            if v:
                cmd += [f"--{k}", str(v)]
        if spec.get("slides"):
            cmd += ["--slides", str(spec["slides"])]
        for k in ("documento", "exportar", "saida"):
            v = spec.get(k)
            if v:
                cmd += [f"--{k}", str(v)]
        if spec.get("executar"):
            cmd.append("--executar")
        if spec.get("pensar"):
            cmd.append("--pensar")
        return cmd

    def run(self):
        self.log("$ " + " ".join('"' + c + '"' if " " in c else c for c in self.command()))
        try:
            p = subprocess.Popen(self.command(), cwd=RAIZ, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 text=True, encoding="utf-8", errors="replace", bufsize=1)
            assert p.stdout is not None
            for line in p.stdout:
                self.log(line.rstrip())
            self.code = p.wait()
            self.log("Concluido." if self.code == 0 else f"Falhou com codigo {self.code}.")
        except Exception as e:
            self.code = 1
            self.log("Erro: " + str(e))
        self.done = True
        self.q.put(None)

    def snapshot(self, cursor=0):
        new = self.lines[cursor:]
        return {"id": self.id, "done": self.done, "code": self.code, "cursor": len(self.lines),
                "lines": new, "files": self.files, "seconds": round(time.time() - self.started, 1)}


HTML = r"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arquiteto Local B</title>
<style>
:root{color-scheme:dark;--bg:#111;--panel:#181818;--panel2:#202020;--line:#333;--txt:#f1f1f1;--mut:#aaa;--acc:#ff8a3c;--ok:#54d17a}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.45 Segoe UI,Arial,sans-serif;height:100vh;display:grid;grid-template-columns:340px 1fr}
aside{background:#0d0d0d;border-right:1px solid var(--line);padding:18px;overflow:auto} main{display:grid;grid-template-rows:auto 1fr auto;height:100vh}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--mut);margin-bottom:18px}.group{margin:16px 0}.label{display:block;color:#ddd;font-weight:600;margin:0 0 6px}
select,input,textarea{width:100%;background:#101010;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:10px;font:inherit}
textarea{min-height:96px;resize:vertical}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.checks{display:flex;gap:14px;flex-wrap:wrap;color:#ddd}
button{border:0;border-radius:8px;background:var(--acc);color:#111;font-weight:700;padding:10px 14px;cursor:pointer}button.secondary{background:#2a2a2a;color:#eee;border:1px solid var(--line)}button:disabled{opacity:.5;cursor:not-allowed}
.chat{padding:18px;overflow:auto}.msg{max-width:920px;margin:0 0 14px;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.msg.user{background:#24190f;border-color:#543116}.msg b{color:#fff}
.process{position:sticky;top:0;z-index:5;max-width:920px;margin:0 0 14px;padding:14px;border:1px solid #4b321e;border-radius:8px;background:linear-gradient(180deg,#20170f,#15110d);box-shadow:0 12px 34px rgba(0,0,0,.35)}
.process[hidden]{display:none}.processTop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.processTitle{font-weight:800;color:#fff}.processSub{color:var(--mut);font-size:12px;margin-top:2px}.processPct{font:800 22px/1 Consolas,monospace;color:var(--acc)}
.processBar{height:10px;background:#2a2a2a;border-radius:999px;overflow:hidden;margin:12px 0}.processFill{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff8a3c,#ffc36c);transition:width .2s}
.processMeta{display:flex;gap:8px;flex-wrap:wrap}.processEvents{margin-top:10px;color:#ddd;font:12px/1.45 Consolas,monospace;max-height:112px;overflow:auto}.processEvents div{padding:2px 0;border-top:1px solid rgba(255,255,255,.06)}
.log{white-space:pre-wrap;font-family:Consolas,monospace;color:#ddd;background:#080808;border-top:1px solid var(--line);padding:12px;max-height:32vh;overflow:auto}
.bar{height:8px;background:#2a2a2a;border-radius:999px;overflow:hidden;margin-top:10px}.fill{height:100%;width:0;background:var(--acc);transition:.2s}
.composer{border-top:1px solid var(--line);padding:14px;display:grid;grid-template-columns:1fr auto;gap:10px;background:#151515}.composer textarea{min-height:52px}
.files{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pill{background:#252525;border:1px solid var(--line);border-radius:999px;padding:6px 10px;color:#ddd}
.hint{font-size:12px;color:var(--mut);margin-top:6px}.status{color:var(--mut)}
</style>
</head>
<body>
<aside>
  <h1>Arquiteto Local B</h1>
  <div class="sub">Bancada local. Claude continua sendo o mestre.</div>
  <div class="group"><label class="label">Motor</label><select id="perfil"><option value="rapido">Local rapido (qwen3:8b)</option><option value="equilibrado" selected>Local equilibrado (14B quantizado)</option><option value="forte">Local forte (qwen3:14b)</option><option value="claude">Preparar para Claude</option></select></div>
  <div class="group"><label class="label">Modelo exato</label><select id="modelo"><option value="auto">auto</option></select><div class="hint">Use auto quase sempre.</div></div>
  <div class="group"><label class="label">Tarefa</label><select id="modo"><option value="cena">Criar flyer/carrossel</option><option value="contrato">Ajustar .iknv existente</option></select></div>
  <div class="group row"><div><label class="label">Formato</label><select id="formato"><option value="feed">feed 1080x1350</option><option value="retrato">retrato 1080x1440</option><option value="story">story</option><option value="quadrado">quadrado</option></select></div><div><label class="label">Slides</label><input id="slides" type="number" min="1" max="12" value="1"></div></div>
  <div class="group"><label class="label">Referencia (print/caminho)</label><input id="referencia" placeholder="D:\referencias\ref.png"><input id="refFile" type="file" accept="image/*" onchange="uploadRef()" style="margin-top:8px"></div>
  <div class="group"><label class="label">Pasta de materiais</label><input id="materiais" placeholder="D:\materiais\cliente"></div>
  <div class="group"><label class="label">Documento .iknv</label><input id="documento" placeholder="D:\pecas\post.iknv"></div>
  <div class="group"><label class="label">Exportar em</label><input id="exportar" placeholder="D:\kanivete_testes\arquiteto_local\export"></div>
  <div class="group checks"><label><input id="executar" type="checkbox" checked> executar</label><label><input id="pensar" type="checkbox"> pensar mais</label></div>
  <button class="secondary" onclick="prepClaude()">Preparar briefing para Claude</button>
  <div class="hint">Para qualidade final, use o briefing e cole no chat do Claude.</div>
</aside>
<main>
  <div class="chat" id="chat">
    <div class="process" id="process" hidden>
      <div class="processTop">
        <div>
          <div class="processTitle" id="procTitle">Processando</div>
          <div class="processSub" id="procSub">Aguardando inicio...</div>
        </div>
        <div class="processPct" id="procPct">0%</div>
      </div>
      <div class="processBar"><span class="processFill" id="procFill"></span></div>
      <div class="processMeta">
        <span class="pill" id="procMotor">motor</span>
        <span class="pill" id="procModelo">modelo</span>
        <span class="pill" id="procTempo">0s</span>
      </div>
      <div class="processEvents" id="procEvents"></div>
    </div>
    <div class="msg"><b>Pronto.</b><br>Descreva o que quer criar ou ajustar. Para rascunho rapido, use Local rapido.</div>
  </div>
  <div class="log" id="log"></div>
  <div class="composer">
    <textarea id="pedido" placeholder="Ex: carrossel de 3 slides sobre erros no Instagram, visual forte, sem imagem gerada..."></textarea>
    <button id="run" onclick="run()">Enviar</button>
  </div>
</main>
<script>
let job=null,cursor=0,timer=null,lastSpec=null,hist=[],procStarted=0,procTimer=null,procLines=[];
const el=id=>document.getElementById(id);
function addMsg(html, cls=''){const d=document.createElement('div');d.className='msg '+cls;d.innerHTML=html;el('chat').appendChild(d);el('chat').scrollTop=el('chat').scrollHeight}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function pctFrom(line){const m=String(line).match(/\]\s*(\d+)%/);return m?+m[1]:null}
function clock(){if(!procStarted)return;el('procTempo').textContent=Math.floor((Date.now()-procStarted)/1000)+'s'}
function setPct(p){p=Math.max(0,Math.min(100,p));el('procPct').textContent=p+'%';el('procFill').style.width=p+'%'}
function stageFrom(line){
  const s=String(line).toLowerCase();
  if(s.startsWith('$'))return 'comando preparado';
  if(s.includes('pedido recebido'))return 'pedido recebido';
  if(s.includes('planejando'))return 'planejando HTML/CSS';
  if(s.includes('modelo local'))return 'carregando modelo';
  if(s.includes('pensando com'))return 'modelo pensando';
  if(s.includes('html recebido'))return 'HTML recebido';
  if(s.includes('arquivos salvos'))return 'arquivos salvos';
  if(s.includes('montando'))return 'montando no Photo Kanivete';
  if(s.includes('preview')||s.includes('previa'))return 'gerando previa';
  if(s.includes('revisor'))return 'revisando contraste e leitura';
  if(s.includes('concluido'))return 'concluido';
  if(s.includes('falhou')||s.includes('erro:'))return 'falhou';
  if(s.includes('aviso'))return 'aviso tecnico';
  return '';
}
function showProcess(s, raw){
  el('process').hidden=false;procStarted=Date.now();procLines=[];setPct(0);clock();
  el('procTitle').textContent='Trabalhando no pedido';
  el('procSub').textContent=raw.length>90?raw.slice(0,87)+'...':raw;
  el('procMotor').textContent='motor: '+(s.perfil||'auto');
  el('procModelo').textContent='modelo: '+((s.modelo&&s.modelo!=='auto')?s.modelo:'auto');
  el('procEvents').innerHTML='';
  if(procTimer)clearInterval(procTimer);
  procTimer=setInterval(clock,1000);
}
function processLine(line){
  const p=pctFrom(line);if(p!==null)setPct(p);
  const stage=stageFrom(line);if(!stage)return;
  el('procTitle').textContent=stage;
  procLines.push((new Date()).toLocaleTimeString()+': '+line.replace(/\[[#-]+\]\s*/,''));
  procLines=procLines.slice(-7);
  el('procEvents').innerHTML=procLines.map(x=>'<div>'+esc(x)+'</div>').join('');
  el('procEvents').scrollTop=el('procEvents').scrollHeight;
}
function finishProcess(j){
  if(procTimer)clearInterval(procTimer);
  clock();setPct(j.code===0?100:Math.max(1,pctFrom((j.lines||[]).at(-1)||'')||0));
  el('procTitle').textContent=j.code===0?'Concluido':'Falhou';
  el('procSub').textContent=(j.seconds||0)+'s de trabalho local';
}
async function loadModels(){const r=await fetch('/api/models');const j=await r.json();for(const m of j.models){const o=document.createElement('option');o.value=m;o.textContent=m;el('modelo').appendChild(o)}}
function spec(){let pedido=el('pedido').value.trim();const ref=el('referencia').value.trim(), mat=el('materiais').value.trim();if(hist.length)pedido=`Contexto anterior:\n${hist.slice(-6).join('\n')}\n\nPedido atual:\n${pedido}`;if(ref)pedido+=`\nReferencia: ${ref}`;if(mat)pedido+=`\nMateriais: ${mat}`;return {pedido,modo:el('modo').value,perfil:el('perfil').value,modelo:el('modelo').value,formato:el('formato').value,slides:+el('slides').value||1,documento:el('documento').value.trim(),exportar:el('exportar').value.trim(),executar:el('executar').checked,pensar:el('pensar').checked}}
async function run(){const raw=el('pedido').value.trim();const s=spec();if(!raw)return; if(s.perfil==='claude'){prepClaude();return} lastSpec=s;hist.push('Usuario: '+raw);addMsg(esc(raw),'user');showProcess(s,raw);el('pedido').value='';el('log').textContent='';el('run').disabled=true;cursor=0;const r=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});const j=await r.json();job=j.id;timer=setInterval(poll,700)}
async function poll(){if(!job)return;const r=await fetch(`/api/job/${job}?cursor=${cursor}`);const j=await r.json();cursor=j.cursor;for(const l of j.lines){el('log').textContent+=l+'\n';processLine(l)}el('log').scrollTop=el('log').scrollHeight;if(j.done){clearInterval(timer);el('run').disabled=false;finishProcess(j);let files=Object.entries(j.files||{}).map(([k,v])=>`<span class="pill">${k}: ${esc(v)}</span>`).join('');hist.push(`Resultado: ${j.code===0?'concluido':'falhou'} em ${j.seconds}s`);addMsg(`<b>${j.code===0?'Concluido':'Falhou'}</b><br><span class="status">${j.seconds}s</span><div class="files">${files}</div>`);job=null}}
function prepClaude(){const s=lastSpec||spec();const txt=`Claude, quero usar o Canivete como arquiteto principal.\n\nPedido:\n${s.pedido}\n\nFormato: ${s.formato}, slides: ${s.slides}\nReferencia: ${el('referencia').value.trim()||'(nenhuma)'}\nMateriais: ${el('materiais').value.trim()||'(nenhum)'}\nDocumento: ${s.documento||'(novo)'}\nExportar em: ${s.exportar||'(definir se precisar)'}\n\nQuero qualidade final. Pode refazer com KNV.cena/Worker e usar o fluxo do Canivete.`;navigator.clipboard.writeText(txt).then(()=>addMsg('<b>Briefing copiado.</b><br>Cole no chat do Claude quando quiser qualidade final.'))}
async function uploadRef(){const f=el('refFile').files[0];if(!f)return;const rd=new FileReader();rd.onload=async()=>{const r=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,data:rd.result})});const j=await r.json();if(j.path){el('referencia').value=j.path;addMsg('<b>Referencia anexada.</b><br>'+j.path)}};rd.readAsDataURL(f)}
loadModels();
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, data, ctype="application/json"):
        raw = data.encode("utf-8") if isinstance(data, str) else json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            return self._send(200, HTML, "text/html")
        if path == "/api/models":
            return self._send(200, {"models": ollama_modelos()})
        if path.startswith("/api/job/"):
            jid = path.rsplit("/", 1)[-1]
            cur = 0
            if "cursor=" in self.path:
                try:
                    cur = int(self.path.split("cursor=", 1)[1].split("&", 1)[0])
                except Exception:
                    cur = 0
            job = JOBS.get(jid)
            return self._send(200, job.snapshot(cur) if job else {"error": "job nao encontrado"})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        data = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        if self.path == "/api/run":
            job = Job(data)
            JOBS[job.id] = job
            return self._send(200, {"id": job.id})
        if self.path == "/api/upload":
            return self._send(200, {"path": salvar_upload(data.get("name"), data.get("data", ""))})
        self._send(404, {"error": "not found"})

    def log_message(self, *args):
        return


def main():
    port = 8765
    for p in range(port, port + 20):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            port = p
            break
        except OSError:
            continue
    else:
        raise SystemExit("sem porta livre")
    url = f"http://127.0.0.1:{port}"
    print("Arquiteto Local B:", url, flush=True)
    webbrowser.open(url)
    srv.serve_forever()


if __name__ == "__main__":
    main()
