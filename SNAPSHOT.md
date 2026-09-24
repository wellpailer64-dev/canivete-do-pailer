# SNAPSHOT — Canivete do Pailer

> Estado funcional confirmado em: **2026-04-14**
> Commit de referência: `563b38f` — *Refactor structure, fix GDrive Dumper, update UI and documentation*
> Branch: `main`

---

## Visão Geral

App desktop Windows (Python 3.12 + pywebview + PyInstaller) que reúne ferramentas para criadores de conteúdo. Interface HTML/CSS/JS servida localmente via `frontend/`. Distribuído como `.exe` único gerado pelo `build.bat`.

---

## Ferramentas (Functions/)

| Arquivo | Nome na UI | O que faz | Dependências-chave |
|---|---|---|---|
| `videodownloader.py` | Video Downloader | Baixa vídeos da internet; extrai info, suporta progresso e cancelamento | yt-dlp, ffmpeg.exe |
| `transcreveraudio.py` | Transcrever Áudio | Transcrição de áudio para `.txt` em PT-BR via Whisper | openai-whisper, ffmpeg.exe, modelo `whisper/` |
| `compressor_video.py` | Compressor de Vídeo | Recomprime vídeos para H.265 (HEVC) mantendo qualidade/resolução; detecta encoders disponíveis | ffmpeg.exe |
| `compressor_imagem.py` | Compressor de Imagem | Comprime JPG, PNG, WEBP, GIF, TIFF, PDF; percorre pastas recursivamente | Pillow |
| `removerfundo.py` | Remover Fundo | Remove fundo de imagens via onnxruntime + u2net.onnx; sem `rembg` em runtime | onnxruntime, numpy, Pillow, modelo `u2net/u2net.onnx` |
| `gdrive_dumper.py` | GDrive Dumper | Baixa pastas inteiras do Google Drive; pause/resume, stall detection, auto-retry | rclone.exe |
| `videoconverter.py` | Converter Vídeo | Converte vídeos entre MP4/AVI/MKV/MOV/WEBM/GIF/MP3 | ffmpeg.exe |
| `convertermp3.py` | Converter Áudio | Converte áudios entre MP3/WAV/FLAC/AAC/M4A/OGG/OPUS | ffmpeg.exe |
| `converterimagem.py` | Converter Imagem | Converte imagens entre WEBP/PNG/JPG/BMP/TIFF/GIF/ICO/AVIF/TGA/PPM | Pillow |
| `organizador_de_videos.py` | Logger Brabo | Organiza arquivos de log de câmeras (Sony, Canon, iPhone, DJI, RED, ARRI...) em estrutura pai/filho com relatório e backup/undo | ffmpeg.exe, snapshot_logger.py |
| `organizador_de_imagens.py` | Organizador de Imagens | Classifica imagens em: logos, thumbs, repetidas, gráficos, fotos_boas — via hash e OCR | Pillow, imagehash, numpy, cv2, pytesseract |
| `transcrever_cena.py` | Transcrever Cena | Analisa frames de vídeo via CLIP e renomeia arquivos com o tipo de cena detectado | torch, torchvision, transformers, Pillow, ffmpeg.exe, modelo `clip/` |
| `webscraper.py` | Web Scraper | Extrai texto e imagens de páginas web (puro stdlib, sem Selenium/BS4) | urllib (stdlib) |
| `faviconconverter.py` | Favicon Generator | Gera todos os favicons para web (favicon.ico, apple-touch-icon, manifest PWA) | Pillow |
| `cerebro_local.py` | Cérebro Local | IA local (FLAN-T5 Base ~1GB) para extração de dados de páginas → CSV; heurísticas de fallback para campos imobiliários | transformers, torch, modelo `cerebro/flan_t5_base/` |
| `snapshot_logger.py` | *(helper interno)* | Gera `BACKUP.json` e `NEXTUP.json` para o Organizador de Vídeos (undo de operações) | stdlib |

---

## Modelos de IA Embarcados (`modelos_ia/`)

| Pasta/Arquivo | Usado por | Tamanho aprox. |
|---|---|---|
| `whisper/` | transcreveraudio.py | ~150 MB (base) |
| `u2net/u2net.onnx` | removerfundo.py | ~170 MB |
| `clip/` | transcrever_cena.py | ~350 MB |
| `cerebro/flan_t5_base/` | cerebro_local.py | ~1 GB |
| `ffmpeg.exe` | videodownloader, compressor_video, videoconverter, convertermp3, transcreveraudio, organizador_de_videos, transcrever_cena | ~120 MB |
| `rclone.exe` | gdrive_dumper.py | ~60 MB |

> **Removido neste checkpoint:** `exiftool.exe` e `exiftool_files/` — foram excluídos do projeto.

---

## Arquivos Raiz Importantes

| Arquivo | Papel |
|---|---|
| `main.py` | Entry point do app; roteamento de chamadas JS → Python |
| `first_run.py` | Setup inicial: baixa modelos de IA na primeira abertura |
| `build.bat` | Gera o `.exe` via PyInstaller (`--onefile --windowed`) |
| `Runapp.bat` | Executa o app em modo dev (sem build) |
| `atualizar_github.bat` | Helper de push para o repositório |
| `CaniveteDoPailer.spec` | Spec do PyInstaller |
| `camera_map.example.json` | Exemplo de mapeamento de câmeras para o Organizador de Vídeos |

---

## Frontend (`frontend/`)

Interface HTML/CSS/JS servida via pywebview. Principais arquivos:

- `index.html` — shell principal
- `js/` — lógica de cada ferramenta
- `css/` — estilos
- `assets/` — ícones e recursos visuais
- `identidade/` — identidade visual do app
- `audio/` — sons de UI
- `_cv_progress.json` — estado de progresso do conversor de vídeo (persistido em disco)

---

## Instructions (`Instructions/`)

Documentação interna das ferramentas (`.md`):

`cerebro.md`, `remover-fundo.md`, `transcrever-audio.md`, `build.md`, `compressor-imagem.md`, `favicon-generator.md`, `gdrive-dumper.md`, `howtoeditapp.md`, `organizador-imagens.md`, `video-converter.md`, `video-downloader.md`, `webscraper.md`

---

## Stack e Requisitos

- **Python:** 3.12
- **Plataforma:** Windows 10/11 (64-bit)
- **UI:** pywebview (HTML/CSS/JS → Python bridge)
- **Build:** PyInstaller `--onefile --windowed`
- **Dependências Python principais:**
  ```
  pillow, imagehash, numpy, opencv-python,
  openai-whisper, onnxruntime, transformers,
  torch, torchvision, pywebview, requests,
  huggingface_hub
  ```

---

## Padrão de Callbacks (contrato interno)

Todas as funções de processamento seguem o mesmo contrato:

```python
def processar_algo(
    caminho,
    callback_log=None,       # callback_log("mensagem") → exibe no terminal da UI
    callback_progresso=None  # callback_progresso(pct, "label") → atualiza barra
):
```

Isso garante que qualquer função possa ser chamada pelo `main.py` de forma uniforme.

---

## O que NÃO está neste snapshot

- Conteúdo de `modelos_ia/` (arquivos binários, não versionados)
- Pasta `dist/` (build gerado)
- Cache `__pycache__/`
- `cerebros_md/` (cérebros do usuário, dados locais)
