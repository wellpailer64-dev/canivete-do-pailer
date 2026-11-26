# Registro de melhorias do MCP de Vídeo (`kanivete_executar_comando`, domínio `video`)

Este é o **diário de bordo** das mudanças nos comandos de vídeo do MCP. Antes de mexer em algum comando, leia aqui:
o motivo de cada decisão, o que foi testado e o que ficou em aberto. Depois de mudar, **acrescente uma entrada** (não
apague as antigas: quem vier depois precisa saber por que o código está assim).

Onde fica o código: `D:/Kanivete/Plugins/kanicode/mcp_manifesto.py` (tabela `VIDEO`, nomes/risco/assinatura) e
`mcp_kanivete.py` (`_executar_video`, handlers `veMcp*` dentro de uma string JS). O app edita em
`frontend/js/editor.js` (dentro deste projeto). Guia de uso geral: `roadmap-mcp-video.md`.

## Como registrar (modelo)

```
## <data> · <autor/aba> · <assunto>
- Comando(s)/arquivo(s):
- Sintoma ou lacuna (o que doía no uso real):
- O que mudou (antes → depois):
- Linha de raciocínio (por que assim e não de outro jeito):
- Resultado/conferência (teste, app 9333, arquivo medido):
- Limites e pendências:
```

---

## 2026-11-17 · Big Pickle (DeepSeek-V4.1-Flash), aba 128 · Lote 16: correções da auditoria do MCP de vídeo

Origem: relatório de exploração do MCP (21 comandos exercitados no app 9333) que listou 5 frentes, na ordem abaixo.
Tudo foi corrigido nesta entrada, na mesma ordem, com teste ao vivo no app de teste.

### 1. `montar_timeline` — identidade dos clipes criados (bug de corrupção)
- **Arquivos:** `mcp_kanivete.py` (`veMcpMontar`).
- **Sintoma:** depois de montar, o comando podia **renomear, mover ou aplicar efeitos no clipe errado**. O handler
  pegava os novos clipes com `VE.clips.slice(antes)` (contando do fim). Só que `vePlaceClip` → `veRelayout` **ordena a
  lista por `st`/`tr`**: um clipe novo em 0 s entra no começo e o "pedaço do fim" era um clipe antigo.
- **O que mudou:** antes de colocar, guarda-se o conjunto de clipes existentes (`new Set(VE.clips)`); depois, os novos
  são os que **não estavam no conjunto**. A resposta agora traz `clipes_criados: [{k, id, indice, tr, st, fim, nome}]`.
  Também valida `st >= 0`, `dur > 0` e `tr` (ver item 2) e devolve sugestão de nome quando a `fonte` não existe.
- **Raciocínio:** a lição de `duplicar_clipe` vale igual aqui — **índice não é identidade** numa lista ordenada. Comparar
  por referência de objeto é o jeito barato e seguro; o `id` só é gerado depois, quando alguém lê a timeline.
- **Conferência:** projeto novo no 9333, clipe "ANTIGO" em st=10, depois montagem de "NOVO_MONTADO" em st=0 (que entra
  antes na lista). Resultado: novo com `tr=1`, `st=0`; antigo intacto em st=10 e com o nome; ids únicos.
  Script: `D:/Kanivete/Testes/opencode_mvp/tmp/opencode/teste_melhorias_video.py`.
- **Limites:** um item com erro não derruba os outros (comportamento antigo mantido); efeitos/transições continuam
  sendo aplicados por índice recalculado dentro do laço.

### 2. Validação de `tr` e de `keyframe`; `abrir_timeline` aceitando `seq_…`
- **Arquivos:** `mcp_kanivete.py` (`H.veMcpTr`, `veMcpMover`, `veMcpDuplicar`, `veMcpMontar`, `veMcpKf`, `veMcpRef`,
  resolução de argumentos), `mcp_manifesto.py` (`tr: "n|s?"`).
