# Motion no Editor Kanivete (recursos do After Effects)
Código: `frontend/js/editor-motion.js` (+ ganchos em editor.js, editor-fx.js, editor-keyframes.js, editor-transform.js,
editor-grafico.js, editor-props.js; `css/editor-motion.css`). API: `window.VEMO_API`. Testes: `py -3.13 testes/teste_motion.py`
(mouse de verdade, porta 9335) e `py -3.13 testes/teste_export.py --casos motion,fxmotion,curvas [--folha]`.

Origem: desafio 2026-10-10 de refazer a referência do Pinterest (`D:/kanivete_testes/motion_ref/`, análise cena a cena em
`ANALISE.md`, folhas em `frames/`) como propaganda do KANIVETE. Regra do Pailer: o que faltar no app, construir antes de
animar ("trabalhando é que se percebe o que falta").

## O que existe (rodada 1, 2026-10-10)
| Recurso (AE) | No Kanivete | Onde |
|---|---|---|
| Quadro-chave em qualquer parâmetro de efeito | ⏱ ◆ em cada parâmetro dos Controles de efeito; faixa na timeline (U abre) | `c.k['fx.<id>.<p>']`, `veFxValues(f, c, T)` |
| Máscaras (ret., elipse, caneta) | ferramentas Máscara e Caneta (grupo da Forma); modo Adicionar/Subtrair/Interseção/Diferença, Inverter, Pena, Opacidade, Expansão; Caminho animável; arrastar ponto (Seleção), Alt+arrastar = alças, arrastar o traço move a máscara | `c.mk`, `veMoMascarar` |
| Fosco de trilha | alfa / alfa inv. / luma / luma inv., qualquer camada (padrão: a de cima); a camada-fosco some | `c.mt = {uid, modo}` |
| Camada mãe + Nulo | escolher no painel (a filha não pula); Nulo 100×100 âncora no canto, não aparece nem exporta | `c.pai`, mídia `nulo` |
| Desfoque de movimento | por camada, obturador 180°, amostras pela distância (prévia ≤16, exportação ≤48) | `c.mb` |
| Formas | + Estrela, Polígono; preenchimento liga/desliga; Aparar caminho (início/fim/deslocamento); Tracejado; ponta redonda; largura/altura/raio animáveis | `c.fm`, `c.k['fm.<p>']`, `veGrForma` |
| Interpolações | + Passar e voltar (overshoot, Bézier), Elástico, Quicar (botão direito no ◆) | `VE_KF_BEZ.back`, `VE_KF_ESPECIAL`, `_ease_especial` (py) |
| Efeitos novos | Preenchimento, Rampa de gradiente, Brilho (glow), Granulação, Desfoque direcional, Desfoque radial, Contorno, Eco (rastro) | `VE_FX.mo_*` (margem: o efeito vaza da camada) |
| Ondulação (Wave Warp, 2026-10-15) | Painel Animação e Efeitos › Distorcer: altura, quantidade de ondas, velocidade (ondas/s, negativo inverte), direção, formato (seno → quadrada), fase, prender o começo (bandeira). NÃO vira camada desenhada: prévia por faixas (~9 ms/quadro 1080×1920 no monitor), exportação `vc._filtro_onda` (geq, roda por último e a camada cresce a altura de cada lado; imagem parada: depois do loop), placa: vídeo pelo híbrido (`_giro_tam` com a margem) | `frontend/js/editor-onda.js`; teste_export `onda`, `ondavideo` (CPU e --placa) |

## Exportação: camada desenhada
Camada com máscara, fosco, mãe, desfoque de movimento, parâmetro do motion animado ou efeito `soDesenho` (os `mo_*`) é
desenhada quadro a quadro pelo MESMO desenhista da prévia num canvas do tamanho do quadro → PNG → `cena3d.fim` → ProRes
4444 com alfa (cache por hash `mo.<hash>`; `VE_MO_VERSAO` entra no hash: mude ao mudar o desenho). Entra no plano no
lugar da camada (`pk.mov` em `veExportPlanClips`), com o modo de mesclagem dela. Vale para exportação, Fila, prévia
renderizada, Comp e sobreposição (todas passam por `veTxPngs`/`veTxPrecisa`). Pedidos iguais ao mesmo tempo esperam o
que já roda (`VEMO.emCurso`). Medido: caso motion (4 s, 4 camadas desenhadas) ~20 s na 1ª vez, ~6 s com cache.

## API (agente)
```js
VEMO_API.mascara(i, {forma:'eli', x, y, w, h, pena, modo, inv})   // px da mídia; sem x/y/w/h = a camada toda
VEMO_API.quadros(i, 'fx.<id>.amt' | 'mk.<id>.cam' | 'fm.apFim' | 'x' ..., [[t, v, 'back'|'elas'|'quica'|'ease'|[x1,y1,x2,y2]], ...])
VEMO_API.pai(filha, mae) · VEMO_API.nulo({x, y, prender:[i...]}) · VEMO_API.fosco(i, fosco, 'alfa') · VEMO_API.desfoqueMovimento(i)
VEMO_API.pontosEli(x, y, w, h) / pontosRet(...) → caminho para animar a máscara
```

