# =====================================================================
#  Kanflow ops - shared helpers (Windows PowerShell 5.1 compatible)
#
#  Import-Module "$PSScriptRoot\..\lib\KanflowOps.psm1"
#
#  Secrets policy: values read from app\.env / .db-pw are only ever passed
#  to child processes through a temporary, ACL-restricted MySQL option file.
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
    PASSWORD/NAME, falling back to DATABASE_URL). With -UseRootCredential the
    user becomes "root" and the password is read from D:\APP\Kanflow\.db-pw.
    Returns an object whose Password must never be printed.
    #>
    [CmdletBinding()]
    param(
        [string]$EnvFile = (Get-KanflowPaths).EnvFile,
        [switch]$UseRootCredential
    )

    $envMap = Read-DotEnv -Path $EnvFile
    $cfg = [ordered]@{ Host = $null; Port = 3306; User = $null; Password = $null; Database = $null }

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
        if (-not (Test-Path -LiteralPath $pwFile)) { throw "root password file not found: $pwFile" }
        $cfg.User = "root"
        $cfg.Password = ([System.IO.File]::ReadAllText($pwFile)).Trim()
    }

    if (-not $cfg.User) { throw "database user not found in $EnvFile" }
    if (-not $cfg.Database) { throw "database name not found in $EnvFile" }
    if ($cfg.Database -notmatch '^[A-Za-z0-9_$]+$') { throw "unexpected characters in database name" }
    return [pscustomobject]$cfg
}

# ---------------------------------------------------------------------
# MySQL client helpers
# ---------------------------------------------------------------------
function Get-MySqlBinDir {
    <#
    .SYNOPSIS
    Locate the MySQL bin directory: $env:KANFLOW_MYSQL_BIN, then the
    KanflowMySQL service ImagePath, then the default 8.4 install path.
    #>
    [CmdletBinding()]
    param([string]$ServiceName = "KanflowMySQL")

    $candidates = @()
    if ($env:KANFLOW_MYSQL_BIN) { $candidates += $env:KANFLOW_MYSQL_BIN }
    # Registry instead of WMI/CIM: WMI queries have been observed to hang on this host.
    try {
        $imagePath = (Get-ItemProperty -LiteralPath ("HKLM:\SYSTEM\CurrentControlSet\Services\{0}" -f $ServiceName) -ErrorAction Stop).ImagePath
        if ($imagePath) {
            $m = [regex]::Match($imagePath, '^\s*"([^"]+)"|^\s*(\S+)')
            $exe = $m.Groups[1].Value
            if (-not $exe) { $exe = $m.Groups[2].Value }
            if ($exe) { $candidates += (Split-Path -Parent $exe) }
        }
    } catch {
        Write-Verbose "service lookup failed: $($_.Exception.Message)"
    }
    $candidates += "C:\Program Files\MySQL\MySQL Server 8.4\bin"

    foreach ($dir in $candidates) {
        if ($dir -and (Test-Path -LiteralPath (Join-Path $dir "mysqldump.exe"))) { return $dir }
    }
    throw "mysqldump.exe not found (set KANFLOW_MYSQL_BIN to the MySQL bin directory)"
}

function New-MySqlOptionFile {
    <#
    .SYNOPSIS
    Write a [client] option file with the credentials into %TEMP% and lock its
    ACL to the current user, SYSTEM and Administrators. Caller must delete it.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$DbConfig)

    $path = Join-Path ([System.IO.Path]::GetTempPath()) ("kanflow-my-{0}.cnf" -f ([guid]::NewGuid().ToString("N")))
    [System.IO.File]::WriteAllText($path, "", (New-Object System.Text.UTF8Encoding($false)))
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $path /inheritance:r /grant:r "${me}:(F)" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null

    $pw = [string]$DbConfig.Password
    $pwEscaped = $pw.Replace('\', '\\').Replace('"', '\"')
    $content = @(
        "[client]",
        ("host={0}" -f $DbConfig.Host),
        ("port={0}" -f $DbConfig.Port),
        ("user={0}" -f $DbConfig.User),
        ('password="{0}"' -f $pwEscaped),
        "default-character-set=utf8mb4"
    ) -join "`r`n"
    [System.IO.File]::WriteAllText($path, $content + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
    return $path
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
        [string]$StderrFile
    )
    $p = @{
        FilePath     = $FilePath
        ArgumentList = $Arguments
        NoNewWindow  = $true
        Wait         = $true
        PassThru     = $true
    }
    if ($StdinFile) { $p.RedirectStandardInput = $StdinFile }
    if ($StdoutFile) { $p.RedirectStandardOutput = $StdoutFile }
    if ($StderrFile) { $p.RedirectStandardError = $StderrFile }
    $proc = Start-Process @p
    return $proc.ExitCode
}

