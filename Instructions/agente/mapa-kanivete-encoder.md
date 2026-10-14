# Mapa do Kanivete Encoder (Ke)

Ponto de entrada para mexer no export do Editor Kanivete. O histórico completo das rodadas, com cada medição, está em
`plano-kanivete-encoder.md`; aqui fica o que é preciso saber para trabalhar.

## 1. Caminho de um export

```
Atalho / botão                          frontend/js/editor-comandos.js, editor-encoder.js, editor-fila.js
  Ctrl+M = fila + abre a janela  ·  Ctrl+Shift+M = fila sem abrir  ·  Ctrl+E = só abre  ·  ▶ Renderizar
        │
        ▼
veFilaAdicionarAtual (editor-fila.js) ── "congela" a timeline:
  Comps (veCompProntas), 3D (ve3dProntas), transições de sobreposição (veOvtProntas → arquivos ovt.*.mp4 no cache),
  textos → PNG (veTxPngs), plano = veExportPlan (editor.js). VEFILA.preparando conta esse preparo
  (Renderizar no meio só agenda o início)
        │
        ▼  pywebview: video_cutter_export (main.py) → eventos veOnExport (progresso, fim)
exportar_video (Functions/video_cutter.py)
  ├─ modo PLACA → Functions/export_placa.py (exportar)      — padrão com "Usar placa de vídeo" ligado
  │     motivo() recusa (mesclagem ≠ Multiplicar, legendas, 10 bits/ProRes, saída reduzida, rotação em ajuste/
  │     com mesclagem/Dobrar/Chroma na placa, memória que nem em blocos de 1,5 s cabe) ou falha → segue pela CPU
  │     abaixo (_ultimo_motivo_placa). Rodada 5 (2026-10-11): imagem/texto girado (textura gira na CPU), vídeo
  │     girado (híbrido: desce, gira, sobe), vídeo transparente (camada desenhada/Comp/3D: _entrada_video_alfa),
  │     desfoque animado (gblur + sendcmd), Brilho/Preenchimento/Inverter/Cortar/Luma/Cantos/Básico 3D no híbrido,
  │     blocos adaptativos (12 → 6 → 3 → 1,5 s) e as texturas RGBA na conta da memória
  ├─ por BLOCOS (_exportar_em_blocos) — opção do usuário; só com a base vazia
  ├─ TURBO — timeline só de cortes com NVENC: NVDEC → scale_cuda → NVENC
  └─ CPU — grafo do ffmpeg (_montar): base (trechos + vazios) + camadas por overlay + camada de ajuste em RGB
        │
        ▼  encoder: _args_video (NVENC/QSV/AMF com placa; x264 sem) · som: a mixagem (wav) junta no fim sem recodificar
arquivo .part → renomeado no fim · miniatura ke_quadro.jpg 1×/s (saida_miniatura) · monitor: encoder_monitor.py
```

## 2. Arquivos

| arquivo | o que faz |
|---|---|
| `frontend/js/editor-fila.js` | fila: congelar, configurações por item, executar em ordem, `VEFILA_API` |
| `frontend/js/editor-encoder.js` | janela Ke (solta, minimiza), atalhos `veKeFilaAtalho`, sons, "Renderizando agora", monitor |
| `frontend/js/editor-desempenho.js` | painel Desempenho encaixável (CPU/RAM/placa ao vivo) |
| `Functions/video_cutter.py` | `exportar_video`, `_montar` (grafo de CPU), blocos, turbo, `taxa_timeline`, `_detectar_hw_encoder`, `motivo_sem_gpu`, `saida_miniatura` |
| `Functions/export_placa.py` | modo placa: `motivo`, `memoria_estimada`, `_base`, `_entrada_video`, `_entrada_imagem`, `_compor`, `_ajuste`, `_multiplicar`, `_shader_lc` |
| `Functions/encoder_monitor.py` | CPU/RAM (psutil), placa (nvidia-smi contínuo), miniatura; API `ve_encoder_estado` |
| `Functions/otimizar.py` | Forçar Full HD (placa: NVDEC + NVENC) |
| `first_run.py` | ffmpeg FIXO na série 8.1 (campo `versao`) |

## 3. Regras que valem para tudo
- **Cópias Full HD automáticas** (`otimizar.usar_otimizados`, no começo do `exportar_video`): camada de vídeo com cópia
  em "Otimizados FullHD" (mais nova que o original) e que aparece em até 1080 no lado menor é lida da cópia, com escala,
  quadros-chave e âncora ajustados. Fora da prévia renderizada e das Comps.
