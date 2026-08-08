# Bright Studio Current Development Status

Last updated: 2026-08-08

## 1. Baseline

Internal name: `Bright Editor Platform`

Product name: `Bright Studio`

Repository: `wooooman1-dev/Bright-Editor-Platform`

Default branch: `main`

Architecture status: Frozen unless explicitly approved through the Decision Log and related architecture documents.

The current stable release baseline remains Bright Studio `v1.0.0` from commit `9946f9ecc9167b343ff0c7763c62437d593764ea`.

PR `#38`의 externally verified Tistory native Schedule Create MVP는 `main`에 병합되었다. Merge commit은 `1c38eab75492c156b222c30c947be672a68b39df`다.

현재 WordPress 작업 브랜치는 `feat/wordpress-draft-publishing`이다.

Implementation status must be determined from:

1. Decision Log
2. AGENTS.md
3. approved Product and Architecture documents
4. repository implementation
5. automated validation
6. real external verification
7. this status document

A design approval does not mean implementation or external verification is complete.

## 2. Bright Studio v1.0.0 Release Baseline

Release status:

- Product: `Bright Studio`
- Release: `Bright Studio v1.0.0`
- Tag: `v1.0.0`
- Status: Released
- Release date: `2026-07-25`
- Release commit: `9946f9ecc9167b343ff0c7763c62437d593764ea`
- Draft: No
- Prerelease: No

Release verification:

- Test Files: `137 passed`
- Tests: `693 passed`
- Manual Tests: `17 skipped`
- lint: Passed
- TypeScript compilation: Passed
- Next.js production build: Passed
- working tree at release: Clean

Browser verification:

- Planning: Passed
- Generation: Passed
- Quality Review: Passed
- Overall score: `100`
- Approval level: `standard`
- Publishing readiness: Confirmed
- Contextual internal link: `1`
- Related content links: `3`
- Internal-link diagnostic wording: Matched actual placement result

Frozen release areas:

- Quality score calculation logic
- Internal-link placement logic

Changes to frozen behavior require actual reproduction evidence, code-path inspection, user approval, minimal modification and regression validation.

## 3. Current Branch and Pull Request

Current active branch:

```text
feat/wordpress-draft-publishing
```

Merged pull request:

```text
PR #38
Base: main
State: Merged
Merged: Yes
Merge commit: 1c38eab75492c156b222c30c947be672a68b39df
```

The Tistory Schedule Create MVP is implemented and externally verified. PR `#38` is complete and no longer an open Gate.

Current WordPress documentation baseline:

```text
Base commit: 1c38eab75492c156b222c30c947be672a68b39df
Branch: feat/wordpress-draft-publishing
Detailed design: Approved
Integrated MVP implementation: Not Started
```

Local repository state confirmed before this documentation update:

- synchronized with `origin/feat/wordpress-draft-publishing`
- current branch `feat/wordpress-draft-publishing`
- working tree clean before the requested documentation edits
- no pre-existing local diff

The next Gate is user approval of the WordPress documentation diff before implementation begins.

## 4. Sprint Summary

| Sprint | Scope | Design | Implementation | Verification | Current Status |
|---|---|---|---|---|---|
| 1 | Platform and Content Foundation | Approved | Complete | Complete | Completed |
| 2 | Content Processing Engine | Approved | Complete | Complete | Completed |
| 3 | Product UI Foundation | Approved | Complete | Complete | Completed |
| 4 | Usable Content and Safe Draft Workflow | Approved | Complete | Automated complete; real Tistory Draft reopen gate pending | Environment Verification Pending |
| 5 | Editorial Quality Pipeline | Approved | Complete | Complete | Completed |
| 6 | Presentation Architecture, Bright Components and Tistory Scheduling | Approved | Presentation foundation partial; Tistory Schedule Create MVP complete | Schedule Create externally verified; remaining Sprint 6 work pending | Partially Implemented |
| 7 | Project DNA, Content Library and Internal Link Intelligence | Approved | Data Source and Opportunity Intelligence foundation only | Foundation partially externally verified | Partially Implemented |
| 8 | WordPress and Multi-platform Foundation | Approved | Connection and primitive Adapter foundation present; integrated Draft MVP not implemented | Real WordPress Draft verification not started | Detailed MVP Design Approved / Not Implemented |

No whole Sprint may be reported complete because one workstream or foundation inside it is complete.

## 5. Sprint 4 Real-use Gate

The Tistory Draft external Gate remains:

```text
Editor
→ Preview
→ Real Tistory Category
→ Final Confirmation
→ Draft Save
→ Reopen Draft
→ Verify Title
→ Verify Meaningful Body
→ Verify Category
→ Verify Non-public State
```

