# Erros de inicializacao no Windows

Esta pasta registra erros conhecidos do executavel do Canivete do Pailer no Windows e as respostas recomendadas para suporte.

## Casos documentados

- [Python.Runtime.dll bloqueada pelo Windows](python-runtime-dll-bloqueada.md)
- [Checklist de suporte para usuarios](checklist-suporte.md)
- [Prevencao no app e no pacote de entrega](prevencao-no-executavel.md)

## Resumo rapido

O erro visto no PC do Jones indica falha ao carregar a camada `pywebview/pythonnet/.NET`, normalmente por um destes motivos:

1. O Windows marcou o ZIP/RAR ou as DLLs extraidas como arquivo vindo da internet (`Mark of the Web`).
2. O computador nao tem .NET Framework 4.7.2 ou superior.
3. A extracao foi feita a partir de um arquivo ainda bloqueado, espalhando o bloqueio para arquivos internos como `Python.Runtime.dll`.

Desde 2026-06-11, o app tenta diagnosticar esses cenarios antes de importar `webview`, para mostrar uma mensagem de correcao mais clara ao usuario.
