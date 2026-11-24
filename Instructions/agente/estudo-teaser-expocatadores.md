# Estudo: Teaser ExpoCatadores (edição do Pailer, aprovada pela equipe)

Referência de montagem musical premium e de escolha de take. **Não é receita fixa**: é o porquê das decisões, medido.
Regras gerais que saíram daqui: `metodo-edicao-video.md` › Escolha do take e `ritmo-cortes-audio.md` › Montagem musical.
Ferramenta: `tools/agente/escolher_take.py` (tira do bruto com defeitos marcados; grade musical com força do ataque).

Material (2026-11-24): render `…/13 - TERROTÓRIO MÍDIAS BRASIL/…/02 - ExpoCatadores - Dia 01/04 - RENDERS/Teaser Evento_1.mp4`
(60 s, 1080x1920, 30 fps); projeto `03 - PROJETO …/01 - 02 - ExpoCatadores - Dia 01_1.prproj`, sequência "Teaser Evento"
(lida com `Functions/premiere.py` › `converter`); brutos em `E:/13 - TERROTÓRIO MÍDIAS BRASIL/…/01 - BRUTO` (iPhone, 60 arquivos usados).
Música: "Going In (Instrumental)" – Nbhd Nick, 93 BPM (batida 0,645 s; semicolcheia 0,161 s), entrando no segundo 13,1 da faixa.

## Números
- 113 planos em 60 s: mediana 0,43 s (quartis 0,23–0,67). Fontes diferentes: 67. 20 punch-ins em degrau, 18 pulos dentro do mesmo arquivo, 13 trechos com velocidade alterada, 3 transições (todas dissolve curto). O resto é corte seco.
- **Corte na grade fina, em cima do ataque**: 92% dos cortes a até 2 quadros de uma semicolcheia (48% a até 1 quadro); só 23% caem na batida cheia. No ponto do corte o ataque sonoro é 3,2x mais forte que num ponto qualquer: ele corta no golpe do som (caixa, chimbal, efeito), não na contagem.
- Cortes por compasso (4 batidas = 2,58 s): 4 → 6 → 10 | fotos | 10 → 6 → 8 → 8 | 4 → 5 → 2 | marca | 5 → 3 → 4 → 4 → 5 → 3 → 6 | 2 → 5 → 6 → 4 | logo.
- Comparação de outras peças do mesmo evento (mediana do plano): chamadas faladas 0,9–1,9 s; entrevistas 2,1–2,5 s; discurso 1,6 s; teaser 0,43 s. O teaser é 4x mais rápido que a chamada: ritmo pelo formato.

## Estrutura (arco)
| Tempo | Ato | O que acontece |
|---|---|---|
| 0–2,1 | Abertura | Palco com a marca do evento (plano largo, legível) + logo da produtora em pop com impacto cinematográfico e swoosh. Identidade antes de tudo. |
| 2,1–4 | Entrada | Público chegando, acelerado 2,37x; o mesmo take vira 3 planos por recorte (escala 231, posição x à esquerda/direita). |
| 4–9,4 | Personagens | Rostos e reações rápidas: autoridade, entrevistadora, catadora; punch-in em degrau no mesmo take (105 → 115; 137 → 159 → 129). |
| 9,4–11,6 | Fotos | Sequência de fotos com escala em degraus crescentes (54 → 58 → 47 → 45 → 63 → 79 → 140 → 172): stop-motion que acelera até a virada. |
| 11,6–21 | Vida do evento | Alegria (selfie, mascote), serviços (corte de cabelo, trança, foto), debates no microfone. Ritmo cheio. |
| 21–27,5 | Tensão / causa | Plateia séria em P&B, pan com rampa 6x → 0,65x, ilustração do catador carregando o saco de dinheiro. Ritmo cai (2 a 5 cortes por compasso). |
| 27,5–30 | Respiro de marca | Arte "Território Mídias Brasil" + colagem de logos e prints (prova de imprensa) no respiro da música. |
| 30–38 | **Clímax** | Chegada do presidente: braços e celulares erguidos, aceno, abraço, assinatura. Planos **mais longos** (0,7–1,3 s) que no resto: o auge respira. |
| 38–47 | Ressonância | Pessoas, estandes, artesanato, tambor, falas, de volta ao humano. |
| 47–56,6 | Celebração | Dança, bandeiras, plenária gigante; acelera de novo. |
| 56,6–60 | Fecho | P&B com o logo da produtora; logos em pop na última batida da música (57,7 s), que acaba junto com o vídeo. |

