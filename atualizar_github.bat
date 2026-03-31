@echo off
chcp 65001 >nul
title Canivete do Pailer - Atualizar GitHub

color 0A
echo.
echo  =========================================
echo   CANIVETE DO PAILER - ATUALIZAR GITHUB
echo  =========================================
echo.

:: Le versao atual do version.txt
if not exist version.txt echo 1.0.0> version.txt

set /p VERSAO_ATUAL=<version.txt
set VERSAO_ATUAL=%VERSAO_ATUAL: =%

:: Separa major.minor.patch
for /f "tokens=1,2,3 delims=." %%a in ("%VERSAO_ATUAL%") do (
    set MAJOR=%%a
    set MINOR=%%b
    set PATCH=%%c
)

:: Incrementa patch
set /a PATCH_NOVO=%PATCH%+1
set VERSAO_NOVA=%MAJOR%.%MINOR%.%PATCH_NOVO%

echo  Versao atual:  %VERSAO_ATUAL%
echo  Nova versao:   %VERSAO_NOVA%
echo.

:: Pergunta descricao
echo  O que voce melhorou nessa versao?
echo  Exemplo: Adicionei Compressor de Video
echo.
set /p MENSAGEM=" Descricao: "
if "%MENSAGEM%"=="" set MENSAGEM=atualizacao v%VERSAO_NOVA%

echo.
echo  Atualizando arquivos e subindo para o GitHub...
echo.

:: Atualiza version.txt
echo %VERSAO_NOVA%> version.txt
echo  [OK] version.txt -> %VERSAO_NOVA%

:: Atualiza VERSAO_LOCAL no atualizador.py
if exist atualizador.py (
    powershell -NoProfile -Command "(Get-Content atualizador.py) -replace 'VERSAO_LOCAL\s*=\s*"[^"]*"', 'VERSAO_LOCAL   = "%VERSAO_NOVA%"' | Set-Content atualizador.py"
    echo  [OK] atualizador.py -> v%VERSAO_NOVA%
)

:: Remove arquivos desnecessarios
git rm -r --cached dist/ >nul 2>&1
git rm -r --cached build/ >nul 2>&1
git rm -r --cached modelos_ia/ >nul 2>&1
git rm -r --cached __pycache__/ >nul 2>&1
git rm -r --cached huggingface/ >nul 2>&1
git rm -r --cached whisper/ >nul 2>&1
git rm --cached ffmpeg.exe >nul 2>&1
git rm --cached rclone.exe >nul 2>&1

:: Adiciona apenas o necessario
git add *.py
git add *.bat
git add *.txt
git add *.md
git add *.ico
git add *.png
git add *.gif
git add *.webp
git add *.otf
git add *.json
git add *.wav
git add .gitignore
git add LICENSE 2>nul

:: Verifica se tem algo novo
git diff --cached --quiet
if %errorlevel% == 0 (
    color 0E
    echo  Nenhuma alteracao detectada. Nada para subir!
    echo.
    pause
    exit /b
)

:: Commit e push
git commit -m "v%VERSAO_NOVA% - %MENSAGEM%"
if errorlevel 1 (
    color 0C
    echo  ERRO: Falha ao criar commit.
    pause
    exit /b 1
)

git push origin main
if errorlevel 1 (
    color 0C
    echo  ERRO: Falha ao enviar para o GitHub.
    pause
    exit /b 1
)

:: Sucesso
color 0A
echo.
echo  =========================================
echo   Codigo enviado com sucesso!
echo   Versao: %VERSAO_NOVA%
echo.
echo   Proximos passos:
echo   1. Rode o build.bat para gerar o .exe
echo   2. Crie nova Release no GitHub com o .exe
echo  =========================================
echo.
pause
exit
