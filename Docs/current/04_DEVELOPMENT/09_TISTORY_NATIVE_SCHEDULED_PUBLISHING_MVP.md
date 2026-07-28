# Tistory Native Scheduled Publishing MVP

Status: Approved / Foundation and Read-Only UI Probe Implementation In Progress

## 1. Goal

Bright Studio registers a reviewed current Content Revision into Tistory's native scheduled publishing function. Bright Studio does not wait locally until the publication time and does not perform an immediate public publish action.

The MVP remains Tistory-first while keeping the Core scheduling model platform-independent.

## 2. Current Verified Foundation

The following foundation is implemented:

- platform-independent `ScheduledPublication` model
- status and transition policy
- future absolute schedule time and IANA timezone validation
- Tistory application policy fixed to `Asia/Seoul`
- deterministic request fingerprint
- stable persistence keys with legacy record compatibility
- active duplicate prevention
- atomic reservation inside the serialized persistence update boundary
- identical request idempotency
- cancelled-record re-registration policy
- interrupted `registering` recovery to `scheduled_unverified`
- required registration and verification evidence before `scheduled_verified`
- account permissions `schedule.create`, `schedule.update`, and `schedule.cancel`
- registered MVP workflows `schedule.create` and read-only `schedule.verify`
- Tistory schedule Readiness service and API
- Workspace Settings schedule permission API and UI
- focused Core, application, persistence, API, permission, concurrency, and safety tests

The existing Tistory Draft worker remains unchanged and continues to prohibit schedule, public, completion, and delete controls outside its approved Draft workflow.

## 3. Automated Validation Evidence

The foundation through commit `c319eb6` was validated on Windows on 2026-07-28:

- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed
  - Test Files: 180 passed, 7 skipped
  - Tests: 926 passed, 17 skipped
- `npm run build` passed
- `git diff --check` passed

The skipped tests were existing manual suites.

New read-only UI probe commits after `c319eb6` require the same validation commands again before the probe is executed against Tistory.

## 4. Workspace Settings UI Evidence

A real Bright Studio browser screenshot on 2026-07-28 confirms:

- connected Tistory accounts `bright-healthy` and `viva-rain` are displayed in the schedule permission section
- both accounts can display `예약 등록 허용`
- both checkboxes are checked after permission enablement
- the success notice states that Tistory schedule registration was allowed and each schedule must re-confirm the current Revision and scheduled time

The screenshot does not by itself prove:

- the initial default-off state before any interaction
- the exact confirmation-dialog text
- that disabling schedule permission preserves every unrelated permission
- that immediate public publishing remains disabled in persisted server data

Those checks remain pending and must not be inferred from the screenshot alone.

## 5. Read-Only Tistory UI Probe Foundation

A first-stage schedule UI inventory probe is implemented on the feature branch.

Architecture:

```text
API
→ Workspace / Project / Content ownership validation
→ Draft Only policy validation
→ selected Publishing Target validation
→ PublishingPermissionGate(schedule.verify)
→ TistoryScheduleUiProbeApplicationService
→ dedicated Tistory read-only Playwright worker
→ sanitized diagnostic result
→ publishing audit record
```

Files:

- `apps/tistory/workflows/tistory-schedule-ui-probe.mjs`
- `app/application/publishing/TistoryScheduleUiProbeApplicationService.ts`
- `app/api/publishing/schedules/ui-probe/route.ts`
- `tests/unit/app/application/publishing/TistoryScheduleUiProbeApplicationService.test.ts`
- `tests/unit/apps/tistory/TistoryScheduleUiProbeContract.test.ts`
- `tests/unit/app/api/publishing/schedules/ScheduleUiProbeRoute.test.ts`
- `Docs/current/04_DEVELOPMENT/10_TISTORY_SCHEDULE_UI_PROBE.md`

The probe:

- opens the current Tistory new-post editor through the stored session
- reads visible controls and bounded accessibility attributes
- records likely schedule, publish, date, and time candidates without choosing one
- records visible dialog containers
- verifies zero total clicks and zero restricted clicks
- verifies title and body lengths remain unchanged
- does not read article HTML
- writes a publishing audit record

