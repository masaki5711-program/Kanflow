# =====================================================================
#  Kanflow ops - operational alerts (dot-sourced by KanflowOps.psm1)
#
#  Send-KanflowAlert   : one alert -> alert log file (always) + Windows
#                        Event Log (Application, source "Kanflow") + optional
#                        SMTP mail + optional generic webhook, with per-key
#                        throttling (state file) so a flapping check does
#                        not flood mailboxes.
#  Clear-KanflowAlert  : forget the throttle state of keys (after recovery)
#  Get-KanflowAlertConfig : resolved configuration (no secrets printed)
#
#  Configuration (process environment first, then app\.env):
#    KANFLOW_ALERT_THROTTLE_MIN   same key is not re-sent within N min (default 60)
#    KANFLOW_ALERT_EVENTLOG       "off" disables the Event Log channel
#    KANFLOW_ALERT_SMTP_HOST / KANFLOW_ALERT_SMTP_PORT (25) / KANFLOW_ALERT_SMTP_SSL (false)
#    KANFLOW_ALERT_FROM / KANFLOW_ALERT_TO (comma or semicolon separated)
#    KANFLOW_ALERT_WEBHOOK_URL    http(s) URL; JSON POST (has a "text" field)
#    KANFLOW_ALERT_DIR            directory for alerts.log + alert-state.json
#                                 (default ops\logs)
#
#  An alert channel failing never throws into the caller; the failure is
#  recorded in alerts.log. The webhook URL is never logged (it may carry a token).
#  Keep this file ASCII-only.
# =====================================================================

$script:AlertDefaultThrottleMin = 60
$script:AlertEventSource = "Kanflow"
$script:AlertMutexName = "Global\KanflowAlertState"
$script:AlertHttpTimeoutSec = 10
$script:AlertSmtpTimeoutMs = 15000
$script:AlertEventIds = @{ Info = 1000; Warning = 2000; Error = 3000 }

function Get-KanflowSetting {
    <#
    .SYNOPSIS
    A setting from the process environment, else from app\.env, else $Default.
    Pass -EnvMap (Read-DotEnv result) to avoid re-reading app\.env per call.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Default = $null,
        [hashtable]$EnvMap
    )
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ($v -and $v.Trim() -ne "") { return $v.Trim() }
    if ($null -eq $EnvMap) {
        try { $EnvMap = Read-DotEnv -Path (Get-KanflowPaths).EnvFile } catch { $EnvMap = @{} }
    }
    if ($EnvMap.ContainsKey($Name) -and "$($EnvMap[$Name])".Trim() -ne "") { return "$($EnvMap[$Name])".Trim() }
    return $Default
}

function Test-KanflowSettingOff([string]$Value) {
    if (-not $Value) { return $false }
    return (@("off", "false", "0", "no", "disabled", "none") -contains $Value.Trim().ToLowerInvariant())
}

