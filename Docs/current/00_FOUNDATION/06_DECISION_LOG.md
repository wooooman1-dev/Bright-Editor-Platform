# Decision Log

## Purpose

Record architectural and product decisions so they are never lost.

------------------------------------------------------------------------

## Decision #001

Title: Workspace is the Product

Status: Accepted

Reason: Users spend most of their time inside the Workspace, not on the
dashboard.

------------------------------------------------------------------------

## Decision #002

Title: Continue Working is the primary action

Status: Accepted

Reason: Users should always resume unfinished work without searching.

------------------------------------------------------------------------

## Decision #003

Title: Content Quality Above Everything Else

Status: Accepted

Reason: The value of Bright Studio comes from producing better content
than a generic AI chat.

------------------------------------------------------------------------

## Decision #004

Title: Personal Edition vs Commercial Edition

Status: Accepted

Reason: Personal Edition exposes quality scores and advanced tools.
Commercial Edition prioritizes simplicity.

------------------------------------------------------------------------

## Decision #005

Title: Workspace, Optional Brand, and Project-First Creation

Status: Accepted

Decision:

- Workspace and Brand are separate concepts.
- Workspace is the user's independent working space.
- Brand is optional and belongs to one Workspace.
- Project creation is the primary creation action after Workspace creation.
- Project name is required and brand name is optional.
- When a brand name is entered, an existing Brand with the same name in the current Workspace is reused; otherwise a Brand is created.
- A Project can be created without a Brand.
- Every Project always belongs to one Workspace and may optionally belong to one Brand.
- Every Content always belongs to one Project and never directly to a Workspace or Brand.

Reason: This records the originally intended Project-First product structure and corrects earlier documentation that incorrectly treated Workspace and Brand as the same concept. It does not make Brand creation a prerequisite and does not require Brand in the default Project route.

------------------------------------------------------------------------

## Decision #006

Title: Workspace-Owned Platform Connections

Status: Accepted

Decision: Workspace owns reusable PlatformConnection records. Projects select a connection by reference. Secrets remain behind a server-only SecretStore, and headed platform login runs through a local server-side connection job runner. Platform-specific behavior remains under Apps.

Reason: Normal users must connect publishing platforms through Bright Studio without terminal configuration while preserving Platform First boundaries and secure local-only operation.

------------------------------------------------------------------------

# Decision #007 — Permission-Gated Platform Automation

## Status

Approved

## Decision

Bright Studio will use permission-gated, allowlisted workflows for all external platform
automation.

Permissions belong to each Workspace-owned Publishing Account (`PlatformConnection`).
Multiple accounts may be connected for the same platform.

AI and generic Core modules must not control Playwright, platform APIs, selectors, URLs, or
browser actions directly.

External actions follow this boundary:

```text
AI / User
→ Publishing Command
→ Server-side Permission Gate
→ Platform Adapter
→ Registered Workflow
→ External Platform
```

## Initial Default

New accounts use Safe Draft Mode:

- Connection verification: enabled
- External draft creation: enabled
- Platform category read/select: enabled when supported
- Media upload: disabled
- Scheduling: disabled
- Public publishing: disabled
- Existing external content modification: disabled
- External content deletion: disabled
- Account setting changes: disabled

## Publishing Policy

`Review First` is the default.

Users can preview, manually edit, request AI revision, rerun Quality Review, and confirm before
any permitted external workflow runs.

When multiple publishing accounts are selected, Bright Studio uses a sequential publishing
queue by default rather than simultaneous execution.

## Security Rationale

Playwright and platform APIs can act with the connected user's authority. Least privilege,
fixed workflows, server-side permission checks, and audit records reduce the impact of mistakes,
compromised content, and unintended AI behavior.

## Consequences

- Every external workflow requires a declared permission.
- UI visibility is not considered authorization.
- Platform-specific workflows remain under `apps/<platform>`.
- Public publishing requires a later explicit approval.
- Critical operations are unavailable in the initial release.
- Permission and workflow tests are required before external-platform verification.
