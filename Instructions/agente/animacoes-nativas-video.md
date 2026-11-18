# Animações nativas do Vídeo Kanivete — consulta rápida

Antes de criar quadros-chave ou um efeito sob medida, verifique se uma opção nativa resolve o pedido. Respeite a identidade e a ficha do cliente; confira o resultado no contexto da edição. Fontes: `frontend/js/editor-txanim.js`, `editor-trans.js`, `editor-fx.js` e `editor-onda.js`.

## Texto: painel Animação › Texto

Aplicar somente a clipe de texto. Com o clipe selecionado, clique no cartão para entrada; Alt+clique (ou Shift+clique) para saída. Também pode arrastar o cartão ao começo ou fim do clipe. Controles: preset, duração, unidade (letra, palavra, linha), ordem e sobreposição. A entrada começa no início do clipe; para atrasá-la, ajuste o início do clipe.

| Nome (chave) | Resultado visual |
|---|---|
| Máquina de escrever (`maquina`) | revela caracteres em sequência, com cursor |
| Fade suave (`fade`) | aparece suavemente, por padrão letra a letra |
| Subir palavras (`subir`) | palavras sobem enquanto aparecem |
| Revelar linhas (`revelar`) / Revelar palavras (`revelarPal`) | texto sobe revelado por máscara, por linha ou palavra |
| Letras de baixo (`letras`) | letras sobem com leve retorno |
| Descer palavras (`descer`) | palavras descem enquanto aparecem |
| Pop (`pop`) | letras crescem e assentam |
| Desfoque (`desfoque`) | texto surge desfocado e ganha foco |
| Espaçamento (`espacamento`) | letras se aproximam enquanto aparecem |
| Decodificar (`decodificar`) | caracteres mudam até revelar o texto |
| Cair e quicar (`quicar`) | letras caem e quicam |
| Girar (`girar`) | letras entram girando |
| Elástico (`elastico`) | palavras crescem com efeito elástico |

API, após identificar e selecionar o clipe correto e seguir o fluxo de edição da sessão: `veTxaAplicar(VE.clips[VE.sel], 'in', 'subir')`; para saída usar `'out'`. Ajustar duração em segundos com `veTxaMudar('in', 'd', 0.6)` e sobreposição em porcentagem com `veTxaMudar('in', 'sob', 80)`; unidade `un`: `l` letra, `p` palavra, `n` linha. A aplicação faz histórico e pode encurtar a nova animação se entrada + saída excederem o clipe. Verificar `c.txa` e a prévia. Texto animado pode aumentar o tempo de exportação.

## Movimento contínuo: painel Animação › Constante

Aplicar ao clipe visual: duplo clique no cartão selecionado ou arrastar ao clipe; parâmetros ficam em Controles de efeito. `veFxAdd(VE.sel, 'ca_rot')` é a API equivalente; ela pode aplicar a todos os clipes selecionados, então confirme a seleção antes. Não se aplica a áudio.

| Nome (chave) | Resultado | Ajustes principais |
|---|---|---|
| Rotação (`ca_rot`) | giro contínuo | velocidade em voltas/s; sentido |
| Tremer (`ca_wig`) | movimento irregular contínuo | área em px, velocidade, intensidade |
| Pulsar (`ca_pul`) | escala pulsa continuamente | tamanho em %, pulsos/s |
| Ondulação (`onda`) | distorce como ondas | altura, quantidade, velocidade, direção e formato |

Rotação, Tremer e Pulsar são efeitos de clipe, não de camada de ajuste. Ondulação é uma distorção, não simplesmente movimento de posição; verificar as bordas. Parâmetros e compatibilidade dependem do efeito e do alvo.

## Transições: painel Animação › Transições

Arraste ao corte ou à ponta de um clipe visual; duplo clique aplica na entrada do clipe selecionado. Escolha duração/velocidade e direção quando disponíveis. No código, `veTransAdd(clipe, 'in', 'dissolve', false)` aplica uma transição de vídeo; confira a seleção e o resultado antes de continuar.

| Nome (chave) | Resultado visual |
|---|---|
| Dissolução cruzada (`dissolve`) / Cross fade (`crossfade`) | fusão suave |
| Fade para preto (`fadeblack`) | escurece e retorna |
| Empurrar (`push`) / Deslizar (`slide`) | quadros se deslocam / o novo desliza por cima |
| Puxar (`pull`) / Empurrar com zoom (`pushzoom`) | passagem com zoom |
| Pop (`pop`) / Quicar (`quicar`) / Queda (`queda`) | entrada com escala, quique ou queda |
| Chicote (`chicote`) / Deslize suave (`deslizarsuave`) | movimento rápido / deslocamento suave com fade |
| Dobrar (`fold`) / Virar (`virar`) | dobra / vira o quadro |
| Dividir (`splith`, `splitv`, `split4`) | quadro se separa em duas ou quatro partes |
| Linha de TV (`tv`) / Atravessar (`atravessar`) / Soco (`soco`) | achatamento / zoom de passagem / impacto |

