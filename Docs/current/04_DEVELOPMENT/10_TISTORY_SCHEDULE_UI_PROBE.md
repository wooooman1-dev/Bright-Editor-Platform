# Tistory Schedule UI Probe

Status: First External Read-Only Probe Verified / Second-Stage Automated Validation Passed / External Panel Probe Pending

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

The validation boundary checks both:

- the normalized safe Workspace policy; and
- the raw stored publishing policy before normalization.

Therefore a corrupted or legacy persisted state containing `draftOnly: false` or `publicPublish: true` is rejected instead of being hidden by safe defaults.

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

### Panel isolation

Before opening the panel, the worker records signatures for visible DOM elements.

After the one allowed click, it:

1. finds interactive controls that became newly visible;
2. finds the deepest newly visible common ancestor containing those controls;
3. refuses to treat `body` or `html` as the panel root;
4. inventories only the isolated newly visible subtree;
5. fails when an isolated panel root cannot be proven.

The inventory is bounded and includes only:

- tag
- role
- type
- ID
- name
- visible control text
- ARIA label, popup, expanded, controls, and checked attributes
- placeholder and title
- disabled and checked state
- limited class tokens
- newly-visible state
- visible panel containers
- `document.characterSet`

Article HTML is not collected.

### UTF-8 evidence

Because the first PowerShell output displayed mojibake, the second-stage result includes:

- explicit UTF-8 child-process decoding
- `document.characterSet`
- bounded UTF-8 Base64 copies of collected labels and text

Plain text remains available for normal inspection, while Base64 evidence allows later decoding without trusting the console rendering.

### Editor-state evidence

A successful result requires title and TinyMCE body text lengths to remain unchanged before and after opening the panel.

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

First-stage validation passed on Windows on 2026-07-28 at code commit `262d2ae`:

```text
npm run typecheck — passed
npm run lint — passed
npm test — passed
  Test Files: 183 passed, 7 skipped
  Tests: 936 passed, 17 skipped
npm run build — passed
git diff --check — passed
```

Second-stage automated validation passed on Windows on 2026-07-28 at code commit `644a6d2`:

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

The production route list includes both:

```text
/api/publishing/schedules/ui-probe
/api/publishing/schedules/panel-probe
```

Still not externally verified for the second stage:

- actual external Tistory publication-panel probe
- actual isolated panel root and controls
- actual default checked and disabled states
- Korean label decoding from Base64 evidence

No second-stage external success claim may be made until those checks are completed.

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

1. run the second-stage endpoint against the selected real Tistory account;
2. verify exactly one opener click and zero restricted clicks;
3. verify unchanged title and body lengths;
4. inspect the isolated panel controls, default states, and UTF-8/Base64 label evidence;
5. approve stable schedule/date/time locators only from that real evidence.

No schedule selection or final registration implementation may begin before this gate passes.
