# AI_CONTEXT.md
# Bright Editor Platform - AI Context

> This is the single handoff document for every new AI development session.

---

# 1. How to Start

Before writing any code:

1. Read this file completely.
2. Treat this document as the high-level context.
3. Use Docs/current as the detailed specification.
4. If implementation conflicts with Docs/current, Docs/current wins.

---

# 2. Project Overview

Project Name

Bright Editor Platform

Purpose

Bright Editor Platform is an AI-powered Content Lifecycle Platform.

It is NOT a simple AI writing application.

Content Lifecycle

Discover
↓
Decide
↓
Create
↓
Publish
↓
Measure
↓
Improve
↓
Repurpose

---

# 3. Current Status

Architecture: Finalized

Planning: Completed

Development: Started

Current Phase:

Implementation only.

Meetings are finished.

Avoid unnecessary redesign discussions.

---

# 4. Existing Project

Existing project:

D:\tstory_auto

Rules

- Never modify it.
- Never copy code from it.
- Never refactor it.
- Never use it as the implementation base.

Only reference ideas when explicitly requested.

Bright Editor Platform is a clean implementation.

---

# 5. Technology Stack

Framework
- Next.js (App Router)

Language
- TypeScript

UI
- React

Styling
- Tailwind CSS

Components
- shadcn/ui (only when necessary)

Automation
- Playwright

Testing
- Vitest
- Playwright Test

Package Manager
- npm

---

# 6. Project Structure

Root

- Docs
- apps
- core
- shared
- assets
- data
- logs
- scripts
- tests

Apps

- tistory
- wordpress
- youtube
- naver-cafe
- instagram
- blog
- shopping

Core

- ai
- editor
- publishing
- quality
- strategy
- transformation

Core must remain platform independent.

---

# 7. Development Principles

Platform First

Core and Apps separation

One feature at a time

Implement

↓

Test

↓

Commit

↓

Next feature

Prefer maintainability over shortcuts.

Preserve architecture.

---

# 8. AI Principles

AI is an Editorial Team.

Generation (1)

↓

Quality Review (1)

↓

Rule Validation

Prefer code validation whenever possible.

Minimize AI calls.

---

# 9. Current Milestone (v0.1)

Goal

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

Publishing is intentionally excluded from v0.1.

---

# 10. Required Workflow

For every task

1. Analyze current structure.
2. Explain implementation plan.
3. Implement one feature only.
4. Test.
5. Report changed files.
6. Commit.
7. Recommend next step.

---

# 11. Completion Report

Always include

- Summary
- Files Added
- Files Modified
- Tests Performed
- Remaining Issues
- Recommended Next Step

---

# 12. Documentation

Primary references

README.md
Docs/current

Detailed AI rules

AGENTS.md

Detailed development state

Docs/current/03_DEVELOPMENT/01_DEVELOPMENT_START.md

This file summarizes the entire project for new AI sessions.

---

# 13. Instruction for New AI Session

Start in Development Mode.

Do not redesign the architecture.

Do not introduce unnecessary dependencies.

Implement only the approved task.

Wait for user approval before architectural changes.

Focus on implementation quality.

