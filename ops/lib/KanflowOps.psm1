# =====================================================================
#  Kanflow ops - shared helpers (Windows PowerShell 5.1 compatible)
#
#  Import-Module "$PSScriptRoot\..\lib\KanflowOps.psm1"
#
#  Secrets policy: values read from app\.env / .db-pw are only ever passed
#  to child processes through a temporary, ACL-restricted PGPASSFILE.
#  Nothing in this module prints or logs a secret.
#  Keep this file ASCII-only.
# =====================================================================

Set-StrictMode -Version 2.0

Import-Module (Join-Path $PSScriptRoot "..\logs\LogRotation.psm1") -Force -Global

$script:KanflowRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

# Split into files, same module scope (they call the helpers below):
#   KanflowAlert.ps1     Send-KanflowAlert / Clear-KanflowAlert / Get-KanflowSetting
#   KanflowCollabora.ps1 Collabora discovery probe + container state
#   KanflowBackup.ps1    backup generation lookup / verification, drill DB guards
. (Join-Path $PSScriptRoot "KanflowAlert.ps1")
. (Join-Path $PSScriptRoot "KanflowCollabora.ps1")
. (Join-Path $PSScriptRoot "KanflowBackup.ps1")

function Get-KanflowRoot { return $script:KanflowRoot }

function Get-KanflowPaths {
    $root = $script:KanflowRoot
    # node-windows wrapper of the web service. New location (outside
    # node_modules): ops\web\daemon. Old installs keep it in
    # app\node_modules\next\dist\bin\daemon until ops\web\migrate-service-wrapper.ps1
    # has run. DaemonDir = whichever currently holds kanflow.xml.
    $webDaemon = Join-Path $root "ops\web\daemon"
    $legacyDaemon = Join-Path $root "app\node_modules\next\dist\bin\daemon"
    $daemon = $webDaemon
    if (-not (Test-Path -LiteralPath (Join-Path $webDaemon "kanflow.xml")) -and (Test-Path -LiteralPath (Join-Path $legacyDaemon "kanflow.xml"))) {
        $daemon = $legacyDaemon
    }
    return [pscustomobject]@{
        Root            = $root
        App             = Join-Path $root "app"
        EnvFile         = Join-Path $root "app\.env"
        Private         = Join-Path $root "app\private"
        DbPwFile        = Join-Path $root ".db-pw"
        LogDir          = Join-Path $root "ops\logs"
        DaemonDir       = $daemon
        WebDaemonDir    = $webDaemon
        LegacyDaemonDir = $legacyDaemon
        WorkerDaemonDir = Join-Path $root "ops\worker\daemon"
    }
}

function Get-KanflowDaemonLogFiles {
    <# All node-windows wrapper logs (web: new + legacy location, worker). #>
    $p = Get-KanflowPaths
    $files = @()
    foreach ($d in @($p.WebDaemonDir, $p.LegacyDaemonDir, $p.WorkerDaemonDir)) {
        $files += @(Get-ChildItem -LiteralPath $d -Filter "*.log" -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    }
    return @($files | Select-Object -Unique)
}

function Get-KanflowEnvValue {
    <# One value from app\.env (or $Default). Never use this to print secrets. #>
    param([Parameter(Mandatory = $true)][string]$Name, [string]$Default = $null)
    try {
        $m = Read-DotEnv -Path (Get-KanflowPaths).EnvFile
        if ($m.ContainsKey($Name) -and "$($m[$Name])".Trim() -ne "") { return "$($m[$Name])".Trim() }
    } catch { Write-Verbose "env read failed: $($_.Exception.Message)" }
    return $Default
}

function Get-TranslationWorkerMode {
    <# AI_TRANSLATION_WORKER from app\.env, normalised like src/lib/translation/worker-mode.ts. #>
    $v = ("" + (Get-KanflowEnvValue -Name "AI_TRANSLATION_WORKER" -Default "")).Trim().ToLowerInvariant()
    if (@("inprocess", "in-process", "true", "1", "on", "yes") -contains $v) { return "inprocess" }
    if (@("off", "false", "0", "no", "disabled", "none") -contains $v) { return "off" }
    return "external"
}

# ---------------------------------------------------------------------
# .env parsing
# ---------------------------------------------------------------------
function Read-DotEnv {
    <#
    .SYNOPSIS
    Parse a dotenv file into a hashtable. Supports KEY=VALUE, "quoted", 'quoted',
    optional leading "export ", and trailing " # comment" on unquoted values.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "env file not found: $Path"
    }
    $result = @{}
    foreach ($raw in [System.IO.File]::ReadAllLines($Path)) {
        $line = $raw.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) { continue }
        if ($line.StartsWith("export ")) { $line = $line.Substring(7).TrimStart() }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { continue }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim()
        if ($val.Length -ge 2 -and (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'")))) {
            $val = $val.Substring(1, $val.Length - 2)
        } else {
            $hash = $val.IndexOf(" #")
            if ($hash -ge 0) { $val = $val.Substring(0, $hash).TrimEnd() }
        }
        $result[$key] = $val
    }
    return $result
}

