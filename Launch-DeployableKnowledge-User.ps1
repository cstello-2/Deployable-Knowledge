$ErrorActionPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverUrl = "http://127.0.0.1:8000"
$healthUrl = "$serverUrl/healthz"
$serverLauncher = Join-Path $repoRoot "Launch-DeployableKnowledge.ps1"

function Test-ServerReady {
    param([string]$Url)
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500)
    } catch {
        return $false
    }
}

# If already running, just open browser.
if (Test-ServerReady -Url $healthUrl) {
    Start-Process $serverUrl
    exit 0
}

# Start server in minimized PowerShell window.
if (-not (Test-Path $serverLauncher)) {
    [System.Windows.MessageBox]::Show("Launcher not found: $serverLauncher", "Deployable Knowledge")
    exit 1
}

$args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$serverLauncher`""
)

Start-Process powershell -ArgumentList $args -WorkingDirectory $repoRoot -WindowStyle Minimized | Out-Null

# Wait for server startup, then open browser.
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    if (Test-ServerReady -Url $healthUrl) {
        $ready = $true
        break
    }
}

if ($ready) {
    Start-Process $serverUrl
} else {
    [System.Windows.MessageBox]::Show(
        "The app is still starting. Please wait a little longer, then open $serverUrl in your browser.",
        "Deployable Knowledge"
    )
}

