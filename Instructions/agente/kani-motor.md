# Motor da Kani: bancada de modelos e escolha (2026-10-10)

**Decisão atual (Fase 3, 2026-10-10):** a Kani usa o **Qwen3.5 4B Q5_K_M** (unsloth, Apache 2.0, ~3,1 GB); no Ollama, `qwen3.5:4b`.
Tem a mesma nota do 9B, é ~60% mais rápido e usa ~2 GB a menos na placa. Detalhes nas Fases 2 e 3, no fim.
Antes (Fase 1): a troca foi do **Qwen3 8B** para o **Qwen3.5 9B** (Q4_K_M, ~5,7 GB). Tinha a mesma velocidade e memória, respondia melhor e quase não inventava recursos.

## Onde está
- Código: `Functions/kani.py`. `GGUF`/`GGUF_URL` apontam para o modelo baixado sob demanda; `OLLAMA_MODELOS = ("qwen3.5:9b", "qwen3:8b")`
  é a ordem de preferência no Ollama, e `_ollama_tem()` grava o escolhido em `OLLAMA_MODELO`. `GGUF_ANTIGOS` lista modelos
  antigos que são apagados quando o novo termina de baixar.
- Bancada: `testes/kani_bancada/bancada.py`, com os resultados em `testes/kani_bancada/resultados/`.
  - Rodar: `py -3.13 testes/kani_bancada/bancada.py modelo1 modelo2 ...`. Os modelos precisam estar no Ollama.
  - Variáveis: `NP_MULT=9` multiplica o limite de tokens (necessário para modelos que pensam mesmo com `think:false`, como o DeepSeek-R1) e `SUFIXO` muda o nome do arquivo de saída.
  - `honestidade.py` faz a rodada extra de "inventa recurso?" e grava `resultados/honestidade.json`.
- **Quando sair um modelo novo** de até ~9B que caiba na RTX 3050 8 GB: `ollama pull`, rodar as duas bancadas e comparar com a tabela abaixo.
  Corrija à mão os falsos positivos da nota automática (ver Lições).

## Como foi medido
Os prompts são os mesmos que o app manda de verdade, todos no Ollama na RTX 3050 8 GB, com `think:false`, seed 42 e temperatura 0,6.
- **A) Ajuda do app:** perguntas reais de usuário com o sistema e os trechos reais da Kani (`kani._sistema`, BM25 no `kani_kb.json`).
  A nota sobe com os fatos esperados e cai com nome técnico/arquivo de código ou com recurso inventado.
- **B) Reescrever pedido de efeito sonoro** (`gerador_sfx.SISTEMA_PEDIDO`), 12 pedidos. Conta como certo se sair em inglês,
  no tamanho certo, sem palavras proibidas e sem fugir do pedido.
- **C) Seguir formato JSON** no estilo de contrato do Worker, 6 tarefas. Conta como certo se o JSON for válido com os campos e valores certos.
- **D) Velocidade e memória:** tokens/s, tempo até a 1ª palavra, carga e VRAM (`/api/ps`).
- **Honestidade:** 6 perguntas. Quatro pedem recursos que **não existem** (live no YouTube, editor de planilhas, edição online
  com cliente em tempo real, gerar música inteira) e duas pedem recursos que existem (texto para voz, tirar fundo).

## Resultados
"Ajuda" é a nota corrigida à mão, de 0 a 10. "Inventou" conta os recursos inexistentes que o modelo ensinou a usar, de 0 a 4
(meio ponto = inventou só em parte).

| Modelo | Ajuda | Inventou | Efeito sonoro | JSON | tok/s | 1ª palavra | VRAM | Veredito |
|---|---|---|---|---|---|---|---|---|
| **Qwen3.5 9B** | 9,4 | 0,5 | 12/12 | 4/6 | 33,5 | 0,6 s | 5,2 GB | **escolhido** |
| Qwen3 14B IQ3_XXS | 10,0 | 0,5 | 12/12 | 4/6 | 22 | 0,4 s | 6,0 GB | lento, ocupa a placa toda; disse que 1080×1920 é horizontal |
| Qwen3 8B (antigo) | 8,8 | 2 | 11/12 | 5/6 | 36 | 0,2 s | 5,2 GB | inventou botão "Compartilhar" para edição online |
| Llama 3.1 8B | 8,8 | 4 | 12/12 | 5/6 | 37 | 0,2 s | 4,9 GB | inventa quase tudo → apagado |
| DeepSeek-R1 8B | 8,4 | — | 8/12 | 6/6 | 34 | 12 s | 5,2 GB | pensa mesmo com `think:false`, 12 s até a 1ª palavra → apagado |
| Gemma 4 E4B | 7,5 | — | 12/12 | 5/6 | 74 | 0,3 s | — | rápido, mas responde raso; fica como o "olho" do Worker |

Exemplo do que pesou (pergunta: convidar o cliente para editar o projeto online, em tempo real):
- **Qwen3 8B:** "Clique no botão **Compartilhar** (geralmente está no canto superior direito)..."; esse botão não existe.
- **Qwen3.5 9B:** "o KANIVETE roda apenas no seu computador e não possui convite de outros usuários ou edição online em tempo real".

