# Plano CENA — diagramar no Photo Kanivete escrevendo HTML/CSS (para IAs)

Meta (2026-10-03): o agente fazer carrosséis de Instagram, feed 1080×1350/1080×1440, stories e peças avulsas no Photo
Kanivete com a mesma facilidade do Claude Design no navegador — sem perder a essência (camadas, efeitos, PSD, uso manual).

## Diagnóstico
| | Editor Kanivete (vídeo) | Photo Kanivete (antes) |
|---|---|---|
| Modelo | declarativo (`VE.clips` = dados) | imperativo (ativar → mover → medir `caixa()` → mover) |
| Diagramação | a timeline organiza | o agente calcula cada pixel (`pos()`, `encostar`, pilhas à mão) |
| Refazer | troca um valor | roda a etapa de novo a partir da etapa anterior (.iknv) |
| Conferir | números | print + grade de diferenças + revisor |

O Claude Design é rápido porque o agente escreve HTML/CSS (o que mais domina) e o NAVEGADOR diagrama (flex, grid,
quebra de linha, margens, variáveis). O Photo Kanivete roda num Chromium (WebView2): o motor já está lá.

## A ideia: `KNV.cena(html)`
1. O agente escreve a peça em HTML/CSS no tamanho do documento.
2. O app monta o HTML numa área escondida (Shadow DOM, com as MESMAS fontes do editor), lê a posição final de cada
   elemento e cria **camadas nativas**:
   - texto → camada de texto editável (fonte, tamanho, cor, espaçamento, entrelinha, alinhamento; quebras de linha
     iguais às do navegador; texto com quebra natural vira texto de caixa, que reflui ao editar);
   - caixa com fundo/borda/canto/degradê → camada de pixel desenhada pelo próprio navegador (fidelidade de CSS);
   - `box-shadow`/`text-shadow` → efeito Sombra projetada; `-webkit-text-stroke` → Traçado (editáveis no Estilo de camada);
   - `opacity` → opacidade; `mix-blend-mode` → modo de mesclagem; `transform`/`rotate`/`scale` → a camada girada/escalada;
   - `<img src="caminho">` → camada de imagem (object-fit cover/contain; o corte do cover vira MÁSCARA, a foto inteira
     continua lá para reenquadrar); `<img src="gerar:prompt">` → FLUX.2 (cache por semente); `data-recortar` → recorte;
   - elemento com `id`/`data-nome` e filhos → grupo com esse nome.
3. **Rodar de novo atualiza pelo `id`** em vez de recomeçar. Camada que o usuário mexeu à mão (pixels, posição, texto,
   efeitos) fica marcada como DELE e não é tocada; só o que continua sendo do agente é refeito.
4. O HTML fica guardado no documento (`KNV.cenaFonte()`, salvo no .iknv): numa sessão nova o agente lê, troca uma linha
   e roda de novo.
5. Conferência de graça pelo próprio DOM: texto estourando a caixa, fora da margem de segurança, texto atropelando
   texto, fora da área segura do story, letra pequena demais.

Depois da cena vale tudo de foto (`KNV.pincel`, ajustes, recorte, máscaras, gerar): o HTML só substitui posicionar e
medir. O resultado é um .iknv/PSD comum; o usuário continua usando o Photo Kanivete manualmente como no Photoshop.

## Fases
- **Fase 1 — cena:** `KNV.cena(html, opções)`, `KNV.cenaFonte()`, reconciliação por id com proteção das camadas
  manuais, avisos de diagramação, formatos (`feed` 1080×1350, `feed4x5`, `retrato` 1080×1440, `story` 1080×1920 com área
  segura, `quadrado`), runner genérico `tools/knv.py`. FEITA.
- **Fase 2 — carrossel e marca:** N slides (`<section class="slide">`) lado a lado num documento largo (não pranchetas:
  a prancheta recorta o conteúdo e mataria o carrossel contínuo), guias nas emendas e uma fatia por slide, exportar
  todos num comando; kit de marca (variáveis CSS guardadas no app); componentes `k-*`. FEITA.