- **Motivo do processador**: quando a montagem não vai na placa, o Python manda "Processador · motivo" no início; o
  Encoder guarda (`it.motivoCpu`) e mostra no selo.
- **Taxa cravada**: `taxa_timeline(média, nominal)`. 23,976/29,97/59,94 só de fonte constante; o resto vai para
  24/25/30/50/60 (celular 59,18 → 60). `probe()["fps_timeline"]`; o editor usa `veFpsTimeline`.
- **Escolha de quadro igual em todos os caminhos**: camada = `setpts=(PTS-(s-ss)/TB)/v` → `fps` com `start_time=0` →
  início na grade (`_camadas_na_grade`); base = `setpts=PTS-STARTPTS` + `fps` + `concat`. O concat conta os quadros que
  cada trecho realmente gera (76 para 76,98; 149 para 150,0): a base só bate se for emendada igual.
- **Driver**: o ffmpeg 8.1 funciona com drivers antigos; a 9.0 e a compilação diária exigem NVIDIA 610+ (com driver velho
  a placa ficava parada sem aviso). Antes de trocar o ffmpeg: `grep -a "610.00" ffmpeg.exe`.

## 4. Armadilhas do modo placa (medidas; não desfazer)

| armadilha | sintoma | correção |
|---|---|---|
| mistura em luz linear | branco a 50% sobre preto = Y 176 (CPU 126), fades claros | `disable_linear=1` na composição |
| base de tempo do PNG (1/25 s) | 1º quadro da imagem preto no corte | `settb=AVTB` antes dos setpts |
| `t` do libplacebo = tempo da ENTRADA | transição Empurrar fora do lugar | expressões com `ot` |
| `transpose_vulkan` | falha com celular girado, ignora o recorte | `libplacebo rotate` (−90° → `rotate=90`) |
| rotação dobrada | Forçar Full HD de cabeça para baixo | `-display_rotation:v:0 0` na entrada (não `-noautorotate`) |
| LUT do libplacebo | magenta | `lut_type=2` (normalizada): 44,6 dB contra o lut3d |
| descida para a CPU (fade em clipe) | ffmpeg escolhia o formato errado | formato exato: `yuv420p` depois do libplacebo, `nv12` direto do decodificador |
| Multiplicar | `blend_vulkan` em YUV ≠ CPU | RGB: fundo × (camada sobre BRANCO), máscara na timeline toda (dividir e recortar um ramo acumulava quadros) |
| 4K bruto | 34 leituras HEVC 4K passam dos 8 GB | reduzir logo depois de ler (mesmo passo do giro); acima de 70% da placa estimado → CPU |
| 1º quadro de cada camada | às vezes não aparecia (arredondamento) | camada entra ¼ de quadro antes |
| app aberto usando a placa | export pela placa estoura a memória | margem de 30% na estimativa; medir sempre com o PC livre |
| cadeia em 8 bits (rodada 7) | escuro em manchas/blocos; o 10 bits da FX30 virava 8 antes da cor | camada `p010le` (`_FMT_CAM`), composição e efeitos `yuv444p16le` (`_FMT_MEIO`), só a saída em 8 bits com pontilhado; hwdownload pede o formato EXATO |
| Brilho somando luz | claros estourados (3,9% dos pixels) | mistura Tela (`glow_passadas`); "Somar luz" = antigo |
| tabela `const` grande num shader | shader de centenas de KB derruba a placa (VK_ERROR_DEVICE_LOST) | parâmetros por quadro numa textura embutida (`//!TEXTURE`, rgba32f, `texelFetch`) |
| `frame` nos shaders do libplacebo | avança a cada PASSADA do arquivo (2 passadas = curva em dobro) | shader que lê `frame` tem uma passada só por arquivo |
| `color=black@0` do ffmpeg | sai preto OPACO (ignora o alfa) | fundo transparente = `fillcolor` do libplacebo |
| `trim=start` tardio num ramo de `split` | o outro ramo guarda todos os quadros até lá: memória esgotada (16 bits: 6,8 GB) | ramo desde o início do bloco, alfa 0 antes (`_ajuste` `tarde`) |
| fundo preto de reserva a 30 qps | "sem áudio" saía 30 qps numa timeline de 59,94 | `_base_preta(w, h, fps)` com `opcoes.fps` = `VE.fps` |

