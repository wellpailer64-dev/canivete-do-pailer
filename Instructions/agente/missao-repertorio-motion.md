# Missão Repertório Motion (desde 2026-11-04)

Objetivo: o Pailer manda um vídeo de referência; eu remonto do zero no Vídeo Kanivete o mais fiel possível.
Cada técnica nova ganha NOME, MÉTODO (como fazer no KANIVETE) e GATILHO (quando usar) no catálogo
(`mapa-habilidades-motion.md`) e no cérebro/RAG. Se faltar ferramenta para um efeito, construímos a ferramenta.

## Roadmap por vídeo (repetir a cada referência)
1. **Decupar** — baixar (`video_download baixar`), folha por cenas + folhas a 10 q/s nas viradas, transcrição
   no idioma certo. Saída: `D:/kanivete_testes/repertorio/NN_nome/decupagem.md` (linha do tempo cena a cena).
2. **Inventariar** — cada movimento vira técnica com nome curto em PT-BR; marcar ✅ já temos / 🧩 temos as
   peças, falta receita / 🔨 falta ferramenta.
3. **Construir** — ferramentas 🔨 primeiro (código no KANIVETE com teste), receitas 🧩 como ajudantes do `montar.py`.
4. **Montar** — `montar.py` + `montador.js` da pasta, no app de teste (porta 9333), timeline em código.
5. **Comparar** — folha lado a lado referência × nossa (mesmos tempos); `conferir_edicao.py` sem REPROVADO.
6. **Registrar** — técnica aprovada entra no `mapa-habilidades-motion.md` (nome, como, quando) e no cérebro
   (`brain_remember`, área `video`, título "Motion · <nome>", gatilhos = palavras que o Pailer usaria).
7. **Fechar** — `veCompAgruparCenas()`, salvar, deixar aberto no app dele, nota dele vira regra.

## Placar
| # | Referência | Técnicas novas | Ferramentas construídas | Estado |
|---|---|---|---|---|
| 01 | "Everyone wants shortcuts" (Pinterest, 16 s) | 12 (mapa › Peça Ref 01) | forma Flor/Mancha; Cena 3D: cápsula, celular, textura de vídeo; conferir_edicao aceita motion com mãe e cena 3D | montado e EXPORTADO pela placa (3 min), conferido contra a referência; aguardando nota do Pailer |

## Formato do registro de técnica (catálogo e cérebro)
- **Nome** (PT-BR, curto, fácil de pedir: "Caixa de seleção de designer")
- **Gatilhos**: frases do Pailer que pedem isso ("estilo Figma", "cursor selecionando o texto", "caixa tracejada")
- **Como**: camadas, propriedades, curvas, tempos (números que funcionaram)
- **Quando** / **quando não**
- **Origem**: referência NN + tempo no vídeo

## Kit de trabalho (copiar da pasta da ref 01 para a próxima)
`montar.py` (ajudantes: entra/sai, texto+revela, selecao, caminho, mancha+orbita, nulo, cena3d/modelo, faixas automáticas,
conflitos), `montador.js` (cria Cena 3D e animação de texto a partir do plano), `folha.py` (nossa × referência nos mesmos
tempos), `assets_codigo.py` (papel, cursor, pontos, palco), `gerar_assets.py` (Z-Image + recorte), `tela_video.py`.
JS no app de teste: `D:/kanivete_testes/repertorio/cdp.py "<código>" | --quadro saida.jpg t | --salvar`.

Lição: conferir SEMPRE o arquivo exportado (v1 saiu sem texto/forma/3D porque `exportar_conferencia.py` ignorava camadas dentro de Comp; corrigido). Monitor certo não prova export certo.
