# Project Profile Defaults Status

Last updated: 2026-08-04

## Scope

This document records the one-time default profile migration for the three verified Projects in the current Bright Studio Workspace.

The migration updates only these Project fields:

- `name`
- `description`
- `strategy.primaryTopic`
- `strategy.subtopics`
- `updatedAt`

It preserves all other Project strategy fields, Workspace data, Brands, Contents, Publishing targets, Data Source Connections, Project Data Source References, Snapshots, Evidence and credentials.

Before writing, the migration creates a timestamped backup beside `.bright-studio/studio-data.json`. The write uses a temporary file followed by an atomic rename.

## Canonical defaults

### 건강 정보

```text
Title: 건강 정보
Description: 일상 건강관리, 운동, 걷기, 스트레칭, 수면, 식습관, 혈압·혈당, 건강검진, 건강보험과 실손보험 등 일반 독자가 생활에서 실천하고 이해할 수 있는 건강 정보를 쉽게 설명하는 프로젝트입니다.
Primary topic: 생활건강
Subtopics: 운동, 걷기, 홈트레이닝, 스트레칭, 수면, 식습관, 혈압, 혈당, 건강검진, 영양, 건강보험, 실손보험
```

### 비바레인 미술 감상 가이드

```text
Title: 비바레인 미술 감상 가이드
Description: 서양미술의 주요 화가와 작품, 미술사와 감상 방법을 미술을 처음 접하는 일반 독자가 쉽게 이해하도록 설명하는 프로젝트입니다.
Primary topic: 서양미술 감상
Subtopics: 화가, 명화, 작품 감상, 미술사, 미술관 관람, 회화 기법, 미술 사조
```

### 밝은재테크

```text
Title: 밝은재테크
Description: 생활비 절약, 고정비 관리, 예금·적금, 보험, 신용관리, 카드 혜택, 세금과 정부지원금 등 일상에서 바로 적용할 수 있는 생활재테크 정보를 제공하는 프로젝트입니다.
Primary topic: 생활재테크
Subtopics: 생활비 절약, 고정비 관리, 예금, 적금, 보험, 신용관리, 카드 혜택, 세금, 정부지원금, 통신비 절약, 구독료 절약, 대출 관리
```

## Application command

```powershell
npm run project:apply-default-profiles
```

The command reads `shared/templates/project-profile-defaults.json` and updates `.bright-studio/studio-data.json` only when a current Project name matches one of the approved template names.

## UI projection

The Project screen displays a `Project 기본 프로필` card with:

- Project title
- Project description
- primary topic
- subtopic chips

This makes the exact context used for Content Opportunity and automatic Planning visible before new content is created.

## Verification gates

Automated:

- all three approved profiles are applied
- unrelated Project strategy fields are preserved
- Contents and unrelated snapshot collections are preserved
- unknown Projects remain unchanged
- TypeScript, lint, complete non-E2E tests and production build pass

Local:

- backup file is created
- three Project records are updated
- each Project screen shows the approved profile
- Content Opportunity uses the new Project terms after the correct Data Source is assigned and synchronized

No publishing, WordPress Draft save, public write, credential change or Data Source reference change is part of this migration.
