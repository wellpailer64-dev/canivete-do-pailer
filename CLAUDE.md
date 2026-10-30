# KANIVETE (antes Canivete do Pailer) — índice para o Claude

Regras abaixo valem sempre. Detalhe de cada ferramenta: `Instructions/agente/CLAUDE-detalhes.md` (buscar pela seção, não ler inteiro)
e `Instructions/MAPA.md`. Achar algo: `py -3.13 tools/mapa_geral.py --busca termo`; criou ferramenta, comando ou teste: rodar
`py -3.13 tools/mapa_geral.py` e acrescentar uma seção no CLAUDE-detalhes.

## Nome
Visível: **KANIVETE**. Internos seguem `CaniveteDoPailer` (exe, zip, `%APPDATA%`, mutex, `CANIVETE_*`): o updater dos amigos procura esses nomes.
Ferramentas: Vídeo (Vd), Photo (Pk), Vetor (Vk), Sound (Sk), Lux (Lk), Encoder (Ke), Slider (Sd), Ata (At). Destaque por `var(--primary)`/`veAcc()`, nunca `#D4814A` fixo.
Ferramenta separada = aba e página próprias (`#page-<id>`), sem abrir outra por trás.

## Peça de cliente (card do Pandalab)
Comece em `Instructions/agente/fluxo-peca-cliente.md`; fichas em `Instructions/agente/clientes/<cliente>.md`.

## Trabalhar barato
- Editar: `py -3.13 tools/patch.py mudancas.patch` (`@@ arquivo`, `<<<` velho `===` novo `>>>`; um @@ por bloco).
- Achar: `py -3.13 tools/mapa_codigo.py vetor|imagem|editor --busca termo` antes de grep ou ler arquivo.
- App aberto do usuário: `py -3.13 tools/aplicar.py frontend/js/x.js [--py]` depois de cada mudança, sem recarregar. `tools/recarregar.py` só no app de teste.
- Testes: o Jr roda (`tools/worker/codigo.py` com `testes: ["teste:vetor"]`) e devolve só o que falhou.
- Vetor: `VKN.curto = true`, `VKN.revisar()` antes de abrir imagem; imagem só no fim, em folha reduzida. Cliente: `tools/briefing.py "<pasta>"`, `tools/imgprep.py`.

## Testar
- Modo agente: `python main.py --agente` (CDP 9222). Fechar o app aberto do usuário exige o ok dele; clique simulado só no app de teste.
- App de teste, sempre no disco D: `APPDATA=D:\kanivete_testes\appdata TEMP=D:\kanivete_testes\tmp TMP=D:\kanivete_testes\tmp LOCALAPPDATA=D:\kanivete_testes\localappdata python main.py --agente=9333`; testes `testes/*.py` com o mesmo ambiente. Scripts avulsos em `D:\kanivete_testes\scripts`.
- Antes de release: reprodução/áudio → `testes/teste_play.py`; exportação, camadas, efeitos, cor → `testes/teste_export.py`; Photo → `teste_imagem.py`; Vetor → `teste_vetor.py`; ponte → `teste_ponte.py`.
- Bug novo de exportação: caso novo em `CASOS` que reprova sem a correção.

## Antes de começar, ler o guia
Edição de vídeo `Instructions/agente/guia-edicao.md` e `tecnicas-de-montagem.md`; motion `mapa-habilidades-motion.md` (ao terminar, `veCompAgruparCenas()`); motion em HTML `motion-html.md`;
carrossel/flyer `direcao-carrossel.md`, `diretor-de-arte.md`, `plano-cena.md`; arte no Photo `design-photo-kanivete.md`; logo `direcao-logotipo.md`; Encoder `mapa-kanivete-encoder.md`;
Slider `Instructions/slider-kanivete.md`; Vetor `Instructions/vetor-kanivete.md`; Photo `Instructions/editor-imagem.md`; Sound `Instructions/sound-kanivete.md`; Premiere `Instructions/importar-premiere.md` e `agente/ponte-premiere.md` (teste só em cópia); 3D `agente/cena-3d-editor.md`; Ata `agente/ata-kanivete.md`; plugins `agente/plugins.md`. Todos em `Instructions/agente/` salvo indicação.

## Plugins
KaniCode é software independente (`D:\Kanivete\Plugins\kanicode`, fora deste git). Pandalab: `py -3.13 D:\Kanivete\Plugins\pandalab\panda.py`; mudança em card real só com o Pailer, salvo entrega liberada. KaniBrowser `D:\Kanivete\Plugins\kanibrowser`: postar ou clicar em site de terceiros só com o ok dele.

## Build e release
- `build.bat` apaga `dist/` com os modelos (~8 GB): gerar com `--distpath dist_novo --workpath build_novo` e copiar só `CaniveteDoPailer.exe`, `_internal/`, `version.txt`, `LEIA-ME.txt`.
- Push na `main` dispara release automático para os amigos.
- Segredos: `Functions/_credenciais.py` fora do git; nunca exibir nem commitar.
- ffmpeg fixo na n8.1 do BtbN: não subir sem conferir o driver NVIDIA mínimo do NVENC; `-filter_complex_script` não existe mais (`_opcao_filtro_script`).
