# HANDOFF.md

# Bright Editor Platform - Development Handoff

## Purpose

This document onboards a new AI coding session. It is deliberately thin: it
says where the current state is recorded, not what the current state is. Status
that is copied into two places goes stale in one of them.

Read in this order:

1. `AGENTS.md`
2. `Docs/current/00_FOUNDATION/08_DECISION_LOG.md`
3. `Docs/current/04_DEVELOPMENT/01_DEVELOPMENT_START.md`
4. `Docs/current/04_DEVELOPMENT/04_CURRENT_DEVELOPMENT_STATUS.md`
5. This file

---

# Where The Current State Lives

Do not infer the current state from this file. Determine it from, in order of
authority:

1. **Decision Log** - `Docs/current/00_FOUNDATION/08_DECISION_LOG.md`. The
   top-level source of truth. If documents conflict, it wins.
2. **AGENTS.md** - the mandatory operating manual for AI agents.
3. Approved Product and Architecture documents under `Docs/current`.
4. **`Docs/current/04_DEVELOPMENT/04_CURRENT_DEVELOPMENT_STATUS.md`** - the
   living status document.
5. **The repository itself** - `git log`, open branches, and open pull
   requests. Work in flight is visible there before it reaches any document.
6. Automated validation - `npm test`, `npm run typecheck`, `npm run lint`.
7. Real external verification against the actual platform.

A design approval does not mean the feature is implemented, and an
implementation does not mean it is externally verified.

---

# Baseline

- Internal name: `Bright Editor Platform`
- Product name: `Bright Studio`
- Repository: `wooooman1-dev/Bright-Editor-Platform`
- Default branch: `main`
- Released tags: `v1.0.0`, `v1.1.0`, `v1.2.0`
- Phase: Implementation. Architecture and planning are complete and frozen
  unless a change is explicitly approved through the Decision Log.

---

# Existing Project

`D:\tstory_auto`

Rules:

- DO NOT modify it.
- DO NOT copy code from it.
- DO NOT refactor it.
- DO NOT use it as the implementation base.

It exists only as historical reference if explicitly requested. Bright Editor
Platform is a clean implementation.

---

# Technology Stack

- Framework: Next.js (App Router)
- Language: TypeScript
- UI: React, Tailwind CSS, shadcn/ui (only when needed)
- Automation: Playwright
- Testing: Vitest, Playwright Test
- Package manager: npm

Commands:

| Purpose | Command |
|---|---|
| Tests | `npm test` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Dev server | `npm run dev` |
| Production build | `npm run build` |

---

# Project Structure

| Path | Contents |
|---|---|
| `core/` | Platform-independent logic only |
| `apps/` | Platform-specific implementations only |
| `app/` | Next.js App Router routes, API handlers, application services |
| `shared/` | Reusable utilities, UI, config, and types |
| `scripts/` | Maintenance and migration scripts |
| `tests/` | Automated tests |
| `Docs/` | Documentation |

Implemented platform apps live under `apps/`. Additional platforms are added
only when their own Decision Log entry approves them.

Runtime data, logs, and caches are written under `.bright-studio/` and are not
tracked by git.

Core must remain platform independent.

---

# Development Principles

- Platform first
- Core / Apps separation
- One feature at a time: implement, test, commit, continue
- Reusable architecture
- Long-term maintainability

Never redesign the architecture during implementation unless the user
explicitly requests it.

---

# AI Principles

AI acts as an Editorial Team.

Target pipeline:

Generation (1) → Quality Review (1) → Rule Validation

Minimize AI calls. A new feature that adds a per-article AI call needs an
explicit reason.

---

# How To Work

1. Read `AGENTS.md`.
2. Read the Decision Log and the relevant `Docs/current` documents.
3. Read this file.
4. Establish the current state from the sources listed above.
5. Explain the implementation plan.
6. Wait for approval if architecture changes are required.
7. Implement one feature.
8. Test.
9. Report changed files.
10. Commit.

Before committing or pushing, confirm that no `.env` file or generated
artifact has been staged.

---

# Completion Report Format

Summary

Files Added

Files Modified

Tests Performed

Remaining Issues

Recommended Next Step

---

# Important

This chat is dedicated to development only. Focus on implementation.

If uncertain, ask before changing the architecture.
