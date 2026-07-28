# Tistory Native Scheduled Publishing MVP

## 1. Status

Status: **Approved Design — Implementation In Progress**

Approved on: 2026-07-28

This document defines the first Bright Studio implementation of Tistory-native scheduled publishing.

The implementation must not use a local timer, a background scheduler that waits until the publication time, the deprecated Tistory API, or a Playwright process that runs again at the scheduled time. Bright Studio registers the schedule in advance and Tistory performs the eventual publication.

## 2. Product Goal

```text
Approved current Content Revision
→ user confirms account, category, date and time
→ schedule.create Permission Gate
→ Publishing Application Service
→ Tistory Scheduling Adapter
→ registered Playwright workflow
→ Tistory native schedule registration
→ external registration verification
→ durable ScheduledPublication state
→ Bright Studio and the user PC may stop
→ Tistory publishes at the reserved time
```

A schedule registration is not complete merely because a button was clicked. Bright Studio must distinguish verified, unverified and failed outcomes.

## 3. Protected Existing Behavior

The following behavior must remain unchanged:

- Review First enabled
- Draft Only enabled for the existing draft workflow
- `publish.execute` disabled
- AI Generation limited to the existing one-call workflow
- Quality Review limited to the existing one-call workflow
- current Revision quality approval required
- existing Tistory category preparation
- existing media upload Permission Gate
- existing Tistory Draft Save and reopen verification
- current server-owned persistence collections
- stored Tistory sessions and user data

The existing `tistory-draft-worker.mjs` must continue to reject completion, public-publish, schedule and delete controls. Scheduling is implemented as a separate registered workflow.

## 4. Confirmed Existing Reuse Points

Reuse the current Repository modules instead of duplicating their responsibilities:

- `core/publishing/AutomationPermissions.ts`
- `core/publishing/Publishing.ts`
- `app/application/publishing/TistoryDraftApplicationService.ts`
- `app/application/publishing/TistoryPublishingPreparation.ts`
- `apps/tistory/publishing/TistoryPublishingAdapter.ts`
- `apps/tistory/publishing/TistoryMediaUploadPlan.ts`
- `apps/tistory/workflows/tistory-draft-worker.mjs`
- `apps/tistory/workflows/tistory-media-preparation-worker.mjs`
- `app/application/persistence/mergeUserDataSnapshot.ts`
- `app/user-flow/user-data.ts`
- `app/user-flow/EditorWorkspace.tsx`

Existing title, body, category, tags, representative-image and media preparation behavior should be shared through small Tistory workflow modules. It must not be copied into a second large worker.

## 5. Core and Platform Responsibility

### Core

Core owns platform-independent scheduling contracts and policy:

- scheduled datetime and IANA timezone
- ScheduledPublication status and state transitions
- active-schedule duplicate prevention
- request fingerprint and idempotency rules
- Revision binding
- scheduling permission names
- generic scheduling adapter contracts

Core must not contain Tistory URLs, selectors, button labels or browser actions.

### Application

The application layer owns:

- Workspace, Project and Content ownership checks
- server-current ContentDocument and Revision resolution
- current standard Quality approval checks
- AdSense approval-readiness reuse for the current Revision
- PlatformConnection and selected Publishing Target checks
- Permission Gate execution
- atomic duplicate reservation
- workflow audit records
- durable result persistence
- safe retry decisions

### Apps/Tistory

The Tistory App owns:

- Tistory scheduling command conversion
- actual editor and management URLs
- schedule controls and locators
- date and time entry
- schedule registration acknowledgement
- schedule-list and reopened-editor verification
- Tistory-specific error diagnostics

Selectors must be implemented only after they are confirmed against the actual Tistory UI.

## 6. Permissions

Extend `AutomationPermission` with:

```text
schedule.create
schedule.update
schedule.cancel
```

The initial MVP registers:

```text
schedule.create
schedule.verify
```

Permission mapping:

```text
schedule.create → schedule.create
schedule.verify → schedule.create
```

Defaults:

```text
schedule.create: disabled
schedule.update: disabled
schedule.cancel: disabled
publish.execute: disabled
```

Do not add scheduling permissions to `safeDraftPermissions`.

Enabling `schedule.create` must not enable `publish.execute`, `post.update`, `post.delete` or `account.settings.update`.

## 7. ScheduledPublication Model

Expand the existing `UserData.scheduledPublishing` collection instead of creating a duplicate top-level collection.

