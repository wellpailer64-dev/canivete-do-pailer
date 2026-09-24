# Compressor de Imagem

## Arquivo Principal
`Functions/compressor_imagem.py`

## Formatos Suportados
`.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.gif`, `.heic`, `.heif`, `.pdf`

## Funcoes Exportadas

### comprimir_arquivo(entrada, saida, qualidade=75)
Comprime um unico arquivo. `qualidade` fica preservado por compatibilidade, mas a logica atual usa perfis internos de candidatos.

### comprimir_lista(arquivos, pasta_saida, ...)
Processa uma lista de arquivos. Parametros relevantes:
- `manter_original=True` -> salva resultado em `pasta_saida/`, preserva original
- `manter_original=False` -> substitui o arquivo original
- `callback_log`, `callback_progresso`, `callback_arquivo` -> callbacks de UI
- `stop_event` -> threading.Event para cancelamento
- `force_fullhd=True` -> redimensiona imagens acima de Full HD antes de comprimir

## Garantia de tamanho

Depois de gerar o arquivo comprimido, o modulo compara o tamanho final com o original. O resultado so e aceito se for realmente menor (`tamanho_final < tamanho_original`). Se a tentativa ficar igual ou maior, o arquivo gerado e apagado e o original e mantido.

## Opcao Full HD

Quando `force_fullhd=True`, imagens acima de Full HD sao redimensionadas antes da compressao, mantendo proporcao. Imagens em paisagem ficam no maximo dentro de `1920x1080`; imagens em retrato ficam no maximo dentro de `1080x1920`. PDFs nao passam por redimensionamento.

## Logica atual

O compressor usa candidatos temporarios em modo rapido. Ele tenta primeiro um perfil equilibrado e para cedo quando a reducao ja e boa. Se a primeira tentativa nao for suficiente, tenta no maximo alguns perfis extras e escolhe o menor arquivo valido. Depois disso, ainda aplica a garantia final de tamanho.

### JPEG
Tenta qualidades `[72, 62, 52]`, com `optimize=True` e `subsampling=2`. Para cedo se atingir boa reducao.

### PNG sem alpha
Tenta um candidato lossless (`compress_level=9`). Se nao reduzir o bastante, tenta quantizacao com `[128, 64]` cores.

### PNG com alpha
Tenta um candidato lossless. Se nao reduzir o bastante, tenta quantizacao com `[128, 64]` cores usando `FASTOCTREE`, preservando transparencia quando possivel.

### WebP
Tenta candidatos lossy nas qualidades `[72, 62, 52]` com `method=6`. Para cedo se atingir boa reducao.

### BMP, TIFF, HEIC, HEIF
Converte para JPEG tentando qualidades `[72, 62, 52]`. A extensao do arquivo de saida muda para `.jpg`.

### GIF
Tenta dois perfis: paleta reduzida e, se necessario, pulo de frames com leve redimensionamento.

### PDF
Usa `PyMuPDF (fitz)` com `garbage=4`, `deflate=True` e `clean=True`. Se `fitz` nao estiver disponivel, retorna erro sem travar.

## Integracao com main.py

- `compressor_imagem(folder_path)` -> varre pasta, salva em `pasta/comprimidas/`
- `compressor_imagem_file(file_path)` -> arquivo unico, salva em `pasta_do_arquivo/comprimidas/`
- Ambas rodam em `threading.Thread(daemon=True)` e reportam via `evaluate_js("updateCompressorImagemProgress(...)")`

## Bugs Corrigidos

### Resultado maior que o original
Todo arquivo gerado passa por uma validacao final de tamanho. Saidas maiores ou iguais ao original sao descartadas e contabilizadas como `mantidos`.

### Metodo pouco eficiente
JPEG usava qualidade alta com `subsampling=0`, WebP era salvo como lossless e PNG fazia poucas tentativas. Agora a ferramenta usa multiplos candidatos por formato e escolhe o menor resultado valido.

### Tempo excessivo
O metodo anterior gerava todos os candidatos sempre, mesmo quando a primeira tentativa ja estava boa. Agora o compressor usa saida antecipada e reduz drasticamente o numero de arquivos temporarios gerados por imagem.