function Invoke-MySqlQuery {
    <#
    .SYNOPSIS
    Run a SQL statement with the mysql client (batch, no headers) and return the
    output lines. Throws on non-zero exit.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$MySqlBinDir,
        [Parameter(Mandatory = $true)][string]$OptionFile,
        [Parameter(Mandatory = $true)][string]$Sql,
        [string]$Database
    )
    $out = [System.IO.Path]::GetTempFileName()
    $err = [System.IO.Path]::GetTempFileName()
    try {
        $sqlArg = $Sql.Replace('"', '\"')
        $argString = "--defaults-extra-file=`"$OptionFile`" -N -B -e `"$sqlArg`""
        if ($Database) { $argString += " $Database" }
        $code = Invoke-NativeProcess -FilePath (Join-Path $MySqlBinDir "mysql.exe") -Arguments $argString -StdoutFile $out -StderrFile $err
        if ($code -ne 0) {
            $msg = ([System.IO.File]::ReadAllText($err)).Trim()
            throw "mysql exited with $code : $msg"
        }
        return @([System.IO.File]::ReadAllLines($out, [System.Text.Encoding]::UTF8))
    } finally {
        Remove-Item -LiteralPath $out, $err -Force -ErrorAction SilentlyContinue
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
    mysqldump one database (consistent InnoDB snapshot, routines, events,
    triggers; no CREATE DATABASE / USE so it can be restored under another
    name) into <OutFile> (.sql.gz). Throws on failure or incomplete dump.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$MySqlBinDir,
        [Parameter(Mandatory = $true)][string]$OutFile
    )
    if (-not $OutFile.EndsWith(".sql.gz")) { throw "OutFile must end with .sql.gz" }
    $sqlFile = $OutFile.Substring(0, $OutFile.Length - 3)
    $errFile = "$sqlFile.err.txt"
    $opt = New-MySqlOptionFile -DbConfig $DbConfig
    try {
        $argList = @(
            "--defaults-extra-file=`"$opt`"",
            "--single-transaction", "--quick", "--routines", "--events", "--triggers",
            "--hex-blob", "--no-tablespaces", "--set-gtid-purged=OFF",
            "--default-character-set=utf8mb4",
            "--result-file=`"$sqlFile`"",
            $DbConfig.Database
        ) -join " "
        $code = Invoke-NativeProcess -FilePath (Join-Path $MySqlBinDir "mysqldump.exe") -Arguments $argList -StderrFile $errFile
    } finally {
        Remove-Item -LiteralPath $opt -Force -ErrorAction SilentlyContinue
    }
    $errText = ""
    if (Test-Path -LiteralPath $errFile) {
        $errText = ([System.IO.File]::ReadAllText($errFile)).Trim()
        Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
    }
    if ($code -ne 0) {
        Remove-Item -LiteralPath $sqlFile -Force -ErrorAction SilentlyContinue
        throw "mysqldump exited with code $code : $errText"
    }
    $tail = @(Get-Content -LiteralPath $sqlFile -Tail 3 -Encoding UTF8)
    if (@($tail -match "^-- Dump completed").Count -eq 0) { throw "dump file is incomplete (no 'Dump completed' trailer)" }

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

function Get-KanflowTableCounts {
    <#
    .SYNOPSIS
    Exact row count per base table of a database. Returns an ordered hashtable.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$DbConfig,
        [Parameter(Mandatory = $true)][string]$MySqlBinDir
    )
    $opt = New-MySqlOptionFile -DbConfig $DbConfig
    try {
        $listSql = "SELECT table_name FROM information_schema.tables WHERE table_schema='{0}' AND table_type='BASE TABLE' ORDER BY table_name" -f $DbConfig.Database
        $tables = @(Invoke-MySqlQuery -MySqlBinDir $MySqlBinDir -OptionFile $opt -Sql $listSql | Where-Object { $_ -match '^[A-Za-z0-9_$]+$' })
        $counts = [ordered]@{}
        if ($tables.Count -eq 0) { return $counts }
        $bt = [char]96
        $sql = ($tables | ForEach-Object { "SELECT '{0}', COUNT(*) FROM {1}{0}{1}" -f $_, $bt }) -join " UNION ALL "
        foreach ($line in @(Invoke-MySqlQuery -MySqlBinDir $MySqlBinDir -OptionFile $opt -Sql $sql -Database $DbConfig.Database)) {
            $parts = $line -split "`t"
            if ($parts.Count -eq 2) { $counts[$parts[0]] = [long]$parts[1] }
        }
        return $counts
    } finally {
        Remove-Item -LiteralPath $opt -Force -ErrorAction SilentlyContinue
    }
}

function Test-IsAdministrator {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object System.Security.Principal.WindowsPrincipal($id)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

Export-ModuleMember -Function Get-KanflowRoot, Get-KanflowPaths, Get-KanflowDaemonLogFiles, Get-KanflowEnvValue, `
    Get-TranslationWorkerMode, Get-WorkerHeartbeatFile, Get-WorkerHeartbeat, Restart-KanflowWorker, `
    Read-DotEnv, Get-KanflowDbConfig, `
    Get-MySqlBinDir, New-MySqlOptionFile, Invoke-NativeProcess, Invoke-MySqlQuery, `
    Compress-GzipFile, Expand-GzipFile, Get-FileSha256, Invoke-Robocopy, `
    Get-PortListenerPids, Get-ServicePid, Test-KanflowHealth, Wait-Condition, `
    Stop-KanflowService, Start-KanflowService, Restart-KanflowService, `
    Export-KanflowDatabase, Get-KanflowTableCounts, Test-IsAdministrator, `
    Get-KanflowSetting, Test-KanflowSettingOff, Get-KanflowAlertConfig, Send-KanflowAlert, Clear-KanflowAlert, Test-AlertThrottled, `
    Get-KanflowCollaboraUrl, Test-KanflowCollabora, Get-KanflowCollaboraContainer, Start-KanflowCollaboraContainer, `
    Get-DockerExe, Invoke-ProcessWithTimeout, `
    Get-KanflowBackupGenerations, Test-KanflowBackupGeneration, Get-KanflowDirStats, Assert-KanflowDrillDatabaseName, 
    Expand-KanflowDump, Import-KanflowDump
