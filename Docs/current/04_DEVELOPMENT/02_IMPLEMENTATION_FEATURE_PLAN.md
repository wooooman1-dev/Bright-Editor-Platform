# Bright Editor Platform - Implementation Feature Plan

## Purpose

This document tracks exact implementation units using the required sequence:

```text
Implement -> Test -> Review -> Commit
```

Feature numbering in this document is independent from the Phase 0-8 product roadmap in `Docs/current/01_PRODUCT/02_ROADMAP.md`.

Only one feature may be implemented at a time. Product scope and architecture remain governed by the other documents under `Docs/current`.

---

## Implementation Sequence

### Feature #1 - Establish Development Context

Status: Completed

Commit: `8b7e3c5 docs: establish development context`

### Feature #2 - Initialize Next.js Application

Status: Completed

Commit: `0644dff feat: initialize nextjs application`

### Feature #3 - Define Shared Browser Automation Architecture

Status: Completed

Commit: `257e606 docs: define shared browser automation architecture`

### Feature #4 - Add Chromium Browser Lifecycle

Status: Completed

Commit: `4d240a8 feat: add chromium browser lifecycle`

### Feature #5 - Add Browser Session Storage and Context Management

Status: Completed

Commits:

- `82f8357 feat: add browser session storage manager`
- `3dd3054 feat: add browser context manager`

### Feature #6 - Add Tistory Application Skeleton and Tistory URL Configuration

Status: Completed

Commits:

- `e6abad0 feat: create tistory application skeleton`
- `a9a1569 feat: add tistory url configuration`

---

## Feature #7 - Add Tistory Login Page Foundation

Status: Completed

Commit: `c2cdc0d feat: add tistory login page foundation`

### Purpose

Establish the minimum platform-specific login-entry Page Object boundary without implementing login behavior.

The current documentation does not confirm that the Tistory login entry exposes a direct account and password form. Selectors must therefore remain generic to the documented login entry and must not invent unsupported form elements.

### Scope

- Add platform-specific Tistory login-entry selectors under `apps/tistory/selectors`.
- Add a minimal Tistory login Page Object foundation under `apps/tistory/pages`.
- Keep selector definitions separate from the Page Object.
- Represent only currently required login-entry controls:
  - Account or email input, when applicable to the documented login entry.
  - Password input, when applicable.
  - Login or continue button.
- Allow the Page Object to receive a Playwright `Page` dependency without launching a browser.
- Export only the required public API through `apps/tistory/index.ts`.
- Add automated unit tests that require no external network access.
- Preserve existing behavior and leave the Core Browser Layer unchanged.

### Exclusions

- Browser launch
- Browser navigation
- Real Tistory network access
- Credential loading or credential entry
- Actual login execution
- Kakao login automation
- Login success or failure detection
- Session restoration
- Cookie handling
- Storage-state validation
- Editor navigation
- HTML input
- Draft saving
- Publishing

### Acceptance Criteria

- Login selectors are defined in `apps/tistory`, never in Core.
- Selector definitions are not mixed into workflows.
- A minimal Page Object accepts the appropriate Playwright `Page` dependency without launching a browser.
- The Page Object exposes only approved login-entry elements or locator access required by repository conventions.
- Existing Core Browser Layer files remain unchanged.
- Unit tests verify selector and Page Object behavior without network access.
- Typecheck, lint, tests, and build pass.
- The feature is reviewed and committed independently before Feature #8 begins.

---

## Feature #8 - Add Developer Dashboard

Status: Completed

Implementation Commit: `912cabb feat: add developer dashboard`

UI Redesign Commit: `3a277b6 style: redesign developer dashboard`

### Purpose

Add a development-only web verification page at `/dev` while keeping it separate from the production user interface.

### Scope

- Add the development-only `/dev` route.
- Display Bright Editor Platform development status.
- Display completed Core Browser Layer modules.
- Display available application modules.
- Provide a small Tistory URL Builder verification form.
- Reuse the existing `createTistoryUrls` implementation.
- Keep the initial dashboard minimal and separate from production UI features.