function Get-KanflowDbConfig {
    <#
    .SYNOPSIS
    Resolve DB connection settings from app\.env (DATABASE_HOST/PORT/USER/
    PASSWORD/NAME, falling back to DATABASE_URL). PostgreSQL (Kanflow v2).
    With -UseRootCredential the user becomes the PostgreSQL superuser
    (DATABASE_ADMIN_USER in app\.env, default "postgres") and the password is
    read from D:\APP\Kanflow\.db-pw. Returns an object whose Password must
    never be printed.
    #>
    [CmdletBinding()]
    param(
        [string]$EnvFile = (Get-KanflowPaths).EnvFile,
        [switch]$UseRootCredential
    )

    $envMap = Read-DotEnv -Path $EnvFile
    $cfg = [ordered]@{ Host = $null; Port = 5432; User = $null; Password = $null; Database = $null }

    if ($envMap.ContainsKey("DATABASE_URL") -and $envMap["DATABASE_URL"]) {
        try {
            $uri = [System.Uri]$envMap["DATABASE_URL"]
            $cfg.Host = $uri.Host
            if ($uri.Port -gt 0) { $cfg.Port = $uri.Port }
            $cfg.Database = $uri.AbsolutePath.TrimStart("/").Split("?")[0]
            $info = $uri.UserInfo
            $colon = $info.IndexOf(":")
            if ($colon -ge 0) {
                $cfg.User = [System.Uri]::UnescapeDataString($info.Substring(0, $colon))
                $cfg.Password = [System.Uri]::UnescapeDataString($info.Substring($colon + 1))
            } elseif ($info) {
                $cfg.User = [System.Uri]::UnescapeDataString($info)
            }
        } catch {
            Write-Warning "DATABASE_URL in $EnvFile could not be parsed; relying on DATABASE_* variables."
        }
    }
    # Discrete variables are what the running app actually uses (src/lib/prisma.ts).
    if ($envMap["DATABASE_HOST"]) { $cfg.Host = $envMap["DATABASE_HOST"] }
    if ($envMap["DATABASE_PORT"]) { $cfg.Port = [int]$envMap["DATABASE_PORT"] }
    if ($envMap["DATABASE_USER"]) { $cfg.User = $envMap["DATABASE_USER"] }
    if ($envMap["DATABASE_PASSWORD"]) { $cfg.Password = $envMap["DATABASE_PASSWORD"] }
    if ($envMap["DATABASE_NAME"]) { $cfg.Database = $envMap["DATABASE_NAME"] }
    if (-not $cfg.Host) { $cfg.Host = "127.0.0.1" }
    if ($cfg.Host -eq "localhost") { $cfg.Host = "127.0.0.1" }

    if ($UseRootCredential) {
        $pwFile = (Get-KanflowPaths).DbPwFile
        if (-not (Test-Path -LiteralPath $pwFile)) { throw "admin password file not found: $pwFile" }
        $cfg.User = $(if ($envMap["DATABASE_ADMIN_USER"]) { $envMap["DATABASE_ADMIN_USER"] } else { "postgres" })
        $cfg.Password = ([System.IO.File]::ReadAllText($pwFile)).Trim()
    }

    if (-not $cfg.User) { throw "database user not found in $EnvFile" }
    if (-not $cfg.Database) { throw "database name not found in $EnvFile" }
    if ($cfg.Database -notmatch '^[A-Za-z0-9_]+$') { throw "unexpected characters in database name" }
    if ($cfg.User -notmatch '^[A-Za-z0-9_.@-]+$') { throw "unexpected characters in database user" }
    return [pscustomobject]$cfg
}

# ---------------------------------------------------------------------
# PostgreSQL client helpers (pg_dump.exe / psql.exe)
# ---------------------------------------------------------------------
function Get-PgBinDir {
    <#
    .SYNOPSIS
    Locate the PostgreSQL client bin directory (pg_dump.exe, psql.exe):
    $env:KANFLOW_PG_BIN, then the newest C:\Program Files\PostgreSQL\<major>\bin.
    The client major version must be >= the server's (16).
    #>
    [CmdletBinding()]
    param()

    $candidates = @()
    if ($env:KANFLOW_PG_BIN) { $candidates += $env:KANFLOW_PG_BIN }
    $base = "C:\Program Files\PostgreSQL"
    if (Test-Path -LiteralPath $base) {
        $candidates += @(Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '^\d+$' } | Sort-Object { [int]$_.Name } -Descending |
                ForEach-Object { Join-Path $_.FullName "bin" })
    }
    foreach ($dir in $candidates) {
        if ($dir -and (Test-Path -LiteralPath (Join-Path $dir "pg_dump.exe")) -and (Test-Path -LiteralPath (Join-Path $dir "psql.exe"))) { return $dir }
    }
    throw "pg_dump.exe / psql.exe not found (set KANFLOW_PG_BIN to the PostgreSQL client bin directory)"
}

