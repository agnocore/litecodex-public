param(
  [Parameter(Mandatory = $true)][string]$TaskName,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$CliPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $NodePath)) {
  throw "Node executable not found: $NodePath"
}
if (-not (Test-Path $CliPath)) {
  throw "CLI script not found: $CliPath"
}

$arg = "`"$CliPath`" entry start --from-startup-task"
$action = New-ScheduledTaskAction -Execute $NodePath -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650)

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Lite Codex Local Entry (127.0.0.1:43985) auto-start" | Out-Null

Write-Output "REGISTERED:$TaskName"
