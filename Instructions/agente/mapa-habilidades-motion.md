# Mapa de habilidades de motion (árvore de técnicas desbloqueadas)

Cada peça de motion aprovada destrava técnicas. Aqui fica O QUE funciona, COMO fazer no Editor Kanivete e QUANDO
usar — para a próxima peça partir do nível em que a anterior parou. Ler antes de qualquer motion, junto da
"Receita validada" de `plano-motion.md`. Ao terminar uma peça: anotar as habilidades novas e a nota do Pailer.

Legenda: ⭐ = o Pailer elogiou nominalmente · 🔓 = desbloqueada (usada e aprovada) · 🔒 = próxima a destravar

## Peças que destravaram
| Peça | Data | Nota do Pailer | Pasta |
|---|---|---|---|
| Propaganda KANIVETE (ref. Pinterest, 23 s) | 2026-10-10 | "ficou perfeito" | `D:/kanivete_testes/motion_kanivete/` |
| Intro "SEQUÊNCIA DE APROVADOS" (Carlinhos, ref. Dodge, 5 s) | 2026-10-12 | "superou em TODOS os pontos", aprovado de primeira | `D:/kanivete_testes/intro_aprovados/` |
| 2 reels Black Friday A/B + mosaico (Carlinhos, "Sinal amarelo", 24 s) | 2026-10-20 | mosaico: "melhora muito boa"; reels: "falta pouco" | `D:/kanivete_testes/bf_carlinhos/` |

## Ferramenta-base: plano em código (montar.py + montador.js)
🔓 A timeline inteira sai de um script: cada camada é um dicionário (tipo, trilha, início, duração, propriedades,
quadros-chave, efeitos) e o `montador.js` cria tudo no app aberto (CDP). Mudou uma nota? edita o script e remonta em
segundos — nada se perde, tudo é repetível. Ajudantes: `entra()` / `sai()` (desfoque + opacidade + deslocamento +
escala com curva), `kf()` (quadro-chave), `fx()` (efeito), `texto()/img()/forma()/cor()`. Conferir com `folha.py`
(quadros do monitor; `--sem-ref` sem referência) e SEMPRE no arquivo exportado (folha do mp4 a 6 q/s + 30 q/s nas viradas).

## 1. Entradas e saídas
- 🔓 **Entrada padrão** — desfoque 40→0 (texto 100→0) + opacidade 0→100 + deslocamento 30–60 px ou escala 115–135→100,
  0,25–0,35 s, curva EXPO `[0.16, 1, 0.3, 1]` (sai rápido, chega macio).
- 🔓 **Pulo** — escala 0→100 com curva `back` (passa do ponto e volta) + rotação −25..−35°→0: símbolo/ícone/estrela.
- 🔓 **Saída padrão** — 0,15–0,22 s, para cima (−140 px) com desfoque 40–80, curva `in`; escalonar 15 ms entre itens.
- ⭐🔓 **Letra por letra** (intro) — cada letra é um texto próprio: mede a largura de cada letra na fonte real
  (`PIL ImageFont.getlength`, +4 px de respiro) e posiciona pelo centro; entra cada uma 45 ms depois da anterior com
  desfoque 100→0 + subida de 40 px. Sombra dura colorida (sDist 9, sBlur 0, azul da marca) dá o "3D chapado".
- 🔓 **Tarja que estica** — retângulo da cor da marca entrando com escala 0→100 a partir da esquerda (x deslocado meia
  largura), texto cai de cima 0,13 s depois; leve inclinação (−3°) dá energia.
- 🔓 **Pulso de destaque** — escala 100→109→100 em 0,4 s (ida EXPO, volta suave) com um pop no som: reacende um
  quadro parado.

## 2. Transições entre cenas
- 🔓 **Flash de cor** 0,18 s · **estrela pontuda** crescendo até cobrir · **círculo nascendo do objeto** (tela da TV).
- 🔓 **Mergulho no símbolo** (intro) — o símbolo escala 100→420 % com desfoque crescente (curva `in`) enquanto um círculo
  da cor da marca nasce do centro dele (curva `[0.7,0,0.84,0]`) e cobre a tela.
