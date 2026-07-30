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
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE." }
}

function Read-Utf8File {
  param([string]$Path)
  $resolved = Resolve-Path -LiteralPath $Path
  $bytes = [System.IO.File]::ReadAllBytes($resolved)
  $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  $offset = if ($hasBom) { 3 } else { 0 }
  $encoding = [System.Text.UTF8Encoding]::new($false)
  $text = $encoding.GetString($bytes, $offset, $bytes.Length - $offset)
  [pscustomobject]@{ Path = $resolved.Path; HasBom = $hasBom; Encoding = $encoding; Text = $text }
}

function Write-Utf8File {
  param([string]$Path, [string]$Text, [bool]$HasBom, [System.Text.UTF8Encoding]$Encoding)
  $encoded = $Encoding.GetBytes($Text)
  if ($HasBom) {
    $output = New-Object byte[] ($encoded.Length + 3)
    $output[0] = 0xEF; $output[1] = 0xBB; $output[2] = 0xBF
    [Array]::Copy($encoded, 0, $output, 3, $encoded.Length)
  } else { $output = $encoded }
  [System.IO.File]::WriteAllBytes($Path, $output)
}

function Replace-ExpectedText {
  param([string]$Path, [string]$Old, [string]$New, [int]$ExpectedCount, [string]$BackupRoot)
  $file = Read-Utf8File $Path
  $oldCount = ([regex]::Matches($file.Text, [regex]::Escape($Old))).Count
  $newCount = ([regex]::Matches($file.Text, [regex]::Escape($New))).Count
  if ($oldCount -eq 0 -and $newCount -ge $ExpectedCount) {
    Write-Host "Already updated: $Path" -ForegroundColor Yellow
    return
  }
  if ($oldCount -ne $ExpectedCount) {
    throw "Unexpected source state in $Path. Expected old count $ExpectedCount, actual $oldCount, current new count $newCount. No write was performed."
  }
  $relative = [System.IO.Path]::GetRelativePath($RepositoryPath, $file.Path)
  $backupPath = Join-Path $BackupRoot $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $backupPath) -Force | Out-Null
  Copy-Item -LiteralPath $file.Path -Destination $backupPath -Force
  Write-Utf8File $file.Path ($file.Text.Replace($Old, $New)) $file.HasBom $file.Encoding
  Write-Host "Updated: $Path" -ForegroundColor Green
  Write-Host "Backup:  $backupPath" -ForegroundColor DarkGray
}

if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) { throw "Repository path does not exist: $RepositoryPath" }
Set-Location -LiteralPath $RepositoryPath

$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()
if ($branch -ne "feat/wordpress-draft-publishing") { throw "Branch mismatch. Expected feat/wordpress-draft-publishing, actual $branch." }
if ($head -ne "edea915e15d9e350bd0ceb99aad42a6e52056a61") { throw "HEAD mismatch. Expected edea915e15d9e350bd0ceb99aad42a6e52056a61, actual $head." }

$routePath = "app/api/studio/route.ts"
$editorPath = "app/user-flow/EditorWorkspace.tsx"
$seoTestPath = "tests/unit/app/api/ContentDeletionAndSeoPolicy.test.ts"
$visibilityTestPath = "tests/unit/app/user-flow/TistoryPublishingOverlayVisibility.test.ts"
foreach ($requiredPath in @($routePath, $editorPath, $seoTestPath, $visibilityTestPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Required file is missing: $requiredPath" }
}

$routeSource = (Read-Utf8File $routePath).Text
$editorSource = (Read-Utf8File $editorPath).Text
if (-not $routeSource.Contains("placeAvailablePublishingPosts")) { throw "The platform-neutral catalog implementation is not present in app/api/studio/route.ts." }
if ($routeSource.Contains("placeAvailableTistoryPosts")) { throw "The old Tistory-only placement function still exists in app/api/studio/route.ts." }
if (-not $editorSource.Contains("candidates={publicPostCatalogEnabled ? postCandidates : []}")) { throw "The platform-neutral candidate gate is not present in EditorWorkspace.tsx." }

$backupRoot = Join-Path $HOME ("BrightStudioPatchBackups\wordpress-approval-final-regression-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

Replace-ExpectedText $seoTestPath "placeAvailableTistoryPosts" "placeAvailablePublishingPosts" 5 $backupRoot
Replace-ExpectedText $visibilityTestPath "candidates={tistoryEnabled ? postCandidates : []}" "candidates={publicPostCatalogEnabled ? postCandidates : []}" 1 $backupRoot

$repositoryBackupRoot = Join-Path $RepositoryPath ".bright-studio\patch-backups"
if (Test-Path -LiteralPath $repositoryBackupRoot -PathType Container) {
  $externalBackupPath = Join-Path $HOME ("BrightStudioPatchBackups\repository-internal-" + (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
  Move-Item -LiteralPath $repositoryBackupRoot -Destination $externalBackupPath
  Write-Host "Moved repository-internal backups outside test discovery: $externalBackupPath" -ForegroundColor Green
}

$unexpectedTestBackups = Get-ChildItem -LiteralPath (Join-Path $RepositoryPath ".bright-studio") -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '\.(?:test|spec)\.[cm]?[jt]sx?$' }
if ($unexpectedTestBackups) { throw "Test-like backup files remain under .bright-studio: $($unexpectedTestBackups.FullName -join ', ')" }

$updatedSeoTest = (Read-Utf8File $seoTestPath).Text
$updatedVisibilityTest = (Read-Utf8File $visibilityTestPath).Text
if ($updatedSeoTest.Contains("placeAvailableTistoryPosts")) { throw "Old Tistory-only function expectations remain in ContentDeletionAndSeoPolicy.test.ts." }
if (([regex]::Matches($updatedSeoTest, [regex]::Escape("placeAvailablePublishingPosts"))).Count -lt 5) { throw "The platform-neutral function expectations were not fully written." }
if (-not $updatedVisibilityTest.Contains("candidates={publicPostCatalogEnabled ? postCandidates : []}")) { throw "The platform-neutral editor candidate expectation was not written." }

Write-Host ""
Write-Host "=== Updated regression tests ===" -ForegroundColor Cyan
git diff -- $seoTestPath $visibilityTestPath

$nextEnvBefore = if (Test-Path -LiteralPath "next-env.d.ts") { (Get-FileHash -Algorithm SHA256 -LiteralPath "next-env.d.ts").Hash } else { "" }

Invoke-Step "Three previously failing regression assertions" { npx.cmd vitest run $seoTestPath $visibilityTestPath }
Invoke-Step "TypeScript typecheck" { npm.cmd run typecheck }
Invoke-Step "ESLint" { npm.cmd run lint }
Invoke-Step "Full test suite" { npm.cmd test }
Invoke-Step "Production build" { npm.cmd run build }
Invoke-Step "Whitespace and patch validation" { git diff --check }

$nextEnvAfter = if (Test-Path -LiteralPath "next-env.d.ts") { (Get-FileHash -Algorithm SHA256 -LiteralPath "next-env.d.ts").Hash } else { "" }

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
