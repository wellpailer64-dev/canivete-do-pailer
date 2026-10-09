"""Aplica mudanças no app ABERTO sem recarregar a página (o projeto, as janelas soltas e o Ctrl+Z continuam).

  py -3.13 tools/aplicar.py frontend/js/editor-marcadores.js [mais.js ...] [frontend/css/x.css] [--py] [--porta 9222]

JS: cada função de nível de topo (`function nome(` / `async function nome(` na coluna 0, até o `}` na coluna 0) é
redefinida na página principal — a próxima chamada já usa o código novo. Constante NOVA de nível de topo
(`const X = ...;`) é criada; constante que JÁ EXISTE não é tocada (guarda estado: VE, VEMK...) — se o valor dela
mudou, avisa (aí só reabrindo o app). Redesenha o editor no fim.
CSS: troca o <link> do arquivo por um com ?v=hora (só o estilo recarrega).
--py: recarrega Functions.* pela ponte vk_recarregar (vale rodando pelo código, `python main.py`; o .exe guarda os
módulos dentro dele e continua com os antigos até o próximo build).
Ao contrário de tools/recarregar.py, pode rodar no app do usuário."""
import argparse, json, os, re, subprocess, sys
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = r"D:\kanivete_testes\aplicar_cache"


def _crases(linhas):
    """Crases que abrem/fecham texto `...` (as que estão dentro de '...' ou "..." não contam)."""
    return sum(re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"", "", l).count("`") for l in linhas)


def blocos(src):
    """Funções e constantes de nível de topo: [(tipo, nome, texto)]."""
    linhas, out, i = src.split("\n"), [], 0
    while i < len(linhas):
        l = linhas[i]
        m = re.match(r"^(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(", l)
        c = re.match(r"^(?:const|let|var)\s+([\w$]+)\s*=", l)
        if m or c:
            # termina antes da próxima linha que começa na coluna 0 com código/comentário (fecho `}` `};` `]);` fica)
            j = i + 1
            while j < len(linhas) and (not re.match(r"[A-Za-z_$/@]", linhas[j][:1])
                                       or (c and _crases(linhas[i:j]) % 2)):   # dentro de texto `...` (shader)
                j += 1
            k = j - 1
            while k > i and not linhas[k].strip():
                k -= 1
            out.append(("f" if m else "c", (m or c).group(1), "\n".join(linhas[i:k + 1])))
            i = j
            continue
        i += 1
    return out


def base(rel):
    """Versão anterior do arquivo: a última aplicada (cache) ou a do git (HEAD)."""
    arq = os.path.join(CACHE, rel.replace("/", "__").replace("\\", "__"))
    if os.path.isfile(arq):
        return open(arq, encoding="utf-8").read()
    r = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
    return r.stdout if r.returncode == 0 else ""


JS = """({fns, consts}) => {
    const r = { funcoes: 0, novas: [], mantidas: [], erros: [] };
    for (const [nome, txt] of fns) {
        try { (0, eval)(txt); r.funcoes++; } catch (e) { r.erros.push(nome + ': ' + e.message); }
    }
    for (const [nome, txt] of consts) {
        let existe = true;
        try { (0, eval)(nome); } catch (e) { existe = false; }
        if (existe) { r.mantidas.push(nome); continue; }
        try { window[nome] = (0, eval)('(' + txt.replace(/^(?:const|let|var)\\s+[\\w$]+\\s*=\\s*/, '').replace(/;\\s*(\\/\\/.*)?$/, '') + ')'); r.novas.push(nome); }
        catch (e) { r.erros.push(nome + ': ' + e.message); }
    }
    try { if (typeof veDraw === 'function' && VE.ready) veDraw(); } catch (e) {}
    return r;
}"""

ap = argparse.ArgumentParser()
ap.add_argument("arquivos", nargs="*")
ap.add_argument("--py", action="store_true")
ap.add_argument("--porta", type=int, default=9222)
ap.add_argument("--so", default="", help="só estas funções/constantes (nomes separados por vírgula): não leva junto mudanças de outros no mesmo arquivo")
a = ap.parse_args()
os.makedirs(CACHE, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{a.porta}")
    pg = next(x for c in b.contexts for x in c.pages
              if "index.html" in x.url and x.evaluate("typeof switchTool === 'function' && !!window.pywebview"))
    if a.py:
        r = pg.evaluate("() => pywebview.api.vk_recarregar ? pywebview.api.vk_recarregar() : null")
        print("py:", json.dumps(r and {k: r[k] for k in ("recarregados", "erros")}, ensure_ascii=False))
    for arq in a.arquivos:
        caminho = os.path.join(RAIZ, arq) if not os.path.isabs(arq) else arq
        rel = os.path.relpath(caminho, RAIZ).replace("\\", "/")
        src = open(caminho, encoding="utf-8").read()
        if rel.endswith(".css"):
            nome = os.path.basename(rel)
            n = pg.evaluate("""n => { let k = 0; document.querySelectorAll('link[rel=stylesheet]').forEach(l => {
                if (l.href.split('?')[0].endsWith('/' + n)) { l.href = l.href.split('?')[0] + '?v=' + Date.now(); k++; } }); return k; }""", nome)
            print(f"{rel}: estilo recarregado ({n} link)")
            continue
        novo, velho = blocos(src), {(t, n): x for t, n, x in blocos(base(rel))}
        so = {s.strip() for s in a.so.split(",") if s.strip()}
        if so:
            novo = [b for b in novo if b[1] in so]
            faltam = so - {b[1] for b in novo}
            if faltam:
                print(f"{rel}: não achei {', '.join(sorted(faltam))}")
        r = pg.evaluate(JS, {"fns": [[n, x] for t, n, x in novo if t == "f"], "consts": [[n, x] for t, n, x in novo if t == "c"]})
        mudou = [n for n in r["mantidas"] if velho.get(("c", n)) not in (None, next(x for t, k, x in novo if t == "c" and k == n))]
        print(f"{rel}: {r['funcoes']} funções" + (f", novas: {', '.join(r['novas'])}" if r["novas"] else "")
              + (f" | ERROS: {r['erros']}" if r["erros"] else "")
              + (f" | ATENÇÃO, constante já existente mudou (só reabrindo o app): {', '.join(mudou)}" if mudou else ""))
        if not r["erros"]:
            open(os.path.join(CACHE, rel.replace("/", "__")), "w", encoding="utf-8").write(src)
