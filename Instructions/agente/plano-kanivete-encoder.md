# Kanivete Encoder (Ke) — plano (rodada 1 de otimização FEITA em 2026-10-08; pendências no fim)

Pedido do usuário: o export é o que impede de trabalhar com vídeos grandes no Editor ("demora, não é confiável").
Objetivo: **exportar mais rápido mantendo a qualidade**, e o painel virar uma ferramenta com identidade própria.
Decisão já tomada: **não** reaproveitar as prévias renderizadas no export (pode afetar o desempenho/qualidade) — fica como está.

## 1. Identidade e janela — FEITO (2026-10-07)
`frontend/js/editor-encoder.js`: logo **Ke** (`.al-ke`, coral #ff7056), título "Kanivete Encoder"; janela solta sobre
o editor (sem escurecer nem bloquear: dá para editar com ela aberta), arrasta pelo cabeçalho, redimensiona pelo canto,
— minimiza para uma barrinha no centro de baixo com "item · N de M · %" (clique restaura; duplo clique no
cabeçalho também minimiza), × fecha sem parar a fila; posição/tamanho em localStorage `ve-ke-janela`. API `VEKE_API`.
Teste: `testes/teste_fila.py` (parte da janela no fim).

## 2. Medir antes de mexer (base de comparação)
- Projetos de teste reais: vídeo longo de celular (10–30 min, H.264/HEVC 1080p/4K), entrevista com cortes + legenda +
  camadas, e o de 4K do `teste-4k.md`. Medir: tempo/duração (x tempo real), CPU/GPU/RAM, qualidade (VMAF/SSIM ou
  `teste_export.py` quadro a quadro), e se termina sem erro (confiabilidade).
- Instrumentar o export: tempo por etapa (preparar, Comps/3D/OVT, textos→PNG, grafo ffmpeg, mux), fps do ffmpeg,
  `-benchmark`; log por exportação em `%TEMP%`/cache para comparar versões.

## 3. Frentes de otimização (ordem provável de ganho)
1. **Corte sem recompor**: trecho de vídeo sem efeito/camada/legenda e com codec/resolução iguais à saída → copiar o
   trecho (stream copy, só nos GOPs inteiros; reencodar só as pontas). Vídeo longo com cortes simples ganharia muito.
2. **Decodificação na GPU** (NVDEC `-hwaccel cuda`) e **encode NVENC** com preset de qualidade (p5–p7, `-tune hq`,
   `-rc vbr -cq`), mantendo x264 como alternativa; conferir que o grafo não força cópia GPU→CPU desnecessária.
3. **Export por blocos em paralelo** (já existe `_exportar_em_blocos`): N blocos ao mesmo tempo conforme núcleos/GPU,
   concatenar sem reencodar; deixar como padrão para vídeos longos se for estável.
4. **Grafo mais barato**: pendências do `teste-4k.md` — vinheta do Luz e Cor com máscara pré-calculada (−50%),
   threads por clipe, legendas/textos estáticos convertidos uma vez, evitar RGBA quando não há alfa.
5. **Confiabilidade**: retomar do bloco que falhou, aviso claro de erro (log do ffmpeg resumido), checar espaço em
   disco antes, nunca deixar arquivo pela metade com o nome final (gravar em .part e renomear).
6. Áudio: mixagem pronta em paralelo ao vídeo (hoje entra no mesmo processo).

## 4. Critérios de pronto
- 1080p simples (cortes + legenda): ≤ 0,5× a duração; com camadas/efeitos: ≤ 1,5×; 4K com camadas: ≤ 3×.
- Qualidade: `teste_export.py` sem reprovar; VMAF ≥ 95 contra o export atual em alta qualidade.
- Vídeo de 30 min exporta do começo ao fim 3× seguidas sem erro.

Referências: `Instructions/agente/teste-4k.md` (medições e gargalos), `Functions/video_cutter.py` (exportar,
`_exportar_em_blocos`, `_reduzir_camada`), `frontend/js/editor.js` (`veExportPlan`), `frontend/js/editor-fila.js`.

## 5. Rodada 1 (2026-10-08) — medido no projeto real Portugal (Helo Ribeiro, 3 reels 1080×1920)
Bancada em `D:\kanivete_testes\encoder\` (fora do repo): `capturar.py` (plano real de cada timeline pelo app 9333),
`bench.py V1 [--blocos]`, `perfil.py` (tempo por bloco), `ablacao.py V1 83.1 94.8` (bloco com partes removidas),
`micro.py` (fps de cadeias de filtro), `comparar.py ref novo` (quadros, som, VMAF/PSNR), `resultados.jsonl`.

| timeline | duração | antes | depois (inteira) | depois (blocos) | VMAF vs antes |
|---|---|---|---|---|---|
| V1 (52 camadas) | 114 s | 372 s (3,25×) | 143 s (1,25×) | 138 s | 98,2 |
| V2 (26 camadas) | 39 s | 143 s (3,64×) | 50 s (1,26×) | 52 s | 96–98 |
| V3 (42 camadas) | 78 s | 148 s (1,89×) | 102 s (1,29×) | 94 s | 97,2 |

O ganho veio dos filtros, não do paralelismo (a CPU já ficava ~80%):
- Luz e Cor em camada de ajuste: vinheta por máscara pré-calculada (`_mascara_vinheta` + blend multiply; o vignette
  era 10 ms/quadro numa thread) e nitidez depois da volta a YUV (`_NIT_NO_YUV`): 26 → 13,7 ms/quadro, 51 dB contra a
  cadeia antiga. O lut3d em gbrp dá OUTRA cor que em rgba (27 dB): manter rgba.
- Imagem parada com zoom animado (logo girando): reduzida uma vez ao maior tamanho (como o pre_red do vídeo).
- Texto/logo PNG da tela inteira: recortado à área visível do alfa (`_bbox_alfa`), centro compensado em ox/oy;
  não recorta com desfoque/Básico 3D (espalham o alfa).
- Origem do tempo do clipe = ponto exato do corte (`setpts=PTS-(s-ss)`), não o 1º quadro lido: fonte 60 fps em saída
  30 fps pegava o quadro vizinho conforme a leitura (blocos não batiam com a exportação inteira).
- Blocos: em paralelo (`_blocos_paralelos`, `CANIVETE_BLOCOS_PAR`), cortes nas edições, som ao mesmo tempo, legenda
  no relógio da timeline (a animação recomeçava a cada emenda), bloco vazio = preto (antes derrubava o export),
  som de projeto sem vídeo principal (antes saía mudo), cancelar mata todos, `.part` renomeado no fim.
- Confiabilidade geral: export normal grava `nome.part.mp4` e renomeia; detecção da placa que estoura o tempo
  (máquina ocupada) não grava "sem placa" no cache (antes a sessão inteira caía para CPU sem aviso).
- teste_export: 13/14 (o "3d" falha por canvas tainted na prévia three.js, não no export); `--blocos`: 6/6.

## 6. Pendências (rodada 2)
- Blocos continuam opcionais (ganho ~5% agora e ~10% mais bits: sem quadros B por causa da emenda). Para virarem
  padrão em vídeo longo: resolver quadros B na emenda (`-bf 0` hoje) e medir 30 min / 3× seguidas.
- Clipe 25 fps (.mov da assinatura) que atravessa emenda de bloco: posição do quadro repetido 25→30 difere em 1.
- Próximo custo: overlay de vídeo em tela cheia em 4:4:4 (a camada de ajuste força o grafo todo em 444; 4–8 ms por
  camada ativa) — juntar clipes seguidos da mesma trilha num concat (1 overlay) e descartar o que fica coberto.
- Stream copy de trechos sem efeito (frente 1 original) e NVDEC fora dos blocos ainda não feitos.

## 7. Rodada 2 (2026-10-08) — placa de vídeo, medições e o que NÃO funcionou
Projeto real: "Depoimento do encontrão" (Carlinhos), timeline Depoimentos V2, 98,8 s 1080×1920 59 fps, 31 cortes de
celular 4K HEVC no V1 (viram camadas a 50%), 18 PNGs de texto/logo, 1 camada de ajuste (Luz e Cor: LUT + Clareza +
Nitidez) cobrindo tudo. Bancada: `D:\kanivete_testes\encoder\` (`capturar_depo.py`, `trocar_fhd.py` → plano com os
_FullHD, `medir_r2.py` export INTEIRO velho(HEAD)×novo com partes removidas, `gpu\micro_ajuste.py`, `gpu\clareza.py`).
- **Placa parada**: o ffmpeg baixado (BtbN latest, N-126905 de 2026-09-27) exige driver NVIDIA 610+ para o NVENC; o
  usuário tinha 591 → `_detectar_hw_encoder` falhava calado e tudo ia para a CPU. Agora `motivo_sem_gpu()` avisa no
  export e no Forçar Full HD (driver velho refaz o teste a cada minuto). Pendente: fixar o ffmpeg numa versão estável em
  `first_run.py` (hoje "latest" = compilação diária) para não quebrar amigos com driver antigo.
- **Rotação dobrada** no caminho pela placa (FHD, proxy, gpu_red): `-noautorotate` + transpose deixava a matriz de
  rotação do original na saída (vídeo de cabeça para baixo). Trocado por `-display_rotation:v:0 0` na entrada.
- Usuário (app instalado): 4K → 6+ min cancelado; com Forçar Full HD + NVENC: 375 s (3,8×).
- Custo por parte (30 s iniciais, Full HD, export inteiro): só vídeos 46 s, + textos/PNGs 58 s, **+ camada de ajuste
  143 s**. Da camada (micro, 30 s): decodificar 5 s, ida/volta RGB 17–23 s, + LUT 47–60 s, + Clareza ~100–180 s, Nitidez 22 s.
- **Testado e DESCARTADO** (não mediu ganho, ruído entre rodadas iguais é ±10%):
  - juntar cortes seguidos num fluxo (concat ou interleave + 1 overlay): só vídeos 24,8 s → 35,6 s (perde o paralelismo
    das leituras separadas; CPU 67% → 46%). Com fps+concat a emenda ainda caía 1 quadro depois.
  - composição em 4:2:0 até a 1ª camada de ajuste/mesclagem: 250 s → 282 s (sem ganho).
  - Clareza com o desfoque numa cópia 4× menor: igual na imagem (PSNR 68 dB) mas 107 → 87 s (o caro são as conversões).
  - Blocos com NVDEC no 4K: 590 s (6×), pior.
- **O que funciona — montagem na placa (prova de conceito)**: clipe Full HD de 30 s com a LUT da camada:
  CPU 18,0 s; Vulkan inteiro (`-hwaccel vulkan` → `libplacebo=lut=x.cube:lut_type=2` → `h264_vulkan`) **4,1 s**;
  Vulkan + hwdownload + NVENC 6,2 s. `lut_type=2` (normalizada) = 44,6 dB contra o lut3d da CPU (o padrão saía magenta).
  Subir/descer o quadro da placa custa 17 s/30 s (igual à ida e volta RGB da CPU): levar UM efeito para a placa não
  paga; o ganho é o quadro nunca sair dela (como o Premiere/Resolve).
- **Próximo (rodada 3): "modo placa"** para o caso comum — cortes com escala/posição, opacidade, Luz e Cor (LUT +
  Clareza/Nitidez/Vinheta num shader do libplacebo, `custom_shader_path`), PNGs de texto/logo subidos UMA vez
  (`loop` depois do `hwupload`), transições (`xfade_vulkan`/`overlay_vulkan`), sombra (`gblur_vulkan`); o que o modo
  não souber cai no grafo de CPU de hoje (como o turbo). Riscos: libplacebo + decode/encode Vulkan na NVIDIA
  (trac #11229 — aqui funcionou com o driver 617), overlay_vulkan com posição fixa (quadro-chave = CPU ou shader).
- Blocos sem `-bf 0` (sugestão da sessão de pesquisa): cada bloco começa num IDR com GOP fechado (x264 `open-gop=0` +
  IDR forçado; NVENC `-forced-idr 1`) e concat `-c copy` — mantém quadros B e tira os ~10% de bits a mais.
- Antes de adotar a montagem na placa: (a) VMAF do `h264_vulkan` × `h264_nvenc` na MESMA taxa (o Vulkan expõe menos
  ajustes: lookahead, AQ, tune hq); se perder, Vulkan → `hwmap` cuda → NVENC e medir se a cópia fica na placa.
  (b) LUT no libplacebo × lut3d (3 s): mesma faixa (Y 16–231), U/V −0,3, mas Y médio +1,5 nível (141,7 → 143,2):
  não é faixa nem matriz; conferir interpolação/dithering (`dithering`, `extra_opts`) até zerar o deslocamento.
- Ordem da rodada 3 (notas da sessão de pesquisa, conferidas no ffmpeg N-126905):
  1. **Fixar a versão do ffmpeg** em `first_run.py` ANTES de publicar o modo placa (a compilação diária + driver 610+
     já derrubou o NVENC aqui); o modo placa cai para a CPU se o Vulkan falhar (Vulkan roda em AMD/Intel também).
  2. `libplacebo` com `inputs=N` compõe várias entradas num passo só, com `pos_x/pos_y/pos_w/pos_h` em EXPRESSÃO por
     quadro (t, n): escala/posição com quadro-chave + PNGs + LUT + shader no mesmo passo, sem cadeia de overlays.
     Opacidade por entrada não aparece nas opções (`-h filter=libplacebo`): resolver no shader ou no alfa do PNG.
  3. 4K: reduzir 4K→1080 dentro do libplacebo (o quadro nunca desce): deve ser o maior ganho nos brutos de celular.

## 8. Rodada 3 (2026-10-08) — MODO PLACA (`Functions/export_placa.py`) e taxa cravada
**Modo placa**: a timeline inteira montada na GPU (Vulkan): vídeos decodificados na placa (girados pelo `libplacebo
rotate` — o `transpose_vulkan` falhava em celular e ignora o recorte), compostos por UM libplacebo com várias entradas
(lotes de 24) com posição/escala/âncora/quadros-chave/Pulsar/Tremer/Dobrar (sx/sy) em expressão por quadro; trilha base
emendada com `concat` na placa (o concat conta os quadros que cada trecho realmente gera — 76 para 76,98: só emendando
igual à CPU os quadros batem); imagens (textos/logos/sequências) preparadas na CPU pequenas e enviadas; sombra como outra
entrada; Luz e Cor (clipe ou camada de ajuste) = `libplacebo lut=… lut_type=2` + shader mpv (Clareza com desfoque em ¼,
Vinheta, Nitidez); fade de opacidade em vídeo = só esse clipe desce/sobe. Encoder = o mesmo da CPU; som pela mesma
mixagem (wav) + junção `-c:v copy`. Chamado por `exportar_video` (placa ligada, sem blocos/prévia/alfa); `motivo()`
diz o que ainda não vai (mesclagem, rotação, legendas, efeitos fora do Luz e Cor em vídeo, 10 bits/ProRes, saída
reduzida, vídeo com alfa) e erro na placa cai na CPU (`_ultimo_motivo_placa`). Depurar: `CANIVETE_PLACA_DEBUG=1`
(grava o grafo em placa_grafo_*.txt na pasta de mídia); desligar: `CANIVETE_PLACA=0`.
Armadilhas medidas (não desfazer):
- `disable_linear=1` na composição: em luz linear um branco a 50% sobre preto dava Y 176 (CPU 126) — fades claros.
- `settb=AVTB` antes dos setpts: a base de tempo do PNG (1/25) arredondava o início e o 1º quadro saía preto.
- expressões com `ot` (tempo da SAÍDA), não `t` (o do libplacebo é o da entrada: a transição Empurrar saía fora).
- cada camada entra ¼ de quadro antes; mesma regra de quadro da CPU (setpts do corte + fps + início na grade; base:
  STARTPTS + concat).
Resultados (Depoimentos V2 inteiro, 98,8 s, Full HD, com som): CPU 264 s (2,7×) → placa 96 s (0,97×); 38,7 dB contra a
CPU, 68 de 5926 quadros < 35 dB (bordas de animação de texto). teste_export `--placa`: todos os casos que vão pela placa
passam (grade, curva, kfmuitos, sobreposição, velocidade, autoframe, sinc).
**Taxa cravada** (decisão do usuário): `video_cutter.taxa_timeline` — 23,976/29,97/59,94 só de fonte constante NTSC;
o resto vai para 24/25/30/50/60 (celular 59,18 → 60). `probe()` devolve `fps_timeline`; exportação (CPU, blocos, placa)
e editor (`veFpsTimeline`, avisa ao abrir) usam ela. teste_export: `conferir_taxa` + caso `sinc` (59,238 com flash e bipe:
som colado no quadro).
Pendências: legendas e mesclagem na placa; prévia renderizada (render auto) pela placa; 4K reduzido direto no libplacebo
(saída reduzida); o +1,5 de Y da LUT; blocos com GOP fechado.

## 9. Janela do Encoder profissional (2026-10-08)
Pedido do usuário: Ctrl+M = fila + abrir a janela; Ctrl+Shift+M = fila sem abrir, com aviso; som ao entrar na fila e ao
concluir cada render; visual profissional, miniatura leve do quadro em render e uso de placa/RAM/CPU ao vivo.
- `veKeFilaAtalho(abrir)` (editor-encoder.js): monta o formulário escondido (sem piscar), põe na fila com o nome da
  timeline e inicia a fila; som `veKeSom('fila')` (WebAudio, 2 toques); concluído = `playConcluido` a cada render.
- Miniatura: 2ª saída do próprio ffmpeg (split → fps=1 → 240 px → JPEG com -update), na CPU, no turbo (hwdownload só
  desse quadro) e no modo placa; fora em prévia, blocos, Comp e wav.
- Monitor: `encoder_monitor.estado()` — um nvidia-smi `-lms 1000` e a CPU numa thread de 1 s (cpu_percent(None) chamado
  de vários lugares dava 0), param 15 s depois da última pergunta.
- Visual: configurações em controles segmentados compactos; "Renderizando agora" (miniatura, barra, tempo, ×, selo
  Montado na placa / Turbo / Processador); 5 medidores. Teste: `D:/kanivete_testes/scripts/teste_ke_atalhos.py` + teste_fila.
- Pendente: textos antigos da fila sem tradução ("Fila de render", "Pausar depois deste"...).

## 10. Diagnóstico do usuário (2026-10-08 noite) e painel Desempenho
- "Processor" com a placa ligada: a timeline tinha 1 texto com mesclagem Multiplicar → motivo() mandava tudo para a CPU.
  Agora Multiplicar vai na placa (`_multiplicar`: fundo × camada sobre BRANCO via blend_vulkan em RGB; a máscara cobre a
  timeline toda — dividir/recortar um ramo acumulava quadros). teste_export caso `multiplicar` (--placa = 4,9; CPU 4,7).
- Fade em clipe: a descida usava `nv12|yuv420p` e o ffmpeg escolhia errado → formato exato.
- **Pendente principal — memória da placa**: o ffmpeg abre todas as entradas no início e os filtros empurram os quadros
  para a frente; camadas que só entram mais tarde (textos em tela cheia, cortes) ficam na fila do libplacebo ocupando
  a placa (1→7,6 GB na timeline atual do Carlinhos: falha e cai na CPU; na CPU é a mesma coisa na RAM, 9–12 GB).
  Solução: montar em PEDAÇOS de tempo (cada um abre só o que aparece nele; serve também para o 4K bruto). Cuidado com a
  base de trechos do vídeo principal: a contagem de quadros de cada trecho depende da fonte (emendar como a CPU).
  Ler Full HD H.264 na CPU foi testado: 13% mais lento e não resolveu (desfeito).
- Ctrl+M: "Overlay transitions 2/2" (preparo) parecia fila parada; Renderizar no meio duplicava a timeline. Agora o
  preparo conta (`VEFILA.preparando`) e Renderizar durante ele só agenda o início.
- Painel Desempenho (`editor-desempenho.js`): CPU/RAM/placa/VRAM/encoder ao vivo, encaixável; vertical, horizontal ou
  mínimo pelo formato do encaixe. Teste: D:/kanivete_testes/scripts/teste_desempenho.py.

## 11. Rodada 4 (2026-10-10) — efeitos na placa e exportação em blocos (Respeite o seu voto)
Projeto real: 2 min 41 s, 1920×1080 29,97, 117 camadas de vídeo (FX30 HEVC 10 bits, iPhone HLG com Dolby Vision),
72 Chroma Key, 16 camadas de ajuste (Luz e Cor com LUT, Aberração, Desfoque, opacidade animada). CPU: **892 s (5,5×)**.
Modo placa: **205 s (1,27×)**, CPU ~10%; diferença média para a exportação de CPU 3,1/255 (pior 5,4 em 320 quadros).
- **Shaders no libplacebo** (`export_placa.py`): Chroma Key (`_shader_key`: alfa, encolher/expandir, suavizar, despill;
  `upscaler=nearest`), Aberração (`_shader_ca`), Desfoque (`_shader_blur`, passadas H/V, amostra de k em k acima de
  64), opacidade de camada de ajuste por quadro (`_shader_opacidade`: tabela indexada pelo `frame` do shader, que
  começa em 1 no 1º quadro que o filtro recebe). Ordem dos efeitos = a da lista (`_passos_lc`).
- **Híbrido** (`_FX_HIBRIDO`): o que ainda não tem shader (Brilho/Contraste, Chroma Key junto com outro efeito) desce só
  naquela camada/trecho, passa pelos MESMOS filtros da CPU (`vc._filtros_fx`) e sobe.
- **Em blocos** (`_blocos`, `_no_bloco`): sem caber na memória da placa (e base só de vazios), blocos de ~12 s nos
  cortes, um após o outro, emenda sem recodificar. Camada que já vinha tocando: `pula`. Forçar no teste:
  `CANIVETE_PLACA_BLOCOS=1 CANIVETE_BLOCO_SEG=1 teste_export.py --placa`.
- Armadilhas medidas:
  - No hook MAIN a cor vem em ponto flutuante **sem trava** (o verde BT.709 tem R −0,06): `clamp` antes de qualquer conta.
  - `trim` decide pelo **fim** do quadro: trecho de camada de ajuste = `ini + ¼ quadro` a `fim + ¼ quadro`.
  - Camada que toca a borda do bloco por fração de quadro (camadas a 30 qps numa saída de 29,97) entra sem quadros e
    trava o `blend` da vinheta (movie em loop): só entra o que cobre ≥ ½ quadro; ajuste sem quadros é ignorado.
  - `hwdownload` de vídeo 10 bits pede **p010**, não nv12 (`_fmt_decodificado`).
  - **iPhone HLG + Dolby Vision**: o libplacebo aplica o Dolby Vision sozinho (tone mapping, −25 níveis, acinzentado).
    A prévia e a CPU tratam como vídeo comum: `sidedata=delete DOVI_METADATA` + `setparams` primárias/curva 709 (`_marca_cor`).
  - A ida e volta RGB da CPU (swscale) erra até 14 níveis em material com muito detalhe; a placa 1,9 (a conta exata do BT.709).
- Testes novos em `teste_export.py`: `chroma2` (key só, key + Luz e Cor, ajuste com Aberração + Desfoque e opacidade
  animada) e `aberracao`. Bancada: `D:/kanivete_testes/keyplaca` (`bloco.py N` monta um bloco do Respeite por script).
- Pendências: abrir o 1º bloco ainda leva ~10 s; Brilho/Contraste e efeitos de clipe combinados com o key ainda descem.

## Rodada 5 — documentário do Gil (20 min, 50 arquivos, 2026-10-11)
Referência: 26 min 06 s (0,79×), 200 blocos de ~6 s, placa. O que se achou e o que mudou:
- **Piscada preta no 1º quadro de cada bloco** que começa no meio de um plano longo (20 piscadas a cada 5,96 s): a
  camada que vinha tocando entrava em −¼ de quadro (tempo negativo) e o libplacebo não a mostrava. `_entra()`: o −¼ só
  para camada que começa DENTRO do bloco. Reproduzido e conferido (blocos 6 s × sem blocos: diferença 0,02).
- **4K ampliado 2×** (drone, show, coro, final do Gil): vídeo ainda na fila de preparação não tinha `m.info` e o
  `veMediaSize` caía no tamanho da sequência. `veMidiasTamanhoGarantir()` + API `ve_tamanhos_midia` antes de exportar.
- **Blocos**: um trecho que não cabia encolhia os blocos da timeline inteira (12 → 6 s); agora `_blocos` divide só o
  bloco que não cabe. **2 blocos ao mesmo tempo** quando cabem (`_blocos_juntos`, `CANIVETE_PLACA_PAR`).
- **Leitura 3 s antes** de cada camada → 1 s (`_PREROLL`, `CANIVETE_PLACA_PREROLL`): um bloco de 5 s caiu de 5,6 para 4,4 s.
- XAVC (H.264 4:2:2 10 bits, câmera do Edgar) a placa não decodifica: CPU com 2 threads, ~100 qps por leitura.
- **Etiqueta de cor**: o .mp4 dos blocos saía sem BT.709 (some no concat) → `h264_metadata`/`hevc_metadata` na junção.
- **Máxima** = cq 17 / crf 16 (era cq 20 / crf 18 ≈ 25 Mbps num 1080p59,94).
- Selo "Montado na placa" do último render dizia "Processador" (a mensagem final é "Concluído!"): `it.foiPlaca`.
- Origem, não export: entrevista do André era a cópia `C5774_OTMZD.mp4` (4K a 2,9 Mbps, mosaico no fundo); o original
  `C5774.MP4` (45 Mbps) foi copiado para 03 ENTREVISTAS (`D:\kanivete_testes\tuhu_org\trocar_andre.py`). Luzes
  piscando medidas na origem (LED/fluorescente, câmera lenta).
- Ferramentas: `D:\kanivete_testes\scripts\` comparar_export.py, zoom_todos.py, pretos.py, exp_trecho.py, bloco_var.py;
  `CANIVETE_PLACA_DEBUG=1` guarda grafo, shaders e comando de cada bloco em `<cache>\placa_dbg\`.

## Rodada 6 — Brilho (glow) da camada de ajuste na placa (2026-10-12)
Documentário do Gil com a coloração final do Pailer (camada de ajuste no vídeo todo: Luz e Cor + Aberração + **Brilho**):
o Brilho estava no `_FX_HIBRIDO` → cada quadro dos 20 min descia para a CPU (gblur) e subia: ~1 %/min (≈ 1h40).
- `_shader_glow` (`export_placa.py`): 4 passadas do libplacebo — limite canal a canal (+ cor × luma) salvo na textura
  `BRILHO` (`//!SAVE`), desfoque H e V (σ = raio/2, mesmos pesos do `_shader_blur`) e soma × intensidade no MAIN.
  Só em camada de ajuste (no clipe o Brilho é camada desenhada; a CPU também ignora). `_lc_ok` aceita `mo_glow`.
- Medido: o mesmo render foi de ~1 %/min para ~2,7 %/min (~37 min). `teste_export --placa`: bloom 1,9; chroma2,
  aberracao e grade OK.

## Rodada 7 — qualidade: escuro em blocos e claros estourados (documentário do Gil v7_1, 2026-10-12)
Queixa do Pailer no `Montagem Pailer v7_1.mp4` (H.264 34 Mbps): "no escuro, pixelados de bitrate baixo; nos claros,
muito estourado". Bancada em `D:/kanivete_testes/qualidade` (`rodar.py` repete um bloco do `CANIVETE_PLACA_DEBUG` com
outro grafo/encoder; `hp.py` gera os grafos 16 bits; `medir.py` erro por faixa de brilho; `fila_trecho.py`/`abrir_v7.py`
em `D:/kanivete_testes/scripts` exportam um trecho pela API da fila no app de teste).
- **Claros: era o Brilho (glow)**, não o export. Ele SOMAVA a luz (limite 21% = quase tudo acima dos médios brilha):
  entrevista do José Antônio, 0,01% de pixels estourados sem o Brilho → 3,9% com ele. Agora a mistura padrão é **Tela**
  (1 − (1−x)(1−g), uma vez por passada como a prévia: `vc.glow_passadas`): 0,01%, o brilho quente fica e a escada/placa
  ganham detalhe. Opção "Somar luz (estoura os claros)" (`soma`) = o modo antigo. Prévia (`editor-motion.js`, canvas
  `screen`), CPU (`blend all_expr`) e placa (`_shader_glow`) iguais; projetos antigos passam a usar Tela.
