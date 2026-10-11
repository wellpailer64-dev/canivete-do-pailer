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
- Descontaminar cores da borda (o "Decontaminate" do After): hoje a cor da borda é a do quadro original.
- Desfoque de movimento na borda (Motion blur do Refine Edge).
- Acelerar: fp16, memory_attention (metade do tempo), processar só a área da pessoa.
- Clipe com máscara/motion (camada desenhada) + Pincel Roto: a camada desenhada usa o alfa da prévia (meia resolução).
- Vários objetos separados no mesmo clipe (hoje um objeto por efeito; dá para pôr o clipe duas vezes).
