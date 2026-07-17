# 09. Project DNA

Version: 2.0
Status: Approved
Sprint: Sprint 7
Owner: Core Platform

---

# 1. Purpose

Project DNA는 Bright Studio에서 생성되는 모든 콘텐츠의 기준이 되는 편집 전략(Editorial Strategy)이다.

사용자는 프로젝트를 생성할 때 매번 동일한 설정을 반복해서 입력하지 않아야 한다.

Project DNA는 프로젝트의 목적, 대상 독자, 콘텐츠 방향성, SEO 전략, 이미지 전략, CTA 정책, 품질 목표 등을 하나의 전략 객체(Strategy Object)로 관리하며, 모든 AI Workflow는 Project DNA를 기본 Context로 사용한다.

Project DNA는 단순한 프로젝트 설정이 아니라 프로젝트의 장기적인 콘텐츠 운영 전략을 저장하는 Core Domain이다.

---

# 2. Vision

프로젝트가 많아질수록 사용자는 더 적게 입력해야 한다.

Bright Studio는 프로젝트를 학습하지 않는다.

프로젝트의 전략(Project DNA)을 관리한다.

AI는 새로운 콘텐츠를 생성하기 전에 반드시 Project DNA를 참조하여 동일한 브랜드 철학과 콘텐츠 방향성을 유지한다.

---

# 3. Objectives

Project DNA는 다음 목적을 가진다.

- 프로젝트별 콘텐츠 전략 저장
- AI Context의 기본 데이터 제공
- 콘텐츠 품질의 일관성 유지
- 플랫폼별 기본 정책 관리
- SEO 전략 관리
- CTA 전략 관리
- 이미지 전략 관리
- 내부 링크 정책 관리
- Related Content 정책 관리
- 장기적인 브랜드 일관성 유지

---

# 4. Design Principles

## 4.1 Strategy First

모든 콘텐츠는 전략(Project DNA)에서 시작한다.

AI는 Project DNA 없이 콘텐츠를 생성하지 않는다.

---

## 4.2 Consistency

같은 프로젝트에서 생성되는 모든 콘텐츠는 동일한 전략을 따른다.

예를 들어

- 말투
- 독자층
- CTA
- 이미지 스타일
- SEO 방향

은 항상 일관성을 유지해야 한다.

---

## 4.3 Reusability

Project DNA는 여러 콘텐츠에서 재사용된다.

프로젝트를 생성한 이후에는 매번 동일한 설정을 반복 입력하지 않는다.

---

## 4.4 Platform Independent

Project DNA는 특정 플랫폼에 종속되지 않는다.

동일한 Project DNA를 기반으로

- Tistory
- WordPress
- YouTube
- Naver Cafe

등 다양한 플랫폼에 맞게 콘텐츠를 생성할 수 있다.

---

# 5. Position in Architecture

Project DNA는 Content Intelligence Layer의 시작점이다.

```
Workspace
        │
        ▼
     Brand (Optional)
        │
        ▼
    Project DNA
        │
        ▼
 Content Intelligence
        │
        ▼
 AI Context Builder
        │
        ▼
 AI Generation
        │
        ▼
 Quality Review
        │
        ▼
 Publishing
```

Project DNA는 모든 AI Workflow의 첫 번째 입력(Context Source)이다.

---

# 6. Responsibilities

Project DNA는 다음 정보를 관리한다.

## Editorial Strategy

- 콘텐츠 목적
- 콘텐츠 유형
- 대상 독자
- 브랜드 방향성

---

## SEO Strategy

- 대표 키워드
- 세부 키워드
- 제외 키워드
- Search Intent
- 목표 검색 노출 전략

---

## Content Strategy

- 기본 문체
- 기본 길이
- Heading 정책
- FAQ 정책
- Table 정책
- Summary 정책

---

## Image Strategy

- 대표 이미지 정책
- 본문 이미지 정책
- ALT 정책
- 이미지 스타일
- 썸네일 정책

---

## CTA Strategy

- CTA 사용 여부
- CTA 위치
- CTA 종류
- CTA 디자인 정책

---

## Internal Link Strategy

- 내부 링크 개수
- 추천 방식
- 삽입 위치
- Related Content 정책

---

## Publishing Strategy

- 기본 플랫폼
- 기본 카테고리
- Draft 정책
- Review 정책
- 예약 발행 정책

---

## Quality Strategy

목표 품질 점수

- SEO
- Readability
- Search Intent
- Structure
- Overall Quality

Project DNA는 목표 품질을 저장하며 Quality Engine은 이를 기준으로 검토를 수행한다.

---

# 7. Lifecycle

Project DNA는 다음 생명주기를 가진다.