- **Escuro: era a cadeia em 8 bits, não o encoder.** As fontes são FX30 HEVC **10 bits**, mas cada passo do libplacebo
  gravava `yuv420p`: o 10 bits virava 8 ANTES da LUT/contraste/claridade e o quadro arredondava 5 vezes (camada →
  composição → LUT → Luz e Cor → Aberração → Brilho). No interior do piano do Gil o escuro virava manchas em bloco; o
  mesmo grafo sem perdas (ffv1) já mostrava o defeito, e trocar o encoder (NVENC cq 14, aq, x264 aq-mode 3, HEVC 10)
  quase não mudava. Agora: camada em **10 bits** (`_FMT_CAM = p010le`), composição e efeitos da camada de ajuste em
  **16 bits 4:4:4** (`_FMT_MEIO`), e um último `libplacebo=format=yuv420p` com pontilhado blue noise antes do
  `hwdownload`. Mesmo tamanho de arquivo; tempo igual ou menor (bloco de 30 s: 60–64 s → 55–60 s). Camadas em 16 bits
  davam a mesma imagem que em 10 e eram mais lentas.
- **H.265 10 bits pela placa** liberado (`motivo` aceitava só 8): a saída desce em p010 (legendas em yuv420p10le).
- **Bug achado de carona: "Exportar sem áudio" saía em 30 qps** numa timeline de 59,94 (e qualquer export que não usa o
  vídeo principal, ex. projeto montado só pelo painel Projeto): o fundo preto de reserva (`_base_preta`) era gerado a
  30 e a taxa vinha dele. Agora vem na taxa da timeline (`opcoes.fps` = `VE.fps`, congelada no item da fila).
