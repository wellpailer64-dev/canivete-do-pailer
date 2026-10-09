# Ponte Kanivete ↔ Premiere Pro (plugin UXP "Kanivete Ponte")

Premiere Pro 2026 (26.5.2) instalado em `D:\Adobe\Adobe Premiere Pro 2026`. Plugin em `tools/ponte_premiere/plugin/`
(manifest, index.html, main.js), carregado pelo Adobe UXP Developer Tools (Add Plugin → manifest.json → Load; depois de
mudar o main.js: ••• → Reload). Painel: Window › UXP Plugins › Kanivete Ponte (precisa ficar aberto).

## Como conversar
`py -3.13 tools/ponte_premiere.py <cmd> ['{json}']` ou `ponte_premiere.enviar(cmd, args)` em Python.
Transporte pela PASTA `D:\kanivete_testes\ponte_premiere` (pedido_<id>.json → resposta_<id>.json): o UXP NEGA http
local ("Permission denied … Manifest entry not found", mesmo com o domínio listado ou "all"). O servidor http do
mesmo script ficou como alternativa, sem uso.
Comandos: `info`, `efeitos_audio`, `ler_audio` (trilhas → clipes → cadeia com params), `aplicar_efeito {t,i,nome,valores}`,
`valores {t,i,c,valores}`, `remover_efeito {t,i,c}`, `mudo_trilha`, `salvar`, `abrir {caminho}`, `js {codigo}` (trecho
livre com `ppro` e `h` = ajudantes; explorar a API sem recarregar o plugin).

