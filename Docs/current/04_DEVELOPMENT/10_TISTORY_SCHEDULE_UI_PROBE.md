# Tistory Schedule UI Probe

Status: First External Zero-Click Probe Verified / First Publication-Panel Attempt Failed Safely / Diagnostic Evidence Preservation Pending Validation

## 1. Purpose

This diagnostic workflow inspects the current Tistory editor UI before any schedule selector, adapter, or final registration worker is implemented.

It exists to collect verified evidence for:

- visible editor controls
- button and form labels
- accessibility roles and attributes
- publication-panel hierarchy
- likely schedule, publish, date, and time candidates
- visible dialog containers
- the current editor URL without query strings

The probe does not decide which control is the schedule control. It only records evidence.

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

`schedule.verify` maps to the explicit `schedule.create` account permission and does not require final registration confirmation because the probe performs no external publication mutation.

The existing Tistory Draft worker is not modified.

Shared server validation is implemented in:

```text
app/api/publishing/schedules/ScheduleProbeContext.ts
```

Both probe stages use the same Workspace, Project, Content, account, selected-target, Draft Only, public-publish-disabled, and Tistory-enabled checks.

## 3. First-Stage Zero-Click Probe

Endpoint:

```text
POST /api/publishing/schedules/ui-probe
```

Worker:

```text
apps/tistory/workflows/tistory-schedule-ui-probe.mjs
```

The first-stage probe is strictly read-only and contains no Playwright `.click()`, `.fill()`, or `.selectOption()` call.

It must not:

- click any control
- fill title or body fields
- select a category, date, time, or publication state
- open the publication panel
- save a Draft
- register a schedule
- publish immediately
- edit or delete an existing post
- capture article body HTML

Before reporting `diagnosed`, it verifies:

- total observed click count is zero
- restricted click count is zero
- title value length did not change
- body text length did not change

## 4. Verified First-Stage External Evidence

The first external probe was executed against the selected `bright-healthy` Tistory connection.

Verified result:

- `status: diagnosed`
- `workflow: schedule.verify`
- `readOnly: true`
- `clickCounts.total: 0`
- `clickCounts.restricted: 0`
- title length unchanged: `0 → 0`
- body text length unchanged: `0 → 0`
- sanitized editor URL: `https://bright-healthy.tistory.com/manage/newpost`
- observed control count: `52`
- no visible dialogs

Stable controls observed in the actual Tistory editor:

- category control: `#category-btn`
  - role: `combobox`
  - `aria-haspopup=listbox`
  - `aria-expanded=false`
  - `aria-controls=category-list`
- title input: `#post-title-inp`
- editor mode control: `#editor-mode-layer-btn`
- tag input: `#tagText`
- preview button: `#preview-btn`
- grammar check button: `#grammar-check-btn`
- publication-layer control: `#publish-layer-btn`
  - tag: `button`
  - enabled: true

The source PowerShell console rendered Korean text with mojibake. Corrupted labels are not accepted as locator evidence. Stable IDs and structural ARIA attributes remain valid evidence.

No date, time, reservation-state, or final registration locator is approved from the first-stage result.

## 5. Second-Stage Publication-Panel Probe

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

The second-stage worker is separate from the first-stage zero-click worker so the original zero-interaction contract is not weakened.

### Allowed interaction

Exactly one Playwright click is allowed:

```text
#publish-layer-btn
```

The worker verifies before clicking that the opener:

- is visible
- is a `button`
- has the exact stable ID `publish-layer-btn`
- is enabled
- is not a submit button
- does not rely on implicit form submission

### Forbidden interactions

The worker contains no Playwright call for:

- title or body input
- Category selection
- publication-state selection
- schedule-state selection
- date selection
- time selection
- Draft save
- immediate public publishing
- schedule confirmation
- deletion
- final submission
- keyboard confirmation

It closes the browser context without clicking a close, save, or final-action control.

### Click safety evidence

A successful second-stage result requires:

```text
clickCounts.total == 1
clickCounts.allowedOpen == 1
clickCounts.restricted == 0
clickCounts.targets.length == 1
clickCounts.targets[0].id == publish-layer-btn
```

Any additional click causes the probe to fail.

### First external publication-panel attempt

The first second-stage attempt was executed against the real `bright-healthy` connection after:

- the local Tistory session was reconnected;
- the connection returned to `connected`;
- `schedule.create` was enabled;
- `publish.execute` remained disabled.

Observed response:

```text
status: failed
workflow: schedule.verify
probeStage: publication-panel
readOnly: true
diagnosticCode: publication_panel_not_isolated
editorUrl: https://bright-healthy.tistory.com/manage/newpost
```

