# Plano Rust: acelerar o KANIVETE por gargalos (pedido do Pailer, 2026-11-10)

Objetivo: ganhar desempenho trocando por Rust só o que for gargalo medido, ferramenta por ferramenta:
Photo → Vetor → Vídeo. Sem reescrever tudo de uma vez.

Descoberta inicial: o Photo é ~20 mil linhas de JavaScript (filtros, Camera Raw, pincel e composição rodam
dentro da janela). O Python faz pouco: abrir e salvar PSD (`Functions/editor_imagem.py`, `psd_import.py`). A remoção de fundo já é
nativa (ONNX). Por isso o Rust entra principalmente como **WebAssembly** chamado pelo JS; em filtros, comparar
também com a placa de vídeo (WebGL).

## Etapas
1. **Medir** (em andamento): `D:/kanivete_testes/bench/js_medir.py` → `js.json` (lado JS, app de teste 9333) e
   `py_medir.py` → `python.json` (lado Python). Primeiros números em 1080x1440: Galeria de filtros 2,3 s, Correção de lente 1,6 s, Média 1,5 s.
2. **Piloto**: pegar o pior gargalo, refazer em Rust (WASM ou extensão Python), conferir que a saída é idêntica com
   `testes/teste_imagem.py` / `teste_filtros.py` e comparar o tempo.
3. **Repetir** só se ganhou; senão testar GPU nesse ponto.
4. Fechar o Photo → Vetor → Vídeo.

## Cuidados
- Instalar Rust/toolchain e mudar o build (`build.bat`, release dos amigos) só com ok do Pailer.
- Trabalho em dupla: aba 29 (Claude, coordena) + aba 28 (Codex) pelo Colab do KaniCode.

## Resultado das medições (rodadas 1 e 2, 2026-11-11) — ranking para decidir
Dados em `D:/kanivete_testes/bench/` (`js.json`, `python.json`, `vetor.json`, `interativo.json`, `vetor_perfil.txt`).

| # | Gargalo | Medido | Rust? |
|---|---|---|---|
| 1 | **Camera Raw ao vivo** (arrastar slider, `ieComporAjuste`) | 83–131 ms por evento (≈8–12 fps), igual em 1 ou 20 camadas e em 1080x1440/4000x3000 | **SIM — piloto**: Rust/WASM (ou WebGL) no cálculo por pixel |
| 2 | **Filtros pesados** (4000x3000): Galeria 18 s, Nuvens 10,6 s, Ondulação/Óleo/Redução de ruído/Poeira ~9 s, Máximo/Mínimo 8 s, Faceta 8 s | 1080x1440: 0,1–1 s | **SIM**: WASM com SIMD/threads; Máximo/Mínimo, Mediana, Óleo, Desfoques viram algoritmo O(n) |
| 3 | Efeitos de camada (Chanfro 2,4 s, Traço 1,9 s em 4000x3000) | 0,2–0,3 s em 1080 | Sim, depois dos filtros |
| 4 | Abrir PSD (psd-tools): grande 6,2 s, médio 2,8 s, pequeno 1,4 s | só 1ª abertura (cache depois) | Talvez: medir no perfil se é Python puro ou PIL/NumPy (já nativos) |
| 5 | Remoção de fundo BEN2 26 s (ISNet 1,8 s) | modelo ONNX/NumPy | **Não** é Rust; trocar modelo/usar GPU |
| – | Photo interativo: alça de tamanho, pincel, zoom/pan, tela parada | quadro mediano 0–11 ms (p95 ≤ 130 ms em 4000x3000 ×20 camadas) | **Não**: já fluido |

Vetor (`vetor.json`):
- Criar formas com degradê+traço: 100 → 0,25 s, 1000 → 17,6 s, 5000 → 205 s (cresce mais que o dobro por forma).
  Causa: `vkSnap` (`vetor-nucleo.js:547`) copia o documento inteiro para o desfazer a cada forma criada.
  **Não é Rust**: conserto é desfazer incremental (copiar só o que mudou) + agrupar lote em 1 snapshot. Fazer primeiro: ganho enorme, custo baixo.