### Exclusions

- Playwright execution
- Browser navigation
- Login
- Credentials
- Cookie or storage-state validation
- Editor input
- Draft saving
- Publishing
- Production dashboard features

### Acceptance Criteria

- `/dev` renders successfully.
- The page is clearly marked development-only.
- Completed Core Browser Layer modules are visible.
- Tistory application status is visible.
- Valid Tistory blog identifiers generate login, admin, and editor URLs.
- Invalid identifiers display a safe validation error.
- Existing `createTistoryUrls` logic is reused.
- No external network access is required.
- Automated tests are included.
- Typecheck, lint, tests, and build pass.

---

## Feature #9 - Add Tistory Login Entry Navigation

Status: Completed

Implementation Commit: `ef7c029 feat: add tistory login entry navigation`

### Purpose

Add the smallest Tistory-specific workflow that navigates an injected Playwright `Page` to the existing Tistory login entry and verifies that the expected login-entry screen is available.

### Scope

- Add a login-entry navigation workflow under `apps/tistory/workflows`.
- Accept an injected Playwright `Page` without launching a browser or creating a browser context.
- Accept the Tistory blog identifier required by the existing URL API.
- Reuse `createTistoryUrls` to obtain the existing login URL.
- Navigate with a clear finite wait strategy and no arbitrary sleeps or `networkidle` dependency.
- Reuse `TistoryLoginPage` to wait for and verify the minimum approved login-entry element.
- Return a small predictable result on success.
- Throw a small Tistory-specific error with predictable messages on failure.
- Export the public workflow API through `apps/tistory/index.ts`.
- Add automated unit tests with mocked Playwright dependencies and no external network access.
- Preserve existing behavior and leave the Core Browser Layer unchanged.

### Architecture Ownership

- Workflow orchestration: `apps/tistory/workflows`
- Tistory URLs: `apps/tistory/config`
- Tistory selectors: `apps/tistory/selectors`
- Tistory Page Objects: `apps/tistory/pages`
- Browser lifecycle and context ownership: unchanged in `core/automation/browser`

### Exclusions

- Browser launch or browser context creation
- Environment variables, credentials, or credential entry
- Kakao login or account lookup clicks
- Login execution or login-success detection
- Cookie saving, session restoration, or storage-state validation
- Blog administration or editor navigation
- HTML input, draft saving, or publishing
- Developer Dashboard controls
- External dependencies
- Core Browser Layer changes
- Real external network access in automated tests

### Acceptance Criteria

- The workflow uses the login URL returned by the existing `createTistoryUrls` implementation.
- The injected `Page` is navigated with an explicit finite timeout and state-based wait.
- Login-entry availability is verified through `TistoryLoginPage` without duplicating selectors.
- Success returns a small predictable result containing the generated login URL.
- Navigation and missing login-entry failures produce predictable Tistory-specific errors.
- Tests mock the injected `Page` and required locator behavior without external network access.
- Existing tests continue to pass.
- Typecheck, lint, tests, build, and `git diff --check` pass.
- Core Browser Layer files remain unchanged.

---

## Feature #10 - Tistory Stored Session Context Preparation

Status: Completed

Commit: `ee8947e feat: add tistory stored session context`

### Purpose

Add a Tistory application-level coordinator that applies Tistory stored-session preparation policy while reusing the existing platform-independent Core browser capabilities.

### Scope