The Sprint may be called externally verified only when the Draft result is saved and reopened successfully.

A Save click or `partially_verified` result is insufficient.

Tistory scheduled publishing verification does not replace this Draft-specific Gate because Schedule Create uses a separate API route, Application Service, audit path and Playwright worker.

## 6. Sprint 5 Editorial Pipeline

```text
AI Generation
→ Rule Quality Review
→ Final Editorial Review
→ Rule Quality Review
→ Candidate Regression Protection
→ Standard Approval or In Review
```

The Editor receives a ready manuscript only after standard `95+` approval.

A non-standard result remains in review and does not trigger an automatic Provider retry.

Current content creation also treats AI topic selection as one atomic Content Opportunity.

- automatic mode proposes complete opportunities
- user-specified mode preserves the requested topic
- confirmation persists one versioned and fingerprinted strategy snapshot
- generation uses the stored server copy
- Quality blocks cross-topic manuscripts before publishing
- evidence is labeled verified, estimated, inferred or unknown
- no measured search volume is claimed without a connected provider

Generation remains one major AI call and Quality Review remains one major AI call.

## 7. Sprint 6 — Presentation Architecture and Tistory Scheduling

Final Sprint name:

```text
Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling
```

Sprint 6 remains partially implemented.

### 7.1 Workstream A — Presentation Architecture

Current status:

- Presentation Contract Foundation: Implemented
- Bright Components and deterministic Resolver: Not fully implemented
- theme-independent semantic HTML Runtime: Not fully implemented
- RenderArtifact/checksum and PreviewApproval: Not fully implemented
- Preview and external Draft using the same verified Artifact: Not fully implemented
- reopened semantic verification: Not fully implemented

### 7.2 Workstream B — Tistory Native Scheduling

The Tistory native **Schedule Create MVP** is implemented and externally verified on PR `#38`.

Implemented:

- platform-independent ScheduledPublication state
- schedule status and transition policy
- future absolute time and timezone validation
- Tistory `Asia/Seoul` policy
- deterministic request fingerprint
- atomic reservation
- active duplicate prevention
- identical active-request idempotency
- failed-identical-request explicit retry
- interrupted and ambiguous-result preservation
- Editor schedule UI and modal
- account and category selection
- Readiness and final confirmation
- current Revision and Quality lock
- `schedule.create` Permission Gate
- conditional `media.upload` Permission Gate
- dedicated Tistory Schedule Create Application Service
- dedicated registered Playwright worker
- native publication panel and reservation controls
- native date, hour and minute selection
- local image upload in the same editor
- ALT application
- representative-image application
- tag application
- management-list external verification
- audit result
- completion UI
- no automatic retry after the final registration click

Safety baseline:

- Review First: ON
- Draft Only: ON
- `public.publish`: OFF
- `publish.execute`: independent and disabled
- create requires explicit account permission
- every create requires final user confirmation
- successful jobs are never retried
- only failed identical jobs may be explicitly retried
- ambiguous final-click results become `scheduled_unverified`

Final automated validation at runtime head `e73d33f`:

```text
npm run typecheck — passed
npm run lint — passed
npm test — passed
  Test Files: 193 passed | 7 skipped
  Tests: 978 passed | 17 skipped
npm run build — passed
git diff --check — passed
git status — working tree clean
Failures — 0
```

No GitHub Actions workflow run is recorded for `e73d33f`. The verified evidence is the completed local Windows validation on the synchronized clean branch.

Real external verification:

- account: `bright-healthy`
- title: `운동 휴식일, 근육 회복을 위한 쉬는 날 판단법`
- category: `건강운동`
- scheduled time: `2026-07-29 10:10` Asia/Seoul
- management state: `[예약]`
- immediate public post: not created

The user opened the scheduled item and confirmed:

- body normal
- image normal
- no vertical image distortion
- ALT normal
- representative image normal
- tags normal
- scheduled state normal

The completion UI confirmed external verification and stopped showing an active-operation animation after completion.

Still outside the verified Create MVP:

- schedule-time update
- schedule cancellation
- publication-time verification
- automatic `published` transition
- existing scheduled-post update
- scheduled-post deletion
- local scheduler
- recurring schedules
- multi-platform scheduling
- immediate public publishing

The Schedule Create MVP is complete, but Sprint 6 as a whole is not complete.

## 8. Sprint 7 — Data Source and Opportunity Intelligence Foundation

The Data Source and Opportunity Intelligence Foundation is implemented.

Implemented foundation:

