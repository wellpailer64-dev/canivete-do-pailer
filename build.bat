@echo off
:: Uso: build.bat          (local, pausa no final)
::      build.bat --ci     (GitHub Actions, sem pausa)
set CI_MODE=
if /i "%~1"=="--ci" set CI_MODE=1
echo Iniciando build do Canivete do Pailer...
if not exist version.txt echo 1.1.0> version.txt

:: Localiza os assets internos do whisper (mel_filters.npz, etc.)
for /f "delims=" %%i in ('python -c "import whisper, os; print(os.path.join(os.path.dirname(whisper.__file__), 'assets'))"') do set WHISPER_ASSETS=%%i
echo Assets do Whisper: %WHISPER_ASSETS%
for /f "delims=" %%i in ('python -c "import onnxruntime, os; print(os.path.dirname(onnxruntime.__file__))"') do set ORT_DIR=%%i

:: Garante suporte a HEIC/HEIF antes de empacotar o executavel
python -c "import pillow_heif" 2>nul
if errorlevel 1 (
 echo Instalando pillow-heif...
 python -m pip install pillow-heif
 if errorlevel 1 (
  echo ERRO: nao foi possivel instalar pillow-heif.
  if not defined CI_MODE pause
  exit /b 1
 )
)

:: Garante o motor de download de video (com os scripts EJS do YouTube)
python -c "import yt_dlp, yt_dlp_ejs" 2>nul
if errorlevel 1 (
 echo Instalando yt-dlp...
 python -m pip install "yt-dlp[default]"
 if errorlevel 1 (
  echo ERRO: nao foi possivel instalar yt-dlp.
  if not defined CI_MODE pause
  exit /b 1
 )
)

:: Limpa builds anteriores
if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

:: Comando de Build (usando --onedir para startup rápido — sem extração temp a cada launch)
:: Modelos e executáveis são baixados no primeiro uso via first_run.py
python -m PyInstaller --noconfirm --onedir --windowed ^
 --name "CaniveteDoPailer" ^
 --icon "identidade/icone.ico" ^
 --add-data "frontend;frontend" ^
 --add-data "identidade;identidade" ^
 --add-data "Functions;Functions" ^
 --add-data "version.txt;." ^
 --add-data "%WHISPER_ASSETS%;whisper/assets" ^
 --hidden-import "PIL" ^
 --hidden-import "pillow_heif" ^
 --hidden-import "yt_dlp" ^
 --hidden-import "webview" ^
 --hidden-import "webview.platforms.winforms" ^
 --hidden-import "webview.platforms.edgechromium" ^
 --hidden-import "clr" ^
 --hidden-import "pythonnet" ^
 --hidden-import "clr_loader" ^
 --hidden-import "requests" ^
 --hidden-import "Functions.updater" ^
 --hidden-import "Functions.omnivoice_tool" ^
 --hidden-import "Functions.melhorar_audio" ^
 --hidden-import "Functions.melhorar_audio_runner" ^
 --hidden-import "scipy.signal" ^
 --hidden-import "huggingface_hub" ^
 --hidden-import "whisper" ^
 --hidden-import "omnivoice" ^
 --hidden-import "torchaudio" ^
 --hidden-import "soundfile" ^
 --hidden-import "librosa" ^
 --collect-all "yt_dlp_ejs" ^
 --collect-all "pyphen" ^
 --collect-all "webview" ^
 --collect-all "pythonnet" ^
 --collect-all "clr_loader" ^
 --collect-all "omnivoice" ^
 --collect-all "torchaudio" ^
 --collect-all "soundfile" ^
 --collect-all "onnx_asr" ^
 --hidden-import "onnxruntime.quantization" ^
 --add-data "%ORT_DIR%\transformers;onnxruntime/transformers" ^
 --add-data "%ORT_DIR%\tools;onnxruntime/tools" ^
 --hidden-import "Functions.legendas" ^
 --hidden-import "Functions.fontes" ^
 --hidden-import "Functions.render_cache" ^
 --hidden-import "Functions.autoframe" ^
 --hidden-import "Functions.autoframe_modelos" ^
 --hidden-import "Functions.soundboard" ^
 --hidden-import "Functions.anti_noise" ^
 --hidden-import "Functions.transicoes" ^
 --hidden-import "Functions.psd_import" ^
 --hidden-import "psd_tools" ^
 --hidden-import "Functions.editor_imagem" ^
 --hidden-import "Functions.gerador_imagem" ^
 --hidden-import "Functions.recorte_pro" ^
 --hidden-import "Functions.recuperar" ^
 --hidden-import "psd_tools.api.numpy_io" ^
 --hidden-import "Functions.vetor_kanivete" ^
 --hidden-import "Functions.vetor_importar" ^
 --hidden-import "Functions.vetor_exportar" ^
 --hidden-import "Functions.vetor_fonte" --hidden-import "Functions.ponte_illustrator" --hidden-import "Functions.memoria" --hidden-import "Functions.sound_kanivete" --hidden-import "win32com" --hidden-import "win32com.client" --hidden-import "pythoncom" --hidden-import "pywintypes" --hidden-import "win32gui" --hidden-import "win32con" ^
 --hidden-import "pikepdf" ^
 --hidden-import "uharfbuzz" ^
 --hidden-import "qrcode" ^
 --hidden-import "Functions.ampliar_imagem" --hidden-import "Functions.vetor_saida" --hidden-import "Functions.blender_render" --hidden-import "Functions.cena3d" ^
 --hidden-import "pathops" ^
 --hidden-import "skia" ^
 --hidden-import "zstandard" ^
 --hidden-import "fontTools" ^
 --hidden-import "lxml" ^
 --collect-all "pptx" ^
 --collect-data "cv2" ^
 --copy-metadata "pywebview" ^
 --copy-metadata "pythonnet" ^
 --copy-metadata "clr_loader" ^
 "main.py"

