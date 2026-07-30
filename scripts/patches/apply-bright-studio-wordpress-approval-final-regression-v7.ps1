param(
  [string]$RepositoryPath = "F:\Project\bright-editor-platform"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
  param([string]$Name, [scriptblock]$Action)
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Read-Utf8Text {
  param([string]$Path)
  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $bytes = [System.IO.File]::ReadAllBytes($resolved)
  $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  $offset = 0
  if ($hasBom) { $offset = 3 }
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $text = $encoding.GetString($bytes, $offset, $bytes.Length - $offset)
  return New-Object PSObject -Property @{ Path = $resolved; Text = $text; HasBom = $hasBom; Encoding = $encoding }
}

function Write-Utf8Text {
  param([string]$Path, [string]$Text, [bool]$HasBom, [System.Text.UTF8Encoding]$Encoding)
  $encoded = $Encoding.GetBytes($Text)
  if ($HasBom) {
    $output = New-Object byte[] ($encoded.Length + 3)
    $output[0] = 0xEF
    $output[1] = 0xBB
    $output[2] = 0xBF
    [Array]::Copy($encoded, 0, $output, 3, $encoded.Length)
    [System.IO.File]::WriteAllBytes($Path, $output)
  } else {
    [System.IO.File]::WriteAllBytes($Path, $encoded)
  }
}

function Patch-ExactText {
  param(
    [string]$RelativePath,
    [string]$Old,
    [string]$New,
    [int]$ExpectedCount,
    [string]$BackupRoot
  )

  $file = Read-Utf8Text -Path $RelativePath
  $oldCount = ([regex]::Matches($file.Text, [regex]::Escape($Old))).Count
  $newCount = ([regex]::Matches($file.Text, [regex]::Escape($New))).Count

  if ($oldCount -eq 0 -and $newCount -ge $ExpectedCount) {
    Write-Host "Already updated: $RelativePath" -ForegroundColor Yellow
    return
  }

  if ($oldCount -ne $ExpectedCount) {
    throw "Unexpected source state in $RelativePath. Expected old count $ExpectedCount, actual $oldCount, current new count $newCount. No write was performed."
  }

  $backupPath = Join-Path $BackupRoot ($RelativePath -replace '/', '\')
  $backupDirectory = Split-Path -Parent $backupPath
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  Copy-Item -LiteralPath $file.Path -Destination $backupPath -Force

  $updated = $file.Text.Replace($Old, $New)
  Write-Utf8Text -Path $file.Path -Text $updated -HasBom $file.HasBom -Encoding $file.Encoding

  Write-Host "Updated: $RelativePath" -ForegroundColor Green
  Write-Host "Backup:  $backupPath" -ForegroundColor DarkGray
}

if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) {
  throw "Repository path does not exist: $RepositoryPath"
}

Set-Location -LiteralPath $RepositoryPath

$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()

if ($branch -ne "feat/wordpress-draft-publishing") {
  throw "Branch mismatch. Expected feat/wordpress-draft-publishing, actual $branch."
}
if ($head -ne "edea915e15d9e350bd0ceb99aad42a6e52056a61") {
  throw "HEAD mismatch. Expected edea915e15d9e350bd0ceb99aad42a6e52056a61, actual $head."
}

$routePath = "app/api/studio/route.ts"
$editorPath = "app/user-flow/EditorWorkspace.tsx"
$seoTestPath = "tests/unit/app/api/ContentDeletionAndSeoPolicy.test.ts"
$visibilityTestPath = "tests/unit/app/user-flow/TistoryPublishingOverlayVisibility.test.ts"

foreach ($requiredPath in @($routePath, $editorPath, $seoTestPath, $visibilityTestPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required file is missing: $requiredPath"
  }
}

$routeSource = (Read-Utf8Text -Path $routePath).Text
$editorSource = (Read-Utf8Text -Path $editorPath).Text

if (-not $routeSource.Contains("placeAvailablePublishingPosts")) {
  throw "The platform-neutral public post catalog implementation is not present in app/api/studio/route.ts."
}
if ($routeSource.Contains("placeAvailableTistoryPosts")) {
  throw "The old Tistory-only placement function still exists in app/api/studio/route.ts."
}
if (-not $editorSource.Contains("candidates={publicPostCatalogEnabled ? postCandidates : []}")) {
  throw "The platform-neutral candidate gate is not present in EditorWorkspace.tsx."
}

$backupRoot = Join-Path $HOME ("BrightStudioPatchBackups\wordpress-approval-final-regression-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

Patch-ExactText -RelativePath $seoTestPath -Old "placeAvailableTistoryPosts" -New "placeAvailablePublishingPosts" -ExpectedCount 5 -BackupRoot $backupRoot
Patch-ExactText -RelativePath $visibilityTestPath -Old "candidates={tistoryEnabled ? postCandidates : []}" -New "candidates={publicPostCatalogEnabled ? postCandidates : []}" -ExpectedCount 1 -BackupRoot $backupRoot

$repositoryBackupRoot = Join-Path $RepositoryPath ".bright-studio\patch-backups"
if (Test-Path -LiteralPath $repositoryBackupRoot -PathType Container) {
  $externalBackupPath = Join-Path $HOME ("BrightStudioPatchBackups\repository-internal-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
  Move-Item -LiteralPath $repositoryBackupRoot -Destination $externalBackupPath
  Write-Host "Moved repository-internal backups outside test discovery: $externalBackupPath" -ForegroundColor Green
}

$updatedSeoTest = (Read-Utf8Text -Path $seoTestPath).Text
$updatedVisibilityTest = (Read-Utf8Text -Path $visibilityTestPath).Text

if ($updatedSeoTest.Contains("placeAvailableTistoryPosts")) {
  throw "Old Tistory-only expectations remain in ContentDeletionAndSeoPolicy.test.ts."
}
if (([regex]::Matches($updatedSeoTest, [regex]::Escape("placeAvailablePublishingPosts"))).Count -lt 5) {
  throw "The platform-neutral expectations were not fully written."
}
if (-not $updatedVisibilityTest.Contains("candidates={publicPostCatalogEnabled ? postCandidates : []}")) {
  throw "The platform-neutral editor candidate expectation was not written."
}

Write-Host ""
Write-Host "=== Updated regression tests ===" -ForegroundColor Cyan
git diff -- $seoTestPath $visibilityTestPath

$nextEnvBefore = ""
if (Test-Path -LiteralPath "next-env.d.ts" -PathType Leaf) {
  $nextEnvBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath "next-env.d.ts").Hash
}

Invoke-Step "Three previously failing regression assertions" {
  npx.cmd vitest run $seoTestPath $visibilityTestPath
}
Invoke-Step "TypeScript typecheck" {
  npm.cmd run typecheck
}
Invoke-Step "ESLint" {
  npm.cmd run lint
}
Invoke-Step "Full test suite" {
  npm.cmd test
}
Invoke-Step "Production build" {
  npm.cmd run build
}
Invoke-Step "Whitespace and patch validation" {
  git diff --check
}

$nextEnvAfter = ""
if (Test-Path -LiteralPath "next-env.d.ts" -PathType Leaf) {
  $nextEnvAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath "next-env.d.ts").Hash
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
  Write-Host "The script did not restore or edit it manually."
}

Write-Host ""
Write-Host "WORDPRESS APPROVAL COMPLETION: ALL AUTOMATED VALIDATION PASSED" -ForegroundColor Green
Write-Host "Backups are outside the repository: $backupRoot"
Write-Host "No commit, push, merge, stash, reset, clean, restore, rebase, or public publishing was executed."
