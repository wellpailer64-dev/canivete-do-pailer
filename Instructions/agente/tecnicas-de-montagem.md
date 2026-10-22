# Técnicas de montagem: cortes, transições, storytelling e tempo de tela

Guia de referência para agentes que editam no Vídeo Kanivete. Junta a teoria clássica de montagem (Walter Murch,
*In the Blink of an Eye*; Edward Dmytryk, *On Film Editing*; Karen Pearlman, *Cutting Rhythms*) com o que o Pailer
aprovou e corrigiu nas edições reais (seção 9). Ler antes de montar qualquer vídeo com fala e B-roll. Regras
operacionais e API: `guia-edicao.md`. Cor e composição: `direcao-de-arte.md`.

## 1. Princípios
- **Todo corte precisa de um motivo**: nova informação, reação, ação que continua, mudança de assunto ou ritmo.
  Se não há motivo, o plano continua.
- **Regra dos seis (Murch)**, em ordem de peso: emoção (51%) > história (23%) > ritmo (10%) > direção do olhar (7%)
  > plano 2D da tela (5%) > espaço 3D/continuidade (4%). Um corte que serve à emoção e à história vale mais que um
  corte "tecnicamente perfeito".
- **Corte invisível**: o espectador não deve perceber o corte, só a história. Corte durante movimento (ação, piscada,
  virada de cabeça), na pausa da fala e na batida da música.
- **A fala manda** (documental e institucional): primeiro monta-se o áudio das falas (*radio edit*), lendo como se fosse
  um podcast; só depois entra a imagem. Se a história não funciona só no áudio, nenhuma imagem salva.
- **Mostrar, não contar**: se alguém diz "a gente fritou o acarajé", a imagem mostra o acarajé fritando no instante da palavra.

## 2. Tipos de corte (o que é, para que serve, quando usar)

| Corte | O que é | Serve para | Usar quando | Evitar quando |
|---|---|---|---|---|
| **Corte seco** | troca direta de plano | 90% dos cortes; ritmo, clareza | sempre que não houver motivo para outra coisa | — |
| **J-cut** | o som do próximo plano entra **antes** da imagem dele | puxar o espectador para a cena seguinte; apresentar quem vai falar; transição natural entre blocos | entrada de um novo entrevistado (voz sobre B-roll, depois o rosto), começo de bloco depois de um respiro (voz entra ~0,7 s antes do rosto) | quando a voz nova confundiria quem está falando |
| **L-cut** | o som do plano atual **continua** sobre a imagem seguinte | deixar a frase terminar sobre a reação, o resultado ou o próximo lugar; suaviza a troca | fim de fala que leva a uma imagem (fala do acarajé → acarajé pronto), reação de quem ouve | quando a imagem nova contradiz a fala |
| **Jump cut** | corte no mesmo plano/enquadramento com tempo pulado | encurtar fala; em reels, energia proposital | reels e vlog (proposital, com zoom de 10–15% alternado); em documentário só **escondido** por B-roll | institucional e documental: nunca à vista |
| **Cutaway / insert** | sai do assunto principal para um detalhe ou reação e volta | esconder pulos de fala, ilustrar, dar respiro ao rosto | cobrir cortes internos da fala; mostrar o que é dito | se vira "papel de parede" sem relação com a fala |
| **Corte na ação** (*match on action*) | a ação começa num plano e termina no outro | continuidade fluida (mão pega a faca → detalhe da faca cortando) | sequências de processo (cozinha, oficina, aula) | ação que não bate (mão esquerda vira direita) |
| **Match cut** (forma/som) | dois planos com forma, movimento ou som parecido | ligar ideias ou lugares de modo elegante | ex.: panela redonda → bolinha redonda; batida da música → batida da faca | se força a barra; um por vídeo basta |
| **Smash cut** | corte abrupto de quieto para intenso (ou vice-versa) | surpresa, humor, impacto | gancho, piada, virada | em vídeo calmo e institucional |
| **Montagem (sequência)** | vários planos curtos na música, sem fala | condensar tempo e processo, emoção | preparo, "como foi feito", abertura e respiro (2–3 batidas por plano) | se fica longa (mais de 15 s sem fala cansa no institucional) |
| **Montagem paralela** | alterna duas ações | tensão, comparação, antes × depois | aula × resultado; dois lugares ao mesmo tempo | narrativa simples e linear |
| **Corte na batida** | corte alinhado ao tempo forte da música | sensação de ritmo e acabamento profissional | aberturas, montagens, respiros; B-roll encaixado na batida (±0,3 s) | não deslocar um corte de fala para cair na batida: a fala manda |

