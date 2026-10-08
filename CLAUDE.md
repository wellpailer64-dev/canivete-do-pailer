# KANIVETE (antes Canivete do Pailer) — notas para o Claude

## Nome e extensões
- Nome visível: **KANIVETE** (janela, splash, marca, textos, release). Identificadores internos continuam
  `CaniveteDoPailer` (exe, zip do release, `%APPDATA%\CaniveteDoPailer`, mutex, `CANIVETE_*`): o updater instalado nos
  amigos procura esses nomes; trocar exige uma migração planejada.
- Nomes visíveis dos editores: **Editor Kanivete** (vídeo) e **Photo Kanivete** (imagem); no código continuam
  editor de vídeo (`editor*.js`, "Pocket Editor" nos comentários) e editor de imagem (`imagem-*.js`).
- Projetos: `.vknv` = editor de vídeo (os `.vcnvt` antigos abrem; Ctrl+S grava um `.vknv` ao lado),
  `.iknv` = editor de imagem (zip com documento.json + PNGs; `Functions/editor_imagem.py`). Associação no Windows
  (HKCU) em `Functions/projeto.py`; duplo clique roteado por `abrirProjetoExterno` (frontend/js/app.js).

## Mapa geral (comece por aqui)
`Instructions/MAPA.md` (ferramentas → arquivos, API, comandos VKN/KNV, testes, guias, pontes, onde ficam dados e
caches); versão do Jr: `Instructions/mapa.json`. Achar algo: `py -3.13 tools/mapa_geral.py --busca termo`; depois de
criar ferramenta, comando ou teste: `py -3.13 tools/mapa_geral.py` (regenera os dois).

## Trabalhar barato (economia de tokens — usar SEMPRE)
- Editar código: `py -3.13 tools/patch.py mudancas.patch` (blocos `@@ arquivo` / `<<<` velho `===` novo `>>>`; confere âncora
  única, tudo ou nada, checa sintaxe e desfaz se quebrar). Nada de heredoc com Python inline para editar.
