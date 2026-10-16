# Plano — Identidade visual "pocket" (teste da missão, iniciado 2026-10-15)

Objetivo: provar que o KANIVETE faz, de ponta a ponta, uma identidade visual de nível agência — inspirada no case
**Herbíssimo** (Ana Couto, behance 249020757) — em versão enxuta: logotipo com técnica profissional, slogan, frases,
cenas que tragam a sensação, mockups, produto 3D com rótulo e um vídeo 3D de 5 s. Montagem final no **Vetor Kanivete**,
pranchetas **uma abaixo da outra** (manual/apresentação).

## Decisões (do Pailer)
- Marca **inventada do zero** (primeiro teste).
- Produto: **desodorante natural** (cosmético), na família do Herbíssimo (pote em creme e bastão em gel).
- Montagem final no Vetor, páginas uma abaixo da outra.
- Qualidade de referência: os renders do case (material real, luz que conversa com o cenário, câmera de fotógrafo).

## Lições do case que vamos usar
Palavra-sistema (o nome gera frases, como "-íssimo"), título gigante sangrando a borda, "um diferente no meio de iguais",
pessoa × produto em escala absurda com figurino na cor da marca, tampa como mídia, linha premium com gradiente suave.
Cuidado: cor de tela muito saturada (verde-limão) sai apagada em CMYK — escolher a paleta já pensando na gráfica.

## Etapas e situação

| # | Etapa | Situação | Onde está |
|---|---|---|---|
| 1 | Escola de mockup (5 PSDs dissecados camada a camada) | **Feita** | `Instructions/agente/mockup-profissional.md` §1–4; `D:/kanivete_biblioteca/mockups/estudo/` |
| 2 | Produto 3D com rótulo e foto de estúdio | **Feita** (virou a **Lux Kanivete**) | `CLAUDE.md` › Lux; `cena-3d-editor.md` (fim); `mockup-profissional.md` §5 |
| 2b | Vídeo 3D (render quadro a quadro) | **Feita** (Cycles prévia ~3 s/quadro, final ~5,6 s) | idem |
| 2c | Presets de cena (flutuando, fileira "um diferente no meio de iguais", macro da tampa, herói inclinado) | Adiada (fazer junto da etapa 7) | — |
| 3 | A marca: nome, palavra-sistema, slogan, frases | **Feita**: **sereno** (orvalho + calma), "Pode suar. Fica sereno.", "[momento] sereno" | `D:/kanivete_biblioteca/marcas/sereno/marca.md` |
| 4 | Logotipo no Vetor com construção profissional (grade, ajuste óptico, versões, área de proteção) | **Feita (v3)**: Jost 500 + "o" em gota Bézier G2, miolo por deslocamento, pente limpo; v1/v2 recusadas | `tools/logotipo.py`, `tools/contorno.py`, `direcao-logotipo.md`; `marcas/sereno/logo/`, `direcoes_logo.png` |
| 5 | Paleta (pensada para CMYK) e tipografia | **Feita**: noite/manhã/orvalho/sálvia/lavanda/pêssego + terracota (texto de destaque); Fraunces + Jost | `marcas/sereno/marca.json` |
| 6 | Rótulos (pote e bastão) com a marca | **Feita**: 4 aromas (alecrim, lavanda, coco, noite), HTML → PNG transparente | `D:/kanivete_testes/sereno/rotulos.py`; `marcas/sereno/rotulos/` |
| 7 | Fotos de produto na Lux (herói, flutuando, fileira, macro) + mockups | **Feita** (sem macro/sacola): herói, flutuando, trio de aromas, fileira "um diferente", versões feed; Blender direto pela spec (~30–45 s cada) | `D:/kanivete_testes/sereno/fotos.py`; `marcas/sereno/fotos/` |
| 8 | Cenas de campanha com frases (sensação da marca) | **Feita**: 4 posts feed (Calor sereno, Treino sereno, Pode suar, Entre iguais) — pessoas geradas no Z-Image + renders | `D:/kanivete_testes/sereno/campanha.py`; `marcas/sereno/campanha/` (.iknv + .jpg) |
| 9 | Vídeo 3D de 5 s da marca | A fazer | Lux › Render › Vídeo final |
| 10 | Montagem final no Vetor (pranchetas uma abaixo da outra) | **Feita**: manual de 11 páginas (+ embalagem, produto, campanha) | `marcas/sereno/kit.aknv`, `sereno_manual.pdf` |

## Ferramentas que já existem para isso
- **Lux Kanivete**: embalagens pote/bastão (`frontend/embalagens.json`), materiais do Principled (`frontend/materiais.json`),
  luzes softbox/spot/ponto/sol + Estúdio 3 pontos, 📷 Render (foto Rápido/Full HD/2K/4K; vídeo prévia/final), `.lknv`.
- **Mockup em pilha editável** (passes do 3D → camadas do Photo): `tools/mockup3d.py`.
- **Vetor**: logo, pranchetas, criar fonte, PDF/X, ida e volta com o Illustrator.
- **Photo**: KNV.cena (diagramar em HTML/CSS → camadas), mockups, gerador de imagem (Z-Image/klein).
- Artes de teste já feitas (rótulo provisório "fresquíssimo"): `D:/kanivete_testes/estudio/rotulo_pote.png`, `rotulo_bastao.png`.

## Pendências técnicas anotadas no caminho (não bloqueiam a missão)
- Lux: projeto "invisível" só dela (hoje a cena mora no projeto do Editor por trás); modelos .glb no render; ranhuras da
  prévia aparecem também no topo da tampa; abas Objeto/Embalagem/Material poderiam ganhar mais polimento.
- Gel no EEVEE sem bolhas (ficou como opção; o vídeo usa Cycles).

## Próximo passo ao voltar
Etapa **9** (vídeo 3D de 5 s: flutuando girando + logo; Lux › Render › Vídeo final ou blender_estudio com quadros) e,
se quiser mais, mockups extras (sacola, caixa de envio) e macro da tampa. Atualizar a tabela a cada etapa fechada.

## Técnicas aprendidas na marca (2026-10-15)
- Logo = fonte livre de base + letra redesenhada em código (`tools/logotipo.py`: instancia a variável, troca a letra com
  skia-pathops, gera SVG + folha de construção). Barato: uma rodada = ~1 s e uma folha reduzida para olhar.
- Kit = SVG por cor importado no Vetor → `criar_simbolo`; páginas do manual em HTML com `data-simbolo` (VKN.cena).
- Pêssego/laranja claro não passa no contraste como texto sobre creme: criar um tom de texto (terracota) na paleta.
- Revisor: fundo de cartão em grade às vezes não é visto (contraste falso); conferir na folha de contato.
