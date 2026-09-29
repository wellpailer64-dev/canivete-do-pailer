# Pocket Editor — Editor de Vídeo

Editor de cortes estilo Premiere, versão de bolso. Menu: **Editor de Vídeo**.

## Arquivos
- `frontend/js/editor.js` — interface: timeline em canvas, ferramentas, atalhos, reprodução, exportação
- `frontend/css/editor.css` — visual (prefixo `.ve-`)
- `frontend/js/editor-dock.js` — painéis encaixáveis (docking estilo Premiere)
- `frontend/js/editor-fx.js` — efeitos (painel Efeitos + Controles de efeito)
- `frontend/js/editor-lc.js` — painel Luz e Cor (correção de cor estilo Lumetri)
- `Functions/video_cutter.py` — análise, prévia (proxy), miniaturas, forma de onda, exportação
- `Functions/media_server.py` — servidor HTTP local (127.0.0.1) que entrega vídeo/miniaturas/prévias à interface
- `main.py` — API: `video_cutter_prepare`, `video_cutter_export`, `video_cutter_cancel_export`, `reveal_file`, `open_file`; arrastar-e-soltar via `window.dom` do pywebview

## Por que um servidor de mídia local
A interface roda de dentro do executável. Caminhos `file:///` quebram com espaços/acentos e, no .exe, as
miniaturas eram salvas numa pasta que a interface não enxergava. Cada arquivo é registrado com token
aleatório e servido com suporte a Range (seek). Só escuta em 127.0.0.1. O Cortar Áudio usa o mesmo servidor.

## Prévia
- Toca o original se o WebView suportar (MP4/MOV/WEBM com H.264 8-bit, VP8/9, AV1 e áudio AAC/MP3/Opus).
- Senão (HEVC do iPhone/Samsung, MKV, AVI, H.264 10-bit, PCM...) gera um **proxy** H.264 com o lado CURTO até 1080 px
  (4K em pé → 1080x1920) e keyframe a cada ~0,5s (scrub preciso). As miniaturas saem na MESMA passada do ffmpeg
  (decodificar o 4K várias vezes em paralelo era o que mais atrasava). Com placa NVIDIA tudo roda na GPU
  (cuda + scale_cuda + nvenc: 4K60 HEVC de 20 s em ~3,6 s); senão, pelo processador. Selo "PRÉVIA LEVE".
  A exportação sempre usa o original.
- Cortes secos na prévia (dois players que se revezam, `VEDK`): `veVideo()` é o deck ativo (A = `#ve-video` ou B,
  criado só quando há corte). Perto do fim do trecho a reserva busca `VE_PREROLL` (0,6 s) antes do ponto de entrada
  e começa a tocar sem som no momento certo (+`VE_ARRANQUE`, o tempo que um player parado leva para andar). No corte
  ela assume imagem e som e a outra pausa: sem busca, sem preto, sem congelar. Regras aprendidas medindo quadro a quadro:
  - a reserva precisa estar NA PÁGINA e ser desenhada (canvas 2x2, `veReservaToque`) enquanto pré-rola: vídeo
    invisível que ninguém desenha não atualiza a imagem, e a troca mostraria um quadro velho;
  - não mudar `playbackRate` a cada quadro (o player engasga);
  - só trocar com a reserva ≥ meio quadro à frente do ponto de entrada; se estiver chegando, espera no último quadro
    (a agulha nunca volta para antes do trecho — isso disparava buscas em cadeia).
  Sem quadro nenhum (busca comum), o monitor mantém o último quadro (até 600 ms) em vez de desenhar preto.
  A exportação não usa players: é exata quadro a quadro (validado: 540/540 quadros corretos num 4K com 2 cortes).

### Desempenho da prévia
- O monitor tem a resolução em que aparece na tela (zoom × densidade da tela), até 1920 px (`veMonitorScale`,
  degraus de 1/8). Os efeitos rodam na resolução em que a mídia aparece (`veFxRender(..., alvo)`).
- Na reprodução o monitor só redesenha quando a agulha entra em outro quadro da sequência (`veMonitorDue`):
  em tela de 144 Hz não repinta 144 vezes um vídeo de 30 fps. `requestVideoFrameCallback` foi testado e
  fazia o WebView2 descartar quadros — não usar.
- Sliders e arraste no monitor pedem `veDrawMonitorSoon()` (um desenho por quadro da tela, não por evento).

## Modelo de edição
`VE.clips = [{s, e, off}]` cobre o vídeo inteiro de forma contígua. Dividir = partir um clipe em dois.
Remover = `off: true` (clipes removidos vizinhos são fundidos). A reprodução pula os trechos `off`,
então o que se vê é o resultado final. Histórico de desfazer/refazer com 150 passos.

