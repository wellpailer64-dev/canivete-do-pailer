# Arquiteto Local B

Opcao local para quando o Claude estiver indisponivel. Nao substitui o Claude: ele continua sendo o arquiteto principal.
Este fluxo serve para rascunhos, testes, flyers/carrosseis simples e contratos de ajustes no Photo Kanivete.

## Modelo escolhido

`tools/worker/arquiteto.py` usa Ollama. Por padrao, usa o perfil `equilibrado`, porque o `qwen3:14b` cheio pode ficar
lento demais para uso interativo.

Perfis:

- `--perfil rapido`: `qwen3:8b`, depois `gemma4:e4b`.
- `--perfil equilibrado`: `hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS`, depois `gemma4:e4b`, depois `qwen3:8b`.
- `--perfil forte`: `qwen3:14b`, depois o 14B quantizado, depois reservas.

Ordem completa dos modelos conhecidos:

1. `qwen3:14b`
2. `hf.co/unsloth/Qwen3-14B-GGUF:IQ3_XXS`
3. `gemma4:e4b`
4. `qwen3:8b`

O Worker executor continua usando `qwen3:8b` com reserva `gemma4:e4b`, como antes.

O modo `think` dos Qwen/Gemma fica desligado por padrao para nao travar o terminal por minutos. Para qualidade maior e
mais demora, use `--pensar`.

## Abrir o app de teste

Use uma instancia separada do Canivete em modo agente:

```powershell
$env:APPDATA="D:\kanivete_testes\appdata"
$env:LOCALAPPDATA="D:\kanivete_testes\localappdata"
$env:TEMP="D:\kanivete_testes\tmp"
$env:TMP="D:\kanivete_testes\tmp"
py -3.13 main.py --agente=9333
```

## Conversar pelo terminal

```powershell
py -3.13 tools\worker\arquiteto.py chat
```

Dentro do chat:

```text
/cena carrossel de 3 slides sobre venda de imoveis, visual moderno, CTA no final
/contrato deixe o titulo maior, subtitulo branco e exporte tudo
```

Por seguranca, o arquiteto local so planeja e salva arquivos. Para executar no app, use `--executar`.

A saida padrao do terminal mostra etapas, porcentagem aproximada, modelo ativo no Ollama, arquivos salvos e avisos do
Canivete em tempo real. Se precisar da linha JSON crua para algum script, acrescente `--json`.

## Interface com botoes

Na raiz do projeto, abra:

```text
Arquiteto Local.bat
```

Ele sobe um painel em `http://127.0.0.1:8765` (ou proxima porta livre) com:

- chat/pedido;
- perfil/modelo;
- tarefa `cena` ou `contrato`;
- formato e numero de slides;
- upload de print de referencia;
- campos para pasta de materiais, documento `.iknv` e pasta de exportacao;
- progresso/log em tempo real;
- botao para preparar briefing para Claude.

O upload de referencia copia a imagem para `D:\kanivete_testes\arquiteto_local\uploads` e passa o caminho para o
arquiteto. Pasta de materiais ainda e por caminho digitado/colado.

## Criar flyer ou carrossel

Gera HTML/CSS para `KNV.cena` em `D:\kanivete_testes\arquiteto_local`:

```powershell
py -3.13 tools\worker\arquiteto.py cena "flyer de festa neon com titulo PRIME FEST, data 12/10 e botao GARANTA SEU INGRESSO" --formato feed
```

Mais rapido:

```powershell
py -3.13 tools\worker\arquiteto.py cena "flyer de pizzaria..." --perfil rapido --formato feed --executar
```

Mais forte, mas lento:

```powershell
py -3.13 tools\worker\arquiteto.py cena "carrossel de 3 slides..." --perfil forte --formato retrato --slides 3 --executar
```

Gerar e executar no Photo Kanivete:

```powershell
py -3.13 tools\worker\arquiteto.py cena "carrossel de 3 slides sobre erros no Instagram" --formato retrato --slides 3 --exportar D:\kanivete_testes\arquiteto_local\export --executar
```

Isso cria o `.html`, monta a peca pelo `tools/knv.py`, salva `.iknv`, roda o revisor e exporta se `--exportar` for passado.

## Ajustar um documento existente

Para um `.iknv` aberto/alteravel:

```powershell
py -3.13 tools\worker\arquiteto.py contrato "troque o titulo para PROMOCAO DE VERAO, deixe amarelo #ffd400 e exporte tudo" --documento D:\pecas\post.iknv --exportar D:\pecas\export
```

Executar o contrato gerado:

```powershell
py -3.13 tools\worker\arquiteto.py contrato "finalize a peca com preset social_limpo e exporte tudo" --documento D:\pecas\post.iknv --exportar D:\pecas\export --executar
```

## Quando usar

- Bom para rascunhar flyer/carrossel simples.
- Bom para ajustes claros em camadas existentes.
- Bom para gerar contratos pequenos para o Worker.
- Nao e ideal para direcao de arte fina, narrativa de video, gosto subjetivo ou entrega final sem revisao humana.

## Cuidados

- O padrao nao executa nada: sem `--executar`, ele so salva arquivos.
- Use sempre a instancia de teste em `--agente=9333`.
- Confira exportados em tamanho real.
- Se o resultado ficar estranho, trate como rascunho local, nao como decisao final do Claude.