- Pathfinder 200 formas ~100 ms, exportar PDF/PNG/SVG, salvar, contornar texto/traço: <15 ms → ok.
- Traçar imagem 1080x1440: 8,3 s, dos quais 6,2 s são VTracer nativo → **não** é candidato.
- Importar PDF de 188 MB: 1,9 s → ok.
- Erro de página repetido: `Cannot set properties of null (setting 'hidden')` (elemento ausente na tela; investigar à parte).

## Decisão sugerida (precisa do ok do Pailer: instalar toolchain Rust muda o build)
1. Antes de Rust: consertar `vkSnap` no Vetor (JS puro).
2. Piloto Rust/WASM: **Camera Raw ao vivo** (maior ganho percebido: o slider hoje engasga), depois **Máximo/Mínimo + Galeria + Nuvens** (comparar com WebGL).
3. Conferir saída idêntica com `testes/teste_imagem.py` / `teste_filtros.py` e comparar tempos com os mesmos `bench/*_medir.py`.
4. Vídeo: medido (2026-11-11), ver seção "Vídeo medido" abaixo.

## Piloto feito (2026-11-11) — resultado
**Vetor `vkSnap` (feito, em JS):** `vkSnap` era 98% do tempo ao criar formas. Agora usa `JSON.stringify` sem função de filtro (4x) e há `VKN.lote(nome, fn)`/`vkLote` (1 só ponto de desfazer, 1 cópia do documento).
Criar 1000 formas: 17,6 s → 2,2 s sem lote, 0,03 s com lote; 5000 formas: 205 s → 0,35 s com lote. `teste_vetor.py` ganhou o caso do lote (passa).

**Camera Raw ao vivo:** o custo do slider é `ieCrLut3d` (LUT 3D trilinear): 54 ms em 1080x1440, 414 ms em 4000x3000 (~35 ns/pixel; o resto do Camera Raw é ~15 ms).
Bancada em `D:/kanivete_testes/bench/` (`cr_micro.py`, `cr_wasm.py`, `cr_gl.py`); crate Rust em `D:/kanivete_rust/kanivete_wasm` (Rust 1.99 instalado em `D:/kanivete_rust`, nada no PATH).

| Variante | 1080x1440 | 4000x3000 | Saída |
|---|---|---|---|
| JS atual | 54 ms | 414 ms | referência |
| Rust/WASM f64 (idêntico ao JS) | 70 ms | 565 ms | idêntica |
| Rust/WASM SIMD f32 | 62 ms | 495 ms | 15 bytes ±1 em 36 M |
| **WebGL2 (placa de vídeo)** | **6–16 ms** | **38 ms** | 3,5% dos bytes ±1 nível (precisão float32) |

Conclusão: **Rust/WASM não ganha aqui** (igual ao JS, medido também no Node e com Liftoff/TurboFan). Quem ganha é **GPU (3–10x)**.
Rust só compensa onde o JS faz algoritmo ruim (ex.: Máximo/Mínimo, Mediana, Óleo) ou com vários núcleos (Workers). Sem `SharedArrayBuffer` hoje (página não isolada).
Decisão pendente do Pailer: levar `ieCrLut3d` + soma final para WebGL (mesma assinatura `d, w, h`, com queda para JS se faltar WebGL2).

**Vetor, lado Python (aba 30, etapa C):** traçar foto 1080x1440 = 7,5 s (VTracer nativo, não é Rust); importar PDF 103 KB = 0,12 s; **importar PDF de 34 MB (Primia) = 9,0 s** (candidato: ver cProfile em `bench/vetor_perfil.txt`); exportar AI/PDF ~50 ms.
Erro `Cannot set properties of null (setting 'hidden')`: suspeita em `vkDockRender` (`vetor-dock.js:124`), sem stack para confirmar.

