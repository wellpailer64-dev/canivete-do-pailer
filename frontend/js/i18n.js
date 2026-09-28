// ─────────────────────────── idioma da interface (Preferências) ───────────────────────────
// O app é escrito em português. Em inglês, um observador troca na hora os textos da página (nós de texto e
// title/placeholder/aria-label/alt) pelo dicionário abaixo; o original fica guardado no próprio nó, então
// voltar ao português restaura tudo. Texto novo (toasts, painéis montados por JS, janelas soltas do editor)
// é traduzido assim que entra na página. Frases com partes variáveis usam I18N_RE.
// Texto novo na interface: acrescente aqui a tradução (sem ela, aparece em português).

const I18N_EN = {
    // ── geral / menu ──
    'Início': 'Home', 'Buscar': 'Search', 'Recolher menu': 'Collapse menu', 'Expandir menu': 'Expand menu',
    'Vídeo': 'Video', 'Áudio': 'Audio', 'Imagem': 'Image', 'Web': 'Web',
    'Editor de Vídeo': 'Video Editor', 'Comprimir Vídeo': 'Compress Video', 'Converter Vídeo': 'Convert Video',
    'Baixar Vídeo': 'Download Video', 'Converter Áudio': 'Convert Audio', 'Transcrever': 'Transcribe',
    'Converter Imagem': 'Convert Image', 'Comprimir Imagem': 'Compress Image', 'Remover Fundo': 'Remove Background',
    'Organizar Imagens': 'Organize Images', 'Gerar Favicon': 'Generate Favicon', 'Cortar Áudio': 'Cut Audio',
    'Tudo roda neste computador': 'Everything runs on this computer', 'Local · offline': 'Local · offline',
    'Preferências': 'Preferences', 'Idioma': 'Language', 'Português': 'Portuguese', 'Inglês': 'English',
    'Espanhol': 'Spanish', 'Fechar': 'Close', 'Fechar (Esc)': 'Close (Esc)', 'Fechar aba': 'Close tab',
    'Idioma da interface': 'Interface language', 'Pronto': 'Done',
    'A troca vale na hora e fica salva para as próximas vezes.': 'The change applies right away and is remembered next time.',
    'O que vamos fazer': 'What are we doing', 'hoje?': 'today?',
    'Vídeo, áudio e imagem direto no seu PC. Solte um arquivo abaixo e o Canivete sugere a ferramenta certa.': 'Video, audio and images right on your PC. Drop a file below and Canivete suggests the right tool.',
    'Nada vai para a nuvem': 'Nothing goes to the cloud', 'Solte qualquer arquivo ou pasta': 'Drop any file or folder',
    'Vídeo, áudio, imagem, PDF ou uma pasta inteira': 'Video, audio, image, PDF or a whole folder',
    'Ferramentas': 'Tools', 'Recentes': 'Recent', 'Nova versão': 'New version', 'Atualizar agora': 'Update now',
    'Atualizando...': 'Updating...', 'Tentar de novo': 'Try again', 'disponível · você tem': 'available · you have',
    'Rodando pelo código-fonte: use git pull.': 'Running from source code: use git pull.',
    'Nenhuma atualização disponível.': 'No update available.',
    'Nenhuma ferramenta abre este tipo de arquivo.': 'No tool opens this kind of file.',
    'Esta ferramenta não recebe arquivos arrastados.': 'This tool does not accept dropped files.',
    'Aqui é preciso soltar um arquivo.': 'Drop a file here.', 'Aqui é preciso soltar uma pasta.': 'Drop a folder here.',
    'Vários arquivos soltos: usando o primeiro. Para vários, solte a pasta.': 'Several files dropped: using the first one. For many, drop the folder.',
    'Há um processo em andamento nesta ferramenta. Ele continua rodando mesmo com a aba fechada; reabra pelo menu para acompanhar.': 'A process is running in this tool. It keeps running with the tab closed; reopen it from the menu to follow it.',
    'Você pode reabrir pelo menu quando quiser.': 'You can reopen it from the menu anytime.',

    // ── botões e palavras comuns ──
    'Abrir': 'Open', 'Salvar': 'Save', 'Salvar como': 'Save as', 'Salvar em': 'Save to', 'Cancelar': 'Cancel',
    'Aplicar': 'Apply', 'Apagar': 'Delete', 'Remover': 'Remove', 'Limpar': 'Clear', 'Copiar': 'Copy', 'Copiado': 'Copied',
    'Escolher': 'Choose', 'Escolher...': 'Choose...', 'Escolher arquivo': 'Choose file', 'Escolher pasta': 'Choose folder',
    'Escolher imagem': 'Choose image', 'Escolher áudio': 'Choose audio', 'Escolha a pasta...': 'Choose the folder...',
    'Escolha a pasta de destino...': 'Choose the destination folder...', 'Alterar': 'Change', 'Editar': 'Edit',
    'Converter': 'Convert', 'Converter para': 'Convert to', 'Comprimir': 'Compress', 'Baixar': 'Download',
    'Organizar': 'Organize', 'Analisar': 'Analyze', 'Verificar': 'Verify', 'Substituir': 'Replace', 'Manter': 'Keep',
    'Ajustar': 'Adjust', 'Retomar': 'Resume', 'Assistir': 'Watch', 'Mostrar na pasta': 'Show in folder',
    'Ver detalhes': 'See details', 'Sem título': 'Untitled', 'Formato': 'Format', 'Formato de saída': 'Output format',
    'Formato de saída:': 'Output format:', 'Qualidade': 'Quality', 'Resolução': 'Resolution', 'Original': 'Original',
    'original': 'original', 'Modelo': 'Model', 'Processar com': 'Process with', 'Processador': 'Processor',
    'Placa de vídeo': 'Graphics card', 'Usar placa de vídeo (mais rápido)': 'Use graphics card (faster)',
    'Processando...': 'Processing...', 'Preparando...': 'Preparing...', 'Analisando...': 'Analyzing...',
    'Conectando...': 'Connecting...', 'Verificando...': 'Checking...', 'Baixando...': 'Downloading...',
    'Cancelando...': 'Canceling...', 'Cancelado': 'Canceled', 'Concluído': 'Done', 'Concluído!': 'Done!', 'Concluido': 'Done',
    'Falhou': 'Failed', 'Erro:': 'Error:', 'Configurado': 'Configured', 'Leve': 'Light', 'Forte': 'Strong',
    'Equilibrada': 'Balanced', 'Máxima': 'Maximum', 'Alta': 'High', 'Boa': 'Good', 'Rápido': 'Fast', 'Preciso': 'Accurate',
    'Compatível': 'Compatible', 'rápido': 'fast', 'mais lento': 'slower', 'arquivo menor': 'smaller file',
    'menor arquivo': 'smallest file', 'qualidade máxima': 'maximum quality', 'arquivos': 'files', 'vídeos': 'videos',
    'ou': 'or', 'Arquivos': 'Files', 'Tempo restante': 'Time left', 'Transferido': 'Transferred', 'Sua internet': 'Your connection',
    'Os convertidos vão para a pasta': 'Converted files go to the folder', 'Mesma pasta do vídeo original': 'Same folder as the original video',
    'Escolha a pasta de destino.': 'Choose the destination folder.', 'Escolha a pasta onde salvar.': 'Choose where to save.',
    'Escolha (ou arraste) a pasta primeiro.': 'Choose (or drop) the folder first.',
    'Escolha uma pasta ou arquivo primeiro (ou arraste aqui).': 'Choose a folder or file first (or drop it here).',
    'Arraste arquivos ou uma pasta aqui': 'Drop files or a folder here', 'Arraste uma pasta aqui': 'Drop a folder here',
    'Arraste vídeos ou uma pasta aqui': 'Drop videos or a folder here', 'Arraste um vídeo aqui': 'Drop a video here', 'Arraste um vídeo ou imagem aqui': 'Drop a video or image here',
    'Solte um arquivo de vídeo, áudio ou imagem': 'Drop a video, audio or image file',
    'Arraste imagens ou uma pasta aqui': 'Drop images or a folder here', 'Arraste imagens, PDFs ou uma pasta aqui': 'Drop images, PDFs or a folder here',
    'Arraste vídeos, GIFs ou uma pasta aqui': 'Drop videos, GIFs or a folder here', 'Arraste áudios, vídeos ou uma pasta aqui': 'Drop audio, videos or a folder here',
    'Arraste o logo aqui': 'Drop the logo here', 'Arraste a pasta do job aqui': 'Drop the job folder here',
    'Arquivo não encontrado.': 'File not found.', 'Arquivo nao encontrado.': 'File not found.',
    'ffmpeg não encontrado.': 'ffmpeg not found.', 'ffmpeg nao encontrado.': 'ffmpeg not found.',
    'Arquivo sem vídeo/áudio ou com duração inválida.': 'File has no video/audio or an invalid duration.',

    // ── ferramentas (descrições) ──
    'Vídeo e áudio: cortes, camadas e exportação (MP4, MP3...)': 'Video and audio: cuts, layers and export (MP4, MP3...)',
    'Linha do tempo com várias faixas: corte com a lâmina (E), remova trechos (Q/W) e exporte.': 'Multi-track timeline: cut with the razor (E), remove ranges (Q/W) and export.',
    'H.265 com GPU: até 70% menor mantendo a qualidade': 'H.265 on the GPU: up to 70% smaller at the same quality',
    'Recomprime em H.265 mantendo resolução e áudio. Se o vídeo já estiver otimizado, o original é mantido.': 'Re-encodes to H.265 keeping resolution and audio. If the video is already optimized, the original is kept.',
    'salva em /comprimidos': 'saved to /comprimidos', 'Limitar a Full HD': 'Limit to Full HD',
    'MP4, MOV, MKV, WEBM, GIF e MP3': 'MP4, MOV, MKV, WEBM, GIF and MP3',
    'Converte entre formatos e extrai o áudio de vídeos. O original é mantido.': 'Converts between formats and extracts audio from videos. The original is kept.',
    'Quando dá, só troca o formato sem recodificar — leva segundos e não perde qualidade.': 'When possible it only changes the container without re-encoding — takes seconds with no quality loss.',
    'Vídeo MP4': 'MP4 video', 'Só áudio MP3': 'Audio only (MP3)', 'só áudio': 'audio only', 'H.264 até 1080p • abre em tudo': 'H.264 up to 1080p • plays everywhere',
    'YouTube, Instagram, TikTok e mais — até 4K': 'YouTube, Instagram, TikTok and more — up to 4K',
    'YouTube, Instagram, TikTok, X, Vimeo, Facebook e centenas de outros sites.': 'YouTube, Instagram, TikTok, X, Vimeo, Facebook and hundreds of other sites.',
    'Cole o link do vídeo...': 'Paste the video link...', 'Cole o link do vídeo primeiro.': 'Paste the video link first.',
    'até 4K': 'up to 4K', 'Iniciando download...': 'Starting download...',
    'Organiza cartões de câmera e cria o projeto Premiere': 'Organizes camera cards and builds the Premiere project',
    'Organiza os cartões das câmeras por ordem de gravação, identifica operadores e monta o projeto do Premiere.': 'Sorts camera cards by recording order, identifies operators and builds the Premiere project.',
    'Uma subpasta por câmera/cartão': 'One subfolder per camera/card', 'Analisar câmeras': 'Analyze cameras',
    'Câmeras identificadas': 'Cameras found', 'Nome do projeto': 'Project name', 'Ex: Casamento João e Maria': 'E.g. John and Mary wedding',
    'Câmeras ordenadas pela gravação mais antiga. Operador é opcional:': 'Cameras sorted by earliest recording. Operator is optional:',
    'Confirmar e organizar': 'Confirm and organize', 'Operador (opcional)': 'Operator (optional)',
    'Nenhuma câmera identificada': 'No camera found', 'Nenhuma câmera identificada na pasta.': 'No camera found in the folder.',
    'Escolha (ou arraste) a pasta do job primeiro.': 'Choose (or drop) the job folder first.',
    'Logger Pro: organização concluída!': 'Logger Pro: organization done!', 'Analisando vídeo(s)...': 'Analyzing video(s)...',
    'MP3, WAV, FLAC, M4A, Opus — e extrai de vídeos': 'MP3, WAV, FLAC, M4A, Opus — and extracts from videos',
    'MP3, WAV, FLAC, M4A, OGG, WMA… e vídeos (MP4, MOV, MKV)': 'MP3, WAV, FLAC, M4A, OGG, WMA… and videos (MP4, MOV, MKV)',
    'Texto e legenda .srt com Whisper': 'Text and .srt subtitles with Whisper',
    'Transforma fala em texto com o Whisper, direto no seu PC. Também gera legenda': 'Turns speech into text with Whisper, right on your PC. Also creates subtitles',
    'para Premiere e CapCut.': 'for Premiere and CapCut.', 'Resultado da transcrição': 'Transcription result', 'Salvar TXT': 'Save TXT',
    'Detectar automaticamente': 'Detect automatically', 'Carregando modelo de IA...': 'Loading AI model...', 'Carregando modelo...': 'Loading model...',
    'HEIC, RAW, WEBP, AVIF, PNG, JPG e mais': 'HEIC, RAW, WEBP, AVIF, PNG, JPG and more',
    'Fotos e PDFs mais leves, com EXIF preservado': 'Lighter photos and PDFs, EXIF kept', 'Deixa fotos e PDFs mais leves na pasta': 'Makes photos and PDFs lighter in the folder',
    '. Perfil de cor e EXIF são mantidos.': '. Color profile and EXIF are kept.', '. Se não der para reduzir, o original fica como está.': '. If it can’t be reduced, the original stays as is.',
    'Reduz fotos maiores que 1920×1080 — ideal para site e WhatsApp': 'Shrinks photos larger than 1920×1080 — ideal for websites and WhatsApp',
    'Compressão': 'Compression', 'comprimidas': 'compressed', 'convertidas': 'converted',
    'Recorte automático com IA': 'Automatic AI cutout', 'Recorte automático com IA. Você revisa o resultado antes de salvar.': 'Automatic AI cutout. You review the result before saving.',
    'Remover fundo': 'Remove background', 'Resultado — Remover Fundo': 'Result — Remove Background', 'Sem Fundo': 'No Background',
    'sem fundo': 'no background', 'Salvar esta': 'Save this one', 'Salvar todas': 'Save all', 'Imagem salva.': 'Image saved.',
    'Duplicadas, thumbs, gráficos e nomes por contexto': 'Duplicates, thumbs, graphics and context-based names',
    'Separa duplicadas, thumbs, logos e plantas, e renomeia as fotos pelo que aparece nelas.': 'Separates duplicates, thumbs, logos and floor plans, and renames photos by what they show.',
    'Organização completa': 'Full organization', 'Só duplicadas': 'Duplicates only', 'Só thumbs': 'Thumbs only',
    'Todos os ícones do site + código pronto': 'Every site icon + ready code',
    'Gera todos os ícones do site, o manifest e o código para colar no <head>.': 'Generates every site icon, the manifest and the code to paste into <head>.',
    'De preferência PNG quadrado com fundo transparente, 512px ou mais': 'Preferably a square PNG with transparent background, 512px or more',
    'Nome do site': 'Site name', 'Meu Site': 'My Site', 'Cor do tema': 'Theme color', 'Gerar favicons': 'Generate favicons',
    'Escolha a imagem do logo primeiro.': 'Choose the logo image first.',
    'Baixa pastas inteiras do Google Drive, sem zip': 'Downloads whole Google Drive folders, no zip',
    'Baixa pastas inteiras do Google Drive com retomada automática — sem os zips quebrados do navegador.': 'Downloads whole Google Drive folders with automatic resume — no broken browser zips.',
    'Cole o link da pasta ou arquivo do Google Drive...': 'Paste the Google Drive folder or file link...',
    'Cole o link do Google Drive primeiro.': 'Paste the Google Drive link first.', 'Não foi possível ler o link.': 'Could not read the link.',
    'Ao analisar o primeiro link, o Google vai pedir sua autorização no navegador.': 'When you analyze the first link, Google will ask for your authorization in the browser.',
    'Normal — 4 arquivos em paralelo': 'Normal — 4 files in parallel', 'Rápida (recomendado) — 8 arquivos em paralelo': 'Fast (recommended) — 8 files in parallel',
    'Lenta / instável — 2 arquivos, mais tolerante a quedas': 'Slow / unstable — 2 files, more tolerant to drops',
    'Clique em Analisar antes de baixar.': 'Click Analyze before downloading.', 'Pronto para baixar': 'Ready to download',
    'Já existe um download em andamento.': 'A download is already running.', 'Selecione uma pasta de destino para o download.': 'Choose a destination folder for the download.',
    'Finalizando... conferindo arquivos.': 'Finishing... checking files.', '✅ Download concluído e verificado.': '✅ Download finished and verified.', '⏸ Pausado': '⏸ Paused',
    'Imagens e vídeos de um site, já organizados': 'Images and videos from a site, already organized',
    'Baixa as imagens e vídeos de uma página e já organiza: converte para WEBP, separa logos, thumbs e plantas, e renomeia por contexto.': 'Downloads a page’s images and videos and organizes them: converts to WEBP, separates logos, thumbs and floor plans, and renames by context.',
    'https://site.com/pagina': 'https://site.com/page', 'Imagens + vídeos': 'Images + videos', 'Só imagens': 'Images only', 'Só vídeos': 'Videos only',
    'Digite o endereço da página.': 'Type the page address.', 'Analisando a página...': 'Analyzing the page...', 'Falha ao analisar a página': 'Failed to analyze the page',
    'Cérebro — extrair dados da página para CSV com IA local': 'Brain — extract page data to CSV with local AI',
    'Carregar regras (.md)': 'Load rules (.md)', 'Gerar CSV': 'Generate CSV', 'Nenhum .md carregado': 'No .md loaded',
    'Nenhum arquivo de regras (.md) carregado': 'No rules file (.md) loaded', 'Regras carregadas!': 'Rules loaded!', 'Regras removidas.': 'Rules removed.',
    'Gerando CSV com IA local...': 'Generating CSV with local AI...', 'Carregue um arquivo de regras (.md) primeiro.': 'Load a rules file (.md) first.',
    'O arquivo de regras está vazio.': 'The rules file is empty.', 'Log copiado para a área de transferência!': 'Log copied to the clipboard!',
    'Downloads': 'Downloads', 'Imagens: 0': 'Images: 0', 'Vídeos: 0': 'Videos: 0',

    // ── cortador de áudio (legado) ──
    'Abra um vídeo ou áudio para começar.': 'Open a video or audio file to start.', 'Carregando waveform...': 'Loading waveform...',
    'Solte um arquivo de vídeo ou áudio': 'Drop a video or audio file', 'Solte um arquivo de áudio.': 'Drop an audio file.',
    'Selecione um audio primeiro.': 'Select an audio file first.', 'Exportando audio editado...': 'Exporting edited audio...',
    'Nenhum corte ainda.': 'No cuts yet.', 'Nenhuma edicao aplicada ainda.': 'No edits applied yet.', 'Edições aplicadas': 'Applied edits',
    'Áudio carregado. Use a agulha para editar a timeline.': 'Audio loaded. Use the playhead to edit the timeline.',
    'Nao foi possivel preparar o audio.': 'Could not prepare the audio.', 'Nao foi possivel preparar a faixa extra.': 'Could not prepare the extra track.',
    'Nao foi possivel desenhar a waveform, mas o corte ainda pode ser feito pelos tempos.': 'Could not draw the waveform, but you can still cut by time.',
    'Carregue a faixa principal antes de exportar.': 'Load the main track before exporting.', 'Carregue a faixa principal antes de salvar.': 'Load the main track before saving.',
    'Carregue a faixa principal primeiro.': 'Load the main track first.', 'A faixa principal esta bloqueada.': 'The main track is locked.',
    'Essa camada esta bloqueada.': 'This layer is locked.', 'Erro ao selecionar faixa': 'Error selecting track',
    'Adicione pelo menos um corte ou uma faixa extra antes de salvar.': 'Add at least one cut or an extra track before saving.',
    'Adicionar faixa de áudio': 'Add audio track', 'Os cortes removem o audio inteiro.': 'The cuts remove the whole audio.',
    'Nao foi possivel ler a duracao do audio.': 'Could not read the audio duration.', 'Tempo excedido ao exportar audio.': 'Timed out exporting audio.',
    'Tempo excedido ao preparar preview.': 'Timed out preparing the preview.', 'Removido': 'Removed', 'Final': 'Final', 'Principal': 'Main',

    // ── editor de vídeo ──
    'Pocket Editor': 'Pocket Editor', 'Nenhum vídeo aberto': 'No video open', 'Abrir vídeo': 'Open video',
    'Abrir vídeo (Ctrl+O)': 'Open video (Ctrl+O)', 'Abrir vídeo ou projeto': 'Open video or project', 'Abra um vídeo e use': 'Open a video and use',
    '(ou a lâmina': '(or the razor', ') para cortar. Selecione um clipe e aperte': ') to cut. Select a clip and press', 'para apagá-lo.': 'to delete it.',
    '(ou': '(or', ') para cortar na agulha.': ') to cut at the playhead.', 'Aperte': 'Press', 'Selecione um clipe e aperte': 'Select a clip and press',
    'apagam antes / depois da agulha até o corte mais próximo.': 'delete before / after the playhead up to the nearest cut.',
    'Salvar projeto (.vcnvt) ·': 'Save project (.vcnvt) ·', 'Salvar projeto .vcnvt (Ctrl+S) · Salvar como: Ctrl+Shift+S': 'Save .vcnvt project (Ctrl+S) · Save as: Ctrl+Shift+S',
    'Exportar': 'Export', 'Exportar (Ctrl+M)': 'Export (Ctrl+M)', 'Exportar ·': 'Export ·', 'Exportar vídeo': 'Export video',
    'Exportar áudio': 'Export audio', 'Exportar sem áudio': 'Export without audio', 'Só o áudio da timeline ·': 'Timeline audio only ·',
    'Exportando...': 'Exporting...', 'Exportação cancelada.': 'Export canceled.', 'Exportação em andamento': 'Export in progress',
    'Cancelar exportação': 'Cancel export', 'Erro ao exportar.': 'Export error.', 'Nada para exportar.': 'Nothing to export.',
    'Nada para exportar: todos os trechos foram removidos.': 'Nothing to export: every range was removed.',
    'Este arquivo não tem som para exportar em áudio.': 'This file has no sound to export as audio.',
    'GPU falhou, exportando pela CPU...': 'GPU failed, exporting on the CPU...', 'Iniciando exportação': 'Starting export',
    'Aguarde a exportação terminar (ou cancele-a) antes de fechar o editor.': 'Wait for the export to finish (or cancel it) before closing the editor.',
    'Fechar o editor de vídeo?': 'Close the video editor?', 'Há alterações no editor de vídeo que ainda não foram salvas.': 'The video editor has unsaved changes.',
    'Há alterações não salvas. Salve com Ctrl+S ou repita para descartar.': 'There are unsaved changes. Save with Ctrl+S or repeat to discard.',
    'Salvar o projeto antes de fechar?': 'Save the project before closing?', 'Não salvar': "Don't save", 'Não salvo •': 'Not saved •',
    'Projeto ainda não salvo (Ctrl+S)': 'Project not saved yet (Ctrl+S)', 'O projeto aberto será fechado.': 'The open project will be closed.',
    'Abra um vídeo antes de salvar': 'Open a video before saving', 'Erro ao abrir o vídeo': 'Error opening the video',
    'O player não conseguiu abrir este vídeo': 'The player could not open this video', 'Carregando vídeo...': 'Loading video...',
    'Analisando vídeo...': 'Analyzing video...', 'PRÉVIA LEVE': 'LIGHT PREVIEW',
    'Este formato não toca direto no app: você vê uma cópia leve. A exportação usa o arquivo original, em qualidade máxima.': 'This format doesn’t play directly in the app: you see a light copy. Export uses the original file at full quality.',
    'Preparando prévia leve (formato não toca direto no app)...': 'Preparing light preview (format doesn’t play directly in the app)...',
    'Voltar ao vídeo original': 'Back to the original video', 'Vídeo restaurado ao original': 'Video restored to the original',
    'Por enquanto o editor usa um vídeo por projeto. Para trocar, use Abrir (Ctrl+O).': 'For now the editor uses one video per project. To switch, use Open (Ctrl+O).',
    'Abra um vídeo primeiro; depois arraste as imagens para a timeline': 'Open a video first; then drag images onto the timeline',
    'Não foi possível abrir a imagem': 'Could not open the image', 'Não foi possível carregar a imagem': 'Could not load the image',
    'Formato de imagem não suportado no editor (use PNG, JPG, WEBP, GIF ou BMP).': 'Image format not supported in the editor (use PNG, JPG, WEBP, GIF or BMP).',
    'A timeline aparece aqui quando você abrir um vídeo': 'The timeline appears here when you open a video',
    'Desfazer (Ctrl+Z)': 'Undo (Ctrl+Z)', 'Desfazer ·': 'Undo ·', 'Desfazer última edição': 'Undo last edit', 'Refazer': 'Redo',
    'Refazer (Ctrl+Shift+Z)': 'Redo (Ctrl+Shift+Z)', 'Desfeito': 'Undone', 'Refeito': 'Redone',
    'Seleção (V)': 'Selection (V)', 'Seleção ·': 'Selection ·', 'Lâmina (C): clique para dividir': 'Razor (C): click to split', 'Lâmina ·': 'Razor ·',
    'Mão': 'Hand', 'Mão (H): arraste para navegar': 'Hand (H): drag to navigate', 'V - Selecionar/mover faixa': 'V - Select/move track',
    'E - Lâmina/corte': 'E - Razor/cut', 'M - Mão/navegar timeline': 'M - Hand/navigate timeline',
    'Q - Remover até a agulha': 'Q - Remove up to playhead', 'W - Remover depois da agulha': 'W - Remove after playhead',
    'Ímã (encaixe) liga/desliga': 'Snap on/off', 'Ímã: encaixar na agulha e nos cortes (N)': 'Snap: to the playhead and cuts (N)',
    'Ímã ligado': 'Snap on', 'Ímã desligado': 'Snap off', 'Mais zoom (+)': 'Zoom in (+)', 'Menos zoom (-)': 'Zoom out (-)',
    'Ajustar à tela': 'Fit to screen', 'Ajustar à tela (\\)': 'Fit to screen (\\)', 'Zoom ·': 'Zoom ·',
    'Ctrl+roda do mouse no vídeo: zoom · arraste para mover quando ampliado': 'Ctrl+mouse wheel on the video: zoom · drag to pan when zoomed',
    'Cortar': 'Cut', '⎮ Cortar': '⎮ Cut', 'Cortar todas as trilhas na agulha': 'Cut all tracks at the playhead',
    "Cortar todas as trilhas na agulha (' ou S)": "Cut all tracks at the playhead (' or S)", 'Já existe um corte aqui': 'There is already a cut here',
    'Limpar cortes': 'Clear cuts', 'Isso apagaria tudo da timeline': 'This would erase the whole timeline',
    'Apagar clipe selecionado (D)': 'Delete selected clip (D)', 'Apagar clipe selecionado (fecha o espaço)': 'Delete selected clip (closes the gap)',
    'Apagar clipe (D)': 'Delete clip (D)', 'Clipe apagado': 'Clip deleted', 'Não dá para apagar o último clipe': "Can't delete the last clip",
    'Clipe apagado (o espaço ficou porque há clipes em outras trilhas)': 'Clip deleted (the gap stays because other tracks have clips)',
    'Apagar da agulha até o próximo corte': 'Delete from the playhead to the next cut', 'Apagar do corte anterior até a agulha': 'Delete from the previous cut to the playhead',
    'Apagar trecho entre In e Out': 'Delete range between In and Out', 'Remover trecho In→Out (X)': 'Remove In→Out range (X)',
    'Trecho In→Out removido': 'In→Out range removed', 'Removido até a agulha': 'Removed up to the playhead', 'Removido depois da agulha': 'Removed after the playhead',
    'Nada antes da agulha': 'Nothing before the playhead', 'Nada depois da agulha': 'Nothing after the playhead', 'Não há clipe na agulha': 'No clip at the playhead',
    'Marcar entrada (I)': 'Mark in (I)', 'Marcar saída (O)': 'Mark out (O)', 'Marcar entrada / saída': 'Mark in / out',
    'Marque entrada (I) e saída (O) primeiro': 'Mark in (I) and out (O) first', 'Corte anterior (↑)': 'Previous cut (↑)', 'Próximo corte (↓)': 'Next cut (↓)',
    'Corte anterior / próximo': 'Previous / next cut', 'Início (Home)': 'Start (Home)', 'Fim (End)': 'End (End)', 'Início / Fim': 'Start / End',
    'Voltar 1 frame (←)': 'Back 1 frame (←)', 'Avançar 1 frame (→)': 'Forward 1 frame (→)', '1 frame ·': '1 frame ·', '1 segundo': '1 second',
    'Voltar 5s ·': 'Back 5s ·', 'Reproduzir / Pausar (Espaço)': 'Play / Pause (Space)', 'Play / Pausa': 'Play / Pause', 'Pausar': 'Pause',
    'Pausar ·': 'Pause ·', 'Espaço': 'Space', 'Reprodução': 'Playback', 'Play 1,5x → 2x → 3x → normal': 'Play 1.5x → 2x → 3x → normal',
    'Velocidade normal': 'Normal speed', 'Som da prévia (M)': 'Preview sound (M)', 'Posição atual': 'Current position',
    'Duração final do vídeo editado': 'Final duration of the edited video', 'Duração final:': 'Final duration:',
    'Este vídeo não tem som': 'This video has no sound', 'Imagem não tem som': 'Images have no sound', 'sem áudio': 'no audio',
    'Ganho de áudio': 'Audio gain', 'Ajustar ganho em (dB)': 'Adjust gain by (dB)', 'Ganho do clipe selecionado (ex.: 10 ou -10 dB)': 'Selected clip gain (e.g. 10 or -10 dB)',
    'ex.: 10 ou -10': 'e.g. 10 or -10', 'Selecione um clipe para ajustar o ganho': 'Select a clip to adjust the gain', 'Ganho atual do clipe: ': 'Current clip gain: ',
    '0 dB | Livre': '0 dB | Free', 'Livre': 'Free', 'Clipe': 'Clip', 'Clipes:': 'Clips:',
    'Arraste a borda de V1/A1 para mudar a altura da trilha': 'Drag the V1/A1 edge to change the track height',
    'Arraste para aumentar ou diminuir a trilha': 'Drag to grow or shrink the track',
    'Arraste a borda de um clipe para encurtar ou alongar': 'Drag a clip edge to shorten or lengthen it',
    'Arraste um clipe para frente/trás ou para outra trilha (V1–V4)': 'Drag a clip forward/back or to another track (V1–V4)',
    'A agulha anda pela régua; clicar no clipe só seleciona': 'The playhead moves along the ruler; clicking a clip only selects it',
    '+Roda: zoom até o quadro · Roda: rolar ·': '+Wheel: zoom down to frames · Wheel: scroll ·', '+Roda: trilhas': '+Wheel: tracks',
    'Adicionar imagem na timeline (ou arraste a imagem para a timeline)': 'Add image to the timeline (or drag the image onto the timeline)',
    'Arraste uma imagem do Windows para a timeline para usá-la por cima do vídeo': 'Drag an image from Windows onto the timeline to use it over the video',
    'Arraste imagens (PNG, JPG, WEBP, GIF) para usar por cima do vídeo': 'Drag images (PNG, JPG, WEBP, GIF) to use over the video',
    'Selecione um clipe na timeline': 'Select a clip on the timeline', 'Selecione um clipe na timeline primeiro': 'Select a clip on the timeline first',
    'Ferramentas e visão': 'Tools and view', 'Edição': 'Editing', 'Velocidade': 'Speed', 'Fit': 'Fit',
    // propriedades / quadros-chave
    'Escala': 'Scale', 'Posição X': 'Position X', 'Posição Y': 'Position Y', 'Rotação': 'Rotation', 'Opacidade': 'Opacity',
    'Centralizar': 'Center', '↺ Restaurar': '↺ Reset', '↺ Restaurar tudo': '↺ Reset all', 'Restaurar valores': 'Reset values', 'Transformar': 'Transform',
    'Selecione um clipe ou imagem na timeline para ajustar escala, posição, rotação e opacidade.': 'Select a clip or image on the timeline to adjust scale, position, rotation and opacity.',
    'Dica: com o clipe selecionado, arraste a imagem direto no monitor para mover. Clique no ⏱ de uma propriedade para animá-la com quadros-chave.': 'Tip: with the clip selected, drag the image right on the monitor to move it. Click a property’s ⏱ to animate it with keyframes.',
    'Quadros-chave (Controles de efeito)': 'Keyframes (Effect Controls)',
    '⏱ liga a animação da propriedade e marca o 1º quadro-chave na agulha': '⏱ turns on the property animation and sets the 1st keyframe at the playhead',
    'Com ⏱ ligado, mova a agulha e mude o valor (ou arraste no monitor): o quadro-chave é criado sozinho': 'With ⏱ on, move the playhead and change the value (or drag on the monitor): the keyframe is created automatically',
    '‹ ◆ › Anterior · adicionar/remover na agulha · próximo': '‹ ◆ › Previous · add/remove at the playhead · next',
    'Na timeline: clique no ◆ para ir até ele · arraste para mudar o tempo': 'On the timeline: click a ◆ to go to it · drag to change its time',
    'Interpolação: Linear, Suave, Acelerar, Frear ou Parar — ou arraste as alças do gráfico (curva de valor e de velocidade)': 'Interpolation: Linear, Ease, Ease in, Ease out or Hold — or drag the graph handles (value and speed curves)',
    'Adicionar/remover quadro-chave na agulha': 'Add/remove keyframe at the playhead', 'Quadro-chave anterior': 'Previous keyframe', 'Próximo quadro-chave': 'Next keyframe',
    'Não há quadro-chave antes': 'No keyframe before', 'Não há quadro-chave depois': 'No keyframe after',
    'Leve a agulha para dentro do clipe': 'Move the playhead inside the clip',
    'Leve a agulha para dentro do clipe para criar o quadro-chave': 'Move the playhead inside the clip to create the keyframe',
    'Interpolação': 'Interpolation', 'Linear': 'Linear', 'Suave': 'Ease', 'Acelerar': 'Ease in', 'Frear': 'Ease out', 'Parar': 'Hold',
    'Curva': 'Curve', 'Valor': 'Value',
    'Arraste as alças para mudar a curva (duplo clique volta ao linear)': 'Drag the handles to change the curve (double-click resets to linear)',
    // efeitos
    'Efeitos': 'Effects', 'Buscar efeito': 'Search effect', 'Nenhum efeito encontrado.': 'No effect found.', 'Remover efeito': 'Remove effect',
    'Arraste um efeito até um clipe na timeline, ou selecione o clipe e dê duplo clique no efeito.': 'Drag an effect onto a clip on the timeline, or select the clip and double-click the effect.',
    'Arraste até um clipe · duplo clique aplica no clipe selecionado': 'Drag onto a clip · double-click applies to the selected clip',
    'Efeitos de vídeo precisam de um vídeo ou imagem': 'Video effects need a video or image',
    'Selecione um clipe na timeline (ou arraste o efeito até ele)': 'Select a clip on the timeline (or drag the effect onto it)',
    'Aplicar antes (subir)': 'Apply earlier (move up)', 'Aplicar depois (descer)': 'Apply later (move down)', 'Recolher/expandir': 'Collapse/expand',
    'Brilho': 'Brightness', 'Contraste': 'Contrast', 'Brilho e contraste': 'Brightness and contrast', 'Correção de cor': 'Color correction',
    'Desfoque': 'Blur', 'Desfoque e nitidez': 'Blur and sharpen', 'Desfoque gaussiano': 'Gaussian blur', 'Esquerda': 'Left', 'Direita': 'Right',
    'Superior': 'Top', 'Inferior': 'Bottom', 'Saturação': 'Saturation', 'Nitidez': 'Sharpen', 'Recorte': 'Crop', 'Quantidade': 'Amount',
    'Temperatura': 'Temperature', 'Matiz': 'Tint', 'Exposição': 'Exposure', 'Gama': 'Gamma', 'Vinheta': 'Vignette', 'Espelhar': 'Mirror',
    'Horizontal': 'Horizontal', 'Vertical': 'Vertical', 'Raio': 'Radius', 'Intensidade': 'Intensity', 'Cor': 'Color', 'Estilizar': 'Stylize',
    'Preto e branco': 'Black and white', 'Sépia': 'Sepia', 'Inverter': 'Invert', 'Ruído': 'Noise', 'Granulação': 'Grain',
    // Trilhas (cabeçalho) e menu do clipe
    'Bloquear trilha (os clipes não podem ser editados)': 'Lock track (clips cannot be edited)', 'Desbloquear trilha': 'Unlock track',
    'Ocultar trilha (não aparece na prévia nem na exportação)': 'Hide track (not shown in preview or export)', 'Mostrar trilha': 'Show track',
    'Silenciar trilha': 'Mute track', 'Ativar som da trilha': 'Unmute track',
    'Trilha bloqueada: clique no cadeado para desbloquear': 'Track locked: click the lock to unlock',
    'Cor do rótulo': 'Label color', 'Padrão': 'Default', 'Ganho de áudio…': 'Audio gain…',
    'Efeitos e propriedades': 'Effects and properties', 'Apagar clipe': 'Delete clip',
    'Violeta': 'Violet', 'Íris': 'Iris', 'Azul': 'Blue', 'Cerúleo': 'Cerulean', 'Caribe': 'Caribbean', 'Verde-azulado': 'Teal',
    'Floresta': 'Forest', 'Verde': 'Green', 'Amarelo': 'Yellow', 'Manga': 'Mango', 'Laranja': 'Orange', 'Rosa': 'Rose',
    'Magenta': 'Magenta', 'Lavanda': 'Lavender', 'Bege': 'Tan', 'Marrom': 'Brown',
    // Painel Ferramentas
    'Ferramentas': 'Tools', 'Seleção': 'Selection', 'Velocidade (Rate Stretch)': 'Rate Stretch', 'Lâmina': 'Razor', 'Mão': 'Hand', 'Zoom': 'Zoom',
    'Z': 'Z', 'Zoom (clique aproxima,': 'Zoom (click zooms in,', '+clique afasta)': '+click zooms out)',
    // Painel Projeto
    'Projeto': 'Project', 'Buscar no projeto': 'Search project', 'Nome': 'Name', 'Tipo': 'Type', 'Informações': 'Info', 'Uso': 'Usage',
    'Clipes na timeline': 'Clips in the timeline', 'Pasta': 'Bin', 'item': 'item', 'itens': 'items', 'Legendas': 'Captions', 'Projeto não salvo': 'Unsaved project',
    'Abra um vídeo para começar. Depois arraste para cá imagens, áudios, legendas (.srt), outros vídeos e pastas inteiras.': 'Open a video to start. Then drag images, audio, captions (.srt), other videos and whole folders here.',
    'Nada encontrado': 'Nothing found', 'Nova pasta': 'New bin', 'cópia': 'copy', 'Nova camada de ajuste': 'New adjustment layer',
    'Importar...': 'Import...', 'Renomear': 'Rename', 'Duplicar': 'Duplicate', 'Recortar': 'Cut', 'Copiar': 'Copy', 'Colar': 'Paste', 'Apagar': 'Delete',
    'Importar arquivos (Ctrl+I) — ou arraste arquivos e pastas do Windows para cá': 'Import files (Ctrl+I) — or drag files and folders from Windows here',
    'Nova pasta (Ctrl+B)': 'New bin (Ctrl+B)', 'Apagar do projeto (Delete)': 'Delete from project (Delete)', 'ainda não entra na timeline': 'not usable in the timeline yet',
    'Importando...': 'Importing...', 'Nenhum arquivo compatível': 'No compatible files', 'Item duplicado': 'Item duplicated',
    'Camada de ajuste criada: arraste para a timeline': 'Adjustment layer created: drag it to the timeline',
    'Uma pasta não pode ir para dentro dela mesma': "A bin can't go inside itself",
    'Recortado: Ctrl+V cola na pasta selecionada': 'Cut: Ctrl+V pastes into the selected bin', 'Copiado: Ctrl+V cola na pasta selecionada': 'Copied: Ctrl+V pastes into the selected bin',
    'O vídeo principal do projeto não pode ser apagado': "The project's main video can't be deleted",
    'Por enquanto só o vídeo principal entra na timeline (vários vídeos por projeto vem em breve)': 'For now only the main video goes into the timeline (multiple videos per project coming soon)',
    'Não há trilha de áudio livre nesse ponto (A1 a A4)': 'No free audio track at that point (A1 to A4)',
    // Painel Propriedades, ferramenta Texto (T) e Velocidade (R)
    'Estilo da fonte': 'Font style', '(simulado)': '(simulated)',
    'Ponto de ancoragem': 'Anchor point', 'Ponto de ancoragem: clique para escolher (o objeto não sai do lugar)': 'Anchor point: click to choose (the object stays in place)',
    'No monitor: arraste as alças para escalar, por fora dos cantos para girar e a mira ⊕ para mudar o ponto de ancoragem.': 'On the monitor: drag the handles to scale, outside the corners to rotate and the ⊕ crosshair to move the anchor point.',
    'Clipe apagado (Shift+D apaga e fecha o espaço)': 'Clip deleted (Shift+D deletes and closes the gap)',
    'Apagar clipe selecionado (o espaço fica) ·': 'Delete selected clip (the gap stays) ·', 'apaga e fecha o espaço': 'deletes and closes the gap',
    'Apagar clipe selecionado (D: o espaço fica · Shift+D: fecha o espaço)': 'Delete selected clip (D: the gap stays · Shift+D: closes the gap)',
    'copiar / recortar ·': 'copy / cut ·', 'cola na agulha, na mesma trilha': 'pastes at the playhead, on the same track',
    '+arrastar um clipe (na timeline ou no monitor) duplica ·': '+drag a clip (timeline or monitor) duplicates ·', 'muda o clipe de trilha': 'moves the clip to another track',
    'Selecione um clipe para copiar': 'Select a clip to copy', 'Clipe copiado: Ctrl+V cola na agulha': 'Clip copied: Ctrl+V pastes at the playhead',
    'Clipe recortado: Ctrl+V cola na agulha': 'Clip cut: Ctrl+V pastes at the playhead', 'Nada copiado (Ctrl+C num clipe primeiro)': 'Nothing copied (Ctrl+C a clip first)',
    'A mídia desse clipe não está mais no projeto': "That clip's media is no longer in the project",
    'Não há trilha acima para a cópia (V4 é a última)': 'No track above for the copy (V4 is the last one)',
    'Cortar só os clipes selecionados na agulha': 'Cut only the selected clips at the playhead',
    'Arrastar na área vazia da timeline seleciona vários clipes ·': 'Dragging on an empty area of the timeline selects several clips ·',
    '+clique soma / tira da seleção': '+click adds to / removes from the selection',
    'Botão do elo (timeline): seleção vinculada — desligada, clicar no vídeo ou no áudio pega só aquela parte':
        'Link button (timeline): linked selection — when off, clicking the video or the audio picks only that part',
    'Seleção vinculada: ligada, clicar no vídeo ou no áudio seleciona os dois; desligada, só a parte clicada':
        'Linked selection: on, clicking the video or the audio selects both; off, only the clicked part',
    'Seleção vinculada ligada: vídeo e áudio juntos': 'Linked selection on: video and audio together',
    'Seleção vinculada desligada: vídeo e áudio separados': 'Linked selection off: video and audio separately',
    "Selecione um clipe (E corta só os selecionados; ' corta todas as trilhas)": "Select a clip (E cuts only the selected ones; ' cuts every track)",
    'Nenhum clipe selecionado passa pela agulha': 'No selected clip is under the playhead',
    'Não dá para apagar todos os clipes': "Can't delete every clip",
    'Transições de vídeo': 'Video transitions',
    'Dobrar': 'Fold', 'Potência constante': 'Constant Power', 'Esse clipe não tem som': "This clip has no sound",
    'Selecione a ponta de um clipe com som (ou o clipe) e aperte Ctrl+Shift+D': 'Select the edge of a clip with sound (or the clip) and press Ctrl+Shift+D',
    'Selecione a ponta de um clipe (ou o clipe) e aperte Ctrl+D': 'Select the edge of a clip (or the clip) and press Ctrl+D',
    'Sem mídia sobrando para a transição': 'Not enough extra media for the transition',
    'Clique marca como a do Ctrl+D · arraste até o corte entre dois clipes (ou o início/fim de um clipe) · duplo clique põe na entrada do clipe selecionado':
        'Click to set it as the Ctrl+D transition · drag onto the cut between two clips (or the start/end of a clip) · double-click adds it to the start of the selected clip',
    'Clique numa transição para usá-la no Ctrl+D; clique na ponta de um clipe e aperte Ctrl+D (vídeo) ou Ctrl+Shift+D / Ctrl+Shift+9 (áudio: Potência constante)':
        'Click a transition to use it with Ctrl+D; click a clip edge and press Ctrl+D (video) or Ctrl+Shift+D / Ctrl+Shift+9 (audio: Constant Power)',
    'Chaveamento': 'Keying', 'Cor da tela': 'Screen color', 'Ganho da tela': 'Screen gain', 'Equilíbrio': 'Screen balance',
    'Recorte do preto': 'Clip black', 'Recorte do branco': 'Clip white', 'Encolher / expandir': 'Choke / expand',
    'Suavizar borda': 'Soften edge', 'Remover reflexo': 'Despill', 'Mostrar matte (só na prévia)': 'Show matte (preview only)',
    '⌖ Conta-gotas': '⌖ Eyedropper', 'Conta-gotas: clique na tela verde/azul no monitor': 'Eyedropper: click the green/blue screen on the monitor',
    'Clique na tela verde/azul no monitor (Esc cancela)': 'Click the green/blue screen on the monitor (Esc cancels)', 'Transições': 'Transitions', 'Buscar transição': 'Search transition',
    'Nenhuma transição encontrada.': 'No transition found.',
    'Passe o mouse para ver o exemplo. Arraste até o corte entre dois clipes (ou o início/fim de um clipe); a borda do bloco na timeline muda a duração.':
        'Hover to see the example. Drag onto the cut between two clips (or the start/end of a clip); the block edge on the timeline changes its duration.',
    'Arraste uma transição do painel Transições até o corte · arraste a borda do bloco para mudar a duração':
        'Drag a transition from the Transitions panel onto the cut · drag the block edge to change its duration', 'Dissolução cruzada': 'Cross Dissolve', 'Empurrar': 'Push',
    'Deslizar': 'Slide', 'Puxar (zoom)': 'Pull (zoom)', 'Transição apagada': 'Transition deleted',
    'Arraste até o corte entre dois clipes (ou o início/fim de um clipe) · duplo clique põe na entrada do clipe selecionado':
        'Drag onto the cut between two clips (or the start/end of a clip) · double-click adds it to the start of the selected clip',
    'Selecione um clipe na timeline (ou arraste a transição até o corte)': 'Select a clip on the timeline (or drag the transition onto the cut)',
    'Transições de vídeo não se aplicam a áudio nem a camada de ajuste': "Video transitions don't apply to audio or adjustment layers",
    'Sem mídia sobrando nos dois lados do corte para a transição': 'Not enough extra media on either side of the cut for the transition',
    'Arraste uma transição do painel Efeitos até o corte · arraste a borda do bloco para mudar a duração':
        'Drag a transition from the Effects panel onto the cut · drag the block edge to change its duration',
    'Alinhar e transformar': 'Align and transform', 'Centralizar na horizontal': 'Center horizontally', 'Centralizar na vertical': 'Center vertically',
    '⇹ Centro H': '⇹ Center H', '⇳ Centro V': '⇳ Center V', 'Ajustar ao quadro': 'Fit to frame', 'Preencher o quadro': 'Fill frame',
    'Mostra o quadro inteiro, com faixas se a proporção for outra': 'Shows the whole frame, with bars if the aspect ratio differs',
    'Cobre o quadro inteiro, cortando o que sobrar': 'Covers the whole frame, cropping the excess',
    'Duração': 'Duration', 'Manter o tom do áudio': 'Maintain audio pitch', 'Empurrar os clipes seguintes da trilha': 'Ripple: shift the following clips on the track',
    'Também dá para arrastar a borda do clipe com a ferramenta Velocidade (R).': 'You can also drag the clip edge with the Rate Stretch tool (R).',
    'Volume': 'Volume', 'Aparência': 'Appearance', 'Preenchimento': 'Fill', 'Contorno': 'Stroke', 'Largura': 'Width', 'Sombra': 'Shadow',
    'Margem': 'Padding', 'Cantos': 'Corner radius', 'Distância': 'Distance', 'Desfoque': 'Blur', 'Fonte': 'Font', 'Espaçamento': 'Tracking', 'Entrelinha': 'Leading',
    'Itálico': 'Italic', 'Alinhar à esquerda': 'Align left', 'Alinhar à direita': 'Align right', 'Digite o texto': 'Type the text',
    'Selecione um clipe, texto ou legenda para ver as propriedades dele aqui.': 'Select a clip, text or caption to see its properties here.',
    'Dica:': 'Tip:', 'e clique no monitor cria um texto ·': 'and click the monitor to create a text ·', 'e arraste a borda de um clipe muda a velocidade.': 'and drag a clip edge to change its speed.',
    'Abra um vídeo para começar.': 'Open a video to start.',
    'Os efeitos da camada valem para tudo o que está abaixo dela.': 'The layer’s effects apply to everything below it.',
    'Duplo clique no texto do monitor para editar ali mesmo. Quadros-chave: Controles de efeito.': 'Double-click the text on the monitor to edit it there. Keyframes: Effect Controls.',
    'Legenda': 'Caption', 'Texto da legenda': 'Caption text', 'Estilo das legendas (todas)': 'Caption style (all)', 'Painel Texto ›': 'Text panel ›',
    'Controles de efeito ›': 'Effect Controls ›', 'Luz e Cor ›': 'Light & Color ›',
    'Fonte, tamanho, cor, fundo e posição das legendas ficam no painel Propriedades (selecione uma legenda).': 'Caption font, size, color, background and position are in the Properties panel (select a caption).',
    'Editar estilo em Propriedades': 'Edit style in Properties', 'Propriedades (velocidade, volume)': 'Properties (speed, volume)',
    'Velocidade (R): arraste a borda de um clipe para acelerar ou desacelerar': 'Rate Stretch (R): drag a clip edge to speed it up or slow it down',
    'Texto (T): clique no monitor para escrever': 'Type (T): click the monitor to write', 'Velocidade (R): arraste a borda de um clipe': 'Rate Stretch (R): drag a clip edge',
    'Velocidade (R): arraste a borda do clipe para acelerar ou desacelerar': 'Rate Stretch (R): drag the clip edge to speed it up or slow it down',
    'Texto precisa de um vídeo': 'Text needs a video', 'Não há trilha de vídeo livre na agulha para o texto (V1 a V4)': 'No free video track at the playhead for the text (V1 to V4)',
    'Velocidade: arraste a borda do clipe (mais curto = mais rápido)': 'Rate Stretch: drag the clip edge (shorter = faster)',
    'Texto: clique no monitor e digite · duplo clique num texto edita ·': 'Type: click the monitor and type · double-click a text to edit ·', 'termina': 'finishes',
    'Preparando os textos...': 'Preparing texts...',
    // Painel Texto (transcrição e legendas)
    'Texto': 'Text', 'Transcrição': 'Transcript', 'Legendas': 'Captions', 'Transcrever sequência': 'Transcribe sequence',
    'Transforma a fala da timeline em texto, com o tempo de cada palavra. Roda neste computador, sem internet (depois do primeiro uso).': 'Turns the speech in the timeline into text, with the timing of every word. Runs on this computer, offline (after the first use).',
    'Idioma da fala': 'Speech language', 'Português (Brasil)': 'Portuguese (Brazil)', 'Outras línguas europeias': 'Other European languages',
    'Transcrever': 'Transcribe', 'Começando...': 'Starting...', 'Buscar na transcrição': 'Search transcript', 'Transcrever de novo': 'Transcribe again',
    'A timeline mudou depois da transcrição.': 'The timeline changed after the transcription.',
    'Clique numa palavra para ir até ela · duplo clique corrige a palavra': 'Click a word to jump to it · double-click to fix the word',
    'Criar legendas': 'Create captions', 'Máx. caracteres por linha': 'Max. characters per line', 'Linhas': 'Lines', 'Uma': 'Single', 'Duas': 'Double',
    'Duração mínima (s)': 'Minimum duration (s)', 'Intervalo (quadros)': 'Gap (frames)', 'Criar legendas a partir da transcrição': 'Create captions from transcript',
    'Estilo': 'Style', 'Tamanho': 'Size', 'Cor do texto': 'Text color', 'Fundo': 'Background', 'Caixa': 'Box', 'Contorno e sombra': 'Outline and shadow',
    'Nenhum': 'None', 'Posição': 'Position', 'Embaixo': 'Bottom', 'No meio': 'Middle', 'Em cima': 'Top', 'Negrito': 'Bold', 'CAIXA ALTA': 'ALL CAPS',
    'Gravar as legendas no vídeo ao exportar': 'Burn captions into the video on export', 'Salvar .srt': 'Save .srt',
    'Clique em "Criar legendas" para gerar a partir da transcrição.': 'Click "Create captions" to generate them from the transcript.',
    'Primeiro transcreva a sequência na aba Transcrição.': 'First transcribe the sequence in the Transcript tab.',
    'Ir para a legenda': 'Go to caption', 'Apagar legenda': 'Delete caption', 'Legenda apagada': 'Caption deleted',
    'Não há som na timeline para transcrever': 'There is no sound in the timeline to transcribe', 'Nenhuma fala encontrada na timeline': 'No speech found in the timeline',
    'Transcreva a sequência primeiro': 'Transcribe the sequence first', 'Crie as legendas primeiro': 'Create the captions first',
    'Isso substitui as legendas atuais. Clique de novo para confirmar (dá para desfazer com Ctrl+Z).': 'This replaces the current captions. Click again to confirm (Ctrl+Z undoes it).',
    'Preparando o áudio da timeline...': 'Preparing the timeline audio...', 'Carregando o modelo...': 'Loading the model...', 'Transcrevendo...': 'Transcribing...',
    'Otimizando o modelo (uma vez só)...': 'Optimizing the model (only once)...', 'Modelo pronto': 'Model ready',
    'Legendas (painel Texto)': 'Captions (Text panel)',
    // Áudio solto na timeline
    'Preparando o áudio...': 'Preparing audio...', 'Não foi possível abrir o áudio': 'Could not open the audio',
    'Não há trilha de áudio livre a partir da agulha (A1 a A4)': 'No free audio track from the playhead (A1 to A4)',
    'Efeitos de vídeo não se aplicam a um clipe de áudio': 'Video effects do not apply to an audio clip',
    'Clipe só de som: ajuste o volume com G (ganho) ou pelo botão direito.': 'Audio-only clip: adjust the volume with G (gain) or the right-click menu.',
    'Este arquivo não tem som.': 'This file has no sound.', 'Não foi possível ler o áudio.': 'Could not read the audio.',
    // Camada de ajuste
    'Ajuste': 'Adjustment', 'Camada de ajuste': 'Adjustment layer', 'Camada de ajuste precisa de um vídeo': 'An adjustment layer needs a video',
    'Camada de ajuste: os efeitos dela valem para tudo o que está nas trilhas de baixo': 'Adjustment layer: its effects apply to everything on the tracks below',
    'Camada de ajuste criada: arraste efeitos (ou use Luz e Cor) nela para afetar tudo o que está abaixo': 'Adjustment layer created: drag effects onto it (or use Light & Color) to affect everything below',
    // Luz e Cor
    'Luz e Cor': 'Light & Color', 'Luz e Cor aplicado': 'Light & Color applied', 'sem ajustes': 'no adjustments', 'desligado': 'off',
    'Correção básica': 'Basic correction', 'Balanço de branco': 'White balance', 'Tom': 'Tone', 'Realces': 'Highlights',
    'Sombras': 'Shadows', 'Brancos': 'Whites', 'Pretos': 'Blacks', 'Criativo': 'Creative', 'Filme desbotado': 'Faded film',
    'Vibração': 'Vibrance', 'Curvas': 'Curves', 'Restaurar esta seção': 'Reset this section', 'Duplo clique restaura': 'Double-click to reset',
    'Ligar/desligar Luz e Cor': 'Turn Light & Color on/off', 'Restaurar todos os ajustes': 'Reset all adjustments',
    'Curva RGB (todas as cores)': 'RGB curve (all colors)', 'Curva só do vermelho': 'Red only curve', 'Curva só do verde': 'Green only curve',
    'Curva só do azul': 'Blue only curve', 'Editar no painel Luz e Cor': 'Edit in the Light & Color panel',
    'Máximo de 16 pontos por curva': 'Up to 16 points per curve',
    'Clique para criar um ponto e arraste · duplo clique (ou Ctrl+clique) no ponto remove': 'Click to add a point and drag · double-click (or Ctrl+click) a point to remove it',
    'Selecione um clipe ou imagem na timeline para corrigir luz e cor: exposição, contraste, realces, sombras, balanço de branco, saturação, curvas e mais.': 'Select a clip or image on the timeline to correct light and color: exposure, contrast, highlights, shadows, white balance, saturation, curves and more.',
    // painéis / workspaces
    'Janela ▾': 'Window ▾', 'Painéis': 'Panels', 'Painéis (como no Premiere)': 'Panels (like in Premiere)',
    'Painéis: mostrar/ocultar e restaurar o layout padrão': 'Panels: show/hide and restore the default layout',
    'Duplo clique na aba maximiza o painel (de novo para voltar) ·': 'Double-click a tab to maximize the panel (again to restore) ·', 'restaura o layout': 'restores the layout',
    'Arraste a aba de um painel: solte no centro de outro para virar aba; nas bordas, ele se encaixa ao lado / acima / abaixo': 'Drag a panel’s tab: drop it in the center of another to make a tab; at the edges it docks beside / above / below',
    'Arraste a divisa entre dois painéis para redimensionar': 'Drag the divider between two panels to resize',
    'Soltar bem na borda da janela encaixa o painel ocupando a lateral inteira': 'Dropping right at the window edge docks the panel along the whole side',
    'na aba,': 'on the tab,',
    'ao soltar, ou soltar fora dos painéis: o painel vira uma janela própria (dá para levar a outro monitor). Fechar a janela devolve o painel ao lugar de antes': 'when dropping, or dropping outside the panels: the panel becomes its own window (you can move it to another monitor). Closing the window returns the panel to where it was',
    'Workspaces': 'Workspaces', 'Nenhum salvo ainda': 'None saved yet', 'Nome do workspace': 'Workspace name', 'ex.: Edição 2 monitores': 'e.g. 2-monitor editing',
    'Salvar estilo de workspace…': 'Save workspace style…', 'Excluir workspace': 'Delete workspace', 'Excluir?': 'Delete?',
    'Restaurar layout padrão': 'Restore default layout', 'Layout padrão restaurado': 'Default layout restored',
    'Guarda a organização dos painéis e as janelas soltas (com o monitor e a posição de cada uma).': 'Stores the panel arrangement and floating windows (with each one’s monitor and position).',
    'O Editor de Vídeo passa a abrir sempre assim.': 'The Video Editor will always open like this.',
    'Fechar painel (reabra em Janela)': 'Close panel (reopen in Window)', 'Precisa ficar pelo menos um painel no editor': 'At least one panel must stay in the editor',
    'Arraste para mover o painel (para outra janela também; Ctrl ao soltar: nova janela) · duplo clique: maximizar': 'Drag to move the panel (to another window too; Ctrl on drop: new window) · double-click: maximize',
    'Soltar em janela própria (dá para levar a outro monitor)': 'Pop out into its own window (you can move it to another monitor)',
    'Não foi possível abrir a janela solta': 'Could not open the floating window', ' — nova janela solta': ' — new floating window',
    'Encaixar todas as janelas soltas': 'Dock all floating windows', '⤓ Encaixar no editor': '⤓ Dock into the editor',
    'Encaixar: arraste a aba ou a janela até um quadradinho laranja': 'Dock: drag the tab or window onto an orange square',
    'Arraste uma aba para outro painel, ou arraste esta janela pela barra de título e solte num quadradinho laranja': 'Drag a tab to another panel, or drag this window by its title bar and drop it on an orange square',
    'Devolver os painéis desta janela ao editor (ou só feche a janela)': 'Return this window’s panels to the editor (or just close the window)',
    'Programa': 'Program', 'Monitor': 'Monitor', 'Linha do tempo': 'Timeline', 'Propriedades': 'Properties', 'Controles de efeito': 'Effect Controls',
    'Mídia': 'Media', 'Clipes': 'Clips', 'Timeline': 'Timeline', 'Projeto': 'Project', 'Controles': 'Controls', 'Atalhos': 'Shortcuts',
};