- Add a stored-session context preparation workflow under `apps/tistory/workflows`.
- Accept explicitly injected dependencies consistent with repository conventions.
- Require the caller to provide the storage-state path explicitly.
- Use the existing `BrowserSessionManager` for path validation and storage-state file existence checks.
- If the storage-state file is missing, do not request context creation and return a small immutable result that clearly indicates `missing` with no context.
- If the storage-state file exists, use the existing `BrowserContextManager` to prepare a context with the stored state.
- Return a small immutable result that clearly indicates `prepared` and contains the prepared `BrowserContext` unchanged.
- Leave ownership of closing the returned context with the caller.
- Normalize Core failures into the smallest repository-consistent Tistory workflow error only when needed.
- Export the public workflow API through `apps/tistory/index.ts`.
- Add automated unit tests with no Chromium process or external network access.
- Preserve all existing behavior and leave the Core Browser Layer unchanged.

### Architecture Ownership

- Tistory session-preparation policy and coordinator: `apps/tistory/workflows`
- Storage-state path validation and file existence checks: existing `BrowserSessionManager`
- BrowserContext creation and stored-state loading: existing `BrowserContextManager`
- Browser lifecycle: Core Browser Layer
- Authentication validity verification: separate future `apps/tistory` feature
- Returned BrowserContext shutdown: caller

### Policy Decisions

- The caller explicitly supplies the storage-state path; no environment-variable loading or default real-user path is introduced.
- A missing storage-state file produces a predictable immutable `missing` result and no BrowserContext is created.
- An available storage-state file is passed through the existing Core managers to prepare a BrowserContext.
- The presence or successful loading of storage state does not prove that Tistory considers the session authenticated or valid.
- The workflow does not close the returned BrowserContext automatically.

### Exclusions

- Direct browser launch or Chromium control in the Tistory coordinator
- Chromium execution or external network access in automated tests
- Tistory navigation, including login-entry, administration, or editor navigation
- Credential loading, credential entry, Kakao authentication, or login execution
- Session validity or authentication verification
- Manual cookie inspection or storage-state contents parsing
- Environment-variable loading or a default real-user storage path
- Automatic BrowserContext closing
- HTML input, draft saving, or publishing
- Core Browser Layer changes
- Developer Dashboard controls
- External dependencies

### Acceptance Criteria

- The storage-state path is explicitly supplied by the caller.
- Path validation and file existence checks use the existing `BrowserSessionManager` rather than duplicated file logic.
- A missing storage-state file returns an immutable `missing` result with no context and does not request context creation.
- An available storage-state file requests context preparation through the existing `BrowserContextManager`.
- A prepared result is immutable and returns the created BrowserContext unchanged.
- Neither result implies that the Tistory session is authenticated or valid.
- The workflow does not close the returned context; shutdown remains the caller's responsibility.
- Unit tests verify Core coordination through mocks without launching Chromium or accessing the network.
- Core failures are handled predictably if workflow-level error normalization is implemented.
- The public workflow API is exported through `apps/tistory/index.ts`.
- Existing tests continue to pass.
- Typecheck, lint, tests, build, and `git diff --check` pass.
- Core Browser Layer files remain unchanged.

---

## Feature #11 - Tistory Editor Entry Navigation

Status: Completed

Implementation Commit: `11d8a78 feat: add tistory editor entry navigation`

### Implementation Summary

- Added a Tistory editor-entry navigation workflow under `apps/tistory/workflows`.
- Accepted an injected Playwright `Page` and reused `createTistoryUrls(...).editor`.
- Navigated with an explicit finite timeout and `domcontentloaded` wait strategy.
- Verified the minimum editor-entry success condition through the resulting page URL.
- Returned a small immutable result containing the generated editor URL.
- Normalized invalid blog identifiers, navigation failures, and unavailable editor entry into predictable Tistory-specific errors.
- Exported the public workflow API through `apps/tistory/index.ts`.
- Added unit tests using mocked Playwright behavior with no external network access.
- Left Core Browser Layer files unchanged.

### Validation Results

- `npm run typecheck`: Passed
- `npm run lint`: Passed
- `npm test`: Passed (9 test files, 46 tests)
- `npm run build`: Passed
- `git diff --check`: Passed

---

## Feature #12 - Tistory Editor Ready Check

Status: Completed

Implementation Commit: `96770fc feat: add tistory editor ready check`

