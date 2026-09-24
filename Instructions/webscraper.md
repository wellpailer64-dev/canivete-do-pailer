# Web Scraper

## Visão Geral

Módulo para análise e extração de conteúdo de páginas web. Extrai título, imagens, vídeos e texto completo da página.

## Arquivo Principal

`Functions/webscraper.py`

## Funções Exportadas

### analisar_pagina(url: str) -> dict

**Parâmetros:**
- `url` (str): URL da página para analisar. Aceita com ou sem `https://`

**Retorno:**
```python
{
    "url": str,           # URL normalizada
    "titulo": str,       # Título da página (<title>)
    "imagens": list,     # Lista de URLs de imagens encontradas
    "qtd_imagens": int, # Quantidade de imagens
    "videos": list,      # Lista de URLs de vídeos encontrados
    "qtd_videos": int,  # Quantidade de vídeos
    "texto": str         # Texto completo da página (limpo)
}
```

**Fluxo de Execução:**

1. **Normalização da URL**
   - Adiciona `https://` se não presente
   - Valida que é URL HTTP/HTTPS

2. **Download do HTML**
   - Baixa bytes da página com User-Agent válido
   - Decodifica como UTF-8

3. **Parsing com HTMLParser**
   - Classe `_PageParser` estende `html.parser.HTMLParser`
   - Extrai título, imagens, vídeos, stylesheets e texto
   - Ignora conteúdo em `<script>`, `<style>`, `<noscript>`

4. **Extração de Imagens**
   - Parser: `<img>`, `<source>`, `<meta og:image>`, `<link icon>`
   - Data attributes: `data-src`, `data-lazy-src`, `data-image`, etc.
   - Srcset: parsing de atributos srcset
   - CSS externos: baixa e parseia stylesheets para URLs
   - Fallback regex: busca URLs no HTML bruto

5. **Filtragem de Imagens**
   - Usa `_parece_url_imagem()` para validar
   - Remove duplicatas
   - Normaliza URLs relativas para absolutas

6. **Extração de Vídeos**
   - YouTube, YouTube (youtu.be), Vimeo
   - Em tags `<a>` e `<iframe>`

## Funções Auxiliares (Privadas)

### _normalizar_url(url) -> str
Adiciona `https://` se necessário.

### _normalizar_imagem_url(base_url, src) -> str
Converte URL relativa em absoluta usando urllib.parse.urljoin.

### _parece_url_imagem(url) -> bool
Valida se URL parece ser de imagem (termina com extensão de imagem ou contém "/image").

### _split_srcset(srcset) -> list
Parseia atributo srcset separando URLs.

### _extract_urls_from_css(texto) -> list
Busca URLs em texto CSS (url(...)).

### _baixar_bytes(url, timeout) -> bytes
Baixa URL com User-Agent customizado.

## Classe _PageParser

Analisador HTMLCustomizado que extende `html.parser.HTMLParser`.

**Atributos:**
- `title` (str): Título da página
- `images` (list): URLs de imagens encontradas
- `stylesheets` (list): URLs de CSS externos
- `videos` (list): URLs de vídeos encontrados
- `full_text` (property): Texto completo tratado

**Tags processadas:**
- `<title>`: texto do título
- `<img>`: src, data-src, data-original, data-lazy-src, srcset, data-srcset
- `<source>`: src, srcset
- `<meta>`: og:image, twitter:image
- `<link>`: favicon, apple-touch-icon, stylesheet
- `<a>`: links que parecem imagem ou vídeo
- `<iframe>`: vídeos embedados

**Texte extraído:**
- Ignora conteúdo de script/style/noscript
- Unescape de entidades HTML
- Remove linhas duplicadas (3+ quebras -> 2)

## Dependências

- `os`, `re`, `json`, `zipfile`, `urllib.parse`, `urllib.request`
- `html.unescape`, `html.parser.HTMLParser`
- Biblioteca padrão Python (nenhum pip install)

## Integração com main.py

Em `main.py`, a função `web_scraper_analyze(url)` chama `analisar_pagina()` e retorna:
```python
{
    "success": True,
    "titulo": resultado.get("titulo", "Sem título"),
    "qtd_imagens": int(resultado.get("qtd_imagens", 0) or 0),
    "qtd_videos": int(resultado.get("qtd_videos", 0) or 0),
}
```

E `web_scraper_download(url, mode, destino)` faz o pipeline completo:
1. Analisar página
2. Baixar imagens como ZIP
3. Extrair ZIP
4. Converter para WebP (paralelo 5x)
5. Organizar por categoria (organizador_de_imagens)
6. Renomear por contexto CLIP (paralelo 5x)
7. Gerar relatório

## Uso em CSV com Cérebro

A função `web_scraper_csv(url)` em main.py:
1. Carrega cérebro .md de `cerebros_md/` (preferência: cérebro ativo)
2. Chama `analisar_pagina(url)` para extrair título, texto e mídias
3. Nomeia o CSV baseado no título do imóvel
4. Chama `gerar_csv_com_cerebro()` com progresso (10% → 30% → 50% → 70% → 100%)
5. Gera CSV com base nas regras do cérebro (separador `;`)

### Cérebro .md

- **Pasta**: `cerebros_md/` na raiz do projeto
- **Ativo**: salvo em arquivo `.active` dentro de `cerebros_md/`
- **Nome**: mantém o nome original do arquivo carregado
- **Múltiplos cerebros**: suporta vários cérebros, o último carregado é o ativo

### Pipeline Web Scraper Completo

`web_scraper_download(url, mode, destino)` executa:
1. Analisar página → extrair título, imagens, vídeos, texto
2. Baixar imagens como ZIP
3. Extrair arquivos do ZIP
4. Converter para WebP (paralelo 5x com ThreadPoolExecutor)
5. Organizar por categoria (logos, thumbs, duplicadas, gráficos, alta)
6. Renomear por contexto CLIP (paralelo 5x)
7. Gerar relatório e aprendizado

### Pipeline CSV com Cérebro

`web_scraper_csv(url)` executa:
1. Carregar cérebro .md ativo (ou mais recente)
2. Analisar página → extrair título e texto
3. Nomear CSV com título do imóvel
4. Enviar texto + regras do cérebro para FLAN-T5
5. Processar saída JSON e gerar CSV com colunas do .md