## Exportação (precisão de frame)
Cada trecho mantido vira uma entrada `-ss início -t duração -i arquivo` e tudo passa por `concat`.
Só decodifica o que fica no vídeo (rápido) e não acumula frames na memória. Acima de 150 trechos usa
um único `select/aselect`. GPU (NVENC → QSV → AMF) detectada uma vez; se falhar, refaz pela CPU.
Progresso real via `-progress pipe:1`; cancelamento apaga o arquivo parcial.

Validado: corte em 0:20→0:35 resulta em frame #599 seguido de #1050 do original (30 fps).

## Atalhos
Espaço play · J/K/L · ←/→ frame (Shift = 1s) · ↑/↓ corte anterior/próximo · S ou Ctrl+K dividir ·
Delete remover · I/O entrada/saída · X remover In→Out · Q/W remover antes/depois · V/C/H ferramentas ·
+/- zoom · \ ajustar · N ímã · M mudo · Ctrl+Z/Ctrl+Shift+Z · Ctrl+E exportar · Ctrl+O abrir

## Painéis (docking como no Premiere)
Layout em árvore (`VED.root`: divisões `{t:'s', d, c, z}` e grupos de abas `{t:'g', p, a}`), salvo em
`%APPDATA%\CaniveteDoPailer\editor_workspaces.json` (`ve_layout_load/save`, main.py). O localStorage NÃO serve:
o WebView roda em modo privado e numa porta nova a cada abertura (só segura um recarregar da página). Arrastar a aba: centro do painel = vira aba; borda = divide ao lado/acima/abaixo;
faixa de 12 px na borda da área = ocupa a lateral inteira. Duplo clique na aba maximiza. **Janela ▾** mostra/oculta
painéis e restaura o padrão. Os `.ve-panel[data-panel]` só são movidos no DOM (não recriados).
Painel novo: crie um `.ve-panel` com `data-panel`/`data-title` no HTML; quem tinha layout salvo recebe como aba.

### Janelas soltas (outro monitor)
Cada janela solta é um quadro completo (abas + divisões), como as flutuantes do Premiere: `VED.hosts[0]` é a
área do editor e os demais são as janelas, cada um com seu `root`. A aba pode ser arrastada de qualquer janela
para qualquer janela: o alvo é achado por coordenada de TELA (`vedHitScreen`/`vedOrigin`), porque o arraste
não atravessa documentos. Janela que fica vazia fecha. As soltas ficam sempre acima da principal
(`ve_win_prepare`: a principal vira "dona" no Windows).
⧉ na aba, Ctrl ao soltar ou soltar fora de todas as janelas.
- A janela é nossa (`_janela_solta_propria`, main.py): um Form do WinForms com WebView2 no mesmo ambiente,
  entregue ao window.open via `NewWindow` — sem a barra "about:blank" e o "[InPrivate]" do pop-up padrão
  (que fica só de reserva se a nossa falhar). Fechar o Form pode não disparar `pagehide`: o JS também
  percebe por `w.closed`.
- Arrastar a janela pela barra de título do Windows (a página não recebe eventos): `vedWatchMoves` percebe a
  janela andando, o Python informa cursor/botão e a janela sob ele (`ve_win_hit`, só janelas deste processo),
  e aparece uma bússola (centro + 4 lados, e as bordas da área). Soltar num quadradinho encaixa a janela
  inteira; fora deles só move. Durante o arraste a janela fica semitransparente (`ve_win_alpha`). `window.open('')` abre uma janela nativa do WebView2
(liberada em `_liberar_janelas_flutuantes`, main.py — o pywebview mandaria para o navegador) e o MESMO
elemento do painel é movido para ela, com os estilos e o sprite de ícones copiados. Por isso:
- `$ve(id)` procura também nas janelas soltas (`vedFind`); não use `document.querySelector` para
  coisas de dentro de um painel — use `$ve('...').querySelector`, `el.ownerDocument`, `ownerDocument.defaultView`.
- O relógio da reprodução usa sempre `performance.now()` da janela principal (o rAF de outra janela tem outra origem).
- Fechar a janela devolve o painel ao lugar de onde saiu (`VED.home`). Fechar o app ou sair do Editor de Vídeo
  fecha as janelas sem tirar do layout; elas reabrem ao entrar no editor de novo.
- Posição: o Chromium prende o window.open no monitor do app. Por isso quem posiciona e lê a janela é o Python
  (`ve_win_place` / `ve_win_rect`, Win32 em pixels reais, qualquer monitor). A janela é achada pelo título,
  que termina com espaços invisíveis (`vedWinTitle`) para ser único; o WebView2 acrescenta " — [InPrivate]".

