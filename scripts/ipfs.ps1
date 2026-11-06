param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'status')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$NodeExecutable = Join-Path $ProjectRoot 'tools\node\node.exe'
if (-not (Test-Path -LiteralPath $NodeExecutable)) {
    $NodeExecutable = (Get-Command node -ErrorAction Stop).Source
}
Set-Location -LiteralPath $ProjectRoot
& $NodeExecutable (Join-Path $PSScriptRoot 'ipfs.mjs') $Action
exit $LASTEXITCODE
