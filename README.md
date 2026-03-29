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
| 🖼️ | **Converter Imagens** | Converte entre JPG, PNG, WebP, AVIF e mais |
| 🎙️ | **Transcrever Áudios** | Transcrição automática via Whisper (IA) |
| 🌐 | **Favicon Generator** | Gera favicons para sites em todos os tamanhos |
| ✂️ | **Remover Fundo** | Remove fundo de imagens com IA (rembg) |
| 🎬 | **Logger Brabo** | Organiza e renomeia vídeos automaticamente |
| ☁️ | **GDrive Dumper** | Baixa pastas inteiras do Google Drive sem zip |

---

## ⬇️ Download

> **Não precisa instalar Python nem nada. Só baixar e abrir.**

### [📥 Baixar Canivete do Pailer v1.0.0](../../releases/latest/download/Canivete.do.Pailer.exe)

**Requisitos:**
- Windows 10 ou 11 (64-bit)
- ~1.5 GB de espaço livre (para os modelos de IA)
- Conexão com internet na primeira abertura

**Na primeira abertura**, o app baixa automaticamente os modelos de IA necessários (~1.2 GB no total). Isso acontece **uma única vez**.

---

## 🚀 Como rodar o código-fonte

Se quiser rodar direto pelo Python:

```bash
# 1. Clone o repositório
git clone https://github.com/seuusuario/canivete-do-pailer.git
cd canivete-do-pailer

# 2. Instale as dependências
pip install pillow imagehash numpy opencv-python openai-whisper rembg onnxruntime transformers torch torchvision playsound packaging

# 3. Rode
python interface_canivete_pailer.py
```

---

## 🔨 Como fazer o build

```bash
# Na pasta do projeto
build.bat
```

O executável será gerado em `dist/Canivete do Pailer.exe`.

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
