# Cor cinematográfica — pesquisa e uso no Luz e Cor

Pesquisa de 24/10/2026. Referências de técnica e fluxo; implementação própria, sem reproduzir o motor do Resolve.

## Fontes e aprendizado

- [Treinamento oficial Blackmagic](https://www.blackmagicdesign.com/products/davinciresolve/training): vídeos Introduction to Color, Advanced Color e Color Management; livro gratuito The Colorist Guide to DaVinci Resolve 20 e arquivos de exercício. A página explica primárias/secundárias, escopos, equilíbrio entre planos, gestão de cor e organização por nós. Não exige comprar um curso para começar.
- [Ferramentas de cor do Resolve](https://www.blackmagicdesign.com/products/davinciresolve/color): fonte técnica primária para rodas, curvas, qualifiers por matiz/saturação/luz, Power Windows, rastreamento, galeria de referências e HDR. A seleção por cor afeta regiões semelhantes; a restrição espacial depende de janelas/máscaras.
- [Lift Gamma Gain](https://www.liftgammagain.com/forum/index.php): fórum de coloristas, com discussões de ferramentas e pós-produção. Serve para acompanhar práticas e problemas reais; opiniões individuais não são especificação técnica.
- [Mixing Light](https://mixinglight.com/): ensino por coloristas, com estudos e formação; verificar acesso de cada material antes de escolher um curso. Não foi necessário assinar nem comprar nada nesta pesquisa.

O roteiro abaixo é uma recomendação para o KANIVETE com base nesses recursos e na inspeção do código local.

## Fluxo sugerido para trabalhar

1. Identificar o material e a entrega: câmera, perfil/gama, espaço de cor e destino. Não deduzir Log apenas da aparência ou extensão do arquivo.
2. Fazer a correção básica: balanço de branco, exposição e contraste; conferir forma de onda e parade RGB.
3. Igualar os planos de uma cena antes de construir o visual; usar um plano de referência e conferir cortes em movimento.
4. Aplicar correções secundárias discretas em cores ou áreas específicas; evitar mudanças bruscas nas bordas e na pele.
5. Construir o visual com curvas e rodas, preservando detalhe e coerência entre planos. Um preset ou uma LUT sozinhos não garantem um resultado cinematográfico.
6. Conferir saturação, extremos e arquivo final no espaço de entrega. A visualização do monitor e o render precisam concordar.

## Base encontrada no KANIVETE

Já há exposição/balanço de branco/contraste e pivô, rodas Lift/Gamma/Gain/Offset, curvas RGB,
Matiz×Sat, Matiz×Matiz, Matiz×Luz, Luz×Sat e Sat×Sat, clareza, nitidez e vinheta.
Os escopos já incluem forma de onda, parade RGB, vetorscópio com referência de pele e histograma.
As contas de cor são compartilhadas por uma LUT entre a prévia WebGL e o FFmpeg.

## Primeira entrega: HSL secundário

Luz e Cor → HSL secundário (seção recolhida inicialmente).

- Cor central: 0/360° = vermelho, 120° = verde, 240° = azul. Os três botões são pontos de partida.
- Alcance: meia largura da faixa de matiz; 180° aceita todas as matizes. A seleção atravessa 0/360° sem emenda.
- Saturação mínima/máxima e Luz mínima/máxima restringem a faixa. Luz aqui é a claridade HSL, `(máximo RGB + mínimo RGB)/2`, não exposição medida em nits.
- Suavidade faz a transição nas bordas de cor, saturação e luz; mínimos/máximos invertidos são ordenados na avaliação.
- Exposição, saturação e rotação da faixa só atuam na seleção. Os ajustes globais são calculados primeiro.
- Alterar a seleção com correções neutras não muda a imagem nem cria outra LUT. Cinzas ficam fora de uma matiz específica.
- As faixas não reconhecem pele, céu ou objetos: áreas com HSL semelhante também serão afetadas. Esta etapa não inclui conta-gotas nem visualização de matte.
- Controles seguem a infraestrutura existente de desfazer, múltipla seleção, persistência e quadros-chave. Restaurar a seção não apaga os ajustes globais.

Os valores entram na LUT 65³ apenas com a correção secundária ativa; o restante mantém o caminho/cache existente.
Não há consulta de IA por quadro nem novos serviços ou dependências. Este caminho continua limitado ao domínio
RGB normalizado existente; não acrescenta gestão de cor Log/RAW/HDR, nem recupera informação já cortada.

Também foi corrigido o arredondamento float32→float16 da textura da prévia: o transporte da mantissa não
avançava o expoente em certos valores, causando diferenças pontuais grandes de um canal em relação ao render.

## Próximos passos recomendados, ainda não implementados

1. Conta-gotas e visualização da seleção; depois referências e comparação entre planos, sem contaminar a exportação.
2. Gestão explícita de entrada/saída para Log e gamut, com processamento float e testes com cartas conhecidas. É a base necessária antes de prometer HDR ou equivalência ao Resolve.
3. Máscaras espaciais com feather e rastreamento, reaproveitando a infraestrutura do editor, para limitar a correção a uma pessoa ou objeto.
4. Compressão de realces/gamut e ferramentas por zonas de exposição no espaço de trabalho adequado.
5. Emulação de filme, grão e halation como escolhas criativas verificáveis, depois da base de cor.

## Código e validação

`frontend/js/editor-lc.js` (painel, seleção e LUT), `frontend/js/editor-fx.js` (parâmetros/persistência/exportação).
`py -3.13 testes/teste_lc_hsl.py`: Chromium isolado no D, sem conectar às portas do app; mede seletividade,
limites, cinza, compatibilidade de valores antigos, serialização/restauração e float16 contra NumPy.
Compara a prévia WebGL com o filtro real `_filtros_fx` do FFmpeg em três configurações de imagem sintética,
incluindo regressão das rodas/curvas globais. Na validação desta entrega: sete testes aprovados,
diferença máxima de 1 nível em 255 e médias de 0,477 / 0,460 / 0,371 nas três configurações.
Saídas em `D:/kanivete_testes/lc_hsl`; a diferença máxima aceita é 3 níveis em 255, média inferior a 1.
O teste não substitui a revisão estética em material real nem valida todo o pipeline HDR/codec.
