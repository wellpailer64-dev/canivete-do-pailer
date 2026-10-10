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

## Fase 3 (2026-10-10): exportar, recortar e Kani no PC leve
Medido com `tools/hw_simular.py leve --sem-app -- comando`, que roda um script Python dentro da simulação, sem abrir o app.

**Exportar** (`D:/kanivete_testes/encoder/bench.py DEPO_ATUAL`, depoimento de 98 s):
- No forte: 101 s.
- No leve: 669 s. O gargalo era o x264 `medium`. Num trecho de 20 s, decodificar leva 8 s; o medium crf18, 35 s; o veryfast crf17, 13 s.
  A qualidade foi a mesma (SSIM 0,949 e PSNR 32,5 nos três) e o arquivo saiu +4%.
- Agora `plano()["export_cpu_preset"]` (leve veryfast, médio faster) é aplicado por `video_cutter._preset_cpu`, com o CRF 1 abaixo.
- Resultado no leve: **669 → 522 s** (−22%). Os efeitos e a cor também pesam no processador.

**Remover fundo no processador**, com 4 threads: isnet 2 s, birefnet-lite 7 s, BEN2 18 s.
- O **BiRefNet-matting estourava o PC de 8 GB**: tinha 8,8 GB de pico, ou 6,4 GB sem a arena do onnxruntime.
  - As sessões na CPU agora ficam sem arena (`enable_cpu_mem_arena=False`), na mesma velocidade.
  - `recorte_pro.cabe_matting()` decide: com menos de 15 GB de RAM e sem placa dedicada de 6 GB ou mais, a pessoa sai pelo BEN2.
- Resultado: o recorte de pessoa no leve passou a sair em 21 s, com pico de 4,2 GB.

**Kani no leve** (4B Q5, 4 threads, sem placa):
- Escreve a 4,7 tok/s e lê a 31 tok/s. O sistema tem ~2.500 tokens (~2.000 deles fixos).
- **Bug corrigido:** a fase 2 encurtou o "modelo parado" para 60 s, e o vigia derrubava o llama-server no meio da resposta.
  Agora `kani._parar_ocioso` só desliga parado de verdade e `_marcar_uso` marca cada uso.
- **Aquecer:** abrir a gaveta (`kani_voz(true)` → `kani.aquecer`) sobe o motor e lê a parte fixa enquanto a pessoa digita.
- **Lote 128 sem placa (`-ub 128`):** o Qwen3.5 é híbrido, e o llama.cpp guarda o marcador um lote antes do fim.
  Com lote menor, ele relê ~900 tokens em vez de ~1.400.
- Resultado: **1ª palavra 102 s → 36 s.**
- No leve a voz não fica carregada com a gaveta aberta. Ela carrega só no Ouvir.
- Qwen3.5 **2B** testado como Kani do leve:
  - É 2,3× mais rápido, com 10,6 tok/s, e usa 1,7 GB.
  - **Inventa:** disse que gera música pela Geração de Voz e que manda direto para o TikTok, e falou de "HTML/CSS/JS" com o usuário.
  - Por isso foi descartado (honestidade vem primeiro, kani-motor.md).

## Fase 4 (2026-10-10): Photo, partida e o resto da exportação no PC leve
- **Photo, PSD real de 284 MB** (3000×3928, 9 camadas; cópia em `D:/kanivete_testes/hw/psd/carrossel.psd`): abre em ~9–11 s nos dois PCs.
  - No leve, a memória reservada da árvore chega a 4,7 GB de 5,6. Desse total, a GPU process da WebView tem 1,9 GB reservados
    (0,45 GB em uso) e o Python 1,4 GB.
  - O psd_tools deixa ciclos de referência: `editor_imagem.liberar` agora roda `gc.collect()`, e o Python em uso cai de 0,36 para 0,10 GB.
  - Medir: `D:/kanivete_testes/scripts/hw_photo_psd.py porta arquivo.psd`.
