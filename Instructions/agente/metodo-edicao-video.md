# Método de Edição de Vídeo do Pailer

Fonte única das regras. Vale para todo vídeo editado no Vídeo Kanivete. Cada regra veio de uma nota dele; a data é a origem.
Detalhes: API e histórico em `guia-edicao.md`; teoria em `tecnicas-de-montagem.md`; cor em `cor-cinematografica`; cliente em `clientes/<cliente>.md`.

## Ordem de trabalho
1. **Consultar**: ficha do cliente, últimos RENDERS dele e `brain_search` com área `video` e o tipo do vídeo.
2. **Combinar**: pedido grande, mandar 3 a 5 linhas com o que entendeu, plano e custo antes de mergulhar.
3. **Ver e ouvir**: transcrição e uma folha de quadros por vídeo. Sem abrir o app ainda.
4. **Montar**: a ferramenta do formato, sem script novo. Reel falado: roteiro JSON + `tools/agente/reel_fala.py`.
5. **Conferir**: `py -3.13 tools/agente/conferir_edicao.py projeto.vknv`. Só mostrar com REPROVADO zerado; o que vier como OUVIR, ouvir.
6. **Olhar**: `tools/agente/quadros_monitor.py`, uma folha.
7. **Exportar para conferir**: `tools/agente/exportar_conferencia.py`, em tarefa solta. Deve sair pela placa.
8. **Entregar**: salvar e deixar aberto no app dele. Exportar de verdade e mudar o card só com o ok.
9. **Aprender**: nota nova dele vira regra aqui e no cérebro no mesmo dia.

## Ajuste em projeto pronto (barato, nota de 2026-11-02)
1. `conferir_edicao.py projeto --sem-ouvir` primeiro; ela lista os problemas. Nada de despejar a timeline no chat.
2. Mídia em outra versão: `tools/agente/trocar_midia.py projeto "nome antigo" novo.mp4 --aplicar`.
3. Voz repetida na emenda: `tools/agente/fechar_emenda.py projeto TEMPO --aplicar`.
4. App de teste: `tools/agente/abrir_teste.py projeto`; ao terminar, `--fechar`.
5. Uma folha de quadros ANTES de exportar. Exportar só com a folha certa.
Script avulso que se repete vira ferramenta. Defeito achado no olho vira regra em `conferir_edicao.py`.

## Regras
### Corte de fala
- Corte no fim de frase ou de movimento, no contexto do que é dito (2026-10-14).
- Nunca comer palavra. O fim do corte vem do vale da voz, não do tempo da transcrição (2026-11-01).
- Tirar repetição, hesitação e "dando sequência" sem mudar o sentido.
- Pausa: corta acima de 0,30 s depois de pontuação e 0,40 s no meio da frase, medida na energia da voz, não na transcrição.
- Sem ar parado na ponta do corte: a frase acaba e o corte vem logo (nada de esperar ~0,7 s e pular). A transcrição estica a última palavra por cima do silêncio; a ponta vem da voz (2026-11-06).

### Zoom e camadas
- Zoom dinâmico só em camada de ajuste, nunca escala animada no clipe (2026-11-01).
- Zoom é de ênfase, não um por corte: escolhido pelo que está sendo dito (número, pergunta, ponto forte, chamada), entra suave, sustenta e volta suave. Nada de pular de zoom mínimo para máximo e voltar a cada corte; fora da ênfase o quadro fica parado (2026-11-06).
- Cor em outra camada de ajuste, abaixo de logo, tarjas e legendas (2026-11-01).
- Cor medida, não chutada (2026-11-06): cada fonte passa por `tools/agente/cor_auto.py` (escopos: branco p99,5 ≤ ~0,95 sem estouro, preto 0,02–0,06 sem esmagar, neutro sem puxar cor, pele na linha de pele; pele vermelha/saturada corrigida no HSL secundário só na faixa dela), partindo da grade do cliente. O `reel_fala.py` já faz isso: uma camada de cor por trecho de fonte (`"cor_auto": false` desliga).
- Trilha começa onde a música começa de verdade (2026-11-06): intro lenta, sem ritmo ou melodia não abre vídeo dinâmico. `tools/agente/musica_ponto.py` mede energia/ataques por compasso, classifica calmo/médio/agitado, acha a entrada do ritmo e o drop; o vídeo abre na batida desse ponto (calmo→agitado = virada). `reel_fala.py` usa por padrão (`"musica_inicio": "auto"`; número = segundo fixo; 0 = do começo); precisa sobrar música para o vídeo todo, senão recua. Se o vídeo tiver momento calmo e momento de impacto, casar a virada/drop com o corte da fala principal.
- Timeline organizada, com cor por tipo de camada (2026-10-14). Motion pronto termina em `veCompAgruparCenas()`.
- Troca de foco entre pessoas: duas faixas iguais empilhadas, desativando a de quem não está em foco (2026-10-07).