### Workspaces (Janela ▾)
"Salvar estilo de workspace…" pede um nome e guarda painéis + janelas soltas (monitor, posição, tamanho,
maximizada). Com um workspace ativo (●), o editor sempre abre como ele foi salvo; mexer no layout marca
"(modificado)" e o menu oferece salvar as alterações ou voltar ao salvo. Salvar com um nome existente atualiza.

### Movimento na exportação
- Escala animada usa tamanhos pares (`2*trunc(.../2)`): com tamanho ímpar o centro "tremia" 0,5 px por quadro.
- Opacidade animada: um valor por quadro via `sendcmd` → `colorchannelmixer@opN` (`_opacidade_animada`).
  O `geq` antigo fazia a conta por pixel e deixava a exportação ~2–3× mais lenta. Mesmo resultado (validado).

## Efeitos
`c.fx = [{id, t, on, v}]`, aplicados de cima para baixo no tamanho original da mídia, antes de
escala/posição/rotação/opacidade. Clipe com efeito ativo vira camada na exportação (`veIsPlain`).
- Desfoque gaussiano: 100% = sigma de 5% do lado menor; bordas repetidas (canvas `blur()` / ffmpeg `gblur`)
- Brilho e contraste: igual a `brightness()`+`contrast()` do navegador (ffmpeg `lutrgb`)
- Cortar: área cortada fica transparente (ffmpeg `drawbox ... replace=1`)
Efeito novo: `VE_FX` em editor-fx.js (parâmetros + `draw`) e `_filtros_fx` em video_cutter.py (mesma conta).
Parâmetros de efeito ainda não têm quadros-chave.

## Áudio: todas as trilhas somadas, mixadas em tempo real (como Premiere/DaVinci Resolve)
A1..A4 tocam juntas. Mesmo modelo dos dois: áudio **conformado** em disco + **mixer em tempo real** por blocos.
- Conformar (como os .cfa do Premiere): ao abrir, o som da fonte vira PCM s16le 48 kHz estéreo sem cabeçalho
  (`_conformar_audio`; registrado ANTES do `info`, senão a interface pegava o da abertura anterior).
  `video_cutter_audio_fonte` devolve a URL (media_server, com Range).
- Mixer (editor-audio.js, como o Fairlight): um AudioWorklet toca uma fila de pedaços de 1024 quadros; o editor
  mixa ~0,3 s à frente (`VE_AU_ADIANTE`) lendo blocos de 1 s do PCM por HTTP Range (cache LRU, previsão de 3 s).
  Soma com ganho (dB→linear) e interpolação linear (velocidades J/K/L). A placa de som é o RELÓGIO
  (`veAudioPos` desconta `outputLatency`); os players de vídeo tocam mudos e seguem (`veSeguirAudio`).
- Editar tocando: `veAudioEditou` corta a fila (mantém 50 ms) e remixa dali — vale em ~85 ms, sem parar o som.
- Exportação: a mesma conta no ffmpeg (`_grafo_mix`: asplit, atrim, volume dB, adelay em amostras, amix normalize=0).
- Medido: soma exata (2 trilhas = 2,0x; −6 dB = 1,5x); fila nunca vazia; play→som 13–40 ms (inclusive no minuto 8
  de 10); imagem dentro de ±1 quadro do som. Vídeo sem som usa o esquema antigo (som do player de vídeo).

## Áudios soltos na timeline (MP3, WAV, M4A...)
Arrastar um arquivo de áudio para o editor aberto cria uma mídia `kind: 'audio'` (`veAddAudio` →
`video_cutter_add_audio`: conforma em PCM, forma de onda, duração). O clipe entra na agulha, na trilha logo
abaixo da última trilha de áudio usada (A1..A4), sem sobrescrever nada; a trilha compacta abre sozinha.
- Ocupação por linha (`veOcupaV/veOcupaA/veConflita`): vídeo = V+A, imagem/ajuste = só V, áudio = só A.
  Sobrescrever (`veCarve`), mover, aparar e cliques só esbarram em clipes da mesma linha.
- Mixer: cada mídia é uma fonte (`VEAU.fontes`, id 0 = vídeo aberto). Exportação: `audio_clipes` traz o arquivo
  de cada clipe; `_grafo_mix` abre uma entrada por arquivo. Vídeo sem som + áudio solto também exporta com som.
- Projeto salva o caminho e reabre (conformando de novo). Efeitos de vídeo/Luz e Cor não se aplicam a áudio.

