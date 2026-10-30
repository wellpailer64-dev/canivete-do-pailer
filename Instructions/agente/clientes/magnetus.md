# MagnetUS: ficha de produção

Base: `D:/01 - ALL IN CLOUD - HD PAILER/01 - PANDA LAB/01 - CLIENTES/06 - MAGNETUS`
Fluxo geral: `Instructions/agente/fluxo-peca-cliente.md`. Pasta do card: `03 - PAUTAS MENSAIS/<ano>/<pacote>/<nº - peça>`.
Carrossel de Artigo tem modelo próprio: `D:/kanivete_biblioteca/modelos/magnetus_artigo/LEIA-ME.md`.

## Presets (`PRESSETS/`)
| Peça | Arquivo | Formato |
|---|---|---|
| Normal ou Alterado | `PRESSET NORMAL OU ALTERADO.psd` | carrossel 2 páginas, 2160×1440, guia em 1080 |
| Enquete do Dia | `PRESSET ENQUETE DO DIA.psb` | pranchetas 1080×1400 e story 1080×1920 |
| Imagem do Dia | `PRESSET IMAGEM DO DIA.psb` | pranchetas 1080×1400 e story 1080×1920 |
| Visão RX | `PRESSET VISÃO RX.psb` | story 1080×1920 |
| Enquete e Imagem em vídeo | subpastas `... EM VÍDEO` (`.psb`; Enquete também tem `.prproj`) | vídeo |
| Monitores e logo | `00 - MODELOS DE MONITORES` | horizontal, quadrado e em pé |

Em Enquete e Imagem do Dia, cada prancheta traz um monitor: `horizontal` (FEED 1, STORY 1), `Monitor quadrado` (FEED 2, STORY 2), `modelo em pé v2` (FEED 2 copy, STORY 2 copy). Escolher pela proporção do exame e manter só o que combina.

## Normal ou Alterado
Capa à esquerda (animal + "arrasta"), exame à direita (moldura + "RESPONDA NOS COMENTÁRIOS").

| O que muda | Camada | Área |
|---|---|---|
| Animal da capa | `Layer 8` (o gato de exemplo; `Layer 6` é alternativa oculta) | recortado, x -13..949, y 452..1692 |
| Exame | dentro de `Group 1`, no lugar de `Rectangle 1` | x 1359..1884, y 349..1092 (525×743, cantos arredondados) |
| Seta laranja, se pedida | `Arrow067 1` (oculta): ligar e posicionar | sobre o exame |

Não mudam: títulos, logo, interrogações, "RESPONDA NOS COMENTÁRIOS", triângulo, "arrasta" e fundos.
- O exame cabe na moldura do preset: enquadrar a imagem, sem alargar a moldura. Só alterar se ele pedir.
- O ponto da seta vem do cliente. Conferir se a instrução é deste exame; sem certeza, perguntar.
- Exemplo pronto: `03 - PAUTAS MENSAIS/2026/08 - PACOTE 8/04 - NORMAL OU ALTERADO/images`.
