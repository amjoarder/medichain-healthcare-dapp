param(
    [string]$Version = '0.43.1'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$ToolsRoot = Join-Path $ProjectRoot 'tools'
$KuboRoot = Join-Path $ToolsRoot 'kubo'
$Executable = Join-Path $KuboRoot 'ipfs.exe'
$RuntimeRoot = Join-Path $ProjectRoot 'runtime'
$IpfsRepository = Join-Path $RuntimeRoot 'ipfs'
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

New-Item -ItemType Directory -Force -Path $ToolsRoot, $RuntimeRoot | Out-Null

if (-not (Test-Path -LiteralPath $Executable)) {
    $ArchiveName = "kubo_v${Version}_windows-amd64.zip"
    $BaseUri = "https://dist.ipfs.tech/kubo/v${Version}"
    $ArchivePath = Join-Path $ToolsRoot $ArchiveName
    $HashPath = "$ArchivePath.sha512"
    $ExtractRoot = Join-Path $ToolsRoot "kubo-extract-$Version"

    Save-RemoteFile -Uri "$BaseUri/$ArchiveName" -Destination $ArchivePath
    Save-RemoteFile -Uri "$BaseUri/$ArchiveName.sha512" -Destination $HashPath

    $ExpectedHash = ((Get-Content -Raw -LiteralPath $HashPath).Trim() -split '\s+')[0].ToUpperInvariant()
    $ActualHash = (Get-FileHash -Algorithm SHA512 -LiteralPath $ArchivePath).Hash.ToUpperInvariant()
    if ($ExpectedHash -ne $ActualHash) {
        throw 'Kubo archive checksum verification failed.'
    }

    if (Test-Path -LiteralPath $ExtractRoot) {
        $ResolvedExtract = (Resolve-Path -LiteralPath $ExtractRoot).Path
        if (-not $ResolvedExtract.StartsWith($ToolsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe extraction path: $ResolvedExtract"
        }
        Remove-Item -LiteralPath $ResolvedExtract -Recurse -Force
    }
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force
    New-Item -ItemType Directory -Force -Path $KuboRoot | Out-Null
    Copy-Item -LiteralPath (Join-Path $ExtractRoot 'kubo\ipfs.exe') -Destination $Executable
    Copy-Item -LiteralPath (Join-Path $ExtractRoot 'kubo\LICENSE') -Destination (Join-Path $KuboRoot 'LICENSE')
    Remove-Item -LiteralPath $ExtractRoot -Recurse -Force
    Remove-Item -LiteralPath $ArchivePath, $HashPath -Force
}

$env:IPFS_PATH = $IpfsRepository
if (-not (Test-Path -LiteralPath (Join-Path $IpfsRepository 'config'))) {
    & $Executable init --profile=server | Out-Host
}

$NodeExecutable = Join-Path $ProjectRoot 'tools\node\node.exe'
if (-not (Test-Path -LiteralPath $NodeExecutable)) {
    $NodeExecutable = (Get-Command node -ErrorAction Stop).Source
}
& $NodeExecutable (Join-Path $PSScriptRoot 'configure-ipfs.mjs') $Executable $IpfsRepository
if ($LASTEXITCODE -ne 0) {
    throw "Kubo configuration failed with exit code $LASTEXITCODE."
}

Write-Output "Kubo configured: $(& $Executable version)"
Write-Output "Repository: $IpfsRepository"
