# Direção de arte e motion para o AutoFrame e as edições do Pocket Editor
Estudo aplicado (2026-10-01). Cada princípio vira uma receita com os recursos que o motor TEM, em números
(px num quadro 1080×1920, quadros a 30 fps, batidas da música). No fim: o que falta no motor e a ordem de construir.

---

## 0. Diagnóstico do que geramos hoje
| Área | Hoje | Problema |
|---|---|---|
| Movimento | Ken Burns/soco/pan com `out` e `lin` | curvas genéricas, sem antecipação nem *overshoot*; tudo se move ao mesmo tempo; nada "assenta" |
| Composição | logo e texto centralizados, logo no canto a 56 px | ignora a área que a interface do Reels cobre; texto a 64% da altura cai perto da legenda do app |
| Cor | 1 look (camada de ajuste) para o vídeo todo | fotos de celulares diferentes ficam com brilho/temperatura diferentes; o look não "respira" com a música |
| Contraste | selo na cor principal (fixo) | não mede contraste: um cliente com principal clara gera texto ilegível |
| Textura | nenhuma | imagem "digital limpa", sem acabamento |
| Energia | ritmo varia pela energia da música | intro, corpo e fim têm a mesma intensidade de efeito; não há clímax nem respiro |

---

## 1. Composição (onde as coisas ficam)

### 1.1 Área segura do 9:16 (Reels/TikTok/Shorts)
A interface cobre partes do vídeo. Margens conservadoras (cobrem os três apps):
- **topo 220 px** (nome da conta, seguir)
- **base 420 px** (legenda, áudio, botões)
- **laterais 70 px**; à **direita, 160 px** entre y 900 e 1700 (curtir/comentar/compartilhar)

Área útil para texto e logo: **x 70–920, y 220–1500**. O centro ótico fica um pouco ACIMA do centro geométrico:
título principal em **y ≈ 760–860**, nunca abaixo de y 1500.
Fotos e fundos podem (devem) ocupar o quadro inteiro; só informação fica dentro da área útil.

### 1.2 Hierarquia: um foco por vez
- Em cada momento, **um elemento dominante** (o maior, o mais contrastado ou o que se move). Os outros recuam
  (menor, mais escuro, com menos opacidade ou parado).
- Escala de tamanhos com razão ~1,6: título 120 px → subtítulo 72 → apoio 44. Nunca dois textos do mesmo tamanho
  competindo.
- Ordem de leitura de cima para baixo: logo/marca → mensagem → chamada.

### 1.3 Grade e respiro
- Grade de **8 px**; margens internas múltiplas de 8 (24, 32, 48, 64).
- Elementos alinhados a uma de **3 colunas** (x 70 / 540 / 1010) ou ao centro. Nada "solto" a 400 px.
- Respiro ≥ 48 px entre blocos. Texto em selo: *padding* = 0,4 × altura da letra.

### 1.4 Fotos de pessoas
- **Altura da cabeça**: o topo da cabeça a 8–15% do quadro ("headroom"); olhos perto do terço superior (y ≈ 640).
- **Espaço para onde a pessoa olha/aponta** (a placa "PASSEI"): deslocar o enquadramento para o lado livre.
- Nunca cortar nas articulações (pescoço, cotovelo, joelho). Já protegemos cabeça→peito (caixa dos rostos).

---

## 2. Motion de alto nível

### 2.1 Curvas (o que mais separa "amador" de "profissional")
O motor aceita Bézier livre em cada quadro-chave (`i: 'bez', b: [x1, y1, x2, y2]`; y pode passar de 1 = *overshoot*).
Biblioteca recomendada:

| Nome | Bézier | Uso |
|---|---|---|
| `entra` (expo out) | `[0.16, 1, 0.3, 1]` | tudo que ENTRA: rápido no começo, assenta macio |
| `sai` (expo in) | `[0.7, 0, 0.84, 0]` | tudo que SAI: acelera para fora |
| `troca` (in-out forte) | `[0.87, 0, 0.13, 1]` | mudar de posição dentro da tela, *whip* |
| `mola` (back out) | `[0.34, 1.56, 0.64, 1]` | logo, selos, cards: passa 5–10% do alvo e volta |
| `suave` | `[0.45, 0, 0.55, 1]` | Ken Burns, deriva lenta |