## Camera Raw na placa de vídeo (feito, 2026-11-11, autorizado pelo Pailer)
`ieCrLut3d(d, lut, N, w, h)` em `imagem-cameraraw.js` agora usa WebGL2 (shader trilinear, LUT em textura 3D, cacheada por identidade da LUT) para imagens com ≥ 250 mil pixels; abaixo disso, ou se faltar WebGL2/der erro/contexto perdido, cai em `ieCrLut3dJs` (o código antigo).
Medido no app de teste (`bench/cr_verifica.py`): 1080x1440 JS 57,6 ms → GL 17,8 ms; 4000x3000 JS 414,5 ms → GL 47,4 ms. Saída: ~3,4% dos bytes ±1 nível (float32), nunca mais que 1.
`teste_imagem.py` passa. Ainda não aplicado no app aberto do Pailer (9222 fechado): vale na próxima abertura.
**Soma final do Camera Raw na GPU (feito):** 4000x3000 com todos os efeitos 844 ms → 104 ms, diferença máxima 1 nível. `teste_imagem.py` e `teste_filtros.py` (63/63) passam.

## Rust/WASM × JS: Máximo/Mínimo e Mediana (4000x3000, `bench/rust_filtros.json`)
Saída idêntica ao JS atual (dif 0) em todos os casos.
| Filtro | raio | JS atual | JS melhorado | Rust/WASM |
|---|---|---|---|---|
| Máximo/Mínimo | 2 | 1,4 s | 0,35–0,8 s | **0,13 s** |
| Máximo/Mínimo | 10 | 5,9 s | 0,85 s | **0,12 s** |
| Máximo/Mínimo | 50 | (muito lento) | 0,83 s | **0,10 s** |
| Mediana | 2 | 1,0 s | 0,7 s | **0,32 s** |
| Mediana | 5 | 1,9 s | 1,2 s | **0,47 s** |
| Mediana | 10 | 3,4 s | 2,0 s | **0,84 s** |
Conclusão: Máximo/Mínimo vale Rust (tempo vira constante, ~45x no raio 10); Mediana ganha 2,5–4x. **Integrado (2026-11-11, ok do Pailer):** `frontend/js/imagem-wasm.js` carrega o módulo (base64, ~35 KB, instancia em segundo plano) e `ieFMinMax`/`ieFMediana` em `imagem-filtros.js` chamam o Rust; se o módulo não carregou, deu erro ou a imagem é minúscula, caem em `ieFMinMaxJs`/`ieFMedianaJs` (o código antigo). Galeria e Faceta também ganham (usam `ieFMediana`). Fonte do Rust em `rust/kanivete_wasm/` (compilar: `cargo build --release --target wasm32-unknown-unknown`, toolchain no D; depois regerar o base64 em `imagem-wasm.js`; não entra no `build.bat`). Conferido no app de teste: dif 0 contra o JS (`bench/wasm_integrado.py`); 1000x700: Máx/Mín raio 10 248 ms → 7 ms.

## Fechamento (2026-11-11)
- **Camera Raw na GPU** (WebGL2, queda para JS) e **Máximo/Mínimo/Mediana em Rust/WASM** (`frontend/js/imagem-wasm.js`, fonte em `rust/kanivete_wasm`, módulo embutido em base64; recompilar com `cargo build --release --target wasm32-unknown-unknown`): saída idêntica ao JS (dif 0), `teste_filtros` 63/63 e `teste_vetor` ok. Commits `c63229b` e `6f4e443`, já na main.
- Erro `Cannot set properties of null (setting 'hidden')` resolvido: `vkUiAtualizar` rodava com `#vk` ainda vazio (comando de API antes de montar o Vetor); agora sai cedo.
- Próximos candidatos medidos: filtros pesados em 4000x3000 (Galeria 18 s, Nuvens 10,6 s, Óleo/Ondulação/Redução de ruído ~9 s), efeitos de camada (Chanfro, Traço), importar PDF grande (9 s, Python). Vídeo medido, sem candidato urgente (seção "Vídeo medido").

