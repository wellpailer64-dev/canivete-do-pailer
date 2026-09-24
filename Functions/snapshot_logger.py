"""
snapshot_logger.py — Backup/restauração para o Organizador de Vídeos
"""
import json
import os
from datetime import datetime


def gerar_backup(pasta_origem, mapa_backup, pasta_org, callback_log=None):
    """
    Gera BACKUP.json dentro de pasta_org.

    mapa_backup: lista de dicts com chaves:
      path, destino_planejado, tamanho, tipo
    """
    backup = {
        "data": datetime.now().isoformat(),
        "pasta_origem": pasta_origem,
        "pasta_org": pasta_org,
        "arquivos": {},
    }

    for arq in mapa_backup:
        src = arq.get("path", "")
        dst = arq.get("destino_planejado", "")
        if src:
            backup["arquivos"][src] = {
                "destino_planejado": dst,
                "tamanho": arq.get("tamanho", 0),
                "tipo": arq.get("tipo", ""),
            }

    backup_path = os.path.join(pasta_org, "BACKUP.json")
    try:
        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(backup, f, indent=2, ensure_ascii=False)
        if callback_log:
            callback_log(f"   💾 BACKUP.json salvo ({len(backup['arquivos'])} arquivo(s))")
    except Exception as e:
        if callback_log:
            callback_log(f"   ⚠️  Erro ao salvar BACKUP.json: {e}")

    return backup_path


def gerar_nextup(pasta_origem, mapa_movidos, nome_pasta, callback_log=None):
    """
    Gera NEXTUP.json dentro da pasta_org do primeiro item de mapa_movidos.

    mapa_movidos: lista de dicts com chaves:
      path_original, destino_final, pasta_org, tipo, ...
    """
    if not mapa_movidos:
        return None

    pasta_org = mapa_movidos[0].get("pasta_org", "")
    if not pasta_org:
        return None

    nextup = {
        "data": datetime.now().isoformat(),
        "pasta_origem": pasta_origem,
        "nome_pasta": nome_pasta,
        "arquivos": {},
    }

    for arq in mapa_movidos:
        src = arq.get("path_original", "")
        dst = arq.get("destino_final", "")
        if src:
            rel_dst = os.path.relpath(dst, pasta_org) if dst else ""
            nextup["arquivos"][src] = {
                "destino_relativo": rel_dst,
                "tipo": arq.get("tipo", ""),
                "pai": arq.get("pai", ""),
            }

    nextup_path = os.path.join(pasta_org, "NEXTUP.json")
    try:
        with open(nextup_path, "w", encoding="utf-8") as f:
            json.dump(nextup, f, indent=2, ensure_ascii=False)
        if callback_log:
            callback_log(f"   📤 NEXTUP.json salvo ({len(nextup['arquivos'])} entrada(s))")
    except Exception as e:
        if callback_log:
            callback_log(f"   ⚠️  Erro ao salvar NEXTUP.json: {e}")

    return nextup_path


def desfazer_backup(pasta_backup):
    """Restaura arquivos ao local original usando BACKUP.json"""
    if not os.path.exists(pasta_backup):
        return {"success": False, "erro": "BACKUP.json não encontrado"}

    with open(pasta_backup, "r", encoding="utf-8") as f:
        backup = json.load(f)

    erros = []
    for src, info in backup.get("arquivos", {}).items():
        dst = info.get("destino_planejado", "")
        if not src or not dst:
            continue
        if os.path.exists(dst):
            try:
                os.makedirs(os.path.dirname(src), exist_ok=True)
                os.rename(dst, src)
            except Exception as e:
                erros.append(f"{dst}: {e}")

    return {"success": len(erros) == 0, "erros": erros}


def aplicar_nextup(nextup_path, pasta_base_destino):
    """Aplica NEXTUP.json para replicar organização em outra pasta"""
    if not os.path.exists(nextup_path):
        return {"success": False, "erro": "NEXTUP.json não encontrado"}

    with open(nextup_path, "r", encoding="utf-8") as f:
        nextup = json.load(f)

    erros = []
    for src, info in nextup.get("arquivos", {}).items():
        rel_dst = info.get("destino_relativo", "")
        if not src or not rel_dst:
            continue
        dst = os.path.join(pasta_base_destino, rel_dst)
        if os.path.exists(src):
            try:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                os.rename(src, dst)
            except Exception as e:
                erros.append(f"{src}: {e}")

    return {"success": len(erros) == 0, "erros": erros}
