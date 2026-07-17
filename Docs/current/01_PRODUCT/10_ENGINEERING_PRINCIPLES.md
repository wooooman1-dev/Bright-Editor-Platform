# Engineering Principles

Version: 1.0

Status: Approved

Priority: Highest

---

# Purpose

This document defines the engineering rules that every implementation must follow.

These rules apply to:

- AI (ChatGPT, Codex, Claude, etc.)
- Developers
- Future contributors

When this document conflicts with implementation convenience, this document takes precedence.

---

# Rule 1. Core First

All business logic shall be implemented inside Core.

Platform-specific implementations must never contain business logic.

## Allowed

- AI Engine
- Quality Engine
- Publishing Engine
- Content Engine
- Prompt Engine
- Processing Engine

## Forbidden

- Business logic inside Platform Adapter
- Business logic inside UI
- Business logic inside Playwright workflow

---

# Rule 2. Platform Independence

The platform must never depend on a specific publishing platform.

Core must not know:

- Tistory
- WordPress
- YouTube
- Naver Cafe

Platform-specific behavior belongs only to Platform Adapters.

---

# Rule 3. Adapter Pattern

Every publishing platform shall implement the same contract.

Example

Core

↓

Publishing Service

↓

Platform Adapter

↓

Platform

Core must never branch based on platform type.

Forbidden

```ts
if (platform === "tistory") { ... }
```

Preferred

```ts
adapter.saveDraft()
```

---

# Rule 4. Dependency Direction

Dependencies must always point inward.

Allowed

UI

↓

Application

↓

Core

↓

Domain

Forbidden

Core

↓

UI

Core

↓

Playwright

Core

↓

Platform Adapter

---

# Rule 5. One Canonical Content Model

The Content Model is the single source of truth.

Every platform renderer consumes the same ContentDocument.

Never create platform-specific content models.

---

# Rule 6. Renderer Responsibility

Renderers transform content.

They never modify business meaning.

Renderer responsibilities

- HTML generation
- Markdown generation
- Platform formatting

Renderer must never

- Rewrite article
- Improve SEO
- Change heading hierarchy
- Modify CTA strategy

---

# Rule 7. Project First

Everything belongs to a Project.

Examples

Workspace

└── Project

    ├── Content

    ├── History

    ├── AI Review

    ├── Images

    ├── Publishing

    └── Drafts

No content exists outside a Project.

---

# Rule 8. Workspace Ownership

Workspace owns

- Settings
- Platform Connections
- AI Configuration
- Publishing Accounts
- Secret Store

Projects reference Workspace resources.

Projects never duplicate them.

---

# Rule 9. Repository Pattern

Application Services never access storage directly.

Required flow

Service

↓

Repository

↓

Database

Forbidden

Service

↓

SQLite

Service

↓

IndexedDB

Service

↓

Filesystem

---

# Rule 10. Service Layer

Business workflows belong inside Services.

Examples

ContentService

PublishingService

QualityService

ProjectService

Services coordinate logic.

Repositories store data.

---

# Rule 11. AI Call Policy

AI calls are expensive.

Minimize them.

Current policy

AI Generation

↓

Quality Review

Only two major AI calls should be required.

Additional calls require architectural justification.

---

# Rule 12. AI Responsibility

Generation AI performs

- Planning
- Writing
- SEO
- Image Strategy
- CTA Strategy
- Internal Links
- Editing

Quality AI performs

- Validation
- Review
- Improvement Suggestions

Responsibilities should not overlap unnecessarily.

---

# Rule 13. Permission Gate

AI must never perform destructive actions directly.

Required flow

AI

↓

Permission Gate

↓

Publishing Service

↓

Platform Adapter

↓

Workflow

↓

Playwright

---

# Rule 14. Playwright Isolation

Playwright is infrastructure.

Business logic must never exist inside Playwright scripts.

Playwright only executes approved workflows.

---

# Rule 15. State Management

The UI is not the source of truth.

The Project state is.

Avoid duplicated state.

Avoid derived state becoming persistent.

---

# Rule 16. API Design

APIs expose use cases.

APIs must never expose database implementation.

Prefer

```
POST /projects/{id}/publish
```

Avoid

```
POST /database/save
```

---

# Rule 17. Error Handling

Errors should be classified.

Recoverable

Retryable

Validation

Permission

Infrastructure

Unknown

Never swallow exceptions silently.

---

# Rule 18. Cost Optimization

Prefer reusable computation.

Avoid

Repeated AI requests

Repeated rendering

Repeated parsing

Cache deterministic results whenever possible.

---

# Rule 19. Documentation Driven Development

Implementation follows documentation.

Implementation never defines architecture.

Before coding

Read documentation

Understand architecture

Implement

Verify

Update documentation

---

# Rule 20. Testing

Every feature should satisfy

Architecture Review

Unit Test

Integration Test

Regression Test

Manual Verification

Documentation Update

---

# Rule 21. Backward Compatibility

New features must not break existing workflows.

Prefer extension over replacement.

Avoid unnecessary migrations.

---

# Rule 22. Security

Never expose

API Keys

Cookies

Session Tokens

Secrets

Credentials

Secrets belong only inside Secret Store.

---

# Rule 23. Performance

Prefer

Lazy loading

Streaming

Caching

Incremental updates

Avoid unnecessary rendering.

Avoid unnecessary AI calls.

---

# Rule 24. Simplicity

Prefer the simplest architecture that satisfies future scalability.

Avoid premature abstraction.

Avoid unnecessary inheritance.

Avoid duplicated implementations.

---

# Rule 25. Acceptance Criteria

Every implementation should satisfy the following questions.

□ Does it follow Platform First?

□ Does it keep business logic inside Core?

□ Does it preserve the Content Model?

□ Does it minimize AI calls?

□ Does it respect Permission Gate?

□ Does it avoid platform coupling?

□ Does it keep adapters thin?

□ Does it update documentation?

□ Can another platform reuse it?

□ Can another AI understand it without additional explanation?

If any answer is "No", the implementation should be reconsidered.

---

# Final Rule

The goal is not simply to make the feature work.

The goal is to build a maintainable, scalable, platform-independent system that future AI and developers can understand, extend, and verify with confidence.