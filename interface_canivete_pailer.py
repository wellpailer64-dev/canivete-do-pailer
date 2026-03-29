import threading
import sys
import os
from tkinter import Tk, Toplevel, Button, Label, filedialog, Text, END, Frame
from tkinter.ttk import Progressbar, Style
from PIL import Image, ImageTk
from organizador_de_imagens import limpar_pasta
from convertermp3 import converter_pasta, converter_arquivos
from converterimagem import (converter_pasta as img_converter_pasta,
                              converter_arquivos as img_converter_arquivos,
                              FORMATOS_SAIDA)
from transcreveraudio import (transcrever_pasta, transcrever_audios, MODELOS)
from faviconconverter import gerar_favicon
from organizador_de_videos import organizar_videos
from transcrever_cena import analisar_e_renomear_pasta
from snapshot_logger import restaurar_backup, aplicar_nextup
from gdrive_dumper import (extract_folder_id, verificar_rclone, verificar_gdrive_configurado,
                           calcular_tamanho_pasta, dump_pasta)
from atualizador import verificar_em_background, baixar_e_aplicar, get_versao_local
from compressor_video import (listar_videos, comprimir_lista, get_info_video,
                              EXTENSOES_VIDEO, QUALIDADE_PADRAO, _fmt_tamanho)
from removerfundo import remover_fundo_pasta, remover_fundo_arquivos
from setup_modelos import verificar_modelos, tudo_instalado

# Flag global — impede múltiplas janelas de setup
_SETUP_RODANDO = False

try:
    import playsound
    PLAYSOUND_OK = True
except ImportError:
    PLAYSOUND_OK = False


# =========================
# 🔍 HELPER
# =========================
def resource_path(filename):
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, filename)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)


def tocar(arquivo):
    def _play():
        try:
            path = resource_path(arquivo)
            # Tenta winsound primeiro (Windows nativo, sem problemas de path)
            try:
                import winsound
                winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_ASYNC)
                return
            except Exception:
                pass
            # Fallback: playsound
            if PLAYSOUND_OK:
                playsound.playsound(path, block=False)
        except Exception:
            pass
    threading.Thread(target=_play, daemon=True).start()


def abrir_pasta(path):
    """Abre a pasta no Explorer do Windows."""
    try:
        os.startfile(path)
    except Exception:
        pass


