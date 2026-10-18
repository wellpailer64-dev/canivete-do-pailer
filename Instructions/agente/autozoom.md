# Autozoom (Vídeo Kanivete)

Zooms de ênfase automáticos em **camadas de ajuste cor-de-rosa** ("Autozoom", `c.az`, cor `pink`) acima do vídeo.
Painel **Animação › Autozoom**: Quantidade (Pouco ~12 s · Médio ~7 s · Muito ~4 s · Automático = só nota alta, no máximo
1 a cada 3,5 s), Estilo (Seco · Suave · Smart), Força (Leve · Média · Forte), Gerar (troca os autozooms de antes) e Remover.
Um Ctrl+Z desfaz.

## Como escolhe (frontend/js/editor-autozoom.js)
- Transcrição (`VETX.palavras`; sem ela, transcreve sozinho) → ideias curtas `veLpBlocos` (Legenda Premium) → nota
  `veLpNotaTitulo` (gancho no início, número, pergunta, exclamação, nome próprio, palavra marcada na voz) + ênfase da
  voz (`ve_leg_premium_enfase`, guardada em `VELP.enf` para as duas ferramentas).
- As de nota maior, espaçadas (folga entre zooms) até o alvo da Quantidade.
- Smart: frase curta e forte (número, "!", voz marcada; ≤ 2,2 s) = **seco**; frase longa (≥ 2,2 s) = **empurrão lento**
  que acompanha a frase; o resto **suave** (pergunta com mola); nunca 3 iguais seguidos.
- Não atravessa corte do vídeo de baixo. Centro = rosto no meio do zoom (`ve_autozoom_rostos` → YuNet do Pincel Roto);
  rosto já grande (> 42% do quadro) = zoom 30% menor.
- Trilha: logo acima do vídeo/fotos (texto e gráficos de cima não entram no zoom se estiverem acima dela).

## Efeito "Zoom (Autozoom)" (só em camada de ajuste, `soAjuste`)
Zoom %, Entrada s, Saída s, Suavidade da curva, Mola, Deriva (respira no meio) e Centro X/Y — nos Controles de efeito.
Curva (`veAzEscala` = `autozoom.escala`/`_expr_escala`): entrada expo-out (força pela Suavidade) ou back-out (mola),
deriva linear, saída em S (cúbica). Escalar em torno de um ponto do quadro nunca mostra borda.

## Exportação (Functions/autozoom.py)
`perspective` com `eval=frame` e interpolação cúbica (sub-pixel; o zoompan treme) depois dos outros efeitos da camada.
Sem T no perspective: tempo = t0 + `in`/fps (t0 = 1º quadro que chega: início do trecho na CPU; na placa, o início do
bloco quando o ramo é "tarde"). Placa: "zoom" está em `_FX_HIBRIDO` (o trecho desce, passa pelo filtro e sobe).
Conferido 2026-10-18: escala medida numa grade = curva (±0,03); prévia × quadro ampliado 0,3; prévia × arquivo CPU 4,7,
placa 3,8. Armadilha: `fps` no `exportar_video` é TEXTO (`f'{fps:.3f}'`) — `float(fps)`.

## Teste
`py -3.13 testes/teste_autozoom.py [--sem-placa]` (porta 9338, D:/kanivete_testes/autozoom). API: `VEAZ_API.gerar({qtd,
estilo, forca})`, `.remover()`, `.lista()`, `.escala(c, T)`.

## Pendências
- Kani refinar a escolha (sentido da frase), zoom para fora/pan entre dois rostos.
- Camada de texto/GC abaixo da trilha do autozoom também amplia (mover a camada para cima dela).

## Desfoque de movimento (2026-10-18)
Painel: Desfoque Ligado (padrão)/Desligado; no efeito: "Desfoque de movimento" + Obturador (% de 1 quadro). Cada quadro =
média de instantes dentro do obturador, presos à camada (zoom seco não faz fantasma no corte): prévia 7 amostras (média
corrida com globalAlpha 1/(j+1)), exportação 5 (`split` → 5 `perspective` → `mix`, o trecho com ";" entra no meio da
cadeia de efeitos). Parado = sem borrão (grade: 26 px cinza parado × 153 no zoom rápido). Armadilha: o `in` do
perspective começa em 1 → `(in-1)/fps` (sem isso o zoom saía 1 quadro adiantado).