## Lições
- **A nota automática erra**, por isso os resultados foram corrigidos à mão. Exemplos de falso positivo:
  - a regex de "internet" pegava respostas certas;
  - a regex de nome técnico marcava "vetor", que é uma palavra comum no app.

  Leia as respostas antes de decidir: `res_*.json` guarda o texto de cada uma.
- A honestidade (não inventar botão) vale mais do que um ponto a mais em JSON: quem usa a Kani é o usuário final, não o Worker.
- Um 14B quantizado em 3 bits cabe na placa, mas é mais lento e erra fatos simples. Não compensa.
- Modelos que "pensam" (DeepSeek-R1) ignoram `think:false` e gastam o limite de tokens antes de responder.

## O que não mudou
- O Worker, o Arquiteto e o roteiro (ferramentas de desenvolvimento) continuam no `qwen3:8b`, que está mantido no Ollama.
  Ficaram também o `qwen3:1.7b`, o `gemma4:e4b` e o Qwen3 14B.
- `gerador_sfx.melhorar_pedido` usa `kani._ollama_tem()` / `kani.OLLAMA_MODELO`, então passou a usar o 9B sozinho.

## Ajustes que a troca pediu (medidos no 9B, 3–5 tentativas por pergunta)
- **Botão "abrir ferramenta":** o 9B escrevia `[[remover-fundo]]` sem o `abrir:` e acertava 0/3. Agora o prompt traz um
  exemplo literal e a gaveta (`kani.js`) também aceita `[[id]]` quando o id é de uma ferramenta: 3/3.
