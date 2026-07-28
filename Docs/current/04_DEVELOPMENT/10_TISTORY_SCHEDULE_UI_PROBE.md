# Tistory Schedule UI Probe

Status: First External Zero-Click Probe Verified / First Publication-Panel Attempt Failed Safely / Diagnostic Evidence Preservation Validated

## 1. Purpose

This diagnostic workflow inspects the current Tistory editor UI before any schedule selector, adapter, or final registration worker is implemented.

It collects verified evidence for visible editor controls, accessibility attributes, publication-panel hierarchy, likely scheduling candidates, visible containers, and the current editor URL. It does not decide locators from assumptions.

## 2. Architecture

```text
API
→ Workspace / Project / Content ownership validation
→ Draft Only policy validation
→ selected Publishing Target validation
→ PublishingPermissionGate(schedule.verify)
→ Tistory probe Application Service
→ dedicated Tistory Playwright worker
→ sanitized diagnostic result
→ publishing audit record
```

`schedule.verify` maps to the explicit `schedule.create` account permission and performs no external publication mutation.

Shared server validation:

```text
app/api/publishing/schedules/ScheduleProbeContext.ts
```

The existing Tistory Draft worker is not modified.

## 3. First-Stage Zero-Click Probe

Endpoint:

```text
POST /api/publishing/schedules/ui-probe
```

Worker:

```text
apps/tistory/workflows/tistory-schedule-ui-probe.mjs
```

The worker contains no Playwright `.click()`, `.fill()`, or `.selectOption()` call. It does not open the publication panel, save, register a schedule, publish, edit, delete, or capture article HTML.

Verified external result against `bright-healthy`:

```text
status: diagnosed
workflow: schedule.verify
readOnly: true
clickCounts.total: 0
clickCounts.restricted: 0
title length: 0 -> 0
body text length: 0 -> 0
editor URL: https://bright-healthy.tistory.com/manage/newpost
visible controls: 52
visible dialogs: none
```

Stable observed controls:

- `#category-btn`
- `#post-title-inp`
- `#editor-mode-layer-btn`
- `#tagText`
- `#preview-btn`
- `#grammar-check-btn`
- `#publish-layer-btn`

PowerShell mojibake is not locator evidence. No date, time, reservation-state, or final registration locator is approved from the first-stage result.

## 4. Second-Stage Publication-Panel Probe

Endpoint:

```text
POST /api/publishing/schedules/panel-probe
```

Application service:

```text
app/application/publishing/TistorySchedulePanelProbeApplicationService.ts
```

Worker:

```text
apps/tistory/workflows/tistory-schedule-panel-probe.mjs
```

### Allowed interaction

Exactly one Playwright click is allowed:

```text
#publish-layer-btn
```

The worker verifies that the opener is visible, enabled, a `button`, has the exact stable ID, is not a submit button, and does not rely on implicit form submission.

Successful click evidence requires:

```text
clickCounts.total == 1
clickCounts.allowedOpen == 1
clickCounts.restricted == 0
clickCounts.targets.length == 1
clickCounts.targets[0].id == publish-layer-btn
```

Any additional click fails the probe.

### Forbidden interactions

The worker contains no Playwright call for title/body input, Category selection, publication-state or reservation-state selection, date/time selection, Draft save, immediate public publishing, schedule confirmation, deletion, final submission, or keyboard confirmation.

### First external publication-panel attempt

The real attempt against `bright-healthy` ran after reconnecting the session, enabling `schedule.create`, and confirming `publish.execute` remained disabled.

Observed response:

```text
status: failed
workflow: schedule.verify
probeStage: publication-panel
readOnly: true
diagnosticCode: publication_panel_not_isolated
editorUrl: https://bright-healthy.tistory.com/manage/newpost
```

The strict click contract is checked before the panel-isolation gate. The result therefore failed because an isolated panel root was not proven, not because an unauthorized click was detected. No scheduling or final-action control was clicked.

### Evidence preservation on failure

The current worker preserves bounded evidence even when isolation fails:

- click counts and clicked target
- title/body state before and after
- visible-control snapshots before the click
- newly visible controls
- changed controls
- common ancestor candidate
- bounded ancestor candidates
- visible panel-like containers
- opener state after the click
- `document.characterSet`
- bounded UTF-8 Base64 labels and text

The strict success gate remains unchanged: `status: diagnosed` requires an isolated `panelRoot` and at least one control in that root.

Article HTML is not collected.

## 5. API Context

Both endpoints require:

- `workspaceId`
- `projectId`
- `contentId`
- exactly one of `connectionId` or exact `connectionName`

The server rejects unknown ownership, disabled Tistory, non-Tistory accounts, ambiguous account names, unselected targets, missing stored sessions, missing `schedule.create`, Draft Only disabled, and public publishing enabled.

## 6. Audit

Every attempt records operation ID, Workspace/Project/Content/PlatformConnection IDs, `schedule.verify`, probe stage, required `schedule.create`, timestamps, result, and safe error code.

The second-stage audit uses:

```text
probeStage: publication-panel
confirmationState: not_required
```

This does not authorize schedule registration.

## 7. Automated Validation State

The diagnostic evidence-preservation head passed Windows validation on 2026-07-28 at runtime code commit `60864d4`:

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
working tree — clean
README_DO_NOT_USE — absent
```

The production route list includes both:

```text
/api/publishing/schedules/ui-probe
/api/publishing/schedules/panel-probe
```

Still not verified:

- second external publication-panel rerun with preserved evidence
- actual isolated panel root and controls
- Base64-decoded Korean labels

## 8. Deliberately Not Implemented

- Editor scheduling form
- schedule create execution API
- date/time or reservation-state locators
- final schedule-registration locator
- native schedule registration worker
- actual schedule registration
- management-list verification
- editor re-entry verification
- publication-time verification
- schedule update or cancel workflows
- local or recurring scheduler
- immediate public publishing

## 9. Next Gate

1. Pull the documentation-only current head.
2. Rerun the second-stage endpoint against `bright-healthy`.
3. Verify exactly one opener click, zero restricted clicks, and unchanged title/body state.
4. Inspect new, changed, ancestor, container, and Base64 evidence.
5. Approve a panel root only from the real result.

No schedule selection or final registration implementation may begin before this gate passes.