- **Fase 3 — biblioteca e olho:** pares de fontes, paletas, receitas de capa/citação/lista/antes-depois; `KNV.ver()`
  (JPEG pequeno só para julgar estética); camadas de forma vetorial se o usuário sentir falta de editar o canto.

## Limites conhecidos (Fase 1)
- Caixas/degradês viram camadas de PIXEL (move, pinta, Sobreposição de cor, opacidade; não arrasta o canto como vetor).
- Texto com estilos misturados vira uma camada por trecho (o modelo de texto do editor tem um estilo por camada).
- `background-image: url()` não entra (use `<img>`); `filter`, `backdrop-filter`, `clip-path` complexo: anotados no relatório.
- `z-index` só reordena irmãos; perspectiva 3D é ignorada.

## Como usar
App de teste em `--agente=9333` (ver CLAUDE.md). Uma peça = um arquivo HTML; o runner faz o resto:
```
py -3.13 tools/knv.py peca.html --formato feed --novo --salvar peca.iknv     # cria; prévia em peca.jpg (escala 0.5)
py -3.13 tools/knv.py peca.html --de peca.iknv --salvar peca.iknv            # editou o HTML: atualiza só o que é da cena
py -3.13 tools/knv.py - --de peca.iknv --depois ajustes.js                    # só JS KNV.* (foto, pincel, recorte...)
```
Imprime camadas, tempo e AVISOS (margem 5%, faixa da interface do story, texto atropelando texto, letra < 2,2% da
largura, texto estourando a caixa, fonte não instalada, CSS que não entra). Olhe a prévia só para estética.
Na página: `KNV.cena(html, {formato, w, h, nome, base, novo, margem, refazer})`, `KNV.cenaFonte()`, `KNV.fontes('pop', {estilos:true})`.

Escrever o HTML:
- `body`/`:root`/`html` = a página (tamanho do formato). Use flex/grid, padding, gap, `position:absolute` à vontade.
- Fontes = as instaladas no Windows (`KNV.fontes()`); peso/itálico escolhem o estilo (Poppins tem 100–900).
- `id` ou `data-nome` = nome da camada/grupo E a chave para rodar de novo: dê id ao que importa.
- `<img src="foto.jpg">` (relativo à pasta do HTML), `object-fit`/`object-position`/`border-radius` → máscara.
  `<img src="gerar:prompt em inglês" data-semente="7" data-fundo="branco" data-recortar="borracha|ia" data-lado="768">`
  (FIXE a semente: refazer sai do cache; `data-proporcao="4:5"` se a caixa não tiver altura).
- `<svg>` inline (ícones, setas) vira camada; `currentColor` = `color` do elemento. `var()` em atributo (`stroke=`/`fill=`) não vale: cor direta.
- `box-shadow`/`text-shadow` → efeito Sombra (caixa translúcida: camada "(sombra)" própria); `-webkit-text-stroke` →
  Traçado; `opacity`, `mix-blend-mode`, `transform: rotate/scale` valem.
- Texto com `<b>`/`<span>` no meio = uma camada por trecho de linha; bloco só de texto = uma camada (quebra natural
  → texto de caixa que reflui ao editar).
- Não entram: `background-image: url()` (use `<img>`), `::before/::after`, `filter`, `backdrop-filter`, `clip-path`.
- `data-livre` tira o elemento da checagem de margem; `data-juntos` num pai permite textos encostados.

Carrossel (Fase 2):
- Cada `<section class="slide">` (ou `[data-slide]`) é um slide do tamanho do formato; o documento é a tira
  (4 slides retrato = 4320×1440), com guias nas emendas e fatias 01..N. Grupo por slide ("Slide 1"... ou o id).
- O que fica fora das sections é solto na tira inteira: `position:absolute` com `left` em px da tira atravessa a
  emenda (foto entre o slide 1 e 2, linha contínua). `var(--slide)` = largura do slide, `var(--slides)` = quantos.
  O fundo do `body` já é contínuo.