- **Sintoma:** `mover_clipe {tr: 99}` "funcionava" e criava trilha inexistente; `keyframe {prop: "xyz"}` gravava
  `c.k.xyz` com valor `undefined`, deixando o clipe "animado" para o MCP (bloqueava mover/escalar) sem animação
  nenhuma; e `abrir_timeline {id: "seq_…"}` morria antes de chegar no comando, porque `veMcpRef` tratava todo `id`
  como id de clipe.
- **O que mudou:**
  - `tr` aceita número, `V2` ou `A1`, valida `0..veTrackCount()` e cria a trilha se for a próxima (`veEnsureTrackIndex`).
  - `keyframe` recusa `prop` fora de `sc|x|y|rot|op|vol|fx.ID.param`, valor não numérico, `interp` inválido e faixa
    (`op` 0–100, `vol` −60..24, `sc > 0`).
  - `veMcpRef` só é aplicado quando o comando não é `abrir_timeline`; a mensagem de id inexistente explica que pode ser
    desfazer/duplicação.
- **Raciocínio:** validar na borda do handler evita estado inválido no projeto; aceitar `V2/A1` casa com o que aparece
  em `listar_trilhas` (e é como o agente pensa), sem obrigar a converter à mão. O caso do `abrir_timeline` é conflito de
  **namespace**: `seq_…` e `clp_…` são ids de coisas diferentes.
- **Conferência:** `mover_clipe` para `A2` → `tr=1`; `tr:99` → erro "tr fora das trilhas (0 a 4)"; keyframe inválido
  recusado 2×; `criar_timeline` + `abrir_timeline {id}` e volta para a timeline 1 com os 2 clipes.
- **Limites:** a trilha é um índice compartilhado entre V e A no app; por isso `tr` não escolhe "tipo de trilha" — o
  tipo vem do clipe (`x`/mídia). O que dá para validar é faixa e parte (`x`).

### 3. Id de clipe estável no histórico (desfazer/refazer)
- **Arquivos:** `mcp_kanivete.py` (`veMcpId`), `frontend/js/editor.js` (`veCopiaClipe`, `veSplitAt`,
  duplicar com Alt, colar).
- **Sintoma:** o `_mcpId` era uma propriedade **não enumerável**, então não entrava no JSON do histórico (`veSnapshot`) e
  sumia no Ctrl+Z: o mesmo clipe trocava de id e o agente passava a receber "id de clipe inexistente" no meio da edição.
- **O que mudou:** o `_mcpId` passa a ser **gravado no próprio clipe** (vai para o histórico e para o `.vknv`; o id de
  um clipe é o mesmo depois de salvar, abrir e desfazer). Cópias precisam de id novo, então ele é apagado em:
  `veCopiaClipe` (duplicar, colar, cópia de Comp), no pedaço novo da divisão (`veSplitAt`), na duplicação com Alt e na
  colagem múltipla.
- **Raciocínio:** preferi estabilidade a "invalidar ao desfazer": o agente trabalha em sequências longas e o id que ele
  leu uma vez deve continuar valendo. O risco de dois clipes herdarem o mesmo id foi tratado na origem (todo ponto que
  clona clipe), não com um contador global.
- **Conferência:** renomear + `desfazer` + `propriedades_clipe {id}` → o id ainda resolve e o clipe está lá. Ids únicos
  conferidos na timeline.
- **Limites:** projetos antigos ganham id na primeira leitura (`linha_do_tempo`); um clipe vindo de projeto sem id é
  identificado igual aos outros.

### 4. `novo_projeto` sem documento, `fps`, catálogo compacto e sugestão de nomes
- **Arquivos:** `mcp_kanivete.py` (guarda do JS, `veMcpProjetoNovo`, `veMcpSeqTam`, `veMcpListaFx`, `veMcpFxAdd`,
  `veMcpAchaMidiaOk`), `mcp_manifesto.py`, `frontend/js/editor.js` (`veCriarProjetoVazio`, `veSeqCapturar`,
  `veSeqAplicar`, carga do projeto, `veApplyProject`).