if exist "dist\CaniveteDoPailer" (
 if exist "LEIA-ME.txt" copy /Y "LEIA-ME.txt" "dist\CaniveteDoPailer\LEIA-ME.txt" >nul
 if not exist "dist\CaniveteDoPailer\cerebros_md" mkdir "dist\CaniveteDoPailer\cerebros_md"
 if exist "dist\CaniveteDoPailer\modelos_ia" rmdir /S /Q "dist\CaniveteDoPailer\modelos_ia"
 if exist "dist\CaniveteDoPailer\models" rmdir /S /Q "dist\CaniveteDoPailer\models"
 if exist "dist\CaniveteDoPailer\frontend\_audio_preview" rmdir /S /Q "dist\CaniveteDoPailer\frontend\_audio_preview"
 if exist "dist\CaniveteDoPailer\frontend\_cv_progress.json" del /Q "dist\CaniveteDoPailer\frontend\_cv_progress.json"
 if exist "dist\CaniveteDoPailer\_internal\frontend\_audio_preview" rmdir /S /Q "dist\CaniveteDoPailer\_internal\frontend\_audio_preview"
 if exist "dist\CaniveteDoPailer\_internal\frontend\_cv_progress.json" del /Q "dist\CaniveteDoPailer\_internal\frontend\_cv_progress.json"
 if exist "dist\CaniveteDoPailer\_internal\Functions\__pycache__" rmdir /S /Q "dist\CaniveteDoPailer\_internal\Functions\__pycache__"
)


if not exist "dist\CaniveteDoPailer\CaniveteDoPailer.exe" (
 echo ERRO: build falhou.
 if not defined CI_MODE pause
 exit /b 1
)
if exist "version.txt" copy /Y "version.txt" "dist\CaniveteDoPailer\version.txt" >nul

echo.
echo Build concluido com sucesso!
echo O executavel esta na pasta 'dist'.
if not defined CI_MODE pause
exit /b 0
