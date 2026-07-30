param(
  [string]$RepositoryPath = "F:\Project\bright-editor-platform"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Assert-Equal {
  param(
    [string]$Actual,
    [string]$Expected,
    [string]$Label
  )

  if ($Actual -ne $Expected) {
    throw "$Label mismatch. Expected '$Expected', actual '$Actual'."
  }
}

if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) {
  throw "Repository path does not exist: $RepositoryPath"
}

Set-Location -LiteralPath $RepositoryPath

$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()

Assert-Equal $branch "feat/wordpress-draft-publishing" "Branch"
Assert-Equal $head "edea915e15d9e350bd0ceb99aad42a6e52056a61" "HEAD"

$requiredFiles = @(
  "app/api/publishing/posts/route.ts",
  "app/application/publishing/PublicPostCatalogApplicationService.ts",
  "apps/wordpress/WordPressPostCatalogAdapter.ts",
  "tests/unit/apps/wordpress/WordPressPostCatalogAdapter.test.ts",
  "tests/unit/core/content/WordPressRelatedPostRecommendation.test.ts"
)

foreach ($requiredFile in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "The WordPress approval completion patch is incomplete. Missing: $requiredFile"
  }
}

Write-Host "Repository: $RepositoryPath" -ForegroundColor Cyan

$repositoryBackupRoot = Join-Path $RepositoryPath ".bright-studio\patch-backups"
if (Test-Path -LiteralPath $repositoryBackupRoot -PathType Container) {
  $externalBackupBase = Join-Path $HOME "BrightStudioPatchBackups"
  New-Item -ItemType Directory -Path $externalBackupBase -Force | Out-Null

  $externalBackupPath = Join-Path $externalBackupBase (
    "bright-editor-platform-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff")
  )

  Write-Host ""
  Write-Host "=== Move patch backups outside repository ===" -ForegroundColor Cyan
  Write-Host "From: $repositoryBackupRoot"
  Write-Host "To:   $externalBackupPath"

  Move-Item -LiteralPath $repositoryBackupRoot -Destination $externalBackupPath
  if (Test-Path -LiteralPath $repositoryBackupRoot) {
    throw "Patch backup directory still exists inside the repository."
  }
  if (-not (Test-Path -LiteralPath $externalBackupPath -PathType Container)) {
    throw "Patch backups were not preserved at the external destination."
  }

  Write-Host "Patch backups preserved outside the repository." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "No repository-internal patch backup directory remains." -ForegroundColor Yellow
}

$backupTests = Get-ChildItem `
  -LiteralPath (Join-Path $RepositoryPath ".bright-studio") `
  -Recurse `
  -File `
  -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '\.(?:test|spec)\.[cm]?[jt]sx?$' }

if ($backupTests) {
  $paths = ($backupTests | ForEach-Object { $_.FullName }) -join [Environment]::NewLine
  throw "Test-like files still exist under .bright-studio:`n$paths"
}

Write-Host ""
Write-Host "=== Current Git state ===" -ForegroundColor Cyan
git status --short
git diff --stat

$nextEnvBefore = if (Test-Path -LiteralPath "next-env.d.ts") {
  (Get-FileHash -Algorithm SHA256 -LiteralPath "next-env.d.ts").Hash
} else {
  ""
}

Invoke-Step "WordPress post catalog test" {
  npx vitest run "tests/unit/apps/wordpress/WordPressPostCatalogAdapter.test.ts"
}

Invoke-Step "TypeScript typecheck" {
  npm run typecheck
}

Invoke-Step "ESLint" {
  npm run lint
}

Invoke-Step "Full test suite" {
  npm test
}

Invoke-Step "Production build" {
  npm run build
}

Invoke-Step "Whitespace and patch validation" {
  git diff --check
}

$nextEnvAfter = if (Test-Path -LiteralPath "next-env.d.ts") {
  (Get-FileHash -Algorithm SHA256 -LiteralPath "next-env.d.ts").Hash
} else {
  ""
}

Write-Host ""
Write-Host "=== Final Git state ===" -ForegroundColor Cyan
git status --short
Write-Host ""
git diff --stat

if ($nextEnvBefore -ne $nextEnvAfter) {
  Write-Host ""
  Write-Host "NOTICE: next-env.d.ts changed during validation." -ForegroundColor Yellow
  Write-Host "Before SHA256: $nextEnvBefore"
  Write-Host "After  SHA256: $nextEnvAfter"
  Write-Host "This script did not restore or modify it manually."
}

Write-Host ""
Write-Host "WORDPRESS APPROVAL BACKUP DISCOVERY FIXED AND FULL VALIDATION COMPLETED" -ForegroundColor Green
Write-Host "No commit, push, merge, stash, reset, clean, restore, or rebase was executed."
