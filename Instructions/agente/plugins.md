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

## Pendências
- Automação de parâmetro do plugin (quadros-chave), plugin no Master e nos efeitos do CLIPE.
- Latência da prévia ao mexer no plugin tocando: ~0,35 s + fila de 0,3 s (os DAWs ficam em ~10 ms).
- Instrumentos/MIDI (só efeitos de áudio hoje).
- Formato de plugin próprio; importador de packs; OFX.
