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

Automated Windows validation passed at runtime code commit `60864d4`:

```text
npm run typecheck — passed
npm test -- tests/unit/apps/tistory/TistorySchedulePanelProbeContract.test.ts — passed
  Test Files: 1 passed
  Tests: 4 passed
npm test — passed
  Test Files: 186 passed, 7 skipped
  Tests: 947 passed, 17 skipped
npm run lint — passed
npm run build — passed
git diff --check — passed
git status — working tree clean
README_DO_NOT_USE — absent
```

The production route list contains:

```text
/api/publishing/schedules/ui-probe
/api/publishing/schedules/panel-probe
```

This validation covers the failed-evidence preservation change, changed-control snapshots, ancestor-candidate evidence, the strict one-click contract, and the existing scheduled-publishing foundation.

## Verified first-stage external probe

The zero-click probe against `bright-healthy` returned:

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

Stable evidence:

- `#category-btn`
- `#post-title-inp`
- `#editor-mode-layer-btn`
- `#tagText`
- `#preview-btn`
- `#grammar-check-btn`
- `#publish-layer-btn`

PowerShell mojibake is not locator evidence.

## First-stage contract remains protected

Worker:

```text
apps/tistory/workflows/tistory-schedule-ui-probe.mjs
```

Endpoint:

```text
POST /api/publishing/schedules/ui-probe
```

The first-stage worker still has no Playwright `.click()`, `.fill()`, or `.selectOption()` call. The Tistory Draft worker was not changed.

## Second-stage publication-panel probe

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

Exactly one Playwright click is permitted:

```text
#publish-layer-btn
```

The click contract requires:

```text
clickCounts.total == 1
clickCounts.allowedOpen == 1
clickCounts.restricted == 0
clickCounts.targets.length == 1
clickCounts.targets[0].id == publish-layer-btn
```

No title/body input, Category selection, publication-state selection, date/time selection, Draft save, public publishing, schedule confirmation, deletion, final submit, or keyboard confirmation is allowed.

## First real second-stage attempt

Before the attempt:

- `bright-healthy` was reconnected on the current computer;
- the stored session became available;
- `schedule.create` was enabled;
- `publish.execute` remained disabled.

The endpoint returned:

```text
status: failed
workflow: schedule.verify
probeStage: publication-panel
readOnly: true
diagnosticCode: publication_panel_not_isolated
editorUrl: https://bright-healthy.tistory.com/manage/newpost
```

The worker checks the click contract before panel isolation, so this result failed at isolation rather than the click gate. No schedule, date, time, save, public-publish, or final-registration control was clicked.

## Confirmed cause in the previous algorithm

The previous worker required the common ancestor of newly visible controls to also be absent from the pre-click visible-element baseline.

The real Tistory editor may reveal controls inside a container that was already visible before the click. This remains only a structural possibility until the next bounded diagnostic result is inspected.

## Current evidence-preservation behavior

The current worker retains bounded post-click evidence even when isolation fails:

- click counts and target
- title/body lengths before and after
- baseline control snapshots
- newly visible controls
- changed controls
- common ancestor candidate
- bounded ancestor candidates
- visible panel-like containers
- opener state after the click
- `document.characterSet`
- bounded Base64 UTF-8 labels and text

The success gate was not relaxed. `status: diagnosed` still requires an isolated `panelRoot` and at least one control.

Article HTML is not collected.

## Not implemented

- Editor scheduling form
- schedule create execution API
- verified schedule-state locator
- verified date/time locator
- final schedule-registration locator
- native schedule registration worker
- actual schedule registration
- management-list verification
- editor re-entry verification
- publication-time verification
- schedule update or cancel workflows
- local or recurring scheduler
- immediate public publishing

## Next gate

1. Rerun the real panel probe against `bright-healthy` on the validated current head.
2. Verify one allowed click, zero restricted clicks, and unchanged title/body state.
3. Inspect newly visible controls, changed controls, ancestor candidates, panel-like containers, and Base64 labels.
4. Approve a panel root only from real evidence.

Do not implement schedule/date/time selection from assumptions.
