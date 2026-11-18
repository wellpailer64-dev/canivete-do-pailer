# Design e fechamento de impressos

Para cartões de visita, panfletos, folders e outras peças impressas, combine as regras gerais de design com a identidade e as instruções confirmadas do cliente. Exemplos de outros clientes são referências, não regras universais. Confira o conteúdo, hierarquia, legibilidade, contraste, alinhamento e respiro no tamanho físico final; preserve o arquivo editável.

## Antes de criar
- Confirme com o cliente ou a gráfica: tamanho final de corte, quantidade, frente e verso, processo (offset ou digital), papel e revestimento, dobras e sentido de leitura, acabamento, cores especiais, prova e especificação de entrega. Diferencie impressão offset do papel offset, que são coisas distintas. Não invente especificações ausentes.
- Peça sangria, margens de segurança, gabarito e distâncias de marcas exigidos, perfil ICC/condição de impressão, padrão PDF/X aceito, resolução e eventuais limites de cobertura de tinta. Se faltarem e o trabalho puder avançar, registre as pendências e confirme antes do fechamento.
- A sangria prolonga imagens e fundos além do corte; a margem de segurança mantém texto, logos e informações essenciais para dentro dele. Elementos que atravessam o corte precisam chegar à extremidade da sangria. Marcas de corte devem ficar fora dela conforme a gráfica. Para cartões frente e verso, confira orientação e posição de ambos os lados; em folders, siga o gabarito de dobras e painéis, inclusive diferenças de largura quando previstas.

## Cores e fechamento
- Em offset, a imagem pode usar separações CMYK e chapas adicionais para cores especiais; confirme tintas, verniz ou faca e como a gráfica quer os arquivos. Prepare cores e imagens no fluxo e perfil ICC solicitados para o papel e a impressão. Não presuma que FOGRA39 sirva para todo papel ou gráfica; não confunda atribuir perfil com converter cores.
- Confira resolução efetiva das imagens no tamanho final (300 ppi é referência comum para imagens de impressão próximas, não regra universal), detalhes finos, pretos, cobertura total de tinta e separações. Texto pequeno preto normalmente pede preto apenas na chapa K; grandes áreas podem pedir preto composto segundo a gráfica. Confira sobreimpressão: branco sobreimpresso pode desaparecer. Peça prova quando cor ou acabamento for crítico.
- Use o PDF/X e as configurações aceitas pela gráfica; PDF/X-4 e X-1a têm requisitos diferentes de cor e transparência. Confira fontes incorporadas ou convertidas conforme o fluxo, cores especiais, transparências, TrimBox/BleedBox, sangria e marcas. A intenção de saída identifica a condição de impressão; por si só não converte as cores. Valide o PDF exportado, não apenas o arquivo editável.
- No Vetor Kanivete consulte `Instructions/vetor-kanivete.md`: fechamento, separações, sobreimpressão e `verificar_pdf`. O Photo trabalha em sRGB; confirme a conversão e o fechamento adequados ao destino. Não afirme que um PDF está pronto para gráfica apenas por ter sido exportado.

## Verniz localizado (padrão, como a FuturaIM pede)
- Antes do envio, confira a central de ajuda atual da gráfica: as instruções publicadas podem mudar, e algumas são antigas.
- Máscara em arquivo à parte da arte, em vetor, com só os elementos que recebem verniz. Sem gradiente, sombra ou lente. Foto: recortar e deixar só a área do verniz.
- Cor da máscara: magenta 100% (M 100) na FuturaIM. Se a cor não estiver certa, o pedido sai só com laminação. Outras gráficas usam K 100% exclusivo: confirmar qual antes de fechar.
- Traço mínimo 0,20 mm e texto mínimo 7 pt (adotado por ser o mais exigente; a fonte pode aceitar 0,09 mm).
- PDF X-1a. Cada lado com sua máscara, nas páginas seguintes à arte.
- O Vetor não gera a máscara sozinho: montar a máscara à parte e conferir no PDF exportado.

Fontes técnicas: Adobe, [marcas e sangria](https://helpx.adobe.com/illustrator/desktop/save-and-export/export-files-to-different-formats/pdf-marks-bleeds-and-color-output-options.html), [intenções de saída](https://helpx.adobe.com/acrobat/using/output-intents-pdfs-acrobat-pro.html), [guia de impressão e cobertura de tinta](https://helpx.adobe.com/content/dam/help/en/indesign/pdf/CS6_PrintGuide.pdf). As especificações da gráfica prevalecem sobre exemplos genéricos.

## Gabaritos e presets da FuturaIM
- Oficiais em `D:/Kanivete/gabaritos/futuraim/<produto>/` (PDF + AI; `indice.json` liga formato, acabamento e link). Fonte: `futuraim.com.br/produto/<slug>?id=<variante>` → `/gabarito/<id>/<arquivo>`.
- Página do PDF = corte + 2× sangria. Sangria: 1 mm em cartão (88×48), panfleto, postal, tag e folder de 1 dobra; 2 mm em adesivo de papel, ímã, etiqueta e folder de 2+ dobras; 1,5 mm em parte do vinil.
- Vetor › Novo documento › categorias "FuturaIM · …" (`VK_NOVO_CAT` em `vetor-novo.js`). Folder = aberto, 2 faces (externa/interna) com guias de dobra iguais (carteira sem guias: painel interno é mais estreito, confira no gabarito). Adesivo redondo = linha de corte magenta na camada "Gabarito · não imprime" (fora do PDF).
- Teste: `teste_vetor.py`, casos "FuturaIM".
