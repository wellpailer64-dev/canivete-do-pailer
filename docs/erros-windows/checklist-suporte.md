# Checklist de suporte

Use este checklist quando alguem disser que o Canivete nao abre no Windows.

## 1. Confirmar o cenario

Pergunte:

- O programa foi baixado como ZIP/RAR?
- Ele esta rodando direto da pasta `Downloads`?
- O erro menciona `Python.Runtime.dll`, `.NET`, `pythonnet`, `clr` ou `webview`?
- O Windows e antigo ou esta sem atualizacoes?

## 2. Primeira tentativa

Orientar o usuario a desbloquear o ZIP/RAR original antes de extrair:

```text
Botao direito no ZIP/RAR > Propriedades > Geral > Desbloquear > Aplicar > OK
```

Depois:

1. Apagar a pasta extraida antiga.
2. Extrair novamente.
3. Abrir `CaniveteDoPailer.exe`.

## 3. Segunda tentativa

Se nao houver mais ZIP/RAR:

```text
CaniveteDoPailer\_internal\Python.Runtime.dll
```

Abrir `Propriedades` da DLL e marcar `Desbloquear`, se essa opcao aparecer.

## 4. Terceira tentativa

Atualizar o Windows e o .NET Framework.

O minimo recomendado e .NET Framework 4.7.2. Computadores com Windows muito antigo podem precisar instalar esse componente manualmente.

## 5. O que pedir se continuar falhando

Pedir ao usuario:

- Print inteiro da mensagem de erro.
- Caminho onde o programa esta salvo.
- Se existe a opcao `Desbloquear` no ZIP/RAR ou na DLL.
- Versao do Windows.
- Se o antivirus colocou algum arquivo em quarentena.

## 6. Observacao importante

Nao prometer que vamos "burlar" o bloqueio do Windows. O correto e diagnosticar e orientar o desbloqueio consciente, porque o bloqueio existe para proteger o usuario contra arquivos baixados da internet.
