# Ajuda da Kani — fatos para quem usa o KANIVETE
<!-- Escrito para o USUÁRIO (sem nomes de arquivo nem código). tools/kani_kb.py põe estes trechos na frente dos guias.
     Ferramenta nova ou mudança visível: acrescentar aqui e rodar py -3.13 tools/kani_kb.py. -->

## O que o KANIVETE ainda não faz (responda "não tem", sem prometer)
Não tem estabilizador de vídeo (nada parecido com o Warp Stabilizer) por enquanto. Não exporta DXF para corte a laser
(o Vetor Kanivete exporta PDF para gráfica, SVG e PNG). Não abre arquivos do Figma, do Canva, do CorelDRAW (.cdr) nem do
After Effects (.aep). O Ata Kanivete não grava Zoom nem Microsoft Teams: só Google Meet (ou um áudio/vídeo de reunião já
gravado, importado). A Kani não gera vídeo nem música inteira (gera imagem, efeito sonoro, narração e vinheta). Não há
versão para Mac, celular ou navegador: o KANIVETE é um programa para Windows. Não há conta, login nem nuvem do KANIVETE:
tudo fica no computador da pessoa.

## Preço, versão e atualização
O KANIVETE é gratuito: não tem assinatura nem mensalidade. Quem quiser apoiar usa o botão "Doe ao criador" no fim da barra
lateral (PIX). A versão instalada aparece no rodapé da barra lateral, embaixo à esquerda; clicar nela procura versão nova
na hora. Quando sai versão nova, aparece um aviso com o botão Atualizar.

## Vídeo Kanivete (editor de vídeo, estilo Premiere)
Timeline com trilhas de vídeo e áudio, cortes (Ctrl+K), transições, efeitos, texto, cor, máscaras, motion estilo After
Effects, Pincel Roto (recortar pessoa no vídeo), Cena 3D, mixer de áudio e remix de música. Projetos .vknv. Abre projetos
do Premiere (.prproj) e devolve para o Premiere em XML. Exportar: botão Exportar no canto de cima à direita ou Ctrl+M (põe
na fila e abre o Kanivete Encoder); Ctrl+Shift+M põe na fila sem abrir. Painel Pessoas agrupa os rostos do projeto.
Autozoom (painel Animação › Autozoom): lê a fala (transcrição e ênfase da voz), escolhe os momentos fortes e cria zooms
em camadas de ajuste cor-de-rosa na timeline, centrados no rosto. Escolha Quantidade (Pouco, Médio, Muito ou Automático),
Estilo (Seco = entra e sai no corte; Suave = curva macia; Smart = decide por momento) e Força. Cada zoom pode ser ajustado
nos Controles de efeito (zoom, entrada, saída, curva, centro, desfoque de movimento); Remover tira todos. "Desfoque" liga o
desfoque de movimento nos zooms rápidos (só borra enquanto o zoom anda).
Equalizador paramétrico (Vídeo Kanivete): Efeitos › Filtro e EQ › Equalizador paramétrico no clipe (Controles de efeito ›
Editar no painel) ou no Mixer de trilhas › fx (rack). Abre um painel com a curva: arraste os pontos (frequência e
ganho), rodinha muda a largura (Q), duplo clique cria uma banda, botão direito remove. Tem presets (voz mais clara,
tirar ronco e vento, podcast, rádio, chiado, zumbido de 60 Hz) e o espectro do som tocando. Soa igual na prévia e na
exportação.
Plugins VST3: menu Janela › Plugins › (no Vídeo Kanivete) lista os plugins de áudio VST3 instalados no PC e abre a
janela de cada um num painel (encaixar, soltar, maximizar). Para o som da trilha passar por um plugin: Mixer de trilhas
de áudio › fx (rack) › clique num espaço vazio › Plugins VST3 › escolha o plugin; clicar no espaço abre a janela dele.
O ajuste fica salvo no projeto e vale na prévia e na exportação. Plugins só da Adobe (.aex) e painéis do Premiere não
funcionam fora da Adobe. O Goyo (Beta) parou de funcionar em 2023 (a Supertone desligou o servidor).
Arquivar plugin: no menu Janela › Plugins, passe o mouse no plugin e clique em ⌫ — ele some do menu e do Mixer (não é
desinstalado); "Arquivados", no fim da lista, traz de volta.
Plugins de imagem OpenFX (OFX, o padrão do DaVinci Resolve e do Vegas): o painel Efeitos do Vídeo Kanivete mostra, no
fim, o bloco "Plugins OFX" com os efeitos instalados no PC (pasta C:\Program Files\Common Files\OFX\Plugins ou a pasta
Kanivete\Plugins OFX no disco do app), em grupos; ⌫ arquiva um efeito ou o grupo todo, ↻ procura de novo. Duplo clique
ou arrastar até um clipe aplica o plugin, com os ajustes dele nos Controles de efeito (com cronômetro nos números).
AINDA NÃO muda a imagem: a prévia e a exportação dos plugins OFX estão em construção (próximas etapas).
Plugins VST3 sem instalador podem ficar na pasta Kanivete\Plugins VST3 (no disco do app).
Sound Kanivete: painel da faixa › Plugins VST3 › "+ Plugin VST3" põe um plugin de áudio instalado na faixa (depois dos
efeitos do Kanivete); Abrir mostra a janela do plugin dentro do app. Para tocar com o plugin, o app prepara a faixa em
segundo plano (uns segundos; o painel mostra "⏳ preparando" e enquanto isso toca sem o plugin); a exportação sai com o
plugin. Plugins da jhudstudio ainda não abrem a janela (o som funciona). Para tirar ruído de voz (no
lugar do Goyo), use o efeito de áudio Anti Noise do próprio app: ganhou do plugin grátis RNNoise no teste.
Plugins pagos feitos só para um editor (ex.: Neat Video "para o Resolve") não aparecem no KANIVETE.
Pincel Roto (Efeitos › Chaveamento, ou duplo clique no clipe com o efeito): abre numa janela por cima do editor. Pinte o
que fica (Alt tira) ou clique em "✨ Selecionar assunto" para o app achar a pessoa sozinho; o quadro pintado vira
quadro-base. O recorte dos outros quadros só é montado quando você clica em "❄ Freeze" (ou tecla F); marque "Seguir
sozinho" para montar logo depois de cada traço. Qualidade alta (borda mais fiel) ou Rápida (uns 3× mais rápida).
Na faixa "Borda" da janela: Nitidez (recorte mais seco), Descontaminar cores (tira a auréola do fundo antigo em volta do
cabelo) e Proteger rosto (o recorte não fura o rosto nem a lente dos óculos).

