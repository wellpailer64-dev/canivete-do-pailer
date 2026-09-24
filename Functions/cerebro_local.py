import os
import re
import csv
import json
import shutil
import traceback
import time

_MODEL_ID = "google/flan-t5-base"


def get_base_dir():
    import sys
    if hasattr(sys, "_MEIPASS"):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_cerebro_dir():
    p = os.path.join(get_base_dir(), "modelos_ia", "cerebro")
    os.makedirs(p, exist_ok=True)
    return p


def get_cerebros_md_dir():
    p = os.path.join(get_base_dir(), "cerebros_md")
    os.makedirs(p, exist_ok=True)
    return p


def get_active_cerebro_path():
    """Retorna o caminho do cérebro ativo salvo."""
    active_file = os.path.join(get_cerebros_md_dir(), ".active")
    if os.path.exists(active_file):
        with open(active_file, "r", encoding="utf-8") as f:
            caminho = f.read().strip()
            if caminho and os.path.exists(caminho):
                return caminho
    return None


def set_active_cerebro(cerebro_path):
    """Define qual cérebro está ativo."""
    active_file = os.path.join(get_cerebros_md_dir(), ".active")
    with open(active_file, "w", encoding="utf-8") as f:
        f.write(cerebro_path)


def get_cerebro_md_path():
    """Retorna o cérebro ativo ou o mais recente."""
    ativo = get_active_cerebro_path()
    if ativo:
        return ativo
    
    dir_md = get_cerebros_md_dir()
    arquivos = []
    if os.path.exists(dir_md):
        for f in os.listdir(dir_md):
            if f.endswith(".md"):
                caminho = os.path.join(dir_md, f)
                arquivos.append((caminho, os.path.getmtime(caminho)))
    
    if arquivos:
        mais_recente = max(arquivos, key=lambda x: x[1])[0]
        return mais_recente
    
    return None


def cerebro_existe():
    p = get_cerebro_md_path()
    return p is not None and os.path.exists(p)


def carregar_cerebro_md():
    p = get_cerebro_md_path()
    if not p or not os.path.exists(p):
        return ""
    with open(p, "r", encoding="utf-8") as f:
        return f.read().strip()


def salvar_cerebro_md(origem_path: str):
    origem = (origem_path or "").strip()
    if not origem or not os.path.exists(origem):
        raise ValueError("Arquivo .md inválido")
    if not origem.lower().endswith(".md"):
        raise ValueError("Selecione um arquivo .md")
    
    nome_original = os.path.basename(origem_path)
    destino = os.path.join(get_cerebros_md_dir(), nome_original)
    
    shutil.copyfile(origem, destino)
    set_active_cerebro(destino)
    return destino


def remover_cerebro_md():
    p = get_cerebro_md_path()
    if p and os.path.exists(p):
        os.remove(p)
        active_file = os.path.join(get_cerebros_md_dir(), ".active")
        if os.path.exists(active_file):
            os.remove(active_file)
        return True
    return False


def get_model_dir():
    p = os.path.join(get_cerebro_dir(), "flan_t5_base")
    os.makedirs(p, exist_ok=True)
    return p


def _get_model_dir_legacy():
    return os.path.join(get_cerebro_dir(), "flan_t5_small")


def checar_modelo_cerebro():
    p = get_model_dir()
    if os.path.exists(os.path.join(p, "config.json")) and os.path.exists(os.path.join(p, "tokenizer_config.json")):
        return True
    return _achar_snapshot_modelo(p) is not None


def _achar_snapshot_modelo(base_dir):
    """Procura snapshot válido no cache do HuggingFace dentro de base_dir."""
    try:
        for root, _dirs, files in os.walk(base_dir):
            if "config.json" in files and "tokenizer_config.json" in files:
                return root
    except Exception:
        return None
    return None


