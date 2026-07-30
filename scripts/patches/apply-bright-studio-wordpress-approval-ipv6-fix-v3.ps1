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

$requiredV2Files = @(
  "app/api/publishing/posts/route.ts",
  "app/application/publishing/PublicPostCatalogApplicationService.ts",
  "app/application/publishing/WordPressPostCatalogApplicationService.ts",
  "apps/wordpress/WordPressPostCatalogAdapter.ts",
  "tests/unit/core/content/WordPressRelatedPostRecommendation.test.ts"
)

foreach ($requiredFile in $requiredV2Files) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "The v2 WordPress approval patch is not present. Missing: $requiredFile"
  }
}

Write-Host "Repository: $RepositoryPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "=== Current state before IPv6 fix ===" -ForegroundColor Cyan
git status --short
git diff --stat

$target = "core/content/RelatedPostRecommendation.ts"
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "Target file does not exist: $target"
}

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $target))
$hasUtf8Bom = $bytes.Length -ge 3 `
  -and $bytes[0] -eq 0xEF `
  -and $bytes[1] -eq 0xBB `
  -and $bytes[2] -eq 0xBF

$utf8 = [System.Text.UTF8Encoding]::new($false)
$textOffset = if ($hasUtf8Bom) { 3 } else { 0 }
$textLength = $bytes.Length - $textOffset
$source = $utf8.GetString($bytes, $textOffset, $textLength)
$lineEnding = if ($source.Contains("`r`n")) { "`r`n" } else { "`n" }

$oldBlock = @'
function isPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase("en-US").replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".local")) return false;
  if (normalized === "::1") return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (!ipv4) return true;
  const values = ipv4.slice(1).map(Number);
  if (values.some((value) => value > 255)) return false;
  const [first, second] = values;
  return !(first === 10
    || first === 127
    || first === 0
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168);
}
'@ -replace "`r?`n", $lineEnding

$newBlock = @'
function isPublicHostname(hostname: string): boolean {
  const normalized = hostname
    .toLocaleLowerCase("en-US")
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".local")) return false;
  if (normalized === "::"
    || normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1") return false;
  if (/^(?:fc|fd)[0-9a-f]{2}:/i.test(normalized)) return false;
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return false;

  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(normalized)?.[1];
  const ipv4Candidate = mappedIpv4 ?? normalized;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ipv4Candidate);
  if (!ipv4) return true;

  const values = ipv4.slice(1).map(Number);
  if (values.some((value) => value > 255)) return false;
  const [first, second] = values;
  return !(first === 10
    || first === 127
    || first === 0
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168);
}
'@ -replace "`r?`n", $lineEnding

$backupRoot = Join-Path $RepositoryPath (
  ".bright-studio\patch-backups\wordpress-approval-ipv6-" +
  (Get-Date -Format "yyyyMMdd-HHmmss-fff")
)

if ($source.Contains($newBlock)) {
  Write-Host "IPv6 public-host fix is already present; no file rewrite was needed." -ForegroundColor Yellow
} elseif ($source.Contains($oldBlock)) {
  $backupPath = Join-Path $backupRoot $target
  $backupDirectory = Split-Path -Parent $backupPath
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  Copy-Item -LiteralPath $target -Destination $backupPath -Force

  $updated = $source.Replace($oldBlock, $newBlock)
  if ($updated -eq $source) {
    throw "IPv6 hostname replacement did not change the target file."
  }

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

  [System.IO.File]::WriteAllBytes((Resolve-Path -LiteralPath $target), $output)
  Write-Host "IPv6 hostname safety fix applied." -ForegroundColor Green
  Write-Host "Backup: $backupPath" -ForegroundColor DarkGray
} else {
  throw "Expected v2 isPublicHostname implementation was not found. No file was written."
}

$focusedTests = @(
  "tests/unit/core/content/WordPressRelatedPostRecommendation.test.ts",
  "tests/unit/app/application/publishing/InternalLinkCatalogPolicy.test.ts",
  "tests/unit/apps/wordpress/WordPressPostCatalogAdapter.test.ts",
  "tests/unit/apps/wordpress/WordPressManualSiteReview.test.ts",
  "tests/unit/app/application/approval/ApprovalReadinessApplicationService.test.ts",
  "tests/unit/apps/wordpress/WordPressSiteReadinessAudit.test.ts",
  "tests/unit/core/approval/ApprovalPolicy.test.ts"
)

$nextEnvBefore = if (Test-Path -LiteralPath "next-env.d.ts") {
  (Get-FileHash -Algorithm SHA256 -LiteralPath "next-env.d.ts").Hash
} else {
  ""
}

Invoke-Step "IPv6 URL safety regression test" {
  npx vitest run "tests/unit/core/content/WordPressRelatedPostRecommendation.test.ts"
}

Invoke-Step "Focused approval and catalog tests" {
  npx vitest run @focusedTests
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
Write-Host "WORDPRESS APPROVAL IPV6 FIX APPLIED AND FULL VALIDATION COMPLETED" -ForegroundColor Green
Write-Host "No commit, push, merge, stash, reset, clean, restore, or rebase was executed."
