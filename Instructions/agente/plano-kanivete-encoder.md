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