### Implementation Summary

- Added a Tistory editor-ready check workflow under `apps/tistory/workflows`.
- Accepted an injected Playwright `Page` and reused the existing Tistory editor-entry navigation workflow.
- Applied an explicit finite timeout while waiting for the Playwright `load` state.
- Used the completed `load` state and final page URL as the minimum editor-ready check.
- Classified login URL redirects as expired sessions and other unavailable entry states as predictable Tistory-specific errors.
- Returned a small immutable ready result containing the generated editor URL and `ready` status.
- Exported the public workflow API through `apps/tistory/index.ts`.
- Added unit tests using mocked Playwright behavior with no external network access.
- Added no selectors, Page Objects, editor DOM automation, or Core Browser Layer changes.

### Validation Results

- `npm run typecheck`: Passed
- `npm run lint`: Passed
- `npm test`: Passed (10 test files, 51 tests)
- `npm run build`: Passed
- `git diff --check`: Passed

### Ready Check Boundary

The ready decision is intentionally limited to Playwright's completed `load` state and the final page URL. It does not inspect the editor DOM or automate editor controls.

---

## Feature #13 - Editor Adapter Foundation

Status: Completed

Implementation Commit: `acef2d4 feat: add editor adapter foundation`

### Implementation Summary

- Added the platform-independent `EditorAdapter` contract under `core/editor`.
- Added the Tistory-specific `TistoryEditorAdapter` foundation under `apps/tistory/editor`.
- Defined a Playwright `Page` injection boundary for the Tistory adapter while leaving browser lifecycle ownership unchanged.
- Defined the future editor capability contract for preparation, readiness, title, content, image, video, button, draft saving, and publishing.
- Exported the Tistory adapter foundation through `apps/tistory/index.ts` and the platform-independent contract through `core/editor/index.ts`.
- Added unit tests for contract compatibility and the no-DOM foundation boundary.
- Implemented no DOM manipulation, selectors, title or content input, image, video, button, draft saving, or publishing behavior.
- Left the existing workflows and Core Browser Layer unchanged.

### Validation Results

- `npm run typecheck`: Passed
- `npm run lint`: Passed
- `npm test`: Passed (11 test files, 53 tests)
- `npm run build`: Passed
- `git diff --check`: Passed

---

## Sprint 1 - Content Foundation

Status: Completed

Implementation Commit: `6e82e02 feat: add content model foundation`

### Implementation Summary

- Added the platform-independent `ContentDocument` and discriminated `ContentBlock` model under `core/content`.
- Added heading, paragraph, image, video, and button block foundations.
- Added the platform-independent `ContentRenderer<Output>` contract without an HTML or platform renderer.
- Added the Sprint 1 `ContentValidator` contract and public API foundation.
- Added unit tests for the Content Model and contracts.

---

## Sprint 2 - Content Processing Engine

Status: Completed

Implementation Commit: `8fcad60 feat(content): add Sprint 2 processing engine`

Final Review Verdict: `APPROVE`

### Pipeline

```text
ContentDocument
  -> ContentNormalizer
  -> ContentValidator
  -> ContentOptimizer
  -> Renderer foundation
```

Pipeline policy:

1. Normalize the document.
2. Validate the normalized document.
3. If validation is invalid, skip the Optimizer and return the normalized document with its validation result.
4. If validation is valid, run the Optimizer and return the optimized document with the validation result.

### Implementation Summary

- Added Content metadata and Content version foundations.
- Added `ContentNormalizer` with safe ID generation, stable ordering, empty-paragraph removal, and conservative heading correction.
- Preserved the Sprint 1 `ContentValidator` interface and compatible `{ issues, valid }` result contract.
- Added `DefaultContentValidator` with stable built-in issue codes and detailed error, warning, and info grouping.
- Added `ContentOptimizer` with safe whitespace normalization, preserved paragraph boundaries, and processing metadata generation.
- Added `ContentPipeline` as orchestration-only coordination for normalize, validate, and conditional optimize behavior.
- Preserved the existing Renderer foundation without adding HTML or platform-specific rendering.
- Added unit tests and verified the existing integration suite.
- Added no Editor, Preview, Publishing, HTML Renderer, Playwright, Apps, or Platform Adapter implementation.

