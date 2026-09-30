<#
.SYNOPSIS
Kanflow backup: MySQL dump (gzip) + app\private (uploads, templates) + app\.env.

.DESCRIPTION
Creates one "generation" folder per run:

  <Destination>\daily\kanflow-YYYYMMDD-HHmmss\
      db-<database>.sql.gz     mysqldump --single-transaction --routines --events --triggers
      private\                 robocopy of app\private (uploads + templates)
      env\.env                 copy of app\.env (ACL restricted to Administrators/SYSTEM)
      manifest.json            sizes, SHA-256 of the dump, versions (no secrets)

On <WeeklyDay> the finished generation is also copied to <Destination>\weekly\.
Retention: newest <DailyKeep> daily and <WeeklyKeep> weekly generations are kept.
A generation is written as "<name>.partial" and renamed only when every step
succeeded, so a half-written backup is never mistaken for a good one.

Credentials are read from app\.env at runtime (or root + .db-pw with
-UseRootCredential) and handed to mysqldump through a temporary ACL-locked
option file. Nothing secret is printed or logged.

Secondary (off-machine) copy - REQUIRED for the scheduled backup:
  -SecondaryDestination, else KANFLOW_BACKUP_SECONDARY_DIR (environment or
  app\.env), typically a NAS UNC path. The finished generation is copied to
  <Secondary>\daily\<name>.partial, verified (file count + bytes, dump
  SHA-256) and renamed; weekly copies go to <Secondary>\weekly. The same
  retention (DailyKeep / WeeklyKeep) is applied there. When no secondary is
  configured the local backup still runs, but every run raises the alert
  "backup.secondary-missing".

Alerts (Send-KanflowAlert): backup.failed, backup.config, backup.secondary-missing,
backup.secondary-failed, backup.warnings.

Exit codes: 0 = success, 1 = backup failed, 2 = configuration error,
3 = local backup OK but the secondary copy failed.