- **Sintomas:**
  - `novo_projeto` era **inutilizável**: o handler exigia `VE.ready` e a camada de baixo risco exigia documento/revisão —
    exatamente o caso "não há timeline aberta".
  - Não havia como definir o **fps** da sequência pelo MCP (só vinha da primeira mídia).
  - `listar_efeitos` devolvia ~20 KB (todos os parâmetros) mesmo para escolher um efeito.
  - Nome de mídia errado em `montar_timeline`/`trocar_imagem` só dizia "não encontrada" — sem pista de qual usar.
- **O que mudou:**
  - `novo_projeto {largura?, altura?, fps?, forcar?}` roda com ou sem timeline; recria via `veCriarProjetoVazio` com
    `forcar` (o app antes retornava sem fazer nada se já houvesse projeto) e marca o projeto como não salvo.
  - `tamanho_sequencia {fps?}` e o fps de `novo_projeto` ficam salvos **na timeline** (`veSeqCapturar/veSeqAplicar`) e no
    topo do arquivo; ao abrir, o fps do projeto prevalece sobre a taxa da mídia de origem.
  - `listar_efeitos` sem `detalhe` devolve só `{efeito, tipo}` (`busca` continua casando pelo nome humano) e
    `{detalhe:true}` traz parâmetros; efeito desconhecido sugere os parecidos.
  - Mídia não encontrada devolve até 5 nomes parecidos e a lista do projeto.
- **Raciocínio:** o fps é propriedade da **sequência**, não da mídia (celular com taxa variável, projeto misto): guardar
  por timeline é o modelo que o app já tinha para tamanho (`w/h`) e evita "o fps volta sozinho" ao reabrir.
- **Conferência:** `novo_projeto` 1080×1920/24 no 9333 → `pronto`, `w/h/fps` corretos; `tamanho_sequencia {fps:24}` →
  `sequences[...].fps === 24`; `listar_efeitos` 4,7 KB contra 9,3 KB com `detalhe`.
- **Limites:** não há controle de fps na interface do app (o texto ainda diz "padrão, pelo 1º vídeo"); o valor vindo do
  MCP vale para o projeto, mas quem abrir no app não vê um seletor. Salvar muda o formato do `.vknv` só acrescentando
  `fps` (projetos antigos continuam abrindo).

### 5. Lote: seleção múltipla, efeito em vários clipes, fechar vãos e exportar por trecho
- **Arquivos:** `mcp_kanivete.py` (`veMcpSelVarios`, `veMcpFxLote`, `veMcpVaos`, `veMcpExportar`), `mcp_manifesto.py`.
- **Lacunas:** o app já tinha seleção múltipla (`VE.selx`), mas nada no MCP mexia nela; aplicar o mesmo efeito em 10
  clipes custava 10 chamadas e 10 passos de desfazer; não havia "fechar vão"; exportar só o trecho exigia marcar In/Out
  em dois comandos separados.
- **O que mudou:**
  - `selecionar_clipes {indices}` usa `veSelDefinir` (a UI passa a mostrar a seleção).
  - `aplicar_efeito_varios {indices, efeito, params?}` (até 50) aplica com **um** passo de desfazer; erros por clipe
    voltam em `erros`.
  - `remover_vaos {trilha?, de?, ate?}` fecha os vãos entre clipes seguidos da mesma trilha, levando junto o par
    vinculado (`lk`); trilha com cadeado fica como está.
  - `exportar_video {de?, ate?}` marca In→Out e exporta só o trecho (sem eles, usa o que já estava marcado).