## Vídeo medido (2026-11-11)
App de teste 9333, `bench/video_medir.py` → `bench/video.json` e `video_perfil_monitor.txt`. Monitor = 24 quadros por caso (JS síncrono); exportação = 1 repetição, ponta a ponta, 1080x1920.
- **Prévia (monitor):** quase tudo <2 ms/quadro. Só estouram: `bloom` 9,5 ms, `cor` 7,5 ms (p95 ~10-12 ms). Nada passa de 16 ms em PC bom; 3D, motion, premium, chroma, sobreposição ficam abaixo de 1,5 ms.
- **Linha do tempo:** `veRelayout` ~0 ms com 60, 300 e 1000 clipes (montar a timeline inteira 80-170 ms). Não é gargalo.
- **Exportação (ffmpeg, nativo, não vai para Rust):** grade 1,7 s, efeitos 3,8 s, premium 2,3 s, 3d 2,2 s (todos ≤1x o tempo do vídeo); **motion 18,8 s (4,7x)** e **zoomsete 40,5 s (3,9x, 10,5 s de vídeo)** são os lentos, e o tempo está dentro do ffmpeg (a fase de preparação leva 2-10 s).
- **Quentes no perfil do monitor:** `draw` do Brilho/Glow em `editor-motion.js:1270` (laço de pixel em JS, ~13 ms/quadro), `veLcDraw` do Luz e Cor em `editor-lc.js:534` (~20 ms/quadro) e `veScVisivel` (`editor-scopes.js:23`, força reflow a cada quadro, ~8 ms/quadro com scopes ligados).
- **Decisão:** Vídeo não pede Rust agora. Ganho barato, sem toolchain: (1) `veScVisivel` com cache/ResizeObserver; (2) Glow e Luz e Cor em WebGL (como o Camera Raw do Photo), e só se o Pailer sentir engasgo ao ligar esses efeitos; (3) olhar os filtros do ffmpeg de motion/zoomsete (menos passadas, resolução menor nos desfoques), que é onde está o tempo real de exportação. Não medi: peaks de áudio, transições, autoframe/estabilizador/legendas (Python).

## Segunda leva: JS melhorado antes de Rust (2026-11-11, ok do Pailer para as melhorias)
Regra que a medição confirmou: onde havia conta repetida por pixel, consertar o JS rendeu mais que trocar de linguagem. Saída idêntica (checksum igual) nos três.
- **`ieRuidoSuave`** (base de Nuvens, Ondulação, Respingos...): o cosseno e o índice eram recalculados por pixel; agora uma vez por coluna/linha. 4000x3000: 1,18 s → 0,14 s por chamada (8x). Nuvens 6,4 s → 1,2 s; Ondulação 9,2 s → 4,5 s.
- **`ieDeslocar`** (Ondulação, Respingos, Onda, Torcer...): 4 arrays novos por pixel trocados por 4 vizinhos escritos à mão. 1,23 s → 0,55 s.
- **Brilho (Glow)** da prévia: o laço de pixel (`getImageData` + `putImageData`) virou filtro SVG na GPU (`veMoGlowFiltro`, `editor-motion.js`); diferença máxima de 1 nível. **`veScVisivel`** (escopos): resposta guardada por 250 ms em vez de forçar o layout a cada quadro.
- Luz e Cor (`veLcDraw`) já é WebGL2; o custo medido ali é o envio da textura, não conta em JS: nada a fazer.
- **Sobra para Rust (medido no perfil, 4000x3000):** `ieFBox` (média em caixa, 1–2 s por filtro que usa Guiado: Faceta, Reduzir ruído, Óleo) e Kuwahara (Óleo, ~2,5 s). Ganho esperado ~2x, só vale se o Pailer sentir lentidão nesses. Mediana/Poeira já usam o Rust (1,5 s).

