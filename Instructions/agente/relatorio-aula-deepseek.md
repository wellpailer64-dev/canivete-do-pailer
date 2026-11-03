# Relatório da aula do DeepSeek-V4.1-Flash

Exercícios do contrato da colab 115/116, feitos no KANIVETE com o app de teste na porta **9333** (a 9222 do Pailer nunca foi tocada). Saídas em `D:/kanivete_testes/aula_deepseek/`. Nada foi comitado.

## 1. DOCUMENTO — feito (com uma ressalva)
- Arquivos: `D:/kanivete_testes/aula_deepseek/proposta.docx`, `proposta.pdf`, `proposta_pagina1.png`, `proposta_pagina2.png` (scripts `gerar_proposta.py`, `gerar_pdf.py`).
- Como conferi: `PyMuPDF` abriu o PDF (2 páginas), renderizei as duas em PNG a 110 dpi e olhei. Corrigi duas vezes (travessão virando "?" no Helvetica base14; página quase meia vazia).
- **Não consegui**: converter o `.docx` em PDF. Esta máquina não tem Word (`Word.Application` → erro 0x800401F3) nem LibreOffice. O PDF foi montado à parte com PyMuPDF, com o mesmo texto e layout próprio; a paginação do `.docx` **não foi vista**, só o conteúdo (38 parágrafos, 3 tabelas, quebra manual na página 2).
- Guia que falta: `MANUAL_AGENTE.md` manda "Word/PDF avulso: Python (python-docx, pypdf)" — `pypdf` não converte docx. Faltou dizer o que fazer sem Word/LibreOffice.

## 2. SLIDER — feito
- Arquivos: `padaria_apresentacao.dknv`, `padaria_apresentacao.pdf` (4 páginas 960×540), `slider_folha.jpg`, `slider_pdf_p1..4.png`, fonte `slider_padaria.html`.
- Como conferi: `SDK.revisar()` deu **ok**; abri a folha da mesa e duas páginas do PDF renderizado.
- Erros reais de ferramenta:
  - `<br>` no HTML da `cena` **não vira quebra de linha**: o texto sai colado ("Pão de Ouro:a marca à altura…") e não há aviso. Fiz cada linha como camada própria.
  - `tools/sd.py cmd nome '{json}'` quebra no PowerShell (o shell come o JSON → `JSONDecodeError`). Usei `lote` com arquivo `.json` em UTF-8.
  - `--colunas` existe, `--columns` (nome em inglês) estoura com "unrecognized arguments".

## 3. ARTE — feito
- Arquivos: `D:/kanivete_testes/aula_deepseek/flyer/flyer_padaria.png` (1080×1350), `flyer_padaria.iknv`, `flyer_padaria.html`, `depois_flyer.js`.
- Como conferi: `tools/knv.py --revisar` (terminou em **0 problema**) e olhei a prévia e o PNG exportado em tamanho real.
- Corrigi quatro vezes: título atropelando a chamada, margem abaixo do gabarito, selo estourando o círculo, halo branco do recorte do pão (Borracha mágica em vários pontos) e sombra de contato.
- **Ficou imperfeito**: resta um halo claro sutil na borda direita do pão (o FLUX deixou resíduo de fundo). O guia não diz como limpar isso além de "Borracha mágica" / "IA".
- Guia que engana: `revisarGabarito` mede "margem" pela **menor distância a qualquer borda dividida pelo lado menor**; com 130 px de margem lateral (12%) ele ainda acusou 8,5% porque o cabeçalho estava a 92 px do topo. Não está escrito em `design-photo-kanivete.md`.
- Outra armadilha: `data-semente` reaproveitada de outra peça pode vir do cache com **outra proporção** — a 3ª cena de 9:16 saiu 16:9 com barras brancas até eu trocar a semente.

## 4. VÍDEO — feito
- Arquivos: `reel_padaria.vknv`, `render/reel_padaria_1.mp4` (1080×1920, 30 qps, 12,0 s), cenas geradas em `reel/reel_cenas_01..03.png`, folha de quadros `reel_folha2.jpg` (script `montar_reel.py`).
- Como conferi: `tools/agente/conferir_edicao.py` → **sem reprovação**; `exportar_conferencia.py` → **pela placa**, 0 quadros pretos; olhei a folha de 12 quadros (Ken Burns nos três planos e texto em duas linhas).
- Erros reais de ferramenta:
  - `exportar_conferencia.py` **não cria a pasta de saída**; o erro que volta é `Error opening output …/reel_padaria.part.mp4: No such file or directory`, que parece problema de codec. Depois de criar `render/` exportou de primeira.
  - Texto com `tam: 88` em 1080 px sai **cortado nas laterais**, sem aviso da ferramenta; só vi nos quadros. Reduzi e quebrei em duas linhas.
- Sem áudio: não havia trilha de amostra na biblioteca e o contrato não pediu som.

## 5. KANICODE — feito (patch proposto, original não alterado)
- O Auto-Colab começa em `kanicode.py` › `_auto_colab_iniciar` (linha ~1027), chamado por `fio_chamar(..., 'colab', {'acao':'iniciar_auto'})` (linha ~1194).
- Patch: `D:/kanivete_testes/aula_deepseek/kanicode.patch` (altera `kanicode.py`, cria `tests/test_colab_aba_orfa.py`). Duas correções pequenas:
  1. Se a criação do Chamado falhar **depois** de abrir a aba (gravar fio ou estado), a aba nova ficava órfã; agora ela é fechada e o erro sobe.
  2. `fio_chamar` só capturava `ValueError/TypeError`; um `OSError` ao gravar estado derrubava o turno do Chamador em vez de devolver `ERRO:`. Passou a capturar `OSError`.
- Como conferi: `git apply --check` na pasta do KaniCode → código 0 (aplica limpo, sem alterar nada); `py_compile` das duas versões; o teste novo **falha no original** (a exceção `OSError` escapa e a aba 2 fica) e **passa na cópia corrigida** em `D:/kanivete_testes/aula_deepseek/kc_teste/`.
- `py -3.13 verificar.py --area board` na pasta do KaniCode: **OK, 16 arquivos, 5 módulos** (relatório em `D:/kanivete_testes/verificar_sydwzgv2/resultado.txt`).

## Limites deste modelo que apareceram no treino
- Não gravo no cérebro (só consulto) e não leio segredos — como o manual já diz.
- Sem Word/LibreOffice e sem áudio de amostra na biblioteca, dois caminhos do contrato precisaram de alternativa (PDF por PyMuPDF, reel sem trilha).
- O visual só é conferível olhando imagem: três dos quatro defeitos corrigidos (texto colado, texto cortado, halo) não apareceram em nenhum aviso automático.