**Cuidado**: os comandos agem no projeto ATIVO do Premiere. O Pailer trabalha nele (ex.: MASTER NO CANIVETE_1.prproj):
testes só numa cópia em `D:\kanivete_testes\premiere\mixer\` aberta com `abrir`, conferindo `info().caminho` antes.

## O que a API (UXP 26.5) faz e não faz
- Clipe: aplicar/remover efeito de áudio (`AudioFilterFactory.createComponentByDisplayName(nome, clipe)` +
  `createAppendComponentAction`), ler e mudar parâmetros (`createSetValueAction(param.createKeyframe(v))`).
  Mudar valor: SEMPRE buscar a cadeia de novo e fazer tudo dentro de `lockedAccess` — o componente "expira" depois de
  cada transação ("The script object is no longer valid").
- Trilha: só mudo (`AudioTrack.setMute`). **Sem** fader, pan nem rack de efeitos da trilha → a volta do Mixer e do
  rack da trilha tem que ir pelo .prproj.
- Sem MCP: o Premiere 2026 tem um servidor MCP (beta `PPro.MCP.EnableMCPServer`, aba Preferences › Agents), escondido
  na versão comum; `ppro.BetaFeature` não existe no UXP.

## Efeitos de áudio
Catálogo (53 nativos: matchName, parâmetros, padrões): `D:\kanivete_testes\premiere\mixer\catalogo_efeitos.json`
(`D:\kanivete_testes\scripts\premiere_catalogo.py`). Os do Audition têm matchName GUID (ex. Single-band Compressor
`2da3e2bc-…`); os simples, "Internal Highpass", "Internal Bass"… Ambisonics só em surround. 14 de terceiros (VST).
**Valores sempre normalizados 0..1** (UI do VST3): nos Params do .prproj e no `OpaqueData` (base64: XML `prop.map`
com ParamList, ou binário). A unidade real (Hz, dB, ms) NÃO está no arquivo → precisa da curva de cada parâmetro.
Volume (Internal Volume) "Level": 0,1778 = 0 dB (1,0 = +15 dB).

## Efeitos de áudio do Premiere no Kanivete (feito 2026-10-09)
- Dados: `frontend/dados/premiere_audio.json` (+ `.js` p/ o front), gerados por `tools/premiere_audio_dados.py` a partir de
  `tools/ponte_premiere/catalogo_efeitos.json`. Réguas medidas renderizando no Premiere (sinal de teste em
  `D:\kanivete_testes\premiere\calib`, scripts `calib_*.py` em `D:\kanivete_testes\scripts`).
- No clipe/trilha: `{t: "pr_<nome>", v: {p0..pn: 0..1}}` (valores como o Premiere) → ida e volta sem perda (medido: 1e-9).
- Som (prévia `frontend/js/editor-afx-pr.js` = exportação `Functions/efeitos_pr.py`, mesma conta, 0,0 dB entre elas):
  Volume, Channel Volume, Amplify, Balance, Bass/Treble (prateleira 200 Hz / 4 kHz, Q pelo ganho), Highpass/Lowpass
  (Linkwitz-Riley 4ª, fc = 20 + 23980·v²), Bandpass/Notch (Q = 0,1 + 10·v²), Simple Parametric EQ (Q por tabela), Delay
  (v·2000 ms, feedback = v; idêntico ao Premiere), Invert/Swap/Fill/Mute, Pitch Shifter (tabela; rubberband na
  exportação), Single-band Compressor (acompressor do ffmpeg portado p/ JS; ataque/release por tabela), Hard Limiter
  (vira o 'limiter' do Kanivete). Diferença p/ o Premiere: filtros 0,1–0,5 dB, compressor ~0,15 dB (extremos de ataque/
  release ainda 3–9 dB), pitch ±1 Hz. Os outros 33 só vão e voltam (sem som no Kanivete).
- Parametric Equalizer: frequência LINEAR 20 + 23980·v, Q ≈ 1330·v, ganho ±30 dB (ainda sem som).
- Parâmetro sem valor no .prproj = está no padrão (usar o "d" do catálogo, não 0).
- Rack da trilha (Mixer): `VE_TRK.a[k].fx`; a trilha soma os clipes → efeitos → fader → pan (prévia: veBusMixar;
  exportação: barramento no `_grafo_mix`). Limitador dentro do rack ainda não toca.

## Volta Kanivete → Premiere (feito 2026-10-09)
No app: **Arquivo › Enviar ao Premiere aberto (com efeitos de áudio)…** (editor.js `veEnviarPremiere`, API
`ve_premiere_ponte`): pergunta ao plugin o projeto aberto, CONFIRMA com o nome dele, grava o XML numa pasta temporária e o
plugin importa + aplica os efeitos. Código da ponte em `Functions/ponte_premiere.py` (vai no exe); `tools/ponte_premiere.py`
é só a linha de comando (`importar x.xml`). `premiere_xml.exportar` grava o XML + `<nome>.kanivete-efeitos.json`; o plugin
acha cada clipe pelo início (±0,05 s).
- O XML do próprio Premiere (`ProjectConverter.exportAsFinalCutProXML`, testado) NÃO leva: volume da trilha/Mix,
  efeitos de áudio (só traduz os que o Final Cut tem, ex. Highpass → "High Pass Filter" em Hz). O Panner da `<track>`
  ele grava mas IGNORA ao importar → o pan vai como efeito Balance em cada clipe (mesma régua); o volume da trilha + Mix
  vai somado no Audio Levels de cada clipe; o rack da trilha vai no fim de cada clipe da trilha.
- Estéreo: cada trilha = 2 trilhas explodidas (canal 1 e 2, `premiereChannelType="stereo"`, `currentExplodedTrackIndex`,
  `totalExplodedTrackCount="2"`); com um clipitem só ele importa MONO. `premiereTrackType` sem os índices faz ele
  DESCARTAR a trilha.
- Teste real: 9 efeitos aplicados sem falha, valores idênticos; som do trecho A2 Premiere × Kanivete: 0,02 dB.

## Pendências
1. Calibrar os 33 sem som (Parametric EQ, reverbs, DeNoise, DeEsser...). Compressor: tabela de ataque/release do
   acompressor ajustada em conjunto (média 1,2 dB, pior 3,9 dB); para igualar de vez, só um compressor próprio no estilo
   do Audition (detector diferente do acompressor).
2. Rack no Master; limitador dentro do rack da trilha; automação (keyframes) de efeitos e do fader.
4. Rack da trilha de volta como rack (só via .prproj).
