# Motion em HTML → timeline nativa do Vídeo Kanivete

Um jeito a mais de fazer motion, sem tirar o controle das edições: escrevo a cena em HTML/CSS (onde sou mais rápido e
preciso) e o Kanivete a **reproduz com as ferramentas dele**. Saem camadas de texto, forma, cor e imagem, quadros-chave
com a curva Bézier do próprio CSS e máscaras, tudo editável no painel como se tivesse sido feito à mão. Não é vídeo
renderizado colado na timeline. Origem: aula "Motion Graphics com Opus 5.5" (Felipe Borges, 2026-10-26) e o pedido do
Pailer: "interpretar e reproduzir exatamente o que você construiu no HTML dentro das ferramentas nativas; se tiver
limitação, a gente vai lapidando até ficar 100%".

## Uso
```
py -3.13 tools/motion_html.py cena.html [--saida pasta] [--nome "Timeline"] [--salvar proj.vknv] [--porta 9333]
                                         [--so-plano] [--exportar] [--comparar] [--placa]
```
- `--so-plano`: só lê o HTML e grava `plano.json` (sem app).
- Sem ele, monta a timeline no app em modo agente (cria ou refaz a timeline com o nome dado; as outras ficam).
- **Exporta SEMPRE pela placa** (regra do Pailer; `--cpu` só para comparar). Caiu no processador = aviso "ATENÇÃO" com o
  motivo → ensinar a placa (`Functions/export_placa.py`) e reexportar. O progresso aparece na barrinha de renders do KaniCode.
- `--comparar`: exporta pelo app e mede quadro a quadro contra o HTML. **Piso** = o próprio HTML comprimido em H.264;
  `acima_do_piso` ≈ 0 quer dizer igual ao HTML. A folha `comparacao_piores.jpg` mostra os piores pontos recortados
  (HTML | Kanivete | diferença ×4) e `comparacao.json` traz os números por quadro.
- Teste: `py -3.13 testes/teste_motion_html.py [--placa]` (cenas em `testes/motion_html/`, app em `--agente=9333`).

## Como escrever a cena
- `<meta name="kv" content="w=1080;h=1920;fps=30;dur=6">` (tamanho, taxa, duração).
- Animação por CSS `@keyframes`/transições, `el.animate()` ou GSAP (timeline global); gancho próprio: `window.kvTempo(t)`.
- Camadas: todo elemento com visual próprio vira camada (texto, fundo, borda, imagem). Para escolher à mão, marque com
  `data-kv` (aí só os marcados contam; `data-kv="texto|caixa|img|raster"` força o tipo).
- Texto com `<span>` vira um texto só. Se os spans têm animação própria (letra por letra, `display:inline-block`), cada
  um vira uma camada.
- O fundo do `body` vira a Cor sólida na V1.
- Ordem das faixas = ordem no HTML (o fundo embaixo).

## O que vira o quê
| HTML | Kanivete |
|---|---|
| texto (fonte, peso, itálico, cor, espaçamento, entrelinha, alinhamento, sombra) | camada de Texto; as quebras de linha do navegador vão explícitas |
| caixa com cor lisa, borda e arredondamento | Forma (ret/elipse); arredondamento em % (metade do lado menor, no meio do contorno) |
| caixa com degradê, sombra de caixa, svg, texto com estilos mistos | imagem isolada (PNG da própria camada) com o MOVIMENTO nativo |
| `<img>` | imagem do arquivo |
| translate/scale/rotate/transform, opacidade (inclusive dos pais) | Posição, Escala, Rotação, Opacidade com quadros-chave |
| largura/altura animadas (barra que cresce), escala só num eixo numa forma | `fm.w`/`fm.h` animados |
| `filter: blur()` | Desfoque gaussiano animado (100% = sigma de 5% do lado menor da mídia) |
| pai com `overflow:hidden`, `clip-path: inset()/polygon()` | Máscara ("Recorte n") com o caminho animado |

Curvas: o ajuste parte das curvas declaradas no CSS e das comuns (expo, back, ease…); só divide em mais quadros-chave
onde a curva não cabe na tolerância (0,35 px, 0,2% de escala, 0,15°, 0,6% de opacidade).

