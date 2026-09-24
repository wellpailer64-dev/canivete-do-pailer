# Prevencao no executavel

## Objetivo

Evitar que o usuario veja um erro tecnico cru quando o Windows bloquear `Python.Runtime.dll` ou quando o .NET Framework estiver ausente.

## Mudanca aplicada em 2026-06-11

Foi criado o modulo `startup_diagnostics.py`.

Ele roda antes do import de `webview` e faz tres coisas:

1. Procura `Mark of the Web` no executavel e em `Python.Runtime.dll`.
2. Verifica se existe .NET Framework 4.7.2 ou superior no Windows.
3. Mostra uma mensagem de erro amigavel com instrucoes de correcao, usando `tkinter`, se encontrar problema.

O `main.py` tambem passou a importar `webview` dentro de `main()`, depois do diagnostico.

Antes:

```python
import webview
```

Depois:

```python
problem = preflight_problem()
if problem:
    show_startup_error(*problem)
    return

try:
    import webview as _webview
except Exception as e:
    show_startup_error(...)
    return
```

## O que conseguimos prever

- ZIP/RAR ou DLLs com `Mark of the Web`.
- `Python.Runtime.dll` bloqueada dentro da pasta `_internal`.
- .NET Framework 4.7.2 ausente ou nao detectado.
- Falha no import de `webview` antes da janela principal.

## O que nao devemos tentar fazer automaticamente

Nao e recomendado remover o bloqueio do Windows silenciosamente pelo app.

Motivos:

- O bloqueio e uma decisao de seguranca do sistema operacional.
- Remover sem consentimento pode parecer comportamento suspeito para antivirus e SmartScreen.
- O usuario deve saber que esta liberando um arquivo baixado da internet.

## Melhorias recomendadas para proximas entregas

1. Distribuir um ZIP gerado em maquina limpa e, antes de compactar, garantir que a pasta `dist` nao tenha arquivos bloqueados.
2. Incluir um `LEIA-ME.txt` atualizado dentro do pacote final com a instrucao de desbloqueio.
3. Considerar assinar digitalmente o executavel para reduzir alertas do Windows SmartScreen.
4. Considerar criar um instalador real, em vez de entregar apenas pasta compactada.
5. Criar um `reparar_bloqueio_windows.bat` opcional, com texto claro, para usuarios avancados executarem conscientemente.

## Comando manual para suporte avancado

Se o suporte estiver acompanhando o usuario, o PowerShell pode desbloquear a pasta inteira:

```powershell
Get-ChildItem -LiteralPath "C:\CAMINHO\CaniveteDoPailer" -Recurse | Unblock-File
```

Use apenas quando o usuario souber que o pacote veio de uma fonte confiavel.
