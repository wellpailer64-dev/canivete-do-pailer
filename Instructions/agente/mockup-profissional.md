# Mockup profissional — o que os PSDs dos estúdios fazem (estudo 2026-10-15)

5 mockups dissecados camada por camada em `D:/kanivete_biblioteca/mockups/estudo/<nº>/dissecado/`
(`arvore.txt`, `ficha.json` com efeitos/ajustes/máscaras, `camadas/NNN.png`, `folha_camadas.jpg`; prévias juntas em
`folha_previas.jpg`). Dissecador: `D:/kanivete_testes/scripts/dissecar_psd.py arquivo.psd` (psd_tools).

| nº | mockup | camadas | técnica que ensina |
|---|---|---|---|
| 01 | outdoor city light (noite) | 15 | mapas de luz/sombra + brilho do pôster no ambiente |
| 02 | gift cards caindo | 23 | mapas Luzes/Sombras/Contraste + sombra recolorível + spot light |
| 03 | cartão de luxo (hot stamping) | 67 | metalizado: preenchimento 0% com efeitos + textura recortada |
| 04 | cartão na pedra (foto) | 3 | arte em Multiplicar + chanfro de 1 px = tinta impressa |
| 05 | garrafas (embalagem) | 24 | base neutra + cor por parte + arte deformada + mapas |

## 1. A pilha padrão (de baixo para cima) — vale para qualquer objeto

1. **Fundo**: cor sólida (recolorível) ou foto; às vezes um vetor de enfeite (05: faixas da marca).
2. **Sombra no chão** separada do objeto, em 2 camadas: Multiplicar 70% + Sobrepor 100% (05). Melhor ainda: a sombra é a
   MÁSCARA de uma camada de cor sólida (02 "Isolated Shadows", cinza-azulado #54 54 58 em Multiplicar + outra em
   Subexposição de cor) → muda a cor da sombra junto com o fundo. Nunca preto puro.
3. **Objeto base**: render NEUTRO (branco/cinza) do objeto, sem cor nem arte (05 "Base Image").
4. **Cor por parte**: uma camada de cor sólida por parte (tampa, corpo, fundo), cada uma com a máscara da parte (05
   "Change Color › Cap/Body/Bottom"). Trocar a cor = clicar na amostra.
5. **Arte**: objeto inteligente onde o cliente dá duplo clique ("Place your design here"), já DEFORMADO para a forma
   (perspectiva, curvatura da garrafa) e com a máscara da área do rótulo. Os do estúdio "Mockup Baker" guardam a arte
   plana (Design.psb) e um alvo deformado separado (Target, "result.png").
6. **Mapas de luz** POR CIMA da arte (é isso que faz a arte parecer impressa no objeto e não colada):
   - **Sombras / Darks**: imagem branca com o sombreado do objeto, em **Multiplicar** (05 "Shadow", 02 "Darks").
     Na noite (01) em **Subexposição linear** (escurece mais).
   - **Luzes / Lights**: imagem preta com os brilhos/reflexos, em **Tela** (05 "Highlight", 02/01 "Lights").
   - **Contraste**: cinza claro em **Subexposição de cor** (02 "Contrast") — dá corpo às bordas.
   Os três saem do MESMO render 3D (passes de difusa, especular e oclusão).
7. **Acabamento global**: luz de spot = degradê radial branco em **Luz suave** (02 "Spot Light"); vinheta em
   Subexposição linear 15% (03); sombra de janela/folhagem em Multiplicar (03 "Shadow Overlay"); Brilho/Contraste leve
   (+4). Brilho do pôster no ambiente: cópia da arte a 20% embaçada atrás (01 "Poster Glow").

## 2. Receitas de acabamento (números reais)

- **Tinta impressa em papel/foto (04)**: arte em **Multiplicar** (pega textura e a luz da foto) + **Chanfro 1 px,
  profundidade 53%** (borda de tinta). Cor da arte trocada por **cor sólida recortada** na arte.
