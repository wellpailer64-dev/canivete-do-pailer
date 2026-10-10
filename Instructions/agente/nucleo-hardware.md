# Núcleo de hardware: o app se ajustar a cada PC (2026-10-10)

Objetivo: rodar bem em PCs diferentes. O piso combinado com o Pailer é **8 GB de RAM com placa integrada**,
testado em vários cenários.

## O que existe
- `Functions/hardware.py`
  - `detectar()` lê o PC em ~27 ms, sem subprocesso. Ele traz:
    - CPU, núcleos e threads, AVX2 e RAM;
    - **as placas de qualquer marca com a memória dedicada de verdade**, lida do registro (`HardwareInformation.qwMemorySize`),
      porque o Win32_VideoController trava em 4 GB;
    - se é integrada ou dedicada;
    - se o disco do app é SSD.
  - `nivel()` classifica em leve, médio ou forte.
  - `plano()` traz os números para os módulos: threads, cache do editor, tempo para soltar modelo, IA/export na placa e prévia.
  - `modo()`/`definir_modo()` guardam a escolha automático, economia ou máximo em `%APPDATA%/CaniveteDoPailer/desempenho.json`.
- API: `hardware_estado()` e `hardware_definir_modo(modo)`.
- `CANIVETE_HW_SIMULAR=leve|medio|forte|{json}` faz o app inteiro acreditar em outro PC.
- `tools/hw_simular.py leve [--sem-gpu-tela] [--porta N] -- comando` abre o app de teste apertado de verdade:
  - CPU presa a N lógicos (Job Object);
  - teto de memória = 70% da RAM simulada, valendo só para o app;
  - a NVIDIA fica escondida do CUDA/NVENC/Vulkan do llama.cpp;
  - `--sem-gpu-tela` deixa a WebView2 sem placa (é pior que uma integrada).
  - No fim, imprime o pico de memória.

## Linha de base (i7-10700K, 32 GB, RTX 3050)
- O app abre em 2,9 s e fica parado em ~1% de CPU. Trocar de ferramenta leva menos de 0,25 s.
- Memória em uso: ~650 MB, sendo 142 MB do Python e o resto da WebView2 (a GPU process tem 271 MB reservados).
- O Python reserva 608 MB na abertura, mas o `import main` é leve (0,3 s). O que reserva é o .NET do pywebview. Não é problema.

## Play do editor (`teste_play.py`, depo.vknv: 78 clipes Full HD 59 fps de celular)
"Travadas" são os quadros da página acima de 100 ms em 20 s; o limite é 3.

| Cenário | Antes | Depois das correções |
|---|---|---|
| Este PC, sem simulação | 30–90 travadas (200–300 ms); tocava só 11 s de 20 | **0–2 travadas** |
| Leve (4 threads, 8 GB, integrada) | 16 travadas | **7** (todas de 100–195 ms); memória no pico: 2,9 GB |
| Leve sem placa na tela | 20 travadas de ~900 ms | com a prévia em 1/2: travadas de ~300 ms, tocou 17 s em vez de 8,6 s |

Correções, que valem para todo PC:
1. **Leitura de tamanho a cada quadro.** `offsetParent`/`clientWidth` refaziam o layout da página inteira. O medidor de áudio
   sozinho comia 18% do play. Agora o `veTam(el, aoMudar)` (editor.js) guarda o tamanho com ResizeObserver e é usado pelo medidor,
   pelo `veMonitorScale` e pelo `veFitScale`.
2. **Medidor de áudio.** O fundo (escala, ~20 números, L/R, trilhos) é desenhado uma vez numa imagem guardada. A cada quadro ele só
   cola a imagem e desenha as barras. Isso tirava mais 10% do play.

Perfil de CPU do play: `D:/kanivete_testes/scripts/hw_perfil_play.py projeto.vknv porta [s]`. Depois das correções, ~90% do tempo
é trabalho nativo (decodificar e compor vídeo).

## Pendências (em ordem)
1. **Ligar o plano nos módulos** (fase 2). Hoje são ~15 lugares que adivinham sozinhos:
   - `os.cpu_count()` em midia, render_cache, transicoes, video_cutter, agente_midia, organizador, ceu, preencher_conteudo e removerfundo;
   - `memoria_placa()` do export_placa, que chuta 4 GB fora da NVIDIA;
   - `VE_CACHE_MAX_BYTES` (navigator.deviceMemory);
   - limites fixos do `memoria.py` (`soltar_modelo_s`);
   - IA na placa: remover fundo, gerador_sfx, omnivoice e melhorar_audio (`ia_na_placa`, `uma_ia_por_vez`).
2. **Prévia automática.** Ir para 1/2 só quando a tela estiver sem placa: no JS, o renderer do WebGL com SwiftShader/"Basic Render".
   Com integrada, a 1/2 não muda nada (medido).
3. **PC leve com integrada.** Buscas e esperas ainda passam do limite (2 decks decodificando 1080p59 em 4 threads).
   Próximo teste: cópia de edição leve (proxy 720p) gerada sozinha no nível leve.
4. **Preferências › Desempenho:** mostrar o PC detectado e o modo (automático, economia, máximo).
5. Medir no leve: exportar (`teste_export.py --sem-abrir --porta`), Photo, Kani e remover fundo no processador.
