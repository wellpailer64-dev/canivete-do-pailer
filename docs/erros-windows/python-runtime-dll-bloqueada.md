# Python.Runtime.dll bloqueada pelo Windows

## Sintoma

Ao abrir o `CaniveteDoPailer.exe`, o Windows mostra erro relacionado a `Python.Runtime.dll`, `.NET Framework`, `pythonnet`, `clr` ou inicializacao do runtime .NET.

Esse erro apareceu novamente no PC do Jones e foi associado ao executavel empacotado para Windows tentando carregar `Python.Runtime.dll` dentro da pasta `_internal`.

## Causa mais comum

Quando o programa e baixado como `.zip` ou `.rar`, o Windows pode aplicar o `Mark of the Web`, um bloqueio de seguranca para arquivos vindos da internet.

Se o usuario extrai o pacote enquanto o ZIP/RAR ainda esta bloqueado, o bloqueio pode ser herdado por arquivos internos. O caso mais sensivel aqui e:

```text
CaniveteDoPailer\_internal\Python.Runtime.dll
```

Quando essa DLL esta bloqueada, o `pywebview/pythonnet` pode falhar antes mesmo da janela principal abrir.

## Solucao 1: desbloquear o ZIP/RAR original

Esta e a solucao recomendada quando o usuario ainda tem o arquivo compactado original.

1. Abra a pasta `Downloads`.
2. Localize o `.zip` ou `.rar` do Canivete do Pailer.
3. Clique com o botao direito no arquivo e abra `Propriedades`.
4. Na aba `Geral`, procure a secao `Seguranca`.
5. Marque `Desbloquear` ou `Unblock`.
6. Clique em `Aplicar` e depois em `OK`.
7. Apague a pasta antiga que ja tinha sido extraida.
8. Extraia o ZIP/RAR novamente.
9. Abra `CaniveteDoPailer.exe`.

## Solucao 2: desbloquear a DLL diretamente

Use esta solucao quando o usuario nao tem mais o ZIP/RAR original.

1. Abra a pasta do programa `CaniveteDoPailer`.
2. Entre na pasta `_internal`.
3. Localize `Python.Runtime.dll`.
4. Clique com o botao direito e abra `Propriedades`.
5. Se existir a opcao `Desbloquear`, marque-a.
6. Clique em `Aplicar` e depois em `OK`.
7. Abra `CaniveteDoPailer.exe` novamente.

## Solucao 3: atualizar o .NET Framework

O `pywebview/pythonnet` precisa do .NET Framework 4.7.2 ou superior no Windows.

Se o Windows estiver muito desatualizado:

1. Rode o Windows Update.
2. Instale todas as atualizacoes pendentes.
3. Se necessario, instale manualmente o .NET Framework 4.7.2 ou superior pelo instalador oficial da Microsoft.
4. Reinicie o computador.
5. Abra o Canivete novamente.

## Frase curta para enviar ao usuario

O Windows provavelmente bloqueou arquivos internos do Canivete porque eles vieram da internet. Clique com o botao direito no ZIP/RAR original, va em Propriedades, marque Desbloquear, aplique, extraia de novo e abra o programa. Se nao tiver mais o ZIP/RAR, desbloqueie `CaniveteDoPailer\_internal\Python.Runtime.dll`.