def instalar_modelo_cerebro(callback_log=None, callback_progresso=None):
    try:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    except Exception as e:
        if callback_log:
            callback_log(f"Erro ao importar transformers: {e}")
        return False

    model_dir = get_model_dir()
    if callback_log:
        callback_log("Baixando modelo local (FLAN-T5 Base ~1GB)...")
    if callback_progresso:
        callback_progresso(-1, "Baixando modelo de IA local...")

    # remove versão antiga leve para evitar conflitos
    legacy = _get_model_dir_legacy()
    try:
        if os.path.isdir(legacy):
            shutil.rmtree(legacy, ignore_errors=True)
    except Exception:
        pass

    def _download_transformers():
        tok = AutoTokenizer.from_pretrained(_MODEL_ID, cache_dir=model_dir)
        mdl = AutoModelForSeq2SeqLM.from_pretrained(_MODEL_ID, cache_dir=model_dir)
        tok.save_pretrained(model_dir)
        mdl.save_pretrained(model_dir)

    # 1) Tentativa padrão (transformers)
    try:
        if callback_log:
            callback_log("Tentativa 1/2: download padrão via transformers...")
        _download_transformers()
        if callback_log:
            callback_log("Modelo Cérebro pronto!")
        if callback_progresso:
            callback_progresso(100, "Modelo Cérebro pronto")
        return True
    except Exception as e1:
        if callback_log:
            callback_log(f"Falha tentativa 1: {e1}")

    # 2) Fallback robusto via huggingface_hub snapshot_download
    try:
        if callback_log:
            callback_log("Tentativa 2/2: fallback via huggingface_hub (snapshot_download)...")

        from huggingface_hub import snapshot_download
        snap_dir = snapshot_download(
            repo_id=_MODEL_ID,
            local_dir=model_dir,
            local_dir_use_symlinks=False,
            resume_download=True,
            max_workers=4,
        )

        for nome in ["config.json", "tokenizer_config.json"]:
            origem = os.path.join(snap_dir, nome)
            destino = os.path.join(model_dir, nome)
            if os.path.exists(origem) and not os.path.exists(destino):
                shutil.copy2(origem, destino)

        _download_transformers()

        if callback_log:
            callback_log("Modelo Cérebro pronto! (fallback)")
        if callback_progresso:
            callback_progresso(100, "Modelo Cérebro pronto")
        return True
    except Exception as e2:
        if callback_log:
            callback_log(f"Falha tentativa 2: {e2}")
            callback_log("Diagnóstico resumido:")
            callback_log("- Verifique conexão com huggingface.co")
            callback_log("- Verifique firewall/proxy/antivírus")
            callback_log("- Apague modelos_ia/cerebro/flan_t5_base e tente novamente")
            callback_log(traceback.format_exc()[-1200:])
        return False


_TOK = None
_MODEL = None


def _get_model_objs():
    global _TOK, _MODEL
    if _TOK is not None and _MODEL is not None:
        return _TOK, _MODEL

    try:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
        import torch
    except ImportError:
        raise RuntimeError("Biblioteca 'transformers' ou 'torch' não instalada.")

    model_dir = get_model_dir()
    alvo_modelo = model_dir

    if not os.path.exists(os.path.join(model_dir, "config.json")):
        snap = _achar_snapshot_modelo(model_dir)
        if snap:
            alvo_modelo = snap
        else:
            raise RuntimeError(
                "Modelo Cérebro inválido/incompleto. Reabra o app e rode o setup de modelos para baixar novamente."
            )

    # Carrega o tokenizador
    _TOK = AutoTokenizer.from_pretrained(alvo_modelo, local_files_only=True)
    
    # Carrega o modelo de forma segura
    # device_map=None evita o uso de meta tensors por padrão se não houver aceleração configurada
    _MODEL = AutoModelForSeq2SeqLM.from_pretrained(
        alvo_modelo, 
        local_files_only=True,
        device_map=None,
        low_cpu_mem_usage=False # Desativa meta tensors que causam o erro item()
    )
    
    return _TOK, _MODEL


def _extrair_json(texto):
    if not texto:
        return None
    texto = texto.strip()
    try:
        return json.loads(texto)
    except Exception:
        pass

    m = re.search(r"\{[\s\S]*\}", texto)
    if m:
        bloco = m.group(0)
        try:
            return json.loads(bloco)
        except Exception:
            return None
    return None


def _extrair_cabecalho_md(cerebro_md: str):
    """Tenta achar o cabeçalho CSV definido no .md (separado por ';')."""
    linhas = [l.strip() for l in (cerebro_md or "").splitlines() if l.strip()]
    candidatos = []
    for l in linhas:
        if ";" in l and " " not in l.replace(";", ""):
            candidatos.append(l)
        elif ";" in l and "title;" in l.lower():
            candidatos.append(l)

    # Prioriza linha que contenha campos esperados do seu padrão
    for c in candidatos:
        lc = c.lower()
        if "title;" in lc and "video_url" in lc:
            cols = [x.strip() for x in c.split(";") if x.strip()]
            if len(cols) >= 3:
                return cols

    # Fallback: primeiro candidato válido
    for c in candidatos:
        cols = [x.strip() for x in c.split(";") if x.strip()]
        if len(cols) >= 2:
            return cols

    # Fallback final padrão antigo
    return ["titulo", "url", "resumo"]