No Kanivete, J-cut e L-cut são feitos com vídeo e áudio **separados e ligados** (`x:'v'` e `x:'a'` com o mesmo `lk`):
o áudio do próximo trecho começa antes (J) ou o áudio do atual estica sobre o B-roll seguinte (L). A "ponte" do
`montar.py` (voz nova entrando 1 s antes sobre B-roll e o rosto 0,9 s depois) é um J-cut.

## 3. Transições (quando NÃO é corte seco)
Regra geral: **transição tem que significar alguma coisa**. Sem significado, é corte seco.

| Transição | Significa | Quando usar | Duração |
|---|---|---|---|
| **Dissolve** (fusão) | passagem de tempo ou lugar, lembrança, suavidade | mudar de dia ou de ambiente; fim de bloco emocional | 0,5–1,5 s |
| **Fade para o preto** | fim, pausa forte, mudança de ato | só no fim do vídeo ou entre atos (CULTSP: desfoque + preto no último plano) | 1,5–2,5 s |
| **Fade do preto** | começo | abertura de documentário (no CULTSP, não: abre direto) | 0,5–1 s |
| **Dip para o branco** | flash, lembrança, revelação | momento-chave, raro | 0,3–0,6 s |
| **Textura/overlay** (Grunge, light leak, flare) | identidade da marca, virada de bloco | CULTSP: Grunge em Luz direta nas viradas de bloco, uma a cada 40–60 s | ~2 s |
| **Push / slide / chicote (whip)** | energia, movimento, "próximo assunto" | reels e conteúdo dinâmico; direção acompanha o movimento da câmera | 0,3–0,5 s |
| **Zoom / overlay de impacto** (`veOvtAdd`) | impacto, ênfase | reels, no tempo forte | 0,4–0,6 s |
| **Split / tela dividida** | comparação, simultaneidade | antes × depois, duas pessoas | — |

Erros comuns: transição em todo corte; dissolve longo em vídeo dinâmico; transição sobre GC/letreiro; transição que
"quebra" uma frase no meio.

## 4. Storytelling (documental, institucional, prestação de contas)
Estrutura que funciona (CULTSP aprovado):
1. **Gancho/abertura** (5–12 s): cenas mais bonitas na música, título do episódio já na 1ª cena. Mostra *onde* e *o quê*.
2. **Apresentação**: quem conduz se apresenta e diz a proposta (com o GC no rosto).
3. **Desenvolvimento/processo**: como funciona, o que se aprende (professor ou instrutor) intercalado com
   **participantes** (como chegaram, o que aprenderam). Alternar vozes a cada 20–40 s.
4. **Prova/momento-chave**: o resultado (o prato pronto, a peça, a música tocando), com som direto curto
   ("eu gosto", "acarajé quente ou frio?").
5. **Impacto/fecho**: frase de resultado ou de continuidade ("primeiro diploma delas", "saímos sabendo produzir do início ao fim").
6. **Saída**: último plano que fecha a moldura (de preferência ecoa a abertura: fachada à noite → fachada à noite), desfoque + preto.

Técnicas:
- **Moldura (bookend)**: terminar com uma imagem que responde à da abertura.
- **Arco curto por pessoa**: quem é → o que fez → o que mudou.
- **Sound bite**: escolher a frase que se sustenta sozinha (começo, meio e fim). Cortar hesitação, "né", repetição,
  mas manter o jeito de falar. Nunca colar frases que mudem o sentido.
- **Som direto (nat sound)**: 1–4 s de som real da cena (risada, panela, "miudinha, miudinha") dão vida e quebram a voz em off.
- **Respiro**: depois de 40–60 s de fala, 2–4 s só de imagem e música (com a transição de identidade).
- **Revelação em camadas**: detalhe → plano médio → rosto (para personagem principal).
- **Ordem**: em geral cronológica dentro do bloco; o geral antes do particular (contexto → detalhe).
- **Nada negativo** em prestação de contas: só o lado positivo das falas pessoais.

