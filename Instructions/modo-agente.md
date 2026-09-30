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

### Ligado sempre (Preferências, escondido)
Preferências → Geral → clique **5 vezes** em "Modo desenvolvedor" → marque **"Permitir que o Claude controle a janela"**.
A partir da próxima abertura (exe, atalho ou `python main.py`), o app liga a porta sozinho, na primeira livre de
**9222 a 9231** (uma segunda cópia pega a seguinte). O estado aparece ali mesmo ("Agora: ligado em ...").
Fica gravado em `%APPDATA%/CaniveteDoPailer/preferencias.json` (`dev` e `agente`).

## Como conectar (exemplo com Playwright)

```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    pg = next(pg for c in b.contexts for pg in c.pages if "index.html" in pg.url)
    pg.click('.menu-item[data-tool="compressor-video"]')
    pg.screenshot(path="tela.png")
```

## Teste de play (Pocket Editor)

```
python main.py --agente=9333
python testes/teste_play.py "C:/caminho/projeto.vcnvt" --segundos 20 --inicio 0
```

Abre o projeto, espera os vídeos da timeline, toca e reprova (código 1) se a agulha voltar para trás, se houver
buscas/esperas demais nos players, quadros perdidos ou travadas da página. Referência (Portugal, 35 cortes de um
vídeo, prévia leve 1080p): ~4,5 buscas e ~1 espera a cada 10 s, 0 perdidos.

## Segurança

- A porta só escuta em `127.0.0.1`: apenas programas **deste computador** conseguem entrar.
- Quem conecta tem controle total do app (inclusive das funções de arquivo). Só ligue quando for usar.
- Para um agente na nuvem acessar, seria preciso um túnel (ex.: SSH/ngrok) — isso expõe o controle
  do app para fora do PC; use apenas com túnel protegido por senha e desligue ao terminar.
