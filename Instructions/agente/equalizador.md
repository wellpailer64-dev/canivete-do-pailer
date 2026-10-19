# Equalizador paramétrico (Vídeo Kanivete)

Efeito de áudio `peq` (frontend/js/editor-peq.js), como o Parametric Equalizer do Premiere / Pro-Q: no CLIPE (Efeitos ›
Filtro e EQ › Equalizador paramétrico; Controles de efeito › "Editar no painel") e no RACK da trilha (Mixer › fx).
- Bandas `v.b = [{t: hp|ls|pk|notch|hs|lp, f, g, q, s (12/24/48 dB/oit. dos cortes), on}]` (até 8), `v.out` (dB).
- Painel "Equalizador" (criado na hora, abre solto; encaixa como os outros): curva com a soma e cada banda, pontos
  numerados (arrastar = Hz/dB, Shift = fino; rodinha = Q ou inclinação; duplo clique no vazio = sino novo; duplo clique
  no ponto = liga/desliga; botão direito/Delete = remove), espectro da saída tocando (AnalyserNode no VEAU.ganho, só
  com o painel à vista e tocando), linha de bandas com tipo/Hz/dB/Q, presets de vídeo (voz clara, ronco/vento,
  podcast, rádio, chiado, zumbido 60 Hz, abrir espaço para a voz) e saída.
- Contas: biquads RBJ do `veAprCoef` (editor-afx-pr.js) = `efeitos_pr.coef` (Python); cortes de 24/48 = Butterworth em
  cascata. Prévia: `vePeqProcessar` no veAudioFxProcess (estado por efeito; veAprEstado cria para o clipe). Exportação:
  `_normalizar_afx` "peq" → `_filtros_peq` → `biquad` do ffmpeg com os MESMOS coeficientes.
- O EQ antigo de 3 faixas ("Equalizador simples") ganhou a prévia com filtros reais (`vePeqSecoesEq` = equalizer do
  ffmpeg com largura em oitavas); antes era uma média aproximada (prévia 170% × arquivo 221%; agora 221 × 232).
- Medido 2026-10-18: coeficientes JS × Python diferença 0; prévia (rack e clipe) × som seco pelo biquad do ffmpeg =
  0,005%; rack prévia/exportação 118/114%. Teste: `D:/kanivete_testes/scripts/peq_teste.py`, `mixer_rack.py`.
- Pendências: bandas dinâmicas, mid/side, solo de banda (escutar só a faixa), curva no Controles de efeito.
