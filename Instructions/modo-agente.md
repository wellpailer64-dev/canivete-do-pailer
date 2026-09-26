# Modo agente (depuração remota)

Permite que um agente de IA ou script de automação **veja e use o painel** do Canivete do Pailer
(clicar, digitar, ler a tela e chamar as mesmas funções dos botões).

## Como ligar

```
CaniveteDoPailer.exe --agente          (porta 9222)
CaniveteDoPailer.exe --agente=9333     (outra porta)
python main.py --agente                (rodando pelo código)
```

Ou defina a variável de ambiente `CANIVETE_AGENTE_PORTA=9222` antes de abrir o app.
Sem isso o modo fica **desligado** (padrão).

## Como conectar (exemplo com Playwright)

```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    pg = next(pg for c in b.contexts for pg in c.pages if "index.html" in pg.url)
    pg.click('.menu-item[data-tool="compressor-video"]')
    pg.screenshot(path="tela.png")
```

## Segurança

- A porta só escuta em `127.0.0.1`: apenas programas **deste computador** conseguem entrar.
- Quem conecta tem controle total do app (inclusive das funções de arquivo). Só ligue quando for usar.
- Para um agente na nuvem acessar, seria preciso um túnel (ex.: SSH/ngrok) — isso expõe o controle
  do app para fora do PC; use apenas com túnel protegido por senha e desligue ao terminar.
