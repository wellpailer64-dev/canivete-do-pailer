# Importar projeto do Premiere (.prproj) no Editor Kanivete

Código: `Functions/premiere.py` (conversor), `main.py` (`ve_project_open`, `ve_project_save`, filtros dos diálogos),
`frontend/js/editor.js` (`veOpenProject`, `veApplyProject`, `vePremiereRelatorio`). Teste: `testes/teste_premiere.py`.
Feito em 2026-10-02 e testado com um projeto do Premiere 2025 (Version 45): 7 sequências e 936 itens.

## Como funciona para o usuário
- Abre por Arquivo > Abrir, Ctrl+O ou arrastando o `.prproj` para o editor. Não associamos `.prproj` ao app no
  Windows (o duplo clique continua indo para o Premiere).
- O conversor **só lê** o arquivo. O projeto entra como "Não salvo" e sem caminho. O Ctrl+S sugere um `.vknv` com o
  mesmo nome, na pasta do `.prproj` (`importado_de.premiere` nos dados). `projeto.com_extensao` também garante
  que nada seja gravado com a extensão `.prproj`.
- Ao abrir aparece um relatório: sequências com o número de clipes, o que foi convertido de forma aproximada, o que
  não veio e a mídia que não foi encontrada.

## O formato (engenharia reversa; a Adobe não documenta)
- O `.prproj` é um XML compactado em gzip. A raiz é `PremiereData`, com dezenas de milhares de objetos **planos**.
  Eles se referenciam por `ObjectRef` (que aponta para um `ObjectID`) ou por `ObjectURef` (que aponta para um `ObjectUID`).
- Os tempos estão em **ticks**: 254016000000 por segundo. O `FrameRate` dos grupos de trilhas é dado em ticks por quadro.
- Cadeia de uma sequência até a mídia:
  `Sequence` → `TrackGroups/TrackGroup/Second` (VideoTrackGroup, AudioTrackGroup, DataTrackGroup = legendas)
  → `TrackGroup/Tracks/Track` (VideoClipTrack/AudioClipTrack; Index 0 = V1/A1)
  → `ClipItems/TrackItems/TrackItem` (VideoClipTrackItem/AudioClipTrackItem: `ClipTrackItem/TrackItem/Start|End`)
  → `SubClip` → `Clip` (VideoClip/AudioClip: `Clip/InPoint|OutPoint|PlaybackSpeed|Source`)
  → `VideoMediaSource`/`AudioMediaSource` → `Media` (caminho) ou `VideoSequenceSource` (sequência aninhada).
- **Campos com valor 0 são omitidos.** Sem `Start`, o clipe começa no 0. Sem `InPoint`, a entrada é 0.
- Caminho da mídia: `ActualMediaFilePath` às vezes é a pasta e às vezes o arquivo. Tentamos, nesta ordem:
  `ActualMediaFilePath`, `FilePath`, a pasta + o nome do `RelativePath`/`Title` e o `RelativePath` em relação ao `.prproj`.
- Mídia sem extensão (Title "Graphic", "Adjustment Layer") são gráficos do próprio Premiere e não viram clipe.
- Velocidade: `PlaybackSpeed` fica no Clip. O In/Out é o trecho da fonte, e na timeline o clipe dura (Out − In) / velocidade.
- Vínculos: `Sequence/PersistentGroupContainer/LinkContainer/Links/Link` → `TrackItemGroup/TrackItems` (vídeo + áudio).
- Efeitos: `ClipTrackItem/ComponentOwner/Components` → VideoComponentChain → `Components/Component` → VideoFilterComponent
  (`MatchName`, por exemplo `AE.ADBE Motion`) → `Params/Param` → VideoComponentParam/PointComponentParam.
  - Valor fixo: segundo campo de `StartKeyframe` (`tempo,valor,...`). Ponto: `x:y` normalizado (0,5:0,5 = centro do quadro).
  - Quadros-chave: só quando `IsTimeVarying` = true. `Keyframes` = `tempo,valor,interp,...;tempo,valor,...`. O tempo é o
    da mídia do clipe (o mesmo do In/Out). Em sequência aninhada pode vir com um deslocamento (por exemplo 01:00:00:00),
    que é descontado.
  - Cadeia com `DefaultMotion`/`DefaultOpacity` = true e sem `Components`: o clipe usa o padrão.
- Cor (por exemplo a Key Color do Ultra Key): inteiro de 64 bits, ARGB com 16 bits por canal.
- Transições: `TransitionItems/TrackItems/TrackItem` → VideoTransitionTrackItem/AudioTransitionTrackItem, com
  `Start/End`, `MatchName`, `HasIncomingClip`/`HasOutgoingClip`. O Premiere também tem transição só de saída de um
  clipe colado no próximo. O editor não tem esse caso: a transição vai para a entrada do próximo clipe ou entra no relatório.

