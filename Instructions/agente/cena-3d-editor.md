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
3dfoco: estúdio, neblina, foco animado). Ponte: `python testes/teste_vetor_editor3d.py` (app em `--agente=9333`).

## Pendências
- Blender para render pesado da cena do Editor; texto 3D; placa de fundo com imagem/vídeo; quadros-chave da cena 3D
  na timeline (hoje só no painel); vínculo vivo Vetor → Editor (hoje é cópia: reenviar após editar).
