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
- Pedidos por áudio no grupo KaniCode: `wa_comando.py ouvir` transcreve mensagens próprias novas por ID e encaminha à gerente; primeira leitura só marca histórico. Falha não vira pedido nem é repetida automaticamente; conferir log `D:/kanivete_testes/wa_comando/ouvinte.log`.
- Contexto compacto no navegador interno: `kb.py --onde kanicode scripts rodar --nome whatsapp_contexto`. Para mensagens carregadas, dados `{"conversa":"Nome completo","n":3}`; confere conversa exata, não rola e não envia. Guia `kanibrowser/EXTENSAO.md`.
- Primeira noção da conversa: `WT resumo --conversa X --n 40`. A Kani já errou quem falou, data e o que estava pendente (2026-11-02): é só orientação; antes de agir, conferir no texto completo, cujo caminho vem na saída.
- Ler mensagens: `WA ler --conversa X --n 20 --transcrever`. Procurar conversa: `WA conversas --busca termo`.
- Baixar: `WA arquivo --conversa X --nome parte --pasta P`; `WA midia --conversa X --tipo video --duracao 1:10 --saida a.mp4`; `--tipo foto`.
- Enviar só com ok do Pailer: `WA enviar --conversa X --texto "..."`.
- Mandar vídeo, Reels, exportação ou arquivo: `WA enviar --conversa X --arquivo v.mp4 --texto legenda`. Vídeo acima de 16 MB vai como arquivo, sem compressão; `--comprimir` só se pedirem. Ver como iria sem postar: `--sim` (só simula). PDF e documento vão sem `--documento`: essa opção é para foto e vídeo sem compressão. Nunca testar em grupo de cliente.
- Saída do envio de arquivo: 0 enviado, 1 não enviado, 3 incerto. Com 3, olhar a conversa antes de reenviar.

## Quando algo falha
- Mesmo erro duas vezes: parar e ler a causa, não repetir o comando.
- "Sem veredito" do modo automático: avisar o Pailer na primeira vez; repetir não resolve e não se contorna por outro caminho.

## Editar vídeo
- Reel falado: roteiro JSON + `tools/agente/reel_fala.py`.
- Corrigir cor de vídeo pelos escopos (branco estourado, preto esmagado, cor puxada, pele vermelha): `py -3.13 tools/agente/cor_auto.py video.mp4 --look '{...grade do cliente...}' --folha prefixo` → valores do Luz e Cor.
- Conferir, sempre primeiro em projeto pronto: `tools/agente/conferir_edicao.py projeto --sem-ouvir`.
- Palavra comida no corte: `tools/agente/checar_cortes.py projeto`.
- Trocar arquivo por outra versão: `tools/agente/trocar_midia.py projeto "antigo" novo.mp4 --aplicar`.
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

## Demandas
- Pandalab: `py -3.13 D:/Kanivete/Plugins/pandalab/panda.py` (mudar card real só com o Pailer).

## Achar o que não está aqui
`py -3.13 tools/mapa_geral.py --busca termo` e `brain_search` com `tipo=habilidade`.
