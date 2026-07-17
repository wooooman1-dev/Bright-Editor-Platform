# Bright Studio Product Roadmap

## Status

Current baseline: Sprint 5 implementation and automated verification complete.

The next planned product-development milestone is Sprint 6. Its Presentation Architecture direction is approved, while detailed component contracts and implementation remain pending.

Sprint status terms:

- `Planned`: scope has not been approved.
- `Designing`: product or technical design is in progress.
- `Design Approved`: design is approved but implementation has not started.
- `Implemented`: implementation is present in the Repository.
- `Verified`: automated verification has passed.
- `Environment Verification Pending`: implementation and automated checks are complete, but a real external environment must still be verified.
- `Completed`: all required completion gates for the Sprint have passed.

## Sprint 1 — Platform and Content Foundation

Status: Completed

Scope:

- Shared Chromium browser lifecycle
- Browser session and context foundations
- Tistory application skeleton and URL configuration
- Tistory login, stored-session, editor-entry, and editor-ready foundations
- Platform-independent Editor Adapter contract
- Canonical `ContentDocument` foundation
- Heading, paragraph, image, video, and button block foundations

Outcome:

Bright Studio established the Platform First and Content Model First boundaries required for later publishing workflows.

## Sprint 2 — Content Processing Engine

Status: Completed

Scope:

- Content Normalizer
- Content Validator
- Content Optimizer
- Content Pipeline
- Content metadata and version foundations
- Development-only Content Processing Playground

Outcome:

Canonical Content can be normalized, validated, and conservatively optimized without platform-specific behavior entering Core.

## Sprint 3 — Product UI Foundation

Status: Completed

Scope:

- State-based Home foundation
- Workspace layout
- Project Dashboard
- Content Editor foundation
- Publish Preparation foundation
- Developer Verification
- Korean UI stabilization and layout alignment

Outcome:

The primary product surfaces and Workspace → Project → Content navigation foundation were implemented.

## Sprint 4 — Usable Content and Safe Draft Workflow

Status: Environment Verification Pending

Implementation status: Implemented

Automated verification status: Verified

Remaining completion gate:

- A connected real Tistory account must save a harmless uniquely titled draft.
- The result must be `saved`, not only `partially_verified`.
- The reopened title and meaningful body must match.
- The selected category must match when a category was selected.
- No public post may be created.

Scope:

- Workspace → Project → natural-language request flow
- AI Planning and editable recommendation
- Durable Content creation
- Canonical document generation and editing
- Autosave and history
- Workspace Settings and Enabled Platforms onboarding
- Workspace-owned Platform Connections
- Permission Gate and registered workflow allowlist
- Real Tistory category read and selection
- Shared Tistory Renderer for Preview and Draft Save
- Final confirmation and Draft Only policy
- Structured draft verification and safe audit records
- Backup-first Project and Workspace deletion

Outcome:

The end-to-end product workflow is implemented through external Tistory draft verification. Real-account verification remains the final Sprint completion gate.

## Sprint 5 — Editorial Quality Pipeline

Status: Completed

Scope:

- Editorial generation
- Rule-based Quality Review
- Final editorial review
- AI manuscript improvement
- Maximum three bounded automatic improvement attempts
- Best-revision selection
- Structured JSON Schema output
- Strengthened editorial prompts
- Ten-dimension weighted Quality Engine
- Revision-bound approval and invalidation after manual edits

Pipeline:

```text
AI Generation
→ Rule Quality Review
→ Final Editorial Review
→ Rule Quality Review
→ Automatic Improvement (maximum 3)
→ Best Revision Selection
```

Outcome:

Bright Studio presents the first approved 95+ result or the highest-scoring bounded result instead of requiring the user to manually repeat generation.

## Sprint 6 — Presentation Architecture and Bright Components

Status: Design Approved

Approved direction:

```text
GeneratePress
→ Child Theme
→ Bright Theme
→ Theme Skins
→ Bright Components
→ Generated Content
```

Approved principles:

- Presentation belongs to Bright Studio.
- GeneratePress is lightweight WordPress infrastructure.
- Generated semantic content must not depend on theme-specific HTML.
- Bright Components are platform-independent.
- Platform adapters render the same semantic components into native platform output.
- Theme Skins change visual tokens, not semantic structure.

Detailed design still required before implementation:

- Canonical Bright Component schema
- Component versioning and compatibility policy
- Renderer contracts
- Theme Skin token contract
- Fallback presentation without Bright Theme
- Tistory and WordPress output rules
- GeneratePress child-theme integration boundary
- Accessibility and visual acceptance criteria

## Sprint 7 — Content Library and Internal Link Intelligence

Status: Planned

Candidate scope:

- Verified published-content library
- Published metadata and status tracking
- Helpful related-content recommendations
- Verified-post-only internal links
- Duplicate topic and search-intent conflict detection
- Content-cluster and update recommendations

Scope requires Product Owner approval before design is frozen.

## Sprint 8 — WordPress and Multi-platform Foundation

Status: Planned

Candidate scope:

- WordPress draft workflow
- Bright Theme integration
- Multi-target sequential publishing queue
- Platform-specific preview
- Retry, skip, and stop behavior
- Repurpose relationship foundation

Scope requires Product Owner approval before design is frozen.

## Current Priority

New Engines are not the current priority.

The immediate product gate is:

```text
Editor
→ Tistory Preview
→ Category Selection
→ Draft Save
→ Reopen Draft
→ Verify Title, Body, Category, and Non-public State
```

After the Sprint 4 real-account gate passes, proceed with Sprint 6 detailed design before implementation.