## Kanivete Encoder (fila de exportação, estilo Media Encoder)
Configurações à esquerda e fila à direita. Cada item da fila tem as suas próprias configurações (formato, resolução,
H.264, H.265, ProRes, só áudio em MP3/WAV). "Adicionar à fila" e ▶ Renderizar fila (nada começa sozinho). Aceita também
arquivos soltos arrastados na aba do Encoder, renders da Lux e exportações do Sound. Usa a placa de vídeo quando houver.
No fim, avisa com som; pode enviar ao Google Drive.

## Legendas automáticas
No Vídeo Kanivete as legendas saem da fala do próprio vídeo. Para só tirar o texto de um áudio ou vídeo (ou baixar o .srt),
use a ferramenta Transcrever, na seção Áudio da barra lateral.
São três modos, escolhidos no painel Texto › Legendas: Clássica (a frase inteira, estilo TV), Dinâmica (a frase com a
palavra falada destacada) e Premium (blocos curtos montados como título, com duas fontes que combinam: palavras pequenas
de ligação, a palavra principal e uma palavra de destaque em itálico colorido, entrando uma a uma no tempo da fala, com
desfoque e brilho, acender, subir, pop, revelar, zoom, cair ou deslizar — ou Automática, que escolhe a entrada de cada
legenda pelo tom da frase; a saída também: esmaecer, desfocar, encolher, varrer ou Automática; o destaque dos títulos pode
ser automático, traço, marca-texto, pincel rústico ou nenhum). Na Premium escolhe-se a dupla de fontes (Brilho quente, Editorial, Impacto,
Suave, Elegante, Moderno, Retrô, Rústico, Disruptivo, Zine), a cor do destaque (o ✦ tira a cor das cenas do vídeo), quantos títulos (poucos, médio, muitos), a posição, o brilho, o tamanho e o
traço sob o destaque; "Refinar com a Kani" deixa a Kani escolher os títulos e as palavras de destaque lendo o texto.
A caixinha "Efeitos sonoros nas legendas" põe sons do Soundboard no tempo das palavras, combinando com a animação
(whoosh na entrada dos títulos, pop, clique) e com o assunto (moedas quando fala de dinheiro, confirmação quando algo deu
certo, câmera, pergunta), em Sutil, Médio ou Forte, com volume, numa trilha de áudio própria.
Clicando numa legenda dá para trocar título ↔ simples e o papel de cada palavra. A exportação grava igual à prévia.
No monitor Programa, o botão ao lado das réguas liga as margens de segurança: dois retângulos finos (área de ação 90% e
de títulos 80%) que mostram onde textos e informações ficam seguros, no vídeo vertical ou horizontal; não saem na exportação.