- **Partida no leve:** o app fica parado (~0% de CPU) desde 5 s depois de abrir. Não há tarefa de fundo pesando (`hw_partida.py`).
- **Exportar pela CPU, o que sobra** (`hw_capturar_cmd.py` + `hw_ablacao.py`, 15 s do depo no leve):
  - Os filtros sozinhos, sem gravar, levam 36 s.
  - Nenhum dos suspeitos pesa: a base em yuv444p, a escala animada parada em 1,0 e a ida e volta a RGBA da opacidade fixa ficaram todos com menos de 2%.
  - O custo está espalhado pela montagem (60 entradas, 30 sobreposições, cor). Num notebook Intel, o ganho seguinte é
    o Quick Sync (h264_qsv, que o app já detecta) na gravação. Medir num PC real.

## Fase 5 (2026-10-10): play — o vídeo correndo atrás do som
- O teste de play passava do limite de buscas e esperas até no PC forte. O grampo `D:/kanivete_testes/scripts/hw_buscas.py`
  anota quem pede cada busca e mostrou o motivo:
  - o `veSeguirAudio` buscava o player da tela "para onde o som está agora";
  - a busca leva ~0,3 s e o som segue andando, então o player chegava atrasado de novo;
  - isso virava ciclo de busca, espera, busca (12 buscas e 15 esperas em 20 s, todas no player da tela).
- Correção (`VEAV` em editor.js):
  - mira onde o som VAI estar: a latência é medida pelo evento `playing` de cada busca (média móvel, 0,05–0,8 s);
  - não busca enquanto o player está carregando (`readyState < 3`) nem nos 250 ms depois de uma busca.
- Resultado no depo (os dois passam em todos os limites):

  | PC | Buscas a cada 10 s | Esperas a cada 10 s |
  |---|---|---|
  | Forte | 17–19 → 10–14 | 12–15 → 6–10 |
  | Leve recém-instalado | → 10–14 | → 6–10 |

- **Sincronia de imagem × som**, medida com `hw_sinc.py`, que compara com a função antiga trocada na página:
  - quadros fora de ±40 ms: 5–7% → 2–5%;
  - 90% dos quadros: até 33 ms → até 26 ms.

## Fase 6 (2026-10-10): Vetor — zoom numa malha de degradê congelava
- `D:/kanivete_testes/idv/idv_v2.aknv` (21 MB) tem 7 malhas 3D com 8.580 células. Medido com `hw_vetor.py` e `hw_vetor_perfil.py`:
  - o redesenho normal leva 5 ms;
  - o **1º redesenho depois de um zoom 4× levava 20–26 s** no PC forte e 29 s no leve.
- A causa estava em `vkMalhaDesenhar`: fatias de ~3 px da tela, cada uma com fill + stroke e conversão CMYK. No zoom isso virava
  centenas de milhares de polígonos.
- **Correção** (`vetor-malha.js`):
  - `vkMalhaRaster` pinta pixel a pixel. A inversa bilinear acha (u, v) na célula e mistura as cores dos 4 nós, que já vêm com a prova de cor.
  - O teto é `VK_MALHA_MAX_PX` = 2 MP. Acima disso, pinta menor e amplia na tela.
  - O PDF continua vetorial (ShadingType 6).
- **Resultado:**
  - malha sozinha: 41 → 3 ms ajustada e 352 → 10 ms no zoom 4×;
  - tela inteira: 2,2 s → 46 ms e 20 s → 0,3 s;
  - PC leve: o pior redesenho caiu de 29 s para 14 ms.
  - De quebra, sumiram defeitos da versão antiga: chuvisco no brilho, listras na borda e um risco preto entre células 3D.
    Veja `D:/kanivete_testes/hw/malha_cmp_z4.png` (antiga à esquerda).
- `testes/teste_vetor.py` PASSOU: 159 ok, sem erro de JS.

