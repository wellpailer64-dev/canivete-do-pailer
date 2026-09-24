# 🔧 Canivete do Pailer

> Hub de ferramentas para o dia a dia — feito por criadores, para criadores.

![Python](https://img.shields.io/badge/Python-3.12-orange?style=flat-square&logo=python)
![Windows](https://img.shields.io/badge/Windows-10%2F11-blue?style=flat-square&logo=windows)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/version-1.0.0-orange?style=flat-square)

---

## ✨ O que é?

O **Canivete do Pailer** é um app desktop Windows que reúne 8 ferramentas úteis para o dia a dia de editores de vídeo, criadores de conteúdo e profissionais criativos — tudo em uma interface simples, rápida e bonita.

---

## 🛠️ Ferramentas disponíveis

| # | Ferramenta | O que faz |
|---|-----------|-----------|
| 🗂️ | **Organizador de Imagens** | Detecta e remove duplicatas, classifica por tipo |
| 🎵 | **Converter para MP3** | Converte qualquer áudio para MP3 via ffmpeg |
| 🖼️ | **Converter Imagens** | Converte HEIC/HEIF, JPG, PNG, WebP, AVIF e mais |
| 🎙️ | **Transcrever Áudios** | Transcrição automática via Whisper (IA) |
| 🌐 | **Favicon Generator** | Gera favicons para sites em todos os tamanhos |
| ✂️ | **Remover Fundo** | Remove fundo de imagens com IA (rembg) |
| 🎬 | **Logger Brabo** | Organiza e renomeia vídeos automaticamente |
| ☁️ | **GDrive Dumper** | Baixa pastas inteiras do Google Drive sem zip |

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
├── interface_canivete_pailer.py   ← Hub principal
├── gdrive_dumper.py               ← Módulo GDrive Dumper
├── atualizador.py                 ← Auto-update
├── organizador_de_imagens.py
├── convertermp3.py
├── converterimagem.py
├── transcreveraudio.py
├── removerfundo.py
├── faviconconverter.py
├── organizador_de_videos.py
├── transcrever_cena.py
├── snapshot_logger.py
├── setup_modelos.py
├── build.bat
├── version.txt
├── icone.ico
├── splash.png
├── splash.wav
└── concluido.wav
```

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
