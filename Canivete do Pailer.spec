# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['interface_canivete_pailer.py'],
    pathex=[],
    binaries=[],
    datas=[('splash.png', '.'), ('splash.wav', '.'), ('concluido.wav', '.'), ('icone.ico', '.'), ('ffmpeg.exe', '.'), ('C:\\Users\\Pailer\\AppData\\Local\\Programs\\Python\\Python313\\Lib\\site-packages\\whisper\\assets', 'whisper/assets'), ('gdrive_dumper.py', '.')],
    hiddenimports=['transformers', 'transformers.models.clip', 'PIL', 'onnxruntime', 'gdrive_dumper'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='Canivete do Pailer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icone.ico'],
)