## Fora dos filtros: levantamento (2026-11-11) — nenhum candidato novo
- **Vetor, formas:** criar 1000 formas com degradê+traço sem lote 2,2 s, com `VKN.lote` 26 ms (5000: 0,33 s). Redesenhar a tela com tela real (canvas 2941x1804): 100 formas 0,4 ms, 1000 formas ~4 ms, 5000 formas ~21–25 ms. Fluido, JS basta. (Cuidado ao medir: no app de teste a página precisa estar ativa com `switchTool('vetor-kanivete')`; sem isso o canvas fica com largura 0 e mede 0 ms.)
- **Importar PDF grande (10 s):** 3,7 s é codificar PNG (PIL, nativo) e 2,8 s é extração de texto do PyMuPDF (nativo). Testei `compress_level=1`: ganho ~1 s, arquivos 48→77 MB; descartado.
- **Abrir PSD grande (6–8 s):** PNG nativo + psd-tools lendo canais; só na 1ª abertura. Sem laço de pixel em Python.
- **Traçar imagem (7,5 s):** núcleo VTracer já nativo.
- **Picos de áudio / forma de onda:** numpy + ffmpeg, já nativos. Procurei laços de pixel em Python (`range(h)`, `getpixel`): só `blender_render.py` (render 3D externo) e `vst3.py`.
- **Chanfro (efeito de camada, 1,0 s em 4000x3000):** a distância 3-4 (`ieFxDistancias`) é só 0,29 s; o resto está espalhado em vários laços e desfoques. Rust ganharia pouco.
- **Conclusão:** o que vale Rust no KANIVETE já foi feito (Máximo/Mínimo/Mediana) ou virou GPU (Camera Raw). Sobra opcional: `ieFBox` e Kuwahara (~2x). O resto era conta repetida em JS, corrigida sem trocar de linguagem.

## Editor de vídeo: áudio e análises Python (2026-11-11) — nenhum candidato
- **Mixer de áudio da prévia** (`veAudioMixarBruto`, JS na thread principal, pedaço de 1024 quadros = 21,3 ms de som; `bench/audio_mixer_medir.py`): 24 clipes sem efeito 1,7 ms; 24 com EQ 4 ms; 24 com reverb+dereverb 8,4 ms (p95 10,7). Dentro do orçamento com folga de 2x. Só passaria a valer AudioWorklet/Rust com 50+ clipes com reverb ao mesmo tempo.
- **Estabilizador** (`Functions/estabilizador.py`, 1080p): analisar 1,1 s para 4 s de vídeo (0,27x), tudo em `cv2` (goodFeaturesToTrack 0,46 s, fluxo óptico 0,26 s). O caminho usa HiGHS (scipy); a 1ª chamada paga 2,3 s só importando scipy. Nada em Python puro.
- **Já cobertos:** rastreador, respiros e picos usam cv2/numpy/ffmpeg; exportação de motion/zoomsete é ffmpeg.
- **Conclusão:** o Editor não tem laço pesado em JS/Python. Rust não compensa lá.

## Exportação de motion: onde vão os segundos (2026-11-11) — sem candidato
- **Motion (4 s, 1080x1920):** ~8 s no total com o app já quente: ~5,2 s de preparação no navegador (desenhar as camadas quadro a quadro: ~2,5 s só em `toDataURL` PNG, resto espera do Python) e ~2,7 s de ffmpeg. Os 18,8 s medidos antes eram a primeira exportação do app recém-aberto (cache frio).
- **Zoomsete:** a preparação é ~0; os 40 s são do ffmpeg/shader do zoom com desfoque de movimento (já é o caminho mais barato; na CPU não saía em 44 min).
- **`ieFBox`:** já é soma corrida O(n), separável; Rust daria pouco. Não vale.
- **Diagnóstico novo:** `CANIVETE_FFTEMPO=<arquivo>` grava quanto cada chamada de ffmpeg/ffprobe levou em `video_cutter.py` (inerte sem a variável).

