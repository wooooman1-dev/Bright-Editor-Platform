# Platform Automation Permissions

## Status

Approved Architecture Amendment

This document extends the approved Platform Connection architecture without changing the frozen
Workspace, Brand, Project, Content, or Content Model ownership structures.

## Purpose

Bright Studio must never allow AI or UI code to control Playwright freely.

Platform automation is limited to explicitly approved, platform-specific workflows. Each
Workspace-owned Publishing Account defines which workflows are permitted.

## Core Principle

```text
AI
→ Content Model
→ Publishing Engine
→ Permission Gate
→ Platform Adapter
→ Approved Workflow
→ Playwright or Platform API
```

AI, Prompt Engine, Quality Engine, client UI, and generic Core services must not invoke
Playwright directly.

## Ownership

Permissions belong to a Workspace-owned Publishing Account (`PlatformConnection`).

```text
Workspace
└── Publishing Accounts
    ├── Tistory Account A
    │   └── Automation Permissions
    ├── Tistory Account B
    │   └── Automation Permissions
    ├── WordPress Site A
    │   └── Automation Permissions
    └── YouTube Channel A
        └── Automation Permissions
```

A Project selects a Publishing Account by reference. A Project cannot grant itself permissions
that are disabled on the selected account.

## Permission Model

Initial reusable permission identifiers:

- `connection.verify`
- `draft.create`
- `draft.update`
- `media.upload`
- `category.read`
- `category.select`
- `schedule.create`
- `publish.execute`
- `post.update`
- `post.delete`
- `account.settings.read`
- `account.settings.update`

Platform adapters may expose only the permissions actually supported by that platform.

## Default Policy

New Publishing Accounts use the safest default:

| Permission | Default |
|---|---|
| Connection verification | Allowed |
| Create external draft | Allowed |
| Update a Bright Studio-created draft | Denied |
| Upload approved media | Denied |
| Read/select platform category | Allowed when supported |
| Schedule | Denied |
| Public publish | Denied |
| Modify existing external post | Denied |
| Delete external post | Denied |
| Change account settings | Denied |

Public publishing must remain disabled until separately approved and implemented.

## Permission Enforcement

Permission checks must occur server-side immediately before executing an external workflow.

The following are insufficient and must not be treated as enforcement:

- Hiding a UI button
- Disabling a client-side control
- Trusting a permission value supplied by the browser
- Relying only on platform account capabilities

Required execution checks:

1. Workspace exists.
2. Publishing Account exists.
3. Publishing Account belongs to the Workspace.
4. Project publishing target references the same Workspace account.
5. Connection is verified and usable.
6. Requested workflow maps to a known permission.
7. Permission is allowed for the account.
8. Platform adapter supports the workflow.
9. Required review or confirmation policy is satisfied.
10. A structured audit record is created.

## Workflow Allowlist

Platform automation must use a fixed workflow registry.

Example:

```text
verifyConnection
saveDraft
updateManagedDraft
uploadApprovedMedia
selectCategory
scheduleApprovedContent
publishApprovedContent
```

The job runner must reject:

- Arbitrary URLs from AI output
- Arbitrary selectors from the client
- Arbitrary JavaScript execution requests
- Free-form browser instructions
- Undeclared workflow names
- Platform workflows not registered in the adapter

## Tistory v1 Policy

Allowed:

- Verify connection
- Open the configured blog editor
- Enter title
- Enter approved rendered HTML
- Select an approved category when supported
- Save as draft
- Reopen and verify a Bright Studio-created draft

Denied:

- Public publishing
- Deleting posts
- Editing unrelated existing posts
- Changing account or blog settings
- Navigating to arbitrary domains
- Executing AI-generated browser commands

## WordPress v1 Policy

Allowed:

- Verify REST API connection
- Read safe site metadata
- Read categories when supported
- Create a draft

Denied:

- Public publishing
- Deleting posts
- Editing unrelated posts
- Plugin or theme changes
- User or account administration

## YouTube Initial Policy

When YouTube is implemented, initial permissions must default to:

Allowed:

- Verify channel connection
- Read safe channel metadata
- Prepare upload metadata
- Create private or draft-equivalent upload only when supported and explicitly approved

Denied:

- Public upload
- Schedule publishing
- Delete videos
- Modify unrelated videos
- Channel settings changes

## Risk Levels

Permissions are grouped by risk:

- Low: connection verification, safe metadata read
- Medium: external draft creation, approved media upload, category selection
- High: scheduling, public publishing, updating external content
- Critical: deleting external content, account-setting changes

High and Critical permissions require:

- Explicit user enablement
- Clear impact explanation
- Reauthentication or confirmation when appropriate
- Audit logging
- Ability to disable immediately

Critical permissions are not approved for the current release.

## User Confirmation Policy

`review_first` is the recommended default publishing policy.

```text
Generate
→ Edit
→ Preview
→ Quality Review
→ User Revision
→ Final Confirmation
→ Permitted External Workflow
```

A permission does not replace user confirmation. Permission defines what the account may do;
publishing policy defines when it may do it.

## Audit Record

Every external automation attempt must produce a safe audit record containing:

- operationId
- workspaceId
- projectId
- contentId
- platformConnectionId
- platform
- workflow
- requiredPermission
- initiatedBy
- confirmationState
- startedAt
- completedAt
- result
- safeErrorCode, if any

Audit records must never contain:

- Cookies
- Application Passwords
- Access tokens
- Authorization headers
- Browser storage-state contents
- Full secret paths exposed to the client

## Disconnect Behavior

Disconnecting an account must:

- Prevent new workflows immediately
- Cancel active jobs where safe
- Remove or invalidate secrets or sessions
- Preserve local Workspace, Project, Content, Draft, History, and Quality data
- Preserve external content
- Leave a safe audit record
- Mark Project publishing targets as connection-required

## Architecture Boundaries

Core may contain:

- Permission identifiers
- Permission policy models
- Permission evaluation contracts
- Workflow-to-permission mapping contracts
- Audit record contracts

Core must not contain:

- Playwright selectors
- Tistory URLs
- WordPress endpoints
- YouTube API details
- Browser launch code
- Secret-store implementations

Platform-specific workflow implementations remain under `apps/<platform>`.

## Completion Criteria

This amendment is correctly implemented only when:

- AI cannot invoke Playwright directly.
- The browser cannot submit arbitrary workflow instructions.
- Every external action is mapped to a fixed workflow.
- Every workflow is checked against account permissions server-side.
- New accounts default to least privilege.
- Public publishing is disabled by default.
- Denied permissions return structured errors.
- Permission changes and external actions are auditable.
- Production builds do not include browser-launch code in client bundles.

## Implemented v0.1 Boundary

The server allowlist accepts `connection.verify`, `category.read`, `category.select`, `draft.create`, and `draft.verify`. Public publishing, arbitrary workflow names, client URLs/selectors/JavaScript, post deletion, unrelated updates, and account-setting changes are rejected.

Tistory draft execution recalculates Workspace, Project, Content, Publishing Account, target-reference, connection, permission, current Quality Review, and final-confirmation state immediately before browser launch. Every attempt writes a secret-free audit record.

Draft results are `saved`, `partially_verified`, or `failed`. `saved` requires reliable post-save evidence including a detected save state, reopened draft verification, title/body match, and confirmation that no public post was created. Clicking Save alone never produces `saved`.
