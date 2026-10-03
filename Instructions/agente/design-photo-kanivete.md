# Fazer arte no Photo Kanivete pela API (guia para IAs)

Objetivo: montar peças (flyers, posts, capas) no editor de imagem como um designer faria no Photoshop, gastando
pouco: números em vez de prints, etapas salvas em vez de recomeçar, ferramentas certas em vez de força bruta.
Primeiro caso: flyer "Baile da Bonita" (`D:\kanivete_testes\flyer\`, referência `referencia.png`, receitas `f1..f6`).

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
- Colocar e transformar: `colocar(path,{nome,x,y,largura,angulo,acima})`, `transformar({x,y,largura,angulo,espelhar})`
  (canto do conteúdo), `girar(ang,{escala,centro})` / `escalar(k)` (em volta do centro; texto continua editável),
  `mover(dx,dy)`, `alinhar({a,h,v,dentro,folga})` (à página ou a outra camada; `dentro:false` encosta por fora),
  `moverPara(ref)` (ordem na pilha), `modo(bm,op)`, `duplicar(nome)`, `objetoInteligente()`.
- Recorte: `borrachaMagica([[x,y],...],{tol,contiguo,suave})` para fundo liso (instantâneo; `contiguo:false` pega os vãos),
  `removerFundo({aplicar})` (IA BiRefNet, ~30 s na 1ª vez, depois cache), `selecionar`, `selecionarPoligono`.
- Pintura: `pincel(traços,{tam,dureza,cor,opac,borracha,alvo:'mascara'})` — aceita VÁRIOS traços: um passo no histórico;
  `formas.*` (devolvem listas de traços): `linha, tracejado, zigue, onda, circulo, espiral, coracao({listras}), estrela,
  ramo, folha`; `degrade(de,ate,c1,c2,tipo,opac)`, `preencher(cor|'padrao')`, `definirPadrao(nome)`.
- `lote(fn, nome)`: tudo dentro vira UM passo do histórico (como uma Ação). Use em sequências de pintura.
- Menus com valores: `cmd('aj:matiz', {...})`, `cmd('f:respingos', {...})` — os nomes de `IE_CMDS`/`IE_AJUSTES`/`IE_FILTROS`.
  Cuidado com o sentido dos campos (no Níveis, `i1` é o PONTO BRANCO de entrada; `i1:0` estoura tudo).
- Texto: `texto(t,{x,y,fonte,estilo,tam,cor,alin,esp,caixa,nome,acima})` (y = topo). Efeitos: `efeito(tipo,valores,{somar})`.

## Técnicas (o que o usuário espera de um designer)
- Nada de **corte seco**: limite de foto (ombro, braço, cabeça, barriga, borda reta do quadro de uma folha) fica escondido
  atrás de elementos — textura rasgada, folhas, texto. Escolha recursos com o assunto inteiro no quadro. `revisar()` acha.
- Fundo liso → Borracha mágica (não IA). Fundo complexo → IA. Também valem Varinha e Pena.
- Mesma imagem 2× → recorte uma vez, `objetoInteligente()`, `duplicar()` e transforme a cópia (espelhar, girar) sem perda.
- Cor de foto para a paleta: Matiz/Saturação "colorir" (matiz −180..180) + Níveis; fundo = cor sólida + textura
  dessaturada em MULTIPLY; vinhetas com degradê radial em MULTIPLY.
- Título de cartaz: palavras em camadas separadas em escada, giradas juntas (`girar(ang,{centro})` com o centro comum),
  sombra suave + traçado fino; rabiscos brancos à mão (formas + pincel 4–5 px) preenchem os vazios.
- Material: Pexels por id (`baixar.py`), fontes do Google Fonts em `D:\kanivete_testes\flyer\fontes` registradas por usuário.
