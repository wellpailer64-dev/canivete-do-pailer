# Vetor Kanivete (estilo Illustrator) — estudo de caso, modelo, API e fechamento

Código: `frontend/js/vetor-*.js` (nucleo, ferramentas, paineis, arquivo, api, texto, reguas...), `css/vetor.css`,
`Functions/vetor_kanivete.py` (texto→curvas, Pathfinder, ICC, .aknv), `vetor_importar.py` (PDF/AI/SVG/PPTX),
`vetor_exportar.py` (PDF para gráfica + verificação). Worker: `tools/worker/executor_vetor.js` + `ferramentas_vetor.json`.
Teste: `python testes/teste_vetor.py` (app em `--agente=9333`) — rodar antes de release quando mexer no Vetor.

## 1. Estudo de caso: o que faz o Illustrator ser o Illustrator
O essencial (o que um designer de impressão usa todo dia), e como ficou aqui:

| Illustrator | Por que importa | Vetor Kanivete |
|---|---|---|
| Caminhos Bézier (âncoras + alças), Caneta, Seleção direta | é o próprio "vetor" | `caminho` (subs/pts com alças absolutas); Caneta (clique = canto, arraste = curva, clique no 1º fecha, clique no segmento = novo ponto); Seleção direta (ponto, alça, Alt quebra) |
| Formas (retângulo c/ raio, elipse, polígono, estrela, linha) | 80% de um layout | ferramentas M, L, polígono, estrela, \ (Shift/Alt como no AI) |
| Pranchetas (várias por arquivo) | cartão frente/verso, kit de peças | `pranchetas[]`, ferramenta Shift+O, presets (A4…cartão 90×50) |
| Camadas / subcamadas, travar, ocultar, "não imprimir" | organização e fechamento | `camadas[]` com `visivel`, `trava`, `imprimir` |
| Preenchimento + traço (espessura, ponta, canto, tracejado), opacidade, mesclagem | aparência | painel Propriedades › Aparência (sem múltiplos preenchimentos ainda) |
| Amostras, cores globais e **especiais (spot/Pantone)**, registro | cor de marca exata na gráfica | `amostras[]`; cor `spot` = Separation no PDF com alternativo CMYK; `[Registro]` = /All |
| Degradê linear/radial | arte | `{k:'grad'}` → shading tipo 2/3 em DeviceCMYK |
| Pathfinder (unir, subtrair, interseção, excluir), caminho composto, máscara de corte | construir formas | skia-pathops (Python); Ctrl+8; Ctrl+7 |
| Repetir transformação (Ctrl+D, com cópia = passo e repetição), Transformar cada (Alt+Shift+Ctrl+D), objeto-chave (clicar de novo num selecionado), distribuir espaçamento | diagramação rápida | `vetor-transformar.js`: `repetir` (`vezes`), `transformar_cada` (sx, sy, dx, dy, graus, refletir_x/y, aleatorio, copia, ancora), `alinhar` com `relativo:'chave'` (+`chave`), `distribuir_espaco` (eixo, espaco mm, chave) |
| Construtor de formas (Shift+M; Alt apaga), Pathfinder Dividir/Aparar/Mesclar/Cortar/Menos fundo, Tesoura (C), Faca, Juntar (Ctrl+J), Média (Alt+Ctrl+J) | construir logo | `vetor-construir.js`; regiões atômicas no Python (`regioes`, skia-pathops); comandos `construtor` (`juntar`/`apagar` = pontos), `pathfinder2` (`op`), `tesoura` (x, y), `faca` (`linha`), `juntar`, `media` (`eixo`) |
| Visualização de separações e prévia de sobreimpressão (Alt+Shift+Ctrl+Y) | conferir chapas, faca/verniz/hot stamping, branco sobreimpresso | `vetor-separacoes.js`: chapa por tinta com vazado/sobreimpressão, composto tinta sobre papel pelo ICC, % de tinta no cursor; `separacoes` (`ativo`, `ocultar`, `so`), `tinta_em` (x, y → % e total), `exportar_separacoes` (PNG por chapa) |
| Deslocar caminho, Contornar traço | faca de adesivo, fio em volta do texto, traço → forma | skia-python (Stroker + PathOps): `deslocar` (+ fora atrás, − dentro na frente; cantos miter/round/bevel), `contornar_traco` (com preenchimento vira grupo [preench, traço]; tracejado e pontas entram) |
| Texto de ponto / de área, criar contornos | tipografia | HarfBuzz + fontTools: a tela desenha as MESMAS curvas que vão para o PDF |
| Caractere por trecho (fonte, corpo, track, linha de base, escala H/V, caixa alta, versalete, sobrescrito/subscrito, ligaduras, frações, numerais, cor do trecho); Parágrafo (recuos, 1ª linha, espaço antes/depois, justificar a última) | tipografia de verdade | `vetor-texto.js` + `texto_geometria` (trechos → partes coloridas na tela e no PDF). Selecione o trecho no editor (caixa de texto) e mude no painel; agente: `alterar` com `trecho:"palavra"` (todas as ocorrências, ou `ocorrencia:n`) ou `faixa:[ini,fim]` |
| Caixa de área com altura (arrastar com T), texto sobrando (+ vermelho), encadear caixas (clicar no + e noutra caixa / lugar vazio) | revista, folder, cardápio | `caixa_alt`; `encadear` (`ids` em ordem, ou `nova:{x,y}`), `desencadear`; apagar uma caixa fecha a corrente (a raiz passa o texto adiante) |
| Aparência (vários preenchimentos/traços na mesma forma, cada um com cor, espessura, opacidade, mesclagem, deslocamento, atrás/na frente) e Expandir aparência | contorno duplo em texto, borda de adesivo, logo com camadas | `vetor-aparencia.js`: `aparencia` (acao adicionar/alterar/remover/subir/descer/limpar, tipo preench/traco, cor, espessura, opacidade, deslocar mm, atras), `expandir_aparencia` |
| Efeitos vivos: Cantos arredondados (vetorial), Sombra projetada, Brilho externo, Desfoque | acabamento | `efeito` (tipo sombra/brilho/desfoque/cantos; dx, dy, desfoque, raio em mm; cor, opacidade, mesclagem). Sombra/brilho/desfoque saem rasterizados a 300 ppi NA COR DA TINTA (imagem CMYK ou Separation + SMask com a silhueta desfocada) — só PDF/X-4; o fechamento acusa em X-1a |
| Lápis (N), Pincel (B, com perfil), Pincel de bolha (Shift+B), Borracha (Shift+E), Simplificar | desenho à mão, ilustração, retoque de forma | `vetor-desenho.js`: como o Lápis do Illustrator — reamostra, suaviza (gaussiana), procura cantos DEPOIS de suavizar (só bico > 150° na mão livre) e ajusta cúbicas por mínimos quadrados (Schneider: a curva passa perto dos pontos, dentro do erro → sem tremido); Fidelidade 1 (preciso) a 10 (suave), padrão 6 = erro ≈ 6 px de tela (calibrado com `D:/kanivete_testes/scripts/vetor_tremido*.py`); laço fechado em 4 trechos com tangente contínua; `lapis` (pontos mm, fidelidade mm = erro permitido, suavizar 0-10, fechar, espessura pt, perfil), `simplificar` (tolerancia mm, suavizar), `bolha` (pontos, espessura mm, cor: junta com as formas da mesma cor que encosta), `borracha` (pontos, espessura; selecionados ou todos embaixo) |
| Setas e perfil de largura no traço, ferramenta Largura (Shift+W) | setas de diagrama, traço caligráfico | `alterar` com `seta_ini`/`seta_fim` (seta, triangulo, circulo, quadrado, barra), `seta_esc` %, `perfil` (uniforme, lente, afinar, afinar_inicio, gota, bico ou [[t, larg]]); viram formas (tela = PDF) |
| Setor (pizza/rosca, com vão), Arco, `A`/`T` no `d` do caminho | mosaico de fotos em fatias, gráfico, selo | `setor` (cx, cy, raio, de/ate graus — 0 = 3 h, horário —, raio_interno, vao mm), `arco`; `caminho` com `d` SVG completo (M L H V C S Q T A Z) |
| QR code vetorial | gráfica: QR em vetor, nunca imagem | `qrcode` (conteudo, x, y, tamanho mm com a margem, cor, correcao L/M/Q/H, fundo, margem em módulos — padrão 4, a zona de silêncio que o celular precisa): módulos unidos numa forma só (lib `qrcode`) |
| Ícones (Tabler Icons, MIT, ~5000) | ícones de serviço/contato sem desenhar à mão | `icone` (nome de tabler.io/icons, x, y, tamanho mm, cor, estilo outline/filled, espessura): baixa uma vez para `%APPDATA%/CaniveteDoPailer/icones` |
| Hifenizar (Parágrafo) | texto justificado sem "rios" | `hifen`/`hifenizar` (true = pt_BR, 'en_US'...) no `texto`/`alterar`; pyphen (dicionários do LibreOffice), 6+ letras, 2 antes / 3 depois; só o trecho de letras da palavra |
| Traçado de imagem (Image Trace) | logo do cliente em PNG/JPG → vetor para a gráfica | `vetorizar` (ids da imagem, cores 2-32, detalhe px², precisao px, suavidade, ignorar_fundo, manter_imagem); Python: k-means em Lab + contornos com furos (OpenCV), 1 px de sobreposição entre cores; tela: curvas como o Lápis (cantos achados com suavização leve, lados suavizados entre cantos; laço liso em 4 trechos); cores em CMYK pelo perfil. Menu Objeto |
| Bibliotecas de cor (livros Pantone & cia.) | cor especial exata da gráfica | `vetor-cores.js`: o app NÃO traz livros (dados do fabricante); lê .acb (Adobe Color Book, achados em Program Files/Adobe/*/Presets/.../Color Books) e .ase (Swatch Exchange) postos em %APPDATA%/CaniveteDoPailer/cores. Lab → CMYK alternativo pelo perfil (relativo + BPC). `bibliotecas_cor`, `cores_biblioteca` (busca), `cor_biblioteca` (biblioteca/arquivo, nome "286" ou todas; ids + preench/traco aplica). Aba Amostras › Bibliotecas de cor |
| Recolorir arte | adaptar arte de cliente, trocar CMYK por Pantone | `cores_arte` (cores da seleção ou de tudo, mais usada primeiro), `recolorir` (trocas [{de, para}], tolerancia, tudo): troca em preenchimento, traço, paradas de degradê, trechos de texto, Aparência, efeitos e grupos. Menu Objeto › Recolorir arte |
| Amostras de padrão | estampa, fundo de convite, embalagem | `vetor-padroes.js`: `criar_padrao` (seleção vira a peça; espaco mm; larg/alt; apagar_originais) → amostra; `padrao` (nome, escala %, angulo, dx/dy, traco) ou cor "padrao:Nome" em qualquer comando. Tela: peça renderizada no zoom (createPattern); PDF: tiling pattern VETORIAL (PaintType 1, recursos da página: especiais continuam especiais). Menu Objeto › Criar padrão |
| Salvamento automático e recuperação | confiança: queda não perde trabalho | `vetor-recuperar.js`: a cada 30 s com alteração → JSON em %APPDATA%/CaniveteDoPailer/vetor_recuperacao (escrita atômica; imagens ficam nos arquivos de origem); salvar apaga; novo/abrir com alteração guarda antes (sem diálogo); ao abrir o Vetor, aviso Recuperar/Descartar. `recuperacao` (listar, recuperar uid, descartar uid/todos) funciona sem documento aberto |
| Símbolos | logo repetido, ícones de um kit, etiquetas: edita um, mudam todos | `vetor-simbolos.js`: doc.simbolos = {id: {nome, itens centrados na origem}}; instância {tipo:'instancia', simbolo, m}. `criar_simbolo` (seleção vira símbolo e instância), `colocar_simbolo` (x, y centro mm, escala, angulo), `redefinir_simbolo` (nova arte → todas as instâncias), `soltar_simbolo` (vira grupo), `simbolos`. Menu Objeto |
| Abrir EPS | arquivo antigo de cliente | Ghostscript (AGPL, não vai no app): se instalado (PATH, Program Files/gs, %APPDATA%/CaniveteDoPailer/ghostscript) EPS → PDF (EPSCrop, prepress, cores inalteradas) → importador de PDF; sem ele, mensagem de como instalar |
| Máscara de opacidade | foto esmaecida (fade), vinheta | grupo {opmask, opmask_inv, itens}: luminosidade da máscara = opacidade (branco mostra, preto esconde, fora = escondido). Tela: composição fora do canvas na região, luminosidade normalizada (100K de prova → 0, igual ao PDF); PDF: SMask Luminosity com Form em DeviceGray (só X-4; fechamento acusa em X-1a). `mascara_opacidade` (o de cima vira máscara; inverter), `soltar_mascara_opacidade`. Menu Objeto |
| Tabulações (esq, dir, centro, decimal) com pontilhado | cardápio, tabela de preços, lista | `tabs` no texto/alterar: [{pos mm da margem, alin, guia}] ou "60 dir ., 90 decimal"; sem parada: a cada 36 pt; decimal alinha pela vírgula/ponto; pontilhado numa grade fixa (pontos de linhas diferentes batem). Tab na caixa de edição insere a tabulação; campo Tabs no painel Parágrafo |
| Texto dentro de forma (Área de texto) | texto em balão, estrela, silhueta | `texto_em_forma` (forma fechada vira a área; recuo mm; manter_forma): spec `forma` (subs locais) + `forma_recuo`. Por linha: o trecho livre no topo/meio/base das letras; a leitura desce pelo CENTRO (linha estreita demais no centro é pulada, não salta para um braço; centro fora da forma → o trecho mais largo); palavra que não cabe numa linha estreita desce (hifenização antes). Sobra = + vermelho, encadeia. Menu Texto |
| Distorcer (zigue-zague, áspero, inflar/murchar, torcer) e Brilho interno | selo serrilhado, sol, mancha, botão | `efeito` tipo zigue (tamanho mm, cristas, suave), aspero (tamanho, detalhe /cm, suave; aleatório fixo pelo id), inflar (quantidade %, − murcha), torcer (graus), brilho_interno (desfoque, cor, opacidade). Distorções: vetoriais, nas pinturas (grupo também), PDF = tela, valem em X-1a; brilho interno: raster na cor da tinta, depois do objeto (só X-4) |
| Envelope / deformar (arco, arco inferior/superior, abaulado, concha, bandeira, onda, peixe, elevar, olho de peixe, inflar, espremer, torcer) | título em arco, bandeira, efeito de faixa | `efeito` tipo deformar (estilo, dobra %, dist_h %, dist_v %): vivo, também em TEXTO (não vira curva), grupo e forma; caminhos subdivididos e mapeados na caixa (u, v); PDF = tela; vale em X-1a |
| Mala direta (Variáveis) | crachá, convite com nome, etiqueta numerada | `mala_direta` (csv com ; ou , detectado | linhas, campos {coluna: objeto} ou colunas com o nome do objeto, saida, padrao): texto troca conteúdo, imagem troca arquivo, grupo QR… refaz o QR; cada linha → exportar_pdf (fechamento + verificação) → um PDF só (pikepdf); o documento volta ao original |
| Ampliar foto por IA (super-resolução) | foto pequena do cliente, aviso de ppi baixo | `ampliar_imagem` (ids/nomes; sem: todas abaixo de ppi_alvo 300; escala 2|3|4 automática; tipo foto|arte): Real-ESRGAN ncnn Vulkan (BSD-3, Functions/ampliar_imagem.py), baixado na 1ª vez (~45 MB) para modelos_ia/ampliar, cache; mesmo tamanho na página, o ppi multiplica. Correção de 1 clique do aviso de resolução no Fechamento |
| PDF com texto editável | PDF digital, proposta, arquivo que o cliente vai copiar | `exportar_pdf` com `texto_editavel: true` (caixa no diálogo): Type0/Identity-H, cada glifo com a MESMA matriz da geometria da tela (kerning, justificado, trilha), fonte em subconjunto (fontTools, retain_gids) + larguras + ToUnicode (hífen automático = "-"); texto com degradê/padrão/traço/efeito/aparência continua em curvas. Para gráfica o padrão segue curvas |
| Malha de degradê (Gradient Mesh, U) | sombreado realista (gota, fruta, tecido) | `vetor-malha.js`: {tipo:malha, nos (grade pt), cores (grade)}; `criar_malha` (forma, linhas, colunas, clarear %: recortada pela forma), `malha_no` (id, i, j, cor, x, y); ferramenta U: clique na forma cria, clique no nó pinta com o preenchimento atual, arraste move. Tela: fatias de ~3 px num canvas em cache; PDF: ShadingType 6 (Coons, bordas retas), CMYK, vale em X-1a |
| Estilos visíveis na edição de texto | ver o trecho colorido/negrito enquanto digita | espelho por trás da caixa de digitação (mesma fonte, quebra e rolagem; texto da caixa transparente, só cursor e seleção): cor de cada trecho, negrito por sombra fina (não muda a largura: cursor alinhado); o digitado herda o trecho de antes |
| Texto em caminho | selo, logo circular | ferramenta Texto em caminho (clique no caminho); `texto_caminho` (`ini` mm, `lado`, `manter_caminho`) |
| Estilos de parágrafo / caractere, Glifos, juntar textos importados | padronizar, caracteres especiais, editar .ai/PDF | `estilo_texto` (tipo, nome, `de`, `aplicar`; mudar um estilo atualiza quem usa), `estilos_texto`, `glifos`, `inserir_texto` (`codigo`/`texto`, `pos`), `juntar_textos` (linhas → parágrafos; `quebras:'linhas'`) |
| Alinhar/distribuir, guias inteligentes | precisão | caixa pelos extremos reais da cúbica (não pelas alças); encaixe magenta |
| Réguas (Ctrl+R), guias arrastáveis (Ctrl+; mostrar, Alt+Ctrl+; travar), grade (Ctrl+'; Shift+Ctrl+' encaixar) | diagramação | `vetor-reguas.js`: réguas em mm com origem na prancheta ativa; arrastar da régua cria guia, soltar na régua apaga; `guia` (eixo x/y, pos mm; acao mover/apagar/limpar), `exibir` (reguas, guias, travar_guias, grade, encaixar_grade, passo_grade, sub_grade); guias e grade entram no encaixe |
| Colocar imagem (link), resolução efetiva | fotos no layout | `imagem` com `m`; ppi efetivo no painel e no fechamento |
| Sobreimpressão, separações, perfil de cor (CMYK + ICC) | **impressão profissional** | sobreimprimir por objeto (OP/op/OPM 1); prova de cor pelo perfil de saída (FOGRA39…) na tela |
| Salvar como PDF/X-1a / PDF/X-4, marcas e sangria, Empacotar | **fechamento de arquivo** | Exportar › PDF para gráfica (abaixo) + aba Fechamento; Arquivo › Empacotar = `pasta/<nome>/` com .aknv, PDF X-4, Links/, Fontes/, Relatório.txt |
| Abrir PDF/AI/SVG/EPS | trabalhar com arquivo de cliente | PDF/AI (compatível com PDF), SVG, PPTX (EPS: não) |

`.aknv` abre no KANIVETE por duplo clique (associação HKCU em Functions/projeto.py; roteado em `abrirProjetoExterno`).

- Aparência em grupo (contorno/preenchimento extra no conjunto); prévia de separações e `tinta_em` com efeitos, Aparência, malha, símbolos, máscara de opacidade e padrões; SVG com `<filter>` (sombra, brilho, desfoque), `<pattern>`, `<mask>`, símbolos e malha.
- Vínculos (aba): cada imagem com ppi efetivo, modo, usos e estado (ok / mudou / sem_original / faltando, pela assinatura sha1 do original); `vinculos`, `revincular` (mantém largura e posição), `atualizar_vinculo` (sem alvo: todas as alteradas). `frontend/js/vetor-vinculos.js`.
- EPS: sem Ghostscript, o `abrir` baixa o oficial (~65 MB, uma vez) para %APPDATA%/CaniveteDoPailer/ghostscript — extrai com 7-Zip (sem admin) ou instalador silencioso (`baixar_ghostscript` em vetor_importar.py; `baixar_ghostscript: false` desliga).
Ainda NÃO (pendências): nada aberto do levantamento de 2026-10-04.

## 2. Modelo (pt = 1/72", y para baixo)
```
doc = {nome, unidade:'mm', modoCor:'cmyk'|'rgb', perfil:'FOGRA39'|'FOGRA29'|'GRACOL'|'SWOP', sangria (pt),
       pranchetas:[{id,nome,x,y,w,h}], camadas:[{id,nome,visivel,trava,imprimir,itens}] (0 = embaixo),
       amostras:[{id,nome,cor}], imagens:{id:{arquivo,w,h,modo,alfa,url}}, guias:[]}
caminho {tipo,subs:[{fechado,pts:[[x,y,inX,inY,outX,outY]]}],regra:'nonzero'|'evenodd',preench,traco:{cor,larg,cap,junc,miter,tracejado,fase},op,bm,sobre:{p,t}}
texto   {tipo,conteudo,fam,estilo,tam(pt),entrelinha|null,track(1/1000 em),alin:esq|centro|dir|just|just_tudo,caixa(pt)|null,caixa_alt(pt),m:[a,b,c,d,e,f],preench,traco,
         desl,eh,ev,maius:alta|versalete,pos:sup|sub,liga,frac,num, recuo_esq,recuo_dir,recuo_1a,antes,depois (pt),
         trechos:[{ini,fim,<os de caractere>,preench,traco:{cor,larg}|null,ec}], ep (estilo ¶), anterior/seguinte (encadeado: o texto mora na raiz),
         trilha:{ini,lado} + subs (a trilha, em pt do DOCUMENTO: a Seleção direta edita; o spec manda a versão local) (texto em caminho); forma:true + subs (texto em forma, idem)}       doc.estilosTexto = {par:{nome:{...}}, car:{nome:{...}}}
         A tela monta o spec (vkTxSpec: encadeado resolvido) e manda junto na exportação (`_spec`): PDF = tela.
qualquer objeto: aparencia:[{tipo:'preench'|'traco',cor,larg,cap,junc,tracejado,op,bm,desloc(pt),atras,visivel}] (caminho/texto),
         efeitos:[{tipo:'sombra'|'brilho'|'desfoque'|'cantos',dx,dy,desfoque,raio (pt),cor,op,bm,visivel}];
         na exportação a tela manda as pinturas prontas (`_pint`, pt do documento) e a silhueta dos efeitos (`_silh`).
imagem  {tipo,img,m}  (m leva pixel → pt; ppi efetivo = 72 / escala)      grupo {tipo,itens,clip} (clip: itens[0] = caminho de corte)
cor     {k:'cmyk',v:[c,m,y,k] 0-100} | {k:'rgb',v:[r,g,b]} | {k:'spot',nome,v:[cmyk alternativo],tint} | {k:'reg'}
        | {k:'grad',tipo:'lin'|'rad',a,b,f,r,paradas:[{p,cor}]}  (coordenadas do documento)
```
Transformar caminho = assar os pontos; texto/imagem acumulam `m`; degradê acompanha. `.aknv` = zip com documento.json + imagens/.

## 3. API — a interface, o Claude e o Worker usam os MESMOS comandos
Tudo que muda o documento é `vkCmd(nome, args)` (histórico, Ctrl+Z, log, aviso roxo "Claude:/Worker:"). Porta:
```js
await VKN.cmd('novo', {nome:'Cartão', larg:90, alt:50, sangria:3, perfil:'FOGRA39'})
await VKN.cmd('retangulo', {x:-3, y:-3, larg:96, alt:56, preench:'C100 M0 Y0 K0', traco:'nenhum', nome:'fundo'})
await VKN.cmd('texto', {conteudo:'Ana Souza', x:6, y:20, fonte:'Montserrat', estilo:'Bold', tamanho:14, preench:'100K', nome:'nome'})
await VKN.cmd('alinhar', {nomes:['nome'], modo:'centro_h', relativo:'prancheta'})
VKN.mapa()                          // resumo do documento (ler isto em vez de print)
VKN.fechamento({padrao:'x4'})       // erros/avisos com o comando que corrige
await VKN.exportarPdf('D:/.../cartao.pdf', {padrao:'x4'})   // → {verificado, problemas, info:{cores, spots, versao}}
```
Unidades de agente: **mm relativos ao canto da prancheta** (`prancheta: nome|id|nº`, senão a ativa); texto em pt;
`un:'pt'` = pontos absolutos (a interface usa). Alvos: `ids` ou `nomes` (sem = seleção). Cores em texto:
`#ff0000`, `C0 M100 Y100 K0`, `100K`, `cmyk(0,100,100,0)`, `spot:PANTONE 286 C:100,75,0,0[:tint]`, `registro`, nome de amostra, `nenhum`.
Comandos (`VKN.comandos()`): novo, documento, abrir, importar, salvar, exportar_pdf, exportar_imagem, exportar_svg,
retangulo, elipse, poligono, estrela, linha, caminho (`d` SVG em mm ou `subs`), texto, imagem, alterar, mover,
posicionar, redimensionar, girar, refletir, matriz, alinhar, distribuir, organizar, agrupar, desagrupar, mascara,
soltar_mascara, composto, pathfinder, deslocar (`distancia` mm, `junc`), contornar_traco, repetir, transformar_cada, distribuir_espaco, construtor, pathfinder2, tesoura, faca, juntar, media, separacoes, tinta_em, exportar_separacoes, contornos, empacotar (`pasta`, `pdf`, `fontes`), setor, arco, qrcode, icone, vetorizar, bibliotecas_cor, cores_biblioteca, cor_biblioteca, cores_arte, recolorir, criar_padrao, padrao, criar_simbolo, colocar_simbolo, redefinir_simbolo, soltar_simbolo, simbolos, recuperacao, mascara_opacidade, soltar_mascara_opacidade, degrade (tipo, cores|paradas, angulo, traco), mesclar (2 caminhos, passos; VIVO por padrão: grupo {mescla:{passos, espinha}, itens:[A,B]}, passos calculados na hora — mexer em A/B refaz; espinha = caminho que segue; vivo:false = assado), mescla (passos, espinha|null), expandir_mescla, ferramenta Degradê G (arraste; Alt = radial; mantém as cores do degradê), aparencia, efeito, expandir_aparencia, lapis, simplificar, bolha, borracha, texto_caminho, encadear, desencadear, estilo_texto, estilos_texto, juntar_textos, glifos, inserir_texto, duplicar, apagar, selecionar, mover_para_camada, nova_camada, camada,
nova_prancheta, prancheta, mover_prancheta, amostra, cores_padrao, definir_subs, converter_cmyk, preto_texto,
sobreimprimir_preto, tirar_sobre_branco, engrossar_tracos, limpar, mapa, info, ajuda.
Fonte "Arial Bold" (família + estilo juntos) é entendida. Só `preench` informado = sem traço.

Worker: `"app": "vetor"` (tools/worker/worker.py), objetos pelo NOME, condições `existe|cor|traco|texto|tamanho|x|y|larg|alt|sobreimprimir:NOME=valor`,
`sem:NOME`, `objetos:N`, `fechamento_ok:x4`, `exportado`. Ver `Instructions/agente/worker.md`.

## 4. Fechamento de arquivo (o protocolo da gráfica)
**Exportar PDF** (`vetor_exportar.py`), por padrão:
- **PDF/X-4:2010** (recomendado): PDF 1.6, transparência viva, imagens RGB com perfil sRGB embutido (o RIP converte),
  OutputIntent GTS_PDFX com o ICC de saída embutido, XMP com `pdfxid:GTS_PDFXVersion`, DocumentID/VersionID/RenditionClass, Trapped=False.
- **PDF/X-1a:2001**: PDF 1.3, só CMYK + especiais; imagens RGB convertidas pelo perfil (perceptual); transparência/mesclagem
  NÃO saem (o fechamento acusa erro antes); GTS_PDFXConformance.
- **PDF CMYK** (gráfica rápida) e **PDF digital RGB** (sem marcas, sem sangria).
Sempre (impressão): texto em **curvas** (a mesma geometria da tela; sem depender de fonte na gráfica), RGB vetorial →
CMYK pelo perfil (preto puro → 0/0/0/100), especiais como Separation (ou "converter especiais em CMYK"), sobreimpressão
com OPM 1, **TrimBox** = prancheta, **BleedBox** = + sangria (3 mm), **marcas de corte** 0,25 pt em cor de registro
começando fora da sangria. Depois de gravar, o PDF é **relido** (`verificar_pdf`): caixas Trim ⊂ Bleed ⊂ Media,
OutputIntent, /ID, cores usadas (sem RGB onde não pode), transparência em X-1a, fontes (0 = tudo em curvas).

**Perfis**: FOGRA39 (couché/coated — padrão no Brasil), FOGRA29 (offset/não revestido), GRACoL 2006, SWOP. Procura em
`%APPDATA%/CaniveteDoPailer/icc` e na pasta de cores do Windows (`CoatedFOGRA39.icc`, `ISOcoated_v2_eci.icc`...). Sem
perfil, PDF/X recusa (X exige o perfil embutido); PDF CMYK sai com conversão simples.

**Regras do fechamento** (aba Fechamento; `VKN.fechamento()`), com correção de 1 clique quando dá:
| código | nível | regra |
|---|---|---|
| rgb / modo_rgb | erro / aviso | cor RGB em peça de impressão → `converter_cmyk` (pelo ICC) |
| fonte | erro | fonte não instalada (sairia em Arial) |
| traco_fino | erro | traço < 0,25 pt → `engrossar_tracos` |
| branco_sobre | erro | branco com sobreimpressão some → `tirar_sobre_branco` |
| transparencia, imagem_alfa | erro (X-1a) | X-1a não aceita: exporte X-4 |
| resolucao / resolucao_baixa | erro < 150 ppi / aviso < 250 | ppi efetivo no tamanho final (ideal 300) |
| link | erro | imagem faltando |
| tac | aviso | tinta total > 300% (260% em FOGRA29) |
| preto_rico | aviso | texto < 14 pt em preto de 4 cores → `preto_texto` (100K) |
| preto_sem_sobre | aviso | texto 100K pequeno sem sobreimprimir → `sobreimprimir_preto` |
| texto_pequeno | aviso | < 6 pt |
| sangria | aviso | fundo/imagem encosta no corte mas não chega na sangria (filete branco) |
| margem | aviso | texto a menos de 3 mm do corte |
| pontos_soltos | aviso | caminhos de 1 ponto → `limpar` |
| sem_sangria | aviso | documento sem sangria |
Exportar com erro pede confirmação (agente: `forcar: true`).

## 5. Abrir arquivos de fora (`vetor_importar.py`)
- **PDF/AI**: interpretador do content stream (pikepdf): caminhos, `re`, cores exatas (g/rg/k, cs/scn com ICCBased,
  Separation → especial com o alternativo avaliado pela função tipo 2/3/0/4, DeviceN de processo → CMYK, Indexed),
  ExtGState (opacidade, mesclagem, sobreimpressão), W n → grupo de corte, `sh` e padrão de sombreamento 2/3 → degradê
  (o par "corte + sh" do Illustrator vira um caminho com degradê), imagens (CMYK fica CMYK em TIFF; SMask vira alfa),
  Form XObjects, **camadas do Illustrator** (`/OC` BDC → camadas com o nome). Texto: PyMuPDF (fonte, tamanho, posição,
  direção) com a cor do operador de texto mais próximo no content stream; nome PostScript → família instalada
  (Helvetica → Arial...). `.ai` sem conteúdo PDF → avisa para salvar com "Criar arquivo compatível com PDF".
  **Fontes não instaladas**: usa as EMBUTIDAS no arquivo (TrueType: subconjuntos do mesmo nome são juntados; CFF puro
  como o MyriadPro vira OTF) → `doc.fontes`, vão dentro do .aknv; o texto fica idêntico e editável, mas só com as letras
  que o original tinha (fechamento: aviso `fonte_embutida`). Imagens: lidas SEM a máscara do pikepdf (ele converteria
  CMYK→RGB sem perfil); CMYK com transparência continua CMYK e a máscara fica num PNG ao lado (`imagens[id].mascara`),
  usada na tela, no .aknv, no Empacotar e como SMask no PDF/X-4. **Dados nativos do .ai** (AIPrivateData, Zstandard
  ou zlib; só os primeiros 16 MB): nomes das pranchetas e cores especiais declaradas (viram amostras).
  Cor: tela e conversões em Colorimétrico Relativo + compensação de ponto preto (igual ao padrão da Adobe; RGB→CMYK→tela
  volta igual). Conferência com arquivos reais: `D:/kanivete_testes/scripts/vetor_comparar_ai.py` (render do PDF
  embutido × Vetor) e `vetor_ida_volta.py` (abrir → mexer → .aknv → PDF/X-4 → reabrir).
- **SVG**: lxml + parser próprio de `d` (inclui arcos A), formas, estilos (atributos, `style`, `<style>` com `.cls-N`
  do Illustrator), herança, transform, degradês (objectBoundingBox e userSpaceOnUse, href), clipPath, `use`/`symbol`,
  texto/tspan, imagem (data: ou arquivo). `<g id="Layer_1">` no topo vira camada. Unidades: px 96 dpi → pt.
- **PPTX**: slide = prancheta; formas preset (retângulo, arredondado, elipse, triângulos, losango, polígonos, linha),
  forma livre (custGeom), cores do tema (incl. `sysClr` e estilo da forma fillRef/lnRef/fontRef), degradê, linhas,
  caixas de texto (inset, alinhamento, fonte do tema +mj/+mn), imagens, grupos (chOff/chExt), rotação/espelho, fundo.
  Gráficos/tabelas/SmartArt e cortes de imagem → relatório.
O que não vira objeto entra no `relatorio` (mostrado ao abrir).

## 6. Testes e histórico
- `testes/teste_vetor.py`: cartão pelos comandos, aparência/efeitos (PDF com efeitos na cor da tinta), texto (trechos, parágrafo, encadear, caminho, estilos, juntar, glifos, PDF), Pathfinder, alinhar, fechamento + correção, desfazer, PDF X-4 e X-1a
  verificados com a cor especial preservada, PNG, salvar/reabrir .aknv, abrir PDF/SVG/PPTX, SVG → CMYK, sem erro de JS.
- Mouse de verdade: `D:\kanivete_testes\scripts\vetor_mouse.py` (retângulo, mover, elipse, caneta, texto, copiar/colar, desfazer);
  `vetor_desenho_ui.py` (lápis, pincel, bolha, borracha, Largura, seta pelo painel); `vetor_texto_ui.py` (caixa com altura, + vermelho → encadear, texto em caminho, trecho no painel).
- 2026-10-04 v1: Worker `VETOR_FLYER_03` (flyer A6 do zero, alinhar, fechamento, PDF/X-4) — 8 operações, 0 erros, 20 s.
  Lições: o modelo manda "Arial Bold" como fonte (agora entendido); exportar_pdf precisa estar nas finais do worker.py.

## 7. Desafio: flyer "webmart" refeito do zero (2026-10-04)
Referência de agência (Illustrator) refeita só pelos comandos (`D:/kanivete_testes/flyer_webmart/montar.py`, fotos geradas
pelo FLUX local com semente fixa em `gerar_fotos.py`; `comparar.py` = referência × PDF). Técnicas que fecharam a peça:
- faixa verde = retângulo ∪ círculo e **Deslocar +9 / −9 mm** (fechamento morfológico: arredonda só os cantos côncavos — a
  "concordância" do Illustrator); foto do escritório + retângulo em modo **cor** + outro em **multiplicação**, dentro de máscara
  com a cópia da faixa;
- mosaico = **setores** com vão sobre disco branco, cada foto mascarada pelo seu setor (`organizar frente` + `mascara`);
- pílulas = `caminho` com arco + efeito **cantos arredondados** na ponta; listras = duplicar + **repetir (Ctrl+D)**;
  título de 2 cores = **trecho**; ícones **Tabler**; **QR** vetorial; parágrafo **justificado com hifenização**.
Limitações achadas → corrigidas na hora: arco `A` no `d` (não existia), QR code, ícones, hifenização, `repetir` só devolvia a
última cópia (`novos` = todas), fontes do usuário procuradas só por `LOCALAPPDATA` (agora registro HKCU + perfil real), e o
fechamento pegou fatias passando 1 mm do corte sem chegar na sangria (aviso certo: fatias ajustadas).
Ainda não: ampliar foto por IA (o gerador vai até 2048 px → 224 ppi na faixa: aviso `resolucao_baixa`), ferramenta de degradê na arte e Blend.

## 8. Desafio: identidade visual completa "MARÉ" (2026-10-04)
Manual de marca fictício feito só pelos comandos: `D:/kanivete_testes/idv/montar.py` (`--final` grava .aknv, PDF e PNGs na
pasta pedida), fotos de direção pelo FLUX local (`gerar_fotos.py`). 16 pranchetas 16:9 (320×180 mm) nomeadas: capa,
conceito, logotipo, construção/área de proteção/redução mínima, versões, usos incorretos, tipografia, paleta (CMYK/RGB/HEX/
Pantone ref., largura = proporção de uso), elementos (padrão de ondas + ícones), fotografia, tom de voz (diga × evite), grid,
papelaria, embalagem, digital, contracapa. Estrutura tirada de manuais bem avaliados (Behance/guias de brand guidelines):
o que costuma faltar em manual amador é **tom de voz, direção de fotografia e grid** — sempre incluir.
Técnicas: símbolo = elipse − fenda (caminho com traço → `contornar_traco` → `pathfinder subtrair`) e girar; tagline com
tamanho medido para casar com a largura da palavra; amostras globais com os nomes da marca; **sem tagline na redução mínima**.
Limitações achadas → corrigidas: `info`/caixas mediam pela prancheta ATIVA (com várias pranchetas, a tagline caía em outra
página e o grupo girava em torno de um centro errado) — agora pela prancheta que contém o objeto; Worker não achava
objeto criado sem nome (o erro agora lista os sem nome com id e tamanho) e gravava `.pdf.pdf`; gerador FLUX falhava sem VRAM
com o Qwen do Worker carregado (agora descarrega os modelos do Ollama antes de gerar).
Para peça de tela (manual, apresentação): exportar PDF com `marcas: false` (os avisos de traço fino / texto < 6 pt /
sem sangria do fechamento são de gráfica). Documento de tela: `novo {destino:'tela'}` (ou Cor RGB na janela) = sem sangria, fechamento e PDF digitais (`vkPadraoDoc`).

## 9. 3D, mapear arte, retocar letra e IDV v2 (2026-10-04)
`frontend/js/vetor-3d.js` (Efeito › 3D e Materiais do Illustrator), tudo vetorial e de gráfica:
- `girar_3d` (revolve): perfil = metade do contorno, eixo na borda esquerda (`eixo:'dir'` = direita). Frente e fundo viram
  **malhas de degradê** sombreadas (Coons no PDF, vale em X-1a); o fundo mostra o interior do copo. Retângulo como perfil = lata.
- `extrudar_3d`: forma fechada → laterais (só as voltadas para quem olha, ordenadas por profundidade) + face com leve degradê.
- parâmetros: `inclinar` (+ mostra o topo), `girar`, `rolar`, `perspectiva` 0–100, `material` fosco|papel|plastico|ceramica|metal
  (reflexo do ambiente em faixas)|vidro, `luz` %, `luz_ang`/`luz_alt`, `volume` (bordas escurecem), `sombra_chao` (sombra suave +
  sombra de CONTATO — é ela que assenta o objeto), `grao` % (padrão "Grão 3D" em multiplicação), `cor`, `cor_lado`, `profundidade`.
- `mapear_arte` {id3d, arte, y|angulo|escala | face frente/direita/esquerda/topo/base, dx, dy}: a arte acompanha a superfície
  (girar: x → ângulo pelo raio na altura; presa na borda visível; extrudar: plano da face, texto da lateral corre na
  profundidade). Textos viram curvas na hora. Sombra sobre a arte = malha de preto em multiplicação **relativa ao ponto
  mais claro do rótulo** (a cor verdadeira aparece onde a luz bate). `editar_3d` refaz com a arte guardada; `expandir_3d`.
- Painel Propriedades › 3D (sliders) e menu Objeto › 3D.
- `retocar_letra` {letra|faixa|trecho, rot, escala, subir, espaco, cor} = ferramenta Retocar tipo: o texto segue editável
  (motor: `rot` por glifo em `_desenhar`, girando no meio da largura sobre a linha de base).
IDV v2 (`D:/kanivete_testes/idv/marca.py` + `montar2.py`): símbolo = disco cortado por onda com vão (pathfinder: interseção/
subtração com a faixa contornada); logotipo = Playfair Bold em curvas, tracking −25, acento trocado pelo sol (subcaminho mais
alto removido com `definir_subs`); diagramação editorial (número de seção grande, grid, sumário); mockups 3D sobre fotos FLUX
(mesa com luz lateral; areia com sombra de coqueiro para flat lay). Lições: criar a arte DENTRO da página antes de medir
(`info` mede pela prancheta que contém o objeto); faixa mapeada ≤ meia volta; sombra de contato sempre.

## 10. Troca de arquivos, ferramentas que faltavam e saída para telas (2026-10-04)
**Troca com o mercado** (`Functions/vetor_saida.py`, `frontend/js/vetor-saida.js`):
- `exportar_ai`: PDF compatível com o Illustrator (texto editável, sem marcas, CMYK ou RGB conforme o documento) com o `.aknv`
  ANEXADO (`vetor_kanivete.aknv`); uma prancheta por arquivo (o Illustrator abre PDF de várias páginas pedindo a página;
  `separadas:false` junta). O Vetor reabre `.ai/.pdf` próprios pelo anexo = fidelidade total (`aknv_anexado`).
- `exportar_eps`: PDF da prancheta → Ghostscript `eps2write` (texto em curvas), Ghostscript baixado sob demanda.
**Saída para telas**: `exportar_ativos` {pasta, alvo pranchetas|selecao|ids/nomes, formatos png@1x/2x/3x, jpg, webp, svg, pdf,
margem, prefixo, fundo}; 1x = 1 pt → 1 px. Arquivo › Exportar ativos para telas (Alt+Shift+Ctrl+E).
**Ferramentas novas**:
- Pincéis (`vetor-pinceis.js`): `criar_pincel` arte|padrao|dispersao (escala, espaco, aleatorio, girar, colorir 'tom'),
  `pincel` {ids, nome|null} VIVO (vkApBase: editar os pontos refaz), `expandir_pincel`, `pinceis`. Espessura do traço multiplica.
- Marionete: `marionete` {pinos, destinos} (MLS rígido) em caminhos/grupos.
- Grade de perspectiva (`vetor-perspectiva.js`): `grade_perspectiva` (1 ou 2 pontos, câmera pinhole; no canto 1 mm = 1 mm),
  `perspectiva_colocar` {plano esquerdo|direito|chao, u, v, escala}, `perspectiva_retangulo`, `perspectiva_caixa`. Grade na tela
  (azul/laranja/verde). Exibir › Grade de perspectiva; Objeto › Perspectiva: colocar no plano.
- 3D: `chanfro` (mm) no extrudar_3d (rampa iluminada; recuo por normal média — cantos côncavos aproximados).
- Tipografia: `desvio_texto` (Contorno de texto: objetos acima afastam o texto de área; a linha usa todos os vãos, esquerda →
  direita), `colunas` {n, medianiz} (caixas encadeadas), fontes variáveis (`eixos: {wght, wdth, opsz...}`, `peso`,
  `fonte_eixos`, Texto › Fonte variável…; no PDF com texto editável a fonte variável sai em curvas, fiel). Ferramenta
  Largura já existia (Shift+W).
- Produção (`vetor-producao.js`): `faca_caixa` (abas invertidas: CutContour + Vinco em sobreimpressão na camada Faca,
  devolve os painéis em mm), `pintura_dinamica` {pontos, cor} + ferramenta Pintura dinâmica (K).
Ainda não: oclusão própria no girar 3D (perfil que se esconde atrás de si), marionete interativa com pinos na tela.
## 11. Cena, revisor e modo curto (2026-10-05) — economia de tokens
- `cena` / `VKN.cena(html, {prancheta|nova:{nome,larg,alt}, paleta:{hex: cmyk}, css, limpar})` (`vetor-cena.js`): o
  navegador diagrama numa área escondida do tamanho da prancheta (1 px CSS = 1 pt) e cada elemento vira objeto nativo —
  fundo/borda (lados separados viram filetes)/raio/elipse (`data-forma`), degradê linear, box-shadow, opacity, texto
  editável na mesma linha de base (várias linhas = texto de área; `<span>/<b>/<em>` = trechos), `<img data-arquivo>` com
  object-fit, `data-icone`, `data-qr`, `data-simbolo="Nome"` (símbolo do documento encaixado na caixa), `data-grupo`,
  `data-nome`. Reset de CSS com `:where()` (não vence as classes da página). Rodar de novo troca só o que a cena criou.
- Fonte variável sem arquivo por peso (Inter): o motor converte o estilo (SemiBold, Light...) no eixo `wght` sozinho.
- `tools/vk_cena.py` + `marca.json` (cores hex+cmyk viram `var(--nome)` e a paleta; fontes `var(--titulo)`/`var(--texto)`).
  Kit da marca = documento com os símbolos (assinaturas, logotipo, símbolo, versões negativas): `D:/kanivete_biblioteca/marcas/<marca>/`.
- `revisar` / `VKN.revisar()` (`vetor-revisor.js`): solto, fora, transborda, sobreposto, contraste (WCAG 4,5/3 com a cor
  real abaixo do texto), margem, pequeno, vazio, prancheta vazia; agrupa ocorrências iguais; erro × aviso.
- `VKN.curto = true` ou `{curto: true}`: comandos devolvem só id/ids/caminho/contagens.
## 12. Ponte Vetor ↔ Photo (2026-10-05) — `frontend/js/ponte-vetor-photo.js`
Os dois programas rodam na mesma página, então o Photo rasteriza com o PRÓPRIO renderizador do Vetor (troca VK.doc por um
instante; efeitos, 3D, pincéis e texto saem iguais à tela do Vetor).
- **Vetor → Photo**: `enviar_photo` {ids | prancheta, novo} (Arquivo › Enviar ao Photo) cria camada **objeto inteligente
  vetorial**: `L.vetor = {doc (cópia do documento), alvo {ids|prancheta, rect pt com folga p/ efeitos}, res (px/pt)}`,
  `L.c0` = arte rasterizada, `L.tf` = posição/escala. Ampliar/reduzir muito (qualquer rota — API, Transformar, girar —
  passa por `ieCamadaMudou`) rasteriza de novo na resolução nova (nunca pixeliza). Filtros inteligentes ficam por cima.
- **Editar conteúdo no Vetor** (Camada › Objetos inteligentes; `KNV.editarNoVetor()`): abre o documento da camada no
  Vetor com aviso roxo; **Ctrl+S / `devolver_photo`** devolve à camada (mesma posição, filtros mantidos) e o documento do
  Vetor que estava aberto volta. Salvar o .iknv guarda o `L.vetor` (reabre editável).
- **Photo → Vetor (vínculo vivo)**: Camada › Objetos inteligentes › Enviar documento ao Vetor (`KNV.enviarAoVetor(iknv)`):
  salva o .iknv, grava `<nome>.vinculo.png` (composto) e coloca no Vetor como imagem vinculada no tamanho físico
  (ppi do Photo) com `im.iknv`; cada salvamento do .iknv reescreve o PNG → Vínculos marca "mudou" (Atualizar) e tem o
  botão **Photo** (abre o .iknv).
- Teste: `python testes/teste_ponte.py` (9 conferências + sem erro de JS; rodar antes de release quando mexer na ponte,
  no objeto inteligente do Photo ou no renderizador do Vetor). Falta (plano): mockup fotográfico (F3) e recursos
  comuns (F4) FEITO: `gerar_imagem` no Vetor (Z-Image local, entra como vínculo; Arquivo › Gerar imagem com IA) e
  `marca_amostras` {marca: marca.json} (amostras nomeadas da marca).
## 13. Render fotorrealista no Blender (2026-10-05)
`render_blender` {ids|nomes (objetos 3D), largura px (padrão 1600), amostras (96), fundo (null = transparente),
substituir (padrão true: oculta o 3D vetorial), colocar, pasta} — Objeto › 3D: Render fotorrealista (Blender).
- Blender 4.5 LTS portátil (GPL, à parte, ~400 MB) baixado sob demanda para `<app>/modelos_ia/blender/`
  (`Functions/blender_render.py`); roda sem janela: `blender -b --factory-startup -P Functions/blender_cena.py -- cena.json`.
- A cena é montada no JS (`vetor-blender.js`) no MESMO espaço do 3D vetorial: vértices no espaço do objeto do Vetor e
  matriz C·R (R = inclinar/girar/rolar), câmera ortográfica (ou perspectiva) no quadro que o Vetor usa para colocar a
  imagem (folga para a sombra; `sensor_fit` horizontal). Girar = malha de revolução com UV (u = ângulo, v = altura) e
  espessura (Solidify por material); rótulo = textura 4096 px montada linha a linha pelo raio de cada altura (igual ao
  mapeamento vetorial, mas dando a volta de verdade). Extrudar = curva Bezier 2D do próprio caminho (furos automáticos),
  chanfro para dentro (offset −chanfro); arte nas faces = placa com a imagem (alfa) colada na face.
- Materiais: papel, fosco, plástico, cerâmica (verniz), metal (tinta sem metal), vidro (transmissão). Luz de estúdio
  (principal na direção do 3D vetorial + preenchimento + recorte + teto para a sombra de contato), mundo neutro, cor em
  "Standard" (a cor da marca sai fiel), Cycles na GPU (OptiX > CUDA) com redução de ruído; chão = shadow catcher preto
  (só a sombra no PNG transparente) e as bordas do alfa esmaecem (sombra sem linha reta).
- Antes de renderizar: o gerador de imagem e o Ollama saem da placa. RTX 3050: ~25–30 s a 1400 px/96 amostras.
- Teste: `python testes/teste_blender.py` (rápido, pula sem Blender). Rodar antes de release quando mexer no 3D ou no Blender.

## 14. Pranchetas para identidade visual e Novo documento (2026-10-07)
Pedido do usuário: IDV completa no Vetor, pranchetas em ordem (uma abaixo da outra ou 4 por linha descendo), mover,
duplicar, Ctrl+D como no Illustrator, tela de início com modelos.
- `vetor-pranchetas.js`: `doc.layoutPr = {modo: grade|vertical|horizontal|livre, colunas, espaco (pt)}`; documento novo
  em grade de 4 (`vkDocVazio` embrulhado; `novo` aceita `layout_pr`). Arte da prancheta = objetos do topo com o CENTRO
  nela (fundo com sangria vai junto; antes `mover_prancheta` só levava o que estava inteiro dentro).
  Comandos: `organizar_pranchetas` {modo, colunas, espaco mm, com_arte} (Objeto › Pranchetas: Reorganizar todas…, grava
  a ordem), `duplicar_prancheta` {prancheta, nome, x/y} (cópia logo depois na lista, com a arte; na ordem automática a
  grade se refaz), `ordem_prancheta` {prancheta, posicao | direcao acima/abaixo} (▲▼ no painel; quem vira a 1ª assume o
  canto), `prancheta_caixa` {x, y, larg, alt}. `nova_prancheta` sem x/y entra no próximo lugar da ordem.
  Ferramenta Prancheta (Shift+O): alças (Shift = proporção), arrastar move com a arte, **Alt+arrastar duplica**, arrastar
  no vazio cria. Ctrl+D (repetir transformação, também depois de Alt+arrastar) e a ferramenta Largura (Shift+W) já existiam.
- `vetor-novo.js`: Novo documento (Ctrl+N) em janela grande como a do Illustrator — categorias Impressão, Papelaria,
  Redes sociais, Tela, Grande formato, Identidade visual (manual 16:9 ×12, A4 paisagem ×12, construção de logo, papelaria,
  apresentação, ícones) e Salvos (localStorage `vk-modelos`); detalhes: nome, largura/altura em mm|cm|pol|px (px = 0,75 pt),
  orientação, pranchetas + ordem, sangria, CMYK/RGB + perfil; volta o último ajuste. Tela inicial com "Começar rápido".
- Layout: o Vetor não ocupava a área toda (o Photo e o Editor ligam `body.ve-focus`); agora
  `.content-area:has(#page-vetor-kanivete.active)` em vetor.css.
- Teste `testes/teste_pranchetas.py [--debug]` (comandos + mouse de verdade; app em --agente=9333). A 1ª rodada logo
  depois de recarregar a página pode perder o mouse; rode de novo.
- Pendente (já falhava antes): `teste_vetor.py` "cena: cor da paleta em CMYK e trecho colorido do <span>".
