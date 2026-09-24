# Guia de Desenvolvimento: Fluxo de Comunicação e Edição

Este guia define a arquitetura de comunicação do **Canivete do Pailer** e estabelece o protocolo para adicionar ou modificar funcionalidades sem quebrar a integração entre as camadas.

---

## 1. Arquitetura em Camadas

O aplicativo opera em 4 camadas conectadas:

1.  **UI (HTML/CSS):** Define a estrutura e aparência. Localizada em `frontend/index.html` e `frontend/css/`.
2.  **Controller (JavaScript):** Gerencia eventos da interface e chama o Python. Localizada em `frontend/js/app.js`.
3.  **Bridge (Main Python):** O arquivo `main.py` (PyWebView API). Recebe chamadas do JS, gerencia threads e envia respostas/progresso de volta para o JS.
4.  **Core (Functions):** Os módulos em `Functions/*.py` que executam o trabalho pesado (processamento de imagem, download, etc).

---

## 2. Fluxo de Comunicação (Ida e Volta)

### Fluxo de Ida (Ação do Usuário)
`HTML (Clique)` -> `JS (Função)` -> `PyWebView API (main.py)` -> `Módulo (Functions)`

1.  **HTML:** Botão chama uma função JS: `<button onclick="runTool()">`.
2.  **JS:** Captura inputs e chama o Python via `window.pywebview.api.nome_da_funcao(args)`.
3.  **Main Python:** A função em `main.py` importa o módulo necessário e inicia uma **Thread** (fundamental para não travar a interface).
4.  **Functions:** Executa a lógica e retorna o resultado para o `main.py`.

### Fluxo de Volta (Progresso e Logs)
`Functions (Callback)` -> `main.py (evaluate_js)` -> `JS (Update UI)` -> `HTML (Visual)`

1.  **Functions:** Durante a execução, chama uma função de `callback(progresso, log)`.
2.  **main.py:** O callback usa `_window.evaluate_js(f"funcaoJS({dados})")` para injetar dados no frontend em tempo real.
3.  **JS:** A função de atualização recebe os dados e manipula o DOM (barra de progresso, console de log).

---

## 3. Protocolo para Adicionar/Editar uma Ferramenta

Para garantir que a comunicação não quebre, siga estes passos na ordem:

### Passo 1: O Módulo (Functions)
- Crie ou edite o arquivo em `Functions/`.
- **Sempre** aceite callbacks: `callback_log` e `callback_progresso`.
- **Nunca** use `print()`, use o `callback_log`.

### Passo 2: A Ponte (main.py)
- Importe sua função dentro da função da API (importação tardia).
- Use `threading.Thread(target=run, daemon=True).start()` para a execução.
- Implemente a função de `log(msg)` e `progress(pct)` que chamam o JS via `evaluate_js`.
- Use a função `_safe_msg(msg)` para limpar strings antes de enviar ao JS (evita quebras por aspas ou barras).

### Passo 3: O Controlador (app.js)
- Crie a função que inicia a ferramenta (ex: `runMinhaFerramenta()`).
- Crie a função de progresso (ex: `updateMinhaFerramentaProgress(data)`).
- Certifique-se de tratar os estados: `percent`, `log` e `complete`.

### Passo 4: A Interface (index.html)
- Adicione a `tool-page` com os IDs correspondentes.
- Vincule o botão à função JS criada no Passo 3.

---

## 4. Regras de Ouro (Anti-Quebra)

1.  **Thread é Obrigatória:** Qualquer função que dure mais de 100ms deve rodar em uma `Thread` no Python. Se não, a interface "congela".
2.  **Caminhos Absolutos:** Sempre use caminhos absolutos para arquivos. O `main.py` e os módulos devem resolver caminhos usando `os.path.abspath`.
3.  **Safe Messages:** Nunca envie texto bruto do Python para o JS. Use `_safe_msg` no `main.py` para escapar caracteres especiais.
4.  **Nomes Sincronizados:** O nome da função no `app.js` (ao chamar a API) deve ser exatamente igual ao nome da função dentro da classe `API` no `main.py`.
5.  **Try/Except no Callback:** Sempre envolva o `evaluate_js` em um `try/except` no Python para evitar que o app feche se o usuário trocar de aba enquanto um log é enviado.

---

## 5. Exemplo de Sincronização

| Local | Nome/ID | Exemplo |
|-------|---------|---------|
| **HTML** | ID do Log | `log-meu-modulo` |
| **JS** | Função Update | `updateMeuModuloProgress(data)` |
| **Python (main.py)** | JS Call | `_window.evaluate_js("updateMeuModuloProgress(...)")` |
| **Python (Functions)**| Callback | `callback_log("Mensagem")` |
