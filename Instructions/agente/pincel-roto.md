# Pincel Roto e Refinar borda (Roto Brush do After Effects no Editor Kanivete)

Recorta uma pessoa/objeto de um clipe de vídeo pintando num quadro; o recorte segue sozinho pelos outros quadros.
Uso típico: texto atrás da pessoa (V1 vídeo, V2 texto, V3 o mesmo vídeo com o Pincel Roto).

## Como usar (igual ao After)
- Efeitos › Chaveamento › **Pincel Roto e Refinar borda** → botão "Abrir o Pincel Roto" (ou duplo clique na faixa que já
  tem o efeito). A tela própria abre por cima do editor (como a Cena 3D).
- Pincel verde soma; **Alt** (ou botão Tirar) vermelho tira; **Ctrl+arrastar** muda o tamanho; ←/→ quadro (Shift = 10);
  Espaço toca; Delete apaga o quadro-base; Esc volta. Vistas: Contorno (rosa, fora escurecido), Alfa, Transparente.
- O quadro pintado vira **quadro-base** (◆ amarelo na régua). Ele propaga para frente e para trás até o quadro-base
  vizinho (verde na régua = já recortado). Errou num quadro? Pinte nele: vira quadro-base e refaz só o trecho entre os
  vizinhos.
- **Refinar borda** nos Controles de efeito: Suavizar (contorno liso), Pena, Contraste, Deslocar borda (px, + cresce),
  Reduzir tremido (mistura com o quadro anterior só na faixa da borda). Mudar refaz o alfa (~0,1 s/quadro) em segundo plano.
- Quadro fora do trecho recortado (antes de pintar, ou clipe esticado além do trecho de quando o efeito nasceu) = opaco.

## Rodada 2 (2026-10-18)
- **Modelo**: SAM 2.1 de vídeo fp16 da diffusionstudio (Apache-2.0, revisões fixas, MD5): "alta" = Hiera-Small 1024
  (`modelos_ia/sam2_small_video_fp16`, 112 MB) e "rapido" = Hiera-Tiny 512 (`sam2_tiny_video_fp16`, 83 MB). Bancada
  `D:/kanivete_testes/roto/bancada.py` (RTX 3050, 1080p): Tiny fp32 antigo 0,50 s/quadro; **Small fp16 0,28** (e segue a
  mão que o Tiny perdia, microfone sai limpo — `folha_mao.jpg`, `folha_bancada.jpg`); Tiny 512 fp16 0,07 (borda grossa).
  Na CPU o Small fp16 é lento (codificador 3,6 s) → sem placa o padrão é "rapido". Qualidade fica no projeto (`rd.q`);
  trocar refaz as memórias dos quadros-base (`info.qual`; npz de outro modelo é apagado ao abrir).
- **Freeze**: `definir_base(..., seguir)` só calcula o quadro-base (~2 s, codificação do quadro guardada para vários
  traços) e anota `info.pend`; `congelar` segue os trechos ao redor dos pendentes. Trecho entre dois quadros-base é seguido
  pela METADE (1ª metade do da esquerda, 2ª do da direita). Pintar com o seguimento rodando interrompe e o recoloca na fila.
  A exportação congela o que faltar; o **render automático em segundo plano** (`vePrAutoTick`) pula trechos com Roto
  pendente/rodando (`veRotoOcupado`) — antes ele chamava o `video_alfa` e disparava o seguimento sozinho.
- **Selecionar assunto**: ponto com rótulo 2 (`[0,0,2]`, traço `{auto:1}` no projeto); máscara do BEN2 (`base/s_N.png`,
  sai o SAM da placa, entra o BEN2, volta o SAM: ~9 s) vira o recorte de partida e os traços somam/tiram por cima.
- **Memória só com objeto achado** (nota > 0 e iou > 0,3): quadro em que ele some não entra no banco.
- **Borda em paralelo**: `_Refinador` (linha própria na CPU) refina enquanto a placa segue. 450 quadros: 300 s → 145 s.
- **Tela**: janela (`.vero-jan`, 90vw × 88vh, ⤢ tela cheia) sobre o editor com `backdrop-filter: blur(6px)` (o play
  para ao abrir: nada anima atrás). Armadilha: `.ve` define `grid-template-rows: 46px …` — sem redefinir as linhas no
  `.vero`, a janela caía na faixa de 46 px do topo.

