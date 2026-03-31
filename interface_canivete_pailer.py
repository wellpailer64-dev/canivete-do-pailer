import threading
import sys
import os
import ctypes
from tkinter import Tk, Toplevel, Button, Label, filedialog, Text, END, Frame, font as tkFont
from tkinter.ttk import Progressbar, Style
from PIL import Image, ImageTk
from organizador_de_imagens import limpar_pasta
from convertermp3 import converter_pasta, converter_arquivos, FORMATOS_SAIDA as FORMATOS_AUDIO_SAIDA
from converterimagem import (converter_pasta as img_converter_pasta,
                              converter_arquivos as img_converter_arquivos,
                              FORMATOS_SAIDA)
from videoconverter import (converter_arquivo as video_converter_arquivo,
                            detectar_tipo_arquivo,
                            FORMATOS_SAIDA_VIDEO_PARA_GIF,
                            FORMATOS_SAIDA_GIF_PARA_VIDEO)
from transcreveraudio import (transcrever_pasta, transcrever_audios, MODELOS)
from faviconconverter import gerar_favicon
from organizador_de_videos import organizar_videos
from transcrever_cena import analisar_e_renomear_pasta
from snapshot_logger import restaurar_backup, aplicar_nextup
from gdrive_dumper import (extract_folder_id, verificar_rclone, verificar_gdrive_configurado,
                           calcular_tamanho_pasta, dump_pasta)
from atualizador import verificar_em_background, baixar_e_aplicar, get_versao_local
from compressor_video import (listar_videos, comprimir_lista, get_info_video,
                              EXTENSOES_VIDEO, QUALIDADE_PADRAO, _fmt_tamanho,
                              detectar_encoders_disponiveis)
from compressor_imagem import (listar_arquivos as listar_arquivos_img,
                               comprimir_lista as comprimir_lista_img)
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
# 🔍 HELPERS (Devem vir primeiro)
# =========================
def resource_path(filename):
    """Acessa arquivos embutidos no .exe pelo PyInstaller."""
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, filename)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)


def get_base_dir():
    """Pasta ao lado do .exe (onde ficam modelos, rclone, exiftool)."""
    if hasattr(sys, "_MEIPASS"):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


_CLICK_SOM_ATIVO = False
_FONTE_MAIN = "Segoe UI"  # Fallback

def carregar_fonte_customizada():
    """Carrega a fonte CreateFutureRegular para a sessao do Windows."""
    global _FONTE_MAIN
    try:
        font_path = os.path.abspath(resource_path("CreateFutureRegular-m2Mw2.otf"))
        if os.path.exists(font_path):
            # Carrega a fonte no Windows (apenas para este processo)
            # FR_PRIVATE = 0x10
            res = ctypes.windll.gdi32.AddFontResourceExW(font_path, 0x10, 0)
            if res > 0:
                _FONTE_MAIN = "Create Future"
                # Notifica o sistema
                ctypes.windll.user32.PostMessageW(0xFFFF, 0x001D, 0, 0)
                print(f"Fonte carregada: {_FONTE_MAIN}")
            else:
                print(f"Falha ao registrar fonte {font_path}")
        else:
            print(f"Arquivo de fonte nao encontrado: {font_path}")
    except Exception as e:
        print(f"Erro ao carregar fonte: {e}")

# Inicializa a fonte apos definir resource_path
# Tentativa 1: Global
carregar_fonte_customizada()


# =========================
# 🎵 AUDIO PLAYER
# =========================
def tocar(arquivo):
    def _play():
        try:
            candidatos = [arquivo]
            if os.path.basename(arquivo) == arquivo:
                candidatos.insert(0, os.path.join("sound", arquivo))

            path = None
            for item in candidatos:
                p = resource_path(item)
                if os.path.exists(p):
                    path = p
                    break

            if not path:
                return
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


