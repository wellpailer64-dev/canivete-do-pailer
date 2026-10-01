# Plano: Comp (composição estilo After Effects) no Pocket Editor
Combinado com o usuário em 2026-10-01. Status: **aprovado, não iniciado** — começar pela Fase 1.

## Por quê
Projetos com muitas camadas (ex.: intro do AutoFrame com ~15 faixas: foto, Multiplicação, luz, grão, cards, logo...)
lotam a timeline. Comp = várias camadas viram UMA faixa na timeline mãe; editar dentro da Comp atualiza a mãe.
O usuário prefere o modelo do After (Comp) ao Nest do Premiere.

## Decisões (aprovadas)
- Criar: selecionar camadas → botão direito **Criar Comp…** (atalho **Ctrl+Shift+C**) → caixa para o nome.
  As camadas saem da timeline e vão para dentro da Comp com o mesmo tempo relativo; no lugar fica 1 faixa.
- A Comp aparece no painel Projeto **em laranja** (cor do rótulo), como item próprio.
- **Duplo clique** na faixa abre a timeline da Comp numa aba (como as timelines). Mudou lá → a mãe atualiza.
- A Comp **leva o som** das camadas de dentro.
- Fundo **transparente** (o que está embaixo na mãe aparece).
- Tamanho = quadro da timeline mãe; duração = do início da 1ª camada selecionada ao fim da última.
- Na mãe a Comp é um clipe como outro: cortar, mover, velocidade, efeitos, transições, opacidade, escala,
  modo de mesclagem, quadros-chave. Comp dentro de Comp vale.
- Depois: **Descompactar comp** (devolve as camadas), reaproveitar Comp em outros projetos/modelos, AutoFrame
  gerando intro/encerramento como Comps.

## Como o editor funciona hoje (pontos de contato)
- Timelines: `VE.sequences[]` (cada uma: `clips, trilhas, legendas, markers, w, h, playhead...`); a ativa fica
  "aberta" em `VE.clips` (globais). `veCreateTimeline`, `veOpenTimeline`, `veSeqAplicar`, `veSeqSalvarAtiva`,
  `veSeqMedia`/`veSeqCriarMidia` (mídia `kind: 'timeline'`, `sequenceId`) — frontend/js/editor.js ~630–800.
- Hoje uma timeline NÃO entra em outra: `vePjColocar` (editor-projeto.js) com `m.kind === 'timeline'` só abre.
- Menu do clipe: `veClipMenu` (editor.js ~2469). Seleção múltipla: `veSelLista()`.
- Desfazer: `vePushHistory`/`veRestore` guardam SÓ a timeline ativa (`veSnapshot` = clips, in/out, markers,
  legendas). Criar Comp mexe em duas timelines → precisa de entrada de histórico própria (ver Fase 1).
- Monitor: `veDrawMonitor` (editor.js ~2862) monta `vis` a partir de `VE.clips`/`veTransVirtuais()`, cada item
  vira `src` (vídeo/imagem/texto/gráfico/ajuste) e é desenhado com props, efeitos (`veFxRender`) e blend.
- Exportação: `veExportPlan`/`veExportPlanClips` (editor.js ~3310) → `base` (vídeo puro), `camadas`
  (`tipo: imagem|video|ajuste`, path, kf, fx, bm...), `audio`/`mix` → `video_cutter_export` →
  `exportar_video` (Functions/video_cutter.py ~2227). Textos/gráficos viram PNG antes (`veTxPngs`).
- Prévias em disco: editor-render.js (`vePrSig` hash do conteúdo, `vePrJob` = job de exportação de um trecho,
  `render_cache.renderizar`). Mesmo mecanismo serve para pré-renderizar Comps.
- Salvar projeto: `veSaveProject` (editor.js ~3718) filtra `VE.media` por kinds conhecidos (~3686) → incluir
  o kind novo; abrir projeto antigo sem Comps deve continuar igual.

## Modelo de dados proposto
- Comp = uma sequência em `VE.sequences` com `comp: true` (mesmos campos de timeline; `w/h` da mãe; `dur`).
- Mídia no Projeto: `{ kind: 'comp', sequenceId, nome, cor: '#F97316', pasta }` (separada de `kind: 'timeline'`
  para listar/arrastar diferente; laranja por padrão).
