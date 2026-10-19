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
- Goyo (Supertone) mostra "You're Offline… GOYO Beta" e não processa — falta conferir no app com internet.

## No editor
Janela › Plugins (editor-plugins.js; seção no veDockMenu): lista (procurada uma vez, `ve_vst3_lista`), clicar abre a
janela (`ve_vst3_abrir`, já aberta = vem para a frente). API `VEPLG_API`. Teste: `D:/kanivete_testes/scripts/plugins_menu.py`.

## Pendências
- VST3 no Rack de efeitos da trilha (Mixer): som da timeline passando pelo plugin (prévia renderizada no processo à
  parte + exportação), ajuste no projeto, janela ligada ao efeito.
- Formato de plugin próprio; importador de packs; OFX.
