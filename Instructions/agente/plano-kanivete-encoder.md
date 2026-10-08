# Kanivete Encoder (Ke) — plano (PENDENTE, combinado em 2026-10-07 para a sessão seguinte)

Pedido do usuário: o export é o que impede de trabalhar com vídeos grandes no Editor ("demora, não é confiável").
Objetivo: **exportar mais rápido mantendo a qualidade**, e o painel virar uma ferramenta com identidade própria.
Decisão já tomada: **não** reaproveitar as prévias renderizadas no export (pode afetar o desempenho/qualidade) — fica como está.

## 1. Identidade e janela
- Nome **Kanivete Encoder (Ke)**, loginho `app-logo al-ke` no cabeçalho do painel (cor na paleta laranja, como Ek/Pk/Vk/Sk).
- Hoje: Exportar + fila num painel só (`frontend/js/editor-fila.js`, modal `#ve-export`).
- Virar **janela solta**: mover livremente (arrastar pelo cabeçalho), **minimizar** (vira uma barrinha com o progresso
  da fila) e **fechar** sem parar a fila. Lembrar posição/tamanho. Atalho continua Ctrl+M.

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
