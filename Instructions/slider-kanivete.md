# Slider Kanivete (Sd, verde-água) — apresentações 16:9

PowerPoint moderno (Canva/Figma) dentro do KANIVETE, feito para as palestras mensais de cliente do Pailer: trabalho
manual e por agente pelos MESMOS comandos, leve e fiel na exportação. Criado em 2026-10-16.

## Onde fica
| Parte | Arquivo |
|---|---|
| Núcleo: documento, camadas, desenho, histórico, comandos `SD_CMDS`, HTML → slide, foto/exportar, fontes | `frontend/js/slider.js` |
| Interface: lobby, menus, barra, lista de slides, mesa (alças, giro, encaixe, laço, texto), painéis Design/Camadas | `frontend/js/slider-ui.js` |
| Apresentação: tela cheia, transições, animações por passo, vídeo, visão do apresentador; quadros-chave (`sdAnimQuadros`, `sdTransQuadros`) que a prévia na mesa também usa | `frontend/js/slider-show.js` |
| Gráficos (camada `grafico`, SVG; 14 modelos `SD_GRAF_MODELOS`, painel de dados em CSV, galeria) | `frontend/js/slider-grafico.js` |
| Painel Cores: paletas por cliente (as MESMAS do Amostras do Photo: `IE.prefs.amostrasLista`), Photoshop, .aco/.ase | `frontend/js/slider-cores.js` + `Functions/amostras.py` (`escrever_ase`) |
| Ferramentas do agente: `SDK.texto/folha/revisar/achar/lote`, `substituir`, `estilo_copiar/colar`, `slide_layout` | `frontend/js/slider-agente.js` + `tools/sd.py` (linha de comando) |
| Visual | `frontend/css/slider.css` (`.al-sd` = logo) |
| Projeto .dknv, PDF/PNG/MP4/PPTX, PPTX editável, importar PPTX e PDF, mídia colada | `Functions/slider_kanivete.py` |
| PowerPoint: transições, animações de entrada e vídeo (tocar sozinho/repetir/mudo) no XML, e a volta | `Functions/slider_pptx.py` |
| Kani: roteiro de palestra, notas, reescrever (ficha travada; o código monta) | `Functions/slider_kani.py` + `frontend/js/slider-kani.js` |
| Ponte | `main.py` › `sd_salvar`, `sd_abrir`, `sd_url`, `sd_quadro`, `sd_exportar`, `sd_importar_pptx`, `sd_gravar_midia` |
| Encaixe no app | `index.html` (barra › Apresentação, Home, `#page-slider-kanivete`), `app.js` (`sdAoTrocar`, `.dknv` em `abrirProjetoExterno`), `lobby.js` (`#sd-inicio`), `home-banners.js` (`sd`), `Functions/projeto.py` (`.dknv`), `tools/icones_arquivos.py` (`sd`) |
| Arte | `img/home/banner-sd.webp`, `img/tools/slider-kanivete.webp` (Z-Image, `D:/kanivete_testes/scripts/gerar_banners.py sd`), `video/lobby-sd.webm` (home-bg tingido) |
| Teste | `py -3.13 testes/teste_slider.py [--sem-mp4]` (núcleo, ~2 min) e `py -3.13 testes/teste_slider_extra.py` (gráficos, paletas, animações, agente, leveza e TODOS os atalhos com teclado de verdade, ~1 min) — app em --agente=9333 |

## Modelo
`doc = {nome, largura: 1920, altura: 1080, tema: {titulo, texto, cores: {fundo, tinta, destaque, suave, apoio}}, slides: [...]}`
`slide = {id, fundo: {tipo: cor|degrade|imagem, cor, cor2, angulo, img, ajuste, escurecer}, transicao: {tipo, dur}, dur (s no MP4), notas, oculto, camadas}`
`camada = {id, tipo: texto|forma|imagem|video|grafico, nome, x, y, w, h, rot, opac, mescla, sombra {x,y,desf,cor}, desfoque, oculto, trava, grupo, anim {tipo, dur, atraso, clique}}`
- gráfico: `grafico` colunas|barras|empilhadas|linha|area|pizza|rosca|progresso|trilhas|waffle|funil, `rotulos [..]`, `series [{nome, valores, cor?}]`,
  `valores` (mostrar), `legenda`, `grade`, `raio`, `espessura`, `suave`, `pontos`, `buraco`, `centro` (sem = 1º valor), `max`, `prefixo`, `sufixo`, `casas`,
  `cores [..]` (sem = derivadas do tema: destaque, apoio e vizinhas no círculo de cores), `corTexto`, `fonte`, `tamTexto`.
