# Plugins no KANIVETE

Meta (Pailer, 2026-10-18): receber plugins de terceiros e de colaboradores. Ordem: **VST3 (áudio)** → formato de plugin
próprio do KANIVETE → importador de packs (Premiere Composer/Mister Horse, Motion Bro = CONTEÚDO .prproj/.mogrt feito com
efeitos nativos, não plugin) → OpenFX (vídeo: Sapphire, Neat Video, FilmConvert...). Plugins só da Adobe (.aex/.prm) e
painéis UXP/CEP não rodam fora da Adobe.

## VST3 — carregador próprio (Functions/vst3.py)
Python puro + ctypes, sem compilador e sem GPL (a pedalboard é GPL-3: só na bancada). Interfaces pelos cabeçalhos
oficiais da Steinberg (vst3_pluginterfaces, MIT; cópia em D:/kanivete_testes/vst/sdk): IID e ordem dos métodos de lá.
- `varrer()`, `Plugin(caminho, cid).carregar(sr)`, `.parametros()`, `.definir(id, 0..1)`, `.processar(audio)` (compensa a
  latência: Goyo 2238 amostras), `.estado()`/`.restaurar()` (bytes; processador + controlador), `.abrir_janela()`.
- Anfitrião em Python: IHostApplication, IComponentHandler, IBStream, IParameterChanges/IParamValueQueue,
  IMessage/IAttributeList (processador ↔ controlador), IPlugFrame (redimensionar). Janela Win32 própria (linha de
  mensagens na mesma linha que carregou o plugin, como o VST3 pede).
- **Sempre num processo à parte**: `<app> --vst3 varrer` (JSON) e `<app> --vst3 janela <caminho> <cid> <título>`
  (main.py). O Guitar Rig 6 derrubou o processo no teste — no app só cai a janela dele.
- Medido (11 plugins do PC do Pailer): todos carregam/processam (9–155× tempo real), 9 idênticos à pedalboard e os 2 com
  latência idênticos depois da compensação; ajuste restaurado = mesmo som; janelas abrem (JUCE com GPU leva ~5 s).
- Goyo (Supertone): a Beta ACABOU em 2/12/2023 (goyo.app). O plugin consulta `api.goyo.app/beta`, que não responde mais →
  "You're Offline" e devolve o som sem mexer (igual na pedalboard e no Premiere). Sucessor pago: Antinode Clear. Não
  contornar a verificação (licença). No KANIVETE: Anti Noise / Melhorar áudio.

## No editor
Janela › **Plugins ›** (submenu ao passar o mouse, como no Premiere; folga de 450 ms para ir em diagonal) — editor-plugins.js,
item no veDockMenu. Clicar abre o plugin num **PAINEL** do editor (aba; encaixar, soltar, maximizar):
- painel `plg-<hash>` registrado na hora em VED.ids/VED.el (não volta sozinho ao reabrir o app); abre solto e a janela
  solta se ajusta ao tamanho do plugin (ve_win_rect/ve_win_place: o resizeTo da página não vale na janela nativa);
- `--vst3 encaixar <caminho> <cid> <hwnd mãe> x y w h`: o processo do plugin cria a subjanela (WS_CHILD) DENTRO da janela
  do KANIVETE (cross-process) e atende comandos JSON no stdin ({r}, {v}, {p} trocar de janela, {q});
- vigia (120 ms, só envia quando muda): retângulo da `.ve-plg-area` × devicePixelRatio, janela (principal ou título da
  solta), visível (aba ativa, documento visível, sem menu/janelinha/aviso por cima — janela nativa fica sobre a página);
- janela solta fechando (encaixar de volta): `_resgatar_plugins` (FormClosing, main.py) passa a subjanela para a principal
  antes de o Windows destruí-la junto; fechar a aba = processo do plugin fecha.
- Plugin maior que o painel: preso no canto (sem rolagem ainda); `canResize` = ocupa o painel.
APIs `ve_vst3_painel/_estado/_fechar`, `VEPLG_API.painel(nome)`. Testes: `D:/kanivete_testes/scripts/plugins_sub.py`,
`plugins_painel.py` (solto, encaixado alinhado ao pixel, menu por cima, outra aba, fechar).

## VST3 no Rack de efeitos da trilha (Mixer) — 2026-10-18
- Efeito `vst3` (VE_AFX.vst3, `livre`: veAfxValues leva {caminho, cid, nome, estado, slot}); menu do espaço vazio ›
  **Plugins VST3** (categoria a mais no fim); o espaço mostra "♪ nome"; clicar abre a janela do plugin num painel
  (`plgs-<id do efeito>`) + ligar/mover/remover. `estado` = ajuste do plugin em base64 (vai no projeto, sem desfazer).
