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
- `frontend/js/imagem-dock.js` — painéis móveis em colunas lado a lado (cada lado da imagem: 0+ colunas, cada uma uma
  pilha): arrastar o título para cima/baixo de outro painel empilha, para a borda lateral de uma coluna cria coluna nova
  ao lado, para a faixa da borda da imagem cria coluna colada nela, sobre a imagem vira janela solta; duplo clique
  recolhe; divisórias mudam altura e a borda de cada coluna a largura. Layout em iePref('paineis').
- `frontend/js/imagem-janela.js` — menu Janela do Photoshop: Organizar (igualar zoom/local), Espaço de trabalho
  (Essenciais, Pintura, Fotografia, Gráficos e Web + os do usuário, Redefinir, Travar; cada espaço lembra como ficou),
  22 painéis (Ajustes = camadas de ajuste novas com os valores no Propriedades, Amostras, Canais com canais alfa e
  Salvar/Carregar seleção, Caractere, Estilos de caractere/parágrafo, Composições de camadas, Configurações do pincel
  e Pincéis (forma da ponta, espaçamento, ângulo, redondeza, variação, dispersão), Cor (F6), Degradês (ferramenta
  Degradê "Personalizado"), Estilos, Formas (Forma personalizada), Glifos, Histograma, Informações (F8), Navegador,
  Observações, Origem do clone, Padrões (Definir padrão, Preencher > Padrão), Parágrafo (inclui Justificar),
  Predefinições de ferramentas), Opções, Ferramentas, Barra de tarefas contextual e a lista de documentos. Os de
  nuvem/3D/vídeo (Ações, Bibliotecas, Comentários, Credenciais, Demarcadores, Histórico de versões, Linha do tempo,
  Materiais, Registro de medidas) aparecem como "ainda não".
- `frontend/js/imagem-fx.js` — efeitos de camada (modelo e desenho): os 10 do Photoshop — Chanfro e entalhe (com
  Contorno e Textura), Traçado (+), Sombra interna (+), Brilho interno, Acetinado, Sobreposição de cor (+), de degradê (+),
  de padrão, Brilho externo e Sombra projetada (+); (+) = várias instâncias. `L.fx = {tipo: [instâncias]}`.
- `frontend/js/imagem-estilo.js` — janela Estilo de camada (igual à do Photoshop): Estilos (prontos + "Novo estilo..."),
  Opções de mesclagem (modo, opacidade, preenchimento, canais R/G/B, vazamento raso/profundo, mesclar interiores e
  cortadas como grupo, máscara oculta efeitos, Misturar se com as setas divididas por Alt), os efeitos com "+", setas,
  lixeira, menu fx, Tornar padrão / Redefinir, Visualizar e a amostra. Abre pelo botão direito na camada (primeiro item
  "Opções de mesclagem..."), duplo clique na camada, botão fx do painel, Camada > Estilo de camada. No app em inglês
  a janela usa os termos oficiais do Photoshop (IE_LS_EN). Efeitos aparecem sob a camada (fx ›) com olho por efeito.
- `frontend/js/imagem-cena.js` — `KNV.cena`: peça em HTML/CSS vira camadas nativas (runner `tools/knv.py`); guia em
  `Instructions/agente/plano-cena.md`.
- `frontend/js/imagem-api.js` — API de automação `window.KNV` (scripts/Ações para agentes): guia em
  `Instructions/agente/design-photo-kanivete.md`.
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
- Escalar/girar texto (Ctrl+T, alças, L/A) redesenha com a fonte na escala nova: nítido, como no Photoshop. Texto do
  PSD vira texto do editor nessa hora (só com a fonte instalada e um estilo só; senão estica os pixels). O tamanho
  mostrado é o real (tam × escala da matriz), como o painel Caractere do Photoshop.

## Efeitos e opções de mesclagem na composição
- Ordem de desenho como no Photoshop (de baixo para cima): sombra, brilho externo, conteúdo (com o Preenchimento),
  padrão, degradê, cor, acetinado, brilho interno, sombra interna, traçado, chanfro. Sombra e brilho externo saem como
  `ext` e misturam com o que está embaixo no modo deles; a parte de fora do chanfro externo/entalhe sai como `acima`.
