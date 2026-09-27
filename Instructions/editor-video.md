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
