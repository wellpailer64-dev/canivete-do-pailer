# Canivete Worker — o assistente local (para o Claude delegar operações)

Claude = diretor (decide o quê e escreve o contrato). Worker = executor local (Qwen3 8B no Ollama) que chama as APIs
reais do Photo Kanivete, corrige os próprios erros e devolve UMA linha JSON. O Claude não vê chamadas, erros nem logs.

```
py -3.13 tools/worker/worker.py contrato.json          # app em --agente=9333; Ollama rodando
→ {"task_id": "...", "status": "success|partial|failed", "worker": "qwen3:8b", "escalou": false, "operations": 7, "retries": 2, "seconds": 33}
```
`partial`/`failed` trazem `pendente` (até 5 itens). Registro completo: `D:\kanivete_testes\worker\logs\<task_id>.json`.

## Contrato (Task Contract)
```json
{"task_id": "VALER_AJUSTES_02",
 "goal": "Slide 2: '3 ERROS' em amarelo #ffd400; 'EVITAR' com 110 px; ... No fim, leve para o editor, um vídeo por slide.",
 "constraints": {"documento": "D:/.../peca.iknv", "salvar": true, "pasta_exportacao": "D:/.../export"},
 "assets": [],
 "success_conditions": ["cor:3 ERROS=#ffd400", "tamanho:EVITAR=110", "texto:s1-arraste [texto]=Deslize para o lado", "no_editor"]}
```
- `goal` em português direto, citando as camadas pelo nome (o Worker vê a lista; nome repetido vira rótulo único:
  `s1-arraste [grupo]`, `s1-arraste [texto]`, `#2`...). Sem decisão criativa: valores claros ("5% maior", "um pouco
  mais quente" ele já interpreta bem).
- **Escreva uma condição para CADA parte do pedido** — é o que impede "FEITO" falso. Condições: `efeito:N=tipo` (ex. `efeito:titulo=degSob`, `efeito:bola=sombra`), `acabamento`, `visivel:N`,
  `oculta:N`, `finalizada`, `mascara:N`, `rastro:N`, `luz`, `tratada:N`, `profundidade:N`, `texto:N=valor`, `cor:N=#hex`, `tamanho:N=px`, `opacidade:N=n`, `exportado`, `no_editor`.
- Exportar e levar para o editor são **agendados**: rodam uma vez, no fim, depois de conferir o resto.

## Como ele trabalha (tools/worker/)
- **`finalizar_peca {preset}`** (social_limpo | festa_noite | flyer_grunge | quente): o checklist inteiro numa chamada
  (`KNV.receita.finalizar`): roda o revisor e aplica tratar_foto + máscara degradê nas pessoas com base cortada, `leitura`
  sob textos ilegíveis, sombra suave nos recortes e no lugar das duras, acabamento; avatar e corte lateral só avisa.
  Contrato típico: `"goal": "Finalize a peça com o preset social_limpo e exporte tudo."` + `["finalizada", "exportado"]`.
- `ferramentas.json` (27, com `finalizar_peca` e `leitura`): acabamento de designer = `mascara_degrade` (pessoa some suave embaixo, sem corte seco),
  `rastro_movimento` (motion blur atrás do objeto; angulo = para onde ele vai), `luz` (manchas em Divisão, pontos
  [x, y, raio]), `tratar_foto` (Camera Raw por foto: neutro|quente|frio|noite|festa), `profundidade` (gaussiano
  editável no fundo); e listar_camadas, info_camada, mover/posicionar/escalar/girar_camada, opacidade,
  modo_mesclagem, visibilidade, alterar_texto, estilo_texto, cor_objeto (objeto inteligente), sombra_projetada
  (leve/media/forte), titulo_gasto, acabamento (SOMA ao acabamento atual; zeros ignorados), alinhar, exportar,
  levar_para_editor, gerar_imagem (ainda sem executor).
- `executor.js` = as ferramentas dentro do app (window.KNVW → KNV); erros que ensinam (grupo → lista os textos de dentro).
- `worker.py` = laço: modelo → validador (esquema, números, enum sem acento, nome de camada real) → executa → devolve
  o resultado/erro ao modelo; quando ele diz FEITO, confere as condições e os erros não resolvidos e cobra (até 2x);
  travou (3 erros seguidos ou 2 cobranças) → Gemma 4 E4B pensando assume a mesma conversa (`--reserva`).
- Modelos (entrevista em `entrevista.py` + `prova.json`): qwen3:8b 97,5% · 1 s/pedido (principal); gemma4:e4b
  reserva. O FLUX é parado antes (não cabem os dois nos 8 GB).

## Primeiros jobs (2026-10-03, carrossel Valer)
- VALER_AJUSTES_01: 6 operações, 0 erros, 24 s (esconder, trocar texto, sombra, escala, acabamento, exportar).
- VALER_AJUSTES_02: grupo × texto confundidos → erro que ensina + 1 cobrança → corrigiu sozinho; 33 s.
- PRIME_FEST_FINAL (flyer): degradê no grupo do título, sombra em 4 adesivos, acabamento, exportar — 7 operações, 0 erros, 28 s.
- PRIME_FEST_ACAB_07: máscara degradê nas 2 pessoas, rastro nas 2 bolas, tratar_foto festa, profundidade 6 no muro,
  luz atrás (acima do painel) e na frente — 10 operações, 0 erros, 22 s. Receitas em `KNV.receita.*` (mascaraDegrade,
  rastro, luz, tratarFoto, profundidade), também para o Claude usar direto.
Custo do lado do Claude: escrever o contrato (~250 tokens) + ler a linha de volta (~80).
Próximo: mais ferramentas (texto novo, cena, gerar, receitas), medir jobs maiores.

## Editor Kanivete (vídeo) — `"app": "editor"`
Mesmo `worker.py`; executor `executor_editor.js` (window.VEW) + `ferramentas_editor.json` (22). Clipe = **trilha@tempo**
(`V1@4.5` = clipe da trilha de vídeo 1 que passa por 4,5 s; `A3@1` áudio; `T@1` texto) — não envelhece depois de cortar.
```json
{"task_id": "EDITOR_01", "app": "editor",
 "goal": "1) Troque Elon por Helo na legenda. 2) T@1 = 'BEM-VINDO' em #ffd400. 3) push na entrada de V1@4.5. 4) Música A3@1 em -18 dB. 5) whoosh em 3.8 com -8 dB. 6) flash no corte de 7 s.",
 "constraints": {"projeto": "D:/.../copia.vknv", "timeline": "V2 MENOR", "salvar": false, "pasta_exportacao": "D:/.../export"},
 "success_conditions": ["legenda_sem:Elon", "texto:T@1=BEM-VINDO", "cor:T@1=#ffd400", "transicao:V1@4.5=push", "ganho:A3@1=-18", "som_em:3.8", "sobreposicao:7", "exportado"]}
```
- Ferramentas: listar/abrir/duplicar_timeline, listar_clipes {trilha}, info_clipe, cortar {tempo, clipe?}, apagar_clipe
  {fechar_espaco}, mover_clipe, aparar {inicio, fim}, ganho, velocidade, transicao {tipo, lado, duracao, direcao},
  tirar_transicao, sobreposicao {tipo, tempo} (VE_OVT), efeito {tipo, valores} (VE_FX: blur bc lc key crop luma rounded
  sombra ca_rot ca_wig ca_pul b3d), tirar_efeito, transformar {escala %, x, y, rotacao, opacidade}, alterar_texto,
  estilo_texto, trocar_na_legenda {de, para}, efeito_sonoro {busca, tempo, ganho} (Soundboard), exportar (agendado).
- Condições: `ganho|velocidade|transicao|efeito|texto|cor|escala|opacidade|inicio|fim:CLIPE=valor`, `existe:CLIPE`,
  `sem_clipe:CLIPE`, `clipes:N`, `timeline:nome`, `legenda_contem:x`, `legenda_sem:x`, `som_em:t`, `sobreposicao:t`, `exportado`.
- `projeto` = SEMPRE uma cópia (salvar grava por cima). O Claude decide tempos/cortes (plano em python, guia-edicao.md);
  o Worker aplica a lista. Bom para: rodada de ajustes do cliente, efeitos sonoros, correção de legenda, transições, export.
- Primeiros jobs (2026-10-04, `D:/kanivete_testes/worker/editor/teste.vknv`): EDITOR_01 8 ops 26 s (2 erros corrigidos:
  direcao × lado) · EDITOR_02 corte+ripple, câmera lenta, efeito, escala, whoosh, export — 9 ops, 0 erros, 16,5 s.

## Vetor Kanivete — `"app": "vetor"`
`executor_vetor.js` (window.VKW) só repassa para os comandos do app (`VKN.cmd(..., 'worker')`) — mesma API da interface e
do Claude. `ferramentas_vetor.json` (21): mapa, retangulo, elipse, texto, linha, estrela, alterar, mover, posicionar,
redimensionar, girar, alinhar, organizar, agrupar, duplicar, apagar, pathfinder, contornos, fechamento, corrigir,
exportar_pdf (agendado). Objetos pelo NOME; mm relativos à prancheta; `constraints`: `documento` (.aknv/.pdf/.ai/.svg/.pptx)
ou `novo: {nome, larg, alt, sangria}`, `pasta_exportacao`. Condições: `existe|cor|traco|texto|tamanho|x|y|larg|alt|sobreimprimir:NOME=v`,
`sem:NOME`, `objetos:N`, `fechamento_ok:x4`, `exportado`. Guia do app: `Instructions/vetor-kanivete.md`.
- `ferramentas_vetor.json` (26): + icone, qrcode, degrade, mesclar, efeito. VETOR_CARTAO_NOVOS_03 (2026-10-04): cartão com
  degradê, sombra, ícones Tabler e QR → 10 ops, 0 erros, 28 s (qwen3:8b). Lição: o modelo COPIA o 1º exemplo da descrição de
  um parâmetro opcional (pôs traço/preench "C0 M100 Y100 K0" sem pedirem) — descrição de parâmetro opcional diz "se o pedido
  não falar disso, NÃO mande"; `traco:N=nenhum` agora confere ausência de traço.
- VETOR_FLYER_03 (2026-10-04): flyer A6 do zero + alinhar + fechamento + PDF/X-4 → 8 ops, 0 erros, 20 s (qwen3:8b).
  Antes: fonte "Arial Bold" travou o fechamento (o app agora entende) e exportar_pdf não estava nas finais.

## Onde o Worker rende e onde não (medido 2026-10-04, sincero)
- RENDE: operar os apps (Editor, Photo, Vetor) por contrato — ~300 tokens meus por 8–10 operações.
- NÃO RENDE: inserir código que eu já escrevi (o contrato carrega o texto todo; VETOR_API_MAIN apagou a âncora,
  VETOR_INDEX espalhou 28 botões, VETOR_LINT não mudou nada e disse que corrigiu). Para código: só busca, rodar teste,
  mastigar log/traceback — saída curta que eu leria de qualquer jeito.

## Code Worker / Debug Worker (infraestrutura) — `tools/worker/codigo.py`
Mesmo Qwen3 8B, prompt e ferramentas próprios (não sabe de camadas; o de design não sabe de git). Ferramentas FECHADAS:
`buscar_codigo` (git grep), `ler_arquivo` (≤120 linhas), `aplicar_troca` (trecho exato; `todas`), `rodar_teste` (só os do
contrato: `node:arq.js` sintaxe, `py:arq.py` pyflakes, `teste:nome` = testes/teste_nome.py), `ver_diff`. Sem shell livre;
não mexe em .git, dist, build, `_credenciais.py`, nem fora de `arquivos`.
```
{"task_id": "X", "modo": "codigo", "goal": "...", "arquivos": ["tools/olho.py"], "testes": ["py:tools/olho.py"],
 "success_conditions": ["contem:tools/olho.py=LADO_PECA = 1280", "nao_contem:tools/olho.py=lado=1280)"]}
→ {"status", "worker", "files_changed", "tests": "1/1", "diff": "+3 -2", "resumo", "seconds"}
{"task_id": "Y", "modo": "debug", "goal": "...", "comando": "py:arq.py" | "log": "caminho"}
→ {"status", "causa", "arquivo": "arq:linha", "funcao", "correcao", "confianca"}
```
- O Claude escreve o contrato e **revisa o diff** (`git diff <arquivo>`), não o processo. Teste que compila não prova a
  mudança: ponha `success_conditions` (o 1º teste deu "success" sem criar a constante; py_compile → pyflakes + condições).
- Condições: `contem:arq=txt`, `nao_contem:arq=txt`, **`uma_vez:arq=txt`** (exatamente 1 vez) e **`max_linhas:arq=N`** (tamanho
  máximo do diff). Inserção SEMPRE com `uma_vez` + `max_linhas`: o VETOR_INDEX (2026-10-04) usou `todas=true` numa âncora
  comum (`</button>`) e espalhou 28 botões — passou como "success" só com `contem`. Âncora longa e única; peça para o `novo`
  repetir a âncora. `py:arquivo` reprova só aviso NOVO do pyflakes (os antigos do HEAD são ignorados).
- Repetiu a mesma chamada → cobra outra abordagem; 3 erros seguidos → gemma4:e4b pensando assume (`worker` na saída).
- Usar para: achar onde algo é tratado, troca mecânica/renomear, registrar ferramenta, rodar testes e mastigar log,
  diagnosticar traceback. NÃO para: arquitetura, bug de evento/estado, mudança grande.
- Primeiros jobs (2026-10-04): troca com constante 10 s (errada sem condições) → 65 s certa com reserva; debug de nome
  indefinido 11 s, causa e correção certas (0.95).