- texto: `html` (b/i/u/span com cor/tamanho), `fonte`, `tam` (px no slide de 1920), `peso`, `cor`, `alin` esq|centro|dir|just, `valin` topo|meio|base, `entrelinha`, `espaco`, `caixa` alta|baixa, `fundo`, `pad`, `raio`.
- forma: `forma` ret|elipse|tri|losango|estrela|hexagono|seta|linha|coracao|balao, `preench`, `preench2`+`angulo` (degradê), `traco`, `espessura`, `raio`, `ponta: 'seta'` (linha), `tracejado`.
- imagem (GIF anima sozinho) / vídeo: `src` (caminho absoluto), `ajuste` cobrir|conter|esticar, `focoX/Y`, `raio`, `filtros {brilho, contraste, saturacao, pb}`, `borda {esp, cor}`; vídeo: `auto`, `loop`, `mudo`, `ini`.
- Temas prontos `SD_TEMAS` (claro, escuro, editorial, corporativo); os layouts (`SD_LAYOUTS`) escolhem o par escuro/claro do tema pela luminância (`sdLum`) — funciona em tema claro e escuro.

## Para o agente (API — a mesma que a interface usa)
```js
await SDK.cmd('modelo', {tema: 'escuro', nome: 'Palestra de outubro'})   // 8 slides prontos para editar
SDK.mapa()                                    // slides e camadas resumidos (id, tipo, nome, caixa, texto)
await SDK.cena(`<div style="width:1920px;height:1080px;background:#101820">...</div>`, {novo: true})  // HTML/CSS → camadas
await SDK.cmd('texto', {texto: 'Olá', x: 140, y: 120, w: 1200, h: 120, tam: 80, slide: 2})
await SDK.cmd('imagem', {src: 'D:/foto.jpg'}) ; await SDK.cmd('video', {src: 'D:/clipe.mp4', loop: true})
await SDK.cmd('editar', {ids: [...], cor: '#fff'}) ; SDK.cmd('alinhar', {como: 'centro'}) ; SDK.cmd('tabela', {linhas: 4, colunas: 3, textos: [[...]]})
await SDK.cmd('slide_transicao', {tipo: 'deslizar', todos: true}) ; SDK.cmd('slide_props', {slide: 3, notas: '...'})
await SDK.cmd('salvar', {caminho: 'D:/x.dknv'}) ; SDK.cmd('exportar', {formato: 'pdf'|'pptx'|'pptx_imagens'|'png'|'mp4', caminho})
await SDK.foto(3)                             // data URL JPEG do slide 3 (para conferir sem print da tela)
SDK.comandos()                                // lista com a descrição de cada comando
```
**Ler barato (usar nesta ordem):** `SDK.texto()` (roteiro em texto, uma linha por camada: tipo, id, texto, tamanho, fonte,
cor, caixa, ★animação) → `SDK.revisar()` (estouro de caixa medido com a fonte real, fora do slide, letra < 22 px, contraste
< 3:1 contra o que está atrás, textos sobrepostos, mídia sumida, slide vazio — com id e o conserto sugerido) → só então
`SDK.folha({caminho, largura: 240})` (todas as páginas numa imagem numerada) ou `SDK.foto(n)`. Mexer em lote:
`SDK.lote([['texto', {...}], ['grafico', {...}]])` = um Ctrl+Z só. `SDK.achar('palavra')`, `cmd('substituir', {de, para})`,
`cmd('slide_layout', {layout, slide})`, `cmd('estilo_copiar'/'estilo_colar')`. Gráfico: `SDK.grafico({modelo: 'ranking', csv: 'Canal;%\nInstagram;38\n...'})`,
`SDK.modelosGrafico()`, `cmd('grafico_dados', {id, csv})`. Paletas: `cmd('paletas')`, `cmd('paleta_salvar', {nome, cores})`, `cmd('paleta_tema', {nome})`.
Pela linha de comando, no app aberto (não fecha nada): `py -3.13 tools/sd.py texto | revisar | folha f.jpg | foto 3 f.jpg |
cmd nome '{json}' | lote l.json | cena pagina.html (cada <section class="slide"> vira um slide) | js "expr" | comandos` [--porta].
`SDK.curto = true` devolve só ids/caminhos. Montar uma palestra inteira: um `SDK.cena(html, {novo: true})` por slide
(posições absolutas em px do slide; `<img data-src="D:/...">` / `<video>` viram mídia; fundo do 1º elemento = fundo do slide;
`data-fundo-img` = foto de fundo; `data-nome` = nome da camada) e conferir com `SDK.foto(n)` em folha reduzida.
Abrir um PPTX do cliente: `SDK.cmd('abrir', {caminho: 'x.pptx'})` (títulos/tópicos herdados, marcadores, tabelas, imagens, notas).

