# Remover Fundo

## Visão Geral

Módulo para remover o fundo de imagens usando IA (U2Net via ONNX). Gera imagens PNG com fundo transparente.

## Arquivo Principal

`Functions/removerfundo.py`

## Formatos Suportados

- `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tiff`, `.tif`

## Modelo

- **Nome**: `u2net.onnx`
- **Tamanho**: ~50MB
- **Local**: `modelos_ia/u2net/u2net.onnx`
- **Tecnologia**: U2Net (Universal U-Net for Portrait Segmentation)

## Estrutura de Diretórios

```
projeto/
├── Functions/
│   └── removerfundo.py
├── modelos_ia/
│   └── u2net/
│       └── u2net.onnx    # Modelo de remoção de fundo
└── [pasta_origem]/
    └── sem_fundo/        # Saída das imagens sem fundo
```

## Funções Exportadas

### remover_fundo_arquivo(path, pasta_saida, callback_log=None) -> bool

Remove o fundo de um único arquivo.

**Parâmetros:**
- `path` (str): Caminho da imagem
- `pasta_saida` (str): Pasta para salvar resultado
- `callback_log` (func): Callback(mensagem)

**Retorno:**
- `True` se sucesso, `False` se falha

### remover_fundo_pasta(pasta, callback_progresso=None, callback_log=None) -> dict

Remove fundo de todas as imagens em uma pasta.

**Parâmetros:**
- `pasta` (str): Pasta com imagens
- `callback_progresso` (func): Callback(percent, status)
- `callback_log` (func): Callback(mensagem)

**Retorno:**
```python
{
    "total": int,        # Total de imagens encontradas
    "processados": int, # Imagens processadas com sucesso
    "falhas": int       # Falhas na remoção
}
```

## Pipeline de Remoção

1. **Validação**
   - Verifica se imagem existe
   - Verifica se formato é suportado
   - Verifica se modelo existe em `modelos_ia/u2net/`

2. **Processamento**
   - Converte imagem para RGB (320x320)
   - Normaliza pixels (mean, std)
   - Inferência ONNX (U2Net)
   - Extrai máscara de foreground
   - Redimensiona máscara para tamanho original
   - Aplica como canal alpha (transparência)

3. **Resultado**
   - Salva PNG com fundo transparente em `sem_fundo/`
   - Nome: `[original]_sem_fundo.png`
   - **Fluxo de UI:** Ao finalizar, o `main.py` executa `os.startfile(pasta_saida)`, abrindo automaticamente o Windows Explorer na pasta com os resultados.

## Logs e Mensagens de Status

| Mensagem | Significado |
|----------|------------|
| "Ignorado: [nome]" | Formato não suportado |
| "Modelo não encontrado!" | Modelo u2net.onnx faltando |
| "Pronto: [nome]_sem_fundo.png" | Sucesso |
| "Erro: [nome]" | Falha no processamento |

## Integração com main.py

```python
from Functions.removerfundo import remover_fundo_arquivo, remover_fundo_pasta

# Arquivo único
resultado = remover_fundo_arquivo(
    path="/caminho/imagem.jpg",
    pasta_saida="/pasta/sem_fundo",
    callback_log=print
)

# Pasta
resultado = remover_fundo_pasta(
    pasta="/pasta/imagens",
    callback_progresso=print,
    callback_log=print
)
```

## Chamada da Interface (JS)

```javascript
// Seleciona
selectFile('remover-fundo');
// ou
selectFolder('remover-fundo');

// Executa (detecta tipo automaticamente)
const type = selectedTypes['remover-fundo'];

if (type === 'file') {
    window.pywebview.api.remover_fundo_file(path);
} else {
    window.pywebview.api.remover_fundo(path);
}
```

## Erros Comuns

### "Modelo não encontrado!"
- Causa: Modelo `u2net.onnx` não existe em `modelos_ia/u2net/`
- Solução: Baixar modelo de https://github.com/xuanchen91/u2net ONNX

### "Ignorado: [nome]"
- Causa: Extensão do arquivo não está na lista de suportados
- Solução: Converter para PNG, JPG, WebP ou BMP

### Imagem com fundo parcial
- Causa: Fundo complexo ou sem contraste suficiente
- Solução: Usar fundo branco ou padrão para melhor resultado

## Dependências

- `onnxruntime` (pip install)
- `numpy` (pip install)
- `Pillow` (pip install)
- Modelo: `u2net.onnx`