The worker contains no Playwright `.click()`, `.fill()`, or `.selectOption()` call. A contract test prevents these interaction APIs from being added silently.

## 6. Permissions

Account permissions are independent:

- `schedule.create`
- `schedule.update`
- `schedule.cancel`
- `publish.execute`

Scheduling is not included in `safeDraftPermissions`.

Only these scheduling workflows are registered in the current MVP foundation:

- `schedule.create`
- `schedule.verify`

`schedule.verify` maps to `schedule.create` permission and is read-only. It does not require final registration confirmation because it cannot mutate Tistory.

`publish.execute` remains independent and disabled by default.

## 7. ScheduledPublication Contract

A rich scheduled publication stores:

- ID
- Workspace ID
- Project ID
- Content ID
- platform
- PlatformConnection ID
- locked revision ID
- schedule time
- timezone
- status
- category ID and name
- request fingerprint
- operation ID
- attempt metadata
- registration and verification timestamps
- optional external identifiers and URLs
- safe failure metadata
- creation and update timestamps

Statuses:

- `registering`
- `scheduled_verified`
- `scheduled_unverified`
- `failed`
- `cancelled`
- `published`

Active statuses:

- `registering`
- `scheduled_verified`
- `scheduled_unverified`

## 8. Reservation and Retry Safety

Before Playwright schedule registration, the server must reserve the schedule atomically.

Rules:

- the same active exact request returns the existing record
- an active schedule for the same Content and platform blocks another request
- cancelled and published records do not block a new schedule
- an ID collision is rejected
- a failed record can re-enter `registering`
- a stale interrupted `registering` record becomes `scheduled_unverified`
- final-click ambiguity must never trigger an automatic create retry
- external verification is required before `scheduled_verified`

## 9. Readiness Policy

Tistory schedule readiness checks:

- Workspace owns Project and Content
- Tistory is enabled
- connection belongs to the Workspace
- connection is Tistory and connected
- stored Tistory session exists
- account is a selected Project publishing target
- schedule permission is present
- time is an absolute future time
- timezone is `Asia/Seoul` for the Tistory MVP
- no active duplicate exists
- current Content Revision matches reviewed Revision
- approval evidence matches the current Revision
- standard quality approval is ready
- category preparation is explicit
- required media permission is ready
- Review First is enabled
- Draft Only is enabled
- immediate public publishing is disabled

Readiness does not execute Playwright.

## 10. Revision Lock

A schedule is bound to the current reviewed Content Revision.

Later edits do not mutate the scheduled revision. A future update flow must explicitly cancel or replace the existing schedule after external behavior has been verified.

## 11. External Verification Requirement

A Tistory click response is not success evidence.

`scheduled_verified` requires confirmed external evidence such as:

- scheduled item visible in Tistory management
- schedule time matches
- title or stable post identifier matches
- editor re-entry shows the expected scheduled state

If the final registration click may have succeeded but verification is unavailable, store `scheduled_unverified` and run only the read-only verification workflow. Do not retry schedule creation automatically.

## 12. Deliberately Not Implemented

The following are not implemented yet:

- canonical `UserData` rich scheduled-publication type migration
- Editor schedule form
- schedule execution button
- schedule create execution API
- interactive second-stage publication-panel probe
- verified Tistory schedule locators or selectors
- Tistory native schedule registration worker
- actual schedule registration
- management-list verification
- editor re-entry schedule verification
- publication-time verification
- schedule update workflow
- schedule cancel workflow
- local scheduler
- recurring schedules
- multi-platform scheduling
- immediate public publishing

## 13. Next Gate

Before any selector or final-click implementation:

1. pull the latest feature branch
2. run typecheck, lint, all tests, build, and diff check
3. execute one first-stage read-only probe against one selected Tistory account
4. preserve the returned JSON as UI evidence
5. review observed controls and accessibility attributes
6. design a second-stage panel-opening probe separately
7. do not register a schedule during the first-stage probe

PR #38 must remain Draft until actual native schedule registration, external status verification, publication-time verification, and final regression validation are complete.