.PARAMETER Destination
Backup root. Default: $env:KANFLOW_BACKUP_DIR, else E:\KanflowBackup.
Must be on a different physical drive than D: (a warning is logged otherwise).
UNC paths (\\nas\share\kanflow) are supported; the scheduled task account then
needs write access to the share (SYSTEM usually does NOT - see docs).

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\backup-kanflow.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\backup-kanflow.ps1 -Destination F:\KanflowBackup
#>
[CmdletBinding()]
param(
    [string]$Destination = $(if ($env:KANFLOW_BACKUP_DIR) { $env:KANFLOW_BACKUP_DIR } else { "E:\KanflowBackup" }),
    # Default: KANFLOW_BACKUP_SECONDARY_DIR (environment, then app\.env).
    [string]$SecondaryDestination,
    [ValidateRange(1, 365)][int]$DailyKeep = 14,
    [ValidateRange(0, 520)][int]$WeeklyKeep = 8,
    [System.DayOfWeek]$WeeklyDay = [System.DayOfWeek]::Sunday,
    [switch]$UseRootCredential,
    [switch]$SkipPrivate,
    [string]$LogFile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Import-Module (Join-Path $PSScriptRoot "..\lib\KanflowOps.psm1") -Force

$paths = Get-KanflowPaths
if (-not $LogFile) { $LogFile = Join-Path $paths.LogDir "backup.log" }
if (-not $SecondaryDestination) { $SecondaryDestination = Get-KanflowSetting -Name "KANFLOW_BACKUP_SECONDARY_DIR" }
$script:Warnings = New-Object System.Collections.Generic.List[string]
$RoboLog = Join-Path $paths.LogDir "backup-robocopy.log"

function Log([string]$msg, [string]$level = "INFO") {
    if ($level -eq "WARN") { $script:Warnings.Add($msg) }
    Write-RotatingLog -Path $LogFile -Message $msg -Level $level
}

function Get-DirStats([string]$dir) { return (Get-KanflowDirStats -Path $dir) }

function Test-DestinationDrive([string]$dest) {
    $kanflowQualifier = (Split-Path -Qualifier $paths.Root).ToUpperInvariant()
    if ($dest.StartsWith("\\")) {
        Log "destination is a UNC path ($dest); make sure the task account can write to it"
        return
    }
    $q = (Split-Path -Qualifier $dest).ToUpperInvariant()
    if ($q -eq $kanflowQualifier) {
        Log ("DESTINATION {0} IS ON THE SAME DRIVE ({1}) AS KANFLOW - a disk failure loses data AND backups. Use another disk or a NAS." -f $dest, $q) "WARN"
    }
    if (-not (Test-Path -LiteralPath ($q + "\"))) { throw "destination drive $q does not exist" }
}

function Invoke-DatabaseDump($db, [string]$binDir, [string]$genDir) {
    Log ("mysqldump {0}@{1}:{2}/{3}" -f $db.User, $db.Host, $db.Port, $db.Database)
    $dump = Export-KanflowDatabase -DbConfig $db -MySqlBinDir $binDir -OutFile (Join-Path $genDir ("db-{0}.sql.gz" -f $db.Database))
    if ($dump.Warnings) { Log "mysqldump stderr: $($dump.Warnings)" "WARN" }
    Log ("dump ok: {0:N1} MB raw -> {1:N1} MB gz" -f ($dump.RawBytes / 1MB), ($dump.GzBytes / 1MB))
    return [pscustomobject]@{ File = $dump.File; RawBytes = $dump.RawBytes; GzBytes = $dump.GzBytes; Sha256 = $dump.Sha256 }
}

function Get-RowCountsSafe($db, [string]$binDir) {
    # Recorded for restore drills. Taken right after the dump (not the same
    # snapshot), so tiny differences are possible if users were writing.
    try { return (Get-KanflowTableCounts -DbConfig $db -MySqlBinDir $binDir) } catch {
        Log "row counts not recorded: $($_.Exception.Message)" "WARN"
        return $null
    }
}

function Copy-PrivateFiles([string]$genDir) {
    if ($SkipPrivate) { Log "skipping app\private (-SkipPrivate)" "WARN"; return $null }
    if (-not (Test-Path -LiteralPath $paths.Private)) { Log "app\private not found; nothing to copy" "WARN"; return $null }
    $target = Join-Path $genDir "private"
    $rc = Invoke-Robocopy -Source $paths.Private -Destination $target -LogFile (Join-Path $paths.LogDir "backup-robocopy.log")
    if (-not $rc.Success) { throw "robocopy app\private failed with exit code $($rc.ExitCode)" }
    $src = Get-DirStats $paths.Private
    $dst = Get-DirStats $target
    if ($dst.Files -lt $src.Files) { throw ("private copy incomplete: {0} of {1} files" -f $dst.Files, $src.Files) }
    Log ("app\private copied: {0} files, {1:N1} MB (robocopy exit {2})" -f $dst.Files, ($dst.Bytes / 1MB), $rc.ExitCode)
    return $dst
}

function Copy-EnvFile([string]$genDir) {
    $envDir = Join-Path $genDir "env"
    New-Item -ItemType Directory -Path $envDir -Force | Out-Null
    # Lock the folder BEFORE the secret lands in it.
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $envDir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "${me}:(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "could not restrict ACL on $envDir" }
    Copy-Item -LiteralPath $paths.EnvFile -Destination (Join-Path $envDir ".env") -Force
    Log "app\.env copied (ACL: SYSTEM + Administrators + $me only)"
}

function Remove-OldGenerations([string]$dir, [int]$keep) {
    if (-not (Test-Path -LiteralPath $dir)) { return }
    $gens = @(Get-ChildItem -LiteralPath $dir -Directory | Where-Object { $_.Name -match '^kanflow-\d{8}-\d{6}$' } | Sort-Object Name -Descending)
    if ($gens.Count -gt $keep) {
        foreach ($g in $gens[$keep..($gens.Count - 1)]) {
            Log "retention: removing $($g.FullName)"
            Remove-Item -LiteralPath $g.FullName -Recurse -Force
        }
    }
    # Leftovers of crashed runs
    Get-ChildItem -LiteralPath $dir -Directory | Where-Object { $_.Name -like "*.partial" -and $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | ForEach-Object {
        Log "removing stale partial generation $($_.FullName)" "WARN"
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

function Test-SecondaryDestination([string]$secondary) {
    # Throws when unusable; WARNs when it is not really off-machine.
    $a = [System.IO.Path]::GetFullPath($secondary).TrimEnd('\')
    $b = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\')
    if ($a -ieq $b -or $a.StartsWith($b + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "secondary destination $secondary is the primary destination (or inside it)"
    }
    if (-not $secondary.StartsWith("\\")) {
        Log ("secondary destination {0} is a local drive, not off-machine - use a NAS/UNC path (\\server\share\kanflow)" -f $secondary) "WARN"
        $q = (Split-Path -Qualifier $secondary).ToUpperInvariant()
        if (-not (Test-Path -LiteralPath ($q + "\"))) { throw "secondary drive $q does not exist" }
    }
    New-Item -ItemType Directory -Path (Join-Path $secondary "daily"), (Join-Path $secondary "weekly") -Force | Out-Null
}

function Copy-GenerationToSecondary([string]$genDir, [string]$targetParent) {
    # <targetParent>\<name>.partial -> verify -> rename. Returns the final path.
    $name = Split-Path -Leaf $genDir
    $final = Join-Path $targetParent $name
    $partial = "$final.partial"
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Recurse -Force }
    # /COPY:DATS keeps the restricted ACL of env\. Some NAS shares refuse ACLs:
    # retry without S and warn (then the share permissions protect .env).
    $rc = Invoke-Robocopy -Source $genDir -Destination $partial -Options @("/E", "/COPY:DATS", "/DCOPY:DAT", "/R:2", "/W:5", "/NP", "/NFL", "/NDL") -LogFile $RoboLog
    if (-not $rc.Success) {
        Log ("secondary copy with ACLs failed (robocopy exit {0}); retrying without ACLs" -f $rc.ExitCode) "WARN"
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Recurse -Force }
        $rc = Invoke-Robocopy -Source $genDir -Destination $partial -LogFile $RoboLog
        if (-not $rc.Success) { throw "robocopy to $targetParent failed with exit $($rc.ExitCode)" }
        Log "secondary copy has NO file ACLs: env\.env there is protected only by the share/folder permissions - restrict them to administrators" "WARN"
    }
    $src = Get-DirStats $genDir
    $dst = Get-DirStats $partial
    if ($dst.Files -ne $src.Files -or $dst.Bytes -ne $src.Bytes) {
        throw ("secondary copy verification failed: {0} files / {1} bytes, expected {2} / {3}" -f $dst.Files, $dst.Bytes, $src.Files, $src.Bytes)
    }
    [void](Test-KanflowBackupGeneration -Path $partial)   # manifest + dump SHA-256 on the copy
    Rename-Item -LiteralPath $partial -NewName $name
    Log ("secondary copy verified: {0} ({1} files, {2:N1} MB, dump SHA-256 ok)" -f $final, $dst.Files, ($dst.Bytes / 1MB))
    return $final
}

function Invoke-SecondaryCopy([string]$finalDir, [bool]$weeklyMade) {
    # Returns $true on success (or when nothing is configured), $false on failure.
    if (-not $SecondaryDestination) {
        Log "SECONDARY BACKUP NOT CONFIGURED - set KANFLOW_BACKUP_SECONDARY_DIR (NAS/UNC path) or -SecondaryDestination; a single-disk copy is not a backup" "WARN"
        Send-KanflowAlert -Key "backup.secondary-missing" -Severity Warning -Source backup -ThrottleMinutes 0 `
            -Title "Secondary (off-machine) backup not configured" `
            -Message ("Backup {0} exists only on {1}. Set KANFLOW_BACKUP_SECONDARY_DIR in app\.env to a NAS path (docs\operations\backup-restore.md)." -f (Split-Path -Leaf $finalDir), $Destination)
        return $true
    }
    try {
        Log "secondary copy -> $SecondaryDestination"
        Test-SecondaryDestination $SecondaryDestination
        [void](Copy-GenerationToSecondary $finalDir (Join-Path $SecondaryDestination "daily"))
        if ($weeklyMade) { [void](Copy-GenerationToSecondary $finalDir (Join-Path $SecondaryDestination "weekly")) }
        Remove-OldGenerations (Join-Path $SecondaryDestination "daily") $DailyKeep
        Remove-OldGenerations (Join-Path $SecondaryDestination "weekly") $WeeklyKeep
        return $true
    } catch {
        Log ("SECONDARY COPY FAILED: {0}" -f $_.Exception.Message) "ERROR"
        Send-KanflowAlert -Key "backup.secondary-failed" -Severity Error -Source backup `
            -Title "Secondary (off-machine) backup copy failed" `
            -Message ("Local backup {0} is OK, but copying it to {1} failed: {2}. Check share access of the task account (backup-restore.md)." -f $finalDir, $SecondaryDestination, $_.Exception.Message)
        return $false
    }
}

function Get-GitCommit {
    try {
        $head = Join-Path $paths.Root ".git\HEAD"
        if (-not (Test-Path -LiteralPath $head)) { return $null }
        $ref = ([System.IO.File]::ReadAllText($head)).Trim()
        if ($ref.StartsWith("ref: ")) {
            $refFile = Join-Path $paths.Root (".git\" + $ref.Substring(5).Replace("/", "\"))
            if (Test-Path -LiteralPath $refFile) { return ([System.IO.File]::ReadAllText($refFile)).Trim() }
            return $null
        }
        return $ref
    } catch { return $null }
}

# ======================================================================
$started = Get-Date
$stamp = $started.ToString("yyyyMMdd-HHmmss")
$genName = "kanflow-$stamp"
$partialDir = $null

try {
    Log ("==== backup start (destination: {0}, secondary: {1}) ====" -f $Destination, $(if ($SecondaryDestination) { $SecondaryDestination } else { "NOT CONFIGURED" }))
    try {
        Test-DestinationDrive $Destination
        $db = Get-KanflowDbConfig -UseRootCredential:$UseRootCredential
        $binDir = Get-MySqlBinDir
    } catch {
        Log "configuration error: $($_.Exception.Message)" "ERROR"
        Send-KanflowAlert -Key "backup.config" -Severity Error -Source backup -Title "Backup did not run (configuration error)" `
            -Message ("{0} - no backup was taken. Log: {1}" -f $_.Exception.Message, $LogFile)
        exit 2
    }

    $dailyDir = Join-Path $Destination "daily"
    $weeklyDir = Join-Path $Destination "weekly"
    New-Item -ItemType Directory -Path $dailyDir, $weeklyDir -Force | Out-Null

    # Free-space guard: private size + 20% + 1 GB for the dump.
    $privStats = Get-DirStats $paths.Private
    $needBytes = [long]($privStats.Bytes * 1.2) + 1GB
    if (-not $Destination.StartsWith("\\")) {
        $drive = Get-PSDrive -Name ((Split-Path -Qualifier $Destination).TrimEnd(":"))
        if ($drive.Free -lt $needBytes) {
            throw ("not enough free space on {0}: {1:N1} GB free, ~{2:N1} GB needed" -f $drive.Root, ($drive.Free / 1GB), ($needBytes / 1GB))
        }
    }

    [void](Invoke-LogRotation -Path (Join-Path $paths.LogDir "backup-robocopy.log") -MaxBytes 5MB -Keep 3)

    $partialDir = Join-Path $dailyDir "$genName.partial"
    New-Item -ItemType Directory -Path $partialDir -Force | Out-Null

    $dump = Invoke-DatabaseDump $db $binDir $partialDir
    $rowCounts = Get-RowCountsSafe $db $binDir
    $priv = Copy-PrivateFiles $partialDir
    Copy-EnvFile $partialDir

    $appVersion = $null
    try { $appVersion = (Get-Content -LiteralPath (Join-Path $paths.App "package.json") -Raw | ConvertFrom-Json).version } catch { $appVersion = $null }
    $manifest = [ordered]@{
        format        = 1
        createdAt     = $started.ToString("o")
        host          = $env:COMPUTERNAME
        database      = $db.Database
        dump          = $dump
        tableRowCounts = $rowCounts
        privateFiles  = $(if ($priv) { $priv.Files } else { 0 })
        privateBytes  = $(if ($priv) { $priv.Bytes } else { 0 })
        envIncluded   = $true
        appVersion    = $appVersion
        gitCommit     = (Get-GitCommit)
        durationSec   = [int]((Get-Date) - $started).TotalSeconds
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $partialDir "manifest.json") -Encoding UTF8

    $finalDir = Join-Path $dailyDir $genName
    Rename-Item -LiteralPath $partialDir -NewName $genName
    $partialDir = $null
    Log "generation complete: $finalDir"

    $weeklyMade = $false
    if ($WeeklyKeep -gt 0 -and $started.DayOfWeek -eq $WeeklyDay) {
        # /COPY:DATS keeps the restricted ACL of env\ in the weekly copy.
        $rc = Invoke-Robocopy -Source $finalDir -Destination (Join-Path $weeklyDir $genName) `
            -Options @("/E", "/COPY:DATS", "/DCOPY:DAT", "/R:2", "/W:5", "/NP", "/NFL", "/NDL") -LogFile $RoboLog
        if (-not $rc.Success) { throw "weekly copy failed with robocopy exit $($rc.ExitCode)" }
        Log "weekly copy created: $(Join-Path $weeklyDir $genName)"
        $weeklyMade = $true
    }

    Remove-OldGenerations $dailyDir $DailyKeep
    Remove-OldGenerations $weeklyDir $WeeklyKeep

    $secondaryOk = Invoke-SecondaryCopy $finalDir $weeklyMade

    $sec = [int]((Get-Date) - $started).TotalSeconds
    if (-not $secondaryOk) {
        Log "==== backup finished: LOCAL OK, SECONDARY COPY FAILED in ${sec}s ====" "ERROR"
        exit 3
    }
    # secondary-missing has its own alert; everything else is summarised once.
    $other = @($script:Warnings | Where-Object { $_ -notlike "SECONDARY BACKUP NOT CONFIGURED*" })
    if ($script:Warnings.Count -gt 0) {
        Log "==== backup finished WITH WARNINGS in ${sec}s ====" "WARN"
        if ($other.Count -gt 0) {
            Send-KanflowAlert -Key "backup.warnings" -Severity Warning -Source backup -Title "Backup finished with warnings" `
                -Message (($other | Select-Object -First 10) -join "`r`n")
        }
    } else {
        Log "==== backup finished OK in ${sec}s ===="
    }
    exit 0
} catch {
    Log ("BACKUP FAILED: {0}" -f $_.Exception.Message) "ERROR"
    if ($partialDir -and (Test-Path -LiteralPath $partialDir)) {
        Log "leaving partial generation for inspection: $partialDir (auto-removed after 1 day)" "WARN"
    }
    Send-KanflowAlert -Key "backup.failed" -Severity Error -Source backup -Title "Backup FAILED" `
        -Message ("{0}`r`nDestination: {1}. No new generation was completed. Log: {2}" -f $_.Exception.Message, $Destination, $LogFile)
    exit 1
}