## Receita validada (propaganda KANIVETE, 2026-10-10 — o Pailer: "ficou perfeito")
Arquivos: `D:/kanivete_testes/motion_kanivete/` (roteiro.md, narrar.py, gerar_assets.py, montar.py + montador.js,
folha.py, exportar.py). Ordem que funcionou:
1. **Ler a referência**: folhas de quadros a 6 q/s e 30 q/s nas transições (`motion_ref/frames`), transcrever a fala dela;
   anotar cena a cena (tempo, texto, objeto, movimento, transição) em ANALISE.md.
2. **Roteiro na mesma estrutura** e **narração primeiro** (Fran, OmniVoice 32 passos, velocidade 1,15): o tempo de cada
   cena sai das palavras (transcrever cada fala de volta: confere pronúncia e dá o tempo de cada palavra).
   Corte de silêncio com folga (`silenceremove ... start_silence=0.08`), senão come o "K" de Kanivete.
3. **Objetos**: Z-Image (fundo branco liso, "no logo, no text") → recorte BEN2 → aparar pela área SÓLIDA (alfa > 128;
   pontinhos soltos na borda impedem aparar pelo alfa fraco).
4. **Montar por plano em código** (montar.py): cada cena com entradas/saídas por ajudantes; aplicar no app de teste,
   comparar com `folha.py` (nossa timeline em cima, referência embaixo no ponto equivalente da cena), corrigir, repetir.
5. **Exportar** (camadas do motion viram camada desenhada; 2ª exportação reaproveita o cache) e conferir o arquivo.

Gramática de motion que o Pailer aprovou:
- Entrada: desfoque 40→0 (texto 100→0) + opacidade + deslocamento curto (30–60 px) ou escala 120–135 %→100, 0,25–0,35 s,
  curva EXPO [0.16, 1, 0.3, 1]; objetos que "pulam": Passar e voltar (back). Palavras escalonadas no tempo da fala.
- Saída: 0,15–0,2 s com desfoque, para cima/lado, curva "in". Trocas de cena com flash de cor (0,18 s), estrela pontuda
  crescendo até cobrir a tela, círculo nascendo do objeto (tela da TV) e cobrindo tudo.
- Camadas de apoio: texto fantasma gigante (preto, 9 %), grade tracejada sutil, objeto recortado com sombra, mini-objeto
  no canto, cursor clicando; órbitas = nulo girando com elipses tracejadas e bolinhas filhas (desfoque de movimento).
- Tipografia: Playfair Display itálico (título negrito + apoio regular, tamanhos bem contrastados), Bebas na caixa.
- Acabamento: aberração leve no vídeo todo (camada de ajuste, r −0,7 / b +0,7, raio 0); bloom (Brilho limite 72, raio 38,
  intensidade 70) SÓ nas cenas de fundo colorido — no branco ele lava o texto fino; brilho próprio nos neons.
- Som: whoosh com o pico no corte, pop nas entradas que pulam (−11 a −14 dB); música com o drop na 1ª palavra, 8–10 dB
  abaixo da voz (Electric Desire: g −19), saída suave sob a última fala; vinheta do app depois da voz (g −9);
  Hard Limiter no Master (teto −1,5, ganho +7,5) → −14,5 LUFS, pico −1,4 dB.

## Armadilhas
- O desenho da forma/texto depende de `VE.playhead`: fora da prévia, desenhar com a agulha no instante (`veMoFonte`).
- Ouvinte do monitor no PAI (captura): senão a Seleção pega o clique no ponto da máscara e arrasta a camada.
- Efeito que cresce (glow, contorno, desfoques do motion) declara `margem(v, env)`; o canvas ganha borda e `cv._mais` diz
  quanto (quem desenha a camada desconta).
- No teste de exportação, o vídeo de fundo tem meio quadro de folga entre prévia e arquivo: o caso motion usa foto parada
  e a conferência por região (30×30) compara com o quadro exato do ffmpeg.

## Exportação rápida (2026-10-11)
- Desfoque animado (o "entra desfocando" de quase todo texto) NÃO vira camada desenhada: `gblur` + `sendcmd` com
  `sigma` E `sigmaV` (só sigma deixava o vertical preso no inicial: texto desfocado o filme todo) e pré-multiplicado
  (sem a borda escura do preto transparente). Na propaganda: 68 → 24 camadas desenhadas.
- PNG da camada desenhada e da Cena 3D por `veCanvasPng` (toDataURL síncrono): o `toBlob` era adiado ~1 s por quadro
  pelo WebView. Preparação da propaganda do zero: 1.002 s → 69 s.