def _extrair_lista_permitida(cerebro_md: str, secao: str):
    """Extrai bullets com `valor` dentro de uma seção markdown específica."""
    txt = cerebro_md or ""
    m = re.search(rf"###\s+`?{re.escape(secao)}`?.*?(?=\n###\s+|\Z)", txt, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return []
    bloco = m.group(0)
    vals = re.findall(r"-\s+`([^`]+)`", bloco)
    return [v.strip() for v in vals if v.strip()]


def _to_dict_by_header(header, linha):
    d = {}
    for i, h in enumerate(header):
        d[h] = str(linha[i]).strip() if i < len(linha) else ""
    return d


def _from_dict_by_header(header, data):
    return [str((data or {}).get(h, "")).strip() for h in header]


def _normalizar_por_regras(data_dict, header, titulo, url, cerebro_md):
    data = dict(data_dict or {})

    # Campos obrigatórios mínimos
    if "title" in header and not data.get("title"):
        data["title"] = titulo or ""
    if "url" in header and not data.get("url"):
        data["url"] = url or ""

    # Phase permitido
    if "phase" in header:
        permitidos_phase = _extrair_lista_permitida(cerebro_md, "phase")
        if permitidos_phase:
            val = (data.get("phase") or "").strip()
            if val not in permitidos_phase:
                data["phase"] = ""

    # Bairro permitido
    if "address_neighborhood" in header:
        permitidos_bairro = _extrair_lista_permitida(cerebro_md, "address_neighborhood")
        if permitidos_bairro:
            val = (data.get("address_neighborhood") or "").strip()
            if val not in permitidos_bairro:
                data["address_neighborhood"] = ""

    # category permitido
    if "category" in header:
        permitidos_cat = _extrair_lista_permitida(cerebro_md, "category")
        if permitidos_cat:
            val = (data.get("category") or "").strip()
            if val not in permitidos_cat:
                data["category"] = ""

    return data


def _find_first(pattern, text, flags=0):
    m = re.search(pattern, text or "", flags)
    return m.group(1).strip() if m else ""


def _normalizar_linha(s: str):
    s = re.sub(r"\s+", " ", (s or "").strip())
    s = s.replace("|", " ")
    return s.strip()


def _eh_ruido(linha: str):
    l = (linha or "").strip().lower()
    if not l:
        return True
    # linhas muito curtas e sem números normalmente são menu
    if len(l) <= 2:
        return True
    ruidos = [
        "cookie", "política", "politica", "privacidade", "termos de uso", "aceitar",
        "whatsapp", "contato", "fale conosco", "home", "sobre nós", "sobre nos",
        "menu", "início", "inicio", "diferenciais", "status", "localização", "localizacao",
        "galeria", "lazer", "vídeo", "video", "plantas",
    ]
    if l in ruidos:
        return True
    if l.startswith("http") and "youtube" not in l and "vimeo" not in l:
        return True
    return False


def _score_relevancia(linha: str):
    l = (linha or "").lower()
    score = 0
    chaves = [
        "m²", "m2", "dorm", "suíte", "suite", "vaga", "endereço", "endereco", "rua ", "avenida",
        "bairro", "morumbi", "lançamento", "lancamento", "em obras", "obra", "entrega",
        "residencial", "comercial", "torre", "unidades", "pavimentos", "lazer", "piscina", "academia",
    ]
    for c in chaves:
        if c in l:
            score += 2
    if re.search(r"\b\d{2,4}\s*m[²2]\b", l):
        score += 4
    if re.search(r"\b\d+\s*(dorm|dorms|vagas?)\b", l):
        score += 4
    if re.search(r"\b\d{1,4}\b", l):
        score += 1
    return score


def _preprocessar_texto_para_ia(texto: str):
    bruto = (texto or "")
    linhas = [_normalizar_linha(x) for x in bruto.splitlines()]
    linhas = [x for x in linhas if x]

    seen = set()
    unicas = []
    for l in linhas:
        k = re.sub(r"\W+", "", l.lower())
        if not k or k in seen:
            continue
        seen.add(k)
        unicas.append(l)

    candidatas = [l for l in unicas if not _eh_ruido(l)]

    ranked = sorted(candidatas, key=lambda x: _score_relevancia(x), reverse=True)
    top = ranked[:120]

    top_set = set(top)
    final = [l for l in candidatas if l in top_set]

    txt_limpo = "\n".join(final)
    txt_limpo = txt_limpo[:12000]

    info = {
        "linhas_brutas": len(linhas),
        "linhas_unicas": len(unicas),
        "linhas_finais": len(final),
    }
    return txt_limpo, info


def _detectar_phase(texto):
    t = (texto or "").lower()
    if "em obras" in t or "obras avançadas" in t or "obras avancadas" in t or "em construção" in t or "em construcao" in t:
        return "Obras Avançadas"
    if "100% vendido" in t or "100 por cento vendido" in t:
        return "100% Vendido"
    if "breve lançamento" in t or "breve lancamento" in t or "em breve" in t:
        return "Breve Lançamento"
    if "pronto para morar" in t or "entregue" in t or "habite-se" in t or "habite se" in t:
        return "Pronto Para Morar"
    if "lançamento" in t or "lancamento" in t:
        return "Lançamento"
    return ""


def _detectar_category(texto):
    t = (texto or "").lower()
    if "comercial" in t:
        return "Comercial"
    return "Residencial"


def _detectar_sizes(texto, titulo=""):
    t = texto or ""
    tt = titulo or ""

    vals_titulo = [int(x) for x in re.findall(r"\b(\d{2,3})\s*m[²2]\b", tt, re.IGNORECASE)]
    vals_titulo = [v for v in vals_titulo if 18 <= v <= 400]
    if vals_titulo:
        return f"{vals_titulo[0]}m²"

    t = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", t)
    contexto = re.findall(
        r"[^\n\.]{0,80}(\d{2,4}\s*m[²2](?:\s*(?:a|até|ate|-)\s*\d{2,4}\s*m[²2])?)[^\n\.]{0,80}",
        t,
        flags=re.IGNORECASE,
    )
    if contexto:
        for c in contexto:
            nums = [int(x) for x in re.findall(r"\d{2,4}", c)]
            if nums and max(nums) <= 400:
                out = re.sub(r"\s+", " ", c).replace("m2", "m²").strip()
                out = re.sub(r"\b0+(\d)", r"\1", out)
                return out

    ignorar = ["terreno", "área total", "area total", "lazer", "complexo", "m² de área"]
    for linha in t.splitlines():
        l = linha.lower()
        if any(k in l for k in ignorar):
            continue
        m = re.search(r"(\d{2,4}\s*m[²2]\s*(?:a|até|ate|-)\s*\d{2,4}\s*m[²2])", linha, re.IGNORECASE)
        if m:
            nums = [int(x) for x in re.findall(r"\d{2,4}", m.group(1))]
            if nums and max(nums) <= 400:
                out = re.sub(r"\s+", " ", m.group(1)).replace("m2", "m²").strip()
                out = re.sub(r"\b0+(\d)", r"\1", out)
                return out

    singles = re.findall(r"\b(\d{2,4})\s*m[²2]\b", t, re.IGNORECASE)
    singles = [int(s) for s in singles]
    singles = [s for s in singles if 18 <= s <= 400]
    if singles:
        return f"{singles[0]}m²"

    m = re.search(r"(\d{1,4}\s*m[²2]?\s*(?:a|até|ate|-)\s*\d{1,4}\s*m[²2]?)", t, re.IGNORECASE)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).replace("m2", "m²")
    vals = re.findall(r"\b(\d{1,4})\s*m[²2]\b", t, re.IGNORECASE)
    vals = list(dict.fromkeys(vals))
    if len(vals) >= 2:
        return f"{vals[0]}m² a {vals[-1]}m²"
    if len(vals) == 1:
        return f"{vals[0]}m²"
    return ""


