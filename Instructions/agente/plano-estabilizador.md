# Estabilizador (melhor que o Warp Stabilizer) — PENDENTE

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
