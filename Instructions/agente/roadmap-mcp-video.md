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
- Lote 11 (testado): `tamanho_sequencia` (ida e volta devolveu a mesma revisão; não entra no desfazer), `estado_fila`, `fila_adicionar`, `fila_iniciar`, `fila_parar`, `fila_remover`, `fila_limpar_prontos` (fila real: 480p com áudio conferido por ffprobe). `salvar_projeto_em`: baixo risco quando salva `.vknv` em caminho novo (nunca sobrescreve); `abrir_projeto` de `.vknv` existente também; `forcar` continua alto.
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
- `importar_midia` com arquivo (alto risco se fora das regras seguras); `salvar_projeto_em` sobre arquivo existente e `abrir_projeto` com `forcar` pedem o cartão "Permitir esta vez" do Pailer.
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

- Lote 13 (testado no app 9333 com cópia do clipe Dago, 2026-11-16): `montar_timeline` (até 150 clipes de mídias já no projeto, por `midia` id ou `fonte` nome; st, dur, ini, tr, vel, sem_audio, nome, x/y/sc/rot/op, db, modo, efeitos, entrada/saida; tudo em UM desfazer; falha em um item não derruba os outros), `batidas` (BPM, batidas e fortes em tempo da timeline; `marcar` cria marcadores), `alinhar_cortes_plano` (leitura) e `alinhar_cortes` (leva cortes seguidos da trilha à batida mais próxima, duração total igual, mantém áudio vinculado; bloqueia quando falta mídia/keyframes). Clipe Dago: cortes na batida 30% → 66% (22 movidos, 17 bloqueados por falta de sobra de mídia). `revisar_edicao` (buracos de imagem, offline, clipes curtos, áudio x vídeo, % de cortes na batida). Tipo de argumento novo `lo` (lista de objetos, até 150). Regra: chaves `arquivo/caminho/pasta…` em argumentos viram ALTO risco, por isso a mídia se escolhe por `fonte`.
- MCP agora segue a porta do app ligado a cada chamada (antes ficava presa na 9333 se o app abrisse depois do MCP).
- Pendente: reiniciar o MCP para as sessões já abertas verem os comandos; revisão visual de quadros por cena (usar `kanivete_tira_quadros` por ora); `montar_timeline` para mídia nova (feito no commit KaniCode `f577a86`: `importar_midia {caminho, so_projeto:true}` guarda vídeo/imagem no projeto sem clipe; testado ao vivo no 9333 com clipe e PNG; áudio ainda não).

## Lote 14 (16/11/2026): eficiência (menos rodadas, erros e releituras)
Diagnóstico pela auditoria (`D:/Kanivete/KaniCode/mcp_kanivete/auditoria.jsonl`, 567 chamadas; script `D:/kanivete_testes/scripts/analisa_auditoria_mcp.py`): 72 `obter_documento` só para pegar a revisão, 34 `listar_comandos` do vídeo (20 KB cada), 24 `instancia_indisponivel` repetidos em sequência, 23 `entrada_invalida`, e a `linha_do_tempo` passava de 8000 caracteres (corte do resultado) com uns 50 clipes, devolvendo JSON quebrado.
- Revisão OPCIONAL em `executar_comando` (como no `montar_peca`/lote): sem ela só confere se há documento; com ela, recusa se o documento mudou. Não precisa mais ler o documento antes de cada escrita.
- App ocupado: o MCP espera até 30 s (`KANIVETE_MCP_ESPERA_OCUPADO`) enquanto a porta escuta; porta fechada responde na hora. Não repetir chamada após `instancia_indisponivel` em menos de 30 s.
- Erros de argumento devolvem a assinatura certa (`Esperado: ganho_clipe {indice:n, db:n}`) e "Quis dizer …?"; comando desconhecido sugere os parecidos com a assinatura do primeiro. Argumento sobrando diz qual; `dominio` sobrando em ferramenta sem domínio é ignorado.
- Vídeo aceita apelidos e corrige sozinho (resposta traz `argumentos_renomeados`): texto→t, inicio→st (só se o comando não usa `inicio`, ex. aparar_clipe), duracao→dur, trilha→tr, escala→sc, opacidade→op, rotacao→rot, velocidade→v, clipe/index/i→indice, maiúsculas (dB→db) e número em texto ("-3"→-3).
- `listar_comandos` sem filtro = lista COMPACTA por risco (nome + argumentos): vídeo 20,5 KB → 5,1 KB. Descrição: `filtro` ou `detalhe:true`.
- `linha_do_tempo {de?, ate?, trilha?, desde?}`: números com 3 casas, omite padrão (g=0, v=1, x vazio), texto até 80 caracteres; nunca passa de ~7,6 KB e devolve `continua:{desde}` para a próxima página. Conferido no 9333 com 201 clipes: 3 páginas, JSON válido.
- Qualquer resultado cortado em 8000 caracteres traz `aviso` pedindo trecho menor.
- Testes: `tests/test_mcp_kanivete.py` (24, novo `test_eficiencia_lista_compacta_sugestao_e_espera`), `test_mcp_manifesto_novos.py`, `test_mcp_montar_peca.py`; ao vivo `D:/kanivete_testes/scripts/t_eficiencia_*.py`.
- Vale para sessões que abrirem o MCP depois desta mudança (as abertas antes seguem com o código antigo até reiniciar o MCP).