- Testes: `teste_export.py` 27/27 na CPU e 27/27 `--placa`; blocos forçados (grade, camadas, bloom, legendas, chroma2) OK.
- **Memória esgotada depois da publicação (0721bbe), achada pelo Pailer:** camada de ajuste que começa TARDE no bloco
  (créditos do Gil: desfoque aos 9,6 s de um bloco de 11,6 s). O ramo dela era `trim=start`, o composto não andava até
  o 1º quadro do trecho, e o outro ramo do `split` guardava ~570 quadros na placa — em 8 bits 1,7 GB (cabia), em 16 bits
  6,8 GB (VK_ERROR_OUT_OF_DEVICE_MEMORY, caía na CPU). Agora (`_ajuste`, `tarde` = começa depois de 0,5 s) o ramo anda
  desde o início do bloco, com alfa 0 antes do trecho (`_shader_opacidade(..., desde=0)`). Trecho 1196,8–1249: pela placa,
  pico 5,6 GB com o app aberto. Regra: NUNCA `trim=start` tardio num ramo de `split` (os quadros do outro ramo ficam presos).
- Pendências: (1) reexportar o documentário inteiro e o Pailer conferir no escuro/claro; (2) o Pailer decidir se a mistura
  Tela fica como padrão (ou voltar Somar no projeto dele); (3) a parte da CPU ainda desce em 8 bits nos efeitos híbridos;
  (4) o encoder NVENC usa ~40 Mbps a cq 17 onde o x264 dá o mesmo visual com ~15 — avaliar no próximo passo.