- Workspace-owned DataSourceConnection separated from Publishing PlatformConnection
- Project Data Source references
- DPAPI SecretStore reuse and secret-free public API models
- official Search Console, GA4, AdSense and NAVER Search Trend adapters
- separate raw snapshots and normalized Evidence repository
- manual sync
- duplicate-period cache
- operation/version stale-result guard
- failure isolation
- centralized freshness policy
- Project metadata and public-URL-limited internal growth Evidence
- server-only comprehensive, market opportunity and blog growth classifications
- atomic Opportunity Evidence persistence and restore
- Evidence-aware recommendation cards
- Workspace Settings Data Sources UI
- deterministic Quality guards for unsupported market claims

Previously completed automated verification:

- Test Files: `118 passed`
- Tests: `589 passed`
- skipped: `6 files`, `14 tests`
- lint, typecheck, test, build and `git diff --check`: Passed

Externally verified:

- Google Search Console OAuth real login
- actual Search Console property list retrieval
- `https://bright-healthy.tistory.com/` selection
- `siteOwner` permission
- actual Search Console synchronization and Snapshot creation
- NAVER Search Trend real connection and synchronization
- actual legacy Search Console Data Source deletion
- `DELETE /api/data-sources` HTTP 200

Still pending:

- GA4 real-account production verification
- AdSense real-account production verification
- automatic token refresh after actual expiry
- quota-limit behavior
- additional production Provider response variants

Google Ads Keyword Planning and Google Trends remain inactive until official access is available and verified.

### 8.1 Content Intelligence Scope Boundary

Implemented:

- Content Opportunity
- Planning state persistence
- Data Source and Opportunity Intelligence Foundation

Not implemented as a complete Sprint 7 system:

- Project DNA
- Content Library
- Published Content Registry
- Search Intent Memory
- Keyword Memory
- Topic Memory
- Duplicate Detection
- Cannibalization Detection
- Internal Link Intelligence

Sprint 7 as a whole must not be reported implemented or verified.

## 9. Google Search Console OAuth and Safe Deletion

Implemented OAuth behavior includes:

- official `googleapis` server-side OAuth client
- callback route `/api/data-sources/google/callback`
- short-lived server-stored one-time state
- internal return-path validation
- DPAPI storage for access and refresh tokens
- access-token refresh logic with refresh-token preservation
- official Search Console `sites.list` projection
- server-side property allow-list validation
- configuration-required state until property selection
- Connection-ID-preserving reconnection
- Snapshot and Evidence retention
- legacy manual token reconnect detection

Safe deletion behavior includes:

- separate disable, disconnect and delete contracts
- versioned secret-free backup
- strong confirmation for active connection deletion
- active sync invalidation
- best-effort OAuth revoke
- mandatory local SecretStore cleanup
- tombstone protection
- Workspace-wide Project reference cleanup
- historical Snapshot, Evidence, Opportunity, Quality, ContentDocument and History preservation
- late-result rejection after deletion

## 10. Sprint 8 — WordPress and Multi-platform Foundation

Detailed design status: Approved

Integrated WordPress Draft MVP status: Not implemented

Active implementation branch: `feat/wordpress-draft-publishing`

Existing verified repository foundation:

- WordPress connection UI in Workspace Settings
- site address, username and Application Password input
- connection test
- safe save
- connection status display
- `/wp-json` site discovery
- `/wp-json/wp/v2/users/me?context=edit` authentication check
- `edit_posts` capability check
- Application Password stored in SecretStore
- Secret omitted from public connection response
- basic WordPress HTML Renderer
- primitive Draft Adapter that posts title, HTML content and `status: draft`

Current limitations:

- primitive Draft Adapter receives credentials directly
- no integrated Workspace, Project and Content ownership Gate
- no current Revision and Quality lock
- no Publishing Service integration
- no Permission Gate integration
- no dynamic Category read, selection, execution-time revalidation or multiple Category ID flow
- no current-policy Tag omission verification or future Tag contract integration
- no WordPress media upload
- no ALT metadata update through WordPress Media REST resources
- no featured image assignment
- no duplicate Draft prevention
- no Idempotency record or unknown-result reconciliation
- no external Draft re-read verification
- no title, meaningful body, status, category, tag or featured-image verification
- no integrated publishing audit and completion UI

Approved execution mode:

```text
UI
→ Application Service
→ Publishing Service
→ Permission Gate
→ WordPress Adapter
→ WordPress REST API
→ External Re-read Verification
→ Persistence and Audit
→ Completion UI
```

WordPress uses the official REST API, not Playwright.

Core must not know WordPress REST endpoints, URL layout or Application Password format.

