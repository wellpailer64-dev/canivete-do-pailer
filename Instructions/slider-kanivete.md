# Slider Kanivete (Sd, verde-água) — apresentações 16:9

PowerPoint moderno (Canva/Figma) dentro do KANIVETE, feito para as palestras mensais de cliente do Pailer: trabalho
manual e por agente pelos MESMOS comandos, leve e fiel na exportação. Criado em 2026-10-16.

## Onde fica
| Parte | Arquivo |
|---|---|
| Núcleo: documento, camadas, desenho, histórico, comandos `SD_CMDS`, HTML → slide, foto/exportar, fontes | `frontend/js/slider.js` |
| Interface: lobby, menus, barra, lista de slides, mesa (alças, giro, encaixe, laço, texto), painéis Design/Camadas | `frontend/js/slider-ui.js` |
| Apresentação: tela cheia, transições, animações por passo, vídeo, visão do apresentador | `frontend/js/slider-show.js` |
| Visual | `frontend/css/slider.css` (`.al-sd` = logo) |
| Projeto .dknv, PDF/PNG/MP4/PPTX, PPTX editável, importar PPTX, mídia colada | `Functions/slider_kanivete.py` |
| Ponte | `main.py` › `sd_salvar`, `sd_abrir`, `sd_url`, `sd_quadro`, `sd_exportar`, `sd_importar_pptx`, `sd_gravar_midia` |
| Encaixe no app | `index.html` (barra › Apresentação, Home, `#page-slider-kanivete`), `app.js` (`sdAoTrocar`, `.dknv` em `abrirProjetoExterno`), `lobby.js` (`#sd-inicio`), `home-banners.js` (`sd`), `Functions/projeto.py` (`.dknv`), `tools/icones_arquivos.py` (`sd`) |
| Arte | `img/home/banner-sd.webp`, `img/tools/slider-kanivete.webp` (Z-Image, `D:/kanivete_testes/scripts/gerar_banners.py sd`), `video/lobby-sd.webm` (home-bg tingido) |
| Teste | `py -3.13 testes/teste_slider.py [--sem-mp4]` (app em --agente=9333; ~2 min) |

## Modelo
`doc = {nome, largura: 1920, altura: 1080, tema: {titulo, texto, cores: {fundo, tinta, destaque, suave, apoio}}, slides: [...]}`
`slide = {id, fundo: {tipo: cor|degrade|imagem, cor, cor2, angulo, img, ajuste, escurecer}, transicao: {tipo, dur}, dur (s no MP4), notas, oculto, camadas}`
`camada = {id, tipo: texto|forma|imagem|video, nome, x, y, w, h, rot, opac, mescla, sombra {x,y,desf,cor}, desfoque, oculto, trava, grupo, anim {tipo, dur, atraso, clique}}`
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

## Armadilhas (medidas)
- Vídeo no canvas: `crossOrigin = 'anonymous'` (o servidor de mídia é outra porta; manda ACAO *). Sem isso: "Tainted canvas".
- SVG com foreignObject NÃO vê o CSS do app nem fontes do `document.fonts`: estilos inline e fontes embutidas.
- Fontes variáveis/instaladas só para o usuário (Fraunces) não existem pelo nome no CSS: `sdGarantirFontes` testa
  (`sdFonteNativa`, medindo contra monospace e serif) e carrega por `FontFace` com o arquivo (`ie_fonte_url`).
- `window.SDK.cmd` chama `sdCmd` pelo NOME: o `tools/aplicar.py` troca funções a quente e o SDK segue a nova.
- Mesa incremental (`sdRenderMesa`): só a camada que mudou é recriada; vídeo que só mudou de posição não recarrega.
- Miniaturas de vídeo usam a capa guardada (`SD.posters`), nada de `<video>` na lista (leveza).

## Atalhos
Ctrl+N nova · Ctrl+O abrir · Ctrl+S / Ctrl+Shift+S salvar · Ctrl+M novo slide · T texto · Enter edita texto · Ctrl+Z/Y ·
Ctrl+C/X/V/D · Del · Ctrl+A · Ctrl+G / Ctrl+Shift+G agrupar · Ctrl+L travar · Ctrl+H ocultar · Ctrl+] [ ordem (Shift = topo/fundo) ·
setas movem (Shift 10 px) ou trocam de slide sem seleção · Ctrl+0 ajustar / Ctrl+1 100% / Ctrl+rodinha zoom · F5 apresentar /
Shift+F5 deste slide. Na mesa: Shift trava o eixo ao mover; Alt sem encaixe; alças de imagem/vídeo mantêm a proporção
(Shift solta); Alt na alça = a partir do centro; Shift no giro = 15°; Ctrl+clique pega o item dentro do grupo.
Apresentação: → Espaço clique avança (passos) · ← volta · número+Enter · B/W tela preta/branca · N apresentador · Esc sai.

## Pendências (próximas rodadas)
- Apresentador em 2ª tela (janela própria do pywebview com as notas, plateia no projetor).
- Gráficos (barras/pizza editáveis), ícones e biblioteca de elementos; mestre de slides (layout próprio do cliente).
- Vídeo tocando DENTRO do MP4 exportado (hoje vai o quadro de `ini`); áudio de fundo na apresentação.
- Importar PPTX: vídeos/áudios, gráficos, fontes do tema e cores herdadas do mestre; texto com várias colunas.
- Rótulos/réguas, guias fixas arrastáveis, colaboração/comentários.