### Cor
- Partir do limpo, sem bloom por padrão. Conferir pele: rosto não pode ficar vermelho (2026-11-01).
- Cor estranha: olhar antes as curvas do Luz e Cor nas camadas de ajuste (2026-09-30).

### Rosto e B-roll
- Primeira aparição de quem fala é rosto, por cerca de 11 s, sem ponte de B-roll (2026-10-23).
- Depois, um plano de B-roll por vez entre cerca de 6 s de rosto; rosto em 80% da fala em depoimento (2026-10-22).
- Sem pisca: B-roll vai até a troca de cena ou sobra ao menos 1,5 s de rosto. Sem buraco preto (2026-10-22).
- B-roll casa com o que é dito naquele instante. Só plano estável e bem composto; não repetir imagem.
- Drone: cortar a correção de ângulo e começar no trecho estável (2026-10-24).
- Tomada boa e curta: esticar no máximo até 75% de velocidade (2026-10-14).

### Transições e ritmo
- Corte seco é o padrão. Em apoios, transição em cerca de 1 a cada 3; nunca dissolve longo em reel (2026-09-30).
- Mudança brusca de ambiente: flare, leak ou fade curto (2026-10-14).
- Corte e transição caem na batida quando for possível, sem mover corte de fala.
- Versões do mesmo assunto não podem começar igual (2026-10-01).

### Legenda e texto
- Sem caixa, sem contorno, sombra 100, nunca em maiúsculas. Destaque da palavra na cor da marca (2026-10-07).
- Legenda nunca atravessa corte de câmera (2026-10-15) e fica longe das bordas (2026-10-18).
- Conferir nomes próprios com dicionário.
- Texto sobre imagem movimentada sempre com apoio: etiqueta ou película do tamanho do texto (2026-10-14, 2026-10-24).
- Uma frase por cena; lettering fora do meio. GC sobre o rosto da pessoa certa, e nome só se ela disser (2026-10-22).

### Som
- Entrega de -14 a -16 LUFS, pico até -1 dB. Medir: gravação quente pede voz abaixo de 0 dB (2026-11-01).
- Trilha perto de -21 dB na fala e -9 a -5 dB nos respiros. Uma música inteira por momento.
- Efeito sonoro só quando casa com o que se vê; nada em toda entrada de texto (2026-10-14).

### Técnica e entrega
- Taxa cravada: 24, 25, 30, 50, 60; celular vai para a inteira. Só câmera constante fica em 29,97 ou 59,94 (2026-10-08).
- Exportar sempre pela placa. Caiu no processador: achar o motivo e corrigir (2026-10-26).
- Não mover mídia já usada. Trecho errado: exportar só ele e emendar (2026-10-14).

### Respeito ao trabalho dele
- Ajuste manual é sagrado: versão nova parte da timeline dele, com cópia antes, nunca regerar (2026-10-09).
- Projeto aberto: mudar pelo app e salvar, não só no disco (2026-10-26).
- Um app só: nunca abrir outro KANIVETE; porta sem resposta não é app fechado. App de teste fecha ao terminar (2026-11-01).

**Exportação (regra do Pailer, 2026-11-06):** todo render vai para a pasta `04 - RENDERS` do card do projeto (nunca só para a pasta de teste) e, ao terminar, abrir essa pasta no Explorer (`explorer /select,arquivo`). `exportar_conferencia.py` já abre; passe a `04 - RENDERS` como pasta de saída.