- Achar onde mexer: `py -3.13 tools/mapa_codigo.py vetor|imagem|editor --busca termo` (comandos/funções:linha) antes de grep/ler arquivo.
- Aplicar mudança no app aberto: `py -3.13 tools/recarregar.py [--py] [--ferramenta editor-imagem]` (JS e Functions/*.py
  sem reiniciar; só mudança em main.py pede reinício).
- Testes: o Jr roda (`tools/worker/codigo.py` com `testes: ["teste:vetor"]`) e devolve só o que falhou.
- Vetor: `VKN.curto = true` (respostas só com id/caminho), `VKN.revisar()` antes de abrir qualquer imagem, e páginas em
  HTML/CSS com `VKN.cena` / `py -3.13 tools/vk_cena.py pagina.html --marca marca.json --prancheta X [--nova 320x180] --png p.png --revisar`.
  Marcas prontas (kit .aknv com símbolos + marca.json) em `D:\kanivete_biblioteca\marcas\`; modelos de página em
  `D:\kanivete_biblioteca\modelos\manual\`. Imagem só no fim, em folha de contato reduzida.

## Testar a interface: use o modo agente (não monte teste no navegador)
O app expõe o painel real via Chrome DevTools Protocol, com a API pywebview de verdade:

```
dist\CaniveteDoPailer\CaniveteDoPailer.exe --agente     # CDP em http://127.0.0.1:9222
python main.py --agente                                  # pelo código
```

Conecte por CDP (ex.: Playwright `connect_over_cdp`), rode JS na página (`veSeek`, `VE.clips`...),
clique e tire print. Detalhes e segurança em `Instructions/modo-agente.md`.
Fechar o app aberto do usuário (para trocar o exe ou relançar com `--agente`) exige o ok dele antes.
App de teste (porta 9333) com preferências e temporários próprios, **no disco D** (o C enche e deixa o sistema lento;
testes, cache, modelos e saídas nunca no C): `APPDATA=D:\kanivete_testes\appdata TEMP=D:\kanivete_testes\tmp
TMP=D:\kanivete_testes\tmp LOCALAPPDATA=D:\kanivete_testes\localappdata python main.py --agente=9333`; rode os testes
(`testes/*.py`) com o mesmo TEMP/TMP/LOCALAPPDATA (o cache de mídia vai para %LOCALAPPDATA%).
Scripts e prints de teste avulsos em `D:\kanivete_testes\scripts`.

Play do Pocket Editor: `python testes/teste_play.py "<projeto.vknv>" [--segundos 20] [--inicio 0]` (app em
`--agente=9333`) mede agulha voltando, buscas, esperas, quadros perdidos e travadas; sai com 1 se passar dos limites.
Rodar antes de release quando mexer em reprodução, áudio ou prévias.

Exportação × prévia: `python testes/teste_export.py [--casos grade,camadas,...] [--4k]` abre o app sozinho (porta 9333),
monta cada caso numa timeline nova com material gerado, exporta e compara quadro a quadro com o monitor (contagem de
quadros, quadro preto só na exportação, diferença de imagem > 10, duração do som); sai com 1 se reprovar e guarda os
pares em `%TEMP%/canivete_teste_export/saida`. Rodar antes de release quando mexer em exportação, camadas, efeitos,
transições, cor ou AutoFrame. Caso novo para bug novo: acrescente em `CASOS` e confira que reprova sem a correção.

Exportar com fila de render (como o Media Encoder), num painel só: `frontend/js/editor-fila.js` — configurações à
esquerda, fila à direita (cada item congela a timeline ao entrar e tem as SUAS configurações: clicar no item carrega no
formulário e o que mudar vale para ele), "Adicionar à fila", "Todas as timelines", ▶ Renderizar fila em ordem enquanto
se edita. Botão Fila no cabeçalho abre o mesmo painel. API `VEFILA_API`. Teste: `py -3.13 testes/teste_fila.py` (porta 9334).

**Kanivete Encoder (Ke)**: janela própria do export feita (`editor-encoder.js`: logo Ke, solta, minimiza, lembra posição).
**PENDENTE**: exportar mais rápido mantendo a qualidade — plano em `Instructions/agente/plano-kanivete-encoder.md`.

Atributos de vários clipes (como no Premiere): `frontend/js/editor-atributos.js` — botão direito → "Remover atributos…"
(efeitos de vídeo/áudio, movimento, opacidade, mesclagem, volume, transições, com caixinhas; vale para a seleção) e ajuste
em grupo (mexer num efeito com vários selecionados leva o valor ao mesmo efeito de todos). Teste: `testes/teste_atributos.py`.

Teste de 4K (estresse: material pesado, camadas, 10-bit, export, memória): plano e resultados em
`Instructions/agente/teste-4k.md` — rodada 1 feita (2026-10-01), pendências no fim do arquivo.

## Editar vídeo pelo app (agente)
Guia interno para IAs (acesso, leitura de mídia, receita, estilo do cliente, calibração): `Instructions/agente/guia-edicao.md`.
Atualize a seção CALIBRACAO dele a cada feedback do usuário sobre uma edição.
Composição, motion, cor e contraste (curvas, tempos, área segura do 9:16, receitas com camadas de ajuste e o plano
de evolução do AutoFrame): `Instructions/agente/direcao-de-arte.md`.

## Importar Premiere (.prproj)
`Functions/premiere.py` converte só LENDO (gzip + XML de objetos por ObjectID; ticks 254016000000/s) para o formato
do .vknv; abre sem caminho (Ctrl+S grava um .vknv ao lado). Vêm cortes, trilhas, vínculos, velocidade, Motion/Opacidade
(com quadros-chave), transições (Cross Dissolve, Pop, Constant Power), sequências aninhadas e Ultra Key → Chroma Key
(aproximado); o resto vai para o relatório. Teste: `python testes/teste_premiere.py "<projeto.prproj>"`
(use uma CÓPIA do projeto do usuário, ex. `D:\kanivete_testes\premiere\`).
Mapa do formato, mapeamento, limitações e pendências: `Instructions/importar-premiere.md`.
Volta para o Premiere: XML do FCP7 (`Functions/premiere_xml.py`, Arquivo › Exportar para o Premiere; teste
`testes/teste_premiere_xml.py`).
**AJUSTE PREMIERE** (próxima rodada: clipes trocados/fora do tempo, camadas de ajuste, transições de sobreposição,
textos): plano em `Instructions/agente/ajuste-premiere.md`.

## Comp (estilo After Effects)
Plano, modelo e limitações em `Instructions/agente/plano-comp.md`; código em `frontend/js/editor-comp.js`.
Plano completo (Fases 1–3 + Propriedades essenciais por faixa).

## Render 3D no Blender
Objetos 3D do Vetor renderizados fotorrealistas (Cycles, GPU) com rótulo mapeado: comando `render_blender`, guia
`Instructions/vetor-kanivete.md` §13; Blender 4.5 LTS baixado sob demanda. Teste: `python testes/teste_blender.py`.

## Ponte Vetor ↔ Photo
Objeto inteligente vetorial no Photo (Arquivo › Enviar ao Photo; editar no Vetor e Ctrl+S devolve) e vínculo vivo do
.iknv no Vetor: `frontend/js/ponte-vetor-photo.js`, guia `Instructions/vetor-kanivete.md` §12. Teste: `python
testes/teste_ponte.py` (rodar antes de release quando mexer na ponte, no objeto inteligente ou no renderizador do Vetor).

## Cena 3D no Editor (estilo After Effects)
Tela própria (duplo clique na faixa, como a Comp): `frontend/js/editor-3d-tela.js` (orbitar grava na câmera, vista livre, setas W/E/R).
Modelos .glb/.obj e primitivas com câmera, luz, sombra e quadros-chave (◆), prévia ao vivo em three.js e ProRes 4444
para a exportação: `frontend/js/editor-3d.js` + `Functions/cena3d.py`; API `VE3DAPI`. Guia e pendências:
`Instructions/agente/cena-3d-editor.md`. Foco (desfoque por profundidade), estúdio infinito, neblina e objetos 3D do
Vetor (Objeto › "3D: Animar no Editor", `enviar_editor_3d`). Testes: `python testes/teste_export.py --casos 3d,3dfoco`
e `python testes/teste_vetor_editor3d.py`.

## Editor de Imagem (estilo Photoshop)
Guia, arquivos e limitações em `Instructions/editor-imagem.md`; código em `frontend/js/imagem-*.js` e
`Functions/editor_imagem.py` (salvar PSD de ida e volta: só troca o que mudou; grava num temporário, relê e só troca o arquivo se cada camada conferir — `testes/teste_psd_refs.py`). Texto, forma, objeto inteligente e preenchimento
criados no Photo vão para o PSD editáveis (moldes do Photoshop em `Functions/psd_texto_modelo.py` e `psd_so_modelo.py`; forma =
cor sólida + máscara vetorial; incorporados sempre na versão 7; `testes/teste_psd_{texto,forma,so,pre}.py`, `--photoshop` confere lá). Teste: `python testes/teste_imagem.py`
(rodar antes de release quando mexer no editor de imagem, em `psd_tools` ou no `media_server`). Ferramentas com mouse de
verdade (app em `--agente=9333`): `testes/teste_caneta.py` (Caneta, demarcadores, recuperação, laço magnético) e
`testes/teste_guias.py` (guias, encaixe, fatias, carrossel), `testes/teste_dissolver.py` (Filtro > Dissolver/Liquify), `testes/teste_galeria.py` (Galeria de filtros), `testes/teste_cameraraw.py` (Camera Raw).
Gerar imagem com IA (Z-Image-Turbo 6B Q4_K; com referência, FLUX.2 klein — ambos no stable-diffusion.cpp Vulkan, sob demanda; `KNV.gerar`): seção no mesmo guia.
**Diagramar (carrossel, feed, story): `KNV.cena` — HTML/CSS vira camadas; `py -3.13 tools/knv.py peca.html --formato feed` (carrossel: `<section class="slide">`, `--exportar pasta`)**;
**antes de diagramar carrossel/flyer/story, ler `Instructions/agente/direcao-carrossel.md`** (hierarquia, herói, ponte, catálogo de técnicas; o revisor confere com `KNV.revisarDirecao`);
guia `Instructions/agente/plano-cena.md` (seção "Fluxo barato": biblioteca `D:\kanivete_biblioteca` com recursos/modelos/amostras, `data-cor`, `recurso:`, `--ver`, `--comparar`, `--variacoes`, `KNV.etapa`). Fazer arte pelo app (API `window.KNV`, receitas em etapas .iknv, `rodar.py`, `KNV.mapa()`/`KNV.revisar()`, técnicas):
`Instructions/agente/design-photo-kanivete.md`.

## Sound Kanivete (áudio multipista)
Timeline de áudio, fades, LUFS, projeto `.sknv`, API `window.SKN`: `Instructions/sound-kanivete.md`; código `frontend/js/som.js` (núcleo),
`som-motor.js` (reprodução em trechos), `som-paineis.js` (painéis), `som-gravar.js` (microfone, autosave), `som-dock.js` (painéis móveis), `som-espectro.js` (espectro, reparo, separar), `som-tts.js` (Texto para Voz,
Conversa, banco de vozes), `som-texto.js` (editar pelo texto, stems, ID3, modelos) +
`Functions/sound_kanivete.py`, `sk_gravar.py`. Teste: `python testes/teste_som.py`.

## Kani (assistente de conversa)
Chat local tipo ChatGPT (Qwen3 8B): bolinha na Home + IA › Kani na barra lateral, gaveta à direita de qualquer ferramenta
(`frontend/js/kani.js`, `css/kani.css`, `Functions/kani.py`). Motor: Ollama com qwen3:8b se houver; senão llama.cpp Vulkan
+ Qwen3-8B-Q4_K_M.gguf (~5 GB) baixados sob demanda em `modelos_ia/kani`. Ajuda do app: `frontend/ajuda/kani_kb.json`
(trechos dos guias, busca BM25) — regenerar com `py -3.13 tools/kani_kb.py` ao mudar guias/ferramentas. Nome em
`kani.NOME`. Teste: `py -3.13 testes/teste_kani.py` (porta 9334).

## Remover fundo (recorte)
GPU automática (onnxruntime-directml), pessoa → BiRefNet matting / objeto → BEN2 (YuNet decide), uma sessão por vez na
placa; medições, qualidade e pendências (cena em duas passadas ainda não publicada) em `Instructions/agente/remover-fundo.md`.

## Carrossel com direção de arte
Roteiro JSON → `tools/esqueleto.py --montar` (10 layouts, 6 estilos, arte-final, auto-ajuste, revisor de direção);
Jr: `tools/roteiro_local.py --etapas [--hibrido]`; mapa: `tools/direcao_mapa.py`. Guia e pendências:
`Instructions/agente/direcao-carrossel.md`. Briefing de carrossel: responder como diretor de arte no formato de `Instructions/agente/diretor-de-arte.md`.

## Vetor Kanivete (estilo Illustrator, para gráfica)
Estudo de caso, modelo, API, fechamento e pendências: `Instructions/vetor-kanivete.md`; código `frontend/js/vetor-*.js` +
`Functions/vetor_*.py`. Abre PDF/AI/SVG/PPTX, salva `.aknv`, exporta PDF/X-4 e X-1a (curvas, CMYK pelo ICC, sangria,
marcas, verificação relendo o PDF). **API primeiro**: tudo é `vkCmd`/`window.VKN.cmd` (interface, Claude e Worker iguais);
ler o documento com `VKN.mapa()`, conferir com `VKN.fechamento()`. Worker: `"app": "vetor"`. Teste: `python testes/teste_vetor.py`
(rodar antes de release quando mexer no Vetor).
Pranchetas (ordem 4 por linha/vertical, duplicar, Alt+arrastar, alças), Novo documento com modelos e Criar fonte (.otf de
glifos em pranchetas): §14 do guia; `testes/teste_pranchetas.py`, `testes/teste_fonte.py`.
Illustrator ida e volta (.ai NATIVO montado no Illustrator instalado; volta com pranchetas/camadas/texto de área): §15,
`Functions/ponte_illustrator.py`, `testes/teste_illustrator.py`.
Painéis móveis do Vetor (mecanismo do Photo): §16, `frontend/js/vetor-dock.js`, `testes/teste_vetor_paineis.py`.

## Build local
- `build.bat` apaga `dist/` inteiro, onde ficam os modelos do usuário (`modelos_ia/`, `models/`, ~8 GB).
  Gere em outra pasta (`--distpath dist_novo --workpath build_novo`) e copie só `CaniveteDoPailer.exe`,
  `_internal/`, `version.txt` e `LEIA-ME.txt` para `dist/CaniveteDoPailer/`.
- Push na `main` dispara o release automático (GitHub Actions + updater dos amigos).

## Soundboard (pack de sons do editor)
- Não vai no build: o painel baixa `soundboard-vN.zip` do release `soundboard-vN` (pré-release, para não virar
  o "latest" do updater) e instala em `<app>/soundboard/`. Só sons CC0 (Kenney, Freesound filtrado por CC0).
- Gerar: `python tools/montar_soundboard.py <pasta>`; para pack novo, suba `VERSAO` nos dois arquivos
  (`tools/montar_soundboard.py` e `Functions/soundboard.py`) e publique o zip num release novo.

## Segredos
- `Functions/_credenciais.py` (client secret do Google Drive) fica fora do git; no CI vem do secret
  `GDRIVE_CLIENT_SECRET`. Nunca exibir nem commitar o valor.

## ffmpeg
- O ffmpeg baixado é recente (7+): `-filter_complex_script` não existe mais; use `-/filter_complex`
  (ver `_opcao_filtro_script` em `Functions/video_cutter.py`).

## Canivete Worker (assistente local)
Antes de olhar imagem: `tools/medir_ref.py` (mede a referência: textos, formas, paleta → rascunho HTML), `knv.py --revisar`
/ `tools/revisor.py` (regras dos feedbacks do usuário: corte seco, contraste, sombra dura, avatar), `tools/olho.py`
(visão local Gemma 4 E4B: ler/revisar/comparar — pista, não verdade). Fluxo em `Instructions/agente/design-photo-kanivete.md`
("Fluxo barato v2"). Cada feedback novo do usuário vira regra no revisor (`KNV.revisarPeca` em imagem-api.js + revisor.py).
Planos de economia de tokens, ponte Vetor ↔ Photo e nível de campanha: `Instructions/agente/plano-economia-ponte-vetor-photo.md`.
Operações repetitivas no Photo Kanivete: escrever um contrato e delegar ao Qwen3 8B local (`py -3.13 tools/worker/worker.py contrato.json`),
que volta numa linha JSON. Contrato, condições de sucesso e ferramentas: `Instructions/agente/worker.md`.
Infraestrutura braçal (achar no código, troca mecânica, rodar teste, diagnosticar traceback): Code/Debug Worker
`py -3.13 tools/worker/codigo.py contrato.json` (ferramentas fechadas); eu reviso só o diff. Mesmo guia.
