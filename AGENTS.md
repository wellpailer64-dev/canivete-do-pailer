# Agentes de IA no KANIVETE (Codex, Kani, Worker e outros)
O Claude é o principal (regras completas em `CLAUDE.md`); este arquivo é o essencial para qualquer agente que receba
uma tarefa aqui — em geral um contrato do Claude pelo KaniCode. O contrato manda: mexa só no que ele liberar.

## Regras que valem sempre
- Python: `py -3.13` (o `python` do PATH é 3.11 e não tem pywebview). JS: um arquivo por `<script>` em `frontend/js/`.
- Nada de commit, push, reset, apagar arquivo do projeto ou mudar dependências.
- Testes, caches e saídas no disco D (`D:\kanivete_testes`), nunca no C.
- App de teste = porta **9333**. A **9222** é o KANIVETE aberto do Pailer (ele trabalha ao vivo): nunca conecte nela.
- Sem janela de diálogo nativa (abrir/salvar) em teste: use as funções da API sem janela.
- Escreva como o código em volta: nomes e comentários em português, mesma densidade de comentário.
- Antes de dar por pronto: `py -3.13 -m py_compile <arquivo>` / `node --check <arquivo>` e o teste indicado.

## Achar as coisas (barato: antes de abrir arquivo grande)
- Mapa geral (ferramentas → arquivos, APIs, testes, guias): `Instructions/MAPA.md`; busca: `py -3.13 tools/mapa_geral.py --busca <termo>`.
- Função dentro de uma área: `py -3.13 tools/mapa_codigo.py editor|imagem|vetor --busca <termo>` (nome:linha).
- Guia de cada assunto: `Instructions/` e `Instructions/agente/` (o mapa lista todos com o título).

## Testar a interface (modo agente)
- Abrir o app de teste: `APPDATA=D:\kanivete_testes\appdata TEMP=D:\kanivete_testes\tmp TMP=D:\kanivete_testes\tmp
  LOCALAPPDATA=D:\kanivete_testes\localappdata py -3.13 main.py --agente=9333` (se já estiver aberto, use o que está).
- Conectar: Playwright `connect_over_cdp("http://127.0.0.1:9333")`, página cuja URL contém `index.html`; rodar JS na
  página (`VE`, `veOpenTimeline`, `veExportPlan`...). Modelo pronto de teste: `testes/teste_comp_cenas.py`.
- Comparar o monitor: desligue o trecho pré-renderizado (`window.vePrSegEm = () => null`) e redesenhe várias vezes
  antes de capturar; compare pelo Ctrl+Z/Ctrl+Y (`veUndo`/`veRedo`) na mesma sessão.

## Editar vídeo, imagem, vetor pelo app
Leia o guia antes: vídeo `Instructions/agente/guia-edicao.md`; motion `Instructions/agente/mapa-habilidades-motion.md`;
Photo `Instructions/agente/design-photo-kanivete.md`; Vetor `Instructions/vetor-kanivete.md`. Código e testes: `CLAUDE.md`
e `Instructions/modo-agente.md`.
