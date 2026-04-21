param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliPath = Join-Path $scriptDir "..\cli.mjs"

node $cliPath @Rest
exit $LASTEXITCODE
