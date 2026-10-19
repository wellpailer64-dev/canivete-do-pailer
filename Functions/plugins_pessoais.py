"""Plugins pessoais do KANIVETE: ferramentas que moram SÓ no PC de quem as fez, fora do git e do release.

Cada plugin é uma pasta em <raiz_dados>/Plugins/<id>/ com um kanivete.json:
  {"nome": "Pandalab", "sigla": "Pl", "cor": "#F26B3A", "js": "painel.js", "css": "painel.css",
   "py": "ponte.py", "descricao": "..."}
O app cria a aba (barra lateral › Plugins, no fim da lista; `icone`/`logo` = imagens do plugin) com uma página vazia `#page-plugin-<id>` e roda o js dentro dela; o js
chama o Python do plugin por `KPLUG.chamar('<id>', 'funcao', {args})`, que só aceita as funções listadas em
`API_KANIVETE` no módulo `py` do plugin (nada fora dessa lista roda). Guia: Instructions/agente/plugins.md.
"""
import base64, importlib.util, json, mimetypes, os, sys, threading

from Functions.midia import raiz_dados

_modulos = {}
_trava = threading.Lock()


def pasta():
    return os.path.join(raiz_dados(), "Plugins")


def _manifesto(pid):
    p = os.path.join(pasta(), pid, "kanivete.json")
    if not os.path.isfile(p):
        return None
    with open(p, encoding="utf-8") as f:
        m = json.load(f)
    m["id"] = pid
    return m


def _ler(pid, nome):
    if not nome:
        return ""
    p = os.path.join(pasta(), pid, nome)
    if not os.path.isfile(p):
        return ""
    with open(p, encoding="utf-8") as f:
        return f.read()


def _imagem(pid, nome):
    """arquivo de imagem do plugin como data URL (a página não lê o disco direto)"""
    p = os.path.join(pasta(), pid, nome or "")
    if not nome or not os.path.isfile(p):
        return ""
    tipo = mimetypes.guess_type(p)[0] or ("image/webp" if p.endswith(".webp") else "image/png")
    with open(p, "rb") as f:
        return f"data:{tipo};base64," + base64.b64encode(f.read()).decode()


def listar():
    """[{id, nome, sigla, cor, descricao, js, css}] dos plugins com kanivete.json (o texto do js/css vai junto)."""
    out = []
    if not os.path.isdir(pasta()):
        return out
    for pid in sorted(os.listdir(pasta())):
        try:
            m = _manifesto(pid)
        except Exception as e:
            out.append({"id": pid, "nome": pid, "erro": f"kanivete.json inválido: {e}"})
            continue
        if not m or m.get("desligado"):
            continue
        out.append({"id": pid, "nome": m.get("nome", pid), "sigla": m.get("sigla", pid[:2].title()),
                    "cor": m.get("cor", "#888"), "descricao": m.get("descricao", ""),
                    "js": _ler(pid, m.get("js")), "css": _ler(pid, m.get("css")),
                    "icone": _imagem(pid, m.get("icone")), "logo": _imagem(pid, m.get("logo"))})
    return out


def _modulo(pid):
    with _trava:
        if pid in _modulos:
            return _modulos[pid]
        m = _manifesto(pid)
        if not m or not m.get("py"):
            raise RuntimeError(f"plugin '{pid}' sem parte em Python")
        raiz = os.path.join(pasta(), pid)
        if raiz not in sys.path:
            sys.path.insert(0, raiz)   # o plugin importa os próprios módulos pelo nome
        spec = importlib.util.spec_from_file_location(f"kplug_{pid}", os.path.join(raiz, m["py"]))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _modulos[pid] = mod
        return mod


def chamar(pid, funcao, args=None):
    """Roda `funcao` do plugin (só se estiver em API_KANIVETE). Devolve {success, dados} ou {success: False, error}."""
    try:
        mod = _modulo(pid)
        if funcao not in getattr(mod, "API_KANIVETE", ()):
            return {"success": False, "error": f"'{funcao}' não está liberada no plugin '{pid}'"}
        return {"success": True, "dados": getattr(mod, funcao)(**(args or {}))}
    except Exception as e:
        return {"success": False, "error": str(e) or e.__class__.__name__}


def recarregar(pid):
    """esquece o módulo (depois de editar o .py do plugin, sem reabrir o app)"""
    with _trava:
        _modulos.pop(pid, None)
    return True
