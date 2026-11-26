# Método de Edição de Vídeo do Pailer

Fonte única das regras. Vale para todo vídeo editado no Vídeo Kanivete. Cada regra veio de uma nota dele; a data é a origem.
Detalhes: API e histórico em `guia-edicao.md`; teoria em `tecnicas-de-montagem.md`; decisões de ritmo, áudio, cortes e pós em `ritmo-cortes-audio.md`; cor em `cor-cinematografica`; fichas em `Instructions/agente/clientes/`.

## Ordem de trabalho
1. **Consultar**: método e neurônios gerais de vídeo; depois buscar pelo nome do cliente com `brain_search`, informando o projeto/cliente, ler sua ficha em `Instructions/agente/clientes/` e os últimos RENDERS. Regras do cliente complementam as gerais; preferência específica documentada prevalece sobre padrão visual geral para aquele cliente. Não levar estilo de um cliente para outro; pedido atual prevalece. Se faltar ficha ou a identidade for incerta, não inventar.
2. **Combinar**: pedido grande, mandar 3 a 5 linhas com o que entendeu, plano e custo antes de mergulhar.
3. **Ver e ouvir**: consultar primeiro as folhas, transcrições e o mapa de brutos já salvos para o projeto. Na primeira leitura, guardar as folhas e um mapa pesquisável com pasta, arquivo, descrição do que acontece e timecodes dos trechos vistos; indicar lacunas e não inventar conteúdo. Ao mudar a pasta, conferir arquivos novos, alterados e ausentes e analisar apenas o necessário, preservando as anotações válidas. Sem abrir o app ainda.
   Para criar ou atualizar o índice: `py -3.13 tools/agente/mapa_brutos.py atualizar --brutos "PASTA_BRUTOS" --destino "PASTA_MAPA"` (destino no D, fora dos brutos). Consultar: mesma chamada com `buscar --termo "assunto"`; após olhar e ouvir, registrar cada trecho com `anotar --arquivo "CAMINHO_RELATIVO" --inicio SEG --fim SEG --descricao "cena observada"`. O mapa busca também na transcrição disponível. A folha tem oito amostras e não descreve cenas automaticamente nem substitui ver o bruto inteiro na escolha do take; complete as anotações após a leitura. O índice não importa folhas anteriores automaticamente.
4. **Montar**: a ferramenta do formato, sem script novo. Reel falado: roteiro JSON + `tools/agente/reel_fala.py`.
5. **Conferir**: `py -3.13 tools/agente/conferir_edicao.py projeto.vknv`. Só mostrar com REPROVADO zerado; o que vier como OUVIR, ouvir.
6. **Olhar**: `tools/agente/quadros_monitor.py`, uma folha.
7. **Exportar para conferir**: `tools/agente/exportar_conferencia.py`, em tarefa solta. Deve sair pela placa.
8. **Entregar**: salvar e deixar aberto no app dele. Exportar de verdade e mudar o card só com o ok.
9. **Aprender**: seguir o "Gatilho de aprendizado" abaixo (escopo GLOBAL/TIPO/CLIENTE, 1 linha, termo do glossário).

## Checklist de editor profissional (antes da V1) — termos em `glossario-editor.md`
[GLOBAL] vale para todo vídeo do gênero; [TIPO] só para o tipo citado.
- [GLOBAL] Classificar o tipo de edição (glossário) antes de montar.
- [GLOBAL] Reutilizar o mapa e as folhas dos brutos do projeto; atualizar só mídias novas, alteradas ou ausentes e registrar cenas e timecodes vistos para escolher A-roll e B-roll sem repetir a leitura completa.
- [Entrevista/Depoimento] Arco começo-meio-fim; nunca abrir no meio de uma explicação.
- [Entrevista/Evento] Intro do personagem com nat sound (chegada, aplausos), take inteiro se bom.
- [Entrevista/Evento] Establishing shots: 2 a 4 takes de ~1 s, só trilha, sem repetir pessoa nem revelar a protagonista.
- [Entrevista/Evento] Respiro de B-roll do evento antes do outro, trilha sobe.
- [GLOBAL] A voz manda: fala baixa → voz alta + denoise + bed calma bem baixa (ducking).
- [GLOBAL] Legenda menor, mais alta, na safe zone e nunca sobre o lower third.
- [GLOBAL] Transição com moderação: corte seco/no beat no meio; transição + whoosh só no outro.
- [GLOBAL] Acabamento sutil: glow e CA fracos, centro limpo, adjustment layer no topo; bug pequeno no canto, some no outro.
- [GLOBAL] Peça para outro veículo/página usa a identidade de quem publica.
- [GLOBAL] Projeto e render aprovado na pasta da peça, V1, V2...
- [GLOBAL] Manter os ajustes do Pailer: só ajuste pontual, aplicado no app aberto.

