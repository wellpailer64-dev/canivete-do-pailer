# Remover fundo (recorte) — velocidade × qualidade (2026-10-06)

Código: `Functions/recorte_pro.py` (recorte profissional: `recortar`, `tem_pessoa`), `Functions/removerfundo.py`
(modelos, sessões ONNX, GPU), `main.py › ie_recorte_pro` (cache em `%LOCALAPPDATA%/CaniveteDoPailer/cache_recorte`, prefixo
`pro2_`). Bancada de testes (fora do repo): `D:\kanivete_testes\recorte2` (`bench.py`, `zoom.py`, `teste_app.py`, venv
`venv_dml` com onnxruntime-directml).

## Como funciona agora (publicado em f0397b6)
1. **Dispositivo automático** (`_get_sessao`): `onnxruntime-directml` (qualquer placa DX12; vem com CPU junto).
   Sessão na placa com otimização de grafo BÁSICA **sem `ConstantFolding`** — é a única otimização que quebra o
   BiRefNet no DirectML (erro com mensagem ilegível, UnicodeDecodeError). Se falhar: sem otimização; se falhar de
   novo: CPU (e a máquina fica na CPU). `CANIVETE_RECORTE_CPU=1` força CPU. O teste de inferência roda só na 1ª
   abertura de cada modelo (`_gpu_ok`).
2. **Uma sessão por vez na placa**: com o matting aberto, o BEN2 caía de 0,9 s para 5–8 s e o matting de 6 para 14 s
   (8 GB transbordam para a memória compartilhada). Abrir outro modelo solta o anterior. `liberar_sessoes()` solta tudo.
3. **Recorte pelo assunto** (`recortar(rgb, tipo=None)`): detector de rosto **YuNet** (`cv2.FaceDetectorYN`, 230 KB,
   baixado na 1ª vez em `modelos_ia/u2net/yunet-2023mar.onnx`, ~20 ms; rosto < 6% do lado não conta).
   - pessoa → **BiRefNet matting** (928 MB) + filtro guiado + cor descontaminada;
   - objeto → **BEN2** (`ben2-base.onnx`, 223 MB, MIT, baixado sob demanda) + filtro guiado + cor descontaminada.
   O antigo "miolo sólido" por um 2º modelo saiu: obrigava dois modelos na placa e manchava o vidro.
4. MD5 do modelo conferido uma vez por arquivo (`_md5_ok`) — refazer o hash de 1 GB a cada recorte custava segundos.

## Medições (RTX 3050 8 GB, 32 GB RAM)
Inferência a quente, 1024²:
| Modelo | CPU | GPU (DirectML) | Carga na GPU |
|---|---|---|---|
| ISNet | 1,1 s | 0,15 s | 1 s |
| BiRefNet Lite | 9,5–11,5 s | 5,0 s | 4 s |
| **BEN2** | 14,5 s | **0,9 s** | 7 s |
| **BiRefNet matting** | 19–23 s | **5,6 s** | 7–10 s |
Pós-processamento (filtro guiado + cor): 0,7–1 s em 1024; 3,5–4 s em 2048×2560.

Ponta a ponta no app (recorte novo, sem cache): **antes 30–45 s por imagem** (CPU, matting + lite).
Agora: objeto em sequência **~2 s**; objeto depois de pessoa ~8 s (troca de modelo); pessoa em sequência ~7 s;
pessoa depois de objeto ~15 s. Mesma imagem de novo: 0,3 s (cache).

## Qualidade (zoom em `D:\kanivete_testes\recorte2\saida\zoom_*.jpg`)
| Modelo | Cabelo cacheado com árvores atrás | Garrafa de vidro |
|---|---|---|
| ISNet | halo, verde entre os cachos | ok, sólido |
| BiRefNet Lite | razoável, um pouco de verde | bom, sólido |
| BEN2 | mantém o verde entre os cachos | **bom, sólido, limpo** |
| BiRefNet matting | **melhor: buracos limpos, fios finos** | vidro transparente demais |
| pro antigo (matting + lite) | igual ao matting | mancha no gargalo (defeito) |
Por isso a escolha por assunto. Resultado final aprovado: `saida/app_final.jpg`.

## Descobertas que valem lembrar
- `onnxruntime` (CPU) e `onnxruntime-directml` não convivem: desinstalar um para instalar o outro. Mesmo nome de
  import e mesmas pastas (`transformers`, `tools`) → `build.bat` e o `.spec` não mudam.
- OpenCV 5 tirou o `CascadeClassifier` (o app usa 4.13, fixado no requirements). O Haar errava (rosto em cozinha,
  não via mulher real); o YuNet acertou os 6 casos testados.
- BEN2 já sai em 0–1 (o BiRefNet sai em logit): `_alfa_modelo` só aplica sigmoide quando precisa.
- Converter o matting para fp16 (`onnxconverter-common`) quebrou o grafo (tipos incompatíveis em Cast). BEN2 já vem
  em precisão mista — é por isso que é rápido.
- **Gerador de imagem × recorte não cabem juntos na placa**: com o servidor do sd.cpp carregado (~4,4 GB), o BEN2
  ainda rodou em 2 s, mas carregar um modelo de recorte enquanto o gerador está ativo fez a geração seguinte falhar
  ("generate_image returned no results"). O pré-aquecimento depois de gerar foi tirado por isso.

## Pendências
1. **Cena em duas passadas** (`ieCenaGerarTodas` em `frontend/js/imagem-cena.js`, escrito e com sintaxe ok, NÃO testado
   nem publicado): gera todas as imagens com o gerador quente → `ie_gerador_parar` → recorta tudo agrupado (objetos
   primeiro, pessoas depois; dica por `data-pele` e palavras do prompt). Testar com 4 imagens novas intercaladas
   (2 objetos, 2 pessoas) e conferir que todas saem; depois publicar.
2. Testar recorte de pessoa (matting) com o gerador carregado; se disputar memória, `liberar_sessoes()`/parar o
   gerador antes do recorte fora da cena.
3. Folha de contato do `knv.py --gerar`: aplicar o mesmo agrupamento (gerar tudo, soltar o gerador, recortar).
4. Aviso "saiu cortado" dá falso positivo quando o fundo da página é parecido com a borda da imagem (xícara no teste).
5. Medir em máquina sem GPU dedicada (amigos): conferir que cai na CPU sem travar e que o tempo não piora.
6. Avaliar BiRefNet-portrait (o ONNX do Hugging Face não baixou no caminho testado) e BiRefNet_lite-matting
   (89 MB, só safetensors — exportar para ONNX) como matting mais leve para pessoa.
7. Filtro guiado em foto grande (2048+): rodar em resolução reduzida para tirar 3–4 s do pós-processamento.