- **Raciocínio:** lote só vale se o desfazer for **um** (senão o Ctrl+Z vira loteria) — por isso `vePushHistory` é
  neutralizado durante o laço e chamado uma vez. Fechar vãos move o clipe para a esquerda (nunca há falta de mídia nem
  sobreposição, já que o espaço estava vazio); o par vinculado anda junto para não dessincronizar som/imagem.
  Exportar por trecho reaproveita a faixa In→Out que a exportação já respeitava — não inventei um segundo caminho.
- **Conferência:** efeito em 2 clipes com `history` crescendo 1; vão de 2 s fechado (`VAO_B` emenda em `VAO_A`);
  exportação 0–2 s em 480p → arquivo de **2,000 s** conferido com `ffprobe`
  (`D:/Kanivete/Testes/opencode_mvp/teste_trecho.mp4`).
- **Limites:** `de/ate` **deixam** os pontos marcados no projeto (não restauram o In/Out anterior); `remover_vaos` não
  mexe em legendas nem em trilhas travadas e não fecha vão antes do primeiro clipe (o buraco inicial não é "entre
  clipes").

### Correções menores no mesmo lote
- **`fade_audio {saida: 0.04}` pedia confirmação de exportação.** `_tem_caminho` tratava a CHAVE `"saida"` como arquivo
  mesmo com número no valor. Agora a chave só conta como caminho quando o valor é texto (o caminho absoluto/relativo
  continua sendo detectado pelo próprio valor). Teste: `test_chave_de_caminho_so_vale_com_texto`.
- **`revisar_edicao` agora acusa:** `keyframe_invalido` (propriedade que o app não desenha, lista vazia, tempo/valor
  inválido), `trilha_invalida` (`tr` não inteiro/negativo — o `mcp_teste.vknv` antigo tem clipes com `tr: "v"`),
  `parte_invalida` (`x` fora de `v|a`), `audio_duplicado` (som embutido + clipe de áudio separado da mesma mídia na
  mesma janela) e `hdr` (HLG/PQ ou BT.2020, uma vez por mídia). **HDR é aviso, não erro:** o app já exporta com a marca
  de cor certa (`Functions/video_cutter.py`), o que falta é olho humano na conferência de tom.

### Decisões que ficaram de fora (e por quê)
- **Desfazer do mixer e da troca de timeline:** o histórico do vídeo é do app (`veSnapshot`) e não guarda `VE_TRK` nem
  troca de sequência. Envolver isso é mudar o modelo de histórico do editor, não um comando do MCP — risco alto para o
  ganho. Continua documentado como cuidado no roadmap.
- **"Clipe em trilha de tipo errado":** no app a trilha é um **índice compartilhado** entre a pilha de vídeo e a de
  áudio; o que pode estar errado é `tr` inválido ou `x`. Por isso a checagem se chama `trilha_invalida`/`parte_invalida`
  e não promete mais do que o modelo permite.
- **Fps na interface do app:** só o MCP define; criar seletor exige mexer no diálogo de Configurações da sequência.

### Arquivos alterados neste lote
- `D:/Kanivete/Plugins/kanicode/mcp_kanivete.py` (handlers, gate sem documento, `_tem_caminho`)
- `D:/Kanivete/Plugins/kanicode/mcp_manifesto.py` (VIDEO: 3 comandos novos + assinaturas)
- `D:/Kanivete/Plugins/kanicode/tests/test_mcp_kanivete.py` (4 testes novos; 28 no arquivo)
- `CANIVETE DO PAILER/frontend/js/editor.js` (id estável em cópias/divisão, `veCriarProjetoVazio(forcar)`, fps na
  sequência e na carga do projeto)

### Como conferir de novo
```
py -3.13 -m unittest discover -s tests -p "test_mcp*.py"          # em D:/Kanivete/Plugins/kanicode (50 testes)
py -3.13 tools/agente/abrir_teste.py <projeto.vknv>               # app 9333
py -3.13 D:/Kanivete/Testes/opencode_mvp/tmp/opencode/teste_melhorias_video.py
py -3.13 tools/agente/abrir_teste.py --fechar
```
O teste ao vivo chama o **JS gerado** por `_executar_video` direto na página (sem depender de reiniciar o servidor MCP).
Depois de mudar handler, reinicie o MCP para as sessões abertas verem o comando novo.

## 2026-11-17 · Codex, aba 132 · Identidade do agente antes da ação
- **Arquivos:** KaniCode `mcp_kanivete.py`, `tests/test_mcp_kanivete.py`; Kanivete `frontend/js/agente.js`, `frontend/js/app.js`, `main.py`, `testes/teste_identidade_agente.py`.
- **Sintoma:** DeepSeek aparecia como Claude; uma conexão CDP ociosa mantinha a borda laranja. O vídeo atribuía `kvAgenteAtual` depois de `veAgente`, e o próprio aviso tinha Claude fixo.
- **Mudança:** comandos executam dentro de `_js_identificado`/`kvComAgente`, com identidade explícita e limpeza em finally. O vídeo passa `{agente}` a `veAgente`; leituras não produzem pulso de escrita. Autor desconhecido permanece genérico, sem alterar sua identidade de autorização. Borda por atividade com expiração: Claude laranja, ChatGPT/Codex branco e DeepSeek/Pickle azul.
- **Conferência:** 11 casos de interface/integração em Chromium isolado; regressões do MCP com execução em Node para identidade durante a ação, restauração em sucesso/falha e leituras silenciosas. Na instância 9222, a aplicação da interface preservou snapshot, dirty, sequência e agulha; a borda apagou apesar da conexão técnica aberta.
- **Limites:** CDP bruto precisa declarar o autor em `veAgente(..., {agente})` ou `kvComAgente(agente, fn)`; a porta não revela o modelo. Servidores MCP antigos carregam a alteração Python na próxima conexão. Não se reiniciou o app nem se provocaram comandos de teste na timeline do Pailer.

## 2026-11-18 · Claude (Haiku 5.5), aba 137 · analisar_mix considera ducking e volume da trilha
- **Comando:** `analisar_mix` (`veMcpAnaliseMix` em `mcp_kanivete.py`; assinatura no `mcp_manifesto.py`, leitura).
- **Lacuna (HDI, 17/11):** a conta somava só LUFS do trecho + ganho. Com ducking (`k.vol` -12/-13 dB na trilha) o alerta
  de 3 dB "trilha alta sobre a voz" saía falso, porque a trilha abaixa de verdade na fala.
- **O que mudou:** cada clipe entra na janela com o nível médio da linha de volume (`k.vol`, tempo da fonte via
  `veVel`) + volume da trilha do mixer (`VE_TRK.a[tr].vol`). Média em potência sobre 5 pontos da janela. Clipe mudo
  (`veMudo`) sai da conta. Fades continuam fora (aparecem nos clipes); o aviso diz isso.
- **Conferência:** conta de ducking testada em Node com `veCnVolEm` extraída de `frontend/js/editor-caneta.js`:
  fora do ducking 0,00 dB; dentro -13,00 dB; janela de transição -5,30 dB. Teste novo
  `test_analisar_mix_considera_ducking_e_gera_js_valido` (verifica a ligação no JS gerado e se o JS compila).
  Suíte `test_mcp*`: 59 OK (com `PYTHONUTF8=1`).
- **Limites:** não rodei o comando ao vivo no app de teste 9333 (o JS gerado depende do app inteiro, ~92 KB). Para
  fechar: abrir projeto de teste com trilha em ducking e comparar `janelas` antes/depois. A média de janela suaviza
  transições curtas (< 0,3 s). O mixer é por índice de trilha compartilhado com vídeo (ver item 2 acima).
- **Reinício:** sessões MCP abertas antes desta mudança seguem com o código antigo até reiniciar o MCP.

## 2026-11-18 · Claude (Haiku 5.5), aba 137 · Latência real e pulso visual do agente na timeline
- **Latência (diagnóstico corrigido):** a medição de ~2,5 s por chamada (`tests/latencia_mcp.py`) era artefato do shell:
  `KANIVETE_MCP_PORTA=9333` estava definido e força o app de teste (fechado). Com a porta real (9222), o MCP responde em
  ~30 ms aquecido e ~830 ms na primeira chamada. **Antes de culpar o MCP por lentidão, confira `KANIVETE_MCP_PORTA`
  (`env | grep KANIVETE`) e o `porta` que o servidor escolheu.** Ponto aberto: com o app de teste fechado e a porta
  forçada em 9333, cada chamada gasta ~2 s na sonda de instância antes do erro `instancia_indisponivel`.
- **Reação visual:** cada clipe alterado por um comando do agente (MCP ou UI) ganha um contorno na cor do agente que
  some em 1,1 s. Código: `frontend/js/editor.js` (`veAgPulsar`, `veAgPulsarMudancas`, `veAgPulsoDesenhar`, chamado no
  desenho do vídeo e do áudio); `frontend/js/agente.js` (`veAgente` tira a assinatura dos clipes antes da ação e acende
  os que mudaram depois). Não entra no projeto nem no histórico. A expiração é por tempo, para clipe fora da tela não
  manter o laço vivo. Limite: 40 clipes por ação.
- **Conferência:** `testes/teste_pulso_agente.py` (código real extraído de `editor.js`, Node): só o clipe alterado acende,
  o contorno aparece só nele, e o laço para sozinho. `teste_identidade_agente` continua OK (12 testes com o novo).
  No app aberto do Pailer (9222) as funções foram aplicadas e conferidas por `typeof`; **o efeito visual na tela não foi
  visto** e não houve comando de escrita no projeto dele.
- **Limites:** `aplicar.py` não pega `window.veAgente = async function` (só `function nome(` na coluna 0); o trecho de
  `veAgente` foi aplicado direto na página a partir do mesmo arquivo. Falta a ponta a ponta no app de teste 9333.
- **Reinício:** o servidor MCP já abertos seguem com o código antigo; a parte de `editor.js`/`agente.js` vale na hora.

## 2026-11-18 · Claude (Haiku 5.5), aba 137 · Pulso ponta a ponta no app de teste (9333)
- **Teste:** `D:/Kanivete/Testes/scripts/pulso_ponta_a_ponta.py`. Abre `cultsp2/teste.vknv` (112 clipes) via `abrir_teste.py`,
  chama `veAgente('teste de pulso', ..., {agente:'claude'})` mudando o volume de um clipe e tira foto da tela.
- **Resultado:** `VE_AG_ATIVOS` acende 1 clipe (o alterado, `st` 3,204 s); 0,25 s depois ainda há 1; 1,75 s depois, 0.
  Captura `D:/Kanivete/Testes/scripts/pulso_tela.png`: contorno avermelhado no clipe do V2 em ~3,2 s; banner
  "Claude: teste de pulso" no topo.
- **Limite:** a cor do contorno foi conferida só pela imagem, não em pixel. Micro-ações e fila de tarefas longas no
  KaniCode continuam pendentes.
- **Atenção:** `abrir_teste.py --ajuda` NÃO é ajuda: a flag vira nome de projeto e sobe o app de teste.

## 2026-11-18 · Claude (Haiku 5.5), aba 137 · Micro-ação de um clipe pelo caminho do MCP (app de teste 9333)
- **Teste:** `D:/Kanivete/Testes/scripts/micro_ganho.py` e `micro_latencia.py`. Chamam `mcp_kanivete._executar_comando`
  com `video/ganho_clipe {indice: 4, db}` no projeto `cultsp2/teste.vknv`; o mesmo caminho que o MCP usa.
- **Resultado:** `ok: true`, reversível, entra no histórico. Logo depois da chamada, 1 clipe aceso (`VE_AG_ATIVOS`) e
  o ganho gravado (-3 dB).
- **Latência:** 1ª chamada ~1,5 s (frio); seguidas: 224, 208, 185 ms.
- **Fila de render (leitura):** `estado_fila` responde ok (~2,2 s na 1ª, ainda frio). Não iniciei nenhuma renderização.
  As tarefas longas já são comandos separados (`fila_adicionar`, `fila_iniciar`, `fila_parar`) no manifesto; falta
  provar que não travam a edição.
- **Falta:** "sem conflitos" (dois comandos seguidos no mesmo clipe, comando do agente enquanto o Pailer mexe) e o
  teste da fila de render ao vivo.

## 2026-11-18 · Raid Claude (143) + Codex (144) + DeepSeek (145) · MCP de vídeo em tempo real
Código: `D:/Kanivete/Plugins/kanicode/mcp_kanivete.py` (handlers), `mcp_manifesto.py` (VIDEO), `mcp_video_animacoes.py` (novo).
Teste de regressão: `testes/teste_mcp_video.py` (15 casos, app de teste 9333; sai com 1 se falhar).
- **Keyframe editável (Codex):** `editar_keyframe {indice, prop, t, valor, interp?}` troca valor e/ou interpolação de um
  keyframe existente; recusa se não houver ponto em `t`. `interp` aceita `lin|hold|ease|in|out|back|elas|quica|bez`
  (back = Passar e voltar, elas = Elástico, quica = Quicar). `listar_keyframes` devolve `keyframes` legíveis.
  Bézier personalizada por 4 pontos NÃO entra (a assinatura MCP não recebe os controles). Conferido no 9333: criar,
  editar com elas, listar, recusas (t sem ponto, prop xyz, valor texto, interp inválida, op=150), remover.
- **Animações de clipe (DeepSeek):** `listar_animacoes_clipe` e `animacao_clipe {indice, lado: in|out, preset, duracao?,
  remover?}`, usando `VE_TR`/`veTransAdd` (c.tin/c.tout). Conferido no 9333: lista, aplica entrada, remove.
- **Sobreposições (DeepSeek):** `listar_sobreposicoes` e `sobreposicao {indice, tipo, duracao?, remover?}` via `veOvtAdd`.
  Remoção acha a sobreposição pelo corte estar DENTRO do trecho (o ponto médio falhava no clipe 0, que começa em 0 s).
  Conferido no 9333: aplica, devolve `revisao_auto`, remove.
- **Catálogo de animações (DeepSeek):** `Instructions/agente/animacoes-nativas-video.md`, seções "Catálogo acionável" e
  "Qual animação usar" (chave, faixa, default, comando exato). Só lido no código; não conferido por teste.
- **Revisão obrigatória em escrita de vídeo (líder):** `baixo` no domínio video sem `revisao` recusa com
  `revisao_necessaria`. Exceção: novo_projeto e abrir_projeto. Lote e `_passo_fresco` já buscam a revisão em cada passo.
  Motivo: sem isso a escrita cai por cima de mudança do Pailer ou de outro agente. Custo: uma leitura a mais em chamada solta.
- **Checagem automática (líder):** toda escrita de vídeo (exceto revisar_edicao, desfazer, refazer) devolve
  `revisao_auto` com o resultado de `revisar_edicao` (até 600 caracteres).
- **Operação pesada (líder):** máscara (criar/editar), camada mãe e desfoque de movimento: se der tempo esgotado, a mensagem
  avisa para esperar até ~1 min antes de repetir. Lista em `_COMANDOS_PESADOS`.
- **Conferido:** `testes/teste_mcp_video.py` (15/15). Desfazer conferido só no keyframe (volta ao valor anterior).
- **Falta:** Bézier personalizada; comando MCP de camada/transição de texto de saída além do já existente; decidir se
  `revisao_auto` deve cortar o resultado de forma inteligente (hoje corta em 600 caracteres).
