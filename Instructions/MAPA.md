# MAPA DO KANIVETE

> Gerado por `py -3.13 tools/mapa_geral.py` (lê o código; rode de novo depois de criar ferramenta, comando ou teste).
> Busca rápida: `py -3.13 tools/mapa_geral.py --busca <termo>`. Versão para o Jr/Worker: `Instructions/mapa.json`.
> Para achar uma função dentro de uma área: `py -3.13 tools/mapa_codigo.py vetor|imagem|editor --busca termo`.

## 1. Como o app funciona (arquitetura)
- **Janela**: `main.py` abre o pywebview (WebView2) com `frontend/index.html`. Toda a interface é HTML/CSS/JS em
  `frontend/` (um `<script>` por arquivo, carregados juntos; cada ferramenta é uma `div.tool-page` mostrada por
  `switchTool(id)` em `app.js`).
- **Ponte JS → Python**: `window.pywebview.api.<metodo>(...)` chama a classe `Api` do `main.py` (seção 5), que importa
  o módulo de `Functions/` só na hora do uso (abrir o app custa ~45 ms de Python). Progresso volta por `_js("funcao", ...)`.
- **Mídia**: `Functions/media_server.py` serve arquivos locais para o `<video>/<img>` (porta local).
- **Modelos de IA**: baixados sob demanda em `modelos_ia/` (ao lado do exe). Carregados só quando usados e soltos da
  memória quando ficam parados (`Functions/memoria.py`: 5 min; os da placa de vídeo, 3 min).
- **Uma instância só**: `Functions/instancia_unica.py`; abrir um arquivo com o app aberto manda para o que está aberto.
- **Atualização**: push na `main` → GitHub Actions gera o release → `Functions/updater.py` nos amigos.

## 2. Onde ficam as coisas
| O quê | Onde |
|---|---|
| Código Python das ferramentas | `Functions/*.py` (um módulo por ferramenta/assunto, seção 10) |
| Interface | `frontend/index.html`, `frontend/js/*.js`, `frontend/css/*.css`, `frontend/img`, `frontend/identidade` |
| Modelos de IA, ffmpeg, Blender, exiftool | `modelos_ia/` (dev) ou `dist/CaniveteDoPailer/modelos_ia/` (instalado) |
| Preferências | `%APPDATA%/CaniveteDoPailer` (`ie_prefs`: painéis, espaços de trabalho, estilos) |
| Caches (prévias de vídeo, render, PSD importados, imagens geradas) | `%LOCALAPPDATA%/CaniveteDoPailer/` (render e mídia: limpeza automática 20 GB / 30 dias) |
| Logs | `logs/` ao lado do exe (`erros.log` com teto de 2 MB) |
| Testes e saídas de teste | `testes/*.py` (código) → saídas sempre em `D:/kanivete_testes` (nunca no C) |
| Ferramentas de desenvolvimento | `tools/` (seção 8), Worker local em `tools/worker/` |
| Guias por assunto | `Instructions/` (seção 9); regras de trabalho em `CLAUDE.md` |
| Biblioteca de design (marcas, modelos, recursos) | `D:/kanivete_biblioteca` |

## 3. Caminhos entre ferramentas (pontes)
| De → Para | Como | Onde |
|---|---|---|
| Photo → Editor | camada/arte animada vira faixa (Animar) | `ponte-kanivete.js` |
| Vetor ↔ Photo | objeto inteligente vetorial no Photo (editar no Vetor, Ctrl+S devolve); vínculo vivo do .iknv no Vetor | `ponte-vetor-photo.js`, `Instructions/vetor-kanivete.md` §12 |
| Vetor → Editor 3D | objeto 3D do Vetor anima na Cena 3D (`enviar_editor_3d`) | `vetor-3d.js`, `editor-3d.js` |
| Vetor → Blender | render fotorrealista com rótulo (`render_blender`) | `vetor-blender.js`, `Functions/blender_render.py` |
| PSD → Editor | PSD/PSB vira Comp com camadas e texto editável | `editor-psd.js`, `Functions/psd_import.py` |
| Premiere ↔ Editor | abre .prproj; volta por XML do FCP7 | `Functions/premiere.py`, `Functions/premiere_xml.py` |
| Vetor ↔ Illustrator | .ai NATIVO montado no Illustrator; volta com pranchetas/camadas/texto | `Functions/ponte_illustrator.py`, `vetor-kanivete.md` §15 |
| Photo ↔ Photoshop | PSD de ida e volta (texto, forma, objeto inteligente, preenchimentos editáveis) | `Functions/editor_imagem.py` |
| Qualquer → IA local | gerar imagem (Z-Image/FLUX klein), preencher, céu, recorte, legendas, voz | seção 5, em cada ferramenta |

**Jr (Worker local, Qwen3 8B)**: recebe um contrato JSON e opera o app pelas mesmas APIs (`VKN.cmd`, `KNV.*`, estado `VE`):
`py -3.13 tools/worker/worker.py contrato.json` (Photo), `"app": "vetor"`/`"editor"` nos outros; código e testes:
`tools/worker/codigo.py`. Ferramentas que ele enxerga: `tools/worker/ferramentas*.json`. Guia: `Instructions/agente/worker.md`.
Para se localizar: este mapa (`mapa.json` é a versão compacta) e `--busca`.

## 4. Testar e operar sem abrir o app à mão
- App de teste: `APPDATA=D:\kanivete_testes\appdata TEMP=D:\kanivete_testes\tmp TMP=D:\kanivete_testes\tmp
  LOCALAPPDATA=D:\kanivete_testes\localappdata py -3.13 main.py --agente=9333` → Chrome DevTools em 127.0.0.1:9333
  (Playwright `connect_over_cdp`), rodar JS na página real com a API de verdade.
- Aplicar mudança sem reiniciar: `py -3.13 tools/recarregar.py [--py] [--ferramenta id]` (só `main.py` pede reinício).
- Editar código: `py -3.13 tools/patch.py arquivo.patch` (um `@@ arquivo` por bloco).

## 5. Ferramentas (menu do app) — arquivos, API, testes e guias

