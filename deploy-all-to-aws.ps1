# Backward-compatible alias for deploy-maps-to-aws.ps1
Write-Warning "deploy-all-to-aws.ps1 is deprecated. Use deploy-maps-to-aws.ps1 instead."
& (Join-Path $PSScriptRoot "deploy-maps-to-aws.ps1") @args
exit $LASTEXITCODE
