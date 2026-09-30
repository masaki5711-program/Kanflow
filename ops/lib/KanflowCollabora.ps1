# =====================================================================
#  Kanflow ops - Collabora Online monitoring (dot-sourced by KanflowOps.psm1)
#
#  Get-KanflowCollaboraUrl        : COLLABORA_INTERNAL_URL / NEXT_PUBLIC_COLLABORA_URL
#                                   ($null when monitoring is off / not configured)
#  Test-KanflowCollabora          : GET <url>/hosting/discovery (short timeout)
#  Get-KanflowCollaboraContainer  : docker inspect of the kanflow-collabora container
#  Start-KanflowCollaboraContainer: docker start (existing container only - never
#                                   recreate; aliasgroup env needs --force-recreate
#                                   by an operator, see runbook.md section 5)
#
#  docker may be unavailable to the watchdog account (Rancher Desktop runs
#  per user); every docker call has a timeout and failures are reported as
#  State "unknown", never thrown. Keep this file ASCII-only.
# =====================================================================

$script:CollaboraContainerName = "kanflow-collabora"
$script:DockerTimeoutSec = 20

function Get-KanflowCollaboraUrl {
    <# Base URL the server side uses for Collabora, or $null when COLLABORA_MONITOR=off / nothing configured. #>
    $envMap = @{}
    try { $envMap = Read-DotEnv -Path (Get-KanflowPaths).EnvFile } catch { $envMap = @{} }
    if (Test-KanflowSettingOff (Get-KanflowSetting -Name "COLLABORA_MONITOR" -EnvMap $envMap)) { return $null }
    $url = Get-KanflowSetting -Name "COLLABORA_INTERNAL_URL" -EnvMap $envMap
    if (-not $url) { $url = Get-KanflowSetting -Name "NEXT_PUBLIC_COLLABORA_URL" -EnvMap $envMap }
    if (-not $url -or $url -notmatch '^https?://') { return $null }
    return $url.TrimEnd("/")
}

function Test-KanflowCollabora {
    <# Probe the WOPI discovery endpoint. Returns Ok, StatusCode, Url, Error. #>
    param([Parameter(Mandatory = $true)][string]$BaseUrl, [int]$TimeoutSec = 10)
    $url = "$($BaseUrl.TrimEnd('/'))/hosting/discovery"
    $res = [ordered]@{ Ok = $false; StatusCode = 0; Url = $url; Error = $null }
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $TimeoutSec -Method Get -ErrorAction Stop
        $res.StatusCode = [int]$r.StatusCode
        $res.Ok = ($res.StatusCode -eq 200 -and ("" + $r.Content) -match "wopi-discovery")
        if (-not $res.Ok) { $res.Error = "unexpected discovery response" }
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) { $res.StatusCode = [int]$_.Exception.Response.StatusCode }
        $res.Error = $_.Exception.Message
    } catch {
        $res.Error = $_.Exception.Message
    }
    return [pscustomobject]$res
}

function Get-DockerExe {
    $cmd = Get-Command docker.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    # SYSTEM does not get the Rancher Desktop user PATH entry.
    foreach ($p in @(
            (Join-Path $env:ProgramFiles "Rancher Desktop\resources\resources\win32\bin\docker.exe"),
            (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"))) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

function Invoke-ProcessWithTimeout {
    <# Run an exe, capture stdout/stderr, kill it after -TimeoutSec. Never throws. #>
    param([Parameter(Mandatory = $true)][string]$FilePath, [string]$Arguments = "", [int]$TimeoutSec = 20)
    $res = [ordered]@{ ExitCode = -1; TimedOut = $false; Output = ""; Error = "" }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $FilePath
        $psi.Arguments = $Arguments
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        $outTask = $p.StandardOutput.ReadToEndAsync()
        $errTask = $p.StandardError.ReadToEndAsync()
        if (-not $p.WaitForExit($TimeoutSec * 1000)) {
            try { $p.Kill() } catch { Write-Verbose "kill failed" }
            $res.TimedOut = $true
            $res.Error = "timed out after ${TimeoutSec}s"
            return [pscustomobject]$res
        }
        $p.WaitForExit()
        $res.ExitCode = $p.ExitCode
        $res.Output = ("" + $outTask.Result).Trim()
        $res.Error = ("" + $errTask.Result).Trim()
    } catch {
        $res.Error = $_.Exception.Message
    }
    return [pscustomobject]$res
}

function Get-KanflowCollaboraContainer {
    <#
    .SYNOPSIS
    State of the Collabora container: running | exited | created | paused |
    restarting | dead | missing | unknown (docker unavailable). Health is the
    compose healthcheck status (healthy | unhealthy | starting | "").
    #>
    param([string]$Name = $script:CollaboraContainerName)
    $res = [ordered]@{ State = "unknown"; Health = ""; Docker = $null; Detail = $null }
    $docker = Get-DockerExe
    if (-not $docker) { $res.Detail = "docker CLI not found for this account"; return [pscustomobject]$res }
    $res.Docker = $docker
    $fmt = '"{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}"'
    $r = Invoke-ProcessWithTimeout -FilePath $docker -Arguments ("inspect --format {0} {1}" -f $fmt, $Name) -TimeoutSec $script:DockerTimeoutSec
    if ($r.TimedOut) { $res.Detail = "docker inspect timed out (daemon not reachable?)"; return [pscustomobject]$res }
    if ($r.ExitCode -ne 0) {
        if ($r.Error -match "No such object|No such container") { $res.State = "missing"; $res.Detail = "container $Name does not exist" }
        else { $res.Detail = ("docker inspect failed: {0}" -f ($r.Error -split "`n")[0]) }
        return [pscustomobject]$res
    }
    $parts = $r.Output.Trim('"').Split("|")
    $res.State = $parts[0].Trim()
    if ($parts.Count -gt 1) { $res.Health = $parts[1].Trim() }
    return [pscustomobject]$res
}

function Start-KanflowCollaboraContainer {
    <# docker start an EXISTING stopped container. Returns $true when docker accepted it. Never recreates. #>
    param([string]$Name = $script:CollaboraContainerName)
    $docker = Get-DockerExe
    if (-not $docker) { return $false }
    $r = Invoke-ProcessWithTimeout -FilePath $docker -Arguments ("start {0}" -f $Name) -TimeoutSec 60
    return ((-not $r.TimedOut) -and $r.ExitCode -eq 0)
}