### Vídeo
#### Editor Kanivete — `switchTool('video-cutter')`
- **Interface**: `editor-3d-tela.js`, `editor-3d.js`, `editor-afx-pr.js`, `editor-atributos.js`, `editor-audio.js`, `editor-autoframe-cliente.js`, `editor-autoframe.js`, `editor-colar-externo.js`, `editor-comandos.js`, `editor-comp.js`, `editor-copiar.js`, `editor-desempenho.js`, `editor-dock.js`, `editor-encoder.js`, `editor-ferramentas.js`, `editor-fila.js`, `editor-fx.js`, `editor-grafico.js`, `editor-guias.js`, `editor-keyframes.js`, `editor-lacunas.js`, `editor-lc.js`, `editor-marcadores.js`, `editor-medidor.js`, `editor-mixer.js`, `editor-ovt.js`, `editor-projeto.js`, `editor-props.js`, `editor-psd.js`, `editor-render.js`, `editor-reverse.js`, `editor-scopes.js`, `editor-soundboard.js`, `editor-texto.js`, `editor-trans.js`, `editor-transform.js`, `editor-txanim.js`, `editor.js`, `editor.css`
- **Python**: `Functions/video_cutter.py`, `Functions/render_cache.py`, `Functions/autoframe.py`, `Functions/autoframe_modelos.py`, `Functions/transicoes.py`, `Functions/premiere.py`, `Functions/premiere_xml.py`, `Functions/cena3d.py`, `Functions/blender_cena.py`, `Functions/legendas.py`, `Functions/legendas_formatos.py`, `Functions/agente_midia.py`, `Functions/anti_noise.py`, `Functions/soundboard.py`, `Functions/psd_import.py`, `Functions/projeto.py`, `Functions/sincronizar.py`, `Functions/otimizar.py`, `Functions/media_server.py`
- **Automação (agente/Jr)**: estado em VE (VE.clips, VE.media, veSeek...), Cena 3D: window.VE3DAPI; Worker: executor_editor.js
- **API** (`pywebview.api.*`, 66): `audio_cutter_prepare(file_path)`, `audio_cutter_export(file_path, cuts, output_format="mp3", tracks=None, main_offset=0)`, `ve_texto_modelos()`, `ve_transcrever(clipes, total, idioma="pt")`, `ve_transcrever_cancelar()`, `ve_salvar_legenda(itens, formato="srt", nome="legendas", pasta="")`, `ve_fontes()`, `ve_preparar_midia(path, mid, urgente=False, leve=False, fundo=False)`, `ve_area_transferencia(projeto="")`, `ve_area_seq()`, `ve_inverter_midia(path, a, b, job)`, `ve_priorizar_midia(path)`, `ve_importar_dialogo()`, `ve_listar_pasta(path)`, `ve_ler_legenda(path)`, `ve_otimizar_fullhd(itens)`, `ve_otimizar_cancelar()`, `ve_encoder_estado()`, `ve_sincronizar_audio(ref_path, ref_s, ref_e, outro_path, outro_s, outro_e)`, `ve_salvar_png(dados)`, `ve_txa_lista(entradas)`, `anti_noise_preparar(path)`, `ve_sb_estado()`, `ve_sb_baixar()`, `ve_sb_abrir_pasta()`, `ve_render_listar(base, chave)`, `ve_render_trecho(base, chave, h, job)`, `ve_render_cancelar()`, `ve_comp_render(base, h, job)`, `ve_comp_cancelar()`, `ve_ovt_render(base, h, job)`, `ve_psd_importar(path)`, `ve_c3d_inicio(base, h)`, `ve_c3d_lote(sessao, pasta)`, `ve_c3d_fim(base, h, sessao, pasta, fps, n)`, `ve_c3d_pasta(base)`, `ve_3d_url(caminho)`, `ve_render_tocar(base, chave, hashes)`, `ve_render_mover(base, chave_antiga, chave_nova)`, `ve_render_limpar(base, chave=None)`, `ve_render_manutencao(base, max_gb=20, dias=30)`, `ve_render_info(base, chave=None)`, `ve_win_rect(titulo)`, `ve_win_hit(titulos, excluir=None)`, `ve_win_alpha(titulo, opacidade=1.0)`, `ve_win_prepare(titulo)`, `ve_win_place(titulo, x, y, w, h, maximizada=False)`, `ve_layout_load()`, `ve_layout_save(dados)`, `ve_agente_midia(cmd, args=None)`, `ve_agente_porta()`, `ve_project_save(path, dados, salvar_como=False, formato=None)`, `ve_premiere_ponte(acao, dados=None)`, `ve_project_open(path=None)`, `af_analisar(musica, itens)`, `af_recomendar(musica, paths, dur_alvo=None, inicio_modo="inicio", manual=None)`, `af_planejar(musica, paths, modelo, dur_alvo=None, ordem="inteligente", semente=0, inicio_modo="inicio", manual=None, telas=True, cobrir=None, reserva=None)`, `af_escolher(tipo)`, `afm_listar()`, `afm_salvar(modelo)`, `afm_apagar(mid)`, `afm_usou(mid, musica_i)`, `afm_escolher(tipo)`, `ve_autosave(chave, nome, dados)`, `ve_autosave_lista()`, `ve_project_thumb(path)`
- **Testes**: `testes/teste_export.py`, `testes/teste_play.py`, `testes/teste_premiere.py`, `testes/teste_premiere_xml.py`, `testes/teste_vetor_editor3d.py`
- **Guias**: `Instructions/editor-video.md`, `Instructions/agente/guia-edicao.md`, `Instructions/agente/plano-comp.md`, `Instructions/agente/cena-3d-editor.md`, `Instructions/agente/direcao-de-arte.md`, `Instructions/importar-premiere.md`, `Instructions/agente/ajuste-premiere.md`, `Instructions/agente/teste-4k.md`, `Instructions/agente/mapa-editor.md`

#### Comprimir Vídeo — `switchTool('compressor-video')`
- **Python**: `Functions/compressor_video.py`
- **API** (`pywebview.api.*`, 4): `compressor_imagem(folder_path, force_fullhd=False)`, `compressor_imagem_file(file_path, force_fullhd=False)`, `compressor_video(folder_path, mode="copy", gpu="cpu", qualidade="equilibrada")`, `compressor_video_file(file_path, mode="copy", gpu="cpu", qualidade="equilibrada")`

#### Converter Vídeo — `switchTool('video-converter')`
- **Python**: `Functions/videoconverter.py`
- **API** (`pywebview.api.*`, 2): `video_converter(folder_path, output_format)`, `video_converter_file(file_path, output_format)`
- **Guias**: `Instructions/video-converter.md`

#### Baixar Vídeo — `switchTool('video-downloader')`
- **Python**: `Functions/videodownloader.py`
- **API** (`pywebview.api.*`, 8): `video_cutter_prepare(file_path)`, `video_cutter_export(file_path, segments, output_format="mp4", qualidade="medium", resolucao="original", usar_gpu=True, pasta_saida=None, sem_audio=False, camadas=None, audio_segments=None, duracao=None, audio_clipes=None, legendas=None, quadro=None, opcoes=None)`, `video_cutter_audio_fonte()`, `video_cutter_add_audio(path)`, `video_cutter_add_media(path)`, `video_cutter_cancel_export()`, `video_downloader_info(url)`, `video_downloader(url, destino="", formato="mp4", qualidade="compativel")`
- **Guias**: `Instructions/video-downloader.md`

#### Logger Pro — `switchTool('organizador-videos')`
- **Python**: `Functions/organizador_de_videos.py`, `Functions/snapshot_logger.py`
- **API** (`pywebview.api.*`, 2): `escanear_cameras_videos(folder_path)`, `organizador_videos(folder_path, operadores=None, nome_projeto_premiere=None)`

### Áudio
#### Sound Kanivete — `switchTool('sound-kanivete')`
- **Interface**: `som-dock.js`, `som-espectro.js`, `som-gravar.js`, `som-motor.js`, `som-paineis.js`, `som-texto.js`, `som-tts.js`, `som.js`, `som.css`
- **Python**: `Functions/sound_kanivete.py`, `Functions/sk_gravar.py`, `Functions/sk_espectro.py`, `Functions/sk_banco_vozes.py`
- **Automação (agente/Jr)**: window.SKN (som.js): novo, importar, cortar, alterarClipe, exportar, estado...
- **API** (`pywebview.api.*`, 22): `sk_info(path)`, `sk_trecho(arq, k, sr=48000)`, `sk_auto(acao, proj=None, caminho=None, pid=None)`, `sk_gravar(acao, dispositivo=None, caminho=None, sr=48000, canais=1)`, `sk_ir(tamanho=1.2)`, `sk_espectro(arq, t0, t1, cols=1200, rows=256)`, `sk_salvar(proj, caminho)`, `sk_abrir(caminho)`, `sk_exportar(proj, caminho, op=None)`, `sk_medir(proj, op=None)`, `sk_processar(arq, efeito, op=None)`, `sk_transcrever(proj, idioma="pt", faixas=None)`, `sk_lufs(arq, de=0, dur=None)`, `sk_silencios(arq, de=0, dur=None, limiar=-40, minimo=0.6)`, `sk_pasta_padrao()`, `sk_vozes()`, `sk_voz_criar(nome, arq, op=None)`, `sk_banco(acao="estado", vid=None)`, `sk_voz_desenhar(instruct, seed=0, texto=None)`, `sk_voz_apagar(voz_id)`, `sk_voz(voz_id, texto, op=None)`, `sk_dialogo(modo, tipos=None, nome="")`
- **Testes**: `testes/teste_som.py`
- **Guias**: `Instructions/sound-kanivete.md`