## Rodada 3 — borda profissional (2026-10-18)
- **Descontaminar cores** (`descontaminar`, padrão 100%): Blur-Fusion em 2 passadas (Forte & Pitié 2021; médias da
  pessoa e do fundo ponderadas pelo alfa, raios 90 e 6 px em 1080p), médias em meia resolução e a fórmula final só nos
  pixels da faixa da borda: 0,15 s/quadro. Some a auréola escura em volta do cabelo/rosto sobre fundo claro
  (`D:/kanivete_testes/roto/descont.py`, `exp_lado.jpg`). Exportação: `_video_descontaminado` lê o vídeo ORIGINAL por
  tubo do ffmpeg, 4 linhas de conta, grava ProRes 4444 por tubo (15 s: 12,6 → 38,5 s). Prévia igual: `c/c_N.png` (cor
  nova só na faixa, meia resolução) desenhada com `source-atop` depois do `destination-in`; mudar só a descontaminação =
  tarefa "cores" (não refaz o alfa).
- **Nitidez da borda** (padrão 50): estreita a faixa do filtro guiado e endurece o alfa (100 = só o antisserrilhado). Com
  0 a faixa macia larga deixa sombra mesmo descontaminada (`nitidez.jpg`).
- **Proteger rosto** (padrão ligado): YuNet (13 ms/quadro, um detector por linha) → a forma do rosto pelos 5 pontos
  (olhos, nariz, boca + queixo/testa no eixo olhos→boca; o lado oposto ao nariz até a bochecha, o lado do nariz para no
  nariz) fica sempre no recorte (mão na frente do queixo não fura o rosto); de frente (nariz no meio dos olhos ≥ 0,4)
  também fecha lente de óculos/bochecha numa elipse em volta. De perfil a caixa do detector passa do rosto e puxava o
  fundo na frente da testa: por isso os pontos, não a caixa. Rosto não achado (borrão) usa o do quadro vizinho (≤ 8).
- Na tela: faixa **Borda** (Nitidez, Descontaminar, Proteger rosto) acima da régua — os mesmos parâmetros do efeito.
- Montar o vídeo recortado ficou longo: `video_pedir` (tarefa "video" na fila; o JS pede, espera e pede de novo) —
  chamada longa do pywebview cai. `video_alfa` (bloqueante) fica para os testes.
- Mão que ENTRA na frente do rosto continua cortada fora da forma do rosto: correção com traço verde.
- **Play leve**: medido 30 quadros/s no monitor com o Roto (igual a sem efeito; máscara certa em todos). O que travava
  era o trabalho do Roto junto com o play (seguimento disparado pelo render automático; montar o vídeo). Agora tocar
  pausa o Roto (`ve_roto_pausar` pelo vigia, `_vez()` nos laços); a exportação não pausa. `scripts/roto_play.py`.

## Motor (Functions/pincel_roto.py)
- **SAM 2.1 Hiera-Tiny de vídeo em ONNX** — `square-zero-labs/sam2.1-tiny-video-onnx` (Apache-2.0, revisão fixa
  `3b2984dd…`, 182 MB, MD5 conferido), baixado no 1º uso em `modelos_ia/sam2_tiny_video`. 5 grafos: vision_encoder,
  mask_decoder, memory_encoder, memory_attention, pointer_tpos + constants.json (7×64 de posição no tempo).
- onnxruntime-DirectML (qualquer placa DX12) com CPU de reserva (`CANIVETE_ROTO_CPU=1` força CPU). Solta as sessões do
  Remover fundo antes (uma IA por vez na placa) e sai da memória parado 3 min (`memoria.usado`).
- Laço do SAM 2: quadro-base = decodificador com os pontos (sem memória, ou com a memória dos quadros-base vizinhos
  quando é correção) → memória binarizada. Quadros seguintes: banco fixo de 7 memórias (quadros-base com a linha 6 da
  posição no tempo; recentes com linha distância−1; completa repetindo) + 16 ponteiros de objeto (4 fichas de 64 cada,
  posição pelo pointer_tpos com a distância / (min(n,16)−1)) → memory_attention → decodificador com o ponto vazio
  (rótulo −1) → memória.
- **Correção soma/tira do que já estava** (como no After): guarda o recorte de antes do quadro-base (`base/b_N.png`) e
  refaz sempre a partir dele: + pedaços novos que tocam um ponto verde (o maior entre a leitura COM memória — com 2 pontos
  do miolo do recorte de antes — e a leitura SEM memória, só pelos traços), − onde o modelo tirou perto de um ponto
  vermelho. Só os pontos, com memória, a correção da mão virava "só a pele" (cabelo e camisa sumiam); com memória o modelo
  resiste a pegar a mão borrada fora do corpo, sem memória pega (`D:/kanivete_testes/roto/sonda_mao.py`).
- **Poucos pontos**: traço vira 1 ponto (curto) ou 3 (15/50/85% do caminho); máximo 12 por quadro. Muitos pontos
  (15+) deram máscara fantasma (cinza no quadro todo) — medido no protótipo.