Em cortes, a duração efetiva depende da mídia disponível nos dois lados e pode ser encurtada ou recusada. Corte seco continua padrão; a transição deve servir ao ritmo e à identidade, sem deslocar o corte da fala. Consulte o método de edição para as regras gerais.

## Transições de sobreposição: painel Animação › Sobreposição

Criam uma camada de ajuste sobre o corte, com pico do efeito no corte. Cartão no painel; parâmetros no Controles de efeito da camada criada. Tipos: Zoom para dentro/fora (`zoomin`, `zoomout`), Giro (`spin`), Pan com desfoque (`panblur`), Esticar (`stretch`), Redemoinho (`twirl`), Distorção de lente (`lens`), Ondulação (`ripple`), Glitch (`glitch`), Pixelar (`pixel`), Tremor (`shake`), Desfoque (`blurx`), Flash (`flash`), Lens flare (`flare`) e Vazamento de luz (`leak`). Os nomes descrevem o efeito visual; cada cartão oferece ajustes próprios como força, direção ou cor.

API: `veOvtAdd('flash', tempoDoCorte, {d: 0.6})`; duração em segundos. Por padrão procura trilha livre acima da imagem. Se especificar `tr`, confira antes se ela está livre: a função recorta clipes existentes na faixa escolhida. Essas sobreposições geram renderização adicional no export; conferir ritmo, bordas e resultado.

## Catálogo acionável (MCP) — chave, parâmetros e comando

Para o agente reconhecer e acionar cada animação nativa sem adivinhar valores. As tabelas visuais acima dão o efeito; aqui estão a chave, as faixas e os padrões exatos (fonte: `editor-fx.js`, `editor-onda.js`, `editor-txanim.js`, `editor-trans.js`). Sobreposição (`veOvtAdd`) ainda não tem comando MCP — ver pendência no fim.

### Movimento contínuo (efeito de clipe, em loop; `adicionar_efeito`)

| Efeito | Chave | Parâmetros (faixa · padrão) | Comando MCP |
|---|---|---|---|
| Rotação | `ca_rot` | `vel` 0–5 voltas/s · 0,25; `esq` bool · false | `adicionar_efeito {indice, efeito:"ca_rot", params:{vel:0.25, esq:false}}` |
| Tremer | `ca_wig` | `area` 0–400 px · 30; `vel` 0,2–20/s · 4; `int` 0–100% · 50 | `adicionar_efeito {indice, efeito:"ca_wig", params:{area:30, vel:4, int:50}}` |
| Pulsar | `ca_pul` | `tam` 0–100% · 8; `vel` 0,1–10 pulsos/s · 1,5 | `adicionar_efeito {indice, efeito:"ca_pul", params:{tam:8, vel:1.5}}` |
| Ondulação | `onda` | `alt` 0–500 px · 20; `qtd` 0,1–50 · 3; `vel` −10–10/s · 1; `dir` −180–180° · 0; `forma` 0–100% · 0; `fase` −360–360° · 0; `prender` bool · false | `adicionar_efeito {indice, efeito:"onda", params:{alt:20, qtd:3, vel:1}}` |

Rotação/Tremer/Pulsar são `soClipe` (não se aplicam a áudio nem camada de ajuste); Ondulação é distorção e cresce a margem da camada (bordas). `listar_efeitos {detalhe:true}` devolve nome, categoria e parâmetros com faixa e padrão — use antes de fixar valor.

### Texto: animação de entrada/saída (`animacao_texto`)

Presets com unidade (`un`: `l` letra, `p` palavra, `n` linha), duração padrão (`d`) e sobreposição (`sob`). Comando: `animacao_texto {indice, lado:"in"|"out", preset, duracao?, remover?}`; `listar_animacoes_texto` lista os presets.

| Preset | Chave | un · d (s) · sob | Observação |
|---|---|---|---|
| Máquina de escrever | `maquina` | l · 1,2 · 0 | tem cursor |
| Fade suave | `fade` | l · 1,0 · 0,8 | — |
| Subir palavras | `subir` | p · 0,9 · 0,55 | — |
| Revelar linhas | `revelar` | n · 0,9 · 0,45 | máscara |
| Revelar palavras | `revelarPal` | p · 0,9 · 0,5 | máscara |
| Letras de baixo | `letras` | l · 0,9 · 0,7 | — |
| Descer palavras | `descer` | p · 0,9 · 0,55 | — |
| Pop | `pop` | l · 0,8 · 0,7 | — |
| Desfoque | `desfoque` | l · 1,2 · 0,75 | — |
| Espaçamento | `espacamento` | n · 1,3 · 0,3 | — |
| Decodificar | `decodificar` | l · 1,4 · 0,85 | — |
| Cair e quicar | `quicar` | l · 1,3 · 0,6 | — |
| Girar | `girar` | l · 1,0 · 0,65 | — |
| Elástico | `elastico` | p · 1,3 · 0,6 | — |

