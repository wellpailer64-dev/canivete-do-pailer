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
