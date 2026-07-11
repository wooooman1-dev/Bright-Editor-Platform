# Bright Editor Platform

> AI-powered Content Lifecycle Platform

Bright Editor Platform is a platform that helps creators plan, generate, review, publish, analyze, and continuously improve content.

The first supported application is **Tistory Edition**, but the architecture is designed to support additional publishing platforms such as WordPress, YouTube, Naver Cafe, Instagram, Blog, and Shopping.

---

## Vision

Bright Editor is **not** a simple AI writing tool.

It is an **AI Editorial Platform** that supports the complete content lifecycle.

```text
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
```

---

## Project Goals

### Current (v0.x)

- Personal high-quality content platform
- Playwright-based Tistory automation
- AI Editor
- Quality Review
- Reusable Core architecture

### Future (Commercial)

- Multi-user Workspace
- Authentication
- Subscription & Billing
- SEO & SSR
- Cloud deployment
- Multi-platform publishing

---

## Technology Stack

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- Playwright
- Vitest
- npm

---

## Project Structure

```text
Docs/
apps/
core/
shared/
assets/
data/
logs/
scripts/
tests/
```

---

## Documentation

The official documentation is located in:

```text
Docs/current
```

Read in the following order:

1. 00_FOUNDATION
2. 01_PRODUCT
3. 02_ARCHITECTURE
4. 03_DEVELOPMENT

---

## Development Principles

- Platform First
- Core / Apps separation
- Small incremental development
- Test after every feature
- Reusable architecture
- Long-term maintainability

---

## AI Development

All AI coding agents must read **AGENTS.md** before making any code changes.

AGENTS.md defines:

- Development rules
- Coding standards
- Architecture rules
- Technology stack
- Git workflow
- Project goals

---

## Current Milestone

**v0.1.0**

Goal:

```text
Playwright
    ↓
Open Tistory Editor
    ↓
Input HTML
    ↓
Save Draft
```

---

## License

Private project.
