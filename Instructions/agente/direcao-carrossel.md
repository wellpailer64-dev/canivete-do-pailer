# Direção de arte de carrossel (para IAs) — o que separa peça boa de "landing page genérica"

Origem: feedback de 2026-10-06 (outros agentes fizeram carrossel genérico: vetor tapando buraco, texto sem hierarquia,
sem humanização, sem interação entre páginas, sem seguir o roteiro) + 13 referências que o usuário aprovou
(Jhonatan Lopes/"defender design", Bynet, William Rosa/ansiedade, Spider Man/Peter Parker, Igor Vilela).
Imagens das referências: `D:\kanivete_biblioteca\referencias\carrossel\`.
Conferência automática: `KNV.revisarDirecao` (roda dentro do `tools/revisor.py` e do `knv.py --revisar`).

## 1. Regras que TODAS as referências seguem
1. **Uma ideia por slide, três níveis de texto, nunca mais**:
   - **Gancho**: condensada/grotesca pesada, caixa alta ou bold, 2–4 linhas, 110–170px no 1080, ocupando 45–60% da
     largura. Uma ou duas palavras na cor de destaque ("NÃO ERA sobre meu gosto", "Sabe DEFENDER o seu design?").
   - **Subtítulo/apoio**: 30–44px, regular, logo colado ao gancho (respiro pequeno: pertence a ele).
   - **Corpo**: 26–34px, blocos de 1–2 frases separados por linha em branco, alinhado à esquerda, 35–50% da largura,
     **negrito nas palavras-chave**. Até ~40 palavras por slide.
   - Proporção gancho : corpo ≈ 3–5× (o revisor reprova abaixo de 2×).
2. **Paleta de 2 + 1**: neutro escuro OU claro + UMA cor de destaque (vermelho, verde, rosa, laranja). A cor de destaque
   só aparece em: palavra do gancho, marcação do corpo, objeto principal e CTA. Foto em P&B com uma peça colorida
   (camisa verde) é a mesma regra aplicada à imagem.
3. **Objeto-herói grande, realista e com metáfora**: polvo (organização/tentáculos), astronauta (defender/explorar),
   logo do Figma em pelúcia, ampulheta com moedas (tempo = dinheiro), máscara do Homem-Aranha, monge (aceitação), rato
   (medo). Nunca ícone chapado genérico. Ocupa 35–60% do slide e **sangra a borda** (corta na borda da página, não no
   meio do nada).
4. **Interação objeto × texto** (o que faz parecer "direção" e não "colagem"):
   - objeto passa **por trás** de parte do título (monge cobrindo letras de "espere"; Peter Parker com o título sobre a
     cabeça);
   - texto em camada **atrás** da pessoa, gigante e com pouca opacidade (palavra-eco: "dores musculares", "sinais", "170");
   - objeto apontando para o texto, ou seta desenhada à mão saindo do texto até ele ("Salve pra ler depois" + seta);
   - o texto se encaixa no vazio que o objeto deixa (o objeto define a coluna do texto).
5. **Ponte entre slides** (pelo menos 1–2 por carrossel): o objeto atravessa a divisa (polvo, astronauta, pelúcia,
   monge, máscara partida entre o slide 2 e o 3), fita "Salve esse post" correndo pela divisa, borda de papel rasgado
   trocando o fundo do escuro para o claro, fundo contínuo com gradiente atravessando.
6. **Moldura fixa (série)**: topo esquerdo = avatar + nome + cargo; topo direito = contador "03/07 →" ou botão ›;
   rodapé = @ ou frase-assinatura ("Grandes poderes… grandes responsabilidades") + pílula "Compartilhe". Mesma posição
   em todos os slides, pequeno (16–22px), discreto. Ela cuida da margem: o resto respira dentro dela.
7. **Respiro**: 50–65% do slide é imagem ou vazio. Texto em uma coluna, nunca centralizado em bloco largo; margem ≥ 5%.
8. **Ritmo**: 01 gancho (título gigante + objeto) → 02–N desenvolvimento (corpo com respiro; objeto continua ou muda de
   escala) → alternância claro/escuro ou de enquadramento → último = virada + CTA. Nunca dois slides iguais seguidos.

## 2. Técnicas de acabamento observadas (catálogo)
| Técnica | Onde aparece | Kanivete hoje |
|---|---|---|
| Marcação de palavra: tarja colorida atrás (levemente torta) | "já tinha aprovado", "provar em tempo real" | CSS `background` + `transform: rotate` no `<span>` |
| Círculo desenhado à mão em volta da palavra | "não o seu ego", "mercado" | **falta componente** (`k-marca circulo`) |
| Sublinhado rabiscado / risco à mão | "não é uma feature", "a mesma coisa" | **falta** (`k-marca rabisco`) |
| Seta curva à mão | Peter Parker, astronauta, Igor | **falta** (`k-seta-mao`) |
| Palavra manuscrita (script) no meio do texto | "170 clientes", "satisfeitos", "Eu já passei por isso" | fonte script (`--estilo`) |
| Seleção estilo Figma (caixa com alças) | "documentação." | **falta** (`k-marca selecao`) |
| Asterisco / ">" / ícone temático como marcador | listas | `ul` + `data-marcador` |
| Papel rasgado com fita adesiva como caixa de texto | "Abri o Figma na frente dele" | `k-papel` (amassado); **falta borda rasgada e fita** |
| Borda rasgada trocando o fundo entre slides | Spider Man 2→3 | **falta** (`k-rasgo`) |
| Fita "Salve esse post"/"NEW POST" cruzando a peça | Jhonatan, Igor | **falta** (`k-fita`) |
| Palavra-eco gigante atrás (baixa opacidade, vertical) | ansiedade, "170", "erm" | texto + `opacity` + z-index (ok) |
| Título com gradiente metálico/neon | "SABE…DESIGN?", "zero/170" | `background-clip:text`? conferir |
| Grão/ruído e textura de papel/mapa topográfico | quase todas | `KNV.receita.texturaTecido`, `.acabamento` |
| Luz/spot no fundo (vinheta, lanterna, glow) | Bynet, "iluminar", spider | gradiente radial + `.acabamento` |
| Foto do fundo desfocada e escura, em P&B | spider, ansiedade | filtro inteligente (desfoque, P&B) |
| UI temática como asset (notificação "Pix recebido" empilhada) | Bynet | `k-post`/caixas — é melhor que ícone |
| Mascote/sticker ilustrado + selo circular girando | Bynet | `gerar:` sticker + texto em círculo (falta) |
| Sombra suave de contato sob o objeto | pelúcia, papel, monge | `box-shadow` → Sombra projetada |

## 3. Prompts de asset (geradores internos: `gerar:` / `--gerar`)
Fórmula: **assunto-metáfora + material/estilo + luz + enquadramento + fundo**. Sempre em inglês, sem texto.
- Objeto 3D tátil: `"<objeto> made of soft red felt fabric, plush toy, studio product photo, soft top light, subtle
  contact shadow"` + `data-fundo="branco"` (sai recortado).