#### Converter Áudio — `switchTool('converter-audio')`
- **Python**: `Functions/convertermp3.py`, `Functions/audio_cutter.py`
- **API** (`pywebview.api.*`, 4): `converter_audio(folder_path, output_format)`, `converter_audio_file(file_path, output_format)`, `converter_imagem(folder_path, output_format)`, `converter_imagem_file(file_path, output_format)`

#### Transcrever — `switchTool('transcrever-audio')`
- **Python**: `Functions/transcreveraudio.py`, `Functions/transcrever_cena.py`
- **API** (`pywebview.api.*`, 4): `transcrever_audio(folder_path, model, language)`, `transcrever_audio_file(file_path, model, language)`, `transcrever_salvar_txt(texto, pasta_origem)`, `transcrever_cena(folder_path)`
- **Guias**: `Instructions/transcrever-audio.md`

#### Melhorar Áudio — `switchTool('melhorar-audio')`
- **Python**: `Functions/melhorar_audio.py`, `Functions/melhorar_audio_runner.py`
- **API** (`pywebview.api.*`, 3): `melhorar_audio(caminho)`, `melhorar_audio_midia(caminho, mid)`, `melhorar_audio_cancelar()`
- **Guias**: `Instructions/melhorar-audio.md`

#### Geração de Voz — `switchTool('omnivoice')`
- **Python**: `Functions/omnivoice_tool.py`, `Functions/omnivoice_runner.py`
- **API** (`pywebview.api.*`, 7): `omnivoice_status()`, `omnivoice_download()`, `omnivoice_create_voice(name, audio_path, ref_text="", options=None)`, `omnivoice_update_voice(voice_id, name, ref_text)`, `omnivoice_delete_voice(voice_id)`, `omnivoice_synthesize(voice_id, text, options=None)`, `omnivoice_save_output(path)`

### Imagem
#### Photo Kanivete — `switchTool('editor-imagem')`
- **Interface**: `imagem-ajustes.js`, `imagem-api.js`, `imagem-arquivo.js`, `imagem-atalhos.js`, `imagem-cameraraw.js`, `imagem-caneta.js`, `imagem-cena.js`, `imagem-dissolver.js`, `imagem-dock.js`, `imagem-estilo.js`, `imagem-fatias.js`, `imagem-ferramentas.js`, `imagem-filtros.js`, `imagem-fx.js`, `imagem-galeria.js`, `imagem-gerador.js`, `imagem-guias.js`, `imagem-janela.js`, `imagem-nucleo.js`, `imagem-paineis.js`, `imagem-prancheta.js`, `imagem-recuperar.js`, `imagem-texto.js`, `ponte-kanivete.js`, `imagem.css`
- **Python**: `Functions/editor_imagem.py`, `Functions/gerador_imagem.py`, `Functions/preencher_conteudo.py`, `Functions/ceu.py`, `Functions/recorte_pro.py`, `Functions/ampliar_imagem.py`, `Functions/fontes.py`, `Functions/psd_texto_modelo.py`, `Functions/psd_so_modelo.py`, `Functions/amostras.py`, `Functions/recuperar.py`
- **Automação (agente/Jr)**: window.KNV (imagem-api.js); diagramar: KNV.cena / tools/knv.py; Worker: executor.js
- **API** (`pywebview.api.*`, 30): `ie_curar(regiao, mascara, dx, dy, difusao=0)`, `ie_preencher_ia(regiao, mascara, expandir=None)`, `ie_ceu_mascara(foto, deslocar=0, esmaecer=0)`, `ie_ceu_cor(ceu_png)`, `ie_preencher_conteudo(regiao, mascara, raio=6)`, `ie_instalar_fonte(familia)`, `ie_abrir(path)`, `ie_liberar(doc)`, `ie_mascara_assunto(png_b64, modelo="birefnet-lite")`, `ie_recorte_pro(png_b64)`, `ie_gerador_estado(modelo=None)`, `ie_gerador_baixar(modelo=None)`, `ie_gerar(spec)`, `ie_gerador_cancelar(job)`, `ie_gerador_parar()`, `ie_gerador_remover()`, `ie_fechar(doc)`, `ie_salvar_inicio(doc)`, `ie_salvar(spec)`, `ie_salvar_iknv(spec)`, `ie_exportar(spec)`, `ie_exportar_fatias(spec)`, `ie_dialogo_abrir(multiplos=True)`, `ie_dialogo_salvar(nome, ext="psd", pasta="")`, `ie_colar_windows()`, `ie_soltar_memoria(tokens)`, `ie_existe(path)`, `ie_prefs(dados=None)`, `ie_amostras(origem="photoshop")`, `ie_fonte_url(arquivo)`
- **Testes**: `testes/teste_barra.py`, `testes/teste_cameraraw.py`, `testes/teste_caneta.py`, `testes/teste_ceu.py`, `testes/teste_conteudo.py`, `testes/teste_corte_alt.py`, `testes/teste_dissolver.py`, `testes/teste_editar.py`, `testes/teste_filtros.py`, `testes/teste_galeria.py`, `testes/teste_generativo.py`, `testes/teste_guias.py`, `testes/teste_imagem.py`, `testes/teste_laco.py`, `testes/teste_pincel.py`, `testes/teste_psd_deg_app.py`, `testes/teste_psd_forma.py`, `testes/teste_psd_pre.py`, `testes/teste_psd_refs.py`, `testes/teste_psd_so.py`, `testes/teste_psd_texto.py`
- **Guias**: `Instructions/editor-imagem.md`, `Instructions/agente/design-photo-kanivete.md`, `Instructions/agente/plano-cena.md`, `Instructions/agente/direcao-carrossel.md`, `Instructions/agente/diretor-de-arte.md`, `Instructions/agente/mapa-imagem.md`