## Fase 7 (2026-10-10): Sound Kanivete — a tela caía para 8 quadros/s no play
- Medido com `D:/kanivete_testes/scripts/hw_som.py` (N faixas com áudio longo, travadas acima de 100 ms em 20 s de play).
  Com 2 faixas: 152 travadas no PC forte, e a tela caía de 30 para 8 quadros/s.
- O JS estava 93% parado. O culpado era o **processo gráfico da WebView, em 100% de um núcleo**: `skDesenhar` refazia a linha
  do tempo inteira a cada quadro, com a onda em um retângulo de 1 px por coluna (milhares por faixa).
- **Correção:**
  - `skDesenharPlay` (som.js) cola a imagem guardada pelo último `skDesenhar` e desenha só a agulha e a barra.
  - Uma edição redesenha tudo. A imagem guardada é invalidada ao virar a página (`x0`), pelo zoom e pelo ResizeObserver do canvas.
  - A onda virou um contorno só (envelope de cima e de baixo): a imagem saiu idêntica pixel a pixel na fala real (`hw_som_onda.py`).
  - `skSeguir` lê o tamanho pelos atributos do canvas, sem forçar layout.
- **Resultado com 6 faixas:** 0 travadas no forte e no leve, com metade da CPU. `testes/teste_som.py` PASSOU (74 ok).

## Fase 8 (2026-10-10): primeiro play e arraste da agulha
**Feito: contenção de CSS nos painéis** (`.ve-dgroup { contain: content }`, editor.css).
- Esconder painel por painel no play (`hw_paineis_custo.py`) mostrou Soundboard, Desempenho e Transições sendo repintados a cada quadro.
- Com a contenção, a pintura caiu de 11,3 para 5,7 ms por quadro e as camadas de 8,1 para 4,5 ms.
- O play passa 3/3 de novo, e o arraste cruzando vídeos caiu de 132 para 89 ms por movimento.
- Os menus e as janelinhas do editor vão para o `body` ou para o `.ve`, fora dos painéis: conferido no código e em foto do clique direito.

**Medido e DESCARTADO** (sem ganho que valesse a complexidade; não repetir sem ideia nova):
- *Aquecer os efeitos ao abrir o projeto* (rodar `veFxRender` numa imagem 64×36): o 1º play foi de 9/14/11 travadas para 6/1/10,
  que é variação demais para concluir.
  O efeito de cor é barato depois de pronto: 1,6 ms no tamanho do monitor e 3 ms em Full HD.
  O que difere no 1º play é que ainda não existe quadro guardado no cache de RAM e os vídeos estão sendo lidos pela 1ª vez.
- *Juntar os movimentos do arraste* (`rAF`) e *desenhar o monitor só no `seeked`*: nenhuma mudança medida.
- *Garagem de players* (pool por mídia, LRU pelo núcleo de hardware) no deck da tela e nos players das prévias renderizadas:
  - no deck da tela, as recargas no vai e vem caíram de 19 para 3;
  - nas prévias renderizadas, de 64 para 46, porque cada trecho é um arquivo e o vai e vem passa por mais trechos do que cabem;
  - resultado: −11% no tempo por movimento no PC forte e nada no leve. Desfeita.

**Diagnóstico do arraste** (`hw_scrub.py`, `hw_rastro.py`):
- dentro de um vídeo só, 35 ms por movimento e 2 travadas;
- cruzando vídeos, 89 ms. Cada troca de arquivo faz o navegador recarregar o vídeo, e os dados passam pela thread principal da página
  (`ResponseBodyLoader`, ~6,8 de 8 s).
- A solução de fato é a dos editores profissionais: **decodificar fora do navegador** (um servidor de quadros nativo, ffmpeg ou Media
  Foundation, que entrega quadros prontos ao monitor durante o arraste). É um projeto de arquitetura, não um ajuste.

**Teste de play:** `teste_play.py` agora pega os players depois do `veSeek(ini)`. Uma busca parada pode trocar o player, e os ouvintes
ficariam no player velho.

