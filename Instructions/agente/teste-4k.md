# Teste de 4K (estresse do Editor de Vídeo)

Combinado em 2026-10-01: medir o editor com um projeto pesado de verdade e atacar o que travar.
Objetivo: saber onde está o teto (decodificação, composição no canvas, áudio, render) antes de prometer
"compete com o Premiere" em material pesado.

## Material (gerar, não depender do usuário)
Tudo em uma pasta de teste fora do projeto (ex.: `%TEMP%/teste4k/`), gerado com ffmpeg (`testsrc2`, ruído,
`mandelbrot`; textura com movimento, que pesa no codificador como vídeo real):
- `h264_4k30.mp4`: 3840x2160, 30p, H.264 8-bit, 60 s, ~80 Mbps
- `h264_4k60.mp4`: 3840x2160, 60p, H.264 8-bit, 60 s
- `hevc_4k10b.mp4`: 3840x2160, 30p, H.265 **10-bit** (o caso de celular/drone; o mais provável de travar)
- `prores_4k.mov`: ProRes 422 HQ 4K, 20 s (arquivo grande: leitura de disco)
- `foto_8k.jpg`: imagem 7680x4320 (Ken Burns / AutoFrame)
- Áudio: 4 faixas WAV 48 kHz de 60 s
Se o usuário tiver material real 4K (drone/celular), usar também: sintético não revela tudo.

## Projetos (montar pelo modo agente, `--agente=9333`)
1. **Simples**: 1 trilha, h264_4k30 inteiro, cortes a cada 3 s.
2. **Camadas**: V1 4K + V2/V3/V4 com 4K em PiP (escala/posição com keyframes) + texto + camada de ajuste com Luz e Cor.
3. **10-bit**: hevc_4k10b com transições entre cortes de 2 s.
4. **Sequência 9:16 sobre 4K**: reframe (escala 180%+), legenda animada, foto 8K com zoom.
5. **Áudio**: as 4 faixas + o som do vídeo, com ganho e Hard Limiter.

## O que medir
- **Play**: `python testes/teste_play.py "<projeto>" --segundos 30` em cada projeto (voltas, buscas,
  esperas, quadros perdidos, travadas). Também com prévia renderizada (cache) ligada e desligada.
- **Arrastar a agulha** (scrub) e saltos (Home/End, clique longe): tempo até o quadro aparecer.
- **Abrir projeto**: tempo até a timeline ficar pronta (waveforms, miniaturas).
- **Interface**: arrastar clipe/aparar borda com o projeto 2 tocando ou parado (quadros > 100 ms).
- **Memória**: RAM do processo (WebView2 + Python) depois de 5 min mexendo; cresce sem parar = vazamento.
- **Exportar**: tempo do projeto 2 em 1080p e 4K (normal e turbo), comparar com a duração.
- **Prévias em disco**: tempo de render da prévia e se o play com ela fica limpo.

## Critério (referência inicial; ajustar depois da 1ª medição)
- Projeto 1 e 3: play sem reprovar no `teste_play.py` (limites atuais).
- Projeto 2: pode precisar de prévia renderizada, mas com ela o play tem que passar.
- Scrub: quadro em < 250 ms; abrir projeto < 5 s; exportar 1080p ≤ 2x a duração.
- Nenhum crescimento de memória contínuo.

## Saída
Registrar aqui embaixo uma tabela por rodada (data, máquina, resultados, gargalo achado, o que foi corrigido).
Hipóteses a confirmar: decodificação 4K 10-bit no `<video>` do WebView2, cópia do quadro 4K para o canvas
(`drawImage` em resolução cheia: reduzir para o tamanho do monitor/proxy), e falta de **proxies**
(gerar 1080p/720p ao importar e trocar para o original só no export) — provável maior ganho.

## Resultados

### Rodada 1 — 2026-10-01 · i7-10700K (16 threads), 32 GB, RTX 3050 8 GB, monitor 30 Hz
Material sintético em `%TEMP%/teste4k/` (testsrc2 + ruído, NVENC; `gerar.sh` ali). Projetos `p1..p5*.vcnvt` na mesma
pasta, montados pelo modo agente (scripts de montagem/medição: ver histórico da sessão; `teste_play.py` para o play).

