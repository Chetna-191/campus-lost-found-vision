# ==============================================================================
# scripts/start-ai.ps1 - Start AI Service (FastAPI) and Expose via Cloudflare Tunnel
# ==============================================================================
[CmdletBinding()]
param()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$AiDir = Join-Path $RepoRoot "ai-service"
$VenvScript = Join-Path $AiDir "venv\Scripts\Activate.ps1"
$CloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

# 1. Verify Virtual Environment
if (-not (Test-Path $VenvScript)) {
    Write-Error "Virtual environment activation script not found: $VenvScript"
    exit 1
}

# 2. Verify cloudflared executable
if (-not (Test-Path $CloudflaredPath)) {
    if (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
        $CloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"
    } else {
        $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
        if ($cmd) {
            $CloudflaredPath = $cmd.Source
        } else {
            Write-Error "cloudflared.exe not found at '$CloudflaredPath'. Please install cloudflared or add it to PATH."
            exit 1
        }
    }
}

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "  Campus Lost & Found - AI Microservice & Cloudflare Tunnel Launcher" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# 3. Launch Uvicorn in a new PowerShell window
Write-Host "`n[1/2] Launching Uvicorn ASGI server on http://127.0.0.1:8000 in a new window..." -ForegroundColor Yellow
$uvicornCommand = "cd '$AiDir'; & '$VenvScript'; uvicorn main:app --host 127.0.0.1 --port 8000"
Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $uvicornCommand

# Wait for Uvicorn initialization
Write-Host "Waiting for AI service to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# 4. Start Cloudflare Tunnel and display public URL
Write-Host "`n[2/2] Starting Cloudflare Tunnel for http://127.0.0.1:8000..." -ForegroundColor Yellow
Write-Host "Establishing secure tunnel to trycloudflare.com (Press Ctrl+C to stop)...`n" -ForegroundColor Gray

$tunnelUrlDetected = $false

& $CloudflaredPath tunnel --url http://127.0.0.1:8000 2>&1 | ForEach-Object {
    $line = $_.ToString()
    Write-Host $line

    if (-not $tunnelUrlDetected -and $line -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
        $tunnelUrl = $Matches[1]
        $tunnelUrlDetected = $true
        Set-Clipboard -Value $tunnelUrl -ErrorAction SilentlyContinue

        Write-Host ""
        Write-Host "==========================================================================" -ForegroundColor Green
        Write-Host "  PUBLIC AI SERVICE URL ACTIVE:" -ForegroundColor Green
        Write-Host "  >>> $tunnelUrl <<<" -ForegroundColor Yellow
        Write-Host "  (Copied to clipboard automatically!)" -ForegroundColor Gray
        Write-Host "  Set this URL as AI_SERVICE_URL in your Render Environment." -ForegroundColor Cyan
        Write-Host "==========================================================================" -ForegroundColor Green
        Write-Host ""
    }
}
