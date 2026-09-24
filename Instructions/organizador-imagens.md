# Organizador de Imagens

## Visão Geral

Ferramenta automatizada para organizar, classificar e renomear imagens dentro de uma pasta. Utiliza processamento de imagens (PIL) para classificação básica e IA (CLIP) para renomeação contextual de imagens de alta qualidade.

## Arquivo Principal

`Functions/organizador_de_imagens.py`

## Pipeline de Organização

A interface oferece três modos:

- `Organização completa`: executa o pipeline original inteiro.
- `Identificar duplicadas`: apenas identifica grupos de imagens duplicadas e move as cópias para `duplicadas/`, mantendo a maior imagem de cada grupo no local original.
- `Identificar thumbs`: apenas identifica imagens pequenas/baixa resolução e move para `thumbs/`.

A ferramenta executa um pipeline de três etapas com acompanhamento de progresso:

1. **Limpeza Básica (0-70%)**: Classifica imagens em pastas específicas baseadas em heurísticas e tamanho.
2. **Checagem de Gráficos (75%)**: Move plantas técnicas/gráficos que foram classificados incorretamente para `imagens_em_alta`.
3. **Renomeação por Contexto IA (90-100%)**: Aplica renomeação contextual (usando CLIP) apenas nas imagens classificadas como `imagens_em_alta`.

## Categorias de Saída

As imagens são organizadas nas seguintes subpastas:

- `logos_e_icones/`: Logs e ícones
- `thumbs/`: Miniaturas
- `duplicadas/`: Imagens idênticas detectadas
- `graficos/`: Plantas técnicas e gráficos
- `imagens_em_alta/`: Imagens de alta resolução (foco da renomeação IA)
- `nao_processadas/`: Imagens que não puderam ser classificadas

## Funções Exportadas

### limpar_pasta(PASTA, callback_progresso=None, callback_log=None) -> dict

**Parâmetros:**
- `PASTA` (str): Caminho da pasta a organizar
- `callback_progresso` (func): Callback(percent, status)
- `callback_log` (func): Callback(mensagem)

**Retorno:**
- Dicionário com estatísticas de contagem de cada categoria.

## Integração com main.py

A função `organizador_imagens(folder_path)` no `main.py` orquestra o pipeline completo:

```python
def organizador_imagens(folder_path):
    # 1. Limpeza básica
    organizar_imagens(folder_path, callback_log=log)
    
    # 2. Mover gráficos escapados
    _mover_graficos_de_imagens_em_alta(folder_path, callback_log=log)
    
    # 3. Renomear por contexto CLIP
    _renomear_imagens_por_contexto(pasta_alta, callback_log=log)
```

## Chamada da Interface (JS)

```javascript
// Executa
window.pywebview.api.organizador_imagens(folderPath);

// Callback de progresso
function updateOrganizadorImagensProgress(data) {
    // Atualiza barra de progresso (percent)
    // Atualiza logs (log)
    // Mostra conclusão (complete)
}
```

## Dependências

- `PIL` (Pillow - pip install)
- `shutil` (padrão)
- Modelo CLIP (para renomeação contextual)

## Logs Minimalistas

| Mensagem | Significado |
|----------|------------|
| "Iniciando organização..." | Pipeline iniciado |
| "Checando gráficos..." | Etapa de pós-classificação |
| "Renomeando imagens por contexto..." | Etapa IA (CLIP) |
| "Concluído" | Pipeline finalizado |

## Erros Comuns

### "Erro ao mover"
- Causa: Permissão de arquivo ou arquivo em uso
- Solução: Verificar permissões e garantir que nenhuma imagem está aberta

### "Erro ao classificar"
- Causa: Imagem corrompida
- Solução: Remover arquivo manualmente