Regra: **entrada com `entra` ou `mola`, saída com `sai`, deriva com `suave`.** `lin` só para deriva contínua muito longa.

### 2.2 Tempo (30 fps)
| Ação | Duração |
|---|---|
| micro (pulso, piscada) | 4–6 quadros |
| entrada de texto/selo/card | 8–12 quadros |
| entrada de elemento grande (logo, foto cheia) | 12–18 quadros |
| saída | **70% da entrada** (sai mais rápido do que entra) |
| transição entre cenas | 8–14 quadros (0,27–0,45 s) |

Na música: o **pico** de um movimento cai NA batida. Começa 2–4 quadros antes (antecipação), para o impacto
coincidir com o ataque do bumbo. Compasso forte (o "1") = movimento grande; batidas 2–4 = micro.

### 2.3 Os princípios que mais rendem
1. **Antecipação**: antes de crescer, encolhe 3–5% por 3 quadros (escala 100 → 96 → 110 → 100).
2. ***Overshoot* e assentamento**: chega a 106–110% e volta (curva `mola`), nunca para seco.
3. **Escalonar (stagger)**: elementos de um grupo entram com 2–4 quadros de diferença (cards, palavras, formas).
   Nunca tudo no mesmo quadro.
4. **Sobreposição**: o próximo elemento começa antes do anterior terminar (~30% de sobreposição).
5. **Arcos**: o que se move em x e y ao mesmo tempo anda em curva (x com `troca`, y com `entra`).
6. **Continuidade de direção**: se a cena sai para a esquerda, a próxima entra vindo da direita (o olho segue o
   vetor). Push/slide/chicote alternam direção por compasso, não aleatoriamente.
7. **Velocidade casada nos cortes**: um movimento rápido no fim da cena A pede um movimento rápido no começo da B
   (o chicote já faz isso; o zoom-soco também).
8. **Hierarquia de movimento**: só UMA coisa grande se move por vez; o resto respira (deriva lenta ou parado).

### 2.4 Arco de energia do vídeo inteiro
```
energia ▲      ┌─clímax (drop/refrão)─┐
        │ intro│                       │  respiro   fim
        │ ▄▄▄▄ │  ▂▂▄▄▆▆██████▆▆▄▄▂▂   │  ▂▂▂▂    ▄▄▆
        └──────┴───────────────────────┴──────────────► tempo
```
- Intro: **gancho nos 1,5 s iniciais** (o algoritmo decide aí): movimento forte já no 1º quadro, não fundo parado.
- Corpo: a intensidade dos efeitos acompanha a energia da música (camada de ajuste com opacidade animada, §4.3).
- Clímax: cortes de 1 batida, flash, soco de 22%, P&B de 2 quadros nos acentos.
- Respiro antes do fim: 1–2 cenas mais longas e calmas, para o encerramento ter impacto.

---

## 3. Direção de arte

### 3.1 Cor: 60–30–10
- **60%** neutro/fotos (o conteúdo), **30%** cor principal (fundos, selos), **10%** destaque (só o que precisa
  de atenção: uma palavra, um traço, o clarão). Hoje o círculo amarelo de destaque ocupa ~50% da intro: inverter
  (fundo principal, destaque só em detalhes).
- Derivar da paleta: **escuro** = principal × 0,35 de luminância (sombras, selos sobre fundo claro),
  **claro** = principal com 85% de branco (fundos de respiro).

### 3.2 Contraste de valor (luminância) antes de matiz
- Texto: contraste **≥ 4,5:1** (WCAG) entre texto e o que está atrás; título grande ≥ 3:1.
  Calcular (luminância relativa) e escolher automaticamente branco ou o "escuro" da paleta.
