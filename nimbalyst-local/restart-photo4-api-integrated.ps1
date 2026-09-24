param(
  [Parameter(Mandatory = $true)]
  [int]$ExpectedPid
)

$ErrorActionPreference = "Stop"

$mainRoot = "C:\Users\manuj\code_barely_runs\Objectquest"
$storageRoot = "C:\Users\manuj\code_barely_runs\Objectquest_worktrees\sudden-stone\storage\live-validation-2026-09-24"
$jobsPath = Join-Path $storageRoot "jobs.json"
$ledgerPath = Join-Path $storageRoot "spend-ledger.json"
$jobs = Get-Content -Raw -LiteralPath $jobsPath | ConvertFrom-Json
$nonterminal = @($jobs.PSObject.Properties | Where-Object { $_.Value.job.state -notin @("ready", "failed") })
if ($nonterminal.Count -ne 0) {
  throw "Refusing restart because persisted jobs are not all terminal."
}

$jobsBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $jobsPath).Hash
$ledgerBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $ledgerPath).Hash
$protectedBefore = @{}
foreach ($port in @(15173, 5173, 8787)) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $port | Select-Object -First 1
  $protectedBefore[$port] = $listener.OwningProcess
}

$oldListener = Get-NetTCPConnection -State Listen -LocalPort 18799 | Select-Object -First 1
$oldProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($oldListener.OwningProcess)"
if ($oldListener.OwningProcess -ne $ExpectedPid -or $oldProcess.CommandLine -notmatch "server/index\.ts") {
  throw "Unexpected 18799 process: PID=$($oldListener.OwningProcess) $($oldProcess.CommandLine)"
}

Stop-Process -Id $oldListener.OwningProcess
$stopDeadline = (Get-Date).AddSeconds(15)
do {
  Start-Sleep -Milliseconds 250
  $remaining = Get-NetTCPConnection -State Listen -LocalPort 18799 -ErrorAction SilentlyContinue
} while ($remaining -and (Get-Date) -lt $stopDeadline)
if ($remaining) { throw "Port 18799 did not stop." }

$runtimeRoot = Join-Path $mainRoot "nimbalyst-local\runtime"
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$env:PORT = "18799"
$env:STORAGE_DIR = $storageRoot
$env:LIVEPEER_MAX_REQUEST_USD = "0.50"
$env:LIVEPEER_MAX_WORLD_USD = "3"
$env:LIVEPEER_MAX_AUTOMATIC_RETRIES = "0"
$env:OBJECTQUEST_LEGACY_OPEN = "true"
$env:OBJECTQUEST_SECURE_COOKIE = "false"

$node = (Get-Command node.exe).Source
$apiOut = Join-Path $runtimeRoot "photo4-api.stdout.log"
$apiErr = Join-Path $runtimeRoot "photo4-api.stderr.log"
$api = Start-Process -FilePath $node `
  -ArgumentList @("--import", "tsx", "server/index.ts") `
  -WorkingDirectory $mainRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $apiOut `
  -RedirectStandardError $apiErr `
  -PassThru

$health = $null
$healthDeadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Milliseconds 500
  if ($api.HasExited) { break }
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:18799/api/health" -TimeoutSec 2
  } catch {
    $health = $null
  }
} while ($health.status -ne "ok" -and (Get-Date) -lt $healthDeadline)
if ($health.status -ne "ok") {
  $tail = if (Test-Path -LiteralPath $apiErr) { (Get-Content -Tail 40 -LiteralPath $apiErr) -join "`n" } else { "" }
  throw "Integrated API failed health. PID=$($api.Id) $tail"
}

Start-Sleep -Seconds 2
$jobsAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $jobsPath).Hash
$ledgerAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $ledgerPath).Hash
if ($jobsBefore -ne $jobsAfter -or $ledgerBefore -ne $ledgerAfter) {
  throw "Integrated API boot changed durable jobs or ledger."
}

$protectedAfter = @{}
foreach ($port in @(15173, 5173, 8787)) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $port | Select-Object -First 1
  $protectedAfter[$port] = $listener.OwningProcess
  if ($protectedAfter[$port] -ne $protectedBefore[$port]) {
    throw "Protected port $port PID changed."
  }
}
$apiListener = Get-NetTCPConnection -State Listen -LocalPort 18799 | Select-Object -First 1

[pscustomobject]@{
  OldApiPid = $ExpectedPid
  NewApiPid = $api.Id
  ListenerPid = $apiListener.OwningProcess
  Health = $health.status
  JobsHash = $jobsAfter.ToLowerInvariant()
  LedgerHash = $ledgerAfter.ToLowerInvariant()
  Client15173Pid = $protectedAfter[15173]
  Main5173Pid = $protectedAfter[5173]
  Main8787Pid = $protectedAfter[8787]
  BootMutation = $false
  Head = (git -C $mainRoot rev-parse HEAD)
} | ConvertTo-Json -Compress