```ts
type ScheduledPublicationStatus =
  | "registering"
  | "scheduled_verified"
  | "scheduled_unverified"
  | "failed"
  | "cancelled"
  | "published";

type ScheduledPublication = Readonly<{
  id: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  platform: "tistory" | "wordpress";
  platformConnectionId: string;
  revisionId: string;
  scheduledAt: string;
  timezone: string;
  status: ScheduledPublicationStatus;
  categoryId: string | null;
  categoryName: string | null;
  requestFingerprint: string;
  operationId: string;
  registeredAt?: string;
  verifiedAt?: string;
  externalPostId?: string;
  externalManagementUrl?: string;
  publicUrl?: string;
  attemptCount: number;
  lastAttemptAt: string;
  failureCode?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}>;
```

`scheduledAt` is an ISO datetime representing an absolute instant. `timezone` is an IANA timezone such as `Asia/Seoul`.

The initial UI uses `Asia/Seoul`. The Core model remains platform-scalable.

## 8. Status Semantics

```text
request accepted and atomically reserved
→ registering

external registration and verification complete
→ scheduled_verified

registration action may have happened but verification is incomplete
→ scheduled_unverified

failure before a possible external registration side effect
→ failed

verified external cancellation
→ cancelled

verified external public state and public URL
→ published
```

A button click alone cannot produce `scheduled_verified`.

After the final external schedule action has been attempted, an ambiguous result must become `scheduled_unverified` and must not be automatically re-registered.

## 9. Revision Binding

Every schedule is bound to the current canonical Revision.

The request must include `revisionId`, but the server must load the current ContentDocument and independently calculate its Revision. A mismatch fails before external execution.

Editing the Content after registration does not mutate the registered Tistory schedule. The UI must show that the scheduled Revision and current Revision differ.

The MVP does not automatically update or cancel an old schedule when the current document changes.

## 10. Scheduling Readiness

All checks must pass before schedule registration:

- Workspace exists
- Project belongs to the Workspace
- Content belongs to the Project and Workspace
- canonical ContentDocument exists
- requested Revision equals the server-current Revision
- stored current-Revision standard Quality approval exists
- deterministic current document Quality recheck passes
- Tistory is enabled
- Tistory connection belongs to the Workspace
- connection is connected and verified
- stored Tistory session exists
- connection is a selected Project publishing target
- Tistory category or explicit no-category state is stored
- `media.upload` is allowed when local images require upload
- `schedule.create` is allowed
- scheduled time is in the future
- timezone is valid
- no active duplicate schedule exists
- user final confirmation is true

### AdSense approval content

For `adsense_approval` Content, the stored approval preparation state for the current Revision is also required.

Scheduling must reuse the stored results. It must not automatically run another source lookup, duplicate crawl, AI Generation or Quality Review call.

## 11. API Contracts

### Readiness

```http
POST /api/publishing/schedules/readiness
```

```json
{
  "workspaceId": "...",
  "projectId": "...",
  "contentId": "...",
  "platform": "tistory",
  "platformConnectionId": "...",
  "revisionId": "...",
  "scheduledAt": "2026-08-03T00:00:00.000Z",
  "timezone": "Asia/Seoul",
  "finalConfirmation": false
}
```

The readiness endpoint does not execute Playwright.

### Create

```http
POST /api/publishing/schedules
```

The client must not send title, body or rendered HTML. The server uses the current canonical ContentDocument and stored Tistory preparation.

### Verify

```http
POST /api/publishing/schedules/{scheduleId}/verify
```

This uses a registered read-only verification workflow. It must not re-register the schedule.

### Read

```http
GET /api/publishing/schedules?workspaceId=...&contentId=...
```

## 12. Duplicate Prevention and Idempotency

Create the request fingerprint from:

```text
workspaceId
contentId
platform
platformConnectionId
revisionId
scheduledAt
timezone
```

The same fingerprint returns the existing record without running Playwright again.

Active statuses are:

```text
registering
scheduled_verified
scheduled_unverified
```

Only one active schedule may exist for the same `contentId + platform` in the MVP.

Before Playwright starts:

```text
studioStore.update()
→ recheck active schedule
→ persist registering record
→ commit the reservation
→ execute the external workflow
```

The persistence merge key for scheduled publications becomes the schedule `id`. Active-duplicate validation remains a separate policy.

## 13. Tistory Workflow

The schedule workflow is separate from the current Draft worker.

Proposed worker:

```text
apps/tistory/workflows/tistory-schedule-worker.mjs
```

Proposed shared preparation module:

```text
apps/tistory/workflows/tistory-editor-preparation.mjs
```

Shared responsibilities may include:

- open editor with stored session
- title input and verification
- HTML input and verification
- category selection and verification
- tag input and verification
- representative-image handling
- pre-action semantic document verification

Schedule-only responsibilities:

