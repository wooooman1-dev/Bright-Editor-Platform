# HANDOFF.md

# Bright Editor Platform - Development Handoff

## Purpose

This document transfers the current project state to a new AI coding session.

Every new development session should begin by reading:

1. README.md
2. AGENTS.md
3. Docs/current/03_DEVELOPMENT/01_DEVELOPMENT_START.md
4. This HANDOFF.md

---

# Current Project Status

Project Name:
Bright Editor Platform

Current Phase:
Implementation

Architecture:
Completed

Planning:
Completed

Development Mode:
Implementation only

Discussion Phase:
Closed

---

# Existing Project

Existing project:

D:\tstory_auto

Rules:

- DO NOT modify it.
- DO NOT copy code from it.
- DO NOT refactor it.
- DO NOT use it as the implementation base.

It exists only as historical reference if explicitly requested.

Bright Editor Platform is a clean implementation.

---

# Technology Stack

Framework
- Next.js (App Router)

Language
- TypeScript

UI
- React

Styling
- Tailwind CSS

Components
- shadcn/ui (only when needed)

Automation
- Playwright

Testing
- Vitest
- Playwright Test

Package Manager
- npm

---

# Project Structure

Core directories

- apps
- core
- shared
- assets
- data
- logs
- scripts
- tests
- Docs

Applications

- tistory
- wordpress
- youtube
- naver-cafe
- instagram
- blog
- shopping

Core must remain platform independent.

---

# Development Principles

- Platform First
- Core / Apps separation
- One feature at a time
- Implement
- Test
- Commit
- Continue
- Reusable architecture
- Long-term maintainability

Never redesign the architecture during implementation unless the user explicitly requests it.

---

# AI Principles

AI acts as an Editorial Team.

Target pipeline:

Generation (1)

↓

Quality Review (1)

↓

Rule Validation

Minimize AI calls.

---

# Current Milestone

Version:

v0.1.0

Goal:

Playwright

↓

Launch Browser

↓

Login / Restore Session

↓

Open Tistory Editor

↓

Input HTML

↓

Save Draft

Publishing will be implemented later.

---

# How To Work

Always:

1. Read AGENTS.md
2. Read Docs/current
3. Read DEVELOPMENT_START.md
4. Read this file
5. Analyze the current project
6. Explain the implementation plan
7. Wait for approval if architecture changes are required
8. Implement only one feature
9. Test
10. Report changed files
11. Commit

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

This chat is dedicated to development only.

Avoid unnecessary discussions.

Focus on implementation.

If uncertain, ask before changing the architecture.
