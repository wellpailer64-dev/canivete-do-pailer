# Cérebro Local

## Visão Geral

Módulo de IA local que usa o modelo FLAN-T5-Base para processar texto das páginas web e gerar CSV estruturado com base em regras definidas em um arquivo .md (cérebro).

## Arquivo Principal

`Functions/cerebro_local.py`

## Estrutura de Diretórios

```
projeto/
├── modelos_ia/
│   └── cerebro/
│       └── flan_t5_base/     # Modelo IA (~1GB)
├── cerebros_md/
│   ├── .active              # Arquivo que indica cérebro ativo
│   └── cerebro_regras.md     # Arquivo(s) .md carregado(s)
└── scraper_output/
    └── *.csv               # CSVs gerados
```

## Modelo IA

- **ID**: `google/flan-t5-base`
- **Tamanho**: ~1GB
- **Local**: `modelos_ia/cerebro/flan_t5_base/`
- **Carregamento**: com `local_files_only=True`

## Funções Exportadas

### carregar_cerebro_md() -> str

Carrega o conteúdo do cérebro ativo (ou mais recente).

```python
content = carregar_cerebro_md()  # Retorna string do .md
```

### salvar_cerebro_md(origem_path: str) -> str

Salva .md selecionado na pasta `cerebros_md/` e define como ativo.

```python
destino = salvar_cerebro_md("/caminho/regras_imoveis.md")
# → Copia para cerebros_md/regras_imoveis.md
# → Define como ativo em .active
```

### get_cerebro_md_path() -> str

Retorna o caminho do cérebro ativo (ou mais recente na pasta).

### set_active_cerebro(cerebro_path)

Define qual cérebro está ativo.

### gerar_csv_com_cerebro(titulo, url, texto_pagina, destino_csv, cerebro_md, callback_log) -> str

Gera CSV usando IA local + regras do cérebro.

**Parâmetros:**
- `titulo` (str): Título da página
- `url` (str): URL da página
- `texto_pagina` (str): Texto extraído da página
- `destino_csv` (str): Caminho para salvar CSV
- `cerebro_md` (str): Regras do cérebro (.md)
- `callback_log` (func): Callback para logs/progresso

**Retorno:**
- Caminho do CSV gerado

**Fluxo:**
1. Pré-processa texto (remove duplicatas, linhas irrelevantes)
2. Extrai cabeçalho do .md (campos separados por `;`)
3. Envia prompt para FLAN-T5 com regras + texto
4. Parseia resposta JSON
5. Aplica heurísticas locais para campos faltantes
6. Gera CSV com colunas do cabeçalho

## Formato do Cérebro .md

O arquivo .md deve conter:

1. **Cabeçalho** (primeira linha com campos separados por `;`):
```
title;subtitle;category;phase;sizes;dorms_info;vagas_info;project_highlight;address_street;address_neighborhood;about_text;features;seo_description;video_url
```

2. **Regras** (instruções para a IA):
```
# Regras para imóveis

Para cada campo, extraia:
- title: Nome do empreendimento
- subtitle: Tipologia (dorms, vagas, m²)
- category: Tipo (Residencial, Comercial)
- phase: Fase da obra (Lançamento, Obras Avançadas, Entregue)
- sizes: Área(s) em m²
- dorms_info: Informação de quartos
- vagas_info: Informação de vagas
- project_highlight: Estilo/ diferenciais
- address_street: Rua do endereço
- address_neighborhood: Bairro
- about_text: Descrição completa
- features: Lista de amenities separados por vírgula
- seo_description: Meta description
- video_url: URL do vídeo (YouTube/Vimeo)
```

## Pre-processamento de Texto

`_preprocessar_texto_para_ia(texto_bruto)`:
1. Remove linhas duplicadas
2. Remove menus de navegação
3. Remove informações de rodapé
4. Reduz 996 linhas → 447 únicas → 120 relevantes (típico)

## Heurísticas Locais

Se a IA não preencher algum campo, usa heurísticas locais:
- Extrai metragem de `(\d+)m²`
- Extrai quartos de `(\d+)[\s-]*dorm`
- Extrai vagas de `(\d+)[\s-]*vaga`
- Detecta fase por palavras-chave

## Integração com main.py

```python
from Functions.cerebro_local import (
    carregar_cerebro_md,
    get_cerebro_md_path,
    gerar_csv_com_cerebro
)

# 1. Carrega cérebro ativo
cerebro_path = get_cerebro_md_path()
with open(cerebro_path, "r") as f:
    cerebro_md = f.read()

# 2. Analisa página
from Functions.webscraper import analisar_pagina
resultado = analyser_pagina(url)

# 3. Gera CSV
csv_path = gerar_csv_com_cerebro(
    titulo=resultado["titulo"],
    url=resultado["url"],
    texto_pagina=resultado["texto"],
    destino_csv="output/imovel.csv",
    cerebro_md=cerebro_md,
    callback_log=emit
)
```

## Dependências

- `transformers` (pip install)
- `torch` (pip install)
- Modelo: `google/flan-t5-base`

## Erros Comuns

### "Modelo Cérebro inválido/incompleto"
- Causa: Modelo não encontrado ou corrompido
- Solução: Baixar modelo novamente

### "Cérebro vazio"
- Causa: Nenhum .md carregado
- Solução: Carregar arquivo .md primeiro

### "Tensor.item() cannot be called on meta tensors"
- **Causa**: O modelo tentou usar "meta tensors" (memória virtual) em um ambiente CPU, o que impede a extração de valores.
- **Solução**: No carregamento do modelo (`from_pretrained`), garantir `device_map=None` e `low_cpu_mem_usage=False`. Na geração, usar sempre `with torch.no_grad()`.

### CSV com campos vazios
- Causa: Texto da página não contém informação
- Solução: Revisar página ou ajustar .md