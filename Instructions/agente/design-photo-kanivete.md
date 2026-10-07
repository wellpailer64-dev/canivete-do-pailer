# Fazer arte no Photo Kanivete pela API (guia para IAs)

Objetivo: montar peças (flyers, posts, capas) no editor de imagem como um designer faria no Photoshop, gastando
pouco: números em vez de prints, etapas salvas em vez de recomeçar, ferramentas certas em vez de força bruta.
Primeiro caso: flyer "Baile da Bonita" (`D:\kanivete_testes\flyer\`, referência `referencia.png`, receitas `f1..f6`).

**Peças de diagramação (carrossel, feed, story, post): comece por `KNV.cena` (HTML/CSS → camadas) — guia em
`Instructions/agente/plano-cena.md`. A API abaixo fica para foto, pintura, recorte e retoques depois da cena.**

## Fluxo
1. App de teste visível (o usuário gosta de assistir): `APPDATA=D:\kanivete_testes\appdata LOCALAPPDATA=D:\kanivete_testes\localappdata
   TEMP=D:\kanivete_testes\tmp TMP=D:\kanivete_testes\tmp py -3.13 main.py --agente=9333` (Python 3.13 tem as dependências).
   Só UM app na 9333; abrir um segundo confunde o CDP.
2. Receita = JS curto com chamadas `KNV.*`, uma por etapa (base, plantas, jeans, textos, rabiscos, ajustes...).
3. `py -3.13 D:\kanivete_testes\flyer\rodar.py fN.js --de etapas/eN-1.iknv --salvar etapas/eN.iknv [--mapa] [--ignorar "Camada"]`
   - recarrega os `imagem-*.js` do disco (funções e tabelas `IE_*`): mudou o código do editor → NÃO precisa reiniciar o app
     (só mudanças em `main.py`/Python ou em estado inicial de `IE` pedem reinício);
   - `--limite` (120 s): passou disso interrompe o JS (Runtime.terminateExecution) em vez de travar o app;
   - imprime tempos por `passo('nome')`, a grade 6×8 de diferenças com a referência (cor Lab + contraste),
     `KNV.revisar()` e, com `--mapa`, `KNV.mapa()`; grava `prints/resultado.png` e `prints/_comp.jpg` (lado a lado).
   - `rodar.py -` (receita vazia) só abre a etapa e confere.
4. Nunca refazer do zero: abrir a última etapa salva e continuar. Recortes por IA ficam em cache
   (`%LOCALAPPDATA%\CaniveteDoPailer\cache_recorte`), então refazer uma etapa com IA é instantâneo.
5. Print só para julgar estética; posição, tamanho, cobertura e cortes se conferem por `KNV.mapa()`/`KNV.revisar()`.

Armadilhas: na página existe a `const KNV` original; depois da recarga use `window.KNV` fora da receita (dentro dela o
`rodar.py` já faz `const KNV = window.KNV`). Laço com passo 0 trava a página (as `KNV.formas` já se protegem).

## API (frontend/js/imagem-api.js) — camadas por nome ou id, coordenadas do documento
- Documento: `novo(nome,w,h,fundo)`, `abrir(path)`, `salvar(path)`, `fecharTudo()`, `doc()`.
- Ver sem print: `mapa({grade,mudancas})` — uma linha por camada (caixa, centro, rot°, escala, espelhado, op, modo,
  máscara/clip, vis% = quanto dela aparece, cor média) + grade de quem aparece em cada região; `mudancas: true` = só o
  que mudou desde o último mapa. `caixa(nome)` = caixa do conteúdo visível. `camadas()`, `info()`, `cor(x,y,w,h)`.
- Revisar: `revisar({ignorar, margem, minimo})` — corte seco visível (borda reta e dura com a foto de um lado e o vazio
  do outro, não coberta por nada acima), texto perto da borda, fora da página, vazia. Passe em `ignorar` o que é reto de
  propósito (retângulos da composição). Ainda dá falso positivo em pétala/folha muito reta: confira no print.
  Também: margem de segurança (padrão 5% do lado menor) para textos e `elementos`; texto atropelando texto (a menos de
  `respiro` px; `juntos` = pares encaixados de propósito; `colidem` = camadas de traço que contam como texto, ex.
  'Rabiscos'); `protegidas: [{nome, caixa:[x,y,w,h], de:'Mulher'}]` = nada acima de `de` cobrindo o rosto. O `rodar.py`
  lê essas opções de `revisao.json` na pasta da arte.
- Colocar e transformar: `colocar(path,{nome,x,y,largura,angulo,acima})`, `transformar({x,y,largura,angulo,espelhar})`
  — `colocar` cria OBJETO INTELIGENTE (como o Photoshop, desde 2026-10-07): transformar/girar sem perda, filtro vira
  filtro inteligente e vai para o PSD como objeto inteligente. Pintar/preencher direto nele pede "Rasterizar a camada?"
  (com a automação ligada vira erro): pinte numa camada nova acima, ou `ieCmd('rasterizar')` antes.
- Trocar nome/preço/data numa base: `substituirTexto('Julho', 'Agosto', {palavra: true})` (todas as camadas de texto,
  inclusive as do PSD — continuam texto no Photoshop). Filtro forte demais: `atenuar(40)` logo depois.
  Foto dentro de uma área: `selecionar(...)` + `colarDentro()` (máscara da seleção, corrente solta).
  Tirar objeto/pessoa/fio/logo da foto: selecionar + `preencherConteudo()` (LaMa local; camada nova por padrão).
  Trocar o céu: `substituirCeu({ceu: 'por'})` (IA) ou `{ceu: 'arquivo', caminho}` — grupo editável com céu + luz.
  Foto horizontal para story/feed: `expansaoGenerativa({formato: 'story'})` (a IA completa o que falta, ~40 s).
  Pôr um objeto na foto: selecionar a área + `preenchimentoGenerativo('a red hot air balloon')` (prompt em inglês);
  não gostou: `variacaoGenerativa()`. Pele/espinha: `preenchimentoGenerativo('')` (LaMa). Continuar corpo: expansão sem texto.
- Fundo/faixa de cor: `preenchimento(cor, {nome})` ou `preenchimentoDegrade(['#a', '#b'], {estilo, ang, nome})` (camada de
  preenchimento; com seleção ativa vira máscara) em vez de
  pintar/preencher pixels — fica editável no Photoshop.
  (canto do conteúdo), `girar(ang,{escala,centro})` / `escalar(k)` (em volta do centro; texto continua editável),
  `mover(dx,dy)`, `alinhar({a,h,v,dentro,folga})` (à página ou a outra camada; `dentro:false` encosta por fora),
  `moverPara(ref)` (ordem na pilha), `modo(bm,op)`, `duplicar(nome)`, `objetoInteligente()`.
- Diagramar: `alinhar({grupo:[nomes], h, v, folga})` move o bloco inteiro (ex.: título em 3 camadas, data+horário);
  `caixaGrupo(nomes)` (caixa + cx/cy, para `girar(a,{centro})` do bloco); `encostar(em,{lado,respiro})` aproxima a
  ativa das camadas `em` pelo CONTORNO dos pixels (encaixe de palavras em script: Bonita base → "da" encosta nela →
  "Baile" encosta nas duas), sem atropelar.
- **Gerar com IA** (melhor que caçar foto no navegador): `gerar(prompt,{largura,altura,semente,recortar,ref,nome,acima,
  x,y,larguraNoDoc,angulo})` — FLUX.2 klein (~20 s por 1024² na RTX 3050, 12 s em 768). Prompt em inglês, descrevendo o
  ASSUNTO INTEIRO (`fundo:true` já acrescenta fundo branco liso + assunto inteiro no quadro). `recortar:true` = Borracha
  mágica nos cantos + vãos (sobra sombra cinza em vão pequeno: retoque ou `recortar:'ia'`). `ref` (camada | 'doc' |
  caminho) edita a partir dela — descreva a MUDANÇA ("make it golden, keep the exact shape"); vai sobre branco.
  FIXE a `semente` nas receitas: mesmo pedido = mesma imagem, do cache (instantâneo ao refazer a etapa).
  Sem o gerador instalado, a 1ª chamada pede para baixar ~7 GB (em automação: responda 'Baixar a…' ou instale antes).
- Recorte: `borrachaMagica([[x,y],...],{tol,contiguo,suave})` para fundo liso (instantâneo; `contiguo:false` pega os vãos),
  `removerFundo({aplicar})` (IA BiRefNet, ~30 s na 1ª vez, depois cache), `selecionar`, `selecionarPoligono`.
- Pintura: `pincel(traços,{tam,dureza,cor,opac,borracha,alvo:'mascara'})` — aceita VÁRIOS traços: um passo no histórico;
  `formas.*` (devolvem listas de traços): `linha, tracejado, zigue, onda, circulo, espiral, coracao({listras}), estrela,
  ramo({pares,curva,angulo}) (laurel: dois ramos saindo do meio, pares:true), folha`; `degrade(de,ate,c1,c2,tipo,opac)`, `preencher(cor|'padrao')`, `definirPadrao(nome)`.
- `lote(fn, nome)`: tudo dentro vira UM passo do histórico (como uma Ação). Use em sequências de pintura.
- Menus com valores: `cmd('aj:matiz', {...})`, `cmd('f:respingos', {...})` — os nomes de `IE_CMDS`/`IE_AJUSTES`/`IE_FILTROS`.
  Cuidado com o sentido dos campos (no Níveis, `i1` é o PONTO BRANCO de entrada; `i1:0` estoura tudo).
- Texto: `texto(t,{x,y,fonte,estilo,tam,cor,alin,esp,caixa,nome,acima})` (y = topo). Efeitos: `efeito(tipo,valores,{somar})`.
- Diálogos (janela esperando clique = receita travada): `automacao(true,{respostas,padrao})` — nenhuma janela abre;
  confirmação ("Rasterizar a camada?", "Salvar as alterações?") responde por `respostas` ({título ou pedaço: rótulo do
  botão | 'primario' | 'cancelar'}); sem resposta, `padrao:'erro'` faz a promessa falhar NA HORA com título e botões.
  Janela de valores fora do `cmd` = OK com o padrão. Histórico em `KNV.dialogos`. De fora: `dialogo()` (tem janela
  aberta?) e `responder(rotulo|índice|'cancelar')`. O `rodar.py` liga a automação, cancela janela pendente antes de
  começar e, no limite de tempo, diz em qual diálogo travou. Diálogo nativo de arquivo não passa aqui: use caminhos.

## Técnicas (o que o usuário espera de um designer)
- Nada de **corte seco**: limite de foto (ombro, braço, cabeça, barriga, borda reta do quadro de uma folha) fica escondido
  atrás de elementos — textura rasgada, folhas, texto. Escolha recursos com o assunto inteiro no quadro. `revisar()` acha.
- **Diagramação** (o usuário cobra): margem de segurança respeitada em tudo (5%); título em BLOCO centrado e com
  hierarquia (palavra-chave maior, conectivo "da" pequeno encaixado na ordem de leitura); nenhuma palavra encostando
  noutra; infos em pilha a partir da margem de baixo com respiro constante; data+horário como um bloco no canto.
  Folhas/flores nunca na frente do rosto; inclinadas para FORA, nascendo atrás de outro elemento (caule escondido).
- Fundo liso → Borracha mágica (não IA). Fundo complexo → IA. Também valem Varinha e Pena.
- Mesma imagem 2× → recorte uma vez, `objetoInteligente()`, `duplicar()` e transforme a cópia (espelhar, girar) sem perda.
- Cor de foto para a paleta: Matiz/Saturação "colorir" (matiz −180..180) + Níveis; fundo = cor sólida + textura
  dessaturada em MULTIPLY; vinhetas com degradê radial em MULTIPLY.
- Título de cartaz: palavras em camadas separadas em escada, giradas juntas (`girar(ang,{centro})` com o centro comum),
  sombra suave + traçado fino; rabiscos brancos à mão (formas + pincel 4–5 px) preenchem os vazios.
- Material: Pexels por id (`baixar.py`), fontes do Google Fonts em `D:\kanivete_testes\flyer\fontes` registradas por usuário.
- **Checklist de acabamento (feedback do designer, flyer Gospel `D:\kanivete_testes\gospel\e1..e3`)**:
  leitura de texto sobre foto = pincel dureza 0 na cor mais escura da paleta numa camada embaixo (op ~85%) ou caixa/sombra;
  máscara de camada + pincel macio preto da cintura para baixo em toda pessoa recortada; margem lateral generosa no
  rodapé (~100 px em 1080); luz de trás (pincel claro em Divisão) + luz da FRENTE vazando pelas brechas entre os corpos
  (Divisão, traços verticais macios); acabamento no topo: **camada de ajuste Camera Raw** no alto da pilha
  (`KNV.ajuste('cameraRaw', {clar: 25, tex: 15, vib: 15, vig: -20, grao: 12, temp: 5})` — muda tudo embaixo ao vivo e
  continua editável; chaves = as do Filtro Camera Raw: exp, ct, hi, sh, wh, bl, temp, tint, tex, clar, nevoa, vib, sat,
  nitQ, ruidoL, ruidoC, grao, vig, curva, hsl {r: [matiz, sat, lum]}, rodas {s|m|h|o: [x, y]}, rl {s|m|h|o: lum}),
  ou o jeito antigo: Carimbar visíveis → objeto inteligente → filtros inteligentes + camadas de ajuste
  (`KNV.ajuste('brilho'|'vibratilidade'|'filtroFoto', {...})`); textura em Multiplicação ~20%.
- Objeto inteligente: `<img>` da cena já entra como objeto inteligente; `KNV.cmd('f:...'|'aj:...')` nele vira filtro
  inteligente (lista embaixo da camada, olho, duplo clique edita). Fontes: `KNV.instalarFonte('Nome do Google Fonts')`.

## Técnicas aprendidas — carrossel 3D "Design que vende" (2026-10-03)
Peça: `D:\kanivete_testes\carrossel3d\` (carrossel.html + .iknv + export/). Reproduzir uma referência, passo a passo:
1. **Medir a referência**: escala = 1080 / largura de um slide na imagem de referência (ex.: 633 px → ×1,705). Anotar
   x/y/tamanho de cada bloco na referência e converter; títulos pelo tamanho da caixa (largura do texto), não pelo olho.
2. **Fonte de display parecida**: instalar candidatas do Google (`KNV.instalarFonte`) e montar uma folha de amostras
   com as palavras da peça (`amostras.html`); escolher pelo print. Caixa-única com minúsculas trocadas no meio
   ("MaIS", "INSTaGRaM", "FaVOR") = Chewy + Lexend no corpo.
3. **Objetos 3D (FLUX)**: folha de contato com 3 sementes por objeto (`gerar:...` em `<img>` 330×330), prompt
   "glossy ... 3D render, soft studio lighting, entire object fully visible, centered, isolated on pure white
   background, product shot". Escolher a FORMA; a cor se corrige depois (pôr a cor no prompt escureceu demais).
   - Recorte: **`data-recortar="ia"`** para objeto gerado (a Borracha deixa a sombra de chão do gerador).
   - A proporção da caixa do `<img>` decide o tamanho gerado: caixa retrato gera OUTRA imagem. Use caixa quadrada
     (com object-fit: contain) para reaproveitar o cache da folha de contato.
   - Cor: o verde do FLUX sai saturado no máximo (176,249,0). Corrigir com **filtros inteligentes no próprio objeto**
     (`KNV.ativar(peça); KNV.cmd('aj:matiz', {h: 34, s: -52, l: -4}); KNV.cmd('aj:brilho', {br: -4, ct: 35})`):
     painel limpo e a cor anda junto ao mover/duplicar. Camada de ajuste presa (corte) só se um ajuste vale para várias.
   - Antes de aplicar, comparar 3 variações lado a lado num recorte (`D:\kanivete_testes\scripts\cor_teste.py`:
     muda os valores, `ieCompor`, copia a área para um canvas e salva JPEG).
4. **Elementos que atravessam a emenda** (peão entre slides, faixa verde contínua): soltos na tira, fora das
   `<section>`, `position:absolute` com `left` em px da tira, `data-livre`. Faixa = `<svg>` com `<path>` de stroke grosso.
5. **SVG**: `var(--cor)` NÃO funciona em atributo (`stroke=`/`fill=`): use a cor direta (ou `style="stroke:var(...)"`).
6. **Brilho atrás de objeto**: div com `radial-gradient` (verde .55 → transparente) atrás da peça.
7. **Acabamento**: camada de ajuste Camera Raw no topo (`KNV.ajuste('cameraRaw', {clar: 12, tex: 8, grao: 14, graoT: 20,
   ct: 6, vib: 6})`).
8. **Iterar**: editar o HTML e rodar com `--de peca.iknv --salvar peca.iknv`; scripts de foto em `--depois x.js`
   (rodam uma vez — não deixe no comando seguinte, senão duplica). Rodar a cena de novo leva os filtros inteligentes
   das peças para a camada refeita. `--exportar pasta` cria a pasta. Conferir em tamanho real (export/*.png), não só
   a prévia: botões encostados e ícones sumidos só aparecem lá.
9. **Carrossel sempre com guias e fatias à mostra** (método do Photoshop, pedido do usuário): `KNV.layoutGuias({colunas:
   {n: <páginas>, medianiz: 0}})` → `KNV.fatiasDasGuias()` → `IE.verGuias = true; doc.verFatias = true`. A cena já põe e
   mostra nas emendas (sem duplicar as do layout). Exportar pelas fatias (`--exportar`).
10. **Textura de fundo** (tecido): camada cinza 50% acima do fundo de cada slide escuro + Galeria de filtros >
   Texturizador (tela, escala 150, relevo 32) + Adicionar ruído 14% mono, em Sobrepor 85%. Em fundo branco o Sobrepor
   não aparece (ok: slide claro fica limpo). Mais grão/textura no Camera Raw de acabamento (grao 30, graoT 30, graoA 60,
   tex 18).
11. **Ferramentas novas que encurtam tudo isto** (plano-cena.md, "Fluxo barato"): `data-cor` no lugar do ajuste de cor à
   mão, `data-guardar`/`recurso:` para não gerar de novo, `--referencia --comparar` no lugar de medir à mão, `--ver
   slide:N` e `--variacoes` no lugar de prévias grandes, `KNV.etapa` para receitas que podem rodar de novo.

## Carrossel "Valer" (corrida, 2026-10-03) — ~46 mil tokens (o 3D custou ~146 mil)
Modelo de estudo: `D:\kanivete_biblioteca\modelos\carrossel-valer-corrida`. O que funcionou e as armadilhas:
- Fluxo: `--amostras` (fontes) → HTML medido da referência (×2,7; 400×534 → 1080×1440) → `--referencia --comparar`
  (3 rodadas) → `--ver` só no detalhe → `KNV.etapa` para o acabamento → `--exportar`. Sem prévia grande nenhuma vez.
- Pessoa do FLUX atravessando a emenda: `data-proporcao="3:4"`, `object-fit: cover`, `object-position: 50% 0%`; luz
  lateral = div com degradês escuros por cima da foto (atrás dos textos). Elementos soltos ANTES das sections no HTML
  para ficarem atrás dos textos.
- Título gasto: camada de manchas na cor do fundo (ruído fino + largo, limiar) presa ao GRUPO do título (corte).
- Armadilha: fundo num `<span>` (palavra destacada) ocupa a altura da linha e cobre a cedilha/acento da linha de
  cima — faça a caixa como div separada atrás do texto, no tamanho medido.
- Confira a proporção largura/altura das letras na referência para escolher a fonte (Passion One 400, não Archivo).
- Instalar fonte: se o GitHub der limite, `Functions/fontes.py` cai na API de CSS do Google Fonts (TTF por peso).
- Pendente: `<g transform>` dentro de `<svg>` parece não ser aplicado pela cena (manchas não se moveram) — investigar.

## Flyer "Prime Fest" (2026-10-03) — primeiro com o Worker: ~30 mil tokens do Claude
Modelo de estudo: `D:\kanivete_biblioteca\modelos\flyer-prime-fest`; peça em `D:\kanivete_testes\flyer_prime`.
- Divisão: Claude = medir a referência (≈400×500 → 1080×1350, ×2,7), HTML da cena, prompts e escolha das sementes;
  Worker (Qwen3 8B) = finalização por contrato (degradê do título, sombras dos adesivos, acabamento, exportar):
  1 contrato, 7 operações, 0 erros, 28 s.
- Imagens: folhas de contato em segundo plano (`--gerar ... --inteiro`) enquanto escreve o HTML; no HTML use os
  MESMOS prompt, `data-proporcao`, `data-lado` e `data-inteiro` da folha, senão é outra imagem (cache por tudo isso).
  Fundo (muro grafitado) e papel rasgado também gerados (`data-recortar="nao"` no fundo).
- Puxar o fundo para uma cor: div com degradê radial em `mix-blend-mode: multiply` por cima do fundo gerado.
- Título com contorno grosso (`-webkit-text-stroke`) + `text-shadow` duro (deslocamento sem desfoque) = cara de
  letreiro; degradê de cor fica para o Worker (`degrade`, efeito Sobreposição de degradê).
- Armadilhas: o Qwen3 do Worker ocupa a placa e o FLUX não gera (o runner agora descarrega o Ollama); camada de texto
  com efeito pode ficar "mexida" para a cena — use `--refazer` ao mudar o tamanho do título.
- Contra a referência: estrutura igual; faltou a energia do original (rabiscos pretos sobre o painel, adesivos maiores,
  grading mais laranja) — próximo passo seria um 2º contrato de ajustes.
- Feedback do usuário (faltou): máscara em degradê na base das pessoas, motion blur leve nos objetos, luzes de pincel em
  Divisão com cor clara onde a luz bate, tratamento individual de cada foto (textura/ambiente) e profundidade (luz,
  sombra, desfoque). Virou receita + ferramenta do Worker: `KNV.receita.mascaraDegrade(nome,{lado,inicio})` (usa o
  contorno real dos pixels), `rastro(nome,{angulo,distancia})` (cópias para trás + desfoque de movimento, camada
  "· rastro" embaixo), `luz([[x,y,raio]],{cor,intensidade,acima})`, `tratarFoto(nome,{ambiente})`,
  `profundidade(nome,raio)`. Contrato de exemplo: `D:\kanivete_testeslyer_prime\contrato_acab.json` (export2/).
  **Checklist padrão de toda peça com pessoa/objeto** — mande no contrato de finalização.

## Carrossel "6 meses de gestão" (vereador, 3 slides, 2026-10-03) — ~44 mil tokens do Claude
Peça: `D:\kanivete_testes\carrossel_vereador\` (carrossel.html, depois.js, contrato_acab.json, export/).
- Referência 738×327 → 3 × 1080×1440 (×4,39): medir em recortes 3× por slide e converter (×1,4634).
- Avatar redondo: `<img data-corte>` dentro do círculo (máscara de corte); foto pequena o bastante para caber cabeça +
  ombros (cabeça ≈ 55% do círculo, queixo dentro). A mesma geração (prompt/semente) serve de avatar.
- Feedback do usuário: braço cortado pela caixa (`object-fit: cover` numa caixa mais estreita que a foto corta as
  laterais — caixa na proporção da foto); sombra de objeto suave (desfoque grande, opacidade ~.22, cor do fundo);
  texto sobre foto pede mancha escura macia por baixo (radial-gradient da cor escura da paleta, ~.85 no centro).
- Texto com `<b>` no meio (www.<b>site</b>) vira trechos com folga estranha: preferir um peso só no rodapé.
- Papel de caderno: `repeating-linear-gradient` no div + textura de papel amassado gerada por cima em multiply ~30%.
- Armadilha do FLUX: "apple emoji style" gera uma MAÇÃ; descreva só a mão ("only the hand and wrist, no face").
- Worker fez o acabamento (tratar_foto, 2 luzes atrás, sombra no emoji, Camera Raw, exportar): 6 operações, 0 erros, 30 s.

## Fluxo barato v2 (2026-10-04): o Junior olha e mede, o Claude decide
1. `py -3.13 tools/medir_ref.py ref.png --slides N --formato retrato --html rascunho.html --textos-ia` → escala, paleta,
   formas grandes (card, papel, painel) e blocos de texto já convertidos (posição, tamanho, entrelinha, cor aproximada;
   textos transcritos pelo olho local). Ler o RESUMO impresso; olhar a referência uma vez só, pequena.
2. Escrever o HTML a partir do rascunho, com o kit (`k-perfil`, `k-post`, `k-check2`, `k-papel`, `k-rodape`...).
3. `knv.py peca.html ... --revisar` → regras dos feedbacks (corte seco em recorte, contraste WCAG atrás das letras,
   sombra dura, rosto no avatar via OpenCV) sem olhar imagem. Corrigir pelo HTML ou deixar para o passo 4.
4. Worker: `finalizar_peca {preset}` + exportar (um contrato de 2 linhas).
5. Opcional: `py -3.13 tools/olho.py comparar --ref ref.png --peca peca.jpg --slides N` (Gemma 4 E4B local, ~4 s por
   slide). É PISTA, não verdade: em referência pequena ele inventa (viu "joinha" onde não tinha). `olho.py ler` (transcrever)
   e `olho.py revisar` são mais confiáveis.
6. Prévia só no fim. Quando uma ferramenta do app não responder, rastrear os eventos antes de tentar de novo.
Recarregar o app de teste sem reabrir: CDP `Network.setCacheDisabled` + `Page.reload {ignoreCache: true}` (o WebView2
guarda os .js em cache; `page.reload()` simples pode manter a versão velha).