| Item | Antes | Depois | Critério |
|---|---|---|---|
| P1 simples (H.264 4K30, corte a cada 2,5 s) | **reprovou**: 6 travadas 130–200 ms, ~1,2 s antes de cada corte | 0 travadas, 4,3 buscas/10 s | passa |
| P2 camadas (3 PiPs 4K c/ keyframes + texto + ajuste Luz e Cor) | passa | passa (monitor 30 fps, desenho 1 ms p50) | passa |
| P3 HEVC 10-bit, corte + dissolução a cada 2 s | passa (prévia leve) | passa | passa |
| P4 9:16 sobre 4K, foto 8K com zoom, legenda | 1 travada 147 ms (1ª passagem pela foto 8K) | idem | passa |
| P5 áudio (4 WAV + som, ganhos, Hard Limiter clipe+Master) | passa (mixer 0,8 ms p95) | passa | passa |
| Abrir projeto 4K (vídeo aberto com prévia leve) | 13 s **toda vez** | 13 s na 1ª, depois 0,4–1,7 s | < 5 s |
| Salto da agulha (até o quadro) | p50 53–145 ms, máx 318 ms | — | < 250 ms (p90 ok; máx às vezes passa) |
| Arrastar agulha | 0 quadros > 100 ms (pior 53–117 ms) | — | ok |
| Exportar P2 1080p | 141 s (7,0x) | **46 s (2,3x)** | ≤ 2x (quase) |
| Exportar P2 4K | 142 s (7,1x) | 103 s (5,2x) | — |
| Exportar P4 9:16 720p | — | 46 s (1,85x) | ok |
| GPU ligada/desligada no encoder | igual (141 s) | — | o gargalo é o grafo, não o encoder |
| Prévia renderizada P2 (4 trechos, prioridade baixa) | — | 61,5 s; play com ela limpo | ok |
| Memória (5 min tocando/saltando/trocando projeto, 2x) | — | 2,0 GB parado → ~2,9 GB em uso, volta; Python 617 MB fixo; heap JS 28 MB | sem vazamento |

Gargalos achados e corrigidos (`Functions/video_cutter.py`):
1. **H.264 4K tocava direto** (sem prévia leve): a reserva buscando/decodificando o GOP 4K travava a página antes
   de cada corte → `_navegador_toca`: maior que a qualidade das prévias vai para a prévia leve (como o HEVC).
2. **Vídeo aberto (mídia 0) reconvertia a prévia a cada abertura** (pasta de sessão nova) → `preparar` usa a pasta
   de cache do vídeo (`_pasta_midia`), igual aos outros vídeos do projeto.
3. **Exportação compunha sempre em 4K** e reduzia no fim → com camadas e saída menor, compõe direto na resolução
   de saída (`_reduzir_camada`: posição/escala/keyframes/tremida × fator; legendas medidas no quadro original).
4. **PiP com zoom animado** convertia o 4K inteiro para RGBA e redimensionava por quadro → fica em YUV e é reduzido
   uma vez ao maior tamanho que a camada atinge (`pre_red`), sem efeitos.
5. **Texto/imagem parada** convertia RGBA→YUV em cada quadro repetido → converte uma vez antes do `loop`.
6. `teste_play.py` não esperava o vídeo aberto (mídia 0) ficar pronto → espera `VE.ready` e o carregamento.

Medição por partes do grafo (20 s, 4K, -f null): base 8 s; PiPs ~130 → ~48 s; texto ~40 → ~6 s; ajuste ~55 s.
Decodificar os 3 arquivos 4K: 13–17 s cada com 4 threads, 5–8 s com threads automáticas, 4,6–7 s com NVDEC.

Pendências (próxima rodada):
- **Vinheta do Luz e Cor** é o filtro mais caro em 4K (47 ms/quadro, sem multithread): máscara pré-calculada +
  `blend=multiply` mediu metade do tempo (14,9 → 7,5 s por 10 s de 4K). Exige 2ª entrada no grafo do ajuste.
- Decodificar camadas com NVDEC (`-hwaccel cuda`, sem ProRes) e/ou mais threads por clipe quando há poucos clipes.
- Foto 8K: `img.decode()` ao carregar, para não travar ~150 ms na primeira vez que aparece.
- Salto da agulha: máximo ocasional 250–320 ms.
- Rodar com material real de celular/drone (sintético não revela tudo); monitor de 60 Hz.