### Final Quality Gate

- `npm run typecheck`: Passed
- `npm run lint`: Passed
- `npm test`: Passed (17 test files, 79 tests)
- `npm run build`: Passed
- `git diff --check`: Passed
- Focused Content tests: Passed (6 test files, 26 tests)

---

## Sprint 2 Verification Tool - Content Processing Playground

Status: Approved and Completed

Implementation Commit: `e75e3b7 chore(dev): add content processing playground`

Route: `/dev/content-processing`

### Purpose and Architecture

- Manually verifies the real Sprint 2 `ContentPipeline` in the running web application.
- Keeps the route and UI outside Core and uses the real `ContentPipeline` through the public Core API.
- Duplicates no Content processing logic and adds no Sprint 3 Content Composer functionality.
- Is available in development; production returns HTTP 404 through `notFound` behavior.

### Samples

- Valid Document
- Missing Image Alt
- Duplicate Block ID
- Invalid Video URL
- Invalid Heading Hierarchy
- Empty Paragraph
- Missing Block IDs
- Mixed Valid Blocks

### Verification Results

- Focused tests: Passed (1 test file, 8 tests)
- `npm test`: Passed (18 test files, 87 tests)
- `npm run typecheck`: Passed
- `npm run lint`: Passed
- `npm run build`: Passed
- `git diff --check`: Passed
- Development route: HTTP 200
- Production route: HTTP 404
- Sprint 3 has not started.

---

## Bright Studio v1.0.0 Release Baseline

Status: Released

Release information:

- Tag: `v1.0.0`
- Release commit: `9946f9ecc9167b343ff0c7763c62437d593764ea`
- Release date: `2026-07-25`
- Latest Release: Yes
- Draft: No
- Prerelease: No

Completed implementation baseline:

- Planning request formatting preservation
- Atomic Content Opportunity identity recovery
- Canonical ContentDocument normalization of generated HTML
- Canonical list, ordered procedure and table conversion
- Canonical structure-based incomplete and repeated section inspection
- Current Revision Quality Review alignment
- Tistory account and Category context preparation before generation
- Category context propagation into Quality and internal-link evaluation
- Verified published URL-only internal links
- Contextual internal link maximum 1
- Related content maximum 3
- No forced link filling when suitable candidates are insufficient
- Readability checks without sentence-count-only paragraph penalties
- AI Generation 1 call
- Quality Review 1 call

Verification:

- Test Files: `137 passed`
- Tests: `693 passed`
- Manual Tests: `17 skipped`
- lint: Passed
- TypeScript: Passed
- production build: Passed
- browser Quality score: `100`
- browser approval: `standard`
- contextual internal link: `1`
- related content links: `3`

Frozen implementation areas:

- Quality score calculation logic
- Internal link placement logic

These areas may only be changed after a real regression is reproduced and the user approves the minimum required correction.

The real Tistory Draft Save and reopened Draft verification remains an independent external Gate and is not inferred from the `v1.0.0` release.

## Current Development State

Sprint 1 — Platform and Content Foundation: Completed

Sprint 2 — Content Processing Engine: Completed

Sprint 3 — Product UI Foundation: Completed

Sprint 4 — Usable Content and Safe Draft Workflow: Implemented and automatically verified; real Tistory `saved` verification pending

Sprint 5 — Editorial Quality Pipeline: Completed

Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling: Approved; Presentation Contract Foundation Implemented, Runtime Not Implemented

Sprint 7 — Project DNA, Content Library, and Internal Link Intelligence: Design Approved; Not Implemented

Sprint 8 — WordPress and Multi-platform Foundation: Design Approved; Not Implemented

