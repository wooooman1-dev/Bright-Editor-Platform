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

$target = "tests/unit/apps/wordpress/WordPressPostCatalogAdapter.test.ts"
$resolvedTarget = Resolve-Path -LiteralPath $target
$bytes = [System.IO.File]::ReadAllBytes($resolvedTarget)

$hasUtf8Bom = $bytes.Length -ge 3 `
  -and $bytes[0] -eq 0xEF `
  -and $bytes[1] -eq 0xBB `
  -and $bytes[2] -eq 0xBF

$utf8 = [System.Text.UTF8Encoding]::new($false)
$textOffset = if ($hasUtf8Bom) { 3 } else { 0 }
$textLength = $bytes.Length - $textOffset
$source = $utf8.GetString($bytes, $textOffset, $textLength)

$old = 'const request = vi.fn(async () => new Response(JSON.stringify([{'
$new = 'const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([{'

$typedCount = ([regex]::Matches(
  $source,
  [regex]::Escape('const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>')
)).Count

if ($typedCount -ge 1) {
  Write-Host "Fetch mock typing fix is already present; no file rewrite was needed." -ForegroundColor Yellow
} else {
  $index = $source.IndexOf($old, [System.StringComparison]::Ordinal)
  if ($index -lt 0) {
    throw "Expected untyped fetch mock was not found. No file was written."
  }

  $backupRoot = Join-Path $RepositoryPath (
    ".bright-studio\patch-backups\wordpress-approval-test-typing-" +
    (Get-Date -Format "yyyyMMdd-HHmmss-fff")
  )
  $backupPath = Join-Path $backupRoot $target
  $backupDirectory = Split-Path -Parent $backupPath
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  Copy-Item -LiteralPath $target -Destination $backupPath -Force

  $updated = $source.Substring(0, $index) + $new + $source.Substring($index + $old.Length)
  $encoded = $utf8.GetBytes($updated)

  if ($hasUtf8Bom) {
    $output = New-Object byte[] ($encoded.Length + 3)
    $output[0] = 0xEF
    $output[1] = 0xBB
    $output[2] = 0xBF
    [Array]::Copy($encoded, 0, $output, 3, $encoded.Length)
  } else {
    $output = $encoded
  }

  [System.IO.File]::WriteAllBytes($resolvedTarget, $output)

  Write-Host "WordPress post catalog fetch mock typing fixed." -ForegroundColor Green
  Write-Host "Backup: $backupPath" -ForegroundColor DarkGray
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
Write-Host "WORDPRESS APPROVAL TEST TYPING FIX APPLIED AND FULL VALIDATION COMPLETED" -ForegroundColor Green
Write-Host "No commit, push, merge, stash, reset, clean, restore, or rebase was executed."