## Fase 9 (2026-10-10): cópias de edição com quadro-chave curto (a causa do arraste lento)
- **O protótipo WebCodecs não ajudou sozinho.** Ele está em `D:/kanivete_testes/webcodecs`: `wc_proto2.js` e `medir_wc.py`,
  com decodificador contínuo, cache de quadros e de bytes. Deu ~280 ms por passo, empatado com o `<video>` (262 ms).
- **Causa:** as cópias "Otimizados FullHD" tinham quadro-chave a cada 4–8 s, o padrão do codificador. Para mostrar um quadro
  qualquer, qualquer decodificador refaz centenas de quadros. O HEVC do celular tem um por segundo.
  As prévias leves (0,5 s) e as renderizadas (10 quadros) já eram curtas.
- **Medido no `<video>` do app** (`D:/kanivete_testes/webcodecs/medir_gop.py`, 60 s de um clipe do depo):

  | Formato | Pulo | Vai e vem | Tamanho |
  |---|---|---|---|
  | GOP longo (antigo) | 180 ms | 75 ms | 102 MB |
  | **GOP 0,25 s, sem B** | **18 ms** | **17 ms** | 143 MB |
  | GOP 0,5 s | 30 ms | 28 ms | 142 MB |
  | GOP 0,25 s com quadros B | 27 ms | 24 ms | 144 MB |

- **No projeto real**, num espelho em `D:/kanivete_testes/depo_rapido`, gerado por `scripts/espelho_depo_rapido.py`, sem tocar
  nos arquivos do cliente. Sem prévias renderizadas nos dois, para ser justo:
  - arraste numa direção: 76 → 36 ms por movimento, travadas 14 → 5;
  - vai e vem: 71 → 37 ms, travadas 40 → 17;
  - no PC leve, igual: ~34 ms e 2–3 travadas.
- **Feito:**
  - `otimizar.py`: quadro-chave a cada `GOP_S` = 0,25 s, `-bf 0` (NVENC e x264).
  - `gop_longo()` marca a cópia antiga, que deixa de ser reaproveitada e é refeita.
  - `original_de()` acha o original a partir da cópia, e `copias_antigas()` lista as antigas.
  - `_trocar()` tenta de novo se o arquivo estiver aberto e, se não der, grava como `_r.mp4`.
  - `media_server.register`: arquivo regravado (data ou tamanho mudaram) ganha token novo, a URL muda e o player recarrega.
  - Editor (`vePjVerCopiasAntigas`, editor-projeto.js): ao abrir um projeto com cópias antigas, pergunta uma vez se quer
    refazer em segundo plano. "Agora não" fica lembrado por projeto. No fim, a troca é automática.
  - Teste: `py -3.13 testes/teste_copias_edicao.py` (porta 9395, tudo em `D:/kanivete_testes/copias_edicao`). Pulo 98 → 24 ms.
- **Cuidado:** o depo.vknv aponta para os vídeos REAIS do cliente. O app de teste mostra a pergunta de refazer. Nunca clicar
  "Refazer" nele; usar o espelho.

## Pendências (em ordem)
1. **IA numa placa integrada:** remover fundo (DirectML), gerador_sfx, OmniVoice e melhorar áudio ainda escolhem sozinhos.
   Medir integrada × processador antes de decidir (sem integrada aqui: precisa de um PC de amigo ou de uma máquina emprestada)
   e respeitar `ia_na_placa`/`uma_ia_por_vez`.
2. **Kani no leve:** a 1ª palavra ainda leva ~36 s sem placa. Medir numa integrada de verdade (Vulkan), que deve ser bem mais rápida.
3. ~~Medir no leve: exportar, o Photo com PSD grande e o remover fundo~~ (feito nas fases 3 e 4).
4. **Arraste da agulha:** o grosso foi resolvido pelas cópias de edição (fase 9). Ainda sobra o custo de trocar entre
   muitos trechos de prévia renderizada. Servidor de quadros nativo só se isso ainda incomodar.
5. **Validar num PC real fraco** (notebook de amigo): o simulador aperta CPU e memória, mas não reproduz uma integrada de verdade.
