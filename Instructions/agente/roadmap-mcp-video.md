# Roadmap: comandos do Editor de Vídeo no MCP (`kanivete_executar_comando`, domínio `video`)

Meta: tudo que o modo antigo por porta (CDP/JS) fazia, em chamadas curtas, reversíveis (entram no Ctrl+Z) e conferidas.
Código: `D:/Kanivete/Plugins/kanicode/mcp_manifesto.py` (tabela `VIDEO`) + handlers `veMcp*` em `mcp_kanivete.py` (`_executar_video`).
Lote novo: escrever handlers em arquivo, rodar `D:/kanivete_testes/scripts/aplicar_lote.py js nomes manifesto`, reiniciar o MCP, testar no app 9333 e desfazer.
Cuidado: o JS está numa string Python (sem barra invertida, sem `\n`).

## Feito e testado no app 9333
- Leitura: linha_do_tempo, textos_agulha, listar_legendas, listar_trilhas, listar_marcadores, listar_midias, listar_efeitos, listar_transicoes, efeitos_clipe, listar_keyframes, capturar_previa (quadro).
- Clipes: selecionar, ir_para, dividir_na_agulha, dividir_em, remover_trecho, remover_clipe, mover_clipe, aparar_clipe, duplicar_clipe, renomear_clipe, propriedades_clipe, ganho_clipe, velocidade_clipe.
- Texto: criar_texto, editar_texto (fonte, cor, cor por palavra, contorno, fundo, sombra), editar_legenda.
- Trilhas, marcadores, entrada/saída: trilha_estado, criar_trilha, marcador, entrada_saida.
- Mídia: importar_midia, camada_ajuste (importar_midia só escrito, sem teste com arquivo).
- Efeitos: adicionar_efeito, editar_efeito, remover_efeito (vídeo e áudio), transicao, modo_mesclagem, fade_audio.
- Animação: keyframe, remover_keyframe.
- Sistema: desfazer, salvar_projeto, exportar_video, estado_exportacao.

- Lote 3 (testado): respiros_plano, cortar_respiros, transcrever, ver_transcricao, montar_legendas, apagar_legendas, dividir_legenda, mover_legenda, estilo_legenda, listar_timelines, criar_timeline, abrir_timeline, reproduzir, resolucao_previa, info_projeto. (transcrever e montar_legendas sem teste de ponta a ponta.)

- Lote 4 (testado): criar_forma, editar_forma, criar_cor_solida, listar_animacoes_texto, animacao_texto (inverter_clipe, autozoom, remover_autozoom: escritos, SEM teste: gerar reverso e transcrição pesam).
- Lote 5 (testado): listar_mixer, mixer, copiar_efeitos (novo_projeto, abrir_projeto: escritos, sem teste).

- Lote 6 (testado): listar_sons, colocar_som.
- Respiros: `Functions/respiros.py` agora tem modo `dinamico` (padrão): pausa que fica cresce com o tamanho, encolhe em fala rápida e a respiração colada na palavra sai. Testado em 4 lapelas da Helo: 0 bordas com onda. Ainda sem escuta do Pailer.