## Photo Kanivete (editor de imagem, estilo Photoshop)
Camadas, máscaras, texto, formas, filtros, ajustes, objeto inteligente, Camera Raw, Liquify, laço, caneta. Abre e salva PSD
do Photoshop com as camadas e o texto editável. Gera imagens com IA no próprio computador e monta carrosséis, feed e story.
Projetos .iknv.

## Vetor Kanivete (vetor para gráfica, estilo Illustrator)
Abre PDF, AI, SVG e PowerPoint. Pranchetas, curvas, texto, traçado de imagem (vira vetor), série numerada de placas, criar
fonte. Fecha arquivo para gráfica em PDF/X (CMYK, sangria, marcas de corte). Ida e volta com o Illustrator instalado.
Projetos .aknv. Envia objetos para o Photo e para o Editor em 3D.

## Sound Kanivete (editor de áudio multipista)
Timeline de áudio, fades, volume em LUFS, gravação pelo microfone, reparo e separar voz/música, texto para voz com vozes
salvas, conversa a duas vozes e editar o áudio pelo texto. Projetos .sknv.

## Slider Kanivete (apresentações 16:9, estilo PowerPoint)
Slides com camadas, temas, gráficos editáveis, vídeo e GIF, animações e transições, modo apresentação (F5) com notas do
apresentador (N). Abre PowerPoint (.pptx) e PDF. Exportar (botão Exportar, em cima à direita): "Apresentação para
qualquer aparelho (.html)" — um arquivo só que abre no celular, Mac, tablet ou TV pelo navegador, com controles, PageUp e
PageDown, deslizar no celular e ocultar/mostrar slides; PDF (normal ou leve para WhatsApp); PowerPoint editável; PowerPoint
em imagens; PNG por slide; vídeo MP4. O projeto editável é o .dknv (o .dknv não abre no PowerPoint: para isso, exporte o
.pptx). Salvar como = Ctrl+Shift+S.

## Lux Kanivete (produto em 3D)
Embalagens (pote, bastão), luzes como no Blender, materiais e render fotorrealista (foto Full HD/2K/4K e vídeo). Projetos
.lknv. O render vai para a fila do Kanivete Encoder.

## Ata Kanivete (Beta) — reunião vira ATA
Cole o link do Google Meet e clique em Entrar no Meet: abre um Chrome à parte (login só na primeira vez). Clique em
● Gravar ATA no topo da reunião; ao sair da chamada a gravação para sozinha (há a opção de começar a gravar sozinho ao
entrar). No fim, a Kani escreve a ATA com pauta, resumo, decisões, tarefas e prazos. Dá para renomear as vozes, ouvir a
transcrição, buscar em todas as reuniões, marcar tarefas como feitas, escolher o estilo da ATA, copiar o texto para o
WhatsApp e baixar em PDF ou Word. Reunião já gravada (inclusive de Zoom ou Teams): na aba do Ata Kanivete, botão
"Importar áudio ou vídeo" (não é pelo chat da Kani). Ligar as legendas do Meet (tecla C) ajuda a dar o nome certo para
cada pessoa.

## Ferramentas rápidas (arrastar e soltar)
Converter Vídeo, Comprimir Vídeo (H.265 com a placa de vídeo), Baixar Vídeo (YouTube e outros), Converter Áudio,
Transcrever, Melhorar Áudio, Geração de Voz, Converter Imagem, Comprimir Imagem, Remover Fundo (a pessoa ou o objeto vira
PNG transparente), Organizar Imagens, Gerar Favicon, GDrive Dumper (baixar pasta do Drive) e Web Scraper. Cada uma fica na
barra lateral, na sua seção; é só abrir e arrastar os arquivos.

## Kani (esta assistente)
Conversa no próprio computador, sem internet. Cria aqui no chat: imagem ("gera uma imagem de..."), efeito sonoro ("cria um
som de..."), narração ("narre: ...") e vinheta com narração e música ("faz uma vinheta sobre..."). Com um arquivo anexado
(📎): tirar o fundo de foto, resumir PDF/Word. Salva textos em PDF, Word ou TXT. Pesquisa na internet quando pedido.
Lembra preferências ("lembra que eu prefiro..."). Enxerga um resumo do que está aberto na tela (chip "Vendo…" no pé do chat
liga e desliga). Lê as respostas em voz alta.
