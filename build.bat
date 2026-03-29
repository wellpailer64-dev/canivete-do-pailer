@echo off
echo Limpando cache anterior...
if exist build rmdir /s /q build
if exist "Canivete do Pailer.spec" del /q "Canivete do Pailer.spec"

echo Instalando dependencias...
python -m pip install playsound pillow imagehash numpy opencv-python openai-whisper rembg onnxruntime transformers torch torchvision packaging

echo.
echo Localizando assets do Whisper...
for /f "delims=" %%i in ('python -c "import whisper, os; print(os.path.join(os.path.dirname(whisper.__file__), 'assets'))"') do set WHISPER_ASSETS=%%i
echo Whisper assets em: %WHISPER_ASSETS%

echo.
echo Gerando executavel...

if exist ffmpeg.exe (
    python -m PyInstaller --onefile --windowed --name "Canivete do Pailer" ^
      --icon="icone.ico" ^
      --add-data "splash.png;." ^
      --add-data "splash.wav;." ^
      --add-data "concluido.wav;." ^
      --add-data "icone.ico;." ^
      --add-data "ffmpeg.exe;." ^
      --add-data "%WHISPER_ASSETS%;whisper/assets" ^
      --hidden-import "transformers" ^
      --hidden-import "transformers.models.clip" ^
      --hidden-import "PIL" ^
      --hidden-import "onnxruntime" ^
      --hidden-import "gdrive_dumper" ^
      --hidden-import "atualizador" ^
      --hidden-import "compressor_video" ^
      --hidden-import "setup_modelos" ^
      --add-data "gdrive_dumper.py;." ^
      --add-data "atualizador.py;." ^
      --add-data "compressor_video.py;." ^
      --add-data "setup_modelos.py;." ^
      --add-data "version.txt;." ^
      interface_canivete_pailer.py
) else (
    echo AVISO: ffmpeg.exe nao encontrado
    python -m PyInstaller --onefile --windowed --name "Canivete do Pailer" ^
      --icon="icone.ico" ^
      --add-data "splash.png;." ^
      --add-data "splash.wav;." ^
      --add-data "concluido.wav;." ^
      --add-data "icone.ico;." ^
      --add-data "%WHISPER_ASSETS%;whisper/assets" ^
      --hidden-import "transformers" ^
      --hidden-import "transformers.models.clip" ^
      --hidden-import "PIL" ^
      --hidden-import "onnxruntime" ^
      --hidden-import "gdrive_dumper" ^
      --hidden-import "atualizador" ^
      --hidden-import "compressor_video" ^
      --hidden-import "setup_modelos" ^
      --add-data "gdrive_dumper.py;." ^
      --add-data "atualizador.py;." ^
      --add-data "compressor_video.py;." ^
      --add-data "setup_modelos.py;." ^
      --add-data "version.txt;." ^
      interface_canivete_pailer.py
)

echo.
echo Concluido! O exe esta em: dist\Canivete do Pailer.exe
pause