PR `#38`은 `main`에 병합되었고 전용 WordPress branch가 생성되었다. WordPress Draft MVP 상세 설계는 승인되었지만 구현은 시작되지 않았다.

Sprint 8 전체를 구현 또는 완료로 표시하지 않는다. 다음 Gate는 이 문서와 관련 승인 문서의 diff를 사용자가 승인한 뒤 코드 구현을 시작하는 것이다.

## 11. Current External Gates

Open external Gates:

- real Tistory Draft Save and reopen verification for Sprint 4
- Epic 1 final Tistory Draft end-to-end Gate
- GA4 production account verification
- AdSense production account verification
- token refresh after an actual expiry
- quota-limit behavior
- additional real Provider response variants
- real WordPress connection and Draft Save verification

Completed external Gate:

- Tistory native Schedule Create MVP registration and scheduled-item detail verification

## 12. Information-Sufficiency and Canonical Review Baseline

Released behavior:

- prose length is not a Quality goal or publishing Gate
- Quality evaluates search-intent fulfillment, reader-problem resolution, required information elements, section completeness, information density, repetition and accuracy
- AI HTML paragraphs are normalized into canonical ContentDocument blocks
- lists, ordered procedures and tables remain canonical structures
- incomplete sections and repeated structures are inspected against the canonical document
- normal multi-sentence paragraphs do not trigger automatic paragraph splitting
- recoverable Quality issues remain inside the single Quality Review
- JSON corruption, document damage and Content Opportunity identity mismatch remain blocking failures
- AI Generation remains one Provider call
- Quality Review remains one Provider call
- unnecessary Provider retries are prohibited

## 13. Next Actions

1. Review the WordPress Draft Publishing MVP documentation diff.
2. Do not begin implementation until the user approves the documentation diff.
3. After approval, implement on `feat/wordpress-draft-publishing` in the sequence defined by `12_WORDPRESS_DRAFT_PUBLISHING_MVP.md`.
4. Complete automated regression with explicit Tistory Draft and Schedule Create protection.
5. Complete real WordPress Category, Media, ALT, Featured Image, Draft and re-read verification.
6. Do not report Sprint 8 complete until its remaining approved scope and external Gates are actually complete.

Do not use `git reset --hard`, `git clean`, force push or unrelated refactoring.

## 14. WordPress Full Audit Branch Update (2026-08-01)

This section supersedes the older WordPress branch and next-action snapshot above for the current audit branch only.

```text
Branch: fix/wordpress-full-audit
Status: Implementation in progress
Local deterministic tests: verified
Browser verification: pending
External WordPress Draft: not verified
```

- D-036과 WordPress 승인 준비 정책의 공식 초기 Category는 `생활재테크` 하나다.
- 사이트·브랜드 정체성은 `밝은재테크`, 콘텐츠 분야는 `생활경제`, WordPress Category는 `생활재테크`로 분리한다. `생활경제`를 Category 이름으로 자동 매칭하지 않는다.
- 정책 이름은 앞뒤 공백 제거와 안전한 Unicode 정규화 후 정확히 비교한다.
- 실제 Category ID는 Connection API가 반환한 값을 사용하며 Core 또는 범용 정책에 ID 2를 고정하지 않는다.
- Project/Connection 기본 Category는 제안값이고, Content에 명시적으로 적용된 Category만 적용 완료로 취급한다.
- 실제 브라우저 화면, 외부 WordPress Draft re-read, GeneratePress 시각 일치와 WordPress KSES sanitizer는 아직 검증하지 않았다.
- `next-env.d.ts`의 generated routes import가 build 환경에 따라 변경되는 문제는 제품 변경과 분리된 환경 이슈로 남아 있다.

## 15. PR #42 Current Development Update (2026-08-08)

This section supersedes Sections 3, 8, 10, 11, 13 and 14 only where their older branch/status statements conflict with the current PR #42 repository state. Historical implementation and verification evidence in those sections remains preserved.

### 15.1 Current branch and PR

```text
Base branch: fix/wordpress-full-audit
Active feature branch: feat/data-source-multi-connections
Pull request: #42
PR state: Open / Draft / Unmerged
Latest automated-verified code HEAD before documentation-only sync: 88efad926c49b1f7ab3bcd011ad7562ffb98122a
GitHub Actions run: 31235886063
```

The branch is no longer accurately described by the older `feat/wordpress-draft-publishing` current-branch statements.

No Ready transition, merge, force push, public publishing or external Draft write has been authorized by this documentation update.

### 15.2 Data Source and Opportunity Intelligence status

The Data Source foundation remains only one part of Sprint 7, but the implementation has advanced beyond the older Foundation snapshot.

