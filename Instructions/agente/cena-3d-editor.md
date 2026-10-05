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
- ◆ = cronômetro do After Effects: ligado, mexer no valor grava quadro-chave na agulha; clicar de novo desliga a animação.

## API (agente/Worker): `VE3DAPI`
`nova({dur, st, nome})`, `modelo({arquivo | forma, cor, material, x..esc, cena})`, `definir(quem, {...})`,
`kf(quem, t, {...}, {linear})`, `limparKf(quem, prop)`, `cena({fundo, chao, dur})`, `remover(quem)`, `info()`,
`renderizar()`, `quadro(t)` (PNG data URL para conferir), `doVetor({desc, giro, nome})`. `quem` = `camera` | `luz` |
`cenario` | id/nome do modelo.

## Teste
`python testes/teste_export.py --casos 3d,3dfoco` (3d: esfera quicando, cubo girando, câmera orbitando sobre vídeo;
3dfoco: estúdio, neblina, foco animado). Ponte: `python testes/teste_vetor_editor3d.py` (app em `--agente=9333`).

## Pendências
- Blender para render pesado da cena do Editor; texto 3D; placa de fundo com imagem/vídeo; quadros-chave da cena 3D
  na timeline (hoje só no painel); vínculo vivo Vetor → Editor (hoje é cópia: reenviar após editar).
