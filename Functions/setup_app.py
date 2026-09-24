import os

def verificar_e_instalar_modelos():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    modelos_dir = os.path.join(os.path.dirname(base_dir), "modelos_ia")
    whisper_dir = os.path.join(modelos_dir, "whisper")

    modelos = [
        {"path": os.path.join(modelos_dir, "u2net", "u2net.onnx"), "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"},
        {"path": os.path.join(whisper_dir, "small.pt"), "url": "https://openaipublic.azureedge.net/main/whisper/models/9ecf779972d90ba49c06d968637d7202353591b10702d84a75365518b76391d3/small.pt"},
    ]
    
    for modelo in modelos:
        if not os.path.exists(modelo["path"]):
            import requests
            import shutil
            print(f"Baixando modelo: {os.path.basename(modelo['path'])}...")
            os.makedirs(os.path.dirname(modelo["path"]), exist_ok=True)
            response = requests.get(modelo["url"], stream=True)
            with open(modelo["path"], "wb") as f:
                shutil.copyfileobj(response.raw, f)
            print("Download concluído.")
