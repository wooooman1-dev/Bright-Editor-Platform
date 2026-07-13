# Publishing Account Permissions

## Product Goal

Users may connect multiple accounts for the same platform and control what Bright Studio is
allowed to do with each account.

The permission experience must be simple for beginners while preserving strict server-side
safety.

## User Mental Model

Users manage accounts, not automation technology.

```text
Workspace Settings
→ Publishing Platforms
→ Account
→ Allowed Actions
```

Do not expose Playwright, cookies, storage-state files, REST endpoints, tokens, or internal
permission identifiers in the normal UI.

## Account List

Example:

```text
Tistory
- 밝은건강 · Connected
- 자동차 블로그 · Connected

WordPress
- brighthealth.co.kr · Connected

YouTube
- 밝은건강TV · Connection required
```

Each account has its own connection state, default publishing policy, and allowed actions.

## User-Facing Permission Labels

Recommended labels:

- 연결 상태 확인
- 임시저장
- 기존 초안 업데이트
- 이미지 업로드
- 카테고리 불러오기 및 선택
- 예약 발행
- 공개 발행
- 기존 콘텐츠 수정
- 콘텐츠 삭제
- 계정 설정 변경

## Default User Experience

New accounts display a safe preset:

```text
기본 안전 설정

ON  연결 상태 확인
ON  임시저장
OFF 기존 초안 업데이트
OFF 이미지 업로드
ON  카테고리 불러오기 및 선택
OFF 예약 발행
OFF 공개 발행
OFF 기존 콘텐츠 수정
OFF 콘텐츠 삭제
OFF 계정 설정 변경
```

The user may change supported permissions later.

## Permission Presets

Provide simple presets:

### Safe Draft Mode — Default

- Verify connection
- Read/select categories
- Create draft
- No public publishing
- No deletion
- No account changes

### Review and Schedule

- Safe Draft Mode permissions
- Schedule approved content
- Public publishing remains separately controlled

### Custom

- User chooses supported permissions individually

Do not provide an unrestricted preset in the initial release.

## Publishing Policy

Permissions and publishing policy are separate.

Permissions answer:

> What may Bright Studio do with this account?

Publishing policy answers:

> When may Bright Studio do it?

Supported policies:

- Review First — recommended default
- Scheduled after Review
- Immediate, only when separately approved in a future release

Review First must support:

- Preview
- User editing
- AI-assisted revision
- Quality recheck
- Final confirmation
- Draft or approved publishing workflow

## Multiple Accounts

A Workspace may connect multiple accounts per platform.

Example:

```text
Tistory
- 밝은건강
- 부동산
- 테스트 블로그
```

Projects select one or more Publishing Accounts as targets.

A Project may define defaults, but account credentials are never duplicated into the Project.

## Publishing Profiles

A future-ready Publishing Profile may group accounts:

```text
Health Profile
- Tistory: 밝은건강
- WordPress: brighthealth.co.kr
- YouTube: 밝은건강TV
```

Profiles reference accounts and never contain copied credentials.

Profile support may be implemented after the account and permission foundations are stable.

## Sequential Publishing

When multiple targets are selected, the default is not simultaneous publishing.

Recommended flow:

```text
Approved Content
→ Publishing Queue
→ Tistory Draft
→ Verification
→ WordPress Draft
→ Verification
→ YouTube Preparation
```

Users can change order and spacing according to supported platform capabilities.

Failure on one target must not automatically continue as if successful. The queue must show the
failed target and allow retry, skip, or stop.

## Dangerous Permissions

Enabling High-risk permissions requires:

- A plain-language warning
- Explicit confirmation
- Display of the affected account
- Display of what Bright Studio will be allowed to do

Critical permissions such as deleting external content or changing account settings are hidden
or unavailable in the initial release.

## Project Experience

In a Project, users see only accounts enabled for that Workspace.

Example:

```text
발행 대상

[✓] 밝은건강 · Tistory
[✓] brighthealth.co.kr · WordPress
[ ] 밝은건강TV · YouTube
```

If an account lacks the required permission, show a clear state:

```text
임시저장 권한이 꺼져 있습니다.
[계정 권한 설정]
```

Do not silently switch to another account.

## Error Messages

Use user-friendly messages:

- 이 계정에는 임시저장 권한이 없습니다.
- 티스토리 연결이 만료되었습니다. 다시 연결해 주세요.
- 공개 발행 권한이 꺼져 있습니다.
- 이 작업은 현재 안전 설정에서 허용되지 않습니다.
- 연결 해제가 완료되지 않았습니다. 다시 시도해 주세요.

Never expose stack traces, cookies, tokens, filesystem paths, or raw browser errors.

## Acceptance Criteria

- Multiple accounts per platform are supported.
- Permissions are managed per account.
- Safe Draft Mode is the default.
- Public publishing is off by default.
- Review First supports user edits before external actions.
- Project target selection respects account permissions.
- Sequential publishing can stop safely on failure.
- Users never configure Playwright or secret paths.
