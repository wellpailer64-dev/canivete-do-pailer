# Direção de logotipo — como os grandes fazem (estudo de 2026-10-16)

Ler ANTES de desenhar qualquer logo. Nasceu da recusa do Pailer ao 1º logo da sereno ("você realmente acha que isso é
aceitável?"): gota feita de círculo + triângulo, joelhos onde reta encontra curva, traço engordando na ponta, miolo que
não acompanhava a casca. Construção de amador. Abaixo, o que os mestres dizem e como aplicamos no código.

## 1. Princípios (o que faz um logo funcionar)
- **Apropriado, distinto, memorável, simples** (Sagi Haviv, Chermayeff & Geismar & Haviv). Tensão central: forma simples,
  mas incomum o bastante para "fisgar" — às vezes até um pouco estranha. Teste do rabisco: alguém desenha de memória?
- **Símbolo só com motivo** (Haviv): nome longo, várias submarcas ou precisão de atalho visual. Sem motivo, o NOME é a
  identidade → logotipo (wordmark) bem desenhado.
- **O logo identifica, não explica** (Paul Rand). O significado vem da marca com o tempo. Simplicidade é consequência de
  uma boa ideia, não o objetivo. Rand usou um "e" minúsculo no NeXT só para mudar o ritmo: UM detalhe proprietário basta.
- **Ideia antes do vetor**: lápis/rascunho, várias direções em preto e branco, julgar pelo que FUNCIONA, não pelo gosto.
- **Apresentar aplicado** (Haviv: "presentation is everything"): embalagem, fachada, anúncio, ícone de 16 px.
- **Clichês da categoria** contam como "não distinto": gota em marca de água/cosmético, folha em natural, sol em
  verão. Se usar, precisa de um giro próprio ou de execução impecável.
- Referência da categoria: Wild (Johnson Banks) manteve o logo "esquisitinho" e só aparou as estranhezas; trocou a
  fonte de apoio por uma que conversasse com ele (Gelica); voz brincalhona; nome que vira adjetivo/verbo. Native,
  Frank+Bare, Sundra Hill: logo limpo + uma cor por aroma.

## 2. Construção (regras de desenhista de letra)
- **Pontos nos extremos** (topo, base, esquerda, direita) de cada curva; **alças horizontais/verticais** nesses pontos
  (Jessica Hische, scannerlicker, RoboFont). Inclinou o desenho? Desenhe reto e gire o conjunto.
- **Nada de joelho**: onde duas partes se encontram sem ser uma quina de propósito, a tangente é a mesma (G1) e,
  entre curvas, a curvatura também (G2: transição invisível). Reta encostando em arco = quina de curvatura (vê-se
  como "dobra"). Ponta de gota = uma curva que afina (cúbica/spline), não triângulo colado.
- **Alças equilibradas** na mesma curva (sem uma muito longa e a outra curtinha) e nunca cruzadas; poucos pontos.
- **Traço que parece uniforme ≠ traço matemático**: horizontais um pouco mais finas que verticais; curvas passam
  levemente da linha (overshoot ~1–3% da altura-x) para parecerem do mesmo tamanho; miolo acompanha a casca
  (paralelo) — por exemplo, numa gota, a ponta de dentro é recuada pela espessura dividida pelo seno do meio-ângulo.
- **Teste de redução**: 16, 24, 48 px; se embolar, abrir junções (ink traps) ou aliviar o peso.
- **Conferir a curvatura com o pente** (`tools/contorno.py`): mostra joelhos (tangente que pula), saltos de
  curvatura e pontos fora dos extremos, e desenha o pente para eu olhar uma imagem só.

## 3. Processo barato e de qualidade (como fazemos aqui)
1. Conceito: 2–3 direções em palavras, cada uma com o PORQUÊ ligado à marca (ex.: a palavra-sistema).
2. Desenho em código com construção correta (`tools/logotipo.py`: fonte livre de base + peça desenhada em Bézier).
3. `tools/contorno.py` sem joelho nem salto antes de qualquer olhada.
4. Prancha de direções: preto e branco grande, 16–48 px, cor, e 2 aplicações (embalagem + ícone). Uma imagem só.
5. O Pailer escolhe; só então manual, rótulos e fotos.

## 4. Erros já cometidos (não repetir)
- sereno v1 (Fraunces macia): "tipografia torta" — fonte display cheia de quirk (barra do e inclinada, s tombado) para
  marca que pede calma. Escolher a base pela PERSONALIDADE da marca, comparando 8–10 fontes na mesma altura-x.
- sereno v2 (gota = elipse + triângulo + miolo da fonte): joelhos, traço engordando na ponta, miolo sem acompanhar.
  Certo: `gota_bez` (base em meia elipse, lados em cúbica com a curvatura da elipse na emenda) + miolo = casca
  deslocada para dentro (`deslocar`), horizontais levemente mais finas. Miolo como "gota menor" vira lâmpada.
- Girar a peça tira os pontos dos extremos: no arquivo final, acrescentar âncoras nos extremos.
