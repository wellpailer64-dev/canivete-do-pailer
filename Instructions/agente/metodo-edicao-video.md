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

## Regras
### Corte de fala
- Corte no fim de frase ou de movimento, no contexto do que é dito (2026-10-14).
- Nunca comer palavra. O fim do corte vem do vale da voz, não do tempo da transcrição (2026-11-01).
- Tirar repetição, hesitação e "dando sequência" sem mudar o sentido.
- Pausa: corta acima de 0,30 s depois de pontuação e 0,60 s no meio da frase.

### Zoom e camadas
- Zoom dinâmico só em camada de ajuste, nunca escala animada no clipe (2026-11-01).
- Cor em outra camada de ajuste, abaixo de logo, tarjas e legendas (2026-11-01).
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
