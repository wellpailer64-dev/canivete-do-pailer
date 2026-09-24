# Pocket Editor — Editor de Vídeo

Editor de cortes estilo Premiere, versão de bolso. Menu: **Editor de Vídeo**.

## Arquivos
- `frontend/js/editor.js` — interface: timeline em canvas, ferramentas, atalhos, reprodução, exportação
- `frontend/css/editor.css` — visual (prefixo `.ve-`)
- `Functions/video_cutter.py` — análise, prévia (proxy), miniaturas, forma de onda, exportação
- `Functions/media_server.py` — servidor HTTP local (127.0.0.1) que entrega vídeo/miniaturas/prévias à interface
- `main.py` — API: `video_cutter_prepare`, `video_cutter_export`, `video_cutter_cancel_export`, `reveal_file`, `open_file`; arrastar-e-soltar via `window.dom` do pywebview

## Por que um servidor de mídia local
A interface roda de dentro do executável. Caminhos `file:///` quebram com espaços/acentos e, no .exe, as
miniaturas eram salvas numa pasta que a interface não enxergava. Cada arquivo é registrado com token
aleatório e servido com suporte a Range (seek). Só escuta em 127.0.0.1. O Cortar Áudio usa o mesmo servidor.

## Prévia
- Toca o original se o WebView suportar (MP4/MOV/WEBM com H.264 8-bit, VP8/9, AV1 e áudio AAC/MP3/Opus).
- Senão (HEVC do iPhone, MKV, AVI, H.264 10-bit, PCM...) gera um **proxy** 720p H.264 `ultrafast` com keyframe
  a cada ~0,5s (scrub preciso). Aparece o selo "PRÉVIA LEVE". A exportação sempre usa o original.
- Arquivos temporários em `%TEMP%\canivete_editor` (limpos ao abrir outro vídeo).

## Modelo de edição
`VE.clips = [{s, e, off}]` cobre o vídeo inteiro de forma contígua. Dividir = partir um clipe em dois.
Remover = `off: true` (clipes removidos vizinhos são fundidos). A reprodução pula os trechos `off`,
então o que se vê é o resultado final. Histórico de desfazer/refazer com 150 passos.

## Exportação (precisão de frame)
Cada trecho mantido vira uma entrada `-ss início -t duração -i arquivo` e tudo passa por `concat`.
Só decodifica o que fica no vídeo (rápido) e não acumula frames na memória. Acima de 150 trechos usa
um único `select/aselect`. GPU (NVENC → QSV → AMF) detectada uma vez; se falhar, refaz pela CPU.
Progresso real via `-progress pipe:1`; cancelamento apaga o arquivo parcial.

Validado: corte em 0:20→0:35 resulta em frame #599 seguido de #1050 do original (30 fps).

## Atalhos
Espaço play · J/K/L · ←/→ frame (Shift = 1s) · ↑/↓ corte anterior/próximo · S ou Ctrl+K dividir ·
Delete remover · I/O entrada/saída · X remover In→Out · Q/W remover antes/depois · V/C/H ferramentas ·
+/- zoom · \ ajustar · N ímã · M mudo · Ctrl+Z/Ctrl+Shift+Z · Ctrl+E exportar · Ctrl+O abrir
