# Planos (2026-10-04): economia de tokens, ponte Vetor ↔ Photo, nível "Herbíssimo"

## 1. Economia de tokens — FEITO em 2026-10-05: patch.py, recarregar.py, mapa_codigo.py, VKN.curto, VKN.revisar,
VKN.cena + vk_cena.py + kit/marca.json + modelos de página (capa, assinaturas). Falta: mais modelos de página e o olho
local (Gemma) como 1ª conferência das prévias.
Onde o gasto realmente vai (medido nas rodadas IDV/3D): imagens lidas (prévias, prints), scripts longos escritos à mão
(montar2.py ~330 linhas), retrabalho de edição (heredoc quebrado, assert que não casa), reinício do app a cada mudança em
Python, e leitura de arquivo grande para achar onde mexer.

### Produção de design
1. **Cena declarativa no Vetor** (igual ao `KNV.cena` do Photo): página descrita em HTML/CSS ou JSON curto → objetos.
   Uma página de manual cai de ~40 linhas de comandos para ~10 de marcação. Maior ganho isolado.
2. **Sistema de marca reutilizável**: `marca.json` (cores, fontes, símbolo, assinatura, grid) + `marca.py` genérico
   (símbolo/logotipo/assinaturas como funções). Novo projeto = só o que é autoral.
3. **Modelos de manual**: 16 páginas-modelo parametrizadas pela marca (capa, sumário, cores, tipografia, usos incorretos,
   mockups 3D). Eu só escrevo conceito, símbolo e textos.
4. **Revisor do Vetor (`VKN.revisar`)**: texto fora da página/margem, sobreposição de texto, contraste baixo, texto < 6 pt,
   arte mapeada vazando → lista curta em texto. Só abro imagem quando o revisor passa (hoje vejo toda prévia).
5. **Olho local primeiro**: `tools/olho.py` (Gemma) faz a 1ª conferência das prévias; eu vejo só a folha final, em baixa
   resolução e recortes.
6. **Jr opera**: peças repetitivas (cartões, crachás, variações de cor, exportações) por contrato; eu reviso o resultado.

### Arquitetura da ferramenta
1. **`tools/patch.py`**: aplica trocas de um JSON (âncora → novo) com conferência e relatório de uma linha — acaba com
   heredoc quebrado e edição repetida.
2. **Recarregar sem reiniciar**: `vk_recarregar` no modo agente faz `importlib.reload` dos `Functions/vetor_*.py`
   (hoje cada mudança em Python = matar o app + 30 s + reload).
3. **Mapa do código** (`Instructions/agente/mapa-vetor.md`): arquivo → funções/comandos → linha. O Code Worker atualiza
   por contrato; eu leio o mapa em vez de dar grep/ler arquivos.
4. **Jr roda testes e mastiga log** (já em uso): sempre `codigo.py` com `testes: ["teste:vetor"]`; só leio a linha que falhou.
5. **Saída curta dos comandos**: `VKN.cmd(..., {curto: true})` devolve só id/ok; prints de teste só com falhas.
6. **Registrar custo por tarefa** (memória custo_tokens) para ver se cada medida pagou.

## 2. Ponte Vetor ↔ Photo — vale a pena: SIM
Cada programa cobre o buraco do outro: o Vetor é preciso (vetor, CMYK, faca, PDF/X), mas fraco em pixel; o Photo tem
filtros, Camera Raw, Liquify, galeria de filtros, objetos inteligentes, geração FLUX, máscaras pintadas. Hoje a arte passa
"morta" (PNG). A infraestrutura já existe: vínculos com assinatura (detecta original alterado), objeto inteligente no
Photo, a ponte Photo ↔ Editor como modelo.

### Fases
- **F1 — Vetor → Photo como objeto inteligente vetorial**: "Editar no Photo" leva a seleção (ou a prancheta) como objeto
  inteligente que guarda o `.aknv`; o Photo rasteriza na resolução que precisar (PDF → fitz), então escalar não perde
  qualidade. Filtros inteligentes (grão, meio-tom, desgaste, Camera Raw) ficam por cima e continuam editáveis. Duplo
  clique → abre no Vetor; salvar → o Photo re-rasteriza e mantém os filtros.
