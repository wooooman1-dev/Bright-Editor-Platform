# Tistory Media Upload Workflow

## Status

Implemented on `feat/image-workspace-mvp` as an extension of the Image Workspace MVP.

This feature is not merged into `main` and still requires one real-account verification after local integration.

## Purpose

Convert Bright Studio local image assets into Tistory-hosted image URLs before saving a Tistory draft.

The canonical `ContentDocument` continues to own image intent, ALT text, prompt, purpose, and local asset references. Platform-specific upload behavior remains inside the Tistory app boundary.

## Architecture

```text
ContentDocument local image
→ TistoryMediaUploadPlan
→ Permission Gate: media.upload
→ Tistory media preparation worker
→ Tistory CDN URL
→ Draft command HTML replacement
→ Existing Tistory draft worker
→ Draft save
→ Existing reopen verification
```

The existing draft worker remains responsible for title, HTML body, category, tags, Draft Only enforcement, save confirmation, and draft reopen verification.

The media preparation worker is separate. It uploads media and rewrites the command file but does not click Draft Save, Complete, Publish, Schedule, Update, or Delete controls.

## Permission Policy

`media.upload` is a registered automation permission.

It is intentionally excluded from `safeDraftPermissions`, so existing and newly connected accounts do not receive it automatically.

The user must explicitly enable it for a connected Tistory account from:

```text
Workspace Settings
→ 이미지 권한
→ 임시저장 시 이미지 업로드 허용
```

Enabling media upload does not enable public publishing, existing-post updates, deletion, account settings changes, or any other restricted operation.

## Readiness Gate

When a canonical document contains a source matching:

```text
/api/media/<validated-storage-key>
```

Tistory readiness requires `media.upload` for the selected account.

If permission is missing, Draft Save is blocked before Playwright upload or save actions begin. Documents without local images keep the existing Draft Save behavior and do not require media permission.

## Local File Protection

Only validated Bright Studio storage keys are accepted. Local filesystem paths are resolved server-side and never exposed in the browser response or Tistory HTML.

Supported formats remain:

- PNG
- JPEG
- WEBP

## Remote URL Policy

After upload, only HTTPS image URLs from trusted Tistory/Kakao delivery hosts are accepted:

- `kakaocdn.net`
- `daumcdn.net`
- `tistory.com`
- `kakao.com`

Every local placeholder must be replaced. If any placeholder remains, the operation stops before the existing Draft Worker starts.

## Diagnostic Policy

Body-editor, category, and draft-reopen diagnostic modes never run media upload. Diagnostics remain read-only or limited to their previously approved scope.

## Failure Behavior

A failure before Draft Save returns a safe failure and does not proceed to the existing Draft Worker.

Possible safe failures include:

- media permission missing
- local media file missing
- Tistory session expired
- image upload input not found
- remote CDN URL not detected
- untrusted remote URL
- unresolved local placeholder

A separate `media.upload` audit record is written when a document actually requires local-image upload.

## Automated Coverage

The branch includes coverage for:

- local media detection
- deterministic placeholder generation
- external image preservation
- complete placeholder replacement
- HTTPS enforcement
- trusted host enforcement
- default permission denial
- explicit permission grant
- image workspace browser upload and reload persistence

## Remaining External Verification

One real-account verification is still required after the branch is safely integrated into the user's local repository:

1. Enable `media.upload` for the connected Tistory account.
2. Open a canonical document with one local PNG/JPEG/WEBP image.
3. Complete the existing Quality and final-confirmation gates.
4. Save one Tistory draft.
5. Reopen the Tistory draft.
6. Confirm the image is visible and its source is a trusted Tistory/Kakao HTTPS URL.
7. Confirm no public post was created and only one Draft Save occurred.

No paid OpenAI image call is required for this verification; an uploaded local image is sufficient.