## Lote 15 (17/11/2026): o que travou a edição do HDI ao vivo
Diagnóstico: as sessões editavam por `kanivete.py js` (regra antiga no método e na memória), com 233 scripts soltos; clipe de
depoimento clonado de vizinho `x:'v'` entrou mudo e sem leitura da mídia; GC ficou sobre a cena errada depois de troca; achar
frase em depoimento bruto exigiu transcrição improvisada.
- `som_clipe {indice|id, ligado?, db?}`: liga o som embutido (prepara a mídia, recusa se a mídia não tem áudio ou se o som está separado).
- `trocar_imagem {indice|id, fonte|midia, ini?, nome?, com_som?, manter_efeitos?, manter_animacao?}`: troca a cena mantendo lugar, duração, velocidade e cor.
- `abaixar_musica {indice|id da música, falas?: [índices], db?: 13, antes?, depois?, juntar?}`: ducking por quadros-chave de volume (k.vol), um desfazer.
- `revisar_edicao` agora avisa `fala_sem_som` (depoimento/entrevista com x:'v' e mídia com áudio) e `midia_sem_leitura` (e já prepara).
- `tools/agente/falas_midia.py arquivo` (Kanivete): frases e palavras com tempo da fonte, cache em D:/Kanivete/cache/falas.
- Método e memória: MCP primeiro; JS só para lacuna, anotada aqui.

## Lote 16 (17/11/2026): correções da auditoria do MCP
Registro completo (motivo, raciocínio, testes e o que ficou de fora): **`Instructions/agente/mcp-video-melhorias.md`**.
Antes de mexer em comando de vídeo, leia e acrescente sua entrada lá.
- `montar_timeline` não pega mais clipe antigo no lugar do novo (a timeline é ordenada; a identidade vale, não o índice)
  e devolve `clipes_criados` com id/indice/st/fim/tr/nome.
- `tr` aceita `V2`/`A1` e valida a faixa (mover/duplicar/montar); `keyframe` recusa prop desconhecida/valor não numérico;
  `abrir_timeline {id: seq_…}` não é mais confundido com id de clipe.
- `_mcpId` agora é gravado no clipe: o id sobrevive ao desfazer/refazer e ao salvar; cópias e divisões geram id novo.
- `novo_projeto` funciona SEM documento e aceita largura/altura/fps; `tamanho_sequencia {fps}` salva o fps na timeline;
  `listar_efeitos` compacto por padrão e nomes parecidos quando a mídia/efeito não existe.
- Lote: `selecionar_clipes`, `aplicar_efeito_varios` (um desfazer), `remover_vaos`; `exportar_video {de, ate}`.
- `fade_audio {saida: n}` não pede mais confirmação de arquivo; `revisar_edicao` acusa keyframe inválido, trilha/parte
  inválida, áudio duplicado e HDR.

## Lacunas observadas na revisão HDI (17/11/2026, aba 124)
- `abrir_timeline {id: seq_…}` era confundido com id estável de clipe antes de chegar ao comando; **resolvido no lote 16**
  (a resolução por id de clipe é pulada nesse comando).
- `fade_audio {saida: 0.04}` classificava o número de segundos como caminho de saída e pedia confirmação de exportação;
  **resolvido no lote 16** (a chave só conta como caminho quando o valor é texto).
- `analisar_mix` não considera `k.vol` do ducking na diferença voz/trilha; o alerta de 3 dB não representa a mixagem com os -12/-13 dB animados. Conferir automação e áudio efetivo antes de concluir.