## Resultados (2026-10-26)
| Cena | O que testa | Acima do piso (média / pior) |
|---|---|---|
| teste1 | deslizar, pulo (back), giro contínuo, texto com desfoque, degradê | −0,18 / 0,25 |
| teste2 (9:16) | grupo girando com filhos, letra por letra, texto em 3 linhas centrado, imagem, contorno arredondado, `el.animate` | −0,21 / 0,62 |
| teste3 | texto revelado por máscara, barra crescendo, cortina por `clip-path`, cartão com sombra | 0,07 / 0,54 |

Consertos no app que saíram daqui: a camada desenhada (máscara/motion) e a cena 3D gravavam em BT.601 sem marca e a
exportação HD lia como BT.709 (vermelho (231,29,54) saía (246,48,50)) — `cena3d.py` agora grava em BT.709 com marca e
`video_cutter._matriz_clipe` usa a marca de cada clipe (cache antigo em `Cenas3D` sem marca = BT.601); forma com
largura/altura animadas ficava presa no tamanho parado (`veGrafTamanho` em `editor-grafico.js`).

## Fluxo de produção (método da aula, adaptado)
1. Referência e materiais reais (marca, fontes, cores, prints do site pelo KaniBrowser) listados antes de animar.
2. **Tabela de batidas** aprovada antes: estado × tempo × som (o que entra, como, com qual efeito sonoro).
3. Cena em HTML; `--so-plano` + `--comparar` para conferir.
4. **Nota antes de mostrar**: folha de quadros, nota de 1 a 10 por critério (hierarquia, ritmo, legibilidade, marca,
   acabamento), corrigir os 3 piores, repetir até tudo ≥ 8.
5. Montar no app; som (Soundboard) nas batidas; ajustes finos já nas ferramentas nativas.
6. Ao terminar: `veCompAgruparCenas()` (regra do mapa de motion) e kit da marca guardado.

## Lições da série Pandalab (2026-10-26)
- Escala ~0 = invisível (o editor desenha forma com no mínimo 1 px: bolinha no meio da tela antes da hora, listra no
  quadrado que vira). Escala X ≠ Y → `k.sx`/`k.sy`. Forma ampliada (> 100%) é desenhada já no tamanho maior (sem
  borrão e sem o limite de 20× do editor).
- Linhas do texto lidas SEM transformação (pílula girada no 1º quadro quebrava "VENDA" em VE/ND/A).
- Camada maior que o quadro (brilho, fundo vazando) é fotografada inteira (a janela cresce só para a foto).
- Placa: imagem girada ganha 2 px de margem transparente antes do `rotate` (borda serrilhada); desvio do recorte do PNG
  acompanha `sx`/`sy`.
- Direção (notas do Pailer): nada de corte seco (mão, busto do mascote → sangrar para fora da tela ou recortar dentro
  de uma forma), margens de 90 px nas laterais e respiro em cima/embaixo, logo de tipografia branca no laranja escuro,
  texto com respiro do motion, música descolada (Epidemic Sound da conta dele: `v2/epidemic.py` busca e baixa).

## Pendências (lapidar até 100%)
- Placa: camada que para em fração de pixel depois de se mover fica levemente amaciada (teste2/teste4 pela placa ~0,45
  acima do piso; pelo processador ~0,2).
- Cor animada (fundo/texto mudando de cor), `clip-path: circle()/ellipse()`, `border-radius` animado, `mask-image`.
- SVG com traço desenhando (`stroke-dashoffset`) → Forma "Caminho" com Aparar caminho; hoje vira imagem parada.
- Texto com estilos mistos e degradê no texto viram imagem (perdem edição de texto).
- Escala diferente em X e Y em texto/imagem (o editor tem uma escala só): fica a média + aviso.
- Objeto muito rápido (~100 px/quadro) fica 2–3 px fora no meio do movimento: precisão da exportação, não do tradutor.
- Mistura (`mix-blend-mode`) → modo de mesclagem da camada; `backdrop-filter` não tem equivalente.
- Vídeo (`<video>`) como camada; áudio da cena.
