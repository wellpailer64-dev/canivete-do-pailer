# Transcrever Áudio

## Visão Geral

Módulo para transcrever áudio para texto usando o modelo Whisper (OpenAI). Suporta arquivo único ou pasta com múltiplos áudios.

## Arquivo Principal

`Functions/transcreveraudio.py`

## Formatos Suportados

- `.ogg`, `.opus`, `.mp3`, `.wav`, `.m4a`, `.mp4`, `.webm`, `.flac`

## Modelos Whisper

| Modelo | Velocidade | Precisão | Uso的建议 |
|--------|-----------|---------|----------|
| `small` (Rápido) | ⚡ Rápido | ★★★ Boa | Uso geral |
| `medium` (Preciso) | ⚡⚡ Médio | ★★★★ Muito boa | Textos importantes |

**Modelos disponíveis:** `small.pt`, `medium.pt` em `whisper/`

## Estrutura de Diretórios

```
projeto/
├── Functions/
│   └── transcreveraudio.py
├── whisper/
│   ├── small.pt     # Modelo small (~75MB)
│   └── medium.pt   # Modelo medium (~150MB)
├── ffmpeg.exe     #ffmpeg para conversão
└── transcricoes/  # Arquivos .txt gerados
```

## Funções Exportadas

### transcrever_arquivo(audio_path, modelo_key, callback_progresso, callback_log) -> dict

Transcreve um único arquivo de áudio.

**Parâmetros:**
- `audio_path` (str): Caminho do arquivo de áudio
- `modelo_key` (str): "Rápido (small)" ou "Preciso (medium)"
- `callback_progresso` (func): Callback(percent, status)
- `callback_log` (func): Callback(mensagem)

**Retorno:**
```python
{
    "total": int,        # Total de áudios processados
    "transcritos": int,  # Áudios transcritos com sucesso
    "falhas": int,      # Falhas na transcrição
    "arquivo_txt": str  # Caminho do arquivo .txt gerado
}
```

### transcrever_pasta(pasta, modelo_key, callback_progresso, callback_log) -> dict

Varre uma pasta e transcreve todos os áudios suportados.

### transcrever_audios(lista_paths, modelo_key, callback_progresso, callback_log) -> dict

Transcreve lista de arquivos de áudio.

## Pipeline de Transcrição

1. **Validação**
   - Verifica se arquivo existe
   - Verifica formato suportado

2. **Configuração**
   - Carrega ffmpeg do diretório local
   - Carrega modelo Whisper de `modelos_ia/whisper/`

3. **Transcrição (Real-time Progress)**
   - O Whisper processa arquivos de forma síncrona. Para evitar que a barra de progresso fique parada, o app usa uma **Thread de Progresso Incremental**.
   - Enquanto o Whisper trabalha, o progresso sobe de 5% em 5% a cada 2 segundos até o fim do processamento do arquivo atual.

4. **Resultado**
   - Salva arquivo .txt em `transcricoes/` dentro da pasta de origem.
   - Uma linha por áudio com texto completo.

## Integração com main.py

```python
from Functions.transcreveraudio import transcrever_arquivo, transcrever_pasta

# Arquivo único
resultado = transcrever_arquivo(
    audio_path="/caminho/audio.mp3",
    modelo_key="Rápido (small)",
    callback_log=print
)

# Pasta
resultado = transcrever_pasta(
    pasta="/caminho/pasta_audio",
    modelo_key="Preciso (medium)",
    callback_log=print
)
```

## Chamada da Interface (JS)

```javascript
// Seleciona arquivo
selectFile('transcrever-audio');

// Executa (detecta tipo automaticamente)
const type = selectedTypes['transcrever-audio'];
const model = document.querySelector('input[name="whisper-model"]:checked').value;

if (type === 'file') {
    window.pywebview.api.transcrever_audio_file(path, model, 'pt');
} else {
    window.pywebview.api.transcrever_audio(path, model, 'pt');
}
```

## Erros Comuns

### "Nenhum áudio encontrado na pasta"
- Causa: Pasta sem arquivos de áudio suportados
- Solução: Verificar formatos (ogg, mp3, wav, m4a, etc)

### "Formato não suportado: .xyz"
- Causa: Extensão não está na lista de suportados
- Solução: Converter para formato suportado

### Erro ao carregar modelo
- Causa: Modelo não encontrado em `whisper/`
- Solução: Baixar modelo (small.pt ou medium.pt)

## Configuração de Idiomas

O parâmetro `language` aceita:
- `"pt"` - Português
- `"en"` - Inglês
- `"es"` - Espanhol
- `null` - Automático

Recomenda-se usar `"pt"` para áudios em português brasileiro.