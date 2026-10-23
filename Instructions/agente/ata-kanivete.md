# Ata Kanivete (At, verde #1FA971) — Beta

Grava a reunião do Google Meet pelo Kanivete e a Kani escreve a ATA (ver, editar, baixar PDF no modelo padrão).
Pedido do Pailer em 2026-10-17. Publicada como **Beta** (selo na barra lateral e no cabeçalho).

## Arquivos
- `Functions/ata_kanivete.py` — Meet (Chrome à parte + CDP), sessões, processar, ATA da Kani, PDF.
- `frontend/ata/captura.js` — injetada no Meet (`Page.addScriptToEvaluateOnNewDocument`): grava, legendas, participantes, botão.
- `frontend/js/ata.js` + `frontend/css/ata.css` — aba (`#page-ata-kanivete`, `ataAoTrocar`), API `ATA_API`.
- `main.py` — `ata_*` (listar/abrir/salvar/apagar/importar/meet_abrir/meet_cmd/meet_estado/processar/reescrever/pdf/audio).
  Eventos para a tela: `_js("ataEvento", {tipo: gravando|gravado|progresso|pronta|erro|cancelado|fechado, id, p, msg})`.
- Dados: `<raiz_dados()>/Ata Kanivete/<AAAA-MM-DD_HHMMSS>/` (eu.webm, outros.webm, eventos.jsonl, ata.json);
  perfil do Chrome do Meet (login salvo) em `<raiz_dados()>/Ata Kanivete/navegador`. Modelos: `modelos_ia/ata` (~33 MB).

## Caminho
1. **Meet**: Chrome/Edge do PC aberto com `--remote-debugging-port` e perfil próprio (o Google aceita o login: não é
   navegador "automatizado"). O app fala CDP direto (`websockets.sync`), sem Playwright: `Runtime.addBinding("ataEnviar")`
   + script antes da página. A captura grava o microfone que o Meet pediu (`eu`) e os áudios recebidos (`outros`) em Opus
   24 kb/s, blocos de 5 s (~10 MB/h por faixa). Gravar/Parar pelo botão por cima do Meet ou pela aba (`__ata.botao(bool)`,
   `Runtime.evaluate` com `userGesture`).
2. **O Meet NÃO entrega áudio por pessoa**: só ~3 áudios mistos (quem fala mais alto). A API oficial por participante
   (Meet Media API) está em Developer Preview. Por isso: faixa própria para a voz do usuário + separar vozes nos outros.
3. **Transcrição**: Parakeet TAGARELA (o modelo das legendas), mas com VAD de reunião (`VAD_REUNIAO`: trechos ≤ 12 s,
   pausa 0,35 s). Com os 20 s das legendas o modelo devolveu trecho VAZIO (perdeu 20 s) e o corte forçado partiu
   "cinco mil" em "cinco anos. Mil". Glossário corrige termos parecidos (`_glossario_aplicar`, ≥ 0,78).
4. **Vozes**: sherpa-onnx (pyannote segmentation 3.0 + wespeaker resnet34 voxceleb), limiar 0,5. Medido na reunião falsa
   de 4 vozes (`D:/kanivete_testes/ata/limiar.py`): 0,5 = 8 grupos com 95,6% de pureza; 0,6–0,7 = 5 grupos 84%; 0,8 = 3
   grupos 66%. Melhor separar demais e deixar o usuário dar nome (mesmo nome = mesma pessoa; ▶ ouve um trecho).
   Com o indicador de quem fala (simulado) + regra mista: 97,7% das palavras com o nome certo.
5. **Nomes**: legendas do Meet (região `[role=region][aria-label*=egenda]`, linha que bate com um participante) votam o
   nome de cada grupo. Sem legenda: "Pessoa N". A voz do microfone = nome do usuário (`data-self-name`) ou "Eu".
6. **ATA**: `kani_maos._llm_json` com `SCHEMA` (pauta, resumo, discussão, decisões, tarefas, pendências, próxima).
   Contexto da Kani 8 k: acima de `BLOCO_PALAVRAS` (2200) vai em partes e depois junta. ~20–30 s numa reunião curta.
