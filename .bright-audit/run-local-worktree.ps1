$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$sourceRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $sourceRoot ".git"))) {
    throw "Run this from the repository root: F:\Project\bright-editor-platform"
}

$remoteBranch = "fix/wordpress-full-audit"
$remoteTrackingRef = "refs/remotes/origin/$remoteBranch"
$remoteHeadRef = "refs/heads/$remoteBranch"
$expectedBundleHash = "01b319612e226329b2c0c19fa278f5984b6fbdf85aadcab1f66be99be35241ac"
$parent = Split-Path $sourceRoot -Parent
$stamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$localBranch = "fix/wordpress-full-audit-local-$stamp"
$worktree = Join-Path $parent "bright-editor-platform-full-audit-$stamp"
$tempScript = Join-Path $env:TEMP "bright-full-audit-$stamp.mjs"

Write-Host "[1/9] Fetching and refreshing the protected remote-tracking branch."
git -C $sourceRoot fetch origin "+${remoteHeadRef}:${remoteTrackingRef}"
if ($LASTEXITCODE -ne 0) { throw "Could not refresh the protected remote-tracking branch." }

$resolvedRemoteCommit = (git -C $sourceRoot rev-parse "origin/$remoteBranch").Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($resolvedRemoteCommit)) {
    throw "Could not resolve the protected remote-tracking branch."
}
Write-Host "Protected branch commit: $resolvedRemoteCommit"

Write-Host "[2/9] Creating an isolated worktree: $worktree"
git -C $sourceRoot worktree add -b $localBranch $worktree "origin/$remoteBranch"
if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated worktree." }

Push-Location $worktree
try {
    Write-Host "[3/9] Reading and verifying the correction bundle stored in Git."
    $bundlePath = ".bright-audit/bundle.mjs.gz.b64"
    $encoded = (git show "HEAD:$bundlePath") -join ""
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($encoded)) {
        throw "Could not read the correction bundle archive."
    }

    try {
        $compressedBytes = [Convert]::FromBase64String(($encoded -replace "\s", ""))
    }
    catch {
        throw "The correction bundle archive is not valid Base64."
    }

    $compressedStream = [IO.MemoryStream]::new($compressedBytes)
    $gzipStream = [IO.Compression.GZipStream]::new(
        $compressedStream,
        [IO.Compression.CompressionMode]::Decompress
    )
    $scriptStream = [IO.MemoryStream]::new()
    try {
        $gzipStream.CopyTo($scriptStream)
    }
    finally {
        $gzipStream.Dispose()
        $compressedStream.Dispose()
    }
    $scriptBytes = $scriptStream.ToArray()
    $scriptStream.Dispose()

    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $actualBundleHash = ([BitConverter]::ToString(
            $sha256.ComputeHash($scriptBytes)
        )).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }

    if ($actualBundleHash -ne $expectedBundleHash) {
        throw "Correction bundle SHA-256 mismatch. Expected $expectedBundleHash but received $actualBundleHash."
    }

    [IO.File]::WriteAllBytes($tempScript, $scriptBytes)

    node --check $tempScript
    if ($LASTEXITCODE -ne 0) { throw "Correction bundle syntax validation failed." }

    Write-Host "[4/9] Applying the root-cause correction bundles."
    $previousExpectedBranch = $env:BRIGHT_AUDIT_EXPECTED_BRANCH
    $bundleExitCode = 0
    try {
        $env:BRIGHT_AUDIT_EXPECTED_BRANCH = $localBranch
        node $tempScript $worktree --apply
        $bundleExitCode = $LASTEXITCODE
    }
    finally {
        if ($null -eq $previousExpectedBranch) {
            Remove-Item Env:BRIGHT_AUDIT_EXPECTED_BRANCH -ErrorAction SilentlyContinue
        }
        else {
            $env:BRIGHT_AUDIT_EXPECTED_BRANCH = $previousExpectedBranch
        }
    }
    if ($bundleExitCode -ne 0) { throw "Correction bundle application failed." }

    Write-Host "[5/9] Verifying that next-env.d.ts is unchanged."
    git diff --exit-code -- next-env.d.ts
    if ($LASTEXITCODE -ne 0) { throw "next-env.d.ts changed. Stopping." }

    Write-Host "[6/9] Installing dependencies."
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

    Write-Host "[7/9] Running the complete automated verification suite."
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "typecheck failed." }

    npm run lint
    if ($LASTEXITCODE -ne 0) { throw "lint failed." }

    npm test
    if ($LASTEXITCODE -ne 0) { throw "tests failed." }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed." }

    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "git diff --check failed." }

    Write-Host "[8/9] Removing one-time files and committing verified changes only."
    Remove-Item -Recurse -Force ".bright-audit"
    Remove-Item -Force ".github/workflows/bright-full-audit-fix.yml" -ErrorAction SilentlyContinue
    Remove-Item -Force ".github/workflows/bright-actions-diagnostic.yml" -ErrorAction SilentlyContinue
    Remove-Item -Force ".bright-audit-result.md" -ErrorAction SilentlyContinue

    git add -A
    git diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw "The staged diff check failed." }

    git commit -m "fix: align evidence preview metrics and draft gates"
    if ($LASTEXITCODE -ne 0) { throw "Could not commit the verified changes." }

    Write-Host "[9/9] Pushing to the protected fix branch. main and PR #39 stay unchanged."
    git push origin "HEAD:$remoteBranch"
    if ($LASTEXITCODE -ne 0) { throw "Could not push the protected fix branch." }

    Write-Host ""
    Write-Host "SUCCESS: Verified corrections were pushed to origin/$remoteBranch." -ForegroundColor Green
    Write-Host "Isolated worktree: $worktree"
}
catch {
    Write-Host ""
    Write-Host "FAILED: Unverified product changes were not pushed." -ForegroundColor Red
    Write-Host "Reason: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Diagnostic worktree: $worktree"
    throw
}
finally {
    Pop-Location
    Remove-Item -Force $tempScript -ErrorAction SilentlyContinue
}