Current implementation baseline: Bright Studio `v1.0.0` released from `9946f9ecc9167b343ff0c7763c62437d593764ea`, including the completed Sprint 1–5 baseline, Data Source and Opportunity Intelligence Foundation and the verified canonical HTML, Planning, Category-context and internal-link corrections.

Current external-environment gate: Editor → Preview → Tistory Category → Draft Save → reopened title/body/category and non-public-state verification.

Sprint 6, Sprint 7, and Sprint 8 must not be treated as fully implemented or verified until repository code, tests, and external verification prove completion. The cross-cutting Data Source and Opportunity Intelligence Foundation does not make Sprint 7 as a whole implemented.

Implementation order must be selected explicitly from the approved architecture and the current repository state. Sprint numbering alone does not determine implementation order.

## Integrated Sprint 6 Implementation Plan

Final name: `Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling`

기존 Sprint 6.5는 별도 개발 단계로 사용하지 않는다. 해당 Scheduling 설계는 통합 Sprint의 Workstream B로 흡수한다.

Current status:

- Sprint design: Approved
- Presentation Contract Foundation: Implemented
- Presentation Runtime: Not Implemented
- Scheduling Domain: Not Implemented
- Scheduling Runtime: Not Implemented
- External verification: Not Started

### Gate 0 — Real Tistory Draft Save E2E

통합 Sprint 구현의 선행 Gate는 실제 Tistory Account에서 Draft를 저장하고 다시 열어 제목, 의미 있는 본문 구조, Category와 비공개 상태를 확인하는 것이다. 결과는 전체 `saved` 검증이어야 하며 save click, `partially_verified` 또는 자동 테스트만으로 통과하지 않는다.

Gate 0을 통과하기 전에는 Workstream A Runtime이나 Workstream B 구현을 시작하지 않는다. Sprint 4와 Epic 1도 이 Gate 전에는 `Verified` 또는 `Completed`로 표시하지 않는다.

### Workstream A — Presentation Runtime

1. 기존 Contract Foundation과 Tistory Renderer characterization 보호
2. Bright Components와 allowlisted Component Registry
3. deterministic Presentation Resolver와 semantic fallback
4. theme-independent semantic HTML, sanitizer와 accessibility validation
5. 불변 RenderArtifact, checksum과 version compatibility
6. PreviewApproval과 Content/Registry/Renderer 변경 invalidation
7. Preview와 Draft의 동일 Artifact 사용
8. 실제 Draft 재진입 의미 구조 검증

### Workstream B — Tistory Scheduling

1. ScheduledPublication과 ScheduleJob Domain
2. Asia/Seoul 변환, 상태 전이, idempotency와 Persistence
3. `schedule.publish` 기본 OFF와 Registered Workflow
4. Quality/current Revision, Account, Category와 RenderArtifact 고정
5. 예약 등록마다 사용자 명시 승인
6. Tistory 자체 예약 기능 등록과 외부 검증
7. 고정 대상을 유지한 예약 시간 수정과 명시 승인
8. Draft 보존이 가능한 예약 취소와 명시 승인
9. 예약 목록, 로컬/외부 상태와 unknown 조정
10. 중복 예약 방지와 실패 Job만 재시도
11. 앱 재시작 후 예약 및 Job 상태 복원
12. 실제 Tistory 예약 등록·수정·취소 외부 검증

Revision, Account 또는 Category 변경은 기존 예약에서 허용하지 않는다. 변경하려면 기존 예약을 안전하게 취소하고 새 예약을 생성한다. 예약 취소 과정에 글 삭제가 필요하면 별도 Delete Permission 승인 전 자동 실행하지 않는다.

Out of scope: local Scheduler, recurring schedules, multi-platform scheduling, AI-selected schedule time and automatic immediate public publishing.

통합 Sprint는 자동 테스트가 완료되어도 실제 Draft와 예약 외부 검증 전에는 `Completed` 또는 `Verified`로 표시하지 않는다.

