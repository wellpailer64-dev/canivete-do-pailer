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

