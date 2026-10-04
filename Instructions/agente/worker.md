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
Próximo: mais ferramentas (texto novo, cena, gerar, receitas), ferramentas do editor de vídeo, medir jobs maiores.

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
- Repetiu a mesma chamada → cobra outra abordagem; 3 erros seguidos → gemma4:e4b pensando assume (`worker` na saída).
- Usar para: achar onde algo é tratado, troca mecânica/renomear, registrar ferramenta, rodar testes e mastigar log,
  diagnosticar traceback. NÃO para: arquitetura, bug de evento/estado, mudança grande.
- Primeiros jobs (2026-10-04): troca com constante 10 s (errada sem condições) → 65 s certa com reserva; debug de nome
  indefinido 11 s, causa e correção certas (0.95).
