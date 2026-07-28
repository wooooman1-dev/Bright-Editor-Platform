# Tistory Schedule UI Probe

Status: First External Read-Only Probe Verified / Second-Stage Design Pending

## 1. Purpose

This diagnostic workflow inspects the current Tistory editor UI before any schedule selector, adapter, or final registration worker is implemented.

It exists to collect verified evidence for:

- visible editor controls
- button and form labels
- accessibility roles and attributes
- likely schedule, publish, date, and time candidates
- visible dialog containers
- the current editor URL without query strings

The probe does not decide which control is the schedule control. It only records evidence.

## 2. Safety Boundary

The first-stage probe is strictly read-only.

It must not:

- click any control
- fill title or body fields
- select a category, date, time, or publication state
- open the completion or publication panel
- save a Draft
- register a schedule
- publish immediately
- edit or delete an existing post
- capture the article body HTML

The worker contains no Playwright `.click()`, `.fill()`, or `.selectOption()` call.

Before reporting `diagnosed`, it verifies:

- total observed click count is zero
- restricted click count is zero
- title value length did not change
- body text length did not change

## 3. Architecture

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

`schedule.verify` maps to the explicit `schedule.create` account permission and does not require final registration confirmation because it performs no external mutation.

The existing Tistory Draft worker is not modified by this probe.

## 4. API

```text
POST /api/publishing/schedules/ui-probe
```

Required context:

- `workspaceId`
- `projectId`
- `contentId`
- exactly one of:
  - `connectionId`
  - exact `connectionName`

The API resolves all data from the server-owned persistence state. An exact account name is accepted only when it identifies one Tistory connection in the requested Workspace.

## 5. Result

A successful result uses:

```json
{
  "status": "diagnosed",
  "workflow": "schedule.verify",
  "readOnly": true,
  "clickCounts": {
    "total": 0,
    "restricted": 0,
    "labels": []
  }
}
```

The inventory contains only bounded UI descriptors such as:

- tag
- role
- type
- id
- name
- visible control text
- ARIA label
- ARIA popup, expanded, and controls attributes
- placeholder
- title
- disabled and checked state
- limited class tokens

The article HTML is not collected.

## 6. Audit

Every attempt records:

- operation ID
- Workspace, Project, Content, and PlatformConnection IDs
- `schedule.verify` workflow
- required `schedule.create` permission
- start and completion timestamps
- diagnosed or failed result
- safe error code when failed

## 7. Deliberately Not Implemented

This stage does not:

- click the Tistory `완료` or publication-panel control
- open a schedule panel
- choose a date or time
- infer a locator from unverified assumptions
- add an Editor schedule form
- add schedule create or verify execution APIs
- register a native Tistory schedule

A second-stage panel probe may be designed only after the first-stage inventory has been run against the actual Tistory editor and the observed controls have been reviewed.

## 8. Automated Validation

Validated on Windows on 2026-07-28 at commit `262d2ae`:

```text
npm run typecheck — passed
npm run lint — passed
npm test — passed
  Test Files: 183 passed, 7 skipped
  Tests: 936 passed, 17 skipped
npm run build — passed
git diff --check — passed
```

The skipped tests are existing manual suites and are not automated failures.

The generated production route list includes:

```text
/api/publishing/schedules/ui-probe
```

The working branch was synchronized with `origin/feat/tistory-native-scheduled-publishing`. The only local untracked file was the separately supplied schedule design PDF, which is not part of the implementation.

## 9. External Probe Gate

The automated gate passed and the first external probe was executed against the selected `bright-healthy` Tistory connection.

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

The source PowerShell console rendered Korean text with mojibake, so text labels from that console output are not treated as trusted locator evidence. Stable DOM attributes and IDs remain valid evidence.

## 10. Verified First-Stage DOM Evidence

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
- two visible role-button links immediately before the publication-layer control
  - one has class `action`
  - one has class `count`
  - the count control had `aria-expanded=false`

The first-stage heuristic returned three schedule candidates, but this candidate list is not sufficient to identify the real schedule control because Korean text was corrupted in the PowerShell console output and the publication panel was not opened.

Therefore:

- `#publish-layer-btn` is the only stable candidate for a second-stage panel-opening probe.
- No date, time, reservation-state, or final registration locator is approved yet.
- No schedule worker or final click may be implemented from this evidence alone.

## 11. Required Second-Stage Design

The next step must be a separate, explicitly bounded panel probe that:

1. clicks only `#publish-layer-btn` once;
2. never clicks Draft, immediate publish, schedule confirmation, delete, or any date/time control;
3. records click evidence proving exactly one allowed panel-open click and zero restricted mutation clicks;
4. inventories only the newly visible panel subtree, roles, labels, IDs, ARIA attributes, form control types, disabled state, and default checked state;
5. records visible dialog text and control hierarchy without choosing any option;
6. confirms title and body remain unchanged;
7. closes the page without submitting or saving anything.

This second-stage design requires explicit approval before implementation.