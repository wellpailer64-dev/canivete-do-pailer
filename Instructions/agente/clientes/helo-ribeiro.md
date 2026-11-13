# Helo Ribeiro (Helo Ribeiro by Odara) — corretora de imóveis

Aplicar junto de `Instructions/agente/metodo-edicao-video.md`; os valores abaixo são do projeto modelo e valem como ponto de partida, sujeitos ao pedido e ao material atual.

Conteúdo: tour de imóvel de médio/alto padrão em SP (Brooklin, Morumbi...). Ela aparece no imóvel apresentando metragem, bairro, ambientes e lazer, e fecha com uma frase de convite/emoção ("comprar sem medo de ser feliz").
Pasta: `01 - PANDA LAB/01 - CLIENTES/HELO RIBEIRO`. Peças novas: `02 - PRODUCOES/<ano>/<mm> - <MÊS>/` (método de pastas). Assets fixos em `01 - BRANDBOOK/`.

## Identidade visual (brandbook)
- Cores (SVG do brandbook): verde `#3C5943`, dourado `#D8B164`, creme `#F6EFE2`, quase-preto `#191E19`. No vídeo o verde usado é `#385641` (mesma família; pode manter).
- Logo: selo circular "Helo Ribeiro" com folha + flecha, "by Odara" embaixo. Versões em `BRANDBOOK HELO RIBEIRO-01..21.png/.svg`: `-02` creme (sobre vídeo), `-01` verde, `-09/-11` dourado, `-08/-10/-12` com fundo.
- Sobriedade e elegância: nada de cores fora da paleta, nada de contorno preto, nada de efeito chamativo.

## Reels: modelo aprovado
Projeto modelo: `02 - PRODUCOES/01 - REELS/02 - 4 MILHÕES/Portugal.vknv` (out/2026), 3 versões do mesmo imóvel: V1 MAIOR 114 s, V3 MÉDIA 78 s (a mais recente), V2 MENOR 39 s (só lazer; nota 9/10 do Pailer). 1080×1920, 30 qps.
- Abertura: começa com ela falando (V1/V2) ou com 2 takes do prédio/ambiente (fachada com zoom lento 100→108 %, dissolve 0,5 s) e ela entra em ~5 s (V3).
- GC `01 - BRANDBOOK/GC HELO RIBEIRO.mov` (pílula verde "CORRETORA HELO RIBEIRO", texto creme espaçado), efeito Luma Key (lim 8, suave 12), na primeira aparição dela, 7,2 s, com `swish_01` do Soundboard.
- Logo `BRANDBOOK-02` creme: sc 8,9, x 944, y 135, Rotação constante (vel 0,05), sobre um pincel verde `#385641` (tam 862 em 1074,−82; apoio de leitura no canto). Ambos do início ao fim da fala; entram e saem com dissolve 0,45 s; somem na assinatura.
- Fala (V1): cortes secos tirando pausas, ~3–4,5 s por corte, sem transição. Voz +2/+3 dB (ajustar por tomada; usar lapela sincronizada quando houver).
- Apoio (V2): takes do ambiente que ela cita, tela cheia, só imagem, 1,3–4 s (fechamento até ~7 s). Cerca de 1 em 3 com transição rápida 0,45 s (push, chicote ou pop, direção do movimento); os demais corte seco.
- Logo do empreendimento (quando houver): branco com Luma Key sobre take de vista/fachada perto do fim (V3: sc 70, y 600, 2,1 s, dissolve).
- Cor: camada de ajuste no topo, Luz e Cor: exp 0,05, ct 15, hi −17, sh 9, bl 11, sharp 18, vib 13, vig 16, ls −11, lh 7, roda h [−0,009, −0,063].
- Legenda: SF Pro Display negrito branca, tam 2,6 (~50 px), embaixo, sem caixa, sombra preta 100 % (dist 6, blur 8), entrada pop, py 8, ~2 linhas de ~18 caracteres; destaque da palavra falada em caixa `#385641` (raio 30) com texto branco.
- Finalização: `01 - BRANDBOOK/ASSINATURA HELO RIBEIRO ALPHA 0001.mov` (fundo verde, selo creme, faixa dourada), ~9,6 s, com `whoosh_transicao_03` na entrada.
- Trilha: Bon Voyage (Ryan James Carr, Epidemic) −17 dB sob a fala; segundo trecho −2/−4 dB na assinatura, fade de entrada 1,6–4 s e saída 1–2,3 s.
- Ordem das camadas (de baixo para cima): fala, apoio, GC/assinatura, logo do empreendimento, pincel, logo, ajuste de cor. Conferir no projeto modelo antes de copiar índices.

## Legenda e nomes
Microfone do celular erra nomes: Elon→Helo, Brooklyn→Brooklin, lisão→Lisonda (já no dicionário). Conferir nomes de empreendimentos e ruas.

## Dados confirmados pela cliente (WhatsApp, 13/11/2026)
- Preço: **R$ 1.830.000** (ela confirmou; a lapela 01 que fala 1,86 mi não vale).
- Dan: confirmado como o rapaz que está com ela.
- Parceria: o vídeo é com a Imobiliária Home Vision, que paga os leads; se vender, a divisão é 50×50.

## Peças feitas
- 11/2026 CASA MORUMBI (3 reels no mesmo projeto: A visita com o Dan, B Helo apresenta com narração da lapela 04 sobre a 3555, C preço): `reel_fala.py` com `"identidade"` (valores da V1 do Portugal) e lapela vinculada. Roteiro `D:/kanivete_testes/casamorumbi/roteiro.json`. Preço certo falado só na câmera da 3545 (84-88 s).

## Captação
Lapela só nas tomadas com fala; as de ambiente não têm lapela (não é erro). Sincronizar com `tools/agente/sincronizar_lapela.py`.

## Origem
Timeline `Portugal.vknv` (V1/V2/V3) e renders `V1 MAIOR_2.mp4`, `V2 MENOR.mp4`, `V3 MÉDIA.mp4`, lidos em 13/11/2026; brandbook SVG; memória `estilo-edicao-reels`.