---

## Tistory Usable Flow Completion

Status: Core usable flow is included in Bright Studio `v1.0.0`; final real-account Tistory Draft Save and reopened Draft verification remains pending.

- Replaced the normal post-Project dead end with natural-language planning, confirmation, durable Content creation, generation/manual fallback, Editor, autosave/history, Quality Review, exact Tistory preview, and permission-gated draft save.
- Extended the approved PlatformConnection boundary with least-privilege account permissions and safe audit records.
- Added backup-first Project and Workspace deletion without deleting shared Brands for Project deletion or any external platform content.
- Automated coverage includes planning, duplicate prevention, permission denial, renderer verification states, deletion impact, backup creation, preservation, and rollback.

## Editor Quality and Tistory Preparation Completion

Status: Implemented in repository; harmless real-account category retrieval remains an environment-dependent verification step.

- Replaced the five binary checks with server-calculated, revision-bound ten-dimension scoring and canonical weights.
- Added content-type-aware completeness thresholds and conservative planning/placeholder/structure/link/image/CTA signals.
- Added canonical-text Editor metrics and retained heading structure in the editable representation.
- Added permission-gated Tistory category retrieval through the existing adapter and registered workflow, safe selection persistence, and selected category ID reuse in the draft worker.
- Preserved Draft Only, Review First, final confirmation, stored-session, enabled-platform, account ownership, and current-review enforcement.

## Workspace Settings Integration

Status: Implemented in repository; real-account Publishing verification remains environment-dependent.

- Added a Workspace-scoped user Settings route backed by existing `studioStore`, connection repositories, provider configuration, permission gate, registered automation workflow, backup writer, and deletion service.
- Kept API keys, credentials, cookies, sessions, and secret references server-only.
- Preserved Review First, Draft Only, public-publish denial, and the registered workflow allowlist.
- Connected Create Content to verified Settings accounts while preserving AI and Editor use without a publishing connection.

## Data Source and Opportunity Intelligence Foundation

Status: Implemented in repository and pushed to `main`/`origin/main` at `71d4899d feat: add content intelligence and data source workflows`.

Implemented:

- atomic Content Opportunity confirmation and deterministic alignment
- durable Planning state Persistence with operation/revision stale-write protection
- Workspace-owned `DataSourceConnection`
- same-Workspace `ProjectDataSourceReference`
- Publishing-only `PlatformConnection` separated from market/performance Evidence-only `DataSourceConnection`
- official Search Console, GA4, AdSense and NAVER Search Trend adapters
- Raw Snapshot, normalized Evidence, manual sync, freshness and isolation policies
- server-classified Opportunity recommendations and deterministic unsupported-claim Quality guards
- distinct disable, disconnect and backup-first safe deletion contracts

Automated verification completed:

- 118 test files and 589 tests passed
- 6 files and 14 tests skipped by existing policy
- lint, typecheck, test, build and `git diff --check` passed

Externally verified:

- Google Search Console OAuth real login
- actual Search Console property listing
- `https://bright-healthy.tistory.com/` selection with `siteOwner` permission
- actual Search Console sync and Snapshot creation
- NAVER Search Trend real connection and sync
- actual legacy Google Search Console Data Source deletion
- `DELETE /api/data-sources` HTTP 200

Remaining gates:

- Sprint 4 real Tistory Draft Save reopen verification; Sprint 4 and Epic 1 remain below Verified
- GA4 and AdSense real-account verification
- access-token automatic refresh after real expiry
- quota-limit behavior and additional production Provider response variants
- Google Ads and Google Trends remain inactive until official access is verified

Content Intelligence remains partially implemented. Project DNA, Content Library, Published Content Registry, Search Intent Memory, Keyword Memory, Topic Memory, Duplicate Detection, Cannibalization Detection and Internal Link Intelligence are not implemented. Sprint 7 as a whole is not implemented.
