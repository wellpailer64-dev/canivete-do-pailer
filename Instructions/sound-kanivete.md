# Sound Kanivete (Sk) — editor de áudio multipista

Junta as ferramentas de áudio num editor só (logo **Sk**, dourado), como o Editor/Photo/Vetor.
Código: `frontend/js/som.js` (núcleo: projeto, edição, timeline em canvas, efeitos, `window.SKN`), `som-motor.js`
(reprodução e medidores), `som-paineis.js` (interface em painéis) + `frontend/css/som.css` e
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

## Efeitos e voz (fase 2, 2026-10-07)
Painel do clipe › Efeitos: **Limpar ruído** (DeepFilterNet3, `anti_noise.limpo`, misturado ao original na % escolhida;
~3 s por 12 s de áudio) e **Melhorar voz (IA)** (`melhorar_audio.melhorar_arquivo`, Sidon + OmniVoice, minutos). O
resultado é um arquivo NOVO ao lado do original (`_limpo90.wav`, `_melhorado.wav`; nunca no cache, que se limpa sozinho)
e vale para todos os clipes daquela gravação; `c.orig` guarda o anterior (Voltar ao original). **🎙 Voz IA**: fala com
uma voz salva da Geração de Voz (OmniVoice), entra na agulha na faixa "Voz IA" (~50 s). Roda em thread (`_tarefa` →
`skProgresso`, barra de status); um processo por vez. SKN: `limpar(id, %)`, `melhorar(id)`, `original(id)`, `vozes()`,
`voz(vozId, texto, {faixa, ini})`. Teste: `teste_som.py` (limpar) e `--ia` (voz e melhorar).

## Texto, sons e atalhos (fase 3, 2026-10-07)
**📝 Texto**: transcreve a mixagem (faixas mudas fora) — `sk_transcrever` exporta 16 kHz mono e usa
`legendas.transcrever_wav` (o mesmo reconhecimento das legendas do Editor, com o dicionário de nomes); palavras
clicáveis levam a agulha; Salvar SRT/TXT/VTT (`skLinhas`: até 42 caracteres / 3,5 s por linha, quebra no ponto final;
grava pelo `ve_salvar_legenda`). **🔊 Sons**: o soundboard CC0 do Editor (`ve_sb_estado`; baixa no 1º uso) com prévia,
busca e Inserir na agulha (faixa "Efeitos"). **Atalhos**: Converter Áudio, Transcrever, Melhorar Áudio e Geração de Voz
continuam (lote de arquivos, criar vozes), agrupados sob o Sk na barra lateral (`menu-sub`) e com o aviso "Também no
Sound Kanivete" no topo de cada página. SKN: `transcrever(idioma)`, `texto()`, `legendas()`.

## Volume, pausas, efeitos de faixa e Editor (fase 4, 2026-10-07)
- **Igualar volume** (clipe ou todos da faixa): mede o LUFS do trecho (`sk_lufs` → `lufs_trecho`, ebur128) e muda só
  o ganho do clipe (sem arquivo novo), alvo -16 (voz/podcast), -14 (redes) ou -20 (fundo); teto +24 dB.
- **Cortar silêncios**: `silencedetect` no trecho (limiar -40 dB, pausa ≥ 0,6 s), corta deixando 0,12 s de respiro em
  cada ponta e puxa o resto da faixa para trás (fecha o buraco).
- **EQ de 3 bandas e compressor por faixa** (`f.fx = {eq: {grave, medio, agudo} dB, comp: {ativo, limiar, razao, ganho}}`):
  tocam no WebAudio (barramento da faixa: lowshelf 120 Hz → peaking 2,5 kHz → highshelf 8 kHz → DynamicsCompressor) e
  saem iguais na exportação (`_filtros_faixa`: lowshelf/equalizer/highshelf + acompressor). Preset "Voz de podcast".
  Painel: com a faixa escolhida e nenhum clipe selecionado.