function New-PgPassFile {
    <#
    .SYNOPSIS
    Write a libpq password file (host:port:*:user:password) with the
    credentials into %TEMP% and lock its ACL to the current user, SYSTEM and
    Administrators. Pass it to the client via PGPASSFILE (Invoke-PgClient).
    The password never appears on a command line. Caller must delete it.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$DbConfig)

    $path = Join-Path ([System.IO.Path]::GetTempPath()) ("kanflow-pgpass-{0}.conf" -f ([guid]::NewGuid().ToString("N")))
    # Empty file first; the password is written only after the ACL is locked.
    [System.IO.File]::WriteAllText($path, "", (New-Object System.Text.UTF8Encoding($false)))
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $path /inheritance:r /grant:r "${me}:(F)" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        throw "could not restrict the ACL of the temporary password file (icacls exit $LASTEXITCODE); nothing written"
    }

    $esc = { param([string]$v) $v.Replace('\', '\\').Replace(':', '\:') }
    $line = "{0}:{1}:*:{2}:{3}" -f (& $esc $DbConfig.Host), $DbConfig.Port, (& $esc $DbConfig.User), (& $esc ([string]$DbConfig.Password))
    [System.IO.File]::WriteAllText($path, $line + "`n", (New-Object System.Text.UTF8Encoding($false)))
    return $path
}

function Get-PgTimeoutSec {
    <# Bound of one pg_dump / psql run: KANFLOW_PG_TIMEOUT_SEC (environment or app\.env), default 7200 s. #>
    $raw = $null
    try { $raw = Get-KanflowSetting -Name "KANFLOW_PG_TIMEOUT_SEC" } catch { $raw = $null }
    $n = 0
    if ($raw -and [int]::TryParse([string]$raw, [ref]$n) -and $n -gt 0) { return $n }
    return 7200
}

function Get-PgConnectionArgs {
    <# -h/-p/-U arguments (no password: that comes from the PGPASSFILE). #>
    param([Parameter(Mandatory = $true)]$DbConfig)
    return ("-h {0} -p {1} -U `"{2}`" -w" -f $DbConfig.Host, $DbConfig.Port, $DbConfig.User)
}

function Invoke-PgClient {
    <#
    .SYNOPSIS
    Run a PostgreSQL client (psql.exe / pg_dump.exe) with PGPASSFILE pointing
    at $PassFile for this child only, and a connect timeout. Returns the exit code.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [Parameter(Mandatory = $true)][string]$PassFile,
        [string]$StdinFile,
        [string]$StdoutFile,
        [string]$StderrFile,
        # Whole-run bound (pg_dump / import can take long; a hung client must not hang the task).
        [int]$TimeoutSec = (Get-PgTimeoutSec)
    )
    $saved = @{ PGPASSFILE = $env:PGPASSFILE; PGCONNECT_TIMEOUT = $env:PGCONNECT_TIMEOUT; PGCLIENTENCODING = $env:PGCLIENTENCODING }
    try {
        $env:PGPASSFILE = $PassFile
        $env:PGCONNECT_TIMEOUT = "15"
        $env:PGCLIENTENCODING = "UTF8"
        return (Invoke-NativeProcess -FilePath $FilePath -Arguments $Arguments -StdinFile $StdinFile -StdoutFile $StdoutFile -StderrFile $StderrFile -TimeoutSec $TimeoutSec)
    } finally {
        foreach ($k in $saved.Keys) {
            if ($null -eq $saved[$k]) { Remove-Item -LiteralPath "Env:$k" -ErrorAction SilentlyContinue } else { Set-Item -LiteralPath "Env:$k" -Value $saved[$k] }
        }
    }
}

function Invoke-NativeProcess {
    <#
    .SYNOPSIS
    Run an executable with raw (pre-quoted) argument string; optional stdin/stdout
    redirection to files (byte-exact, no PowerShell re-encoding). Returns exit code.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string]$Arguments,
        [string]$StdinFile,
        [string]$StdoutFile,
        [string]$StderrFile,
        # 0 = wait forever (previous behaviour). Otherwise the process is killed after
        # this many seconds, a warning is written (and appended to StderrFile) and 124 returned.
        [int]$TimeoutSec = 0
    )
    $p = @{
        FilePath     = $FilePath
        ArgumentList = $Arguments
        NoNewWindow  = $true
        PassThru     = $true
    }
    if ($StdinFile) { $p.RedirectStandardInput = $StdinFile }
    if ($StdoutFile) { $p.RedirectStandardOutput = $StdoutFile }
    if ($StderrFile) { $p.RedirectStandardError = $StderrFile }
    if ($TimeoutSec -le 0) { $p.Wait = $true }
    $proc = Start-Process @p
    if ($TimeoutSec -le 0) { return $proc.ExitCode }
    $null = $proc.Handle   # cache the handle so ExitCode is readable after the wait
    if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
        try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop } catch { Write-Verbose "kill failed: $($_.Exception.Message)" }
        [void]$proc.WaitForExit(10000)
        $msg = "TIMEOUT: {0} killed after {1}s" -f (Split-Path -Leaf $FilePath), $TimeoutSec
        Write-Warning $msg
        if ($StderrFile) { try { Add-Content -LiteralPath $StderrFile -Value $msg -Encoding UTF8 } catch { Write-Verbose "stderr append failed" } }
        return 124
    }
    $proc.WaitForExit()
    return $proc.ExitCode
}

function Invoke-PgQuery {
    <#
    .SYNOPSIS
    Run ONE SQL statement with psql (unaligned, tuples only, tab-separated,
    ON_ERROR_STOP) and return the output lines. Connects to -Database, or to
    the maintenance database "postgres" when omitted (DROP / CREATE DATABASE).
    Throws on non-zero exit.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$PgBinDir,
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$PassFile,
        [Parameter(Mandatory = $true)][string]$Sql,
        [string]$Database = "postgres"
    )
    if ($Database -notmatch '^[A-Za-z0-9_]+$') { throw "invalid database name" }
    $out = [System.IO.Path]::GetTempFileName()
    $err = [System.IO.Path]::GetTempFileName()
    $sqlFile = [System.IO.Path]::GetTempFileName()
    try {
        # The statement goes through a file: no quoting of SQL on the command line.
        [System.IO.File]::WriteAllText($sqlFile, $Sql, (New-Object System.Text.UTF8Encoding($false)))
        $argString = "{0} -d {1} -X -q -A -t -F `"`t`" -v ON_ERROR_STOP=1 -f `"{2}`"" -f (Get-PgConnectionArgs $DbConfig), $Database, $sqlFile
        $code = Invoke-PgClient -FilePath (Join-Path $PgBinDir "psql.exe") -Arguments $argString -PassFile $PassFile -StdoutFile $out -StderrFile $err -TimeoutSec 600
        if ($code -ne 0) {
            $msg = ([System.IO.File]::ReadAllText($err)).Trim()
            throw "psql exited with $code : $msg"
        }
        return @([System.IO.File]::ReadAllLines($out, [System.Text.Encoding]::UTF8) | Where-Object { $_ -ne "" })
    } finally {
        Remove-Item -LiteralPath $out, $err, $sqlFile -Force -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------
# gzip + hashing
# ---------------------------------------------------------------------
function Compress-GzipFile {
    param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Destination)
    $in = [System.IO.File]::OpenRead($Source)
    try {
        $out = [System.IO.File]::Create($Destination)
        try {
            $gz = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionLevel]::Optimal)
            try { $in.CopyTo($gz) } finally { $gz.Dispose() }
        } finally { $out.Dispose() }
    } finally { $in.Dispose() }
}

