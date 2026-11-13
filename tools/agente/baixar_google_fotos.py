"""Baixa um álbum compartilhado do Google Fotos (link photos.app.goo.gl ou photos.google.com/share) em qualidade
original, direto do servidor, sem clicar em "Fazer o download de tudo" (zip lento, sem retomada).

  py -3.13 tools/agente/baixar_google_fotos.py "<link do álbum>" "<pasta destino>" [--so-listar] [--reserva-gb 2]

Como funciona (2026-11-13, álbum Casa Morumbi da Helo):
  1. abre o álbum na aba da Kani (kb.py ir) e rola a grade coletando cada item: rótulo ("Vídeo - ..." / "Foto - ...")
     e a URL base lh3.googleusercontent.com (sem o sufixo de tamanho);
  2. baixa cada item com sufixo =dv (vídeo original) ou =d (foto original); o nome vem do Content-Disposition
     (IMG_3527.MOV etc.);
  3. retoma: arquivo já presente com o mesmo tamanho é pulado; baixa em .part e só renomeia no fim;
  4. confere o espaço livre ANTES de cada arquivo (tamanho + reserva) e para com mensagem clara se faltar
     (sem isto, disco cheio deixava .part quebrados).
Limites: álbum precisa estar aberto para quem tem o link; as URLs base expiram em algumas horas (rode de novo, ele
recoleta). Comando longo: rodar por tarefas_soltas.py. Coletou menos itens que o álbum mostra? A grade não rolou até o
fim: rode de novo (pula os já baixados).
"""
import argparse, json, os, re, shutil, subprocess, sys, time, urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
KB = r"D:/Kanivete/Plugins/kanibrowser/kb.py"
COLETOR = r"""(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));const S=new Map();
const col=()=>document.querySelectorAll('a[href*="/photo/"]').forEach(a=>{const d=a.querySelector('[style*="background-image"]')||a.parentElement.querySelector('[style*="background-image"]');const m=d&&d.style.backgroundImage.match(/url\("?([^")]+)/);if(m)S.set(a.getAttribute('href'),[a.getAttribute('aria-label')||'',m[1].split('=')[0]]);});
const sc=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+200&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));
let parado=0,antes=-1;
for(let i=0;i<200&&parado<6;i++){col(); sc.forEach(e=>e.scrollTop+=700); window.scrollBy(0,700); await z(450);
  if(S.size===antes)parado++; else {parado=0; antes=S.size;}}
col(); return JSON.stringify([...S.values()]);})()"""


def kb(*args, timeout=180):
    r = subprocess.run([sys.executable, KB, "--onde", "kanicode", "--sem-foto", *args], capture_output=True,
                       text=True, encoding="utf-8", timeout=timeout)
    if r.returncode:
        raise SystemExit("kb.py falhou: " + (r.stdout + r.stderr).strip()[-500:])
    return r.stdout


def coletar(link):
    kb("ir", link)
    time.sleep(4)
    pasta = os.environ.get("TEMP", "D:/kanivete_testes/tmp")
    arq = os.path.join(pasta, "gf_coletor.js")
    with open(arq, "w", encoding="utf-8") as f:
        f.write(COLETOR)
    saida = kb("js", "@" + arq, timeout=300).strip().splitlines()
    linha = next((x for x in reversed(saida) if x.startswith("[")), None)
    if not linha:
        raise SystemExit("Coletor não devolveu itens: " + "\n".join(saida)[-400:])
    return json.loads(linha)


def livre(pasta):
    return shutil.disk_usage(pasta).free


def baixar(itens, dest, reserva):
    os.makedirs(dest, exist_ok=True)
    ok = pulados = erros = 0
    for i, (rot, base) in enumerate(itens, 1):
        sufixo = "=dv" if rot.lower().startswith("v") else "=d"
        for t in range(3):
            try:
                r = urllib.request.urlopen(urllib.request.Request(base + sufixo, headers={"User-Agent": "Mozilla/5.0"}),
                                           timeout=120)
                m = re.search(r'filename="([^"]+)"', r.headers.get("Content-Disposition", ""))
                nome = m.group(1) if m else f"item_{i:02d}"
                alvo = os.path.join(dest, nome)
                tam = int(r.headers.get("Content-Length") or -1)
                if os.path.exists(alvo) and os.path.getsize(alvo) == tam:
                    print(f"{i:02d} já {nome}", flush=True)
                    pulados += 1
                    r.close()
                    break
                if tam > 0 and livre(dest) < tam + reserva:
                    r.close()
                    raise SystemExit(f"PARADO: sem espaço para {nome} ({tam / 1e9:.2f} GB + reserva); "
                                     f"livre {livre(dest) / 1e9:.2f} GB. Libere espaço e rode de novo (retoma).")
                with open(alvo + ".part", "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                if tam > 0 and os.path.getsize(alvo + ".part") != tam:
                    raise IOError("tamanho diferente do anunciado")
                os.replace(alvo + ".part", alvo)
                print(f"{i:02d} ok {nome} {os.path.getsize(alvo) / 1e6:.1f} MB", flush=True)
                ok += 1
                break
            except SystemExit:
                raise
            except Exception as e:
                print(f"{i:02d} erro tentativa {t + 1}: {e}", flush=True)
                time.sleep(3)
        else:
            erros += 1
    print(f"FIM: {len(itens)} itens | baixados {ok} | já existiam {pulados} | erros {erros}", flush=True)
    return erros


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("link"); ap.add_argument("destino")
    ap.add_argument("--so-listar", action="store_true")
    ap.add_argument("--reserva-gb", type=float, default=2.0)
    a = ap.parse_args()
    itens = coletar(a.link)
    v = sum(1 for r, _ in itens if r.lower().startswith("v"))
    print(f"coletados {len(itens)} itens ({v} vídeos, {len(itens) - v} fotos)", flush=True)
    if a.so_listar:
        for r, _ in itens:
            print(" ", r)
        return 0
    return 1 if baixar(itens, a.destino, int(a.reserva_gb * 1e9)) else 0


if __name__ == "__main__":
    sys.exit(main())