## Rodada 8 — ensinar à placa o que ainda cai no processador (2026-10-12)
Levantamento (código do export + os 9 projetos do disco), pela ordem combinada com o Pailer — um por vez, cada um
documentado, commitado e publicado antes do próximo:
1. **Fade/opacidade em clipe de vídeo** — FEITO (abaixo).
2. Mesclagens fora do Multiplicar (Tela, Sobrepor…): hoje UMA camada assim manda a timeline INTEIRA para a CPU
   (`motivo`). O `blend_vulkan` do ffmpeg 8.1 só tem normal e multiply.
3. Efeito com quadros-chave em clipe de vídeo (`fxk`): timeline inteira na CPU (reels da Carolini Feijão).
4. Transições de sobreposição (`editor-ovt.js`/`transicoes.py`): render prévio quadro a quadro em numpy/OpenCV sobre um
   intermediário ProRes; a prévia já tem o shader (WebGL) — portar para o libplacebo.
5. Chroma Key junto com outro efeito / com opacidade: a camada desce (o key sozinho já é shader).
- Sem solução na placa: XAVC 4:2:2 (câmera do Edgar) e ProRes — o decodificador Vulkan não lê.

### 8.1 Fade de clipe na placa
Antes: clipe de vídeo com opacidade (fixa ou quadros-chave) descia a cada quadro (`hwdownload` → RGBA →
`colorchannelmixer` + `sendcmd` → `hwupload`). Agora `_shader_alfa` (`export_placa.py`): o alfa num shader do libplacebo,
saída `rgba64le` (`_FMT_ALFA`). Os valores são os da CPU (`_valor_kf` no tempo do clipe, `pula` no bloco) guardados em
TRECHOS RETOS (faixa de inclinações, uma passada): um clipe de 10 min com fade = 18 trechos (uma tabela por quadro passaria
do limite do shader); mais de 256 trechos → fica no caminho antigo. Medido (C5797 4K, 20 s, fade): 23,2 s → 14,5 s (−37%).
Caso novo `fadevideo` no `teste_export` (placa 5,2 / CPU 5,4); `--placa` 27/27 + fadevideo OK.
