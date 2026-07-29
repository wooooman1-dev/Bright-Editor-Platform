# Bright Studio — Tistory Native Scheduled Publishing Final Handoff

Date: 2026-07-29

## 1. Repository State

- Repository: `wooooman1-dev/Bright-Editor-Platform`
- Branch: `feat/tistory-native-scheduled-publishing`
- Pull request: `#38`
- Base branch: `main`
- Runtime validation head: `e73d33f`
- Pull request state before documentation update: Open, Draft, Mergeable, not merged

The branch was confirmed locally as synchronized with origin and clean before this documentation update.

PR `#38` must not be marked Ready or merged without explicit user approval.

## 2. Final MVP Result

Tistory native scheduled publishing **Create MVP** is implemented and externally verified.

The completed user flow is:

```text
Editor
→ 예약발행
→ Tistory account selection
→ category selection
→ Asia/Seoul schedule-time selection
→ Readiness
→ final confirmation
→ local image upload
→ ALT and representative-image application
→ tag application
→ native Tistory reservation registration
→ external management-list verification
→ completion result
```

## 3. Implemented Product Behavior

Implemented:

- Editor-only schedule button and modal
- selected Tistory account
- selected category
- absolute future schedule time
- `Asia/Seoul` timezone policy
- Readiness result
- explicit final confirmation
- current reviewed Revision lock
- Quality approval requirement
- Workspace, Project and Content ownership validation
- selected Project publishing-target validation
- `schedule.create` Permission Gate
- conditional `media.upload` Permission Gate
- deterministic request fingerprint
- atomic schedule reservation
- duplicate active-schedule prevention
- identical active-request idempotency
- failed-identical-request explicit retry
- no automatic retry after final registration click
- native publication panel and reservation controls
- native date, hour and minute selection
- local media upload in the same editor
- ALT application
- representative-image application
- tag application
- external Tistory management-list verification
- persisted scheduled result
- publishing audit
- completion UI

## 4. Architecture Boundary

Execution path:

```text
UI
→ Schedule Create API
→ Ownership and Readiness Validation
→ Publishing Permission Gate
→ TistoryScheduleCreateApplicationService
→ Registered Tistory Playwright Worker
→ Tistory Native Editor
→ External Verification
→ ScheduledPublication Persistence
→ Audit and Completion UI
```

Protected boundaries:

- AI does not call Playwright.
- UI does not call Playwright.
- Core does not contain Tistory URLs or selectors.
- Tistory-specific browser behavior stays in `apps/tistory`.
- shared scheduling state and idempotency stay platform-independent.
- the existing Tistory Draft worker remains separate.
- `publish.execute` remains independent and disabled.

## 5. Final Automated Validation

Final local Windows validation on runtime implementation head `e73d33f`:

```text
npm run typecheck — passed
npm run lint — passed
npm test — passed
  Test Files: 193 passed | 7 skipped
  Tests: 978 passed | 17 skipped
npm run build — passed
git diff --check — passed
git status — working tree clean
```

Failures: `0`

The skipped suites are the existing manual suites.

No GitHub Actions workflow run is recorded for `e73d33f`; the completed evidence is the local Windows validation from the synchronized clean branch.

## 6. Real External Verification

A real Content was registered through Bright Studio into Tistory native scheduled publishing.

Verified item:

- account: `bright-healthy`
- title: `운동 휴식일, 근육 회복을 위한 쉬는 날 판단법`
- category: `건강운동`
- scheduled time: `2026-07-29 10:10` Asia/Seoul
- management-list state: `[예약]`
- immediate public post: not created

The user then opened the scheduled item detail screen and confirmed:

- body normal
- image normal
- no vertical image distortion
- ALT normal
- representative image normal
- tags normal
- scheduled state normal

The Bright Studio result screen confirmed:

- scheduled publishing processing result
- external verification complete
- completion button normal
- completed operation notice stopped animating

## 7. Media Placement Fix

The final media fix protects Tistory image block placement.

Verified implementation behavior:

- an inline image marker is promoted to its nearest valid block before native image insertion
- image geometry is checked before representative-image selection
- a native Tistory image nested inside a paragraph is rejected
- invalid geometry is not treated as successful media placement

Regression coverage is included in:

```text
tests/unit/apps/tistory/TistorySameEditorMediaPlacement.test.ts
```

## 8. Duplicate and Retry Safety

Rules:

- an active reservation blocks another reservation for the same Content and platform
- an identical active request returns the existing record
- a successful reservation is never retried
- only a failed identical reservation may be explicitly retried
- final-click ambiguity becomes `scheduled_unverified`
- final-click ambiguity never triggers automatic schedule creation again
- verification failure is not recorded as successful completion

## 9. Scope That Remains Excluded

The verified Create MVP does not include:

- schedule-time update
- schedule cancellation
- publication-time verification
- automatic `published` transition
- existing scheduled-post modification
- scheduled-post deletion
- local scheduler
- recurring schedules
- multi-platform scheduling
- immediate public publishing

These exclusions do not block completion of the Schedule Create MVP, but they prevent the whole Sprint 6 scheduling domain from being reported as fully complete.

## 10. Documentation Status

This final handoff replaces the earlier probe-stage handoff that described schedule creation as unimplemented.

The authoritative Create MVP status is now:

```text
Implementation: Complete
Automated validation: Complete
Real schedule registration: Complete
Management-list verification: Complete
Scheduled-item detail verification: Complete
Tistory Draft regression protection: Preserved
Public publishing: Disabled
PR merge: Awaiting explicit user approval
```

## 11. Next Repository Decision

After reviewing the final documentation, the user must explicitly decide whether to:

1. keep PR `#38` Draft, or
2. mark PR `#38` Ready and merge it into `main`.

No WordPress implementation branch should be based on the feature branch. WordPress work should begin from updated `main` only after the PR merge decision is completed.