Project 생성

↓

Project DNA 생성

↓

콘텐츠 생성

↓

콘텐츠 발행

↓

Project DNA 유지

↓

전략 수정

↓

새 콘텐츠 생성

Project DNA는 콘텐츠마다 생성되지 않는다.

프로젝트 전체에서 하나만 존재한다.

---

# 8. AI Integration

AI는 직접 프로젝트 정보를 조회하지 않는다.

반드시 AI Context Builder를 통해 Project DNA를 전달받는다.

AI Context는 다음 정보를 포함한다.

- Project DNA
- Content Library
- Published Registry
- Keyword Memory
- Search Intent Memory
- Quality History
- Related Contents

Project DNA는 AI Context의 가장 우선순위가 높은 정보이다.

---

# 9. Inheritance

Project DNA는 다음 우선순위를 따른다.

Workspace Default

↓

Brand Default (Optional)

↓

Project DNA

↓

Content Override

Content에서 별도로 지정하지 않는 한 항상 Project DNA의 설정을 상속한다.

---

# 10. Acceptance Criteria

Sprint 7에서 Project DNA는 다음 요구사항을 만족해야 한다.

- 프로젝트별 하나의 DNA만 존재한다.
- 모든 콘텐츠 생성 시 자동 적용된다.
- AI Context Builder에서 항상 참조된다.
- 플랫폼과 독립적으로 동작한다.
- Content Intelligence와 완전히 통합된다.
- 향후 WordPress, YouTube 등 모든 플랫폼에서 재사용 가능하다.

# 11. Project DNA Data Model

Project DNA는 하나의 Strategy Object이다.

각 Project는 하나의 Project DNA만 가진다.

```
Project
│
├── id
├── workspaceId
├── brandId
├── name
└── dna
```

Project DNA는 다음 정보를 포함한다.

```
ProjectDNA
│
├── Editorial Strategy
├── Audience
├── SEO Strategy
├── Content Strategy
├── Image Strategy
├── CTA Strategy
├── Internal Link Strategy
├── Publishing Strategy
├── Quality Strategy
├── Metadata
└── Version
```

모든 전략은 하나의 객체로 관리하지만 내부적으로는 독립적인 Domain으로 분리한다.

---

# 12. Repository Structure

Project DNA는 Repository Pattern을 사용한다.

```
core/
 └── project-dna/
      ├── domain/
      │      ProjectDNA.ts
      │      ProjectDNARepository.ts
      │
      ├── application/
      │      CreateProjectDNA.ts
      │      UpdateProjectDNA.ts
      │      GetProjectDNA.ts
      │
      ├── infrastructure/
      │      SqlProjectDNARepository.ts
      │
      └── presentation/
```

Repository 외부에서는 Database 구조를 알 수 없어야 한다.

AI Engine 역시 Repository를 직접 조회하지 않는다.

---

# 13. Domain Model

Project DNA는 다음 Domain으로 구성된다.

## Editorial Domain

콘텐츠의 방향성을 정의한다.

예)

- 정보 제공
- 브랜딩
- 판매
- 교육
- 뉴스
- 리뷰

---

## Audience Domain

독자를 정의한다.

예)

- 초보자
- 전문가
- 일반 사용자
- 구매 예정자

AI는 독자의 수준에 맞는 콘텐츠를 생성해야 한다.

---

## SEO Domain

SEO 전략을 관리한다.

포함 정보

- Primary Keyword
- Secondary Keyword
- Excluded Keyword
- Search Intent
- Meta Strategy
- URL Strategy

---

## Image Domain

이미지 정책을 정의한다.

예)

- Hero Image

- Infographic

- Comparison

- Summary Card

- Warning Card

이미지의 개수보다 목적이 우선이다.

---

## CTA Domain

CTA 정책을 저장한다.

예)

- CTA 사용 여부

- 위치

- 디자인

- Button Style

- Link Target

---

## Publishing Domain

기본 발행 정책을 저장한다.

예)

- Draft Only

- Review First

- Default Platform

- Default Category

- Schedule Policy

---

## Quality Domain

목표 품질을 정의한다.

예)

SEO ≥95

Readability ≥95

Search Intent ≥95

Overall ≥95

AI는 이 목표를 만족할 때까지 품질 개선을 반복한다.

---

# 14. AI Context Mapping

AI가 콘텐츠를 생성하기 전에 다음 순서로 Context를 구성한다.

```
Workspace

↓

Brand

↓

Project DNA

↓

Content Intelligence

↓

Published Registry

↓

Keyword Memory

↓

Search Intent

↓

Related Contents

↓

Quality History

↓

Prompt Builder

↓

AI Generation
```

