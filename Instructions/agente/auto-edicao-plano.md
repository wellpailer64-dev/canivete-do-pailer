# Edição automática (1 clique) — levantamento 2026-11-05

Referência: plugin Editor Premium (diorgysantos.com): transcrição, corte de respiros, legenda animada com SFX embutido, zoom sem keyframe, J-cut.

| Etapa | Existe? |
|---|---|
| Transcrever | `sk_transcrever`, `Functions/legendas.py` |
| Achar silêncios | `sk_silencios(arq, de, dur, limiar=-40, minimo=0.6)` (Sound) |
| Cortar respiros na timeline | FALTA (só detecta; falta aplicar o corte no editor) |
| Legenda animada | `editor-legenda-premium.js`, `ve_salvar_legenda` |
| Zoom in/out | `editor-autozoom.js`, `ve_autozoom_rostos` |
| SFX | `editor-soundboard.js` (pack), `ve_sfx_gerar` (por texto) |
| J-cut (áudio entra antes do corte) | FALTA |
| Orquestrador `veAutoEditar(opcoes)` | FALTA |

## Ordem proposta
transcrever → cortar respiros → legenda premium → autozoom → SFX nos pontos de ênfase → J-cut → conferir_edicao.py.

## Frentes (arquivos separados)
- A: `editor-autoedicao-corte.js` (corte de respiros a partir de `sk_silencios` + J-cut).
- B: `editor-autoedicao.js` (orquestrador, botão, SFX nos zooms/legendas) — chama as etapas existentes e a de A.

## Pronto (2026-11-05)
- Corte de respiros: `Functions/respiros.py` (limiar do próprio áudio, borda sensível, sobra de pausa; presets suave/normal/agressivo; ponta do trecho só mexe se sobrar >0,55 s) + `frontend/js/editor-respiros.js`: `veRespirosPlano(opc)` (só calcula) e `veRespirosAplicar(opc)` (ripple de trás pra frente, 1 desfazer). Ponte `ve_respiros`. Teste: `testes/teste_respiros.py` (porta 9339).
- Onda em alta resolução: `ve_peaks_faixa` (video_cutter.peaks_faixa, 16 kHz, só o trecho visível) + `vePicosFinos` em editor.js; zoom máximo 3000 → 16000 px/s (`VE_MAX_PPS`), onda fina a partir de 220 px/s (`VE_PF_MIN`).
- Falta: botão/painel de Respiros na UI, J-cut, orquestrador `veAutoEditar`.
