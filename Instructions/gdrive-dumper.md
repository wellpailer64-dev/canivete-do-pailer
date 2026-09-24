# GDrive Dumper — Documentação de Correções

## Contexto
O módulo GDrive Dumper do Canivete do Pailer usa o `rclone` para baixar pastas do Google Drive. Durante o desenvolvimento, o download não iniciava e a verificação retornava `directory not found` mesmo com links válidos. Abaixo estão todas as correções aplicadas para resolver o problema.

---

## Correção 1 — Sintaxe correta do remote_args (`main.py`)

**Problema:** O `remote_args` estava sendo montado como `gdrive:{folder_id}`, o que faz o rclone interpretar o ID como um *nome de pasta*, não como um ID real.

**Onde:** `main.py` — funções `gdrive_analyze` e `gdrive_dump`

**Depois (Sintaxe Correta):**
```python
remote_args = ["--drive-root-folder-id", folder_id, "gdrive:"]
```

**Por quê:** A flag `--drive-root-folder-id` é a forma canônica do rclone para acessar uma pasta pelo seu ID.

---

## Correção 2 — Fallback para pastas compartilhadas (`gdrive_dumper.py`)

**Problema:** Pastas em "Compartilhado comigo" não são acessíveis pelo rclone sem a flag `--drive-shared-with-me`.

**Onde:** `gdrive_dumper.py` — função `calcular_tamanho_pasta`

**Lógica implementada:**
1. Primeira tentativa: sem a flag → cobre pastas do "Meu Drive" pessoal.
2. Se o rclone retornar erro de "não encontrado" → retenta com `--drive-shared-with-me` → cobre "Compartilhado comigo".

**Detecção de erro:**
```python
_not_found_hints = ("notfound", "404", "not found", "directory not found", "couldn't find")
if not use_shared and any(h in erro_txt.lower() for h in _not_found_hints):
    # Fallback automático
```

---

## Correção 3 — Removida flag `--log-file` do stdout (`gdrive_dumper.py`)

**Problema:** As flags `--log-file` e `--log-level` redirecionavam *todo* o output para um arquivo em disco, impedindo que o Python capturasse o progresso em tempo real pelo stdout.

**Correção:** Removidas as flags do `cmd` para permitir que o `subprocess.Popen` capture a saída real.

---

## Correção 4 — Loop de leitura com timeout e controle (`gdrive_dumper.py`)

**Problema:** O loop `for line in iter(proc.stdout.readline, ""):` congelava se o rclone ficasse sem output.

**Correção:** Implementado o gerador `_readline_with_timeout` que verifica stall, pause e cancelamento em tempo real, permitindo logs estáveis e controle do processo.

---

## Versão 1.1 — Motor reescrito (`gdrive_dumper.py`)

- **Stats em JSON:** o rclone roda com `--use-json-log --stats=1s --stats-log-level=NOTICE`. Cada linha traz um objeto `stats` (bytes, totalBytes, speed, eta, transfers, checks, errors, lista `transferring`). Nada de regex em texto de terminal.
- **Leitura por linha** (antes era caractere a caractere — alto uso de CPU).
- **Travamento detectado por progresso:** se bytes/arquivos/checagens não mudam por 180s, o rclone é reiniciado (antes nunca disparava, pois os stats sempre geravam output).
- **Pausa real:** Pausar mata o rclone e a thread espera; Retomar relança sem gastar tentativa. Arquivos concluídos são pulados; o arquivo que estava pela metade recomeça (limitação do Drive).
- **Erros fatais não repetem 10x:** cota excedida, arquivo abusivo, disco cheio, token expirado → mensagem clara e para.
- **Link de arquivo único** (`/file/d/ID`) → `rclone backend copyid`.
- **Perfis de conexão:** Rápida (padrão, 8 paralelos) / Normal (4) / Lenta (2, timeout maior). Processo do rclone com prioridade acima do normal.
- **Trace de depuração** vai para `logs/gdrive_debug_trace.txt` (antes sujava a pasta de destino) e guarda só as últimas 3000 linhas.
- **UI:** erros da verificação aparecem na tela, botão Pausar/Retomar, lista dos arquivos em transferência com % individual, tempo decorrido, arquivos já existentes e erros.

---

## Fluxo completo de um download bem-sucedido

1. Usuário cola link → `parse_link()` identifica pasta/arquivo e extrai o ID.
2. `remote_args` montado com `--drive-root-folder-id`.
3. `calcular_tamanho_pasta()` tenta sem flag → fallback automático se necessário.
4. `dump_pasta()` executa com loop de leitura monitorado → callback_progresso() atualiza a interface.
5. Download concluído → pasta de destino aberta automaticamente.
