$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$venvPath = Join-Path $repoRoot "venv"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"
$modelDir = Join-Path $repoRoot "tmp_model"
$onebitDir = Join-Path $repoRoot "core\Bonsai-demo\setup.ps1"

Write-Host "== Deployable Knowledge Launcher ==" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"

if (-not (Test-Path $venvPath)) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    py -3 -m venv $venvPath
}

if (-not (Test-Path $pythonExe)) {
    throw "Virtual environment python not found at $pythonExe"
}

if (-not (Test-Path $pipExe)) {
    throw "Virtual environment pip not found at $pipExe"
}

Write-Host "Ensuring dependencies are installed..." -ForegroundColor Yellow
& $pythonExe -m pip install --upgrade pip | Out-Null
& $pipExe install -r (Join-Path $repoRoot "requirements.txt")

# Attempt one-time model bootstrap if cache is missing/empty.
$modelMissing = $true
if (Test-Path $modelDir) {
    $hasFiles = Get-ChildItem -Path $modelDir -Force -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hasFiles) { $modelMissing = $false }
}

if ($modelMissing) {
    Write-Host "Embedding model cache missing. Attempting download..." -ForegroundColor Yellow
    $env:PYTHONPATH = "."
    $env:TRANSFORMERS_OFFLINE = "0"
    $env:HF_DATASETS_OFFLINE = "0"
    $env:HF_HUB_OFFLINE = "0"
    $bootstrapCmd = "from core.rag.embeddings import load_embedding_model; load_embedding_model(True); print('Embedding model cached.')"
    & $pythonExe -c $bootstrapCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "First download attempt failed (often SSL on a corporate network). Retrying with HF_HUB_DISABLE_SSL_VERIFICATION=1 ..."
        $env:HF_HUB_DISABLE_SSL_VERIFICATION = "1"
        & $pythonExe -c $bootstrapCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Model bootstrap still failed. The app will open, but search/upload need a model in tmp_model (see README)."
        }
    }
}

#Onebit LLM env setup
Write-Host "Setting up Bonsai 1B LLM environment" -ForegroundColor Green
$env:BONSAI_MODEL = "4B" #Model size, options are 1.7B, 4B, 8B
$env:BONSAI_FAMILY = "bonsai" #1 bit vs 1.48 bit. 'bonsai' = 1 bit, 'ternary' = 1.58 bit
& Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& $onebitDir

# Runtime env
$env:PYTHONPATH = "."
$env:CHROMA_TELEMETRY_ENABLED = "false"

Write-Host "Starting app at http://127.0.0.1:8000" -ForegroundColor Green
& $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