- **Um processo por espaço** (`--vst3 servir`, `_Servidor` em vst3.py; main.py `ve_vst3_slot*`): som da prévia por HTTP
  local (127.0.0.1, token; `POST /p?a=&reset=` corpo float32 [L…, R…], resposta sem compensar o atraso — X-Inicio diz
  o quadro), janela do plugin no painel pelo stdin, e ao mexer na janela manda `{"estado"}` → `ve_vst3_slot_novidades`
  (0,6 s) grava no projeto. O processo sobe assim que o plugin entra no Rack (não no meio do play).
- **Prévia** (editor-plugins.js `veVst*` + ganchos no editor-audio.js): por trilha com plugin, uma faixa À FRENTE
  (0,35 s) mixa só os clipes dela (`veAudioMixarBruto(t, n, so)`), passa pela cadeia do Rack (efeitos do Kanivete aqui
  mesmo, plugins por HTTP) e guarda o som alinhado pelo atraso; o mixador pula esses clipes e soma a faixa pronta
  (`veVstMixar`, só fader/pan); se a faixa não chegou ao próximo pedaço, espera (`veVstPronto`). Começo e edição DA
  TRILHA: reset da cauda + 0,5 s de pré-rolagem. A chave de remix ignora `estado` (girar um botão não remixa).
- **Exportação** (`_pre_vst`, video_cutter, antes do limitador do Master): soma da trilha pelo ffmpeg → cadeia (ffmpeg
  para os efeitos do Kanivete, `--vst3 processar` offline com o ajuste e o atraso compensado) → volta como um áudio com
  só fader/pan. `_normalizar_afx` aceita `vst3`.
- Medido (app de teste): prévia = offline (diferença 0,0 depois da pré-rolagem), 4,16 s de som em 4,16 s; 1,3–3 ms por
  bloco de 85 ms; exportação CPU e placa = seco processado (1,2% do nível = ruído do AAC × 250% sem o plugin), +1,5 s em
  8 s; girar o BALANCE do NadIR com o mouse → ajuste no projeto → muda a exportação. Testes:
  `D:/kanivete_testes/scripts/vst_previa.py`, `vst_export.py [--placa]`, `vst_rack_ui.py`, `D:/kanivete_testes/vst/teste_servir.py`.