## Preparo do reels "Mais um aprovado - com fala" (2026-11-12) — medido no app de teste
Timeline 36,8 s, 1080x1920 60 fps, 177 clipes (73 texto, 30 transições de sobreposição, 33 ajustes, 2 roto), 139 camadas no plano. Marcas em `veFilaMarca` (`window.VEPREP_LOG`, `editor-fila.js`) e `veTxPngs` (`editor-props.js`).
- **Preparo total: 41 s** (2.ª rodada, app quente; a 1.ª deu 63 s).
- **Textos e motion (`veTxPngs`): ~27 s + ~13 s de transições**, porque `veOvtJob` (`editor-ovt.js:355`) chama `veTxPngs` para cada transição e o plano chama de novo: os mesmos textos são desenhados 2 vezes.
- **Causa dominante: textos animados** (`veTxaExportar`, `editor-txanim.js`): um PNG por quadro da entrada/saída (`toDataURL` + `ve_salvar_png` pela ponte), em sequência, sem paralelo. Textos fixos somam só ~0,9 s (20 medidos: 235 ms).
- Transições de sobreposição (30): 0,2–5,5 s cada (a primeira mais lenta, pelo aquecimento).
- Não é a placa: a fase de preparo não usa GPU (encoder 0%); o gargalo é canvas 2D + PNG + ponte.
- Próximos passos a decidir: (1) cache de `veTxPngs` por assinatura do clipe + resolução (corta ~13 s sem mudar a saída); (2) quadros animados sem PNG (bruto ou transformação no ffmpeg/shader) — maior ganho, mais trabalho.
- Scripts de medição: `D:/kanivete_testes/scripts/prep_medir.py` e `prep_textos.py`; resultados em `D:/kanivete_testes/bench/prep_reels*.json`.

## Cache de textos no preparo (2026-11-12, feito)
- `veTxPngs` (`editor-props.js`) guarda cada texto por `veTxCacheKey` (texto + escala + animação e duração, se animado) em `VE._txCache`, só durante `veFilaAdicionarPreparando`. A chave não inclui posição nem corte, porque a transição usa cópias cortadas.
- Medido (mesma timeline, app de teste): 40,8 s → 25,8 s na 1.ª rodada e 35,4 s na 2.ª (ruído: os textos animados sozinhos variam de 12 a 15 s conforme a carga). Camadas: 139 nos três casos.
- Chave estável: 73/73 textos com a mesma chave em duas leituras; segunda passada com cache: 7 ms.
- Ainda não comparei o render final com e sem cache; a equivalência vem da chave, não de um export comparado.
- Passo 2 (quadros animados sem PNG): ainda não feito. Mexe no formato que `ve_txa_lista` entrega ao ffmpeg e nas predefinições de `editor-txanim.js`; precisa de decisão e de `testes/teste_export.py`.

## Passo A: quadros de texto animado em lote (2026-11-12, feito)
- `veTxaExportar` (`editor-txanim.js`): desenha os quadros na ordem, codifica PNG em paralelo (`toBlob`, 16 por vez) e manda um lote por grupo a `ve_salvar_pngs` (novo em `main.py`, junto de `ve_salvar_png`).
- Pixel igual: PNG de um quadro com `toDataURL` e com `toBlob` saiu com a mesma string (`igual: true`).
- Por quadro, medido um após o outro com a máquina carregada: 92 ms antes (61 PNG + 31 ponte) → 31 ms agora (~3x). Em carga menor, antes: 40 ms (28 PNG + 12 ponte).
- Reserva: se `ve_salvar_pngs` não existir (app aberto antes da mudança, o `--py` não recarrega `main.py`), volta ao quadro a quadro. Reabrir o app do Pailer ativa o lote.
- Total do preparo do reels oscilou entre 29 e 44 s nas rodadas desta noite (carga do PC); o trecho dos textos animados caiu ~3x.
- Pendente: `testes/teste_export.py` antes de release (exportação mudou, mesmo com pixel igual).
- Passo B (animação no ffmpeg/shader): não feito.
