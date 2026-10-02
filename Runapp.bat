@echo off
setlocal
cd /d "%~dp0"

rem Usa o primeiro Python que tem as bibliotecas do app (pywebview). Com varios Pythons instalados, o "python"
rem do PATH pode ser outro (ex.: um 3.11 sem as bibliotecas) e o app nao abria ("No module named 'webview'").
set "PY="
for %%C in ("py -3.13" "python" "py") do (
    if not defined PY (
        %%~C -c "import webview" >nul 2>nul && set "PY=%%~C"
    )
)

if not defined PY (
    echo Nenhum Python com as bibliotecas do app foi encontrado.
    echo Instale com: py -3.13 -m pip install -r requirements.txt
    pause
    exit /b 1
)

%PY% "main.py" %*

if not %errorlevel%==0 (
    echo.
    echo O app encerrou com erro ^(codigo %errorlevel%^).
    pause
)