The worker checks the exact one-click contract before the panel-isolation condition. Therefore this diagnostic code means the allowed opener click contract passed and the failure occurred only because the newly visible independent panel root was not proven.

No schedule, date, time, publication-state, save, or final registration control was clicked.

### Confirmed isolation assumption mismatch

The previous isolation algorithm required the common ancestor of newly visible controls to also be absent from the pre-click visible-element baseline. The actual Tistory editor may reveal publication controls inside a container that was already visible before the click. That possibility is not accepted as a locator assumption; additional bounded evidence is required.

The worker now preserves bounded failure evidence without weakening the success gate:

- click counts and clicked target
- title/body state before and after
- visible-control snapshots before the click
- newly visible controls
- controls whose class, ARIA state, visibility, checked state, disabled state, or rectangle changed
- common ancestor candidate
- bounded ancestor candidates
- visible panel-like containers
- opener state after the click
- `document.characterSet`
- bounded UTF-8 Base64 text evidence

The strict success condition still requires an isolated `panelRoot` and at least one control in that root.

### Panel isolation

Before opening the panel, the worker records signatures for visible DOM elements and bounded snapshots for interactive controls.

After the one allowed click, it:

1. finds interactive controls that became newly visible;
2. records controls whose bounded state changed;
3. finds the deepest newly visible common ancestor when possible;
4. refuses to treat `body` or `html` as the panel root;
5. inventories only the isolated subtree on success;
6. preserves bounded candidate evidence on failure;
7. fails when an isolated panel root cannot be proven.

Article HTML is not collected.

### UTF-8 evidence

Because the first PowerShell output displayed mojibake, the second-stage result includes:

- explicit UTF-8 child-process decoding
- `document.characterSet`
- bounded UTF-8 Base64 copies of collected labels and text

Plain text remains available for normal inspection, while Base64 evidence allows later decoding without trusting the console rendering.

### Editor-state evidence

A successful result requires title and TinyMCE body text lengths to remain unchanged before and after opening the panel.

The same state evidence is now retained in failed post-click diagnostic results when it was successfully collected.

## 6. API Context

Both endpoints require:

- `workspaceId`
- `projectId`
- `contentId`
- exactly one account selector:
  - `connectionId`
  - exact `connectionName`

The server resolves persisted data and refuses:

- unknown Workspace, Project, or Content
- cross-Workspace ownership
- disabled Tistory platform
- non-Tistory account
- ambiguous account name
- account not selected as a Project/Content publishing target
- missing stored Tistory session
- missing `schedule.create` permission
- Draft Only disabled
- public publishing enabled

## 7. Audit

Every attempt records:

- operation ID
- Workspace, Project, Content, and PlatformConnection IDs
- `schedule.verify` workflow
- probe stage
- required `schedule.create` permission
- start and completion timestamps
- diagnosed or failed result
- safe error code when failed

The second-stage audit uses:

```text
probeStage: publication-panel
confirmationState: not_required
```

This does not authorize schedule registration.

## 8. Automated Validation State

The last fully validated second-stage baseline passed on Windows on 2026-07-28 at runtime code commit `644a6d2`:

```text
npm run typecheck — passed
npm run lint — passed
npm test — passed
  Test Files: 186 passed, 7 skipped
  Tests: 946 passed, 17 skipped
npm run build — passed
git diff --check — passed
working tree — clean
```

The failed-evidence preservation code, contract test, and documentation changes were added after that validated commit. Validation is pending for the current head.

A transient accidental empty file named `README_DO_NOT_USE` was created during remote metadata work and deleted in the immediately following cleanup commit. It must be absent after pulling the current head.

Not yet verified on the current head:

- TypeScript check
- lint
- unit and contract tests
- production build
- final tree absence of the transient file
- second external publication-panel probe with preserved failure evidence
- actual panel root and controls
- Korean label decoding from Base64 evidence

## 9. Deliberately Not Implemented

This work does not implement:

- Editor scheduling form
- schedule create execution API
- date/time selection locators
- reservation-state locators
- final schedule-registration locator
- native Tistory schedule registration worker
- actual schedule registration
- management-list verification
- editor re-entry verification
- publication-time verification
- schedule update or cancel workflows
- local or recurring scheduler
- immediate public publishing

## 10. Next Gate

The next gate is:

1. pull and validate the current branch head;
2. confirm the transient empty file is absent;
3. rerun the second-stage endpoint against `bright-healthy`;
4. verify exactly one opener click and zero restricted clicks from the returned evidence;
5. verify unchanged title/body state;
6. inspect new, changed, and ancestor candidate evidence;
7. decode bounded Base64 labels;
8. approve a panel root only from the real evidence.

No schedule selection or final registration implementation may begin before this gate passes.