## Técnicas (com o dado do projeto)
1. **Respiro da música = plano segurado.** A faixa é constante; a dinâmica nasce da montagem. Nas quedas de energia da música (13, 23, 27, 37, 44 e 51 s) ele segura um plano de 1,2–1,3 s (2 batidas), desacelera (0,29x; 0,65x) ou põe a marca. Depois do respiro, volta a picar.
2. **Clímax com plano mais longo**, não mais curto: contraste com os 0,2 s de antes. Momento grande precisa ser visto.
3. **Punch-in em degrau** no mesmo take, trocando a escala a cada semicolcheia (sem animar entre eles): dá energia sem trocar de assunto. Vale em montagem musical; em Reels de fala continua valendo a regra de zoom só de ênfase.
4. **Um take, vários planos**: recorte forte (escala 230) com a posição para um lado e depois para o outro mostra duas pessoas do mesmo plano aberto como dois planos.
5. **Rampa de velocidade por trechos**: acelera o que é deslocamento sem interesse (pan entre rostos 6x; multidão andando 2,37x) e desacelera no destino (rosto 0,65x; gesto 0,29x).
6. **Mini-história em 1,5 s** de um bruto só (IMG_3259): pose da moça → tela do celular com a foto → sorriso de quem fotografou. Ação → resultado → reação.
7. **Pulo dentro do mesmo arquivo** (18 vezes): pega 2–5 instantes do mesmo bruto em sequência (IMG_3261: 18,2 / 18,9 / 20,5 / 22,1 / 24,0 s), como um jump cut musical.
8. **Elementos em degrau na batida**: foto/logo que sobe em 3 posições (y 1577 → 1259 → 917) em 0,1 / 0,07 / 0,33 s, em vez de animação suave.
9. **Cor**: duas camadas de ajuste no vídeo todo + correção pontual por clipe; P&B só no trecho da causa e no fecho.
10. **Som**: música começando no ponto em que já tem ritmo (13,1 s da faixa); impacto e swoosh só nos pontos de marca (abertura, respiro de marca); glitch curto em uma virada.

## Escolha do take (o ponto principal)
Medido em 104 trechos usados contra o resto do mesmo bruto (6 quadros/s, YuNet para rostos):
- Rosto **menor** no quadro: mediana 2,8% da área contra 5,5% do resto; close grande (> 8%) só em 10% contra 24%. Ele escolhe o plano com contexto e corta depois (escala 110–230 no projeto), controlando o enquadramento na pós.
- **Mais gente** junto: 3+ rostos em 22% contra 10%.
- Borrado: quase nunca (2% contra 4%).
- Nitidez, tremor, exposição e frontalidade sozinhos **não** explicam a escolha (ficam perto de 50%). Uma nota automática com essas métricas acertou 45% dos trechos dele; ao acaso, 44%. **A escolha é de conteúdo e tem que ser feita no olho, vendo o bruto inteiro.**

O que ele escolhe, visto nas tiras (verde = usado):
- **O auge do gesto**, não a fala: no bruto do presidente (IMG_3806, 80 s) usou só 4 instantes: aceno com a placa "Catadores" atrás, aceno com bandeira e celulares, abraço. Pulou o palco com tripé, a multidão de costas e os 20 s finais parados.
- **A virada, não o papo**: na entrevista de 168 s (IMG_3536) usou 1 s, o instante em que repórter e entrevistado se viram, em plano aberto com a frase do evento ao fundo. Nenhum segundo do close de fala.
- **A reação**: em 196 s de entrevistas (IMG_3509) usou 1,3 s: a catadora levantando o olhar e a senhora num instante de expressão. A fala não importa no teaser; o rosto vivo importa.
- **Marca do evento no quadro** sempre que dá (painel, logo, frase), sem precisar de letreiro.
- **Evita**: costas, câmera procurando enquadramento, olhar para baixo (mexendo no celular), quadro morno entre duas ações, close gigante de microfone.

## Outras peças do mesmo evento
- **Chamadas faladas (Chamada 1 v2, 3, 4, Bruno)**: abrem com 1–2 s de B-roll do evento sob a primeira frase; o apresentador em plano médio com painel do evento atrás; GC na primeira aparição; quando a fala cita alguém (o presidente) entra a imagem dele numa placa amarela da marca com flash branco; o final é B-roll do evento sob a voz (L-cut) e fecho na marca.
- **Entrevista (Bruno Capão, Luiz Gonzaga)**: plano a dois na pergunta (quem pergunta aparece), close de quem responde na resposta; jump cuts no mesmo take sem zoom; GC no começo; legenda pequena e baixa.
- **Discurso (Cruz Alta)**: abre com 4 planos de gancho (pessoas, produto, sorriso), depois a palestrante com GC; corta para a **plateia ouvindo** (mão no queixo, atenção) sob a fala; foto ilustrativa em janela quando ela cita a capacitação; fecho com outras vozes e o selo do cliente.
- **Depoimento em série (Recado aos Presidentes)**: close apertado e constante, um bloco por pessoa com GC (nome + "Catadora"); a frase-chave em lettering de papel rasgado no peito, sem cobrir o rosto; cartela de título no segundo 2 (cold open: rosto primeiro, título depois).
