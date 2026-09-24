@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    python "main.py"
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        py "main.py"
    ) else (
        echo Python nao encontrado no PATH.
        echo Instale o Python ou adicione ao PATH para executar o app.
        pause
        exit /b 1
    )
)

if not %errorlevel%==0 (
    echo.
    echo O app encerrou com erro (codigo %errorlevel%).
    pause
)
