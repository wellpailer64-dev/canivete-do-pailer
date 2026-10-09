"""Linha de comando da ponte com o Premiere (o código fica em Functions/ponte_premiere.py, que vai no executável).
    py -3.13 tools/ponte_premiere.py info | efeitos_audio | ler_audio | js "return ..." | importar "projeto.xml"
"""
import os
import runpy
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if __name__ == "__main__":
    runpy.run_module("Functions.ponte_premiere", run_name="__main__")
else:   # scripts antigos: import ponte_premiere as p; p.enviar(...)
    from Functions.ponte_premiere import *  # noqa: F401,F403