- Lote 7 (testado): `opcoes_exportacao` e `exportar_video` com opções (formato, codec, bits, qualidade, mbps, blocos, resolução, gpu, sem_audio, nome). Conferido: 480p H.264 com nome e áudio saiu certo (ffprobe). Cuidados: opções vão junto do exportar (veOpenExport zera qualidade/nome/resolução); `sem_audio` persiste entre chamadas (mande false); o nome só vale via fila (veFilaAdicionarAtual).
- Lote 8 (testado): `medir_volume` (LUFS do trecho usado), `normalizar_clipe` (ganho = alvo - LUFS, padrão -16, um desfazer só). `melhorar_audio`, `estado_melhoria_audio`, `parar_melhoria_audio`, `descartar_melhoria_audio` escritos; só estado e erro testados (melhorar grava <nome>_melhorado.wav ao lado da mídia: não testei em pasta de cliente). EQ: `adicionar_efeito eq {lo, mid, hi}` ou pr_* (já coberto).
- Bug corrigido: `sound_kanivete.lufs_trecho/silencios` quebravam com caminho acentuado (cp1252); agora utf-8.
- Lote 9 (testado): `listar_mascaras`, `criar_mascara`, `editar_mascara`, `remover_mascara`, `camada_mae`, `fosco_trilha`, `desfoque_movimento`, `criar_nulo` (via VEMO_API). Conferido na prévia: elipse invertida com pena abre o buraco certo; tudo desfeito (histórico volta ao início). Cuidado: com máscara/mãe/desfoque de movimento o clipe passa a ser desenhado quadro a quadro e o app de teste pode ficar ~1 min sem responder (o MCP responde `instancia_indisponivel`: espere e repita).
- Lote 10 (testado, menos o roto): `listar_pessoas`, `analisar_pessoas`, `estado_pessoas`, `nomear_pessoa`, `buscar_pessoa`, `listar_plugins_ofx`, `rastrear_movimento` (agulha dentro do clipe, caixa em px), `estado_rastreio`, `parar_rastreio`, `aplicar_rastreio` (nulo novo ou clipe alvo). Rastreio real: 88 pontos, nulo com keyframes x/y, desfeito. `roto_tracar`/`estado_roto`: só estado testado (o efeito `roto` precisa estar no clipe e o modelo SAM é pesado). Estabilizador = efeito `estab` (adicionar_efeito).
- Lote 11 (testado): `tamanho_sequencia` (ida e volta devolveu a mesma revisão; não entra no desfazer), `estado_fila`, `fila_adicionar`, `fila_iniciar`, `fila_parar`, `fila_remover`, `fila_limpar_prontos` (fila real: 480p com áudio conferido por ffprobe). `salvar_projeto_em`: escrito, o MCP o trata como alto risco e pede o cartão do Pailer (não testado).
- Pendências conhecidas: fps da sequência (sem comando: vem da mídia), 3D (domínio `cena3d` já separado), melhorar áudio ponta a ponta, roto ponta a ponta.

- Reiniciar o MCP: matar o python `mcp_kanivete` filho do claude.exe desta sessão (não o do codex); sobe sozinho. Autorização: botão "Sempre" da faixa Kanivete MCP no KaniCode (permanente); sem ele a concessão some. Chamadas que escrevem pedem `revisao` (kanivete_obter_documento).

## Cuidados aprendidos
- O `indice` de um clipe novo muda quando a timeline é reordenada: use o `i` devolvido por criar_texto/criar_forma/criar_cor_solida (recalculado), ou `linha_do_tempo`.
- Criar clipe usa a agulha como início: depois de reabrir projeto a agulha volta a 0.
- `mixer` (volume/pan/mudo/solo de trilha) NÃO entra no desfazer: reverter com o próprio comando.
- Trocar de timeline (abrir_timeline/criar_timeline) NÃO é desfazível e o histórico de desfazer fica misturado: depois de trocar, desfazer pode restaurar clipes da outra timeline (perdi a timeline de teste e recuperei do .vknv salvo). Antes de trocar, salve; depois da troca, não use desfazer para voltar passos de antes.
- Reabrir projeto no app: `veOpenProject(p)` duas vezes seguidas (1ª só avisa de alterações não salvas).

- Respiros dinâmicos no `reel_fala.py` (opt-in: `"respiros": "dinamico"` no roteiro ou `KANI_RESPIROS=dinamico`; padrão continua o corte antigo). A/B no roteiro do Gordinhos (Reels A): base 145,65 s, 16 cortes mexidos; dinâmico 142,53 s (3,1 s a menos), 24 cortes mexidos; bordas com onda 0/32 e 0/48. Falta o Pailer ouvir antes de virar padrão.

