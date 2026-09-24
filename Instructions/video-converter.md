# Video Converter (GIF <-> Video)

## Visão Geral
Módulo que converte vídeos (.mp4, .mov, etc.) para GIF e GIFs para vídeo (MP4, MOV, WEBM).

## Arquivo Principal
`Functions/videoconverter.py`

## Correções Aplicadas
1. **Falso Concluído:** Corrigida a lógica de conversão em lote. Anteriormente, o `main.py` chamava a função de arquivo único passando o caminho da pasta, o que resultava em erro imediato mas com status de "concluído".
2. **Nova Função em Lote:** Adicionada a função `converter_pasta` que identifica todos os arquivos compatíveis no diretório e os processa sequencialmente.
3. **Detecção de Tipo:** Refinada a função `detectar_tipo_arquivo` para diferenciar pastas de arquivos e validar extensões suportadas.
4. **Localização do FFmpeg:** Sincronizada a busca do `ffmpeg.exe` com a raiz do projeto para garantir que a conversão funcione tanto em ambiente de desenvolvimento quanto no executável final.

## Regras de Conversão
- **Vídeo para GIF:** Reduzido para 12 FPS e largura máxima de 720px para manter o tamanho do arquivo controlado.
- **Vídeo para MP3:** Extrai o áudio original e converte para MP3 (192kbps).
- **GIF para Vídeo:** Loop infinito simulado para 15 segundos de duração para garantir compatibilidade com players que não aceitam loops curtos.

## Integração
- Use `video_converter` para pastas.
- Use `video_converter_file` para arquivos individuais.
- Ambos abrem a pasta de destino ao final do processo.
