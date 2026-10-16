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
| 2c | Presets de cena (flutuando, fileira "um diferente no meio de iguais", macro da tampa, herói inclinado) | **Próxima** | — |
| 3 | A marca: nome, palavra-sistema, slogan, frases | A fazer | — |
| 4 | Logotipo no Vetor com construção profissional (grade, ajuste óptico, versões, área de proteção) | A fazer | Vetor Kanivete |
| 5 | Paleta (pensada para CMYK) e tipografia | A fazer | — |
| 6 | Rótulos (pote e bastão) com a marca | A fazer | Vetor/Photo → PNG para a Lux |
| 7 | Fotos de produto na Lux (herói, flutuando, fileira, macro) + mockups no Photo (cartão, sacola…) | A fazer | Lux + Photo |
| 8 | Cenas de campanha com frases (sensação da marca) | A fazer | Photo (KNV.cena) |
| 9 | Vídeo 3D de 5 s da marca | A fazer | Lux › Render › Vídeo final |
| 10 | Montagem final no Vetor (pranchetas uma abaixo da outra) | A fazer | Vetor Kanivete |

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
Etapa **2c** (presets de cena na Lux) e, em seguida, **3** (a marca). Atualizar a tabela acima a cada etapa fechada.
