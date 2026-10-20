# KANIVETE (antes Canivete do Pailer) — notas para o Claude

## Nome e extensões
- Nome visível: **KANIVETE** (janela, splash, marca, textos, release). Identificadores internos continuam
  `CaniveteDoPailer` (exe, zip do release, `%APPDATA%\CaniveteDoPailer`, mutex, `CANIVETE_*`): o updater instalado nos
  amigos procura esses nomes; trocar exige uma migração planejada.
- Nomes visíveis: **Vídeo Kanivete** (Vd, lilás; antes "Editor Kanivete"), **Photo Kanivete** (Pk, azul), **Vetor
  Kanivete** (Vk, laranja), **Sound Kanivete** (Sk, azul clarinho), **Lux Kanivete** (Lk, magenta), **Kanivete Encoder**
  (Ke, roxo forte), **Slider Kanivete** (Sd, verde-água; `.dknv`), **Ata Kanivete** (At, verde #1FA971; Beta). Cores em `.al-*` (`frontend/css/app.css`, `som.css`). A cor de
  destaque do app (`--primary`) vira a da marca na aba aberta (`html[data-ferramenta]`, app.css; canvas: `veAcc()` em app.js);
  laranja só na Home e nas ferramentas sem marca. Nada de `#D4814A` fixo: use `var(--primary)`/`veAcc()`. No código continuam editor de vídeo (`editor*.js`,
  `video-cutter`, "Pocket Editor" nos comentários) e editor de imagem (`imagem-*.js`).
- Home (2026-10-16): banners deslizantes no topo, um por ferramenta, troca a cada 4 s (`frontend/js/home-banners.js`,
  `HB_ITENS` com título/subtítulo/corpo; artes `frontend/img/home/banner-<id>.webp` geradas no Z-Image local por
  `D:/kanivete_testes/scripts/gerar_banners.py`); trilho embaixo com ícone, nome e info; "Peça à Kani" fixa embaixo no
  centro; aviso de versão nova em cima do "Pergunte à Kani". Ferramenta nova com marca = item novo em `HB_ITENS` + arte.
- Lobbys padronizados (2026-10-16, `frontend/js/lobby.js`): toda ferramenta com projeto abre num lobby no padrão do Vídeo
  (cartão com arte + logo + Novo/Abrir, seções de modelos/abertos/recentes, Recuperar) sobre o vídeo do Início sem cor
  tingido na cor dela (`KL_LOBBYS`). Photo/Vetor reaproveitam `#ie-inicio`/`#vk-inicio` (mesmos ids); Lux monta `#lux-inicio`
  em lux.js (fechar a cena volta ao lobby, "Continuar" reabre). `video/home-bg.webm` já é sem cor (trocou o vídeo: subir o `?v=`).
  Fundo de cada lobby = `video/lobby-<id>.webm`, o mesmo vídeo já tingido (ffmpeg `format=gbrp,colorchannelmixer=` cinza × cor
  da ferramenta, 12 qps; nada de mix-blend-mode por quadro). Camada do lobby 21: abaixo dos modais (.ie-modal 25) e menus
  (.ie-pop 30) — `testes/teste_lobby_camadas.py`.
- Leveza com o app parado (2026-10-16, `D:/kanivete_testes/scripts/varredura.py` e `exp_cpu.py` medem por ferramenta):
  nada de `backdrop-filter` por cima de vídeo, nem animar `width`/`box-shadow` em loop (use transform/opacity); vídeos de
  fundo a 12 qps e pausados quando cobertos ou com o app minimizado; medidores 1×/s sem transição. Home 25% → ~6% de um núcleo.
- Ícone de cada arquivo de projeto = o logo da ferramenta (`identidade/arquivos/<sigla>.ico`, gerado por
  `py -3.13 tools/icones_arquivos.py`; registro por extensão em `Functions/projeto.py` `_TIPOS`). Mudou cor/sigla: rodar de novo.
- Ferramenta separada = aba e página próprias (`#page-<id>` com `ve-page`), sem abrir outra por trás; o `switchTool` chama
  `luxAoTrocar`/`keAoTrocar` para pausar/devolver ao sair da aba. Receita: Lux (tomada `V3`) e Ke (abaixo).
- Projetos: `.vknv` = editor de vídeo (os `.vcnvt` antigos abrem; Ctrl+S grava um `.vknv` ao lado),
  `.iknv` = editor de imagem (zip com documento.json + PNGs; `Functions/editor_imagem.py`). Associação no Windows
  (HKCU) em `Functions/projeto.py`; duplo clique roteado por `abrirProjetoExterno` (frontend/js/app.js).

## Mapa geral (comece por aqui)
`Instructions/MAPA.md` (ferramentas → arquivos, API, comandos VKN/KNV, testes, guias, pontes, onde ficam dados e
caches); versão do Jr: `Instructions/mapa.json`. Achar algo: `py -3.13 tools/mapa_geral.py --busca termo`; depois de
criar ferramenta, comando ou teste: `py -3.13 tools/mapa_geral.py` (regenera os dois).

## Trabalhar barato (economia de tokens — usar SEMPRE)
- Editar código: `py -3.13 tools/patch.py mudancas.patch` (blocos `@@ arquivo` / `<<<` velho `===` novo `>>>`; confere âncora
  única, tudo ou nada, checa sintaxe e desfaz se quebrar). Nada de heredoc com Python inline para editar.
- Achar onde mexer: `py -3.13 tools/mapa_codigo.py vetor|imagem|editor --busca termo` (comandos/funções:linha) antes de grep/ler arquivo.
- Pasta de cliente (rascunho PDF, áudios, vídeos de tela): `py -3.13 tools/briefing.py "<pasta>"` → briefing.md + folhas
  (fala junto do quadro onde ele aponta); imagens: `tools/imgprep.py` (ampliar/recortar/tapar/folha). Carrossel no app
  aberto do Pailer: `tools/knv.py peca.html --usuario --nome X` (não fecha nada). Guia: plano-cena.md › "Carrossel de cliente".
- Aplicar mudança no app aberto, SEM recarregar (projeto, janelas soltas e Ctrl+Z ficam): `py -3.13 tools/aplicar.py
  frontend/js/x.js [y.css] [--py] [--porta 9222]` — rodar depois de CADA mudança no app do usuário. Troca só as funções
  que MUDARAM; constante que já existe e função envolvida por outro arquivo (`nome = function` num bloco de outro .js, ex.
  veOpenExport pelo Encoder) não mudam (avisa: aí só reabrindo). Trocar uma envolvida apagava o envoltório. `tools/recarregar.py` recarrega a página inteira: só no app
  de teste (recusa com projeto aberto). Python (--py) e main.py: só rodando pelo código ou no próximo build.
- Testes: o Jr roda (`tools/worker/codigo.py` com `testes: ["teste:vetor"]`) e devolve só o que falhou.
- Vetor: `VKN.curto = true` (respostas só com id/caminho), `VKN.revisar()` antes de abrir qualquer imagem, e páginas em
  HTML/CSS com `VKN.cena` / `py -3.13 tools/vk_cena.py pagina.html --marca marca.json --prancheta X [--nova 320x180] --png p.png --revisar`.
  Marcas prontas (kit .aknv com símbolos + marca.json) em `D:\kanivete_biblioteca\marcas\`; modelos de página em
  `D:\kanivete_biblioteca\modelos\manual\`. Imagem só no fim, em folha de contato reduzida.

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

Exportar com fila de render (como o Media Encoder), num painel só: `frontend/js/editor-fila.js` — configurações à
esquerda, fila à direita (cada item congela a timeline ao entrar e tem as SUAS configurações: clicar no item carrega no
formulário e o que mudar vale para ele), "Adicionar à fila", "Todas as timelines", ▶ Renderizar fila em ordem enquanto
se edita. Botão Fila no cabeçalho abre o mesmo painel. API `VEFILA_API`. Teste: `py -3.13 testes/teste_fila.py` (porta 9334).

**Kanivete Encoder (Ke) — comece pelo mapa `Instructions/agente/mapa-kanivete-encoder.md`** (caminho do export,
arquivos, armadilhas medidas, resultados, testes, pendências). Janela própria do export feita (`editor-encoder.js`: logo Ke, solta, minimiza, lembra posição).
**Aba própria** (barra lateral › Kanivete Encoder, `keAoTrocar`): a mesma janela encaixa em `#ke-casa` sem abrir o Vídeo;
sem projeto mostra fila/andamento/monitor; sair da aba devolve a janela ao Vídeo (fechada; barrinha se rodando). Pôr na
fila continua no Vídeo (Ctrl+M). Teste: `py -3.13 testes/teste_ke_aba.py` (porta 9333).
**Media Encoder** (2026-10-16, `frontend/js/ke-arquivos.js` + `Functions/ke_arquivos.py`): a fila aceita itens `tipo`
"arquivo" (arrastar na aba do Ke ou "+ Arquivos"; predefinição por item: MP4 H.264 máx/1080p/720p, H.265, ProRes, MP3,
WAV; NVENC quando houver) e "lux" (Render › "→ fila do Ke": `ve3dEstudioVideoSpec` congela todos os quadros; o Blender
roda na vez do item) e "som" (Sound › Exportar › "→ fila do Ke": `skParaKe` congela o projeto e as chamadas do
`sk_exportar`, uma por stem). Mesmo canal `veOnExport`/`_ve_export_stop`: andamento, Parar, Drive e Fran iguais. API `KE_API`.
Teste: `py -3.13 testes/teste_ke_media.py [--sem-lux] [--sem-som]`. Parar (`veFilaParar` → `ke_parar`) encerra também o
Blender (`blender_render.cancelar_video`) e o ffmpeg da mixagem (`sound_kanivete.cancelar_export`), sem deixar arquivo pela
metade (teste `testes/teste_ke_parar.py`). Falta: pastas arrastadas no Ke.
Atalhos: Ctrl+M = pôr na fila + abrir; Ctrl+Shift+M = pôr na fila sem abrir (aviso, som, barrinha); NENHUM começa a
renderizar: o início é sempre o ▶ Renderizar (pedido do Pailer); marcador anterior = Alt+Shift+M. Voz da Fran no fim
(`veKeVoz`: pronto / drive / falhou / drivefalhou, `frontend/audio/ke/*.mp3`, fontes em `D:/kanivete_testes/ke_voz`); com
Drive ela fala só no fim do envio. App de teste (APPDATA em kanivete_testes ou CANIVETE_TESTE=1): só sinal curto ok/erro. Janela: "Renderizando agora" com miniatura do quadro (o ffmpeg grava
`ke_quadro.jpg` 1×/s: `video_cutter.saida_miniatura`), velocidade, selo placa/CPU e monitor ao vivo de CPU/RAM/placa
(`Functions/encoder_monitor.py`, API `ve_encoder_estado`). Painel Desempenho no editor (o mesmo monitor, encaixável): `frontend/js/editor-desempenho.js`.
Export otimizado (rodada 1, 2026-10-08: reels reais de 3,6× → 1,26× a duração; bancada em `D:/kanivete_testes/encoder`); medições e pendências em `Instructions/agente/plano-kanivete-encoder.md`.
**Modo placa** (rodada 3): a timeline montada inteira na GPU (Vulkan + libplacebo) — `Functions/export_placa.py`, chamado
pelo `exportar_video` com a placa ligada; o que não suporta (`motivo()`) ou falha cai na CPU. Depoimentos de 98 s: 264 s → 96 s.
Testar: `py -3.13 testes/teste_export.py --placa`. Armadilhas (disable_linear, settb, `ot`) no plano §8.
Rodada 4 (plano §11): Chroma Key, Aberração, Desfoque e opacidade de ajuste em shader do libplacebo; o resto desce só
naquela camada (híbrido); sem caber na placa, exporta em blocos. iPhone HLG + Dolby Vision lido como a prévia (`_marca_cor`).
Respeite o seu voto: 892 s → 205 s. Blocos no teste: `CANIVETE_PLACA_BLOCOS=1 CANIVETE_BLOCO_SEG=1 ... --placa`.
**Taxa da timeline CRAVADA** (`video_cutter.taxa_timeline`, `probe()["fps_timeline"]`): nunca a média de vídeo de celular.
Rodada 7 (qualidade, 2026-10-12, plano "Rodada 7"): placa em 10/16 bits por dentro (escuro sem blocos), Brilho em Tela
(claros sem estourar), H.265 10 bits pela placa, "sem áudio" na taxa da timeline. Bancada: `D:/kanivete_testes/qualidade`.
Rodada 8 (plano §8.1–8.5): fade de clipe, os 12 modos de mesclagem, desfoque animado, transições de sobreposição e
Chroma Key com Luz e Cor/opacidade agora na placa (shaders do libplacebo; parâmetros por quadro em trechos retos ou textura).
Ondulação na placa (2026-10-15, plano §8.6): shader por onda com margem transparente (`_onda_passos`) em vídeo, imagem/texto
(e a sombra) e camada de ajuste; giro de vídeo e de imagem com onda também na placa (`_giro_passos`); teste
`teste_export.py --casos onda,ondavideo,ondatexto,ondavideo2,ondagiro --placa`.

**Autozoom** (2026-10-18, painel Animação › Autozoom): zooms de ênfase pela fala (blocos/nota da Legenda Premium + ênfase
da voz + rosto YuNet) em camadas de ajuste pink com o efeito "zoom" (curva igual na prévia e no `perspective` da
exportação; placa = híbrido). `frontend/js/editor-autozoom.js`, `Functions/autozoom.py`; guia `Instructions/agente/autozoom.md`;
teste `py -3.13 testes/teste_autozoom.py`.

**Equalizador paramétrico** (2026-10-18): efeito `peq` (clipe e Rack da trilha), painel com curva/pontos/espectro/presets,
biquads iguais na prévia e no ffmpeg — `frontend/js/editor-peq.js`, `Instructions/agente/equalizador.md`.

**Plugins** (2026-10-18): VST3 por carregador PRÓPRIO (`Functions/vst3.py`, ctypes, sem GPL), sempre em processo à parte
(`--vst3 varrer|janela|encaixar|servir|processar`); Janela › Plugins › abre o plugin num PAINEL encaixável; Rack de efeitos da
trilha (Mixer) › Plugins VST3: um processo por espaço, prévia por HTTP local à frente da agulha, exportação `_pre_vst`. Plano (packs Mister Horse/Motion
Bro, formato próprio, OFX) e pendências: `Instructions/agente/plugins.md`. Arquivar plugin (⌫, some do menu/Rack).
**Plugins de imagem OpenFX** (2026-10-19): hospedeiro próprio `Functions/ofx.py` (`--ofx varrer|descrever|render`), bloco
"Plugins OFX" no painel Efeitos (`frontend/js/editor-ofx.js`); etapas 1–2 feitas (listar/arquivar; aplicar com os ajustes
nos Controles de efeito, tipo `ofx:<id>`); prévia e exportação = etapas 3–4. VST3 também em `<raiz_dados>/Plugins VST3`.

**Legendas em 3 modos** (2026-10-18, painel Texto › Legendas): Clássica, Dinâmica (destaque da palavra falada) e
**Premium** — blocos curtos montados como título com duas fontes (dupla), papéis por palavra (ligação/base/destaque),
entrada palavra a palavra, Kani refina o destaque, efeitos sonoros do Soundboard pelo movimento/assunto (`lpSfx`);
margens de segurança no Programa (`veSegToggle`). `frontend/js/editor-legenda-premium.js` (`veLp*`), fontes OFL
em `frontend/fonts/premium` ("KPR Fxx", fontsdir do libass), `_ass_premium` em video_cutter.py. Guia, armadilha das
métricas (win × hhea) e pendências: `Instructions/agente/legenda-criativa.md`. Teste: `teste_export.py --casos premium`.

Mixer de trilhas de áudio (Audio Track Mixer do Premiere): `frontend/js/editor-mixer.js` (aba junto dos Controles de
efeito): pan, M/S (S também no cabeçalho da trilha), fader −∞..+15 dB na escala do Premiere, medidor L/R por trilha e o Mix.
Estado em `VE_TRK.a[k]` {vol, pan, mute, solo} e `VE.master.vol`; som pelo efeito interno `trk` (editor.js `veTrkAfx`,
prévia `veAudioFxProcess`, export `_filtros_afx`); Mix depois do Hard Limiter do Master (`veMasterLim().fim`). Premiere
ida e volta (`premiere.py _mixer_trilha`, `premiere_xml.py`). API `VEMIX_API`. Teste: `py -3.13 testes/teste_mixer.py`.
Rack de efeitos por trilha (5 espaços, na SOMA da trilha) e os 53 efeitos de áudio do Premiere (`editor-afx-pr.js`,
`Functions/efeitos_pr.py`, valores 0..1 do Premiere = ida e volta sem perda; 20 com som calibrado no Premiere).
**Ponte com o Premiere instalado (plugin UXP "Kanivete Ponte", `tools/ponte_premiere.py`): `Instructions/agente/ponte-premiere.md`**
— testes SÓ na cópia em D:\kanivete_testes (o projeto ativo do Premiere é o do Pailer).

Timeline como a do Premiere (2026-10-11): ímã, seleção vinculada, marcador e chave inglesa (Configurações da timeline) no
topo da coluna das trilhas; **alvo de trilha** (rótulo V1/A1 azul = alvo; clique tira, Shift+clique todas do tipo; `semAlvo`
em `VE_TRK`): Ctrl+K corta só as trilhas-alvo (Ctrl+Shift+K todas), ↑/↓ e Q/W usam os cortes delas, colar vai para a
trilha-alvo mais baixa, Alt+D seleciona o clipe na agulha. **Caneta** (P sem clipe selecionado; com clipe, P abre a Posição
como no After): linha de opacidade (`c.k.op`) e de VOLUME (`c.k.vol` em dB, linear em dB: prévia `veAudioVk`, exportação
`_expr_vol_kf`) no clipe — `frontend/js/editor-caneta.js`. Menu de efeitos do Mixer em categorias do Premiere com
submenu (`VE_MIX_CATS`). Teste: `py -3.13 testes/teste_timeline_pr.py` (porta 9337).
**Remix de música** (Remix tool do Premiere): ferramenta Remix (Shift+R) — arrastar a ponta direita da música estica/encurta
a música inteira (começo e final de verdade, saltos entre compassos parecidos): `frontend/js/editor-remix.js` +
`Functions/remix.py` (librosa); guia em `Instructions/sound-kanivete.md` › Pendências › REMIX. Teste: `testes/teste_remix.py`.

**Painel Pessoas** (rostos do projeto, 2026-10-14): `frontend/js/editor-pessoas.js` + `Functions/busca_rosto.py` (YuNet +
SFace 37 MB, Apache-2.0). Analisa em segundo plano SÓ quadros-chave, ffmpeg em prioridade ociosa com 1 thread, 1 núcleo do
OpenCV, folga entre quadros, nada na placa; PAUSA no play/export/preparo/Comp/motion (`ve_ps_pausar`). Agrupa em perfis (foto
de frente, nome no projeto `VE.pessoas = [{nome, c}]`), abrir o perfil = todas as cenas; "Quem é?" por foto ou quadro do
monitor. Índice por arquivo em `<cache>/Canivete Render Cache/rostos/`. API `VEPS_API` (`buscar(caminho)` para o agente).
Bancada: `D:/kanivete_testes/rosto` (mesma pessoa 0,43–0,89; outras ≤ 0,30); testes `D:/kanivete_testes/scripts/teste_pessoas*.py`.
Usar SEMPRE antes de pôr GC: confirmar que o rosto da cena é da pessoa do nome.

**PENDENTE — Estabilizador melhor que o Warp Stabilizer** (e a lista de prioridades para ficar profissional: bateria de
projetos reais, tracker, MOGRT, rampas de velocidade, multicâmera): `Instructions/agente/plano-estabilizador.md`.

Atributos de vários clipes (como no Premiere): `frontend/js/editor-atributos.js` — botão direito → "Remover atributos…"
(efeitos de vídeo/áudio, movimento, opacidade, mesclagem, volume, transições, com caixinhas; vale para a seleção) e ajuste
em grupo (mexer num efeito com vários selecionados leva o valor ao mesmo efeito de todos). Teste: `testes/teste_atributos.py`.

Teste de 4K (estresse: material pesado, camadas, 10-bit, export, memória): plano e resultados em
`Instructions/agente/teste-4k.md` — rodada 1 feita (2026-10-01), pendências no fim do arquivo.

## Slider Kanivete (Sd, verde-água) — apresentações 16:9
PowerPoint moderno para as palestras do cliente: `Instructions/slider-kanivete.md` (modelo, API, exportar, armadilhas,
pendências). `frontend/js/slider.js` (núcleo + comandos `SDK.cmd`), `slider-ui.js` (interface), `slider-show.js`
(apresentação), `css/slider.css`, `Functions/slider_kanivete.py` (.dknv, PDF/PNG/MP4/PPTX editável, importar PPTX).
Agente: `SDK.cmd('modelo', {tema})`, `SDK.cena(html, {novo: true})` por slide; ler BARATO com `SDK.texto()` → `SDK.revisar()` →
`SDK.folha({caminho})` (ou `py -3.13 tools/sd.py texto|revisar|folha|cmd|lote|cena|js`, no app aberto, não fecha nada);
`SDK.lote([...])` = um Ctrl+Z. Gráficos (`slider-grafico.js`, 14 modelos, CSV, PPTX nativo), paletas de cliente iguais às do
Photo/Photoshop (`slider-cores.js`, .ase), animações/transições com prévia na mesa. Janela sem margem (padding 10 px como o Photo).
PowerPoint com animações/transições/vídeo automático (`Functions/slider_pptx.py`, ida e volta), PDF pesquisável/leve, importar
PDF em camadas, MP4 com animação e vídeo dentro, Kani criando a palestra (`slider_kani.py`, `slider-kani.js`).
**Apresentação para qualquer aparelho** (2026-10-17): Exportar › `.html` único com o reprodutor (`frontend/slider-player/player.html`,
`slider-html.js`, `Functions/slider_html.py`; mídias e fontes dentro, celular com toque); guia › "Apresentação para qualquer aparelho".
Testes: `py -3.13 testes/teste_slider.py`, `teste_slider_html.py`, `teste_slider_extra.py` (atalhos com teclado de verdade) e `teste_slider_arquivos.py
[--kani]` (arquivos abertos no LibreOffice de `D:/kanivete_testes/libreoffice`) — porta 9333.

## Ata Kanivete (At, verde; Beta) — reunião do Google Meet vira ATA
Chrome à parte (perfil próprio, login uma vez) com a captura injetada por CDP (`frontend/ata/captura.js`: microfone e
áudios recebidos em Opus, ~10 MB/h; legendas e participantes) → Parakeet (VAD de reunião, trechos ≤ 12 s) → vozes
separadas no sherpa-onnx (limiar 0,5; renomear = juntar) → Kani escreve a ATA (em blocos se for longa) → PDF (PyMuPDF
Story). `Functions/ata_kanivete.py`, `frontend/js/ata.js`, `css/ata.css`, API `ATA_API`. O Meet NÃO manda áudio por pessoa.
Guia, medições, armadilhas e pendências (falta teste em call real com várias pessoas): `Instructions/agente/ata-kanivete.md`.

## Plugins pessoais (Pandalab)
Ferramentas só do Pailer em `D:\Kanivete\Plugins\<id>\kanivete.json` (junção para `DESENVOLVIMENTOS EM PYTHON\PLUGGINS KANIVETE`,
repositório próprio github.com/wellpailer64-dev/Pluggins-Kanivete; segredos no `.gitignore` de lá), fora do git do app (carregador `Functions/plugins_pessoais.py`,
`frontend/js/plugins-pessoais.js`; guia `Instructions/agente/plugins.md` › Plugins pessoais). **Pandalab**: demandas do
Laboratório Panda → `py -3.13 D:\Kanivete\Plugins\pandalab\panda.py demandas --status abertas` / `demanda <id8>` /
`baixar <id8>` (pasta certa do cliente pelo `mapa_clientes.json`); volta: `status <id> --status in_progress --sim`, `comentar <id> --descricao ".." --sim`, entrega pelo site ("Pegar os finais da pasta", `finais <id>`). Card real: confirmar com o Pailer; teste = card "[TESTE] …" cliente PandaLab.
Segurança do sistema Pandalab (tabelas abertas sem login): `01 - PANDA LAB/00 - Sistema Pandalab/SEGURANCA-PLANO.md`.
**KaniBrowser** (`D:\Kanivete\Plugins\kanibrowser`): Chrome do Kanivete por canal privado (pipe, sem porta), logins
guardados; `kb.py imagens|baixar --demanda ID8|texto|foto` pelo app em modo agente. Postar/enviar/clicar em site de
terceiros só com o ok do Pailer.

## Tela da 1ª instalação
`first_run.py` abre `frontend/instalar.html` (+ `js/instalar.js`) numa janela do pywebview: o carrossel da Home
(`home-banners.js`), barra na identidade do KANIVETE e música opcional (`frontend/audio/instalador/musica.ogg`; sem o arquivo,
o botão some). `DOWNLOADS` em ordem de tamanho (`mb`): leves primeiro, Whisper Medium por último; CLIP/Flan sem os formatos
que o app não usa (`ignore`). Sem pywebview, cai na janela antiga em Tk. Prévia sem baixar: `py -3.13 first_run.py --demo [--cdp 9340]`.

## Lux Kanivete (Lk, magenta) — produto em 3D
Ferramenta própria, independente do Editor (aba e página próprias como o Photo; barra lateral › 3D e Home; do Editor,
duplo clique numa cena 3D da timeline abre a mesma tela por cima, com a cena da timeline): embalagens (pote/bastão,
perfil em `frontend/embalagens.json`), luzes como no Blender (softbox/spot/ponto/sol, Estúdio 3 pontos), materiais do
Principled (`frontend/materiais.json`), 📷 Render fotorrealista no Blender (`Functions/blender_estudio.py`: foto
Rápido/Full HD/2K/4K e vídeo prévia/final em Cycles, cache por hash) e projeto **.lknv** (`Functions/lux_projeto.py`: zip
com a cena e os recursos copiados para dentro). Layout no padrão do Blender (`frontend/js/lux-ui.js`: menus, ferramentas,
Cena, Propriedades em abas; Shift+A adiciona); entrada `frontend/js/lux.js`; o motor é a Cena 3D do Editor
(`editor-3d*.js`), mas a cena da Lux mora numa **casa própria** (`LUXC` em lux.js: cena, agulha, tamanho, Ctrl+Z e
rascunho em localStorage) e o motor lê tudo pela tomada **`V3`** (editor-3d.js: `V3.t/w/h/fps/hist()/ir()/clipe()`,
`V3.casa` = LUXC ou null = timeline). Nunca `VE.playhead`/`vePushHistory` direto na tela/painéis 3D. "Enviar ao Editor"
copia a cena para a timeline. Teste: `py -3.13 testes/teste_lux_casa.py` (porta 9333). Guia e pendências: `Instructions/agente/cena-3d-editor.md`
(fim) e `Instructions/agente/mockup-profissional.md` §5 (mockup profissional e passes). APIs: `VE3DAPI.modelo({embalagem})`,
`.embalagem`, `.luz`, `.estudio3pontos`, `.estudio({qualidade})`, `.estudioVideo({qualidade: previa|final})`, `LUX_API`.
Render na RTX 3050: foto Full HD ~45 s; vídeo prévia ~3 s/quadro, final ~5,6 s/quadro.
Missão em andamento que usa a Lux: identidade visual pocket — plano e etapas em `Instructions/agente/plano-identidade-pocket.md`.

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
Volta para o Premiere: XML do FCP7 (`Functions/premiere_xml.py`, Arquivo › Exportar para o Premiere; teste
`testes/teste_premiere_xml.py`).
**AJUSTE PREMIERE** (próxima rodada: clipes trocados/fora do tempo, camadas de ajuste, transições de sobreposição,
textos): plano em `Instructions/agente/ajuste-premiere.md`.

## Motion (recursos do After Effects no Editor)
Máscaras (ferramentas Máscara/Caneta), fosco de trilha, camada mãe + Nulo, desfoque de movimento, cronômetro em qualquer
parâmetro de efeito/máscara/forma, aparar caminho/tracejado/estrela, curvas Passar e voltar/Elástico/Quicar, efeitos Brilho,
Granulação, Rampa, Preenchimento, Contorno, Desfoque direcional/radial, Eco, Ondulação (Wave Warp, `editor-onda.js`: sem camada desenhada). Exporta como "camada desenhada" (ProRes 4444
pelo desenhista da prévia). **Antes de qualquer motion: `Instructions/agente/mapa-habilidades-motion.md`** (técnicas destravadas
peça a peça — confete, letra por letra, chevrons, recorte que preserva amarelo; anotar as novas ao terminar). Guia, API `VEMO_API`, armadilhas e pendências: `Instructions/agente/plano-motion.md`.
Testes: `py -3.13 testes/teste_motion.py` e `py -3.13 testes/teste_export.py --casos motion,fxmotion,curvas --folha`.

## Pincel Roto (Roto Brush do After Effects)
Recorte de pessoa/objeto no vídeo pintando num quadro-base (verde soma, Alt tira) que propaga para os dois lados; correção
= novo quadro-base; Refinar borda nos Controles de efeito. SAM 2.1 de vídeo em ONNX fp16 (2026-10-18: Small 1024 "alta"
0,28 s/quadro, Tiny 512 "rápida" 0,07; Apache-2.0, 1º uso), DirectML. Tela em janela por cima do editor desfocado;
**Freeze** (pintar só faz o quadro-base; ❄/F segue; "Seguir sozinho" opcional; o render automático NÃO dispara o Freeze:
`veRotoOcupado`), ✨ Selecionar assunto (BEN2 do Remover fundo como partida). Borda: Descontaminar (Blur-Fusion; prévia
`c_` com source-atop), Nitidez, Proteger rosto (YuNet + 5 pontos). `frontend/js/editor-roto.js` + `Functions/pincel_roto.py`; exporta como ProRes 4444 com alfa.
Guia, medições e pendências: `Instructions/agente/pincel-roto.md`. Teste: `py -3.13 testes/teste_roto.py [--dur 15]`.

## Comp (estilo After Effects)
Plano, modelo e limitações em `Instructions/agente/plano-comp.md`; código em `frontend/js/editor-comp.js`.
Plano completo (Fases 1–3 + Propriedades essenciais por faixa).
**Comp que só organiza + Agrupar cenas** (2026-10-20, `editor-comp-passa.js`): ao terminar QUALQUER motion, rodar
`veCompAgruparCenas()` em cada timeline (uma Comp por cena; mesclagem/ajuste de dentro continuam valendo: resultado
idêntico). Botão direito no cabeçalho da faixa: adicionar/excluir/excluir vazias (`editor-trilhas.js`). Conferir
monitor antes×depois SEMPRE com `vePrSegEm` desligado (o trecho pré-renderizado engana). Guia: plano-comp.md;
teste `py -3.13 testes/teste_comp_cenas.py` (porta 9333, reels BF).

## Render 3D no Blender
Objetos 3D do Vetor renderizados fotorrealistas (Cycles, GPU) com rótulo mapeado: comando `render_blender`, guia
`Instructions/vetor-kanivete.md` §13; Blender 4.5 LTS baixado sob demanda. Teste: `python testes/teste_blender.py`.

## Ponte Vetor ↔ Photo
Objeto inteligente vetorial no Photo (Arquivo › Enviar ao Photo; editar no Vetor e Ctrl+S devolve) e vínculo vivo do
.iknv no Vetor: `frontend/js/ponte-vetor-photo.js`, guia `Instructions/vetor-kanivete.md` §12. Teste: `python
testes/teste_ponte.py` (rodar antes de release quando mexer na ponte, no objeto inteligente ou no renderizador do Vetor).

## Cena 3D no Editor (estilo After Effects)
Tela própria (duplo clique na faixa, como a Comp): `frontend/js/editor-3d-tela.js` (orbitar grava na câmera, vista livre, setas W/E/R).
Modelos .glb/.obj e primitivas com câmera, luz, sombra e quadros-chave (◆), prévia ao vivo em three.js e ProRes 4444
para a exportação: `frontend/js/editor-3d.js` + `Functions/cena3d.py`; API `VE3DAPI`. Guia e pendências:
`Instructions/agente/cena-3d-editor.md`. Foco (desfoque por profundidade), estúdio infinito, neblina e objetos 3D do
Vetor (Objeto › "3D: Animar no Editor", `enviar_editor_3d`). Modelos de banco: .glb/.gltf/.obj(+.mtl e texturas ao lado)
direto; .fbx/.blend/.dae/.stl/.ply/.3mf convertidos no Blender; soltar no editor; aparência por parte (cor, acabamento,
imagem/rótulo); edição na tela 3D (Delete, Ctrl+D, H, F, Q, ímã, renomear). **Camadas em profundidade** (2026-10-14):
botão direito → "Camadas → Cena 3D" vira placas (`editor-3d-placas.js`); arrastar objeto, Alt+rodinha/[ ] e mapa de
profundidade sem mudar o tamanho na tela (`editor-3d-mexer.js`); para o agente `VE3DAPI.naTela/colocar/folha`. Leve: um
motor WebGL só, ≤ 4 cenas montadas, objetos reaproveitados, arquivo da exportação só com o app parado (guia § Leveza;
receita de colagem no mapa de motion §4). Testes: `py -3.13 testes/teste_3d_placas.py`, `python testes/teste_export.py --casos 3d,3dfoco,placas`,
`python testes/teste_vetor_editor3d.py` e `py -3.13 testes/teste_3d_modelos.py`.

## Editor de Imagem (estilo Photoshop)
Guia, arquivos e limitações em `Instructions/editor-imagem.md`; código em `frontend/js/imagem-*.js` e
`Functions/editor_imagem.py` (salvar PSD de ida e volta: só troca o que mudou; grava num temporário, relê e só troca o arquivo se cada camada conferir — `testes/teste_psd_refs.py`). Texto, forma, objeto inteligente e preenchimento
criados no Photo vão para o PSD editáveis (moldes do Photoshop em `Functions/psd_texto_modelo.py` e `psd_so_modelo.py`; forma =
cor sólida + máscara vetorial; incorporados sempre na versão 7; `testes/teste_psd_{texto,forma,so,pre}.py`, `--photoshop` confere lá). Teste: `python testes/teste_imagem.py`
(rodar antes de release quando mexer no editor de imagem, em `psd_tools` ou no `media_server`). Ferramentas com mouse de
verdade (app em `--agente=9333`): `testes/teste_caneta.py` (Caneta, demarcadores, recuperação, laço magnético) e
`testes/teste_guias.py` (guias, encaixe, fatias, carrossel), `testes/teste_dissolver.py` (Filtro > Dissolver/Liquify), `testes/teste_galeria.py` (Galeria de filtros), `testes/teste_cameraraw.py` (Camera Raw).
Gerar imagem com IA (Z-Image-Turbo 6B Q4_K; com referência, FLUX.2 klein — ambos no stable-diffusion.cpp Vulkan, sob demanda; `KNV.gerar`): seção no mesmo guia.
**Diagramar (carrossel, feed, story): `KNV.cena` — HTML/CSS vira camadas; `py -3.13 tools/knv.py peca.html --formato feed` (carrossel: `<section class="slide">`, `--exportar pasta`)**;
**antes de diagramar carrossel/flyer/story, ler `Instructions/agente/direcao-carrossel.md`**; referências do Pinterest:
`tools/refs.py` (Kani dá nota a cada uma) e técnicas já aprendidas em `D:\kanivete_biblioteca\tecnicas\tecnicas.json` (hierarquia, herói, ponte, catálogo de técnicas; o revisor confere com `KNV.revisarDirecao`);
guia `Instructions/agente/plano-cena.md` (seção "Fluxo barato": biblioteca `D:\kanivete_biblioteca` com recursos/modelos/amostras, `data-cor`, `recurso:`, `--ver`, `--comparar`, `--variacoes`, `KNV.etapa`). Fazer arte pelo app (API `window.KNV`, receitas em etapas .iknv, `rodar.py`, `KNV.mapa()`/`KNV.revisar()`, técnicas):
`Instructions/agente/design-photo-kanivete.md`.

## Sound Kanivete (áudio multipista)
Timeline de áudio, fades, LUFS, projeto `.sknv`, API `window.SKN`: `Instructions/sound-kanivete.md`; código `frontend/js/som.js` (núcleo),
`som-motor.js` (reprodução em trechos), `som-paineis.js` (painéis), `som-plugins.js` (plugins VST3 na faixa: prévia pela
faixa congelada `congelar_faixa`, a mesma da exportação), `som-gravar.js` (microfone, autosave), `som-dock.js` (painéis móveis), `som-espectro.js` (espectro, reparo, separar), `som-tts.js` (Texto para Voz,
Conversa, banco de vozes), `som-texto.js` (editar pelo texto, stems, ID3, modelos) +
`Functions/sound_kanivete.py`, `sk_gravar.py`. Teste: `python testes/teste_som.py`.

## Kani (assistente de conversa)
Chat local tipo ChatGPT (Qwen3.5 4B Q5_K_M; bancada de modelos e escolha em `Instructions/agente/kani-motor.md`): bolinha na Home + IA › Kani na barra lateral, gaveta à direita de qualquer ferramenta
(`frontend/js/kani.js`, `css/kani.css`, `Functions/kani.py`). Motor: Ollama com qwen3.5:4b (ou 9b/qwen3:8b) se houver; senão llama.cpp Vulkan
+ Qwen3.5-4B-Q5_K_M.gguf (~3,1 GB) baixados sob demanda em `modelos_ia/kani`. Ajuda do app: `frontend/ajuda/kani_kb.json`
(trechos dos guias, busca BM25) — regenerar com `py -3.13 tools/kani_kb.py` ao mudar guias/ferramentas.
**Ajuda escrita para o usuário** em `frontend/ajuda/kani_fatos.md` (vem na frente dos guias, pesa 1,6×; inclui "o que o app
ainda NÃO faz"): ferramenta nova ou mudança visível → acrescentar lá. O gerador tira dos guias seções de programador
(API, pendências, armadilhas, planos) e caminhos de arquivo; busca só com nota ≥ 5 (sem trecho aleatório). Contas o app
faz (`kani.contas`) e entrega prontas; data de hoje e versão no prompt; `_ollama_tem` guardado 20 s (sem Ollama o Windows
levava 1,5 s por mensagem). Bateria: `py -3.13 testes/teste_kani_respostas.py` (porta 9333; rodar ao mexer no prompt/ajuda). Nome em
`kani.NOME`. Avatar `frontend/identidade/kani.webp` (original `D:/kanivete_biblioteca/marcas/kani/kani_oficial.png`, inteira com cantos arredondados como o logo). Ouvir: voz Fran
(OmniVoice 12 passos + `kani.PRONUNCIA` para nomes do app e siglas) mantida carregada enquanto o chat está aberto (`omnivoice_tool.manter_carregado`/`descarregar`,
runner `serve`), ~3 s por leitura. Teste: `py -3.13 testes/teste_kani.py` (porta 9334).
**Kani cria no chat** (2026-10-12): imagem (Z-Image), efeito sonoro (EzAudio), narração (Fran) e vinheta (narração + jingle
do Soundboard + impacto, mixada no ffmpeg) — `Functions/kani_criar.py` (detectar por verbo + tipo; a Kani escreve o
prompt/texto e sai da placa), cartão com progresso, prévia, Baixar/Abrir/Mostrar na pasta (`kaniCriacao` em kani.js);
arquivos em `modelos_ia/kani/criacoes`. Faixa "Peça à Kani" na Home (`kaniHome`).
**Kani fora da Home + contexto da tela** (2026-10-16, `frontend/js/kani-tela.js`): bolinha flutuante arrastável (posição
em localStorage `kani-flutua-pos`; clique abre a gaveta). A cada mensagem vai um RESUMO EM TEXTO do que está aberto
(`KANI_TELA['<página>']`: Photo, Vídeo, Vetor, Sound, Slider; genérico nas outras), lido só ao enviar, no fim do prompt
(`kani._sistema(…, tela)`; cache intacto): 1ª palavra 2,8 s com × 2,5 s sem. Pergunta sobre o que está aberto não vai
para o modo em etapas. Chip "👁 Vendo…" no pé da gaveta liga/desliga (`kani-ver-tela`). Ferramenta nova: um leitor em `KANI_TELA`.
Gerador que falta (imagem/efeito): `kani_criar.FaltaModelo` → o cartão mostra "Baixar o gerador (X GB)" (`kani_baixar_modelo`,
`kaniModeloProgresso`) e refaz o pedido sozinho ao terminar; no modo em etapas, botão "Refazer o pedido".
**Mãos da Kani** (2026-10-13): flyer montado AO VIVO no Photo a partir de uma ficha da Kani (trilho paralelo, não mexe
nas ferramentas do Claude) — `Functions/kani_maos.py`, `frontend/js/kani-maos.js`; guia `Instructions/agente/kani-maos.md`;
teste `py -3.13 testes/teste_kani_maos.py`.
**Kani em etapas (agente)**: `Functions/kani_agente.py` — planeja, usa uma ferramenta por passo (JSON travado), revisa e
entrega; pedidos compostos ou botão 🧠. Biblioteca de músicas (pasta local analisada + Openverse): `Functions/musicas.py`,
`frontend/js/musicas.js` (barra lateral › Músicas); a vinheta usa música da biblioteca pelo clima. Guia: `kani-motor.md`.

## Remover fundo (recorte)
GPU automática (onnxruntime-directml), pessoa → BiRefNet matting / objeto → BEN2 (YuNet decide), uma sessão por vez na
placa; medições, qualidade e pendências (cena em duas passadas ainda não publicada) em `Instructions/agente/remover-fundo.md`.

## Logotipo (marca)
**Antes de desenhar logo: `Instructions/agente/direcao-logotipo.md`** (princípios Haviv/Rand, construção de desenhista de
letra: extremos, sem joelho, G2, miolo por deslocamento). `tools/logotipo.py` (fonte livre + peça em Bézier; `gota_bez`,
`deslocar`) e `tools/contorno.py` (pente de curvatura: joelho/salto/extremo) antes de qualquer olhada. Prancha de
direções em P&B + reduções + ícone para o Pailer escolher.

## Carrossel com direção de arte
Roteiro JSON → `tools/esqueleto.py --montar` (10 layouts, 6 estilos, arte-final, auto-ajuste, revisor de direção);
Jr: `tools/roteiro_local.py --etapas [--hibrido]`; mapa: `tools/direcao_mapa.py`. Guia e pendências:
`Instructions/agente/direcao-carrossel.md`. Briefing de carrossel: responder como diretor de arte no formato de `Instructions/agente/diretor-de-arte.md`.

## Vetor Kanivete (estilo Illustrator, para gráfica)
Estudo de caso, modelo, API, fechamento e pendências: `Instructions/vetor-kanivete.md`; código `frontend/js/vetor-*.js` +
`Functions/vetor_*.py`. Abre PDF/AI/SVG/PPTX, salva `.aknv`, exporta PDF/X-4 e X-1a (curvas, CMYK pelo ICC, sangria,
marcas, verificação relendo o PDF). **API primeiro**: tudo é `vkCmd`/`window.VKN.cmd` (interface, Claude e Worker iguais);
ler o documento com `VKN.mapa()`, conferir com `VKN.fechamento()`. Worker: `"app": "vetor"`. Teste: `python testes/teste_vetor.py`
(rodar antes de release quando mexer no Vetor).
Traçado de imagem v2 (Image Trace: VTracer + limpeza por IA + fundo + cores da marca, já solto em curvas): `Functions/vetor_tracar.py`,
`frontend/js/vetor-tracar.js`, tabela §1 do guia.
Sinalização em série (placas 001…200 no mesmo arquivo): `serie_pranchetas` (Objeto › Pranchetas: Série numerada…), marcas
de corte do guia do cliente (`marcas_dist/comp/esp`) e erro `sem_glifo` (fonte embutida sem os algarismos): §14 e §4 do guia.
Pranchetas (ordem 4 por linha/vertical, duplicar, Alt+arrastar, alças), Novo documento com modelos e Criar fonte (.otf de
glifos em pranchetas): §14 do guia; `testes/teste_pranchetas.py`, `testes/teste_fonte.py`.
Illustrator ida e volta (.ai NATIVO montado no Illustrator instalado; volta com pranchetas/camadas/texto de área): §15,
`Functions/ponte_illustrator.py`, `testes/teste_illustrator.py`.
Painéis móveis do Vetor (mecanismo do Photo): §16, `frontend/js/vetor-dock.js`, `testes/teste_vetor_paineis.py`.

## Build local
- `build.bat` apaga `dist/` inteiro, onde ficam os modelos do usuário (`modelos_ia/`, `models/`, ~8 GB).
  Gere em outra pasta (`--distpath dist_novo --workpath build_novo`) e copie só `CaniveteDoPailer.exe`,
  `_internal/`, `version.txt` e `LEIA-ME.txt` para `dist/CaniveteDoPailer/`.
- Push na `main` dispara o release automático (GitHub Actions + updater dos amigos).

## Gerar efeito sonoro por texto (IA local)
Caixa "Gerar efeito (IA)" no topo do Soundboard (`frontend/js/editor-sfx-gerar.js`) → `Functions/gerador_sfx.py`: EzAudio XL
(MIT) + encoder flan-t5-xl (Apache 2.0) convertidos para ONNX 16 bits, rodando no onnxruntime-DirectML (sem torch, sem login).
Modelo (~4 GB) baixado no 1º uso do release `sfx-v1` (pré-lançamento; manifesto com SHA-256; os .pesos grandes em pedaços de 200 MB, juntados no download — upload de arquivo grande cai na conexão do Pailer).
Texto do leitor no PROCESSADOR, gerador/decodificador na placa (recriar sessão DirectML com outra aberta derruba o
processo). 50 passos (padrão; o Pailer achou "muito melhor" que 25) ≈ 35 s por 10 s numa RTX 3050, pico +4,7 GB.
A Kani reescreve o pedido POR BAIXO (`melhorar_pedido`, `SISTEMA_PEDIDO`) no formato que o EzAudio gera melhor
(boas práticas do artigo: legenda descritiva em inglês estilo AudioCaps, ordem dos eventos, sem jargão, sem fala/música,
objetos nunca "groan"), sem fugir do pedido; Ollama (think false, keep_alive 0) ou llama.cpp da Kani (parado depois),
sempre saindo da placa antes da geração. Conversão: `D:\kanivete_testes\sfx\ez`
(exportar.py, enxugar.py, consertar.py). Teste: `py -3.13 testes/teste_sfx.py [pasta]`.

## Soundboard (pack de sons do editor)
- Não vai no build: o painel baixa `soundboard-vN.zip` do release `soundboard-vN` (pré-release, para não virar
  o "latest" do updater) e instala em `<app>/soundboard/`. Só sons CC0 (Kenney, Freesound filtrado por CC0).
- **Pack v5** (2026-10-18, 287 sons/16 categorias, 10 MB; v3 = + 22 whooshes suaves curtos para a Legenda Premium; v4/v5 = 17 sub
  drops e 16 sons de UI digital SINTETIZADOS por `D:/kanivete_testes/sfx_pack/sintetizar_subdrops.py` e `sintetizar_v2.py`, sem licença de terceiros):
  `tools/fatiar_sfx.py` (corta no mínimo de silêncio, nomeia, anota a origem no manifesto) e `tools/pack_sfx.py`
  (Opus 128k/96k mono, volume nivelado; `--zip N` monta o release). Mestres WAV e manifesto em `D:/kanivete_testes/sfx_pack`
  (sons de marca/jogo/filme/biblioteca paga ficam marcados "licenca" e fora do pack). Pack novo: suba `VERSAO` em
  `Functions/soundboard.py`, publique `soundboard-vN.zip` no release `soundboard-vN` (pré-release); o app oferece "Atualizar".
  O v1 (Kenney/Freesound) era montado por `tools/montar_soundboard.py`.

## Segredos
- `Functions/_credenciais.py` (client secret do Google Drive) fica fora do git; no CI vem do secret
  `GDRIVE_CLIENT_SECRET`. Nunca exibir nem commitar o valor.
- Chave de API do Drive (`API_KEY` no mesmo `_credenciais.py`; secret `GDRIVE_API_KEY`; projeto canivete-do-pailer, restrita à
  Google Drive API): link PÚBLICO baixa sem login (`Functions/drive_publico.py`, sem a tela "O Google não verificou este app");
  link privado continua no login (rclone, escopo drive). Atualizador: tenta de novo se falhar, plano B pelo site do GitHub,
  log em `logs/atualizacao.log`; clicar na versão = verificar agora.

## ffmpeg
- O ffmpeg baixado é recente (7+): `-filter_complex_script` não existe mais; use `-/filter_complex`
  (ver `_opcao_filtro_script` em `Functions/video_cutter.py`).
- Versão FIXA: série estável **n8.1** do BtbN (`first_run.py`, campo `versao` + `modelos_ia/ffmpeg.exe.versao`; quem
  tem outra baixa de novo uma vez). Não voltar para a diária ("master") nem subir para a 9.0 sem conferir o driver
  NVIDIA mínimo do NVENC (`grep -a "610.00" ffmpeg.exe`): a diária de 2026-09 e a 9.0 exigem 610+ e quem tinha driver
  mais antigo perdeu a placa. A 8.1 tem Vulkan, libplacebo, overlay/scale_vulkan, h264_vulkan e NVENC.

## Canivete Worker (assistente local)
Antes de olhar imagem: `tools/medir_ref.py` (mede a referência: textos, formas, paleta → rascunho HTML), `knv.py --revisar`
/ `tools/revisor.py` (regras dos feedbacks do usuário: corte seco, contraste, sombra dura, avatar), `tools/olho.py`
(visão local Gemma 4 E4B: ler/revisar/comparar — pista, não verdade). Fluxo em `Instructions/agente/design-photo-kanivete.md`
("Fluxo barato v2"). Cada feedback novo do usuário vira regra no revisor (`KNV.revisarPeca` em imagem-api.js + revisor.py).
Planos de economia de tokens, ponte Vetor ↔ Photo e nível de campanha: `Instructions/agente/plano-economia-ponte-vetor-photo.md`.
Operações repetitivas no Photo Kanivete: escrever um contrato e delegar ao Qwen3 8B local (`py -3.13 tools/worker/worker.py contrato.json`),
que volta numa linha JSON. Contrato, condições de sucesso e ferramentas: `Instructions/agente/worker.md`.
Infraestrutura braçal (achar no código, troca mecânica, rodar teste, diagnosticar traceback): Code/Debug Worker
`py -3.13 tools/worker/codigo.py contrato.json` (ferramentas fechadas); eu reviso só o diff. Mesmo guia.
