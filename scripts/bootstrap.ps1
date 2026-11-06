param(
    [string]$NodeVersion = '24.21.0'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$ToolsRoot = Join-Path $ProjectRoot 'tools'
$NodeRoot = Join-Path $ToolsRoot 'node'
$NodeExecutable = Join-Path $NodeRoot 'node.exe'
$NpmExecutable = Join-Path $NodeRoot 'npm.cmd'
Set-Location -LiteralPath $ProjectRoot

function Save-RemoteFile {
    param([string]$Uri, [string]$Destination)
    $client = [System.Net.Http.HttpClient]::new()
    try {
        $bytes = $client.GetByteArrayAsync($Uri).GetAwaiter().GetResult()
        [System.IO.File]::WriteAllBytes($Destination, $bytes)
    }
    finally {
        $client.Dispose()
    }
}

New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null

if (-not (Test-Path -LiteralPath $NpmExecutable)) {
    $ReleaseRoot = "https://nodejs.org/download/release/v$NodeVersion"
    $ArchiveName = "node-v$NodeVersion-win-x64.zip"
    $ArchivePath = Join-Path $ToolsRoot $ArchiveName
    $ChecksumsPath = Join-Path $ToolsRoot "node-v$NodeVersion-SHASUMS256.txt"
    $ExtractRoot = Join-Path $ToolsRoot "node-extract-$NodeVersion"

    Save-RemoteFile -Uri "$ReleaseRoot/$ArchiveName" -Destination $ArchivePath
    Save-RemoteFile -Uri "$ReleaseRoot/SHASUMS256.txt" -Destination $ChecksumsPath
    $checksumLine = Get-Content -LiteralPath $ChecksumsPath | Where-Object { $_ -match [regex]::Escape($ArchiveName) } | Select-Object -First 1
    if ($null -eq $checksumLine) {
        throw "Official checksum does not list $ArchiveName."
    }
    $ExpectedHash = ($checksumLine -split '\s+')[0].ToUpperInvariant()
    $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ArchivePath).Hash.ToUpperInvariant()
    if ($ExpectedHash -ne $ActualHash) {
        throw 'Node.js archive checksum verification failed.'
    }

    if (Test-Path -LiteralPath $ExtractRoot) {
        $ResolvedExtract = (Resolve-Path -LiteralPath $ExtractRoot).Path
        if (-not $ResolvedExtract.StartsWith($ToolsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe extraction path: $ResolvedExtract"
        }
        Remove-Item -LiteralPath $ResolvedExtract -Recurse -Force
    }
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force
    New-Item -ItemType Directory -Force -Path $NodeRoot | Out-Null
    $ExpandedNodeRoot = Join-Path $ExtractRoot "node-v$NodeVersion-win-x64"
    Get-ChildItem -LiteralPath $ExpandedNodeRoot | Copy-Item -Destination $NodeRoot -Recurse -Force
    Remove-Item -LiteralPath $ExtractRoot -Recurse -Force
    Remove-Item -LiteralPath $ArchivePath, $ChecksumsPath -Force
}

$env:Path = "$NodeRoot;$env:Path"
Write-Output "Using Node.js $(& $NodeExecutable --version) and npm $(& $NpmExecutable --version)."
& $NpmExecutable install
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE."
}
& $NpmExecutable --prefix frontend install
if ($LASTEXITCODE -ne 0) {
    throw "Frontend npm install failed with exit code $LASTEXITCODE."
}
& (Join-Path $PSScriptRoot 'setup-kubo.ps1')
if ($LASTEXITCODE -ne 0) {
    throw "Kubo setup failed with exit code $LASTEXITCODE."
}
& $NpmExecutable run compile
if ($LASTEXITCODE -ne 0) {
    throw "Smart-contract compilation failed with exit code $LASTEXITCODE."
}
& $NodeExecutable (Join-Path $PSScriptRoot 'check-environment.mjs')
Write-Output 'Bootstrap complete.'