## Mapeamento para o .vknv
| Premiere | Editor Kanivete |
|---|---|
| Sequência (todas) | `sequences[]` com `w`/`h` do FrameRect; a ativa é a que tem mais clipes |
| Item de vídeo / de áudio | clipe `{tr, st, s, e, m}` com `x: 'v'` / `x: 'a'`; áudio solto (mp3/wav) sem `x` |
| Link | `lk` igual no vídeo e no áudio |
| PlaybackSpeed | `v` (negativa: toca para a frente e entra no relatório) |
| Motion: Position / Scale / Rotation / Anchor | `p.x`, `p.y` (× tamanho do quadro), `p.sc` (% em pixels da mídia), `p.rot`, `p.ax/ay` |
| Opacity | `p.op`; quadros-chave em `k.{x,y,sc,rot,op}` (`t` no tempo da fonte); interp 0 → `lin`, 1/2 → `hold`, outros → `ease` |
| Cross Dissolve / Impact Dissolve | `tin`/`tout` `dissolve` |
| Impact Pop (Pop Motion) | `tin`/`tout` `pop` |
| Constant Power | `atin`/`atout` `cp` |
| Sequência aninhada | mídia `timeline` com `sequenceId` |
| Ultra Key (o 1º do clipe) | efeito `key` (Chroma Key): cor convertida; Pedestal → recorte do preto (×0,5), Choke → encolher (÷10 px), Soften → suavizar (÷8 px) |
| Adjustment Layer (mídia "Black Video") | mídia `ajuste` + Desfoque (Impact Blur Amount ≈ %, Gaussian Blurriness ÷ 54 px × 100) |
| Graphic com `AE.ADBE Text` | mídia `texto`, `tx.t` = `InstanceName` (estilo padrão) |
| `.aegraphic` / `.mogrt` | fica de fora (relatório) |
| Mídia principal (id 0) | o vídeo mais usado na timeline ativa |

## Limitações (entram no relatório)
- Não vêm: camadas de ajuste, gráficos e textos (Essential Graphics, MOGRT), Lumetri, Transform, Mirror, Tint e
  efeitos de plugin (Impact, Mettle, Animation Composer).
- Também não vêm: segundo Ultra Key no mesmo clipe, Crop do Motion, escala não proporcional, volume e ganho de
  clipe, legendas (DataTrack) e marcadores de clipe.
- Chroma Key aproximado: o Ultra Key e o Keylight do editor são modelos diferentes, então a borda sai mais dura.
- A escala considera que o clipe NÃO usa "Ajustar ao tamanho do quadro" do Premiere (`ScaleToFramePolicy` ainda não é lido).
- Não gravamos `.prproj`; a volta é pelo XML (seção abaixo).

## Pendências (ordem sugerida)
Plano detalhado da próxima rodada, com o que o usuário viu: **AJUSTE PREMIERE**, em `Instructions/agente/ajuste-premiere.md`.

1. Camadas de ajuste → mídia `ajuste` do editor, com os efeitos que já sabemos ler.
2. Segundo Ultra Key e ajuste fino da borda do Chroma Key (comparar quadro a quadro com um export do Premiere).
3. Lumetri básico → Luz e Cor (exposição, contraste, temperatura, saturação).
4. Volume de clipe (`Level`), legendas da DataTrack e `ScaleToFramePolicy`.

## Testar
`python testes/teste_premiere.py "<projeto.prproj>"`. Use sempre uma **cópia** do projeto do usuário, em
`D:\kanivete_testes\premiere\`. O teste confere clipes convertidos + os que ficaram de fora = itens do Premiere,
a duração da timeline contra `MZ.OutPoint`, os quadros-chave dentro do clipe e a mídia encontrada.
Para olhar a estrutura: descompacte (`gzip`) e procure o objeto pelo ObjectID/ObjectUID; os scripts usados na
exploração estão em `D:\kanivete_testes\premiere\x\`.

## Exportar para o Premiere (XML do Final Cut Pro 7)
Código: `Functions/premiere_xml.py` (`exportar`), `main.py` (`ve_project_save(..., formato='xml')`, `_ve_salvar_xml`),
`frontend/js/editor.js` (`veSaveProject(true, 'xml')`, `vePremiereXmlRelatorio`). Teste: `py -3.13 testes/teste_premiere_xml.py
["<projeto.vknv>"]` (sem projeto = caso sintético com valores conferidos).
- Usuário: Arquivo › "Exportar para o Premiere (XML)..." ou Salvar como › tipo "Projeto do Premiere Pro em XML". No Premiere:
  Arquivo › Importar. Volta: salvar no Premiere e abrir o `.prproj` no Kanivete. O projeto aberto continua sendo o .vknv.
- Caminho `.xml` passado direto em `ve_project_save` exporta sem diálogo (agente/testes).
- O `.vknv` agora guarda `fps`, `w`, `h` (do editor) para o XML; sem eles: 30 fps, 1920×1080.
- Vão: todas as timelines (aninhadas e Comps = clipe de sequência), cortes, faixas (oculta/muda/travada), vínculos,
  velocidade (Time Remap, negativa = reverse), clipe desligado, ganho (Audio Levels, até +12 dB), Basic Motion
  (escala, rotação, centro) e Opacidade com quadros-chave (lineares), Cross Dissolve / Cross Fade (+3dB), marcadores.
- Conferido no Premiere (2026-10-06): o centro do Basic Motion é fração do tamanho ORIGINAL da mídia,
  (x − L/2)/Lmídia, (y − A/2)/Amídia; sem Basic Motion o Premiere encolhe o vertical 1080×1920 (sempre gravar);
  vídeo de celular com rotação 90° troca largura/altura.
- Não vão (relatório): efeitos do editor, textos, ajuste, cor, forma, desenho, legendas, Cena 3D, outras transições.
- Convenções adotadas (a CONFERIR no Premiere, que não está nesta máquina): in/out e `<when>` em quadros da mídia já com a
  velocidade; rotação no mesmo sentido; transição de entrada `start-black`, saída `end-black`.
