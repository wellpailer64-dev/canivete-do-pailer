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
- Câmera 3D com profundidade nas camadas 2D (paralaxe) — a Cena 3D existe, falta o "3D de camada" do AE.
