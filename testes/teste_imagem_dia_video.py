"""Testa tools/agente/imagem_dia_video.py com assets mínimos gerados na hora (card fictício no disco D:)."""
import json
import os
import shutil
import subprocess
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "tools", "agente"))
import imagem_dia_video as idv

TMP = "D:/Kanivete/Testes/idv_unit"


def _ff(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


class ImagemDiaVideoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        shutil.rmtree(TMP, ignore_errors=True)
        cls.cliente = TMP + "/CLIENTE"
        cls.card = cls.cliente + "/03 - PAUTAS/11 - PACOTE/02 - IMAGEM DO DIA - TESTE UNIT"
        os.makedirs(cls.card + "/02 - ASSETS")
        _ff("-f", "lavfi", "-i", "color=c=gray:s=1080x1920:d=1", "-frames:v", "1", cls.card + "/02 - ASSETS/BASE STORY - TESTE.png")
        _ff("-f", "lavfi", "-i", "color=c=black:s=320x240:d=5:r=30", "-pix_fmt", "yuv420p", cls.card + "/02 - ASSETS/VIDEO NO MONITOR - TESTE LIMPO.mp4")
        _ff("-f", "lavfi", "-i", "color=c=blue:s=270x480:d=3:r=30", "-pix_fmt", "yuv420p", cls.cliente + "/Finalização videos.mp4")
        _ff("-f", "lavfi", "-i", "sine=frequency=440:duration=30", cls.cliente + "/ES_Mindscape - Lennon Hutton.mp3")

    def test_so_ver_confere_sem_criar(self):
        info = idv.montar(self.card, duracao=4, so_ver=True)
        self.assertEqual(info["tema"], "TESTE UNIT")
        self.assertAlmostEqual(info["duracao_exame_s"], 4, 1)
        self.assertAlmostEqual(info["duracao_total_s"], 7, 0)
        self.assertNotIn("criado", info)
        if os.path.exists(info["projeto"]):   # outro teste pode ter criado antes: so_ver não pode mexer nele
            antes = os.path.getmtime(info["projeto"])
            idv.montar(self.card, duracao=4, so_ver=True)
            self.assertEqual(os.path.getmtime(info["projeto"]), antes)

    def test_monta_projeto_com_exame_trilha_e_assinatura_encaixados(self):
        info = idv.montar(self.card, duracao=3, refazer=True)
        self.assertTrue(info["criado"])
        d = json.load(open(info["projeto"], encoding="utf8"))
        clips = {c["m"]: c for c in d["clips"]}
        ids = {m["kind"] + ("_ass" if "finaliza" in m["name"].lower() else ""): int(m["id"]) for m in d["media"] if m["kind"] != "timeline"}
        exame = [m for m in d["media"] if m["kind"] == "video" and "finaliza" not in m["name"].lower()][0]
        self.assertEqual(clips[int(exame["id"])]["e"], 3)
        ass = clips[ids["video_ass"]]
        self.assertEqual(ass["st"], 3)
        trilha = clips[ids["audio"]]
        self.assertEqual(trilha["g"], -22.0); self.assertIn("atin", trilha); self.assertIn("atout", trilha)
        self.assertAlmostEqual(trilha["e"], 3 + ass["e"], 1)
        self.assertEqual(d["sequences"][0]["clips"], d["clips"])

    def test_nao_sobrescreve_sem_refazer_e_pede_assets(self):
        idv.montar(self.card, duracao=3, refazer=True)
        with self.assertRaises(SystemExit):
            idv.montar(self.card, duracao=3)
        vazio = TMP + "/CLIENTE/03 - PAUTAS/11 - PACOTE/03 - IMAGEM DO DIA - SEM ASSETS"
        os.makedirs(vazio + "/02 - ASSETS", exist_ok=True)
        with self.assertRaises(SystemExit) as r:
            idv.montar(vazio, so_ver=True)
        self.assertIn("faltam assets", str(r.exception))


if __name__ == "__main__":
    unittest.main()
