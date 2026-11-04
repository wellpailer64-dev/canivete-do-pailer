# Motion: glossário de mercado + processo em etapas

Complemento do `mapa-habilidades-motion.md` (técnicas e gatilhos). Aqui: (1) como cada coisa se chama no mercado
(After Effects / Premiere / Figma / Blender), para pedir e buscar com o nome certo; (2) o processo, com a ferramenta de
cada etapa. Peça nova: acrescentar linha no glossário se a técnica ganhar nome; ajustar o processo só com o que foi
conferido.

## 1. Glossário: nome interno → nome de mercado
Formato: **nosso nome** → termo de mercado · como fazer aqui · onde está.

### Câmera e movimento
- **Câmera de mundo** → *camera pan / scroll between scenes* (nulo como câmera + *parenting*) · um nulo é a câmera, as
  cenas moram em deslocamentos e são filhas dele · mapa › Peça Ref 01.
- **Parallax por camada** → *parallax* · filhas do nulo ganham deslocamento extra conforme a proximidade.
- **Mergulho no símbolo** → *logo zoom-through / scale-through transition*.
- **Empurrão lento** → *slow push-in / Ken Burns* (escala 100→106 na cena inteira).
- **Órbita de câmera 3D** → *camera orbit* (Cena 3D, ±3° em 8 s).
- **Respiro de quadro** → *frame pulse / "breathing" scale* (🔒 precisa de Comp-pai com escala).
- **Primeiro plano desfocado** → *foreground blur / fake depth of field (bokeh layer)*.
- **Tremido de stop motion** → *stop-motion jitter / boil* (rz ±0,6° a cada 0,25 s, linear).

### Entradas, saídas e curvas
- **entra() / sai()** → *in/out animation preset* (opacidade + blur + deslocamento + escala com *easing*).
- **Curva [0.4,0,0.2,1], [0.5,0,0.1,1]** → *ease-in-out (cubic-bezier)*; **EXPO** → *expo ease-out*; **back** →
  *overshoot*.
- **Palavras em escada / letreiro** → *staggered text / word-by-word reveal (offset)*, nulo = *null object*.
- **Revelação em degradê** → *text animator: opacity by character with range selector (fade-in)*.
- **Aparar fim 0→100** → *Trim Paths (end)* · faixa curva que cresce = *ribbon / stroke draw-on*;
  anel que se desenha = *stroke draw-on com dash*.
- **Anel tracejado** → *dashed stroke*; **Onda de choque** → *shockwave / ripple ring*.

### Transições
- **Flash de cor** → *flash transition*; **Dissolve de 2–3 quadros** → *quick dissolve / dip*.
- **Chevrons em camadas** → *shape wipe / layered chevron wipe*; **círculo nascendo do objeto** → *iris / circle reveal*.
- **Troca de canto da mancha** → *shape-led transition / blob wipe*.

### Formas, partículas e textura
- **Flor / Mancha** → *organic blob / ink splash shape* (forma `flo`, 5 pétalas); **órbita elíptica** → *elliptical
  orbit via parent null*.
- **Explosão / chuva de confete** → *confetti burst / particle emitter (fake, por camadas com semente fixa)*.
- **Brilhos** → *sparkle / star burst*; **Palco de luz** → *spotlight / light cone*.
- **Texto fantasma gigante** → *oversized background type (ghost type)*.
- **Textura de papel + grade** → *paper texture overlay / blueprint grid*.
- **Caixa de seleção de designer** → *UI selection box with handles (Figma-style bounding box) + cursor click*.

### 3D e mídia
- **Objeto 3D girando** → *turntable spin*; **cápsula / celular** → primitivas 3D (*pill, phone mockup*).
- **Vídeo na tela do celular** → *screen replace / device mockup with video texture*.
- **Recorte BEN2 / Pincel Roto (SAM 2.1)** → *rotoscoping / subject cutout / matte*; **Chroma Key preservando
  amarelo** → *keying with spill suppression (descontaminar)*.
- **Fosco de trilha luma** → *track matte (luma)*.

### Organização da timeline
- **Comp que só organiza** → *pre-compose (nested comp) sem alterar o render* (`m.passa`).
- **Camada de ajuste** → *adjustment layer* (zoom/transform numa; cor e contraste em outra, abaixo de logo e legendas).
- **Nulo** → *null object* (mãe de animação). **Camada mãe/filha** → *parenting*.
- **Plano em código** → *scripted comp / template-driven build* (montar.py + montador.js).
- **Faixas nomeadas** (base, textura, vertical, motion, GC, acabamento) → *layer grouping by role / color labels*.

## 2. Processo (peça de motion de referência ou pedido novo)
1. **Decupar**: baixar (`video_download`) e ver em folhas de quadros; escrever `decupagem.md` (tempos, cenas,
   técnicas por cena).
2. **Inventário**: cada técnica → está no glossário? Está no editor? Faltou: construir ferramenta (forma, primitiva 3D,
   efeito) e conferir no monitor antes de usar. Plano e custo ao Pailer em 3 a 5 linhas se for peça grande.
3. **Assets**: gerar (Z-Image, numpy/PIL), recortar (BEN2/SAM), `gerar_assets.py`; texturas e telas por script.
4. **Plano em código**: `montar.py` descreve camadas (ajudantes `entra/sai/kf/fx/texto/img/forma`), `montador.js` cria
   no app (CDP). Agrupar por `with comp("Motion · X")`; semente fixa nos geradores. Remontar apaga Comps antigas.
5. **Conferir**: `folha.py t1 t2 …` (nossa em cima, referência embaixo, MESMOS tempos) no monitor; depois
   `tools/agente/conferir_edicao.py` sem REPROVADO. Autonota 1 a 10 por critério; corrigir os 3 piores até ≥ 8.
6. **Organizar**: `veCompCenasPlano()` (conflitos 0) e `veCompAgruparCenas()` em cada timeline.
7. **Exportar**: sempre pela placa (`exportar.py --placa` / `exportar_conferencia.py`); conferir o ARQUIVO exportado
   (folha do mp4: 6 q/s + 30 q/s nas viradas), áudio -14 a -16 LUFS, pico até -1 dB. Camadas dentro de Comp entram no
   plano (`veTxPrecisaEm`), senão texto/forma/3D somem (erro do export v1, ref 01).
8. **Registrar**: técnica nova no mapa (gatilhos) + linha no glossário + neurônio no cérebro; nota do Pailer na tabela.

## 3. Personalizar depois
- Trocar cor/tipografia/textos: editar as constantes do topo de `montar.py` e remontar (segundos).
- Reaproveitar uma técnica: copiar o ajudante (`selecao()`, `orbita()`, `revela()`, `caminho()`, `cur_vai`) para a peça
  nova; os parâmetros estão nas linhas do mapa (Peça Ref 01).
- Projeto da ref 01: `D:/kanivete_testes/repertorio/01_shortcuts/` (montar.py, montador.js, plano.json, .vknv).