- Mesmo método do Photoshop (e do Arquivo > Novo > Carrossel do editor): largura = 1080 × páginas, altura do formato
  (feed 1440); guias nas divisas, uma fatia por página. Pela API: `KNV.layoutGuias({colunas: {n: 5, medianiz: 0}})`,
  `KNV.fatiasDasGuias()`, `KNV.novaGuia('v', 540)`, `KNV.guias()`, `KNV.ajustar(true)`.
- Exportar: `--exportar pasta [--fmt png|jpg|webp]` (usa as fatias do documento, na ordem) → `base_01.png`... (`KNV.exportar(pasta, {fmt, q, base, escala})`;
  sem slides exporta a peça inteira). Aviso "cortado na emenda" para texto que cruza slides.
- Kit de marca: `KNV.marca({'cor-primaria': '#ffb703', 'cor-fundo': '#0f1b2d', 'cor-texto': '#f1f5f9', 'cor-suave':
  '#94a3b8', fonte: 'Poppins'})` (fica no app) → `var(--cor-primaria)` em toda cena; os componentes já usam.
- Componentes (`k-*`, o CSS da peça sempre ganha): `k-num` vazio = "01 / 04"; `k-arraste` vazio = "arraste →" no
  canto (some no último slide; `data-sempre` mantém); `k-tag`, `k-selo` (círculo girado), `k-card`, `k-cta`,
  `k-citacao` (+ aspas e `k-autor`), `k-lista` (marcador na cor primária; `ol` numera 01, 02...), `k-grande` (número
  gigante). Qualquer `li` ganha marcador de verdade (o `::marker` do navegador não vira camada).

Rodar de novo: camadas da cena são refeitas; as MEXIDAS depois (texto editado, movida, efeito, pincelada — digital do
modelo + assinatura 24×24 dos pixels) ficam e aparecem em "mantidas". Camadas criadas à mão nunca são tocadas.
`--refazer` (ou `refazer: ['nome']`) refaz as mexidas também. Filtros inteligentes postos depois (cor, contraste) não contam
como mexida: a camada refeita pelo HTML leva os filtros da antiga (`ieCenaLevarFiltros`).

## Estado
- 2026-10-03: Fase 1 pronta e testada (`frontend/js/imagem-cena.js`, `tools/knv.py`; testes em `D:\kanivete_testes\cena`):
  capa de carrossel 1080×1350 idêntica ao Chrome (lado a lado), story com gerar+recorte, rodar de novo preservando
  edições manuais após salvar/reabrir.
- 2026-10-03: Fase 2 pronta: carrossel de 4 slides retrato (foto atravessando a emenda, componentes, marca), rodar de
  novo sem duplicar fatias/guias, exportação em 4 PNGs. Próximo: Fase 3 (biblioteca de estilos/receitas, KNV.ver,
  forma vetorial se o usuário pedir).
- Notado: `KNV.mover` num grupo muda só o x/y do grupo (os filhos não andam).
- 2026-10-03: carrossel 3D (Instructions/agente/design-photo-kanivete.md): cena mostra guias e fatias do carrossel;
  o runner não recarrega funções embrulhadas por outro módulo (ex.: `ieDesenharSobre`; recarregar a original fazia
  guias, fatias e réguas sumirem do app de teste).

## Fluxo barato (2026-10-03, depois do carrossel 3D)
Biblioteca local `D:\kanivete_biblioteca` (ou `--biblioteca` / `%KANIVETE_BIBLIOTECA%`): `recursos/` (objetos já
recortados + .json com prompt/semente), `modelos/` (peças aprovadas, para ESTUDO — as peças nascem do zero),
`amostras/` (folhas de fontes). `py -3.13 tools/knv.py --listar` mostra o que tem.
- **Recursos**: `<img src="gerar:..." data-guardar="cavalo">` grava o objeto recortado; depois `<img src="recurso:cavalo">`
  em qualquer peça (sem gerar de novo). Objeto gerado com `data-fundo="branco"` já sai com recorte de IA
  (`data-recortar="nao"` desliga). Tamanho gerado: `data-proporcao`; `object-fit: contain` = quadrado.