## Gatilho de aprendizado (permanente)
Toda correção, ajuste ou aprovação do Pailer numa edição = lição. No mesmo turno:
1. Escopo: **GLOBAL** (serve a qualquer edição do gênero) → este checklist + neurônio da classe "Edição de Vídeo · <classe>"; **TIPO** → item marcado [Tipo]; **CLIENTE/PROJETO** → `clientes/<cliente>.md` + brain_remember com `projeto`. Na dúvida entre cliente e global, perguntar ao Pailer.
2. Escrever em 1 linha, com o termo do glossário; termo novo → acrescentar no glossário.
3. Atualizar o que já existe (sem duplicar); conferir com brain_search usando uma pergunta genérica.

## Ajuste em projeto pronto (barato, nota de 2026-11-02)
1. `conferir_edicao.py projeto --sem-ouvir` primeiro; ela lista os problemas. Nada de despejar a timeline no chat.
2. Mídia em outra versão: `tools/agente/trocar_midia.py projeto "nome antigo" novo.mp4 --aplicar`.
3. Voz repetida na emenda: `tools/agente/fechar_emenda.py projeto TEMPO --aplicar`.
4. App de teste: `tools/agente/abrir_teste.py projeto`; ao terminar, `--fechar`.
5. Uma folha de quadros ANTES de exportar. Exportar só com a folha certa.
Script avulso que se repete vira ferramenta. Defeito achado no olho vira regra em `conferir_edicao.py`.

## Ajuste ao vivo no app aberto (regra desde 2026-11-11; MCP primeiro desde 2026-11-17)
Com o app do Pailer aberto, o ajuste entra direto na timeline dele e aparece na hora. **Caminho padrão: MCP do Kanivete**
(`mcp__kanivete__kanivete_executar_comando` / `kanivete_executar_lote`, domínio `video`; carregar com ToolSearch `+kanivete`).
Ele segue a porta do app ligado, entra no Ctrl+Z e devolve erro claro. Roteiro curto:
1. Achar: `consultar_timeline {de, ate}` (o que está no trecho) ou `linha_do_tempo {de, ate}`; ver: `kanivete_tira_quadros {tempos}`.
2. Mudar em lote transacional: `montar_timeline`, `trocar_imagem` (troca a cena mantendo lugar, duração e cor), `som_clipe`
   (liga o som de depoimento), `abaixar_musica` (ducking sob as falas), `mover_clipe`, `aparar_clipe`, `keyframe`, `criar_cor_solida`.
3. Conferir: `revisar_edicao` (avisa fala sem som e mídia sem leitura) e `analisar_mix`; salvar: `salvar_projeto`; exportar:
   `tools/agente/exportar_conferencia.py` por `tarefas_soltas.py`.
- JS solto (`kanivete.py js`) só para o que o MCP ainda não faz; quando precisar, anote a lacuna em
  `Instructions/agente/roadmap-mcp-video.md` para virar comando. Nunca clonar clipe de depoimento de um vizinho `x:'v'` (entra mudo).
- Fala de mídia bruta (escolher frase de depoimento): `py -3.13 tools/agente/falas_midia.py arquivo.mp4` (tempo por palavra, com cache).
- Nunca regerar o projeto nem reabrir do disco por cima. Se o disco e o app divergirem, a versão do app vale.
- Pronto só com `conferir_edicao.py` sem REPROVADO. Um app só; nada de clique simulado no app do Pailer.