function Expand-GzipFile {
    param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Destination)
    $in = [System.IO.File]::OpenRead($Source)
    try {
        $gz = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
        try {
            $out = [System.IO.File]::Create($Destination)
            try { $gz.CopyTo($out) } finally { $out.Dispose() }
        } finally { $gz.Dispose() }
    } finally { $in.Dispose() }
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

# ---------------------------------------------------------------------
# Robocopy (exit codes 0-7 = success, >= 8 = failure)
# ---------------------------------------------------------------------
function Invoke-Robocopy {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$Files = @(),
        [string[]]$Options = @("/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:5", "/NP", "/NFL", "/NDL"),
        [string]$LogFile
    )
    $argList = @("`"$Source`"", "`"$Destination`"") + ($Files | ForEach-Object { "`"$_`"" }) + $Options
    if ($LogFile) { $argList += "/UNILOG+:`"$LogFile`"" }
    $code = Invoke-NativeProcess -FilePath "robocopy.exe" -Arguments ($argList -join " ")
    return [pscustomobject]@{ ExitCode = $code; Success = ($code -lt 8) }
}

# ---------------------------------------------------------------------
# Process / port / health
# ---------------------------------------------------------------------
function Get-PortListenerPids {
    <# Return the PIDs LISTENING on the given local TCP port (IPv4/IPv6). #>
    param([Parameter(Mandatory = $true)][int]$Port)
    $pids = @()
    foreach ($line in (& netstat.exe -ano -p tcp) + (& netstat.exe -ano -p tcpv6)) {
        $f = ($line.Trim() -split '\s+')
        if ($f.Count -lt 5) { continue }
        if ($f[3] -ne "LISTENING") { continue }
        if ($f[1] -match (":{0}$" -f $Port)) { $pids += [int]$f[4] }
    }
    return @($pids | Where-Object { $_ -gt 0 } | Select-Object -Unique)
}

function Get-ServicePid {
    <# PID of a service's host process via "sc.exe queryex" (no WMI). 0 when not running. #>
    param([Parameter(Mandatory = $true)][string]$ServiceName)
    foreach ($line in (& sc.exe queryex $ServiceName)) {
        if ($line -match '^\s*PID\s*:\s*(\d+)') { return [int]$Matches[1] }
    }
    return 0
}

function Test-KanflowHealth {
    <#
    .SYNOPSIS
    Probe the health endpoint. Returns an object: Ok, StatusCode, Db, Ollama, Error.
    #>
    param(
        [string]$Url = "http://127.0.0.1:3000/api/health",
        [int]$TimeoutSec = 10
    )
    # Worker / Pending / OldestPendingAgeSec / BuildId are informational
    # (present from the build that added them; $null on older builds).
    $res = [ordered]@{ Ok = $false; StatusCode = 0; Db = $null; Ollama = $null; Collabora = $null; Worker = $null; WorkerAgeSec = $null; WorkerExpected = $null; Pending = $null; OldestPendingAgeSec = $null; BuildId = $null; Error = $null }
    $apply = {
        param($j)
        $res.Db = $j.db; $res.Ollama = $j.ollama
        $names = @($j.PSObject.Properties.Name)
        if ($names -contains "buildId") { $res.BuildId = $j.buildId }
        if ($names -contains "collabora") { $res.Collabora = $j.collabora }
        if ($names -contains "worker" -and $j.worker) {
            $res.Worker = $j.worker.status; $res.WorkerAgeSec = $j.worker.heartbeatAgeSec; $res.WorkerExpected = $j.worker.expected
        }
        if ($names -contains "translation" -and $j.translation) {
            $res.Pending = $j.translation.pending; $res.OldestPendingAgeSec = $j.translation.oldestPendingAgeSec
        }
    }
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -Method Get -ErrorAction Stop
        $res.StatusCode = [int]$r.StatusCode
        try {
            & $apply ($r.Content | ConvertFrom-Json)
        } catch { $res.Error = "non-JSON response" }
        $res.Ok = ($res.StatusCode -eq 200 -and $res.Db -eq "ok")
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($resp) {
            $res.StatusCode = [int]$resp.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
                & $apply ($reader.ReadToEnd() | ConvertFrom-Json)
            } catch { Write-Verbose "could not parse error body" }
        }
        $res.Error = $_.Exception.Message
    } catch {
        $res.Error = $_.Exception.Message
    }
    return [pscustomobject]$res
}

function Wait-Condition {
    param([Parameter(Mandatory = $true)][scriptblock]$Condition, [int]$TimeoutSec = 60, [int]$IntervalSec = 2)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (& $Condition) { return $true }
        Start-Sleep -Seconds $IntervalSec
    }
    return [bool](& $Condition)
}

function Stop-KanflowService {
    <#
    .SYNOPSIS
    Stop the node-windows "kanflow.exe" service and make sure nothing is left
    LISTENING on the port. Kills the wrapper if the service does not stop in
    45s, then kills any orphan node.exe listener (the known grandchild gotcha
    that otherwise causes an EADDRINUSE crash loop). Requires admin rights.
    Returns $true when the service is stopped and the port is free.
    #>
    [CmdletBinding()]
    param(
        [string]$ServiceName = "kanflow.exe",
        [int]$Port = 3000,
        [Parameter(Mandatory = $true)][string]$LogFile
    )
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) { Write-RotatingLog -Path $LogFile -Message "service '$ServiceName' not found" -Level ERROR; return $false }

    if ($svc.Status -ne "Stopped") {
        try { Stop-Service -Name $ServiceName -Force -NoWait -ErrorAction Stop } catch { Write-RotatingLog -Path $LogFile -Message "Stop-Service: $($_.Exception.Message)" -Level WARN }
        $stopped = Wait-Condition -TimeoutSec 45 -Condition { (Get-Service -Name $ServiceName).Status -eq "Stopped" }
        if (-not $stopped) {
            $svcPid = Get-ServicePid -ServiceName $ServiceName
            if ($svcPid -gt 0) {
                Write-RotatingLog -Path $LogFile -Message ("service did not stop in 45s; killing wrapper PID {0}" -f $svcPid) -Level WARN
                Stop-Process -Id $svcPid -Force -ErrorAction SilentlyContinue
            }
            [void](Wait-Condition -TimeoutSec 15 -Condition { (Get-Service -Name $ServiceName).Status -eq "Stopped" })
        }
    }

    $portFree = Wait-Condition -TimeoutSec 10 -Condition { @(Get-PortListenerPids -Port $Port).Count -eq 0 }
    if (-not $portFree) {
        foreach ($procId in @(Get-PortListenerPids -Port $Port)) {
            $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
            $name = if ($p) { $p.ProcessName } else { "?" }
            if ($name -ieq "node") {
                Write-RotatingLog -Path $LogFile -Message ("killing orphan listener PID {0} ({1}) on port {2}" -f $procId, $name, $Port) -Level WARN
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            } else {
                Write-RotatingLog -Path $LogFile -Message ("port {0} held by non-node process PID {1} ({2}); not killing" -f $Port, $procId, $name) -Level ERROR
            }
        }
        $portFree = Wait-Condition -TimeoutSec 15 -Condition { @(Get-PortListenerPids -Port $Port).Count -eq 0 }
    }
    $isStopped = (Get-Service -Name $ServiceName).Status -eq "Stopped"
    if (-not $portFree) { Write-RotatingLog -Path $LogFile -Message "port $Port still in use after stop" -Level ERROR }
    return ($isStopped -and $portFree)
}

function Start-KanflowService {
    <#
    .SYNOPSIS
    Start the service and wait for a listener whose PID is NOT in -PreviousPids,
    then for a healthy /api/health. Returns $true on verified start.
    #>
    [CmdletBinding()]
    param(
        [string]$ServiceName = "kanflow.exe",
        [int]$Port = 3000,
        [string]$HealthUrl = "http://127.0.0.1:3000/api/health",
        [int[]]$PreviousPids = @(),
        [int]$StartTimeoutSec = 180,
        [Parameter(Mandatory = $true)][string]$LogFile
    )
    try { Start-Service -Name $ServiceName -ErrorAction Stop } catch {
        Write-RotatingLog -Path $LogFile -Message "Start-Service: $($_.Exception.Message)" -Level ERROR
        return $false
    }
    $listening = Wait-Condition -TimeoutSec $StartTimeoutSec -IntervalSec 3 -Condition {
        @(Get-PortListenerPids -Port $Port | Where-Object { $PreviousPids -notcontains $_ }).Count -gt 0
    }
    $newPids = @(Get-PortListenerPids -Port $Port)
    if (-not $listening) {
        Write-RotatingLog -Path $LogFile -Message ("no NEW listener on port {0} within {1}s (listeners=[{2}])" -f $Port, $StartTimeoutSec, ($newPids -join ",")) -Level ERROR
        return $false
    }
    $healthy = Wait-Condition -TimeoutSec 90 -IntervalSec 5 -Condition { (Test-KanflowHealth -Url $HealthUrl).Ok }
    $h = Test-KanflowHealth -Url $HealthUrl
    if ($healthy) {
        Write-RotatingLog -Path $LogFile -Message ("service up: listeners [{0}] -> [{1}], db={2}, ollama={3}" -f ($PreviousPids -join ","), ($newPids -join ","), $h.Db, $h.Ollama)
        return $true
    }
    Write-RotatingLog -Path $LogFile -Message ("listening (PID [{0}]) but health failing: http={1} db={2} err={3}" -f ($newPids -join ","), $h.StatusCode, $h.Db, $h.Error) -Level ERROR
    return $false
}

function Restart-KanflowService {
    <#
    .SYNOPSIS
    Robust restart: Stop-KanflowService (incl. orphan listener kill) then
    Start-KanflowService (new PID + health verified). Requires admin rights.
    #>
    [CmdletBinding()]
    param(
        [string]$ServiceName = "kanflow.exe",
        [int]$Port = 3000,
        [string]$HealthUrl = "http://127.0.0.1:3000/api/health",
        [Parameter(Mandatory = $true)][string]$LogFile,
        [int]$StartTimeoutSec = 180
    )
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) { Write-RotatingLog -Path $LogFile -Message "service '$ServiceName' not found" -Level ERROR; return $false }
    $oldPids = @(Get-PortListenerPids -Port $Port)
    Write-RotatingLog -Path $LogFile -Message ("restart begin: service={0} status={1} listeners=[{2}]" -f $ServiceName, $svc.Status, ($oldPids -join ","))
    if (-not (Stop-KanflowService -ServiceName $ServiceName -Port $Port -LogFile $LogFile)) {
        Write-RotatingLog -Path $LogFile -Message "stop was not clean; attempting start anyway" -Level WARN
    }
    return (Start-KanflowService -ServiceName $ServiceName -Port $Port -HealthUrl $HealthUrl -PreviousPids $oldPids -StartTimeoutSec $StartTimeoutSec -LogFile $LogFile)
}

# ---------------------------------------------------------------------
# Standalone worker (service kanflowworker.exe, heartbeat file)
# ---------------------------------------------------------------------
function Get-WorkerHeartbeatFile {
    <# Same resolution as src/lib/ai-gate/worker-heartbeat.ts: WORKER_HEARTBEAT_FILE, else <LOG_DIR>\worker-heartbeat.json, LOG_DIR default app\logs. #>
    $explicit = Get-KanflowEnvValue -Name "WORKER_HEARTBEAT_FILE"
    if ($explicit) { return [System.IO.Path]::GetFullPath($explicit) }
    $app = (Get-KanflowPaths).App
    $logDir = Get-KanflowEnvValue -Name "LOG_DIR"
    if ($logDir) {
        if (-not [System.IO.Path]::IsPathRooted($logDir)) { $logDir = Join-Path $app $logDir }
    } else { $logDir = Join-Path $app "logs" }
    return (Join-Path $logDir "worker-heartbeat.json")
}

function Get-WorkerHeartbeat {
    <#
    .SYNOPSIS
    Read the worker heartbeat file directly (works while the web app is down).
    Returns Status (ok|stale|absent), AgeSec, Pid, WebBuildId, BusinessHours.
    Stale = older than 3 x intervalMs (default 60 s) or -StaleSec when larger.
    #>
    param([int]$StaleSec = 0)
    $file = Get-WorkerHeartbeatFile
    $res = [ordered]@{ Status = "absent"; AgeSec = $null; Pid = $null; WebBuildId = $null; BusinessHours = $null; File = $file }
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return [pscustomobject]$res }
    $written = $null; $intervalMs = 60000
    try {
        $j = [System.IO.File]::ReadAllText($file) | ConvertFrom-Json
        $written = [datetime]::Parse($j.writtenAt, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
        if ($j.intervalMs -gt 0) { $intervalMs = [int]$j.intervalMs }
        $res.Pid = $j.pid; $res.WebBuildId = $j.webBuildId; $res.BusinessHours = $j.businessHours
    } catch {
        $written = (Get-Item -LiteralPath $file).LastWriteTimeUtc
    }
    $age = [int]([datetime]::UtcNow - $written).TotalSeconds
    if ($age -lt 0) { $age = 0 }
    $limit = [Math]::Max([int](3 * $intervalMs / 1000), $StaleSec)
    $res.AgeSec = $age
    $res.Status = if ($age -le $limit) { "ok" } else { "stale" }
    return [pscustomobject]$res
}

function Restart-KanflowWorker {
    <#
    .SYNOPSIS
    Stop (graceful IPC stop, kill the wrapper after 60 s) and start the worker
    service, then wait for a FRESH heartbeat (written right after it takes its
    single-instance lock). Requires admin rights. Returns $true on verified start.
    #>
    [CmdletBinding()]
    param(
        [string]$ServiceName = "kanflowworker.exe",
        [int]$StartTimeoutSec = 120,
        [Parameter(Mandatory = $true)][string]$LogFile
    )
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) { Write-RotatingLog -Path $LogFile -Message "worker service '$ServiceName' not installed" -Level WARN; return $false }
    if ($svc.Status -ne "Stopped") {
        try { Stop-Service -Name $ServiceName -Force -NoWait -ErrorAction Stop } catch { Write-RotatingLog -Path $LogFile -Message "Stop-Service ${ServiceName}: $($_.Exception.Message)" -Level WARN }
        if (-not (Wait-Condition -TimeoutSec 60 -Condition { (Get-Service -Name $ServiceName).Status -eq "Stopped" })) {
            $svcPid = Get-ServicePid -ServiceName $ServiceName
            if ($svcPid -gt 0) {
                Write-RotatingLog -Path $LogFile -Message ("worker did not stop in 60s; killing wrapper PID {0}" -f $svcPid) -Level WARN
                Stop-Process -Id $svcPid -Force -ErrorAction SilentlyContinue
            }
            [void](Wait-Condition -TimeoutSec 15 -Condition { (Get-Service -Name $ServiceName).Status -eq "Stopped" })
        }
    }
    $startedAt = [datetime]::UtcNow
    try { Start-Service -Name $ServiceName -ErrorAction Stop } catch {
        Write-RotatingLog -Path $LogFile -Message "Start-Service ${ServiceName}: $($_.Exception.Message)" -Level ERROR
        return $false
    }
    $fresh = Wait-Condition -TimeoutSec $StartTimeoutSec -IntervalSec 3 -Condition {
        $hb = Get-WorkerHeartbeat
        $hb.Status -eq "ok" -and $hb.AgeSec -le ([int]([datetime]::UtcNow - $startedAt).TotalSeconds + 1)
    }
    $hb = Get-WorkerHeartbeat
    if ($fresh) {
        Write-RotatingLog -Path $LogFile -Message ("worker up: pid={0} heartbeat age={1}s webBuildId={2}" -f $hb.Pid, $hb.AgeSec, $hb.WebBuildId)
        return $true
    }
    Write-RotatingLog -Path $LogFile -Message ("worker started but no fresh heartbeat within {0}s (status={1}, age={2}); see app\logs\worker-*.log and {3}" -f $StartTimeoutSec, $hb.Status, $hb.AgeSec, (Get-KanflowPaths).WorkerDaemonDir) -Level ERROR
    return $false
}

# ---------------------------------------------------------------------
# Database dump / inspection (shared by backup + restore)
# ---------------------------------------------------------------------
function Export-KanflowDatabase {
    <#
    .SYNOPSIS
    pg_dump one database as plain SQL (one consistent snapshot; no owner /
    privileges; no CREATE DATABASE / \connect so it can be restored under
    another name) into <OutFile> (.sql.gz). The TimescaleDB catalog schemas
    are excluded (the platform image may pre-install the extension; Kanflow
    has no hypertables). Throws on failure or incomplete dump.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$PgBinDir,
        [Parameter(Mandatory = $true)][string]$OutFile
    )
    if (-not $OutFile.EndsWith(".sql.gz")) { throw "OutFile must end with .sql.gz" }
    $sqlFile = $OutFile.Substring(0, $OutFile.Length - 3)
    $errFile = "$sqlFile.err.txt"
    $pass = New-PgPassFile -DbConfig $DbConfig
    try {
        $argList = @(
            (Get-PgConnectionArgs $DbConfig),
            "--format=plain", "--no-owner", "--no-privileges", "--encoding=UTF8",
            "--exclude-schema=`"_timescaledb*`"", "--exclude-schema=`"timescaledb_*`"",
            "--file=`"$sqlFile`"",
            $DbConfig.Database
        ) -join " "
        $code = Invoke-PgClient -FilePath (Join-Path $PgBinDir "pg_dump.exe") -Arguments $argList -PassFile $pass -StderrFile $errFile
    } finally {
        Remove-Item -LiteralPath $pass -Force -ErrorAction SilentlyContinue
    }
    $errText = ""
    if (Test-Path -LiteralPath $errFile) {
        $errText = ([System.IO.File]::ReadAllText($errFile)).Trim()
        Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
    }
    if ($code -ne 0) {
        Remove-Item -LiteralPath $sqlFile -Force -ErrorAction SilentlyContinue
        throw "pg_dump exited with code $code : $errText"
    }
    $tail = @(Get-Content -LiteralPath $sqlFile -Tail 8 -Encoding UTF8)
    if (@($tail -match "^-- PostgreSQL database dump complete").Count -eq 0) { throw "dump file is incomplete (no 'PostgreSQL database dump complete' trailer)" }
    # The platform image pre-installs TimescaleDB; Kanflow does not use it. Without these
    # lines the dump restores into any PostgreSQL 16 (with or without TimescaleDB).
    [void](Remove-KanflowDumpExtensionLines -Path $sqlFile)

    $rawBytes = (Get-Item -LiteralPath $sqlFile).Length
    Compress-GzipFile -Source $sqlFile -Destination $OutFile
    Remove-Item -LiteralPath $sqlFile -Force
    return [pscustomobject]@{
        File     = (Split-Path -Leaf $OutFile)
        RawBytes = $rawBytes
        GzBytes  = (Get-Item -LiteralPath $OutFile).Length
        Sha256   = (Get-FileSha256 -Path $OutFile)
        Warnings = $errText
    }
}

function Remove-KanflowDumpExtensionLines {
    <#
    .SYNOPSIS
    Rewrite a plain pg_dump file without the statements that need TimescaleDB
    ("CREATE EXTENSION ... timescaledb", "COMMENT ON EXTENSION timescaledb").
    Line-based (COPY data never starts a line with these keywords: newlines in
    values are escaped). Returns the number of lines removed.
    #>
    param([Parameter(Mandatory = $true)][string]$Path)
    $pattern = '^(CREATE EXTENSION (IF NOT EXISTS )?timescaledb\b|COMMENT ON EXTENSION timescaledb\b)'
    $tmp = "$Path.filtered"
    $enc = New-Object System.Text.UTF8Encoding($false)
    $removed = 0
    $reader = New-Object System.IO.StreamReader($Path, $enc)
    try {
        $writer = New-Object System.IO.StreamWriter($tmp, $false, $enc)
        try {
            $writer.NewLine = "`n"
            while ($null -ne ($line = $reader.ReadLine())) {
                if ($line -match $pattern) { $removed++; continue }
                $writer.WriteLine($line)
            }
        } finally { $writer.Dispose() }
    } finally { $reader.Dispose() }
    Move-Item -LiteralPath $tmp -Destination $Path -Force
    return $removed
}