// Frases com partes variáveis (números, nomes, caminhos)
const I18N_RE = [
    [/^Transcrição pronta: (\d+) palavras em ([\d.]+) s$/, 'Transcript ready: $1 words in $2 s'],
    [/^(\d+) legendas criadas$/, '$1 captions created'],
    [/^Legendas salvas: (.+)$/, 'Captions saved: $1'],
    [/^Não foi possível transcrever: (.+)$/, 'Could not transcribe: $1'],
    [/^Baixando o modelo de transcrição \((.+)\)\.\.\.(.*)$/, (m, a, b) => `Downloading the transcription model (${i18nT(a)})...${b}`],
    [/^Transcrevendo\.\.\. (\d+)%$/, 'Transcribing... $1%'],
    [/^Na primeira vez baixa o modelo de (.+) \((.+); fica com (\d+) MB\)\.$/, (m, a, b, c) => `The first time, it downloads the ${i18nT(a)} model (${b}; ${c} MB on disk).`],
    [/^Áudio adicionado em A(\d)$/, 'Audio added to A$1'],
    [/^Áudio (\d+)(.*)$/, 'Audio $1$2'],
    [/^([VA]\d) (bloqueada|desbloqueada|oculta|visível|sem som|com som)$/, (m, t, e) =>
        `${t} ${{ bloqueada: 'locked', desbloqueada: 'unlocked', oculta: 'hidden', 'visível': 'visible', 'sem som': 'muted', 'com som': 'unmuted' }[e]}`],
    [/^Ajuste (\d+)(.*)$/, 'Adjustment $1$2'],
    [/^Camada de ajuste adicionada em V(\d+)$/, 'Adjustment layer added to V$1'],
    [/^Clipe (\d+)$/, 'Clip $1'],
    [/^(Texto|Imagem|Áudio|Ajuste) (\d+)$/, (m, n, i) => `${{ Texto: 'Text', Imagem: 'Image', 'Áudio': 'Audio', Ajuste: 'Adjustment' }[n]} ${i}`],
    [/^Texto · (.+)$/, 'Text · $1'],
    [/^(Seleção|Lâmina|Mão|Zoom|Texto|Velocidade \(Rate Stretch\)) \((\w)\)( · segure para ver as outras)?$/, (m, n, k, g) => `${i18nT(n)} (${k})${g ? ' · hold to see the others' : ''}`],
    [/^(\d+) de (\d+) selecionado\(s\)$/, '$1 of $2 selected'],
    [/^(\d+) (item|itens)$/, (m, n) => `${n} ${n === '1' ? 'item' : 'items'}`],
    [/^(\d+) (item importado|itens importados) para o projeto$/, (m, n) => `${n} item(s) imported into the project`],
    [/^(\d+) itens duplicados$/, '$1 items duplicated'],
    [/^(\d+) legendas$/, '$1 captions'],
    [/^(\d+) legendas na trilha LEG$/, '$1 captions on the LEG track'],
    [/^(\d+) clipe\(s\) da timeline usam esse material e sairão junto\. Apague de novo para confirmar\.$/, '$1 timeline clip(s) use this media and will be removed too. Delete again to confirm.'],
    [/^Camada de ajuste (\d+)$/, 'Adjustment layer $1'],
    [/^(.+) duplicado em ([VA]\d)$/, (m, n, t) => `${i18nT(n)} duplicated to ${t}`],
    [/^Colado em ([VA]\d)$/, 'Pasted to $1'],
    [/^Selecionados cortados em (.+)$/, 'Selected clips cut at $1'],
    [/^Cor da tela: (#[0-9a-f]{6})$/i, 'Screen color: $1'],
    [/^(.+): (\d+) transiç(?:ões aplicadas|ão aplicada)$/, (m, n, k) => `${i18nT(n)}: ${k} transition${k > 1 ? 's' : ''} applied`],
    [/^(.+) não se aplica a uma camada de ajuste$/, (m, n) => `${i18nT(n)} doesn't apply to an adjustment layer`],
    [/^(Dissolução cruzada|Empurrar|Deslizar|Puxar \(zoom\)|Pop) \(([^)]+)\)( · encurtada: pouca mídia sobrando)?$/,
        (m, n, d, e) => `${i18nT(n)} (${d})` + (e ? ' · shortened: little extra media' : '')],
    [/^(\d+) clipes (movidos|duplicados)$/, (m, n, o) => `${n} clips ${o === 'movidos' ? 'moved' : 'duplicated'}`],
    [/^(\d+) clipes apagados( \(os de trilhas bloqueadas ficaram\))?$/, (m, n, b) => `${n} clips deleted` + (b ? ' (the ones on locked tracks stayed)' : '')],
    [/^Áudio · (.+)$/, 'Audio · $1'],
    [/^Camada de ajuste · (.+)$/, 'Adjustment layer · $1'],
    [/^(\d+) de (\d+) · trilha LEG$/, '$1 of $2 · LEG track'],
    [/^Clipe (\d+)(.*)$/, 'Clip $1$2'],
    [/^Imagem adicionada em V(\d+)$/, 'Image added to V$1'],
    [/^Vídeo · (.+)$/, 'Video · $1'],
    [/^Imagem · (.+)$/, 'Image · $1'],
    [/^disponível · você tem (.+)$/, 'available · you have $1'],
    [/^v(.+) · local e offline$/, 'v$1 · local and offline'],
    [/^Animação de (.+) desligada$/, (m, k) => `${i18nT(k)} animation off`],
    [/^Animação de (.+) ligada: mude o valor em outro ponto para criar movimento$/, (m, k) => `${i18nT(k)} animation on: change the value at another point to create motion`],
    [/^Interpolação: (.+)$/, (m, k) => 'Interpolation: ' + i18nT(k)],
    [/^Velocidade ([\d,]+)x$/, (m, v) => `Speed ${v.replace(',', '.')}x`],
    [/^Ganho do clipe: (.+)$/, 'Clip gain: $1'],
    [/^Exportando\.\.\. (\d+)%$/, 'Exporting... $1%'],
    [/^Processando… (\d+)%$/, 'Processing… $1%'],
    [/^Preparando prévia leve\.\.\. (\d+)%$/, 'Preparing light preview... $1%'],
    [/^Preparando preview: (.+)$/, 'Preparing preview: $1'],
    [/^Preparando faixa extra: (.+)$/, 'Preparing extra track: $1'],
    [/^Projeto aberto: (.*)$/, 'Project opened: $1'],
    [/^Projeto salvo: (.*)$/, 'Project saved: $1'],
    [/^Projeto aberto — (\d+) imagem\(ns\) não encontrada\(s\); os clipes delas ficaram de fora$/, 'Project opened — $1 image(s) not found; their clips were left out'],
    [/^O vídeo deste projeto não foi encontrado: (.*)$/, 'This project’s video was not found: $1'],
    [/^(.+) aplicado em Imagem (\d+)$/, (m, n, i) => `${i18nT(n)} applied to Image ${i}`],
    [/^(.+) aplicado em Clipe (\d+)$/, (m, n, i) => `${i18nT(n)} applied to Clip ${i}`],
    [/^Workspace "(.+)" salvo: o editor vai abrir assim$/, 'Workspace "$1" saved: the editor will open like this'],
    [/^Workspace "(.+)" atualizado$/, 'Workspace "$1" updated'],
    [/^Workspace "(.+)" excluído$/, 'Workspace "$1" deleted'],
    [/^Salvar alterações em "(.+)"\?$/, 'Save changes to "$1"?'],
    [/^Fechar (.+)\?$/, (m, n) => `Close ${i18nT(n)}?`],
    [/^Voltar ao "(.+)"$/, 'Back to "$1"'],
    [/^Original \((.+)\)$/, 'Original ($1)'],
    [/^Faixa adicionada: (.+)$/, 'Track added: $1'],
    [/^Corte aplicado: (.+)$/, 'Cut applied: $1'],
    [/^Audio salvo: (.+)$/, 'Audio saved: $1'],
    [/^Arquivo: (.+) \| Duracao: (.+)$/, 'File: $1 | Duration: $2'],
    [/^Nao consegui iniciar o playback: (.*)$/, 'Could not start playback: $1'],
    [/^Falha ao exportar: (.*)$/, 'Export failed: $1'],
    [/^Falha ao preparar preview: (.*)$/, 'Failed to prepare preview: $1'],
    [/^Falha ao gerar pré-visualização: (.*)$/, 'Failed to generate preview: $1'],
    [/^Falha ao preparar o áudio: (.*)$/, 'Failed to prepare the audio: $1'],
    [/^Formato n[ãa]o suportado: (.*)$/, 'Unsupported format: $1'],
    [/^Não foi possível analisar o vídeo: (.*)$/, 'Could not analyze the video: $1'],
    [/^Não foi possível abrir: (.*)$/, 'Could not open: $1'],
    [/^Não foi possível salvar: (.*)$/, 'Could not save: $1'],
    [/^Erro ao salvar: (.*)$/, 'Error saving: $1'],
    [/^Erro ao analisar: (.*)$/, 'Error analyzing: $1'],
    [/^Erro ao iniciar: (.*)$/, 'Error starting: $1'],
    [/^Erro ao copiar imagem:(.*)$/, 'Error copying image:$1'],
    [/^Erro: (.*)$/, 'Error: $1'],
    [/^Erros \(serão re-tentados\): (.*)$/, 'Errors (will be retried): $1'],
    [/^Já existentes\/verificados: (.*)$/, 'Already present/verified: $1'],
    [/^Regras carregadas: (.*)$/, 'Rules loaded: $1'],
    [/^Concluído em (.*)$/, 'Done in $1'],
    [/^Cortado em (.*)$/, 'Cut at $1'],
    [/^Entrada em (.*)$/, 'In at $1'],
    [/^Saída em (.*)$/, 'Out at $1'],
    [/^Decorrido: (.*)$/, 'Elapsed: $1'],
    [/^Baixando: (.*)$/, 'Downloading: $1'],
    [/^(\d+) câmera\(s\) encontrada\(s\)$/, '$1 camera(s) found'],
    [/^Imagens: (\d+)$/, 'Images: $1'],
    [/^Vídeos: (\d+)$/, 'Videos: $1'],
    [/^(.*) · Resolução: (.*)$/, '$1 · Resolution: $2'],
    [/^(.+) \((\d+) arquivos?\)$/, '$1 ($2 files)'],
];

const I18N = { lang: 'pt', obs: new Map(), attrs: ['title', 'placeholder', 'aria-label', 'alt'] };

// Tradução de um texto (sem espaços nas pontas); devolve o próprio texto se não houver
function i18nT(s) {
    if (I18N.lang !== 'en' || !s) return s;
    const lim = s.trim();
    if (!lim) return s;
    let en = I18N_EN[lim];
    if (en == null) {
        for (const [re, rep] of I18N_RE) {
            if (re.test(lim)) { en = lim.replace(re, rep); break; }
        }
    }
    if (en == null) return s;
    return s === lim ? en : s.replace(lim, en);
}

function i18nNode(n) {
    if (n.nodeType === 3) {
        const p = n.parentNode;
        if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA')) return;
        const st = n.__i18n;
        if (st && n.data === st.en) return;           // já traduzido por nós
        const pt = n.data;
        if (!/[A-Za-zÀ-ú]/.test(pt)) return;
        const en = i18nT(pt);
        if (en === pt) { if (st) n.__i18n = null; return; }
        n.__i18n = { pt, en };
        n.data = en;
        return;
    }
    if (n.nodeType !== 1) return;
    i18nAttrs(n);
    if (n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE' || n.nodeName === 'svg') return;
    for (let c = n.firstChild; c; c = c.nextSibling) i18nNode(c);
}

function i18nAttrs(el) {
    if (!el.getAttribute) return;
    for (const a of I18N.attrs) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const st = el.__i18nA || (el.__i18nA = {});
        if (st[a] && v === st[a].en) continue;
        const en = i18nT(v);
        if (en === v) { delete st[a]; continue; }
        st[a] = { pt: v, en };
        el.setAttribute(a, en);
    }
}

// Volta ao português o que foi traduzido
function i18nRestore(n) {
    if (n.nodeType === 3) {
        if (n.__i18n && n.data === n.__i18n.en) n.data = n.__i18n.pt;
        n.__i18n = null;
        return;
    }
    if (n.nodeType !== 1) return;
    if (n.__i18nA) {
        for (const [a, st] of Object.entries(n.__i18nA)) if (n.getAttribute(a) === st.en) n.setAttribute(a, st.pt);
        n.__i18nA = null;
    }
    for (let c = n.firstChild; c; c = c.nextSibling) i18nRestore(c);
}

// Liga a tradução num documento (o principal e cada janela solta do editor)
function i18nWatch(doc) {
    if (!doc || !doc.body) return;
    if (I18N.lang !== 'en') return;
    if (!I18N.obs.has(doc)) {
        const MO = (doc.defaultView && doc.defaultView.MutationObserver) || MutationObserver;
        const mo = new MO(muts => {
            for (const m of muts) {
                if (m.type === 'childList') m.addedNodes.forEach(i18nNode);
                else if (m.type === 'characterData') i18nNode(m.target);
                else if (m.type === 'attributes') i18nAttrs(m.target);
            }
        });
        mo.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: I18N.attrs });
        I18N.obs.set(doc, mo);
    }
    i18nNode(doc.body);
}

