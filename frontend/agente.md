# KANIVETE — modo agente (para o Claude e outros agentes)

Esta página é servida pela porta da INTERFACE do app (a que mostra esta página). Ela só entrega arquivos da
tela; o CONTROLE do app é outra porta, a do modo agente (Chrome DevTools Protocol do WebView2).

## 1. Achar a porta
Leia `%APPDATA%\CaniveteDoPailer\agente.json`:

```json
{"instancias": [{"pid": 10920, "versao": "1.2.380", "estado": "ligado", "porta": 9222,
  "url": "http://127.0.0.1:9222/json/list", "processo_da_porta": "msedgewebview2.exe",
  "porta_interface": 25313, "porta_instancia": 59215}]}
```

- `estado`: `ligado` (use `porta`), `desligado` ou `pendente_reinicio` (o modo foi ligado com o app aberto).
- Confira se o `pid` ainda existe (app fechado à força deixa a entrada até a próxima abertura).
- A porta de controle pertence ao `msedgewebview2.exe`, não ao `CaniveteDoPailer.exe`: procurar pelo nome do app não acha.
- `porta_interface` (esta página) e `porta_instancia` (uma cópia só do app aberta) NÃO aceitam comandos.

## 2. Ligar o modo agente
Preferências › Geral › clique 10 vezes seguidas em "Modo desenvolvedor" › marque "Permitir controle externo da janela".
Vale na próxima abertura: use o botão "Reiniciar agora" que aparece ali. A porta é a primeira livre de 9222 a 9231.
Pela linha de comando: `CaniveteDoPailer.exe --agente` (9222) ou `--agente=9333`.

## 3. Conectar
`GET http://127.0.0.1:<porta>/json/list` → a página com `index.html` → `webSocketDebuggerUrl` → `Runtime.evaluate`
(com `awaitPromise: true` e `returnByValue: true`). Playwright: `chromium.connect_over_cdp("http://127.0.0.1:<porta>")`.

Sem Python no PC (o Python do app fica dentro do .exe), um cliente em PowerShell:

```powershell
param([string]$Expr, [int]$Port = 9222)
$page = (Invoke-RestMethod "http://127.0.0.1:$Port/json/list") | Where-Object { $_.type -eq 'page' -and $_.url -like '*index.html*' } | Select-Object -First 1
$ws = New-Object Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$msg = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $Expr; awaitPromise = $true; returnByValue = $true } } | ConvertTo-Json -Depth 5 -Compress
$b = [Text.Encoding]::UTF8.GetBytes($msg)
$ws.SendAsync([ArraySegment[byte]]$b, 'Text', $true, [Threading.CancellationToken]::None).Wait()
$buf = New-Object byte[] 1048576
do { $sb = New-Object Text.StringBuilder
     do { $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, [Threading.CancellationToken]::None).Result
          [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)) } while (-not $r.EndOfMessage)
     $o = $sb.ToString() | ConvertFrom-Json } while ($o.id -ne 1)
$o.result.result.value | ConvertTo-Json -Depth 8
```

## 4. Olá, mundo
`window.pywebview.api.ve_agente_porta()` → `{porta: 9222, teste: false}`.

## 5. Comandos principais
- `veLogTexto(40)`: últimos avisos, erros de JavaScript e resultados de exportação que apareceram na tela.
- `veAgente('o que estou fazendo', () => { ... })`: toda ação no app do usuário passa por aqui (aviso na tela,
  registro e um passo do Ctrl+Z).
- `veAgenteMidia(cmd, [args])`: leitura de mídia num processo à parte (midias, folha, storyboard, transcrever, batidas).
- `window.pywebview.api.*`: as mesmas funções dos botões. `hardware_estado()` = PC detectado e plano escolhido.
- APIs por ferramenta: `VE`/`VEFILA_API` (Vídeo), `KNV` (Photo), `VKN` (Vetor), `SKN` (Sound), `SDK` (Slider),
  `LUX_API` (Lux), `KE_API` (Encoder).

## 6. Cuidados
- É o app do usuário, aberto: não feche, não recarregue e não clique por cima do trabalho dele sem pedir.
- A porta só escuta em 127.0.0.1. Quem conecta controla o app inteiro.
- `ve_encoder_estado()` volta com CPU/placa `null` na 1ª leitura (aquecendo); leia de novo depois de 1 s.
- Play/fps: comece a medir num trecho com vídeo (trechos só com texto ou vazios não decodificam quadros).