- open publication settings
- select native schedule mode
- fill date
- fill time
- verify entered datetime
- execute schedule registration exactly once
- confirm acknowledgement
- open schedule management surface
- identify the current scheduled item
- verify title, status, datetime and category

No schedule selector or locator is approved until an actual Tistory screen or probe confirms it.

## 14. Verification Outcome

Required verification candidates, subject to actual UI confirmation:

- final schedule action executed exactly once
- registration acknowledgement detected
- scheduled item identified in management UI
- scheduled state indicator detected
- requested datetime matched
- title matched
- category matched
- item is not immediately public
- external post identifier and management URL captured when available

Outcome:

```text
all required evidence confirmed
→ scheduled_verified

external action attempted but result ambiguous
→ scheduled_unverified

failure before possible registration
→ failed
```

## 15. Retry Policy

Automatic retry may occur at most once only when all of the following are true:

- final schedule action was not attempted
- media upload did not begin
- no external write side effect is possible
- failure is an unclassified worker-start or editor-entry failure

Never automatically retry after:

- final schedule action
- acknowledgement timeout after the action
- media upload
- ambiguous schedule-list result
- external identifier detection

`scheduled_unverified` exposes only a verification action, not another create action.

## 16. Persistence and Restoration

`scheduledPublishing` remains server-owned.

Stale client snapshots, long-running AI workflows and unrelated Content saves must not overwrite schedule records.

Persist `registering` before external execution. If an old `registering` record is found after interruption, treat it as externally ambiguous and require verification instead of re-registration.

If Tistory registration succeeds but the final local result save fails, the pre-existing operation ID and audit record must allow later verification and recovery.

Deleting local Content must not silently cancel or delete an external Tistory schedule.

## 17. UI Flow

Add a separate Tistory Scheduled Publishing card to the existing Publishing Preparation area.

Show:

- Tistory account
- Tistory category
- current Revision
- quality approval state
- approval readiness state when applicable
- representative and body image readiness
- date
- time
- `Asia/Seoul`
- readiness checklist
- explicit final confirmation
- schedule registration action
- persisted schedule status
- scheduled Revision versus current Revision warning

The schedule action remains disabled until server readiness passes.

## 18. Test Plan

### Core

- ISO datetime validation
- IANA timezone validation
- past-time rejection
- deterministic fingerprint
- active duplicate detection
- status transition policy
- safeDraft permissions exclude schedule permissions
- `schedule.create` and `publish.execute` remain independent

### Application

- ownership failures
- missing canonical document
- stale Revision
- stale or missing Quality approval
- expired session
- unselected target
- missing category
- missing media permission
- missing schedule permission
- missing current-Revision AdSense readiness
- duplicate active schedule
- atomic registration reservation
- verified, unverified and failed persistence
- no AI Generation call
- no Quality Review AI call

### Tistory

After actual UI confirmation:

- locator characterization
- schedule and immediate-public controls distinguished
- date and time entry
- entered datetime re-read
- one final registration click
- zero immediate-public clicks
- schedule-list verification
- title, datetime and category matching
- fail-closed behavior after selector changes

### Regression

- existing Tistory Draft Save
- Draft reopen verification
- category persistence
- tags
- representative image
- media upload
- Renderer structure
- Permission Gate
- Draft Only
- no public post from Draft workflow
- stale UserData merge
- backup-first Content deletion

## 19. Manual Verification Plan

1. Confirm the actual Tistory schedule controls without executing the final schedule action.
2. Record confirmed selectors, roles, text and screen evidence.
3. Use an existing approved Content Revision; do not generate a new Content.
4. Enable `schedule.create` for one Tistory connection.
5. Register one sufficiently future schedule.
6. Verify the scheduled item, datetime, title and category in Tistory.
7. Reload and navigate away in Bright Studio and verify restoration.
8. Close Bright Studio and the browser.
9. Keep Bright Studio stopped at the scheduled time.
10. After the scheduled time, verify the public URL and full rendered post.

Registration verification and publication verification are separate gates.

Before the scheduled time, the strongest allowed completion statement is:

```text
Tistory native schedule registration verified; publication-time verification pending.
```

Only after the public post is checked may the complete feature be reported as end-to-end verified.

## 20. MVP Exclusions

- local scheduler
- background timer
- Playwright execution at the scheduled time
- immediate public publishing
- enabling `publish.execute`
- schedule update
- schedule cancel
- recurring schedules
- automatic weekday queue placement
- AI-selected publication time without confirmation
- multi-platform scheduling
- WordPress scheduling
- periodic external status synchronization
- automatic Published Content Registry insertion
- additional AI calls

The Core model may represent `cancelled` and `published` to support later phases, but the first implementation focuses on create, verify and durable restoration.