def configurar_janela_responsiva(win, largura=900, altura=680, min_w=640, min_h=520):
    """Configura janela com tamanho inicial centralizado e redimensionamento livre."""
    try:
        sw = win.winfo_screenwidth()
        sh = win.winfo_screenheight()
        largura = min(int(largura), max(640, sw - 60))
        altura = min(int(altura), max(520, sh - 80))
        x = max((sw // 2) - (largura // 2), 0)
        y = max((sh // 2) - (altura // 2), 0)
        win.geometry(f"{largura}x{altura}+{x}+{y}")
        win.minsize(min_w, min_h)
        win.resizable(True, True)
    except Exception:
        pass


def ativar_som_click_global(widget):
    """Reproduz click.wav ao clicar em botoes/check/radio no app."""
    global _CLICK_SOM_ATIVO
    if _CLICK_SOM_ATIVO:
        return

    def _on_click(event):
        try:
            w = event.widget
            try:
                if str(w.cget("state")).lower() == "disabled":
                    return
            except Exception:
                pass
            tocar("click.wav")
        except Exception:
            pass

    try:
        for classe in ["Button", "TButton", "Checkbutton", "TCheckbutton", "Radiobutton", "TRadiobutton"]:
            widget.bind_class(classe, "<ButtonRelease-1>", _on_click, add="+")
        _CLICK_SOM_ATIVO = True
    except Exception:
        pass


# =========================
# 🎨 SPLASH SCREEN
# =========================
def mostrar_splash(depois):
    """Exibe splash screen com GIF animado (splash.gif) ou PNG estatico."""
    splash = Tk()
    splash.overrideredirect(True)
    largura, altura = 360, 420
    sw = splash.winfo_screenwidth()
    sh = splash.winfo_screenheight()
    x = (sw // 2) - (largura // 2)
    y = (sh // 2) - (altura // 2)
    splash.geometry(f"{largura}x{altura}+{x}+{y}")
    # Layout Cyberpunk: Fundo Preto
    splash.configure(bg="#0A0A0A")

    frames = []
    # 1. Tenta carregar o GIF animado
    try:
        gif_path = resource_path("splash.gif")
        if os.path.exists(gif_path):
            img_gif = Image.open(gif_path)
            try:
                rs = Image.Resampling.LANCZOS
            except AttributeError:
                rs = Image.LANCZOS

            total_frames = getattr(img_gif, "n_frames", 1)
            for i in range(total_frames):
                img_gif.seek(i)
                # Mantém fundo preto na conversão se houver transparência
                frame_data = img_gif.copy().convert("RGBA").resize((220, 220), rs)
                frames.append(ImageTk.PhotoImage(frame_data, master=splash))
    except Exception:
        frames = []

    # 2. Fallback para PNG
    splash_photo = None
    if not frames:
        try:
            png_path = resource_path("splash.png")
            if os.path.exists(png_path):
                img_png = Image.open(png_path).resize((220, 220), Image.LANCZOS)
                splash_photo = ImageTk.PhotoImage(img_png, master=splash)
        except Exception:
            pass

    # Widget da Imagem com borda sutil neon
    lbl = Label(splash, bg="#0A0A0A", bd=0)
    lbl.pack(pady=(45, 15))
    
    if frames:
        lbl._frames = frames
    elif splash_photo:
        lbl._photo = splash_photo

    # Loop de animação: 100ms para execução mais lenta e natural
    def animar(idx=0):
        try:
            if frames:
                lbl.config(image=frames[idx])
                splash.after(100, lambda: animar((idx + 1) % len(frames)))
            elif splash_photo:
                lbl.config(image=splash_photo)
            else:
                lbl.config(text="⚙️", font=("Segoe UI", 60), fg="#F97316", bg="#0A0A0A")
        except Exception:
            pass

    # Tipografia Cyberpunk (Preto + Laranja Neon)
    # Tenta usar a fonte carregada; se falhar, o Tkinter usa fallback
    Label(splash, text="CANIVETE DO PAILER",
          font=(_FONTE_MAIN, 20), bg="#0A0A0A", fg="#F97316").pack()
    
    Label(splash, text="System tools for digital creators",
          font=("Segoe UI", 9), bg="#0A0A0A", fg="#444444").pack(pady=(2, 0))
    
    # Barra de progresso fake / Carregando
    Label(splash, text="INITIALIZING SYSTEM...",
          font=("Consolas", 8), bg="#0A0A0A", fg="#F97316").pack(pady=(25, 0))

    animar()
    splash.update()
    tocar("splash.wav")

    # Mantém o splash por 3.5s para apreciar o GIF lento
    splash.after(3500, lambda: [splash.destroy(), depois()])
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
    ativar_som_click_global(hub)
    try:
        hub.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    configurar_janela_responsiva(hub, largura=980, altura=720, min_w=760, min_h=560)
    hub.configure(bg="#1C1C1C")

    # ── HERO HEADER ───────────────────────────────────────────
    hero_frame = Frame(hub, bg="#1C1C1C")
    hero_frame.pack(fill="x", side="top")
    
    lbl_hero = Label(hero_frame, bg="#1C1C1C", bd=0)
    lbl_hero.pack(fill="x")

    def _atualizar_hero(_event=None):
        try:
            largura_w = hub.winfo_width()
            if largura_w < 100: largura_w = 980
            
            # Carrega e redimensiona a imagem Hero
            img_path = resource_path("hero.webp")
            if os.path.exists(img_path):
                img = Image.open(img_path)
                # Calcula altura proporcional para largura total ou limitada
                img_w, img_h = img.size
                nova_w = largura_w
                nova_h = int((nova_w / img_w) * img_h)
                
                # Limita altura máxima do hero para não comer a tela toda
                if nova_h > 280:
                    nova_h = 280
                    nova_w = int((nova_h / img_h) * img_w)

                img_res = img.resize((nova_w, nova_h), Image.LANCZOS)
                photo = ImageTk.PhotoImage(img_res)
                lbl_hero.config(image=photo)
                lbl_hero.image = photo # Referência
        except Exception as e:
            print(f"Erro no Hero: {e}")

    lbl_intro = Label(hub, text="Selecione uma ferramenta para começar",
                      font=("Segoe UI", 10), bg="#1C1C1C", fg="#AAAAAA")
    lbl_intro.pack(pady=(18, 10))

    # Grade de botões 3 colunas
    frame_grid = Frame(hub, bg="#1C1C1C")
    frame_grid.pack(fill="both", expand=True, padx=24, pady=(0, 12))

    # Configura colunas com peso igual para expandir
    for col in range(3):
        frame_grid.columnconfigure(col, weight=1)

    ferramentas = [
        ("🗂️", "Organizador de Imagens",  lambda: [hub.withdraw(), abrir_organizador_janela(hub)],      "#F97316", "#0F0F0F"),
        ("🎵", "Converter Áudios",         lambda: [hub.withdraw(), abrir_conversor_janela(hub)],         "#2A2A2A", "#F97316"),
        ("🖼️", "Converter Imagens",        lambda: [hub.withdraw(), abrir_conversor_imagem_janela(hub)],  "#2A2A2A", "#F97316"),
        ("🎙️", "Transcrever Audios",       lambda: [hub.withdraw(), abrir_transcricao_janela(hub)],       "#2A2A2A", "#F97316"),
        ("🌐", "Favicon Generator",        lambda: [hub.withdraw(), abrir_favicon_janela(hub)],           "#2A2A2A", "#F97316"),
        ("✂️", "Remover Fundo",            lambda: [hub.withdraw(), abrir_remover_fundo_janela(hub)],     "#2A2A2A", "#F97316"),
        ("🎬", "Logger Brabo",              lambda: [hub.withdraw(), abrir_org_videos_janela(hub)],        "#2A2A2A", "#F97316"),
        ("☁️", "GDrive Dumper",            lambda: [hub.withdraw(), abrir_gdrive_dumper_janela(hub)],     "#2A2A2A", "#F97316"),
        ("🗜️", "Compressor de Vídeo",      lambda: [hub.withdraw(), abrir_compressor_video_janela(hub)], "#2A2A2A", "#F97316"),
        ("🎞️", "Video Converter",         lambda: [hub.withdraw(), abrir_video_converter_janela(hub)],   "#2A2A2A", "#F97316"),
        ("🖼️", "Compressor de Imagem",    lambda: [hub.withdraw(), abrir_compressor_imagem_janela(hub)], "#2A2A2A", "#F97316"),
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

    def _ajustar_respiro_hub(event=None):
        try:
            _atualizar_hero() # Atualiza imagem hero no redimensionamento
            largura_atual = hub.winfo_width()
            pad = max(24, (largura_atual - 980) // 2)
            frame_grid.pack_configure(padx=pad)
            lbl_intro.pack_configure(padx=pad)
        except Exception:
            pass

    hub.bind("<Configure>", _ajustar_respiro_hub)
    hub.after(150, _ajustar_respiro_hub)

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

    configurar_janela_responsiva(win, largura=760, altura=700, min_w=640, min_h=560)
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

    def rodar_desagrupar_thread():
        """Seleciona pasta organizada e extrai todos os arquivos para uma pasta plana."""
        pasta_src = filedialog.askdirectory(
            parent=win,
            title="Selecionar pasta para desagrupar"
        )
        if not pasta_src:
            return

        # Pede o nome da pasta de saída
        import tkinter.simpledialog as _sd
        nome_saida = _sd.askstring(
            "Nome da pasta de saída",
            "Digite o nome da pasta onde os arquivos serão colocados:",
            initialvalue="BRUTOS_DESAGRUPADOS",
            parent=win
        )
        if not nome_saida:
            return
        nome_saida = nome_saida.strip() or "BRUTOS_DESAGRUPADOS"

        botao_desagrupar.config(state="disabled", text="Desagrupando…")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Desagrupando arquivos...")

        def _rodar():
            try:
                import re as _re
                import shutil as _sh

                # Pasta de saída ao lado da pasta selecionada
                pasta_pai = os.path.dirname(os.path.abspath(pasta_src))
                pasta_dest = os.path.join(pasta_pai, nome_saida)
                os.makedirs(pasta_dest, exist_ok=True)

                log(f"📂 Origem:  {pasta_src}")
                log(f"📂 Destino: {pasta_dest}")

                # Coleta todos os arquivos recursivamente
                arquivos = []
                for root, dirs, files in os.walk(pasta_src):
                    for f in files:
                        if not f.startswith('.'):
                            arquivos.append(os.path.join(root, f))

                total = len(arquivos)
                log(f"📥 {total} arquivo(s) encontrado(s)")

                movidos = 0
                erros   = 0
                for i, src_path in enumerate(arquivos):
                    nome = os.path.basename(src_path)
                    dest = os.path.join(pasta_dest, nome)
                    # Evita colisão de nomes
                    base, ext = os.path.splitext(nome)
                    n = 1
                    while os.path.exists(dest):
                        dest = os.path.join(pasta_dest, f"{base}_{n}{ext}")
                        n += 1
                    try:
                        _sh.move(src_path, dest)
                        movidos += 1
                    except Exception as e:
                        log(f"   ⚠️  {nome}: {e}")
                        erros += 1

                    if total > 0:
                        win.after(0, lambda v=int((i+1)/total*100):
                                  progress.__setitem__("value", v))
                        win.after(0, lambda t=f"Copiando... {i+1}/{total}":
                                  status_label.config(text=t))

                log(f"\n✅ {movidos} arquivo(s) copiados")
                if erros:
                    log(f"⚠️  {erros} erro(s)")
                win.after(0, lambda: status_label.config(
                    text=f"✅ Desagrupamento concluído! {movidos} arquivos"))
                win.after(0, lambda: tocar("concluido.wav"))
                win.after(500, lambda: abrir_pasta(pasta_dest))

            except Exception as e:
                log(f"❌ ERRO: {e}")
                win.after(0, lambda: status_label.config(text="❌ Erro ao desagrupar"))
            finally:
                win.after(0, lambda: botao_desagrupar.config(
                    state="normal", text="📂  Desagrupar Pasta"))

        threading.Thread(target=_rodar, daemon=True).start()

    botao_desagrupar.config(command=rodar_desagrupar_thread)

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
    win.title("🎵 Converter Áudios — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    configurar_janela_responsiva(win, largura=760, altura=640, min_w=640, min_h=520)
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
    Label(frame_header, text="Converter Áudios",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    import tkinter as tk
    formatos_audio = list(FORMATOS_AUDIO_SAIDA.keys())
    formato_saida_var = tk.StringVar(value="MP3")

    Label(win, text="Formato de saída:",
          font=("Segoe UI", 10, "bold"), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 2))

    frame_formatos = Frame(win, bg="#1C1C1C")
    frame_formatos.pack()
    for fmt in formatos_audio:
        tk.Radiobutton(
            frame_formatos, text=fmt, variable=formato_saida_var, value=fmt,
            bg="#1C1C1C", fg="#F97316", selectcolor="#2A2A2A",
            activebackground="#1C1C1C", activeforeground="#F97316",
            font=("Segoe UI", 9, "bold"), cursor="hand2"
        ).pack(side="left", padx=6)

    Label(win, text="Selecione uma pasta ou arquivos de áudio para converter",
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
            filetypes=[("Áudios", "*.mp3 *.wav *.ogg *.flac *.aac *.m4a *.wma *.opus *.aiff *.aif *.amr *.ac3 *.webm *.mka *.caf")]
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
        formato_saida = formato_saida_var.get().strip().lower()
        status_label.config(text=f"Convertendo para {formato_saida.upper()}...")

        try:
            if win.modo == "pasta":
                resultado = converter_pasta(win.selecao,
                                            formato_saida=formato_saida,
                                            callback_progresso=atualizar_progresso,
                                            callback_log=log)
            else:
                resultado = converter_arquivos(win.selecao,
                                               formato_saida=formato_saida,
                                               callback_progresso=atualizar_progresso,
                                               callback_log=log)

            log("\n" + "="*45)
            log("🔥 FINALIZADO")
            log("="*45)
            log(f"  Total      : {resultado['total']}")
            log(f"  Convertidos: {resultado['convertidos']}")
            log(f"  Falhas     : {resultado['falhas']}")
            log(f"  Saída      : {formato_saida.upper()}")

            contadores['total'].config(text=str(resultado['total']))
            contadores['convertidos'].config(text=str(resultado['convertidos']))
            contadores['falhas'].config(text=str(resultado['falhas']))
            status_label.config(text=f"✅ Conversão para {formato_saida.upper()} concluída!")
            tocar("concluido.wav")
            abrir_pasta(os.path.dirname(win.selecao[0]) if win.modo == "arquivos" else win.selecao)

        except Exception as e:
            log(f"❌ ERRO: {e}")
            status_label.config(text="❌ Erro durante a conversão")
        finally:
            botao_converter.config(state="normal")

    botao_converter.config(command=lambda: threading.Thread(
        target=rodar_em_thread, daemon=True).start())


# =========================
# 🎞️ VIDEO CONVERTER
# =========================
def abrir_video_converter_janela(hub):
    win = Toplevel()
    win.title("🎞️ Video Converter — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    configurar_janela_responsiva(win, largura=780, altura=700, min_w=650, min_h=560)
    win.configure(bg="#1C1C1C")
    win.protocol("WM_DELETE_WINDOW", lambda: [win.destroy(), hub.deiconify()])

    style = Style()
    style.theme_use("clam")
    style.configure("Laranja.Horizontal.TProgressbar",
                    troughcolor="#2A2A2A", background="#F97316",
                    bordercolor="#1C1C1C", lightcolor="#F97316", darkcolor="#F97316")

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
    Label(frame_header, text="Video Converter",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(win, text="Converta vídeo para GIF leve ou GIF para vídeo.",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 4))

    frame_sel = Frame(win, bg="#1C1C1C")
    frame_sel.pack(fill="x", padx=28)

    status_sel = Label(frame_sel, text="Nenhum arquivo selecionado.",
                       font=("Segoe UI", 9), bg="#1C1C1C", fg="#AAAAAA",
                       anchor="w", wraplength=640, justify="left")
    status_sel.pack(fill="x", pady=(0, 8))

    frame_info = Frame(win, bg="#242424")
    frame_info.pack(fill="x", padx=28, pady=(2, 10))

    lbl_tipo = Label(frame_info, text="Entrada: —", font=("Segoe UI", 9, "bold"),
                     bg="#242424", fg="#CCCCCC")
    lbl_tipo.pack(anchor="w", padx=12, pady=(8, 2))
    lbl_saida_hint = Label(frame_info, text="Saída disponível: —", font=("Segoe UI", 9),
                           bg="#242424", fg="#888888")
    lbl_saida_hint.pack(anchor="w", padx=12, pady=(0, 8))

    import tkinter as tk
    formato_var = tk.StringVar(value="GIF")
    loop_var = tk.IntVar(value=1)

    frame_formatos = Frame(win, bg="#1C1C1C")
    frame_formatos.pack(fill="x", padx=28)

    Label(frame_formatos, text="Formato de saída:",
          font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w")

    frame_radios = Frame(frame_formatos, bg="#1C1C1C")
    frame_radios.pack(fill="x", pady=(4, 2))

    rb_1 = tk.Radiobutton(frame_radios, variable=formato_var, value="GIF",
                          text="GIF", bg="#1C1C1C", fg="#F97316", selectcolor="#2A2A2A",
                          activebackground="#1C1C1C", activeforeground="#F97316",
                          font=("Segoe UI", 9, "bold"), state="disabled")
    rb_2 = tk.Radiobutton(frame_radios, variable=formato_var, value="MP4",
                          text="MP4", bg="#1C1C1C", fg="#F97316", selectcolor="#2A2A2A",
                          activebackground="#1C1C1C", activeforeground="#F97316",
                          font=("Segoe UI", 9, "bold"), state="disabled")
    rb_3 = tk.Radiobutton(frame_radios, variable=formato_var, value="MOV",
                          text="MOV", bg="#1C1C1C", fg="#F97316", selectcolor="#2A2A2A",
                          activebackground="#1C1C1C", activeforeground="#F97316",
                          font=("Segoe UI", 9, "bold"), state="disabled")
    rb_4 = tk.Radiobutton(frame_radios, variable=formato_var, value="WEBM",
                          text="WEBM", bg="#1C1C1C", fg="#F97316", selectcolor="#2A2A2A",
                          activebackground="#1C1C1C", activeforeground="#F97316",
                          font=("Segoe UI", 9, "bold"), state="disabled")
    rb_1.pack(side="left", padx=(0, 8))
    rb_2.pack(side="left", padx=(0, 8))
    rb_3.pack(side="left", padx=(0, 8))
    rb_4.pack(side="left", padx=(0, 8))

    chk_loop = tk.Checkbutton(frame_formatos, text="Loop infinito no GIF",
                              variable=loop_var, bg="#1C1C1C", fg="#CCCCCC",
                              selectcolor="#2A2A2A", activebackground="#1C1C1C",
                              activeforeground="#F97316", font=("Segoe UI", 9, "bold"),
                              state="disabled")
    chk_loop.pack(anchor="w", pady=(4, 0))

    progress = Progressbar(win, length=500, mode='determinate',
                           style="Laranja.Horizontal.TProgressbar")
    progress.pack(pady=(16, 2), padx=28, fill="x")

    status_label = Label(win, text="Aguardando...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
    status_label.pack()

    log_box = Text(win, height=10, width=66, font=("Consolas", 8),
                   bg="#111111", fg="#CCCCCC", insertbackground="#F97316",
                   relief="flat", bd=0)
    log_box.pack(pady=(6, 8), padx=28, fill="both", expand=True)

    frame_btn = Frame(win, bg="#1C1C1C")
    frame_btn.pack(pady=(0, 12))

    botao_sel = Button(frame_btn, text="📁  Selecionar Arquivo",
                       bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                       font=("Segoe UI", 10, "bold"), width=20,
                       bd=0, cursor="hand2", relief="flat", pady=6)
    botao_sel.pack(side="left", padx=6)

    botao_conv = Button(frame_btn, text="▶  Converter",
                        bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                        state="disabled", font=("Segoe UI", 10, "bold"), width=16,
                        bd=0, cursor="hand2", relief="flat", pady=6)
    botao_conv.pack(side="left", padx=6)

    win.arquivo = None
    win.tipo_entrada = None

    def _set_radios(tipo):
        for rb in [rb_1, rb_2, rb_3, rb_4]:
            rb.config(state="disabled")
        chk_loop.config(state="disabled")

        if tipo == "video":
            rb_1.config(state="normal")
            formato_var.set("GIF")
            chk_loop.config(state="normal")
            lbl_saida_hint.config(text="Saída disponível: GIF")
        elif tipo == "gif":
            rb_2.config(state="normal")
            rb_3.config(state="normal")
            rb_4.config(state="normal")
            formato_var.set("MP4")
            lbl_saida_hint.config(text="Saída disponível: MP4, MOV, WEBM")
        else:
            formato_var.set("GIF")
            lbl_saida_hint.config(text="Saída disponível: —")

    def _log(msg):
        log_box.insert(END, msg + "\n")
        log_box.see(END)
        win.update_idletasks()

    def _prog(val, txt):
        progress["value"] = val
        status_label.config(text=txt)
        win.update_idletasks()

    def selecionar_arquivo():
        path = filedialog.askopenfilename(
            parent=win,
            title="Selecionar vídeo ou GIF",
            filetypes=[
                ("Vídeo e GIF", "*.gif *.mp4 *.mov *.avi *.mkv *.webm *.m4v *.wmv *.flv *.mpeg *.mpg"),
                ("Todos", "*.*"),
            ],
        )
        if not path:
            return

        tipo = detectar_tipo_arquivo(path)
        if tipo == "invalido":
            status_sel.config(text="❌ Formato não suportado.")
            botao_conv.config(state="disabled")
            lbl_tipo.config(text="Entrada: inválida")
            _set_radios("invalido")
            return

        win.arquivo = path
        win.tipo_entrada = tipo
        status_sel.config(text=f"📄  {path}")
        lbl_tipo.config(text=f"Entrada: {'GIF' if tipo == 'gif' else 'VÍDEO'}")
        _set_radios(tipo)
        botao_conv.config(state="normal")

    def rodar():
        if not win.arquivo:
            return
        botao_conv.config(state="disabled")
        botao_sel.config(state="disabled")
        progress["value"] = 0
        log_box.delete("1.0", END)
        _prog(10, "Iniciando...")

        try:
            resultado = video_converter_arquivo(
                win.arquivo,
                formato_var.get(),
                loop_gif=bool(loop_var.get()),
                callback_progresso=_prog,
                callback_log=_log,
            )

            if resultado.get("sucesso"):
                saida = resultado.get("saida")
                _log("✅ Conversão concluída")
                _log(f"📦 Saída: {os.path.basename(saida)}")
                status_label.config(text="✅ Conversão concluída!")
                tocar("concluido.wav")
                abrir_pasta(os.path.dirname(saida))
            else:
                _log(f"❌ Erro: {resultado.get('erro', 'Falha na conversão')}")
                status_label.config(text="❌ Erro durante conversão")
        except Exception as e:
            _log(f"❌ Erro inesperado: {e}")
            status_label.config(text="❌ Erro durante conversão")
        finally:
            botao_conv.config(state="normal")
            botao_sel.config(state="normal")

    botao_sel.config(command=selecionar_arquivo)
    botao_conv.config(command=lambda: threading.Thread(target=rodar, daemon=True).start())


# =========================
# 🖼️ COMPRESSOR DE IMAGEM
# =========================
def abrir_compressor_imagem_janela(hub):
    win = Toplevel()
    win.title("🖼️ Compressor de Imagem — Canivete do Pailer")
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    configurar_janela_responsiva(win, largura=860, altura=760, min_w=700, min_h=580)
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
    Label(frame_header, text="Compressor de Imagem",
          font=("Segoe UI", 12, "bold"), bg="#F97316", fg="#0F0F0F").pack(side="left")

    Label(win, text="Comprime imagens, GIF e PDF mantendo no mesmo projeto.",
          font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC").pack(pady=(14, 4))

    frame_sel = Frame(win, bg="#1C1C1C")
    frame_sel.pack(fill="x", padx=20)

    lbl_sel = Label(frame_sel, text="Nenhuma seleção.", font=("Segoe UI", 9),
                    bg="#1C1C1C", fg="#AAAAAA", anchor="w", justify="left", wraplength=760)
    lbl_sel.pack(fill="x", pady=(0, 8))

    btn_row = Frame(win, bg="#1C1C1C")
    btn_row.pack(fill="x", padx=20)

    btn_s = {"font": ("Segoe UI", 10, "bold"), "bd": 0, "cursor": "hand2", "relief": "flat", "pady": 8}

    botao_pasta = Button(btn_row, text="📂 Pasta inteira",
                         bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                         **btn_s)
    botao_pasta.pack(side="left", fill="x", expand=True, padx=(0, 6))

    botao_arquivos = Button(btn_row, text="🖼️ Arquivos avulsos",
                            bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                            **btn_s)
    botao_arquivos.pack(side="left", fill="x", expand=True)

    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)

    import tkinter as tk
    qual_var = tk.IntVar(value=75)
    Label(win, text="Nível de compressão:", font=("Segoe UI", 9, "bold"),
          bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", padx=20)

    qual_frame = Frame(win, bg="#1C1C1C")
    qual_frame.pack(fill="x", padx=20, pady=(6, 0))
    for q, nome, desc in [
        (88, "🌟 Alta", "Mais qualidade, menor compressão"),
        (75, "✅ Equilibrada", "Boa qualidade com ganho de tamanho"),
        (60, "📦 Compacta", "Arquivo menor, com mais perda"),
    ]:
        f = Frame(qual_frame, bg="#1C1C1C")
        f.pack(fill="x", pady=2)
        tk.Radiobutton(f, text=nome, variable=qual_var, value=q,
                       font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC",
                       selectcolor="#2A2A2A", activebackground="#1C1C1C",
                       activeforeground="#F97316").pack(side="left")
        Label(f, text=f"  {desc}", font=("Segoe UI", 8), bg="#1C1C1C", fg="#666666").pack(side="left")

    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    Label(win, text="Após comprimir:", font=("Segoe UI", 9, "bold"),
          bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", padx=20)

    orig_var = tk.IntVar(value=1)
    orig_frame = Frame(win, bg="#1C1C1C")
    orig_frame.pack(fill="x", padx=20, pady=(6, 0))
    tk.Radiobutton(orig_frame, text="📋 Manter original (pasta separada)", variable=orig_var, value=1,
                   font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC",
                   selectcolor="#2A2A2A", activebackground="#1C1C1C",
                   activeforeground="#F97316").pack(anchor="w")
    tk.Radiobutton(orig_frame, text="🔄 Substituir original", variable=orig_var, value=0,
                   font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC",
                   selectcolor="#2A2A2A", activebackground="#1C1C1C",
                   activeforeground="#F97316").pack(anchor="w", pady=(2, 0))

    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)

    botao_comprimir = Button(win, text="🗜️  Comprimir Imagem(ns)",
                             bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                             font=("Segoe UI", 10, "bold"), bd=0, cursor="hand2",
                             relief="flat", pady=9, state="disabled")
    botao_comprimir.pack(fill="x", padx=20)

    progress = Progressbar(win, mode="determinate", style="Laranja.Horizontal.TProgressbar")
    progress.pack(fill="x", padx=20, pady=(10, 2))
    lbl_pct = Label(win, text="0%", font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#F97316")
    lbl_pct.pack()

    stats = Frame(win, bg="#242424")
    stats.pack(fill="x", padx=20, pady=(8, 6))
    lbl_orig = _mini_stat(stats, "Original", "—")
    lbl_comp = _mini_stat(stats, "Comprimido", "—")
    lbl_econ = _mini_stat(stats, "Economia", "—")

    lbl_log = Label(win, text="", font=("Consolas", 8), bg="#1C1C1C", fg="#888888",
                    anchor="w", justify="left", wraplength=760)
    lbl_log.pack(fill="x", padx=20, pady=(0, 10))

    stop_event = threading.Event()
    win._arquivos = []
    win._pasta_base = None

    def _log(msg):
        win.after(0, lambda: lbl_log.config(text=msg))

    def _prog(pct, txt):
        def _up():
            progress["value"] = pct
            lbl_pct.config(text=f"{pct}%", fg="#F97316" if pct < 100 else "#4CAF50")
            lbl_log.config(text=txt)
        win.after(0, _up)

    def _on_arq(i, total, nome):
        win.after(0, lambda: lbl_log.config(text=f"Comprimindo {i}/{total}: {nome}"))

    def selecionar_pasta():
        pasta = filedialog.askdirectory(parent=win)
        if not pasta:
            return
        arqs = listar_arquivos_img(pasta)
        if not arqs:
            lbl_sel.config(text="⚠️ Nenhum arquivo suportado encontrado na pasta.", fg="#f59e0b")
            return
        win._arquivos = arqs
        win._pasta_base = pasta
        lbl_sel.config(text=f"📂 {len(arqs)} arquivo(s) encontrados em: {pasta}", fg="#AAAAAA")
        botao_comprimir.config(state="normal")

    def selecionar_arquivos():
        arqs = filedialog.askopenfilenames(
            parent=win,
            title="Selecionar imagens/GIF/PDF",
            filetypes=[("Arquivos", "*.jpg *.jpeg *.png *.webp *.bmp *.tif *.tiff *.gif *.heic *.heif *.pdf")],
        )
        if not arqs:
            return
        win._arquivos = list(arqs)
        win._pasta_base = os.path.dirname(win._arquivos[0])
        lbl_sel.config(text=f"🖼️ {len(arqs)} arquivo(s) selecionado(s)", fg="#AAAAAA")
        botao_comprimir.config(state="normal")

    def rodar():
        botao_comprimir.config(state="disabled", text="Comprimindo...")
        progress["value"] = 0
        lbl_pct.config(text="0%", fg="#F97316")

        try:
            manter = bool(orig_var.get())
            qualidade = int(qual_var.get())
            if manter:
                pasta_saida = os.path.join(win._pasta_base, "comprimidos_img")
            else:
                pasta_saida = os.path.join(win._pasta_base, "_tmp_comp_img")

            resultado = comprimir_lista_img(
                win._arquivos,
                pasta_saida,
                qualidade=qualidade,
                manter_original=manter,
                callback_progresso=_prog,
                callback_log=_log,
                callback_arquivo=_on_arq,
                stop_event=stop_event,
            )

            orig = resultado["total_orig_mb"]
            comp = resultado["total_final_mb"]
            econ = resultado["reducao_pct"]
            lbl_orig[1].config(text=_fmt_tamanho(orig))
            lbl_comp[1].config(text=_fmt_tamanho(comp))
            lbl_econ[1].config(text=f"-{econ:.0f}%", fg="#4CAF50" if econ > 0 else "#888888")

            if resultado["ok"] > 0:
                progress.config(style="Verde.Horizontal.TProgressbar")
                progress["value"] = 100
                lbl_pct.config(text="100%", fg="#4CAF50")
                lbl_log.config(text=f"✅ {resultado['ok']} arquivo(s) comprimido(s).")
                tocar("concluido.wav")
                abrir_pasta(os.path.join(win._pasta_base, "comprimidos_img") if manter else win._pasta_base)
            else:
                lbl_log.config(text="⚠️ Nenhum arquivo foi comprimido.", fg="#f59e0b")
        except Exception as e:
            lbl_log.config(text=f"❌ Erro: {e}", fg="#f44336")
        finally:
            botao_comprimir.config(state="normal", text="🗜️  Comprimir Imagem(ns)")

    botao_pasta.config(command=selecionar_pasta)
    botao_arquivos.config(command=selecionar_arquivos)
    botao_comprimir.config(command=lambda: threading.Thread(target=rodar, daemon=True).start())


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

    configurar_janela_responsiva(win, largura=780, altura=680, min_w=650, min_h=540)
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

    configurar_janela_responsiva(win, largura=800, altura=700, min_w=660, min_h=560)
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

    configurar_janela_responsiva(win, largura=780, altura=680, min_w=650, min_h=540)
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

    configurar_janela_responsiva(win, largura=780, altura=700, min_w=650, min_h=560)
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

    configurar_janela_responsiva(win, largura=900, altura=840, min_w=720, min_h=620)
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

    # Separador + botão Desagrupar
    Frame(win, bg="#2A2A2A", height=1).pack(fill="x", padx=28, pady=(8, 4))
    Label(win, text="Ferramentas extras:",
          font=("Segoe UI", 8), bg="#1C1C1C", fg="#888888").pack()

    frame_extra = Frame(win, bg="#1C1C1C")
    frame_extra.pack(pady=(4, 6))

    botao_desagrupar = Button(frame_extra, text="📂  Desagrupar Pasta",
                              bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                              font=("Segoe UI", 9, "bold"), width=21,
                              bd=0, cursor="hand2", relief="flat", pady=6)
    botao_desagrupar.pack(side="left", padx=6)

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

    def rodar_desagrupar_thread():
        """Seleciona pasta organizada e extrai todos os arquivos para uma pasta plana."""
        pasta_src = filedialog.askdirectory(
            parent=win,
            title="Selecionar pasta para desagrupar"
        )
        if not pasta_src:
            return

        # Pede o nome da pasta de saída
        import tkinter.simpledialog as _sd
        nome_saida = _sd.askstring(
            "Nome da pasta de saída",
            "Digite o nome da pasta onde os arquivos serão colocados:",
            initialvalue="BRUTOS_DESAGRUPADOS",
            parent=win
        )
        if not nome_saida:
            return
        nome_saida = nome_saida.strip() or "BRUTOS_DESAGRUPADOS"

        botao_desagrupar.config(state="disabled", text="Desagrupando…")
        log_box.delete("1.0", END)
        progress["value"] = 0
        status_label.config(text="Desagrupando arquivos...")

        def _rodar():
            try:
                import re as _re
                import shutil as _sh

                # Pasta de saída ao lado da pasta selecionada
                pasta_pai = os.path.dirname(os.path.abspath(pasta_src))
                pasta_dest = os.path.join(pasta_pai, nome_saida)
                os.makedirs(pasta_dest, exist_ok=True)

                log(f"📂 Origem:  {pasta_src}")
                log(f"📂 Destino: {pasta_dest}")

                # Coleta todos os arquivos recursivamente
                arquivos = []
                for root, dirs, files in os.walk(pasta_src):
                    for f in files:
                        if not f.startswith('.'):
                            arquivos.append(os.path.join(root, f))

                total = len(arquivos)
                log(f"📥 {total} arquivo(s) encontrado(s)")

                movidos = 0
                erros   = 0
                for i, src_path in enumerate(arquivos):
                    nome = os.path.basename(src_path)
                    dest = os.path.join(pasta_dest, nome)
                    # Evita colisão de nomes
                    base, ext = os.path.splitext(nome)
                    n = 1
                    while os.path.exists(dest):
                        dest = os.path.join(pasta_dest, f"{base}_{n}{ext}")
                        n += 1
                    try:
                        _sh.move(src_path, dest)
                        movidos += 1
                    except Exception as e:
                        log(f"   ⚠️  {nome}: {e}")
                        erros += 1

                    if total > 0:
                        win.after(0, lambda v=int((i+1)/total*100):
                                  progress.__setitem__("value", v))
                        win.after(0, lambda t=f"Copiando... {i+1}/{total}":
                                  status_label.config(text=t))

                log(f"\n✅ {movidos} arquivo(s) copiados")
                if erros:
                    log(f"⚠️  {erros} erro(s)")
                win.after(0, lambda: status_label.config(
                    text=f"✅ Desagrupamento concluído! {movidos} arquivos"))
                win.after(0, lambda: tocar("concluido.wav"))
                win.after(500, lambda: abrir_pasta(pasta_dest))

            except Exception as e:
                log(f"❌ ERRO: {e}")
                win.after(0, lambda: status_label.config(text="❌ Erro ao desagrupar"))
            finally:
                win.after(0, lambda: botao_desagrupar.config(
                    state="normal", text="📂  Desagrupar Pasta"))

        threading.Thread(target=_rodar, daemon=True).start()

    botao_desagrupar.config(command=rodar_desagrupar_thread)

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

    fullhd_var = tk.IntVar(value=0)

    def _atualizar_info_selecao():
        arquivos = win._arquivos
        if not arquivos:
            return
        lbl_qtd[1].config(text=str(len(arquivos)))
        total_mb = sum(os.path.getsize(f) / 1024 / 1024 for f in arquivos if os.path.exists(f))
        lbl_total[1].config(text=_fmt_tamanho(total_mb))
        # Pega info do primeiro arquivo
        info = get_info_video(arquivos[0], timeout_sec=12)
        if info:
            lbl_codec[1].config(text=info.get("codec_video", "—").upper())
            w, h = info.get("largura", 0), info.get("altura", 0)
            lbl_res[1].config(text=f"{w}x{h}" if w else "—")
            if w <= 0 or h <= 0:
                fullhd_var.set(0)
                chk_fullhd.config(state="disabled")
                lbl_fullhd_hint.config(
                    text="Não foi possível ler resolução para liberar Full HD.",
                    fg="#f59e0b"
                )
            elif w > 1920 or h > 1080:
                chk_fullhd.config(state="normal")
                lbl_fullhd_hint.config(
                    text="Ativo para esta seleção: resolução acima de Full HD detectada.",
                    fg="#4CAF50"
                )
            else:
                fullhd_var.set(0)
                chk_fullhd.config(state="disabled")
                lbl_fullhd_hint.config(
                    text="Disponível apenas para arquivos acima de 1920x1080.",
                    fg="#666666"
                )
        else:
            fullhd_var.set(0)
            chk_fullhd.config(state="disabled")
            lbl_fullhd_hint.config(
                text="Não foi possível ler resolução para liberar Full HD.",
                fg="#f59e0b"
            )

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

    # ── Modo de codificação (CPU/GPU) ─────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    Label(win, text="Modo de codificação:",
          font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", padx=20)

    enc = detectar_encoders_disponiveis()
    gpus = []
    if enc.get("hevc_nvenc"):
        gpus.append("NVIDIA")
    if enc.get("hevc_qsv"):
        gpus.append("Intel")
    if enc.get("hevc_amf"):
        gpus.append("AMD")
    gpu_disponivel = len(gpus) > 0

    modo_var = tk.IntVar(value=1 if gpu_disponivel else 0)  # 0=CPU, 1=GPU auto
    modo_frame = Frame(win, bg="#1C1C1C")
    modo_frame.pack(fill="x", padx=20, pady=(6, 0))

    tk.Radiobutton(modo_frame, text="🧠 CPU (melhor compressão)", variable=modo_var, value=0,
                   font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC",
                   selectcolor="#2A2A2A", activebackground="#1C1C1C",
                   activeforeground="#F97316").pack(anchor="w")

    rb_gpu = tk.Radiobutton(modo_frame, text="⚡ GPU (mais rápido)", variable=modo_var, value=1,
                            font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC",
                            selectcolor="#2A2A2A", activebackground="#1C1C1C",
                            activeforeground="#F97316")
    rb_gpu.pack(anchor="w", pady=(2, 0))

    if gpu_disponivel:
        Label(modo_frame, text=f"  Detectado: {', '.join(gpus)}",
              font=("Segoe UI", 8), bg="#1C1C1C", fg="#666666").pack(anchor="w", pady=(0, 4))
    else:
        rb_gpu.config(state="disabled")
        Label(modo_frame, text="  GPU HEVC não detectada no ffmpeg. Usando CPU.",
              font=("Segoe UI", 8), bg="#1C1C1C", fg="#f59e0b").pack(anchor="w", pady=(0, 4))

    # ── Resolução de saída ────────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)
    Label(win, text="Resolução de saída:",
          font=("Segoe UI", 9, "bold"), bg="#1C1C1C", fg="#CCCCCC").pack(anchor="w", padx=20)

    res_frame = Frame(win, bg="#1C1C1C")
    res_frame.pack(fill="x", padx=20, pady=(6, 0))

    chk_fullhd = tk.Checkbutton(
        res_frame,
        text="📺 Forçar Full HD (máx. 1920x1080)",
        variable=fullhd_var,
        font=("Segoe UI", 9, "bold"),
        bg="#1C1C1C",
        fg="#CCCCCC",
        selectcolor="#2A2A2A",
        activebackground="#1C1C1C",
        activeforeground="#F97316",
        disabledforeground="#666666",
        state="disabled",
    )
    chk_fullhd.pack(anchor="w")

    lbl_fullhd_hint = Label(
        res_frame,
        text="Disponível apenas para arquivos acima de 1920x1080.",
        font=("Segoe UI", 8),
        bg="#1C1C1C",
        fg="#666666",
    )
    lbl_fullhd_hint.pack(anchor="w", pady=(0, 4))

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

    # ── Botões ────────────────────────────────────────────────
    Frame(win, bg="#333333", height=1).pack(fill="x", padx=20, pady=12)

    # Linha de botões principais
    frame_btns_top = Frame(win, bg="#1C1C1C")
    frame_btns_top.pack(fill="x", padx=20, pady=(0, 4))

    botao_comprimir = Button(frame_btns_top, text="🗜️  Comprimir Vídeo(s)",
                             bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                             font=("Segoe UI", 11, "bold"),
                             bd=0, relief="flat", cursor="hand2", pady=11,
                             state="disabled")
    botao_comprimir.pack(side="left", fill="x", expand=True, padx=(0, 6))

    botao_sugestao = Button(frame_btns_top, text="💡 Sugestão Inteligente",
                            bg="#2A2A2A", fg="#F97316", activebackground="#3a3a3a",
                            font=("Segoe UI", 11, "bold"),
                            bd=0, relief="flat", cursor="hand2", pady=11)
    botao_sugestao.pack(side="left", fill="x", expand=True)

    botao_cancelar = Button(win, text="✕  Cancelar",
                            bg="#2A2A2A", fg="#f44336", activebackground="#3a3a3a",
                            font=("Segoe UI", 10, "bold"),
                            bd=0, relief="flat", cursor="hand2", pady=8,
                            state="disabled")
    botao_cancelar.pack(fill="x", padx=20, pady=(0, 0))

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
                lbl_pct.config(text="...", fg="#F97316")
            else:
                if progress["mode"] == "indeterminate":
                    progress.stop()
                    progress.config(mode="determinate")
                pct_val = float(pct)
                progress["value"] = pct_val
                pct_txt = f"{pct_val:.1f}%" if abs(pct_val - int(pct_val)) > 0.001 else f"{int(pct_val)}%"
                lbl_pct.config(text=pct_txt,
                               fg="#F97316" if pct_val < 100 else "#4CAF50")
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

        try:
            arquivos    = win._arquivos
            manter_orig = bool(orig_var.get())
            crf         = qual_var.get()
            usar_gpu    = bool(modo_var.get())
            forcar_fhd  = bool(fullhd_var.get())

            # Pasta de saída
            if manter_orig:
                pasta_saida = os.path.join(win._pasta_base, "comprimidos_h265")
            else:
                pasta_saida = win._pasta_base  # só temporário, será substituído

            resultado = comprimir_lista(
                arquivos,
                pasta_saida,
                qualidade_crf=crf,
                usar_gpu=usar_gpu,
                forcar_fullhd=forcar_fhd,
                manter_original=manter_orig,
                callback_progresso=_prog,
                callback_log=_log,
                callback_arquivo=_on_arquivo,
                stop_event=stop_event,
            )

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
        except Exception as e:
            win.after(0, lambda: progress.stop())
            win.after(0, lambda: progress.config(mode="determinate"))
            win.after(0, lambda: lbl_arq_titulo.config(
                text="❌ Erro ao iniciar compressão.", fg="#f44336"))
            win.after(0, lambda: lbl_log.config(
                text=f"Erro interno: {e}", fg="#f44336"))
        finally:
            win.after(0, lambda: progress.stop())
            win.after(0, lambda: botao_comprimir.config(state="normal", text="🗜️  Comprimir Vídeo(s)"))
            win.after(0, lambda: botao_cancelar.config(state="disabled"))

    def cancelar():
        stop_event.set()
        win.after(0, lambda: botao_cancelar.config(state="disabled"))
        win.after(0, lambda: lbl_log.config(
            text="⛔ Cancelando… aguarde o arquivo atual terminar.", fg="#888888"))

    botao_comprimir.config(
        command=lambda: threading.Thread(target=rodar, daemon=True).start())
    botao_cancelar.config(command=cancelar)

    # ── Sugestão Inteligente ──────────────────────────────────
    LIMITE_GB = 19.0  # arquivos acima de 19 GB

    def sugestao_inteligente():
        """Varre uma pasta buscando vídeos grandes e sugere compressão."""
        pasta_scan = filedialog.askdirectory(
            parent=win,
            title="Selecionar pasta para varrer arquivos grandes"
        )
        if not pasta_scan:
            return

        # Janela de sugestão
        popup = Toplevel(win)
        popup.title("💡 Sugestão Inteligente — Arquivos Grandes")
        popup.configure(bg="#1C1C1C")
        popup.resizable(True, True)
        try:
            popup.iconbitmap(resource_path("icone.ico"))
        except Exception:
            pass

        larg, alt = 680, 560
        x = win.winfo_rootx() + (win.winfo_width() // 2) - (larg // 2)
        y = win.winfo_rooty() + (win.winfo_height() // 2) - (alt // 2)
        popup.geometry(f"{larg}x{alt}+{x}+{y}")
        popup.minsize(500, 400)
        popup.grab_set()

        # Header
        Frame(popup, bg="#F97316", height=3).pack(fill="x")
        hdr = Frame(popup, bg="#1C1C1C")
        hdr.pack(fill="x", padx=20, pady=(14, 0))
        Label(hdr, text="💡", font=("Segoe UI", 20), bg="#1C1C1C").pack(side="left")
        Label(hdr, text="  Sugestão Inteligente",
              font=("Segoe UI", 13, "bold"), bg="#1C1C1C", fg="#F97316").pack(side="left")

        lbl_scan = Label(popup, text="🔍 Varrendo pasta...",
                         font=("Segoe UI", 9), bg="#1C1C1C", fg="#888888")
        lbl_scan.pack(anchor="w", padx=20, pady=(8, 2))

        # Lista de arquivos encontrados
        frame_lista = Frame(popup, bg="#242424")
        frame_lista.pack(fill="both", expand=True, padx=20, pady=(4, 0))

        # Cabeçalho da lista
        hdr_row = Frame(frame_lista, bg="#2A2A2A")
        hdr_row.pack(fill="x")
        Label(hdr_row, text="  ✓", font=("Segoe UI", 9, "bold"),
              bg="#2A2A2A", fg="#888888", width=3).pack(side="left")
        Label(hdr_row, text="Arquivo", font=("Segoe UI", 9, "bold"),
              bg="#2A2A2A", fg="#888888", anchor="w").pack(side="left", fill="x", expand=True)
        Label(hdr_row, text="Tamanho", font=("Segoe UI", 9, "bold"),
              bg="#2A2A2A", fg="#888888", width=10).pack(side="left")
        Label(hdr_row, text="Duração", font=("Segoe UI", 9, "bold"),
              bg="#2A2A2A", fg="#888888", width=10).pack(side="left", padx=(0, 4))

        # Scroll
        import tkinter as _tk2
        scroll_frame = Frame(frame_lista, bg="#242424")
        scroll_frame.pack(fill="both", expand=True)
        canvas = _tk2.Canvas(scroll_frame, bg="#242424", bd=0, highlightthickness=0)
        scrollbar = _tk2.Scrollbar(scroll_frame, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)
        inner = Frame(canvas, bg="#242424")
        canvas_win = canvas.create_window((0, 0), window=inner, anchor="nw")

        def _on_inner_resize(e):
            canvas.configure(scrollregion=canvas.bbox("all"))
            canvas.itemconfig(canvas_win, width=canvas.winfo_width())
        inner.bind("<Configure>", _on_inner_resize)
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(
            canvas_win, width=e.width))

        # Resumo e botões
        Frame(popup, bg="#333333", height=1).pack(fill="x", padx=20, pady=8)
        lbl_resumo = Label(popup, text="",
                           font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC")
        lbl_resumo.pack(anchor="w", padx=20)

        frame_popup_btns = Frame(popup, bg="#1C1C1C")
        frame_popup_btns.pack(fill="x", padx=20, pady=10)

        btn_s_p = dict(font=("Segoe UI", 10, "bold"), bd=0, relief="flat",
                       cursor="hand2", padx=14, pady=8)

        btn_comprimir_sel = Button(frame_popup_btns,
                                   text="🗜️  Comprimir Selecionados",
                                   bg="#F97316", fg="#0F0F0F",
                                   activebackground="#e06510",
                                   state="disabled", **btn_s_p)
        btn_comprimir_sel.pack(side="left", padx=(0, 8))

        btn_sel_todos = Button(frame_popup_btns, text="☑  Selecionar Todos",
                               bg="#2A2A2A", fg="#F97316",
                               activebackground="#3a3a3a", **btn_s_p)
        btn_sel_todos.pack(side="left", padx=(0, 8))

        btn_fechar = Button(frame_popup_btns, text="Fechar",
                            bg="#2A2A2A", fg="#888888",
                            activebackground="#3a3a3a",
                            command=popup.destroy, **btn_s_p)
        btn_fechar.pack(side="right")

        # Estado dos checkboxes
        checks    = []   # lista de (var, arquivo_info)
        arquivos_encontrados = []

        def _atualizar_resumo():
            selecionados = [a for v, a in checks if v.get()]
            total_gb = sum(a["tam"] for a in selecionados) / 1024**3
            if selecionados:
                lbl_resumo.config(
                    text=f"✅ {len(selecionados)} arquivo(s) selecionado(s) — "
                         f"{total_gb:.1f} GB para comprimir",
                    fg="#F97316")
                btn_comprimir_sel.config(state="normal")
            else:
                lbl_resumo.config(text="Nenhum arquivo selecionado.", fg="#888888")
                btn_comprimir_sel.config(state="disabled")

        def _sel_todos():
            for v, _ in checks:
                v.set(True)
            _atualizar_resumo()

        btn_sel_todos.config(command=_sel_todos)

        def _comprimir_selecionados():
            selecionados = [a["path"] for v, a in checks if v.get()]
            if not selecionados:
                return

            # Pergunta: cópia ou substituir
            popup_op = Toplevel(popup)
            popup_op.title("O que fazer com o original?")
            popup_op.configure(bg="#1C1C1C")
            popup_op.resizable(False, False)
            popup_op.grab_set()
            pw, ph = 400, 200
            px = popup.winfo_rootx() + popup.winfo_width()//2 - pw//2
            py = popup.winfo_rooty() + popup.winfo_height()//2 - ph//2
            popup_op.geometry(f"{pw}x{ph}+{px}+{py}")

            Label(popup_op, text="O que fazer com o arquivo original\napós a compressão?",
                  font=("Segoe UI", 10), bg="#1C1C1C", fg="#CCCCCC",
                  justify="center").pack(pady=(20, 14))

            op_var = tk.IntVar(value=1)
            frame_op = Frame(popup_op, bg="#1C1C1C")
            frame_op.pack()
            tk.Radiobutton(frame_op, text="📋  Manter original (criar cópia comprimida)",
                           variable=op_var, value=1,
                           font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC",
                           selectcolor="#2A2A2A", activebackground="#1C1C1C"
                           ).pack(anchor="w", pady=2)
            tk.Radiobutton(frame_op, text="🔄  Substituir original (apagar após comprimir)",
                           variable=op_var, value=0,
                           font=("Segoe UI", 9), bg="#1C1C1C", fg="#CCCCCC",
                           selectcolor="#2A2A2A", activebackground="#1C1C1C"
                           ).pack(anchor="w", pady=2)

            def _confirmar():
                manter = bool(op_var.get())
                popup_op.destroy()
                popup.destroy()

                # Injeta arquivos no compressor e dispara
                win._arquivos   = selecionados
                win._pasta_base = os.path.dirname(selecionados[0])
                lbl_sel.config(
                    text=f"💡 {len(selecionados)} arquivo(s) da Sugestão Inteligente",
                    fg="#F97316")
                _atualizar_info_selecao()
                botao_comprimir.config(state="normal")
                orig_var.set(1 if manter else 0)

                # Dispara compressão automaticamente
                threading.Thread(
                    target=rodar, daemon=True).start()

            Button(popup_op, text="Confirmar →",
                   bg="#F97316", fg="#0F0F0F", activebackground="#e06510",
                   font=("Segoe UI", 10, "bold"), bd=0, relief="flat",
                   cursor="hand2", padx=16, pady=8,
                   command=_confirmar).pack(pady=12)

        btn_comprimir_sel.config(command=_comprimir_selecionados)

        # Varre a pasta em thread
        def _varrer():
            encontrados = []
            try:
                todos = []
                for root, dirs, files in os.walk(pasta_scan):
                    dirs[:] = [d for d in dirs if not d.startswith('.')]
                    for f in files:
                        ext = os.path.splitext(f)[1].lower()
                        if ext in {".mp4",".mov",".avi",".mkv",".mxf",
                                   ".mts",".m2ts",".r3d",".braw",".wmv"}:
                            todos.append(os.path.join(root, f))

                total = len(todos)
                popup.after(0, lambda: lbl_scan.config(
                    text=f"🔍 Varrendo {total} vídeo(s)..."))

                from compressor_video import get_info_video, _fmt_tamanho
                for i, path in enumerate(todos):
                    tam = os.path.getsize(path)
                    if tam >= LIMITE_GB * 1024**3:
                        info = get_info_video(path) or {}
                        dur  = info.get("duracao", 0)
                        h    = int(dur // 3600)
                        m    = int((dur % 3600) // 60)
                        s    = int(dur % 60)
                        dur_str = f"{h:02d}:{m:02d}:{s:02d}" if dur > 0 else "—"
                        encontrados.append({
                            "path":    path,
                            "nome":    os.path.basename(path),
                            "tam":     tam,
                            "tam_str": _fmt_tamanho(tam / 1024 / 1024),
                            "dur_str": dur_str,
                        })

                    popup.after(0, lambda v=int((i+1)/max(total,1)*100),
                                t=f"🔍 Varrendo... {i+1}/{total}":
                                lbl_scan.config(text=t))

            except Exception as e:
                popup.after(0, lambda: lbl_scan.config(
                    text=f"❌ Erro: {e}", fg="#f44336"))
                return

            # Popula a lista na UI
            def _popular():
                if not encontrados:
                    lbl_scan.config(
                        text=f"✅ Nenhum vídeo acima de {LIMITE_GB:.0f} GB encontrado.",
                        fg="#4CAF50")
                    lbl_resumo.config(
                        text="Seus vídeos estão dentro do limite de tamanho! 🎉",
                        fg="#4CAF50")
                    return

                lbl_scan.config(
                    text=f"✅ {len(encontrados)} vídeo(s) acima de "
                         f"{LIMITE_GB:.0f} GB encontrado(s):",
                    fg="#F97316")

                import tkinter as _tk3
                for arq in encontrados:
                    var = _tk3.BooleanVar(value=True)
                    checks.append((var, arq))

                    row = Frame(inner, bg="#242424")
                    row.pack(fill="x", pady=1)

                    cb = _tk3.Checkbutton(row, variable=var,
                                          bg="#242424", selectcolor="#2A2A2A",
                                          activebackground="#242424",
                                          command=_atualizar_resumo)
                    cb.pack(side="left", padx=4)

                    Label(row, text=arq["nome"],
                          font=("Segoe UI", 9), bg="#242424", fg="#CCCCCC",
                          anchor="w").pack(side="left", fill="x", expand=True)
                    Label(row, text=arq["tam_str"],
                          font=("Segoe UI", 9, "bold"), bg="#242424",
                          fg="#f59e0b", width=10).pack(side="left")
                    Label(row, text=arq["dur_str"],
                          font=("Segoe UI", 9), bg="#242424",
                          fg="#888888", width=10).pack(side="left", padx=(0, 4))

                _atualizar_resumo()

            popup.after(0, _popular)

        threading.Thread(target=_varrer, daemon=True).start()

    botao_sugestao.config(command=sugestao_inteligente)

    def _ajustar_layout_responsivo():
        """Ajusta tamanho inicial da janela para caber no conteúdo e na tela."""
        try:
            win.update_idletasks()
            screen_w = win.winfo_screenwidth()
            screen_h = win.winfo_screenheight()

            req_w = max(640, win.winfo_reqwidth() + 16)
            req_h = max(720, win.winfo_reqheight() + 16)

            max_w = max(640, screen_w - 60)
            max_h = max(640, screen_h - 80)

            final_w = min(req_w, max_w)
            final_h = min(req_h, max_h)

            x = max((screen_w - final_w) // 2, 0)
            y = max((screen_h - final_h) // 2, 0)
            win.geometry(f"{int(final_w)}x{int(final_h)}+{int(x)}+{int(y)}")

            min_w = min(640, int(final_w))
            min_h = min(640, int(final_h))
            win.minsize(min_w, min_h)
        except Exception:
            pass

    win.after(120, _ajustar_layout_responsivo)


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
    ativar_som_click_global(win)
    try:
        win.iconbitmap(resource_path("icone.ico"))
    except Exception:
        pass

    configurar_janela_responsiva(win, largura=760, altura=640, min_w=640, min_h=520)
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