Project DNA는 Prompt Builder보다 먼저 적용된다.

---

# 15. Validation Rules

Project DNA는 저장 전에 다음 규칙을 검증한다.

## Required

반드시 존재해야 하는 값

- Project Name
- Audience
- Content Goal
- Default Platform

---

## Recommended

권장 값

- SEO Strategy
- CTA Strategy
- Image Strategy
- Search Intent

---

## Optional

선택 값

- Brand Voice
- FAQ Policy
- Table Policy
- Summary Policy

---

필수 항목이 없는 경우 Project DNA는 저장되지 않는다.

---

# 16. Versioning

Project DNA는 버전 관리된다.

```
Version 1

↓

Version 2

↓

Version 3
```

새로운 콘텐츠는 항상 최신 버전을 사용한다.

기존 콘텐츠는 생성 당시 사용한 버전을 유지한다.

이를 통해 과거 콘텐츠의 재현 가능성을 보장한다.

---

# 17. Change Policy

Project DNA 변경은 기존 콘텐츠를 수정하지 않는다.

변경 이후 생성되는 콘텐츠부터 적용한다.

이는 콘텐츠의 일관성과 이력 보존을 위한 원칙이다.

---

# 18. Security

Project DNA에는 민감한 인증 정보나 플랫폼 계정 정보를 저장하지 않는다.

저장 가능한 정보는 다음과 같다.

- 콘텐츠 전략
- 품질 목표
- 기본 설정
- 카테고리 정책

플랫폼 인증 정보는 Platform Connections에서 별도로 관리한다.

Project DNA는 인증 시스템과 독립적으로 동작해야 한다.

---

# 19. Integration with Content Intelligence

Project DNA는 Content Intelligence의 시작점이다.

Content Intelligence는 Project DNA를 기반으로 다음 정보를 결합한다.

```
Project DNA
        │
        ▼
Content Library
        │
        ▼
Published Registry
        │
        ▼
Keyword Memory
        │
        ▼
Search Intent Memory
        │
        ▼
Related Content Engine
        │
        ▼
Internal Link Engine
        │
        ▼
Quality History
        │
        ▼
AI Context Builder
```

Project DNA는 Content Intelligence를 대체하지 않는다.

Project DNA는 Content Intelligence가 활용하는 기본 전략을 제공한다.

---

# 20. Integration with Quality Engine

Quality Engine은 프로젝트마다 서로 다른 기준을 사용할 수 있어야 한다.

예를 들어

Health Project

- SEO 95
- Readability 95
- Medical Accuracy 98

Finance Project

- SEO 95
- Accuracy 99
- Compliance 99

YouTube Project

- Hook 98
- Retention 98
- CTA 95

Quality Engine은 Project DNA에 정의된 목표를 읽어 검토를 수행한다.

---

# 21. Integration with Publishing

Publishing Layer는 Project DNA를 기반으로 기본 발행 정책을 결정한다.

예)

기본 플랫폼

↓

Tistory

기본 상태

↓

Draft

기본 검토

↓

Review First

기본 카테고리

↓

건강정보

사용자는 발행 전에 변경할 수 있지만 기본값은 Project DNA에서 제공한다.

---

# 22. AI Workflow

콘텐츠 생성 시 AI Workflow는 다음 순서를 따른다.

Natural Language Input

↓

Project 선택

↓

Project DNA 조회

↓

Content Intelligence 조회

↓

AI Context 생성

↓

Planning

↓

Writing

↓

SEO Optimization

↓

Image Strategy

↓

Internal Link Strategy

↓

CTA Strategy

↓

Quality Review

↓

Editor

↓

Publishing

Project DNA는 Planning 이전에 반드시 적용되어야 한다.

---

# 23. Relationship with Other Documents

Project DNA는 독립적으로 존재하지 않는다.

다음 문서들과 함께 동작한다.

| Document | Purpose |
|----------|---------|
| 06_PRODUCT_ARCHITECTURE | 전체 시스템 구조 |
| 08_QUALITY_ENGINE | 품질 검토 규칙 |
| 13_CONTENT_INTELLIGENCE | 지식 관리 및 추천 |
| 04_FEATURE_SPEC | Sprint 기능 정의 |
| 03_USER_FLOW | 사용자 흐름 |

Project DNA는 전략을 정의한다.

Content Intelligence는 지식을 관리한다.

Quality Engine은 품질을 관리한다.

Publishing은 결과를 전달한다.

각 문서는 역할이 명확히 분리되어야 한다.

---

# 24. Best Practices

Project DNA는 자주 변경하지 않는다.

프로젝트의 방향성이 크게 바뀌는 경우에만 수정한다.

