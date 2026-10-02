# AJUSTE PREMIERE: plano para a próxima sessão

Origem: o usuário revisou o projeto "RESPEITE O SEU VOTO" importado pelo Editor Kanivete (2026-10-02, commit 3531df1).
A montagem veio "praticamente intacta", mas há problemas. Ainda não foi feito nada deste plano.
Base técnica (formato, mapeamento atual, limitações): `Instructions/importar-premiere.md`. Código: `Functions/premiere.py`.
Teste: `python testes/teste_premiere.py "<cópia.prproj>"`. Cópia do projeto: `D:\kanivete_testes\premiere\`. **Nunca**
abrir para escrita o original em `D:\01 - ALL IN CLOUD - HD PAILER\11 - DOIS NEGUIM\RESPEITE O SEU VOTO\03 - PROJETO - RESPEITE O SEU VOTO\`.

## Já feito (2026-10-02, rodada rápida)
- Camadas de ajuste: o clipe "Adjustment Layer" (mídia "Black Video") vira mídia `ajuste` na trilha e no tempo certos (39).
  Por enquanto só o Desfoque (Impact Blur / Gaussian Blur → `blur`) é lido. **Falta o Lumetri** (42) e Transform.
- Textos: o texto do `InstanceName` do componente `AE.ADBE Text` vira clipe de texto (6 créditos), com Arial negrito
  e sombra, centralizado a 82% da altura. **Falta** a fonte, o tamanho, a cor e a posição do "Source Text".
- `.aegraphic`/`.mogrt` (Animation Composer) não entram mais como vídeo quebrado: vão para o relatório (10).
  **Falta** trocar pela nossa transição de sobreposição.
- Ainda não começado: o item 1 (clipes trocados e fora do tempo).

## Visto pelo usuário
- ✅ O chroma foi reconhecido como Chroma Key.
- ❌ Clipes às vezes **trocados**: um clipe aparece no lugar de outro.
- ❌ Clipes **fora do tempo** exato do projeto original.
- ❌ **Camadas de ajuste** não vieram, embora o editor já tenha camada de ajuste e boa parte dos efeitos de luz e cor.
- ❌ **Transições de sobreposição** (clipes por cima, ligando um clipe ao outro; exemplo: "Map - Digital 1 v2", um glitch)
  vieram como clipe comum. O editor tem transições de sobreposição próprias (`editor-ovt.js`, inclusive glitch):
  identificar e trocar pela nossa.
- ❌ **Textos** não vieram, embora o editor tenha texto.

## Ordem sugerida (o que mais estraga a montagem primeiro)

### 1. Clipes trocados e fora do tempo (diagnóstico antes de corrigir)
Precisa de uma referência confiável. **Pedir ao usuário:** no Premiere, com a sequência "V1_Respeite o seu voto
Horizontal" aberta, Arquivo > Exportar > Final Cut Pro XML (formato documentado, com clipe, mídia, entrada e saída
exatos), salvo em `D:\kanivete_testes\premiere\`. Depois montar um script que compare, clipe a clipe, por trilha e tempo:
mídia, `st`, `s`, `e` e velocidade. Ele mostra exatamente quais clipes trocam e quanto deslocam.
Hipóteses a verificar:
- **Troca:** a mídia vem de `Clip → Source → Media`. Se a mídia foi substituída no Premiere (Substituir filmagem) ou se há
  proxy, o caminho certo pode estar em outro lugar (MasterClip, `ProxyMedia`?). A deduplicação por caminho em minúsculas
  (`self.midias`) pode juntar arquivos diferentes que acabam com o mesmo caminho resolvido (`FilePath` + nome do
  `RelativePath`). Conferir os `Media` com o mesmo `Title` em pastas diferentes (por exemplo `01 - BRUTO\` e
  `01 - BRUTO\fx30\`).
- **Troca:** sequências "-extended" (`C0096-extended`, `dinheiro-extended`) parecem vir do Generative Extend. Clipes que
  apontam para elas usam a mídia `timeline` aninhada: conferir se o editor mostra a aninhada ou a mídia original.
- **Tempo:** o In/Out está nos ticks da mídia. Com mídia a 29,97 e sequência a 30 (ou o contrário) pode haver
  arredondamento por quadro. Hoje `e` = entrada + duração na timeline × velocidade, e o OutPoint é ignorado:
  comparar os dois.
- **Tempo:** mídia com timecode inicial diferente de zero (as câmeras gravam TC). Ver se o InPoint já desconta o
  início do arquivo ou se precisa subtrair o TC de início (`VideoStream`/`Media`: procurar `StartTime`/`Timecode`).
- **Tempo:** o editor ajusta os clipes a quadros? Ver se `veApplyProject`/`veSeqTracks` "cola" ou arredonda o `st`.

### 2. Camadas de ajuste
- Hoje: mídia sem extensão com Title "Adjustment Layer" é ignorada (39 clipes neste projeto).
- Fazer: virar mídia `ajuste` (kind 'ajuste' no `.vknv`), com clipe na trilha e no tempo certos, e ler os efeitos da
  cadeia dela.
- Efeitos a mapear (ver `VE_FX` em `frontend/js/editor-fx.js` e Luz e Cor em `editor-lc.js`):
  - Lumetri Color: Basic Correction (Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temperature, Tint,
    Saturation) → Luz e Cor. Descobrir os nomes dos Params do Lumetri no XML.
  - Gaussian Blur (inclusive o Impact Blur FX) → `blur`.
  - Tint, Color Emboss, Mirror, Transform: ver quais o editor tem. O Transform (Geometry2) pode virar `p`/`k` do clipe.
- Também aplicar esses mesmos efeitos nos clipes comuns, não só nas camadas de ajuste.

### 3. Transições de sobreposição (Animation Composer etc.)
- O "Map - Digital 1 v2" é um arquivo **`.aegraphic`** do Animation Composer, em
  `...\03 - PROJETO - RESPEITE O SEU VOTO\Animation Composer\Packs\Assets\`. Hoje vira mídia de vídeo, mas o editor nem
  consegue tocar esse arquivo.
- Fazer: detectar pela extensão `.aegraphic` (e pela pasta "Animation Composer"), ou pelo nome, os clipes de
  sobreposição que ficam em cima de um corte. Trocar pela transição de sobreposição mais parecida do editor
  (`editor-ovt.js`: os 15 estilos Mister Horse, Dividir etc.), aplicada no corte embaixo.
- Tabela de nomes → estilo nosso: "Map - Digital" / "Glitch" → glitch; para o resto, montar a tabela olhando os nomes
  dos packs. O que não tiver equivalente entra no relatório.
- Conferir como o editor guarda uma OVT no clipe/corte antes de gerar (ver `editor-ovt.js`).

### 4. Textos
- Os textos são clipes "Graphic" com os componentes `AE.ADBE Capsule` (Graphic Parameters) e `AE.ADBE Text`.
- Pista já achada: o texto aparece legível no `InstanceName` do componente (exemplo: "Poeta&#13;Sérgio Vaz", em
  que &#13; é a quebra de linha). O estilo (fonte, tamanho, cor, posição) deve estar no Param "Source Text" (6 neste
  projeto), provavelmente num bloco base64: decodificar.
- Fazer: criar mídia `texto` e clipe com `tx` (ver `VE_TX_PADRAO` e o formato em `editor-props.js`), com o texto, a
  fonte, o tamanho, a cor, a posição e o tempo. O Motion do gráfico (Vector Motion / Graphic Group) define a posição.
- Se o estilo não der para decodificar, trazer ao menos o texto, com o estilo padrão do editor, e avisar no relatório.

### 5. Depois (se sobrar tempo)
- Legendas da DataTrack (162 itens de CaptionDataClipTrackItem) → `legendas` da sequência.
- Volume de clipe (`Level`) e `ScaleToFramePolicy` (ajustar ao quadro).
- Segundo Ultra Key e ajuste fino da borda do Chroma Key.

## Como validar
- Comparar com o XML do Final Cut exportado pelo usuário (item 1), clipe a clipe.
- `testes/teste_premiere.py` precisa continuar passando. Acrescentar ao teste a contagem por tipo novo (ajuste, texto,
  sobreposição) e, quando houver o XML de referência, a comparação de tempos (tolerância de 1 quadro).
- Prints no app de teste (`--agente=9333`) dos mesmos instantes, com o usuário comparando com o Premiere.
- Lembrete: depois de mexer em `Functions/premiere.py`, **reiniciar** o app de teste. Recarregar a página não recarrega
  o Python, e o conversor antigo continua na memória (isso já confundiu um teste).