function Get-KanflowDbLocale {
    <#
    .SYNOPSIS
    Locale settings of a database (default: the configured one) or, with
    -ServerDefault, of the server's template1 (always valid on that server).
    Returns Provider ("icu"|"libc"), Collate, Ctype, IcuLocale.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$PgBinDir,
        [switch]$ServerDefault
    )
    $pass = New-PgPassFile -DbConfig $DbConfig
    try {
        $where = $(if ($ServerDefault) { "datname = 'template1'" } else { "datname = current_database()" })
        $db = $(if ($ServerDefault) { "postgres" } else { $DbConfig.Database })
        $sql = "SELECT CASE datlocprovider WHEN 'i' THEN 'icu' ELSE 'libc' END, datcollate, datctype, COALESCE(daticulocale, '') FROM pg_database WHERE $where"
        $line = @(Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql $sql -Database $db) | Select-Object -First 1
        $parts = @($line -split "`t")
        if ($parts.Count -lt 4) { throw "could not read the database locale" }
        return [pscustomobject]@{ Provider = $parts[0]; Collate = $parts[1]; Ctype = $parts[2]; IcuLocale = $parts[3] }
    } finally {
        Remove-Item -LiteralPath $pass -Force -ErrorAction SilentlyContinue
    }
}

function Get-KanflowCreateDatabaseSql {
    <#
    .SYNOPSIS
    CREATE DATABASE statement (from template0, UTF-8) with the given locale
    (from Get-KanflowDbLocale or a backup manifest's dbLocale). Every value is
    validated (no quotes) before it is put into the statement.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)]$Locale,
        [string]$Owner
    )
    if ($Name -notmatch '^[A-Za-z0-9_]{1,63}$') { throw "invalid database name" }
    if ($Owner -and $Owner -notmatch '^[A-Za-z0-9_]{1,63}$') { throw "invalid owner role name" }
    $ok = '^[A-Za-z0-9 _.,@()-]{1,100}$'
    foreach ($k in @("Collate", "Ctype")) {
        if ([string]$Locale.$k -notmatch $ok) { throw "invalid locale value for ${k}: '$($Locale.$k)'" }
    }
    $sql = "CREATE DATABASE `"$Name`""
    if ($Owner) { $sql += " OWNER `"$Owner`"" }
    $sql += " TEMPLATE template0 ENCODING 'UTF8'"
    if ($Locale.Provider -eq "icu") {
        if ([string]$Locale.IcuLocale -notmatch $ok) { throw "invalid ICU locale: '$($Locale.IcuLocale)'" }
        $sql += " LOCALE_PROVIDER icu ICU_LOCALE '$($Locale.IcuLocale)'"
    } elseif ($Locale.Provider -eq "libc") {
        $sql += " LOCALE_PROVIDER libc"
    } else {
        throw "invalid locale provider: '$($Locale.Provider)'"
    }
    $sql += " LC_COLLATE '$($Locale.Collate)' LC_CTYPE '$($Locale.Ctype)'"
    return $sql
}