## Trilhas: olho, cadeado e mudo (cabeçalho V1/A1...) · cor do rótulo
Estado em `VE_TRK` (`v[k]`/`a[k]`: `hide`, `lock`, `mute`), salvo no projeto (`trilhas`), fora do desfazer.
- Olho (V): a trilha some da prévia (`veDrawMonitor`, `veTopAt`) e da exportação (`veExportPlan`).
- Cadeado: clipe da trilha (`veLocked`) não é selecionado, movido, aparado, cortado, apagado, nem recebe efeito
  ou ganho; nada é solto/inserido por cima dele; exclusões em cascata (Q/W/X, D) não o deslocam.
- M (A): silencia a trilha (o clipe sai do mix de áudio).
- Botão direito no clipe (`veClipMenu`): cor do rótulo (`c.cor`, paleta `VE_CORES`, entra no desfazer),
  ganho, efeitos, apagar.

## Camada de ajuste (como no Premiere)
Botão **Ajuste** (ao lado de Imagem): cria um clipe de 5 s na primeira trilha livre acima do vídeo. É uma mídia
`kind: 'ajuste'` (sem arquivo): `veIsImage` vale para ela (sem som, duração livre) e `veIsAdj` a distingue.
- Os efeitos dela (`c.fx`, inclusive Luz e Cor) valem para tudo o que já foi composto nas trilhas de baixo, só no
  trecho dela. Opacidade (com quadros-chave) dosa a força: resultado = original × (1−op) + com efeito × op.
  Escala/posição/rotação não se aplicam (o painel mostra só Opacidade).
- Prévia: `veAdjDraw` aplica `veFxRender` no próprio canvas do monitor e desenha por cima com a opacidade.
- Exportação (`tipo: 'ajuste'`): `split` do vídeo composto → ramo com `trim` no trecho + efeitos + opacidade →
  `overlay` de volta. Opacidade animada: `_opacidade_animada(..., inicio=st)` (o ramo mantém o tempo absoluto).
- Projeto .vcnvt salva a mídia `ajuste` (sem path) e recria ao abrir.

## Luz e Cor (estilo Lumetri)
Painel `lc` que edita o efeito `lc` do clipe selecionado (criado no primeiro ajuste; um por clipe). Seções:
Correção básica (temperatura, matiz, exposição, contraste, realces, sombras, brancos, pretos, saturação),
Criativo (filme desbotado, nitidez, vibração), Curvas (RGB/R/G/B, monótonas, até 16 pontos) e Vinheta.
- Toda a cor vira uma LUT 3D 33³ calculada em JS (`veLcBuildLut`). A prévia aplica por WebGL2 (textura 3D,
  trilinear); a exportação recebe a mesma LUT em base64 (Uint16) e grava um `.cube` para o `lut3d` (trilinear).
  Mudar a conta da cor = mexer só em `veLcBuildLut`.
- Nitidez = `unsharp` 5×5 na luma (núcleo binomial, igual no shader); vinheta = `vignette` do ffmpeg
  (cos⁴, raio até o canto), com o alfa preservado por split/alphamerge.
- Validado: prévia × exportação diferem ~4/255 em média (menos que a diferença YUV→RGB que já existia sem efeito).

## Painel Texto: Transcrever e Criar legendas (como no Premiere)
- Código: `Functions/legendas.py` (motor), `frontend/js/editor-texto.js` (painel, legendas, prévia), `_gerar_ass` em `video_cutter.py` (gravação).
- **Motor**: onnx-asr + NVIDIA Parakeet TDT 0.6B em ONNX (usa o onnxruntime que o app já tem, sem PyTorch), com Silero VAD
  (silêncio mín. 0,6 s, folga 0,15 s, trecho máx. 20 s). Medido só no processador:

  | Motor | Velocidade | Erro PT | Erro EN |
  |---|---|---|---|
  | TAGARELA (Parakeet ajustado PT-BR, int8) | ~10x tempo real | 0,9–1,9% | falha |
  | Parakeet v3 multilíngue int8 | ~10x | 3,8% | 0% |
  | Whisper large-v3-turbo int8 | 1–2x | 0–12% | 0% |

  PT-BR usa o TAGARELA; inglês e outras 24 línguas europeias usam o v3.
- **Modelos** em `modelos_ia/asr/` ao lado do exe (fora do git). Baixados do Hugging Face no primeiro uso. O TAGARELA vem
  em fp32 (2,4 GB) e é comprimido aqui para int8 (640 MB, `quantize_dynamic`), uma vez só.
  No build, `onnxruntime/transformers` e `onnxruntime/tools` vão como `--add-data`, porque a quantização importa arquivos soltos.
- **Entrada**: a mesma mixagem da exportação (`_grafo_mix`), com áudios soltos e trilhas mudas → WAV 16 kHz mono.
  **Saída**: palavras `[início, fim, texto]` no tempo da timeline. Clicar numa palavra leva a agulha até ela, duplo clique corrige a palavra, há busca e a palavra falada fica destacada.
