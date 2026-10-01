# 🔧 Canivete do Pailer

> Hub de ferramentas para o dia a dia — feito por criadores, para criadores.

![Python](https://img.shields.io/badge/Python-3.12-orange?style=flat-square&logo=python)
![Windows](https://img.shields.io/badge/Windows-10%2F11-blue?style=flat-square&logo=windows)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/version-1.0.0-orange?style=flat-square)

---

## ✨ O que é?

O **Canivete do Pailer** é um app desktop Windows que reúne 15 ferramentas para editores de vídeo, criadores de conteúdo e profissionais criativos. Tudo roda no seu PC, sem enviar arquivos para a nuvem. Dá para arrastar arquivos e pastas direto para qualquer ferramenta.

---

## 🛠️ Ferramentas

| Área | Ferramenta | O que faz |
|---|---|---|
| 🎬 Vídeo | **Editor de Vídeo** | Corta, divide e exporta com atalhos estilo Premiere |
| | **Comprimir Vídeo** | H.265 com GPU (NVIDIA/Intel/AMD); mantém o original se já estiver otimizado |
| | **Converter Vídeo** | MP4, MOV, MKV, WEBM, AVI, GIF e MP3; troca o formato sem recodificar quando dá |
| | **Baixar Vídeo** | YouTube, Instagram, TikTok e mais, até 4K (yt-dlp) |
| | **Logger Pro** | Organiza cartões de câmera e monta o projeto do Premiere |
| 🎵 Áudio | **Converter Áudio** | MP3, WAV, FLAC, M4A, OGG, Opus; extrai o áudio de vídeos |
| | **Cortar Áudio** | Linha do tempo com várias faixas |
| | **Transcrever** | Texto e legenda `.srt` com Whisper |
| | **Melhorar Áudio** | Voz com som de estúdio (como o Adobe Podcast) em áudio ou vídeo — Sidon + OmniVoice |
| | **Geração de Voz** | Clona uma voz por amostra curta e sintetiza textos (OmniVoice) |
| 🖼️ Imagem | **Converter Imagem** | HEIC, RAW, WEBP, AVIF, PNG, JPG, TIFF (mantém EXIF e perfil de cor) |
| | **Comprimir Imagem** | Fotos e PDFs mais leves, em paralelo |
| | **Remover Fundo** | Recorte com IA (ISNet) e revisão antes de salvar |
| | **Organizar Imagens** | Duplicadas, thumbs, gráficos e renomeação por contexto (CLIP) |
| | **Gerar Favicon** | Todos os ícones do site + manifest + código para o `<head>` |
| ☁️ Web | **GDrive Dumper** | Baixa pastas inteiras do Google Drive (rclone) com retomada |
| | **Web Scraper** | Imagens e vídeos de uma página, já organizados |

---

## ⬇️ Download

> **Não precisa instalar Python nem nada. Só baixar, extrair e abrir.**

### [📥 Baixar a versão mais recente](../../releases/latest/download/CaniveteDoPailer-win64.zip)

1. Extraia o `.zip` numa pasta (ex.: `C:\CaniveteDoPailer`)
2. Rode `CaniveteDoPailer.exe`

**Requisitos:**
- Windows 10 ou 11 (64-bit)
- ~1.5 GB de espaço livre (para os modelos de IA)
- Conexão com internet na primeira abertura

**Na primeira abertura**, o app baixa automaticamente os modelos de IA necessários. Isso acontece **uma única vez**.

### 🔄 Atualizações automáticas

Ao abrir, o app consulta a última Release deste repositório. Se houver versão nova, aparece um aviso **"Atualizar agora"**: o app baixa, fecha, instala por cima (mantendo modelos de IA, cérebros e configurações) e reabre sozinho.

---

## 🚀 Como rodar o código-fonte

```bash
git clone https://github.com/wellpailer64-dev/canivete-do-pailer.git
cd canivete-do-pailer
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
python main.py
```

---

## 🔨 Build e Releases

**Automático:** cada `git push` na `main` dispara o GitHub Actions (`.github/workflows/release.yml`), que builda o `.exe` no Windows e publica uma Release `vX.Y.N` (N = número do build). Os apps instalados detectam e se atualizam. Pushes que só mexem em `.md`/`Instructions/` não geram build.

Para mudar a versão "grande", edite `version.txt` (ex.: `1.2.0` → releases `1.2.N`).

**Manual (local):**
```bash
build.bat
```
Gera `dist/CaniveteDoPailer/`. ⚠️ O build apaga `dist/` — não guarde modelos lá.

---

## 📁 Estrutura do projeto

```
canivete-do-pailer/
├── main.py              ← janela (pywebview) + ponte com o frontend
├── first_run.py         ← setup do primeiro uso (baixa modelos, ffmpeg, rclone, deno)
├── Functions/           ← uma ferramenta por módulo (midia.py = ffmpeg/caminhos comuns)
├── frontend/            ← index.html, css/ (style, ui, editor), js/ (app, editor)
├── modelos_ia/          ← baixado no primeiro uso (não versionado)
├── build.bat            ← build PyInstaller
└── version.txt
```

Erros ficam registrados em `logs/erros.log`.

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se livre para:
- Abrir uma **Issue** para reportar bugs ou sugerir melhorias
- Abrir um **Pull Request** com suas alterações

---

## 📄 Licença

MIT License — veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 👤 Autor

Feito com 🧡 por **Pailer**
