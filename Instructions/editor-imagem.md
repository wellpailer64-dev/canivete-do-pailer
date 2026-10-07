# Editor de Imagem (estilo Photoshop)

Categoria Imagem → **Editor de Imagem**. Abre PSD/PSB com as camadas, fotos (PNG, JPG, WebP, TIFF...) ou documento novo.

## Arquivos
- `frontend/js/imagem-nucleo.js` — modelo (documento, camadas, máscaras), histórico (copy-on-write), composição
  (modos de mesclagem do Photoshop, grupos com passagem, máscara de corte (Alt+Ctrl+G, botão do painel ou **Alt+clique na divisa entre duas camadas**: cursor de corte, prende a de cima na de baixo; de novo solta — `testes/teste_corte_alt.py`), máscaras, efeitos, camadas de ajuste), vista.
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
- `frontend/js/imagem-guias.js` — guias e encaixe como no Photoshop: Exibir > Guias (Nova guia com cor, Novo layout de
  guias com predefinições 8/12/18/24 colunas + "Carrossel: N slides" + as salvas, destino, cor, colunas/linhas com
  largura vazia = automática e medianiz, margem nos 4 lados, centralizar, limpar, visualizar; Novas guias da forma;
  limpar), duplo clique na guia com o Mover = editar; arrastar da régua: Alt troca a orientação, Shift encaixa nas marcas;
  guias no histórico (Ctrl+Z). Exibir > Ajustar (Shift+Ctrl+;) e Ajustar a (guias, grade, camadas, fatias, limites):
  Letreiro, Fatia, Corte, Forma, Mover e a própria guia encaixam (Ctrl segura). Ferramenta Fatia > **Fatias das guias**.
  Carrossel à mão (o método do Photoshop): Arquivo > Novo > "Carrossel 1080 × 1440" + Páginas (largura = 1080 × páginas,
  já com as guias e uma fatia por página) → montar → Arquivo > Exportar fatias (`nome_01`, `_02`...).
  Teste com mouse de verdade: `D:\kanivete_testes\scripts	este_guias.py` (app em --agente=9333).
- `frontend/js/imagem-caneta.js` — Caneta (P) como no Photoshop: clique = canto, arrastar = curva com alças simétricas,
  clicar no 1º ponto fecha, Shift 45°, Alt = converter ponto / quebrar alça, Ctrl = seleção direta, adicionar/excluir
  automaticamente, elástico, Enter/Esc termina, Backspace apaga o último; modo Demarcador ou Forma (camada de forma
  vetorial `L.vet`, redesenhada; Mover e Ctrl+T levam os pontos). Caneta de forma livre (Magnética), Adicionar/Excluir/
  Converter ponto, Seleção de demarcador e Seleção direta (A). Painel Demarcadores (Janela): trabalho/salvos, Preencher,
  Traçar com o pincel, Carregar como seleção (Ctrl+Enter), Demarcador da seleção, Máscara. `doc.dems` no histórico/.iknv.
- `frontend/js/imagem-recuperar.js` + `Functions/recuperar.py` (OpenCV) — grupo J: Pincel de recuperação para manchas
  (sensível ao conteúdo = inpaint; proximidade = melhor pedaço ao redor), Pincel de recuperação (Alt+clique origem,
  clonagem de Poisson: textura da origem, luz do destino), Remendo (Origem/Destino, Sensível ao conteúdo, Difusão).
  Laço magnético (grupo L): gruda na borda mais forte dentro da Largura, pontos automáticos pela Frequência.
  O Carimbo (S) já existia: Alt+clique origem, Alinhado, Todas as camadas.
  Testes com mouse de verdade (app em `--agente=9333`): `testes/teste_caneta.py`, `testes/teste_guias.py`.
