# Log every process that opens a TCP connection to Ollama (port 11434).
# One line per (time, pid) sighting; the command line is resolved once per pid.
$out = "$PSScriptRoot\ollama-clients.log"
$cmd = @{}
$lastSeen = @{}
$end = (Get-Date).AddHours(8)
while ((Get-Date) -lt $end) {
  $lines = netstat -ano -p tcp | Select-String ":11434\s" | ForEach-Object { $_.Line }
  $now = Get-Date
  foreach ($l in $lines) {
    $f = ($l -replace '^\s+','') -split '\s+'
    if ($f.Length -lt 5) { continue }
    $remote = $f[2]; $procId = $f[4]
    if ($remote -notmatch ':11434$') { continue }   # client-side sockets only
    if (-not $cmd.ContainsKey($procId)) {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      $c = $null
      try { $c = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction Stop).CommandLine } catch {}
      if (-not $c) { $c = "$($p.ProcessName) $($p.Path)" }
      $cmd[$procId] = ($c -replace '\s+',' ')
      if ($cmd[$procId].Length -gt 240) { $cmd[$procId] = $cmd[$procId].Substring(0,240) }
    }
    # log a sighting at most once per 20 s per pid
    if (-not $lastSeen.ContainsKey($procId) -or ($now - $lastSeen[$procId]).TotalSeconds -ge 20) {
      $lastSeen[$procId] = $now
      "{0} pid={1} {2}" -f $now.ToString('HH:mm:ss'), $procId, $cmd[$procId] | Out-File -Append -Encoding utf8 $out
    }
  }
  Start-Sleep -Seconds 2
}
"{0} watcher finished" -f (Get-Date -Format 'HH:mm:ss') | Out-File -Append -Encoding utf8 $out