## Assets editáveis, não destrutivos e reutilizáveis (regra desde 2026-11-11)
Trabalho profissional: todo asset que eu crio (lettering, GC, título, créditos, transição) precisa poder ser alterado depois.
- **Preferir Comp nativa**: asset em HTML vira Comp com camadas do editor (texto, forma, imagem, quadros-chave) e o
  Pailer abre com duplo clique: `py -3.13 tools/agente/comp_html.py cena.html --nome "X (Comp)" --fonte <pasta do asset>/X_fonte --alvo X.mov`.
  O HTML precisa de `<meta name="kv" content="w=..;h=..;fps=..;dur=..">` e camadas com `data-kv="texto|caixa|img"`
  (sem `data-kv` o `<svg>` de filtro derruba o amostrador). O `.mov` antigo fica desativado embaixo para comparar.
  Fonte do `@font-face` precisa estar instalada; o tradutor troca o apelido pelo nome real (aviso se faltar).
  Conferir o arquivo da Comp (quadro do `.mov` em `D:\Kanivete\Cache\Canivete Render Cache\Comps` sobre cor), não a prévia leve.
- **Quando ficar em `.mov`**: ao lado do render vai `<nome>.fonte.json` (fonte, parâmetros, comando para refazer, como
  editar). `render_html.py` do projeto já grava sozinho; gerador em Python grava a ficha igual. Pasta `<nome>_fonte/` com
  o HTML/plano quando houver Comp.
- Nunca entregar asset sem fonte: render órfão é destrutivo.

### Fluxo de um asset (lettering, GC, título) — seguir na ordem
1. **Decidir**: vai sobre a edição e o Pailer pode querer mexer? → Comp. Efeito que o HTML faz e a Comp não (filtro SVG, `backdrop-filter`, `drop-shadow` em imagem) → `.mov` com ficha.
2. **Fonte primeiro**: HTML em `<pasta do asset>/X_fonte/` com `<meta name="kv">` e `data-kv` em toda camada; fontes instaladas (conferir `fontes_reais()` sem aviso).
3. **Montar**: `comp_html.py ... --alvo X.mov` (sem `--so-plano` só quando o app do Pailer estiver aberto; ao vivo, sem recarregar).
4. **Conferir o arquivo, não a prévia**: quadro do `.mov` da Comp em `D:\Kanivete\Cache\Canivete Render Cache\Comps` sobre cor de fundo, num instante de pico (texto cheio) e noutro de entrada. A prévia leve mostra retângulo preto atrás de transparência: defeito conhecido, não vai no export.
5. **Comparar com o antigo**: o `.mov` fica desativado embaixo; listar para o Pailer o que mudou (ex.: sombra que o HTML dava e a Comp não tem) e dizer se dá para recolocar como efeito na Comp.
6. **Entregar sem salvar**: dizer a trilha e o tempo, pedir que ele confira e salve.
7. **Fechar a ponta**: ficha `.fonte.json` se sobrar `.mov`; registrar no catálogo/cérebro se o método ou a ferramenta for novo; anotar na missão.
## Regras
### Corte de fala
- Corte no fim de frase ou de movimento, no contexto do que é dito (2026-10-14).
- Nunca comer palavra. O fim do corte vem do vale da voz, não do tempo da transcrição (2026-11-01).
- **Leitura de onda na borda (2026-11-13, método obrigatório para todo corte seco de fala):** o corte abre e fecha num **vale** da onda: silêncio antes da primeira onda da palavra e depois da última. Onda alta encostada na borda do clipe, no início ou no fim, é palavra comida, e o editor vê isso na waveform antes de ouvir. Medir as duas leituras: energia cheia (vogais) **e** agudos (s, x, ch, t). Só a cheia confunde o "s" com pausa ("impre-ss-ão" virou corte no meio da palavra, Casa Morumbi). Sem vale possível (duas vozes emendadas ou a próxima palavra começando num "s" colado), o corte vai ao ponto mais baixo e leva um fade de áudio curto (0,04 s) naquela ponta, nunca uma onda seca. Fim escrito à mão (`{"fim": s}` no roteiro) também passa pelo vale. Código: `tools/agente/onda_voz.py`, usado por `reel_fala.py` e `checar_cortes.py`. Na `conferir_edicao.py`, onda na borda é **REPROVADO**, não OUVIR.
- Folga de palavra (2026-11-13, regra geral; código em `reel_fala.py`, `FOLGA_INI` 0,15 s e `FOLGA_FIM` 0,12 s): o corte abre 0,15 s antes da primeira palavra e fecha 0,12 s depois do fim transcrito da última, sem passar do início da seguinte. O início não é encurtado pela energia (a consoante inicial acorda tarde). Nada de corte colado na palavra. Conferir com `tools/agente/checar_cortes.py`.
- **Hesitação no meio da palavra não é fim de frase (2026-11-18, Bosch Gordinhos, "J… S1" virou "Jó"):** a transcrição pode colar a palavra gaguejada num token só e com tempo errado. Antes de fechar um bloco, olhar a onda até a próxima palavra: se ainda houver voz não transcrita (≥0,15 s), ela entra como corte próprio e só a pausa sai, com os dois cortes no vale. Código: `voz_orfa()` em `reel_fala.py`. Conferir ouvindo todo nome de modelo/produto falado com pausa.
- Tirar repetição, hesitação e "dando sequência" sem mudar o sentido.
- Pausa: corta acima de 0,30 s depois de pontuação e 0,40 s no meio da frase, medida na energia da voz, não na transcrição.
- Sem ar parado na ponta do corte: a frase acaba e o corte vem logo (nada de esperar ~0,7 s e pular). A transcrição estica a última palavra por cima do silêncio; a ponta vem da voz (2026-11-06).
- Frase até o fim, sem pedaço da seguinte: o fim do bloco não passa do início da próxima palavra, e a pausa real dentro da última palavra transcrita encerra o corte ("vem pra Carlinhos, vem pra" cortado; "hein? aí", 2026-11-12). Todo OUVIR de fim de corte se resolve antes de mostrar: o "ouvi:" tem que terminar em frase completa.