## Encerrado em 16/11/2026 (com exceções aceitas pelo Pailer)
Lotes 1 a 11 feitos (109 comandos). Ficam como "escritos, sem teste ponta a ponta":
- `importar_midia` com arquivo e `salvar_projeto_em` (alto risco: pedem o cartão "Permitir esta vez" do Pailer).
- `melhorar_audio` (grava <nome>_melhorado.wav ao lado da mídia: testar só em cópia) e `roto_tracar` (precisa do efeito `roto`; modelo SAM pesado).
- `novo_projeto`, `abrir_projeto`, `inverter_clipe`, `autozoom`, `transcrever`/`montar_legendas` ponta a ponta.
Sem comando: fps da sequência (vem da mídia), 3D (domínio `cena3d`).
Aberto para o Pailer: ouvir `ab_din.vknv` (respiros dinâmicos, opt-in) e decidir se vira padrão.
O PC não foi desligado (o Pailer dispensou).

## Lote 12 (16/11/2026, testado no app 9333): visão, mix, reversão e preset
- `kanivete_tira_quadros` (ferramenta MCP, leitura): UMA imagem com miniaturas e o tempo de cada quadro. `tempos:[s,...]` ou `n` (2 a 12, espalhados pela duração), `largura` 120-480, `colunas`. Pausa a reprodução antes de pedir; a agulha volta onde estava. Espera o vídeo carregar (primeiro seek numa mídia nova saía preto). Limite de 400 KB (baixa a qualidade sozinha).
- `consultar_timeline {de?, ate?, trilha?, tipo?}` (video, leitura): clipes no trecho, `sem_imagem`, `sem_audio`, sobreposições na mesma trilha e vãos. Responde "o que cobre o áudio de 38 a 42 s" sem ler a timeline toda.
- `analisar_mix {musica?: [índices], detalhe?}` (video, leitura): LUFS (trecho usado + ganho) por papel (voz, musica, efeito; papel pelo nome, `musica` força) e janelas com `voz_acima_db`; alerta abaixo de 12 dB (ideal 15 a 20). Não conta volume de trilha do mixer nem fades. Escuta humana continua valendo.
- `ponto_restauracao {nome?}`, `voltar_ponto {nome?}`, `listar_pontos`: foto da timeline em memória (some ao reiniciar o app); voltar entra no desfazer; recusa ponto de outra timeline. Mixer de trilha não volta.
- `kanivete_executar_lote {transacional: true}` (só vídeo): guarda o ponto `_lote` antes e, se um passo falhar, volta tudo e devolve `revertido`. A volta também entra no desfazer.
- `kanivete_imagem_do_dia_video {card, duracao?, nome?, db?, trilha?, transcrever?, refazer?, so_ver?, abrir?}` (escrita, baixo): MagnetUS. Chama `tools/agente/imagem_dia_video.py`: acha BASE STORY e VIDEO NO MONITOR em `02 - ASSETS`, copia o modelo `D:/kanivete_biblioteca/modelos/magnetus_imagem_dia_video/modelo.vknv` (o projeto aprovado da Pneumatose), troca as mídias e encaixa exame 0..duracao, trilha (-22 dB, fade 1 s/2 s) e assinatura; salva em `03 - PROJETO/IMAGEM DO DIA - <TEMA>.vknv`. Abre no editor só se ele não tiver alterações pendentes. Nunca sobrescreve sem `refazer`. Não gera os assets (Photo) nem exporta/entrega. Devolve o `audio_do_cliente` (baixado pelo panda.py) e, com `transcrever`, o texto: conferir o recorte pedido antes de seguir.
- Cuidados: reiniciar o MCP para carregar os comandos novos; o teste usa app 9333 e `KANIVETE_MCP_ESCRITA=1` no script (veja `D:/kanivete_testes/scripts/t12*.py`).
