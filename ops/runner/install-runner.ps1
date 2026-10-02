<#
.SYNOPSIS
Installs the GitLab Runner that deploys Kanflow to this production PC
(continuous deployment, docs\operations\cicd.md). Run as Administrator once.

.DESCRIPTION
  1. Downloads gitlab-runner.exe (Windows amd64) into $Dir unless present.
  2. Registers it with the runner authentication token created in GitLab
     (Project > Settings > CI/CD > Runners > New project runner, tag
     "kanflow-prod", "Run untagged jobs" OFF): shell executor, PowerShell.
  3. Lets the runner's account (LocalSystem) use the git repositories it
     touches (git safe.directory: production tree + runner builds).
  4. Installs and starts the Windows service "gitlab-runner".
The token is passed on the command line once and stored only in
$Dir\config.toml (readable by Administrators / SYSTEM). Re-running with an
existing config.toml skips the registration.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\runner\install-runner.ps1 -Token glrt-xxxxxxxx
#>
[CmdletBinding()]
param(
    [string]$Token,
    [string]$Url = "https://gitlab.scm.service.infosys.yamaha.com",
    [string]$Dir = "D:\APP\Kanflow-runner",
    [string]$ProdDir = "D:\APP\Kanflow",
    [string]$DownloadUrl = "https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-windows-amd64.exe"
)

$ErrorActionPreference = "Stop"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Run this script as Administrator." }

$exe = Join-Path $Dir "gitlab-runner.exe"
$config = Join-Path $Dir "config.toml"
New-Item -ItemType Directory -Force $Dir, (Join-Path $Dir "builds"), (Join-Path $Dir "cache") | Out-Null

if (-not (Test-Path $exe)) {
    Write-Host "downloading gitlab-runner from $DownloadUrl"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $exe -UseBasicParsing
}
& $exe --version

if (-not (Test-Path $config)) {
    if (-not $Token) { throw "-Token (glrt-...) is required for the first registration." }
    & $exe register --non-interactive `
        --url $Url `
        --token $Token `
        --executor shell `
        --shell powershell `
        --name "kanflow-prod ($env:COMPUTERNAME)" `
        --builds-dir (Join-Path $Dir "builds") `
        --cache-dir (Join-Path $Dir "cache") `
        --config $config
    if ($LASTEXITCODE -ne 0) { throw "gitlab-runner register failed ($LASTEXITCODE)" }
} else {
    Write-Host "config.toml exists - registration skipped"
}

# One deploy at a time (the job also uses resource_group: production).
$toml = Get-Content $config -Raw
if ($toml -match '(?m)^concurrent\s*=\s*\d+') { $toml = $toml -replace '(?m)^concurrent\s*=\s*\d+', 'concurrent = 1' } else { $toml = "concurrent = 1`r`n" + $toml }
Set-Content -Path $config -Value $toml -Encoding ascii

# LocalSystem runs git on repositories owned by the operator account.
$prod = ($ProdDir -replace '\\', '/')
$builds = ((Join-Path $Dir "builds") -replace '\\', '/') + "/*"
foreach ($safe in @($prod, $builds)) {
    $existing = @(& git config --system --get-all safe.directory 2>$null)
    if ($existing -notcontains $safe) { & git config --system --add safe.directory $safe }
}

$svc = Get-Service -Name "gitlab-runner" -ErrorAction SilentlyContinue
if (-not $svc) {
    & $exe install --working-directory $Dir --config $config
    if ($LASTEXITCODE -ne 0) { throw "gitlab-runner install failed ($LASTEXITCODE)" }
}
& $exe start
Start-Sleep -Seconds 3
& $exe verify --config $config
Get-Service gitlab-runner | Format-Table Name, Status, StartType -AutoSize
Write-Host "Done. In GitLab the runner should show as online (green)."
