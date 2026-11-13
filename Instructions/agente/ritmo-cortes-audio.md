# Ritmo, cortes e áudio — referência de montagem profissional

Complementa `metodo-edicao-video.md` (regras do Pailer), `tecnicas-de-montagem.md` (teoria) e a ficha do cliente. Não é uma receita de duração fixa. Escolha pelo conteúdo, emoção, contexto, identidade e formato; confira por escuta e imagem. Fontes e capacidades no fim.

## Começar pelo ouvido

1. Leia e escute o material; organize o sentido e a intenção das falas. Monte um primeiro fluxo de áudio (*radio edit*) quando o formato tiver fala relevante, sem inventar frases ou mudar seu sentido. Em peça visual sem fala, o ritmo pode nascer da ação, da música ou do silêncio.
2. Leia a onda em cada borda antes de ouvir: corte seco abre e fecha num vale, nunca com onda alta encostada no início ou no fim do clipe (palavra comida). Os sons de "s", "x" e "ch" têm pouca energia e parecem pausa; confirme nos agudos. Sem vale, use o ponto mais baixo com fade curto. Regra e ferramenta: `metodo-edicao-video.md` › Corte de fala; `tools/agente/onda_voz.py`.
3. Ouça as emendas sem imagem: palavras inteiras, continuidade de ambiente, respirações naturais e voz inteligível. Pausas são ferramentas narrativas; siga os limiares do método, sem cortar uma fala ou emoção pelo número isolado. Ajuste ruído de fundo com ambiente real compatível (*room tone*) quando necessário; crossfade é opção, não correção automática de conteúdo ou fase.
4. Monte a imagem sobre a intenção sonora; respeite ação e continuidade, sem sacrificar o fim da palavra para acertar a batida. Confira novamente olhos e ouvidos juntos e depois nas condições de reprodução previstas, inclusive celular quando pertinente.
5. A primeira aparição de quem fala segue a orientação vigente do Pailer: rosto cerca de 11 s, sem ponte de B-roll; uma ponte sonora não autoriza ocultar a apresentação. Regras do cliente e instruções explícitas do trabalho também importam.

## Cortes: propósito e cautela

| Técnica | Quando funciona | Verificar / evitar |
|---|---|---|
| J-cut | Som do próximo plano entra antes da imagem; antecipa ambiente ou prepara uma mudança de assunto. | A voz não deve confundir quem fala; respeitar a primeira apresentação no rosto. |
| L-cut | Som do plano anterior continua sobre a imagem seguinte; permite reação, resultado ou continuidade da ideia. | Preservar sentido e sincronismo; não deixar frase cortada ou som incompatível com a cena. |
| Hard cut / corte seco | Troca direta; escolha básica para clareza, ritmo ou mudança de informação. | Evitar imagem preta acidental e salto de ambiente sonoro indesejado. |
| Jump cut | Salto temporal no mesmo enquadramento, útil para condensar fala ou criar energia deliberada. | Não cortar sílaba ou dar aparência de erro involuntário; zoom aleatório em todo corte não é solução. |
| Smash cut | Contraste abrupto de som, imagem ou energia para surpresa ou humor. | Reservar para intenção clara; ouvir o salto de volume. |
| Match cut | Liga planos por semelhança visual, movimento, conceito ou som. | Enquadramento, direção e momento precisam conversar; não forçar uma semelhança. |
| Cutting on action | Troca durante uma ação que continua no plano seguinte. | Conferir direção, posição, velocidade e continuidade do gesto. |
| Cross-cutting | Alterna ações ou situações relacionadas para comparação, tensão ou simultaneidade. | A relação e o tempo devem ser compreensíveis; não sugerir simultaneidade falsa em material factual. |
| Cutaway | Sai brevemente para detalhe, reação ou contexto, geralmente voltando ao assunto. | O apoio deve ser pertinente, estável e não esconder informação necessária. |

## Transições: significado antes de efeito

| Recurso | Uso e cuidado | No Kanivete |
|---|---|---|
| Cross dissolve | Suavizar passagem de tempo, lugar ou estado; evitar borrar informação ou perder ritmo. | `dissolve`/`crossfade`; duração depende de mídia disponível. |
| Fade in / fade out | Abrir ou encerrar uma imagem ou som; cuidado com silêncio e preto não intencionais. | Entrada/saída visual e fades de áudio; conferir duração real. |
| Dip to black | Separar atos ou encerrar com pausa. | `fadeblack`; verificar se a pausa combina com a narrativa. |
| Dip to white | Flash ou passagem clara com intenção; não usar em toda troca nem estourar texto/pele sem querer. | Não identifiquei preset dedicado na lista `VE_TR`; usar solução existente somente após verificar prévia e exportação. |
| Whip pan | Conectar movimentos rápidos ou produzir energia; direção e sensação de velocidade precisam casar. | `chicote`; alternativa de sobreposição `panblur`. |
| Wipe | Uma borda revela progressivamente outro plano; útil em identidade gráfica ou mudança de espaço deliberada. | Não identifiquei preset dedicado de wipe na lista `VE_TR`; `slide` desloca a imagem e não é wipe. |
| Luma fade / light leak | Luma: revelação por luminosidade; leak: luz orgânica ou virada estilizada. | Há `leak` de sobreposição e efeito Luma Key, mas não foi confirmada transição Luma Fade dedicada; não chamar Luma Key de Luma Fade sem comprovar. |