- Azul sobre amarelo funciona pelo VALOR (escuro × claro), não pela cor. Amarelo sobre branco não funciona nunca.
- Elementos sobre foto: sempre com apoio (selo, sombra difusa de 20–30 px a 40%, ou faixa escura com 60%).

### 3.3 Tipografia
- No máximo 2 famílias (título + apoio). Título em peso forte (Bold/Black), apoio Regular/Medium.
- CAIXA ALTA só em títulos curtos (≤ 3 palavras), com espaçamento entre letras +2 a +5%.
- Uma palavra-chave por frase em destaque (cor de destaque ou peso maior), como na legenda da Helo.

### 3.4 Sistema visual do cliente (consistência)
Cada cliente tem um "kit": 1 forma recorrente (círculo, barra, cantos arredondados), espessura de traço, raio de
canto, a mesma direção de movimento das formas, os mesmos sons (já fazemos com o hash do cliente). Repetição
= marca. Variar a composição, nunca o sistema.

### 3.5 Textura e acabamento
- **Grão** 2–4% (overlay/soft light) em tudo: une fotos de câmeras diferentes e tira o "digital".
- **Vinheta** leve (−10 a −15) para levar o olho ao centro.
- **Luz vazando** (*light leak*): gradiente quente em *screen*, 15–25%, atravessando em 1–2 s nas transições calmas.
- Usar com intenção: textura forte só no clímax ou em estilo "filme".

---

## 4. Cor e camadas de ajuste (o que o motor já faz e quase não usamos)

### 4.1 Normalizar antes do look
Fotos de celulares diferentes: 1º igualar (exposição e temperatura por foto, usando `expo` e a média de cor da
análise), depois aplicar o look único por cima. Receita por clipe: `lc.exp = (0.5 − brilho_medio) × 1.2` (limitado
a ±0.6), `lc.temp` puxando a média para neutro (±15).

### 4.2 Looks por energia
Calmo: `fade 12, sat 92, ct −5`. Médio: o look do estilo. Alto: `ct +18, sat 115, vig −20`.

### 4.3 Efeito animado = camada de ajuste com opacidade animada
A opacidade da camada de ajuste dosa a FORÇA do efeito (só posição/escala/rotação/opacidade animam no motor; isso
contorna o limite). Receitas:
| Efeito | Camada de ajuste | Opacidade |
|---|---|---|
| clarão de exposição no drop | `lc.exp +1.5` | 100 → 0 em 8 quadros (`sai`) |
| P&B no acento | `lc.sat 0, ct +25` | 100 por 2–3 quadros, corta |
| desfoque de transição (falso motion blur) | `blur 18` | 0 → 100 → 0 em 6 quadros centrados no corte |
| pulsar com o bumbo | `lc.exp +0.25, vig −25` | 0→100→0 em 6 quadros a cada "1" do compasso |
| respiro | `lc.fade 25, sat 80` | sobe devagar nas cenas calmas |

### 4.4 Modos de mesclagem (já exportam)
- `screen`: luz, vazamento, clarões, partículas claras (preto vira transparente).
- `multiply`: sombras, texturas de papel, escurecer bordas (branco vira transparente).
- `overlay`/`softlight`: grão, textura sutil, dar "punch".
- `add`: brilhos intensos (usar pouco).

---

## 5. Repertório de efeitos criativos (receitas montáveis com o que temos)
1. **Cortina de forma (shape wipe)**: retângulo na cor principal atravessa a tela em 10 quadros (`troca`), o
   corte acontece quando ele cobre 100%; um 2º na cor de destaque segue 3 quadros depois (escalonado).
2. **Máscara de círculo (iris)**: círculo cresce de 0 a cobrir o quadro (`entra`), a cena nova entra no meio.
3. **Pessoa destacada (pop-out)**: com o recorte do Remover fundo, a pessoa (PNG) por cima de: a mesma foto
   desfocada + cor principal em `multiply`; pessoa entra 4 quadros depois do fundo, com `mola`. Texto pode ficar
   ATRÁS da pessoa (texto entre o fundo e o recorte).
