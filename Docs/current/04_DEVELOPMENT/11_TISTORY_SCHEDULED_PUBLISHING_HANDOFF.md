# Bright Studio — Tistory Native Scheduled Publishing Handoff

Date: 2026-07-28

## Repository

- Repository: `wooooman1-dev/Bright-Editor-Platform`
- Branch: `feat/tistory-native-scheduled-publishing`
- Pull request: `#38`
- Pull request state: Draft
- Base branch: `main`

## Current verified state

The scheduled-publishing foundation and the first-stage read-only Tistory schedule UI probe foundation are implemented.

Automated Windows validation passed at runtime code commit `262d2ae`:

```text
npm run typecheck — passed
npm run lint — passed
npm test — passed
  Test Files: 183 passed, 7 skipped
  Tests: 936 passed, 17 skipped
npm run build — passed
git diff --check — passed
```

The production route list included:

```text
/api/publishing/schedules/ui-probe
```

Later commits only update validation evidence and documentation.

## Verified Bright Studio UI evidence

A real browser screenshot confirmed that the connected Tistory accounts `bright-healthy` and `viva-rain` both displayed schedule registration as allowed after permission enablement.

The screenshot did not independently prove:

- the original default-off state
- the exact confirmation-dialog text
- persisted public-publish permission state
- preservation of unrelated permissions after disabling schedule permission

Those checks remain pending.

## Verified first external Tistory probe

The first-stage probe ran against:

- connection: `bright-healthy`
- editor URL: `https://bright-healthy.tistory.com/manage/newpost`
- observed at: `2026-07-28T09:08:03.901Z`

Verified result:

```text
status: diagnosed
workflow: schedule.verify
readOnly: true
total click count: 0
restricted click count: 0
title length: 0 -> 0
body text length: 0 -> 0
visible controls: 52
visible dialogs: none
```

No Draft save, publication, schedule registration, deletion, title edit, or body edit occurred.

Stable DOM evidence recorded:

- `#category-btn`
- `#post-title-inp`
- `#editor-mode-layer-btn`
- `#tagText`
- `#preview-btn`
- `#grammar-check-btn`
- `#publish-layer-btn`

The PowerShell console rendered Korean text with mojibake. Corrupted Korean labels must not be used as locator evidence. Use stable IDs, roles, and ARIA attributes only.

## Safety contract

The first-stage probe remains read-only and contains no Playwright `.click()`, `.fill()`, or `.selectOption()` call.

The existing Tistory Draft worker was not changed.

The following remain forbidden until separately designed, implemented, and validated:

- final schedule registration click
- date or time selection
- immediate public publication
- Draft save through the schedule workflow
- schedule update or cancel
- existing-post edit or delete
- local or recurring scheduler

`publish.execute` remains independent and disabled.

## Approved foundation already implemented

- platform-independent `ScheduledPublication` model
- explicit `schedule.create`, `schedule.update`, and `schedule.cancel` permissions
- registered `schedule.create` and read-only `schedule.verify` workflows
- `Asia/Seoul` Tistory MVP application policy
- deterministic schedule fingerprint
- active duplicate prevention
- atomic reservation through serialized persistence update
- interrupted registration recovery to `scheduled_unverified`
- required external registration and verification evidence before `scheduled_verified`
- server-owned schedule readiness API
- current Revision, quality, approval evidence, account, session, category, image permission, schedule permission, time, duplicate, Review First, and Draft Only checks
- Workspace Settings schedule permission API and UI
- first-stage read-only Tistory UI probe worker, service, API, audit, and tests

## Not implemented yet

- canonical `UserData` rich scheduled-publication migration
- Editor scheduling form
- schedule create execution API
- interactive publication-panel probe
- verified reservation-state, date, and time locators
- native Tistory schedule registration worker
- actual native schedule registration
- management-list verification
- editor re-entry verification
- publication-time verification
- schedule update or cancel workflows

## Next proposed step — not yet approved

Design and implement a second-stage publication-panel probe with this exact boundary:

1. click only `#publish-layer-btn` once
2. inventory only the newly visible publication-panel subtree
3. record stable IDs, roles, ARIA attributes, input types, disabled state, and default checked state
4. do not select publication state, date, or time
5. do not click Draft save, immediate publish, reservation confirmation, delete, or final submit
6. verify title and body remain unchanged
7. close the browser without saving

Explicit approval is required before this second-stage probe is implemented.

## Resume commands on another computer

```powershell
git clone https://github.com/wooooman1-dev/Bright-Editor-Platform.git
cd Bright-Editor-Platform
git fetch origin
git switch feat/tistory-native-scheduled-publishing
git pull --ff-only origin feat/tistory-native-scheduled-publishing
npm ci
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
git status
```

Do not merge PR #38 or mark it Ready before native schedule registration, external verification, publication-time verification, and final regression validation are complete.

## Local-only files from the previous computer

The following were not added to Git:

- `Tistory Native Scheduled Publishing MVP 설계안.pdf`
- `run-tistory-schedule-ui-probe.ps1`
- `.bright-studio/diagnostics/tistory-schedule-ui-probe-bright-healthy.json`

They are local evidence or temporary execution files and are not required to restore the source branch. Preserve them separately if needed for audit history.