function i18nApply(lang) {
    I18N.lang = lang === 'en' ? 'en' : 'pt';
    document.documentElement.lang = I18N.lang === 'en' ? 'en' : 'pt-BR';
    const docs = [document];
    try { (typeof VED !== 'undefined' ? VED.hosts : []).forEach(h => { if (h.win && !h.win.closed) docs.push(h.win.document); }); } catch (e) {}
    if (I18N.lang === 'en') docs.forEach(i18nWatch);
    else {
        I18N.obs.forEach(mo => mo.disconnect());
        I18N.obs.clear();
        docs.forEach(d => { if (d.body) i18nRestore(d.body); });
    }
    // textos desenhados em canvas (timeline) e painéis que se redesenham
    try { if (typeof veDraw === 'function') veDraw(); } catch (e) {}
    document.querySelectorAll('.pref-lang [data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === I18N.lang));
}

// ── Preferências (%APPDATA%\CaniveteDoPailer\preferencias.json; localStorage do WebView não sobrevive) ──
const PREFS = { lang: 'pt' };

function prefsSave() {
    const api = window.pywebview && window.pywebview.api;
    if (api && api.prefs_save) api.prefs_save(JSON.stringify(PREFS)).catch(() => {});
}

function prefsSetLang(lang) {
    PREFS.lang = lang === 'en' ? 'en' : 'pt';
    i18nApply(PREFS.lang);
    prefsSave();
}

function prefsOpen() {
    const m = document.getElementById('modal-prefs');
    if (!m) return;
    i18nApply(I18N.lang);
    m.style.display = 'flex';
}

function prefsClose(e) {
    const m = document.getElementById('modal-prefs');
    if (e && e.target !== m) return;
    m.style.display = 'none';
}

function prefsLoad() {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.prefs_load) return;
    api.prefs_load().then(r => {
        if (r && r.success && r.data) Object.assign(PREFS, r.data);
        if (PREFS.lang !== I18N.lang) i18nApply(PREFS.lang);
    }).catch(() => {});
}

if (window.pywebview && window.pywebview.api && window.pywebview.api.prefs_load) prefsLoad();
else window.addEventListener('pywebviewready', prefsLoad, { once: true });

document.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ',') { e.preventDefault(); prefsOpen(); }
    if (e.key === 'Escape') { const m = document.getElementById('modal-prefs'); if (m && m.style.display === 'flex') m.style.display = 'none'; }
});

window.i18nT = i18nT;
window.i18nWatch = i18nWatch;
window.prefsOpen = prefsOpen;
window.prefsClose = prefsClose;
window.prefsSetLang = prefsSetLang;
