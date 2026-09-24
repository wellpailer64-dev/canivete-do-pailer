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

:: Garante o motor de download de video
python -c "import yt_dlp" 2>nul
if errorlevel 1 (
 echo Instalando yt-dlp...
 python -m pip install yt-dlp
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
 --hidden-import "huggingface_hub" ^
 --hidden-import "whisper" ^
 --collect-all "webview" ^
 --collect-all "pythonnet" ^
 --collect-all "clr_loader" ^
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