## Exportar (fiel à tela)
Cada slide é "fotografado" pelo próprio DOM: `sdMontarSlide(s, 'foto')` (todos os estilos INLINE) → SVG `<foreignObject>` →
canvas → JPEG/PNG → `sd_quadro` grava → `sd_exportar` junta. Imagens viram data URL, vídeo vira o quadro de `ini`, e as
fontes carregadas por arquivo vão como `@font-face` embutida (`sdCssFontes`). PDF (Pillow), PNG por slide, MP4 (ffmpeg
com `xfade` pela transição de cada slide, `dur` por slide), PPTX em imagens (pixel perfeito) e **PPTX editável**
(`pptx_nativo`: texto com trechos, formas, imagens com recorte do "cobrir", vídeo como vídeo, fundo, notas; sombra/
mesclagem não vão — avisa).

## Arquivos (conferidos em `testes/teste_slider_arquivos.py`, com o LibreOffice de `D:/kanivete_testes/libreoffice` como leitor externo)
- **PowerPoint editável**: transição de cada slide (`<p:transition>` com `p14:dur`), animações de entrada como o PowerPoint
  grava (comportamentos set/animEffect/anim em `<p:timing>`; automáticas no grupo "ao abrir o slide", cada "esperar o
  clique" é um passo), vídeo tocando sozinho (`mediacall playFrom`), repetindo (`repeatCount`) e mudo (`cMediaNode mute`);
  MOV/WEBM/HEVC viram MP4 H.264 (cache); GIF vai como GIF (anima); fotos enxutas a 2× o tamanho em que aparecem (6000 px →
  ~100 KB); gráficos nativos. Sem PowerPoint nesta máquina: o LibreOffice lê animações, transições e o vídeo automático.
- **PDF**: uma página por slide em 960 × 540 pt (13,33 × 7,5 pol, igual ao PowerPoint), a foto do slide (2560 px) por cima e o
  texto de verdade invisível por baixo (buscar/selecionar/copiar funcionam), marcador com o título de cada slide, título nos
  metadados. "PDF leve" (1600 px, JPEG 80): ~40% do tamanho, para e-mail/WhatsApp.
- **MP4**: animações de entrada viram quadros (`sdPlanoAnim` + `sdCongelarAnim`: as animações de verdade paradas no instante t;
  as de clique entram em sequência; começam depois da transição), vídeos das camadas tocam DENTRO do slide (ffmpeg overlay:
  cobrir/caber/esticar, "começar em", repetir; giro e cantos não) e o som deles entra se não estiverem mudos.
- **Importar PDF** (`importar_pdf`, PyMuPDF): uma página por slide, em camadas — fundo = a página sem os textos e sem as fotos
  (redação), cada foto vira camada de imagem e cada bloco de texto vira texto editável (fonte, tamanho, cor, negrito/itálico).
  Página escaneada fica só de fundo. Medido: diferença média 5/255 para a página original.
- **Importar PowerPoint**: grupos com a escala do grupo (chOff/chExt), enfeites do layout/mestre (embaixo e travados),
  fundo herdado (cor, degradê, foto), cores e fontes do TEMA (accent1, +mj-lt…), recorte de foto, gráficos → gráfico
  editável, vídeos, transições e animações (ida e volta sem perda com o que o Slider exporta). Áudio solto: relatório.
- **Passador de slides** (controle de palestra): PageDown/PageUp (avança também os passos de clique), "." / B tela preta,
  F5 não faz nada durante a apresentação, Esc sai. Fora da apresentação, PageUp/PageDown trocam de slide.

## Kani (criação)
Barra › Kani (ou lobby › Criar com a Kani): ela escreve só o CONTEÚDO numa ficha JSON travada (`slider_kani.roteiro`) e o código
monta nos layouts do tema (`kani_montar`), depois `ajustar_textos` encolhe o que não couber. Regras que o código garante por cima
do modelo: número/citação/contato que não estão no pedido são descartados; título no estilo português (só a 1ª maiúscula,
mantendo nomes do pedido, siglas e marcas); título com número do pedido vira o layout "Número grande"; slide de conteúdo vazio
usa a fala das notas. Também: tópicos/encurtar/título/revisar no texto selecionado e notas do apresentador (deste slide ou dos
que estão sem). ~15 s por palestra de 6–7 slides (Qwen 4B local).

## Gráficos
Barra › Gráfico (ou Inserir › Gráfico) abre a galeria de 14 modelos no estilo de ferramentas conhecidas: Datawrapper (colunas
limpas, valor em cima), Canva (cantos redondos), comparação com legenda, ranking em barras, think-cell (empilhadas), tendência
(linha suave), Flourish (área degradê), pizza, rosca com o 1º valor no centro, anel de meta (KPI), três metas, trilhas de
progresso, waffle (“7 em cada 10”) e funil. Painel Design › Gráfico: tipo, **dados em CSV** (`Rótulo;Série 1;Série 2`, aceita
`1.234,5`), cor por série/fatia, valores, grade, legenda, cantos, furo, texto central, prefixo/sufixo. No PPTX editável vira
**gráfico nativo do PowerPoint** (dados no Excel embutido; anel/trilhas/waffle viram rosca/barra com o resto até o máximo).
Animação "Crescer de baixo" combina com colunas; "Revelar da esquerda" com linha/área.

## Cores (paletas de cliente)
Aba Cores: aplicar (texto = cor; forma = preenchimento; gráfico = a série escolhida; imagem/vídeo = borda; nada selecionado =
fundo do slide; **Alt+clique** = contorno/fundo da caixa/cor do texto do gráfico), cores do tema e as usadas nos slides,
"Salvar paleta" com o nome do cliente (tema atual; Alt = cores usadas nos slides), Aa = usar a paleta como tema (papéis pelo
contraste: mais clara = fundo, mais escura = texto, mais viva = destaque; tema escuro inverte), ⇩ exportar .ase,
"Importar do Photoshop" (lê o `Swatches.psp` do Photoshop mais novo, com os GRUPOS de cada cliente), importar .aco/.ase,
"Exportar todas (.ase)" (no Photoshop: Amostras › Importar amostras). Duplo clique no nome renomeia; botão direito na amostra
= opções. A lista é a mesma do Photo Kanivete (preferências em %APPDATA%, não o localStorage).

## Animações e transições
Entrada: esmaecer, subir, descer, esquerda, direita, zoom, pular (elástico), girar, crescer de baixo (recorte), revelar da
esquerda (recorte); duração, atraso e "esperar o clique" (passo). Transições: esmaecer, deslizar, empurrar, subir, zoom,
cobrir, revelar (círculo), passar pelo preto — também no MP4 (`xfade`: slideup, fadeblack, circleopen). Barra › **Animar**
e **Transição** (menus rápidos); escolher um efeito **toca a prévia na mesa** (`sdPreverAnim`, `sdPreverTransicao`), como
no PowerPoint; Exibir › Prever animações. Miniatura com selo ⇢ (transição) e ★ (animação). As animações de recorte usam
`clip-path` só durante a entrada (no fim soltam: não cortam a sombra).

## Leveza
Mesa incremental também nos comandos "tudo" (só a camada que mudou é recriada; vídeo não recarrega); miniaturas com cache
pelo JSON do slide (+ tema): a lista é refeita, mas só o slide que mudou é redesenhado. Gráfico entra na comparação com o
tema (as cores dele vêm do tema).

## Armadilhas (medidas)
- `const IE` (Photo) não fica em `window`: use `typeof IE !== 'undefined'`. Gravar `IE.prefs` sem carregar antes apaga as
  outras preferências (o ie_prefs grava o arquivo inteiro): `sdcGarantir()` carrega primeiro.
- Transição CSS de `clip-path: inset(...)` para `none` NÃO anima (pula): anime até `inset(0 0 0 0)` e solte depois.
- Vídeo no canvas: `crossOrigin = 'anonymous'` (o servidor de mídia é outra porta; manda ACAO *). Sem isso: "Tainted canvas".
- SVG com foreignObject NÃO vê o CSS do app nem fontes do `document.fonts`: estilos inline e fontes embutidas.
- Fontes variáveis/instaladas só para o usuário (Fraunces) não existem pelo nome no CSS: `sdGarantirFontes` testa
  (`sdFonteNativa`, medindo contra monospace e serif) e carrega por `FontFace` com o arquivo (`ie_fonte_url`).
- `window.SDK.cmd` chama `sdCmd` pelo NOME: o `tools/aplicar.py` troca funções a quente e o SDK segue a nova.
- Mesa incremental (`sdRenderMesa`): só a camada que mudou é recriada; vídeo que só mudou de posição não recarrega.
- Miniaturas de vídeo usam a capa guardada (`SD.posters`), nada de `<video>` na lista (leveza).

## Atalhos
Ctrl+N nova · Ctrl+O abrir · Ctrl+S / Ctrl+Shift+S salvar · Ctrl+M novo slide · Ctrl+Shift+D duplica o slide · T texto · Enter edita texto · Ctrl+Z/Y ·
Ctrl+C/X/V/D · Ctrl+Shift+C / Ctrl+Shift+V copia e cola o ESTILO · Del (com a lista de slides em foco = apaga o slide) · Ctrl+A ·
Ctrl+G / Ctrl+Shift+G agrupar · Ctrl+L travar · Ctrl+H ocultar · Ctrl+] [ ordem (Shift = topo/fundo) · Ctrl+B/I/U ·
setas movem (Shift 10 px) ou trocam de slide sem seleção · Ctrl+↑/↓ na lista muda o slide de lugar · PageUp/PageDown, Home/End ·
Ctrl+0 ajustar / Ctrl+1 100% / Ctrl+= Ctrl+− / Ctrl+rodinha zoom · F5 apresentar /
Shift+F5 deste slide (todos conferidos com teclado de verdade em `teste_slider_extra.py`). Na mesa: Shift trava o eixo ao mover; Alt sem encaixe; alças de imagem/vídeo mantêm a proporção
(Shift solta); Alt na alça = a partir do centro; Shift no giro = 15°; Ctrl+clique pega o item dentro do grupo.
Apresentação: → Espaço clique avança (passos) · ← volta · número+Enter · B/W tela preta/branca · N apresentador · Esc sai.

## Pendências (próximas rodadas)
- Apresentador em 2ª tela (janela própria do pywebview com as notas, plateia no projetor).
- Ícones e biblioteca de elementos; mestre de slides (layout próprio do cliente).
- Gráficos: importar os gráficos de um PPTX do cliente; animação por barra (uma de cada vez); mapa/tabela dinâmica.
- Animações de saída e caminho de movimento.
- Gravar a paleta direto no Swatches.psp do Photoshop (hoje vai por .ase importado lá).
- Áudio de fundo na apresentação. MP4: vídeo com giro/cantos arredondados (hoje sai reto).
- Importar PPTX: áudio solto, SmartArt, texto com várias colunas, efeitos de ênfase/saída e caminhos de movimento.
- Importar PDF: tabelas viram um bloco de texto por coluna; texto girado fica no fundo.
- Rótulos/réguas, guias fixas arrastáveis, colaboração/comentários.