- Medido (RTX 3050, 1080p): **0,56 s/quadro** propagando (codificador 0,20 + memória 0,25 + resto 0,1); 15 s de vídeo ≈ 4 min
  + 1 min de borda. Corpo e cabeça presos nos 15 s inteiros do teste; mão rápida que sai do corpo escapa → correção.

## Armadilhas (medidas)
- Alfa da prévia em PNG cinza não recorta nada (o canvas usa o canal de transparência): `p_` é branco com a máscara no alfa.
- Imagem de outra origem (servidor local) sem `crossOrigin = 'anonymous'` suja o canvas: `getImageData`/`toDataURL` falham.
- O limpador do cache de render apaga pasta vazia: `Trabalho.arq` recria a subpasta na hora de gravar.
- `info.json` gravado pela tela e pelo operário ao mesmo tempo matava o operário: trava + nome temporário por thread; o
  operário volta sozinho se cair com tarefa na fila (`_garantir_operario`).

## Arquivos e dados
- `frontend/js/editor-roto.js`: efeito `VE_FX.roto` (draw = destination-in com o alfa da prévia), tela (`veRotoTela*`),
  vigia (polling `ve_roto_estado` 400 ms), exportação (`veRotoPreparar`), API `VEROTO_API` (abrir, tracar, estado, quadro).
- Projeto: `f.v.rd = {rid, a, b, tr: {quadro: [{l, r, p: [[x,y]…]}]}}` (0..1). Os traços do projeto mandam: ao abrir,
  `veRotoSincronizar` reenvia ao Python o que faltar (cache apagado, desfazer, outro PC).
- Cache (`<cache de render>/Roto/<rid>`): `quadros/q_*.jpg` (trecho extraído), `m/` probabilidade 1024², `base/` memória
  de cada quadro-base (npz fp16), `a/` alfa refinado (resolução cheia), `p/` alfa da prévia (metade), `info.json`
  (bases, params, `ver` = versão de cada quadro, entra no `veCacheSig`). Pastas servidas por `media_server.register_pasta`.
- Exportação: `veTxPngs` → `veRotoPreparar` → `pincel_roto.video_alfa` (quadro ORIGINAL + alfa → ProRes 4444,
  `recorte_<hash>.mov`, refeito só se algo mudou) → no plano o clipe vira vídeo transparente começando em `a` (CPU:
  overlay com alfa; placa: `_entrada_video_alfa`).
- Teste: `py -3.13 testes/teste_roto.py [--dur 15]` (porta 9336, D:/kanivete_testes/roto): base pela API, correção com o
  mouse, print da tela, exporta CPU e placa, confere texto atrás da pessoa e prévia × arquivo.

## Por que este modelo (pesquisa 2026-10-11)
- Critérios do Pailer: livre para uso comercial, sem login, leve, boa qualidade, perto do método do After.
- Descartados: RVM (GPL-3.0), MatAnyone 2 (não comercial), pesos do ViTMatte (treinados no Composition-1k da Adobe, não
  comercial). BiRefNet/BEN2 por quadro: 2–7 s/quadro e sem continuidade (cada quadro decide sozinho).
- Opções para mais tarde: SAM 2.1 Small (diffusionstudio/sam2.1-small-video-onnx-fp16) se precisar de mais qualidade;
  versão fp16 do Tiny (diffusionstudio/sam2.1-tiny-video-onnx-fp16) para acelerar.

## Resultados (2026-10-11)
- `teste_roto.py --dur 15`: 450 quadros em 300 s no app (0,67 s/quadro; 0,56 fora do app); correção com o mouse no
  quadro 180 traz a mão de volta nos quadros 160–190 (propaga para trás); CPU e placa: pessoa por cima do texto (dif 1,4),
  0,00% do texto vazando na pessoa, prévia × arquivo 3,0–3,5. Vídeo: `D:/kanivete_testes/recorte_video/resultado/`.
- Furo fechado pequeno (< 0,6% do quadro, sem encostar na borda) é tapado no Refinar borda (lentes, dedos).

## Pendências
- Lente de óculos cujo furo encosta no fundo (aro na lateral do rosto) deixa o texto aparecer: hoje só pintando a lente
  com o verde; pensar num fechamento morfológico só em furos estreitos.

- Desfoque de movimento na borda (Motion blur do Refine Edge).
- Acelerar mais: processar só a área da pessoa; IOBinding (feats na placa entre codificador e decodificador).
- Objeto que ENTRA no quadro depois do quadro-base (mão esquerda no trecho de teste) não é pego: precisa de quadro-base.
- Clipe com máscara/motion (camada desenhada) + Pincel Roto: a camada desenhada usa o alfa da prévia (meia resolução).
- Vários objetos separados no mesmo clipe (hoje um objeto por efeito; dá para pôr o clipe duas vezes).
