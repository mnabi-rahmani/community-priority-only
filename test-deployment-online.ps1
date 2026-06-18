Param(
    [string]$Region = "us-east-1",
    [string]$IsolatedMapUrl = "https://d1b6znwb7yuvt4.cloudfront.net",
    [string]$ApiBaseUrl = "https://tfqmwiadc8.execute-api.us-east-1.amazonaws.com",
    [string]$AssetPrefix = "community-priorities/priority-previews",
    [string]$SampleImageName = ""
)

$ErrorActionPreference = "Continue"

function Pass($Message) {
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Fail-Check($Message) {
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    $script:FailedChecks += 1
}

function Warn-Check($Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

$FailedChecks = 0
$isolatedBase = $IsolatedMapUrl.TrimEnd("/")

Write-Host "Community Priorities maps - online verification"
Write-Host "Isolated map : $isolatedBase"
Write-Host "Auth API     : $ApiBaseUrl"
Write-Host ""

try {
    $isolatedResponse = Invoke-WebRequest -Uri $isolatedBase -UseBasicParsing -TimeoutSec 30
    if ($isolatedResponse.StatusCode -eq 200 -and $isolatedResponse.Content -match "cluster-priorities-assets-map/map.htm|Cluster Priorities and Assets") {
        Pass "Isolated map root redirects to cluster priorities and assets ($isolatedBase)"
    } else {
        Fail-Check "Isolated map root returned unexpected content from $isolatedBase"
    }
} catch {
    Fail-Check "Isolated map root is not reachable: $($_.Exception.Message)"
}

$mapPaths = @(
    @{ Path = "/"; Label = "map root redirect" },
    @{ Path = "/map.htm"; Label = "community map.htm" },
    @{ Path = "/cluster-priorities-map/map.htm"; Label = "cluster priorities map" },
    @{ Path = "/cluster-priorities-assets-map/map.htm"; Label = "cluster priorities and assets map" }
)

foreach ($entry in $mapPaths) {
    $mapUrl = "$isolatedBase$($entry.Path)"
    try {
        $mapResponse = Invoke-WebRequest -Uri $mapUrl -UseBasicParsing -TimeoutSec 30
        if ($mapResponse.StatusCode -eq 200 -and (
            ($entry.Path -eq "/" -and $mapResponse.Content -match "cluster-priorities-assets-map/map.htm|Cluster Priorities and Assets") -or
            ($entry.Path -ne "/" -and $mapResponse.Content -match "leaflet|Community Priorities|INFRASTRUCTURE_PRIORITIES|authScreen|Sign in")
        )) {
            Pass "Map route is deployed ($($entry.Label))"
        } else {
            Fail-Check "Map route '$($entry.Path)' returned unexpected content"
        }
    } catch {
        Fail-Check "Map route '$($entry.Path)' is not reachable: $($_.Exception.Message)"
    }
}

foreach ($configPath in @("/src/config.js", "/cluster-priorities-map/src/config.js", "/cluster-priorities-assets-map/src/config.js")) {
    $configUrl = "$isolatedBase$configPath"
    try {
        $configResponse = Invoke-WebRequest -Uri $configUrl -UseBasicParsing -TimeoutSec 30
        if ($configResponse.StatusCode -eq 200 -and $configResponse.Content -match "priorityPhotoBaseUrl|authApiBaseUrl") {
            if ($configResponse.Content -match 'priorityPhotoBaseUrl:\s*"(https?://[^"]+)"') {
                Pass "Map config exposes S3 photo base URL ($configPath)"
            } else {
                Warn-Check "Map config is deployed but priorityPhotoBaseUrl is empty ($configPath)"
            }
            if ($configResponse.Content -match 'authApiBaseUrl:\s*"(https?://[^"]+)"') {
                Pass "Map config exposes auth API URL ($configPath)"
            }
        } else {
            Warn-Check "Map config not directly reachable ($configPath)"
        }
    } catch {
        Warn-Check "Could not fetch map config ($configPath)"
    }
}

try {
    $apiResponse = Invoke-WebRequest -Uri "$ApiBaseUrl/auth/verify" -Method GET -UseBasicParsing -TimeoutSec 30
    if ($apiResponse.StatusCode -eq 200 -and $apiResponse.Content -match '"success"\s*:\s*true') {
        Pass "Auth API verify endpoint is reachable"
    } else {
        Fail-Check "Auth API verify endpoint returned unexpected content"
    }
} catch {
    Fail-Check "Auth API is not reachable: $($_.Exception.Message)"
}

$assetBucket = ""
if (Get-Command aws -ErrorAction SilentlyContinue) {
    $identity = aws sts get-caller-identity --region $Region --output json 2>$null | ConvertFrom-Json
    if ($LASTEXITCODE -eq 0 -and $identity.Account) {
        $assetBucket = "community-priorities-map-assets-$($identity.Account)-$Region"
    }
}
if ([string]::IsNullOrWhiteSpace($assetBucket)) {
    $assetBucket = "community-priorities-map-assets-974389254535-$Region"
}

if ([string]::IsNullOrWhiteSpace($SampleImageName)) {
    $previewDir = Join-Path $PSScriptRoot "deployed\cursor_v2_map_data\photo_previews"
    if (Test-Path $previewDir) {
        $SampleImageName = (Get-ChildItem $previewDir -Filter "*.jpg" | Select-Object -First 1 -ExpandProperty Name)
    }
}

if ($assetBucket -and $SampleImageName) {
    $imageUrl = "https://$assetBucket.s3.$Region.amazonaws.com/$AssetPrefix/$SampleImageName"
    try {
        $imageResponse = Invoke-WebRequest -Uri $imageUrl -Method Head -UseBasicParsing -TimeoutSec 30
        if ($imageResponse.StatusCode -eq 200) {
            Pass "Sample priority preview image is publicly accessible ($SampleImageName)"
        } else {
            Fail-Check "Sample image returned status $($imageResponse.StatusCode) at $imageUrl"
        }
    } catch {
        Fail-Check "Sample priority preview image is not accessible at $imageUrl"
    }
} else {
    Warn-Check "Skipped image check (AWS auth or local preview files unavailable)"
}

Write-Host ""
if ($FailedChecks -eq 0) {
    Write-Host "Verification completed successfully."
    exit 0
}

Write-Host ("Verification completed with {0} failure(s)." -f $FailedChecks)
exit 1