#### Vetor Kanivete — `switchTool('vetor-kanivete')`
- **Interface**: `ponte-vetor-photo.js`, `vetor-3d.js`, `vetor-aparencia.js`, `vetor-api.js`, `vetor-arquivo.js`, `vetor-blender.js`, `vetor-cena.js`, `vetor-construir.js`, `vetor-cores.js`, `vetor-desenho.js`, `vetor-dock.js`, `vetor-ferramentas.js`, `vetor-fonte.js`, `vetor-malha.js`, `vetor-novo.js`, `vetor-nucleo.js`, `vetor-padroes.js`, `vetor-paineis.js`, `vetor-perspectiva.js`, `vetor-pinceis.js`, `vetor-pranchetas.js`, `vetor-producao.js`, `vetor-recuperar.js`, `vetor-reguas.js`, `vetor-revisor.js`, `vetor-saida.js`, `vetor-separacoes.js`, `vetor-simbolos.js`, `vetor-texto.js`, `vetor-transformar.js`, `vetor-vinculos.js`, `vetor.css`
- **Python**: `Functions/vetor_kanivete.py`, `Functions/vetor_importar.py`, `Functions/vetor_exportar.py`, `Functions/vetor_saida.py`, `Functions/vetor_fonte.py`, `Functions/ponte_illustrator.py`, `Functions/blender_render.py`
- **Automação (agente/Jr)**: window.VKN (VKN.cmd(nome, args) = os comandos abaixo; VKN.mapa(), VKN.fechamento(), VKN.cena); Worker: executor_vetor.js
- **API** (`pywebview.api.*`, 44): `vk_baixar_ghostscript()`, `vk_exportar_ai(doc_py, doc_salvar, path, opcoes)`, `vk_illustrator_disponivel()`, `vk_exportar_ai_nativo(doc_py, path, opcoes=None)`, `vk_exportar_eps(doc_py, path, opcoes)`, `vk_fonte_eixos(fam, estilo="Regular")`, `vk_recarregar(prefixo="Functions.")`, `vk_abrir(path)`, `vk_salvar(doc, path)`, `vk_texto_geometria(spec)`, `vk_icone(nome, estilo="outline")`, `vk_vetorizar(arquivo, cores=6, area_min=12, ignorar_fundo=True)`, `vk_blender_estado()`, `vk_blender_instalar()`, `vk_blender_render(cena)`, `vk_ler_texto(caminho)`, `vk_ler_csv(caminho)`, `vk_juntar_pdfs(lista, saida, padrao="x4")`, `vk_ampliar(arquivo, escala=2, tipo="foto")`, `vk_registrar_fontes(lista)`, `vk_autosalvar(doc, meta=None)`, `vk_recuperaveis()`, `vk_recuperar(uid)`, `vk_descartar_recuperacao(uid)`, `vk_bibliotecas_cor()`, `vk_ler_biblioteca(arquivo, cond="FOGRA39")`, `vk_qr(texto, correcao="M")`, `vk_fonte_glifos(fam, estilo="Regular")`, `vk_exportar_fonte(spec)`, `vk_booleana(op, formas)`, `vk_deslocar(formas, dist, junc="miter", miter=4)`, `vk_contornar_traco(formas)`, `vk_regioes(formas)`, `vk_faca(formas, linha)`, `vk_canais_imagem(path, mascara=None, cond="FOGRA39")`, `vk_empacotar(doc, pasta, opcoes=None)`, `vk_cores_tela(lista, cond="FOGRA39")`, `vk_rgb_para_cmyk(lista, cond="FOGRA39")`, `vk_imagem_info(path)`, `vk_vinculos_estado(lista)`, `vk_salvar_png(dados, path)`, `vk_perfis()`, `vk_exportar_pdf(doc, path, opcoes)`, `vk_dialogo(modo, tipos=None, nome="")`
- **Testes**: `testes/teste_blender.py`, `testes/teste_fonte.py`, `testes/teste_illustrator.py`, `testes/teste_ponte.py`, `testes/teste_pranchetas.py`, `testes/teste_vetor.py`, `testes/teste_vetor_paineis.py`
- **Guias**: `Instructions/vetor-kanivete.md`, `Instructions/agente/mapa-vetor.md`, `Instructions/agente/plano-economia-ponte-vetor-photo.md`

#### Converter Imagem — `switchTool('converter-imagem')`
- **Python**: `Functions/converterimagem.py`

#### Comprimir Imagem — `switchTool('compressor-imagem')`
- **Python**: `Functions/compressor_imagem.py`
- **Guias**: `Instructions/compressor-imagem.md`

#### Remover Fundo — `switchTool('remover-fundo')`
- **Python**: `Functions/removerfundo.py`, `Functions/recorte_pro.py`
- **API** (`pywebview.api.*`, 3): `remover_fundo(folder_path, modelo="isnet")`, `remover_fundo_file(file_path, modelo="isnet")`, `remover_fundo_salvar(indices, pasta_destino)`
- **Guias**: `Instructions/remover-fundo.md`, `Instructions/agente/remover-fundo.md`

#### Organizar Imagens — `switchTool('organizador-imagens')`
- **Python**: `Functions/organizador_de_imagens.py`
- **API** (`pywebview.api.*`, 1): `organizador_imagens(folder_path, modo="completa")`
- **Guias**: `Instructions/organizador-imagens.md`

#### Gerar Favicon — `switchTool('favicon')`
- **Python**: `Functions/faviconconverter.py`
- **API** (`pywebview.api.*`, 1): `favicon_generator(image_path, site_name, theme_color)`
- **Guias**: `Instructions/favicon-generator.md`

### Web
#### GDrive Dumper — `switchTool('gdrive-dumper')`
- **Python**: `Functions/gdrive_dumper.py`
- **API** (`pywebview.api.*`, 6): `gdrive_check()`, `gdrive_analyze(url)`, `gdrive_dump(url, destino, perfil="rapida")`, `gdrive_pause()`, `gdrive_resume()`, `gdrive_cancel()`
- **Guias**: `Instructions/gdrive-dumper.md`

#### Web Scraper — `switchTool('web-scraper')`
- **Python**: `Functions/webscraper.py`, `Functions/cerebro_local.py`
- **API** (`pywebview.api.*`, 9): `web_scraper_analyze(url)`, `web_scraper_download(url, mode, destino)`, `web_scraper(url, tipo, destino)`, `web_scraper_csv(url)`, `cerebro_load()`, `cerebro_save(content)`, `cerebro_exists()`, `cerebro_remove()`, `cerebro_select_file()`
- **Guias**: `Instructions/webscraper.md`, `Instructions/cerebro.md`

### API geral (app, janela, preferências, arquivos) — 24 métodos
`select_folder(tool)`, `select_file(tool)`, `select_image(tool)`, `open_folder(path)`, `kani_estado()`, `kani_baixar()`, `kani_enviar(cid, mensagens, ferramenta="")`, `kani_parar(cid)`, `kani_voz(ligar=True)`, `kani_falar(texto, chave="")`, `reveal_file(path)`, `open_file(path)`, `select_video_file(tool)`, `prefs_load()`, `prefs_save(dados)`, `check_update()`, `apply_update()`, `sair_app()`, `toggle_fullscreen()`, `janela_cmd(acao)`, `janela_propria()`, `janela_ativar()`, `on_webview_ready(sender, args)`, `on_new_window_request(sender, args)`

