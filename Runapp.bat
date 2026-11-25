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

rem Sem janela de CMD: abre por pythonw (a saida vai para logsunapp.log). Para ver o console: set KANIVETE_CONSOLE=1
if defined KANIVETE_CONSOLE goto console
rem pythonw.exe do MESMO Python que tem as bibliotecas (caminho completo). Fora de bloco if: dentro dele %PYW% era lido vazio.
set "PYW="
for /f "usebackq delims=" %%P in (`%PY% -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))"`) do set "PYW=%%P"
if not exist "%PYW%" (
    echo pythonw.exe nao encontrado para o Python do app.
    exit /b 1
)
start "" "%PYW%" "main.py" %*
exit /b 0

:console
%PY% "main.py" %*

if not %errorlevel%==0 (
    echo.
    echo O app encerrou com erro ^(codigo %errorlevel%^).
    pause
)
