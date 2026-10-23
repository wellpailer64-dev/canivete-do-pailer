# Rastreador de movimento (Tracker do After Effects) — FEITO v1 (2026-10-23)

## Como usar
Botão direito no clipe de vídeo › **Rastrear movimento…** (ou Efeitos › Transformar › Rastreador de movimento ›
"Rastrear no monitor"). Barra sobre o monitor: ◀◀ / ◀ / ▶ / ▶▶ (rastrear para trás/frente até a ponta do clipe ou 1
quadro), ■ parar (Esc), Rastrear: Posição | Posição e giro | Posição, giro e escala, **Aplicar a**: Nulo novo ou um
clipe que passa pelo trecho, Limpar, ✓ (Esc). Caixa: arrastar move; canto muda o tamanho (Shift = quadrado); clicar
fora leva a caixa até lá. Mover a caixa num quadro recomeça dali; rastrear refaz só o que está na direção.
Caminho na tela (±2 s), pontos de pouca certeza em vermelho. "Aplicar a" deixa o alvo onde está no quadro da agulha e
grava quadros-chave x/y (+ rot/sc) reduzidos (Douglas-Peucker 0,05 px). Com um Nulo, use a Camada mãe para prender
outras camadas.

## Código
- `Functions/rastreador.py` `rastrear(path, t0, t1, caixa, modo, taxa, on_quadro, stop)`: cinza ≤ 1920 px; LK quadro a
  quadro (ida e volta) + **ancorado no quadro de referência** (pontos da referência direto no atual a partir da
  estimativa; 3 quadros sem casar = nova referência); sem pontos, modelo (matchTemplate subpixel); para trás lê blocos de
  48 quadros e devolve ao contrário. Itens [t, x, y, escala, giro°, conf] em px/tempo da MÍDIA.
- `frontend/js/editor-rastro.js`: `VE_FX.rastro` (guarda `f.v.rt = {cx, cy, w, h, tb, pts}`; neutro), barra, overlay
  (`veRtOverlay`, chamado por `veTfDesenhar`), arrastar a caixa (captura na janela), `veRtAplicar`, menu de contexto.
  Clipe achado pelo `uid` (desfazer troca os objetos). API `VERT_API` (abrir, caixa, rastrear, rodando, dados, aplicar, fechar).
- main.py: `ve_rastrear` (eventos `veOnRastro` em lotes de 3) / `ve_rastro_parar`.
- Exportação: camada com posição animada agora entra em overlay 4:4:4 e arredondada (antes 4:2:0 = degrau de 2 px
  truncado): `video_cutter.py`, ramo `elif "x" in kf or "y" in kf`.

## Medidas
- Gabarito (quadro parado + tremor conhecido + ruído, `tools/rastreador/bancada.py`): erro médio 0,04–0,4 px; ~30 ms
  por quadro 1080p. No app (`testes/teste_rastro.py [--placa] [--porta 9341]`): caminho 0,07 px, Nulo 0,15 px, para
  trás 0,05 px, 240 quadros em ~9 s; arquivo exportado: CPU 0,58 px médio, placa 0,69 px.

## Pendências
1. Subpixel na exportação (CPU e placa posicionam em pixel inteiro: ≤ 0,5 px) — prévia é subpixel.
2. Planar / quatro cantos (corner pin) para trocar tela de celular/placa: homografia dos pontos + efeito Perspectiva.
3. Lupa ampliada ao arrastar a caixa; caixa de busca ajustável; rastrear por SAM 2 (objeto inteiro) do Pincel Roto.
4. Estabilizar pelo rastro (ponto escolhido) e rastrear máscara (Premiere).
