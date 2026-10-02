# Editor de Imagem (estilo Photoshop)

Categoria Imagem → **Editor de Imagem**. Abre PSD/PSB com as camadas, fotos (PNG, JPG, WebP, TIFF...) ou documento novo.

## Arquivos
- `frontend/js/imagem-nucleo.js` — modelo (documento, camadas, máscaras), histórico (copy-on-write), composição
  (modos de mesclagem do Photoshop, grupos com passagem, máscara de corte, máscaras, efeitos, camadas de ajuste), vista.
- `frontend/js/imagem-ajustes.js` — matemática dos ajustes (camadas de ajuste do PSD e menu Imagem > Ajustes) e filtros.
- `frontend/js/imagem-ferramentas.js` — ferramentas (Mover, Letreiro, Laço, Varinha, Corte, Conta-gotas, Carimbo,
  Pincel, Borracha, Degradê, Balde, Forma, Mão, Zoom) e Transformação livre (Ctrl+T).
- `frontend/js/imagem-texto.js` — camada de texto (edição na tela) e texto do PSD editável.
- `frontend/js/imagem-paineis.js` — menus, barra de opções, painéis Camadas/Propriedades/Histórico, cor, atalhos.
- `frontend/js/imagem-arquivo.js` — abrir, salvar, exportar, comandos dos menus, área de transferência.
- `frontend/css/imagem.css`, `Functions/editor_imagem.py`, `main.py` (métodos `ie_*`), `Functions/media_server.py`
  (servir bytes da memória e receber POST).

## Abrir e salvar
- As camadas vêm do Python como PNG **servido da memória** (nada em disco); a página libera com `ie_liberar`.
- Salvar é de ida e volta: o Python relê o PSD de origem e troca só o que mudou. Camada não pintada fica como estava
  (texto, objeto inteligente, forma, efeitos e ajustes continuam editáveis no Photoshop). Mover/transformar texto,
  objeto inteligente e forma atualiza a matriz/caminhos (não rasteriza). Texto editado continua texto (conteúdo e
  estilo do começo: fonte, tamanho, cor, espaçamento, entrelinha, alinhamento). Pintar troca só os pixels.
- Camada nova (inclusive texto criado no editor) vai como camada de pixels. Documento que não veio de PSD RGB é montado do zero.
- A composição feita pela página vira a imagem achatada do arquivo.

## Limitações conhecidas (MVP)
- Efeitos de camada desenhados: Sombra projetada, Brilho externo, Traçado, Sobreposição de cor (os outros ficam no
  arquivo, sem aparecer). Não se editam os parâmetros dos efeitos nem das camadas de ajuste (só mostrar/manter).
- Ajustes sem desenho: Pesquisa de cores (LUT). Cor seletiva, Equilíbrio de cores, Vibratilidade e Filtro de fotos são aproximados.
- Não há criação de camada de ajuste nova, estilos de camada novos, máscara vetorial, pincel de recuperação.
- Texto com estilos misturados vira um estilo só quando editado.
- Fidelidade medida contra o achatado do Photoshop nos 43 PSDs do portfólio: média < 1/255 na maioria, pior caso ~4/255.

## Teste
`python testes/teste_imagem.py` (abre o app em `--agente=9333`; `--psd <arquivo>` para um PSD real): mover, pincel,
seleção+apagar, máscara, Ctrl+T, texto, desfazer/refazer, balde, degradê, varinha, laço, forma, carimbo, filtros,
mesclar, agrupar, tamanho/girar/cortar, salvar e conferir com o psd-tools, reabrir. Sai com 1 se falhar.
No console: `ieDiferencaAchatado()` mede a diferença do documento aberto contra o achatado do arquivo.