### Zoom e camadas
- Zoom dinâmico só em camada de ajuste, nunca escala animada no clipe (2026-11-01).
- Zoom é de ênfase, não um por corte: escolhido pelo que está sendo dito (número, pergunta, ponto forte, chamada), entra suave, sustenta e volta suave. Nada de pular de zoom mínimo para máximo e voltar a cada corte; fora da ênfase o quadro fica parado (2026-11-06). Exceção, montagem musical sem fala (teaser, abertura, cobertura): punch-in **em degrau** no mesmo take, escala nova a cada corte na semicolcheia, sem animar entre eles, é técnica do Pailer (Teaser ExpoCatadores, 2026-11-24).
- Cor em outra camada de ajuste, abaixo de logo, tarjas e legendas (2026-11-01).
- Cor medida, não chutada (2026-11-06): cada fonte passa por `tools/agente/cor_auto.py` (escopos: branco p99,5 ≤ ~0,95 sem estouro, preto 0,02–0,06 sem esmagar, neutro sem puxar cor, pele na linha de pele; pele vermelha/saturada corrigida no HSL secundário só na faixa dela), partindo da grade do cliente. O `reel_fala.py` já faz isso: uma camada de cor por trecho de fonte (`"cor_auto": false` desliga).
- Trilha começa onde a música começa de verdade (2026-11-06): intro lenta, sem ritmo ou melodia não abre vídeo dinâmico. `tools/agente/musica_ponto.py` mede energia/ataques por compasso, classifica calmo/médio/agitado, acha a entrada do ritmo e o drop; o vídeo abre na batida desse ponto (calmo→agitado = virada). `reel_fala.py` usa por padrão (`"musica_inicio": "auto"`; número = segundo fixo; 0 = do começo); precisa sobrar música para o vídeo todo, senão recua. Se o vídeo tiver momento calmo e momento de impacto, casar a virada/drop com o corte da fala principal.
- Timeline organizada, com cor por tipo de camada (2026-10-14). Motion pronto termina em `veCompAgruparCenas()`.
- Uma camada por função: logo, sombra do destaque, texto, cada um na sua trilha, a sombra logo abaixo do texto. Nunca encaixar elemento na trilha de outro (2026-11-12; o conferir_edicao reprova "trilha dividida").
- Troca de foco entre pessoas: duas faixas iguais empilhadas, desativando a de quem não está em foco (2026-10-07).

### Cor
- Partir do limpo, sem bloom por padrão. Conferir pele: rosto não pode ficar vermelho (2026-11-01).
- Cor estranha: olhar antes as curvas do Luz e Cor nas camadas de ajuste (2026-09-30).

