# Bright Studio — Tistory Native Scheduled Publishing Handoff

Date: 2026-07-28

## Repository

- Repository: `wooooman1-dev/Bright-Editor-Platform`
- Branch: `feat/tistory-native-scheduled-publishing`
- Pull request: `#38`
- Pull request state: Draft
- Base branch: `main`

Do not merge or mark the PR Ready yet.

## Current fully validated runtime baseline

Automated Windows validation passed at runtime code commit `644a6d2`:

```text
npm run typecheck — passed
npm test -- tests/unit/app/api/publishing/schedules/SchedulePanelProbeRoute.test.ts — passed
  Test Files: 1 passed
  Tests: 4 passed
npm test — passed
  Test Files: 186 passed, 7 skipped
  Tests: 946 passed, 17 skipped
npm run lint — passed
npm run build — passed
git diff --check — passed
git status — working tree clean
```

The production route list contains:

```text
/api/publishing/schedules/ui-probe
/api/publishing/schedules/panel-probe
```

This validation covers the scheduled-publishing foundation, first-stage zero-click UI probe, second-stage publication-panel probe foundation, shared server context validation, and the raw stored publishing-policy safety check.

## Verified first external Tistory probe

The first-stage zero-click probe ran against:

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

Stable DOM evidence recorded:

- `#category-btn`
- `#post-title-inp`
- `#editor-mode-layer-btn`
- `#tagText`
- `#preview-btn`
- `#grammar-check-btn`
- `#publish-layer-btn`

The PowerShell console rendered Korean text with mojibake. Corrupted Korean labels are not locator evidence.

## First-stage contract remains protected

The original worker remains:

```text
apps/tistory/workflows/tistory-schedule-ui-probe.mjs
```

It still contains no Playwright `.click()`, `.fill()`, or `.selectOption()` call.

Endpoint:

```text
POST /api/publishing/schedules/ui-probe
```

The existing Tistory Draft worker was not changed.

## Second-stage publication-panel foundation implemented and automatically validated

The second-stage foundation is implemented as a separate path.

New worker:

```text
apps/tistory/workflows/tistory-schedule-panel-probe.mjs
```

New application service:

```text
app/application/publishing/TistorySchedulePanelProbeApplicationService.ts
```

New API:

```text
POST /api/publishing/schedules/panel-probe
```

Shared server validation:

```text
app/api/publishing/schedules/ScheduleProbeContext.ts
```

The existing first-stage route reuses the same validation module without changing its worker contract.

The server checks both the normalized safe policy and the raw stored publishing object. A corrupted or legacy persisted state with `draftOnly: false` or `publicPublish: true` is blocked before Playwright starts.

## Second-stage safety boundary

Exactly one Playwright click is permitted:

```text
#publish-layer-btn
```

A successful result requires:

```text
clickCounts.total == 1
clickCounts.allowedOpen == 1
clickCounts.restricted == 0
clickCounts.targets.length == 1
clickCounts.targets[0].id == publish-layer-btn
```

Any additional click fails the probe.

The worker does not:

- fill title or body
- select Category
- select publication or reservation state
- select date or time
- save a Draft
- publish immediately
- confirm a schedule
- delete a post
- submit a final action
- use keyboard confirmation

It closes the browser context without clicking a close or save control.

## Panel evidence collected

The worker compares visible DOM signatures before and after opening the panel and inventories only a newly visible isolated subtree.

It records bounded evidence:

- panel root and visible containers
- control hierarchy
- IDs, roles, input types, names
- ARIA attributes
- disabled and checked state
- visible text, placeholder, and title
- limited class tokens
- newly-visible state
- `document.characterSet`
- UTF-8 Base64 copies of bounded labels and text

It does not collect article HTML.

Title and TinyMCE body text lengths must remain unchanged.

## Tests added and passed

- `tests/unit/app/application/publishing/TistorySchedulePanelProbeApplicationService.test.ts`
- `tests/unit/apps/tistory/TistorySchedulePanelProbeContract.test.ts`
- `tests/unit/app/api/publishing/schedules/SchedulePanelProbeRoute.test.ts`

The full suite passed with:

```text
Test Files: 186 passed, 7 skipped
Tests: 946 passed, 17 skipped
```

## Not implemented

- Editor scheduling form
- schedule create execution API
- verified schedule-state locator
- verified date or time locator
- final native schedule registration locator
- native schedule registration worker
- actual schedule registration
- management-list verification
- editor re-entry verification
- publication-time verification
- schedule update or cancel workflows
- local or recurring scheduler
- immediate public publishing

## Required next validation

Run the second-stage external probe against the selected real Tistory account and inspect:

- exactly one allowed opener click
- zero restricted clicks
- unchanged title and body lengths
- isolated panel root
- actual controls and default states
- UTF-8/Base64 label evidence

Do not implement schedule/date/time selection from assumptions.

## Local-only evidence

The previous temporary PowerShell probe script was intentionally not committed. It is not required for the product runtime.
