Param(
    [string]$Region = "us-east-1",
    [switch]$SkipGenerate,
    [switch]$SkipImageSync,
    [switch]$SkipDeploy,
    [switch]$SkipVerify,
    [switch]$RegenerateData,
    [string]$IsolatedMapUrl = "https://d1b6znwb7yuvt4.cloudfront.net",
    [string]$DistributionComment = ""
)

$ErrorActionPreference = "Continue"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

function Run-Step($Title, $ScriptBlock) {
    Write-Host ""
    Write-Host "== $Title =="
    & $ScriptBlock
    if ($LASTEXITCODE -ne 0) {
        Fail "$Title failed."
    }
}

if (!(Get-Command aws -ErrorAction SilentlyContinue)) {
    Fail "AWS CLI was not found. Install/configure AWS CLI before deploying."
}

$identityJson = aws sts get-caller-identity --region $Region --output json 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "AWS credentials are missing or expired."
    Write-Host "Run: aws configure set region $Region"
    Write-Host "     aws login --remote"
    Fail "AWS authentication required."
}
$identity = $identityJson | ConvertFrom-Json

Write-Host "Community Priorities maps deployment"
Write-Host "AWS account     : $($identity.Account)"
Write-Host "Region          : $Region"
Write-Host "Isolated map URL: $IsolatedMapUrl"

if ($RegenerateData -or -not $SkipGenerate) {
    Run-Step "Generate community priorities data" {
        Push-Location (Join-Path $PSScriptRoot "deployed")
        try {
            if (!(Test-Path "node_modules")) {
                npm install
                if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            }
            npm run generate:data
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            npm run generate:infrastructure
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        } finally {
            Pop-Location
        }
    }
}

Run-Step "Package community priorities map" {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-community-priorities-map.ps1")
}

Run-Step "Package cluster priorities map" {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-cluster-priorities-map.ps1")
}

if (-not $SkipImageSync) {
    Run-Step "Sync priority map images to S3" {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-priority-map-images-to-s3.ps1") -Region $Region
    }
}

if (-not $SkipDeploy) {
    Run-Step "Deploy isolated Community Priorities maps" {
        $comment = $DistributionComment
        if ([string]::IsNullOrWhiteSpace($comment)) {
            $comment = "community-priorities-map-isolated-v4-$($identity.Account)-$Region"
        }
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "deploy-community-priorities-map-isolated-to-aws.ps1") `
            -Region $Region `
            -DistributionComment $comment
    }
}

if (-not $SkipVerify) {
    Run-Step "Verify isolated deployment online" {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "test-deployment-online.ps1") `
            -Region $Region `
            -IsolatedMapUrl $IsolatedMapUrl
    }
}

Write-Host ""
Write-Host "Maps deployment completed."
Write-Host "Community map: $IsolatedMapUrl/"
Write-Host "Cluster map  : $IsolatedMapUrl/cluster-priorities-map/map.htm"