콘텐츠마다 다른 설정은 Content Override를 사용한다.

Project DNA에는 플랫폼 계정 정보나 API Key를 저장하지 않는다.

Project DNA는 전략만 저장한다.

---

# 25. Example

Workspace

Bright Studio

↓

Project

Bright Health

↓

Project DNA

Audience

- 40~60대

Tone

- 전문가이지만 이해하기 쉬운 설명

SEO

- 건강 키워드 중심

Image

- Hero + Infographic + Summary Card

CTA

- 쇼핑몰 이동

Publishing

- Tistory
- Draft Only
- Review First

Quality

- Overall ≥95

이후 생성되는 모든 콘텐츠는 위 전략을 기본으로 사용한다.

---

# 26. Future Extension

향후 Project DNA는 다음 기능으로 확장될 수 있다.

- Brand Voice Profile
- AI Persona
- Seasonal Strategy
- Campaign Strategy
- Geographic Strategy
- Language Strategy
- A/B Test Strategy
- Monetization Strategy
- Conversion Strategy
- Analytics Feedback
- AI Learning Profile

Project DNA는 새로운 전략 객체를 추가할 수 있도록 확장 가능한 구조를 유지해야 한다.

---

# 27. Acceptance Criteria

Sprint 7에서 Project DNA는 다음 요구사항을 만족해야 한다.

### Architecture

- Platform Independent
- Core Domain
- Single Source of Truth

### AI

- AI Context Builder와 완전 통합
- Planning 이전 적용
- 모든 AI Workflow에서 참조

### Content

- 프로젝트별 전략 유지
- 콘텐츠 생성 시 자동 적용
- Content Override 지원

### Publishing

- 기본 플랫폼 제공
- 기본 카테고리 제공
- 기본 발행 정책 제공

### Quality

- 품질 목표 제공
- Quality Engine 연동

### Extensibility

- 새로운 전략 Domain 추가 가능
- 플랫폼 추가 가능
- AI 기능 추가 가능

---

# 28. Summary

Project DNA는 단순한 프로젝트 설정이 아니다.

Project DNA는 프로젝트의 편집 전략을 정의하는 Core Domain이다.

모든 콘텐츠는 Project DNA에서 시작한다.

모든 AI Workflow는 Project DNA를 기반으로 동작한다.

Project DNA는 Content Intelligence와 함께 Bright Studio가 시간이 지날수록 더 똑똑해지는 기반을 제공한다.

29. Relationship with Project Settings

Project Settings와 Project DNA의 차이를 명확히 정의

Project Settings
프로젝트 자체의 운영 설정
이름
설명
기본 플랫폼
연결 정보 참조
UI 설정
Project DNA
콘텐츠 생성 전략
SEO 전략
이미지 전략
CTA 전략
품질 전략
AI Context 전략

Project Settings는 프로젝트를 관리한다.

Project DNA는 콘텐츠를 관리한다.

30. Relationship with Content Model

Project DNA는 Content 자체를 저장하지 않는다.

Project DNA는 Content Model 생성 규칙을 제공한다.

Project DNA

↓

Planning

↓

Content Model

↓

Renderer

↓

Platform Adapter

↓

Published Content

Project DNA는 Content Model의 입력이다.

Content Model은 플랫폼과 독립적으로 유지된다.

31. AI Workflow Policy

Bright Studio는 다음 AI Workflow를 기본 정책으로 사용한다.

Project DNA

↓

Planning

↓

AI Generation (1 Call)

↓

Quality Review (1 Call)

↓

Automatic Improvements

↓

Editor

Project DNA는 AI Workflow 전체에서 가장 우선되는 Context이다.

32. Relationship with Content Library

Project DNA는 전략을 저장한다.

Content Library는 실제 발행된 콘텐츠를 저장한다.

AI는 두 정보를 함께 사용한다.

Project DNA
        │
        ▼
Content Library
        │
        ▼
Published Registry
        │
        ▼
Related Content
        │
        ▼
Internal Link Engine
33. Publishing Integration

Publishing은 Project DNA의 기본 전략을 따른다.

예를 들어

기본 플랫폼
Draft Only
Review First
Default Category
CTA Policy
Internal Link Policy

사용자는 발행 직전에 변경할 수 있지만 기본값은 Project DNA에서 제공한다.

34. Final Principle

Project DNA는 프로젝트의 설정이 아니다.

Project DNA는 프로젝트의 콘텐츠 철학을 정의하는 핵심 전략 객체이다.

프로젝트가 오래될수록 더 많은 콘텐츠가 축적되지만,

모든 콘텐츠는 동일한 Project DNA를 기반으로 일관된 품질과 브랜드 경험을 유지해야 한다.