Current PR #42 includes and regression-protects:

- one DataSourceConnection owned by zero or one Project;
- reusable provider credentials through separate resource Connections;
- Workspace-unassigned projection shown once rather than repeated under every Project;
- immutable established resource identity;
- current Google resource refresh on credential reuse;
- duplicate Project identity persistence protection and verified migration tooling;
- Project-scoped GSC/NAVER Evidence delivery to Opportunity Planning;
- correction of the lexical filter that previously removed valid finance NAVER Evidence;
- server-owned Evidence confidence derivation and Korean Evidence presentation corrections;
- stale-result and cross-Project/Workspace isolation guards.

Detailed evidence remains in:

```text
Docs/current/04_DEVELOPMENT/05_DATA_SOURCE_MULTI_CONNECTION_STATUS.md
```

Sprint 7 as a whole remains Partially Implemented because Project DNA, the complete Content Library/registry and the full memory/cannibalization/internal-link system are not completed merely by this foundation.

### 15.3 Bright Finance Verification Claim and Source status

The Bright Finance Source Preflight incident produced a Core-shared verification workstream.

Implemented and automated-verified behavior now includes:

```text
approval-aware Planning
→ explicit Verification Plan
→ scoped required Claims
→ Source Preflight when required
→ VerificationSnapshot
→ Generation Verification Gate
→ verified Generation bundle
→ Generated Claim Binding
→ server-owned canonical verification persistence
→ deterministic current-manuscript verification in Quality
→ shared publishing-readiness verification consumption
```

The original Bright Finance failure was an internal `APPROVAL_SOURCE_NOT_READY` mapped to HTTP 400, not an OpenAI transport 400. The false-positive Claim scope caused by an internal-link/related-content mention of `예금자보호` is now protected by a real failure-shape regression test.

Approval-context Planning now automatically selects explicit Verification Planning rather than depending only on a local feature flag. The strict Structured Output schema was corrected before this rollout so the explicit path itself does not introduce a schema-contract Provider 400.

Source identity is dynamic rather than a closed exact-URL list. Previously unseen public HTTPS sources can receive deterministic identity and institution grouping, while unsafe, unofficial, unsupported, stale, conflicting or mismatched sources are rejected without authorizing unsupported Claims.

Detailed contract and limitations:

```text
Docs/current/04_DEVELOPMENT/07_VERIFICATION_CLAIM_SOURCE_STATUS.md
Docs/current/01_PRODUCT/20_APPROVAL_SOURCE_PREFLIGHT.md
```

The earlier conceptual phrase `Phase 6 — Quality Review Claim Linkage` must not be treated as a separate unfinished implementation phase. In the actual repository, current-manuscript Claim integrity is already connected to Quality as part of the completed persistence/Quality integration work.

### 15.4 WordPress status correction

The older statement `Integrated WordPress Draft MVP status: Not implemented` is no longer a sufficient description of the repository.

The current branch contains WordPress publishing-readiness integration and shared Generated Claim verification consumption on top of the earlier WordPress connection/publishing foundation. However, this does **not** prove the latest Source/Verification changes against a real WordPress Draft.

The current factual status is:

```text
WordPress implementation foundation: Implemented beyond the older primitive-only snapshot
Shared verification/readiness linkage: Implemented and automated-verified
Latest Bright Finance live Provider run after Source correction: Pending
Real WordPress Draft using that latest verified-content path: Not performed
Public publish: Not authorized
```

Do not mark Sprint 8 complete from this update alone.

### 15.5 Current automated verification baseline

Latest automated-verified code HEAD before these documentation-only commits:

```text
HEAD: 88efad926c49b1f7ab3bcd011ad7562ffb98122a
GitHub Actions run: 31235886063
Conclusion: success

Typecheck: passed
Lint: passed
Test: passed
Build: passed

Test Files: 292 passed | 8 skipped
Tests: 1629 passed | 20 skipped
```

This is repository automated evidence only. It does not replace live local/provider verification.

### 15.6 Current highest-priority external Gate

For the active Bright Finance source work, the next real Gate is:

```text
new Bright Finance Content
→ Planning 1 call
→ verify explicit Verification Plan
→ inspect scoped Claims
→ Source Preflight
→ inspect real source URLs and VerificationSnapshot
→ only if valid: Generation 1 call
→ Quality Review 1 call
→ inspect final HTML and verification metadata
```

Manual harness:

```text
tests/manual/bright-finance-source-live-verification.test.ts
```

The harness does not perform WordPress Draft save or public publishing.

Until the user's local environment is available, this live Gate remains pending. Automated success must not be reported as external verification.
