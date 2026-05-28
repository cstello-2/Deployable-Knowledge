$dkPath = ".\Launch-DeployableKnowledge.ps1"
$bonsaiPath = ".\core\Bonsai\scripts\start_llama_server.ps1"


Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File `"$dkPath`""
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File `"$bonsaiPath`"", "--port 11434", "--host 127.0.0.1"