## 5. Resultados (timeline "Depoimentos V2" do Carlinhos, 98,8 s, 1080×1920)

| caminho | tempo | observação |
|---|---|---|
| CPU, 4K bruto, sem placa (driver velho) | 6+ min, cancelado | começo do dia |
| CPU, Full HD + NVENC | 375 s (3,8×) | export do usuário |
| CPU, Full HD (com a correção do logo) | 264 s (2,7×) | referência |
| 4K bruto pela CPU | 518,6 s (5,25×) | RAM 9,1 GB |
| **4K bruto com cópias Full HD automáticas + placa** | **107,6 s (1,09×)** | RAM 1,6 GB; `otimizar.usar_otimizados` |
| idem, pico da placa com o app aberto | 118 s | export 5,6 GB (estimativa 2,3) + 1,4 GB do app = 6,9 de 8 GB; cresce de 4,8 → 7,0 GB ao longo do export (fila adiantada); conferência agora ×2,6 |
| **placa, Full HD** | **96–98 s (0,97–0,99×)** | 38,8 dB contra a CPU |
| placa, partida | ~2,7 s até o 1º quadro (0,5 s de preparo no Python) | NVENC e miniatura não pesam |

Onde vai o tempo na placa (trecho de 15 s mais denso, `medir_velocidade.py`): tudo 17,3–18,4 s · só vídeos 11,3 s ·
sem textos/logo 15,9 s · camada de ajuste ~5 s = dividir a montagem ~1,0 + LUT ~1,5 + Clareza/Nitidez ~2,3 (custo por
passada: a placa espera cada etapa — ela fica ociosa, 10–60%). Dois exports ao mesmo tempo (`medir_paralelo.py`):
rendimento 1,24× (não 2×) com o dobro de memória.

Testado e DESCARTADO, com o motivo: LUT + Clareza numa passada só (gancho OUTPUT; ganho ~3%, dentro do ruído, e 40,5 dB × 44 dB); juntar cortes num fluxo (perde paralelismo, 24,8 → 35,6 s); 4:2:0 até a camada
de ajuste (sem ganho); Clareza reduzida na CPU (o caro são as conversões); blocos com NVDEC no 4K (6×); ler Full HD
H.264 na CPU no modo placa (13% mais lento); texto subindo uma vez só para a placa (memória igual, 4,9 GB).
ATENÇÃO ao medir um trecho: `_base_na_janela` devolve a base INTEIRA (o resto vira vazio) e a duração continua a da
timeline — um "pedaço de 3 s" assim renderiza 98 s de preto (foi o falso "custo fixo de 45 s" de 2026-10-08).
Corte também a base (só os segmentos até T).

## 6. Como testar
- `py -3.13 testes/teste_export.py [--placa] [--casos a,b]`: prévia × export quadro a quadro. Casos `sinc` (som ×
  imagem) e `multiplicar`; `conferir_taxa` (regra da taxa). O `3d` reprova por uma falha antiga da prévia.
