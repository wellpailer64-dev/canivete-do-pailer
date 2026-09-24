# Video Downloader - Padrão de Implementação

Este documento fixa as regras de ouro para o Video Downloader, garantindo compatibilidade mobile e estabilidade do sistema.

## 1. Regras de Compatibilidade (WhatsApp/Instagram/Web)
Para que os vídeos baixados funcionem em qualquer dispositivo sem erros de "formato incompatível", a extração e conversão deve seguir rigorosamente estes parâmetros:

*   **Formato Final:** Sempre `.mp4`.
*   **Video Codec:** `libx264` (H.264 AVC). Evitar H.265/HEVC ou AV1.
*   **Audio Codec:** `aac`.
*   **Pixel Format:** `yuv420p` (essencial para visualização em celulares).
*   **Metadados:** Usar o sinalizador `-movflags +faststart` para permitir o streaming imediato e geração de thumbnail em redes sociais.

## 2. Configuração do yt-dlp (ydl_opts)
```python
ydl_opts = {
    "format": "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[ext=mp4]/best",
    "merge_output_format": "mp4",
    "postprocessor_args": [
        "-vcodec", "libx264",
        "-acodec", "aac",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart"
    ],
}
```

## 3. Estabilidade do Sistema (Anti-Crash)
*   **UI Bridge:** Nunca use `Tkinter` (seletores de pasta/arquivos) dentro de ferramentas que rodam em Threads quando o PyWebView estiver ativo. Use `window.create_file_dialog`.
*   **Thumbnails:** Converter thumbnails para **Base64** antes de enviar ao frontend. Isso evita bloqueios de segurança do navegador (`CORS` / `Local File Protocol`) e garante que a imagem apareça instantaneamente sem salvar lixo no disco.
*   **Sanitização:** Use sempre a função `_safe_msg` para limpar strings de log enviadas via `evaluate_js`, prevenindo que aspas no título do vídeo quebrem o código JavaScript.

## 4. Logs e Diagnóstico
Sempre manter uma rotina de `_internal_log` dentro do módulo para capturar erros de biblioteca que ocorrem antes do `main.py` conseguir registrar o traceback.