- 🔓 **Dissolve de 2–3 quadros** (ref. Dodge) — cor cheia por cima com opacidade 100→0 em 0,1 s: a troca de fundo
  "estala" sem corte seco.
- ⭐🔓 **Chevrons em camadas** (saída da intro) — triângulo (ponta) + retângulo largo logo abaixo, sem contorno no
  retângulo e com ele cobrindo 30 px da base da ponta (some o traço da base); dois chevrons (azul, depois amarelo
  80–100 ms atrás) subindo com curva `[0.75, 0, 0.2, 1]`; termina com a tela cheia na cor da marca (corte limpo
  para o próximo vídeo). Contorno preto 16 px = a linguagem do logo do cliente.

## 3. Partículas e vida no quadro
- ⭐🔓 **Explosão de confete** (intro) — 44 formas pequenas (retângulos 16–26 × 30–48 px com cantos 3 px, 30 % bolinhas),
  cores da paleta (amarelo pesando 2×; branco ganha contorno fino para aparecer no fundo claro). Cada uma com:
  `x` reto até o destino + desvio; `y` em DOIS trechos — sobe rápido até o pico (curva de saída) e cai acelerando
  (curva `[0.55, 0, 0.9, 0.6]` = gravidade); rotação de 360–900° no total; escala 30→100 no nascimento; desfoque de
  movimento ligado. Ângulo de lançamento −160..−20° (leque para cima), velocidade 500–1150 px, vida 1,6–2,6 s.
  Metade numa trilha ATRÁS das pessoas e metade NA FRENTE = profundidade. Gerador com semente fixa
  (`random.Random(11)`): a mesma explosão toda vez que remonta.
- ⭐🔓 **Chuva de confete** — 26 peças nascendo acima do quadro a cada ~0,11 s, caindo reto (linear) com balanço
  lateral (x em 4 pontos, curva `ease`, amplitude 40–90 px) e giro lento. Mantém o quadro "vivo" no miolo parado.
- 🔓 **Brilhos** — estrela de 4 pontas (`t: 'est', pontas: 4, raioInt: 22`) amarela com contorno preto: escala
  0→100 (back) →0 em 0,55 s girando −45→45°, espalhadas no tempo em volta do ponto de interesse.
- 🔓 **Onda de choque** — anel (elipse só contorno, `pOn: false`, 22 px) escala 20→150 % com opacidade 100→0 em 0,75 s
  no momento do impacto.
- 🔓 **Anel tracejado girando** — elipse só contorno com `tLen`/`tVao` (tracejado) e rotação lenta (75–120° na cena).
- 🔓 **Órbitas** — nulo girando com elipses tracejadas e bolinhas filhas (camada mãe) + desfoque de movimento.

## 4. Composição e profundidade
- ⭐🔓 **Gramática "motion poster"** (ref. Dodge) — fundo de papel claro texturizado, sujeito recortado embaixo com
  empurrão lento (escala 100→106 na cena toda), círculo de cor GRANDE crescendo atrás do sujeito (back), título forte
  no alto, marca pequena centralizada no topo (o Carlinhos finaliza assim), troca de fundo colorido ↔ claro.
- 🔓 **Texto fantasma gigante** — palavra do tema em 330 px, cor escura a 6–9 %, deslizando devagar atrás de tudo.
- 🔓 **Textura de papel gerada** (numpy): base clara + ruído grosso borrado + grão fino + 260 pintinhas escuras +
  vinheta leve; versão escura na cor da marca para a abertura. Sem baixar nada.
