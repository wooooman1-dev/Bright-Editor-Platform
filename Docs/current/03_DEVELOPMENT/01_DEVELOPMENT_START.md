# 01_DEVELOPMENT_START.md

# Bright Editor Platform - Development Start

## Purpose

This document is the entry point for every development session.

Before implementing any code, AI agents and developers should read:

1. AGENTS.md
2. Docs/current/00_FOUNDATION
3. Docs/current/01_PRODUCT
4. Docs/current/02_ARCHITECTURE
5. This document

---

# Current Development Status

Project Status: Active Development

Architecture: Confirmed

Documentation: Completed

Development Mode: Implementation Only

Meeting Phase: Finished

---

# Project Goal

Bright Editor Platform is an AI-powered Content Lifecycle Platform.

The first supported application is:

- Tistory Edition

The architecture must support future applications:

- WordPress
- YouTube
- Naver Cafe
- Instagram
- Blog
- Shopping

---

# Current Technology Stack

Framework
- Next.js (App Router)

Language
- TypeScript

UI
- React

Styling
- Tailwind CSS

Automation
- Playwright

Testing
- Vitest
- Playwright Test

Package Manager
- npm

---

# Important Rules

The existing project

D:\tstory_auto

is NOT part of this implementation.

Do NOT:

- modify it
- copy from it
- refactor it

It may only be referenced conceptually if required.

Bright Editor Platform is a clean implementation.

---

# Development Principles

- Platform First
- Core and Apps separation
- Small incremental development
- One feature at a time
- Test immediately
- Commit after successful testing
- Preserve architecture
- Long-term maintainability over shortcuts

---

# Current Target (v0.1)

Implement only the minimum publishing workflow.

Playwright

↓

Launch Browser

↓

Restore/Login Session

↓

Open Tistory Editor

↓

Input HTML

↓

Save Draft

Publishing comes later.

---

# Standard Development Workflow

For every feature:

1. Understand
2. Plan
3. Implement
4. Test
5. Review
6. Commit

Never skip testing.

---

# Completion Report

After each task provide:

- Summary
- Files Added
- Files Modified
- Tests Performed
- Remaining Issues
- Next Step

---

# Immediate Next Task

Initialize the application foundation using the approved architecture.

Do not implement additional features until the current step is verified.

