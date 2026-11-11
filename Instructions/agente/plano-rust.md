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
4. Vídeo: ainda não medido (próxima rodada).

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
- Próximos candidatos medidos: filtros pesados em 4000x3000 (Galeria 18 s, Nuvens 10,6 s, Óleo/Ondulação/Redução de ruído ~9 s), efeitos de camada (Chanfro, Traço), importar PDF grande (9 s, Python). Vídeo ainda não medido.