### Rosto e B-roll
- Primeira aparição de quem fala é rosto, por cerca de 11 s, sem ponte de B-roll (2026-10-23).
- Depois, um plano de B-roll por vez entre cerca de 6 s de rosto; rosto em 80% da fala em depoimento (2026-10-22).
- Sem pisca: B-roll vai até a troca de cena ou sobra ao menos 1,5 s de rosto. Sem buraco preto (2026-10-22).
- B-roll casa com o que é dito naquele instante. Só plano estável e bem composto; não repetir imagem.
- Drone: cortar a correção de ângulo e começar no trecho estável (2026-10-24).
- **Motion avançado em ponto alto (teaser/evento/abertura):** placa que abre (revelação por vazado + zoom de passagem) e logo/texto por trás da silhueta. Nomes, gatilhos e como montar: `Instructions/agente/motions-avancados-catalogo.md`. Poucos por vídeo, só se ficar limpo e profissional.
- **Escolha do take: o momento, visto no bruto inteiro (estudo do Teaser ExpoCatadores, 2026-11-24).** Nunca pegar o começo do arquivo ou o primeiro trecho estável. Antes de escolher, ver o bruto inteiro em tira: `py -3.13 tools/agente/escolher_take.py take BRUTO.mov` (risca borrado, câmera procurando, rosto cortado e estouro; mostra um candidato limpo a cada 2 s). Nitidez e tremor só eliminam; quem decide é o conteúdo, no olho:
  - auge do gesto ou da reação (aceno, abraço, sorriso, olhar que sobe), não o meio da fala nem o quadro morno entre duas ações;
  - contexto: gente junto e a marca do evento no quadro (painel, logo, frase); plano mais aberto que aguente recorte depois, em vez de close gigante de microfone (ele escolheu rosto com metade do tamanho do resto do bruto);
  - mini-história quando o bruto tiver: ação → resultado → reação em 3 cortes curtos;
  - evitar costas, olhar para baixo (celular), câmera procurando, entrevistador tapando.
  Em depoimento vale o mesmo princípio: dentro da fala, o trecho com expressão viva e olhar para a câmera/entrevistador. Detalhe: `Instructions/agente/estudo-teaser-expocatadores.md`.
- Tomada boa e curta: esticar no máximo até 75% de velocidade (2026-10-14).
- Contagem/desfile de pessoas (aprovados, alunos, clientes): cada pessoa entra UMA vez. Pasta de bruto costuma ter 2 takes seguidos da mesma pessoa (horários colados no nome do arquivo); ouvir não mostra quem é. Conferir por rosto: `tools/agente/pessoas_repetidas.py projeto.vknv` (o conferir_edicao já roda quando há números na tela). Ao escolher takes, agrupar antes os arquivos de horário próximo e ficar com 1 por pessoa (Carlinhos 6/7, 2026-11-19).

### Transições e ritmo
- Corte seco é o padrão. Em apoios, transição em cerca de 1 a cada 3; nunca dissolve longo em reel (2026-09-30).
- Preferir transições, movimentos de camada e animações de texto prontas do editor quando resolverem a necessidade de forma simples; opções e aplicação em `Instructions/agente/animacoes-nativas-video.md` (2026-11-12).
- Mudança brusca de ambiente: flare, leak ou fade curto (2026-10-14).
- Corte e transição caem na batida quando for possível, sem mover corte de fala. Em montagem musical, a grade é a semicolcheia e o ponto é o ataque real do som, não a contagem: `escolher_take.py grade musica.mp3 --inicio S` (detalhe em `ritmo-cortes-audio.md` › Montagem musical).
- Versões do mesmo assunto não podem começar igual (2026-10-01).

### Legenda e texto
- Sem caixa, sem contorno, sombra 100, nunca em maiúsculas. Destaque da palavra na cor da marca (2026-10-07).
- Legenda nunca atravessa corte de câmera (2026-10-15) e fica longe das bordas (2026-10-18).
- **Caixa (2026-11-18, regra do Pailer):** legenda minúscula, mas nome de pessoa, lugar ou marca sempre com inicial maiúscula (Renato, Alessandro, Gordinhos) e sigla toda maiúscula (ABS, JS1). Automático em `caixa()` do `reel_fala.py`: nome que a transcrição escreveu com maiúscula no meio da frase, lista `Instructions/agente/nomes_proprios.txt` (acrescentar todo nome novo de cliente/pessoa), `nomes`/`siglas` do roteiro e siglas conhecidas. Conferir nomes próprios antes de mostrar.
- Texto sobre imagem movimentada sempre com apoio: etiqueta ou película do tamanho do texto (2026-10-14, 2026-10-24).
- Uma frase por cena; lettering fora do meio. GC sobre o rosto da pessoa certa, e nome só se ela disser (2026-10-22).