- `py -3.13 testes/teste_fila.py`: fila e janela Ke.
- Bancada `D:\kanivete_testes\encoder\`:
  - `capturar_depo.py` grava o plano de uma timeline aberta no app de teste;
  - `bench.py` mede pela CPU e `bench_placa.py` pela placa;
  - `medir_r2.py` mede o antigo × o novo com partes removidas;
  - `medir_memoria.py` mede o pico de memória da placa;
  - `gpu\` tem os testes de libplacebo e LUT;
  - `resultados*.jsonl` guarda o histórico.
- Depurar o modo placa: `CANIVETE_PLACA_DEBUG=1` grava o grafo; desligar: `CANIVETE_PLACA=0`. Falha deixa
  `placa_falhou_*.txt` na pasta de mídia.
- Medir em trechos curtos e com o PC livre: o export do usuário ou o app aberto distorcem tudo.

## 6b. Feito em 2026-10-14 (GaIA V2, Finep — o que deu errado no render real)
- **Envio ao Drive**: campo "Enviar ao Google Drive (opcional)" no formulário (link de pasta, lembrado); o item pronto
  sobe sozinho (`Functions/drive_envio.py`: confere permissão com arquivo-teste ANTES — a pasta só-leitura dava 403 no
  fim de 4 GB —, rclone com `--use-json-log --stats 1s`, link do arquivo no fim) com barra/MB/s/falta e "Abrir no Drive",
  "Cancelar envio", "Enviar de novo". API `ve_drive_enviar/estado/cancelar`. Teste: `D:/kanivete_testes/scripts/teste_drive_fila.py`
  (app 9333 + `RCLONE_CONFIG` do usuário; pasta de teste do Pailer 1Xn3AR4NS9eIwdL6Gjddw_Tv0AVC-xbwB).
- **Arquivo movido = offline**: `veFilaConferirArquivos` confere no disco (`ve_arquivos_faltando`) tudo que a timeline usa
  (também dentro de Comp) antes de congelar; antes um PNG movido saía PRETO sem aviso. Aviso diz o tempo (`m._quando`).
- **X da janela pergunta** (`_ao_fechar` em main.py → `appSair`): render/preparo/fila/envio em andamento ou projeto não
  salvo; antes o X fechava direto e matou o render na preparação. Página travada: 2º X em 8 s fecha. Teste:
  `D:/kanivete_testes/scripts/teste_fechar.py`.
- **Camada de motion recortada ao desenho** (`cena3d.fim(recortar=True)`, caixa em `<mov>.caixa.json`, plano em
  `veExportPlanClips` com `pk.box`): Comp do GaIA com 16 linhas animadas 196 s → 68 s, imagem igual (máx 5/255). Comp e
  motion em ProRes 4444 pelo codificador `prores` (`-profile:v 4`, não "4444"): ~3× mais rápido que o `prores_ks`.
  Cache antigo (tela cheia) continua valendo; só as camadas novas saem recortadas (VE_MO_VERSAO não subiu de propósito).
- **Volume do render pronto** (`ve_medir_volume`, ebur128): etiqueta "−15,7 LUFS" no item; fora de −20..−11 avisa.
- **Motion travava a preparação** (`veMoVideo`): com 10 vídeos abertos o 11º nunca carregava; agora fica com 3 e tem
  prazo de 30 s.
- **Corrigir trecho** (botão no item pronto; `Functions/emenda.py`, `veFilaCorrigir`): marcar I/O na timeline em volta do
  erro → exporta só [k1,k2) entre quadros-chave do vídeo pronto (mesmas configurações, sem áudio) e emenda: parte A com
  `-frames:v`, trecho remuxado com `-video_track_timescale` do original, C com `-ss k2` cópia, áudio original; confere
  contagem de quadros e decodifica a região. Teste: `D:/kanivete_testes/scripts/teste_corrigir.py` (600/600 quadros,
  fora do trecho idêntico).
- **Preparo visível na fila**: o item aparece na hora ("Preparando · Renderizando a Comp X 30% · faltam 12 · 4 min").
- **Revisor antes do render** (`veFilaRevisar`, não trava): GC × rosto (painel Pessoas: avisa GC sobre OUTRA pessoa com nome,
  ≥0,45; confirma a própria com ≥0,36), camada "Textura ·/· fundo" passando do fim da cena, tomada < 0,7 s na V1, texto/GC/cartela em cima de um rosto
  (`veFilaTextoSobreRosto`: rostos do índice do painel Pessoas projetados na tela pela posição/escala da cena, fora do
  recorte da tomada vertical não conta; sobreposição > 20% do rosto). Avisos no
  item (⚠ N avisos, lista no title) e num aviso na tela. `VEFILA_API.revisar()`.

## 7. Pendências (por ordem)
00. (2026-10-14) Medido e DESCARTADO: Comp no modo placa com alfa (60 s × 48 s na CPU e o alfa saía errado — o
    libplacebo entrega cor pré-multiplicada; foi desfeito) e Comps em paralelo (1 Comp já usa ~50% de 16 núcleos).
    Números da Comp do GaIA (26 s, 43 camadas): 188 s tela cheia → 48 s com motion recortado (PSNR 82,9 dB = igual).
    Armadilha de teste: os PNGs de texto do trabalho da Comp moram no TEMP do app — fechar o app apaga e o render sai
    sem textos (parecia defeito do codificador).
0. **PRÓXIMO (combinado 2026-10-08): frear a fila adiantada de quadros.** Com as cópias Full HD a memória da placa
   cresce de 4,8 → 7,0 GB ao longo do export (`D:/kanivete_testes/encoder/medir_pico_fhd.py`: export 5,6 GB +
   app 1,4 = 6,9 de 8); no app do usuário estourou em 21% e a conferência (×2,6 agora) manda para a CPU quando o app
   ocupa mais. Investigar num trecho curto (~30 min) de onde vem o crescimento (entradas que começam tarde sendo lidas
   cedo? fila do filtro/decodificador?) e frear; meta: uso estável → a timeline cabe sempre na placa.
1. Memória da placa: a timeline atual do Carlinhos usa 4,9 de 8 GB e passa com o PC livre; com o editor usando a
   placa ao mesmo tempo (prévia/render auto) estourou. Opção que falta: pausar o render auto durante o export.
   (Montar em pedaços de tempo: FEITO 2026-10-10, exportação em blocos — plano §11.)
1b. **Da rodada 4 (2026-10-10, Respeite o seu voto; plano §11):**
   - Abertura do 1º bloco leva ~10 s (todas as leituras do bloco abrem juntas): medir e abrir só o que toca no começo.
   - Brilho/Contraste e Chroma Key junto com outro efeito no mesmo clipe (ex.: key + Luz e Cor, 3 clipes no Respeite)
     ainda descem para a CPU (híbrido): fazer o Brilho/Contraste em shader e encadear key + Luz e Cor na placa.
   - Blocos rodam um após o outro: medir se 2 ao mesmo tempo compensa quando sobra memória na placa.
   - Imagens com efeito (texto com Aberração, etc.) ainda preparadas na CPU.
2. Velocidade: a placa está em ~1× a duração; medir onde vai o tempo (imagens preparadas na CPU quadro a quadro,
   número de passadas do libplacebo) antes de mexer.
3. Na placa: outros modos de mesclagem, prévia renderizada. (Rotação de camada: feita na rodada 5. Legendas: feitas
   2026-10-11 — a placa monta e o libass desenha o mesmo .ass no quadro que desce para o codificador; em bloco, o relógio
   desloca com setpts; caso `legendas` no teste_export.)
4. Investigar: caso `motion` em blocos forçados de 1 s (`CANIVETE_PLACA_BLOCOS=1 CANIVETE_BLOCO_SEG=1 --placa`) caiu
   para a CPU com "erro na placa" (2026-10-11; no modo normal vai na placa).
4. +1,5 de Y na LUT do libplacebo; blocos com GOP fechado; base de trechos no export por blocos.
5. Textos antigos da fila sem tradução ("Fila de render", "Pausar depois deste"…).

## 8. Referência para um motor próprio: VapourSynth (lido em 2026-10-08, r81, commit 744afbd)
Código em `D:\kanivete_testes
efapoursynth` (clone raso, só leitura; LGPL-2.1: usar como biblioteca sim,
copiar código para o app não). Por que importa: é o "chef com comanda" que o ffmpeg CLI não é.
- Pede cada quadro sob demanda, com vários em andamento ao mesmo tempo (thread pool) e cache por nó.
- **r80/r81 (2026): GPU em Vulkan 1.4 no núcleo.** Quadros moram na placa (`GPUUpload`/`GPUDownload` só nas bordas);
  orçamento de VRAM (⅔ do disponível) com despejo e freio de pedidos ("maior que a VRAM termina, só mais devagar");
  trabalho adiantado limitado a ¼ do orçamento. É a solução exata do nosso problema de memória (§7).
- Filtros de placa prontos ainda são poucos: redimensionar, BoxBlur, PlaneStats e os de ordem/propriedades.
  Composição com posição, LUT 3D, Clareza e mesclagem seriam **nossos** filtros: plugin nativo (C/C++, DLL), com o GLSL
  compilado em tempo de execução (`compileGPUShader`; `sdk/gpu_invert_driver_example.cpp` = um filtro de pixel em
  poucas linhas). Python só monta o grafo; filtro de placa em Python não existe.
- Leitura de vídeo: não vem no núcleo. Os plugins (BestSource, L-SMASH, ffms2) decodificam na CPU (4K HEVC pesa).
  A ponte CUDA (`sdk/gpu_cuda_invert_example.cu`) "ainda não rodou em placa NVIDIA" — muito novo.
- Saída: `vspipe` manda os quadros (y4m/mkv) para o ffmpeg com NVENC; o quadro desce da placa uma vez por quadro.
- Veredito (2026-10-08): promissor para um motor próprio, mas imaturo para nós agora (GPU de 1 mês, decodificação na
  CPU, plugin nativo a compilar). Rever quando a decodificação na placa e a ponte CUDA amadurecerem; o primeiro teste
  seria a nossa timeline com um filtro de composição simples, medindo × o modo placa.