## 5. B-roll: o que mostrar enquanto alguém fala
Prioridade, da melhor para a pior:
1. **Literal**: o que está sendo dito, no instante da palavra (fala "corte de couve" → faca cortando couve).
2. **Processo**: mãos, ferramentas, ação acontecendo (sempre com movimento dentro do plano).
3. **Resultado**: peça pronta, prato, tela com o projeto.
4. **Reação**: participantes ouvindo, sorrindo, anotando (prova de impacto).
5. **Contexto**: plano geral do lugar, fachada, sala cheia.
Evitar B-roll genérico ("papel de parede"), repetido, tremido, desfocado, escuro ou com a pessoa errada.

Sequência clássica de 3 planos: **geral → médio → detalhe** (ou o inverso para revelar).
Cortar no movimento, não no meio de um movimento de câmera (pan ou zoom): pegar o trecho estável, de preferência
começo e fim parados. Respeitar a direção do olhar (quem olha para a direita "chama" um plano do que está à direita).

## 6. Tempo de tela e ritmo
- **Rosto do entrevistado**: o espectador precisa *ver* a pessoa falar. Meta: rosto em ≥ ~70–80% do tempo de fala do
  entrevistado; B-roll em cima só para esconder corte ou ilustrar algo concreto, **um plano por vez**.
- **1ª aparição**: rosto por ≥ 8–10 s com o GC (o GC dura ~6–10 s e fica sobre o rosto, nunca sobre B-roll ou plano
  aberto em que a pessoa é pequena).
- **Duração de plano** (institucional): B-roll 2,5–3,5 s; detalhe 1,5–2,5 s; plano geral 3–5 s; montagem na música
  2 batidas por plano. Abaixo de ~1 s vira "pisca" (proibido, exceto montagem rápida proposital).
- **Professor/instrutor**: em aula, preferir planos em que ele explica olhando para a turma ou mostra algo (quadro, tela);
  alternar com a turma reagindo. Trechos cuja imagem já é slide ou aluno não precisam de B-roll por cima.
- **Equilíbrio de vozes**: ninguém (salvo o protagonista) mais de ~40–60 s seguidos; intercalar entrevista e aula.
- **Ritmo varia**: depois de um trecho rápido, um mais calmo (e vice-versa). Começo e fim um pouco mais lentos.
- **Duração alvo** manda: cortar redundância de fala antes de encurtar o B-roll.

## 7. Som na montagem
- J/L-cuts para as trocas; *room tone* (som de fundo) contínuo para não ter "buraco" de áudio entre falas.
- Música: entra e sai em início de frase musical; troca de música num respiro com crossfade de 1–1,5 s; a última
  música acaba junto com o vídeo (alinhar o fim).
- Volume da trilha: ~−9 dB nos respiros, ~−21 dB sob a fala (medir: trilha acústica soa mais baixa que eletrônica).
- Som direto curto por cima da trilha baixa; quando a música da própria cena toca, a trilha sai.
- Nivelar as vozes por trecho (mediana dos quadros com voz) e entregar em −14 a −16 LUFS, pico ≤ −1 dBTP.

## 8. Checklist antes de entregar
1. A história funciona só no áudio? Cada bloco tem começo, meio e fim?
2. Título na 1ª cena (quando o projeto pede); GC de cada pessoa na 1ª fala, sobre o rosto.
3. Rosto do entrevistado visível na maior parte da fala; B-roll literal, estável e sem repetir.
4. **Sem pisca de rosto e sem pisca preto**: `py -3.13 tools/agente/polir_montagem.py <projeto.vknv>` → listas vazias.
5. Sem jump cut à vista; nenhuma frase cortada no meio da palavra; nomes certos (só o que a pessoa disse).
6. Transições só onde significam algo; a de identidade no ritmo combinado.
7. Música no tempo, acabando com o vídeo; níveis de voz iguais; LUFS no alvo.
8. Render conferido: folha de quadros, recortes dos letreiros e transcrição do próprio render.

## 9. Calibração com o Pailer (o que ele aprovou ou corrigiu)
- CULTSP 03 Bananal (2026-10-22, "muito profissional"): a história em blocos (apresentação → chef → preparo com som direto
  → depoimentos → fritura → degustação → fecho) e as trocas entre falas por J-cut e ponte de B-roll agradaram.
- CULTSP 02 (nota da V1): faltava título na 1ª cena e GC no rosto; B-roll demais sobre a entrevistada e o professor;
  incluir todas as vozes e equilibrar entrevista × aula.
- Regras universais: sem pisca de rosto entre B-roll e troca de cena; sem pisca preto de milésimos.
- Nome em GC só quando a própria pessoa diz; senão, pela função.
- Histórico detalhado de cada projeto: `guia-edicao.md` › CALIBRACAO.