- **F2 — Photo → Vetor como vínculo vivo**: "Colocar no Vetor" põe o `.iknv` como imagem vinculada (origem = .iknv,
  render achatado em CMYK pelo perfil). O painel Vínculos já marca "mudou"; "Editar original" abre o Photo.
- **F3 — Mockup fotográfico**: rótulo/arte do Vetor aplicado numa foto (gerada ou real) no Photo com distorção pela
  superfície (mapa de deslocamento), modos de mesclagem e sombra — complementa o 3D vetorial.
- **F4 — Recursos comuns**: amostras/biblioteca da marca compartilhadas, gerador FLUX acessível no Vetor
  ("Gerar imagem" → vira vínculo), mesmo perfil ICC nas duas pontas.
- Regras: nunca achatar sem guardar a fonte; cor CMYK resolvida no Vetor (o Photo trabalha em RGB e devolve pelo perfil);
  texto continua texto até a saída.

## 3. Nível "Herbíssimo" (Behance, agência grande) — dá para chegar? Em parte já; o resto com 3 peças novas
O projeto tem duas camadas:
- **Sistema de identidade** (logo refinado, tipografia condensada forte, cor, grid, rótulos, linhas de produto,
  faca/embalagem, peças OOH e digitais): **alcançável já** com Vetor + Photo + direção certa. Falta treino de direção
  de arte (escala de tipo agressiva, recorte, ritmo de campanha) e modelos de layout de campanha.
- **Imagem de campanha** (render 3D fotorrealista de embalagens em grande quantidade, fotos de moda com modelos, cenas):
  aqui está a distância. O 3D vetorial do Vetor não é fotorrealista. Para chegar perto:
  1. **Blender sem interface (Cycles)** como motor de render: embalagem da faca/3D do Vetor → modelo + rótulo como
     textura → luz de estúdio, reflexo, profundidade de campo. Gratuito; roda em segundo plano como o Ghostscript.
  2. **Geração de imagem mais forte com referência** (inserir o produto real na cena, pessoa segurando o pote):
     FLUX klein local tem limite; avaliar modelos de edição com referência que caibam em 8 GB ou um serviço sob demanda.
  3. **Composição no Photo** (luz, sombra de contato, gradação de cor da campanha) — a ponte F3.
- Foto de moda autoral com modelo real não se substitui de forma honesta; IA serve para direção, mockup e peças menores.
- Ordem sugerida: ponte F1/F2 → modelos de campanha no Vetor → Blender (render de embalagem) → geração com referência.

## 4. (por último) Editor Kanivete com objetos 3D, como o After Effects — dá: SIM
O After Effects (2024+) importa GLB/OBJ como camada 3D e renderiza com luz, sombra, ambiente HDRI e profundidade de campo.
O Editor/Comp é web (canvas) dentro do app: **three.js** (MIT, empacotado local) cobre isso no navegador, com WebGL.
- **F1 — Camada 3D na Comp**: abrir `.glb/.gltf/.obj` (FBX → GLB via Blender sem interface) como camada; posição, rotação,
  escala e animação embutida do modelo, tudo com quadros-chave como as outras propriedades.
- **F2 — Câmera e luzes**: câmera com lente/foco (profundidade de campo), luz ambiente/direcional/pontual/spot com sombra,
  ambiente HDRI (reflexo realista), quadros-chave em tudo.
- **F3 — Cenário**: chão que recebe sombra, fundo com foto/vídeo (placa), neblina; integra com as camadas 2D (texto e
  imagem na frente/atrás pela profundidade).
- **F4 — Pontes**: Vetor exporta girar_3d/extrudar_3d como GLB (malha + rótulo como textura) → anima no Editor; Blender
  (Cycles) para o render final pesado quando precisar de fotorrealismo.
- **Regra de ouro**: o export renderiza quadro a quadro com o MESMO motor da prévia (three.js offscreen) e entra no
  `testes/teste_export.py` (prévia × exportação), como o resto do Editor.
- Custo: médio-alto (F1+F2 são o grosso). Depois da ponte Vetor ↔ Photo e do Blender, porque reaproveita os dois.