- Criatura/objeto realista com cor da marca: `"photorealistic octopus tentacle, monochrome red, dramatic rim light,
  high detail"` + `data-cor="#e8301c"`.
- Pessoa humanizada: `"editorial portrait of a <quem>, <emoção>, black and white photo, soft window light, waist up"`
  + `--proporcao 4:3 --inteiro` + `data-pele` (se colorida). Gere LARGO e enquadre na caixa.
- Fundo de atmosfera: `"dark concrete wall, single light beam, cinematic, empty, no people"` (desfocar e escurecer depois).
Folha de contato primeiro (`knv.py --gerar ... --sementes 7,11,23`), escolha, depois a cena sai do cache.

## 4. Proibido (o revisor aponta)
- Desenho SVG solto tapando espaço (`vetor`): SVG só dentro de componente `k-*` ou com `data-proposito`.
- Slide sem foto/objeto na maioria das páginas (`asset`).
- Título que não domina (`hierarquia`), gancho com mais de 8 palavras (`gancho`), corpo > 40 palavras (`texto`).
- Texto ocupando > 38% do slide (`respiro`). Carrossel sem nada cruzando a divisa (`ponte`).
- Frase do roteiro faltando (`roteiro`, com `--roteiro roteiro.json`).
- Marque o papel no HTML: `<h1>` (ou `data-papel="gancho"`), `<h2>` subtítulo, `<p>` corpo, `data-papel="meta"` na moldura.

