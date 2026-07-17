# Bright Studio Release Plan

## Release Policy

Implementation, automated verification, and real external-platform verification are separate gates.

A feature that controls an external platform is not complete only because its UI renders or its Save button was clicked. Completion requires the verification evidence defined by the corresponding workflow.

## v0.1.0 — Internal Tistory MVP

Status: Release Candidate — real Tistory verification pending

Implemented scope:

- Home
- Workspace and optional Brand association
- Project Dashboard
- Natural-language Content creation
- AI Planning
- Editorial generation
- Automatic Quality Review and bounded improvement
- Canonical document Editor
- Autosave and history
- Tistory HTML Preview
- Workspace Settings
- Enabled Platforms onboarding
- Tistory Platform Connection
- Real category retrieval and selection
- Permission-gated Draft Save
- Structured draft verification
- Backup-first deletion and rollback protection
- Developer Verification

Required release gates:

- Build passes.
- Lint passes.
- Typecheck passes.
- Automated tests pass.
- `git diff --check` passes.
- A connected real Tistory account saves a harmless uniquely titled draft.
- Draft verification returns `saved`, not only `partially_verified`.
- Reopened title and meaningful body match.
- Selected category matches when applicable.
- No public post exists.
- Project and isolated Workspace deletion backup and rollback behavior pass.

Public publishing is excluded. Draft Only and Review First remain mandatory defaults.

## v0.2.0 — Presentation Foundation

Target: Sprint 6 implementation

Status: Design Approved

Planned scope:

- Canonical Bright Components
- Component Renderer contracts
- Theme Skin tokens
- Tistory presentation output
- WordPress Bright Theme foundation
- GeneratePress child-theme integration
- Accessible fallback presentation

Brand identity, Premium UI, and Figma work may build on this foundation but must not replace semantic component architecture.

## v0.3.0 — Content Memory Foundation

Target: Sprint 7

Status: Planned

Planned scope:

- Verified Content Library
- Published-content metadata
- Helpful related-content recommendations
- Verified-post-only internal links
- Duplicate and cannibalization signals
- Project-level content strategy defaults

## v0.4.0 — WordPress and Multi-platform Drafting

Target: Sprint 8

Status: Planned

Planned scope:

- WordPress draft workflow
- WordPress category preparation
- Platform preview
- Sequential multi-target queue
- Safe retry, skip, and stop behavior
- Repurpose relationship foundation

## v1.0.0 — Personal Production Release

Status: Future

Required qualities:

- Daily-use stability
- Tistory and WordPress verified draft workflows
- Complete documentation
- Recovery and backup confidence
- Measurable editorial quality
- Accessible Personal Edition experience
- No unresolved critical security or data-loss risks

Commercial SaaS, team collaboration, billing, and public multi-tenant operation remain later phases.
