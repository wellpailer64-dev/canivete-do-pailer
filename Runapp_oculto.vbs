' Abre o KANIVETE sem nenhuma janela de CMD (nem piscando). Use este arquivo no atalho/inicialização.
Set sh = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run "cmd /c """ & pasta & "\Runapp.bat""", 0, False