## 5. Fluxo barato: roteiro → esqueleto (USAR ESTE)
O agente NÃO escreve HTML de carrossel do zero. Escreve um roteiro JSON (~1–2k tokens) e roda:
`py -3.13 tools/esqueleto.py roteiro.json --montar [--exportar pasta]` (app de teste em `--agente=9333`).
Sai o HTML diagramado, o .iknv, a prévia e o revisor (com `--roteiro`, confere se todo texto entrou).
Formato e exemplo completo: docstring de `tools/esqueleto.py` e `D:\kanivete_testes\direcao\demo.json`.
`--listar` mostra os esqueletos:
- `gancho-heroi` capa: gancho gigante + objeto saindo pela borda (`"ponte": true` atravessa para o slide 2).
- `texto-respiro` coluna de corpo com respiro + objeto cortado no canto (`lado` troca a coluna).
- `eco-pessoa` palavra-eco gigante clarinha atrás + pessoa recortada + título/corpo na coluna livre.
- `papel` título no alto + papel rasgado com fita adesiva como caixa do corpo.
- `foto-atmosfera` foto de fundo escurecida em degradê + título/corpo embaixo.
- `virada-cta` frase grande na cor de destaque + corpo curto + pílula de ação + seta à mão.
Pontes: `"pontes": [{"depois": 2, "tipo": "rasgo"}, {"depois": 4, "tipo": "fita"}]`.
Escolha do esqueleto pelo PAPEL do slide (capa → gancho-heroi; prova/história → eco-pessoa ou foto-atmosfera;
explicação → texto-respiro/papel; fechamento → virada-cta). Nunca o mesmo esqueleto em dois slides seguidos.
Depois do revisor limpo: acabamento por receita (`KNV.receita.acabamento`, `texturaTecido` para grão) via `--depois`.

## 6. Componentes novos do KNV.cena (2026-10-06)
- `<span class="k-marca" data-marca="circulo|sublinhado|risco|tarja|selecao">palavra</span>` (cor: `--cor-marca`;
  `data-espessura`). Traço à mão liso (Catmull-Rom), repetível (mesmo texto = mesmo traço).
- `<div class="k-seta-mao" data-forma="curva|laco" style="left;top;transform">` seta desenhada à mão.
- `<div class="k-fita" style="left;top;transform:rotate(86deg);transform-origin:0 0">Salve esse post</div>` fita com o
  texto repetido (`data-repetir`), uma camada só; decoração (fora de contraste/margem).
- `<div class="k-rasgo" data-lado="direita" data-cor="#1c1c1e">` área com borda rasgada (fibra branca + sombra).
- `.k-papel data-rasgado="baixo" data-fita` papel rasgado com sombra macia e fita adesiva.
- `.k-eco` palavra gigante a 7% de opacidade atrás (decoração); `.k-luz` luz radial da cor primária.
- Revisor: além das regras do §4, `atropelo` (letras de um texto sobre outro), `margem` (texto a < 5% da borda),
  `respiro` (corpo colado no título: vão < 35% do tamanho do título). Feedback do usuário 2026-10-06: "cuidado com
  palavras em cima de outras atrapalhando leitura, tem que ter margem, respiro, espaçamento, respeitar hierarquias".