### Pasta da peça
Vídeo novo = pasta nova na sequência do mês (última "07 - ..." → "08 - REELS - <tema>"), nunca dentro de pasta existente, mesmo com tema igual (correção do Pailer, 2026-11-19).

## Som
- Entrega de -14 a -16 LUFS, pico até -1 dB. Medir: gravação quente pede voz abaixo de 0 dB (2026-11-01).
- Vozes no mesmo nível entre cortes: quem está longe do celular (aluna x instrutor) sobe por ganho de corte com Hard Limiter; diferença acima de 6 dB reprova (2026-11-12).
- Trilha pelo tom da peça: depoimento pede música animada e adulta, nunca com cara de infantil. Começar pela trilha que o Pailer usou em peça aprovada do mesmo cliente e formato (pastas `02 - ASSETS` dos meses anteriores) (2026-11-12).
- Trilha perto de -21 dB na fala e -9 a -5 dB nos respiros. Uma música inteira por momento.
- **Volume da trilha por fatia + Potência constante (preferência do Pailer, 2026-11-19).** Mudança grande de volume da música (baixo na fala → alto no respiro, ou o contrário): fatiar o clipe da música no ponto da troca, dar o ganho próprio a cada fatia e pôr a transição de áudio **Potência constante** no corte entre elas. Nunca degrau seco. Preferir isso a keyframe de volume: é mais fácil de corrigir depois.
- Efeito sonoro só quando casa com o que se vê; nada em toda entrada de texto (2026-10-14).
- Escolha e sincronização: `Instructions/agente/efeitos-sonoros-video.md`; ouvir os candidatos junto da imagem e da voz.

### Técnica e entrega
- Taxa cravada: 24, 25, 30, 50, 60; celular vai para a inteira. Só câmera constante fica em 29,97 ou 59,94 (2026-10-08).
- Exportar sempre pela placa. Caiu no processador: achar o motivo e corrigir (2026-10-26).
- Não mover mídia já usada. Trecho errado: exportar só ele e emendar (2026-10-14).

### Respeito ao trabalho dele
- Ajuste manual é sagrado: versão nova parte da timeline dele, com cópia antes, nunca regerar (2026-10-09).
- Projeto aberto: mudar pelo app, não só no disco; o Pailer confere e salva, conforme a regra de ajuste ao vivo (2026-11-11).
- Um app só: nunca abrir outro KANIVETE; porta sem resposta não é app fechado. App de teste fecha ao terminar (2026-11-01).

**Exportação (regra do Pailer, 2026-11-06):** todo render vai para a pasta `04 - RENDERS` do card do projeto (nunca só para a pasta de teste) e, ao terminar, abrir essa pasta no Explorer (`explorer /select,arquivo`). `exportar_conferencia.py` já abre; passe a `04 - RENDERS` como pasta de saída.

## Regras fixas do Pailer (26/11/2026, reels OP Capricho) — valem para todo cliente
- Zoom: sem tranco. Entrada 1,2–1,6 s, saída ~1,2 s, suavidade 85, deriva 0, no máximo 112%.
- Música: troca de volume (baixo sob a fala → alto no fim) sempre com constant power (atout/atin cp ~0,8 s).
- Entradas de texto e asset: animações nativas (texto `c.txa`, VE_TXA: revelar, subir, pop...; imagem `tin` de VE_TR). Nada de quadros-chave de escala na mão.
- Texto: entrelinha justa (`tx.ent` 90–95), nunca 120.
- Imagem ON ↔ B-roll: transição nativa na entrada e na volta (pushzoom, slide, pull, dissolve, flash). Corte seco só entre falas.
- Merchant (vídeo com arte de parceiro): a arte do parceiro é a finalização; não usar o logo do cliente no fim.
`reel_fala.py` já aplica as cinco primeiras.
- Corte nunca dentro de palavra: silêncio curto (0,10–0,15 s) no meio da palavra é fechamento de boca (p, t, k, "pr"), não fim de fala. `pausa_na_palavra` só corta com >= 0,20 s ("Ca|pricho" perdeu o fim, 26/11). Ao revisar, ouça nome de marca/pessoa inteiro em cada emenda.