- 🔓 **Grade tracejada sutil**, objeto recortado com sombra, mini-objeto no canto, cursor clicando.
- 🔓 **Colagem em profundidade na Cena 3D** (teste "Pravda Noir", soviético + noir, 2026-10-14, o Pailer: "tá perfeito")
  — pasta `D:/kanivete_testes/jornal/` (gerar.py → recorte.py → montar.py). Como fazer:
  1. **Assets**: Z-Image (`gerador_imagem.gerar`) com prompts de foto P&B de jornal (fundo de página, fábrica, pessoa,
     silhueta, foguete) + formas em numpy/PIL (sol, estrela, faixa diagonal, manchetes em Impact/Times).
  2. **Textura de recorte** (`recorte.py`): duotom tinta `#141210` × papel `#ECE2C9` + grão; **retícula** de jornal a 45°
     (pontos 5–7 px); recorte da pessoa pelo BEN2 + **borda de papel branca de tesoura** (máscara dilatada 22 px com
     contorno rasgado: ruído grosso + fibra fina) + sombra projetada embutida; foto de cena com **borda rasgada**
     e sem moldura (cortar 5% da geração). Vermelho `#C41E1C` só em sol, estrela e manchete.
  3. **Profundidade**: posições PENSADAS NA TELA e convertidas para a cena (`VE3DAPI.colocar` ou `fz = (D0 - z)/D0`):
     fundo z −1, sol −0,75, foto −0,5, faixa −0,3, pessoa −0,1, objetos 0 a 0,15, silhueta 0,3, manchetes 0,4–0,5.
  4. **Câmera**: aproximar só 10% e órbita de ±3° em 8 s (mais que isso joga quem está na frente para fora do
     quadro); manchetes entram (x/y com ◆), estrela gira, foguete atravessa, "tremido" de stop motion (rz ±0,6° a
     cada 0,25 s linear) em 3 recortes. Neblina 0,06 escura; **sem desfoque de foco** (o Pailer viu "tudo com blur").
  5. **Conferir sem abrir imagem**: `VE3DAPI.naTela(cena, t)` em 0, meio e fim — `fora` > 3% em quem não está entrando
     = ajustar; depois UMA `VE3DAPI.folha(cena, [6 tempos])` e a folha do mp4.
  Armadilha: fundo gerado (1344 px) não pode ficar ampliado > ~1,3× na tela (borra) — trazer para mais perto (z −1).

## 5. Recorte e chave
- ⭐🔓 **Recorte de fundo verde que preserva amarelo** (intro) — o problema: Chroma Key comum mede "verde − média de
  vermelho e azul"; a placa amarela tinha verde ≈ vermelho e ficava meio transparente/marrom. A solução: medir
  "verde − o MAIOR entre vermelho e azul" (amarelo, laranja e pele têm vermelho ≥ verde → 100 % opacos) e
  **descontaminar** a borda semitransparente (cor real = (cor − (1−alfa)·verde)/alfa). Agora é nativo no Chroma Key:
  "Preservar amarelos (máx. de R e B)" + "Descontaminar bordas" (%) + "Mostrar status" (cinza = furo/meio-termo).
  Reserva manual: `intro_aprovados/scripts/recorte.py` → vídeo de cor + vídeo-fosco cinza → Fosco de trilha luma.
- 🔓 **Pincel Roto** (SAM 2.1) para recorte sem tela verde; **BEN2/BiRefNet** para foto parada.

## 6. Tipografia
- 🔓 Serifada itálica de contraste (Playfair: título negrito + apoio regular) — peça editorial/tech (propaganda).
- 🔓 **Montserrat Black Itálico** (`peso: 900`, `fam: 'Montserrat'`) com sombra dura colorida — peça varejo/energia
  (intro Carlinhos; casa com o itálico pesado do logo e da plaquinha). Bebas na caixa/tarja.
- Regra: no editor, texto com `peso` + `fam` (o navegador escolhe o arquivo certo: Black, Bold…).

## 7. Acabamento
- 🔓 Aberração cromática leve no todo (camada de ajuste: r −0,7 / b +0,7, raio 0).
- 🔓 Bloom (Brilho: limite 70–72, raio 38–40, intensidade 70) SÓ em trecho de fundo colorido (no branco lava o texto).
- 🔓 Sombra projetada macia e forte em símbolo/moldura (op 45, ângulo 90, distância 22, tamanho 40).