- **→ Editor**: exporta a mixagem em WAV (ao lado do .sknv; sem projeto salvo, em Documentos/Sound Kanivete — sem
  janela) e solta no Editor de vídeo (`veDropFiles`: entra numa trilha livre; sem projeto, abre um com ele).
- SKN: `igualar(ids, alvo)`, `cortarSilencios(id, {limiar, minimo, margem})`, `fxFaixa(id, 'voz'|'nenhum'|{...})`,
  `enviarEditor(caminho)`.

## Painéis e motor profissional (rodada A, 2026-10-07)
- **Layout**: em cima três colunas — esquerda com abas Mídia (áudios do projeto; ▶ ouvir, + na agulha, arrastar para a
  timeline), Sons (soundboard CC0 com busca) e Voz IA; centro o Monitor (transporte, tempo grande, medidores por faixa e
  master L/R com luz de clipe, LUFS agora/integrado/pico); direita Clipe / Faixa / Texto / Exportar (tudo no painel, sem
  janela). Divisória arrastável (`--sk-cima`, lembrada em localStorage `sk-cima`) e a timeline embaixo. Clicar num clipe
  abre a aba Clipe; clicar na faixa, a aba Faixa. Ctrl+E abre a aba Exportar.
- **Motor** (`som-motor.js`): cada áudio é lido em trechos de 10 s de PCM s16le estéreo (`sk_trecho` →
  `sound_kanivete.trecho`, cache em `%LOCALAPPDATA%/CaniveteDoPailer/sk_pcm`, teto ~1,5 GB) e agendado no WebAudio
  (`AudioBufferSource.start(quando)`, 1,5 s de antecedência, busca 6 s à frente, ~48 trechos em memória). Agulha e
  cortes caem na amostra; serve para gravações longas. Mudou o projeto tocando → reagenda (`skMotorMudou`) com descida
  de 12 ms (sem estalo).
- **Micro-fade de 5 ms** em toda borda de clipe e **crossfade automático** onde dois clipes da mesma faixa se
  sobrepõem — `skFades` (JS) = `fades_efetivos` (Python), iguais na prévia e na exportação.
- **Mono**: vira estéreo copiando o canal (`_ESTEREO`); antes a exportação, o PCM da prévia e a medição do Igualar
  abriam com -3 dB.
- Medidores: `skMedirAgora()` → `SK.med` {L, R, M (LUFS momentâneo, ponderação K aprox.), I (integrado, portas -70/-10),
  faixas{id: {pico, rms}}}.

## Gravar, salvamento automático, arquivos longos (rodada B, 2026-10-07)
- **Gravar** (`som-gravar.js` + `Functions/sk_gravar.py`, API `sk_gravar(acao)`): sounddevice/PortAudio, WAV 24 bits
  escrito direto no disco (o `wave` reescreve o cabeçalho a cada bloco: queda do app deixa o arquivo válido). Botão ● no
  transporte ou R: grava na faixa escolhida a partir da agulha, as outras faixas tocam junto, clipe vermelho cresce na
  timeline; ao parar o arquivo entra como clipe. Aba Gravar: escolher entrada (lembrada em `sk-mic`), mono/estéreo,
  medidor de nível (a entrada fica aberta só medindo enquanto a aba está aberta). Ainda sem compensar a latência da placa.
- **Salvamento automático**: a cada minuto com mudanças, em `%APPDATA%/CaniveteDoPailer/sk_auto/<id>.sknv`
  (`sk_auto(acao)`); a tela inicial lista "Recuperar" (com × para descartar); salvar de verdade apaga a cópia.
- **Arquivos longos**: picos lidos em blocos de 60 s; 2 h de mp3 importam em ~3 s e tocam do meio em ~0,4 s
  (`teste_som.py --longo`).
- SKN: `gravar({caminho})`, `pararGravacao()`, `entradas()`, `autoSalvar()`, `recuperaveis()`, `recuperar(id)`.