- **Cor automática**: `data-cor="#46c33f"` (+ `data-contraste="35"`) mede o objeto e põe Matiz/Saturação (+ Brilho/
  Contraste) como filtros inteligentes até a média dos meios-tons chegar na cor (o verde-limão do FLUX → h33 s−60 l−15).
  Rodar de novo refaz esses filtros e mantém os que o usuário pôs.
- **Olhar barato**: `--ver slide:2` (ou `x,y,w,h`, `--escala-ver 0.4`) → só o pedaço; `--sem-previa` pula a tira inteira.
- **Referência**: `--referencia ref.png --comparar` → camada oculta "Referência" + `<peca>_comparar.jpg` (referência em
  cima, peça embaixo, pequenas).
- **Variações**: `--variacoes '{"camada": "cavalo", "filtro": "aj:matiz", "lista": [{...}, {...}]}'` (ou `"ajuste":
  "Nome da camada de ajuste"`) → `<peca>_variacoes.jpg` lado a lado; o documento volta ao que era.
- **Receita idempotente**: no `--depois`, `return await KNV.etapa('textura', async () => {...})`: código igual = pula;
  mudou = desfaz o que a etapa fez (camadas criadas, filtros postos) e roda de novo. Fica no .iknv.
- **Fontes**: `--amostras "TEXTO" --estilo condensada-impacto` (ou `--fontes "A,B"`) instala as que faltam e monta a
  folha; `--estilos` lista estilos e pares (`tools/fontes_estilos.json` — acrescente os pares que forem aprovados).
- **Modelos**: `--de peca.iknv --guardar-modelo nome --nota "o que funcionou" [--exportar pasta]`.
- **Pessoas e objetos gerados** (2026-10-03, feedback do carrossel Valer): folha de contato antes da cena, em segundo
  plano enquanto escreve o HTML: `--gerar "prompt" --sementes 7,11,23 --proporcao 4:3 --inteiro` (a cena depois sai do
  cache se prompt/semente/tamanho/data-inteiro forem iguais). Pessoa da cintura para cima: gere LARGO (4:3) para os
  ombros caberem e enquadre com a caixa. A cena avisa "saiu cortado na geração (direita...)" quando o recorte encosta na
  borda; `data-pode-cortar="baixo"` para o corte de propósito. `data-inteiro` pede o assunto inteiro com folga.
- **Pele**: `data-pele` (ou um matiz em graus) mede os tons de pele e corrige por Camera Raw (Matiz verde↔magenta + HSL
  laranjas/amarelos/vermelhos) até ~24° e saturação ~0,4 — o FLUX deixa pele esverdeada/amarelada.
- **Componentes novos**: `ul.k-check` (check verde), `ul.k-x` (X vermelho), `.k-barras` (itens em barras da cor
  primária), `.k-dica` (lâmpada), `.k-pilula data-icone="seta|play|salvar|check" [data-icone-fim]`. Cores pelo kit:
  `--cor-primaria`, `--cor-fundo` (texto sobre a primária), `--cor-ok`. `box-shadow` em caixa/imagem = Sombra projetada
  editável (em imagem recortada, segue o recorte).
- **Receitas prontas** (cada uma é etapa: mesmos parâmetros pula, mudou refaz): `KNV.receita.tituloGasto(['grupo'...],
  {cor})`, `.texturaTecido(['fundo'...])`, `.sombra(['camada'], '0 30px 60px rgba(0,0,0,.5)')`, `.acabamento({...})`,
  `.balancoAuto('foto')`. Camera Raw tem botão "Automático" no balanço de branco.
- **Conferência**: `--comparar slide:2` (só o slide, lado a lado); avisos novos: fundo de trecho mais alto que a linha
  (cobre acento/cedilha) e "quase alinhados" (bordas a 3–8 px). `<g transform>` dentro de `<svg>` agora vale.
