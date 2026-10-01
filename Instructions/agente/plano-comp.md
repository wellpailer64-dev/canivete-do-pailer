# Plano: Comp (composição estilo After Effects) no Pocket Editor
Combinado com o usuário em 2026-10-01. Status: **Fases 1, 2 e 3 feitas (2026-10-01)** — falta só o opcional (Propriedades essenciais).

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

## Modelo de dados (como ficou na Fase 1 — código em `frontend/js/editor-comp.js`)
- Comp = uma sequência em `VE.sequences` com `comp: true` (mesmos campos de timeline; `w/h` da mãe; `dur`).
- Mídia no Projeto: **`{ kind: 'video', comp: true, sequenceId, path, compSig, cor: 'laranja', pasta }`** — mudou do
  `kind: 'comp'` proposto: sendo um vídeo cujo arquivo é a própria Comp renderizada com alfa, prévia, play, som,
  miniaturas, cortar/velocidade/efeitos e exportação reaproveitam o caminho dos vídeos com transparência.
  O painel mostra o tipo "Comp" (`vePjTipo`). `veSeqMedia` também acha a Comp.
- Arquivo: `<cache de render>/Comps/<hash>.mov` (ProRes 4444 + PCM), hash = `veCompSig` (conteúdo + caminhos dos
  arquivos de dentro). Render: `ve_comp_render` → `render_cache.renderizar_comp` → `exportar_video(alfa=True)`;
  progresso em `veOnComp`. `veCompVerificar` roda ao trocar de timeline, ao abrir projeto e ao criar; a exportação
  espera (`veCompProntas`). Arquivo apagado pela limpeza do cache → renderiza de novo (não vira mídia offline).
- Desfazer: `veSnapshot` guarda `comps` (ids vivos); Comp criada na sessão (`_criada`) some/volta com o Ctrl+Z.
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
**Feito e testado no app (modo agente):** criar (menu, Ctrl+Shift+C, caixa de nome) → 1 faixa laranja; duplo clique
abre; texto mudado dentro → ao voltar re-renderiza e o monitor mostra; exportar logo após editar espera o render
e o MP4 sai com o texto novo, transparente sobre o vídeo, só no trecho; Comp com som (has_audio, entra no mix);
Ctrl+Z/Ctrl+Y; Comp não entra nela mesma; salvar/reabrir (com o .mov apagado do cache → renderiza de novo).
Limitações conhecidas: camada com modo de
mesclagem dentro da Comp deixa o trecho dela opaco onde o fundo era transparente (ffmpeg compõe em gbrp sem alfa);
duplicar a Comp no Projeto cria uma Comp independente (timeline copiada).

### Fase 2 — prévia ao vivo e play fluido (feita)
- Comp desatualizada (`m._aoVivo`, marcada em `veCompVerificar`) ou sem arquivo: o monitor desenha ao vivo
  (`veCompQuadro`) — as camadas de dentro no tempo `s + (t - st) * vel`, num canvas transparente, com o mesmo
  desenhista do monitor (`veDesenharItens`, extraído de `veDrawMonitor`). Imagem/texto/forma/ajuste ao vivo; vídeos
  de dentro em players extras (`veCompVideosVivos` → `veCamPreparar`); Comp dentro de Comp desatualizada, recursivo.
  A prévia nova do arquivo pronta (`veCompUrlPronta`, chamada em `veOnMidia`) → volta a tocar pelo arquivo.
  Ao vivo × arquivo: mesma imagem (só bordas do vídeo meio quadro deslocadas).
- Cache RAM e prévia em disco não usam/geram quadro com Comp ao vivo; Enter e render automático esperam.
- O render da Comp **pausa enquanto toca** (`veCompTick`; mesmo em prioridade baixa ele causava ~9 travadas em 20 s)
  e recomeça ao parar; a exportação não pausa (`VECOMP.exportando`). Processo em prioridade baixa.
- Miniatura e forma de onda na timeline mãe vêm do arquivo da Comp (já da Fase 1).
- `teste_play` (Portugal com Comp de 12 camadas, 20 s): arquivo em dia 0 travadas; ao vivo com render pendente
  1 travada (a do arranque); Portugal sem Comp igual ao de antes.
- Fica para depois: o som de dentro só muda com o arquivo novo; transições de dentro da Comp não aparecem no
  desenho ao vivo (aparecem no arquivo).

### Fase 3 — fluxo e reaproveitamento (feita, menos o opcional)
- **Descompactar Comp** (botão direito / menu Clipe; `veCompDescompactar`): as camadas voltam no lugar, só o trecho
  aparado, a partir da trilha do clipe para cima (sobe se não couber). A Comp fica no Projeto. Recusa com
  velocidade ≠ 100%; efeitos/movimento do clipe da Comp não vão junto (avisa).
- **Pacote** (`veCompPacote` / `veCompImportar`): timeline da Comp + Comps de dentro + dados das mídias. Ctrl+C numa
  faixa de Comp guarda o pacote; Ctrl+V em outro projeto importa (reaproveita mídia com o mesmo arquivo; uma vez
  por projeto) e cola na agulha.
- **Modelo de cliente**: intro/encerramento tipo "Minha Comp" (`intro.comp` / `fim.comp` = pacote). As mídias com
  arquivo são copiadas para a pasta do modelo (`autoframe_modelos.py`). Na geração a Comp é recriada e entra pelo
  caminho do "Meu arquivo de vídeo" (`veAfcPronto`); o som dela vai numa trilha de áudio livre.
- **AutoFrame gera Comps**: intro e encerramento que cobrem a tela (animada / simples) viram "Intro · <cliente>" e
  "Encerramento · <cliente>" (`veAfComps`, camadas marcadas com `_grupo` em `veAfcExtras`; sons ficam fora; a
  transição de entrada passa para a faixa da Comp). Teste: 13 clipes de imagem em 7 trilhas; export = monitor.
- Corrigido no caminho: **camada de ajuste dentro da Comp deixava o fundo preto/opaco** (exportar_video separa o
  alfa antes dos efeitos e devolve depois); render espera as imagens de dentro carregarem. `veCompSig` versão 3
  (Comps antigas renderizam de novo uma vez).
- Falta (opcional): editar o texto/cor da Comp a partir da mãe ("Propriedades essenciais").

## Como testar (modo agente)
- Outra instância: `python main.py --agente=9333` (não usar a do usuário, porta 9222).
- Montar timelines por JS (ver scripts de teste do AutoFrame: criar timeline, `VE.clips = [...]`, `veRelayout()`),
  exportar com `window.pywebview.api.video_cutter_export(...)` (mesmos argumentos de `veStartExport`) e extrair
  quadros com ffmpeg para conferir. Lição: validar sempre o MP4 exportado, não só o monitor.
- Cuidado conhecido: ffmpeg atual zera 8 colunas na conversão yuv→gbrp direta (corrigido na mesclagem passando
  por rgba); qualquer cadeia nova em gbrp deve passar por rgba antes.
