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

