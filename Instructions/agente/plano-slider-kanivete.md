# Plano — Slider Kanivete (Sd, verde-água) — pedido do Pailer em 2026-10-16 (missão da madrugada) — FEITO (v1)

PowerPoint moderno (Canva/Figma) para as palestras mensais de um cliente: manual e por agente, leve e otimizado.

## Pedido
- Projetos, páginas 16:9, editar, mover/reordenar slides, camadas (texto, forma, imagem, vídeo, GIF), "toda ferramenta
  possível", modo apresentação, exportar em vários formatos (PDF, PNG por slide, PPTX, MP4).
- Logo + sigla **Sd**, cor **verde-água**, banner na Home com arte, lobby padrão, aba e página próprias.
- No fim: documentar, atualizar mapa, commit + push, desligar o PC 5 min depois (`shutdown /s /t 300`).

## Onde plugar (levantado)
- Barra lateral: `frontend/index.html` (`.menu-item data-tool=...` com `<span class="app-logo al-sd">Sd</span>`),
  cartão da Home (`.home-card`), página `<div class="tool-page ve-page" id="page-slider-kanivete">`.
- Cor do logo: `.al-sd { --al: #2ee6c8; --al-fundo: #062a26; }` em `frontend/css/app.css` (junto de .al-lk/.al-ke).
- `switchTool` (`frontend/js/app.js` ~910) chama `luxAoTrocar`/`keAoTrocar`: acrescentar `sdAoTrocar`.
- Lobby: `frontend/js/lobby.js` (`KL_LOBBYS`) + vídeo `video/lobby-slider-kanivete.webm` (tingir `home-bg.webm`,
  ffmpeg colorchannelmixer, 12 qps). Home: `frontend/js/home-banners.js` (`HB_ITENS`) + arte
  `frontend/img/home/banner-slider-kanivete.webp` (Z-Image, `D:/kanivete_testes/scripts/gerar_banners.py`).
- Projeto `.dknv` (zip: documento.json + mídias): novo `Functions/slider_projeto.py` no molde de `lux_projeto.py`;
  registrar extensão/ícone em `Functions/projeto.py` `_TIPOS` + `tools/icones_arquivos.py`.
- API do agente `window.SDK` no padrão `VKN.cmd` (registrar comandos; `SDK.cena(html)` reaproveitando a ideia do KNV.cena).

## Etapas sugeridas
1. Esqueleto: aba, página, logo, lobby, Home. 2. Modelo de documento + slides + camadas + Ctrl+Z.
3. Editor: selecionar/mover/redimensionar/girar, guias, texto rico, formas, imagem/vídeo/GIF. 4. Painel de slides
(arrastar para reordenar, duplicar). 5. Modo apresentação (tela cheia, setas, transições). 6. Exportar PDF/PNG/PPTX/MP4.
7. Salvar/abrir .dknv. 8. API SDK + teste `testes/teste_slider.py` (porta 9333). 9. Guia, mapa, CLAUDE.md, commit/push.

## Situação (2026-10-16)
Etapas 1–9 feitas; guia completo e pendências em `Instructions/slider-kanivete.md`. `testes/teste_slider.py` passa inteiro.
