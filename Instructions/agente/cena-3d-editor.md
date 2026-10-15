# Cena 3D no Editor Kanivete (estilo After Effects)

Código: `frontend/js/editor-3d.js` (three.js r170 local em `frontend/vendor/three`, MIT) + `Functions/cena3d.py`.

## Modelo
- Uma cena 3D é uma mídia de vídeo com alfa: `m.c3d = {modelos, camera, luz, fundo, chao}`.
- O monitor desenha AO VIVO com three.js; parado de mexer, a página renderiza quadro a quadro com o MESMO three.js,
  manda PNGs em lotes (`ve_c3d_inicio/lote/fim`) e o ffmpeg monta ProRes 4444 em `<cache>/Cenas3D/<hash>.mov`.
  A exportação espera (`ve3dProntas`). Hash = conteúdo da cena + tamanho/fps/duração (desfazer reaproveita).
- Propriedade: valor fixo em `o.p[k]`; animada em `o.kf[k] = [[t, v, 'suave'|'linear'], ...]` (t em s dentro do clipe).
- Câmera orbital: `azimute, elevacao, dist (null = enquadra sozinho), fov, ax/ay/az (alvo)`.
  Luz: `azimute, elevacao, intensidade, ambiente, sombra, cor`. Modelo: `x, y, z, rx, ry, rz, esc, velocidade`.
- Modelos: primitivas (esfera, cubo, cilindro, toro, cone, plano; materiais em `VE3D_MATERIAIS`) ou arquivo
  (normalizado para altura 1, apoiado no chão; animações do GLB tocam pelo tempo do clipe). Chão = só sombra.
- Modelos de banco (2026-10-14): `cena3d.preparar(caminho, base)` → URL + tipo + **anexos** (texturas/.bin/.mtl em até 3
  níveis de subpasta, por nome sem caixa) + .mtl do .obj (+ `faltando`: .mtl citado que não veio). O `LoadingManager`
  troca qualquer caminho pedido (relativo, absoluto do PC do autor, caixa errada) pelo anexo de mesmo nome.
  .obj+.mtl: `MTLLoader` e Phong → físico mantendo mapas (`ve3dFisico`); .gltf separado; .glb com Draco/meshopt
  (decodificador local em `vendor/three/addons/libs`). **.fbx/.blend/.dae/.stl/.ply/.3mf** → .glb no Blender
  (`cena3d.converter` + `Functions/blender_converter.py`: acha texturas perdidas pelo nome, tira câmeras/luzes; cache em
  `<cache>/Cenas3D/convertidos/<hash>.glb`); sem Blender, pergunta e baixa (`ve_3d_blender_instalar`, ~400 MB).
- .obj real (tênis Air Jordan, 2026-10-14): arestas soltas `l`/`p` no mesmo objeto das faces faziam o OBJLoader virar o
  objeto INTEIRO em fios (aramado branco) — saem do texto antes do parse. Texturas do .mtl esperadas (LoadingManager)
  antes de desenhar. `ve3dMtlPbr`: "map_Bump *_Normal" → normal, `map_Ns *Roughness`/`map_Pr` → rugosidade,
  `refl *Metallic`/`map_Pm` → metal; com textura de cor o Kd 0,8 do Blender é ignorado (cor branca).
- Aparência (`fonte.cor/material/textura/texRep`, `fonte.partes[nome do material]` por cima): `ve3dAparencia`. Cor
  única tira a textura do arquivo; imagem em modelo sem UV = projeção de caixa (`ve3dUvCaixa`). Partes = nomes dos
  materiais (usemtl/glTF) — rótulo só no corpo da lata. Mudar a fonte remonta o modelo.
- Soltar arquivo 3D (`VE3D_EXT`) no editor: `veDropFiles` → `ve3dSoltar` (tela 3D aberta > cena selecionada > cena nova).
- Foco (F2, na câmera): `abertura` 0–1 (0 = nítido; raio máx. = 4% da altura do quadro), `foco` (null = no alvo).
  Desfoque por profundidade num passo próprio (64→96 amostras com giro por pixel, média de Karis contra vagalumes HDR).
  O desenho SEMPRE passa pelo alvo + passo final (tom e cor no fim): no desenho direto do three a neblina entra depois
  da conversão de cor e mudaria ao ligar o foco.