## 8. Som
- 🔓 Pop nas entradas que pulam (−12 a −17 dB), whoosh com o pico no corte, impacto (riser hit) na revelação,
  torcida baixinha (−20 dB) com o confete, swoosh na saída. Trilha: o Pailer manda (não gerar); em intro de
  sequência, só efeitos (a trilha da sequência entra por cima).

## 9. Organização da timeline
- 🔒 **Comps por grupo** (sugestão do Pailer, 2026-10-12): quando a timeline crescer na vertical, agrupar em Comps
  (fundo, tipografia, partículas, transição de saída) — mais fácil de entender e mexer. Não é regra: só quando não
  piorar o resultado. Próximo passo técnico: o `montador.js` aceitar `comp: "nome"` e montar as camadas dentro de uma
  Comp (editor-comp.js) com a Comp na timeline principal.

## 🔒 Próximas a destravar
- Caminho de movimento curvo (alças espaciais), auto-orientar ao longo do caminho, repetidor de formas, expressões
  livres (wiggle, loop) — pendências em `plano-motion.md`.
- Texto em caminho / máscara de texto revelando vídeo; luz varrendo o título (fosco alfa de um brilho inclinado).
- Parallax automático de UMA foto (mapa de profundidade) e vídeo como placa na Cena 3D.

## Peça: V1 GaIA (Smart Tree/Finep, 8 min, 2026-10-14) — `D:/kanivete_testes/smarttree/v1/` (base.py + montar_v1.py + montador.js)
- 🔓 **Documentário inteiro por plano em código**: cobertura e motion presos às PALAVRAS da narração (`em("frase", apos)`
  sobre o palavras.json do Whisper); respiros = trechos da narração com folga (`RESPIROS`). Narração nova = transcrever e
  remontar (o ritmo acompanha). `sequencia([...])` = cada tomada vai até a próxima.
- 🔓 **Comps automáticas**: `with comp("Motion · X"):` — cada camada sobe uma trilha; o montador chama `veCompDeClipes`
  e a timeline principal fica com 6 trilhas nomeadas (base, textura, vertical, motion, GC, acabamento). Remontar apaga as
  Comps velhas da pasta.
- 🔓 **Vertical no 16:9 (pedido do Pailer)**: recorte 1080×1600 por máscara (9:16 corta em cima/baixo, 3:4 nas laterais)
  na altura toda + o mesmo vídeo ampliado com desfoque 55 e brilho −45 no fundo + textura (grão + sombra macia) entre eles.
- 🔓 **Raízes-circuito** (linguagem do logo Smart Trees): `linha()` (forma 'lin' + aparar caminho 0→100, rot = atan2) +
  `no()` (ponto que pula com halo PNG) — redes, diagramas de camadas, linha do tempo, degraus, TRL, anel de progresso
  (elipse só contorno com apFim).
- 🔓 **Efeitos sonoros ligados ao motion**: cada nó/etiqueta/GC/lettering registra um evento; o som entra com o PICO no
  quadro (medido: `sfx_medidas.json`), volume normalizado por tipo, intervalo mínimo por tipo (whoosh 2,6 s, tick 0,42 s).
- Armadilha: fonte instalada só para o usuário (Fraunces) NÃO aparece no editor (cai no Arial). Conferir medindo a
  largura no canvas (`measureText` igual ao Arial = falta); `document.fonts.check` sempre diz sim.

