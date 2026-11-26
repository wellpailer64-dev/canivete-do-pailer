# Ferramentas prontas: gatilho → comando

Antes de escrever script, procurar aqui. Script avulso que se repete vira ferramenta e entra nesta lista, no catálogo e no RAG.
`WT` = `py -3.13 D:/Kanivete/Plugins/kanibrowser/wa_tarefas.py`. `WA` = `py -3.13 D:/Kanivete/Plugins/kanibrowser/wa.py`. Os demais rodam da raiz do Kanivete.

## Assistir vídeo
- Assistir vídeo do disco, com tempos e fala: `WT assistir --arquivo v.mp4` (`--inicio S --fim S` para aprofundar).
- Baixar do WhatsApp e assistir: `WT assistir --conversa X --pasta P --nome parte` (arquivo) ou `--duracao 1:10` (vídeo comum).
- Vídeo por link: `py -3.13 D:/Kanivete/Plugins/kanicode/video_download.py baixar --url L`.
- Pasta inteira de cliente: `tools/briefing.py "<pasta>"`.
- Ver timeline montada: `tools/tripa.py "Timeline"`; quadros do monitor: `tools/agente/quadros_monitor.py 1.5,20,45 saida.jpg --timeline "T"`.

## WhatsApp
- Recepção rápida: `wa_comando.py ouvir` aguarda notificação do observador DOM pela ponte, com conferência de segurança a cada 20s; confirma antes de transcrever e usa fila persistida. `wa_comando.py estado` mostra etapas/falhas. Script `whatsapp_eventos`; detalhes e limites em `kanibrowser/EXTENSAO.md`.
- Pedidos por áudio no grupo KaniCode: `wa_comando.py ouvir` transcreve mensagens próprias novas por ID e encaminha à gerente; primeira leitura só marca histórico. Falha não vira pedido nem é repetida automaticamente; conferir log `D:/Kanivete/Testes/wa_comando/ouvinte.log`.
- Contexto compacto no navegador interno: `kb.py --onde kanicode scripts rodar --nome whatsapp_contexto`. Para mensagens carregadas, dados `{"conversa":"Nome completo","n":3}`; confere conversa exata, não rola e não envia. Guia `kanibrowser/EXTENSAO.md`.
- Primeira noção da conversa: `WT resumo --conversa X --n 40`. A Kani já errou quem falou, data e o que estava pendente (2026-11-02): é só orientação; antes de agir, conferir no texto completo, cujo caminho vem na saída.
- Ler mensagens: `WA ler --conversa X --n 20 --transcrever`. Procurar conversa: `WA conversas --busca termo`.
- Baixar: `WA arquivo --conversa X --nome parte --pasta P`; `WA midia --conversa X --tipo video --duracao 1:10 --saida a.mp4`; `--tipo foto`.
- **Varredura da conversa/grupo** (quem, data, hora, tipo, links, imagem/áudio/arquivo; salva .md+.json em `D:/Kanivete/KaniBrowser/wa_varreduras`, imprime só resumo): `py -3.13 "D:/Kanivete/Plugins/kanibrowser/wa.py" varrer --conversa X [--n 300] [--desde AAAA-MM-DD] [--de-quem nome] [--tipo-msg link,imagem,audio,arquivo,texto] [--busca termo] [--transcrever] [--json]`. Gatilhos: "o que rolou/combinaram no grupo", "o que X falou", "resume a conversa", "o que falta/pendente", "onde está o link/arquivo/foto", "o que mandaram hoje/desde segunda", antes de abrir demanda ou responder cliente sem contexto. Escolha: contexto geral = `varrer --desde` (ou `--n 100`); só links = `links`; só 3 últimas = `ler`; `--transcrever` já põe a fala dos áudios na varredura (cache: o 2º uso é grátis; toca o áudio mudo, então fica marcado como ouvido; combine com `--desde`/`--n` para não transcrever histórico à toa). Ler o `.md` gerado (por dia) em vez de repetir a leitura; conferir no texto antes de agir.
- Todos os links da conversa (meus e dele, sem repetir, com quem/quando/texto): `WA links --conversa X [--busca drive] [--data AAAA-MM-DD] [--json]`. Lê a conversa inteira (~5 min); "último link" = o mais recente da lista.
- Enviar só com ok do Pailer: `WA enviar --conversa X --texto "..."`.
- Mandar vídeo, Reels, exportação ou arquivo: `WA enviar --conversa X --arquivo v.mp4 --texto legenda`. Vídeo acima de 16 MB vai como arquivo, sem compressão; `--comprimir` só se pedirem. Ver como iria sem postar: `--sim` (só simula). PDF e documento vão sem `--documento`: essa opção é para foto e vídeo sem compressão. Nunca testar em grupo de cliente.
- Saída do envio de arquivo: 0 enviado, 1 não enviado, 3 incerto. Com 3, olhar a conversa antes de reenviar.

