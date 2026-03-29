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
set VERSAO=desconhecida
if exist version.txt (
    set /p VERSAO=<version.txt
)
echo  Versao atual: %VERSAO%
echo.

:: Pergunta a mensagem do commit
echo  O que voce melhorou nessa versao?
echo  Exemplo: Adicionei Compressor de Video
echo.
set /p MENSAGEM=" Descricao: "

if "%MENSAGEM%"=="" set MENSAGEM=atualizacao v%VERSAO%

echo.
echo  Subindo para o GitHub...
echo.

:: Remove arquivos desnecessarios do rastreamento
git rm -r --cached dist/ >nul 2>&1
git rm -r --cached build/ >nul 2>&1
git rm -r --cached modelos_ia/ >nul 2>&1
git rm -r --cached __pycache__/ >nul 2>&1
git rm -r --cached huggingface/ >nul 2>&1
git rm -r --cached whisper/ >nul 2>&1
git rm --cached ffmpeg.exe >nul 2>&1
git rm --cached rclone.exe >nul 2>&1

:: Adiciona so o que interessa
git add *.py
git add *.bat
git add *.txt
git add *.md
git add *.ico
git add *.png
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
git commit -m "v%VERSAO% - %MENSAGEM%"

if errorlevel 1 (
    color 0C
    echo.
    echo  ERRO: Falha ao criar commit.
    pause
    exit /b 1
)

git push origin main

if errorlevel 1 (
    color 0C
    echo.
    echo  ERRO: Falha ao enviar para o GitHub.
    echo  Verifique sua conexao ou o token de acesso.
    pause
    exit /b 1
)

:: Sucesso
color 0A
echo.
echo  =========================================
echo   Codigo enviado com sucesso!
echo.
echo   Proximos passos:
echo   1. Rode o build.bat para gerar o .exe
echo   2. Crie nova Release no GitHub
echo  =========================================
echo.
pause
exit
