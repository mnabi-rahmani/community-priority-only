Param(
    [string]$CommunityMapDir = $(Join-Path $PSScriptRoot "frontend\dist\community-priorities-map"),
    [string]$DistDir = $(Join-Path $PSScriptRoot "frontend\dist"),
    [string]$RootIndex = $(Join-Path $PSScriptRoot "frontend\index.html")
)

if (!(Test-Path $CommunityMapDir)) {
    Write-Error "Community priorities map bundle '$CommunityMapDir' was not found. Run sync-community-priorities-map.ps1 first."
    exit 1
}

if (!(Test-Path $RootIndex)) {
    Write-Error "Root redirect index '$RootIndex' was not found."
    exit 1
}

Write-Host "Mirroring community map bundle to dist root for local /map.htm..."
Get-ChildItem $CommunityMapDir | ForEach-Object {
    $destination = Join-Path $DistDir $_.Name
    Copy-Item $_.FullName $destination -Recurse -Force
}

Copy-Item $RootIndex (Join-Path $DistDir "index.html") -Force
Write-Host "Root bundle ready: $DistDir\map.htm"