# =========================
# 🎨 SPLASH SCREEN
# =========================
def mostrar_splash(depois):
    # Pré-carrega imagem e som ANTES de montar a janela
    splash_img   = None
    splash_photo = None
    try:
        splash_img   = Image.open(resource_path("splash.png")).resize((220, 220), Image.LANCZOS)
    except Exception:
        pass

    splash = Tk()
    splash.overrideredirect(True)
    largura, altura = 360, 420
    x = (splash.winfo_screenwidth()  // 2) - (largura // 2)
    y = (splash.winfo_screenheight() // 2) - (altura  // 2)
    splash.geometry(f"{largura}x{altura}+{x}+{y}")
    splash.configure(bg="#F97316")

    # Exibe imagem pré-carregada
    if splash_img:
        try:
            splash_photo = ImageTk.PhotoImage(splash_img)
            lbl = Label(splash, image=splash_photo, bg="#F97316", bd=0)
            lbl.image = splash_photo  # mantém referência
            lbl.pack(pady=(40, 10))
        except Exception:
            Label(splash, text="🔧", font=("Segoe UI", 60), bg="#F97316").pack(pady=(40, 10))
    else:
        Label(splash, text="🔧", font=("Segoe UI", 60), bg="#F97316").pack(pady=(40, 10))

    Label(splash, text="Canivete do Pailer",
          font=("Segoe UI", 16, "bold"), bg="#F97316", fg="#0F0F0F").pack()
    Label(splash, text="Ferramentas para o dia a dia",
          font=("Segoe UI", 10), bg="#F97316", fg="#1C1C1C").pack(pady=(4, 0))
    Label(splash, text="Carregando...",
          font=("Segoe UI", 9), bg="#F97316", fg="#1C1C1C").pack(pady=(18, 0))

    # Força renderização da janela antes de tocar o som
    splash.update()
    tocar("splash.wav")

    splash.after(2800, lambda: [splash.destroy(), depois()])
    splash.mainloop()


# =========================
# 🏠 HUB PRINCIPAL
# =========================
def mostrar_popup_cafe(pai, depois):
    """
    Popup animado com cafézinho enquanto a IA trabalha.
    Centralizado na janela pai. Fecha quando _fechar() é chamado.
    """
    popup = Toplevel(pai)
    popup.title("")
    popup.overrideredirect(True)
    largura, altura = 400, 280

    # Centraliza em relação à janela pai
    pai.update_idletasks()
    px = pai.winfo_rootx()
    py = pai.winfo_rooty()
    pw = pai.winfo_width()
    ph = pai.winfo_height()
    x  = px + (pw  // 2) - (largura // 2)
    y  = py + (ph  // 2) - (altura  // 2)
    popup.geometry(f"{largura}x{altura}+{x}+{y}")
    popup.configure(bg="#1C1C1C", relief="flat")
    popup.attributes("-topmost", True)

    # Borda laranja
    Frame(popup, bg="#F97316", height=3).pack(fill="x", side="top")
    Frame(popup, bg="#F97316", height=3).pack(fill="x", side="bottom")

    # Frames da animação do café
    frames_cafe = [
        "(o.o)  \n(> <)  \n☕  ~",
        "(^.^)  \n(> <)  \n☕ ~~",
        "(o.o)  \n(> <)  \n☕ ~ ~",
        "(-.-) zZ\n(> <)  \n☕  ~~",
    ]

    import tkinter as _tk

    lbl_cafe = Label(popup, text=frames_cafe[0],
                     font=("Consolas", 16), bg="#1C1C1C",
                     fg="#F97316", justify="center")
    lbl_cafe.pack(pady=(22, 4))

    Label(popup, text="Agora tome um cafézin...",
          font=("Segoe UI", 11, "bold"), bg="#1C1C1C",
          fg="#CCCCCC").pack()

    Label(popup, text="Me deixe trabalhar  🤙",
          font=("Segoe UI", 9), bg="#1C1C1C",
          fg="#888888").pack(pady=(2, 10))

    # Barra de progresso
    from tkinter.ttk import Progressbar as _PB, Style as _St
    _st = _St()
    _st.theme_use("clam")
    _st.configure("Cafe.Horizontal.TProgressbar",
                  troughcolor="#2A2A2A", background="#F97316",
                  bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")
    pb_cafe = _PB(popup, length=340, mode="determinate",
                  style="Cafe.Horizontal.TProgressbar")
    pb_cafe.pack(pady=(0, 4))

    lbl_pct = Label(popup, text="0%",
                    font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#F97316")
    lbl_pct.pack(pady=(0, 12))

    popup._frame_idx = [0]
    popup._aberto    = [True]
    popup._pb        = pb_cafe
    popup._lbl_pct   = lbl_pct

    def animar():
        if not popup._aberto[0]:
            return
        try:
            popup._frame_idx[0] = (popup._frame_idx[0] + 1) % len(frames_cafe)
            lbl_cafe.config(text=frames_cafe[popup._frame_idx[0]])
            popup.after(400, animar)
        except Exception:
            pass

    def fechar_popup():
        popup._aberto[0] = False
        try:
            popup.destroy()
        except Exception:
            pass

    def atualizar_cafe(valor, texto=""):
        if not popup._aberto[0]:
            return
        try:
            popup._pb["value"]  = valor
            popup._lbl_pct.config(text=f"{int(valor)}%  {texto}")
        except Exception:
            pass

    popup.after(200, animar)
    popup._fechar   = fechar_popup
    popup._progress = atualizar_cafe
    return popup


def _hover(frame, bg, fg):
    """Efeito hover nos cards do hub."""
    frame.configure(bg=bg)
    for child in frame.winfo_children():
        child.configure(bg=bg)



# =========================
# 🔄 POPUP DE ATUALIZAÇÃO
# =========================
def _mostrar_popup_update(hub, versao_nova):
    """Popup que aparece quando há uma versão nova disponível."""
    from tkinter.ttk import Progressbar, Style

    popup = Toplevel(hub)
    popup.title("Atualização disponível")
    popup.overrideredirect(True)
    popup.configure(bg="#1C1C1C", relief="flat")
    popup.attributes("-topmost", True)

    largura, altura = 420, 300
    hub.update_idletasks()
    px = hub.winfo_rootx()
    py = hub.winfo_rooty()
    pw = hub.winfo_width()
    ph = hub.winfo_height()
    x  = px + (pw // 2) - (largura // 2)
    y  = py + (ph // 2) - (altura  // 2)
    popup.geometry(f"{largura}x{altura}+{x}+{y}")

    try:
        popup.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    # Borda laranja
    Frame(popup, bg="#F97316", height=3).pack(fill="x", side="top")
    Frame(popup, bg="#F97316", height=3).pack(fill="x", side="bottom")

    # Ícone + título
    Label(popup, text="🚀", font=("Segoe UI", 32), bg="#1C1C1C").pack(pady=(18, 4))
    Label(popup, text="Nova versão disponível!",
          font=("Segoe UI", 13, "bold"), bg="#1C1C1C", fg="#F97316").pack()
    Label(popup, text=f"Canivete do Pailer  v{versao_nova}",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(4, 0))
    Label(popup, text="O app será atualizado e reiniciado automaticamente.",
          font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888",
          wraplength=360).pack(pady=(4, 0))

    # Busca notas de melhoria do GitHub
    def _buscar_notas():
        try:
            import urllib.request as _ur
            url = (f"https://api.github.com/repos/wellpailer64-dev/"
                   f"canivete-do-pailer/releases/latest")
            req = _ur.Request(url, headers={"User-Agent": "CaniveteUpdater"})
            with _ur.urlopen(req, timeout=6) as r:
                import json as _json
                data = _json.loads(r.read())
                notas = data.get("body", "").strip()
                if notas:
                    # Limita a 3 linhas
                    linhas = [l for l in notas.split("\n") if l.strip()][:4]
                    texto  = "\n".join(linhas)
                    popup.after(0, lambda: lbl_notas.config(
                        text=texto, fg="#AAAAAA"))
        except Exception:
            pass

    lbl_notas = Label(popup, text="Buscando novidades…",
                      font=("Segoe UI", 8), bg="#1C1C1C", fg="#555555",
                      wraplength=380, justify="left")
    lbl_notas.pack(padx=20, pady=(6, 10))
    threading.Thread(target=_buscar_notas, daemon=True).start()

    # Progressbar (aparece só durante o download)
    style = Style()
    style.theme_use("clam")
    style.configure("Update.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")
    pb = Progressbar(popup, length=360, mode="determinate",
                     style="Update.Horizontal.TProgressbar")

    lbl_status = Label(popup, text="", font=("Consolas", 8),
                       bg="#1C1C1C", fg="#F97316")

    # Botões
    frame_btns = Frame(popup, bg="#1C1C1C")
    frame_btns.pack(pady=4)

    btn_s = dict(font=("Segoe UI", 10, "bold"), bd=0, relief="flat",
                 cursor="hand2", padx=16, pady=8)

    def iniciar_update():
        btn_update.config(state="disabled", text="Baixando…")
        btn_pular.config(state="disabled")
        pb.pack(pady=(8, 2))
        lbl_status.pack()

        def _prog(pct, txt):
            popup.after(0, lambda: pb.config(
                value=pct if pct >= 0 else 0,
                mode="determinate" if pct >= 0 else "indeterminate"))
            popup.after(0, lambda: lbl_status.config(text=txt))
            if pct < 0:
                popup.after(0, pb.start)

        def _log(msg):
            popup.after(0, lambda: lbl_status.config(text=msg))

        def _rodar():
            sucesso = baixar_e_aplicar(
                versao_nova,
                callback_progresso=_prog,
                callback_log=_log)
            if sucesso:
                popup.after(0, lambda: lbl_status.config(
                    text="✅ Pronto! Reiniciando em 2 segundos…", fg="#4CAF50"))
                # Fecha popup e hub antes do bat matar o processo
                def _fechar_tudo():
                    try:
                        popup.destroy()
                    except Exception:
                        pass
                    try:
                        hub.destroy()
                    except Exception:
                        pass
                popup.after(1800, _fechar_tudo)
            else:
                popup.after(0, lambda: btn_pular.config(state="normal"))
                popup.after(0, lambda: btn_update.config(
                    state="normal", text="🔄 Tentar novamente"))

        threading.Thread(target=_rodar, daemon=True).start()

    btn_update = Button(frame_btns, text="⬇  Atualizar agora",
                        bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                        command=iniciar_update, **btn_s)
    btn_update.pack(side="left", padx=6)

    btn_pular = Button(frame_btns, text="Agora não",
                       bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                       command=popup.destroy, **btn_s)
    btn_pular.pack(side="left", padx=6)


def abrir_hub():
    hub = Tk()
    hub.title("Canivete do Pailer")
    try:
        hub.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 420
    x = (hub.winfo_screenwidth()  // 2) - (largura // 2)
    y = (hub.winfo_screenheight() // 2) - (altura  // 2)
    hub.geometry(f"{largura}x{altura}+{x}+{y}")
    hub.minsize(480, 360)
    hub.configure(bg="#1C1C1C")

    # Header
    frame_header = Frame(hub, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Canivete do Pailer",
          font=("Segoe UI", 13, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(hub, text="Selecione uma ferramenta para começar",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#AAAAAA").pack(pady=(18, 10))

    # Grade de botões 3 colunas
    frame_grid = Frame(hub, bg="#1C1C1C")
    frame_grid.pack(fill="both", expand=True, padx=20, pady=(0, 10))

    # Configura colunas com peso igual para expandir
    for col in range(3):
        frame_grid.columnconfigure(col, weight=1)

    ferramentas = [
        ("🗂️", "Organizador de Imagens",  lambda: [hub.withdraw(), abrir_organizador_janela(hub)],      "#F97316", "#0F0F0F"),
        ("🎵", "Converter para MP3",       lambda: [hub.withdraw(), abrir_conversor_janela(hub)],         "#2A2A2A", "#F97316"),
        ("🖼️", "Converter Imagens",        lambda: [hub.withdraw(), abrir_conversor_imagem_janela(hub)],  "#2A2A2A", "#F97316"),
        ("🎙️", "Transcrever Audios",       lambda: [hub.withdraw(), abrir_transcricao_janela(hub)],       "#2A2A2A", "#F97316"),
        ("🌐", "Favicon Generator",        lambda: [hub.withdraw(), abrir_favicon_janela(hub)],           "#2A2A2A", "#F97316"),
        ("✂️", "Remover Fundo",            lambda: [hub.withdraw(), abrir_remover_fundo_janela(hub)],     "#2A2A2A", "#F97316"),
        ("🎬", "Logger Brabo",              lambda: [hub.withdraw(), abrir_org_videos_janela(hub)],        "#2A2A2A", "#F97316"),
        ("☁️", "GDrive Dumper",            lambda: [hub.withdraw(), abrir_gdrive_dumper_janela(hub)],     "#2A2A2A", "#F97316"),
        ("🗜️", "Compressor de Vídeo",      lambda: [hub.withdraw(), abrir_compressor_video_janela(hub)], "#2A2A2A", "#F97316"),
    ]

    for i, (emoji, texto, cmd, bg, fg) in enumerate(ferramentas):
        linha = i // 3
        col   = i % 3
        frame_btn = Frame(frame_grid, bg=bg, cursor="hand2")
        frame_btn.grid(row=linha, column=col, padx=6, pady=6, sticky="nsew")
        frame_grid.rowconfigure(linha, weight=1)

        Label(frame_btn, text=emoji, font=("Segoe UI", 22),
              bg=bg, fg=fg).pack(pady=(14, 2))
        Label(frame_btn, text=texto, font=("Segoe UI", 9, "bold"),
              bg=bg, fg=fg, justify="center").pack(pady=(0, 14))

        # Clique em qualquer parte do card
        action = cmd
        frame_btn.bind("<Button-1>", lambda e, c=action: c())
        for child in frame_btn.winfo_children():
            child.bind("<Button-1>", lambda e, c=action: c())

        # Hover
        hover_bg = "#e06510" if bg == "#F97316" else "#3a3a3a"
        frame_btn.bind("<Enter>", lambda e, f=frame_btn, h=hover_bg, c=fg: _hover(f, h, c))
        frame_btn.bind("<Leave>", lambda e, f=frame_btn, o=bg, c=fg: _hover(f, o, c))

    # Versão no rodapé
    versao_local = get_versao_local()
    Label(hub, text=f"Canivete do Pailer © 2025  •  v{versao_local}",
          font=("Segoe UI", 8), bg="#1C1C1C", fg="#444444").pack(side="bottom", pady=6)

    # Verifica atualização em background — não bloqueia o hub
    def _quando_tiver_update(versao_nova):
        hub.after(0, lambda: _mostrar_popup_update(hub, versao_nova))

    verificar_em_background(_quando_tiver_update)

    hub.mainloop()


# =========================
# 🗂️ ORGANIZADOR DE IMAGENS
# =========================
def abrir_organizador_janela(hub):
    win = Toplevel()
    win.title("🗂️ Organizador de Imagens — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 580
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, False)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Organizador de Imagens",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    label = Label(win, text="Selecione uma pasta para analisar",
                  font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC")
    label.pack(pady=(14, 4))

    btn_s = {"font": ("Segoe UI", 10, "bold"), "width": 22,
             "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}

    frame_botoes = Frame(win, bg="#1C1C1C")
    frame_botoes.pack()

    def selecionar_pasta():
        pasta = filedialog.askdirectory()
        if pasta:
            win.pasta = pasta
            label.config(text=f"📂  {pasta}")
            botao_rodar.config(state="normal")
            botao_cena.config(state="normal")

    botao_sel = Button(frame_botoes, text="📂  Selecionar Pasta",
                       bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                       command=selecionar_pasta, **btn_s)
    botao_sel.pack(side="left", padx=6)

    botao_rodar = Button(frame_botoes, text="▶  Rodar Limpeza",
                         bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                         state="disabled", **btn_s)
    botao_rodar.pack(side="left", padx=6)

    progress = Progressbar(win, length=500, mode='determinate',
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(14, 2))

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    frame_cont = Frame(win, bg="#242424")
    frame_cont.pack(fill="x", padx=28, pady=10)

    contadores = {}
    for chave, texto in [("total", "📋  Total analisado"),
                         ("logos", "🎨  Logos / ícones"),
                         ("thumbs", "🔹  Thumbs"),
                         ("repetidas", "📦  Repetidas"),
                         ("graficos", "📊  Gráficos"),
                         ("fotos", "✨  Fotos boas")]:
        row = Frame(frame_cont, bg="#242424")
        row.pack(fill="x", padx=12, pady=2)
        Label(row, text=texto, width=22, anchor="w",
              font=("Segoe UI", 9), bg="#242424", fg="#CCCCCC").pack(side="left")
        lbl = Label(row, text="—", width=6, anchor="e",
                    font=("Segoe UI", 9, "bold"), bg="#242424", fg="#F97316")
        lbl.pack(side="left")
        contadores[chave] = lbl

    log_box = Text(win, height=9, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(4, 14), padx=28)

    def atualizar_progresso(valor, texto):
        progress['value'] = valor
        status_label.config(text=texto)
        win.update_idletasks()

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def rodar_em_thread():
        botao_rodar.config(state="disabled")
        botao_sel.config(state="disabled")
        for lbl in contadores.values():
            lbl.config(text="—")
        log_box.delete("1.0", END)
        progress['value'] = 0
        status_label.config(text="Processando...")

        try:
            resultado = limpar_pasta(win.pasta,
                                     callback_progresso=atualizar_progresso,
                                     callback_log=log)
            log("\n" + "="*45)
            log("🔥 FINALIZADO")
            log("="*45)
            log(f"  Total analisado    : {resultado['total_analisado']}")
            log(f"  🎨 Logos/ícones    : {resultado['logos_icones']}  → /logos_e_icones")
            log(f"  🔹 Thumbs          : {resultado['thumbs']}  → /thumbs")
            log(f"  📦 Repetidas       : {resultado['repetidas']}  → /repetidas")
            log(f"  📊 Gráficos        : {resultado['graficos']}  → /graficos")
            log(f"  ✨ Fotos boas      : {resultado['fotos_boas']}  → /fotos_boas")

            contadores['total'].config(text=str(resultado['total_analisado']))
            contadores['logos'].config(text=str(resultado['logos_icones']))
            contadores['thumbs'].config(text=str(resultado['thumbs']))
            contadores['repetidas'].config(text=str(resultado['repetidas']))
            contadores['graficos'].config(text=str(resultado['graficos']))
            contadores['fotos'].config(text=str(resultado['fotos_boas']))
            status_label.config(text="✅ Limpeza concluída!")
            tocar("concluido.wav")

        except Exception as e:
            log(f"❌ ERRO: {e}")
            status_label.config(text="❌ Erro durante a limpeza")
        finally:
            botao_rodar.config(state="normal")
            botao_sel.config(state="normal")

    botao_rodar.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())

    def rodar_backup_thread():
        path_bk = filedialog.askopenfilename(
            parent=win,
            title="Selecionar BACKUP.json",
            filetypes=[("BACKUP Logger Brabo", "BACKUP.json"), ("JSON", "*.json")]
        )
        if not path_bk:
            return

        botao_backup.config(state="disabled")
        botao_rodar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Restaurando organização anterior...")

        def _rodar():
            try:
                log(f"↩️  Carregando BACKUP: {os.path.basename(path_bk)}")
                resultado = restaurar_backup(
                    path_bk,
                    callback_progresso=atualizar_progresso,
                    callback_log=log
                )
                if resultado["sucesso"]:
                    status_label.config(text="✅ Organização restaurada com sucesso!")
                    tocar("concluido.wav")
                else:
                    status_label.config(text=f"⚠️  Restaurado com {resultado['falhas']} falha(s)")
                log(f"\n✅ Restaurados: {resultado['restaurados']} | ❌ Falhas: {resultado['falhas']}")
            except Exception as e:
                log(f"❌ ERRO: {e}")
                import traceback
                log(traceback.format_exc()[-300:])
                status_label.config(text="❌ Erro ao restaurar")
            finally:
                botao_backup.config(state="normal")
                botao_rodar.config(state="normal")

        threading.Thread(target=_rodar, daemon=True).start()

    botao_backup.config(command=rodar_backup_thread)

    def rodar_nextup_thread():
        path_nu = filedialog.askopenfilename(
            parent=win,
            title="Selecionar NEXTUP.json",
            filetypes=[("NEXTUP Logger Brabo", "NEXTUP.json"), ("JSON", "*.json")]
        )
        if not path_nu:
            return

        pasta_dest = filedialog.askdirectory(
            parent=win,
            title="Selecionar pasta com os arquivos a organizar"
        )
        if not pasta_dest:
            return

        botao_nextup.config(state="disabled")
        botao_rodar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Aplicando organização do NEXTUP...")

        def _rodar():
            try:
                log(f"📥 Carregando NEXTUP: {os.path.basename(path_nu)}")
                log(f"📂 Pasta alvo: {pasta_dest}")
                resultado = aplicar_nextup(
                    path_nu,
                    pasta_dest,
                    callback_progresso=atualizar_progresso,
                    callback_log=log
                )
                if resultado["sucesso"]:
                    status_label.config(text="✅ NEXTUP aplicado com sucesso!")
                    tocar("concluido.wav")
                else:
                    status_label.config(
                        text=f"⚠️  Aplicado com {resultado['nao_encontrados']} não encontrados"
                    )
                log(f"\n✅ Aplicados       : {resultado['aplicados']}")
                log(f"   ⚠️  Não encontrados: {resultado['nao_encontrados']}")
                log(f"   ❌ Falhas          : {resultado['falhas']}")
            except Exception as e:
                log(f"❌ ERRO: {e}")
                import traceback
                log(traceback.format_exc()[-300:])
                status_label.config(text="❌ Erro ao aplicar NEXTUP")
            finally:
                botao_nextup.config(state="normal")
                botao_rodar.config(state="normal")

        threading.Thread(target=_rodar, daemon=True).start()

    botao_nextup.config(command=rodar_nextup_thread)


# =========================
# 🎵 CONVERSOR MP3
# =========================
def abrir_conversor_janela(hub):
    win = Toplevel()
    win.title("🎵 Converter para MP3 — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 500
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, False)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Converter para MP3",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(win, text="Selecione uma pasta ou arquivos para converter",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 4))

    btn_s = {"font": ("Segoe UI", 10, "bold"), "width": 20,
             "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}

    frame_botoes = Frame(win, bg="#1C1C1C")
    frame_botoes.pack()

    win.modo    = None
    win.selecao = None

    status_sel = Label(win, text="", font=("Segoe UI", 9),
                       bg="#1C1C1C", fg="#AAAAAA", wraplength=500)
    status_sel.pack(pady=(6, 0))

    def selecionar_pasta():
        pasta = filedialog.askdirectory()
        if pasta:
            win.modo    = "pasta"
            win.selecao = pasta
            status_sel.config(text=f"📂  {pasta}")
            botao_converter.config(state="normal")

    def selecionar_arquivos():
        arquivos = filedialog.askopenfilenames(
            parent=win,
            title="Selecionar arquivos",
            filetypes=[("Áudio/Vídeo", "*.wav *.ogg *.flac *.aac *.mp4 *.m4a *.m4v *.webm *.mkv *.avi *.mov")]
        )
        if arquivos:
            win.modo    = "arquivos"
            win.selecao = list(arquivos)
            status_sel.config(text=f"🎵  {len(arquivos)} arquivo(s) selecionado(s)")
            botao_converter.config(state="normal")

    Button(frame_botoes, text="📂  Pasta Inteira",
           bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
           command=selecionar_pasta, **btn_s).pack(side="left", padx=6)

    Button(frame_botoes, text="🎵  Arquivos Avulsos",
           bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
           command=selecionar_arquivos, **btn_s).pack(side="left", padx=6)

    progress = Progressbar(win, length=500, mode='determinate',
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(16, 2))

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    frame_cont = Frame(win, bg="#242424")
    frame_cont.pack(fill="x", padx=28, pady=10)

    contadores = {}
    for chave, texto in [("total", "📋  Total encontrado"),
                         ("convertidos", "✅  Convertidos"),
                         ("falhas", "❌  Falhas")]:
        row = Frame(frame_cont, bg="#242424")
        row.pack(fill="x", padx=12, pady=2)
        Label(row, text=texto, width=22, anchor="w",
              font=("Segoe UI", 9), bg="#242424", fg="#CCCCCC").pack(side="left")
        lbl = Label(row, text="—", width=6, anchor="e",
                    font=("Segoe UI", 9, "bold"), bg="#242424", fg="#F97316")
        lbl.pack(side="left")
        contadores[chave] = lbl

    log_box = Text(win, height=8, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(4, 8), padx=28)

    botao_converter = Button(win, text="▶  Converter Agora",
                             bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                             state="disabled",
                             font=("Segoe UI", 10, "bold"), width=22,
                             bd=0, cursor="hand2", relief="flat", pady=6)
    botao_converter.pack(pady=(0, 12))

    def atualizar_progresso(valor, texto):
        progress['value'] = valor
        status_label.config(text=texto)
        win.update_idletasks()

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def rodar_em_thread():
        botao_converter.config(state="disabled")
        log_box.delete("1.0", END)
        progress['value'] = 0
        for lbl in contadores.values():
            lbl.config(text="—")
        status_label.config(text="Convertendo...")

        try:
            if win.modo == "pasta":
                resultado = converter_pasta(win.selecao,
                                            callback_progresso=atualizar_progresso,
                                            callback_log=log)
            else:
                resultado = converter_arquivos(win.selecao,
                                               callback_progresso=atualizar_progresso,
                                               callback_log=log)

            log("\n" + "="*45)
            log("🔥 FINALIZADO")
            log("="*45)
            log(f"  Total      : {resultado['total']}")
            log(f"  Convertidos: {resultado['convertidos']}")
            log(f"  Falhas     : {resultado['falhas']}")

            contadores['total'].config(text=str(resultado['total']))
            contadores['convertidos'].config(text=str(resultado['convertidos']))
            contadores['falhas'].config(text=str(resultado['falhas']))
            status_label.config(text="✅ Conversão concluída!")
            tocar("concluido.wav")
            abrir_pasta(os.path.dirname(win.selecao) if win.modo == "arquivos" else win.selecao)

        except Exception as e:
            log(f"❌ ERRO: {e}")
            status_label.config(text="❌ Erro durante a conversão")
        finally:
            botao_converter.config(state="normal")

    botao_converter.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())


# =========================
# 🖼️ CONVERSOR DE IMAGENS
# =========================
def abrir_conversor_imagem_janela(hub):
    win = Toplevel()
    win.title("🖼️ Converter Imagens — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 520
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, False)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Converter Imagens",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(win, text="Selecione o formato de saída:",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 4))

    # Seletor de formato
    import tkinter as tk
    formatos = list(FORMATOS_SAIDA.keys())
    formato_var = tk.StringVar(value="WEBP")

    frame_formatos = Frame(win, bg="#1C1C1C")
    frame_formatos.pack()
    for fmt in formatos:
        tk.Radiobutton(
            frame_formatos, text=fmt, variable=formato_var, value=fmt,
            bg="#1C1C1C", fg="#F97316", selectcolor="#2A2A2A",
            activebackground="#1C1C1C", activeforeground="#F97316",
            font=("Segoe UI", 9, "bold"), cursor="hand2"
        ).pack(side="left", padx=6)

    Label(win, text="Selecione uma pasta ou arquivos para converter",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(12, 4))

    btn_s = {"font": ("Segoe UI", 10, "bold"), "width": 20,
             "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}
    frame_botoes = Frame(win, bg="#1C1C1C")
    frame_botoes.pack()

    win.modo    = None
    win.selecao = None

    status_sel = Label(win, text="", font=("Segoe UI", 9),
                       bg="#1C1C1C", fg="#AAAAAA", wraplength=500)
    status_sel.pack(pady=(6, 0))

    def selecionar_pasta():
        pasta = filedialog.askdirectory()
        if pasta:
            win.modo    = "pasta"
            win.selecao = pasta
            status_sel.config(text=f"📂  {pasta}")
            botao_converter.config(state="normal")

    def selecionar_arquivos():
        arquivos = filedialog.askopenfilenames(
            parent=win,
            title="Selecionar imagens",
            filetypes=[("Imagens", "*.webp *.png *.jpg *.jpeg *.bmp *.tiff *.tif *.gif *.ico *.tga *.ppm")]
        )
        if arquivos:
            win.modo    = "arquivos"
            win.selecao = list(arquivos)
            status_sel.config(text=f"🖼️  {len(arquivos)} imagem(ns) selecionada(s)")
            botao_converter.config(state="normal")

    Button(frame_botoes, text="📂  Pasta Inteira",
           bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
           command=selecionar_pasta, **btn_s).pack(side="left", padx=6)

    Button(frame_botoes, text="🖼️  Arquivos Avulsos",
           bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
           command=selecionar_arquivos, **btn_s).pack(side="left", padx=6)

    progress = Progressbar(win, length=500, mode='determinate',
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(16, 2))

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    frame_cont = Frame(win, bg="#242424")
    frame_cont.pack(fill="x", padx=28, pady=8)

    contadores = {}
    for chave, texto in [("total", "📋  Total encontrado"),
                         ("convertidos", "✅  Convertidos"),
                         ("falhas", "❌  Falhas")]:
        row = Frame(frame_cont, bg="#242424")
        row.pack(fill="x", padx=12, pady=2)
        Label(row, text=texto, width=22, anchor="w",
              font=("Segoe UI", 9), bg="#242424", fg="#CCCCCC").pack(side="left")
        lbl = Label(row, text="—", width=6, anchor="e",
                    font=("Segoe UI", 9, "bold"), bg="#242424", fg="#F97316")
        lbl.pack(side="left")
        contadores[chave] = lbl

    log_box = Text(win, height=7, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(4, 8), padx=28)

    botao_converter = Button(win, text="▶  Converter Agora",
                             bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                             state="disabled",
                             font=("Segoe UI", 10, "bold"), width=22,
                             bd=0, cursor="hand2", relief="flat", pady=6)
    botao_converter.pack(pady=(0, 12))

    def atualizar_progresso(valor, texto):
        progress['value'] = valor
        status_label.config(text=texto)
        win.update_idletasks()

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def rodar_em_thread():
        botao_converter.config(state="disabled")
        log_box.delete("1.0", END)
        progress['value'] = 0
        for lbl in contadores.values():
            lbl.config(text="—")
        fmt = formato_var.get()
        status_label.config(text=f"Convertendo para {fmt}...")

        try:
            if win.modo == "pasta":
                resultado = img_converter_pasta(win.selecao, fmt,
                                                callback_progresso=atualizar_progresso,
                                                callback_log=log)
            else:
                resultado = img_converter_arquivos(win.selecao, fmt,
                                                   callback_progresso=atualizar_progresso,
                                                   callback_log=log)

            log("\n" + "="*45)
            log("🔥 FINALIZADO")
            log("="*45)
            log(f"  Total      : {resultado['total']}")
            log(f"  Convertidos: {resultado['convertidos']}")
            log(f"  Falhas     : {resultado['falhas']}")
            log(f"  Salvos em  : /convertidas")

            contadores['total'].config(text=str(resultado['total']))
            contadores['convertidos'].config(text=str(resultado['convertidos']))
            contadores['falhas'].config(text=str(resultado['falhas']))
            status_label.config(text=f"✅ Conversão para {fmt} concluída!")
            tocar("concluido.wav")
            pasta_conv = os.path.join(win.selecao if win.modo == "pasta" else os.path.dirname(win.selecao[0]), "convertidas")
            abrir_pasta(pasta_conv)

        except Exception as e:
            log(f"❌ ERRO: {e}")
            status_label.config(text="❌ Erro durante a conversão")
        finally:
            botao_converter.config(state="normal")

    botao_converter.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())


# =========================
# 🎙️ TRANSCRITOR DE ÁUDIOS
# =========================
def abrir_transcricao_janela(hub):
    win = Toplevel()
    win.title("🎙️ Transcrever Áudios — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 560
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, False)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Transcrever Áudios",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    # Seletor de modelo
    Label(win, text="Selecione o modelo:",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 4))

    import tkinter as tk
    modelo_var = tk.StringVar(value="Rápido (small)")
    frame_modelos = Frame(win, bg="#1C1C1C")
    frame_modelos.pack()
    for nome_modelo in MODELOS.keys():
        tk.Radiobutton(
            frame_modelos, text=nome_modelo, variable=modelo_var, value=nome_modelo,
            bg="#1C1C1C", fg="#F97316", selectcolor="#2A2A2A",
            activebackground="#1C1C1C", activeforeground="#F97316",
            font=("Segoe UI", 9, "bold"), cursor="hand2"
        ).pack(side="left", padx=12)



    Label(win, text="Selecione uma pasta ou arquivos de áudio",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(10, 4))

    btn_s = {"font": ("Segoe UI", 10, "bold"), "width": 20,
             "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}
    frame_botoes = Frame(win, bg="#1C1C1C")
    frame_botoes.pack()

    win.modo    = None
    win.selecao = None

    status_sel = Label(win, text="", font=("Segoe UI", 9),
                       bg="#1C1C1C", fg="#AAAAAA", wraplength=500)
    status_sel.pack(pady=(6, 0))

    def selecionar_pasta():
        pasta = filedialog.askdirectory()
        if pasta:
            win.modo    = "pasta"
            win.selecao = pasta
            status_sel.config(text=f"📂  {pasta}")
            botao_transcrever.config(state="normal")

    def selecionar_arquivos():
        arquivos = filedialog.askopenfilenames(
            parent=win,
            title="Selecionar áudios",
            filetypes=[("Áudios", "*.ogg *.opus *.mp3 *.wav *.m4a *.mp4 *.webm *.flac")]
        )
        if arquivos:
            win.modo    = "arquivos"
            win.selecao = list(arquivos)
            status_sel.config(text=f"🎙️  {len(arquivos)} áudio(s) selecionado(s)")
            botao_transcrever.config(state="normal")

    Button(frame_botoes, text="📂  Pasta Inteira",
           bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
           command=selecionar_pasta, **btn_s).pack(side="left", padx=6)
    Button(frame_botoes, text="🎙️  Arquivos Avulsos",
           bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
           command=selecionar_arquivos, **btn_s).pack(side="left", padx=6)

    progress = Progressbar(win, length=500, mode="determinate",
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(14, 2))

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    frame_cont = Frame(win, bg="#242424")
    frame_cont.pack(fill="x", padx=28, pady=8)

    contadores = {}
    for chave, texto in [("total",       "📋  Total encontrado"),
                         ("transcritos", "✅  Transcritos"),
                         ("falhas",      "❌  Falhas")]:
        row = Frame(frame_cont, bg="#242424")
        row.pack(fill="x", padx=12, pady=2)
        Label(row, text=texto, width=22, anchor="w",
              font=("Segoe UI", 9), bg="#242424", fg="#CCCCCC").pack(side="left")
        lbl = Label(row, text="—", width=6, anchor="e",
                    font=("Segoe UI", 9, "bold"), bg="#242424", fg="#F97316")
        lbl.pack(side="left")
        contadores[chave] = lbl

    log_box = Text(win, height=8, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(4, 8), padx=28)

    botao_transcrever = Button(win, text="▶  Transcrever Agora",
                               bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                               state="disabled",
                               font=("Segoe UI", 10, "bold"), width=22,
                               bd=0, cursor="hand2", relief="flat", pady=6)
    botao_transcrever.pack(pady=(0, 12))

    def atualizar_progresso(valor, texto):
        progress["value"] = valor
        status_label.config(text=texto)
        win.update_idletasks()

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    # Mensagens rotativas durante carregamento
    mensagens_transcricao = [
        "🧠 Carregando modelo Whisper...",
        "🎙️ Preparando transcrição...",
        "⚙️  Inicializando processamento de áudio...",
        "⏳ Quase lá, aguarde...",
        "📦 Carregando pesos do modelo...",
    ]
    win._loading_t = False
    win._msg_idx_t = [0]

    def iniciar_loading_t():
        win._loading_t = True
        progress.config(mode="indeterminate")
        progress.start(12)
        _rodar_msg_t()

    def parar_loading_t():
        win._loading_t = False
        progress.stop()
        progress.config(mode="determinate")

    def _rodar_msg_t():
        if win._loading_t:
            status_label.config(text=mensagens_transcricao[win._msg_idx_t[0] % len(mensagens_transcricao)])
            win._msg_idx_t[0] += 1
            win.after(1800, _rodar_msg_t)

    def rodar_em_thread():
        botao_transcrever.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        win._msg_idx_t[0] = 0
        for lbl in contadores.values():
            lbl.config(text="—")
        modelo = modelo_var.get()
        iniciar_loading_t()
        status_label.config(text=f"Carregando modelo {modelo}...")

        try:
            if win.modo == "pasta":
                resultado = transcrever_pasta(win.selecao, modelo_key=modelo,
                                              callback_progresso=atualizar_progresso,
                                              callback_log=log)
            else:
                resultado = transcrever_audios(win.selecao, modelo_key=modelo,
                                               callback_progresso=atualizar_progresso,
                                               callback_log=log)

            log("\n" + "="*45)
            log("🔥 FINALIZADO")
            log("="*45)
            log(f"  Total      : {resultado['total']}")
            log(f"  Transcritos: {resultado['transcritos']}")
            log(f"  Falhas     : {resultado['falhas']}")
            if resultado.get("arquivo_txt"):
                log(f"  Salvo em   : {resultado['arquivo_txt']}")

            contadores["total"].config(text=str(resultado["total"]))
            contadores["transcritos"].config(text=str(resultado["transcritos"]))
            contadores["falhas"].config(text=str(resultado["falhas"]))
            parar_loading_t()
            status_label.config(text="✅ Transcrição concluída!")
            tocar("concluido.wav")
            if resultado.get("arquivo_txt"):
                abrir_pasta(os.path.dirname(resultado["arquivo_txt"]))

        except Exception as e:
            parar_loading_t()
            log(f"❌ ERRO: {e}")
            status_label.config(text="❌ Erro durante a transcrição")
        finally:
            botao_transcrever.config(state="normal")

    botao_transcrever.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())


# =========================
# 🌐 FAVICON GENERATOR
# =========================
def abrir_favicon_janela(hub):
    win = Toplevel()
    win.title("🌐 Favicon Generator — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 520
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, False)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Favicon Generator",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    # Campos de entrada
    import tkinter as tk

    Label(win, text="Nome do site (para o webmanifest):",
          font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 2))
    entry_nome = tk.Entry(win, width=40, font=("Segoe UI", 10),
                          bg="#2A2A2A", fg="#FFFFFF", insertbackground="#F97316",
                          relief="flat", bd=4)
    entry_nome.pack()

    Label(win, text="Cor do tema (hex, ex: #ff6600):",
          font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(8, 2))
    entry_cor = tk.Entry(win, width=20, font=("Segoe UI", 10),
                         bg="#2A2A2A", fg="#FFFFFF", insertbackground="#F97316",
                         relief="flat", bd=4)
    entry_cor.insert(0, "#ffffff")
    entry_cor.pack()

    # Seleção de imagem
    Label(win, text="Selecione a imagem de entrada:",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 4))

    status_sel = Label(win, text="Nenhuma imagem selecionada",
                       font=("Segoe UI", 9), bg="#1C1C1C", fg="#AAAAAA", wraplength=500)
    status_sel.pack()

    win.path_imagem = None

    def selecionar_imagem():
        path = filedialog.askopenfilename(
            title="Selecionar imagem",
            filetypes=[("Imagens", "*.png *.jpg *.jpeg *.webp *.bmp *.tiff")]
        )
        if path:
            win.path_imagem = path
            status_sel.config(text=f"🖼️  {os.path.basename(path)}")
            botao_gerar.config(state="normal")

    btn_s = {"font": ("Segoe UI", 10, "bold"), "width": 22,
             "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}

    Button(win, text="🖼️  Selecionar Imagem",
           bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
           command=selecionar_imagem, **btn_s).pack(pady=8)

    progress = Progressbar(win, length=500, mode="determinate",
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(8, 2))

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    log_box = Text(win, height=8, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(8, 8), padx=28)

    botao_gerar = Button(win, text="▶  Gerar Favicons",
                         bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                         state="disabled", **btn_s)
    botao_gerar.pack(pady=(0, 12))

    def atualizar_progresso(valor, texto):
        progress["value"] = valor
        status_label.config(text=texto)
        win.update_idletasks()

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def rodar_em_thread():
        botao_gerar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Gerando favicons...")

        nome = entry_nome.get().strip()
        cor  = entry_cor.get().strip() or "#ffffff"

        try:
            resultado = gerar_favicon(
                win.path_imagem,
                nome_site=nome,
                cor_tema=cor,
                callback_progresso=atualizar_progresso,
                callback_log=log
            )

            if resultado["sucesso"]:
                status_label.config(text=f"✅ {len(resultado['arquivos'])} arquivos gerados!")
                tocar("concluido.wav")
                abrir_pasta(resultado["pasta"])
            else:
                status_label.config(text="❌ Falha ao gerar favicons")

        except Exception as e:
            log(f"❌ ERRO: {e}")
            status_label.config(text="❌ Erro durante a geração")
        finally:
            botao_gerar.config(state="normal")

    botao_gerar.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())


# =========================
# ✂️ REMOVER FUNDO
# =========================
def abrir_remover_fundo_janela(hub):
    win = Toplevel()
    win.title("✂️ Remover Fundo — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 580
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, False)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Remover Fundo",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(win, text="Remove o fundo de imagens usando IA (rembg)",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 2))


    Label(win, text="Selecione uma pasta ou arquivos:",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(12, 4))

    btn_s = {"font": ("Segoe UI", 10, "bold"), "width": 20,
             "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}
    frame_botoes = Frame(win, bg="#1C1C1C")
    frame_botoes.pack()

    win.modo    = None
    win.selecao = None

    status_sel = Label(win, text="", font=("Segoe UI", 9),
                       bg="#1C1C1C", fg="#AAAAAA", wraplength=500)
    status_sel.pack(pady=(6, 0))

    def selecionar_pasta():
        pasta = filedialog.askdirectory()
        if pasta:
            win.modo    = "pasta"
            win.selecao = pasta
            status_sel.config(text=f"📂  {pasta}")
            botao_processar.config(state="normal")

    def selecionar_arquivos():
        # parent=win evita bug de seleção múltipla estranha
        arquivos = filedialog.askopenfilenames(
            parent=win,
            title="Selecionar imagens",
            filetypes=[("Imagens", "*.png *.jpg *.jpeg *.webp *.bmp *.tiff")]
        )
        if arquivos:
            win.modo    = "arquivos"
            win.selecao = list(arquivos)
            status_sel.config(text=f"🖼️  {len(arquivos)} imagem(ns) selecionada(s)")
            botao_processar.config(state="normal")

    Button(frame_botoes, text="📂  Pasta Inteira",
           bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
           command=selecionar_pasta, **btn_s).pack(side="left", padx=6)
    Button(frame_botoes, text="🖼️  Arquivos Avulsos",
           bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
           command=selecionar_arquivos, **btn_s).pack(side="left", padx=6)

    progress = Progressbar(win, length=500, mode="determinate",
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(16, 2))

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    frame_cont = Frame(win, bg="#242424")
    frame_cont.pack(fill="x", padx=28, pady=8)

    contadores = {}
    for chave, texto in [("total",       "📋  Total encontrado"),
                         ("processados", "✅  Processados"),
                         ("falhas",      "❌  Falhas")]:
        row = Frame(frame_cont, bg="#242424")
        row.pack(fill="x", padx=12, pady=2)
        Label(row, text=texto, width=22, anchor="w",
              font=("Segoe UI", 9), bg="#242424", fg="#CCCCCC").pack(side="left")
        lbl = Label(row, text="—", width=6, anchor="e",
                    font=("Segoe UI", 9, "bold"), bg="#242424", fg="#F97316")
        lbl.pack(side="left")
        contadores[chave] = lbl

    log_box = Text(win, height=7, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(4, 8), padx=28)

    botao_processar = Button(win, text="▶  Remover Fundo",
                             bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                             state="disabled", **btn_s)
    botao_processar.pack(pady=(0, 12))

    # Mensagens rotativas durante carregamento do modelo
    mensagens_loading = [
        "🧠 Carregando modelo de IA...",
        "🔍 Analisando estrutura da imagem...",
        "⚙️  Preparando remoção de fundo...",
        "🤖 Inicializando rembg...",
        "⏳ Quase lá, aguarde...",
        "🎨 Configurando u2net...",
    ]
    win._loading  = False
    win._msg_idx  = [0]

    def iniciar_loading():
        win._loading = True
        progress.config(mode="indeterminate")
        progress.start(12)
        _rodar_msg()

    def parar_loading():
        win._loading = False
        progress.stop()
        progress.config(mode="determinate")

    def _rodar_msg():
        if win._loading:
            status_label.config(text=mensagens_loading[win._msg_idx[0] % len(mensagens_loading)])
            win._msg_idx[0] += 1
            win.after(1800, _rodar_msg)

    def atualizar_progresso(valor, texto):
        if win._loading:
            parar_loading()
        progress["value"] = valor
        status_label.config(text=texto)
        win.update_idletasks()

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def rodar_em_thread():
        botao_processar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        win._msg_idx[0] = 0
        for lbl in contadores.values():
            lbl.config(text="—")
        iniciar_loading()

        try:
            if win.modo == "pasta":
                resultado = remover_fundo_pasta(win.selecao,
                                                callback_progresso=atualizar_progresso,
                                                callback_log=log)
            else:
                resultado = remover_fundo_arquivos(win.selecao,
                                                   callback_progresso=atualizar_progresso,
                                                   callback_log=log)

            log("\n" + "="*45)
            log("🔥 FINALIZADO")
            log("="*45)
            log(f"  Total      : {resultado['total']}")
            log(f"  Processados: {resultado['processados']}")
            log(f"  Falhas     : {resultado['falhas']}")
            log(f"  Salvos em  : /sem_fundo")

            contadores["total"].config(text=str(resultado["total"]))
            contadores["processados"].config(text=str(resultado["processados"]))
            contadores["falhas"].config(text=str(resultado["falhas"]))
            parar_loading()
            status_label.config(text="✅ Fundo removido com sucesso!")
            tocar("concluido.wav")
            pasta_sem_fundo = os.path.join(
                win.selecao if win.modo == "pasta"
                else os.path.dirname(win.selecao[0]), "sem_fundo"
            )
            abrir_pasta(pasta_sem_fundo)

        except Exception as e:
            parar_loading()
            log(f"❌ ERRO: {e}")
            import traceback
            log(traceback.format_exc()[-400:])
            status_label.config(text="❌ Erro durante o processamento")
        finally:
            botao_processar.config(state="normal")

    botao_processar.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())


# =========================
# 🎬 ORGANIZADOR DE VÍDEOS
# =========================
def abrir_org_videos_janela(hub):
    win = Toplevel()
    win.title("🎬 Logger Brabo — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 560, 820
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, True)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Logger Brabo",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(win, text="Organiza LOG de vídeos e fotos por câmera, data, hora e sequência",
          font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC", wraplength=500).pack(pady=(12, 2))
    Label(win, text="Os arquivos serão MOVIDOS para a pasta do projeto",
          font=("Segoe UI", 8), bg="#1C1C1C", fg="#888888").pack()

    # Campo nome do projeto
    Label(win, text="Nome do projeto:",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(12, 2))

    import tkinter as _tk
    entry_projeto = _tk.Entry(win, width=38, font=("Segoe UI", 10),
                              bg="#2A2A2A", fg="#FFFFFF", insertbackground="#F97316",
                              relief="flat", bd=4)
    entry_projeto.insert(0, "Projeto_Sem_Nome")
    entry_projeto.pack()

    label = Label(win, text="Selecione a pasta do LOG:",
                  font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC")
    label.pack(pady=(10, 4))

    btn_s = {"font": ("Segoe UI", 10, "bold"), "width": 22,
             "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}

    def selecionar_pasta():
        pasta = filedialog.askdirectory(parent=win)
        if pasta:
            win.pasta = pasta
            label.config(text=f"📂  {pasta}")
            botao_rodar.config(state="normal")
            botao_cena.config(state="normal")

    Button(win, text="📂  Selecionar Pasta",
           bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
           command=selecionar_pasta, **btn_s).pack(pady=6)

    progress = Progressbar(win, length=500, mode="determinate",
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(10, 2))

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    frame_cont = Frame(win, bg="#242424")
    frame_cont.pack(fill="x", padx=28, pady=8)

    contadores = {}
    for chave, texto in [("total",      "📋  Total encontrado"),
                         ("videos",     "🎬  Vídeos"),
                         ("fotos",      "📷  Fotos"),
                         ("audio",      "🎵  Áudios"),
                         ("outros",     "📁  Outros"),
                         ("duplicatas", "🔁  Duplicatas"),
                         ("movidos",    "✅  Movidos")]:
        row = Frame(frame_cont, bg="#242424")
        row.pack(fill="x", padx=12, pady=1)
        Label(row, text=texto, width=22, anchor="w",
              font=("Segoe UI", 9), bg="#242424", fg="#CCCCCC").pack(side="left")
        lbl = Label(row, text="—", width=6, anchor="e",
                    font=("Segoe UI", 9, "bold"), bg="#242424", fg="#F97316")
        lbl.pack(side="left")
        contadores[chave] = lbl

    log_box = Text(win, height=5, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(4, 6), padx=28)

    botao_rodar = Button(win, text="▶  Organizar Agora",
                         bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                         state="disabled", **btn_s)
    botao_rodar.pack(pady=(0, 4))

    botao_cena = Button(win, text="🎬  Detectar Cenas (CLIP)",
                        bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                        state="disabled", **btn_s)
    botao_cena.pack(pady=(0, 4))

    # Separador com título
    Frame(win, bg="#2A2A2A", height=1).pack(fill="x", padx=28, pady=(6, 4))
    Label(win, text="Restaurar ou replicar organização:",
          font=("Segoe UI", 8), bg="#1C1C1C", fg="#888888").pack()

    frame_snap = Frame(win, bg="#1C1C1C")
    frame_snap.pack(pady=(4, 6))

    btn_s2 = {"font": ("Segoe UI", 9, "bold"), "width": 21,
               "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 6}

    botao_backup = Button(frame_snap, text="↩️  Desfazer (BACKUP)",
                          bg="#2A2A2A", fg="#CCCCCC", activebackground="#3a3a3a",
                          **btn_s2)
    botao_backup.pack(side="left", padx=6)

    botao_nextup = Button(frame_snap, text="📤  Replicar (NEXTUP)",
                          bg="#2A2A2A", fg="#CCCCCC", activebackground="#3a3a3a",
                          **btn_s2)
    botao_nextup.pack(side="left", padx=6)

    def atualizar_progresso(valor, texto):
        progress["value"] = valor
        status_label.config(text=texto)
        win.update_idletasks()

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def rodar_em_thread():
        botao_rodar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        for lbl in contadores.values():
            lbl.config(text="—")
        status_label.config(text="Iniciando organização...")

        try:
            nome_proj = entry_projeto.get().strip() or "Projeto_Sem_Nome"
            # Sanitiza nome do projeto
            import re as _re
            nome_proj = _re.sub(r'[\\/:*?"<>|\s]+', '_', nome_proj).strip('_')
            resultado = organizar_videos(win.pasta,
                                         nome_projeto=nome_proj,
                                         callback_progresso=atualizar_progresso,
                                         callback_log=log)
            log("\n" + "="*45)
            log("🔥 FINALIZADO")
            log("="*45)
            log(f"  Total     : {resultado['total']}")
            log(f"  🎬 Vídeos : {resultado['videos']}")
            log(f"  📷 Fotos  : {resultado['fotos']}")
            log(f"  🎵 Áudios : {resultado['audio']}")
            log(f"  📁 Outros : {resultado['outros']}")
            log(f"  🔁 Duplic.: {resultado['duplicatas']}")
            log(f"  ✅ Movidos: {resultado['movidos']}")

            contadores["total"].config(text=str(resultado["total"]))
            contadores["videos"].config(text=str(resultado["videos"]))
            contadores["fotos"].config(text=str(resultado["fotos"]))
            contadores["audio"].config(text=str(resultado["audio"]))
            contadores["outros"].config(text=str(resultado["outros"]))
            contadores["duplicatas"].config(text=str(resultado["duplicatas"]))
            contadores["movidos"].config(text=str(resultado["movidos"]))

            status_label.config(text="✅ Organização concluída!")
            tocar("concluido.wav")
            pasta_final = resultado.get("pasta_org", os.path.join(win.pasta, nome_proj))
            abrir_pasta(pasta_final)

            # Popup: perguntar se quer detectar cenas
            import tkinter.messagebox as _mb
            resposta = _mb.askyesno(
                "Detectar Cenas?",
                f"Organização concluída!\n\n"
                f"  🎬 {resultado['videos']} vídeos organizados\n"
                f"  📷 {resultado['fotos']} fotos\n\n"
                f"Deseja iniciar agora a detecção de cenas\n"
                f"com IA (CLIP) para renomear os vídeos?",
                parent=win
            )
            if resposta:
                threading.Thread(target=rodar_cena_thread, daemon=True).start()

        except Exception as e:
            log(f"❌ ERRO: {e}")
            import traceback
            log(traceback.format_exc()[-300:])
            status_label.config(text="❌ Erro durante a organização")
        finally:
            botao_rodar.config(state="normal")

    botao_rodar.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())

    def rodar_backup_thread():
        path_bk = filedialog.askopenfilename(
            parent=win,
            title="Selecionar BACKUP.json",
            filetypes=[("BACKUP Logger Brabo", "BACKUP.json"), ("JSON", "*.json")]
        )
        if not path_bk:
            return

        botao_backup.config(state="disabled")
        botao_rodar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Restaurando organização anterior...")

        def _rodar():
            try:
                log(f"↩️  Carregando BACKUP: {os.path.basename(path_bk)}")
                resultado = restaurar_backup(
                    path_bk,
                    callback_progresso=atualizar_progresso,
                    callback_log=log
                )
                if resultado["sucesso"]:
                    status_label.config(text="✅ Organização restaurada com sucesso!")
                    tocar("concluido.wav")
                else:
                    status_label.config(text=f"⚠️  Restaurado com {resultado['falhas']} falha(s)")
                log(f"\n✅ Restaurados: {resultado['restaurados']} | ❌ Falhas: {resultado['falhas']}")
            except Exception as e:
                log(f"❌ ERRO: {e}")
                import traceback
                log(traceback.format_exc()[-300:])
                status_label.config(text="❌ Erro ao restaurar")
            finally:
                botao_backup.config(state="normal")
                botao_rodar.config(state="normal")

        threading.Thread(target=_rodar, daemon=True).start()

    botao_backup.config(command=rodar_backup_thread)

    def rodar_nextup_thread():
        path_nu = filedialog.askopenfilename(
            parent=win,
            title="Selecionar NEXTUP.json",
            filetypes=[("NEXTUP Logger Brabo", "NEXTUP.json"), ("JSON", "*.json")]
        )
        if not path_nu:
            return

        pasta_dest = filedialog.askdirectory(
            parent=win,
            title="Selecionar pasta com os arquivos a organizar"
        )
        if not pasta_dest:
            return

        botao_nextup.config(state="disabled")
        botao_rodar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Aplicando organização do NEXTUP...")

        def _rodar():
            try:
                log(f"📥 Carregando NEXTUP: {os.path.basename(path_nu)}")
                log(f"📂 Pasta alvo: {pasta_dest}")
                resultado = aplicar_nextup(
                    path_nu,
                    pasta_dest,
                    callback_progresso=atualizar_progresso,
                    callback_log=log
                )
                if resultado["sucesso"]:
                    status_label.config(text="✅ NEXTUP aplicado com sucesso!")
                    tocar("concluido.wav")
                else:
                    status_label.config(
                        text=f"⚠️  Aplicado com {resultado['nao_encontrados']} não encontrados"
                    )
                log(f"\n✅ Aplicados       : {resultado['aplicados']}")
                log(f"   ⚠️  Não encontrados: {resultado['nao_encontrados']}")
                log(f"   ❌ Falhas          : {resultado['falhas']}")
            except Exception as e:
                log(f"❌ ERRO: {e}")
                import traceback
                log(traceback.format_exc()[-300:])
                status_label.config(text="❌ Erro ao aplicar NEXTUP")
            finally:
                botao_nextup.config(state="normal")
                botao_rodar.config(state="normal")

        threading.Thread(target=_rodar, daemon=True).start()

    botao_nextup.config(command=rodar_nextup_thread)

    def rodar_cena_thread():
        botao_cena.config(state="disabled")
        botao_rodar.config(state="disabled")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Carregando modelo CLIP...")

        # Abre popup do café
        popup_cafe = mostrar_popup_cafe(win, None)

        try:
            pasta_analise = getattr(win, "pasta", None)
            if not pasta_analise:
                log("❌ Selecione uma pasta primeiro")
                return

            nome_proj  = entry_projeto.get().strip() or "organizado"
            import re as _re
            nome_proj  = _re.sub(r'[\\/:*?"<>|\s]+', '_', nome_proj).strip('_')
            pasta_org  = os.path.join(pasta_analise, nome_proj)
            pasta_alvo = pasta_org if os.path.exists(pasta_org) else pasta_analise

            log(f"📂 Analisando: {pasta_alvo}")

            def progresso_combinado(valor, texto):
                atualizar_progresso(valor, texto)
                try:
                    popup_cafe._progress(valor, texto)
                except Exception:
                    pass

            resultado = analisar_e_renomear_pasta(
                pasta_alvo,
                callback_progresso=progresso_combinado,
                callback_log=log
            )

            log("\n" + "="*45)
            log("🔥 ANÁLISE CONCLUÍDA")
            log("="*45)
            log(f"  Total analisado : {resultado['total']}")
            log(f"  ✅ Renomeados   : {resultado['renomeados']}")
            log(f"  ⚠️  Sem cena    : {resultado['sem_cena']}")

            status_label.config(text="✅ Cenas detectadas!")
            tocar("concluido.wav")

        except Exception as e:
            log(f"❌ ERRO: {e}")
            import traceback
            log(traceback.format_exc()[-300:])
            status_label.config(text="❌ Erro na detecção de cenas")
        finally:
            # Fecha o popup do café
            try:
                popup_cafe._fechar()
            except Exception:
                pass
            botao_cena.config(state="normal")
            botao_rodar.config(state="normal")

    botao_cena.config(command=lambda: threading.Thread(
        target=rodar_cena_thread, daemon=True).start())



# =========================
# ☁️ GDRIVE DUMPER
# =========================
def abrir_gdrive_dumper_janela(hub):
    import tkinter as tk
    import re as _re
    import os as _os
    from tkinter import filedialog
    from tkinter.ttk import Progressbar, Style

    # ── Mapa de ícones por extensão (canvas 72x72 desenhado em texto) ──
    ICONES = {
        "video":  {"exts": {".mp4",".mov",".avi",".mkv",".mxf",".r3d",".braw",".prproj",".xml"},
                   "emoji": "🎬", "cor": "#F97316", "label": "Vídeo"},
        "audio":  {"exts": {".mp3",".wav",".aac",".flac",".ogg",".m4a"},
                   "emoji": "🎵", "cor": "#818cf8", "label": "Áudio"},
        "image":  {"exts": {".jpg",".jpeg",".png",".gif",".webp",".tiff",".bmp",".psd",".ai"},
                   "emoji": "🖼️", "cor": "#34d399", "label": "Imagem"},
        "doc":    {"exts": {".pdf",".docx",".xlsx",".pptx",".txt",".csv"},
                   "emoji": "📄", "cor": "#60a5fa", "label": "Documento"},
        "zip":    {"exts": {".zip",".rar",".7z",".tar",".gz"},
                   "emoji": "🗜️", "cor": "#fbbf24", "label": "Compactado"},
        "outro":  {"exts": set(),
                   "emoji": "📁", "cor": "#888888", "label": "Arquivo"},
    }

    def _tipo_arquivo(nome):
        ext = _os.path.splitext(nome)[1].lower()
        for tipo, info in ICONES.items():
            if ext in info["exts"]:
                return tipo
        return "outro"

    win = Toplevel()
    win.title("☁️ GDrive Dumper — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 660, 720
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.minsize(540, 620)
    win.resizable(True, True)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")
    style.configure("Verde.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#4CAF50",
                    bordercolor="#1C1C1C", lightcolor="#4CAF50", darkcolor="#4CAF50")

    def _fmt_bytes(b):
        for u in ["B", "KB", "MB", "GB", "TB"]:
            if b < 1024:
                return f"{b:.2f} {u}"
            b /= 1024
        return f"{b:.2f} TB"

    # ── Header ────────────────────────────────────────────────
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="GDrive Dumper",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    # Status rclone + gdrive
    status_frame = Frame(win, bg="#1C1C1C")
    status_frame.pack(fill="x", padx=20, pady=(8, 0))
    ok_rclone, ver_rclone = verificar_rclone()
    ok_gdrive = verificar_gdrive_configurado()
    cor_rc = "#4CAF50" if ok_rclone else "#f44336"
    txt_rc = f"● rclone {ver_rclone}" if ok_rclone else "● rclone não encontrado"
    Label(status_frame, text=txt_rc, font=("Consolas", 8),
          bg="#1C1C1C", fg=cor_rc).pack(side="left")
    cor_gd = "#4CAF50" if ok_gdrive else "#f59e0b"
    txt_gd = "● Drive conectado" if ok_gdrive else "● Drive não autenticado"
    Label(status_frame, text=f"    {txt_gd}", font=("Consolas", 8),
          bg="#1C1C1C", fg=cor_gd).pack(side="left")

    # ── Abas: Link / Nome ─────────────────────────────────────
    frame_abas = Frame(win, bg="#1C1C1C")
    frame_abas.pack(fill="x", padx=20, pady=(12, 0))
    aba_var = tk.IntVar(value=0)

    def _aba(idx):
        aba_var.set(idx)
        btn_link.config(bg="#F97316" if idx == 0 else "#2A2A2A",
                        fg="#0F0F0F" if idx == 0 else "#F97316")
        btn_nome.config(bg="#F97316" if idx == 1 else "#2A2A2A",
                        fg="#0F0F0F" if idx == 1 else "#F97316")
        frame_link.pack_forget()
        frame_nome.pack_forget()
        (frame_link if idx == 0 else frame_nome).pack(fill="x", padx=20, pady=(4, 0))

    btn_s = dict(font=("Segoe UI", 9, "bold"), bd=0, relief="flat",
                 cursor="hand2", padx=14, pady=6)
    btn_link = Button(frame_abas, text="Link compartilhado", bg="#F97316", fg="#0F0F0F",
                      activebackground="#e06510", command=lambda: _aba(0), **btn_s)
    btn_link.pack(side="left", padx=(0, 4))
    btn_nome = Button(frame_abas, text="Nome da pasta", bg="#2A2A2A", fg="#F97316",
                      activebackground="#3a3a3a", command=lambda: _aba(1), **btn_s)
    btn_nome.pack(side="left")

    frame_link = Frame(win, bg="#1C1C1C")
    Label(frame_link, text="Cole o link da pasta do Google Drive:",
          font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", pady=(8, 2))
    link_var = tk.StringVar()
    tk.Entry(frame_link, textvariable=link_var, font=("Segoe UI", 9),
             bg="#2A2A2A", fg="#CCCCCC", insertbackground="#F97316",
             relief="flat", bd=4).pack(fill="x", ipady=6)
    Label(frame_link, text="ℹ  Use o link completo da pasta, não de um arquivo.",
          font=("Segoe UI", 8), bg="#1C1C1C", fg="#555555").pack(anchor="w", pady=(2, 0))

    frame_nome = Frame(win, bg="#1C1C1C")
    Label(frame_nome, text="Nome exato da pasta no Google Drive:",
          font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", pady=(8, 2))
    nome_var = tk.StringVar()
    tk.Entry(frame_nome, textvariable=nome_var, font=("Segoe UI", 9),
             bg="#2A2A2A", fg="#CCCCCC", insertbackground="#F97316",
             relief="flat", bd=4).pack(fill="x", ipady=6)
    shared_var = tk.BooleanVar(value=True)
    tk.Checkbutton(frame_nome, text="Pasta compartilhada comigo",
                   variable=shared_var, font=("Segoe UI", 9),
                   bg="#1C1C1C", fg="#AAAAAA", selectcolor="#2A2A2A",
                   activebackground="#1C1C1C").pack(anchor="w", pady=(4, 0))
    frame_link.pack(fill="x", padx=20, pady=(4, 0))

    # ── Destino ───────────────────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    Label(win, text="Pasta de destino:", font=("Segoe UI", 9, "bold"),
          bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", padx=20)
    dest_frame = Frame(win, bg="#1C1C1C")
    dest_frame.pack(fill="x", padx=20, pady=(4, 0))
    dest_var = tk.StringVar(value=_os.path.join(_os.path.expanduser("~"), "Videos"))
    tk.Entry(dest_frame, textvariable=dest_var, font=("Segoe UI", 9),
             bg="#2A2A2A", fg="#CCCCCC", insertbackground="#F97316",
             relief="flat", bd=4).pack(side="left", fill="x", expand=True, ipady=6)
    Button(dest_frame, text="Escolher", font=("Segoe UI", 9, "bold"),
           bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
           bd=0, relief="flat", cursor="hand2", padx=10,
           command=lambda: dest_var.set(
               filedialog.askdirectory(parent=win) or dest_var.get())
           ).pack(side="left", padx=(6, 0))

    # ── Paralelos ─────────────────────────────────────────────
    par_frame = Frame(win, bg="#1C1C1C")
    par_frame.pack(fill="x", padx=20, pady=(10, 0))
    Label(par_frame, text="Downloads paralelos:", font=("Segoe UI", 9),
          bg="#1C1C1C", fg="#888888").pack(side="left")
    par_var = tk.IntVar(value=8)
    for v in [1, 2, 4, 8, 16]:
        tk.Radiobutton(par_frame, text=str(v), variable=par_var, value=v,
                       font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888",
                       selectcolor="#2A2A2A", activebackground="#1C1C1C",
                       activeforeground="#F97316").pack(side="left", padx=4)

    # ── Botões ────────────────────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    botao_dump = Button(win, text="☁️  DUMP IT!",
                        bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                        font=("Segoe UI", 12, "bold"),
                        bd=0, relief="flat", cursor="hand2", pady=12)
    botao_dump.pack(fill="x", padx=20)
    botao_cancelar = Button(win, text="✕  Cancelar",
                            bg="#2A2A2A", fg="#f44336", activebackground="#3a3a3a",
                            font=("Segoe UI", 10, "bold"),
                            bd=0, relief="flat", cursor="hand2", pady=8,
                            state="disabled")
    botao_cancelar.pack(fill="x", padx=20, pady=(4, 0))

    # ── Painel de progresso ───────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=10)
    prog_card = Frame(win, bg="#242424")
    prog_card.pack(fill="x", padx=20)

    # Barra animada + ícone de download + %
    bar_row = Frame(prog_card, bg="#242424")
    bar_row.pack(fill="x", padx=14, pady=(12, 4))

    # Ícone animado de download (seta pulsando)
    lbl_anim = Label(bar_row, text="⬇", font=("Segoe UI", 13),
                     bg="#242424", fg="#F97316", width=2)
    lbl_anim.pack(side="left", padx=(0, 6))

    progress = Progressbar(bar_row, mode="determinate",
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(side="left", fill="x", expand=True)
    lbl_pct = Label(bar_row, text="0%", font=("Segoe UI", 11, "bold"),
                    bg="#242424", fg="#F97316", width=5)
    lbl_pct.pack(side="left", padx=(8, 0))

    # Tamanho + ETA
    size_row = Frame(prog_card, bg="#242424")
    size_row.pack(fill="x", padx=14, pady=(0, 2))
    lbl_size = Label(size_row, text="—", font=("Segoe UI", 9),
                     bg="#242424", fg="#888888")
    lbl_size.pack(side="left")
    lbl_eta = Label(size_row, text="", font=("Segoe UI", 9),
                    bg="#242424", fg="#888888")
    lbl_eta.pack(side="right")

    # Métricas
    stats_row = Frame(prog_card, bg="#242424")
    stats_row.pack(fill="x", padx=14, pady=(4, 12))
    lbl_speed = lbl_files = lbl_elapsed = None
    for attr, titulo in [("speed","Velocidade"),("files","Arquivos"),("elapsed","Decorrido")]:
        f = Frame(stats_row, bg="#242424")
        f.pack(side="left", padx=(0, 28))
        Label(f, text=titulo, font=("Segoe UI", 8), bg="#242424", fg="#666666").pack(anchor="w")
        lbl = Label(f, text="—", font=("Segoe UI", 11, "bold"), bg="#242424", fg="#CCCCCC")
        lbl.pack(anchor="w")
        if attr == "speed":   lbl_speed   = lbl
        elif attr == "files": lbl_files   = lbl
        else:                 lbl_elapsed = lbl

    # ── Painel de prévia do arquivo atual ─────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=(6, 0))
    preview_frame = Frame(win, bg="#1a1a1a")
    preview_frame.pack(fill="x", padx=20, pady=(0, 0))

    # Miniatura / ícone de tipo
    preview_icon = Label(preview_frame, text="📁", font=("Segoe UI", 28),
                         bg="#1a1a1a", fg="#555555", width=4)
    preview_icon.pack(side="left", padx=(12, 8), pady=10)

    preview_info = Frame(preview_frame, bg="#1a1a1a")
    preview_info.pack(side="left", fill="x", expand=True, pady=10)

    lbl_preview_tipo = Label(preview_info, text="Aguardando…",
                             font=("Segoe UI", 8), bg="#1a1a1a", fg="#555555")
    lbl_preview_tipo.pack(anchor="w")
    lbl_preview_nome = Label(preview_info, text="",
                             font=("Segoe UI", 9, "bold"), bg="#1a1a1a", fg="#CCCCCC",
                             anchor="w", wraplength=400, justify="left")
    lbl_preview_nome.pack(anchor="w")
    lbl_preview_prog = Label(preview_info, text="",
                             font=("Consolas", 8), bg="#1a1a1a", fg="#F97316")
    lbl_preview_prog.pack(anchor="w")

    # Miniatura real (quando disponível no destino)
    preview_thumb = Label(preview_frame, bg="#1a1a1a", bd=0)
    preview_thumb.pack(side="right", padx=(0, 12))
    preview_thumb._photo = None

    # Status geral
    lbl_current = Label(win, text="Aguardando…", font=("Consolas", 8),
                        bg="#1C1C1C", fg="#555555", anchor="w",
                        wraplength=580, justify="left")
    lbl_current.pack(fill="x", padx=20, pady=(8, 10))

    def _on_resize(event):
        lbl_current.config(wraplength=max(200, win.winfo_width() - 60))
        lbl_preview_nome.config(wraplength=max(150, win.winfo_width() - 160))
    win.bind("<Configure>", _on_resize)

    # ── Estado interno ────────────────────────────────────────
    stop_event       = threading.Event()
    win._total_bytes = 0
    win._baixando    = False
    _anim_frames     = ["⬇", "↓ ", " ↓", "  "]
    _anim_idx        = [0]

    # ── Animação da seta de download ──────────────────────────
    def _animar_seta():
        if not win._baixando:
            lbl_anim.config(text="⬇", fg="#555555")
            return
        _anim_idx[0] = (_anim_idx[0] + 1) % len(_anim_frames)
        lbl_anim.config(text=_anim_frames[_anim_idx[0]], fg="#F97316")
        win.after(220, _animar_seta)

    # ── Atualiza prévia do arquivo atual ──────────────────────
    def _atualizar_preview(nome_arquivo, progresso_arquivo="", destino_base=""):
        try:
            tipo   = _tipo_arquivo(nome_arquivo)
            info   = ICONES[tipo]
            emoji  = info["emoji"]
            cor    = info["cor"]
            label  = info["label"]
            nome_curto = nome_arquivo.split("/")[-1].split("\\")[-1]

            lbl_preview_icon  = preview_icon
            lbl_preview_icon.config(text=emoji, fg=cor, font=("Segoe UI", 28))
            lbl_preview_tipo.config(text=label, fg=cor)
            lbl_preview_nome.config(text=nome_curto, fg="#CCCCCC")
            lbl_preview_prog.config(text=progresso_arquivo, fg="#F97316")

            # Tenta carregar thumbnail se for imagem já parcialmente baixada
            preview_thumb.config(image="", width=0)
            preview_thumb._photo = None
            if tipo == "image" and destino_base:
                caminho = _os.path.join(destino_base, nome_curto)
                if _os.path.exists(caminho) and _os.path.getsize(caminho) > 10240:
                    try:
                        thumb = Image.open(caminho).convert("RGB")
                        thumb.thumbnail((64, 64), Image.LANCZOS)
                        photo = ImageTk.PhotoImage(thumb)
                        preview_thumb._photo = photo
                        preview_thumb.config(image=photo, width=68)
                    except Exception:
                        pass
        except Exception:
            pass

    # ── Callbacks thread-safe ─────────────────────────────────
    def _log(msg):
        win.after(0, lambda: lbl_current.config(text=msg, fg="#888888"))

    def _progresso(pct, texto):
        def _update():
            try:
                if pct < 0:
                    if progress["mode"] != "indeterminate":
                        progress.config(mode="indeterminate")
                        progress.start(12)
                else:
                    if progress["mode"] == "indeterminate":
                        progress.stop()
                        progress.config(mode="determinate")
                    progress["value"] = pct
                    lbl_pct.config(
                        text=f"{pct}%",
                        fg="#F97316" if pct < 100 else "#4CAF50")

                m = _re.search(r"([\d.]+\s*\w+)\s*/\s*([\d.]+\s*\w+)", texto)
                if m:
                    done_str = m.group(1)
                    if win._total_bytes > 0:
                        lbl_size.config(text=f"{done_str} / {_fmt_bytes(win._total_bytes)}")
                    else:
                        lbl_size.config(text=f"{m.group(1)} / {m.group(2)}")

                ms = _re.search(r"([\d.]+\s*\w+/s)", texto)
                if ms and lbl_speed:
                    lbl_speed.config(text=ms.group(1))

                me = _re.search(r"ETA\s*(\S+)", texto)
                if me:
                    lbl_eta.config(text=f"ETA  {me.group(1)}")

                mf = _re.search(r"(\d+)/(\d+)\s*arquivos", texto)
                if mf and lbl_files:
                    lbl_files.config(text=f"{mf.group(1)} / {mf.group(2)}")

            except Exception:
                pass
        win.after(0, _update)

    # Callback especial para arquivo atual (chamado do dump_pasta via rclone)
    _destino_atual = [""]

    def _atualizar_arquivo(nome, prog_txt=""):
        win.after(0, lambda: _atualizar_preview(
            nome, prog_txt, _destino_atual[0]))

    # ── Reset do painel ───────────────────────────────────────
    def _reset_progresso():
        progress.stop()
        progress.config(mode="indeterminate", style="Laranja.Horizontal.TProgressbar")
        progress.start(12)
        lbl_pct.config(text="…", fg="#F97316")
        lbl_size.config(text="—")
        lbl_eta.config(text="")
        lbl_anim.config(text="⬇", fg="#555555")
        if lbl_speed:   lbl_speed.config(text="—")
        if lbl_files:   lbl_files.config(text="—")
        if lbl_elapsed: lbl_elapsed.config(text="—")
        preview_icon.config(text="📁", fg="#555555")
        lbl_preview_tipo.config(text="Aguardando…", fg="#555555")
        lbl_preview_nome.config(text="")
        lbl_preview_prog.config(text="")
        preview_thumb.config(image="", width=0)

    # ── Lógica principal ──────────────────────────────────────
    def rodar_dump():
        stop_event.clear()
        win._baixando = False
        win.after(0, lambda: botao_dump.config(state="disabled", text="Dumping…"))
        win.after(0, lambda: botao_cancelar.config(state="normal"))
        win.after(0, _reset_progresso)
        win.after(0, lambda: lbl_current.config(
            text="Calculando tamanho da pasta…", fg="#888888"))

        # Monta remote_args
        if aba_var.get() == 0:
            folder_id = extract_folder_id(link_var.get().strip())
            if not folder_id:
                win.after(0, lambda: lbl_current.config(
                    text="❌ Link inválido! Cole o link completo da pasta.", fg="#f44336"))
                win.after(0, lambda: botao_dump.config(state="normal", text="☁️  DUMP IT!"))
                win.after(0, lambda: botao_cancelar.config(state="disabled"))
                win.after(0, lambda: progress.stop())
                return
            remote_args = [f"--drive-root-folder-id={folder_id}", "gdrive:"]
        else:
            nome = nome_var.get().strip()
            if not nome:
                win.after(0, lambda: lbl_current.config(
                    text="❌ Digite o nome da pasta.", fg="#f44336"))
                win.after(0, lambda: botao_dump.config(state="normal", text="☁️  DUMP IT!"))
                win.after(0, lambda: botao_cancelar.config(state="disabled"))
                win.after(0, lambda: progress.stop())
                return
            remote_args = []
            if shared_var.get():
                remote_args += ["--drive-shared-with-me"]
            remote_args += [f"gdrive:{nome}"]

        destino = dest_var.get().strip()
        _destino_atual[0] = destino
        transfers = par_var.get()

        # Pré-varredura
        total_bytes, total_files = calcular_tamanho_pasta(remote_args, callback_log=_log)
        win._total_bytes = total_bytes

        if total_bytes > 0:
            msg = (f"📦 {_fmt_bytes(total_bytes)} em {total_files} arquivo(s)"
                   f" — iniciando download…")
            win.after(0, lambda: lbl_current.config(text=msg, fg="#F97316"))
            if lbl_files:
                win.after(0, lambda: lbl_files.config(text=f"0 / {total_files}"))
        else:
            win.after(0, lambda: lbl_current.config(
                text="Iniciando download…", fg="#888888"))

        win.after(0, lambda: progress.stop())
        win.after(0, lambda: progress.config(mode="determinate"))
        win.after(0, lambda: progress.__setitem__("value", 0))
        win.after(0, lambda: lbl_pct.config(text="0%"))

        # Inicia animação da seta e abre pasta no Explorer ao lado da janela
        win._baixando = True
        win.after(0, _animar_seta)
        win.after(200, lambda: _abrir_pasta_ao_lado(destino))

        # Download — versão estendida que captura arquivo atual
        import subprocess as _sp
        from gdrive_dumper import _rclone_exe, _parse_stats, _fmt_size

        cmd = [_rclone_exe(), "copy", "--progress",
               f"--transfers={transfers}",
               "--retries=10", "--retries-sleep=30s",
               "--low-level-retries=20", "--stats=2s"] + remote_args + [destino]

        sucesso = False
        try:
            proc = _sp.Popen(
                cmd,
                stdout=_sp.PIPE, stderr=_sp.STDOUT,
                text=True, bufsize=1, encoding="utf-8", errors="replace",
                creationflags=_sp.CREATE_NO_WINDOW if _os.name == "nt" else 0)

            for line in proc.stdout:
                if stop_event.is_set():
                    proc.terminate()
                    break

                line = line.rstrip()
                if not line:
                    continue

                stats = _parse_stats(line)
                if stats:
                    pct   = stats.get("pct", -1)
                    done  = stats.get("done", "")
                    total = stats.get("total", "")
                    speed = stats.get("speed", "")
                    eta   = stats.get("eta", "")
                    fd    = stats.get("files_done", "")
                    ft    = stats.get("files_total", "")
                    txt   = f"{done} / {total}" if done and total else ""
                    if speed: txt += f"  •  {speed}"
                    if eta:   txt += f"  •  ETA {eta}"
                    if fd and ft: txt += f"  •  {fd}/{ft} arquivos"
                    _progresso(pct if pct >= 0 else -1, txt)

                    if lbl_elapsed and stats.get("elapsed"):
                        el = stats["elapsed"]
                        win.after(0, lambda e=el: lbl_elapsed.config(text=e))

                # Detecta arquivo sendo transferido: "* Nome.mp4: 45% /3.375Gi"
                m_arq = _re.search(r"\*\s+(.+?):\s+([\d]+%\s*/[\d.]+\w+|transferring)", line)
                if m_arq:
                    nome_arq = m_arq.group(1).strip()
                    prog_arq = m_arq.group(2).strip() if m_arq.group(2) != "transferring" else ""
                    _atualizar_arquivo(nome_arq, prog_arq)

            proc.wait()
            sucesso = proc.returncode == 0

        except Exception as e:
            win.after(0, lambda: lbl_current.config(text=f"❌ ERRO: {e}", fg="#f44336"))

        # Finalização
        win._baixando = False
        win.after(0, lambda: botao_dump.config(state="normal", text="☁️  DUMP IT!"))
        win.after(0, lambda: botao_cancelar.config(state="disabled"))
        win.after(0, lambda: lbl_anim.config(text="⬇", fg="#555555"))

        if sucesso:
            win.after(0, lambda: progress.config(
                mode="determinate", style="Verde.Horizontal.TProgressbar"))
            win.after(0, lambda: progress.__setitem__("value", 100))
            win.after(0, lambda: lbl_pct.config(text="100%", fg="#4CAF50"))
            win.after(0, lambda: lbl_anim.config(text="✓", fg="#4CAF50"))
            win.after(0, lambda: lbl_current.config(
                text="✅ Dump concluído com sucesso!", fg="#4CAF50"))
            win.after(0, lambda: preview_icon.config(text="✅", fg="#4CAF50"))
            win.after(0, lambda: lbl_preview_tipo.config(text="Concluído!", fg="#4CAF50"))
            win.after(0, lambda: tocar("concluido.wav"))
        else:
            win.after(0, lambda: lbl_current.config(
                text="⚠️  Concluído com erros. Rode novamente para completar.",
                fg="#f59e0b"))

    def _abrir_pasta_ao_lado(destino):
        """Abre o Explorer na pasta de destino correta."""
        try:
            _os.makedirs(destino, exist_ok=True)
            # Normaliza o path para Windows (barras invertidas)
            destino_win = _os.path.normpath(destino)
            # startfile sempre abre a pasta certa, sem problema de espaços no path
            _os.startfile(destino_win)
        except Exception:
            try:
                # Fallback: explorer com shell=True
                import subprocess as _sp2
                _sp2.Popen(f'explorer "{_os.path.normpath(destino)}"', shell=True)
            except Exception:
                pass

    def cancelar():
        stop_event.set()
        win._baixando = False
        win.after(0, lambda: botao_cancelar.config(state="disabled"))
        win.after(0, lambda: lbl_current.config(
            text="⛔ Cancelando… aguarde o processo encerrar.", fg="#888888"))

    botao_dump.config(
        command=lambda: threading.Thread(target=rodar_dump, daemon=True).start())
    botao_cancelar.config(command=cancelar)



# =========================
# 🗜️ COMPRESSOR DE VÍDEO
# =========================
def abrir_compressor_video_janela(hub):
    import tkinter as tk
    from tkinter import filedialog
    from tkinter.ttk import Progressbar, Style

    win = Toplevel()
    win.title("🗜️ Compressor de Vídeo — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 640, 720
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.minsize(560, 640)
    win.resizable(True, True)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")
    style.configure("Verde.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#4CAF50",
                    bordercolor="#1C1C1C", lightcolor="#4CAF50", darkcolor="#4CAF50")

    # ── Header ────────────────────────────────────────────────
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Compressor de Vídeo",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")
    Label(frame_header, text="H.265 • Qualidade original • Menos peso",
          font=("Segoe UI", 9), bg="#F97316", fg="#0F0F0F").pack(side="right", padx=14)

    # ── Seleção de arquivo ou pasta ───────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=(14, 0))

    sel_frame = Frame(win, bg="#1C1C1C")
    sel_frame.pack(fill="x", padx=20, pady=(10, 0))

    lbl_sel = Label(sel_frame, text="Nenhum arquivo ou pasta selecionado",
                    font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888",
                    anchor="w", wraplength=500)
    lbl_sel.pack(fill="x", pady=(0, 8))

    btn_s = dict(font=("Segoe UI", 9, "bold"), bd=0, relief="flat",
                 cursor="hand2", padx=14, pady=7)

    btn_row = Frame(win, bg="#1C1C1C")
    btn_row.pack(fill="x", padx=20)

    win._arquivos   = []
    win._pasta_base = ""

    def selecionar_arquivos():
        exts = " ".join(f"*{e}" for e in sorted(EXTENSOES_VIDEO))
        arquivos = filedialog.askopenfilenames(
            parent=win,
            title="Selecionar vídeos",
            filetypes=[("Vídeos", exts), ("Todos", "*.*")]
        )
        if arquivos:
            win._arquivos   = list(arquivos)
            win._pasta_base = os.path.dirname(arquivos[0])
            n = len(arquivos)
            lbl_sel.config(
                text=f"📄 {n} arquivo(s) selecionado(s)",
                fg="#CCCCCC")
            _atualizar_info_selecao()
            botao_comprimir.config(state="normal")

    def selecionar_pasta():
        pasta = filedialog.askdirectory(parent=win, title="Selecionar pasta com vídeos")
        if pasta:
            videos = listar_videos(pasta)
            if not videos:
                lbl_sel.config(text="⚠️  Nenhum vídeo encontrado nessa pasta.", fg="#f59e0b")
                return
            win._arquivos   = videos
            win._pasta_base = pasta
            lbl_sel.config(
                text=f"📂 {pasta}  •  {len(videos)} vídeo(s) encontrado(s)",
                fg="#CCCCCC")
            _atualizar_info_selecao()
            botao_comprimir.config(state="normal")

    Button(btn_row, text="📄  Arquivo(s)", bg="#F97316", fg="#0F0F0F",
           activebackground="#e06510", command=selecionar_arquivos, **btn_s).pack(side="left", padx=(0,8))
    Button(btn_row, text="📂  Pasta inteira", bg="#2A2A2A", fg="#F97316",
           activebackground="#3a3a3a", command=selecionar_pasta, **btn_s).pack(side="left")

    # ── Info dos arquivos selecionados ────────────────────────
    info_card = Frame(win, bg="#242424")
    info_card.pack(fill="x", padx=20, pady=(12, 0))

    info_row = Frame(info_card, bg="#242424")
    info_row.pack(fill="x", padx=14, pady=10)

    lbl_qtd   = _mini_stat(info_row, "Arquivos", "—")
    lbl_total = _mini_stat(info_row, "Tamanho total", "—")
    lbl_codec = _mini_stat(info_row, "Codec", "—")
    lbl_res   = _mini_stat(info_row, "Resolução", "—")

    def _atualizar_info_selecao():
        arquivos = win._arquivos
        if not arquivos:
            return
        lbl_qtd[1].config(text=str(len(arquivos)))
        total_mb = sum(os.path.getsize(f) / 1024 / 1024 for f in arquivos if os.path.exists(f))
        lbl_total[1].config(text=_fmt_tamanho(total_mb))
        # Pega info do primeiro arquivo
        info = get_info_video(arquivos[0])
        if info:
            lbl_codec[1].config(text=info.get("codec_video", "—").upper())
            w, h = info.get("largura", 0), info.get("altura", 0)
            lbl_res[1].config(text=f"{w}x{h}" if w else "—")

    # ── Qualidade ─────────────────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    Label(win, text="Qualidade da compressão:",
          font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", padx=20)

    qual_frame = Frame(win, bg="#1C1C1C")
    qual_frame.pack(fill="x", padx=20, pady=(6, 0))

    qual_var = tk.IntVar(value=QUALIDADE_PADRAO)
    qualidades = [
        (18, "🌟 Máxima",   "Quase sem perda — arquivo maior"),
        (23, "✅ Ótima",    "Padrão recomendado — melhor equilíbrio"),
        (28, "📦 Compacta", "Menor arquivo — leve perda em cenas rápidas"),
    ]
    for crf, nome, desc in qualidades:
        f = Frame(qual_frame, bg="#1C1C1C")
        f.pack(fill="x", pady=2)
        tk.Radiobutton(f, text=nome, variable=qual_var, value=crf,
                       font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC",
                       selectcolor="#2A2A2A", activebackground="#1C1C1C",
                       activeforeground="#F97316").pack(side="left")
        Label(f, text=f"  {desc}", font=("Segoe UI", 8),
              bg="#1C1C1C", fg="#666666").pack(side="left")

    # ── O que fazer com o original ────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    Label(win, text="Após comprimir:",
          font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", padx=20)

    orig_var = tk.IntVar(value=1)  # 1=manter cópia, 0=substituir
    orig_frame = Frame(win, bg="#1C1C1C")
    orig_frame.pack(fill="x", padx=20, pady=(6, 0))

    opcoes_orig = [
        (1, "📋 Manter original",   "Salva comprimido em pasta separada, original intacto"),
        (0, "🔄 Substituir original", "Apaga original após comprimir — economiza espaço"),
    ]
    for val, nome, desc in opcoes_orig:
        f = Frame(orig_frame, bg="#1C1C1C")
        f.pack(fill="x", pady=2)
        tk.Radiobutton(f, text=nome, variable=orig_var, value=val,
                       font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC",
                       selectcolor="#2A2A2A", activebackground="#1C1C1C",
                       activeforeground="#F97316").pack(side="left")
        Label(f, text=f"  {desc}", font=("Segoe UI", 8),
              bg="#1C1C1C", fg="#666666").pack(side="left")

    # ── Botão comprimir ───────────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    botao_comprimir = Button(win, text="🗜️  Comprimir Vídeo(s)",
                             bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                             font=("Segoe UI", 12, "bold"),
                             bd=0, relief="flat", cursor="hand2", pady=12,
                             state="disabled")
    botao_comprimir.pack(fill="x", padx=20)

    botao_cancelar = Button(win, text="✕  Cancelar",
                            bg="#2A2A2A", fg="#f44336", activebackground="#3a3a3a",
                            font=("Segoe UI", 10, "bold"),
                            bd=0, relief="flat", cursor="hand2", pady=8,
                            state="disabled")
    botao_cancelar.pack(fill="x", padx=20, pady=(4, 0))

    # ── Painel de progresso ───────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=10)
    prog_card = Frame(win, bg="#242424")
    prog_card.pack(fill="x", padx=20)

    # Arquivo atual
    arq_row = Frame(prog_card, bg="#242424")
    arq_row.pack(fill="x", padx=14, pady=(10, 2))
    lbl_arq_titulo = Label(arq_row, text="Aguardando…",
                           font=("Segoe UI", 8), bg="#242424", fg="#666666")
    lbl_arq_titulo.pack(anchor="w")
    lbl_arq_nome = Label(arq_row, text="",
                         font=("Segoe UI", 10, "bold"), bg="#242424", fg="#CCCCCC",
                         anchor="w", wraplength=560)
    lbl_arq_nome.pack(fill="x")

    # Barra + %
    bar_row = Frame(prog_card, bg="#242424")
    bar_row.pack(fill="x", padx=14, pady=(6, 2))
    progress = Progressbar(bar_row, mode="determinate",
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(side="left", fill="x", expand=True)
    lbl_pct = Label(bar_row, text="0%", font=("Segoe UI", 10, "bold"),
                    bg="#242424", fg="#F97316", width=5)
    lbl_pct.pack(side="left", padx=(8, 0))

    # Stats: arquivo atual / total, tamanho original → final, economia
    stats_row = Frame(prog_card, bg="#242424")
    stats_row.pack(fill="x", padx=14, pady=(4, 12))

    lbl_stat_arqs  = _mini_stat(stats_row, "Arquivo",      "—")
    lbl_stat_orig  = _mini_stat(stats_row, "Original",     "—")
    lbl_stat_final = _mini_stat(stats_row, "Comprimido",   "—")
    lbl_stat_econ  = _mini_stat(stats_row, "Economia",     "—")

    lbl_log = Label(win, text="", font=("Consolas", 8),
                    bg="#1C1C1C", fg="#555555", anchor="w",
                    wraplength=580, justify="left")
    lbl_log.pack(fill="x", padx=20, pady=(4, 10))

    def _on_resize(event):
        lbl_arq_nome.config(wraplength=max(200, win.winfo_width() - 60))
        lbl_log.config(wraplength=max(200, win.winfo_width() - 60))
    win.bind("<Configure>", _on_resize)

    # ── Estado interno ────────────────────────────────────────
    stop_event       = threading.Event()
    win._total_orig  = 0.0
    win._total_final = 0.0

    def _log(msg):
        win.after(0, lambda: lbl_log.config(text=msg, fg="#888888"))

    def _prog(pct, texto):
        def _up():
            if pct < 0:
                if progress["mode"] != "indeterminate":
                    progress.config(mode="indeterminate")
                    progress.start(12)
            else:
                if progress["mode"] == "indeterminate":
                    progress.stop()
                    progress.config(mode="determinate")
                progress["value"] = pct
                lbl_pct.config(text=f"{pct}%",
                               fg="#F97316" if pct < 100 else "#4CAF50")
            lbl_log.config(text=texto, fg="#888888")
        win.after(0, _up)

    def _on_arquivo(idx, total, nome):
        win.after(0, lambda: lbl_arq_titulo.config(
            text=f"Comprimindo arquivo {idx} de {total}:", fg="#F97316"))
        win.after(0, lambda: lbl_arq_nome.config(text=nome, fg="#CCCCCC"))
        win.after(0, lambda: lbl_stat_arqs[1].config(text=f"{idx} / {total}"))
        win.after(0, lambda: progress.__setitem__("value", 0))
        win.after(0, lambda: lbl_pct.config(text="0%", fg="#F97316"))

    def rodar():
        stop_event.clear()
        win.after(0, lambda: botao_comprimir.config(state="disabled", text="Comprimindo…"))
        win.after(0, lambda: botao_cancelar.config(state="normal"))
        win.after(0, lambda: progress.config(
            mode="indeterminate", style="Laranja.Horizontal.TProgressbar"))
        win.after(0, progress.start)
        win.after(0, lambda: lbl_arq_titulo.config(text="Iniciando…", fg="#888888"))

        arquivos      = win._arquivos
        manter_orig   = bool(orig_var.get())
        crf           = qual_var.get()

        # Pasta de saída
        if manter_orig:
            pasta_saida = os.path.join(win._pasta_base, "comprimidos_h265")
        else:
            pasta_saida = win._pasta_base  # só temporário, será substituído

        resultado = comprimir_lista(
            arquivos,
            pasta_saida,
            qualidade_crf=crf,
            manter_original=manter_orig,
            callback_progresso=_prog,
            callback_log=_log,
            callback_arquivo=_on_arquivo,
            stop_event=stop_event,
        )

        # Finalização
        win.after(0, lambda: botao_comprimir.config(state="normal", text="🗜️  Comprimir Vídeo(s)"))
        win.after(0, lambda: botao_cancelar.config(state="disabled"))

        ok    = resultado["ok"]
        erros = resultado["erros"]
        orig  = resultado["total_orig_mb"]
        final = resultado["total_final_mb"]
        econ  = resultado["reducao_pct"]

        win.after(0, lambda: lbl_stat_orig[1].config(text=_fmt_tamanho(orig)))
        win.after(0, lambda: lbl_stat_final[1].config(text=_fmt_tamanho(final)))
        win.after(0, lambda: lbl_stat_econ[1].config(
            text=f"-{econ:.0f}%", fg="#4CAF50" if econ > 0 else "#888888"))

        if ok > 0:
            win.after(0, lambda: progress.config(
                mode="determinate", style="Verde.Horizontal.TProgressbar"))
            win.after(0, lambda: progress.__setitem__("value", 100))
            win.after(0, lambda: lbl_pct.config(text="100%", fg="#4CAF50"))
            win.after(0, lambda: lbl_arq_titulo.config(
                text=f"✅ {ok} vídeo(s) comprimido(s) com sucesso!", fg="#4CAF50"))
            win.after(0, lambda: lbl_arq_nome.config(
                text=f"{_fmt_tamanho(orig)} → {_fmt_tamanho(final)}  (-{econ:.0f}% de peso)",
                fg="#4CAF50"))
            win.after(0, lambda: tocar("concluido.wav"))
            if manter_orig:
                win.after(500, lambda: abrir_pasta(pasta_saida))
            else:
                win.after(500, lambda: abrir_pasta(win._pasta_base))
        else:
            win.after(0, lambda: lbl_arq_titulo.config(
                text="⚠️  Nenhum vídeo foi comprimido.", fg="#f59e0b"))

        if erros > 0:
            win.after(0, lambda: _log(f"⚠️  {erros} arquivo(s) com erro."))

    def cancelar():
        stop_event.set()
        win.after(0, lambda: botao_cancelar.config(state="disabled"))
        win.after(0, lambda: lbl_log.config(
            text="⛔ Cancelando… aguarde o arquivo atual terminar.", fg="#888888"))

    botao_comprimir.config(
        command=lambda: threading.Thread(target=rodar, daemon=True).start())
    botao_cancelar.config(command=cancelar)


def _mini_stat(parent, titulo, valor_inicial):
    """Cria um bloco de estatística com título e valor. Retorna (frame, lbl_valor)."""
    f = Frame(parent, bg=parent.cget("bg"))
    f.pack(side="left", padx=(0, 24))
    Label(f, text=titulo, font=("Segoe UI", 8),
          bg=parent.cget("bg"), fg="#666666").pack(anchor="w")
    lbl = Label(f, text=valor_inicial, font=("Segoe UI", 11, "bold"),
                bg=parent.cget("bg"), fg="#CCCCCC")
    lbl.pack(anchor="w")
    return f, lbl


# =========================
# ⚙️ TELA DE SETUP
# =========================
def abrir_setup(depois):
    """
    Verifica e baixa modelos faltando antes de abrir o hub.
    Se tudo estiver instalado, vai direto para o hub.
    """
    global _SETUP_RODANDO
    if _SETUP_RODANDO:
        return  # Evita múltiplas janelas de setup
    _SETUP_RODANDO = True

    faltando = verificar_modelos()

    if not faltando:
        _SETUP_RODANDO = False
        depois()
        return

    win = Tk()
    win.title("Canivete do Pailer — Configuração Inicial")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    largura, altura = 520, 480
    x = (win.winfo_screenwidth()  // 2) - (largura // 2)
    y = (win.winfo_screenheight() // 2) - (altura  // 2)
    win.geometry(f"{largura}x{altura}+{x}+{y}")
    win.resizable(False, False)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: os.sys.exit(0))

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

    # Header
    frame_header = Frame(win, bg="#F97316", pady=10)
    frame_header.pack(fill="x")
    try:
        img = Image.open(resource_path("splash.png")).resize((38, 38), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        lbl = Label(frame_header, image=photo, bg="#F97316", bd=0)
        lbl.image = photo
        lbl.pack(side="left", padx=(14, 8))
    except Exception:
        pass
    Label(frame_header, text="Configuração Inicial",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(win, text="Baixando modelos de IA necessários para o Canivete do Pailer.",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC", wraplength=480).pack(pady=(14, 2))
    Label(win, text="Isso só acontece uma vez. Após o download, o app abre normalmente.",
          font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888", wraplength=480).pack()

    # Lista de modelos
    frame_modelos = Frame(win, bg="#242424")
    frame_modelos.pack(fill="x", padx=24, pady=12)

    status_labels    = {}
    progress_labels  = {}

    for m in faltando:
        frame_m = Frame(frame_modelos, bg="#242424")
        frame_m.pack(fill="x", padx=12, pady=5)

        # Linha 1: nome + status
        row_top = Frame(frame_m, bg="#242424")
        row_top.pack(fill="x")
        tamanho_txt = m['tamanho'] if m['tamanho'] != "login" else "login via navegador"
        Label(row_top, text=f"{m['nome']}  ({tamanho_txt})",
              font=("Segoe UI", 9, "bold"), bg="#242424", fg="#CCCCCC",
              anchor="w", width=32).pack(side="left")
        lbl_status = Label(row_top, text="⏳ Aguardando...",
                           font=("Segoe UI", 9), bg="#242424", fg="#888888")
        lbl_status.pack(side="left")
        status_labels[m['nome']] = lbl_status

        # Linha 2: barra de progresso individual + MB
        row_bot = Frame(frame_m, bg="#242424")
        row_bot.pack(fill="x", pady=(2, 0))
        pb = Progressbar(row_bot, length=340, mode="determinate",
                         style="Laranja.Horizontal.TProgressbar")
        pb.pack(side="left")
        lbl_mb = Label(row_bot, text="", font=("Consolas", 8),
                       bg="#242424", fg="#F97316", width=22, anchor="w")
        lbl_mb.pack(side="left", padx=(8, 0))
        progress_labels[m['nome']] = (pb, lbl_mb)

    # Status geral
    status_label = Label(win, text="Iniciando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#F97316")
    status_label.pack(pady=(8, 0))

    log_box = Text(win, height=7, width=60, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(8, 12), padx=24)

    def log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def rodar_setup():
        total = len(faltando)
        ok    = 0
        erros = 0

        for i, modelo in enumerate(faltando):
            nome = modelo['nome']
            pb, lbl_mb = progress_labels[nome]

            status_labels[nome].config(text="🔄 Baixando...", fg="#F97316")
            pb.config(mode="indeterminate")
            pb.start(12)
            win.update_idletasks()

            status_label.config(text=f"Baixando {nome} ({i+1}/{total})...")
            log(f"\n{'='*40}")
            log(f"📦 {nome} — {modelo['descricao']}")
            log(f"{'='*40}")

            def fazer_progresso_mb(pct, texto, _pb=pb, _lbl=lbl_mb, _nome=nome):
                eh_login = _nome == "Google Drive — Login"
                if eh_login:
                    # Login não tem progresso numérico — mantém indeterminate
                    if _pb["mode"] != "indeterminate":
                        _pb.config(mode="indeterminate")
                        _pb.start(12)
                    _lbl.config(text=texto)
                else:
                    if _pb["mode"] == "indeterminate":
                        _pb.stop()
                        _pb.config(mode="determinate")
                    if pct >= 0:
                        _pb["value"] = pct
                    _lbl.config(text=texto)
                win.update_idletasks()

            try:
                sucesso = modelo['instalar'](
                    callback_log=log,
                    callback_progresso=fazer_progresso_mb
                )
                pb.stop()
                pb.config(mode="determinate")
                if sucesso:
                    pb.stop()
                    pb.config(mode="determinate")
                    pb["value"] = 100
                    lbl_mb.config(text="✅ Concluído!")
                    status_labels[nome].config(text="✅ Instalado!", fg="#4CAF50")
                    ok += 1
                else:
                    pb["value"] = 0
                    lbl_mb.config(text="")
                    status_labels[nome].config(text="❌ Falhou", fg="#f44336")
                    erros += 1
            except Exception as e:
                pb.stop()
                log(f"❌ Erro inesperado: {e}")
                status_labels[nome].config(text="❌ Erro", fg="#f44336")
                erros += 1

        if erros == 0:
            status_label.config(text="✅ Tudo pronto! Abrindo o Canivete do Pailer...")
            log("\n✅ Setup concluído! Iniciando o app...")
            tocar("concluido.wav")
            def finalizar():
                global _SETUP_RODANDO
                _SETUP_RODANDO = False
                win.destroy()
                depois()
            win.after(1500, finalizar)
        else:
            status_label.config(text=f"⚠️  {erros} modelo(s) falharam — algumas funções podem não funcionar")
            log(f"\n⚠️  {erros} falha(s). O app vai abrir mas algumas funções podem estar limitadas.")
            import tkinter as tk
            def tentar_novamente():
                btn_retry.config(state="disabled")
                btn_skip.config(state="disabled")
                log_box.delete("1.0", END)
                threading.Thread(target=rodar_setup, daemon=True).start()

            def abrir_mesmo_assim():
                global _SETUP_RODANDO
                _SETUP_RODANDO = False
                win.destroy()
                depois()

            frame_btns = Frame(win, bg="#1C1C1C")
            frame_btns.pack(pady=8)

            btn_retry = Button(frame_btns, text="🔄  Tentar Novamente",
                             bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                             font=("Segoe UI", 10, "bold"),
                             bd=0, cursor="hand2", relief="flat", pady=6, padx=16,
                             command=tentar_novamente)
            btn_retry.pack(side="left", padx=6)

            btn_skip = Button(frame_btns, text="Abrir mesmo assim →",
                             bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                             font=("Segoe UI", 10, "bold"),
                             bd=0, cursor="hand2", relief="flat", pady=6, padx=16,
                             command=abrir_mesmo_assim)
            btn_skip.pack(side="left", padx=6)

    _setup_evento = threading.Event()

    def rodar_setup_seguro():
        rodar_setup()
        _setup_evento.set()

    threading.Thread(target=rodar_setup_seguro, daemon=False).start()
    win.mainloop()


# =========================
# 🚀 ENTRY POINT
# =========================
if __name__ == "__main__":
    import sys as _sys
    # Passe --force-setup para forçar a tela de setup (útil para testar)
    if "--force-setup" in _sys.argv:
        from setup_modelos import get_modelos
        _modelos_originais = get_modelos
        import setup_modelos as _sm
        _sm.tudo_instalado = lambda: False
        _sm.verificar_modelos = lambda: _sm.get_modelos()
    mostrar_splash(lambda: abrir_setup(abrir_hub))