- Cenário (F3): `C.cenario = {p: {estudio 0|1, estudioCor, neblina 0–1, neblinaCor}, kf}` — estúdio infinito (chão que
  curva em parede, gira junto com a câmera, recebe sombra) e neblina (FogExp2). `quem = 'cenario'` na API.
- Do Vetor (F4): `fonte = {tipo: 'vetor', desc}` — a mesma descrição do render no Blender (`vbCena`): girar = torno com o
  rótulo em UV; extrudar = ExtrudeGeometry com chanfro para dentro + placas com as artes. PNGs em `<cache>/Cenas3D/vetor`.
  No Vetor: Objeto › "3D: Animar no Editor (Cena 3D)" = comando `enviar_editor_3d {ids}` (precisa de timeline aberta).
- `VE3D_VERSAO` entra na assinatura do arquivo: subir quando o desenho mudar (senão a exportação usa o .mov velho do cache).
- Distância automática: cabe o conjunto em repouso (`p` de cada modelo, sem quadros-chave).

## Interface
- Projeto (menu de contexto) → **Nova cena 3D**; paleta de comandos: "Nova cena 3D", "Cena 3D: importar modelo".
- Propriedades (clipe da cena selecionado): Câmera, Luz, Modelos (+ arquivo / + primitivas, ✕ tira), Cena (sombra, fundo).
- Tela 3D (edição): clique/lista seleciona; W/E/R setas; Delete tira; Ctrl+D duplica; H (ou ●) esconde; F enquadra
  (vista livre); Q eixo objeto/mundo; Ímã (ou Ctrl segurado) = passos 0,1 / 15°; duplo clique no nome renomeia;
  Propriedades do modelo: Duplicar, Apoiar no chão, Zerar posição, Aparência (Aplicar em: modelo inteiro ou parte).
  No painel Propriedades, ✎ ao lado do modelo abre a tela com ele selecionado.
- ◆ = cronômetro do After Effects: ligado, mexer no valor grava quadro-chave na agulha; clicar de novo desliga a animação.

## Camadas em profundidade (o "3D das camadas" do After) — 2026-10-14
`frontend/js/editor-3d-placas.js`. Botão direito nas camadas → **"Camadas → Cena 3D (profundidade)"** (paleta:
`cena3d-camadas`; API `VE3DAPI.deCamadas(clips)`): cada foto/texto/forma/Comp parada é desenhada como o monitor desenha
(efeitos, máscara, rotação), recortada ao que tem desenho e vira uma **placa** (`fonte: {tipo:'placa', path, w, h}`,
plano sem luz). Câmera fov 40 com o quadro inteiro de altura 1 no Z = 0: o 1º quadro sai igual ao 2D (diferença média
0,14). Cena `c3d.placas = true`: sem tom final e sem sombra. Camada mais curta = `visivel` com ◆. Um Ctrl+Z desfaz a
conversão. Vídeo ainda não vira placa (fica de fora, com aviso).

**Mexer na tela 3D** (`frontend/js/editor-3d-mexer.js`, vale para qualquer objeto):
- arrastar o objeto direto = move no plano da tela (arrastar no vazio continua orbitando a câmera);
- **Alt + rodinha** ou **[ / ]** (Shift = fino) ou botões "Para o fundo / Para a frente" no painel da placa: empurra ao
  longo do raio da câmera com a escala compensada — na tela fica IGUAL, só muda a profundidade (parallax);
- **mapa de profundidade** (canto direito, vista de cima): câmera, campo de visão e cada camada; clique seleciona,
  arrastar para cima/baixo = para o fundo/frente.

