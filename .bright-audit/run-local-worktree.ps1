$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$sourceRoot = (Get-Location).Path
if (-not (Test-Path (Join-Path $sourceRoot ".git"))) {
    throw "F:\Project\bright-editor-platform 저장소 루트에서 실행해 주세요."
}

$remoteBranch = "fix/wordpress-full-audit"
$parent = Split-Path $sourceRoot -Parent
$stamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$localBranch = "fix/wordpress-full-audit-local-$stamp"
$worktree = Join-Path $parent "bright-editor-platform-full-audit-$stamp"
$tempScript = Join-Path $env:TEMP "bright-full-audit-$stamp.mjs"

Write-Host "[1/9] 보호 브랜치를 가져옵니다."
git -C $sourceRoot fetch origin $remoteBranch
if ($LASTEXITCODE -ne 0) { throw "보호 브랜치를 fetch하지 못했습니다." }

Write-Host "[2/9] 기존 작업 폴더와 분리된 worktree를 만듭니다: $worktree"
git -C $sourceRoot worktree add -b $localBranch $worktree "origin/$remoteBranch"
if ($LASTEXITCODE -ne 0) { throw "분리 worktree를 만들지 못했습니다." }

Push-Location $worktree
try {
    Write-Host "[3/9] Git에 저장된 수정 Bundle을 조립합니다."
    $base64Builder = [System.Text.StringBuilder]::new()
    foreach ($index in 0..6) {
        $part = ".bright-audit/parts/part-{0:D2}.b64" -f $index
        $value = git show "HEAD:$part"
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($value -join ""))) {
            throw "수정 Bundle 조각을 읽지 못했습니다: $part"
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
    if ($LASTEXITCODE -ne 0) { throw "수정 Bundle 문법 검증에 실패했습니다." }

    Write-Host "[4/9] 원인별 수정 Bundle을 적용합니다."
    node $tempScript
    if ($LASTEXITCODE -ne 0) { throw "수정 Bundle 적용에 실패했습니다." }

    Write-Host "[5/9] next-env.d.ts 불변 상태를 확인합니다."
    git diff --exit-code -- next-env.d.ts
    if ($LASTEXITCODE -ne 0) { throw "next-env.d.ts가 변경되어 중단했습니다." }

    Write-Host "[6/9] 의존성을 설치합니다."
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci에 실패했습니다." }

    Write-Host "[7/9] 전체 자동 검증을 실행합니다."
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "typecheck에 실패했습니다." }

    npm run lint
    if ($LASTEXITCODE -ne 0) { throw "lint에 실패했습니다." }

    npm test
    if ($LASTEXITCODE -ne 0) { throw "test에 실패했습니다." }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build에 실패했습니다." }

    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "git diff --check에 실패했습니다." }

    Write-Host "[8/9] 임시 실행 파일을 제거하고 검증된 변경만 커밋합니다."
    Remove-Item -Recurse -Force ".bright-audit"
    Remove-Item -Force ".github/workflows/bright-full-audit-fix.yml" -ErrorAction SilentlyContinue
    Remove-Item -Force ".github/workflows/bright-actions-diagnostic.yml" -ErrorAction SilentlyContinue
    Remove-Item -Force ".bright-audit-result.md" -ErrorAction SilentlyContinue

    git add -A
    git diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw "커밋 전 diff 검사에 실패했습니다." }

    git commit -m "fix: align evidence preview metrics and draft gates"
    if ($LASTEXITCODE -ne 0) { throw "검증된 변경을 커밋하지 못했습니다." }

    Write-Host "[9/9] 보호 브랜치에 push합니다. main과 PR #39는 변경하지 않습니다."
    git push origin "HEAD:$remoteBranch"
    if ($LASTEXITCODE -ne 0) { throw "보호 브랜치 push에 실패했습니다." }

    Write-Host ""
    Write-Host "성공: 전체 자동 검증을 통과한 수정이 origin/$remoteBranch 에 반영되었습니다."
    Write-Host "분리 worktree: $worktree"
}
catch {
    Write-Host ""
    Write-Host "실패: 검증되지 않은 수정은 원격 브랜치에 push하지 않았습니다." -ForegroundColor Red
    Write-Host "원인: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "진단용 분리 worktree: $worktree"
    throw
}
finally {
    Pop-Location
    Remove-Item -Force $tempScript -ErrorAction SilentlyContinue
}
