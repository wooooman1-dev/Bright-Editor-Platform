$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Sha256Hex([byte[]]$Bytes) {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString(
            $sha256.ComputeHash($Bytes)
        )).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}

$sourceRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $sourceRoot ".git"))) {
    throw "Run this from the repository root: F:\Project\bright-editor-platform"
}

$remoteBranch = "fix/wordpress-full-audit"
$remoteTrackingRef = "refs/remotes/origin/$remoteBranch"
$remoteHeadRef = "refs/heads/$remoteBranch"
$expectedPartLengths = @(4664, 4664, 4664, 4660)
$expectedBase64Length = 18652
$expectedCompressedHash = "0ba37f2345802775ce298e491c4a03a855e966c39ab3f2ef8e08ed1134016617"
$expectedScriptLength = 56970
$expectedScriptHash = "b9076141bfac3f86eb7e8d40fd7be9ba4f1e7ed810bef5a18fc79a91b708e330"
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
    Write-Host "[3/9] Reading and verifying the four-part correction archive."
    $base64Builder = [Text.StringBuilder]::new()
    for ($index = 0; $index -lt $expectedPartLengths.Count; $index += 1) {
        $partPath = ".bright-audit/archive-v3/part-{0:D2}.b64" -f $index
        $rawPart = (git show "HEAD:$partPath") -join ""
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawPart)) {
            throw "Could not read correction archive part: $partPath"
        }
        $part = $rawPart -replace "\s", ""
        if ($part.Length -ne $expectedPartLengths[$index]) {
            throw "Correction archive part length mismatch: $partPath"
        }
        if ($part -notmatch '^[A-Za-z0-9+/]*={0,2}$') {
            throw "Correction archive part contains invalid Base64 characters: $partPath"
        }
        [void]$base64Builder.Append($part)
    }

    $encoded = $base64Builder.ToString()
    if ($encoded.Length -ne $expectedBase64Length) {
        throw "Correction archive Base64 length mismatch."
    }

    try {
        $compressedBytes = [Convert]::FromBase64String($encoded)
    }
    catch {
        throw "The reconstructed correction archive is not valid Base64."
    }

    $actualCompressedHash = Get-Sha256Hex $compressedBytes
    if ($actualCompressedHash -ne $expectedCompressedHash) {
        throw "Correction archive gzip SHA-256 mismatch."
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

    if ($scriptBytes.Length -ne $expectedScriptLength) {
        throw "Correction script length mismatch."
    }
    $actualScriptHash = Get-Sha256Hex $scriptBytes
    if ($actualScriptHash -ne $expectedScriptHash) {
        throw "Correction script SHA-256 mismatch."
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
