# Guia de Build (Geração do Executável)

## Visão Geral
O projeto "Canivete do Pailer" é compilado utilizando o `PyInstaller` para gerar um executável (.exe) standalone.

## Pré-requisitos
Certifique-se de ter o PyInstaller instalado:
```bash
pip install pyinstaller
```

O `build.bat` tambÃ©m verifica e instala `pillow-heif` automaticamente para que o executÃ¡vel saia com suporte a HEIC/HEIF embutido.

## Arquivo de Build
O script `build.bat` na raiz do projeto é o responsável pelo processo.

### Conteúdo do `build.bat`
```batch
@echo off
echo Iniciando build do Canivete do Pailer...

:: Limpa builds anteriores
if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

:: Comando de Build
:: --onefile: Gera um arquivo .exe único
:: --windowed: Não abre console CMD ao executar
:: --add-data: Inclui pastas de recursos (frontend, assets, modelos)
:: --hidden-import: Inclui libs de IA que o PyInstaller não detecta automaticamente

pyinstaller --noconfirm --onefile --windowed ^
 --name "CaniveteDoPailer" ^
 --icon "identidade/icone.ico" ^
 --add-data "frontend;frontend" ^
 --add-data "identidade;identidade" ^
 --add-data "modelos_ia;modelos_ia" ^
 --hidden-import "PIL" ^
 --hidden-import "pillow_heif" ^
 --hidden-import "yt_dlp" ^
 --hidden-import "transformers" ^
 --hidden-import "torch" ^
 --hidden-import "onnxruntime" ^
 --hidden-import "webview" ^
 "main.py"

echo.
echo Build concluído com sucesso!
echo O executável está na pasta 'dist'.
pause
```

## Pontos de Atenção

### 1. Tamanho e Tempo de Inicialização
Como o projeto inclui modelos de IA (Whisper, Flan-T5, U2Net) que totalizam ~2GB, o uso de `--onefile` faz com que o executável demore para abrir na primeira execução, pois ele precisa extrair todo o conteúdo para uma pasta temporária do Windows (`%TEMP%`).

### 2. Alternativa para Desempenho (--onedir)
Se a inicialização do executável estiver muito lenta:
- Altere o script de `--onefile` para `--onedir`.
- Isso criará uma pasta `dist/CaniveteDoPailer/` com todos os arquivos soltos.
- A vantagem é que o app abrirá **instantaneamente**, pois não precisa extrair os 2GB de modelos toda vez.

### 3. Caminhos de Arquivos (Paths)
Dentro do código Python, usamos sempre:
```python
def get_base_dir():
    import sys
    if hasattr(sys, "_MEIPASS"):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
```
Isso é crucial para que, tanto no modo script (`.py`) quanto no modo compilado (`.exe`), o app encontre corretamente as pastas `modelos_ia` e `identidade`. Mantenha essa lógica sempre que adicionar novas funções que leiam arquivos.
