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
    'Melhorar Áudio': 'Enhance Audio', 'Melhorar': 'Enhance', 'Como funciona': 'How it works',
    'Deixa a voz com som de estúdio, como o Adobe Podcast. Em vídeo, só o som é trocado. O original é mantido.': 'Makes the voice sound studio-quality, like Adobe Podcast. For videos only the sound is replaced. The original is kept.',
    'Arraste um áudio, um vídeo ou uma pasta aqui': 'Drop an audio file, a video or a folder here',
    'MP3, WAV, M4A… e vídeos (MP4, MOV, MKV). Sai ao lado do original como "nome_melhorado".': 'MP3, WAV, M4A… and videos (MP4, MOV, MKV). Saved next to the original as "name_melhorado".',
    'Voz com som de estúdio, como o Adobe Podcast — áudio ou vídeo': 'Studio-quality voice, like Adobe Podcast — audio or video',
    'Transcreve a fala, limpa a voz (Sidon) e reconstrói os detalhes com o OmniVoice usando o texto e a própria voz. A duração não muda: a boca continua sincronizada. Termina em −16 LUFS. Na primeira vez baixa os modelos (~1 GB, mais o OmniVoice se ainda não tiver).': 'Transcribes the speech, cleans the voice (Sidon) and rebuilds the detail with OmniVoice using the text and the speaker’s own voice. The length doesn’t change, so lip sync is kept. Finishes at −16 LUFS. The first run downloads the models (~1 GB, plus OmniVoice if not installed yet).',
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
    'Modelo': 'Model', 'Rápido': 'Fast', 'ISNet · bom equilíbrio': 'ISNet · good balance',
    'Qualidade máxima': 'Maximum quality', 'BiRefNet Lite · baixa na 1ª vez': 'BiRefNet Lite · downloads on first use',
    'Preparando BiRefNet Lite...': 'Preparing BiRefNet Lite...',
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
    'Salvar o projeto antes de sair?': 'Save the project before quitting?', 'Sair': 'Quit', 'Sair agora interrompe a exportação.': 'Quitting now stops the export.', 'Sair mesmo assim': 'Quit anyway',
    'Ativar': 'Enable', 'Clipe desativado': 'Clip disabled', 'Clipe ativado': 'Clip enabled',
    'Renderizar prévias sozinho': 'Render previews automatically', 'Depois de 3 s parado': 'After 3 s idle', 'Depois de 10 s parado': 'After 10 s idle', 'Depois de 30 s parado': 'After 30 s idle', 'Desligado (só com Enter)': 'Off (Enter only)', 'Render auto': 'Auto render',
    'Renderizar sozinho: com o editor parado, os trechos vermelhos vão para o disco em segundo plano (prioridade baixa) e ficam verdes; dar play interrompe e ele continua quando você parar.': 'Automatic render: while the editor is idle, red sections are rendered to disk in the background (low priority) and turn green; playing pauses it and it resumes when you stop.',
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
    'Velocidade normal': 'Normal speed', 'Som da prévia (Ctrl+Alt+M)': 'Preview sound (Ctrl+Alt+M)', 'Posição atual': 'Current position',
    'Adicionar marcador': 'Add marker', 'Ir para o próximo marcador': 'Go to next marker', 'Ir para o marcador anterior': 'Go to previous marker',
    'Apagar marcador na agulha': 'Delete marker at playhead', 'Marcador adicionado em ': 'Marker added at ',
    'Cor do marcador atualizada': 'Marker color updated', 'Marcador apagado': 'Marker deleted', 'Nenhum marcador na agulha': 'No marker at playhead',
    'MÍDIA OFFLINE': 'MEDIA OFFLINE', 'Relinque ou apague no painel Projeto': 'Relink or delete in the Project panel',
    'Mídia offline · relinque ou apague': 'Media offline · relink or delete', 'Relincar mídia...': 'Relink media...',
    'Projeto aberto com mídia offline': 'Project opened with offline media', 'Mídia principal offline': 'Main media offline',
    'Mídia principal removida': 'Main media removed', 'Relincando mídia...': 'Relinking media...',
    'Relinque a mídia offline antes de colocar na timeline': 'Relink offline media before placing it on the timeline',
    'Relinque ou apague as mídias offline antes de exportar': 'Relink or delete offline media before exporting',
    'Escolha um arquivo de imagem para relincar': 'Choose an image file to relink',
    'Escolha um arquivo de áudio para relincar': 'Choose an audio file to relink',
    'Escolha um vídeo ou áudio para relincar': 'Choose a video or audio file to relink',
    'Duração final do vídeo editado': 'Final duration of the edited video', 'Duração final:': 'Final duration:',
    'Este vídeo não tem som': 'This video has no sound', 'Este clipe não tem som': 'This clip has no sound',
    'Mídia offline: relinque antes de ajustar o ganho': 'Media offline: relink before adjusting gain',
    'Imagem não tem som': 'Images have no sound', 'sem áudio': 'no audio',
    'Ganho de áudio': 'Audio gain', 'Ajustar ganho em (dB)': 'Adjust gain by (dB)', 'Ganho do clipe selecionado (ex.: 10 ou -10 dB)': 'Selected clip gain (e.g. 10 or -10 dB)',
    'ex.: 10 ou -10': 'e.g. 10 or -10', 'Selecione um clipe para ajustar o ganho': 'Select a clip to adjust the gain', 'Ganho atual do clipe: ': 'Current clip gain: ',
    '0 dB | Livre': '0 dB | Free', 'Livre': 'Free', 'Clipe': 'Clip', 'Clipes:': 'Clips:', '· Resolução:': '· Resolution:', 'Resolução:': 'Resolution:',
    'Arraste a borda de V1/A1 para mudar a altura da trilha': 'Drag the V1/A1 edge to change the track height',
    'Arraste para aumentar ou diminuir a trilha': 'Drag to grow or shrink the track',
    'Arraste a borda de um clipe para encurtar ou alongar': 'Drag a clip edge to shorten or lengthen it',
    'Arraste um clipe para frente/trás ou para outra trilha': 'Drag a clip forward/back or to another track',
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
    'Abra um vídeo para começar. Depois arraste para cá imagens, áudios, legendas (.srt, .vtt, .ass, .sbv, .txt), outros vídeos e pastas inteiras.': 'Open a video to start. Then drag images, audio, captions (.srt, .vtt, .ass, .sbv, .txt), other videos and whole folders here.',
    'Visualização em lista': 'List view', 'Visualização em grade (cards com prévia)': 'Icon view (cards with preview)', 'Tamanho dos cards': 'Card size',
    'Voltar para a raiz do projeto': 'Back to the project root', 'Clique duas vezes para abrir a pasta': 'Double-click to open the bin', 'Pasta vazia': 'Empty bin',
    'nenhuma legenda encontrada': 'no captions found', 'Exportar legendas': 'Export captions', 'Exportar transcrição': 'Export transcript', 'Formato do arquivo': 'File format',
    // Barra de menus e comandos (editor-comandos.js)
    'Arquivo': 'File', 'Editar': 'Edit', 'Clipe': 'Clip', 'Sequência': 'Sequence', 'Marcadores': 'Markers', 'Exibir': 'View', 'Janela': 'Window', 'Ajuda': 'Help',
    'Reprodução e navegação': 'Playback and navigation', 'Ferramentas': 'Tools',
    'Novo projeto': 'New Project', 'Nova timeline': 'New Timeline', 'Abrir projeto ou vídeo...': 'Open Project or Video...', 'Fechar projeto': 'Close Project',
    'Salvar': 'Save', 'Salvar como...': 'Save As...', 'Importar...': 'Import...', 'Importar na timeline...': 'Import into Timeline...',
    'Adicionar imagem na timeline...': 'Add Image to Timeline...', 'Exportar mídia...': 'Export Media...', 'Exportar legendas...': 'Export Captions...',
    'Exportar transcrição...': 'Export Transcript...', 'Desfazer': 'Undo', 'Refazer': 'Redo', 'Recortar': 'Cut', 'Copiar': 'Copy', 'Colar': 'Paste',
    'Apagar': 'Clear', 'Apagar e fechar o espaço': 'Ripple Delete', 'Desmarcar tudo': 'Deselect All', 'Atalhos do teclado...': 'Keyboard Shortcuts...',
    'Preferências...': 'Preferences...', 'Ganho de áudio...': 'Audio Gain...', 'Cortar selecionados na agulha': 'Cut Selected at Playhead',
    'Aparar início até a agulha': 'Ripple Trim Start to Playhead', 'Aparar fim até a agulha': 'Ripple Trim End to Playhead',
    'Mover para a trilha de cima': 'Move to Track Above', 'Mover para a trilha de baixo': 'Move to Track Below', 'Seleção vinculada': 'Linked Selection',
    'Cortar todas as trilhas na agulha': 'Add Edit to All Tracks', 'Remover trecho In→Out': 'Extract In→Out',
    'Aplicar transição de vídeo padrão': 'Apply Default Video Transition', 'Aplicar transição de áudio padrão': 'Apply Default Audio Transition',
    'Ímã (encaixar)': 'Snap', 'Voltar ao vídeo original': 'Revert to Original Video', 'Marcar entrada': 'Mark In', 'Marcar saída': 'Mark Out',
    'Ir para a entrada': 'Go to In', 'Ir para a saída': 'Go to Out', 'Limpar entrada': 'Clear In', 'Limpar saída': 'Clear Out', 'Limpar entrada e saída': 'Clear In and Out',
    'Reproduzir / Pausar': 'Play / Pause', 'Reproduzir em tela cheia': 'Play Full Screen', 'Som da prévia': 'Preview Audio',
    'Réguas': 'Rulers', "Telas divididas": "Split screens", "telas divididas": "split screens", "mídias usadas": "media used", "Sim": "Yes", "Não": "No", "Começar em": "Start at", "Refrão": "Chorus", "Mais agitada": "Most energetic", "Manual": "Manual", "Clique para escolher onde a música começa": "Click to choose where the music starts", "Começa em": "Starts at", "refrão em": "chorus at", "Chicote": "Whip Pan", "Escolher pasta": "Choose folder", "Escolher arquivos": "Choose files", "Fotos e vídeos": "Photos and videos", "em uso": "in use", "fotos": "photos", "clique para tirar ou pôr": "click to exclude or include", "ou arraste uma pasta ou arquivos para cá": "or drag a folder or files here", "Música": "Music", "Trocar música": "Change music", "Escolher música": "Choose music", "MP3, WAV, M4A... (arrastar também funciona)": "MP3, WAV, M4A... (drag and drop works too)", "Modelos recomendados": "Recommended templates", "cenas": "shots", "Escolha as fotos e vídeos": "Choose the photos and videos", "Escolha a música": "Choose the music", "Nenhum modelo": "No template", "Opções": "Options", "Música toda": "Whole song", "Inteligente": "Smart", "Cronológica": "Chronological", "Título": "Title", "opcional: aparece no começo": "optional: shows at the start", "Gerar vídeo": "Generate video", "Gerando...": "Generating...", "Outra versão": "Another version", "Mesma receita, outra escolha entre as mídias parecidas": "Same recipe, different pick among similar media", "Cria uma timeline nova 9:16 no projeto, com cortes na batida, animações, transições e cor. Tudo continua editável.": "Creates a new 9:16 timeline in the project with cuts on the beat, animations, transitions and color. Everything stays editable.", "mídias encontradas": "media found", "Ouvindo a música (batidas e energia)...": "Listening to the music (beats and energy)...", "Analisando": "Analyzing", "nota": "score", "Batida": "Beat", "Memórias": "Memories", "Viagem": "Travel", "Cinemático": "Cinematic", "Corte em toda batida, zoom-soco no tempo. Energia máxima.": "A cut on every beat, punch zoom on time. Maximum energy.", "Fotos com zoom lento (Ken Burns) e dissolução. Calmo e emotivo.": "Photos with slow zoom (Ken Burns) and dissolves. Calm and emotional.", "Cortes longos até o drop; depois, um corte por batida.": "Long shots until the drop; then a cut on every beat.", "Um compasso por cena, pan suave e empurrar na virada.": "One bar per shot, gentle pan and push on the change.", "Cenas longas, zoom lento, barras de cinema e cor de filme.": "Long shots, slow zoom and film color.", "Calmo": "Calm", "Médio": "Mid", "Alto": "High", "cenas no ritmo": "shots on the beat", "tudo editável na timeline": "everything editable in the timeline", "Vídeo no ritmo da música a partir de uma pasta de fotos e vídeos": "A video on the beat of the music from a folder of photos and videos", "Escopos": "Scopes", "Forma de onda": "Waveform", "Parade RGB": "RGB Parade", "Vetorscópio": "Vectorscope", "Histograma": "Histogram", "Rodas de cor": "Color Wheels", "Meios-tons": "Midtones", "Abra um vídeo para ver os escopos": "Open a video to see the scopes", "Sombras: cor e luz no escuro · Meios-tons: no meio · Realces: no claro": "Shadows: color and light in the darks · Midtones: in the middle · Highlights: in the brights", "Arraste o ponto para dar cor · duplo clique zera · Shift: ajuste fino": "Drag the point to add color · double-click resets · Shift: fine adjust", "Abrir os escopos (forma de onda, vetorscópio...)": "Open the scopes (waveform, vectorscope...)", "Brilho de cada coluna da imagem (0 = preto, 100 = branco): mostra preto esmagado e estouro": "Brightness of each image column (0 = black, 100 = white): shows crushed blacks and clipping", "Forma de onda de cada canal (R, G, B) lado a lado: mostra dominante de cor": "Waveform of each channel (R, G, B) side by side: shows color casts", "Cor e saturação: ângulo = cor, distância do centro = saturação; a linha amarela é o tom de pele": "Hue and saturation: angle = hue, distance from center = saturation; the yellow line is the skin tone line", "Quantos pixels há em cada nível de brilho, por canal": "How many pixels at each brightness level, per channel", "Recuperar (salvo automaticamente)": "Recover (auto-saved)", "Recuperado do salvamento automático: salve (Ctrl+S) para manter": "Recovered from auto-save: save (Ctrl+S) to keep it", "turbo (tudo na placa de vídeo)": "turbo (all on the graphics card)", "Iniciando exportação (turbo: tudo na placa de vídeo)...": "Starting export (turbo: all on the graphics card)...", "Turbo não serviu para este arquivo, exportando no modo normal...": "Turbo did not work for this file, exporting in normal mode...",
    "Nome do arquivo": "File name", "Codec": "Codec", "Profundidade de cor": "Color depth", "Taxa de bits": "Bitrate", "Qualidade constante": "Constant quality", "Alvo": "Target", "Toca em qualquer lugar: celular, redes sociais, navegador": "Plays everywhere: phones, social media, browsers", "Mesma qualidade com cerca de 40% menos tamanho; aceita 10 bits": "Same quality at about 40% smaller size; supports 10-bit", "ProRes 422 HQ, 10 bits: para finalizar em outro programa (arquivo grande, sai em .mov)": "ProRes 422 HQ, 10-bit: for finishing in another app (large file, .mov)", "Degradês mais suaves (céu, sombras) e mantém fontes 10 bits; precisa de H.265 ou ProRes": "Smoother gradients (sky, shadows) and keeps 10-bit sources; needs H.265 or ProRes", "Cada cena recebe os bits de que precisa (recomendado)": "Each scene gets the bits it needs (recommended)", "Tamanho previsível: você define os megabits por segundo": "Predictable size: you set the megabits per second",
    "Importar mídia na timeline, na agulha": "Import media into the timeline at the playhead", "Cortar todas as trilhas na agulha (Ctrl+K)": "Cut all tracks at the playhead (Ctrl+K)", "Entrada e saída marcadas (I / O) · clique vai até a entrada": "In and Out marked (I / O) · click to go to In", "Remover o trecho In→Out e fechar o espaço (X)": "Extract In→Out and close the gap (X)", "Limpar entrada e saída (Ctrl+Shift+X)": "Clear In and Out (Ctrl+Shift+X)", "Mostrar a timeline inteira (\\)": "Zoom to fit the whole timeline (\\)", "Zoom da timeline": "Timeline zoom", "Entrada e saída limpas": "In and Out cleared", "Entrada limpa": "In cleared", "Saída limpa": "Out cleared", "Marcador": "Marker", "Descrição": "Description", "Apagar marcador": "Delete marker", "Marcador atualizado": "Marker updated", "Duração inválida": "Invalid duration", "Duplo clique: editar · arraste para mover": "Double-click: edit · drag to move", "Arraste a ponta para mudar a duração": "Drag the end to change the duration",
    "Máquina de escrever": "Typewriter", "Fade suave": "Smooth Fade", "Subir palavras": "Rise Words", "Revelar linhas": "Reveal Lines", "Revelar palavras": "Reveal Words", "Letras de baixo": "Letters from Below", "Descer palavras": "Drop Words", "Pop": "Pop", "Decodificar": "Decode", "Cair e quicar": "Drop & Bounce", "Girar": "Rotate", "Elástico": "Elastic", "Entrada": "In", "Saída": "Out", "Nenhuma": "None", "Por": "By", "Ordem": "Order", "Sobrepor": "Overlap", "Letra": "Character", "Palavra": "Word", "Linha": "Line", "Normal": "Normal", "Inversa": "Reverse", "Do centro": "From center", "Aleatória": "Random", "letra a letra · palavra · linha": "by character · word · line", "Selecione um clipe de texto para animar (ou arraste um card até ele).": "Select a text clip to animate (or drag a card onto it).", "Selecione um clipe de texto (ou arraste o card até ele)": "Select a text clip (or drag the card onto it)", "Solte sobre um clipe de texto na timeline": "Drop onto a text clip in the timeline", "Animações de texto vão em clipes de texto (ferramenta T)": "Text animations go on text clips (T tool)", 'Easy Ease (quadros-chave)': 'Easy Ease (keyframes)', 'Easy Ease de entrada': 'Easy Ease In', 'Easy Ease de saída': 'Easy Ease Out',
    "Quadros-chave": "Keyframes", "Suave (Easy Ease)": "Easy Ease", "Parar (degrau)": "Hold", "Colar na agulha": "Paste at playhead", "Duplicar na agulha": "Duplicate at playhead", "Quadro-chave apagado": "Keyframe deleted", "Quadros-chave duplicados": "Keyframes duplicated", "Quadros-chave colados na agulha": "Keyframes pasted at playhead", "Pôr/tirar quadro-chave na agulha": "Add/remove keyframe at playhead", "Arraste para mudar · clique para digitar (Shift: 10x · Ctrl: fino)": "Drag to change · click to type (Shift: 10x · Ctrl: fine)", "Este clipe não tem quadros-chave (P, S, R ou T abrem uma propriedade)": "This clip has no keyframes (P, S, R or T open a property)",
    "Geral": "General", "Cache e Disco": "Cache & Disk", "Pasta do cache em disco (prévias renderizadas)": "Disk cache folder (rendered previews)", "Padrão (pasta do app)": "Default (app folder)", "Escolher disco/pasta...": "Choose disk/folder...", "Usar padrão": "Use default", "Abrir pasta": "Open folder", "Cada projeto ganha a própria pasta aqui dentro. Prefira um SSD com espaço livre. Ao trocar de pasta, as prévias antigas ficam na pasta anterior (limpe-as antes, se quiser).": "Each project gets its own folder in here. Prefer an SSD with free space. When you change folders, old previews stay in the previous one (clear them first if you want).", "Qualidade das prévias": "Preview quality", "1080p (máxima)": "1080p (best)", "720p (mais leve)": "720p (lighter)", "540p (a mais leve)": "540p (lightest)", "Tamanho máximo do cache em disco (GB)": "Maximum disk cache size (GB)", "Apagar prévias não usadas há mais de": "Delete previews unused for more than", "7 dias": "7 days", "15 dias": "15 days", "30 dias": "30 days", "60 dias": "60 days", "90 dias": "90 days", "Cache de quadros na RAM (máximo)": "RAM frame cache (maximum)", "A limpeza é automática: ao abrir o app e depois de cada render, o que passou da idade é apagado; se o total passar do máximo, saem primeiro as prévias usadas há mais tempo.": "Cleanup is automatic: when the app opens and after each render, anything past the age limit is deleted; if the total exceeds the maximum, the least recently used previews go first.", "Limpar deste projeto": "Clear this project", "Limpar todo o cache em disco": "Clear all disk cache", "Limpar cache RAM": "Clear RAM cache", "Renderizar prévia (In a Out)": "Render Preview (In to Out)", "Cancelar render da prévia": "Cancel Preview Render", "Apagar arquivos de render do projeto": "Delete Project Render Files", "Renderizando a prévia em disco": "Rendering preview to disk", "Cancelar render": "Cancel render", "Render cancelado": "Render cancelled", "Arquivos de render apagados": "Render files deleted", "Cache em disco limpo": "Disk cache cleared", "Já está renderizando": "Already rendering", "Nada para renderizar: os trechos já estão prontos (ou são leves)": "Nothing to render: sections are already done (or light)", "Espere: os vídeos da timeline ainda estão sendo preparados": "Wait: the timeline videos are still being prepared", "prévia ao usar": "preview on use", "Hard Limiter": "Hard Limiter", "segura os picos no teto": "holds peaks at the ceiling", "Amplitude máxima": "Maximum Amplitude", "Ganho de entrada": "Input Boost", "Antecipação": "Look-Ahead Time", "Soltura": "Release Time", "Vincular canais": "Link Channels", "Limitador rígido de picos": "Hard peak limiter", "Áudio · Amplitude e compressão": "Audio · Amplitude and Compression", "Amplitude máxima: nada passa dela. Ganho de entrada: deixa o som mais alto antes de limitar. Antecipação: o ganho começa a descer antes do pico (sem distorcer). Soltura: tempo para voltar 12 dB depois do pico. No mp4 o AAC pode subir o pico ~1 dB: para não estourar, use teto de −1 a −2 dB. Ajuste fino tocando em Controles de efeito.": "Maximum amplitude: nothing goes above it. Input boost: makes the sound louder before limiting. Look-ahead: gain starts dropping before the peak (no distortion). Release: time to recover 12 dB after the peak. In MP4, AAC can raise peaks by ~1 dB: to avoid clipping, use a ceiling of −1 to −2 dB. Fine-tune while playing in Effect Controls.", "Hard Limiter desligado": "Hard Limiter off", "clipes selecionados": "clips selected", "Arrastar imagem e áudio": "Drag video and audio", "Arrastar só a imagem": "Drag video only", "Arrastar só o áudio": "Drag audio only", "Só o áudio": "Audio only", "Só a imagem": "Video only", "Esse vídeo não tem som": "This video has no sound", "Arraste para a timeline": "Drag to the timeline", "ganho do principal": "main clip gain", "sem som ou travados ficam de fora": "without sound or locked are left out", "Ganho": "Gain", "em": "on", "clipes": "clips", "aplicado em": "applied to", "não aceitam o efeito": "don't accept the effect", "nenhum clipe selecionado aceita o efeito": "no selected clip accepts the effect", "Master · Hard Limiter": "Master · Hard Limiter", "Hard Limiter no Master": "Hard Limiter on Master", "a soma de todas as trilhas": "the sum of all tracks", "clique para ajustar": "click to adjust", "Hard Limiter no Master (a soma de todas as trilhas): clique para ligar": "Hard Limiter on Master (the sum of all tracks): click to turn on", "Hard Limiter do Master desligado": "Master Hard Limiter off", "Vale para o som final da timeline (o que toca e o que é exportado), depois do ganho e dos efeitos de cada clipe: é o que segura o estouro quando as trilhas somadas passam de 0 dB. A barra laranja no medidor mostra quanto ele está abaixando. No mp4 o AAC pode subir o pico ~1 dB: use teto de −1 a −2 dB.": "Applies to the timeline's final sound (playback and export), after each clip's gain and effects: it stops clipping when the summed tracks go above 0 dB. The orange bar on the meter shows how much it is reducing. In MP4, AAC can raise peaks by ~1 dB: use a ceiling of −1 to −2 dB.", "Medidores de áudio": "Audio Meters", "Clique para zerar as luzes de pico": "Click to reset the clip lights", "Vídeo H.265 (HEVC)": "H.265 (HEVC) video", "Tocar direto quando o PC suportar": "Play directly when the PC supports it", "Sempre converter para prévia leve": "Always convert to a light preview", "Vale para os próximos vídeos abertos. A qualidade das prévias também define o tamanho da prévia leve de edição. H.265 direto poupa a conversão, mas os cortes buscam mais devagar.": "Applies to the next videos you open. Preview quality also sets the size of the light editing preview. Direct H.265 skips conversion, but cuts seek more slowly.", "Vale para os próximos vídeos abertos. A qualidade das prévias também define o tamanho da prévia leve de edição.": "Applies to the next videos you open. Preview quality also sets the size of the light editing preview.", "Espere a exportação terminar": "Wait for the export to finish", 'Mostrar guias': 'Show Guides', 'Travar guias': 'Lock Guides', 'Encaixar nas guias': 'Snap to Guides', 'Limpar guias': 'Clear Guides', 'Guias visíveis': 'Guides visible', 'Guias ocultas': 'Guides hidden', 'Guias travadas': 'Guides locked', 'Guias destravadas': 'Guides unlocked', 'Encaixe nas guias ligado': 'Snap to guides on', 'Encaixe nas guias desligado': 'Snap to guides off', 'Guias apagadas': 'Guides cleared', 'Arraste para criar uma guia horizontal': 'Drag to create a horizontal guide', 'Arraste para criar uma guia vertical': 'Drag to create a vertical guide', 'Réguas (Ctrl+R)': 'Rulers (Ctrl+R)', 'Resolução da prévia: Full': 'Playback Resolution: Full', 'Resolução da prévia: 1/2': 'Playback Resolution: 1/2',
    'Resolução da reprodução: Half alivia o processamento na prévia (a exportação sai sempre em qualidade máxima)': 'Playback resolution: 1/2 lightens preview processing (export is always full quality)',
    'Mais zoom na timeline': 'Zoom In Timeline', 'Menos zoom na timeline': 'Zoom Out Timeline', 'Ajustar a timeline à tela': 'Fit Timeline to Screen',
    'Monitor: ajustar à tela': 'Monitor: Fit', 'Parar': 'Stop', 'Reproduzir mais rápido (1,5x · 2x · 3x)': 'Play Faster (1.5x · 2x · 3x)',
    'Voltar 5 segundos': 'Back 5 Seconds', 'Voltar 1 quadro': 'Step Back 1 Frame', 'Avançar 1 quadro': 'Step Forward 1 Frame', 'Voltar 1 segundo': 'Back 1 Second',
    'Avançar 1 segundo': 'Forward 1 Second', 'Ir para o corte anterior': 'Go to Previous Edit', 'Ir para o próximo corte': 'Go to Next Edit',
    'Ir para o início': 'Go to Start', 'Ir para o fim': 'Go to End', 'Ferramenta Seleção': 'Selection Tool', 'Ferramenta Lâmina': 'Razor Tool',
    'Ferramenta Mão': 'Hand Tool', 'Ferramenta Zoom': 'Zoom Tool', 'Ferramenta Velocidade': 'Rate Stretch Tool', 'Ferramenta Texto': 'Type Tool',
    'Dicas do editor (painel Atalhos)': 'Editor Tips (Shortcuts panel)', 'Atalhos do teclado': 'Keyboard Shortcuts', 'Buscar comando ou tecla': 'Search command or key',
    'Restaurar padrões': 'Restore Defaults', 'Fechar': 'Close', 'Remover este atalho': 'Remove this shortcut', 'Adicionar atalho': 'Add shortcut',
    'Voltar ao padrão': 'Back to default', 'Pressione as teclas... (Esc cancela)': 'Press the keys... (Esc cancels)',
    'Todos os atalhos voltaram ao padrão.': 'All shortcuts are back to default.',
    'Configurações da sequência...': 'Sequence Settings...', 'Configurações da sequência': 'Sequence Settings', 'Predefinição': 'Preset',
    'Tamanho do quadro': 'Frame Size', 'Taxa de quadros': 'Frame Rate', 'Largura': 'Width', 'Altura': 'Height', 'Personalizado': 'Custom',
    '(a do vídeo)': '(from the video)',
    'Trocar largura e altura (horizontal ↔ vertical)': 'Swap width and height (horizontal ↔ vertical)',
    'Clipes sem posição/escala mexidas se encaixam sozinhos no quadro novo. A exportação sai neste tamanho.': 'Clips with untouched position/scale refit to the new frame by themselves. Exports use this size.',
    'Configurações da sequência: mudar o tamanho do quadro': 'Sequence Settings: change the frame size',
    '1080 × 1920 · Vertical 9:16 (Reels, TikTok, Shorts)': '1080 × 1920 · Vertical 9:16 (Reels, TikTok, Shorts)', '1080 × 1350 · Retrato 4:5 (Instagram)': '1080 × 1350 · Portrait 4:5 (Instagram)',
    '1080 × 1080 · Quadrado 1:1': '1080 × 1080 · Square 1:1',
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
    'Não há trilha de áudio livre nesse ponto': 'No free audio track at that point',
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
    'Não há trilha acima para a cópia': 'No track above for the copy',
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
    'Texto colado em': 'Text pasted on', 'Imagem colada em': 'Image pasted on', 'formato não suportado': 'unsupported format',
    'Preparando': 'Preparing', 'demorou demais para preparar; arraste do painel Projeto': 'took too long to prepare; drag it from the Project panel',
    'arquivos colados na timeline': 'files pasted into the timeline', 'arquivo colado na timeline': 'file pasted into the timeline',
    'legendas selecionadas': 'captions selected', 'o estilo muda em todas elas': 'style changes apply to all of them',
    'Nas': 'To the', 'selecionadas': 'selected', 'legendas apagadas': 'captions deleted',
    'Shift+arrastar: tamanho': 'Shift+drag: size',
    'Cor sólida': 'Color Matte', 'Nova cor sólida': 'New color matte', 'Forma': 'Shape', 'Desenho': 'Drawing', 'Pincel': 'Brush',
    'Retângulo': 'Rectangle', 'Elipse': 'Ellipse', 'Triângulo': 'Triangle', 'Linha': 'Line', 'Preenchimento': 'Fill', 'Contorno': 'Stroke',
    'Espessura': 'Width', 'Dureza': 'Hardness', 'Nova camada': 'New layer', 'Traços': 'Strokes', 'Cor': 'Color',
    'Apagar o último traço': 'Delete last stroke', 'Limpar desenho': 'Clear drawing', 'Largura': 'Width', 'Altura': 'Height',
    'Arraste no monitor · Shift: proporção 1:1': 'Drag on the monitor · Shift: 1:1 ratio',
    'Pinte no monitor: o próximo traço vira uma camada nova': 'Paint on the monitor: the next stroke starts a new layer',
    'O próximo traço começa uma camada de desenho nova': 'The next stroke starts a new drawing layer',
    'Cor sólida criada: arraste para a timeline': 'Color matte created: drag it to the timeline', 'Cor sólida adicionada': 'Color matte added',
    'Ferramenta Forma': 'Shape Tool', 'Ferramenta Pincel': 'Brush Tool', 'Forma (retângulo, elipse, triângulo, linha)': 'Shape (rectangle, ellipse, triangle, line)',
    'Forma (Y): arraste no monitor · Shift: proporção 1:1': 'Shape (Y): drag on the monitor · Shift: 1:1 ratio', 'Pincel (B): pinte no monitor': 'Brush (B): paint on the monitor',
    'Nova cor sólida (camada de cor do tamanho do quadro)': 'New color matte (a solid layer the size of the frame)',
    'Muda todos os clipes desta cor sólida (no painel Projeto: duplo clique também troca).': 'Changes every clip of this color matte (double-click it in the Project panel too).',
    'Pincel (B): pinte no monitor com esta camada selecionada para continuar nela.': 'Brush (B): paint on the monitor with this layer selected to keep drawing on it.',
    'Aplicar som do Soundboard na agulha': 'Apply Soundboard sound at the playhead',
    'Selecione um som no Soundboard (um clique) para aplicar com Shift+1': 'Select a sound in the Soundboard (one click) to apply it with Shift+1',
    '1 a cada 3 cortes': 'Every 3rd cut',
    'Adicionar músicas': 'Add music',
    'AutoFrame Customizado': 'Custom AutoFrame',
    'Automático': 'Automatic',
    'Cada modelo guarda a intro, o logo, as cores, as transições e as músicas de um cliente. Clique em Começar e mande o material.': "Each template keeps a client's intro, logo, colors, transitions and music. Click Start and send the footage.",
    'Clique em Começar num modelo antes de mandar o material': 'Click Start on a template before sending the footage',
    'Começar': 'Start',
    'Do estilo': 'From the style',
    'Dê um nome ao modelo (o nome do cliente)': "Name the template (the client's name)",
    'Editar modelo': 'Edit template',
    'Encerramento': 'Ending',
    'Esse modelo não tem música: edite e adicione pelo menos uma': 'This template has no music: edit it and add at least one',
    'Filme': 'Film',
    'Flash de impacto na cor de destaque (em vez de branco)': 'Impact flash in the accent color (instead of white)',
    'Intro': 'Intro',
    'Logo no canto': 'Corner logo',
    'Logo sobre a cor': 'Logo over the color',
    'Logo sobre as cenas': 'Logo over the shots',
    'Modelo salvo': 'Template saved',
    'Modelos de cliente': 'Client templates',
    'Músicas': 'Music',
    'Natural': 'Natural',
    'Novo modelo': 'New template',
    'Não foi possível salvar o modelo: ': 'Could not save the template: ',
    'Onde o estilo pede': 'Where the style asks',
    'Quente': 'Warm',
    'Salvar modelo': 'Save template',
    'Sem encerramento': 'No ending',
    'Sem intro': 'No intro',
    'Sem nome': 'Untitled',
    'Tem fundo transparente (fica por cima das cenas)': 'Has a transparent background (plays over the shots)',
    'Tirar': 'Remove',
    'Todo corte': 'Every cut',
    'Vivo': 'Vivid',
    'Voltar aos modelos': 'Back to templates',
    'Vídeo pronto': 'Ready-made video',
    'Zoom lento': 'Slow zoom',
    'alternam a cada vídeo, nesta ordem': 'rotate on each video, in this order',
    'cor principal': 'main color',
    'nenhum arquivo': 'no file',
    'sem logo': 'no logo',
    'Estilo do modelo': "Template's style",
    'Texto da intro': 'Intro text',
    'Cliente': 'Client',
    'Cor do card': 'Card color',
    'Escolher logo': 'Choose logo',
    'Paleta': 'Palette',
    'Destaque': 'Accent',
    'Escolher vídeo da intro': 'Choose intro video',
    '1 compasso': '1 bar',
    '2 compassos': '2 bars',
    '4 compassos': '4 bars',
    'Animação do logo': 'Logo animation',
    'opcional: slogan ou título padrão': 'optional: slogan or default title',
    'Escolher vídeo do encerramento': 'Choose ending video',
    'opcional: @perfil · telefone · site': 'optional: @profile · phone · website',
    'Alterna entre as marcadas.': 'Alternates between the selected ones.',
    'Nenhuma marcada: usa as do estilo.': "None selected: uses the style's own.",
    'Frequência': 'Frequency',
    'nome do cliente': "client's name",
    'música': 'song',
    'músicas': 'songs',
    'Apagar modelo': 'Delete template',
    'Apagar mesmo?': 'Really delete?',
    'Tons suaves': 'Soft tones',
    'repetida': 'duplicate',
    'repetida de': 'duplicate of',
    'repetidas fora': 'duplicates left out',
    'Animada (fotos + logo)': 'Animated (photos + logo)',
    'Simples (logo na cor)': 'Simple (logo on color)',
    'Meu arquivo de vídeo': 'My video file',
    'Animado': 'Animated',
    'Dinâmico': 'Dynamic',
    'Automática (~4 s)': 'Automatic (~4 s)',
    'segundos': 'seconds',
    'Fecha no corte da música mais perto': 'Ends on the nearest cut of the song',
    'Usar todas as fotos e vídeos (a duração se ajusta)': 'Use every photo and video (the length adapts)',
    'Efeitos sonoros (whoosh nas transições, impacto no logo...) do Soundboard': 'Sound effects (whoosh on transitions, impact on the logo...) from the Soundboard',
    'Escolher o arquivo da intro': 'Choose the intro file',
    'Escolher o arquivo do encerramento': 'Choose the ending file',
    'MP4 ou MOV. MOV com transparência pode ficar por cima das cenas.': 'MP4 or MOV. A MOV with transparency can play over the shots.',
    'Formas na cor de destaque, as melhores fotos entrando na batida, o logo batendo no compasso e o texto em selo. Com efeitos sonoros do Soundboard.': 'Shapes in the accent color, the best photos landing on the beat, the logo hitting on the bar and the text on a badge. With Soundboard sound effects.',
    'Dica: baixe o pack no painel Soundboard para o AutoFrame pôr efeitos sonoros': 'Tip: download the pack in the Soundboard panel so AutoFrame adds sound effects',
    'Ritmo de reel: 1 a 2 batidas por cena, movimento variado e transição na virada do compasso.': 'Reel rhythm: 1 to 2 beats per shot, varied motion and a transition on each new bar.',
    'Soundboard': 'Soundboard', 'Buscar som': 'Search sound', 'Ouvir ao passar': 'Play on hover', 'Volume da prévia': 'Preview volume',
    'Tocar o som ao passar o mouse por cima': 'Play the sound when the mouse is over it', 'Abrir a pasta dos sons': 'Open the sounds folder',
    'Pack de efeitos sonoros': 'Sound effects pack', 'Baixar sons': 'Download sounds', 'Baixa uma vez só e fica no app.': 'Downloads once and stays in the app.',
    'Whoosh, riser, impacto, pop, notificação, glitch, cartoon, reações, jingles e mais, prontos para usar.': 'Whoosh, riser, impact, pop, notification, glitch, cartoon, reactions, jingles and more, ready to use.',
    'Todos livres (CC0): pode usar em qualquer vídeo, inclusive comercial.': 'All free (CC0): use them in any video, commercial too.',
    'Há sons novos no pack.': 'There are new sounds in the pack.', 'Atualizar': 'Update', 'Favorito': 'Favorite', '★ Favoritos': '★ Favorites', 'Todos': 'All',
    'Marque sons com ★ para achar rápido aqui': 'Mark sounds with ★ to find them here', 'Nenhum som encontrado': 'No sound found',
    'Sons prontos no Soundboard': 'Sounds ready in the Soundboard', 'Não foi possível abrir esse som': 'Could not open this sound',
    'Instalando...': 'Installing...', 'Carregando...': 'Loading...',
    'Whoosh e Transição': 'Whoosh & Transition', 'Riser e Tensão': 'Riser & Tension', 'Impacto e Boom': 'Impact & Boom', 'Pop e Clique': 'Pop & Click',
    'Notificação e Interface': 'Notification & UI', 'Dinheiro e Moedas': 'Money & Coins', 'Glitch e Digital': 'Glitch & Digital',
    'Cartoon e Comédia': 'Cartoon & Comedy', 'Reações e Plateia': 'Reactions & Crowd', 'Câmera e Objetos': 'Camera & Objects',
    'Vinhetas e Jingles': 'Stingers & Jingles', 'Vozes (inglês)': 'Voices (English)',
    'Animação': 'Animation', 'Buscar animação': 'Search animation', 'Constante': 'Constant', 'em loop, no clipe inteiro': 'looping, over the whole clip',
    'no corte entre clipes ou no início/fim': 'on the cut between clips or at the start/end', 'Rotação': 'Rotation', 'Tremer': 'Wiggle', 'Pulsar': 'Pulse',
    'Velocidade (voltas por segundo)': 'Speed (turns per second)', 'Girar para a esquerda': 'Spin to the left (counterclockwise)',
    'Área de deslocamento': 'Displacement area', 'Velocidade (por segundo)': 'Speed (per second)', 'Intensidade (suave → nervoso)': 'Intensity (smooth → jittery)',
    'Tamanho do pulso': 'Pulse size', 'Velocidade (pulsos por segundo)': 'Speed (pulses per second)',
    'Arraste até um clipe · duplo clique aplica no clipe selecionado · os ajustes ficam no Controles de efeito': 'Drag onto a clip · double-click applies to the selected clip · settings are in Effect Controls',
    'Selecione um clipe na timeline (ou arraste a animação até ele)': 'Select a clip on the timeline (or drag the animation onto it)',
    'Passe o mouse para ver o exemplo. Transição: arraste até o corte entre dois clipes (a borda do bloco muda a duração). Constante: arraste até o clipe ou dê duplo clique com ele selecionado; os ajustes ficam no Controles de efeito.':
        'Hover to preview. Transition: drag onto the cut between two clips (the block edge changes the duration). Constant: drag onto the clip or double-click with it selected; settings are in Effect Controls.',
    'Modo desenvolvedor': 'Developer mode', 'Faltam': '', 'cliques para o modo desenvolvedor': 'more clicks to developer mode',
    'clique para o modo desenvolvedor': 'more click to developer mode', 'Modo desenvolvedor ativado': 'Developer mode enabled',
    'Permitir que o Claude controle a janela (modo agente)': 'Allow Claude to control the window (agent mode)',
    'Abre a porta de controle do painel só neste computador (127.0.0.1). Enquanto estiver ligada, qualquer programa do PC pode usar o app. Vale a partir da próxima vez que o app abrir.':
        'Opens the panel control port on this computer only (127.0.0.1). While on, any program on this PC can use the app. Takes effect the next time the app opens.',
    'Agora: ligado em': 'Now: on at', 'Agora: desligado': 'Now: off', 'reabra o app para aplicar': 'reopen the app to apply',
    'Desativar o modo desenvolvedor': 'Turn off developer mode',
    'Melhorar áudio': 'Enhance audio', 'Melhorando o áudio no fundo — dá para continuar editando': 'Enhancing audio in the background — you can keep editing',
    'Voz com som de estúdio (Sidon + OmniVoice). Gera o _melhorado.wav ao lado do original e troca só o som: a imagem e os cortes ficam iguais': 'Studio-quality voice (Sidon + OmniVoice). Creates a _melhorado.wav next to the original and swaps only the sound: the picture and the cuts stay the same',
    'Melhorando': 'Enhancing', 'na fila': 'queued', 'Melhorado': 'Enhanced', 'Original': 'Original', 'Áudio melhorado': 'Enhanced audio',
    'áudio melhorado': 'enhanced audio', 'áudio original': 'original audio',
    'Desligue para ouvir o original': 'Turn off to hear the original', 'Tocar / pausar (espaço)': 'Play / pause (space)',
    'Liga e desliga o efeito enquanto ouve, no mesmo ponto': 'Turns the effect on and off while you listen, at the same spot',
    'áudio melhorado — a imagem e os cortes continuam iguais': 'audio enhanced — the picture and the cuts stay the same',
    'o áudio melhorado não foi encontrado — voltou ao original': 'the enhanced audio was not found — back to the original',
    'Tocando o áudio original: clique para usar o melhorado': 'Playing the original audio: click to use the enhanced one',
    'Tocando o áudio melhorado: clique para ouvir o original': 'Playing the enhanced audio: click to hear the original',
    'melhorando o áudio': 'enhancing audio','não foi possível melhorar o áudio': 'could not enhance the audio',
    'áudio melhorado — os clipes continuam com os mesmos cortes': 'audio enhanced — the clips keep the same cuts', 'Áudio melhorado salvo em': 'Enhanced audio saved to',
    'Mostrar no projeto': 'Reveal in Project', 'Substituir mídia...': 'Replace Footage...', 'Relincar mídia...': 'Relink Media...',
    'Troca o arquivo e mantém os clipes na timeline com os mesmos cortes e posições': 'Swaps the file and keeps the timeline clips with the same cuts and positions',
    'substituída — os clipes da timeline continuam com os mesmos cortes': 'replaced — the timeline clips keep the same cuts', 'atualizada': 'updated',
    'mídia substituída': 'media replaced', 'mídias substituídas': 'media replaced', 'sem arquivo correspondente': 'no matching file',
    'Este clipe não tem um item no painel Projeto': 'This clip has no item in the Project panel',
    'Copiar efeitos': 'Copy effects', 'Colar efeitos': 'Paste effects', 'Copiar estilo': 'Copy style', 'Colar estilo': 'Paste style',
    'Nesta': 'This one', 'Em todas': 'All', 'Neste clipe': 'This clip', 'Nos': 'To the', 'selecionados': 'selected',
    'Efeitos copiados': 'Effects copied', 'selecione os clipes e clique em Colar efeitos (Ctrl+Alt+V)': 'select the clips and click Paste effects (Ctrl+Alt+V)',
    'Selecione um clipe para copiar os efeitos': 'Select a clip to copy its effects', 'Este clipe não tem efeitos para copiar': 'This clip has no effects to copy',
    'Copie os efeitos de um clipe primeiro': 'Copy the effects of a clip first', 'Selecione os clipes que vão receber os efeitos': 'Select the clips that will receive the effects',
    'Nenhum clipe selecionado aceita esses efeitos': 'No selected clip accepts these effects', 'Efeitos colados em': 'Effects pasted into',
    'Copiar os efeitos, o áudio e o modo de mesclagem deste clipe': "Copy this clip's effects, audio effects and blend mode",
    'Troca os efeitos dos clipes selecionados pelos copiados': "Replaces the selected clips' effects with the copied ones",
    'Estilo copiado: escolha "Nesta" em outra legenda ou "Em todas"': 'Style copied: choose "This one" on another caption or "All"',
    'Estilo aplicado em': 'Style applied to', 'legendas': 'captions', 'Estilo aplicado nesta legenda': 'Style applied to this caption',
    'Copiar o estilo desta legenda': "Copy this caption's style",
    'Destaque da palavra falada': 'Spoken word highlight', 'Destacar a palavra que está sendo falada': 'Highlight the word being spoken',
    'Cor do destaque': 'Highlight color', 'Cor da palavra': 'Word color', 'Margem': 'Padding',
    'Um retângulo acompanha palavra por palavra, no tempo da fala. Vale para todas as legendas.':
        'A box follows each word as it is spoken. Applies to all captions.',
    'Modo de mesclagem': 'Blend Mode', 'Escurecer': 'Darken', 'Multiplicação': 'Multiply', 'Superexposição de cores': 'Color Burn',
    'Clarear': 'Lighten', 'Tela': 'Screen', 'Subexposição de cores': 'Color Dodge', 'Subexposição linear (Adicionar)': 'Linear Dodge (Add)',
    'Sobrepor': 'Overlay', 'Luz suave': 'Soft Light', 'Luz direta': 'Hard Light', 'Diferença': 'Difference', 'Exclusão': 'Exclusion',
    'Limite': 'Threshold', 'Suavidade': 'Softness', 'Inverter (some o claro)': 'Invert (removes the bright)',
    'Como a camada se mistura com o que está embaixo (Tela some com o preto, Multiplicação some com o branco)':
        'How the layer mixes with what is below (Screen removes black, Multiply removes white)',
    'Selecionar faixa para a frente': 'Track Select Forward', 'Selecionar faixa para trás': 'Track Select Backward',
    'Faixa para a frente (A): clique para pegar tudo dali em diante · Shift: só a trilha': 'Track Select Forward (A): click to grab everything from there on · Shift: only that track',
    'Faixa para trás (Shift+A): clique para pegar tudo dali para trás · Shift: só a trilha': 'Track Select Backward (Shift+A): click to grab everything before that point · Shift: only that track',
    'clipes selecionados': 'clips selected', 'clipe selecionado': 'clip selected', 'Espaço fechado': 'Gap closed',
    'Não dá para fechar o espaço: há clipes em outras trilhas nesse trecho (trave a trilha com o cadeado para ela não se mexer)':
        "Can't close the gap: other tracks have clips in it (lock a track with the padlock to keep it still)",
    'Inverter clipe (Reverse Speed)': 'Reverse Clip (Reverse Speed)', 'Clipe invertido': 'Clip reversed', 'Clipe voltou ao normal': 'Clip back to normal',
    'Invertendo o clipe…': 'Reversing the clip…', 'Não foi possível inverter o clipe': "Couldn't reverse the clip", 'invertido': 'reversed',
    'Selecione um clipe de vídeo ou de áudio para inverter': 'Select a video or audio clip to reverse',
    'Cantos arredondados': 'Rounded corners', 'Arredondamento': 'Roundness', 'Básico 3D': 'Basic 3D', 'Perspectiva': 'Perspective',
    'Girar (eixo Y)': 'Swivel (Y axis)', 'Inclinar (eixo X)': 'Tilt (X axis)', 'Distância até a imagem': 'Distance to image',
    'Dobrar': 'Fold', 'Potência constante': 'Constant Power', 'Esse clipe não tem som': "This clip has no sound",
    'Selecione a ponta de um clipe com som (ou o clipe) e aperte Ctrl+Shift+D': 'Select the edge of a clip with sound (or the clip) and press Ctrl+Shift+D',
    'Selecione a ponta de um clipe com som (ou o clipe) e aperte Ctrl+Shift+D / Ctrl+Shift+9': 'Select the edge of a clip with sound (or the clip) and press Ctrl+Shift+D / Ctrl+Shift+9',
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
        'Drag a transition from the Transitions panel onto the cut · drag the block edge to change its duration', 'Dissolução cruzada': 'Cross Dissolve',
    'Cross fade': 'Cross fade', 'Fade para preto': 'Fade to Black', 'Velocidade': 'Speed', 'Direção': 'Direction',
    'Rápida': 'Fast', 'Média': 'Medium', 'Lenta': 'Slow', 'Esquerda': 'Left', 'Direita': 'Right', 'Cima': 'Up', 'Baixo': 'Down',
    'Diagonal cima-esquerda': 'Diagonal up-left', 'Diagonal cima-direita': 'Diagonal up-right',
    'Diagonal baixo-esquerda': 'Diagonal down-left', 'Diagonal baixo-direita': 'Diagonal down-right',
    'Editando a transição selecionada na timeline': 'Editing the selected transition on the timeline',
    'Define como as próximas transições do painel serão aplicadas': 'Defines how the next transitions from the panel will be applied', 'Empurrar': 'Push',
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
    'Legenda': 'Caption', 'Texto da legenda': 'Caption text', 'Estilo das legendas (todas)': 'Caption style (all)', 'Estilo desta legenda': 'This caption style', 'Exportação': 'Export', 'Painel Texto ›': 'Text panel ›',
    'Controles de efeito ›': 'Effect Controls ›', 'Luz e Cor ›': 'Light & Color ›',
    'Fonte, tamanho, cor, fundo e posição das legendas ficam no painel Propriedades (selecione uma legenda).': 'Caption font, size, color, background and position are in the Properties panel (select a caption).',
    'Editar estilo em Propriedades': 'Edit style in Properties', 'Propriedades (velocidade, volume)': 'Properties (speed, volume)',
    'Velocidade (R): arraste a borda de um clipe para acelerar ou desacelerar': 'Rate Stretch (R): drag a clip edge to speed it up or slow it down',
    'Texto (T): clique no monitor para escrever': 'Type (T): click the monitor to write', 'Velocidade (R): arraste a borda de um clipe': 'Rate Stretch (R): drag a clip edge',
    'Velocidade (R): arraste a borda do clipe para acelerar ou desacelerar': 'Rate Stretch (R): drag the clip edge to speed it up or slow it down',
    'Texto precisa de um vídeo': 'Text needs a video', 'Não há trilha de vídeo livre na agulha para o texto': 'No free video track at the playhead for the text',
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
    'A legenda selecionada não passa pela agulha': 'The selected caption is not under the playhead',
    'Não há legenda na agulha': 'No caption under the playhead', 'Não há clipe ou legenda na agulha': 'No clip or caption under the playhead',
    "Selecione um clipe ou legenda (E corta só os selecionados; ' corta todas as trilhas)": "Select a clip or caption (E cuts only selected items; ' cuts all tracks)",
    'Legenda recortada: Ctrl+V cola na agulha': 'Caption cut: Ctrl+V pastes at the playhead',
    'Legenda copiada: Ctrl+V cola na agulha': 'Caption copied: Ctrl+V pastes at the playhead',
    'Selecione um clipe ou legenda para copiar': 'Select a clip or caption to copy',
    'Nada copiado (Ctrl+C num clipe ou legenda primeiro)': 'Nothing copied (Ctrl+C a clip or caption first)',
    'Legenda colada na trilha LEG': 'Caption pasted to the LEG track',
    'Não há som na timeline para transcrever': 'There is no sound in the timeline to transcribe', 'Nenhuma fala encontrada na timeline': 'No speech found in the timeline',
    'Transcreva a sequência primeiro': 'Transcribe the sequence first', 'Crie as legendas primeiro': 'Create the captions first',
    'Isso substitui as legendas atuais. Clique de novo para confirmar (dá para desfazer com Ctrl+Z).': 'This replaces the current captions. Click again to confirm (Ctrl+Z undoes it).',
    'Preparando o áudio da timeline...': 'Preparing the timeline audio...', 'Carregando o modelo...': 'Loading the model...', 'Transcrevendo...': 'Transcribing...',
    'Otimizando o modelo (uma vez só)...': 'Optimizing the model (only once)...', 'Modelo pronto': 'Model ready',
    'Legendas (painel Texto)': 'Captions (Text panel)',
    // Áudio solto na timeline
    'Preparando o áudio...': 'Preparing audio...', 'Não foi possível abrir o áudio': 'Could not open the audio',
    'Não há trilha de áudio livre a partir da agulha': 'No free audio track from the playhead',
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
    'Sons da interface (clique)': 'Interface sounds (click)', 'Sons da interface ligados': 'Interface sounds on',
    'Sons da interface desligados': 'Interface sounds off',
    'Desempenho': 'Performance', 'Comece sua edição': 'Start editing', 'Limpar lista': 'Clear list', 'Projetos recentes': 'Recent projects',
    'Crie um projeto, corte rápido sem salvar ou deixe o AutoFrame montar no ritmo da música.': 'Create a project, make a quick cut without saving, or let AutoFrame edit to the beat of the music.',
    'Cortar, exportar e fechar sem salvar projeto': 'Cut, export and close without saving a project', 'Minimizar': 'Minimize', 'Maximizar / restaurar': 'Maximize / restore',
    'Fechar (os painéis voltam ao editor)': 'Close (the panels go back to the editor)',
    'Cache inteligente na RAM': 'Smart RAM cache',
    'Ligado': 'On',
    'Limpar cache RAM': 'Clear RAM cache',
    'Guarda na memória os quadros já compostos: o play passa liso por trechos com efeitos e camadas': 'Keeps already composited frames in memory: playback stays smooth through effects and layers',
    'Copiar o timecode': 'Copy timecode',
    'Posição atual · duplo clique para digitar onde ir (ex.: 1:05:12, 130, +2s)': 'Current position · double-click to type where to go (e.g. 1:05:12, 130, +2s)',
    'Timecode inválido · ex.: 00:01:05:12, 1:05:12, 130, 12.5, +2s': 'Invalid timecode · e.g. 00:01:05:12, 1:05:12, 130, 12.5, +2s',
    'Mostrar a timeline inteira (\\) · zoom: + / − ou Alt+roda do mouse': 'Show the whole timeline (\\) · zoom: + / − or Alt+mouse wheel',
    // ── Comp (editor-comp.js) ──
    'Criar Comp': 'Create Comp',
    'Criar Comp…': 'Create Comp…',
    'Criar Comp...': 'Create Comp...',
    'Nome da Comp': 'Comp name',
    'Abrir Comp': 'Open Comp',
    'Descompactar Comp': 'Unpack Comp',
    'duplo clique': 'double-click',
    'Comp': 'Comp',
    'Propriedades essenciais': 'Essential properties',
    'Vale só para esta faixa. Para mudar em todas, abra a Comp (duplo clique).': 'Applies to this clip only. To change all of them, open the Comp (double-click).',
    'Esta Comp não tem texto nem forma para mudar daqui.': 'This Comp has no text or shape to change from here.',
    'Voltar ao valor da Comp': 'Back to the Comp value',
    'renderizando': 'rendering',
    'na fila do render': 'waiting to render',
    'render falhou': 'render failed',
    'camada': 'layer',
    'camadas': 'layers',
    'fundo transparente': 'transparent background',
    'Renderizando Comp': 'Rendering Comp',
    'Selecione as camadas que vão para a Comp': 'Select the layers that go into the Comp',
    'Uma Comp não pode entrar nela mesma': 'A Comp cannot go inside itself',
    'Colando a Comp...': 'Pasting the Comp...',
    'Não foi possível colar a Comp': 'Could not paste the Comp',
    'Espere: a Comp ainda está renderizando': 'Wait: the Comp is still rendering',
    'Volte a velocidade da Comp para 100% antes de descompactar': 'Set the Comp speed back to 100% before unpacking',
    'Não há camadas no trecho dessa Comp': 'There are no layers in this part of the Comp',
    'Minha Comp': 'My Comp',
    'Usar a Comp selecionada': 'Use the selected Comp',
    'nenhuma Comp': 'no Comp',
    'Monte a intro numa Comp (Criar Comp), selecione ela no painel Projeto e clique acima. As mídias dela são copiadas para o modelo.': 'Build the intro in a Comp (Create Comp), select it in the Project panel and click above. Its media are copied into the template.',
    'Selecione uma Comp no painel Projeto (ou a faixa dela na timeline) e clique de novo': 'Select a Comp in the Project panel (or its clip on the timeline) and click again',
    'Esta Comp não tem texto nem forma': 'This Comp has no text or shape',
};

