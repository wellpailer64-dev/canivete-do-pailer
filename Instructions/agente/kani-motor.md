# Motor da Kani: bancada de modelos e escolha (2026-10-10)

**Decisão:** a Kani trocou do **Qwen3 8B** para o **Qwen3.5 9B** (Q4_K_M, unsloth, Apache 2.0, ~5,7 GB).
Tem a mesma velocidade e memória do Qwen3 8B, responde melhor e quase não inventa recursos que o app não tem.

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
