# Canivete do Pailer — notas para o Claude

## Testar a interface: use o modo agente (não monte teste no navegador)
O app expõe o painel real via Chrome DevTools Protocol, com a API pywebview de verdade:

```
dist\CaniveteDoPailer\CaniveteDoPailer.exe --agente     # CDP em http://127.0.0.1:9222
python main.py --agente                                  # pelo código
```

Conecte por CDP (ex.: Playwright `connect_over_cdp`), rode JS na página (`veSeek`, `VE.clips`...),
clique e tire print. Detalhes e segurança em `Instructions/modo-agente.md`.
Fechar o app aberto do usuário (para trocar o exe ou relançar com `--agente`) exige o ok dele antes.

Play do Pocket Editor: `python testes/teste_play.py "<projeto.vcnvt>" [--segundos 20] [--inicio 0]` (app em
`--agente=9333`) mede agulha voltando, buscas, esperas, quadros perdidos e travadas; sai com 1 se passar dos limites.
Rodar antes de release quando mexer em reprodução, áudio ou prévias.

## Build local
- `build.bat` apaga `dist/` inteiro, onde ficam os modelos do usuário (`modelos_ia/`, `models/`, ~8 GB).
  Gere em outra pasta (`--distpath dist_novo --workpath build_novo`) e copie só `CaniveteDoPailer.exe`,
  `_internal/`, `version.txt` e `LEIA-ME.txt` para `dist/CaniveteDoPailer/`.
- Push na `main` dispara o release automático (GitHub Actions + updater dos amigos).

## Segredos
- `Functions/_credenciais.py` (client secret do Google Drive) fica fora do git; no CI vem do secret
  `GDRIVE_CLIENT_SECRET`. Nunca exibir nem commitar o valor.

## ffmpeg
- O ffmpeg baixado é recente (7+): `-filter_complex_script` não existe mais; use `-/filter_complex`
  (ver `_opcao_filtro_script` em `Functions/video_cutter.py`).
