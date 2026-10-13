# Mãos da Kani — a Kani operando os apps ao vivo

Trilho PARALELO ao do Claude: a Kani (Qwen3.5 4B) só preenche uma FICHA curta em JSON travado; o código monta a peça na
tela com a API pública (KNV.cena / arteFinal). Nada das ferramentas do Claude (esqueleto.py, knv.py, revisor) foi mudado:
elas só são lidas.

## Peças
- `Functions/kani_maos.py` — ficha (`ficha_flyer`), travas (`conferir_nomes`: nome trocado e acento perdido voltam;
  número que não está no pedido sai; "a definir" sai), composição de flyer (`flyer_html`: topo / recorte / tipo) e a
  ida e volta com a tela (`pedir` → `kaniMaos(...)` no front → `kani_maos_resposta`).
- `frontend/js/kani-maos.js` — abre o Photo, instala fontes, `KNV.cena` num documento NOVO (não toca no que está
  aberto), arte-final do estilo, salva o .iknv e devolve a prévia.
- `Functions/kani_agente.py` — ferramenta `montar_flyer`; pedido de flyer/cartaz/panfleto vai direto para ela (o 4B
  insistia em escrever/gerar antes), não remonta e entrega sempre prévia + .iknv.
- Arquivos em `modelos_ia/kani/criacoes/flyer_*.png|.iknv`.

## Composição do flyer (feedback do Pailer 2026-10-13)
Texto nunca em cima da pessoa, título com peso, cada informação na sua camada (chips, preço grande + "por pessoa"
pequeno, botão). `topo` = foto no alto + painel (cenas: palco, mesa, ambiente — `_CENA`); `recorte` = pessoa/objeto
único recortado à direita (`data-inteiro`); `tipo` = só tipografia.

## Medições
- Ficha: 10 pedidos, 9/10 certos, ~7 s cada (`D:/kanivete_testes/scripts/teste_kani_flyer.py`).
- Ponta a ponta: 76–130 s (a maior parte é gerar a foto).

## Teste
`py -3.13 testes/teste_kani_maos.py ["pedido"]` (porta 9338; fecha a árvore do app no fim — WebView2 órfão de app de
teste morto à força impede o próximo de carregar a página).

## Próximos
Mais composições (story, quadrado), foto anexada pela pessoa (testar), outras mãos: Vetor (cartão, logo simples) e
Editor (montar vídeo curto por ficha).
