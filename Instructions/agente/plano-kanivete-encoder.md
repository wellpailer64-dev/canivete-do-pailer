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
