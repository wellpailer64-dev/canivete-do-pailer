# Legenda Criativa (estudo, 2026-10-18)

Estilo novo de legenda automática no Vídeo: duas fontes que combinam, palavras com papéis diferentes e entrada
animada palavra a palavra. Variação do "Destaque da palavra falada" (`editor-texto.js`, `e.dOn`), mas aqui a palavra
**aparece** (vai se acumulando) em vez de ser **iluminada** dentro de uma frase que já está toda na tela.

Referências (folhas e tiras ampliadas em `D:/kanivete_testes/legenda_ref`, `v2/`):
- A: `Video by flaviascheid [DP2DJsVjkOb].mp4` (1080×1920, 24 qps)
- B: `Video by anoomaker [DZGccfISgBK].mp4` (1440×2560, 30 qps)

## O que os dois têm em comum
1. **Bloco = ideia curta** (2 a 5 palavras). As palavras entram uma a uma **no tempo da fala** e se acumulam; o bloco
   inteiro sai junto quando a ideia acaba (sem ficar "rolando" texto).
2. **Três papéis de palavra**:
   - **ligação** (na, o, é, pro, que, a, e, de, com): pequena, ~45–60% do tamanho, fonte da base;
   - **base** (o resto): sem serifa pesada (A) ou serifa clássica (B), branca;
   - **ênfase** (1 por bloco, a palavra-chave/ponto final da ideia): serifa itálica de exibição, maior, na cor de destaque
     (laranja #F39A2E em A, amarelo #F2C318 em B) ou branca.
3. **Composição tipográfica, não frase corrida**: palavras coladas sem espaço ("naverdade", "odeiaeditar",
   "linknabio", "comOutra"), linhas **sobrepostas** (entrelinha negativa ~-15%, a de baixo encosta na de cima),
   **escada** (cada linha deslocada p/ direita ou esquerda), ligação pendurada no canto da palavra grande ("que" acima
   à esquerda de "combina"), pé pequeno embaixo à direita ("muito bem", "te falei", "o que você odeia").
4. **Dois modos alternados**: a maior parte é legenda **simples** (1–4 palavras, uma fonte, pequena); a cada 3–6 s
   aparece um **bloco título** (gancho, nome, número, CTA, fecho de ideia). O contraste entre os dois é o que dá o efeito.
5. **Posição**: centro do peito (~55–62% da altura), nunca no rosto; sobe para cima/entre quadros quando a tela está
   dividida (B-roll em cima) ou quando a pessoa ocupa embaixo. B põe o CTA final no topo, acima da cabeça.

## Vídeo A (flaviascheid) — "brilho quente"
- Dupla: grotesca pesada (tipo Helvetica Neue Heavy / Inter Black / Poppins ExtraBold, espaçamento apertado) branca +
  serifa itálica de alto contraste (tipo Bodoni Moda / Playfair Italic) laranja; 3ª voz: grotesca leve pequena
  ("o que você odeia").
- Acabamento: brilho externo suave (branco nas brancas, laranja nas laranjas) + sombra escura curta para leitura.
- **Entrada (4–6 quadros, ~0,2 s)**: opacidade 0→1 + desfoque forte→0 + **clarão** (o brilho passa do ponto no 2º–3º
  quadro e assenta); a pesada entra quase parada (leve escala 1,05→1); a itálica entra com desfoque e um leve
  deslize lateral. Palavra pequena de rodapé sobe ~10 px.
- **Saída**: o bloco todo desfoca e some em 2–3 quadros; ou corta no flash de luz (vazamento de luz laranja,
  quadro inteiro, 2–3 quadros) entre blocos importantes.
- Extras: **sublinhado** que se desenha da esquerda p/ direita com brilho e "antecipa" a palavra seguinte
  ("títulos ____" → "virais" ocupa o traço; "linknabio" ganha o traço depois); **ícone** (logo do DaVinci) entra com
  escala e desfoque atrás do título.
- Legenda simples: 1 palavra por vez, laranja, grotesca bold, sem caixa; posição alta quando a tela está dividida.

## Vídeo B (anoomaker) — "editorial"
- Mais sóbrio: base em serifa clássica (tipo Times / Libre Caslon / EB Garamond) branca, pequena; títulos em grotesca
  bold (Coolvetica/Helvetica), serifa condensada pesada ("scholar"), serifa itálica pesada ("combina", "três",
  "segue"); ênfase amarela só em 3 momentos (legendas, principal, cara/segue).
- Sem brilho; só sombra muito leve. Cor neutra + 1 destaque.
- **Entrada**: palavra nasce **cinza/transparente (~30%) e clareia para o branco** em ~3–4 quadros (dá sensação de
  "acender" no tempo da fala); a ênfase amarela nasce escura e clareia até o amarelo. Quase sem movimento.
- **Saída**: o bloco inteiro escurece até sumir (~4 quadros), às vezes já com o próximo bloco começando por cima.
- Ele usa a própria fonte como exemplo ao falar o nome dela ("montserrat" em Montserrat): palavra que é nome de
  fonte/marca pode ganhar estilo próprio.

## Como fica automático (proposta)
1. Transcrição com tempo por palavra (já existe: `legendas.py`, `VETX.palavras`).
2. **Kani marca o roteiro** (JSON travado, com regra de reserva sem IA): cortar em blocos, papel de cada palavra
   (ligação/base/ênfase) e quais blocos são **título**. Reserva: lista de palavras de ligação; ênfase = palavra mais longa
   ou número/nome próprio no fim da ideia; título = início do vídeo, frases com número, nome próprio, CTA e a cada ~4 s.
3. **Duplas de fontes** prontas (OFL, embutidas), cada uma com cores, brilho e animações próprias: "Brilho quente"
   (estilo A), "Editorial" (estilo B) e outras. Cor de destaque tirada do vídeo ou da marca.
4. **Motor de composição**: monta o bloco título com as regras do item 3 (coladas, sobrepostas, escada, pendurada, pé)
   e encaixa na área segura do 9:16; desvia do rosto usando o YuNet do Painel Pessoas.
5. Entradas/saídas por papel, quadro a quadro (prévia no canvas e exportação pelo mesmo desenhista).
6. Tudo editável depois: trocar papel de uma palavra, virar/desvirar título, trocar dupla.

## Feito (2026-10-18) — modo Premium, ao lado da Clássica e da Dinâmica
- **Modos** (painel Texto › Legendas, cartões): Clássica (`dOn` falso), Dinâmica (`dOn`), Premium (`VE.legEstilo.modo =
  'premium'`). Entrar/sair da Premium remonta os blocos a partir da transcrição (Ctrl+Z desfaz); Clássica ↔ Dinâmica não.
- **Código**: `frontend/js/editor-legenda-premium.js` (prefixo `veLp`/`VELP`), `css/editor-legenda-premium.css`,
  ganchos em `editor-texto.js` (veTxDesenhar, veTxLegendaNoPonto, veTxLegEditar, veTxExport, veTxCriarLegendas, aba) e
  `editor-props.js` (bloco Premium). Exportação: `_ass_premium` + `_filtro_sub` (fontsdir) em `Functions/video_cutter.py`
  (CPU e placa). Kani: `Functions/legenda_premium.py` (API `ve_leg_premium_kani`, lotes de 30 blocos, ~7 s).
- **Dados**: `VE.legEstilo.pr = {dupla, cor, anim, brilho, tam, pos, titulos, sub}`; cada legenda `l.pr = {t, r, m}`
  (t = título, r = papel por palavra 'l'|'b'|'e', m = mexido à mão: a Kani e a densidade não mexem mais nela).
- **Duplas** (`VELP_DUPLAS`): Brilho quente (Poppins 800 + Playfair 900i), Editorial (DM Serif + Inter), Impacto (Anton +
  Instrument Serif i), Suave (Manrope + Fraunces i), Elegante (Montserrat + Cormorant i), Moderno (Bricolage + Playfair i).
  Fontes em `frontend/fonts/premium` (OFL, estáticas, renomeadas "KPR Fxx": o mesmo nome no navegador e no libass).
- **Armadilha medida**: o libass dá o Fontsize = usWinAscent+usWinDescent (OS/2), o navegador mede pelo hhea — no Poppins
  1,76 × 1,40 em (a exportação saía 26% menor). A prévia manda a linha de base (`b`) e o Python refaz fs/cy pelas
  medidas win (`_met_premium`).
- **Rodada 2 (notas do Pailer, 2026-10-18)**: a Kani escolhendo títulos ficou pior que a montagem automática → agora
  ela só escolhe a palavra de destaque dos títulos automáticos (prompt com exemplos; número no título sempre ganha).
  Margens: o bloco cabe e fica preso na área segura de títulos (`VELP_SEGURA` = 80% do quadro, também arrastando).
  **Margens de segurança** no Programa (botão ao lado das réguas, `veSegToggle` em editor-guias.js): retângulos de ação
  (90%) e de títulos (80%), só no monitor, valem para vertical e horizontal.
- **Efeitos sonoros** (caixinha no painel, `pr.sfx`; Sutil/Médio/Forte + Volume): sons do pack do Soundboard escolhidos
  pelo movimento (`VELP_SFX_PAL`: só whoosh SUAVE em todas as animações — entrada do título = "Whoosh suave", destaque e
  legendas simples = "Whoosh suave mini"; o clique de mouse repetido ficou estranho no teste do Pailer; o pico vem do
  catálogo, campo `pico`) e pelo assunto (`VELP_SFX_ASSUNTO`: dinheiro → moedas/caixa, deu certo →
  confirmação, foto → câmera, erro → erro, pergunta → pergunta). O PICO do som (forma de onda `pk` do pack) cai na
  chegada da palavra; no máximo um som a cada 0,22 s; ganho −10 a −19 dB (SFX contido). Clipes marcados `lpSfx` numa
  trilha de áudio própria, refeitos ao montar/trocar dupla, animação, títulos ou papéis (os movidos à mão também).
  Prints: `D:/kanivete_testes/scripts/lp_sfx.py`.
- **Faixa de legendas** (vale para os 3 modos): cabeçalho "Legendas"/"Captions" (i18n), olhinho = `VE.legEstilo.oculta`
  (sem monitor nem exportação, entra no desfazer), botão direito na faixa ou no cabeçalho = `veLegMenu` (ocultar, painel
  Texto, apagar esta, apagar todas — a transcrição fica; os sons lpSfx saem junto). Teste: `D:/kanivete_testes/scripts/lp_menu.py`.
- **Entrada Automática** (padrão, `pr.anim = 'auto'`, `veLpAnimDe`): por legenda — o gancho (1º título) com desfoque e
  brilho, título com número ou "!" com pop, com "?" subindo, os outros alternando a da dupla com uma segunda; legendas
  simples discretas (subir/acender). A exportação recebe a entrada de cada legenda (`item.prm.anim`).
- **Rodada 3 (2026-10-18)**: entradas novas Revelar (clip abre da esquerda), Zoom (135%→100% com desfoque), Cair e
  Deslizar; **saídas** (`pr.saida`: Automática, Esmaecer, Desfocar, Encolher, Varrer — a automática combina com a
  entrada, `veLpSaidaDe`); **destaque** dos títulos (`pr.marca`: Traço, Marca-texto = caixa na cor de destaque atrás da
  palavra com texto em contraste e sem brilho/sombra, Nenhum; `pr.sub` antigo vira traço/nenhum); bloco que terminaria
  logo depois de um corte do vídeo principal (V1) termina no corte (`veLpBlocos`). Na exportação: `\clip` animado
  (revelar/varrer), `\move` (cair/deslizar), escala (zoom/encolher); caixa na camada 0.
- **Destaque (rodada 4)**: Automático (padrão; `veLpMarcaDe`: o da dupla em `VELP_MARCA_DUPLA`, número ganha caixa,
  1 em cada 3 títulos sem marca), Traço, Marca-texto (agora rente à TINTA da palavra: `veLpTinta` mede actualBoundingBox
  com a fonte, folga 0,08/0,06 em), **Pincel rústico** (`veLpPincel`: contorno irregular sorteado pela palavra, pontas
  com fiapos, -1,5°; vai ao .ass como desenho com x/y no canto da caixa do próprio desenho — `veLpMarcaExport`) e Nenhum.
- **Rodada 5 (2026-10-18)**: duplas Retrô (Bowlby One + Shrikhand), Rústico (Alfa Slab + Caveat Brush + Special Elite),
  Disruptivo (Archivo Black + Unbounded + Space Mono, neon) e Zine (Rubik Dirt + Sedgwick Ave); marcadores que desenham a
  minúscula como maiúscula (Permanent Marker, Rock Salt) foram testados e tirados (legenda nunca em CAIXA ALTA).
  **Cor do vídeo** (✦ nas cores; `cor_do_video` em legenda_premium.py): 8 quadros, matiz dominante, escolhe a cor da
  paleta que mais se separa dele. **Ênfase da voz** (`enfase`, opção desligada por padrão): volume contra as vizinhas +
  alongamento em palavras de 4+ letras; no Reel de referência a medida solta escolhia errado (palavras curtas e verbos
  fracos sobem no volume) — apertada, só muda destaque com nota >= 3 e folga 2,5, e quase não mudou nada: vale como
  opção, não como padrão. Bug corrigido: o `sub: true` que sobrava no padrão deixava o destaque Automático sempre em traço.
- **Teste**: `py -3.13 testes/teste_export.py --casos premium,premium2,premium3,premium4,premium5,premium6,premium7,premium8,premium9 --folha` (prévia × exportação); prints do painel:
  `D:/kanivete_testes/scripts/lp_ui.py`.

## Pendências
- Desviar do rosto sozinho (YuNet do Painel Pessoas) — hoje a posição é Cima/Meio/Baixo + arrastar no monitor.
- Clarão de luz entre blocos-título e ícone/logo junto do título (vídeo A).
- Cair/Deslizar/Subir: a prévia usa curva suave e o libass move em linha reta (\move não tem curva) — diferença pequena.
- Legenda Premium no Sound Kanivete/Ke de arquivos: não se aplica (só timeline do Vídeo).
- Testar num vídeo real de fala com várias densidades e ajustar `veLpBlocos`/`veLpNotaTitulo` com o Pailer.
