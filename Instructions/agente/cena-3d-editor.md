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
- Modelos: primitivas (esfera, cubo, cilindro, toro, cone, plano; materiais em `VE3D_MATERIAIS`) ou .glb/.gltf/.obj
  (normalizado para altura 1, apoiado no chão; animações do GLB tocam pelo tempo do clipe). Chão = só sombra.

## Interface
- Projeto (menu de contexto) → **Nova cena 3D**; paleta de comandos: "Nova cena 3D", "Cena 3D: importar modelo".
- Propriedades (clipe da cena selecionado): Câmera, Luz, Modelos (+ arquivo / + primitivas, ✕ tira), Cena (sombra, fundo).
- ◆ = cronômetro do After Effects: ligado, mexer no valor grava quadro-chave na agulha; clicar de novo desliga a animação.

## API (agente/Worker): `VE3DAPI`
`nova({dur, st, nome})`, `modelo({arquivo | forma, cor, material, x..esc, cena})`, `definir(quem, {...})`,
`kf(quem, t, {...}, {linear})`, `limparKf(quem, prop)`, `cena({fundo, chao, dur})`, `remover(quem)`, `info()`,
`renderizar()`, `quadro(t)` (PNG data URL para conferir). `quem` = `camera` | `luz` | id/nome do modelo.

## Teste
`python testes/teste_export.py --casos 3d` (esfera quicando, cubo girando, câmera orbitando sobre vídeo).

## Pendências
- F2 profundidade de campo (pós-processamento), F3 cenário (placa de fundo, neblina), F4 Vetor → Editor (GLB pelo
  `GLTFExporter`) e Blender para render pesado; texto 3D; curvas de velocidade dos quadros-chave na timeline.