- **Hot stamping / metalizado (03)**, por elemento:
  - camada "Effect" = a arte com **preenchimento 0%** e só os efeitos: Sombra projetada branca 5% (dist 2, tam 2, 128°),
    Sombra projetada cinza 5% (dist 5, tam 5, −63°), **Sombra interna** cinza 32% (dist 5, tam 5, ruído 11%),
    **Chanfro** tam 2, prof 10% → o relevo afundado;
  - "Texture" (foto de metal granulado cobre/dourado) **recortada** na Effect → o metal só aparece no desenho;
  - por baixo, a arte com **Sobreposição de degradê** 40% (−60°) + **Chanfro** tam 10, prof 20% (volume do metal).
- **Papel**: o cartão é um pixel com textura própria (fibra) e a sombra de contato é uma camada própria por cartão.

## 3. Regras que tiram o "cara de montagem"

- Arte sempre ABAIXO dos mapas de luz/sombra (nunca por cima de tudo).
- Sombra = cor escura da cena, nunca #000; duas sombras (contato curta e escura + difusa longa e clara).
- Brilho especular atravessa a arte (reflexo da garrafa passa por cima do logo).
- Borda do objeto com um fio de luz/sombra (02 Contraste) — sem ela parece recortado.
- Recolorível: fundo, partes e sombras como camadas de cor sólida com máscara.
- Um ajuste global leve unifica tudo (Brilho/Contraste, vinheta).

## 4. Como fazer no Kanivete

- **Photo Kanivete** já tem: objeto inteligente, máscaras, recorte, preenchimento, Multiplicar/Tela/Luz suave/
  Subexposição de cor/linear, Chanfro, Sombra interna, Sobreposição de degradê, Deformar/Perspectiva.
- **Mapas a partir do 3D** (etapa 2 da missão): renderizar o produto no Blender (`render_blender`) em passes —
  base neutra, sombras (difusa/oclusão, fundo branco → Multiplicar), luzes (especular, fundo preto → Tela), máscara
  por parte e a UV/deformação do rótulo — e montar a pilha da §1 no Photo. Assim o mockup é NOSSO (sem licença de
  terceiros) e o mesmo produto serve para foto, mockup e vídeo 3D.
- Licença: os PSDs baixados são para estudo; peças finais usam mockups gerados por nós ou de licença comercial.

## 5. Produto 3D próprio (etapa 2, 2026-10-15)

Dois caminhos, um para cada uso:
- **Pilha editável (mockup rápido)** — `tools/mockup3d.py` + `Functions/blender_mockup.py`: render em passes (2×) →
  base neutra, máscara por parte, sombra de contato (oclusão do chão perto do produto), Sombras/Multiplicar,
  Brilhos/Tela, Contraste, e a arte colada pelo UV (proporção real da superfície, frente virada para a câmera).
  ~90 s render + 5 s montagem. Bom para trocar cor/arte; fica com cara de "plástico de catálogo".
- **Foto herói (qualidade de agência)** — `Functions/blender_estudio.py` (spec JSON): TUDO no 3D. Diferenças que
  deram o salto (comparado com os renders do case Herbíssimo):
  1. material de verdade: soft-touch (rug. 0,5 + verniz 0,15), gel (transmissão + absorção de volume + ~260 bolhas
     de ar IOR 1/1,42), tampa com ranhuras por relevo; 2. rótulo = película 0,004 acima do corpo com a arte em
     textura (nítida); 3. chanfro em todas as quinas do perfil (`arredondar`); 4. ciclorama na cor da marca (rebate de
     cor no produto); 5. softboxes compridos (chave/recorte) + teto + HDRI de estúdio (Poly Haven CC0,
     `D:/kanivete_biblioteca/hdri`); 6. **cor "Khronos PBR Neutral"** (AgX deixava o verde de marca pastel);
     7. adaptativo 0,004 + OIDN "accurate" (sem ondas no fundo); 8. câmera com dutch (roll) e desfoque (fstop).
  1400 px / 320 amostras na RTX 3050: pote 44 s, bastão em gel 53 s. Saídas em `D:/kanivete_testes/estudio`.
  Pendências: gel menos "suco" (absorção mais fraca/teal e fundo menos saturado perto), texto branco sobre gel
  claro precisa de contraste, pretos mais fundos (bandeira preta/rim), biblioteca de cenas (flutuando, repetição em
  fileira, macro), modelos importados (.glb) com rótulo, painel manual + comando do agente.