function Test-KanflowLocaleEqual {
    param($A, $B)
    if ($null -eq $A -or $null -eq $B) { return $false }
    return ($A.Provider -eq $B.Provider -and $A.Collate -eq $B.Collate -and $A.Ctype -eq $B.Ctype -and ([string]$A.IcuLocale) -eq ([string]$B.IcuLocale))
}

function Get-KanflowTableCounts {
    <#
    .SYNOPSIS
    Exact row count per base table of the database's public schema. Returns an
    ordered hashtable. Table names are double-quoted (PascalCase names).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$PgBinDir
    )
    $pass = New-PgPassFile -DbConfig $DbConfig
    try {
        $listSql = "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        $tables = @(Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql $listSql -Database $DbConfig.Database |
                Where-Object { $_ -match '^[A-Za-z0-9_]+$' })
        $counts = [ordered]@{}
        if ($tables.Count -eq 0) { return $counts }
        $sql = ($tables | ForEach-Object { "SELECT '{0}', COUNT(*) FROM public.`"{0}`"" -f $_ }) -join " UNION ALL "
        foreach ($line in @(Invoke-PgQuery -PgBinDir $PgBinDir -DbConfig $DbConfig -PassFile $pass -Sql $sql -Database $DbConfig.Database)) {
            $parts = $line -split "`t"
            if ($parts.Count -eq 2) { $counts[$parts[0]] = [long]$parts[1] }
        }
        return $counts
    } finally {
        Remove-Item -LiteralPath $pass -Force -ErrorAction SilentlyContinue
    }
}

