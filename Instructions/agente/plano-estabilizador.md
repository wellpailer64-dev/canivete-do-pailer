# Estabilizador (melhor que o Warp Stabilizer) — FEITO v1 (2026-10-23)

## Como está (v1)
- Efeito **Estabilizador** (painel Efeitos › Distorcer; `VE_FX.estab` em `frontend/js/editor-estab.js`): Resultado (Movimento
  suave / Sem movimento), Suavidade, Método (Posição / Posição, escala e giro), Corte máximo (%). Status vivo na nota
  do efeito (`VEST.status`, `notaDe`).
- Motor `Functions/estabilizador.py`: `analisar` (640 px, cantos em grade 8×6, LK ida e volta < 0,7 px, trilhas longas
  primeiro no RANSAC de semelhança, refino LMEDS) → `caminho` (L1 de Grundmann: pesos 10/1/100 × suavidade, corte
  linearizado, janelas de 300 quadros emendadas por 3 fixos, HiGHS **ipm** = 3× o simplex; aperta e refaz se o zoom
  exato passar) → `_zoom_preciso` (conta exata, fechada) → `renderizar` (planos YUV direto, 10 bits seguem 10, cor da
  fonte, ler/deformar/gravar em paralelo, NVENC quando houver; ffmpeg abaixo do normal). Análise guardada em
  `estab_<a>_<b>_<chave>.json` (mudar só os ajustes não analisa de novo); zoom ao lado da cópia (`.mp4.json`).
- No app: um **vigia** (1×/s) compara o que cada clipe usa com o que o efeito pede e troca a mídia (cópia estabilizada
  oculta: `m.stDe/stA/stB/stCh/stZoom`, como a do Inverter clipe); sem o efeito volta à original; desfazer/refazer só
  mexe no efeito. Trecho = clipe ± 1 s. API `ve_estabilizar(path, a, b, cfg, job)` / `ve_estab_cancelar(job)` (main.py,
  um de cada vez), eventos `veOnEstab`. Prévia = exportação (é a mesma mídia).
- Teste: `py -3.13 testes/teste_estab.py [--porta 9341]` (aplica, muda corte, tira, Ctrl+Z, exporta e mede o tremor).
- Medidas: bancada3 (tremor sintético com gabarito, `tools/estabilizador/bancada3.py`): sobra 0,8–1,7 px × vidstab
  4,8–5,2 px, zoom 1,09 × 1,15. Reais (bancada2, medida robusta): igual ou melhor que o vidstab em 4/4. 4K 8 s:
  análise 6,5 s + gravação 13,4 s (NVENC). Caminho de 2 min: ~5 s.

## Pendências (v2)
1. Rolling shutter (gelatina da A7c em 4K): modelo por faixas.
2. Fundo sem pessoas (máscara do Pincel Roto/BiRefNet entra em `analisar(mascaras=...)`, já previsto).
3. Bordas preenchidas com quadros vizinhos (em vez de zoom).
4. Pausar no play/exportação (como o painel Pessoas); gráfico do caminho antes/depois.
5. Comparar com o Warp Stabilizer de verdade (o Pailer exporta do Premiere).

## Histórico da pesquisa