- **Legendas** (padrões do Premiere): 42 caracteres por linha, 2 linhas, duração mínima de 3 s, intervalo de 0 quadros.
  A quebra respeita o fim da frase; se não couber, quebra na vírgula e as duas linhas ficam equilibradas.
  As legendas ficam na trilha LEG: clicar seleciona, arrastar move e arrastar a borda apara. Delete apaga, Ctrl+Z desfaz.
  Também dá para exportar um `.srt` (UTF-8).
- **Gravar no vídeo**: arquivo .ass + filtro `subtitles` depois das camadas e antes da redução de resolução. As mesmas contas da prévia
  (Arial, Fontsize = em × 1,117, caixa = BorderStyle 3, margem 6% da altura).
- O projeto salva a transcrição, as legendas e o estilo.
- A fonte das legendas (Propriedades) vale para a prévia e para o .ass. A prévia mede a fonte (ascendente + descendente)
  e manda `razao` para o Fontsize ficar igual no libass.

## Painel Propriedades (como no Premiere 25) · ferramentas Texto (T) e Velocidade (R)
- Código: `frontend/js/editor-props.js`. Os **Controles de efeito** continuam com os quadros-chave e todos os efeitos;
  **Propriedades** mostra só o essencial do que está selecionado e muda sozinho com a seleção:
  - texto: conteúdo, fonte, N/I, alinhamento, tamanho, espaçamento, entrelinha, preenchimento, contorno, fundo, sombra;
  - vídeo e imagem: alinhar/ajustar/preencher o quadro, posição, escala, rotação, opacidade;
  - velocidade/duração e volume;
  - legenda: o texto dela e o estilo de todas.
  As fontes vêm do Windows (`ve_fontes`, via GDI).
- **Velocidade** (`c.v`, 10–1000%):
  - [s, e] continua sendo o trecho da fonte, e na timeline o clipe dura (e − s)/v. Use `veSrcAt`/`veTlAt`.
  - Os quadros-chave ficam em tempo da fonte.
  - Prévia: o player toca com `playbackRate = L × v`. O mixer mantém o tom com grãos de 40 ms (Hann, sem estado);
    com `c.tom === false`, o tom muda junto.
  - Exportação: o clipe vira camada com `setpts=(PTS-STARTPTS)/v`, e o som usa `atempo` (ou `asetrate` sem manter o tom).
  - R arrasta a borda (Rate Stretch). O painel tem "Empurrar os clipes seguintes" (ripple).
- **Texto** (media kind `texto`, estilo em `c.tx`): é um clipe de imagem desenhado em canvas.
  - T + clique no monitor cria o texto na trilha livre acima (V2+), começando no ponto do clique.
  - A digitação acontece numa textarea transparente por cima do desenho; duplo clique edita.
  - Na exportação, cada texto vira PNG (`ve_salvar_png`) na maior escala dele, então sai idêntico à prévia com qualquer fonte.

## Apagar, duplicar, copiar e colar (como no Premiere)
- **D / Delete:** apaga e deixa o espaço (Lift). **Shift+D / Shift+Delete:** apaga e fecha o espaço (Ripple Delete).
  O espaço só fecha se nenhuma outra trilha tiver clipe ali.
- **Ctrl+C / Ctrl+X / Ctrl+V:** cola na agulha, na mesma trilha de onde o clipe saiu, sobrescrevendo o que estiver lá.
  A agulha vai para o fim do colado. A cópia só vale para o mesmo vídeo aberto.
- **Alt+arrastar:**
  - Na timeline, solta uma cópia e o original fica. O fantasma mostra "+".
  - No monitor, com a camada selecionada, a cópia nasce na primeira trilha livre acima, no mesmo tempo, e é ela que se move.
- **Alt+↑ / Alt+↓:** muda o clipe de trilha sem mudar o tempo (sobrescreve).
- Código: `vePlaceClip`, `veDuplicarEm`, `veDuplicarAcima`, `veCopiar`/`veColar` e `veTrocarTrilha` em `editor.js`.

## Monitor: selecionar e transformar (como Premiere/Photoshop) · ponto de ancoragem
- Código: `frontend/js/editor-transform.js`.
- Com a ferramenta Seleção, o clique seleciona o objeto de cima sob o cursor, e clicar no vazio desmarca.
  Play/pausa fica só no Espaço, como no Premiere.
- O selecionado mostra uma caixa com 8 alças:
  - arrastar uma alça escala de modo uniforme a partir da âncora;
  - arrastar por fora de um canto gira (Shift: de 15° em 15°);
  - Alt+arrastar duplica.
