"""Modo Tripé do estabilizador: vídeo sintético (parede texturizada com micro-trepidação de ±1,5 px e uma "pessoa"
andando embaixo) → a cópia estabilizada tem que ficar quase parada. Sem app. Uso: py -3.13 testes/teste_estab_tripe.py"""
import os, sys, subprocess, tempfile
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from Functions import estabilizador as e
from Functions.video_cutter import ffmpeg_path


def medir(p, n=60):
    cap, fr = cv2.VideoCapture(p), []
    while len(fr) < n:
        k, f = cap.read()
        if not k:
            break
        fr.append(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)[60:300, 100:1180].astype(np.float32))
    d = [cv2.phaseCorrelate(a, b)[0] for a, b in zip(fr, fr[1:])]
    return float(np.sqrt((np.array(d) ** 2).sum(1).mean()))


def main():
    W, H, N = 1280, 720, 100
    rng = np.random.default_rng(1)
    fundo = cv2.GaussianBlur((rng.random((H + 40, W + 40)) * 255).astype(np.uint8), (0, 0), 2)
    fundo = cv2.cvtColor(fundo, cv2.COLOR_GRAY2BGR)
    tmp = tempfile.mkdtemp(dir=os.environ.get("TEMP"))
    src = os.path.join(tmp, "tremido.mp4")
    enc = subprocess.Popen([ffmpeg_path(), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "25",
                            "-i", "-", "-c:v", "libx264", "-crf", "10", "-pix_fmt", "yuv420p", src], stdin=subprocess.PIPE)
    for t in range(N):
        dx, dy = rng.uniform(-1.5, 1.5, 2)
        M = np.float32([[1, 0, 20 + dx], [0, 1, 20 + dy]])
        f = cv2.warpAffine(fundo, M, (W, H), flags=cv2.WARP_INVERSE_MAP | cv2.INTER_CUBIC)
        cv2.rectangle(f, (100 + t * 8, 450), (300 + t * 8, 720), (40, 80, 200), -1)   # "pessoa" passando embaixo
        enc.stdin.write(f.tobytes())
    enc.stdin.close(); enc.wait()
    r = e.estabilizar(src, 0, N / 25, {"modo": "tripe", "zoom_max": 1.1})
    antes, depois = medir(src), medir(r["path"])
    print(f"tremor {antes:.2f} px → {depois:.2f} px · zoom {r['zoom']} · análise {r['t_analise']} s")
    ok = r["success"] and depois < antes * 0.25 and r["zoom"] < 1.03
    print("RESULTADO:", "ok" if ok else "FALHOU")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