- Canais, Misturar se e Vazamento são aplicados em `ieComporCamada` (imagem-nucleo.js); a máscara de corte usa só a
  forma da base (`raster.forma`), sem a sombra dela. Luz global do documento (`doc.luzGlobal`, recursos 1037/1049 do PSD).
- PSD: `_ler_fx`/`_gravar_efeitos` (lfx2, chaves únicas e *Multi) e `_ler_mescla`/`_gravar_mescla` (knko, infx, clbl,
  tsly, lmgm, vmgm, brst e as faixas do Misturar se) em Functions/editor_imagem.py. Preferências do editor (estilos
  salvos, padrões dos efeitos, painéis, fontes e arquivos recentes) em %APPDATA%/CaniveteDoPailer/editor_imagem.json.

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

## Recorte, objeto inteligente e distorção (rodada do flyer, 2026-10-03)
- Grupo da Borracha (E / Shift+E): **Borracha de plano de fundo** (amostra contínua/uma vez, limites contíguo/
  descontíguo, tolerância, proteger cor de frente) e **Borracha mágica** (apaga a cor clicada: tolerância, suavizar,
  contíguo, todas as camadas, opacidade) — `IE_BORRACHA_FUNDO`/`IE_BORRACHA_MAGICA` em imagem-ferramentas.js.
- Camada > **Remover plano de fundo** (máscara do assunto) e Selecionar > **Assunto**: IA BiRefNet-lite (onnxruntime,
  `mascara_assunto_b64` em Functions/removerfundo.py, `ie_mascara_assunto` no main.py) com cache em disco
  (`%LOCALAPPDATA%\CaniveteDoPailer\cache_recorte`, 200 últimas): a mesma imagem não roda a IA de novo.
- Camada > Objetos inteligentes > **Converter em objeto inteligente**: guarda o original (`L.c0`) e acumula a matriz
  (`L.tf`); transformar de novo sai do original, sem perda. Duplicar mantém objeto inteligente criado no editor.
- Filtro > Distorcer: **Ondulação**, **Respingos**, **Torcer** (`ieDeslocar`, imagem-ajustes.js).
- API de automação `window.KNV` (imagem-api.js): ver `Instructions/agente/design-photo-kanivete.md`.
## Gerar imagem com IA (imagem-gerador.js, Functions/gerador_imagem.py)
- Arquivo > Gerar imagem com IA...: prompt, fundo branco liso (para a Borracha mágica), proporção (ou a do documento),
  tamanho 768/1024/1536, referência (camada ativa ou documento: edição guiada pelo texto), semente. Entra como camada
  "IA: ..." (guarda prompt e semente em `L.gerada`). Barra com as fases e Cancelar (job na fila: API; já gerando: fecha
  o servidor).
- Motor: stable-diffusion.cpp `sd-server.exe` build **Vulkan** (30 MB; na RTX 3050 empatou com o CUDA de 1,1 GB) +
  FLUX.2 klein 4B Q8_0 GGUF (leejet) + Qwen3-4B Q4_K_M (unsloth, lê o prompt) + VAE flux2 (Comfy-Org), tudo sem login,
  ~7,2 GB em `<app>/modelos_ia/gerador_imagem/` (baixado na 1ª vez, com retomada `.part`). `--offload-to-cpu --fa
  --vae-tiling` (o VAE inteiro em 1024² pede ~10 GB e falhava). 4 passos, cfg 1, euler.
- Servidor sobe na 1ª geração (~10 s; na 1ª vez do PC o Vulkan compila shaders, ~40 s a mais), API nativa assíncrona
  `/sdcpp/v1/img_gen` + consulta do job; fecha sozinho após 5 min parado; preso a um Job do Windows (fecha junto com o
  app, mesmo se ele cair). Cache em `%LOCALAPPDATA%/CaniveteDoPailer/cache_gerador` (hash de prompt+tamanho+semente+refs).
- Referência vai achatada sobre branco: transparente o modelo lê como preto.
- Trocar de versão do sd.cpp: `SD_TAG` em gerador_imagem.py (a API do servidor muda entre versões; testar).


