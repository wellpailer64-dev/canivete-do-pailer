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
  │     motivo() recusa (mesclagem ≠ Multiplicar, rotação, legendas, 10 bits/ProRes, saída reduzida, vídeo com
  │     alfa, memória estimada > 70% da placa) ou falha → segue pela CPU abaixo (_ultimo_motivo_placa)
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

## 5. Resultados (timeline "Depoimentos V2" do Carlinhos, 98,8 s, 1080×1920)

| caminho | tempo | observação |
|---|---|---|
| CPU, 4K bruto, sem placa (driver velho) | 6+ min, cancelado | começo do dia |
| CPU, Full HD + NVENC | 375 s (3,8×) | export do usuário |
| CPU, Full HD (com a correção do logo) | 264 s (2,7×) | referência |
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

## 7. Pendências (por ordem)
1. Memória da placa: a timeline atual do Carlinhos usa 4,9 de 8 GB e passa com o PC livre; com o editor usando a
   placa ao mesmo tempo (prévia/render auto) estourou. Opções: pausar o render auto durante o export; e, para projetos
   maiores/4K bruto, montar em pedaços de tempo (a partida custa só ~2,7 s por pedaço: viável).
2. Velocidade: a placa está em ~1× a duração; medir onde vai o tempo (imagens preparadas na CPU quadro a quadro,
   número de passadas do libplacebo) antes de mexer.
3. Na placa: legendas, outros modos de mesclagem, rotação de camada, prévia renderizada.
4. +1,5 de Y na LUT do libplacebo; blocos com GOP fechado; base de trechos no export por blocos.
5. Textos antigos da fila sem tradução ("Fila de render", "Pausar depois deste"…).