- `frontend/js/imagem-filtros.js` — menu Filtro igual ao do Photoshop (pt-BR): Desfoque (Média, Desfoque, mais, caixa,
  gaussiano, lente, movimento, radial, inteligente, superfície), Galeria de desfoque (campo, íris, tilt-shift, giratório),
  Distorção (comprimir, polares, ondulação, cisalhamento, esferização, redemoinho, onda, ziguezague), Ruído (adicionar,
  diminuir manchas, poeira e arranhões, mediana, reduzir), Pixelização (meio-tom, cristalizar, faceta, fragmento,
  meia-tinta, mosaico, pontilhismo), Acabamento (nuvens, por diferença, fibras, reflexo de lente, efeitos de
  iluminação), Nitidez (5), Estilização (difusão, entalhe, arestas, óleo/Kuwahara, solarização, ladrilhos, contorno,
  vento), Vídeo, Outros (personalizado 3×3, passa-alta, HSB/HSL, máximo, mínimo, deslocamento), Correção de lente,
  Converter para filtros inteligentes. Todos com prévia e como filtro inteligente; sem parâmetro aplica direto.
  Desabilitados (ainda não): Neural Filters, Grande angular, Ponto de fuga,
  Desfoque de forma/caminho, Deslocamento de pixels, Chama/Moldura/Árvore, Extrusão, Redução de tremido.
- `frontend/js/imagem-dissolver.js` — Filtro > **Dissolver** (Liquify, Shift+Ctrl+X): janela própria (`.ie-dv`) com
  Deformação para frente (W), Reconstruir (R), Suavizar (E), Torcer (C, Alt = anti-horário), Comprimir (S), Inchar (B),
  Empurrar para a esquerda (O), Congelar/Descongelar máscara (F/D), Mão (H/espaço), Zoom (Z/Ctrl+espaço); Tamanho
  ([ ]), Densidade, Pressão, Taxa, Fixar bordas; Reconstruir (quantidade) e Restaurar tudo; máscara Nenhuma/Mascarar
  tudo/Inverter; Mostrar malha/máscara, Visualizar; Ctrl+Z/Ctrl+Shift+Z dentro da janela (por pincelada). A seleção
  vira máscara congelada. Campo de deslocamento numa grade (≤ 1200 nós no lado maior), prévia na GPU (WebGL2, shader
  `IE_DV_FS`), OK aplica na CPU (`ieDvAplicar`; 4000×5333 ≈ 2 s). Objeto inteligente: entra como filtro inteligente e
  reabre com a deformação (`vals.d` = Int16 em 1/8 px, base64). Automação: `KNV.cmd('f:dissolver', {ops: [{f:
  'deformar'|'torcer'|'comprimir'|'inchar'|'esquerda'|'reconstruir'|'suavizar', pts: [[x, y], ...], tam, dens,
  pressao, taxa, alt, passos}]})` (px da camada). Teclado na janela vai por `window` (antes dos atalhos do editor).
  Teste: `testes/teste_dissolver.py` (mouse de verdade, app em --agente=9333).