## Rodada 1 (2026-10-22) — bancada `tools/estabilizador/bancada.py` (saídas em `D:/kanivete_testes/estab/saida`)
Rodar: `py -3.13 tools/estabilizador/bancada.py` (ZLIM=1.10 = zoom máximo do nosso; trechos em `TRECHOS`, caminhos em `arqs.py`).
Trechos reais de câmera na mão (CULTSP, 6 s, 1080p): 3068 (pimentas, close), 3094 (massa batida, close), 1159 (mãos
com chaveiro), 3058 (chegada à noite, gente passando na frente). Medida: tremor residual = RMS da alta frequência do
movimento quadro a quadro (phaseCorrelate a 480 px; menor = melhor).
| trecho | original | vidstab (ffmpeg, optzoom) | nosso v2 (LK + RANSAC + gaussiana, zoom 10%) |
|---|---|---|---|
| 3068 | 13,9 | 11,6 | 13,3 |
| 3094 | 9,3 | 8,2 | 9,1 |
| 1159 | 9,2 | 6,1 | 7,3 |
| 3058 | 2,3 | 1,7 | 1,7 |
Lições: (1) a convenção de ângulo do `estimateAffinePartial2D` é o oposto da do `getRotationMatrix2D` (o v1 girava
para o lado errado e piorava); (2) correção sem limite pede zoom de 25% → limitar a ~10% e cortar a correção;
(3) em close com mão/colher mexendo, tudo se move: o RANSAC pega o objeto e a medida de quadro inteiro também engana
→ próximo passo é o item 1 do plano (movimento SÓ do fundo, tirando pessoas/mãos com o recorte do Pincel Roto) e uma
medida só no fundo; (4) caminho por otimização com limite de corte (L1, Grundmann) em vez de gaussiana + corte bruto;
(5) medir também o zoom real do vidstab para comparar com justiça. Hoje, para salvar um plano, o vidstab já ajuda (−12 a −33%).

Pedido do Pailer (2026-10-14): estabilizar com algo aberto e leve, melhor que o Premiere. Ainda não começado.

## Onde o Warp Stabilizer falha (onde ganhar)
1. Confunde quem anda na frente com a câmera → o fundo passa a balançar.
2. Zoom demais para esconder as bordas (perde imagem).
3. "Deformação" (subspace warp) entorta rosto/prédio (gelatina).
4. Análise lenta e sem como ver/corrigir o que ele decidiu.

## Plano (4 camadas, sem modelo pesado)
1. **Movimento da câmera sem as pessoas**: pontos do cenário seguidos com fluxo óptico do OpenCV (DIS, já no app) /
   cantos + LK; pessoas e objetos que se mexem tirados da conta com o recorte que já existe (BiRefNet / SAM 2 do
   Pincel Roto).
2. **Caminho de câmera "ideal"** (L1 do estabilizador do YouTube, Grundmann 2011): trechos parados, retas e curvas
   suaves, com zoom máximo como limite — pan intencional fica, tremor sai.
3. **Rolling shutter** (gelatina de celular): modelo por faixas da imagem, não entortar o quadro todo.
4. **Bordas preenchidas com quadros vizinhos** em vez de zoom (versão leve primeiro; full-frame das pesquisas depois).

## No app
- Efeito "Estabilizar" no clipe; análise em segundo plano com as regras leves do painel Pessoas (prioridade ociosa,
  pausa no play/export) e resultado guardado no cache.
- Correção por quadro como transformação: export na placa (modo placa) e na prévia — os dois iguais.
- Controles: suavidade, zoom máximo, "fundo sem pessoas", "preencher bordas"; gráfico do caminho antes/depois com
  correção por trecho (o Premiere não tem).

## Primeiro passo (teste rápido antes de construir)
3–4 tomadas tremidas do GaIA (celular andando no mato, drone, alguém passando na frente) × 4 versões: `vidstab` do
ffmpeg (já no app: vidstabdetect/vidstabtransform; também deshake), a nossa com fundo sem pessoas, a nossa com bordas
preenchidas e a do Warp Stabilizer (o Pailer exporta do Premiere). Medidas das pesquisas: estabilidade, corte (quanto
da imagem sobra) e distorção + folha lado a lado. Decidir pelos números se vale construir.

## Outras prioridades levantadas na mesma conversa (para ficar mais profissional)
1. Bateria do Pailer: 5–6 projetos reais exportados a cada versão (prévia × export, tempo de preparo).
2. Rastreamento de movimento (tracker) — dá para usar o SAM 2 do Pincel Roto.
3. Este estabilizador.
4. Modelos de motion editáveis (Essential Graphics / MOGRT): GC, lettering, cartela com campos.
5. Rampas de velocidade (time remapping com curva).
6. Multicâmera de verdade (a sincronia por áudio já existe).
7. Preparo de projeto grande enquanto se edita.
Depois: cor secundária, normalização de volume no export, trabalho em equipe.
