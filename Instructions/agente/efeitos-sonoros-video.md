# Efeitos sonoros do Vídeo Kanivete — referência rápida

Comece pelo Soundboard instalado e pelo som direto da cena. Efeito deve acompanhar um movimento ou acontecimento perceptível e respeitar o estilo do cliente; silêncio também é escolha. Não inserir som em toda entrada de texto. Ouça o candidato junto com a imagem e a voz antes de decidir. Regras gerais: `metodo-edicao-video.md`; dados e comandos: `guia-edicao.md` › EFEITOS SONOROS.

## O que usar e quando

| Acontecimento | Família no Soundboard | Escolha e sincronização |
|---|---|---|
| Imagem atravessa o quadro ou transição com deslocamento | Whoosh e Transição (`whoosh`) | Combinar velocidade, direção percebida e energia ao movimento. Ouvir e alinhar o ponto de maior energia ao gesto/corte; não presumir que o pico está no meio. |
| Botão, seleção, cursor ou confirmação visual | UI Digital (`ui`), Pop e Clique (`pop`), Notificação e Interface (`notificacao`) | Clique curto e discreto na ação visível. Confirmação só quando há confirmação; não usar alerta de erro para algo positivo. |
| Objeto toca, encaixa ou aterrissa | Objetos e Foley (`objetos`) ou Impacto e Luta (`impacto`) | Escolher material e peso compatíveis; procurar o ataque real e alinhá-lo ao contato. Muitos sons de luta/ossos são inadequados para elementos gráficos comuns. |
| Ênfase realmente forte ou virada dramática | Sub Drop e Grave (`subdrop`), Digital e Glitch (`digital`) | Escolher impacto proporcional ao contexto, sem mascarar voz; subgrave pode desaparecer em celular. Não usar explosão para texto comum. |
| Tela digital falha ou imagem quebra | Digital e Glitch (`digital`) | Sincronizar com a falha visual, não aplicar automaticamente a todo movimento tecnológico. |
| Papel, câmera, digitação ou ação física | Objetos e Foley (`objetos`), Trabalho e Escritório (`trabalho`) | Casar o som com a ação específica e sua duração; preferir som direto limpo quando servir. |
| Humor, reação ou efeito de gênero | Memes e Comédia (`memes`), Gritos (`gritos`) | Usar apenas se combinar com o pedido, a piada e a identidade; evitar vocalizações e efeitos caricatos em trabalho sóbrio. |
| Suspense ou ambiência | Tensão e Suspense (`tensao`), Ambiência (`ambiencia`) | Sustentar atmosfera quando houver intenção narrativa; confira entrada, saída e se a textura não briga com a trilha. |
| Valor monetário ou sino visível/pertinente | Dinheiro (`dinheiro`), Sinos (`sinos`) | Som literal ou estilizado apenas quando fizer sentido; não associar automaticamente toda cifra a caixa registradora. |

Categorias são pontos de partida, não garantia de que cada arquivo sirva. Escolha uma família coerente com a peça, dê espaço entre efeitos, priorize inteligibilidade e ouça em volume realista. Evite aplicar o mesmo som a todos os cortes ou dobrar impactos. A duração, o pico e o nível variam: inspecionar a forma de onda e ajustar o ganho no contexto, sem confiar em valores fixos.

## Localizar e inserir

No painel Soundboard, passe o mouse ou clique para ouvir; clique seleciona; arraste o cartão para o projeto/timeline. `Shift+1` pode colocar o som nas bordas de clipes visuais selecionados; sem clipes visuais selecionados, insere na agulha. Verifique seleção antes: não use aplicação em lote sem intenção.

Para agente, com o pack carregado: `VESB.dados.categorias` tem categorias, nomes, duração e caminho; os índices formam a chave `"ci:si"`. Identifique o som pelo nome e escute: índices podem mudar entre versões. Com timeline identificada e posição conferida: `VE.playhead = t; await veSbInserir(k)`; a função usa trilha de áudio livre e importa o som ao bin Soundboard. Confira inserção, tempo e ganho. Não conectar à porta do app do usuário se as regras da sessão proibirem.

## Fontes e amostras extras

- O catálogo instalado é a primeira busca; os nomes e categorias aqui foram conferidos no catálogo local. A existência no catálogo não comprova que o som combine com a peça.
- Biblioteca local adicional: `D:/kanivete_biblioteca/sons/kenney_interface/kenney-interface-sounds-master/addons/kenney_interface_sounds/` contém 100 arquivos de interface e `LICENSE.txt`; licença CC0, origem [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds), cópia obtida do [espelho](https://github.com/Calinou/kenney-interface-sounds). Aguardam escuta e seleção; não estão instalados no Soundboard.
- `D:/kanivete_biblioteca/sons/kenney_impact/` já contém o pacote [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), CC0. Conferir conteúdo e adequação antes de usar.
- Para novos sons, registrar origem e licença do arquivo específico. Ser gratuito para um vídeo não implica permissão de redistribuir o arquivo dentro do aplicativo. Não substituir o pack instalado manualmente: uma atualização pode sobrescrever a pasta.
