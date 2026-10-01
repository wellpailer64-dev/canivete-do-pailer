# Melhorar Áudio

## Visão Geral

Deixa a voz com som de estúdio, como o Adobe Podcast Enhance. Aceita áudio, vídeo ou uma pasta. Em vídeo, a imagem
é copiada sem recodificar e só o áudio é trocado. A duração não muda, então a sincronia labial continua igual.
Saída ao lado do original: `<nome>_melhorado.<ext>` (o original é mantido).

Na ferramenta, ao terminar aparece um player antes/depois: os dois sons (`.m4a` alinhados em
`modelos_ia/melhorar_audio/tmp/previa`, apagados na próxima rodada) tocam juntos e a chave só troca qual está mudo,
então a comparação é no mesmo ponto. O botão **Abrir pasta** mostra o arquivo no Explorer (a pasta não abre sozinha).

## Arquivos

- `Functions/melhorar_audio.py`: orquestra tudo dentro do app. Lê o áudio (ffmpeg, 48 kHz mono), transcreve,
  escolhe onde rodar, masteriza e devolve o vídeo/áudio.
- `Functions/melhorar_audio_runner.py`: faz o trabalho pesado (Sidon + OmniVoice). Não importa nada de `Functions`
  para poder rodar num venv externo: `python melhorar_audio_runner.py payload.json resultado.json`.
- `main.py`: `melhorar_audio(caminho)` atende a ferramenta e `melhorar_audio_midia(caminho, mid)` atende o Pocket Editor.
- Frontend: página `page-melhorar-audio` (`index.html`) e `runMelhorarAudio` (`app.js`). No editor,
  `vePjMelhorarAudio` / `veMelhorarAudioProgresso` (`editor-projeto.js`).

## Etapas

1. **Transcrição**: `agente_midia.transcrever` usa o mesmo modelo do painel Texto, com o dicionário de nomes
   `dicionario_fala.json`, e devolve frases com tempo.
2. **Sidon** (`sarulab-speech/sidon-v0.1`): o w2v-BERT 2.0 limpa as features da fala e um vocoder sintetiza a voz de
   novo a 48 kHz. Os arquivos TorchScript `_cpu`/`_cuda` ocupam ~1 GB em `modelos_ia/melhorar_audio/hf_cache`.
3. **OmniVoice por cima**:
   - O áudio do Sidon vira tokens do codec do OmniVoice (8 camadas, 25 quadros/s).
   - As **2 primeiras camadas ficam** (o que é dito, a entonação e o tempo) e as outras 6 são geradas de novo
     (decodificação mascarada, 32 passos) com o texto do bloco e a própria voz como referência.
   - A referência é a frase de 3 a 10 s mais longa. O token `<|denoise|>` indica referência suja e pede saída limpa.
   - Os blocos têm até 12 s de fala. Fora da fala fica o áudio do Sidon, com uma rampa de 20 ms nas bordas.
   - O modelo `k2-fsa/OmniVoice` é o mesmo da Geração de Voz: `omnivoice_tool._effective_hf_home()`, baixado se faltar.
4. **Masterização**: `highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11`.
   - Saída em vídeo: AAC 256k (MOV/MXF: PCM 24 bits). HEVC em MP4/MOV recebe a tag `hvc1`.
   - Saída em áudio: WAV 24 bits ou M4A.

Sem fala reconhecida, fica só a limpeza do Sidon.

## Onde roda (`melhorar_audio.motor()`)

1. Venv externo com CUDA (os mesmos candidatos do OmniVoice, `omnivoice_tool._candidate_external_pythons()`).
   É o caminho mais rápido: ~47 s para 47 s de fala numa RTX 3050, contando o carregamento.
2. Dentro do app (torch CPU embutido). Bem mais lento.
3. Venv externo sem CUDA.

## Pocket Editor

Botão direito no painel Projeto ou num clipe da timeline → **Melhorar áudio**:
- Funciona com uma ou várias mídias, uma por vez em fila, no fundo.
- Gera só o som: `melhorar_arquivo(..., so_audio=True)` → `<nome>_melhorado.wav` (48 kHz, 24 bits). Se o som do vídeo
  começa depois da imagem (`start_time`), o `.wav` ganha esse silêncio no início para ficar no tempo do vídeo.
- A mídia guarda `mel` (o `.wav`) e `melOff` (chave desligada). O vídeo, os cortes, posições e efeitos não mudam:
  o mixer (`veAudioRegistrar` → `veMelFonte`) toca o `.wav` no lugar do som da mídia, a forma de onda é a dele e a
  exportação usa o `.wav` (`veMelArquivo`). Fica salvo no projeto (`media[].mel`, `m0.mel`).
- Enquanto processa, os clipes de áudio da mídia ficam listrados com "Melhorando N%" (`veMaDesenhar`) e o item do
  Projeto ganha o mesmo selo. Na fila: "Melhorando · na fila".
- Chave melhorado/original: selo "Melhorado" no painel Projeto (clique) ou "✓ Áudio melhorado" no botão direito.
  Troca na hora, inclusive tocando.
- Substituir mídia apaga o som melhorado (era do arquivo antigo). Se o `.wav` sumir, a mídia volta ao original.
- Se outro projeto foi aberto no meio, nada é trocado: só avisa onde o arquivo foi salvo.

## Por que essa combinação

Teste de 2026-09-30 com as falas da Helo (exemplos em `BRUTOS\Vídeos\Teste melhorar áudio\` do projeto 4 MILHÕES):

| Motor | Resultado |
|---|---|
| ClearerVoice (MossFormer2) | Limpa pouco |
| VoiceFixer | Robótico |
| resemble-enhance | Voz quebrada, "parece outro idioma" (treinado quase só em inglês) |
| **Sidon + OmniVoice médio** | O preferido |

Variar o número de camadas mantidas (`camadas` no payload): 4 = mais fiel ao original; 1 = reconstrói mais;
0 = refaz tudo pelo texto (pode perder a sincronia).