7. **PDF**: PyMuPDF `Story` (HTML → PDF) com Segoe UI do Windows, faixa verde no topo, rodapé "Ata Kanivete · página".

## Rodada 2 (2026-10-17)
- **Para sozinho ao sair da chamada** (captura.js `vigiar`: botão "Sair da chamada"/"Leave call" some por 3 s depois de
  visto durante a gravação). Opção **"Gravar sozinho ao entrar"** (localStorage `ata-auto` → `meet_abrir(auto)` injeta
  `window.__ataAuto`; troca ao vivo por `meet_cmd('auto1'|'auto0')`); parou na mão ainda na chamada = não religa.
  Se o Meet mudar o rótulo do botão, nada é automático (o manual continua).
- **Recuperação**: `listar()` (com cache por data do ata.json) vira "gravado" a sessão presa em "gravando" (app/PC caiu;
  duração = último evento; aviso `interrompida` na tela) e destrava "processando" que não está em `_em_processo`.
- **Cancelar** o processamento (`ata_cancelar` → `stop`; transcrição salva antes da Kani, então cancelar não a perde).
- **Busca** em todas as reuniões (`buscar`: título, falas, ATA, sem acento) → abre a transcrição na fala achada.
- **Player** da transcrição: `mix.webm` (eu + outros, ffmpeg amix, com índice: o .webm do MediaRecorder não pula no
  tempo), feito no processar ou no 1º play (`audio_mix`); fala acesa durante o play, velocidade, espaço = play/pausa.
- **Tarefas** com ✓ (`feito`), contador na lista e "Tarefas em aberto" de todas as reuniões na tela inicial
  (`tarefas_abertas`, `marcar_tarefa`). PDF/Word marcam "(concluída)".
- **Estilos de ATA** (`ESTILOS`: formal, resumida, detalhada, cliente, equipe, aula) + **pedido livre à Kani** (`doc.pedido`),
  na aba "Falantes e ajustes".
- **Copiar** em texto (formato WhatsApp) e **Word** (`exportar_docx`, python-docx). **Kani** lê a ATA aberta (`KANI_TELA`).
- Teste avulso: `D:/kanivete_testes/scripts/teste_ata_r2.py` (app em 9333; só lê, não grava nas reuniões).

## Medições (2026-10-17, RTX 3050)
Reunião falsa de 2min17s: importar + transcrever + separar + ATA = 90 s. Transcrição 10× o tempo real; separação ~6×.
Gravação real do Pailer (72 s, só ele) transcreveu bem; errou só nomes próprios (glossário resolve).

## Armadilhas
- Parakeet e Silero só no processador (`providers=legendas.CPU`): pela placa (DirectML) falhava com `UnicodeDecodeError`.
- `sherpa_onnx/lib` traz um `onnxruntime.dll` próprio: carregar DEPOIS do onnxruntime-directml (a transcrição vem antes
  no `processar`). Ordem invertida não foi testada.
- Convidados SEM login entrando por janela automática são barrados pelo Meet ("Não é possível participar"), mesmo com
  acesso Aberto: participantes de teste precisam de contas Google logadas (`D:/kanivete_testes/ata/meet/bots.py --login N`).
- Meet usa Trusted Types: nada de `innerHTML` na captura.

## Pendências (Beta)
- **Teste numa call real com várias pessoas** (o teste com contas extras ficou para quando o Pailer voltar):
  conferir faixa `outros`, legendas → nomes, e o seletor da legenda (pode ter mudado).
- Descobrir no DOM do Meet o indicador de quem está falando (melhor que a legenda; precisa de call com 2+ pessoas).
- Meet aberto em outra aba do Chrome não é capturado (só a aba que o app abriu).
- Lobby padronizado (`lobby.js`) e ícone de arquivo: não tem (não há arquivo de projeto).
- Teste automático (`testes/teste_ata.py`) ainda não existe; scripts avulsos em `D:/kanivete_testes/ata`.