Entrada começa no início do clipe; para atrasar, ajuste o `st`. A aplicação pode encurtar a animação se entrada + saída excederem o clipe.

### Transições (`transicao`)

`transicao {indice, lado:"in"|"out", tipo, duracao?, direcao?, remover?}`; `listar_transicoes` devolve tipos, velocidades e direções. Tipos: `dissolve`, `crossfade`, `fadeblack`, `push`, `slide`, `pull`, `pushzoom`, `pop`, `quicar`, `queda`, `chicote`, `deslizarsuave`, `fold`, `virar`, `splith`, `splitv`, `split4`, `tv`, `atravessar`, `soco`. Em corte, a duração efetiva depende da mídia dos dois lados.

### Easing de keyframe (referência cruzada)

Interpolação do keyframe (`keyframe {interp}`) aceita `lin|hold|ease|in|out`; o editor tem ainda os easings Bezier e presets usados nas animações de texto (`outBack`, `outBounce`, `outElastic`, `inOutCubic`, `outQuart`, `outExpo`, `outCubic`). A edição completa de easing/keyframe existente é a frente do Codex nesta Raid; aqui só fica o mapeamento para não confundir `interp` do comando com os easings nativos.

## Qual animação usar

Cruzamento intenção → opção nativa → comando MCP. Comece pela intenção, escolha a opção mais simples que atenda e respeite a identidade do cliente; corte seco continua o padrão e transição precisa significar algo.

| Intenção | Opção nativa | Comando MCP |
|---|---|---|
| Texto aparecer letra a letra, como digitação | Animação de texto `maquina` | `animacao_texto {indice, lado:"in", preset:"maquina"}` |
| Texto surgir suavemente | Animação de texto `fade` | `animacao_texto {indice, lado:"in", preset:"fade"}` |
| Texto com impacto jovem/energético | Animação de texto `pop` ou `quicar` | `animacao_texto {indice, lado:"in", preset:"pop"}` |
| Texto sumir ao fim do clipe | Animação de texto com `lado:"out"` | `animacao_texto {indice, lado:"out", preset:"fade"}` |
| Clipe/imagem girando o tempo todo (selo, logo) | Movimento contínuo `ca_rot` | `adicionar_efeito {indice, efeito:"ca_rot", params:{vel:0.25}}` |
| Vibração/tremor de energia ou impacto | Movimento contínuo `ca_wig` | `adicionar_efeito {indice, efeito:"ca_wig", params:{area:30, vel:4}}` |
| Pulsar suave ao ritmo da música | Movimento contínuo `ca_pul` | `adicionar_efeito {indice, efeito:"ca_pul", params:{tam:8, vel:1.5}}` |
| Distorção líquida/sonora (dreamy, água) | Movimento contínuo `onda` | `adicionar_efeito {indice, efeito:"onda", params:{alt:20, qtd:3}}` |
| Mudança de cena em fusão suave | Transição `dissolve` | `transicao {indice, lado:"in", tipo:"dissolve"}` |
| Fim de bloco / respiro escurecendo | Transição `fadeblack` | `transicao {indice, lado:"in", tipo:"fadeblack"}` |
| Passagem com energia (novo bloco empurra) | Transição `push` ou `pushzoom` | `transicao {indice, lado:"in", tipo:"push"}` |
| Quebra com impacto (drop) | Transição `pop` ou `soco` | `transicao {indice, lado:"in", tipo:"soco"}` |
| Flash/leak/vazamento no corte | Sobreposição `veOvtAdd` | **sem comando MCP** (pendência abaixo) |

> **Lido no código** (conferido nos fontes): chaves, faixas, passo, padrão e unidade dos efeitos `ca_rot`, `ca_wig`, `ca_pul` (`editor-fx.js`) e `onda` (`editor-onda.js`); a lista de presets de texto (`editor-txanim.js`); os tipos de transição (`editor-trans.js`); as interpolações de keyframe (`editor-keyframes.js`, `VE_KF_INTERP`).
> **Suposto** (não confirmei no código nesta etapa): a duração/sobreposição padrão exata de cada preset de texto e as direções de cada transição — apontei pela tabela visual e pelo uso, não pela definição do parâmetro.

### Pendências (fora desta frente, por decisão do líder)

- Sobreposições (`veOvtAdd`): 15 tipos (`zoomin`, `zoomout`, `spin`, `panblur`, `stretch`, `twirl`, `lens`, `ripple`, `glitch`, `pixel`, `shake`, `blurx`, `flash`, `flare`, `leak`) sem comando MCP — entrarão em lote futuro.
