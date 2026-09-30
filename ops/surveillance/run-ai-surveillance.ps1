<#
.SYNOPSIS
Trigger one Kanflow AI surveillance run: POST /api/surveillance with the
x-surveillance-token header. The token is read from app\.env
(SURVEILLANCE_TOKEN) at runtime and never printed or logged.

.DESCRIPTION
The run loads the local LLM (Ollama) for several minutes. Schedule it
OFF-HOURS (default task time 06:30, before the 08:00 start) so it does not
compete with users' interactive AI requests. Log: ops\logs\surveillance.log

Failures raise the alert "surveillance.failed" (Send-KanflowAlert, throttled).

Exit codes: 0 = HTTP 2xx, 1 = request failed / non-2xx, 2 = configuration error.
#>
[CmdletBinding()]
param(
    [string]$Url = "http://127.0.0.1:3000/api/surveillance",
    [ValidateRange(60, 7200)][int]$TimeoutSec = 900
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force
$paths = Get-KanflowPaths
$LogFile = Join-Path $paths.LogDir "surveillance.log"
function Log([string]$msg, [string]$level = "INFO") { Write-RotatingLog -Path $LogFile -Message $msg -Level $level }
function Alert([string]$msg) {
    Send-KanflowAlert -Key "surveillance.failed" -Severity Error -Source surveillance -Title "AI surveillance run failed" `
        -Message ("{0}`r`nLog: {1}" -f $msg, $LogFile)
}

try {
    $envMap = Read-DotEnv -Path $paths.EnvFile
} catch {
    Log "cannot read $($paths.EnvFile): $($_.Exception.Message)" "ERROR"
    Alert "cannot read app\.env"
    exit 2
}
$token = $null
if ($envMap.ContainsKey("SURVEILLANCE_TOKEN")) { $token = $envMap["SURVEILLANCE_TOKEN"] }
if (-not $token) {
    Log "SURVEILLANCE_TOKEN is not set in app\.env" "ERROR"
    Alert "SURVEILLANCE_TOKEN is not set in app\.env"
    exit 2
}

$started = Get-Date
Log "surveillance run started ($Url, timeout ${TimeoutSec}s)"
try {
    $r = Invoke-WebRequest -Uri $Url -Method Post -UseBasicParsing -TimeoutSec $TimeoutSec `
        -Headers @{ "x-surveillance-token" = $token } -ContentType "application/json" -Body "{}"
    $sec = [int]((Get-Date) - $started).TotalSeconds
    $body = [string]$r.Content
    if ($body.Length -gt 2000) { $body = $body.Substring(0, 2000) + " ...(truncated)" }
    Log ("finished in {0}s: HTTP {1} {2}" -f $sec, [int]$r.StatusCode, $body)
    exit 0
} catch [System.Net.WebException] {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = "request failed after {0}s: HTTP {1} {2}" -f [int]((Get-Date) - $started).TotalSeconds, $code, $_.Exception.Message
    Log $msg "ERROR"
    Alert $msg
    exit 1
} catch {
    $msg = "request failed: {0}" -f $_.Exception.Message
    Log $msg "ERROR"
    Alert $msg
    exit 1
}
