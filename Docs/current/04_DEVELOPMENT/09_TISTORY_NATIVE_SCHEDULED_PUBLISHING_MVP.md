# Tistory Native Scheduled Publishing MVP

Status: Implemented and Externally Verified — Create MVP

Final verified runtime head: `e73d33f`

## 1. Goal

Bright Studio registers a reviewed current Content Revision through Tistory's native scheduled publishing controls.

Bright Studio does not wait locally until publication time and does not perform immediate public publishing.

The MVP is Tistory-first while the scheduling domain and safety contracts remain platform-independent.

## 2. Final Implemented Scope

The Create MVP includes:

- Editor-only `예약발행` entry point
- reservation modal
- selected Tistory connection
- selected Tistory category
- absolute future schedule time
- Tistory timezone fixed to `Asia/Seoul`
- Readiness details
- explicit final user confirmation
- current reviewed Revision lock
- standard Quality approval requirement
- Workspace, Project and Content ownership validation
- selected Project publishing-target validation
- `schedule.create` Permission Gate
- `media.upload` Permission Gate when local images exist
- atomic schedule reservation
- deterministic request fingerprint
- active duplicate prevention
- identical active-request idempotency
- failed-identical-request explicit retry only
- interrupted or ambiguous registration preservation
- no automatic retry after the final registration click
- dedicated schedule-create Application Service
- dedicated registered Tistory Playwright worker
- native Tistory publication-panel control
- native reservation date, hour and minute controls
- local image upload in the same editor
- ALT application
- first valid image representative-image application
- tag application
- native Tistory schedule registration
- external management-list verification
- persisted audit result
- completed-result UI

## 3. Execution Boundary

The approved execution path is:

```text
Editor UI
→ Schedule Create API
→ Workspace / Project / Content Ownership Gate
→ Revision and Quality Readiness
→ PublishingPermissionGate(schedule.create)
→ PublishingPermissionGate(media.upload when required)
→ TistoryScheduleCreateApplicationService
→ Registered Tistory Schedule Worker
→ Native Tistory Editor
→ External Management-list Verification
→ ScheduledPublication Result
→ Publishing Audit
→ Completion UI
```

The UI, AI and general Core modules do not call Playwright directly.

The Tistory worker owns platform URLs, selectors and native editor operations. Shared scheduling state, idempotency, status policy and permissions remain platform-independent.

## 4. Safety Policy

The verified safety baseline is:

- Review First: ON
- Draft Only: ON
- Public Publish: OFF
- Quality Approval Required: ON
- `publish.execute`: independent and disabled
- `schedule.create`: explicit per-account permission
- final user confirmation: required for every reservation
- automatic final-click retry: prohibited
- successful reservation retry: prohibited
- only a failed identical reservation may be explicitly retried

A click response alone is not success evidence.

If the final registration click may have succeeded but external verification is unavailable, the result remains `scheduled_unverified`. Bright Studio must not create another reservation automatically.

## 5. ScheduledPublication Contract

The scheduling record preserves:

- ID
- Workspace ID
- Project ID
- Content ID
- platform
- PlatformConnection ID
- locked Revision ID
- schedule time
- timezone
- status
- category ID and name
- request fingerprint
- operation ID
- attempt metadata
- registration timestamp
- verification timestamp
- optional external identifiers and URLs
- safe failure metadata
- creation and update timestamps

Statuses include:

- `registering`
- `scheduled_verified`
- `scheduled_unverified`
- `failed`
- `cancelled`
- `published`

Active duplicate-blocking statuses are:

- `registering`
- `scheduled_verified`
- `scheduled_unverified`

## 6. Readiness Requirements

Schedule Create Readiness verifies:

- Workspace owns the Project
- Project owns the Content
- Tistory is enabled for the Workspace
- the connection belongs to the Workspace
- the connection is a connected Tistory account
- a stored Tistory session exists
- the account is a selected Project publishing target
- `schedule.create` permission is present
- the requested time is an absolute future time
- timezone is `Asia/Seoul`
- no conflicting active schedule exists
- the current Content Revision matches the reviewed Revision
- Quality approval matches the current Revision
- category preparation is explicit
- required local media is available
- `media.upload` permission is present when required
- Review First remains enabled
- Draft Only remains enabled
- immediate public publishing remains disabled

Readiness performs no Playwright mutation.

## 7. Media and Editor Integration

Local media is uploaded inside the same Tistory editor session used for scheduling.

The final implementation:

- prepares deterministic local-image markers
- promotes an inline marker to its nearest valid block before image placement
- uploads the native Tistory image
- waits for valid placed-image geometry
- rejects a native image that remains nested inside a paragraph
- applies ALT text
- selects the first valid image as representative image
- preserves body block layout without vertical image distortion
- applies tags before final reservation registration

The existing Tistory Draft worker remains separate and protected. Schedule Create uses its own API route, Application Service, audit path and registered worker while reusing approved shared Tistory media and tag preparation modules.

## 8. Final Automated Validation

Final Windows validation completed on the latest implementation head `e73d33f`:

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

The skipped suites are the existing manually controlled tests.

No GitHub Actions run is recorded for `e73d33f`; the validation evidence is the completed local Windows validation reported for the clean synchronized branch.

## 9. Real External Verification

A real approved Content was registered through Bright Studio and verified in Tistory.

Verified reservation:

- account: `bright-healthy`
- title: `운동 휴식일, 근육 회복을 위한 쉬는 날 판단법`
- category: `건강운동`
- scheduled time: `2026-07-29 10:10` Asia/Seoul
- Tistory management state: `[예약]`
- no immediate public post was created

The scheduled-post detail screen was then inspected by the user.

Confirmed:

- body rendered normally
- image rendered normally
- image geometry was normal
- ALT was applied
- representative image was applied
- tags were applied
- scheduled state was correct

The Bright Studio completion result also showed:

- reservation processing result
- external verification complete
- completion button working
- completed notice no longer animating as an active operation

## 10. Completion Boundary

The Tistory native **Schedule Create MVP** is implemented and externally verified.

This does not mark all Sprint 6 work complete. Presentation Runtime and the following scheduling operations remain separate future scopes:

- schedule-time update
- schedule cancellation
- publication-time verification
- automatic transition to `published`
- local scheduler
- recurring schedules
- multi-platform scheduling
- immediate public publishing
- existing scheduled-post editing
- scheduled-post deletion

No excluded operation may be inferred from the verified Create MVP.

## 11. PR and Merge Policy

PR `#38` remains Draft until the user explicitly approves Ready status and merge.

Documentation completion does not authorize:

- Draft removal
- merge to `main`
- public publishing activation
- additional scheduling operations

The next repository decision is whether to mark PR `#38` Ready and merge it after the user reviews this final documentation state.