## Intervalo, curva de volume, ducking (rodada C, 2026-10-07)
- **Intervalo** (`SK.int = {a, b, faixas}`): arrastar no vazio de uma faixa (ou Shift+arrastar sobre clipes) marca o
  tempo; descendo pega mais faixas. Del apaga (fica silêncio), Shift+Del apaga e puxa (ripple nas faixas do intervalo),
  Ctrl+C/Ctrl+X/Ctrl+V copiam/recortam/colam (cola na agulha, a 1ª faixa copiada cai na faixa escolhida), "Recortar ao
  intervalo" deixa o projeto só com ele; Esc desmarca. Sem intervalo, Ctrl+C copia o clipe escolhido. Na régua continua
  arrastando a agulha. Base: `skPartir(f, c, t)` (corta um clipe levando a curva junto) e `skIntDentro`.
- **Curva de volume** (`c.curva = [[t no clipe, vol]]`, 0–2): 〰 no transporte ou V mostra a linha em todos os clipes;
  clicar na linha cria ponto, arrastar move, Alt+clique apaga (pontos aparecem no clipe escolhido). A forma de onda
  acompanha; a prévia agenda as rampas nos pontos e a exportação já aplicava (`volume=...:eval=frame`). Cortar,
  aparar a esquerda e cortar silêncios mantêm a curva presa ao som (`skCurvaTrecho`).
- **Ducking** (aba Faixa da trilha): mede onde as outras faixas falam (`sk_silencios`, limiar -35 dB, junta pausas
  < 0,8 s) e escreve a curva dos clipes da trilha (-6 a -24 dB, desce 0,25 s antes, volta em 0,5 s). "Tirar" apaga.
- SKN: `intervalo(a, b, faixas)` (null desmarca), `apagarIntervalo(puxar)`, `copiar()`, `colar(t)`, `recortar()`,
  `curva(id, pts|null)`, `ducking(faixa, {db, fontes, ataque, soltura})`; `estado()` traz `curva` e `intervalo`.

## Master e cadeia de efeitos por faixa (rodada D, 2026-10-07)
- **Faixa** (`f.fx`): passa-alta → gate → EQ 3 bandas → EQ gráfico 10 bandas (31 Hz–16 kHz, 1 oitava) → de-esser →
  compressor → reverb (seco/molhado). Presets: Voz de podcast, Locução de rádio, Trilha sob a voz, Ambiente de estúdio,
  Sem efeitos (`SK_PRESETS_FX`; `skFxCompleto` completa projetos antigos que só tinham eq/comp).
- Exportação (`_filtros_faixa`): highpass, agate (peak, range -30 dB, 5/100 ms), equalizer, sidechaincompress com a
  chave passa-alta 5 kHz (de-esser: razão 1/(1-quant)), acompressor, e o reverb com `afir` usando a **mesma IR** da
  prévia (`ir_reverb(tamanho)`: ruído estéreo com semente fixa, energia 1, cache `sk_ir`; `sk_ir` → ConvolverNode).
- Prévia: biquads + DynamicsCompressor + ConvolverNode; gate e de-esser num AudioWorklet (`SK_DYN_JS`) que aproxima
  o agate/sidechaincompress (não é idêntico; o resto é igual).
- **Master** (`proj.master = {vol, lim: {ativo, teto}}`, aba Exportar): volume e limitador (projeto novo já vem com
  teto -1 dB). Exportação: `alimiter` (level=0, latency=1: duração exata); prévia: DynamicsCompressor rápido; os
  medidores do Monitor ficam depois do limitador.
- Cuidado: `skIr(t)` é mover a agulha — o carregador da IR é `skIrRev` (a colisão quebrou a navegação na 1ª versão).

## Espectro, reparo espectral, separar voz (rodada E, 2026-10-07)
- `som-espectro.js` + `Functions/sk_espectro.py`. ▤ no transporte (ou E): faixas com 170 px e espectrograma do trecho
  visível (`sk_espectro` → PNG, frequência log 40 Hz–22 kHz, pedido 250 ms depois que a vista para; cache `sk_esp`).
