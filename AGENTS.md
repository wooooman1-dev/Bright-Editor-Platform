# Bright Editor Platform - AI Agent Rules (v2.1)

> This document is the mandatory operating manual for all AI coding agents.

## 1. Mission

Build Bright Editor Platform as an AI-powered Content Lifecycle Platform.

Never optimize for short-term convenience at the expense of long-term architecture.

## 2. Single Source of Truth

Before writing code, read:

1. Docs/current/00_FOUNDATION
2. Docs/current/01_PRODUCT
3. Docs/current/02_ARCHITECTURE
4. Docs/current/04_DEVELOPMENT (if present)

If documentation conflicts with code, documentation wins.

## 3. Forbidden Rules

Never:

- Modify `D:\tstory_auto`.
- Copy code from `D:\tstory_auto` into this project.
- Skip documentation review.
- Merge Core and Apps responsibilities.
- Hardcode API keys or secrets.
- Introduce unnecessary dependencies.
- Create large god files.
- Break existing functionality.
- Change architecture without approval.
- Generate low-quality Canvas thumbnail features.

When uncertain, stop and explain before coding.

## 4. Directory Ownership

- `Core/`: Platform-independent logic only.
- `Apps/`: Platform-specific implementations only.
- `Shared/`: Reusable utilities, UI, config, and types.
- `Docs/`: Documentation only.
- `Tests/`: Automated tests only.
- `Scripts/`: Build, migration, and utility scripts.

No directory may assume responsibilities of another.

## 5. File Creation Rules

Create new files only when justified.

Prefer one responsibility per file, small modules, clear names, and predictable locations.

Avoid duplicate utilities, duplicate models, and generic helper dumping grounds.

## 6. Refactoring Rules

Before refactoring:

1. Explain why.
2. Estimate impact.
3. Preserve behavior.
4. Test.
5. Report changed files.

Never refactor unrelated code.

## 7. Playwright Rules

Playwright responsibilities are divided by platform independence.

### Core browser automation

Shared browser lifecycle logic belongs in:

`core/automation/browser`

Allowed responsibilities:

- Browser launch and shutdown
- Browser context creation and cleanup
- Page creation
- Shared launch options
- Shared timeout policy
- Session storage primitives
- Browser-level logging and errors

Core browser modules must remain platform independent and must not contain platform URLs, selectors, login rules, editor behavior, or draft/publishing workflows.

### App browser automation

Platform-specific browser automation belongs inside its App directory, such as:

- `apps/tistory`
- `apps/wordpress`
- `apps/youtube`
- `apps/naver-cafe`

Allowed responsibilities:

- Platform URLs
- Login and session validation
- Page objects
- Stable selectors and locators
- Navigation workflows
- Editor operations
- Draft save workflows
- Platform-specific errors

Requirements:

- Stable locators
- Explicit state-based waits
- Reusable page objects where appropriate
- Clear logging
- Robust error handling
- No duplicated selectors
- No duplicated browser lifecycle logic across Apps

Target v0.1 workflow:

Browser → Login or Restore Session → Open Tistory Editor → Input HTML → Save Draft

Publishing is excluded from v0.1.

## 8. AI Provider Rules

Never call providers directly from business logic.

Use:

Core → AI Provider Interface → Provider Implementation

Supported providers:

- OpenAI
- Claude
- Gemini
- Ollama

Provider implementations must be interchangeable.

## 9. Code Quality Checklist

Every implementation should satisfy:

- Builds successfully
- No lint errors
- No obvious TypeScript errors
- Reusable
- Small functions
- Clear naming
- No duplicated logic
- Documentation updated if required
- Tested
- Existing features preserved

## 10. Commit Message Rules

Use Conventional Commits.

Examples:

- `feat: implement tistory draft workflow`
- `fix: resolve playwright login timeout`
- `docs: update browser automation architecture`

## 11. Completion Report

After every task report:

- Summary
- Files Added
- Files Modified
- Tests Performed
- Risks
- Next Recommended Step

## 12. Development Workflow

Always follow:

Understand → Plan → Implement → Test → Review → Commit

Never skip testing.

## 13. Long-term Vision

Current phase: Personal high-quality platform.

Future phase: Commercial SaaS.

Every decision should support both.

Platform First. Quality First. Maintainability First.