## Mixer: Rack da trilha não mudava a prévia (corrigido 2026-10-18)
EQ/reverb/redução de reverberação leem o PASSADO do som (`tap`); no clipe vem da fonte, mas na SOMA da trilha o tap era
null → EQ só com os médios, reverb nem rodava (prévia 0%, exportação 221%). Agora a soma tem memória própria (anel de
0,5 s: `veBusTap`/`veBusPasso` no editor-audio.js; também na faixa à frente). Hard Limiter no Rack (inclusive o "Hard
Limiter" do Premiere, que vira o do Kanivete) não era aplicado em lugar nenhum: a trilha vai pela faixa à frente
(compensa a antecipação) e na exportação pelo `_pre_vst` (`_hard_limiter`). Medido com/sem Rack (prévia/exportação):
EQ 170/221%, reverb 38/45%, limitador 47/48%, Premiere Bass 780/705, Highpass 100/100, Delay 106/106, Hard Limiter
81/81; fader −12 dB 75/75, pan −100 50/50. Teste: `D:/kanivete_testes/scripts/mixer_rack.py '<fx json>'`, `mixer_fader.py`.

## Arquivar plugin (2026-10-19)
Menu Janela › Plugins: ⌫ no item (ao passar o mouse) arquiva — some do menu e do Rack; "Arquivados" no fim restaura.
localStorage `ve-plg-arquivados` (caminho|cid). `VEPLG_API.arquivar(nome, sim)`, `.arquivados()`. No PC do Pailer só o
Goyo ficou ativo (Guitar Rig, STL Ignite e os jhudstudio arquivados: instrumentos/guitarra).

## PRÓXIMO: plugins de imagem — OpenFX (OFX) — plano
**O que é**: padrão aberto (BSD, openeffects.org) que Resolve, Vegas, Nuke, Natron, Flame e HitFilm aceitam. Arquivo
`<nome>.ofx.bundle/Contents/Win64/<nome>.ofx` (DLL) em `C:\Program Files\Common Files\OFX\Plugins`; exporta
`OfxGetNumberOfPlugins`/`OfxGetPlugin`. API em C pura (sem COM): mais simples de carregar por ctypes que o VST3.
O host (nós) entrega "suítes": Property, ImageEffect, Parameter, Memory, MultiThread, Message (+ Interact = desenho na
tela, OpenGL/CUDA = opcionais). Plugins de Premiere/After (.aex/.prm) continuam fora.
**Arquitetura (igual ao VST3)**: `Functions/ofx.py` (ctypes), sempre num processo à parte (`--ofx varrer|servir|processar`):
plugin que trava não derruba o app.
- Etapa 0 (teste barato, ANTES de construir): baixar plugins de teste para `D:/kanivete_testes/ofx` — exemplos do SDK
  oficial (BSD) e openfx-misc/openfx-io do Natron (GPL: só para TESTE, não vai no app) — e medir: carregar, descrever
  (nome, parâmetros, contextos "filter"/"general"/"transition"), renderizar 1 quadro RGBA de um numpy. Só segue se passar.
- Etapa 1: varrer + menu (efeitos OFX numa categoria dos Efeitos de vídeo, com Arquivar como no VST3).
- Etapa 2: parâmetros do plugin viram parâmetros do Kanivete nos Controles de efeito (double/int/bool/choice/cor/2D),
  com cronômetro (quadros-chave) — o OFX pede o valor por tempo, então animar sai quase de graça.
- Etapa 3: prévia — o quadro do monitor vai por memória compartilhada ao processo do plugin (RGBA float 16/32), volta
  pronto; cache por (clipe, quadro, parâmetros) como as camadas desenhadas; renderizar à frente no play.
- Etapa 4: exportação — o clipe com OFX vira "camada desenhada" (ProRes 4444, como Motion/Roto); placa: híbrido.
- Etapa 5: transições OFX (contexto "transition") e geradores; ida e volta com Premiere = só o nome no relatório.
**Riscos a medir na etapa 0**: (1) plugins pagos checam o host (kOfxPropName/versão) e a licença por família de host —
Sapphire, BCC e Neat Video podem recusar um host desconhecido; testar com a versão demo de cada um antes de prometer;
(2) muitos exigem OpenGL/CUDA para render rápido (CPU é obrigatório no padrão, mas lento); (3) Interact (alças na tela)
fica para depois.
**Etapa 0 — FEITA (2026-10-19), passou.** Hospedeiro de teste em ctypes: `D:/kanivete_testes/ofx/host_teste.py`
(`listar <x.ofx>` / `render <x.ofx> <id> entrada.png saida.png [param=v,v]`; plugins do Natron 2.5.0 em
`D:/kanivete_testes/ofx/dl`, DLLs do MinGW pela variável `OFX_DLLS=<Natron>/bin`). Misc.ofx (133 efeitos) e CImg.ofx
(34) carregam, descrevem (parâmetros e padrões), criam a instância e renderizam 1280×720 RGBA float: Invert 16 ms,
Grade 34, Blur 84, Bloom 229, GodRays 1,46 s (folha `folha.jpg`). Suítes obrigatórias: Property, ImageEffect, Parameter,
Memory, MultiThread, Message (Interact/Progress/OpenGL e as da Nuke/Vegas são pedidas mas opcionais).
Armadilhas medidas: (1) nem toda constante é "kOfxX" = "OfxX": kOfxImageEffectPropSupportsMultipleClipDepths =
"OfxImageEffectPropMultipleClipDepths" e kOfxImagePreMultiplied = "OfxImageAlphaPremultiplied" (errado = render 1
sem aviso); (2) getDimension de propriedade que não existe tem de dar 0/OK (o plugin pergunta antes de acrescentar
contextos), senão o Describe volta 4 (falta recurso do hospedeiro); (3) "..." dos parâmetros no Windows x64 = 8 bytes
cada, double em bits (paramSetValue lido como u64); (4) OFX conta linhas de BAIXO para cima (inverter o numpy).
Falta medir: plugin PAGO checando o hospedeiro (demo do Neat Video/Sapphire) e contexto de transição.
**Neat Video demo (2026-10-19)**: instalador oficial (assinado NeatLab) extraído sem instalar com innoextract em
`D:/kanivete_testes/ofx/neatvideo/ext`. A edição "RS" (Resolve) devolve **0 efeitos** em OfxGetNumberOfPlugins, antes
mesmo do setHost: confere o nome do PROCESSO (strings DaVinciResolve/DaVinciResolveLite/FusionStudio + GetModuleFileName).
Edição por hospedeiro = trava de licença; NÃO fingir ser outro programa. Para plugins pagos: pedir ao fabricante uma
edição/licença para o KANIVETE, ou só os que vendem uma edição OFX genérica. O varrer mostra "nenhum efeito: o plugin
não aceita este programa".
**Etapa 1 — FEITA (2026-10-19).** `Functions/ofx.py` (o hospedeiro da etapa 0, agora no app) + `main.py --ofx
varrer|descrever|render` e API `ve_ofx_lista(atualizar)`; cada .ofx descrito num processo dele; lista guardada por arquivo
(caminho|data|tamanho) em `pasta_cache("ofx")/lista.json`: 1ª vez 10,6 s com os 4 pacotes do Natron, depois 0,4 s.
Pastas: Common Files\OFX\Plugins, OFX_PLUGIN_PATH e `<raiz_dados>/Plugins OFX` (no PC do Pailer:
`D:\Kanivete\Plugins OFX\Natron (teste, GPL)` = Misc, CImg, GMIC (360 efeitos), Arena, com as DLLs do MinGW copiadas
para dentro de cada Win64 — 532 efeitos). Tela: `frontend/js/editor-ofx.js` — bloco "Plugins OFX" recolhido no fim do
painel Efeitos (editor-fx.js `veRenderFxList` chama `veOfxItensHtml(q)`), grupos pelo grouping, ⌫ por efeito e por
grupo (localStorage `ve-ofx-arquivados`), "Arquivados" restaura, ↻ procura de novo; duplo clique = aviso (aplicar é a
etapa 2). Só aparecem os de contexto filtro/geral/transição/gerador, sem os de estéreo. API `VEOFX_API.lista/arquivar/
visiveis`. Teste: `py -3.13 D:/kanivete_testes/scripts/teste_ofx_painel.py` (app em --agente=9333, mouse de verdade).
**Etapa 2 — FEITA (2026-10-19).** `--ofx params <x.ofx> <id>` / API `ve_ofx_params(caminho, id)` (`ofx.parametros`: rótulo,
dica, padrão, min/max, faixa de exibição, opções, passo, tipo de double) → `veOfxDef(o)` em editor-ofx.js monta o tipo
`VE_FX['ofx:<id>']`: Double/Integer = número com cronômetro; Boolean = caixinha; Choice = lista (tipo novo `lista` no
editor-fx.js, sem cronômetro); 2D/3D = um controle por eixo (`o_<nome>_0/_1`); RGB(A) dentro de 0..1 = cor; fora (ganho,
gama) = um controle para os 3 canais (`ofx.rgb`). Escondidos: maskInvert, interactive, hidpi… (VEOFX_ESCONDE). A
descrição vai no efeito (`f.o`, via `junto` no veFxAdd) e `veOfxRegistrarClipes` remonta ao abrir/desfazer/refresh.
Até a etapa 3–4 o tipo é `neutro: () => true` (não muda a imagem e fica fora do veFxExport) e mostra uma nota.
Duplo clique ou ARRASTAR do bloco aplica (vale para a seleção, como os outros efeitos). Teste:
`D:/kanivete_testes/scripts/teste_ofx_clipe.py` (porta 9333).
**Arrastar efeito de janela solta (corrigido 2026-10-19)**: com o painel Efeitos numa janela solta (2º monitor), soltar
num clipe da timeline principal não fazia nada (o movimento morria ao sair da janela e o ponto era lido na janela do
painel). Agora `setPointerCapture` no item + `veFxAlvoTela` (ponto da tela → janela certa por `vedHitScreen`). Testes:
`teste_fx_arraste.py` (mesma janela, 2 selecionados com Shift) e `teste_fx_arraste_solta.py` (reprova com o código antigo).
Lembrete: a troca ao vivo (aplicar.py) não religa ouvintes do veFxInit — precisa reabrir o app.
**Próximo (etapa 3, prévia)**: processo `--ofx servir` por efeito (como o VST3), quadro do monitor em RGBA 8/16 bits por
memória compartilhada ou HTTP local, cache por (clipe, quadro, valores); `draw` devolve o quadro pronto ou o original
enquanto calcula. XYAbsolute com padrão normalizado (OfxParamPropDefaultCoordinateSystem) × tamanho na hora do render.
**Plugins que valem a pena para o Pailer** (para testar com demo): Neat Video (ruído), Sapphire (brilhos, flares,
transições), BCC/Continuum, FilmConvert Nitrate (película/cor), Dehancer, Universe (Red Giant, só em alguns hosts).

## Substituto do Goyo (2026-10-19)
O Goyo (Supertone) não funciona mais (servidor desligado em 2023). Comparação em voz da Fran + ruído rosa e grave
(`D:/kanivete_testes/vst/goyo_sub/comparar.py`, SI-SDR contra a voz limpa, maior = melhor): ruidosa 6,8 dB;
**RNNoise** (werman, VST3 grátis, GPL) 12,4 dB; **Anti Noise do Kanivete (DeepFilterNet3)** 19,9 dB. O substituto é o
Anti Noise (efeito de áudio do clipe) + Redução de reverberação, que já vêm no app. O RNNoise ficou em
`D:\Kanivete\Plugins VST3` (pasta nova do varrer: `vst3.pastas_vst3()`, sem administrador, fora do C) como opção leve
em tempo real. Vocal Gate (dan-k-k, GPL, VST3) baixado em `D:/kanivete_testes/vst/novos`: o instalador Inno é mais novo que o
innoextract 1.9 — só instalando.

**Sound Kanivete** (2026-10-19): plugins VST3 na faixa, prévia por faixa congelada — `Instructions/sound-kanivete.md`
› "Plugins VST3 na faixa".
**Tela dos plugins da jhudstudio (corrigido 2026-10-19)**: os 7 (C4-EQ10, Dual-DeSser…) davam access violation
(ponteiro nulo) no `attached` do painel encaixado. Causa medida (`D:/kanivete_testes/vst/jh_attach.py`, variações):
no attached eles procuram a janela de CIMA **visível do próprio processo**; no painel a de cima era a do KANIVETE (outro
processo) → nulo. Não era DPI, COM/OLE, modo tempo real nem o que o main.py carrega. Agora o `_Painel` nasce numa
janela deste processo visível FORA da tela (`casa`: WS_POPUP|WS_VISIBLE em −32000, ferramenta, sem foco) e `levar()`
passa para a do KANIVETE depois do attached (encaixar e servir). Medido: os 12 plugins instalados abrem pelo Vídeo e
pelo Sound e seguem abertos; som da jhudstudio pelo congelamento ok.

## Plugins pessoais (2026-10-19) — ferramenta só do usuário, fora do git
`Functions/plugins_pessoais.py` + `frontend/js/plugins-pessoais.js`: cada pasta `<raiz_dados>/Plugins/<id>/` (D:\Kanivete\Plugins)
com `kanivete.json` (`nome`, `sigla`, `cor`, `js`, `css`, `py`, `descricao`, `desligado`) vira item na barra lateral › Plugins
(último grupo da lista; `icone`/`logo` = imagens do plugin) com a página vazia `#page-plugin-<id>`. O js roda com `KPLUG` e `PLUGIN_ID`; chama o Python
por `KPLUG.chamar(id, 'funcao', {args})` → API `plugin_pessoal` → só as funções de `API_KANIVETE` do módulo `py`
(o resto é recusado). `plugin_pessoal_recarregar(id)` esquece o módulo depois de editar. Nada disso vai no release:
quem não tem a pasta não vê nada.
Primeiro plugin: **Pandalab** (`D:\Kanivete\Plugins\pandalab`): modo "Sistema" = o site laboratoriopanda.com num iframe (espelho, login lá dentro; botão "Baixar no Kanivete" na demanda do site, `src/lib/kanivete.ts` do sistema, conversa com o plugin por postMessage; `localStorage pl-site` aponta para uma cópia local ao testar — `D:kanivete_testesscripts	este_pandalab_ponte.py`); modo "Pastas e material" = demandas do sistema Laboratório Panda (Supabase), detalhe,
baixar o material para a pasta certa do cliente (`mapa_clientes.json` + `pastas.py`: cliente/produção/ano/mês/`nn - TIPO -
TÍTULO`, vídeo com 01 BRUTO…04 RENDERS, BRIEFING.txt), criar demanda (com confirmação). Linha de comando para o agente:
`py -3.13 D:\Kanivete\Plugins\pandalab\panda.py demandas|demanda|onde|baixar|pastas|criar`. Teste:
`D:\kanivete_testes\scripts\teste_plugin_pandalab.py 9333`.

## Pendências

- Automação de parâmetro do plugin (quadros-chave), plugin no Master e nos efeitos do CLIPE.
- Latência da prévia ao mexer no plugin tocando: ~0,35 s + fila de 0,3 s (os DAWs ficam em ~10 ms).
- Instrumentos/MIDI (só efeitos de áudio hoje).
- Formato de plugin próprio; importador de packs.
- OFX etapas 2–5 (parâmetros nos Controles de efeito, prévia, exportação, transições); teste com plugin pago de edição
  OFX genérica (Sapphire/BCC: conferir se checam o hospedeiro pelo OfxPropName).
