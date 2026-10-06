# Diretor de arte de carrossel (padrão de resposta + o que o Jr executa por comando)

Pedido do usuário (2026-10-06): diante de um tema/briefing, responder como diretor de arte sênior — exigente, crítico,
capa como poster, imagem que faz parte da cena (nunca adesivo), efeito só com função, texto respirando — e sempre com
instruções técnicas executáveis pelo Jr no Photo Kanivete. Complementa `direcao-carrossel.md` (regras e técnicas
observadas) e `tools/direcao_mapa.py` (catálogo curto).

## Formato da resposta a um briefing
1. **Direção criativa geral**: proposta, clima, estética, composição dominante, como a capa se destaca.
2. **Gramática visual**: tipos de imagem, interação com o layout, efeitos permitidos, tipografia, o que evitar.
3. **Estrutura slide a slide**: função, mensagem, composição (A–H abaixo), posição/papel da imagem, zona de texto,
   clima, efeitos, risco a evitar.
4. **Instruções técnicas para o Jr**: por slide, a sequência de comandos (tabela abaixo). Na prática vira o roteiro do
   `tools/esqueleto.py` + uma receita `--depois` com os `KNV.*` de acabamento.
5. **Prompts de geração**: assunto + composição + luz + paleta + área livre para texto (em inglês; `gerar:`).
6. **Checklist final**: capa é a mais forte? imagem conversa com o layout? texto respira? profundidade? unidade?
   autoral ou genérico? adesivo ou cena? efeito sem função? composição madura? (+ `tools/revisor.py`, que já mede
   hierarquia, respiro, atropelo, margem, forma solta, contraste e corte seco).

## Composições A–H → esqueleto que já existe (ou falta)
| Composição | Esqueleto hoje | Situação |
|---|---|---|
| A. Hero image | `gancho-heroi`, `foto-lateral` | pronto |
| B. Full bleed com área negativa | `foto-atmosfera` | pronto (véu em degradê; falta variante com a área limpa no alto/lado) |
| C. Recorte integrado | `gancho-heroi`, `eco-pessoa` + arte-final (sombra, brilho) | pronto; falta sombra de CONTATO no chão |
| D. Objeto central / poster | `objeto-dominante` | parcial: falta pedestal, glow e fundo atmosférico próprios |
| E. Collage / gallery | — | **falta** (molduras sobrepostas, várias fotos editoriais) |
| F. Split composition | `texto-respiro`/`foto-moldura:faixa-vertical` | parcial: **falta** split 50/50 claro × escuro |
| G. Ambiente cênico | `foto-atmosfera` | pronto (cena gerada com espaço negativo no prompt) |
| H. Abstract support | `texto-destaque` + `k-luz`, supergráfico, textura | pronto |

## Técnica do Photoshop → comando no Kanivete (o que o Jr consegue rodar)
| Técnica | Comando |
|---|---|
| máscara de camada / degradê | `KNV.receita.mascaraDegrade(nome, {lado, inicio})`, máscara da cena (`object-fit`/caixa) |
| clipping mask | `data-corte` na cena (foto presa na forma de baixo); `L.clip = true` |
| smart object + filtro inteligente | imagem da cena já entra como objeto inteligente; `KNV.objetoInteligente()`; filtro em objeto inteligente vira filtro inteligente |
| Camera Raw (filtro ou camada) | `KNV.ajuste('cameraRaw', {exp, ct, hi, sh, wh, bl, temp, tint, vib, sat, tex, clar, nevoa, grao, vig, rodas...})`; `KNV.receita.arteFinal` (camada final) |
| gaussian / lens / motion / radial blur | `KNV.cmd('f:gaussiano'|'f:lente'|'f:movimento' {ang, d}|'f:radial', vals)` |
| tilt-shift (profundidade) | `KNV.cmd('f:tiltShift', vals)` |
| gradient map | `KNV.ajuste('mapaDeg', {...})` |
| curves / levels / exposição | `KNV.ajuste('curvas'|'niveis'|'exposicao', vals)` |
| hue/saturation, color balance, P&B, filtro de foto, misturador | `KNV.ajuste('matiz'|'equilibrio'|'pb'|'filtroFoto'|'misturador', vals)` |
| selective color | **falta** como ajuste; hoje: HSL do Camera Raw (`hsl`) ou `matiz` por faixa |
| dodge & burn | **falta receita**: camada cinza 50% em Luz suave + `KNV.pincel` branco/preto macio, opacidade 8–15% |
| blend modes | `KNV.modo('SCREEN'|'MULTIPLY'|'SOFT_LIGHT'|'OVERLAY'|'LINEAR_DODGE'..., op)`; `mix-blend-mode` na cena |
| outer/inner glow | efeito de camada `brilho` / `brilhoInt` (`KNV.efeito`) |
| drop shadow | `box-shadow` na cena = Sombra projetada; `KNV.receita.sombra(nomes, css)` |
| contact shadow | **falta receita**: elipse escura desfocada em Multiplicação sob a base do objeto |
| noise / grain | `KNV.cmd('f:ruido', {q, mono})`; grão do Camera Raw |
| sharpen / high pass | `KNV.cmd('f:nitidezInteligente'|'f:passaAlta', vals)` (passa-alta + Sobrepor) |
| liquify | Filtro › Dissolver (`testes/teste_dissolver.py`) |
| warp / perspective warp | transformar livre na interface; **falta API** de warp |
| displacement / distortion | `KNV.cmd('f:deslocamento'|'f:onda'|'f:torcer'|'f:esferizacao', vals)` |
| vignette | Camera Raw `vig` (arte-final já põe −14) |
| light leaks | **falta receita**: degradês radiais laranja/magenta em Tela 40–70% nas bordas (o `brilho` da arte-final é o começo) |
| texture overlay | `KNV.receita.texturaTecido`, "Textura suave" da arte-final, `k-papel data-amassado` |
| double exposure | duas imagens + `KNV.modo('SCREEN')` + máscara; **falta receita** pronta |
| iluminação dirigida | `KNV.cmd('f:iluminacao', {tipo: 'spot'...})`, `k-luz` |

## A construir para cobrir o padrão (ordem sugerida)
1. Receitas: `sombraContato`, `dodgeBurn`, `lightLeak`, `duplaExposicao`, `gradacao` (mapa de degradê + Camera Raw por estilo).
2. Esqueletos: `collage` (2–4 fotos em molduras sobrepostas, legenda editorial), `split` (50/50 claro × escuro),
   `poster-objeto` (objeto central com pedestal, glow e fundo atmosférico — a capa poster).
3. Capa "poster" por padrão: a 1ª página ganha o tratamento mais forte (luz dirigida, contraste maior, arte-final mais
   intensa que nos outros slides).
4. Ajuste "Correção seletiva" e API de warp (quando o resto estiver pronto).