// Frases com partes variáveis (números, nomes, caminhos)
const I18N_RE = [
    [/^Timecode copiado: (.+)$/, 'Timecode copied: $1'],
    [/^Comp aberta: (.+)$/, 'Comp opened: $1'],
    [/^Comp criada: (.+) · duplo clique para abrir$/, 'Comp created: $1 · double-click to open'],
    [/^Comp descompactada: (\d+) (camada|camadas)(.*)$/, (m, n, c, r) => `Comp unpacked: ${n} ${c === 'camada' ? 'layer' : 'layers'}${r.replace(' · os efeitos e o movimento do clipe da Comp não vão junto', " · the Comp clip's effects and motion are not carried over")}`],
    [/^Comp colada: (.+)$/, 'Comp pasted: $1'],
    [/^Comp colada sem: (.+)$/, 'Comp pasted without: $1'],
    [/^Comp no modelo: (.+)$/, 'Comp in the template: $1'],
    [/^Falha ao renderizar a Comp (.+)$/, 'Could not render the Comp $1'],
    [/^Renderizando a Comp "(.+)"\.\.\. (\d+)%$/, 'Rendering the Comp "$1"... $2%'],
    [/^(\d+) (camada|camadas)( · .+)?$/, (m, n, c, r) => `${n} ${c === 'camada' ? 'layer' : 'layers'}${(r || '').replace('renderizando', 'rendering').replace('na fila do render', 'waiting to render').replace('render falhou', 'render failed').replace('aberta agora', 'open now').replace('fundo transparente', 'transparent background')}`],
    [/^Renderizando Comp( \d+%)?…?$/, (m, p) => `Rendering Comp${p || '…'}`],
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
    [/^Legenda cortada em (.+)$/, 'Caption cut at $1'],
    [/^Cor da tela: (#[0-9a-f]{6})$/i, 'Screen color: $1'],
    [/^(.+): (\d+) transiç(?:ões aplicadas|ão aplicada)$/, (m, n, k) => `${i18nT(n)}: ${k} transition${k > 1 ? 's' : ''} applied`],
    [/^(.+) não se aplica a uma camada de ajuste$/, (m, n) => `${i18nT(n)} doesn't apply to an adjustment layer`],
    [/^(Dissolução cruzada|Cross fade|Fade para preto|Empurrar|Deslizar|Puxar \(zoom\)|Pop|Dobrar) \(([^)]+)\)( · encurtada: pouca mídia sobrando)?$/,
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
    [/^Projeto aberto — (\d+) mídia\(s\) offline$/, 'Project opened — $1 offline media item(s)'],
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
    [/^Falha ao exportar: ([\s\S]*)$/, 'Export failed: $1'],
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

// ── Modo desenvolvedor (Preferências → Geral): 5 cliques seguidos no botão liberam o modo agente ──
let prefsDevN = 0, prefsDevT = 0;
function prefsDevClique() {
    if (PREFS.dev) { prefsDevRender(); return; }
    const agora = Date.now();
    if (agora - prefsDevT > 2000) prefsDevN = 0;   // cliques seguidos (até 2 s entre um e outro)
    prefsDevT = agora;
    prefsDevN++;
    const falta = 5 - prefsDevN;
    if (falta > 0) {
        if (prefsDevN >= 2 && typeof toast === 'function') toast(`${i18nT('Faltam')} ${falta} ${i18nT(falta > 1 ? 'cliques para o modo desenvolvedor' : 'clique para o modo desenvolvedor')}`, 'info', 1500);
        return;
    }
    PREFS.dev = true;
    prefsSave();
    prefsDevRender();
    if (typeof toast === 'function') toast(i18nT('Modo desenvolvedor ativado'), 'success', 2500);
}
function prefsDevRender() {
    const corpo = document.getElementById('pref-dev');
    if (!corpo) return;
    corpo.hidden = !PREFS.dev;
    document.getElementById('pref-dev-btn').classList.toggle('ativo', !!PREFS.dev);
    document.getElementById('pref-agente').checked = !!PREFS.agente;
    const estado = document.getElementById('pref-agente-estado'), api = window.pywebview && window.pywebview.api;
    if (!PREFS.dev || !api || !api.ve_agente_porta) { estado.textContent = ''; return; }
    api.ve_agente_porta().then(r => {
        const porta = r && r.porta;
        estado.textContent = porta ? `${i18nT('Agora: ligado em')} http://127.0.0.1:${porta}` : i18nT('Agora: desligado');
        if (!!porta !== !!PREFS.agente) estado.textContent += ' · ' + i18nT('reabra o app para aplicar');
    }).catch(() => {});
}
function prefsSetAgente(v) {
    PREFS.agente = !!v;
    prefsSave();
    prefsDevRender();
}
function prefsDevDesligar() {
    PREFS.dev = false;
    PREFS.agente = false;
    prefsDevN = 0;
    prefsSave();
    prefsDevRender();
}

function prefsOpen() {
    const m = document.getElementById('modal-prefs');
    if (!m) return;
    i18nApply(I18N.lang);
    if (typeof prefsAba === 'function') prefsAba('geral');
    prefsDevRender();
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
        window.PREFS_CARREGADAS = true;
        window.dispatchEvent(new Event('prefs-carregadas'));   // cache em disco/RAM (editor-render.js)
        if (typeof vePjRender === 'function') vePjRender();   // modo lista/grade do painel Projeto
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
