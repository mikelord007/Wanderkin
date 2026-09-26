$ErrorActionPreference = "Stop"

$mainRoot = "C:\Users\manuj\code_barely_runs\Objectquest"
$storageRoot = "C:\Users\manuj\code_barely_runs\Objectquest_worktrees\sudden-stone\storage\live-validation-2026-09-24"
$runtimeRoot = Join-Path $mainRoot "nimbalyst-local\runtime"
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (Get-NetTCPConnection -State Listen -LocalPort 18799 -ErrorAction SilentlyContinue) {
  throw "Port 18799 already has a listener."
}
if (Get-NetTCPConnection -State Listen -LocalPort 15173 -ErrorAction SilentlyContinue) {
  throw "Port 15173 already has a listener."
}

$jobsPath = Join-Path $storageRoot "jobs.json"
$ledgerPath = Join-Path $storageRoot "spend-ledger.json"
$jobsBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $jobsPath).Hash
$ledgerBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $ledgerPath).Hash

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

$deadline = (Get-Date).AddSeconds(25)
$apiHealthy = $false
do {
  Start-Sleep -Milliseconds 500
  if ($api.HasExited) { break }
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:18799/api/health" -TimeoutSec 2
    if ($health.status -eq "ok") {
      $apiHealthy = $true
      break
    }
  } catch {}
} while ((Get-Date) -lt $deadline)

if (-not $apiHealthy) {
  $tail = if (Test-Path -LiteralPath $apiErr) { (Get-Content -Tail 30 -LiteralPath $apiErr) -join "`n" } else { "" }
  throw "Isolated API failed health. PID=$($api.Id), exited=$($api.HasExited). $tail"
}

Start-Sleep -Seconds 2
$jobsAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $jobsPath).Hash
$ledgerAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $ledgerPath).Hash
if ($jobsBefore -ne $jobsAfter -or $ledgerBefore -ne $ledgerAfter) {
  throw "API boot changed the durable jobs or spend ledger."
}

$clientOut = Join-Path $runtimeRoot "photo4-client.stdout.log"
$clientErr = Join-Path $runtimeRoot "photo4-client.stderr.log"
$viteConfig = Join-Path $mainRoot "nimbalyst-local\vite.photo4-isolated.config.mjs"
$vite = Join-Path $mainRoot "node_modules\vite\bin\vite.js"
$client = Start-Process -FilePath $node `
  -ArgumentList @($vite, "--config", $viteConfig) `
  -WorkingDirectory $mainRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $clientOut `
  -RedirectStandardError $clientErr `
  -PassThru

$deadline = (Get-Date).AddSeconds(25)
$clientHealthy = $false
do {
  Start-Sleep -Milliseconds 500
  if ($client.HasExited) { break }
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:15173/" -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $clientHealthy = $true
      break
    }
  } catch {}
} while ((Get-Date) -lt $deadline)

if (-not $clientHealthy) {
  $tail = if (Test-Path -LiteralPath $clientErr) { (Get-Content -Tail 30 -LiteralPath $clientErr) -join "`n" } else { "" }
  throw "Isolated client failed health. PID=$($client.Id), exited=$($client.HasExited). $tail"
}

$apiListener = Get-NetTCPConnection -State Listen -LocalPort 18799 | Select-Object -First 1
$clientListener = Get-NetTCPConnection -State Listen -LocalPort 15173 | Select-Object -First 1
[pscustomobject]@{
  ApiPid = $api.Id
  ApiListenerPid = $apiListener.OwningProcess
  ClientPid = $client.Id
  ClientListenerPid = $clientListener.OwningProcess
  JobsUnchanged = $true
  LedgerUnchanged = $true
  ApiHealth = "ok"
  ClientStatus = 200
  ApiStdout = $apiOut
  ApiStderr = $apiErr
  ClientStdout = $clientOut
  ClientStderr = $clientErr
} | ConvertTo-Json -Compress