- `frontend/js/imagem-galeria.js` — Filtro > **Galeria de filtros**: prévia grande (arrastar, roda/Ctrl+roda, Ajustar,
  100%), pastas com miniaturas (um pedaço do centro da camada) e camadas de efeito empilhadas (olho, nova, excluir;
  a pilha da última vez volta, como no PS). 47 filtros (`IE_GAL`): Artístico 15, Traçados de pincel 8, Distorção 3,
  Esboço 14 (cores de frente/fundo), Estilização 1, Textura 6 — aproximações próprias, não cópia do algoritmo da Adobe.
  Cada filtro `fn(P, v, e)`: P = canais Float32 + posição absoluta (ox, oy) e e = escala; a prévia calcula só a área
  visível na escala do zoom (parâmetros em pixel × e) e ruído/texturas usam a posição absoluta (não "andam"). Objeto
  inteligente → filtro inteligente; automação `KNV.cmd('f:galeria', {pilha: [{f: 'aquarela', v: {...}}]})`.
  Teste: `testes/teste_galeria.py` (todos os 47 por automação; ~0,5 s cada em 900×1200).
  Teste: `testes/teste_filtros.py` (app em --agente=9333) aplica todos numa foto e mede.
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
- Filtro > **Filtro Camera Raw** (Shift+Ctrl+A), `frontend/js/imagem-cameraraw.js`: janela própria como o ACR — foto à
  esquerda (zoom, mão, Antes/depois lado a lado = Y, Original = P), à direita histograma e as seções Básico (WB, tom,
  Textura, Claridade, Remover névoa, Vibratilidade, Saturação), Curva (RGB/R/G/B), Detalhes (Nitidez com raio/detalhe/
  mascaramento, Redução de ruído de luminância e de cor), Mistura de cores (HSL nas 8 cores → curvas de matiz do Luz e
  Cor), Gradação de cores (rodas Sombras/Meios-tons/Realces/Global = lift/gamma/gain/offset) e Efeitos (Granulação,
  Vinheta com ponto médio/arredondamento/difusão). Cor = LUT do `veLcBuildLut` (editor-lc.js); o resto local na luma.
  Barras finas com resistência (arrastar = metade do mouse, Shift 1/6, clique solto pula, duplo clique zera; pedido do
  usuário 2026-10-03). Valores antigos (temp…sharp, vig, curva) continuam valendo. Teste: `testes/teste_cameraraw.py`.
  **Camada de ajuste Camera Raw** (botão ◐ do painel Camadas, painel Ajustes, `KNV.ajuste('cameraRaw', {...})`): muda ao vivo
  tudo embaixo (como a camada de ajuste do editor de vídeo); Propriedades = barras rápidas + Abrir no Camera Raw (janela
  com `ieAchatarAbaixo`). Contas que olham vizinhos: `ieCompor` compõe a região com margem (`ieCrMargemDoc`) e copia o
  miolo (sem emenda); cache por camada (WeakMap) das partes pesadas — mexer numa barra refaz só cor e somas (~80 ms em
  900×1200 contra ~830 ms da conta inteira). Não vai para o PSD (fica no .iknv; o achatado leva o efeito).- Painel Propriedades: Transformar (X/Y/L/A com proporção, inverter, girar) e Caractere (seletor de fonte com prévia,
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
- Camada nova vai como camada de pixels, MENOS texto, forma, objeto inteligente e preenchimento criados no editor. Texto vira camada de texto do Photoshop (editável lá)
  — `_texto_novo` em editor_imagem.py clona um molde gerado pelo próprio Photoshop (`Functions/psd_texto_modelo.py`,
  ponto e parágrafo) e troca texto, fonte/estilo (inclusive trechos com outra cor/fonte = runs), matriz e caixa; os
  pixels são os do editor até alguém editar no Photoshop. Forma (`L.vet`, ferramenta Forma e Caneta em modo Forma):
  `_forma_nova` grava como o Photoshop — cor sólida (SoCo, igual byte a byte) + máscara vetorial (vmsk: pontos em
  (y/A, x/L), alças i/o, operação excluir 0 / somar 1 / subtrair 2 / interseção 3, aberto/fechado) + a marca
  `pixel_data_irrelevant` (sem ela o psd-tools lê preenchimento, não forma). Conferido no Photoshop redesenhando cada
  forma a partir do vetor (retângulo arredondado, elipse, triângulo, hexágono, linha, furo, interseção, exclusão).
  Documento que não veio de PSD RGB é montado do zero.
- Objeto inteligente (`L.c0` + `L.tf`): `_so_novo` clona o molde do Photoshop (`Functions/psd_so_modelo.py`: PlLd +
  SoLd na camada, item no lnk2 global) e troca uuid, os 4 cantos (`L.tf` aplicado aos cantos de `L.c0`), o tamanho e o
  PNG original incorporado (vai como a página mandou, sem recodificar). Filtros inteligentes do editor NÃO vão (aviso):
  o objeto vai com o original e a camada já mostra os filtros. Objeto com camadas (`L.conteudo`) vai achatado.
- Camada › Nova camada de preenchimento › Cor sólida (`IE_CMDS.preenchimentoCor`, `KNV.preenchimento(cor, {nome})`):
  `L.pre = {tipo: 'cor', cor}`, cobre o documento (`iePreRender`; refeita no Tamanho da tela), com seleção ativa nasce com
  a máscara dela; duplo clique na miniatura troca a cor. Preenchimento de cor sólida vindo de PSD também abre com `L.pre`
  (cor editável; na ida e volta o SoCo é trocado). PSD: `_preenchimento` = SoCo + `pixel_data_irrelevant`, como o
  Photoshop (molde `tools/ps_modelo_pre.py`). Cor lida com `_cor_soco` (o `layer.data` do psd-tools já é o RGBC).
  Degradê e padrão ainda não se criam no editor.
- Arquivo › Colocar, arrastar arquivo para o documento, `KNV.colocar` e imagem gerada por IA criam OBJETO INTELIGENTE
  (`ieColocarCanvas(..., inteligente=true)`): o original inteiro em `L.c0` e a redução para caber na matriz. Colar
  (Ctrl+V) continua camada de pixels, como no Photoshop.
- Arquivos incorporados SEMPRE na versão 7 (`_incorporados_v7`, em todo salvamento): o Photoshop 2026 grava a 8, com um
  descritor no fim (contentID) que o psd-tools lê e não escreve → item curto e o Photoshop recusa o PSD inteiro
  ("as opções de abertura estão incorretas"). Valia também para a ida e volta de PSD com objeto inteligente (2026-10-07).
- PSD novo de documento TRANSPARENTE (`_gravar_achatado`): 4 canais no cabeçalho e contagem de camadas negativa, como o
  Photoshop. Com 3 canais ele toma o documento por opaco e, ao redesenhar uma forma que é a camada mais de baixo,
  enche o retângulo de todas as camadas (2026-10-07).
- Regras do EngineData que DERRUBAM o Photoshop ao abrir (2026-10-06): fonte nova tem de entrar nas DUAS listas
  (`ResourceDict` e `DocumentResources` → FontSet, o índice vale para as duas) e o `Txt ` termina em nulo.
- Caixa de parágrafo: a 1ª linha de base fica em topo + sTypoAscender (OS/2, `asc` em Functions/fontes.py) × tamanho,
  como no Photoshop (o ascendente do navegador descia ~10 px a 48 px).
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
- Motor: stable-diffusion.cpp `sd-server.exe` build **Vulkan** (30 MB; na RTX 3050 empatou com o CUDA de 1,1 GB), dois
  modelos (`MOTORES` em gerador_imagem.py; o servidor carrega um por vez e troca sozinho):
  - **zimage (padrão, texto → imagem)**: Tongyi-MAI/Z-Image-Turbo 6B em GGUF **Q4_K** (leejet/Z-Image-Turbo-GGUF, 3,9 GB) +
    Qwen3-4B-Instruct-2507 Q4_K_M (unsloth, lê o prompt) + VAE do FLUX.1 (Comfy-Org/z_image_turbo). 8 passos, cfg 1
    (Turbo, sem CFG), euler. ~6,7 GB baixados. Por que não Diffusers/BF16: o checkpoint oficial tem 30+ GB e pediria
    torch+CUDA no app; o sd.cpp já é a stack e suporta o Z-Image oficialmente com `--offload-to-cpu` (pesos na RAM,
    cada parte sobe à placa só na sua etapa).
  - **klein (só edição com referência — o Turbo não edita a partir de imagem)**: FLUX.2 klein 4B Q8_0 + Qwen3-4B Q4_K_M
    + VAE flux2, 4 passos. Baixado só quando a edição guiada é usada (`ie_gerador_estado/baixar(modelo)`).
  `--offload-to-cpu --fa --vae-tiling` (o VAE inteiro em 1024² pede ~10 GB e falhava).
- Medição na RTX 3050 8 GB (2026-10-05, mesmos 4 prompts e semente — retrato, corpo inteiro com mãos, três pessoas,
  produto vidro/metal/plástico; `D:/kanivete_testes/gerador/bench.py`): klein pico 6,7 GB (placa inteira, 1,36 GB são do
  Windows), 18–20 s/imagem (38 s a 1ª, com carga); **Z-Image pico 5,9 GB, 41–44 s/imagem (61 s a 1ª)**, 4/4 nos dois.
  Z-Image: pele com poros e textura real, mãos certas, rostos de grupo mais naturais; o klein segue mais ao pé da letra
  formas de produto ("facetado"). Interface responde em ≤5 ms durante a geração (servidor à parte).
- Placa: um modelo pesado por vez — o servidor sai 90 s depois da última geração; trocar de modelo fecha o anterior;
  `ampliar_imagem` chama `gerador_imagem.parar()` e o Worker (`worker.py`/`codigo.py`) fecha o `sd-server.exe` antes do
  Ollama; o gerador descarrega o Ollama antes de gerar.
- Servidor sobe na 1ª geração, API nativa assíncrona `/sdcpp/v1/img_gen` + consulta do job; preso a um Job do Windows
  (fecha junto com o app, mesmo se ele cair). Cache em `%LOCALAPPDATA%/CaniveteDoPailer/cache_gerador` (hash de
  modelo+prompt+tamanho+semente+refs; `sem_cache` força gerar).
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
- Camada de ajuste nova continua só no .iknv (não vai para o PSD). Preenchimento novo só de cor sólida (degradê/padrão não).
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
  do PSD; texto novo vai como texto editável (ver Salvar).
- Camadas: filtro por tipo e por nome. Propriedades sem camada = Documento (tela, réguas e grades, guias, ações rápidas).

## Tela
- Zoom em pixels da tela (100% = 1 pixel da imagem por pixel da tela, como no Photoshop, mesmo com a escala do
  Windows); `ieDesenharNitido` desenha 1:1 sem reamostrar, amplia inteiro sem suavizar e reduz em etapas (ieMipmap).

## Teste
`py -3.13 testes/teste_psd_pre.py [--photoshop]`: preenchimento novo (cheio e com máscara) → camada de preenchimento;
com `--photoshop` lê tipo/cor lá, compara a imagem e troca a cor de um preenchimento feito no Photoshop (ida e volta).
`py -3.13 testes/teste_psd_so.py [--photoshop]`: objeto inteligente novo (parado, 50%, girado) → objeto inteligente
incorporado; com `--photoshop` abre o conteúdo, reduz a 50% e volta (sem perda = vem do original) e regrava um PSD com
objeto feito no Photoshop. Molde: `tools/ps_modelo_so.py`.
`py -3.13 testes/teste_psd_forma.py [--photoshop] [--sem-fundo]`: forma nova → camada de forma (6 casos de
geometria/operação); com `--photoshop` redesenha no Photoshop e compara com o desenho esperado. Molde: `tools/ps_modelo_forma.py`.
`py -3.13 testes/teste_psd_texto.py [--photoshop]`: texto novo → camada de texto no PSD (ponto, parágrafo, trechos,
girado), conferido no psd-tools e, com `--photoshop`, aberto, lido e editado no Photoshop (COM; avisar o usuário antes:
se o PSD estiver errado o Photoshop fecha com erro). Molde regerável com `tools/ps_modelo_texto.py`.
`python testes/teste_imagem.py` (abre o app em `--agente=9333`; `--psd <arquivo>` para um PSD real): mover, pincel,
seleção+apagar, máscara, Ctrl+T, texto, desfazer/refazer, balde, degradê, varinha, laço, forma, carimbo, filtros,
mesclar, agrupar, tamanho/girar/cortar, fatias, estilo de camada, alça da ferramenta Mover, miniaturas, fonte
carregada, salvar e conferir com o psd-tools (fatias e efeitos no arquivo), reabrir. Sai com 1 se falhar.
No console: `ieDiferencaAchatado()` mede a diferença do documento aberto contra o achatado do arquivo.

## Próximos passos (combinado com o usuário em 2026-10-03)
1. ~~Dissolver (Liquify)~~ — feito 2026-10-03 (imagem-dissolver.js). Falta: Dissolver sensível a rosto
   (olhos/nariz/boca por detecção de rosto), Carregar/Salvar malha, Mostrar fundo (outras camadas atrás).
2. ~~Galeria de filtros~~ — feita 2026-10-03 (imagem-galeria.js). Falta: arrastar para reordenar as camadas de efeito.
3. ~~Camera Raw~~ — janela própria feita 2026-10-03 (vale como filtro inteligente). Falta: Máscaras (pincel/linear/radial/assunto), Óptica, Geometria, predefinições.
4. Desabilitados no menu Filtro: Desfoque de forma/caminho, Deslocamento de pixels, Chama/Moldura/Árvore, Extrusão,
   Redução de tremido, Grande angular adaptável, Ponto de fuga, Neural Filters.
5. KNV.cena Fase 3 (Instructions/agente/plano-cena.md): biblioteca de estilos/receitas, KNV.ver, forma vetorial nas caixas.
6. Ferramentas: Curvatura (grupo da Caneta), Movimento sensível ao conteúdo (grupo J), máscara vetorial pelo demarcador.
Testes com mouse (app em --agente=9333; avisar o usuário para não mexer no mouse durante): testes/teste_{caneta,guias,
laco,barra,filtros,dissolver}.py; geral: testes/teste_imagem.py.

## Ponte Photo Kanivete → Editor Kanivete (frontend/js/ponte-kanivete.js; 2026-10-03, Fase 1)
Botão **Animar** (barra de cima) e Arquivo > Animar no Editor Kanivete / Animar a tira inteira; `KNV.levarParaEditor({modo})`.
O documento (salvo em .iknv) vira Comps no editor de vídeo pela mesma montagem do PSD (`vePsdMontar`, editor-psd.js):
pixel/objeto inteligente/forma → PNG com efeitos, máscara e filtros (posição, opacidade, mesclagem); texto → texto
editável (fonte por família+estilo — o nome PostScript às vezes vem errado — via `vePsdTexto`; efeito diferente de
sombra ou escala H/V → imagem); grupo → Comp; ajuste → camada de ajuste (Camera Raw → Luz e Cor; Textura/Névoa/Grão/
Ruído ficam de fora com aviso; Brilho/Contraste → bc; Exposição/Vibratilidade/Matiz/Curvas → Luz e Cor); camadas
presas por corte: pixel vai recortado pela forma da base, ajuste preso vai junto com a base numa imagem.
Carrossel: uma Comp por fatia (6 s cada, em sequência na timeline); "tira inteira" = uma Comp do documento.
PNGs em `<pasta do .iknv>/<nome>.camadas/<id da camada>.png`. Cada faixa e Comp guarda `knv: {camada}` / `{doc, parte}`.
Próximas fases (combinadas): 2) atualização ao vivo Photo → Editor; 3) volta Editor → Photo (posição, tamanho, texto,
opacidade, visibilidade); 4) "Levar e animar" (entradas por camada, estilos suave/enérgico, 6 s por slide).
Atalhos: Ctrl+Shift+, exporta a(s) camada(s) selecionada(s) em PNG; Ctrl+Shift+. exporta tudo (fatias/pranchetas/tela);
sem janela: `KNV.exportarRapido(tudo, pasta)`.
