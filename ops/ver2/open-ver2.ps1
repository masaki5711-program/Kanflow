# Open Kanflow Ver2 to the company network. Run ONCE in an administrator PowerShell, in the Ver2 instance folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\KanflowV2\ops\ver2\open-ver2.ps1
#
# 1. stops the localhost-only trial process on :3300 (started by hand while checking Ver2)
# 2. adds the inbound firewall rule "Kanflow Ver2 3300" (TCP 3300, Domain profile only)
# 3. installs and starts the Windows Service "KanflowV2" (0.0.0.0:3300). v1's "Kanflow" (3000) is not touched.
# 4. checks http://127.0.0.1:3300/api/health
# Undo: node <instance>\app\setup-windows-service-v2.js --uninstall ; Remove-NetFirewallRule -DisplayName "Kanflow Ver2 3300"
# See docs/operations/mysql-to-pg-cutover.md ("Ver2 を別に立ち上げてから切り離す形").

$ErrorActionPreference = "Stop"
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Run this in an administrator PowerShell."
  exit 1
}
$instance = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$app = Join-Path $instance "app"
if (-not (Test-Path (Join-Path $app ".env"))) { Write-Error "No app\.env in $instance - is this the Ver2 instance folder?"; exit 1 }

Write-Host "[1/4] Stopping the localhost trial process on :3300 (if any)"
Get-NetTCPConnection -LocalPort 3300 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep -Seconds 2

Write-Host "[2/4] Firewall rule 'Kanflow Ver2 3300'"
if (-not (Get-NetFirewallRule -DisplayName "Kanflow Ver2 3300" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Kanflow Ver2 3300" -Direction Inbound -Protocol TCP -LocalPort 3300 -Action Allow -Profile Domain | Out-Null
}

Write-Host "[3/4] Installing / starting the KanflowV2 service"
Push-Location $app
try { node setup-windows-service-v2.js } finally { Pop-Location }

Write-Host "[4/4] Health check"
$ok = $false
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 2
  try {
    $h = Invoke-RestMethod http://127.0.0.1:3300/api/health -TimeoutSec 5
    if ($h.status -eq "ok") { $ok = $true; break }
  } catch {}
}
if ($ok) {
  Write-Host "[OK] Ver2 is up on port 3300 (v1 stays on :3000)."
} else {
  Write-Error "Ver2 did not answer on :3300 - see $instance\ops\web-v2\daemon\*.log"
  exit 1
}
