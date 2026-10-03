# KANIVETE (antes Canivete do Pailer) — notas para o Claude

## Nome e extensões
- Nome visível: **KANIVETE** (janela, splash, marca, textos, release). Identificadores internos continuam
  `CaniveteDoPailer` (exe, zip do release, `%APPDATA%\CaniveteDoPailer`, mutex, `CANIVETE_*`): o updater instalado nos
  amigos procura esses nomes; trocar exige uma migração planejada.
- Nomes visíveis dos editores: **Editor Kanivete** (vídeo) e **Photo Kanivete** (imagem); no código continuam
  editor de vídeo (`editor*.js`, "Pocket Editor" nos comentários) e editor de imagem (`imagem-*.js`).
- Projetos: `.vknv` = editor de vídeo (os `.vcnvt` antigos abrem; Ctrl+S grava um `.vknv` ao lado),
  `.iknv` = editor de imagem (zip com documento.json + PNGs; `Functions/editor_imagem.py`). Associação no Windows
  (HKCU) em `Functions/projeto.py`; duplo clique roteado por `abrirProjetoExterno` (frontend/js/app.js).

## Testar a interface: use o modo agente (não monte teste no navegador)
O app expõe o painel real via Chrome DevTools Protocol, com a API pywebview de verdade:

```
dist\CaniveteDoPailer\CaniveteDoPailer.exe --agente     # CDP em http://127.0.0.1:9222
python main.py --agente                                  # pelo código
```

Conecte por CDP (ex.: Playwright `connect_over_cdp`), rode JS na página (`veSeek`, `VE.clips`...),
clique e tire print. Detalhes e segurança em `Instructions/modo-agente.md`.
Fechar o app aberto do usuário (para trocar o exe ou relançar com `--agente`) exige o ok dele antes.
App de teste (porta 9333) com preferências e temporários próprios, **no disco D** (o C enche e deixa o sistema lento;
testes, cache, modelos e saídas nunca no C): `APPDATA=D:\kanivete_testes\appdata TEMP=D:\kanivete_testes\tmp
TMP=D:\kanivete_testes\tmp LOCALAPPDATA=D:\kanivete_testes\localappdata python main.py --agente=9333`; rode os testes
(`testes/*.py`) com o mesmo TEMP/TMP/LOCALAPPDATA (o cache de mídia vai para %LOCALAPPDATA%).
Scripts e prints de teste avulsos em `D:\kanivete_testes\scripts`.

Play do Pocket Editor: `python testes/teste_play.py "<projeto.vknv>" [--segundos 20] [--inicio 0]` (app em
`--agente=9333`) mede agulha voltando, buscas, esperas, quadros perdidos e travadas; sai com 1 se passar dos limites.
Rodar antes de release quando mexer em reprodução, áudio ou prévias.

Exportação × prévia: `python testes/teste_export.py [--casos grade,camadas,...] [--4k]` abre o app sozinho (porta 9333),
monta cada caso numa timeline nova com material gerado, exporta e compara quadro a quadro com o monitor (contagem de
quadros, quadro preto só na exportação, diferença de imagem > 10, duração do som); sai com 1 se reprovar e guarda os
pares em `%TEMP%/canivete_teste_export/saida`. Rodar antes de release quando mexer em exportação, camadas, efeitos,
transições, cor ou AutoFrame. Caso novo para bug novo: acrescente em `CASOS` e confira que reprova sem a correção.

Teste de 4K (estresse: material pesado, camadas, 10-bit, export, memória): plano e resultados em
`Instructions/agente/teste-4k.md` — rodada 1 feita (2026-10-01), pendências no fim do arquivo.

## Editar vídeo pelo app (agente)
Guia interno para IAs (acesso, leitura de mídia, receita, estilo do cliente, calibração): `Instructions/agente/guia-edicao.md`.
Atualize a seção CALIBRACAO dele a cada feedback do usuário sobre uma edição.
Composição, motion, cor e contraste (curvas, tempos, área segura do 9:16, receitas com camadas de ajuste e o plano
de evolução do AutoFrame): `Instructions/agente/direcao-de-arte.md`.

