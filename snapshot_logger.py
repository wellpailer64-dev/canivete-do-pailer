"""
snapshot_logger.py
==================
Sistema de snapshot e replay para o Logger Brabo.

BACKUP.json  — salvo ANTES de organizar
  Mapeia: caminho_original → caminho_destino
  Permite desfazer a organização movendo tudo de volta.

NEXTUP.json  — salvo APÓS organizar
  Contém: metadados completos de cada arquivo (nome, tamanho, data,
  câmera, profissional) + caminho relativo final na estrutura organizada.
  Permite que outra pessoa reproduza a MESMA organização em sua máquina,
  localizando os arquivos pelos metadados.
"""

import os
import sys
import json
import shutil
from datetime import datetime


# =========================
# 📸 GERAR BACKUP
# Chamado ANTES de organizar
# =========================
def gerar_backup(pasta_raiz, arquivos_info, pasta_org, callback_log=None):
    """
    Salva o mapa de movimentações planejadas em BACKUP.json.

    arquivos_info: lista de dicts com 'path' e 'destino_planejado'
    pasta_org: caminho da pasta de destino organizada
    """
    backup = {
        "versao":      "1.0",
        "tipo":        "BACKUP",
        "gerado_em":   datetime.now().isoformat(),
        "pasta_raiz":  pasta_raiz,
        "pasta_org":   pasta_org,
        "movimentos":  []
    }

    for info in arquivos_info:
        backup["movimentos"].append({
            "original":  info["path"],
            "destino":   info.get("destino_planejado", ""),
            "nome":      os.path.basename(info["path"]),
            "tamanho":   info.get("tamanho", 0),
            "tipo":      info.get("tipo", ""),
        })

    path_backup = os.path.join(pasta_raiz, "BACKUP.json")
    with open(path_backup, "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)

    if callback_log:
        callback_log(f"💾 BACKUP salvo: {path_backup}")

    return path_backup


# =========================
# ↩️ RESTAURAR DO BACKUP
# Move tudo de volta ao original
# =========================
def restaurar_backup(path_backup, callback_progresso=None, callback_log=None):
    """
    Lê o BACKUP.json e desfaz a organização,
    movendo cada arquivo de volta ao caminho original.
    """
    if not os.path.exists(path_backup):
        if callback_log:
            callback_log(f"❌ BACKUP não encontrado: {path_backup}")
        return {"sucesso": False, "restaurados": 0, "falhas": 0}

    with open(path_backup, "r", encoding="utf-8") as f:
        backup = json.load(f)

    if backup.get("tipo") != "BACKUP":
        if callback_log:
            callback_log("❌ Arquivo não é um BACKUP válido do Logger Brabo.")
        return {"sucesso": False, "restaurados": 0, "falhas": 0}

    movimentos  = backup.get("movimentos", [])
    total       = len(movimentos)
    restaurados = 0
    falhas      = 0

    if callback_log:
        callback_log(f"↩️  Restaurando {total} arquivo(s)...")
        callback_log(f"   Pasta raiz: {backup['pasta_raiz']}")

    for i, mov in enumerate(movimentos):
        destino_atual = mov["destino"]   # onde está agora (após organização)
        origem        = mov["original"]  # onde deve voltar

        if not destino_atual:
            continue

        # Se o arquivo ainda está no destino, move de volta
        if os.path.exists(destino_atual):
            try:
                os.makedirs(os.path.dirname(origem), exist_ok=True)

                # Evita sobrescrever se já existir no original
                dest_final = origem
                if os.path.exists(dest_final):
                    base, ext = os.path.splitext(origem)
                    dest_final = f"{base}_restaurado{ext}"

                shutil.move(destino_atual, dest_final)
                restaurados += 1

                if callback_log:
                    callback_log(f"   ✅ {os.path.basename(destino_atual)} → restaurado")

            except Exception as e:
                falhas += 1
                if callback_log:
                    callback_log(f"   ❌ Erro: {os.path.basename(destino_atual)}: {e}")

        elif os.path.exists(origem):
            if callback_log:
                callback_log(f"   ⏭️  Já está no original: {os.path.basename(origem)}")
        else:
            falhas += 1
            if callback_log:
                callback_log(f"   ⚠️  Não encontrado: {os.path.basename(destino_atual)}")

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Restaurando... {i+1}/{total}")

    # Remove pasta organizada se estiver vazia
    pasta_org = backup.get("pasta_org", "")
    if pasta_org and os.path.exists(pasta_org):
        _remover_pastas_vazias(pasta_org)

    if callback_progresso:
        callback_progresso(100, "Restauração concluída")

    if callback_log:
        callback_log(f"\n✅ Restaurados: {restaurados} | ❌ Falhas: {falhas}")

    return {"sucesso": falhas == 0, "restaurados": restaurados, "falhas": falhas}


# =========================
# 📤 GERAR NEXTUP
# Salvo APÓS organizar — compartilhável
# =========================
def gerar_nextup(pasta_raiz, arquivos_movidos, nome_projeto,
                 callback_log=None):
    """
    Gera NEXTUP.json com metadados completos de cada arquivo
    e o caminho relativo final na estrutura organizada.

    arquivos_movidos: lista de dicts com info completa + destino_final
    """
    nextup = {
        "versao":         "1.0",
        "tipo":           "NEXTUP",
        "gerado_em":      datetime.now().isoformat(),
        "nome_projeto":   nome_projeto,
        "pasta_raiz_ref": pasta_raiz,
        "total_arquivos": len(arquivos_movidos),
        "arquivos":       []
    }

    for info in arquivos_movidos:
        destino_abs = info.get("destino_final", "")
        pasta_org   = info.get("pasta_org", "")

        # Caminho relativo dentro da pasta organizada
        try:
            rel = os.path.relpath(destino_abs, pasta_org) if destino_abs and pasta_org else ""
        except Exception:
            rel = os.path.basename(destino_abs) if destino_abs else ""

        nextup["arquivos"].append({
            # Identidade do arquivo (para localizar em outro computador)
            "nome_original":  os.path.basename(info.get("path_original", "")),
            "tamanho":        info.get("tamanho", 0),
            "data_criacao":   info.get("data", datetime.now()).isoformat()
                              if hasattr(info.get("data"), "isoformat")
                              else str(info.get("data", "")),
            "camera":         info.get("camera", ""),
            "profissional":   info.get("profissional", ""),
            "tipo":           info.get("tipo", ""),
            # Destino na estrutura organizada
            "caminho_relativo": rel,
            "nome_final":     os.path.basename(destino_abs) if destino_abs else "",
        })

    path_nextup = os.path.join(pasta_raiz, "NEXTUP.json")
    with open(path_nextup, "w", encoding="utf-8") as f:
        json.dump(nextup, f, ensure_ascii=False, indent=2)

    if callback_log:
        callback_log(f"📤 NEXTUP salvo: {path_nextup}")
        callback_log(f"   Compartilhe esse arquivo para reproduzir a organização em outra máquina.")

    return path_nextup


# =========================
# 📥 APLICAR NEXTUP
# Reproduz organização em outro computador
# =========================
def aplicar_nextup(path_nextup, pasta_destino,
                   callback_progresso=None, callback_log=None):
    """
    Lê um NEXTUP.json e organiza os arquivos da pasta_destino
    seguindo a mesma estrutura do projeto original.

    Localiza cada arquivo por: nome_original + tamanho (±1%) + data
    """
    if not os.path.exists(path_nextup):
        if callback_log:
            callback_log(f"❌ NEXTUP não encontrado: {path_nextup}")
        return {"sucesso": False, "aplicados": 0, "nao_encontrados": 0, "falhas": 0}

    with open(path_nextup, "r", encoding="utf-8") as f:
        nextup = json.load(f)

    if nextup.get("tipo") != "NEXTUP":
        if callback_log:
            callback_log("❌ Arquivo não é um NEXTUP válido do Logger Brabo.")
        return {"sucesso": False, "aplicados": 0, "nao_encontrados": 0, "falhas": 0}

    nome_projeto = nextup.get("nome_projeto", "organizado")
    arquivos_ref = nextup.get("arquivos", [])
    total        = len(arquivos_ref)

    if callback_log:
        callback_log(f"📥 Carregando NEXTUP: {nome_projeto}")
        callback_log(f"   {total} arquivo(s) na organização de referência")
        callback_log(f"   Buscando arquivos em: {pasta_destino}")
        callback_log("🔍 Indexando arquivos locais...")

    # Indexa todos os arquivos da pasta destino por (nome, tamanho)
    indice_local = {}
    for root, dirs, files in os.walk(pasta_destino):
        for f in files:
            path = os.path.join(root, f)
            try:
                tam = os.path.getsize(path)
                chave = (f.lower(), tam)
                if chave not in indice_local:
                    indice_local[chave] = []
                indice_local[chave].append(path)
            except Exception:
                pass

    if callback_log:
        callback_log(f"   {len(indice_local)} arquivo(s) indexado(s) localmente")

    pasta_org      = os.path.join(pasta_destino, nome_projeto)
    aplicados      = 0
    nao_encontrados = 0
    falhas         = 0

    for i, ref in enumerate(arquivos_ref):
        nome_orig = ref.get("nome_original", "")
        tamanho   = ref.get("tamanho", 0)
        cam_rel   = ref.get("caminho_relativo", "")
        nome_fin  = ref.get("nome_final", nome_orig)

        if not nome_orig or not cam_rel:
            continue

        # Busca por nome exato + tamanho
        arquivo_local = None
        chave_exata   = (nome_orig.lower(), tamanho)

        if chave_exata in indice_local:
            arquivo_local = indice_local[chave_exata][0]
        else:
            # Busca tolerante: tamanho ±2%
            for (nome_idx, tam_idx), paths in indice_local.items():
                if nome_idx == nome_orig.lower():
                    if tamanho == 0 or abs(tam_idx - tamanho) / max(tamanho, 1) <= 0.02:
                        arquivo_local = paths[0]
                        break

        if not arquivo_local:
            nao_encontrados += 1
            if callback_log:
                callback_log(f"   ⚠️  Não encontrado: {nome_orig}")
            continue

        # Monta destino
        destino_dir = os.path.join(pasta_org, os.path.dirname(cam_rel))
        destino     = os.path.join(destino_dir, nome_fin)

        # Evita mover se já está no lugar certo
        if os.path.abspath(arquivo_local) == os.path.abspath(destino):
            aplicados += 1
            continue

        try:
            os.makedirs(destino_dir, exist_ok=True)

            # Evita colisão
            if os.path.exists(destino):
                base, ext = os.path.splitext(destino)
                n = 1
                while os.path.exists(destino):
                    destino = f"{base}_{n}{ext}"
                    n += 1

            shutil.move(arquivo_local, destino)
            aplicados += 1

            if callback_log:
                callback_log(f"   ✅ {nome_orig} → {cam_rel}")

        except Exception as e:
            falhas += 1
            if callback_log:
                callback_log(f"   ❌ Erro em {nome_orig}: {e}")

        if callback_progresso:
            callback_progresso(int((i + 1) / total * 100), f"Aplicando... {i+1}/{total}")

    if callback_progresso:
        callback_progresso(100, "NEXTUP aplicado!")

    if callback_log:
        callback_log(f"\n✅ Aplicados: {aplicados}")
        callback_log(f"   ⚠️  Não encontrados: {nao_encontrados}")
        callback_log(f"   ❌ Falhas: {falhas}")

    return {
        "sucesso":          falhas == 0,
        "aplicados":        aplicados,
        "nao_encontrados":  nao_encontrados,
        "falhas":           falhas,
    }


# =========================
# 🗑️ REMOVE PASTAS VAZIAS
# =========================
def _remover_pastas_vazias(pasta):
    """Remove recursivamente pastas que ficaram vazias após restauração."""
    for root, dirs, files in os.walk(pasta, topdown=False):
        if not files and not os.listdir(root):
            try:
                os.rmdir(root)
            except Exception:
                pass
