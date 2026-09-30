# =====================================================================
#  Kanflow ops - log rotation helpers (Windows PowerShell 5.1 compatible)
#
#  Import-Module "$PSScriptRoot\..\logs\LogRotation.psm1"
#
#  Invoke-LogRotation   : size-based rotation  file.log -> file.log.1 .. .N
#  Remove-OldFiles      : keep only the newest N files matching a filter
#  Write-RotatingLog    : append one timestamped line, rotating first
#
#  Log files produced by ops scripts live in D:\APP\Kanflow\ops\logs\*.log
#  (git-ignored). Keep this file ASCII-only (PS 5.1 reads BOM-less files
#  in the ANSI code page).
# =====================================================================

Set-StrictMode -Version 2.0

$script:DefaultMaxBytes = 5MB
$script:DefaultKeep = 5

function Invoke-LogRotation {
    <#
    .SYNOPSIS
    Rotate a log file when it exceeds MaxBytes: file -> file.1 -> ... -> file.Keep.
    Locked files (held open by another process) are skipped with a warning.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [long]$MaxBytes = $script:DefaultMaxBytes,
        [ValidateRange(1, 100)][int]$Keep = $script:DefaultKeep
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $item = Get-Item -LiteralPath $Path
    if ($item.Length -lt $MaxBytes) { return $false }

    try {
        $oldest = "$Path.$Keep"
        if (Test-Path -LiteralPath $oldest) { Remove-Item -LiteralPath $oldest -Force -ErrorAction Stop }
        for ($i = $Keep - 1; $i -ge 1; $i--) {
            $src = "$Path.$i"
            if (Test-Path -LiteralPath $src) {
                Move-Item -LiteralPath $src -Destination "$Path.$($i + 1)" -Force -ErrorAction Stop
            }
        }
        Move-Item -LiteralPath $Path -Destination "$Path.1" -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Warning ("Log rotation skipped for {0}: {1}" -f $Path, $_.Exception.Message)
        return $false
    }
}

function Remove-OldFiles {
    <#
    .SYNOPSIS
    Keep only the newest $Keep files in $Directory matching $Filter (by LastWriteTime).
    #>
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [string]$Filter = "*.log",
        [ValidateRange(0, 10000)][int]$Keep = 10
    )

    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return @() }
    $files = @(Get-ChildItem -LiteralPath $Directory -Filter $Filter -File |
        Sort-Object LastWriteTime -Descending)
    $removed = @()
    if ($files.Count -le $Keep) { return $removed }
    foreach ($f in $files[$Keep..($files.Count - 1)]) {
        if ($PSCmdlet.ShouldProcess($f.FullName, "Remove")) {
            try {
                Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
                $removed += $f.FullName
            } catch {
                Write-Warning ("Could not remove {0}: {1}" -f $f.FullName, $_.Exception.Message)
            }
        }
    }
    return $removed
}

function Write-RotatingLog {
    <#
    .SYNOPSIS
    Append "yyyy-MM-dd HH:mm:ss [LEVEL] message" to $Path (UTF-8), rotating first.
    Also echoes to the host so interactive runs show progress.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "DEBUG")][string]$Level = "INFO",
        [long]$MaxBytes = $script:DefaultMaxBytes,
        [int]$Keep = $script:DefaultKeep,
        [switch]$Quiet
    )

    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [void](Invoke-LogRotation -Path $Path -MaxBytes $MaxBytes -Keep $Keep)

    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    try {
        [System.IO.File]::AppendAllText($Path, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    } catch {
        Write-Warning ("Could not write log {0}: {1}" -f $Path, $_.Exception.Message)
    }
    if (-not $Quiet) {
        switch ($Level) {
            "ERROR" { Write-Host $line -ForegroundColor Red }
            "WARN" { Write-Host $line -ForegroundColor Yellow }
            default { Write-Host $line }
        }
    }
}

Export-ModuleMember -Function Invoke-LogRotation, Remove-OldFiles, Write-RotatingLog
