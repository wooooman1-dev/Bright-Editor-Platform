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

Runtime code changed after `644a6d2` to preserve bounded evidence when the publication panel cannot be isolated. That current head still requires local validation.

## Verified first-stage external Tistory probe

The zero-click probe ran against `bright-healthy` and returned:

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
editor URL: https://bright-healthy.tistory.com/manage/newpost
```

Stable DOM evidence:

- `#category-btn`
- `#post-title-inp`
- `#editor-mode-layer-btn`
- `#tagText`
- `#preview-btn`
- `#grammar-check-btn`
- `#publish-layer-btn`

PowerShell rendered Korean labels with mojibake. Corrupted Korean labels are not locator evidence.

## First-stage contract remains protected

Worker:

```text
apps/tistory/workflows/tistory-schedule-ui-probe.mjs
```

Endpoint:

```text
POST /api/publishing/schedules/ui-probe
```

The worker still contains no Playwright `.click()`, `.fill()`, or `.selectOption()` call. The existing Tistory Draft worker was not changed.

## Second-stage publication-panel foundation

Worker:

```text
apps/tistory/workflows/tistory-schedule-panel-probe.mjs
```

Application service:

```text
app/application/publishing/TistorySchedulePanelProbeApplicationService.ts
```

Endpoint:

```text
POST /api/publishing/schedules/panel-probe
```

Shared server validation:

```text
app/api/publishing/schedules/ScheduleProbeContext.ts
```

The server validates Workspace, Project, Content, selected publishing target, Tistory platform, stored session, `schedule.create`, Draft Only, and public-publish-disabled state. It checks both normalized policy and raw persisted policy.

## Second-stage safety boundary

Exactly one Playwright click is permitted:

```text
#publish-layer-btn
```

A valid click contract requires:

```text
clickCounts.total == 1
clickCounts.allowedOpen == 1
clickCounts.restricted == 0
clickCounts.targets.length == 1
clickCounts.targets[0].id == publish-layer-btn
```

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

## Real second-stage attempt

Before the attempt:

- `bright-healthy` was reconnected on the current computer;
- the stored session became available;
- `schedule.create` was enabled;
- `publish.execute` remained disabled.

The real endpoint call returned:

```text
status: failed
workflow: schedule.verify
probeStage: publication-panel
readOnly: true
diagnosticCode: publication_panel_not_isolated
editorUrl: https://bright-healthy.tistory.com/manage/newpost
```

The worker validates the exact click contract before it checks panel isolation. Therefore this result proves the failure occurred at isolation, not at the click-permission gate.

No schedule, date, time, save, public-publish, or final-registration control was clicked.

## Confirmed cause in the previous algorithm

The previous worker required the common ancestor of newly visible controls to also be absent from the pre-click visible-element baseline.

The real Tistory editor may reveal publication controls inside a container that was already visible before the click. This is only a structural possibility, not an approved locator assumption.

## Current diagnostic-preservation change

The worker now retains bounded failure evidence after the single allowed click:

- click counts and target
- title/body lengths before and after
- baseline control snapshots
- newly visible controls
- controls whose class, ARIA state, visibility, checked state, disabled state, or rectangle changed
- common ancestor candidate
- bounded ancestor candidates
- visible panel-like containers
- opener state after the click
- `document.characterSet`
- Base64 copies of bounded UTF-8 labels and text

The success gate was not relaxed. `status: diagnosed` still requires an isolated `panelRoot` and at least one control in that root.

Article HTML is not collected.

## Current validation status

Validated baseline:

```text
644a6d2
```

Current runtime and test changes after that baseline:

- failed post-click evidence preservation
- changed-control snapshots
- ancestor-candidate evidence
- static contract test coverage for failed evidence

These current changes have not yet passed local `typecheck`, tests, lint, build, or external rerun.

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

1. Pull the current branch head.
2. Run typecheck, targeted contract test, full tests, lint, build, diff check, and status.
3. Rerun the real publication-panel endpoint.
4. Verify one allowed opener click and zero restricted clicks from returned evidence.
5. Verify unchanged title/body state.
6. Inspect newly visible controls, changed controls, ancestor candidates, and panel-like containers.
7. Decode bounded Base64 Korean labels.
8. Approve a panel root or locator only from the real evidence.

Do not implement schedule/date/time selection from assumptions.