- **Caixinha de texto pronto (```texto):** com um exemplo concreto o 9B acerta 13/15. Sem exemplo, 10/15.
  O exemplo precisa ser de outro assunto (padaria): um exemplo de "Dia do Instrutor" foi copiado palavra por palavra no teste.
  Quando escapa, a resposta ainda tem o Copiar geral.
- Pelo llama.cpp b11483 (o motor dos amigos), o Qwen3.5 roda a 27 tok/s, com `enable_thinking:false` respeitado.

## Troca automática no PC dos amigos
Quem já tinha a Kani está com `modelos_ia/kani/Qwen3-8B-Q4_K_M.gguf` e sem Ollama.
- `estado()` devolve `atualizar: true`. A gaveta, ou a checagem 30 s depois de abrir o app, chama `kani_baixar` por baixo,
  sem barra (`kaniTrocarModelo`).
- Enquanto baixa, `_gguf()` usa o modelo anterior: a Kani continua respondendo.
- No fim, `baixar()` espera a resposta em andamento, desliga o motor, apaga o anterior (`_apagar_antigos`) e avisa
  "A Kani foi atualizada". A próxima conversa já sobe com o novo.
- Se o disco não tem espaço para os dois, o anterior é apagado antes. Se der erro, não tenta de novo até o app reabrir.
- Conferido de ponta a ponta com o modelo anterior de verdade e o download por um servidor local: `D:/kanivete_testes/scripts/kani_troca.py`.
  O teste de interface fica em `testes/teste_kani.py`, no último item.
- Próxima troca de modelo: ponha o atual em `GGUF_ANTIGOS` e troque `GGUF`/`GGUF_URL`/`TAM`. O resto se repete sozinho.

## Fase 2: Ministral 3 8B Instruct × Qwen3.5 9B (2026-10-10)
Ministral 3 8B Instruct 2512 (Mistral, Apache 2.0, Q4_K_M, `ollama pull ministral-3:8b`; o GGUF oficial do HF é o mesmo).
Mesmas provas da tabela acima, notas corrigidas à mão, mais a **entrevista do Worker** (`tools/worker/entrevista.py`, 40 pedidos reais do Photo).

| Modelo | Ajuda | Inventou | Efeito sonoro | JSON | Worker 1 volta | Worker c/ voltas | s/pedido Worker | tok/s | 1ª palavra | VRAM |
|---|---|---|---|---|---|---|---|---|---|---|
| **Qwen3.5 9B** | 9,4 | 0,5 | 12/12 | 4/6 | 92,5% | 90% | 2,3 | 32 | 0,6 s | 5,2 GB |
| Ministral 3 8B | 8,8 | 0,5 | 9/12 | 3/6 | 35% | 86% | 1,5 | 35 | 0,2 s | 5,3 GB |
| qwen3:8b (Worker atual) | 8,8 | 2 | 11/12 | 5/6 | 95% | 95% | 1,1 | 34 | 0,2 s | 5,2 GB |

**Veredito:** o Ministral perde nas duas frentes. A Kani continua no Qwen3.5 9B e o Worker continua no qwen3:8b.
- Ajuda: responde bem e é honesto no "não existe". Mas inventa detalhes dentro de recursos reais: "aba Captura de tela"
  no Editor para fazer live, "qualidade 16/32/64 KB/s" no Texto para Voz. Também quebrou a caixinha ```texto e escreveu
  um roteiro longo quando o pedido era de uma legenda curta.
- Efeito sonoro: usou "groan" 2×. "Impacto tipo trailer de filme" virou *trailer truck* (a nota automática deu certo nesse caso).
- JSON: disse que 1080×1920 é horizontal, errou a soma e inventou a ação "t".
- Worker: antes de agir, sempre chama `listar_camadas`, mesmo com os nomes das camadas no sistema. Com uma volta só, isso dá 35%.
  Com voltas (como o `worker.py` de verdade) sobe para 86%, mas errou o sentido de "anti-horário" e parou só lendo em 2 pedidos.
- Qwen3.5 9B no Worker: 90% e 2× mais lento que o qwen3:8b. Não compensa trocar o Worker.

Novidades na bancada:
- `ENTREVISTA_VOLTAS=3` na entrevista: devolve a leitura de camadas ao modelo e deixa ele seguir, como o executor.
  Use para os modelos que "olham antes de agir". Nesse modo, a leitura sempre devolve a lista de camadas, por isso a categoria "leitura" fica prejudicada para todos.
- `ENTREVISTA_SAIDA=arquivo.json` não sobrescreve o resultado antigo.
- `honestidade.py modelo1 ...` soma ao `honestidade.json` sem apagar os modelos que já estavam lá.

## Fase 3: Qwen3.5 4B (a Kani precisa dos 9B?) (2026-10-10)
Testei o unsloth `Qwen3.5-4B-GGUF` Q5_K_M (3,1 GB) e Q4_K_M (2,7 GB), além do `qwen3.5:4b` oficial do Ollama (Q4_K_M).
No Worker, os casos "botão" × "botao" foram contados como certos, porque o `executor.js` ignora acentos (`norm`).

| Modelo | Ajuda | Inventou | Caixinha sem pedir | Efeito sonoro | JSON | Worker | s/pedido Worker | tok/s | VRAM (conversa) |
|---|---|---|---|---|---|---|---|---|---|
| **Qwen3.5 9B** | 9,4 | 0,5 | 0/13 | 12/12 | 4/6 | 90% | 2,3 | 32 | 5,2 GB |
| 4B Q5_K_M | 9,4 | 0 | 3/13 | 12/12 | 4/6 | 99%* | 3,8* | 50 | 3,5 GB |
| 4B Q4_K_M | 9,4 | 0 | 3/13 | 10/12 | 4/6 | 97,5%* | 3,6* | 56 | 3,1 GB |
| 4B Q4 oficial Ollama | — | — | — | — | — | 94% | 1,3 | 53 | ~3,1 GB |

\* O 4B do Hugging Face no Ollama **pensa no Worker mesmo com `think:false`** (250–400 caracteres antes de agir; o template do GGUF
não respeita o desligar). Isso deixa ele mais lento e ajuda a nota. O `qwen3.5:4b` oficial respeita: 94%, 1,3 s, e este é o número justo.
Na conversa não pensou (1ª palavra em 0,4 s).

**Conclusão:** o 4B empata com o 9B no conteúdo, é ~60% mais rápido e libera ~2 GB da placa. Os defeitos dele:
- põe a caixinha ```texto (Copiar) onde ninguém pediu, em 3 de 13 respostas, às vezes repetida ("Seu fundo foi removido! 🎨");
- o Q4 escreveu 2 dos 12 pedidos de efeito sonoro em português (o Q5 não errou nenhum);
- no Worker, erros de sentido: "dobra" → 1.2, "sobe 30px" → dy +30.
Antes de trocar: corrigir a caixinha no prompt/gaveta e medir no llama.cpp (o motor dos amigos), conferindo que `enable_thinking:false` vale para o 4B.

### Troca feita (2026-10-10): Kani → Qwen3.5 4B Q5_K_M
- `kani.py`: `GGUF`/`GGUF_URL`/`TAM` passam a apontar para o 4B Q5. `GGUF_ANTIGOS` = 9B e 8B. `OLLAMA_MODELOS` = 4b, 9b, 8b.
- **No llama.cpp b11483 (o motor dos amigos):** ~48 tok/s (o 9B fazia 27), `enable_thinking:false` respeitado (não pensou em 0/24 respostas),
  caixinha certa em 9/9 nos pedidos de texto e ausente em 14/15 nos "como faço". O defeito da caixinha é bem menor aqui do que no Ollama com o GGUF do HF.
- **Proteção na gaveta** (`kaniSemCaixaFalsa` em `kani.js`): resposta com `[[abrir:id]]` de uma ferramenta que existe não mostra a caixinha
  ```texto. Isso vale para o desenho, o Copiar e a voz. Uma regra só no prompt não resolveu (13/15, dentro do ruído).
  O id precisa existir porque uma legenda de verdade veio com `[[abrir:editor-video]]` inventado.
- `qwen3.5:4b` oficial do Ollama: efeito sonoro 12/12, caixinha 15/15. Ele é quem atende o `gerador_sfx` para quem tem Ollama.
- Medições: `D:/kanivete_testes/scripts/kani_caixinha.py` (modelo `llama` = llama-server na porta 8099).
  Troca no PC do amigo (9B → 4B): `kani_troca.py` APROVADO. `testes/teste_kani.py` PASSOU (14/14, com a checagem da caixinha falsa).