- **Ponto de ancoragem** (`c.p.ax`/`c.p.ay`, em px da mídia; sem valor = centro): é o ponto que fica na Posição.
  Escala e rotação acontecem em volta dele: quadro = Posição + R·S·(m − âncora).
  - Arrastar a mira ⊕ e a grade 3×3 de Propriedades mudam a âncora sem mover o objeto.
  - Os campos X/Y mudam a âncora sem compensar a Posição, então o objeto anda (como no Premiere).
  - Na exportação vai `ox/oy` (âncora → centro), e o Python soma na posição do overlay (com expressão, se escala/rotação forem animadas).

## Fontes: família + estilo
- `Functions/fontes.py` lê as tabelas name/OS2 dos arquivos de fonte (sem dependência).
  - A família tipográfica (nome 16) agrupa os estilos (nome 17: Light, Semibold, Narrow Bold...).
  - Cada estilo guarda o nome "de sistema" (nome 1) + negrito/itálico.
- O desenho (canvas) e o libass usam esse nome de sistema, por isso acham exatamente o mesmo estilo:
  prévia = vídeo gravado, testado com Segoe UI Semibold Italic e Arial Narrow Bold.

## Comandos, atalhos e barra de menus
- Código: `frontend/js/editor-comandos.js`. `VE_CMDS` lista cada ação (id, menu, nome, teclas padrão, `fn`,
  `pode()` = habilitado, `marcado()` = ✓, `sempre` = funciona sem projeto). Ação nova = um item nessa lista:
  aparece no menu, no teclado e em Editar › Atalhos do teclado (Ctrl+Alt+K).
- Barra de menus: Arquivo, Editar, Clipe, Sequência, Marcadores, Exibir, Janela, Ajuda. Janela usa o menu de painéis de
  `editor-dock.js` (`veDockMenu`).
- `veOnKey` (editor.js) só faz as verificações de foco/modais e chama `veExecTecla`. Teclas no formato
  `Ctrl+Alt+Shift+Tecla` (letras/números por `e.code`; símbolos pelo caractere, sem o Shift).
- Teclas trocadas pelo usuário: `PREFS.atalhos` (só as diferentes do padrão; tecla repetida sai do outro comando).
- Alt+Enter: `veTelaCheia` (monitor em tela cheia, toca da agulha; ao sair pausa). O main.py (`_ligar_tela_cheia`)
  deixa a janela sem borda e maximizada enquanto o WebView2 tem elemento em tela cheia.

## Painel Projeto (como o Project do Premiere; substitui o painel Clipes)
- Código: `frontend/js/editor-projeto.js`. Guarda os materiais do projeto: o vídeo aberto, imagens, áudios, camadas de ajuste,
  legendas (.srt) e outros vídeos (estes ainda não entram na timeline: o editor usa um vídeo por projeto).
  Tudo isso organizado em pastas (`VE.bins`).
- Na mídia: `pasta`, `cor` e `nome` (renomeado). O id é o índice em `VE.media`, então apagar marca `removido`.
- **Entrada:**
  - Arquivos e pastas do Windows soltos em cima do painel entram na pasta sob o cursor.
  - Uma pasta vira pasta do projeto, com as subpastas (`ve_listar_pasta`).
  - Pastas e legendas soltas na timeline também vão para o painel.
  - Botão Importar (Ctrl+I). Legendas `.srt`, `.vtt`, `.ass`/`.ssa`, `.sbv` e `.txt` via `ve_ler_legenda`
    (`Functions/legendas_formatos.py`; TXT sem tempos vira uma legenda por parágrafo, em sequência).
- **Visualização:** lista (colunas) ou grade (cards com miniatura; passar o mouse num vídeo percorre as miniaturas;
  duplo clique abre a pasta, com a trilha de pastas no alto). O modo e o tamanho do card ficam em `PREFS` (`pjModo`, `pjTam`).
  Cor do ícone por tipo: pasta amarela, vídeo roxo, imagem azul, áudio verde, timeline verde-água.
- **Exportar legendas/transcrição** (painel Texto): SRT, VTT, ASS, SSA, SBV ou TXT via `ve_salvar_legenda`.
- **Organizar:**
  - Ctrl+B cria pasta; F2 ou duplo clique no nome renomeia.
  - Ctrl+C/X/V (cola na pasta selecionada), Ctrl+D duplica, Delete apaga.
  - Apagar material em uso pede uma segunda confirmação e tira os clipes dele da timeline.
  - Arrastar para dentro de uma pasta, cor do rótulo, menu do botão direito, busca e ordenar pelas colunas.