function Get-KanflowAlertConfig {
    <# Resolved alert configuration. SmtpEnabled / WebhookEnabled say whether those channels are active. #>
    $envMap = @{}
    try { $envMap = Read-DotEnv -Path (Get-KanflowPaths).EnvFile } catch { $envMap = @{} }
    $get = { param($n, $d) Get-KanflowSetting -Name $n -Default $d -EnvMap $envMap }

    $dir = & $get "KANFLOW_ALERT_DIR" (Get-KanflowPaths).LogDir
    $throttle = $script:AlertDefaultThrottleMin
    $t = & $get "KANFLOW_ALERT_THROTTLE_MIN" $null
    if ($t -match '^\d{1,5}$') { $throttle = [int]$t }
    $port = 25
    $p = & $get "KANFLOW_ALERT_SMTP_PORT" $null
    if ($p -match '^\d{1,5}$') { $port = [int]$p }

    $smtpHost = & $get "KANFLOW_ALERT_SMTP_HOST" $null
    $from = & $get "KANFLOW_ALERT_FROM" $null
    $to = @(("" + (& $get "KANFLOW_ALERT_TO" "")) -split '[,;]' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $webhook = & $get "KANFLOW_ALERT_WEBHOOK_URL" $null
    $webhookValid = [bool]($webhook -and $webhook -match '^https?://')

    return [pscustomobject]@{
        Dir             = $dir
        LogFile         = Join-Path $dir "alerts.log"
        StateFile       = Join-Path $dir "alert-state.json"
        ThrottleMinutes = $throttle
        EventLogEnabled = -not (Test-KanflowSettingOff (& $get "KANFLOW_ALERT_EVENTLOG" $null))
        SmtpEnabled     = [bool]($smtpHost -and $from -and $to.Count -gt 0)
        SmtpHost        = $smtpHost
        SmtpPort        = $port
        SmtpSsl         = (@("true", "1", "yes", "on") -contains ("" + (& $get "KANFLOW_ALERT_SMTP_SSL" "false")).ToLowerInvariant())
        From            = $from
        To              = $to
        WebhookEnabled  = $webhookValid
        WebhookInvalid  = [bool]($webhook -and -not $webhookValid)
        WebhookUrl      = $webhook
    }
}

# ---------------------------------------------------------------------
# throttle state (JSON: { key: { lastSent, suppressed, severity } })
# ---------------------------------------------------------------------
function Invoke-WithAlertLock([scriptblock]$Action) {
    # Watchdog (SYSTEM), backup and interactive runs may alert at the same time.
    $mutex = $null
    $has = $false
    try {
        try {
            $mutex = New-Object System.Threading.Mutex($false, $script:AlertMutexName)
            try { $has = $mutex.WaitOne(10000) } catch [System.Threading.AbandonedMutexException] { $has = $true }
        } catch {
            # e.g. mutex created by SYSTEM and not openable by this user: proceed unlocked.
            $mutex = $null
        }
        return (& $Action)
    } finally {
        if ($mutex) {
            if ($has) { try { $mutex.ReleaseMutex() } catch { Write-Verbose "mutex release failed" } }
            $mutex.Dispose()
        }
    }
}

function Read-AlertState([string]$StateFile) {
    $state = @{}
    if (-not (Test-Path -LiteralPath $StateFile -PathType Leaf)) { return $state }
    try {
        $j = [System.IO.File]::ReadAllText($StateFile) | ConvertFrom-Json
        foreach ($prop in @($j.PSObject.Properties)) {
            $state[$prop.Name] = @{
                lastSent   = "" + $prop.Value.lastSent
                suppressed = [int]$prop.Value.suppressed
                severity   = "" + $prop.Value.severity
            }
        }
    } catch { Write-Verbose "alert state unreadable; starting fresh" }
    return $state
}

function Save-AlertState([string]$StateFile, [hashtable]$State) {
    $dir = Split-Path -Parent $StateFile
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $ordered = [ordered]@{}
    foreach ($k in @($State.Keys | Sort-Object)) { $ordered[$k] = $State[$k] }
    $json = if ($ordered.Count -gt 0) { $ordered | ConvertTo-Json -Depth 4 } else { "{}" }
    $tmp = "$StateFile.tmp"
    [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tmp -Destination $StateFile -Force
}

function Test-AlertThrottled {
    <# $true when $Entry (state of one key) was sent less than $Minutes before $Now. #>
    param($Entry, [datetime]$Now, [int]$Minutes)
    if ($Minutes -le 0 -or $null -eq $Entry -or -not $Entry.lastSent) { return $false }
    try {
        $last = [datetime]::Parse($Entry.lastSent, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind)
    } catch { return $false }
    return (($Now.ToUniversalTime() - $last.ToUniversalTime()).TotalMinutes -lt $Minutes)
}

# ---------------------------------------------------------------------
# channels (each returns $null on success or an error string)
# ---------------------------------------------------------------------
function Write-KanflowAlertEventLog([string]$Severity, [string]$Text) {
    $type = switch ($Severity) { "Error" { "Error" } "Warning" { "Warning" } default { "Information" } }
    $eventId = $script:AlertEventIds[$Severity]
    if ($Text.Length -gt 30000) { $Text = $Text.Substring(0, 30000) + " ...(truncated)" }
    $write = { Write-EventLog -LogName Application -Source $script:AlertEventSource -EntryType $type -EventId $eventId -Message $Text -ErrorAction Stop }
    try { & $write; return $null } catch { Write-Verbose "event log write failed: $($_.Exception.Message)" }
    # Source probably not registered yet: creating it needs admin (SYSTEM tasks can).
    try {
        New-EventLog -LogName Application -Source $script:AlertEventSource -ErrorAction Stop
        & $write
        return $null
    } catch {
        return ("event log unavailable (source '{0}' not registered and cannot be created without admin rights)" -f $script:AlertEventSource)
    }
}

function Send-KanflowAlertMail($Config, [string]$Subject, [string]$Body) {
    $client = $null
    $msg = $null
    try {
        $client = New-Object System.Net.Mail.SmtpClient($Config.SmtpHost, $Config.SmtpPort)
        $client.EnableSsl = $Config.SmtpSsl
        $client.Timeout = $script:AlertSmtpTimeoutMs
        $client.UseDefaultCredentials = $false
        $msg = New-Object System.Net.Mail.MailMessage
        $msg.From = New-Object System.Net.Mail.MailAddress($Config.From)
        foreach ($addr in $Config.To) { $msg.To.Add($addr) }
        $msg.Subject = $Subject
        $msg.SubjectEncoding = [System.Text.Encoding]::UTF8
        $msg.Body = $Body
        $msg.BodyEncoding = [System.Text.Encoding]::UTF8
        $client.Send($msg)
        return $null
    } catch {
        return ("smtp failed: {0}" -f $_.Exception.Message)
    } finally {
        if ($msg) { $msg.Dispose() }
        if ($client) { $client.Dispose() }
    }
}

function Send-KanflowAlertWebhook($Config, [hashtable]$Payload) {
    try {
        $json = $Payload | ConvertTo-Json -Depth 4 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        [void](Invoke-RestMethod -Method Post -Uri $Config.WebhookUrl -ContentType "application/json; charset=utf-8" `
                -Body $bytes -TimeoutSec $script:AlertHttpTimeoutSec -UseBasicParsing -ErrorAction Stop)
        return $null
    } catch {
        # Status only - never the URL.
        $code = $null
        try { if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } } catch { $code = $null }
        return ("webhook failed{0}" -f $(if ($code) { " (HTTP $code)" } else { ": " + $_.Exception.GetType().Name }))
    }
}

# ---------------------------------------------------------------------
# public
# ---------------------------------------------------------------------
function Send-KanflowAlert {
    <#
    .SYNOPSIS
    Raise an operational alert. Never throws.

    .PARAMETER Key
    Stable identifier used for throttling, e.g. "watchdog.app-down", "backup.failed".
    .PARAMETER Source
    Component name shown in the alert (watchdog, backup, restore-drill, deploy, ...).
    .PARAMETER ThrottleMinutes
    Override KANFLOW_ALERT_THROTTLE_MIN for this call. 0 = always send.
    .PARAMETER PassThru
    Return a result object (Sent, Throttled, Failures).

    .EXAMPLE
    Send-KanflowAlert -Key "backup.failed" -Severity Error -Source backup -Title "Backup failed" -Message $err
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_.:-]+$')][string]$Key,
        [ValidateSet("Info", "Warning", "Error")][string]$Severity = "Error",
        [Parameter(Mandatory = $true)][string]$Title,
        [AllowEmptyString()][string]$Message = "",
        [string]$Source = "ops",
        [int]$ThrottleMinutes = -1,
        [switch]$PassThru
    )
    $result = [ordered]@{ Key = $Key; Sent = $false; Throttled = $false; Failures = @() }
    try {
        $cfg = Get-KanflowAlertConfig
        $minutes = $(if ($ThrottleMinutes -ge 0) { $ThrottleMinutes } else { $cfg.ThrottleMinutes })
        $now = Get-Date
        $cleanTitle = ($Title -replace '[\r\n]+', ' ').Trim()
        $levelMap = @{ Info = "INFO"; Warning = "WARN"; Error = "ERROR" }

        $decision = Invoke-WithAlertLock {
            $state = Read-AlertState $cfg.StateFile
            $entry = $null
            if ($state.ContainsKey($Key)) { $entry = $state[$Key] }
            if (Test-AlertThrottled -Entry $entry -Now $now -Minutes $minutes) {
                $entry.suppressed = [int]$entry.suppressed + 1
                $state[$Key] = $entry
                Save-AlertState $cfg.StateFile $state
                return [pscustomobject]@{ Throttled = $true; Suppressed = $entry.suppressed }
            }
            $prevSuppressed = $(if ($entry) { [int]$entry.suppressed } else { 0 })
            $state[$Key] = @{ lastSent = $now.ToUniversalTime().ToString("o"); suppressed = 0; severity = $Severity }
            Save-AlertState $cfg.StateFile $state
            return [pscustomobject]@{ Throttled = $false; Suppressed = $prevSuppressed }
        }

        if ($decision.Throttled) {
            $result.Throttled = $true
            Write-RotatingLog -Path $cfg.LogFile -Level $levelMap[$Severity] -Quiet `
                -Message ("[{0}] {1}: {2} (throttled; {3} repeat(s) within {4} min)" -f $Key, $Source, $cleanTitle, $decision.Suppressed, $minutes)
            if ($PassThru) { return [pscustomobject]$result }
            return
        }

        $repeatNote = $(if ($decision.Suppressed -gt 0) { " ($($decision.Suppressed) repeat(s) suppressed since the last notification)" } else { "" })
        $text = "Kanflow {0} on {1} at {2}`r`nsource: {3}`r`nkey: {4}`r`n`r`n{5}{6}`r`n`r`n{7}" -f `
            $Severity.ToUpperInvariant(), $env:COMPUTERNAME, $now.ToString("yyyy-MM-dd HH:mm:ss"), $Source, $Key, $cleanTitle, $repeatNote, $Message
        Write-RotatingLog -Path $cfg.LogFile -Level $levelMap[$Severity] -Quiet `
            -Message ("[{0}] {1}: {2}{3} | {4}" -f $Key, $Source, $cleanTitle, $repeatNote, (($Message -replace '[\r\n]+', ' / ').Trim()))

        $failures = @()
        if ($cfg.EventLogEnabled) {
            $e = Write-KanflowAlertEventLog -Severity $Severity -Text $text
            if ($e) { $failures += $e }
        }
        if ($cfg.SmtpEnabled) {
            $subject = "[Kanflow][{0}] {1} ({2})" -f $Severity.ToUpperInvariant(), $cleanTitle, $env:COMPUTERNAME
            $e = Send-KanflowAlertMail -Config $cfg -Subject $subject -Body $text
            if ($e) { $failures += $e }
        }
        if ($cfg.WebhookEnabled) {
            $payload = @{
                text     = ("[Kanflow][{0}] {1} ({2})`n{3}" -f $Severity.ToUpperInvariant(), $cleanTitle, $env:COMPUTERNAME, $Message)
                source   = $Source; key = $Key; severity = $Severity.ToLowerInvariant()
                title    = $cleanTitle; message = $Message; host = $env:COMPUTERNAME
                time     = $now.ToString("o"); suppressedRepeats = $decision.Suppressed
            }
            $e = Send-KanflowAlertWebhook -Config $cfg -Payload $payload
            if ($e) { $failures += $e }
        } elseif ($cfg.WebhookInvalid) {
            $failures += "KANFLOW_ALERT_WEBHOOK_URL ignored (must start with http:// or https://)"
        }
        if ($failures.Count -gt 0) {
            Write-RotatingLog -Path $cfg.LogFile -Level WARN -Quiet -Message ("[{0}] delivery problems: {1}" -f $Key, ($failures -join "; "))
        }
        $result.Sent = $true
        $result.Failures = $failures
    } catch {
        # Last resort: alerting must never break the caller.
        $result.Failures = @("alert pipeline error: $($_.Exception.Message)")
        try {
            Write-RotatingLog -Path (Join-Path (Get-KanflowPaths).LogDir "alerts.log") -Level ERROR -Quiet -Message ("[{0}] could not raise alert '{1}': {2}" -f $Key, $Title, $_.Exception.Message)
        } catch { Write-Verbose "alert log unavailable" }
    }
    if ($PassThru) { return [pscustomobject]$result }
}

function Clear-KanflowAlert {
    <#
    .SYNOPSIS
    Forget the throttle state of the given keys (exact names, or -Prefix).
    Returns the keys that had state (i.e. had been alerted), so a caller can
    send a single "recovered" notice. Never throws.
    #>
    [CmdletBinding()]
    param([string[]]$Key = @(), [string]$Prefix)
    try {
        $cfg = Get-KanflowAlertConfig
        return @(Invoke-WithAlertLock {
                $state = Read-AlertState $cfg.StateFile
                $hit = @($state.Keys | Where-Object { ($Key -contains $_) -or ($Prefix -and $_.StartsWith($Prefix)) })
                if ($hit.Count -gt 0) {
                    foreach ($k in $hit) { $state.Remove($k) }
                    Save-AlertState $cfg.StateFile $state
                }
                return $hit
            })
    } catch {
        Write-Verbose "Clear-KanflowAlert failed: $($_.Exception.Message)"
        return @()
    }
}