## Limitações conhecidas (MVP)
- Efeitos: Contorno (curva) de sombra/brilho, Ruído, Brilho com degradê e Traçado com padrão do PSD não são
  desenhados (ficam no arquivo). Sobreposição de padrão usa os padrões do editor: a do PSD aparece com um padrão do
  editor e continua a do Photoshop no arquivo; uma nova não vai para o PSD (o PSD guarda o padrão dentro do arquivo).
  A Textura do chanfro não vai para o PSD. Grupos ainda não têm estilo de camada. Não se editam os parâmetros das
  camadas de ajuste (só mostrar/manter).
- Caixa alta e negrito/itálico falso de texto do PSD aparecem no editor, mas não vão para o arquivo.
- Fatias de camada (origem "camada") e fatias automáticas não são editadas; só as do usuário.
- `TÍTULO PRINCIPAL BENTO E RONALD.psd` (portfólio) abre com diferença média 5,6 contra o achatado (sombra dos
  textos); já era assim antes desta rodada.
- Ajustes sem desenho: Pesquisa de cores (LUT). Cor seletiva, Equilíbrio de cores, Vibratilidade e Filtro de fotos são aproximados.
- Não há criação de camada de ajuste nova, estilos de camada novos, máscara vetorial, pincel de recuperação.
- Texto com estilos misturados vira um estilo só quando editado.
- Fidelidade medida contra o achatado do Photoshop nos 43 PSDs do portfólio: média < 1/255 na maioria, pior caso ~4/255.

## Espaço de trabalho padrão, pranchetas, réguas e guias (imagem-prancheta.js)
- Padrão = o workspace do Pailer no Photoshop: Amostras + Cor à esquerda; Parágrafo, Caractere e Propriedades numa
  coluna e Camadas em outra à direita (`IE_DOCK_PADRAO` e o espaço Essenciais). Ferramentas na ordem e nos grupos do
  Photoshop (`IE_FERR_GRUPOS`: Corte/Fatia, Degradê/Balde; botão direito ou segurar abre a lista).
- Amostras com grupos: na 1ª vez vêm do Photoshop instalado do próprio usuário (`Functions/amostras.py` lê o
  Swatches.psp com a hierarquia 8BIMphry); importa .aco/.ase. Ficam só nas preferências locais (%APPDATA%), nunca
  no git: cada usuário tem as suas.
- Pranchetas do PSD (artb): grupo com `L.prancheta = {x, y, w, h, fundo}`, composto isolado com fundo e recorte;
  fora delas é área de montagem; nome em cima (clique seleciona); Propriedades edita L/A/X/Y/fundo (grava no artb);
  Arquivo > Pranchetas para arquivos. Ainda não há ferramenta Prancheta (criar prancheta nova).
- Réguas (Ctrl+R, unidade no canto), guias (arrastar da régua; Mover arrasta; de volta à régua apaga; Ctrl+;,
  Alt+Ctrl+; trava, Nova guia, Novo layout de guias), lidas e gravadas no PSD (recurso 1032).
- Caractere/Parágrafo completos (escala H/V, deslocamento, kerning, versalete, sobrescrito/subscrito, sublinhado,
  tachado, 7 alinhamentos, recuos, espaço antes/depois, hifenizar só grava no PSD), gravados no EngineData do texto
  do PSD; texto novo continua indo para o PSD como pixels.
- Camadas: filtro por tipo e por nome. Propriedades sem camada = Documento (tela, réguas e grades, guias, ações rápidas).

## Tela
- Zoom em pixels da tela (100% = 1 pixel da imagem por pixel da tela, como no Photoshop, mesmo com a escala do
  Windows); `ieDesenharNitido` desenha 1:1 sem reamostrar, amplia inteiro sem suavizar e reduz em etapas (ieMipmap).

## Teste
`python testes/teste_imagem.py` (abre o app em `--agente=9333`; `--psd <arquivo>` para um PSD real): mover, pincel,
seleção+apagar, máscara, Ctrl+T, texto, desfazer/refazer, balde, degradê, varinha, laço, forma, carimbo, filtros,
mesclar, agrupar, tamanho/girar/cortar, fatias, estilo de camada, alça da ferramenta Mover, miniaturas, fonte
carregada, salvar e conferir com o psd-tools (fatias e efeitos no arquivo), reabrir. Sai com 1 se falhar.
No console: `ieDiferencaAchatado()` mede a diferença do documento aberto contra o achatado do arquivo.