- **Para a sequência:** arrastar para a timeline põe o item no ponto e na trilha do soltar; soltar no monitor põe na agulha.
  - Vídeo: o clipe inteiro.
  - Imagem ou ajuste: 5 s.
  - Áudio: na linha A do soltar, se estiver livre.
  - `.srt`: substitui as legendas (LEG), deslocadas para o ponto do soltar.
  - A cor do rótulo passa para o clipe, e o nome dado no Projeto aparece na timeline.
- O arquivo do projeto (.vcnvt) guarda `bins`, `m0` (organização do vídeo principal) e os itens que ainda não estão na timeline.

## Vários vídeos por projeto (como no Premiere)
- O vídeo aberto (`VE.media[0]`) define a sequência: tamanho, qps e duração de fonte. Outros vídeos entram pelo painel Projeto.
- Cada vídeo do projeto é preparado em fila (`veMidiaPreparar` → `ve_preparar_midia` → `preparar_midia` em video_cutter.py) e fica com:
  - análise (`m.info`);
  - prévia (`m.url`), com proxy quando o navegador não toca o formato;
  - miniaturas (`m.thumbs`);
  - áudio conformado próprio (`adicionar_audio`), registrado no mixer com o id da mídia, mais a forma de onda (`m.peaks`).
- Clipe de outro vídeo: `c.m = id` (`veMid(c)`).
  - Entra ajustado ao quadro ("Definir para o tamanho do quadro"): escala padrão = min(seqW/w, seqH/h).
  - Na prévia, cada player carrega o arquivo da mídia do clipe (`veDeckCarregar`, uma URL marcada por player).
    A reserva já carrega o próximo arquivo antes do corte, então a troca entre vídeos diferentes sai seca.
  - Aparar respeita a duração da mídia (`veDurMidia`).
- Exportação:
  - Só o vídeo aberto vai na base (concat); os outros vão como camada, com o arquivo deles (`c.path`).
  - O som de cada um entra no `_grafo_mix` pelo próprio arquivo.

## Seleção múltipla, seleção vinculada e E (como no Premiere)
- **Retângulo:** arrastar na área vazia da timeline seleciona tudo o que ele tocar. **Shift** soma à seleção.
- **Shift+clique:** põe ou tira um clipe da seleção. Clicar num clipe que já está na seleção mantém o grupo.
- Com vários selecionados: arrastar move todos juntos (Alt = cópias), D/Delete apaga todos (Shift+D fecha os espaços vazios).
- **E:** corta na agulha só os selecionados. `'` / S continuam cortando todas as trilhas.
- **Seleção vinculada** (botão do elo na barra da timeline, fica salvo no navegador):
  - Ligada: clicar no vídeo ou no áudio pega os dois; aparar a borda mexe no par.
  - Desligada: pega só a parte clicada. O clipe se separa em dois (`c.x = 'v'` imagem sem som, `c.x = 'a'` só o som),
    vinculados por `c.lk`. Separar não muda a prévia nem a exportação.
- Cortes dão um `lk` novo aos pedaços da direita (`veLkMapa`); cópias não herdam o `lk` (`veCopiaClipe`).
- Código: `veSelLista`/`veSelDefinir`, `vePegar`, `veSeparar`, `veMoverGrupo`, `veApagarVarios`, `veMarqueeFim` e
  `veCortarSelecionados` em `editor.js`. `VE.sel` segue sendo o principal; `VE.selx` só vale enquanto `prim` for ele.

## Transições de vídeo (MVP, no estilo Film Impact) — `editor-trans.js`
- Tipos (`VE_TR`): Dissolução cruzada, Empurrar (Push), Deslizar (Slide), Puxar/zoom (Pull) e Pop.
  Cada um é `fn(u) → {a, b}` (quem sai / quem entra): `dx`/`dy` em quadros, `s` escala, `op` 0..1. Quem entra fica por cima.
- Ficam no painel próprio **Transições** (aba ao lado de Efeitos): cartões com o exemplo animado (ícone do Canivete,
  `identidade/splash.png`) ao passar o mouse; parado mostra o meio da transição. Arrastar até a timeline: metade inicial do clipe = entrada dele;
  metade final = corte com o próximo (ou saída para o nada se não houver próximo). Duplo clique = entrada do selecionado.
- Guardadas no clipe: `c.tin = {t, d}` (entrada) e `c.tout = {t, d}` (saída sem vizinho). Duração padrão 1 s.
  Cortar um clipe: a entrada fica no pedaço da esquerda e a saída no da direita (`veSemTin`/`veSemTout`).
- No corte a transição fica centrada e usa a mídia que sobra além dos pontos de corte; sem sobra ela se desloca e,
  se preciso, encurta (`veTransJanela`). Imagem/texto: sobra infinita.