## 6. Vetor Kanivete — comandos `VKN.cmd(nome, args)` (154; a interface, o Claude e o Jr usam os mesmos)
- `vetor-3d.js`: `girar_3d` (3D girar), `extrudar_3d` (3D extrudar), `editar_3d` (editar 3D), `mapear_arte` (mapear arte no 3D), `limpar_mapas` (tirar artes mapeadas), `expandir_3d` (expandir 3D)
- `vetor-aparencia.js`: `aparencia` (aparência), `efeito` (efeito), `expandir_aparencia` (expandir aparência)
- `vetor-api.js`: `ajuda` (ajuda), `novo` (novo documento), `documento` (propriedades do documento), `retangulo` (retângulo), `elipse` (elipse), `poligono` (polígono), `estrela` (estrela), `linha` (linha), `caminho` (caminho), `texto` (texto), `imagem` (colocar imagem), `alterar` (alterar), `mover` (mover), `posicionar` (posicionar), `redimensionar` (redimensionar), `girar` (girar), `refletir` (refletir), `matriz` (transformar), `alinhar` (alinhar), `distribuir` (distribuir), `organizar` (organizar), `agrupar` (agrupar), `desagrupar` (desagrupar), `mascara` (criar máscara de corte), `soltar_mascara` (soltar máscara), `composto` (criar caminho composto), `pathfinder` (Pathfinder), `deslocar` (deslocar caminho), `contornar_traco` (contornar traço), `contornos` (criar contornos), `duplicar` (duplicar), `apagar` (apagar), `selecionar` (selecionar), `mover_para_camada` (mover para camada), `nova_camada` (nova camada), `camada` (alterar camada), `nova_prancheta` (nova prancheta), `prancheta` (alterar prancheta), `amostra` (nova amostra), `cores_padrao` (cor de preenchimento/traço atual), `mapa` (mapa), `info` (info)
- `vetor-arquivo.js`: `abrir` (abrir), `importar` (colocar arquivo), `salvar` (salvar), `exportar_pdf` (exportar PDF), `empacotar` (empacotar), `exportar_imagem` (exportar imagem), `exportar_svg` (exportar SVG), `converter_cmyk` (converter cores para CMYK), `preto_texto` (textos pretos em 100K), `sobreimprimir_preto` (sobreimprimir preto 100K), `tirar_sobre_branco` (tirar sobreimpressão do branco), `engrossar_tracos` (traços finos → 0,25 pt), `limpar` (limpar pontos soltos e vazios)
- `vetor-blender.js`: `enviar_editor_3d` (objeto 3D → cena 3D do Editor (animar)), `render_blender` (render fotorrealista (Blender))
- `vetor-cena.js`: `cena` (cena (HTML → objetos))
- `vetor-construir.js`: `construtor` (construtor de formas), `pathfinder2` (Pathfinder), `tesoura` (tesoura), `faca` (faca), `juntar` (juntar), `media` (média)
- `vetor-cores.js`: `bibliotecas_cor` (bibliotecas de cor), `cores_biblioteca` (cores da biblioteca), `cor_biblioteca` (cor da biblioteca), `cores_arte` (cores da arte), `recolorir` (recolorir arte)
- `vetor-desenho.js`: `lapis` (lápis), `simplificar` (simplificar caminho), `bolha` (pincel de bolha), `borracha` (borracha), `setor` (setor), `arco` (arco), `qrcode` (QR code), `icone` (ícone), `degrade` (degradê), `mesclar` (mesclar), `mescla` (opções da mesclagem), `expandir_mescla` (expandir mesclagem), `vetorizar` (traçado de imagem), `ampliar_imagem` (ampliar imagem (IA))
- `vetor-ferramentas.js`: `definir_subs` (editar pontos), `mover_prancheta` (mover prancheta)
- `vetor-fonte.js`: `fonte_modelo` (modelo de fonte), `exportar_fonte` (exportar fonte)
- `vetor-malha.js`: `criar_malha` (criar malha), `malha_no` (nó da malha)
- `vetor-padroes.js`: `criar_padrao` (criar padrão), `padrao` (aplicar padrão)
- `vetor-perspectiva.js`: `grade_perspectiva` (grade de perspectiva), `perspectiva_colocar` (colocar na perspectiva), `perspectiva_retangulo` (retângulo em perspectiva), `perspectiva_caixa` (caixa em perspectiva)
- `vetor-pinceis.js`: `criar_pincel` (criar pincel), `pincel` (aplicar pincel), `pinceis` (pincéis), `expandir_pincel` (expandir pincel), `marionete` (distorção de marionete)
- `vetor-pranchetas.js`: `nova_prancheta` (nova prancheta), `organizar_pranchetas` (reorganizar pranchetas), `duplicar_prancheta` (duplicar prancheta), `ordem_prancheta` (ordem da prancheta), `prancheta_caixa` (tamanho da prancheta), `mover_prancheta` (mover prancheta)
- `vetor-producao.js`: `faca_caixa` (faca de caixa), `pintura_dinamica` (pintura dinâmica)
- `vetor-recuperar.js`: `recuperacao` (recuperação)
- `vetor-reguas.js`: `guia` (guia), `exibir` (exibir)
- `vetor-revisor.js`: `revisar` (revisar (diretor de arte))
- `vetor-saida.js`: `exportar_ai` (salvar como .ai), `exportar_eps` (exportar EPS), `exportar_ativos` (exportar ativos para telas)
- `vetor-separacoes.js`: `separacoes` (visualização de separações), `tinta_em` (tinta no ponto), `exportar_separacoes` (exportar separações)
- `vetor-simbolos.js`: `criar_simbolo` (criar símbolo), `colocar_simbolo` (colocar símbolo), `redefinir_simbolo` (redefinir símbolo), `soltar_simbolo` (soltar símbolo), `simbolos` (símbolos), `mascara_opacidade` (máscara de opacidade), `soltar_mascara_opacidade` (soltar máscara de opacidade), `mala_direta` (mala direta)
- `vetor-texto.js`: `texto_caminho` (texto em caminho), `texto_em_forma` (texto em forma), `encadear` (encadear textos), `desencadear` (remover encadeamento), `estilo_texto` (estilo de texto), `estilos_texto` (estilos de texto), `juntar_textos` (juntar textos), `glifos` (glifos da fonte), `inserir_texto` (inserir texto), `retocar_letra` (retocar letra), `desvio_texto` (contorno de texto), `colunas` (colunas de texto), `fonte_eixos` (eixos da fonte)
- `vetor-transformar.js`: `repetir` (repetir transformação), `transformar_cada` (transformar cada), `distribuir_espaco` (distribuir espaçamento)
- `vetor-vinculos.js`: `vinculos` (vínculos), `revincular` (substituir imagem), `atualizar_vinculo` (atualizar vínculo)

## 7. Photo Kanivete — `window.KNV` (82 métodos; detalhes em `frontend/js/imagem-api.js`)
`novo`, `doc`, `camadas`, `ativar`, `info`, `renomear`, `cmd`, `nova`, `colocar`, `transformar`, `girar`, `escalar`, `caixa`, `alinhar`, `encostar`, `caixaGrupo`, `mover`, `moverPara`, `modo`, `ajuste`, `objetoInteligente`, `atenuar`, `colarDentro`, `substituirTexto`, `preenchimentoGenerativo`, `expansaoGenerativa`, `variacaoGenerativa`, `substituirCeu`, `preencherConteudo`, `preenchimento`, `preenchimentoDegrade`, `duplicar`, `removerFundo`, `borrachaMagica`, `gerar`, `selecionar`, `selecionarPoligono`, `preencher`, `degrade`, `pincel`, `lote`, `definirPadrao`, `salvar`, `abrir`, `fecharDoc`, `fecharTudo`, `texto`, `efeito`, `formas`, `revisarPeca`, `revisarGabarito`, `revisarDirecao`, `revisar`, `mapa`, `layoutGuias`, `novaGuia`, `guias`, `limparGuias`, `guiasDaForma`, `fatiasDasGuias`, `ajustar`, `cena`, `cenaFonte`, `exportar`, `marca`, `instalarFonte`, `fontes`, `ver`, `variacoes`, `etapa`, `referencia`, `comparar`, `receita`, `levarParaEditor`, `exportarRapido`, `recursosNovos`, `png`, `cor`, `dialogos`, `automacao`, `dialogo`, `responder`

**Editor — Cena 3D `window.VE3DAPI`** (11): `nova`, `modelo`, `definir`, `kf`, `doVetor`, `limparKf`, `cena`, `remover`, `info`, `renderizar`, `quadro`

