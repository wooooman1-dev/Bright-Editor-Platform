# Tistory Schedule UI Probe

Status: Foundation Implemented / Local Validation Pending

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

## 8. Validation Required

Before this probe is used against Tistory, run:

```text
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Then run one probe against one selected Tistory connection and preserve the returned JSON as UI evidence. Do not implement schedule selectors or a final click from the first result alone.