- Timeline: bloco roxo sobre o clipe; clique seleciona, D/Delete apaga, arrastar a borda muda a duração (no corte, simétrica).
- Prévia e exportação usam `veTransVirtuais()`: cópias dos clipes estendidas pela sobra e com a animação virando
  quadros-chave lineares por quadro (sc, x, y, op) compostos com os do clipe. O som fica numa cópia à parte, no trecho
  original. `veExportPlan` troca `VE.clips` pelos virtuais só durante o plano; clipes com `_tr` vão como camadas.
- Tipo novo: acrescente em `VE_TR` (nada muda no Python: tudo vira quadro-chave de camada).
- Prévia sem piscar: cada clipe da transição usa um player fixo (`VEX[VE_TR_PL0+n]`, `veTransPlayers`), preparado
  `VE_TR_PRE` s antes (o que entra espera parado no 1º quadro). Sem quadro pronto, o monitor segura o último desenho.

## Exportar só In→Out
- Com entrada (I) e/ou saída (O) marcadas, a exportação leva só esse trecho (`veExportFaixa`, `veRecortarClips`);
  legendas recortadas e trazidas para o zero. O resumo da exportação mostra o trecho. A transcrição usa a timeline inteira
  (`veExportPlan()` sem `emFaixa`).

## Começar a timeline por uma imagem
- Abrir (ou soltar) uma imagem sem nada aberto: a sequência nasce com o tamanho dela e a imagem entra em V1 com 5 s
  (`veIniciarComImagem`). Várias imagens soltas juntas entram em sequência.
- O editor precisa de um vídeo base (mídia 0): o Python gera um vídeo preto mudo de 1 s no tamanho da imagem
  (`_base_imagem`, em `%TEMP%\canivete_editor_bases`, reaproveitado por tamanho). `VE.path` continua sendo a imagem;
  `preparar` e `exportar_video` trocam pela base. A mídia 0 fica com `base: true` e não aparece no painel Projeto.
- Saída da exportação: nome e pasta da imagem.

## Chroma Key (efeito, categoria Chaveamento) — como Keylight / Ultra Key
- Método: **diferença de cor** (núcleo do Keylight e do IBK do Nuke), não distância de cor (`chromakey`/`colorkey` do
  ffmpeg): transparência = quanto o canal da tela (G ou B, escolhido pela cor) passa dos outros dois, medido em relação
  à cor da tela. Preserva cabelo, desfoque e semitransparência.
- Controles: Cor da tela (conta-gotas no monitor, média 5×5 com o efeito desligado), Ganho, Equilíbrio (peso R×B),
  Recorte do preto/branco, Encolher/expandir (px), Suavizar borda (px), Remover reflexo (%), Mostrar matte (só prévia).
- Prévia: `veKeyDraw` (editor-fx.js), pixel a pixel no tamanho em que a mídia aparece (~19 ms em 1280×720).
- Exportação (`_filtros_fx`, t == "key"): `colorchannelmixer` (alfa bruto, 8 bits) → `lutrgb` no alfa (ganho e
  recortes) → `despill` → [`format=gbrap`, `erosion`/`dilation` só no alfa × n, `gblur planes=8`] → `format=rgba`.
  Os coeficientes saem prontos do JS (`exportar`); a prévia faz as mesmas contas.
- Não vale em camada de ajuste (`soClipe`).

## Transição padrão (Ctrl+D / Ctrl+Shift+D) e fade de áudio (Potência constante)
- Clicar na borda de um clipe seleciona a ponta (colchete laranja, `VE.bordaSel`), como a seleção de ponto de edição do Premiere.
- **Ctrl+D:** aplica a transição de vídeo marcada no painel Transições (clique no cartão = contorno laranja,
  `VE.trEscolhida`, salva no navegador; padrão Dissolução cruzada). **Ctrl+Shift+D** (ou **Ctrl+Shift+9**): áudio,
  Potência constante. Na ponta selecionada ou nas duas pontas dos clipes selecionados; ponta final colada em outro clipe = o corte.
- Áudio: `c.atin` / `c.atout` (mesma janela das de vídeo: centrada no corte, usando a sobra). `veAudFades` estende os
  dois lados e passa `fi`/`fo` em `veMixClipes` (itens 8 e 9). Mixer: ganho seno/cosseno (`veAudioFade`);
  exportação: `afade curve=qsin` em `_grafo_mix`. Bloco verde na linha A; clique seleciona, D apaga, borda muda a duração.
- **Dobrar (Fold):** usa escala só na horizontal (`sx` nos quadros-chave dos clipes virtuais; prévia `ctx.scale(k*sx, k)`,
  exportação multiplica a largura no `scale`).
