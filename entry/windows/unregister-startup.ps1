param(
  [Parameter(Mandatory = $true)][string]$TaskName
)

$ErrorActionPreference = "Stop"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "UNREGISTERED:$TaskName"
} else {
  Write-Output "NOT_FOUND:$TaskName"
}