4. **Moldura de foto (polaroid/card)**: retângulo branco 104% atrás da foto + sombra (retângulo preto desfocado,
   40%, deslocado 12 px); entra girado ±6° com `mola`.
5. **Carrossel / colagem**: 3 fotos em cards escalonados, a do meio maior (hierarquia), o conjunto desliza em y
   com `suave`.
6. **Contagem/números**: "+40 anos", "128 aprovados" com texto `decodificar` ou máquina de escrever, na batida.
7. **Kinetic type**: palavras entram uma por batida (`subir`/`pop`), a palavra-chave na cor de destaque e maior.
8. **Zoom transition**: cena A dá zoom 120% com `sai` nos últimos 6 quadros + desfoque animado (§4.3) e a B
   começa em 120% voltando a 100% com `entra` (o "smooth zoom" dos editores de reels).
9. **Split com respiro**: telas divididas com 16 px de calha na cor de fundo e cantos arredondados (6%), entrando
   escalonadas.
10. **Match cut por cor/forma**: ordenar fotos para que cor dominante ou posição da pessoa continuem entre cortes
    (a análise já tem foco e cor; dá para pontuar pares).

---

## 6. O que falta no motor (por impacto)
| # | Recurso | Por quê | Esforço |
|---|---|---|---|
| 1 | Biblioteca de curvas (§2.1) e escalonamento nos geradores | maior salto de qualidade percebida | pequeno (só JS dos geradores) |
| 2 | Área segura + contraste automático (§1.1, §3.2) | legibilidade em qualquer cliente | pequeno |
| 3 | Efeitos animados por camada de ajuste (§4.3) | clarão, P&B, motion blur, pulsar | pequeno/médio |
| 4 | Normalização de cor por foto (§4.1) | consistência das fotos | médio (análise + JS) |
| 5 | Textura: grão e vazamento de luz gerados (PNG/vídeo curto, `overlay`/`screen`) | acabamento | médio |
| 6 | Cortinas de forma e íris como transições do AutoFrame (§5.1–5.2) | identidade da marca nas transições | médio |
| 7 | Pessoa destacada com o Remover fundo (§5.3) | efeito "premium", texto atrás da pessoa | médio/alto (tempo de IA) |
| 8 | Moldura/sombra em cards (§5.4) | cards com profundidade | pequeno |
| 9 | Parâmetros de efeito animáveis no motor (blur, exposição por quadro-chave) | substitui gambiarras de §4.3 | alto (prévia + exportação) |

## 7. Plano proposto
- **Fase 1, polimento:** itens 1, 2, 3 e 8 aplicados à intro, ao encerramento e às transições do AutoFrame.
  FEITA (2026-10-01): curvas `VE_AF_CURVA`/`veAfK` e `veAfAjuste` em editor-autoframe.js; contraste `veAfcSelo`, área
  segura e cards com moldura/sombra em editor-autoframe-cliente.js. Exportação 60 → 93 s no teste do Carlinhos (pulsos).
- **Fase 2, acabamento:** itens 4 e 5, mais looks por energia (§4.2) e o arco de energia (§2.4).
- **Fase 3, assinatura:** itens 6 e 7 como opções do modelo de cliente ("transição da marca", "pessoa destacada").
- **Fase 4, motor:** item 9, se as receitas da Fase 1 ficarem limitadas.

Validação de cada fase: exportar o MP4 com as fotos reais do Carlinhos e comparar quadro a quadro (folha de
contato) com a versão anterior. Registrar a nota do usuário em CALIBRACAO de `guia-edicao.md`.

Fontes das áreas seguras: hopperhq.com/blog/instagram-reel-size, outfy.com/blog/instagram-safe-zone,
zeely.ai/blog/master-instagram-safe-zones (2026; adotada a margem mais conservadora entre elas).
