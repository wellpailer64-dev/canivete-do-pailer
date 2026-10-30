# Peça de cliente: do card à aprovação

Vale para arte e vídeo de cliente do Pandalab. Siga na ordem. Cliente com ficha: ler `Instructions/agente/clientes/<cliente>.md` no passo 2.

## Regras fixas do Pailer
- Trabalhar dentro da pasta do card, onde a demanda foi baixada. Nada de montar em `D:/kanivete_testes`.
- O programa fica visível do começo ao fim. Ele precisa ver o trabalho acontecendo.
- Fim do trabalho = salvar e deixar aberto para ele aprovar. Exportar, entregar e mudar o card só depois do ok.
- Carrossel termina com guia na divisa e uma fatia por página, à vista.

## Passos
1. **Baixar**: `py -3.13 D:/Kanivete/Plugins/pandalab/panda.py demanda <id8>` e `baixar <id8>`. Vai para a pasta certa do cliente. Ler `BRIEFING.txt`, `demanda.json` e os `02 - ASSETS`.
2. **Modelo**: procurar o preset na ficha do cliente; sem ficha, em `<cliente>/PRESSETS`. Ver também a peça igual mais recente nas pautas. Tem preset: usar, sem redesenhar.
3. **Instrução extra**: conferir se áudio ou vídeo do cliente fala DESTE card. Se falar de outra imagem ou peça, não usar.
4. **Abrir**: `py -3.13 tools/peca.py preset "<preset>" --pasta "<pasta do card>" --nome "NOME"`. Ela abre o app à vista, põe o Photo na frente e grava o `.iknv` na pasta. Vídeo: abrir o `.vknv`/preset no Vídeo do app dele, com `kanivete.py frente`.
5. **Montar**: trocar só o que é variável, nas camadas indicadas na ficha. Manter molduras, títulos e cores. Conferir cada troca com `KNV.png(0.5)`; prévias ficam fora da pasta do card.
6. **Dúvida que muda o conteúdo** (ponto de exame, texto médico, imagem trocada): montar o resto e perguntar uma vez, objetivo. Não chutar.
7. **Entregar para aprovação**: `py -3.13 tools/peca.py entregar --pasta "<pasta do card>" --nome "NOME"`. Só dizer "pronto" se `falhas` vier vazio. A resposta traz o caminho, o que foi feito e o que falta.
8. **Depois do ok**: `peca.py entregar ... --exportar` gera um PNG por fatia; em seguida `panda.py entregar <id> --sim`.

## Se travar
- Ferramenta sem resposta: uma tentativa com limite de tempo, depois outro caminho, e avisar.
- Cérebro é consulta, não etapa: sem resposta, seguir por este guia.
- `KNV.gerar` demora e, ao terminar, age sobre o documento: gerar primeiro e só então colocar outras imagens.
- Fazer só à mão o que `peca.py` não cobre; repetiu duas vezes, acrescentar à ferramenta e a este guia.
