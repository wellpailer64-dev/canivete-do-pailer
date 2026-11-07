# KaniBoard (Kb, amarelo #FFC933)

Quadro branco infinito no jeito do Miro (pedido do Pailer em 2026-11-07). Aba própria `#page-kaniboard`, grupo "Quadros".

## Arquivos
- `Functions/kaniboard.py` — quadros em `<raiz_dados()>/KaniBoard/<id>/` (`board.json` gravado por .tmp + replace,
  `thumb.png` = prévia, `midia/` = imagens e GIFs). Apagar move para `KaniBoard/_lixeira`.
- `main.py` — `kb_listar/novo/abrir/salvar/renomear/favoritar/duplicar/apagar/midia/midia_arquivo/exportar_png`.
  `kb_abrir` devolve `midia_url` (pasta registrada no media_server, CORS `*` → o canvas não fica "sujo").
- `frontend/js/kaniboard.js` — estado `KB`, desenho no DOM, câmera, histórico, salvar, desenho em canvas (prévias,
  minimapa, exportar PNG), API do agente `KBO_API`.
- `frontend/js/kaniboard-interacao.js` — tela, ferramentas, mouse, teclado, colar/arrastar, barra de contexto, menu,
  frames, apresentação. `frontend/js/kaniboard-lobby.js` — entrada (modelos com prévia real, grade "Seus quadros").
- `frontend/css/kaniboard.css`; fundo do lobby `video/lobby-kb.webm`; cartão da Home `img/tools/kaniboard.webp`.

## Prefixo `kbo-` (não `kb-`)
O plugin KaniBrowser injeta CSS com `.kb-*` e define `window.KB_API`. Por isso classes/ids do KaniBoard são `kbo-*` e a
API é `KBO_API`. As funções `kb*` e o `KB` globais não colidem (as do plugin ficam dentro do `new Function`).

## Modelo do documento
`{nome, tema: claro|escuro, fundo: pontos|grade|liso, cam:{x,y,z}, itens:[...]}`; ordem do array = ordem de cima.
Itens: `nota` (cor, html, fs opcional = automático), `forma` (forma, preench, borda, esp, corTexto), `texto` (fs, cor;
h medido), `seta` (a/b = `{id, lado: t|r|b|l|auto}` ou `{x,y}`; estilo curva|reta|cotovelo; pontaA/B), `caneta`
(pts relativos a w0×h0; marca = marca-texto), `imagem` (src `midia/…`), `frame` (nome, cor; ordem dos frames = slides).
Comuns: `lock`, `g` (grupo), `negrito/italico/sublinhado/riscado`.

## Desenho
Mundo = div com `translate+scale` (`--kbz` = zoom, para rótulos e linhas de espessura fixa na tela). Camadas: frames <
setas (SVG 1×1 com overflow visível) < itens < rótulos das setas. Alças, guias, pontos de ligação e "+" ficam em `#kbo-ui`
(coordenadas de tela). Fonte automática das notas: busca binária no maior tamanho que cabe (palavra não quebra).

## Interação (igual ao Miro onde dá)
Roda = zoom (touchpad = rolar; trocar em ⋯ › Roda do mouse); botão do meio/direito/Espaço = mover a tela. Duplo clique
no vazio = nota. Tab na nota = próxima. Digitar com nota/forma/texto selecionada = escrever nela. "+" ao lado da
nota/forma cria a próxima ligada. Pontos azuis nas bordas = puxar seta. Alt+arrastar duplica; guias de alinhamento
(Ctrl desliga). Frames levam junto o que está dentro (centro dentro). Apresentar = frames em tela cheia (máscara fora do
frame; se o navegador recusar a tela cheia, usa `toggle_fullscreen` da janela).

## Salvar
Mudança → 0,7 s → `kb_salvar` (prévia no máximo a cada 6 s e sempre ao sair do quadro/aba). Câmera sozinha salva em 2,5 s.
Desfazer = foto JSON dos itens (150 passos); criar + escrever uma nota = 1 passo.

## Testes
App de teste 9333: `D:/kanivete_testes/scripts/kb_teste.py` (notas, Tab, desfazer, forma, seta grudada, caneta, borracha,
seleção, copiar/colar, zoom, frame, texto, salvar, prévia, reabrir) e `kb_teste2.py` (modelo, imagem, barra de contexto,
paleta, painel de frames, apresentação, renomear). Os quadros dos testes vão para `D:/Kanivete/KaniBoard` (mesma pasta do
Pailer): apagar no fim. O erro "VEKE already declared" depois de `reload()` vem do agente.js, não do KaniBoard.

## Armadilhas
- `kbVoar`: o horário do requestAnimationFrame pode ser anterior ao `performance.now()` → fração negativa → zoom 0/∞ e
  laço infinito no fundo de pontos. Fração presa em 0..1 e câmera inválida volta para 1:1.
- `#kbo-vp` tem `data-f` (cursor): o clique delegado só olha `#kbo-barra [data-f]`.
- Prévia de modelo: as setas acham as pontas por `KB.doc` → trocar `KB.doc` pelo modelo ao desenhar.

## Ainda não tem
Rotação, comentários, figurinhas/emoji, tabelas, edição a várias pessoas, voltar da lixeira pela tela.