## 8. Ferramentas de desenvolvimento (`tools/`)
- `tools/worker/arquiteto.py` — Arquiteto Local B: opcao local para planejar tarefas do Canivete sem substituir o Claude
- `tools/worker/arquiteto_ui.py` — Interface local do Arquiteto B
- `tools/worker/codigo.py` — Code Worker / Debug Worker: o Qwen3 8B local faz o trabalho braçal de infraestrutura (buscar, ler, trocar trecho,
- `tools/worker/entrevista.py` — Entrevista do assistente local (Canivete Worker): mesmos pedidos para cada modelo do Ollama, mede acerto de
- `tools/worker/worker.py` — Canivete Worker: executa um contrato de tarefa (Task Contract) no Photo Kanivete com um modelo local (Ollama),
- `tools/aplicar.py` — Aplica mudanças no app ABERTO sem recarregar a página (o projeto, as janelas soltas e o Ctrl+Z continuam)
- `tools/direcao_mapa.py` — Mapa de direção de arte (para o Claude, o Worker e o roteiro_local): layouts, estilos e técnicas em linhas curtas —
- `tools/esqueleto.py` — Roteiro (JSON curto) → carrossel diagramado (HTML do KNV.cena) pelos ESQUELETOS aprovados. O agente só escreve o
- `tools/gerar_marca.py` — Gera a marca KANIVETE: letras próprias desenhadas aqui (geometria nossa, sem ler fonte nenhuma), no espírito
- `tools/kani_kb.py` — Base de ajuda da Kani (assistente do KANIVETE): junta os guias das ferramentas (Instructions/*.md) e o mapa geral
- `tools/knv.py` — Monta uma peça do Photo Kanivete a partir de HTML/CSS (KNV.cena) no app aberto em modo agente e confere
- `tools/mapa_codigo.py` — Mapa do código (para o agente achar onde mexer sem abrir arquivo grande): comandos registrados, funções de topo e
- `tools/mapa_geral.py` — Mapa geral do KANIVETE — gera Instructions/MAPA.md (pessoas, Claude) e Instructions/mapa.json (Jr / Worker local)
- `tools/medir_ref.py` — Medidor de referência: lê uma imagem de referência (print de carrossel/flyer) SEM o Claude olhar e devolve as medidas
- `tools/montar_banco_vozes.py` — Monta o pacote do banco de vozes (Functions/sk_banco_vozes.py) — não roda no app; só para gerar o zip do release
- `tools/montar_soundboard.py` — Monta o pack "vanilla" do Soundboard do Pocket Editor (não roda no app; só para gerar o zip do release)
- `tools/olho.py` — Olho local: um modelo de visão no Ollama (gemma4:e4b) olha as imagens no lugar do Claude e devolve TEXTO curto
- `tools/patch.py` — Aplica trocas de texto descritas num arquivo .patch simples — sem escapar aspas/barras, tudo ou nada, com conferência
- `tools/ponte_premiere.py` — Linha de comando da ponte com o Premiere (o código fica em Functions/ponte_premiere.py, que vai no executável)
- `tools/premiere_audio_dados.py` — Gera frontend/dados/premiere_audio.json: os efeitos de áudio do Premiere (catálogo lido pelo plugin Kanivete Ponte)
- `tools/ps_modelo_deg.py` — Gera no Photoshop camadas de preenchimento de DEGRADÊ (linear 3 cores 30°, radial com transparência): molde do GdFl
- `tools/ps_modelo_forma.py` — Gera no Photoshop um PSD com camadas de forma (retângulo, elipse e um demarcador com furo): molde de vmsk/SoCo
- `tools/ps_modelo_pre.py` — Gera no Photoshop camadas de preenchimento de cor sólida (sem seleção e com seleção → máscara): molde
- `tools/ps_modelo_so.py` — Gera no Photoshop um PSD com um PNG colocado como objeto inteligente incorporado (escalado e girado): molde do SoLd
- `tools/ps_modelo_texto.py` — Gera no Photoshop (COM + JSX) um PSD com uma camada de texto de ponto e uma de parágrafo: molde do TySh
- `tools/recarregar.py` — Modo agente: aplica código novo no app aberto SEM reiniciar
- `tools/refs.py` — Referências do Pinterest numa chamada: busca (navegador headless, sem login), baixa, monta folhas de contato,
- `tools/revisor.py` — Revisor da peça do Photo Kanivete: confere, sem o Claude olhar, as regras que vieram dos feedbacks do usuário e
- `tools/roteiro_local.py` — Briefing → roteiro JSON do tools/esqueleto.py pelo modelo LOCAL (Ollama; o Jr). O modelo só escreve o roteiro curto;
- `tools/tripa.py` — tripa.py — a timeline inteira numa "tripa" de quadrinhos para o agente LER a montagem barato (ideia do Pailer)
- `tools/vk_cena.py` — Diagramar uma prancheta do Vetor Kanivete com HTML/CSS (VKN.cena) usando o sistema da marca

## 9. Guias (`Instructions/`)
- `Instructions/agente/ajuste-premiere.md` — AJUSTE PREMIERE: plano para a próxima sessão
- `Instructions/agente/arquiteto-local.md` — Arquiteto Local B
- `Instructions/agente/cena-3d-editor.md` — Cena 3D no Editor Kanivete (estilo After Effects)
- `Instructions/agente/design-photo-kanivete.md` — Fazer arte no Photo Kanivete pela API (guia para IAs)
- `Instructions/agente/direcao-carrossel.md` — Direção de arte de carrossel (para IAs) — o que separa peça boa de "landing page genérica"
- `Instructions/agente/direcao-de-arte.md` — Direção de arte e motion para o AutoFrame e as edições do Pocket Editor
- `Instructions/agente/diretor-de-arte.md` — Diretor de arte de carrossel (padrão de resposta + o que o Jr executa por comando)
- `Instructions/agente/guia-edicao.md` — GUIA-EDICAO :: Pocket Editor (Canivete do Pailer) — para agentes de IA
- `Instructions/agente/mapa-editor.md` — Mapa do código — editor (gerado por tools/mapa_codigo.py; nome:linha)
- `Instructions/agente/mapa-imagem.md` — Mapa do código — imagem (gerado por tools/mapa_codigo.py; nome:linha)
- `Instructions/agente/mapa-kanivete-encoder.md` — Mapa do Kanivete Encoder (Ke)
- `Instructions/agente/mapa-vetor.md` — Mapa do código — vetor (gerado por tools/mapa_codigo.py; nome:linha)
- `Instructions/agente/plano-cena.md` — Plano CENA — diagramar no Photo Kanivete escrevendo HTML/CSS (para IAs)
- `Instructions/agente/plano-comp.md` — Plano: Comp (composição estilo After Effects) no Pocket Editor
- `Instructions/agente/plano-economia-ponte-vetor-photo.md` — Planos (2026-10-04): economia de tokens, ponte Vetor ↔ Photo, nível "Herbíssimo"
- `Instructions/agente/plano-kanivete-encoder.md` — Kanivete Encoder (Ke) — plano (rodada 1 de otimização FEITA em 2026-10-08; pendências no fim)
- `Instructions/agente/ponte-premiere.md` — Ponte Kanivete ↔ Premiere Pro (plugin UXP "Kanivete Ponte")
- `Instructions/agente/remover-fundo.md` — Remover fundo (recorte) — velocidade × qualidade (2026-10-06)
- `Instructions/agente/teste-4k.md` — Teste de 4K (estresse do Editor de Vídeo)
- `Instructions/agente/worker.md` — Canivete Worker — o assistente local (para o Claude delegar operações)
- `Instructions/build.md` — Guia de Build (Geração do Executável)
- `Instructions/cerebro.md` — Cérebro Local
- `Instructions/compressor-imagem.md` — Compressor de Imagem
- `Instructions/editor-imagem.md` — Editor de Imagem (estilo Photoshop)
- `Instructions/editor-video.md` — Pocket Editor — Editor de Vídeo
- `Instructions/favicon-generator.md` — Favicon Generator
- `Instructions/gdrive-dumper.md` — GDrive Dumper — Documentação de Correções
- `Instructions/howtoeditapp.md` — Guia de Desenvolvimento: Fluxo de Comunicação e Edição
- `Instructions/importar-premiere.md` — Importar projeto do Premiere (.prproj) no Editor Kanivete
- `Instructions/melhorar-audio.md` — Melhorar Áudio
- `Instructions/modo-agente.md` — Modo agente (depuração remota)
- `Instructions/organizador-imagens.md` — Organizador de Imagens
- `Instructions/remover-fundo.md` — Remover Fundo
- `Instructions/sound-kanivete.md` — Sound Kanivete (Sk) — editor de áudio multipista
- `Instructions/transcrever-audio.md` — Transcrever Áudio
- `Instructions/vetor-kanivete.md` — Vetor Kanivete (estilo Illustrator) — estudo de caso, modelo, API e fechamento
- `Instructions/video-converter.md` — Video Converter (GIF <-> Video)
- `Instructions/video-downloader.md` — Video Downloader - Padrão de Implementação
- `Instructions/webscraper.md` — Web Scraper

## 10. Módulos Python (`Functions/`)
- `Functions/agente_midia.py` — agente_midia.py — ferramentas para um agente (Claude) entender as mídias de um projeto sem assistir/ouvir tudo
- `Functions/amostras.py` — Amostras de cor (painel Amostras do Editor de Imagem): lê as do Photoshop instalado (Swatches.psp, com os grupos)
- `Functions/ampliar_imagem.py` — Ampliar foto por IA (super-resolução): Real-ESRGAN ncnn Vulkan (BSD-3, xinntao/Real-ESRGAN), GPU via Vulkan
- `Functions/anti_noise.py` — Anti Noise (efeito de áudio do Editor Kanivete): tira o ruído de fundo com o DeepFilterNet3 (rede neural)
- `Functions/area_transferencia.py` — area_transferencia.py — o que foi copiado no Windows, para o Ctrl+V da timeline do Pocket Editor
- `Functions/audio_cutter.py` — Editor simples de audio com cortes multiponto via ffmpeg
- `Functions/autoframe.py` — AutoFrame — vídeos no ritmo da música a partir de uma pasta de fotos e vídeos (no espírito dos modelos do CapCut)
- `Functions/autoframe_modelos.py` — autoframe_modelos.py — modelos de cliente do AutoFrame (aba "AutoFrame Customizado")
- `Functions/blender_cena.py` — Roda DENTRO do Blender (blender -b -P blender_cena.py -- cena.json): monta a cena dos objetos 3D do Vetor Kanivete e
- `Functions/blender_render.py` — blender_render.py — render fotorrealista dos objetos 3D do Vetor Kanivete (girar_3d / extrudar_3d) no Blender (Cycles)
- `Functions/cena3d.py` — cena3d.py — Cena 3D do Editor Kanivete (frontend/js/editor-3d.js): a página renderiza cada quadro com three.js (o MESMO
- `Functions/cerebro_local.py` — Retorna o caminho do cérebro ativo salvo
- `Functions/ceu.py` — Substituição de céu (Photo Kanivete: Editar › Substituição de céu, como o Photoshop) — a máscara do céu
- `Functions/compressor_imagem.py` — EXIF (data, câmera, GPS) e perfil de cor ICC para manter na imagem comprimida
- `Functions/compressor_video.py` — compressor_video.py — Compressor de Vídeo para o Canivete do Pailer
- `Functions/converterimagem.py` — converterimagem.py
- `Functions/convertermp3.py` — Conversor de áudio (e extração de áudio de vídeos) via ffmpeg
- `Functions/editor_imagem.py` — Editor de Imagem (frontend/js/imagem-*.js): abrir e salvar PSD/PSB e imagens comuns
- `Functions/efeitos_pr.py` — Efeitos de áudio do Premiere no Kanivete (frontend/dados/premiere_audio.json, gerado por tools/premiere_audio_dados.py)
- `Functions/encoder_monitor.py` — Monitor do Kanivete Encoder: CPU, RAM e placa de vídeo (NVIDIA: uso, encoder, decoder, memória) em tempo real e o
- `Functions/export_placa.py` — Exportação na placa de vídeo ("modo placa", Kanivete Encoder rodada 3): a timeline inteira montada na GPU, como o
- `Functions/faviconconverter.py` — faviconconverter.py
- `Functions/fontes.py` — fontes.py — famílias de fonte instaladas no Windows e os estilos de cada uma (Light, Regular, Semibold,
- `Functions/gdrive_dumper.py` — gdrive_dumper.py — Módulo do GDRIVE DUMPER para o Canivete do Pailer
- `Functions/gerador_imagem.py` — gerador_imagem.py — Gerar imagem com IA no Photo Kanivete (texto → imagem e edição com imagens de referência)
- `Functions/instancia_unica.py` — instancia_unica.py — Uma cópia só do app aberta
- `Functions/kani.py` — Kani — assistente de conversa do KANIVETE (tipo ChatGPT, local e offline), para tarefas do dia a dia e,
- `Functions/legendas.py` — legendas.py — transcrição da timeline do Pocket Editor (painel Texto: Transcrever / Criar legendas)
- `Functions/legendas_formatos.py` — SRT e VTT: blocos separados por linha em branco, com uma linha "início --> fim"
- `Functions/media_server.py` — media_server.py — Servidor HTTP local (127.0.0.1) para a interface reproduzir mídia
- `Functions/melhorar_audio.py` — Ferramenta Melhorar Áudio (como o Adobe Podcast Enhance): aceita áudio ou vídeo, um arquivo ou uma pasta
- `Functions/melhorar_audio_runner.py` — Melhorar áudio (estilo Adobe Podcast) — o trabalho pesado, em duas etapas:
- `Functions/memoria.py` — Modelos de IA carregados sob demanda saem da memória quando ficam parados
- `Functions/midia.py` — midia.py — utilidades compartilhadas de mídia (caminhos do app, ffmpeg/ffprobe, progresso)
- `Functions/omnivoice_runner.py` — Runner isolado para operacoes pesadas do OmniVoice
- `Functions/omnivoice_tool.py` — Ferramenta OmniVoice: geração e sintese de voz sob demanda
- `Functions/organizador_de_imagens.py` — limparduplicadas.py
- `Functions/organizador_de_videos.py` — organizador_de_videos.py
- `Functions/otimizar.py` — Forçar Full HD (painel Projeto): vídeo maior que Full HD (2K, 4K, 8K, em pé ou deitado) vira uma cópia com o lado
- `Functions/ponte_illustrator.py` — Ponte com o Adobe Illustrator instalado (COM + ExtendScript) — .ai NATIVO, com todas as pranchetas
- `Functions/ponte_premiere.py` — Ponte Kanivete ↔ Premiere Pro: conversa com o plugin UXP "Kanivete Ponte" (guia: Instructions/agente/ponte-premiere.md)
- `Functions/preencher_conteudo.py` — Preenchimento sensível ao conteúdo (Photo Kanivete: Editar › Preenchimento sensível ao conteúdo, como o Photoshop)
- `Functions/premiere.py` — Importar projeto do Premiere Pro (.prproj) no Editor Kanivete. Só LEITURA: o .prproj nunca é alterado
- `Functions/premiere_xml.py` — Exportar o projeto do Editor Kanivete (.vknv) como XML do Final Cut Pro 7 (xmeml v4), que o Premiere Pro abre
- `Functions/projeto.py` — projeto.py — Projetos do KANIVETE: .vknv = editor de vídeo (Pocket Editor), .iknv = editor de imagem
- `Functions/psd_import.py` — Importar PSD/PSB no editor com as camadas separadas (como o "Composição — manter tamanhos das camadas" do After
- `Functions/psd_so_modelo.py` — Moldes de objeto inteligente incorporado do Photoshop (PlLd + SoLd da camada e o lnk2 global com o arquivo),
- `Functions/psd_texto_modelo.py` — Moldes de camada de texto do Photoshop (bloco TySh), gerados pelo Photoshop 2026 (Arial 48 px de ponto e 36 px de
- `Functions/recorte_pro.py` — recorte_pro.py — Recorte profissional (Photo Kanivete: Remover plano de fundo; KNV.gerar recortar)
- `Functions/recuperar.py` — recuperar.py — o miolo das ferramentas de recuperação do Photo Kanivete (como as do Photoshop):
- `Functions/removerfundo.py` — removerfundo.py
- `Functions/render_cache.py` — Cache de render em disco do Pocket Editor (como os "Preview Files" do Premiere)
- `Functions/sincronizar.py` — Sincronizar clipes pelo áudio (como o "Sincronizar › Áudio" do Premiere): duas câmeras gravando a mesma cena
- `Functions/sk_banco_vozes.py` — Banco de vozes do Texto para Voz (Sound Kanivete)
- `Functions/sk_espectro.py` — Sound Kanivete — espectrograma, reparo espectral e separação voz/instrumental
- `Functions/sk_gravar.py` — Sound Kanivete — gravar do microfone (ou interface de áudio) direto num WAV 24 bits
- `Functions/snapshot_logger.py` — snapshot_logger.py — Backup/restauração para o Organizador de Vídeos
- `Functions/sound_kanivete.py` — Sound Kanivete (Sk) — editor de áudio multipista do KANIVETE (frontend/js/som-*.js)
- `Functions/soundboard.py` — soundboard.py — pack de efeitos sonoros do painel Soundboard do Pocket Editor
- `Functions/transcrever_cena.py` — transcrever_cena.py
- `Functions/transcreveraudio.py` — transcreveraudio.py
- `Functions/transicoes.py` — Transições de sobreposição do editor (estilo Mister Horse / Motion Bro): uma camada de ajuste por cima do corte que
- `Functions/updater.py` — updater.py — Atualização automática via GitHub Releases
- `Functions/vetor_exportar.py` — Vetor Kanivete: PDF para gráfica (fechamento de arquivo) — escrito à mão (content stream + pikepdf)
- `Functions/vetor_fonte.py` — Criar fonte própria no Vetor Kanivete: glifos desenhados em pranchetas → OpenType (.otf, contornos CFF cúbicos)
- `Functions/vetor_importar.py` — Vetor Kanivete: abrir PDF, AI, SVG e PowerPoint como documento vetorial editável (modelo em Instructions/vetor-kanivete.md)
- `Functions/vetor_kanivete.py` — Vetor Kanivete (estilo Illustrator): o lado Python do editor vetorial (frontend/js/vetor-*.js)
- `Functions/vetor_saida.py` — Vetor Kanivete — saídas para o mercado
- `Functions/video_cutter.py` — video_cutter.py — Motor do Pocket Editor (editor de vídeo do Canivete do Pailer)
- `Functions/videoconverter.py` — videoconverter.py — converte vídeos entre formatos, vídeo→GIF/MP3 e GIF→vídeo
- `Functions/videodownloader.py` — Traduz os erros mais comuns do yt-dlp para o usuário
- `Functions/webscraper.py` — 

## 11. Testes (`testes/`)
- `testes/teste_atributos.py` — Remover atributos e ajuste em grupo (editor-atributos.js) — abre um app próprio (porta 9334, dados em
- `testes/teste_barra.py` — Barra de tarefas contextual: alça move e lembra, Selecionar assunto / Remover fundo, × esconde só até o próximo clique
- `testes/teste_blender.py` — Teste do render fotorrealista (Vetor 3D → Blender), app em --agente=9333. Rápido (400 px, 24 amostras): copo (girar) com
- `testes/teste_cache_midia.py` — teste_cache_midia.py — A limpeza do cache de mídia (video_cutter.manutencao_midia) nunca apaga o que está em uso
- `testes/teste_cameraraw.py` — Filtro Camera Raw em janela própria (app em --agente=9333; não mexa no mouse durante). Arrasta uma barra com o
- `testes/teste_caneta.py` — Caneta, demarcadores, recuperação e laço magnético com mouse de verdade no app de teste (9333)
- `testes/teste_ceu.py` — Editar › Substituição de céu do Photo Kanivete (SkySeg) — app em --agente=9333
- `testes/teste_conteudo.py` — Editar › Preenchimento sensível ao conteúdo do Photo Kanivete (LaMa) — app em --agente=9333
- `testes/teste_corte_alt.py` — Máscara de corte com Alt + clique na divisa entre duas camadas (como no Photoshop), com mouse de verdade no app de
- `testes/teste_dissolver.py` — Filtro > Dissolver (Liquify) com mouse de verdade (app em --agente=9333; não mexa no mouse durante)
- `testes/teste_editar.py` — Editar › Atenuar, Colar especial (dentro/fora) e Localizar e substituir texto do Photo Kanivete (app em --agente=9333)
- `testes/teste_export.py` — teste_export.py — Confere a exportação do editor contra a prévia, quadro a quadro, e reprova se divergir
- `testes/teste_fila.py` — Fila de render do Editor (editor-fila.js) — abre um app próprio (porta 9334, dados em D:/kanivete_testes/fila),
- `testes/teste_filtros.py` — Aplica cada filtro do menu Filtro (valores padrão) numa foto e mede; confere que mudou a imagem e não deu erro
- `testes/teste_fonte.py` — Criar fonte própria no Vetor Kanivete (Texto › Criar fonte) — app em --agente=9333
- `testes/teste_galeria.py` — Filtro > Galeria de filtros (app em --agente=9333). Abre a janela, espera as miniaturas, troca de filtro, empilha
- `testes/teste_generativo.py` — Preenchimento generativo e Expansão generativa do Photo Kanivete (FLUX.2 klein local) — app em --agente=9333
- `testes/teste_guias.py` — Teste das guias/fatias como no Photoshop, com mouse de verdade no app de teste (9333)
- `testes/teste_illustrator.py` — Compatibilidade Vetor Kanivete ↔ Adobe Illustrator (Functions/ponte_illustrator.py) — app em --agente=9333 e o
- `testes/teste_imagem.py` — Teste do Editor de Imagem (frontend/js/imagem-*.js + Functions/editor_imagem.py) no app de verdade
- `testes/teste_kani.py` — Kani (assistente) — abre um app próprio (porta 9334, dados em D:/kanivete_testes/fila) e confere: bolinha na Home,
- `testes/teste_laco.py` — Laço: Shift soma, Alt subtrai, Shift+Alt cruza; o mesmo no magnético; Ctrl+clique na miniatura seleciona a camada
- `testes/teste_mixer.py` — Mixer de trilhas de áudio (editor-mixer.js): Premiere → Kanivete → XML do Premiere e a conta do som na exportação
- `testes/teste_pincel.py` — Pincel do Photo Kanivete: traço macio liso e pintura fluida em documento grande (app em --agente=9333)
- `testes/teste_play.py` — teste_play.py — Mede o play do Pocket Editor no app de verdade (modo agente) e reprova se engasgar
- `testes/teste_ponte.py` — Teste da ponte Vetor <-> Photo (app em --agente=9333). Ponte Vetor ↔ Photo: objeto inteligente vetorial (ida, filtro inteligente, ampliar sem pixeliza
- `testes/teste_pranchetas.py` — Pranchetas do Vetor Kanivete como no Illustrator — app em --agente=9333
- `testes/teste_premiere.py` — Confere a importação de um projeto do Premiere (Functions/premiere.py) contra o próprio XML do .prproj
- `testes/teste_premiere_xml.py` — Teste da exportação para o Premiere (XML do Final Cut Pro 7): Functions/premiere_xml.py
- `testes/teste_psd_deg_app.py` — Uso: py -3.13 testes/teste_psd_deg_app.py [--photoshop] (app em --agente=9333)
- `testes/teste_psd_forma.py` — Forma criada no Photo Kanivete → camada de forma EDITÁVEL no PSD (Functions/editor_imagem._forma_nova)
- `testes/teste_psd_pre.py` — Camada de preenchimento de cor sólida do Photo Kanivete → camada de preenchimento no PSD (editor_imagem._preenchimento)
- `testes/teste_psd_refs.py` — PSD salvo por cima (ida e volta) não pode trocar pixels entre camadas (2026-10-06: o carrossel do cliente voltou com
- `testes/teste_psd_so.py` — Objeto inteligente criado no Photo Kanivete → objeto inteligente INCORPORADO no PSD (Functions/editor_imagem._so_novo)
- `testes/teste_psd_texto.py` — Texto criado no Photo Kanivete → camada de texto EDITÁVEL no PSD (Functions/editor_imagem._texto_novo)
- `testes/teste_som.py` — Sound Kanivete (som.js + Functions/sound_kanivete.py) — app em --agente=9333, mouse de verdade
- `testes/teste_vetor.py` — Teste do Vetor Kanivete pela API real (app em --agente=9333): monta um cartão de visita pelos comandos (window.VKN),
- `testes/teste_vetor_editor3d.py` — Teste da ponte Vetor → Editor (Cena 3D), app em --agente=9333: copo (girar) com rótulo coral, caixa (extrudar com
- `testes/teste_vetor_paineis.py` — Painéis móveis do Vetor Kanivete (vetor-dock.js, o mecanismo do Photo) — app em --agente=9333, mouse de verdade
