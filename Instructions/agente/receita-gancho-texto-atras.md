# Receita: gancho com frase digitada ATRÁS das pessoas + transições curtas (2026-11-12, card Carlinhos "Mais um aprovado")
Custo da 1ª vez: ~57 mil tokens (explorei o código, olhei ~12 imagens, errei a máscara). Seguindo a receita: ~8 chamadas, 1 imagem final.

## Regras que custaram caro
1. **Pincel Roto segue UM objeto por recorte.** Duas pessoas = duas cópias do clipe, cada uma com o seu Roto (pontos só numa pessoa; `--tira` na outra).
   Na 1ª tentativa pintei as duas na mesma cópia: só a da direita ficou (alfa 0 na da esquerda) e eu só vi isso por imagem, tarde.
2. **Conferir máscara por NÚMERO, não por imagem:** `D:/kanivete_testes/scripts/roto_pessoa.py` (cria a cópia, traça, propaga, mede o alfa da cabeça = deve ser ≥0,6 e o da outra pessoa = 0). Só então 1 folha do monitor.
   Pontos: cabeça, tronco, pernas (3 pontos num traço) + braço/objeto que sai do corpo; nunca mais de 12 pontos por quadro. Coordenadas 0..1 do quadro já girado.
3. **Ordem das trilhas (de baixo para cima):** vídeo → texto (1 linha por trilha; linhas que se sobrepõem na mesma trilha somem no renderizador) → cópia(s) recortada(s) (`x:"v"`) → camada de cor do gancho → transições (sobreposição) → zoom (camada de ajuste). A cor do resto do vídeo começa onde o gancho termina.
4. **Texto digitado (`txa.maquina`)**: dividir cada linha em clipe "digitando" (duração = `d`) + clipe "parado" sem animação. Clipe longo com animação que continua depois de terminar fazia o renderizador (prévia/exportação) sumir linhas.
5. **Zoom só em camada de ajuste** (`fx zoom`, `ent` = duração, `z` 106): `k` de escala no clipe reprova no conferir_edicao. Zoom sobe o texto junto: largura máx. do texto ≈ 900 px (margem > 60 px com o zoom).
6. **Prévia mente quando em cache:** o monitor usa trechos já renderizados (`VEPR.files`). Depois de mudar, esperar `faltam: 0` (`vePrSegmentos` × `VEPR.files.has(sig)`, ~12 s a cada 3 trechos) antes de olhar o monitor. Frame do arquivo renderizado = verdade da exportação.
7. **Transições curtas nos cortes** sem mexer na fala: `veOvtAdd`-like por JSON: clipe de camada de ajuste `{fx:[{t:'zoomin'|'panblur'|'shake'|'glitch'|'flash', v:{amt,mb,ang}}]}` centrado no corte, 0,18–0,22 s (gancho→resto 0,30 s). Ciclo: panblur (ang 0/180) ↔ zoomin 150–190, shake 45; frase completa (clipe ≥1,1 s) = zoomin 210; flash 70 na entrada do quadro final. Nada de twirl/spin/lens (cômico).
8. `kanivete.js` com 2 instruções soltas (`a(); 'ok'`) dá SyntaxError: embrulhar em `(()=>{...; return 'ok'})()`. Espera longa: script em `run_in_background`, não `timeout 100` (matou o processo no meio).

## Receita (scripts em D:/kanivete_testes/scripts/c5/)
1. `montar_v4.py gancho --aplicar`: texto em CAPS por linha no tempo da palavra (`PAL`), pops, cópia do clipe em trilha própria. Estado vivo de partida; guarda cópia em `vivo_antes_v4_*.json`.
2. `roto_pessoa.py` uma vez por pessoa → deve imprimir `OK`. (`medir_roto.py "clipe" "caixa dentro" "caixa fora"` mede de novo sem refazer.)
3. `ajuste_split.py` (digitando/parado), `ajuste_zoom.py`, `ajuste_margem.py` = ajustes do mesmo tipo, mesmo molde (parte do vivo, mexe, `aplicar`).
4. `montar_v4.py trans --aplicar` (transições). Depois: rascunho (`veProjectData()` → .vknv fora da pasta do card) + `conferir_edicao.py --timeline ...`. O Pailer salva.