## Google Fotos e navegador
- Álbum compartilhado do Google Fotos inteiro, em qualidade original: `py -3.13 tools/agente/baixar_google_fotos.py "<link>" "<pasta BRUTO>"` (por `tarefas_soltas.py`; retoma, pula os já baixados, para antes de encher o disco). `--so-listar` só conta. Não usar "Fazer o download de tudo".
- Navegador travado: `kb.py --onde kanicode uso` (quem está usando) → `kb.py recarregar [--aba ID]` (só a página) → `extensao recarregar` (só o motor) → `kb.py reiniciar` (último recurso; reabre as abas, pode pedir QR do WhatsApp).
- Motor da extensão "não iniciou": a ponte já reinstala sozinha; .py do KaniBrowser editado entra no próximo comando, sem reiniciar o KaniCode.

## Quando algo falha
- Mesmo erro duas vezes: parar e ler a causa, não repetir o comando.
- "Sem veredito" do modo automático: avisar o Pailer na primeira vez; repetir não resolve e não se contorna por outro caminho.

## Editar vídeo
- Reel falado: roteiro JSON + `tools/agente/reel_fala.py`.
- Corrigir cor de vídeo pelos escopos (branco estourado, preto esmagado, cor puxada, pele vermelha): `py -3.13 tools/agente/cor_auto.py video.mp4 --look '{...grade do cliente...}' --folha prefixo` → valores do Luz e Cor.
- Onde a música deve começar (pula intro, acha drop e seções calmo/agitado): `py -3.13 tools/agente/musica_ponto.py musica.mp3 [--min-cena 60]`; o `reel_fala.py` já usa.
- Conferir, sempre primeiro em projeto pronto: `tools/agente/conferir_edicao.py projeto --sem-ouvir`.
- Timeline aberta do Pailer: MCP do Kanivete primeiro (`consultar_timeline`, `trocar_imagem`, `som_clipe`, `abaixar_musica`, `revisar_edicao`); JS solto só para lacuna.
- Frase de depoimento bruto com tempo por palavra: `py -3.13 tools/agente/falas_midia.py arquivo.mp4 [--de s --ate s]` (cache).
- Palavra comida no corte (onda encostada no início ou no fim): `tools/agente/checar_cortes.py projeto [--sem-ouvir]`; ponta no vale: `tools/agente/onda_voz.py` (`Onda(arq).ajustar_fim/ajustar_inicio`).
- Trocar arquivo por outra versão: `tools/agente/trocar_midia.py projeto "antigo" novo.mp4 --aplicar`.
- Asset (lettering, GC, título) editável na timeline aberta: HTML → Comp nativa com `py -3.13 tools/agente/comp_html.py cena.html --nome "X (Comp)" --fonte PASTA --alvo X.mov`; fluxo em `metodo-edicao-video.md` › Assets editáveis. `.mov` sempre com `<nome>.fonte.json` ao lado.
- Voz repetida em emenda: `tools/agente/fechar_emenda.py projeto TEMPO --aplicar`.
- Abrir e fechar app de teste: `tools/agente/abrir_teste.py projeto`; `--fechar`.
- Exportar e medir: `tools/agente/exportar_conferencia.py "T" pasta --nome n`. Acompanhar sem clicar: `tools/vigia_export.py`.
- Polir montagem: `tools/agente/polir_montagem.py`. Quem fala em cada trecho: `tools/agente/falante.py`.
- Trilha: `py -3.13 D:/Kanivete/Plugins/kanibrowser/epidemic.py`.

## Imagem e referência
- Revisar imagem sem gastar contexto: `tools/olho.py`. Referências do Pinterest: `tools/refs.py`. Peça de cliente: `tools/peca.py`.

## Navegador interno
- Extensão 0.2: `extensao estado` confere prontidão/versão. Formulários: selecionar/marcar; clicar/tecla com `aguardar` confirmam condições sem repetir ação. `principal:true` lê conteúdo central; panorama limita mídias. Exemplos em `EXTENSAO.md`.
- Visão conjunta: `kb.py --onde kanicode extensao panorama`. Mapa filtrado: `extensao mapa --dados @arquivo.json` com `tipo` (campos/botoes/links), `texto`, `seletor` e `maximo`. Panorama aceita os mesmos filtros no mapa e `limite` no texto.
- Extensão e scripts reutilizáveis: `py -3.13 D:/Kanivete/Plugins/kanibrowser/kb.py --onde kanicode extensao estado|ler|mapa|midias|api`; biblioteca: `scripts listar` / `scripts rodar --nome extrair_links`. Guia `D:/Kanivete/Plugins/kanibrowser/EXTENSAO.md`. Downloads só concluídos com estado `complete`; ativação inicial exige reiniciar o KaniCode pelo fluxo normal.

