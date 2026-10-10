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

## Fase 2 (2026-10-10): os módulos seguem o plano
- **Threads:** `hardware.cpus()` substitui o `os.cpu_count()` em agente_midia, midia, organizador_de_videos, transicoes e
  video_cutter (pools e blocos paralelos). As sessões onnx do céu, do preencher e do remover fundo usam `hardware.threads_ia()`.
  No PC forte, os números são os mesmos de antes.
- **Memória (`memoria.py`):** o limite de "modelo parado" é multiplicado pelo plano (leve 60 s, médio 180 s, forte igual).
  Em qualquer PC, com a RAM livre abaixo de 10% (ou 1,2 GB), o que está parado há 20 s sai na hora.
- **Export:** `export_placa.memoria_placa()` lê do núcleo a memória de placas que não são NVIDIA. Placa integrada ou dedicada
  menor que 4 GB não usa o modo placa (`motivo()` = "placa integrada ou pequena").
- **Editor:** o plano vira o PADRÃO de Preferências › Desempenho. O que a pessoa escolheu continua valendo.
  - Cache de quadros na RAM: leve 512 MB, médio 768 MB, forte 1,5 GB.
  - Qualidade das prévias: 720p no leve. Isso também define a prévia leve de edição.
  - Prévia 1/2 só com a tela sem placa (`veTelaSemPlaca`, pelo renderer do WebGL).
- **Preferências › Desempenho › "Este computador":** mostra o nível, o processador, a RAM, a placa e o plano, e tem o modo
  Automático/Economia/Máximo (`prefsHwRender`/`prefsHwModo` em editor-render.js).
- `tools/hw_simular.py --limpo`: pastas de dados novas, como um app recém-instalado (sem preferências salvas).
- **Resultado no PC leve recém-instalado** (depo.vknv): **3 travadas** (dentro do limite; antes de tudo eram 16), buscas 28 → 17 e
  esperas 23 → 13. O custo é uma vez só: 31 s para preparar as prévias de 720p na 1ª abertura.
- Teste: `py -3.13 testes/teste_hardware.py [--app]`. São 12 verificações do núcleo e do plano, mais o editor no PC leve com e sem placa na tela.

## Pendências (em ordem)
1. **IA numa placa integrada:** remover fundo (DirectML), gerador_sfx, OmniVoice e melhorar áudio ainda escolhem sozinhos.
   Medir integrada × processador antes de decidir (sem integrada aqui: precisa de um PC de amigo ou de uma máquina emprestada)
   e respeitar `ia_na_placa`/`uma_ia_por_vez`.
2. **Kani no PC leve:** o 4B Q5 usa ~3,5 GB. Com 8 GB e o editor aberto, medir e ver se um Qwen3.5 menor compensa no nível leve.
3. **Medir no leve:** exportar (`teste_export.py --sem-abrir --porta`), o Photo com PSD grande e o remover fundo no processador.
4. **Validar num PC real fraco** (notebook de amigo): o simulador aperta CPU e memória, mas não reproduz uma integrada de verdade.