## Peça: Reels Black Friday A/B (Carlinhos, 2026-10-19) — `D:/kanivete_testes/bf_carlinhos/` (montar.py gera as 2 timelines)
- 🔓 **Trilha escolhida por medida** (não dá para ouvir): prévias do Epidemic (`audiocdn.epidemicsound.com/lqmp3/...`,
  capturadas tocando cada linha) → librosa: energia por segundo, BPM, batidas. Procurar **pausa seca + drop** (FLACO,
  Azucares: pausa 29,5–33,0, drop 33,27). Começar o reel numa frase da música (16 tempos antes do drop): gancho 8 tempos,
  pausa 8 tempos (tensão), drop revela a oferta. Gênero pelo público: funk carioca "Happy" > phonk (escuro/raivoso).
- 🔓 **Teste A/B limpo**: mesma música e mesmas cenas; só o gancho (0–3,7 s) muda (`gancho_A`/`gancho_B`).
- 🔓 **Objeto em 2 estados** (semáforo apagado / só o amarelo aceso): gerar com tudo aceso e apagar as lâmpadas no
  numpy por DISCO em posições medidas no perfil de cor (máscara por cor pega laranja do vizinho). Acende = troca com op.
- 🔓 **Brilho de luz = PNG radial** (`glow.png`, `glow_eli.png` para o chão) em modo Tela. Forma + desfoque saiu como
  disco chapado na prévia (desfoque não pegou na forma com mesclagem: pendência no plano-motion).
- 🔓 **Pessoa do ChatGPT** (luz de recorte amarela no prompt = já casa com a peça) → `recorte_pro.recortar(..., "pessoa")`
  → posicionar pelo TOPO da cabeça (`y_topo(arq, larg, topo)`), nunca pelo centro (bate no título).
- 🔓 Carro pequeno do cliente (645 px) → `ampliar_imagem.ampliar(..., 3, "foto")` (Real-ESRGAN; só em objeto, não rosto).
- Exportar: `exportar.py --tl "<timeline>" --nome arq --placa`; a conexão CDP pode cair na exportação pesada (a página
  segue): `esperar_fim.py` reconecta e espera `window.__fim`. Volume: música g −9 + limiter boost 2 → −14,4 LUFS.
- Mosaico de feed no mesmo visual: `KNV.cena` com 3 `<section class="slide">` retrato e veículos soltos atravessando a
  emenda; bordas da foto do meio esfumadas com `linear-gradient` (entra na cena). Logo: `LOGO 3D.png` (o "Auto escola" do
  logo chapado some no fundo escuro).
- Notas do Pailer (2026-10-20) que viram regra: **margem lateral 100 px** com texto que encolhe sozinho (`cabe()` no
  montar.py); texto centrado/simétrico; **logo sem exagero** (~520 px no CTA); objeto de cena INTEIRO (semáforo com o
  poste até fora do quadro, âncora `p.ax/ay` na BASE e balanço ±1,5° — o brilho acompanha por seno/cosseno); campanha
  ganha **brasão oficial** (ChatGPT, 3D, fundo transparente) que aparece no drop e no CTA; **logo certo para o fundo**.
- 🔓 **Fita de sinalização** "BLACK FRIDAY" (PNG gerado no PIL, tira 4200×120) cruzando a peça: no mosaico em X atrás
  do herói, atravessando os 3 posts e sumindo na sombra (degradê escuro só sobre fundo+fitas, por baixo das sections);
  nos reels cruza a tela no drop com desfoque de movimento. Referência do Pinterest via KaniBrowser (`kb.py baixar --min 150`).
- 🔓 **Editar por cima do arquivo do Pailer**: `knv.py peca.html --de arquivo_dele.iknv` mantém as camadas que ele mexeu;
  camada que ele apagou: tirar do HTML também; remover camadas velhas com `--depois` (ieAchar + splice).
- Trilha pela estrutura: `musica/achar_drop.py` dá nota a "forte → pausa → drop" em qualquer pasta de prévias.
  Kali Kush (Switch Remix, instr.): silêncio 77,55–79,2, drop 80,797; 2ª parada 92,75–95,75 com a volta em 96,0 = CTA no
  silêncio e o botão bate na volta. **Licença**: Creator NÃO cobre cliente nem anúncio pago — não confirmar o diálogo.
