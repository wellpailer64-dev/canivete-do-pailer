# Receitas de efeitos de referência (reels TEVEO e Yerba Madre) — 2026-11-16

Origem: Pailer mandou dois reels de referência (Pinterest) para "aprender" os efeitos antes da edição do Thiago Frog.
Cada receita = cena HTML (`exemplos/receitas/*.html`) montada como **camadas nativas** pelo `tools/motion_html.py`
(imagem, texto, forma + quadros-chave editáveis). Testadas no app de teste (porta 9333), exportadas pela placa e conferidas em quadros.
Para usar na timeline do projeto aberto: `py -3.13 tools/agente/comp_html.py cena.html --nome "X (Comp)" --fonte PASTA` (vira Comp).

| # | Efeito | Receita | Estado |
|---|---|---|---|
| 1 | Colagem de papel rasgado (Yerba Madre 6,3–7 s e 9,8–10,5 s) | `tools/agente/receita_rasgo.py` + `rasgo_papel.py` | testada, ok |
| 2 | Tarja de cidade/local (TEVEO) | `exemplos/receitas/tarja_cidade.html` | testada, ok |
| 3 | Tela dividida / janelas (TEVEO 9, 20, 22 s) | `exemplos/receitas/tela_dividida.html` | testada, ok |
| 4 | Transição com logo gigante desfocado (TEVEO 19 s) | `exemplos/receitas/transicao_logo.html` | mecânica ok com imagem de teste; falta rodar com o logo real (PNG transparente) |
| 5 | Número de capítulo gigante itálico (TEVEO 0–2 s) | `exemplos/receitas/numero_capitulo.html` | testada, ok |
| 6 | Flash / vazamento de luz no fim (TEVEO 30 s) | nativo: `veOvtAdd('flash'\|'leak'\|'flare', tempoDoCorte, {d: 0.5})` | função confirmada no app; efeito não conferido por mim |
| 7 | Legenda falada amarela por palavra (Yerba Madre) | painel Texto/legendas nativo + `legenda-criativa.md` | não testada aqui |

## 1. Colagem de papel rasgado
- Gerar: `py -3.13 tools/agente/receita_rasgo.py --saida PASTA --fotos a.jpg b.jpg c.jpg d.jpg e.jpg --layout v3 --trocas 2 --montar --porta 9333`
- Layouts: `v2`, `v3` (faixas verticais), `h2`, `h3` (horizontais), `mix` (1 vertical + 2 empilhadas). As primeiras N fotos são as faixas
  (N do layout); as demais viram as trocas (corte seco a cada `--intervalo` 0,1 s, a borda rasgada não muda na troca).
- Faixa avulsa: `rasgo_papel.py faixa foto.jpg --larg 540 --alt 1920 --lados esq,dir --saida f.png`. Cada PNG já leva borda branca com
  fibra, franja solta e sombra (28 px de margem em volta).
- Entrada: cada faixa vem de fora do quadro (a do meio de cima/baixo), 0,32 s, curva expo, 0,10 s entre elas.
- Vídeo no lugar de foto: gerar a faixa com um quadro e trocar pela camada de vídeo com a mesma máscara (ainda não feito).
- Limites: seed fixa por faixa (mesma borda); pouca variedade de formato (retângulos); sem animação da "rasgada abrindo" quadro a quadro.

## 2. Tarja de cidade
- Caixa translúcida = **cor lisa + `opacity`**, não `rgba`: `rgba` vira PNG fotografado no 1º quadro e `clip-path` animado faz a caixa sumir.
  Cresce por `scaleX(0→1)` com `transform-origin:left`. Texto em camada própria, sobe com fade (Montserrat 700, 44 px, tracking 7 px).
- Trocar texto (`#tarja`), posição (`left/top`) e atrasos (`animation-delay`) por clipe. Sai com fade em 0,2 s.

## 3. Tela dividida
- Janela = `div` com `overflow:hidden` (vira máscara "Recorte"), `img` 100%/`object-fit:cover` dentro; a foto desliza de fora (translateX/Y)
  em 0,4 s, escalonada 0,12 s. **Não** animar `clip-path` em `img` nem em pai com `img` (0 quadros-chave).
- Arranjos: mudar `left/top/width/height` das 3 janelas (ver ref: grande embaixo + menor em cima à direita).

## 4. Transição com logo
- 0,7 s; fundo na cor da marca sobe a 92 % no corte (0,35 s) e o logo cruza a tela girando com blur 34 → 10 → 34 px.
- Usar como Comp acima do corte entre dois clipes (comp_html.py com `--alvo` ausente: entra na agulha). Pico com whoosh (`efeitos-sonoros-video.md`).
- Falta: rodar com o logo real; conferir se o blur animado tem o mesmo peso quando exportado dentro da timeline do projeto.

## 5. Número de capítulo
- Montserrat 800 itálico 620 px, entra com `scale(1.7)→1` e retorno (back), sai com scale .9 + fade; fundo com zoom lento de 6 %.

## 6. Flash e luz
- Sobreposição nativa (camada de ajuste no corte): `veOvtAdd('flash', t, {d:0.5})`; também `leak` (vazamento) e `flare`. Alinhar ao beat.

## Pegadinhas do motion_html descobertas aqui
- `rgba` em caixa → imagem do 1º quadro (animação interna some).
- `clip-path` animado só vale em caixa de cor lisa (teste3); em imagem ou pai de imagem não gera quadros-chave.
- A exportação pelo app de teste às vezes derruba a página depois do arquivo pronto (vigia de memória do WebView): o MP4 já está salvo;
  o erro `TargetClosedError` aparece em seguida. Conferir o arquivo antes de repetir.
- Python do Windows não entende `/d/...` do bash: usar `D:/...`.