function Test-IsAdministrator {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object System.Security.Principal.WindowsPrincipal($id)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

Export-ModuleMember -Function Get-KanflowRoot, Get-KanflowPaths, Get-KanflowDaemonLogFiles, Get-KanflowEnvValue, `
    Get-TranslationWorkerMode, Get-WorkerHeartbeatFile, Get-WorkerHeartbeat, Restart-KanflowWorker, `
    Read-DotEnv, Get-KanflowDbConfig, `
    Get-PgBinDir, New-PgPassFile, Get-PgConnectionArgs, Get-PgTimeoutSec, Invoke-PgClient, Invoke-NativeProcess, Invoke-PgQuery, `
    Remove-KanflowDumpExtensionLines, Get-KanflowDbLocale, Get-KanflowCreateDatabaseSql, Test-KanflowLocaleEqual, `
    Compress-GzipFile, Expand-GzipFile, Get-FileSha256, Invoke-Robocopy, `
    Get-PortListenerPids, Get-ServicePid, Test-KanflowHealth, Wait-Condition, `
    Stop-KanflowService, Start-KanflowService, Restart-KanflowService, `
    Export-KanflowDatabase, Get-KanflowTableCounts, Test-IsAdministrator, `
    Get-KanflowSetting, Test-KanflowSettingOff, Get-KanflowAlertConfig, Send-KanflowAlert, Clear-KanflowAlert, Test-AlertThrottled, `
    Get-KanflowCollaboraUrl, Test-KanflowCollabora, Get-KanflowCollaboraContainer, Start-KanflowCollaboraContainer, `
    Get-DockerExe, Invoke-ProcessWithTimeout, `
    Get-KanflowBackupGenerations, Test-KanflowBackupGeneration, Get-KanflowDirStats, Assert-KanflowDrillDatabaseName, 
    Expand-KanflowDump, Import-KanflowDump