def _detectar_dorms(texto):
    t = texto or ""
    m = re.search(r"((?:\d+\s*dorms?\.?[^\n,.]*)(?:\([^\)]*\))?)", t, re.IGNORECASE)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()
    m2 = re.search(r"(\d+\s*dormit[óo]rios?[^\n,.]*)", t, re.IGNORECASE)
    return m2.group(1).strip() if m2 else ""


def _detectar_vagas(texto):
    t = texto or ""
    m = re.search(r"(\d+\s*vagas?)", t, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _detectar_endereco(texto):
    t = texto or ""
    padroes = [
        r"\b(Rua\s+[^\n,]+,\s*\d+[^\n]*)",
        r"\b(Avenida\s+[^\n,]+,\s*\d+[^\n]*)",
        r"\b(Av\.\s*[^\n,]+,\s*\d+[^\n]*)",
    ]
    for p in padroes:
        m = re.search(p, t, re.IGNORECASE)
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip()
    return ""


def _detectar_bairro(texto, cerebro_md):
    permitidos = _extrair_lista_permitida(cerebro_md, "address_neighborhood")
    t = (texto or "").lower()
    for b in permitidos:
        if b.lower() in t:
            return b
    return ""


def _detectar_video_url(texto):
    t = texto or ""
    m = re.search(r"(https?://(?:www\.)?(?:youtube\.com/watch\?v=[^\s&]+|youtu\.be/[^\s?&]+|vimeo\.com/\d+))", t, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _detectar_features(texto):
    t = (texto or "").lower()
    termos = {
        "piscina": "Piscina",
        "piscina adulto": "Piscina adulto",
        "piscina infantil": "Piscina infantil",
        "academia": "Academia",
        "fitness": "Fitness",
        "rooftop": "Rooftop",
        "solarium": "Solarium",
        "churrasqueira": "Churrasqueira",
        "salão de festas": "Salão de festas",
        "coworking": "Coworking",
        "playground": "Playground",
        "pet care": "Pet care",
        "pet place": "Pet place",
        "quadra": "Quadra",
        "brinquedoteca": "Brinquedoteca",
        "spa": "Spa",
        "sauna": "Sauna",
        "lounge": "Lounge",
        "espaço gourmet": "Espaço gourmet",
        "mini mercado": "Mini mercado",
        "bicicletário": "Bicicletário",
        "salão de jogos": "Salão de jogos",
    }
    achados = []
    for chave, nome_out in termos.items():
        if chave in t:
            achados.append(nome_out)
    return ", ".join(dict.fromkeys(achados))


def _detectar_subtitle(texto, dorms, vagas, sizes):
    partes = []
    if dorms: partes.append(dorms)
    if vagas: partes.append(vagas)
    if sizes: partes.append(sizes)
    if partes: return " | ".join(partes)
    
    t = texto or ""
    d = _detectar_dorms(t)
    v = _detectar_vagas(t)
    s = _detectar_sizes(t)
    base = [x for x in [d, v, s] if x]
    return " | ".join(base)


def _detectar_project_highlight(texto, features):
    t = texto or ""
    padroes = [
        r"(diferencial[^\n\.;]{0,120})",
        r"(estilo de vida[^\n\.;]{0,120})",
        r"(terraço gourmet[^\n\.;]{0,120})",
        r"(vista[^\n\.;]{0,120})",
    ]
    for p in padroes:
        m = re.search(p, t, flags=re.IGNORECASE)
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip().capitalize()

    if features:
        lista = [x.strip() for x in features.split(",") if x.strip()]
        if lista:
            return "Lazer com " + ", ".join(lista[:3])
    return ""


def _gerar_about(titulo, endereco, sizes, dorms, phase, category):
    partes = []
    if titulo:
        partes.append(f"{titulo} é um empreendimento {category.lower() if category else 'residencial'} em São Paulo.")
    if endereco:
        partes.append(f"Está localizado em {endereco}.")
    if sizes or dorms:
        desc = ""
        if dorms: desc += dorms
        if sizes: desc += (" com " if desc else "") + sizes
        partes.append(f"Oferece tipologias de {desc}." if desc else "")
    if phase:
        partes.append(f"Fase atual: {phase}.")
    return " ".join([p for p in partes if p]).strip()


def _gerar_seo(titulo, bairro, dorms, sizes, phase):
    pedacos = []
    if dorms: pedacos.append(dorms)
    if sizes: pedacos.append(sizes)
    base = " | ".join([p for p in pedacos if p])
    out = (base + " em " + bairro) if bairro else base
    if titulo:
        out = f"{titulo}: {out}" if out else titulo
    if phase:
        out = (out + f". {phase}.") if out else phase
    return out.strip()


def _heuristicas_campos(header, titulo, url, texto_pagina, cerebro_md):
    txt = texto_pagina or ""
    h = {k: "" for k in header}

    if "title" in h: h["title"] = titulo or ""
    if "url" in h: h["url"] = url or ""
    if "category" in h: h["category"] = _detectar_category(txt)
    if "phase" in h: h["phase"] = _detectar_phase(txt)
    if "sizes" in h: h["sizes"] = _detectar_sizes(txt, titulo=titulo)
    if "dorms_info" in h: h["dorms_info"] = _detectar_dorms(txt)
    if "vagas_info" in h: h["vagas_info"] = _detectar_vagas(txt)
    if "address_street" in h: h["address_street"] = _detectar_endereco(txt)
    if "address_neighborhood" in h: h["address_neighborhood"] = _detectar_bairro(txt, cerebro_md)
    if "features" in h: h["features"] = _detectar_features(txt)
    if "subtitle" in h: h["subtitle"] = _detectar_subtitle(txt, h.get("dorms_info", ""), h.get("vagas_info", ""), h.get("sizes", ""))
    if "project_highlight" in h: h["project_highlight"] = _detectar_project_highlight(txt, h.get("features", ""))
    if "video_url" in h: h["video_url"] = _detectar_video_url(txt)

    if "about_text" in h:
        h["about_text"] = _gerar_about(titulo, h.get("address_street", ""), h.get("sizes", ""), h.get("dorms_info", ""), h.get("phase", ""), h.get("category", ""))
    if "seo_description" in h:
        h["seo_description"] = _gerar_seo(titulo, h.get("address_neighborhood", ""), h.get("dorms_info", ""), h.get("sizes", ""), h.get("phase", ""))

    return h


def gerar_csv_com_cerebro(titulo, url, texto_pagina, destino_csv, cerebro_md, callback_log=None):
    if not cerebro_md or not cerebro_md.strip():
        raise ValueError("Cérebro vazio. Faça upload do .md antes.")

    os.makedirs(os.path.dirname(os.path.abspath(destino_csv)), exist_ok=True)

    texto_bruto = texto_pagina or ""
    texto_limpo, info_pre = _preprocessar_texto_para_ia(texto_bruto)

    if callback_log:
        callback_log(
            f"Preprocessamento: {info_pre['linhas_brutas']} linhas -> {info_pre['linhas_unicas']} unicas -> {info_pre['linhas_finais']} relevantes"
        )

    header = _extrair_cabecalho_md(cerebro_md)
    header_txt = ";".join(header)

    prompt = (
        "Extraia dados do texto seguindo as regras. "
        "Retorne APENAS JSON objeto com CHAVES EXATAS do cabeçalho informado, sem texto extra. "
        "Se nao souber um campo, deixe vazio.\n\n"
        f"CABECALHO EXATO:\n{header_txt}\n\n"
        f"REGRAS (CEREBRO):\n{cerebro_md[:5200]}\n\n"
        f"TITULO: {titulo}\nURL: {url}\n\n"
        f"TEXTO DA PAGINA (LIMPO):\n{texto_limpo}"
    )

    if callback_log:
        callback_log("Processando regras do Cérebro com IA local...")

    # Carrega modelo e tokenizador
    tok, model = _get_model_objs()
    
    # Prepara input
    ins = tok(prompt, return_tensors="pt", truncation=True, max_length=1024)
    
    # Gera saída sem usar recursos que disparam meta tensors
    # do_sample=False (Greedy Search) é mais estável
    import torch
    with torch.no_grad():
        outs = model.generate(
            input_ids=ins["input_ids"],
            attention_mask=ins["attention_mask"],
            max_new_tokens=320,
            do_sample=False,
            num_beams=1,
            use_cache=True
        )
        
    # Decodifica removendo tokens especiais
    gerado = tok.decode(outs[0], skip_special_tokens=True)
    data = _extrair_json(gerado)

    linha_dict = {}
    if isinstance(data, dict):
        if "colunas" in data and "linha" in data:
            cols_in = [str(c) for c in data.get("colunas", [])]
            lin_in = [str(v) for v in data.get("linha", [])]
            linha_dict = _to_dict_by_header(cols_in, lin_in)
        else:
            linha_dict = {str(k): str(v) for k, v in data.items()}

    heur = _heuristicas_campos(header, titulo, url, texto_limpo or texto_bruto, cerebro_md)

    if not linha_dict:
        linha_dict = {h: "" for h in header}

    for k in header:
        if not str(linha_dict.get(k, "")).strip() and str(heur.get(k, "")).strip():
            linha_dict[k] = heur[k]

    linha_dict = _normalizar_por_regras(linha_dict, header, titulo, url, cerebro_md)
    linha = _from_dict_by_header(header, linha_dict)

    with open(destino_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        w.writerow(header)
        w.writerow(linha)

    if callback_log:
        callback_log(f"CSV gerado: {destino_csv}")

    return destino_csv