Áudio: `cp` é crossfade de potência constante. Ouça o resultado; correlação entre sons, conteúdo e ambiente mudam a percepção. Orientações de aplicação e limites: `animacoes-nativas-video.md` e `efeitos-sonoros-video.md`.

## Pós-produção e equilíbrio

| Recurso | Quando ajuda | Limite e aplicação no Kanivete |
|---|---|---|
| Speed ramp | Acelerar uma ação e desacelerar no momento de interesse, com mudança de velocidade suave. | O editor documenta velocidade constante por clipe (`c.v`); não identifiquei remapeamento contínuo por quadros-chave. Cortar em trechos de velocidade fixa pode criar degraus e não equivale a rampa suave. Verificar a taxa da fonte, artefatos, duração e som. |
| Zoom / punch-in | Destacar uma fala ou reorientar atenção; entrada e saída devem assentar suavemente. | Efeito `zoom` em camada de ajuste; centro no assunto e zoom só em momentos fortes, seguindo o método. Conferir se a resolução aguenta. |
| Camera shake | Sugerir impacto, movimento de câmera ou ação. | `ca_wig`/sobreposição `shake` existem; intensidade compatível com a cena, cuidado com legibilidade e desconforto. |
| Glow | Luz ou brilho coerente com fontes luminosas e estilo. | `mo_glow`; respeitar a regra de não aplicar bloom por padrão e conferir pele e altas luzes. Glow não prova que haja halation físico. |
| Halation | Halo quente em bordas de altas luzes, como efeito estético de filme. | Não identifiquei efeito dedicado; uma aproximação deve ser identificada como aproximação e conferida contra referência. |
| Film grain | Textura, unidade de fontes ou aparência escolhida. | `mo_grao`/Granulação; ajustar discretamente no tamanho final, sem pressupor que ruído digital seja reprodução fiel de película. |
| Texturas ópticas / leaks | Transição, atmosfera ou identidade com motivação visual. | Sobreposição `leak` e `flare`; conferir cor, duração, pele, texto e repetição. Há mais de um efeito, mas a variedade de assets reais ainda precisa ser auditada. |

Não há porcentagem universal de cortes com efeitos. Compare com e sem cada tratamento; retire o que repete a mesma informação ou chama mais atenção que a mensagem. Cheque fala, batidas, intensidade, cor e resolução na peça completa, não só em um quadro.

## Lacunas: critérios para implementação

- **Speed ramp:** alteração contínua e suavizada da velocidade, conversão correta entre tempo da fonte e da timeline, duração, som, sincronismo, salvamento, desfazer/refazer, prévia e exportação equivalentes. Testar diferentes taxas de origem e trechos com/sem áudio; não declarar concluído só com clipes segmentados.
- **Wipe e dip para branco:** borda/direção e duração configuráveis no wipe; pico branco controlado no dip; transição entre clipes e nas pontas, recortes, transparência, pouca mídia sobrando, desfazer/refazer e prévia comparada ao export. Slide não conta como wipe.
- **Luma fade e halation:** definir com referência visual o efeito pretendido, parâmetros e limites; validar prévia/exportação e comportamento em altas luzes. Uma simples chave luma ou glow genérico não comprova equivalência.
- **Texturas ópticas:** inventariar primeiro recursos e licenças existentes; só incorporar opções diferentes depois de vê-las e conferir o direito de uso e de redistribuição. Para cada recurso, registrar origem e uso adequado.

## Fontes consultadas

- Adobe, [J e L cuts](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-j-cuts-and-l-cuts.html) e [tipos de corte](https://www.adobe.com/creativecloud/video/post-production/cuts-in-film): definições de pontes sonoras e cortes.
- Adobe, [match cut](https://www.adobe.com/creativecloud/video/post-production/cuts-in-film/match-cut.html): relações gráficas, de ação e de som.
- Adobe, [remapeamento de tempo](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-speed/change-clip-speed-and-duration-using-time-remapping.html): velocidade variável e suavização; não implica que o Kanivete tenha o mesmo recurso.
- Adobe, [crossfades de áudio](https://helpx.adobe.com/premiere/desktop/add-audio-effects/apply-audio-transitions/audio-crossfade-transitions.html) e [ruído e grão](https://helpx.adobe.com/premiere/desktop/add-video-effects/effects-and-transitions-library/noise-and-grain-effects.html).
- Kanivete: `Instructions/editor-video.md` › velocidade; `frontend/js/editor-trans.js`, `editor-ovt.js`, `editor-fx.js`, `editor-motion.js` e `editor-props.js` (levantamento estático; existência no código não comprova resultado no app).
