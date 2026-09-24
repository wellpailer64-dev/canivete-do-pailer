# Favicon Generator

## Visão Geral
Módulo que gera múltiplos formatos de ícone (Favicon, Apple Touch, Android Chrome) a partir de uma única imagem.

## Arquivo Principal
`Functions/faviconconverter.py`

## Correções Aplicadas
1. **Crash no Final do Processo:** Corrigido o erro de referência no `main.py` onde a variável `output_dir` estava sendo chamada sem estar definida. Agora o app utiliza o retorno da função `gerar_favicon` para localizar a pasta.
2. **Abertura Automática:** Agora o Windows Explorer abre automaticamente na pasta `favicon_gerados` ao concluir a operação.
3. **CORS e Protocolo de Arquivo:** Implementado o uso de callbacks de progresso sincronizados com o motor do PyWebView para evitar travamentos de interface.

## Estrutura de Saída
A pasta `favicon_gerados` é criada no mesmo diretório da imagem original e contém:
- `favicon.ico` (multi-resolução)
- `apple-touch-icon.png`
- `android-chrome-192x192.png`
- `android-chrome-512x512.png`
- `site.webmanifest`

## Regras de Interface
- O botão **Gerar Favicon** deve disparar a função `favicon_generator` via Thread para manter a UI responsiva.
- Logs em tempo real mostram cada arquivo sendo gerado.
