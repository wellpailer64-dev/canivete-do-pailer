# Sound Kanivete (Sk) — editor de áudio multipista

Junta as ferramentas de áudio num editor só (logo **Sk**, dourado), como o Editor/Photo/Vetor.
Código: `frontend/js/som.js` + `frontend/css/som.css` (interface, timeline em canvas, reprodução, `window.SKN`) e
`Functions/sound_kanivete.py` (picos, .sknv, exportar, LUFS); API `sk_*` no `main.py`. Teste: `testes/teste_som.py`.

## Projeto `.sknv`
JSON: `{nome, faixas: [{id, nome, vol, mudo, solo, cor, clipes: [{id, arq, ini, de, dur, vol, fade_in, fade_out, nome, curva?}]}],
marcadores: [{t, nome}]}` — segundos; `ini` = início na timeline, `de` = de onde no arquivo; `vol` linear. Os áudios
ficam onde estão (o projeto guarda o caminho; os faltando são avisados ao abrir). Associação no Windows: `projeto.py`.

## Timeline (fase 1, 2026-10-07)
Faixas com nome/mudo/solo/volume (painel da esquerda); canvas com régua, forma de onda pelos picos (100/s, raiz para
o quieto aparecer, cache em `%LOCALAPPDATA%/CaniveteDoPailer/sk_picos`), arrastar move (troca de faixa, encaixa em
bordas/agulha/marcadores; Alt = cópia), bordas aparam, quadradinhos de cima = fades, régua = agulha.
Atalhos: Espaço tocar, S cortar na agulha, Delete, Ctrl+D duplicar, M marcador, Ctrl+Z/Y, Ctrl+S, Ctrl+E exportar,
Ctrl+I importar, Ctrl+roda zoom, Shift+roda rola, Ctrl+0 ver tudo. Modelos na tela inicial: podcast, narração, música,
limpar gravação. Arquivos soltos na janela entram na faixa selecionada (vários = um por faixa).
Reprodução: um `<audio>` por clipe no WebAudio (ganho = clipe × faixa × fade), relógio do contexto; desligar ao sair.

## Exportar
ffmpeg: por clipe `atrim → volume (curva) → afade → adelay`, por faixa `amix + volume`, e uma BASE DE SILÊNCIO do
tamanho do projeto como 1ª entrada do amix (sem ela a mixagem começava no 1º clipe e saía curta). Volume final
opcional em LUFS (loudnorm em 2 passadas): -14 redes/streaming, -16 podcast, -23 TV. Formatos mp3/wav/m4a/ogg/flac/opus;
só uma faixa ou tudo.

## Automação — `window.SKN`
`novo(modelo, nome)`, `importar(paths, {faixa, ini})`, `faixa(nome)`, `alterarFaixa(id, {...})`, `alterarClipe(id, {...})`,
`mover(id, ini, faixa)`, `cortar(t, ids)`, `apagar(id)`, `marcador(t, nome)`, `ir/tocar/parar`, `desfazer/refazer`,
`salvar(caminho)`, `abrir(caminho)`, `exportar(caminho, {formato, kbps, lufs, faixas, ini, fim})`, `medir()`, `estado()`.

## Próximas fases
2. Limpar (anti-noise DeepFilterNet, Melhorar Áudio) e Voz (OmniVoice) dentro do Sk. 3. Transcrever, soundboard e as
ferramentas antigas como atalhos para o Sk. 4. Normalizar por clipe, compressor/EQ, cortar silêncios, ponte com o Editor.