## Currículo
- Currículo, CV ou PDF para robô de triagem: `tools/curriculo.py`, Slider A4, ficha JSON, `.dknv` editável e PDF vetorial.
- Ordem: `extrair arquivo.psd --pasta P` → preencher a ficha → `faltas ficha.json` → perguntar o que faltar, sem inventar → `montar ficha.json --saida BASE` → `conferir BASE.pdf --ficha ficha.json --png P` → ver as páginas → enviar com o ok do Pailer.
- Padrão: logo ao lado do nome escrito, nível em palavra, todas as experiências com abertura e bullets de uma ideia cada. Duas colunas podem sair fora de ordem em robôs antigos: avisar.

## Texto atrás da pessoa / gancho de reel
- Receita completa e armadilhas: `Instructions/agente/receita-gancho-texto-atras.md`. Máscara por pessoa e conferida por número: `py -3.13 D:/Kanivete/Testes/scripts/roto_pessoa.py --base CLIPE --nome NOVO --tr N --soma "x,y;x,y;x,y" --tira "x,y" --caixa x0,x1,y0,y1 --fora x0,x1,y0,y1` (rodar em segundo plano, ~1,5 min).
- Recorte do Roto cortando cabeça/orelha/óculos (ou checar se está bom) sem olhar imagem: `py -3.13 tools/agente/roto_refinar.py --clip "NOME"` mede contra o BEN2 (falta % por quadro; moto/placa/outra pessoa ficam de fora); `--aplicar` põe os pontos, congela e remede. BEN2 na CPU ~20 s/quadro, guardado em `<cache>/ref` (2ª vez 3 s). `--tirar` mede sobra (objeto na frente da pessoa também conta: conferir antes de tirar).

## Demandas
- Pandalab: `py -3.13 D:/Kanivete/Plugins/pandalab/panda.py` (mudar card real só com o Pailer).

## Achar o que não está aqui
`py -3.13 tools/mapa_geral.py --busca termo` e `brain_search` com `tipo=habilidade`.

## Gerar imagem / upscale fiel / textura / PNG de marca
Gatilho: precisa de imagem gerada, upscale ou asset no estilo do cliente → **Codex CLI** (conta do ChatGPT), nunca o navegador primeiro.
`cd PASTA_SAIDA && codex exec --skip-git-repo-check -s workspace-write -i ORIG.png -- "Use a ferramenta de geração de imagem (image_generation, não Python)... Salve como NOME.png na pasta atual"`
Prompt depois de `--`. ~2 min; paralelo com `&`. Exemplo: `D:/Kanivete/Testes/scripts/dad/codex_up.sh`. Conferir lado a lado.

- **QR Code personalizado** (cores, pontos, olhos, logo no centro; PNG/SVG/PDF; confere leitura): `py -3.13 Functions/qr_personalizado.py "<link>" --saida pasta/qr [--tipo url|wifi|whatsapp|pix] [--cor #hex --fundo #hex --olho #hex] [--pontos quadrado|arredondado|bolinha] [--logo png --logo-pct 17]`. Sai com código 2 e aviso se não leu em todos os tamanhos. Aba visual "QR Code" (menu Códigos, frontend/js/qr.js) pronta (salva PNG/SVG/PDF e copia); pelo chat: MCP kanivete_qr (sem app aberto).

- **Atalho do Drive (upload de render / download de brutos):** em vez de `.txt` com link, gerar atalho `.url` (duplo clique abre a pasta): `py -3.13 tools/atalho_drive.py upload|download --etapa RENDER|BRUTOS --nome "NOME" --link URL --pasta DESTINO` → `UPLOAD - RENDER - NOME.url` / `DOWNLOAD - BRUTOS - NOME.url`. Ler: `atalho_drive.py ler ARQ` (aceita `.txt` antigo). Upload: pasta RENDER ao lado do vídeo; download: pasta dos brutos.

- **Escolher take e ponto de corte na música** (montagem musical, teaser, cobertura de evento): `py -3.13 tools/agente/escolher_take.py take BRUTO.mov [--saida tira.jpg]` → tira do bruto inteiro (risco vermelho = borrado, câmera procurando, rosto cortado, estouro; verde = candidato limpo a cada 2 s); a escolha final é no olho com o checklist de `estudo-teaser-expocatadores.md`. `escolher_take.py grade musica.mp3 --inicio S --de A --ate B` → batida/colcheia/semicolcheia com a força do ataque (cortar nos fortes).
