$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$sourceRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $sourceRoot ".git"))) {
    throw "Run this from the repository root: F:\Project\bright-editor-platform"
}

$remoteBranch = "fix/wordpress-full-audit"
$parent = Split-Path $sourceRoot -Parent
$stamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$localBranch = "fix/wordpress-full-audit-local-$stamp"
$worktree = Join-Path $parent "bright-editor-platform-full-audit-$stamp"
$tempScript = Join-Path $env:TEMP "bright-full-audit-$stamp.mjs"

Write-Host "[1/9] Fetching the protected branch."
git -C $sourceRoot fetch origin $remoteBranch
if ($LASTEXITCODE -ne 0) { throw "Could not fetch the protected branch." }

Write-Host "[2/9] Creating an isolated worktree: $worktree"
git -C $sourceRoot worktree add -b $localBranch $worktree "origin/$remoteBranch"
if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated worktree." }

Push-Location $worktree
try {
    Write-Host "[3/9] Assembling the correction bundle stored in Git."
    $base64Builder = [System.Text.StringBuilder]::new()
    foreach ($index in 0..6) {
        $part = ".bright-audit/parts/part-{0:D2}.b64" -f $index
        $value = git show "HEAD:$part"
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($value -join ""))) {
            throw "Could not read correction bundle part: $part"
        }
        [void]$base64Builder.Append(($value -join ""))
    }

    $base64 = $base64Builder.ToString() -replace "\s", ""
    $scriptText = [System.Text.Encoding]::UTF8.GetString(
        [Convert]::FromBase64String($base64)
    )
    $scriptText = $scriptText.Replace(
        'const EXPECTED_BRANCH = "fix/wordpress-full-audit";',
        "const EXPECTED_BRANCH = `"$localBranch`";"
    )
    [System.IO.File]::WriteAllText(
        $tempScript,
        $scriptText,
        [System.Text.UTF8Encoding]::new($false)
    )

    node --check $tempScript
    if ($LASTEXITCODE -ne 0) { throw "Correction bundle syntax validation failed." }

    Write-Host "[4/9] Applying the root-cause correction bundles."
    node $tempScript
    if ($LASTEXITCODE -ne 0) { throw "Correction bundle application failed." }

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