- **Reparo espectral**: Ctrl+arrastar no espectro marca tempo × frequência (`SK.rect`); painel Clipe → "Preencher com
  a vizinhança" (magnitude interpolada entre os quadros de antes e depois, fase original) ou "Atenuar (-30 dB)". Só o
  trecho é processado (STFT 2048/512); o resto do arquivo é copiado; sai `<nome>_rep<hash>.wav` (float 32).
- **Separar voz e instrumental**: Hybrid Demucs do torchaudio (`HDEMUCS_HIGH_MUSDB_PLUS`, pesos MIT, 335 MB baixados
  para `modelos_ia/demucs` na 1ª vez), trechos de 10 s com 1 s de transição, CPU (~0,7 s por segundo de áudio). O clipe
  vira a voz e uma faixa "Instrumental" alinhada entra logo abaixo.
- Metadados e capítulos na exportação (`op.meta`, `op.capitulos`; mp3 com ID3v2.3) — base da rodada F.
- SKN: `espectro(ligar)`, `areaEspectral(id, t0, t1, f0, f1)`, `reparar(id, {modo})`, `separar(id)`.

## Painéis móveis e Texto para Voz (2026-10-07, pedido do usuário)
- `som-dock.js`: o mesmo mecanismo do Photo/Vetor. Cada ferramenta é um painel (Mídia, Sons, Texto para Voz, Gravar,
  Clipe, Faixa, Transcrição, Exportar) em colunas à esquerda/direita do centro (Monitor em cima, divisória, timeline).
  Arrastar o título empilha, cria coluna (bordas) ou solta sobre o centro; duplo clique recolhe; × fecha; botão
  "Painéis ▾" no cabeçalho reabre e redefine. Layout em `iePref('sk_paineis')`. Renderização: `SK_DOCK_REND[id](el)`
  com o corpo `#sk-p-<id>`; `skUiEsq()`/`skUiProps()` redesenham os grupos; `skDockMostrar(id)` abre e desdobra
  (`skAba(lado, id)` ficou como atalho). Gravar não abre mais o microfone sozinho: "Testar nível" liga o medidor.
- **Texto para Voz** (antes "Voz IA", OmniVoice): vozes em lista com ▶ da referência (`sk_vozes` → `ref_url`), texto
  com contagem e duração estimada (Ctrl+Enter gera), um clipe por parágrafo, números por extenso, idioma, velocidade,
  expressão (guidance), pausa entre frases, qualidade (passos 16/32/64), fala limpa, faixa de destino (Texto para
  Voz, nova ou existente) e posição (agulha ou fim da faixa); histórico da sessão para inserir de novo. Opções
  lembradas em localStorage `sk-tts`. `skGerarTts()`; `skVoz(voz, texto, {faixa, ini, op})` repassa as opções.
- Vozes no próprio painel: **+ Nova voz** (nome, referência = clipe escolhido na timeline (até 30 s) ou arquivo,
  texto da referência opcional — em branco o OmniVoice transcreve —, limpar a referência) → `sk_voz_criar`
  (`skCriarVoz`); **×** em cada voz exclui com confirmação no próprio botão ("Excluir?", 2º clique) → `sk_voz_apagar`
  (`skApagarVoz`). As vozes são as mesmas da ferramenta Geração de Voz (banco do OmniVoice). Testes usam a voz Fran.
- Teste: o teste agora espera a ponte do pywebview (`pywebview.api.sk_info`) — a "falha intermitente" da 1ª rodada era
  o teste importando antes de a API existir.

## Pendências
Rodadas seguintes do plano profissional:
E espectrograma e reparo espectral, separar voz da música; F editar pelo texto (apagar palavras/vícios), stems, ID3/capítulos, modelos salvos.
Separar voz da música (precisa de um modelo de separação; o UVR/Roformer foi testado no anti-noise), curva de volume
desenhada na timeline (o .sknv e a exportação já aceitam `curva`), Editor → Sk (editar o áudio de um vídeo aqui).
