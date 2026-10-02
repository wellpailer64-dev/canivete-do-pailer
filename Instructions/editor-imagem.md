# Editor de Imagem (estilo Photoshop)

Categoria Imagem → **Editor de Imagem**. Abre PSD/PSB com as camadas, fotos (PNG, JPG, WebP, TIFF...) ou documento novo.

## Arquivos
- `frontend/js/imagem-nucleo.js` — modelo (documento, camadas, máscaras), histórico (copy-on-write), composição
  (modos de mesclagem do Photoshop, grupos com passagem, máscara de corte, máscaras, efeitos, camadas de ajuste), vista.
- `frontend/js/imagem-ajustes.js` — matemática dos ajustes (camadas de ajuste do PSD e menu Imagem > Ajustes) e filtros.
- `frontend/js/imagem-ferramentas.js` — ferramentas (Mover, Letreiro, Laço, Varinha, Corte, Conta-gotas, Carimbo,
  Pincel, Borracha, Degradê, Balde, Forma, Mão, Zoom) e Transformação livre (Ctrl+T).
- `frontend/js/imagem-texto.js` — camada de texto (edição na tela) e texto do PSD editável.
- `frontend/js/imagem-paineis.js` — menus, barra de opções, painéis Camadas/Propriedades/Histórico, cor, atalhos.
- `frontend/js/imagem-arquivo.js` — abrir, salvar, exportar, comandos dos menus, área de transferência.
- `frontend/js/imagem-fatias.js` — ferramenta Fatia (C / Shift+C): criar, mover/redimensionar, dividir, das camadas,
  opções (nome/URL/alt), Arquivo > Exportar fatias; lidas e gravadas no PSD (recurso de fatias, versão 6).
- `frontend/js/imagem-dock.js` — painéis móveis: arrastar o título para a outra coluna, entre painéis ou solto
  sobre a imagem; duplo clique recolhe; divisórias e bordas mudam o tamanho; menu Janela (layout em localStorage).
- `frontend/js/imagem-estilo.js` — Estilo de camada (Sombra projetada, Brilho externo, Traçado, Sobreposição de cor)
  com prévia; duplo clique na linha da camada, botão fx do painel ou Camada > Estilo de camada.
- `frontend/css/imagem.css`, `Functions/editor_imagem.py`, `main.py` (métodos `ie_*`), `Functions/media_server.py`
  (servir bytes da memória e receber POST).

## Projeto (.iknv) e atalhos
- `.iknv` = projeto do editor: zip com `documento.json` (árvore de camadas inteira, canvases como `{$png}`), `pixels/*.png`
  e `previa.png`. Documento novo salva em `.iknv` por padrão (o diálogo também oferece `.psd`); Ctrl+S num `.iknv`
  salva nele. Se veio de um PSD que não mudou, guarda `psd_origem` e "Salvar como PSD" continua de ida e volta.
- `frontend/js/imagem-atalhos.js`: atalhos padrão do Photoshop (Windows) conferidos na referência oficial da Adobe
  (PDFs "Keyboard shortcuts | Photoshop" e "Photoshop CC Windows Keyboard Shortcuts Reference"); Ajuda > Atalhos do
  teclado (Alt+Shift+Ctrl+K) lista todos, marcando os que o editor ainda não tem (Q, J, O, P, R, réguas/guias...).
  Modos de mesclagem por Shift+Alt+letra valem para a camada (o editor não tem modo no pincel).

## Reaproveitado do editor de vídeo
- Filtro > Filtro Camera Raw (Shift+Ctrl+A): a conta do Luz e Cor (`veLcBuildLut`, editor-lc.js) vira LUT 3D aplicada
  na camada (trilinear), mais nitidez na luma e vinheta; painel na lateral com a imagem à vista.
- Painel Propriedades: Transformar (X/Y/L/A com proporção, inverter, girar) e Caractere (seletor de fonte com prévia,
  estilo, tamanho, VA, entrelinha, cor, alinhamento, negrito/itálico falso, maiúsculas).

## Texto de verdade
- A fonte de cada estilo é carregada do arquivo instalado (`FontFace` com `local()` + arquivo servido por
  `ie_fonte_url`): o nome GDI (cortado em 31 letras) não batia com o CSS e o texto caía numa fonte qualquer.
- Editando, o texto é desenhado na tela com a fonte, a cor e os efeitos da camada; a caixa por cima é transparente
  (só cursor e seleção). Sem mudança, volta aos pixels do Photoshop.

## Abrir e salvar
- As camadas vêm do Python como PNG **servido da memória** (nada em disco); a página libera com `ie_liberar`.
- Salvar é de ida e volta: o Python relê o PSD de origem e troca só o que mudou. Camada não pintada fica como estava
  (texto, objeto inteligente, forma, efeitos e ajustes continuam editáveis no Photoshop). Mover/transformar texto,
  objeto inteligente e forma atualiza a matriz/caminhos (não rasteriza). Texto editado continua texto (conteúdo e
  estilo do começo: fonte, tamanho, cor, espaçamento, entrelinha, alinhamento). Pintar troca só os pixels.
- Camada nova (inclusive texto criado no editor) vai como camada de pixels. Documento que não veio de PSD RGB é montado do zero.
- A composição feita pela página vira a imagem achatada do arquivo.
- Efeitos editados no editor (`L.fxMudou`) ou de camada nova: o Python reescreve só Sombra projetada, Brilho externo,
  Traçado e Sobreposição de cor no `lfx2` (os outros efeitos ficam; efeito tirado fica desligado; `lrFX` sai).
- Fatias: gravadas quando mudaram (ou em arquivo novo).

## Limitações conhecidas (MVP)
- Efeitos de camada desenhados e editáveis: Sombra projetada, Brilho externo, Traçado, Sobreposição de cor (os outros
  ficam no arquivo, sem aparecer). Não se editam os parâmetros das camadas de ajuste (só mostrar/manter).
- Caixa alta e negrito/itálico falso de texto do PSD aparecem no editor, mas não vão para o arquivo.
- Fatias de camada (origem "camada") e fatias automáticas não são editadas; só as do usuário.
- `TÍTULO PRINCIPAL BENTO E RONALD.psd` (portfólio) abre com diferença média 5,6 contra o achatado (sombra dos
  textos); já era assim antes desta rodada.
- Ajustes sem desenho: Pesquisa de cores (LUT). Cor seletiva, Equilíbrio de cores, Vibratilidade e Filtro de fotos são aproximados.
- Não há criação de camada de ajuste nova, estilos de camada novos, máscara vetorial, pincel de recuperação.
- Texto com estilos misturados vira um estilo só quando editado.
- Fidelidade medida contra o achatado do Photoshop nos 43 PSDs do portfólio: média < 1/255 na maioria, pior caso ~4/255.

## Teste
`python testes/teste_imagem.py` (abre o app em `--agente=9333`; `--psd <arquivo>` para um PSD real): mover, pincel,
seleção+apagar, máscara, Ctrl+T, texto, desfazer/refazer, balde, degradê, varinha, laço, forma, carimbo, filtros,
mesclar, agrupar, tamanho/girar/cortar, fatias, estilo de camada, alça da ferramenta Mover, miniaturas, fonte
carregada, salvar e conferir com o psd-tools (fatias e efeitos no arquivo), reabrir. Sai com 1 se falhar.
No console: `ieDiferencaAchatado()` mede a diferença do documento aberto contra o achatado do arquivo.
