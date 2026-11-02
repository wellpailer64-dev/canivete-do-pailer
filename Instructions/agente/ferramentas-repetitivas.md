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
- Saber o que ele pediu, sem ler tudo: `WT resumo --conversa X --n 40`.
- Ler mensagens: `WA ler --conversa X --n 20 --transcrever`. Procurar conversa: `WA conversas --busca termo`.
- Baixar: `WA arquivo --conversa X --nome parte --pasta P`; `WA midia --conversa X --tipo video --duracao 1:10 --saida a.mp4`; `--tipo foto`.
- Enviar só com ok do Pailer: `WA enviar --conversa X --texto "..."`.

## Editar vídeo
- Reel falado: roteiro JSON + `tools/agente/reel_fala.py`.
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

## Demandas
- Pandalab: `py -3.13 D:/Kanivete/Plugins/pandalab/panda.py` (mudar card real só com o Pailer).

## Achar o que não está aqui
`py -3.13 tools/mapa_geral.py --busca termo` e `brain_search` com `tipo=habilidade`.