- Clipe na mãe: `{ tr, st, s, e, m: idDaMidiaComp, p, k, fx, bm, tin/tout... }` — `s/e` = tempo DENTRO da Comp
  (como um vídeo). Áudio: a Comp ocupa também a trilha de áudio quando tem som (como vídeo com som; `x: 'v'/'a'`
  valem para desvincular).
- Proteção: uma Comp não pode conter a si mesma (direta ou indiretamente) — checar antes de colocar.

## Fases
### Fase 1 — criar, abrir, editar, exportar certo
1. Menu do clipe + atalho: **Criar Comp…** com a seleção (`veSelLista`). Caixa de nome (padrão "Comp 1").
2. Criar a sequência `comp: true` com os clipes selecionados (st relativo ao menor st; trilhas mantidas na
   mesma ordem, reindexadas a partir de 0), mídia `kind: 'comp'` laranja na pasta atual, e trocar na mãe os
   clipes por 1 clipe da Comp na trilha mais baixa que eles ocupavam (de vídeo; + áudio se houver som).
3. Histórico: entrada que guarda {mãe antes, sequência criada} para o Ctrl+Z desfazer a criação inteira.
4. Abrir: duplo clique no clipe da Comp / no item do Projeto → `veOpenTimeline(seqId)` (aba).
5. Exportação: antes de `video_cutter_export`, renderizar cada Comp usada (de dentro para fora) para um arquivo
   com alfa (ProRes 4444 `.mov` ou PNG + áudio à parte) via o mesmo `exportar_video` com fundo transparente;
   cache por hash do conteúdo (`vePrSig`-like) para não refazer; na mãe o clipe vira `camada tipo video`
   apontando para esse arquivo. Áudio da Comp entra no `mix` (deslocado por `st - s`).
   ⚠ `exportar_video` hoje compõe sobre `color=black`: precisa de um modo "fundo transparente" (saída
   `yuva444p10le`/prores_ks 4444 — o código já usa `prores_ks 4444` em outro ponto, ~1037).
6. Prévia provisória: desenhar a Comp a partir do arquivo renderizado (como vídeo); enquanto não existe,
   mostrar um quadro "renderizando Comp…" e disparar o render em segundo plano.
Aceite: criar Comp de 5 camadas → 1 faixa; abrir, mudar um texto dentro, voltar → exportar mostra o texto novo;
Ctrl+Z desfaz a criação; salvar/abrir projeto mantém a Comp; projeto antigo abre igual.

### Fase 2 — prévia ao vivo e play fluido
- Desenho recursivo: `veDrawMonitor` passa a desenhar uma Comp chamando o mesmo desenhista com os clipes da
  sequência dela no tempo `s + (t - st) * vel` num canvas próprio (transparente) e usa o canvas como `src`.
  Imagens/textos/formas/ajustes ao vivo; vídeos dentro da Comp usam o arquivo pré-renderizado no play.
- Invalidação: hash do conteúdo da Comp (como `vePrSig`); mudou → re-render em segundo plano.
- Miniatura/forma de onda da Comp na timeline mãe.
Aceite: rodar `testes/teste_play.py` num projeto com Comp sem travadas novas.

### Fase 3 — fluxo e reaproveitamento
- **Descompactar comp** (devolve as camadas à mãe, no lugar).
- Copiar/colar Comp entre projetos; Comp salva no modelo de cliente do AutoFrame.
- AutoFrame Customizado gera intro e encerramento como Comps ("Intro · <cliente>", "Encerramento · <cliente>")
  — a timeline gerada fica com ~5 faixas em vez de ~20.
- (Opcional, como "Propriedades essenciais" do After/Premiere) editar o texto/cor da Comp a partir da mãe.

## Como testar (modo agente)
- Outra instância: `python main.py --agente=9333` (não usar a do usuário, porta 9222).
- Montar timelines por JS (ver scripts de teste do AutoFrame: criar timeline, `VE.clips = [...]`, `veRelayout()`),
  exportar com `window.pywebview.api.video_cutter_export(...)` (mesmos argumentos de `veStartExport`) e extrair
  quadros com ffmpeg para conferir. Lição: validar sempre o MP4 exportado, não só o monitor.
- Cuidado conhecido: ffmpeg atual zera 8 colunas na conversão yuv→gbrp direta (corrigido na mesclagem passando
  por rgba); qualquer cadeia nova em gbrp deve passar por rgba antes.