**Olhos e mãos do agente** (sem abrir imagem nem adivinhar unidades): `VE3DAPI.naTela(cena, t)` → por objeto
`{nome, caixa:[x0,y0,x1,y1] em % do quadro, fora:% fora do quadro, z, dist}`; `VE3DAPI.colocar(cena, nome, {x, y, h|w, z, rz}, t)`
→ posiciona PELA TELA (x/y em %, h = % da altura) em qualquer z; `VE3DAPI.folha(cena, [t...], largura)` → UMA imagem
JPEG com os quadros lado a lado. Receita de colagem em `mapa-habilidades-motion.md` §4.

## Leveza (2026-10-14)
- **Um motor só** (um contexto WebGL, `ve3dMotor`) para todas as cenas: cada cena abria o seu e nunca devolvia; com
  várias timelines de cenas a página caía. No máximo **4 cenas montadas** (`ve3dPodar`; as fora da timeline aberta saem
  primeiro, `ve3dLiberar` devolve geometria/material/textura).
- **Mexer não remonta tudo**: objeto com a mesma fonte é reaproveitado (assinatura `o.ch` de quando carregou — a
  Aparência troca `md.fonte` no mesmo objeto). Acrescentar uma placa: ~17 ms (antes relia todas do disco).
- **Arquivo da exportação só com o app parado** (12 s sem mexer, fora do play e da tela 3D); mexeu no meio, o render
  para e apaga os quadros (`ve_c3d_cancelar`). Antes ele desenhava todos os quadros em tamanho cheio 2,5 s depois de
  CADA mudança e travava a interface ~15 s. Exportar continua esperando o arquivo (`ve3dProntas`).
- Sombra só com chão/estúdio; alvo de desenho guardado por tamanho (até 3: monitor, tela, render).
- Armadilha: depois do Ctrl+Z os modelos são cópias — `ve3dAplicar` religa `o.md` pelos ids (`rt.mods`).

## API (agente/Worker): `VE3DAPI`
`nova({dur, st, nome})`, `modelo({arquivo | forma, cor, material, textura, texRep, x..esc, cena})`, `definir(quem, {...})`,
`aparencia(quem, {cor, material, textura, texRep, parte})`, `partes(quem)`, `duplicar(quem)`, `renomear(quem, nome)`,
`zerar(quem, {chao})`,
`kf(quem, t, {...}, {linear})`, `limparKf(quem, prop)`, `cena({fundo, chao, dur})`, `remover(quem)`, `info()`,
`renderizar()`, `quadro(t)` (PNG data URL para conferir), `doVetor({desc, giro, nome})`. `quem` = `camera` | `luz` |
`cenario` | id/nome do modelo.

## Teste
`python testes/teste_3d_modelos.py` (app em `--agente=9333`; modelos gerados por `D:/kanivete_testes/scripts/gerar_modelos3d.py`
e `gerar_lata3d.py` no Blender): .obj+.mtl em subpasta, .gltf separado, .glb Draco, .fbx com textura de outro PC, .stl,
lata com 2 partes sem .mtl; aparência, partes, ferramentas da tela, soltar e o arquivo da exportação.
`python testes/teste_export.py --casos 3d,3dfoco` (3d: esfera quicando, cubo girando, câmera orbitando sobre vídeo;
3dfoco: estúdio, neblina, foco animado; placas: forma + texto em profundidade com a câmera aproximando).
Ponte: `python testes/teste_vetor_editor3d.py` (app em `--agente=9333`).
Placas, tela com mouse e leveza: `py -3.13 testes/teste_3d_placas.py` (app em `--agente=9333`).

## Pendências
- Placas: vídeo como placa (textura de vídeo por quadro), opacidade/mesclagem por placa, parallax automático de UMA foto
  (mapa de profundidade leve, conferir licença), luz e sombra nas placas.
- Blender para render pesado da cena do Editor; texto 3D; placa de fundo com imagem/vídeo; quadros-chave da cena 3D
  na timeline (hoje só no painel); vínculo vivo Vetor → Editor (hoje é cópia: reenviar após editar).