- Modo placa aceita tudo o que o motion usa (ver mapa-kanivete-encoder.md, rodada 5).
- Corrigido no exportador de CPU: imagem que gira E muda de escala saía 1/√2 menor (a escala valia sobre a medida
  da mídia, não sobre o quadro girado). A "prévia renderizada" usa esse exportador: ao medir, desligar
  (`vePrSegEm = () => null`) para ver a prévia ao vivo.

## Pendências
- (2026-10-19) Forma (elipse) com desfoque 90–120 + mesclagem Tela apareceu como disco chapado no monitor (reels BF
  Carlinhos); contornado com PNG radial. Conferir se o desfoque vale em forma com `bm`.
- (Feito 2026-10-15) **Ondulação na placa em shader** — ver plano-kanivete-encoder.md › 8.6 (com giro na placa). Ainda
  manda tudo para a CPU: imagem com onda + giro constante (ca_rot), ou girada com onda E sombra projetada.
- (Resolvido 2026-10-12) Prévia renderizada e exportação desenhando a mesma camada juntas apagavam a pasta uma da outra
  (`FileNotFoundError q00000.png`): `cena3d.inicio` agora usa pasta por sessão. Em aberto: 1× o ffmpeg caiu
  (3221225477) numa exportação da intro; o log se perdeu — se repetir, guardar o `export_fail_*.log`.
- (Resolvido 2026-10-12) Chroma Key: "Preservar amarelos", "Descontaminar bordas" e "Mostrar status" (prévia WebGL/CPU,
  exportação CPU = geq curto do alfa + LUT 3D 65³ da cor, placa = shader). Teste: `teste_export.py --casos chroma4`.
- Vídeo com máscara/mãe na exportação é lido pelo navegador (H.264/VP9 ok; HEVC/ProRes não abrem: cai na cópia de edição).
- Transição do editor numa camada desenhada não entra no desenho (a camada desenhada sai do clipe original).
- Repetidor de formas, caminho de movimento curvo (posição com alças espaciais), auto-orientar, expressões livres.
- Organização: rótulos/nomes de camada na timeline e indicador de máscara/mãe/fosco no clipe.
- Fluxo de produção: montar as telas no Photo Kanivete (`KNV.cena`, uma prancheta por cena, camadas nomeadas) e mandar
  para o Editor (ponte Photo→Editor "Animar") — o ponto de partida do Pailer no PSD → AE.


## 2026-10-14 — pedidos do Pailer (estudando as Comps do GaIA para animar à mão)
- Pincel: **Shift = linha reta** do começo do traço até o cursor, travada de 45° em 45° (pontos a cada 6 px, para o
  Aparar percorrer); tamanho do pincel passou para **Alt+arrastar**. Forma Linha: Shift trava o ângulo em 45°.
- Pincel com **Aparar caminho** (início/fim/deslocamento, animáveis): seção "Pincel" nos Controles de efeito; os traços
  contam como um caminho só, na ordem em que foram pintados (`veGrTracosAparados`, editor-grafico.js). Valores em
  `c.fm.ap*` / `c.k['fm.ap*']`, os mesmos da forma.
- **Pop** (transição de entrada) cresce a partir do ponto de âncora da PRÓPRIA camada (`ancora: true` em VE_TR); antes
  escalava a partir do centro do quadro e o logo do canto "viajava" até o lugar. Puxar/Chicote seguem no centro.
- Caneta (P) e Máscara na barra de ferramentas (grupo). **Caneta de caminho (Shift+G)** — `frontend/js/editor-caminho.js`:
  forma `t: 'cam'` (pontos Bézier como a máscara, `c.fm.pts` em px da forma, `fech`), clique = ponto, arrastar = curva,
  Shift = 45°, clique no 1º ponto fecha, Enter/Esc/duplo clique termina; traço/espessura/preenchimento/ponta redonda na
  caixinha do monitor; Aparar caminho e tracejado como nas formas (`veCamPolilinha` achata a curva). Estado `VECAMI`
  (`VECAM` já existia no editor.js — o nome repetido derrubava o arquivo inteiro). Ainda não: editar pontos depois.
- **Pontas do pincel** (`t.ponta`): Redonda, Marcador (chapado), Giz (grão fixo, igual na prévia e no export),
  Caligrafia (ponta chata a 45°). Caso `caminho` do teste_export confere caminho + pontas + Aparar.
- ARMADILHA: camada de motion gravada com o código quebrado fica no cache (mesma assinatura) e sai VAZIA nas próximas
  exportações — ao consertar um desenho, apagar `Cenas3D/mo.*` do teste (ou subir VE_MO_VERSAO se já foi para usuário).
- Pendência antiga achada no teste: caso `transicoes` do teste_export reprova no meio do Chicote (q85, 92,8) com ou sem
  a mudança do Pop. Descartado (2026-10-14): amostrar os quadros-chave na grade (continua 89,2) e alinhar a janela ao
  quadro (só "mudou" o quadro ruim e quebrou o Dividir — desfeito). Próximo a olhar: o esticão sx do chicote no export
  (escala de largura e posição do overlay) × a prévia.
