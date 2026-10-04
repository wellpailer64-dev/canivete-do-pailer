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
| QR code vetorial | gráfica: QR em vetor, nunca imagem | `qrcode` (conteudo, x, y, tamanho mm, cor, correcao L/M/Q/H, fundo, margem): módulos unidos numa forma só (lib `qrcode`) |
| Ícones (Tabler Icons, MIT, ~5000) | ícones de serviço/contato sem desenhar à mão | `icone` (nome de tabler.io/icons, x, y, tamanho mm, cor, estilo outline/filled, espessura): baixa uma vez para `%APPDATA%/CaniveteDoPailer/icones` |
| Hifenizar (Parágrafo) | texto justificado sem "rios" | `hifen`/`hifenizar` (true = pt_BR, 'en_US'...) no `texto`/`alterar`; pyphen (dicionários do LibreOffice), 6+ letras, 2 antes / 3 depois; só o trecho de letras da palavra |
| Traçado de imagem (Image Trace) | logo do cliente em PNG/JPG → vetor para a gráfica | `vetorizar` (ids da imagem, cores 2-32, detalhe px², precisao px, suavidade, ignorar_fundo, manter_imagem); Python: k-means em Lab + contornos com furos (OpenCV), 1 px de sobreposição entre cores; tela: curvas como o Lápis (cantos achados com suavização leve, lados suavizados entre cantos; laço liso em 4 trechos); cores em CMYK pelo perfil. Menu Objeto |
| Bibliotecas de cor (livros Pantone & cia.) | cor especial exata da gráfica | `vetor-cores.js`: o app NÃO traz livros (dados do fabricante); lê .acb (Adobe Color Book, achados em Program Files/Adobe/*/Presets/.../Color Books) e .ase (Swatch Exchange) postos em %APPDATA%/CaniveteDoPailer/cores. Lab → CMYK alternativo pelo perfil (relativo + BPC). `bibliotecas_cor`, `cores_biblioteca` (busca), `cor_biblioteca` (biblioteca/arquivo, nome "286" ou todas; ids + preench/traco aplica). Aba Amostras › Bibliotecas de cor |
| Recolorir arte | adaptar arte de cliente, trocar CMYK por Pantone | `cores_arte` (cores da seleção ou de tudo, mais usada primeiro), `recolorir` (trocas [{de, para}], tolerancia, tudo): troca em preenchimento, traço, paradas de degradê, trechos de texto, Aparência, efeitos e grupos. Menu Objeto › Recolorir arte |
| Texto em caminho | selo, logo circular | ferramenta Texto em caminho (clique no caminho); `texto_caminho` (`ini` mm, `lado`, `manter_caminho`) |
| Estilos de parágrafo / caractere, Glifos, juntar textos importados | padronizar, caracteres especiais, editar .ai/PDF | `estilo_texto` (tipo, nome, `de`, `aplicar`; mudar um estilo atualiza quem usa), `estilos_texto`, `glifos`, `inserir_texto` (`codigo`/`texto`, `pos`), `juntar_textos` (linhas → parágrafos; `quebras:'linhas'`) |
| Alinhar/distribuir, guias inteligentes | precisão | caixa pelos extremos reais da cúbica (não pelas alças); encaixe magenta |
| Réguas (Ctrl+R), guias arrastáveis (Ctrl+; mostrar, Alt+Ctrl+; travar), grade (Ctrl+'; Shift+Ctrl+' encaixar) | diagramação | `vetor-reguas.js`: réguas em mm com origem na prancheta ativa; arrastar da régua cria guia, soltar na régua apaga; `guia` (eixo x/y, pos mm; acao mover/apagar/limpar), `exibir` (reguas, guias, travar_guias, grade, encaixar_grade, passo_grade, sub_grade); guias e grade entram no encaixe |
| Colocar imagem (link), resolução efetiva | fotos no layout | `imagem` com `m`; ppi efetivo no painel e no fechamento |
| Sobreimpressão, separações, perfil de cor (CMYK + ICC) | **impressão profissional** | sobreimprimir por objeto (OP/op/OPM 1); prova de cor pelo perfil de saída (FOGRA39…) na tela |
| Salvar como PDF/X-1a / PDF/X-4, marcas e sangria, Empacotar | **fechamento de arquivo** | Exportar › PDF para gráfica (abaixo) + aba Fechamento; Arquivo › Empacotar = `pasta/<nome>/` com .aknv, PDF X-4, Links/, Fontes/, Relatório.txt |
| Abrir PDF/AI/SVG/EPS | trabalhar com arquivo de cliente | PDF/AI (compatível com PDF), SVG, PPTX (EPS: não) |

`.aknv` abre no KANIVETE por duplo clique (associação HKCU em Functions/projeto.py; roteado em `abrirProjetoExterno`).

Ainda NÃO (pendências, em ordem de valor — levantamento de 2026-10-04 com .ai reais): texto dentro de forma (área não retangular),
tabulações, editar a trilha do texto em caminho com a Seleção direta, estilos dentro da caixa de edição (ela é texto puro);
efeitos que faltam (brilho interno, distorcer/zigue-zague, Aparência em grupo; efeitos na prévia de separações e no SVG); malha, Blend vivo/no caminho; símbolos, padrões, distorção de envelope, máscara de opacidade; painel de vínculos e variáveis; EPS; PDF com texto editável (hoje: curvas).

## 2. Modelo (pt = 1/72", y para baixo)
```
doc = {nome, unidade:'mm', modoCor:'cmyk'|'rgb', perfil:'FOGRA39'|'FOGRA29'|'GRACOL'|'SWOP', sangria (pt),
       pranchetas:[{id,nome,x,y,w,h}], camadas:[{id,nome,visivel,trava,imprimir,itens}] (0 = embaixo),
       amostras:[{id,nome,cor}], imagens:{id:{arquivo,w,h,modo,alfa,url}}, guias:[]}
caminho {tipo,subs:[{fechado,pts:[[x,y,inX,inY,outX,outY]]}],regra:'nonzero'|'evenodd',preench,traco:{cor,larg,cap,junc,miter,tracejado,fase},op,bm,sobre:{p,t}}
texto   {tipo,conteudo,fam,estilo,tam(pt),entrelinha|null,track(1/1000 em),alin:esq|centro|dir|just|just_tudo,caixa(pt)|null,caixa_alt(pt),m:[a,b,c,d,e,f],preench,traco,
         desl,eh,ev,maius:alta|versalete,pos:sup|sub,liga,frac,num, recuo_esq,recuo_dir,recuo_1a,antes,depois (pt),
         trechos:[{ini,fim,<os de caractere>,preench,traco:{cor,larg}|null,ec}], ep (estilo ¶), anterior/seguinte (encadeado: o texto mora na raiz),
         trilha:{subs,ini,lado} (texto em caminho)}       doc.estilosTexto = {par:{nome:{...}}, car:{nome:{...}}}
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
soltar_mascara, composto, pathfinder, deslocar (`distancia` mm, `junc`), contornar_traco, repetir, transformar_cada, distribuir_espaco, construtor, pathfinder2, tesoura, faca, juntar, media, separacoes, tinta_em, exportar_separacoes, contornos, empacotar (`pasta`, `pdf`, `fontes`), setor, arco, qrcode, icone, vetorizar, bibliotecas_cor, cores_biblioteca, cor_biblioteca, cores_arte, recolorir, degrade (tipo, cores|paradas, angulo, traco), mesclar (2 caminhos, passos: Blend assado em grupo; menu Objeto), ferramenta Degradê G (arraste; Alt = radial; mantém as cores do degradê), aparencia, efeito, expandir_aparencia, lapis, simplificar, bolha, borracha, texto_caminho, encadear, desencadear, estilo_texto, estilos_texto, juntar_textos, glifos, inserir_texto, duplicar, apagar, selecionar, mover_para_camada, nova_camada, camada,
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
Ainda não: ampliar foto por IA (o gerador vai até 2048 px → 224 ppi na faixa: aviso `resolucao_baixa`), amostra de padrão
(as listras são cópias), ferramenta de degradê na arte e Blend.
