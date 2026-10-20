# MOGRT no Vídeo Kanivete (Motion Graphics Template do Premiere)

Código: `Functions/mogrt.py` (leitura) + `frontend/js/editor-mogrt.js` (montagem, Gráficos essenciais, plano rápido);
ganchos em `editor-comp.js` (`veCompSeqEfetiva`, `veCompEssDefinir`, `veCompEssHtml`), `video_cutter._corte_animado`
(Cortar animado no ffmpeg) e as entradas de arquivo (`veDropFiles`, `vePjImportarArquivo`, abrir caminho). Ponte
`ve_mogrt_importar`. Dependência: `py-aep==0.18.2` (MIT; usa fonttools/uharfbuzz/pyyaml/attrs, que o app já tem).
Teste: `py -3.13 testes/teste_export.py --casos mogrt` (arquivo de referência `D:/kanivete_testes/mogrt/lower.mogrt`,
cópia do GC CULTSP PRO do Diego Porfírio). Scripts avulsos em `D:/kanivete_testes/scripts/teste_mogrt_*.py`, `mogrt_tempo.py`.

## Formato
`.mogrt` = zip: `definition.json` (campos `clientControls`: id, nome, tipo, valor; `authorApp` aefx|ppro), `thumb.mp4/png`
e `project.aegraphic` (outro zip: `.aep` + `(Footage)/...`). Feito no Premiere = `.prgraphic` (ainda não suportado).
O alvo de cada campo vem do .aep (`comp.motion_graphics_controllers`: `source_comp_id`, `source_layer_id`, caminho da
propriedade). Nomes com acento chegam estragados ("Posi��o"): `_ACENTO` em mogrt.py conserta os comuns.

## Mapeamento (After → editor)
- Comp → Comp (sequência + mídia `comp`, `mgPlano: true`); camada 0 do After = trilha de cima.
- Sólido → Cor sólida (uma mídia por cor); imagem → mídia de imagem; texto de ponto → texto (fonte pelo nome
  PostScript, `vePsdAcharFonte`), a origem do After (linha de base, ponto do alinhamento) vira a âncora (`veMogrtAncTexto`,
  guardada em `c.mgAnc` para recalcular quando o texto muda).
- Transformar: âncora, posição (junta ou separada), escala (X≠Y = `p.sx/p.sy`), rotação, opacidade. Quadros-chave:
  velocidade/influência → Bézier `[x1, y1, x2, y2]` (`_bez`; posição pela distância do caminho).
- Mãe → `c.pai`; fosco → `c.mt` (a camada-fosco oculta no After fica ligada: no editor ela some sozinha).
- Camada com Esticar −100% (saída = entrada ao contrário) → cópia espelhada da Comp ("(volta)", `_espelhar`).
- Taxa: a Comp entra na taxa da timeline (cravada), não nos 29,97 do After.

## Gráficos essenciais
Painel Propriedades da faixa (`veMogrtEssHtml`): texto, ponto, número, escala, cor. O valor vai em `c.ov[idDoCampo]` e a
faixa usa uma variação da Comp (`veCompVariantePara`), como as Propriedades essenciais da Comp: vale só para aquela faixa.
A variação aplica remendos por uid nas Comps de dentro (`ov.__mg`, `veMogrtAplicar`), inclusive na espelhada.

## Plano rápido (etapa 2)
Medido no GC do Diego: a pré-renderização das Comps levava 355 s porque mãe e fosco viram "camada desenhada" (PNG por
quadro). A sequência EFETIVA (`veMogrtPlano`, com cache por assinatura) troca, sem mudar o resultado: mãe parada (sem
quadros-chave e sem rotação) → posição/escala direto na filha; Cor sólida esticada → retângulo (forma); fosco alfa de um
retângulo → efeito Cortar com os lados animados (`animaFF` do crop; ffmpeg: `drawbox` por lado + `sendcmd`), e a camada
só aparece no tempo do fosco. Resultado: 355 s → ~20 s (o render normal das 3 Comps, em segundo plano); a exportação
final leva ~5 s. A Comp guardada continua como a do After (abrir a Comp mostra mãe e fosco).

## Pendências
- MOGRT do Premiere (`.prgraphic`), camadas de forma, máscaras, efeitos do After (Preenchimento, Brilho...), expressões
  (sourceRectAtTime para caixa responsiva), animadores de texto, texto de caixa, 3D/câmera.
- Campos de caixa de seleção, lista e substituir mídia no painel.
- Mãe ANIMADA e fosco que não é retângulo continuam pelo caminho desenhado (certo, mas lento).
- Exportar o próprio MOGRT (modelo do Kanivete com campos).