## Importar Premiere (.prproj)
`Functions/premiere.py` converte só LENDO (gzip + XML de objetos por ObjectID; ticks 254016000000/s) para o formato
do .vknv; abre sem caminho (Ctrl+S grava um .vknv ao lado). Vêm cortes, trilhas, vínculos, velocidade, Motion/Opacidade
(com quadros-chave), transições (Cross Dissolve, Pop, Constant Power), sequências aninhadas e Ultra Key → Chroma Key
(aproximado); o resto vai para o relatório. Teste: `python testes/teste_premiere.py "<projeto.prproj>"`
(use uma CÓPIA do projeto do usuário, ex. `D:\kanivete_testes\premiere\`).
Mapa do formato, mapeamento, limitações e pendências: `Instructions/importar-premiere.md`.
**AJUSTE PREMIERE** (próxima rodada: clipes trocados/fora do tempo, camadas de ajuste, transições de sobreposição,
textos): plano em `Instructions/agente/ajuste-premiere.md`.

## Comp (estilo After Effects)
Plano, modelo e limitações em `Instructions/agente/plano-comp.md`; código em `frontend/js/editor-comp.js`.
Plano completo (Fases 1–3 + Propriedades essenciais por faixa).

## Editor de Imagem (estilo Photoshop)
Guia, arquivos e limitações em `Instructions/editor-imagem.md`; código em `frontend/js/imagem-*.js` e
`Functions/editor_imagem.py` (salvar PSD de ida e volta: só troca o que mudou). Teste: `python testes/teste_imagem.py`
(rodar antes de release quando mexer no editor de imagem, em `psd_tools` ou no `media_server`). Ferramentas com mouse de
verdade (app em `--agente=9333`): `testes/teste_caneta.py` (Caneta, demarcadores, recuperação, laço magnético) e
`testes/teste_guias.py` (guias, encaixe, fatias, carrossel), `testes/teste_dissolver.py` (Filtro > Dissolver/Liquify), `testes/teste_galeria.py` (Galeria de filtros), `testes/teste_cameraraw.py` (Camera Raw).
Gerar imagem com IA (FLUX.2 klein via stable-diffusion.cpp Vulkan, baixado sob demanda; `KNV.gerar`): seção no mesmo guia.
**Diagramar (carrossel, feed, story): `KNV.cena` — HTML/CSS vira camadas; `py -3.13 tools/knv.py peca.html --formato feed` (carrossel: `<section class="slide">`, `--exportar pasta`)**;
guia `Instructions/agente/plano-cena.md`. Fazer arte pelo app (API `window.KNV`, receitas em etapas .iknv, `rodar.py`, `KNV.mapa()`/`KNV.revisar()`, técnicas):
`Instructions/agente/design-photo-kanivete.md`.

## Build local
- `build.bat` apaga `dist/` inteiro, onde ficam os modelos do usuário (`modelos_ia/`, `models/`, ~8 GB).
  Gere em outra pasta (`--distpath dist_novo --workpath build_novo`) e copie só `CaniveteDoPailer.exe`,
  `_internal/`, `version.txt` e `LEIA-ME.txt` para `dist/CaniveteDoPailer/`.
- Push na `main` dispara o release automático (GitHub Actions + updater dos amigos).

## Soundboard (pack de sons do editor)
- Não vai no build: o painel baixa `soundboard-vN.zip` do release `soundboard-vN` (pré-release, para não virar
  o "latest" do updater) e instala em `<app>/soundboard/`. Só sons CC0 (Kenney, Freesound filtrado por CC0).
- Gerar: `python tools/montar_soundboard.py <pasta>`; para pack novo, suba `VERSAO` nos dois arquivos
  (`tools/montar_soundboard.py` e `Functions/soundboard.py`) e publique o zip num release novo.

## Segredos
- `Functions/_credenciais.py` (client secret do Google Drive) fica fora do git; no CI vem do secret
  `GDRIVE_CLIENT_SECRET`. Nunca exibir nem commitar o valor.

## ffmpeg
- O ffmpeg baixado é recente (7+): `-filter_complex_script` não existe mais; use `-/filter_complex`
  (ver `_opcao_filtro_script` em `Functions/video_cutter.py`).
