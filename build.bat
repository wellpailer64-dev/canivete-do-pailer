@echo off
echo Limpando cache anterior...
if exist build rmdir /s /q build
if exist "Canivete do Pailer.spec" del /q "Canivete do Pailer.spec"

echo Instalando dependencias...
python -m pip install playsound pillow imagehash numpy opencv-python openai-whisper rembg onnxruntime transformers torch torchvision packaging pymupdf

echo.
echo Localizando assets do Whisper...
for /f "delims=" %%i in ('python -c "import whisper, os; print(os.path.join(os.path.dirname(whisper.__file__), 'assets'))"') do set WHISPER_ASSETS=%%i
echo Whisper assets em: %WHISPER_ASSETS%

echo.
echo Verificando ExifTool...
if exist exiftool.exe (
    echo ExifTool encontrado - sera incluido no build
    set EXIFTOOL_ARGS=--add-data "exiftool.exe;." --add-data "exiftool_files;exiftool_files"
) else (
    echo AVISO: exiftool.exe nao encontrado - leitura de metadados sera limitada
    echo Baixe em: https://sourceforge.net/projects/exiftool/files/exiftool-13.53_64.zip/download
    set EXIFTOOL_ARGS=
)

echo.
echo Verificando FFprobe...
if exist ffprobe.exe (
    echo FFprobe encontrado - sera incluido no build
    set FFPROBE_ARGS=--add-data "ffprobe.exe;."
    set FFPROBE_INCLUDED=1
) else (
    echo AVISO: ffprobe.exe nao encontrado - leitura de resolucao pode ficar limitada no .exe
    set FFPROBE_ARGS=
    set FFPROBE_INCLUDED=0
)

echo.
echo Gerando executavel...

if exist ffmpeg.exe (
    python -m PyInstaller --onefile --windowed --name "Canivete do Pailer" ^
      --icon="icone.ico" ^
      --add-data "splash.png;." ^
      --add-data "splash.gif;." ^
      --add-data "hero.webp;." ^
      --add-data "CreateFutureRegular-m2Mw2.otf;." ^
      --add-data "sound\\splash.wav;sound" ^
      --add-data "sound\\concluido.wav;sound" ^
      --add-data "sound\\click.wav;sound" ^
      --add-data "icone.ico;." ^
      --add-data "ffmpeg.exe;." ^
      --add-data "%WHISPER_ASSETS%;whisper/assets" ^
      %EXIFTOOL_ARGS% ^
      %FFPROBE_ARGS% ^
      --hidden-import "transformers" ^
      --hidden-import "transformers.models.clip" ^
      --hidden-import "PIL" ^
      --hidden-import "onnxruntime" ^
      --hidden-import "gdrive_dumper" ^
      --hidden-import "atualizador" ^
      --hidden-import "compressor_video" ^
      --hidden-import "compressor_imagem" ^
      --hidden-import "videoconverter" ^
      --hidden-import "setup_modelos" ^
      --add-data "gdrive_dumper.py;." ^
      --add-data "atualizador.py;." ^
      --add-data "compressor_video.py;." ^
      --add-data "compressor_imagem.py;." ^
      --add-data "videoconverter.py;." ^
      --add-data "setup_modelos.py;." ^
      --add-data "version.txt;." ^
      interface_canivete_pailer.py
) else (
    echo AVISO: ffmpeg.exe nao encontrado
    if not exist exiftool.exe echo AVISO: exiftool.exe nao encontrado
    python -m PyInstaller --onefile --windowed --name "Canivete do Pailer" ^
      --icon="icone.ico" ^
      --add-data "splash.png;." ^
      --add-data "splash.gif;." ^
      --add-data "hero.webp;." ^
      --add-data "CreateFutureRegular-m2Mw2.otf;." ^
      --add-data "sound\\splash.wav;sound" ^
      --add-data "sound\\concluido.wav;sound" ^
      --add-data "sound\\click.wav;sound" ^
      --add-data "icone.ico;." ^
      --add-data "%WHISPER_ASSETS%;whisper/assets" ^
      %EXIFTOOL_ARGS% ^
      %FFPROBE_ARGS% ^
      --hidden-import "transformers" ^
      --hidden-import "transformers.models.clip" ^
      --hidden-import "PIL" ^
      --hidden-import "onnxruntime" ^
      --hidden-import "gdrive_dumper" ^
      --hidden-import "atualizador" ^
      --hidden-import "compressor_video" ^
      --hidden-import "compressor_imagem" ^
      --hidden-import "videoconverter" ^
      --hidden-import "setup_modelos" ^
      --add-data "gdrive_dumper.py;." ^
      --add-data "atualizador.py;." ^
      --add-data "compressor_video.py;." ^
      --add-data "compressor_imagem.py;." ^
      --add-data "videoconverter.py;." ^
      --add-data "setup_modelos.py;." ^
      --add-data "version.txt;." ^
      interface_canivete_pailer.py
)

echo.
echo Concluido! O exe esta em: dist\Canivete do Pailer.exe
pause
