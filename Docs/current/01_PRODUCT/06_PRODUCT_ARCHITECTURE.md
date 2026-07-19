# Product Architecture

**Version:** 3.0  
**Status:** Approved  
**Document Type:** Product Architecture  
**Internal Project Name:** Bright Editor Platform  
**User-facing Product Name:** Bright Studio  

---

# 1. Purpose

이 문서는 Bright Studio의 제품 아키텍처를 정의한다.

Bright Studio가 어떤 제품 구조로 동작하는지, 각 제품 영역이 어떤 책임을 가지는지, 콘텐츠가 생성되어 발행되기까지 어떤 흐름을 따르는지를 설명한다.

이 문서는 기술 구현 세부사항보다 제품 구조와 책임 경계를 정의한다.

구체적인 기술 구현은 Architecture 문서에서 다루며, 사용자 화면 동작은 User Flow와 Design 문서에서 다룬다.

---

# 2. Product Identity

Bright Studio는 단순한 AI Writer나 블로그 자동화 도구가 아니다.

Bright Studio는 콘텐츠의 전체 생명주기를 관리하는 AI Content Operating System이다.

Bright Studio가 담당하는 범위는 다음과 같다.

- 콘텐츠 전략
- 검색 의도 분석
- 독자 분석
- 콘텐츠 기획
- 콘텐츠 생성
- SEO 전략
- 이미지 전략
- CTA 전략
- 내부 링크 전략
- 품질 검토
- 편집
- 플랫폼 변환
- 미리보기
- 임시저장
- 발행
- 발행 이력 관리
- 콘텐츠 재활용

사용자는 아이디어와 최종 결정을 담당한다.

Bright Studio는 콘텐츠 실행 품질을 담당한다.

---

# 3. Architecture Principles

Bright Studio는 다음 원칙을 따른다.

## 3.1 Platform First

콘텐츠 생성 로직은 특정 플랫폼에 종속되지 않는다.

Tistory, WordPress, YouTube, Naver Cafe 및 향후 플랫폼은 공통 Core 위에서 Adapter 방식으로 확장한다.

## 3.2 Core First

플랫폼 공통 기능은 반드시 Core에 위치한다.

특정 플랫폼에서만 필요한 기능은 Apps에 위치한다.

## 3.3 Content Model First

콘텐츠의 기준 형식은 플랫폼 HTML이 아니라 Content Model이다.

Content Model은 모든 플랫폼 출력의 원본이 된다.

## 3.4 Project First

콘텐츠는 항상 Project 안에서 생성되고 관리된다.

Project는 콘텐츠 전략과 운영 문맥의 중심이다.

## 3.5 Workspace First

Workspace는 Project, Publishing 전용 PlatformConnection, 시장·성과 Evidence 전용 DataSourceConnection, 설정과 운영 기록을 소유한다.

## 3.6 Quality First

콘텐츠는 생성된 즉시 사용자에게 전달되지 않는다.

생성 이후 Quality Review를 거쳐 품질 목표를 만족하도록 개선한다.

## 3.7 Review First

발행 전 사용자의 검토를 기본 원칙으로 한다.

초기 기본 발행 정책은 Draft Only이다.

## 3.8 Cost Efficient

기본 AI Workflow는 다음 구조를 유지한다.

- AI Generation: 1회
- AI Quality Review: 1회

불필요한 다중 Agent 호출을 피한다.

## 3.9 Agent Ready

현재는 통합 AI Workflow를 사용하지만, 향후 각 역할을 독립 Agent로 분리할 수 있어야 한다.

---

# 4. Platform Structure

```text
Bright Studio Platform

Core
├── AI Engine
├── Prompt Engine
├── Editor Engine
├── Content Engine
├── Content Intelligence Engine
├── Quality Engine
├── Image Strategy Engine
├── Publishing Engine
└── Automation Permission Engine

Apps
├── Tistory
├── WordPress
├── YouTube
├── Naver Cafe
├── Blog
├── Shopping
└── Future Platforms

Shared
├── Content Model
├── UI Components
├── Templates
├── Theme System
├── Assets
├── Settings
└── Shared Types

# 5. Core Responsibility

Core는 플랫폼에 독립적인 모든 공통 로직을 담당한다.

Core에는 다음 책임이 포함된다.

AI Provider 추상화
AI Generation Workflow
Prompt 조립
Content Model 생성
Content 처리
Content Intelligence
품질 분석
품질 개선
이미지 전략
CTA 전략
내부 링크 전략
발행 준비
발행 권한 검증
저장 및 이력 관리

Core는 특정 플랫폼의 DOM, URL, 로그인 방식 또는 Editor 구조를 알지 못한다.

Core와 AI Engine은 Playwright를 직접 호출하지 않는다.

# 6. Apps Responsibility

Apps는 플랫폼별 구현을 담당한다.

각 App은 다음 책임을 가진다.

플랫폼 연결
인증 및 세션
플랫폼 카테고리 조회
플랫폼 Metadata 변환
플랫폼 전용 HTML Rendering
이미지 및 Media Upload
Editor 진입
Preview
Draft Save
Publish
발행 결과 검증

예시:

Apps
└── Tistory
    ├── Tistory Adapter
    ├── Tistory Renderer
    ├── Tistory Category Mapper
    ├── Tistory Media Uploader
    ├── Tistory Preview
    ├── Tistory Draft Workflow
    └── Tistory Verification

플랫폼별 로직은 다른 App 또는 Core로 누출되어서는 안 된다.

# 7. Shared Responsibility

Shared는 Core와 Apps가 함께 사용하는 재사용 가능한 요소를 제공한다.

Shared에 포함할 수 있는 항목은 다음과 같다.

공통 Content Model Type
공통 UI Component
콘텐츠 Template
HTML Component
Theme Token
공통 설정 Type
공통 Validation Utility

Bright Components는 Shared에 속하는 플랫폼 독립적인 Presentation 정의이다.

Bright Components는 다음과 같은 재사용 가능한 콘텐츠 표현을 포함할 수 있다.

- CTA
- Callout
- Card
- Checklist
- Comparison Table
- FAQ
- Notice
- Warning
- Related Posts
- Table of Contents

Bright Components의 의미 구조는 플랫폼 간 공유한다.

플랫폼별 HTML, CSS 및 외부 플랫폼 호환 처리는 각 App의 Renderer가 담당한다.

Theme System은 색상, 타이포그래피, 간격 및 시각 표현을 변경할 수 있지만 Content의 의미, Heading 구조, CTA 목적 또는 접근성 구조를 변경해서는 안 된다.

Shared는 비즈니스 Workflow를 소유하지 않는다.

8. Product Ownership Model

Bright Studio의 기본 소유 구조는 다음과 같다.

Workspace
├── Brand
├── Project
│   ├── Project DNA
│   ├── Content
│   ├── Content Library
│   ├── Quality History
│   ├── Publishing History
│   └── Platform Target
├── Platform Connections
├── Publishing Accounts
├── Data Source Connections
├── Assets
└── Workspace Settings
8.1 Workspace

Workspace는 사용자의 독립적인 작업 공간이다.

Workspace는 Brand가 아니다.

Workspace는 다음 항목을 소유한다.

Project
Brand
Platform Connection
Publishing Account
Data Source Connection
Workspace 설정
Automation 권한
Assets
8.2 Brand

Brand는 선택 항목이다.

Project는 Brand 없이도 생성할 수 있다.

Workspace
└── Project

또는

Workspace
└── Brand
    └── Project

Project가 Brand와 연결되어도 Workspace 직접 소유권은 유지한다.

8.3 Project

Project는 콘텐츠 운영의 중심 단위이다.

Project는 다음 내용을 관리한다.

기본 콘텐츠 전략
대상 독자
대표 주제
세부 주제
제외 주제
기본 플랫폼
기본 콘텐츠 유형
SEO 정책
이미지 정책
CTA 정책
내부 링크 정책
관련 콘텐츠 정책
품질 목표
기본 발행 설정
8.4 Content

Content는 반드시 하나의 Project에 속한다.

Workspace 또는 Brand가 Content를 직접 소유하지 않는다.

9. Project DNA

Project DNA는 Project의 장기 콘텐츠 전략이다.

Project DNA는 콘텐츠 생성마다 반복해서 입력해야 하는 설정을 저장한다.

Project DNA에는 다음 정보가 포함될 수 있다.

Project Identity
Content Domain
Main Topics
Supporting Topics
Excluded Topics
Target Audience
Reader Problems
Search Intent Strategy
Tone and Voice
Content Type
Target Length
SEO Strategy
Image Strategy
CTA Strategy
Internal Link Strategy
Related Content Strategy
Quality Target
Default Platform
Default Publishing Account
Default Category

AI는 콘텐츠 생성 전에 반드시 Project DNA를 참조한다.

Project DNA의 상세 설계는 09_PROJECT_DNA.md를 따른다.

10. Content Intelligence Layer

Content Intelligence Layer는 기존 콘텐츠와 프로젝트 지식을 활용하여 AI Generation의 품질을 높이는 Core 계층이다.

현재 전체 상태는 `Partially Implemented`다. Content Opportunity, Planning 상태 Persistence와 Data Source and Opportunity Intelligence Foundation만 구현되었다. Project DNA, Content Library, Published Content Registry, Search Intent Memory, Keyword Memory, Topic Memory, Duplicate Detection, Cannibalization Detection과 Internal Link Intelligence는 미구현이다.

주요 책임은 다음과 같다.

Project DNA 조회
Content Library 관리
Published Content Registry 관리
Search Intent Memory 관리
Keyword Memory 관리
Topic Memory 관리
Duplicate Detection
Related Content Recommendation
Internal Link Recommendation
AI Context 생성
AI Workflow
    ↓
AI Context Builder
    ↓
Content Intelligence Layer
    ↓
Repository
    ↓
Storage

AI는 Database나 Repository를 직접 조회하지 않는다.

AI에 필요한 정보는 AI Context Builder를 통해 전달한다.

Content Intelligence의 상세 설계는 13_CONTENT_INTELLIGENCE.md를 따른다.

11. Content Library

Content Library는 Project에서 생성된 콘텐츠를 관리한다.

Content Library에는 다음 상태의 콘텐츠가 포함될 수 있다.

Planning
Draft
Editing
Quality Review
Ready
Draft Saved
Scheduled
Published
Failed
Archived

Content Library는 단순한 파일 목록이 아니다.

콘텐츠 전략, 품질, 발행 상태, 플랫폼 결과를 연결하는 운영 데이터이다.

12. Published Content Registry

Published Content Registry는 실제 발행이 검증된 콘텐츠만 관리한다.

저장할 수 있는 Metadata는 다음과 같다.

Title
Published URL
Platform
Publishing Account
Category
Topics
Keywords
Search Intent
Audience
Summary
Published Date
Verification Status

내부 링크 추천과 관련 콘텐츠 추천에는 검증된 Published Content만 사용할 수 있다.

존재하지 않는 URL을 AI가 생성해서는 안 된다.

13. Canonical Content Model

Content Model은 Bright Studio의 플랫폼 독립적인 콘텐츠 기준 형식이다.

ContentDocument
├── Metadata
├── Title
├── Heading Blocks
├── Paragraph Blocks
├── Image Blocks
├── Video Blocks
├── Button Blocks
├── Link Blocks
├── Table Blocks
├── Quote Blocks
├── FAQ Blocks
├── Product Blocks
└── Ad Blocks

플랫폼 HTML은 Content Model에서 생성된 결과물이다.

플랫폼 HTML을 다시 콘텐츠 원본으로 사용하지 않는다.

14. Content Processing Pipeline

Content는 플랫폼에 전달되기 전에 공통 처리 과정을 거친다.

ContentDocument
    ↓
Normalization
    ↓
Validation
    ↓
Optimization
    ↓
Quality Validation
    ↓
Platform Rendering
    ↓
Platform Adapter
    ↓
Platform Output
14.1 Normalization

Content Model의 형식과 순서를 정규화한다.

14.2 Validation

필수 Metadata, Block 구조, 링크, 이미지 ALT 및 콘텐츠 무결성을 검증한다.

14.3 Optimization

플랫폼 변환 전에 공통 구조를 최적화한다.

14.4 Quality Validation

품질 기준을 만족하는지 확인한다.

14.5 Platform Rendering

대상 플랫폼에 맞는 출력 형식으로 변환한다.

15. AI Editorial Workflow

모든 콘텐츠는 다음 사고 과정을 따른다.

Search Intent Analysis
Reader Analysis
Project DNA Analysis
Content Intelligence Analysis
Content Planning
Writing
SEO Strategy
Image Strategy
Internal Link Strategy
CTA Strategy
Editing
Quality Review
Content Model Generation
Platform Rendering

AI는 단순히 본문만 생성하지 않는다.

Writer, SEO Specialist, Image Strategist, Internal Link Planner, CTA Advisor 및 Editor 역할을 하나의 Generation Workflow에서 수행한다.

16. Hybrid AI Architecture

기본 AI 실행 구조는 다음과 같다.

User Input
    ↓
AI Context Builder
    ↓
AI Generation
    ↓
Rule Validation
    ↓
AI Quality Review
    ↓
Rule Validation
    ↓
Approved ContentDocument
16.1 AI Generation

한 번의 AI 호출에서 다음 작업을 수행한다.

기획
작성
SEO
이미지 전략
CTA 전략
내부 링크 전략
편집
Content Model 생성

Generation receives one server-owned Content Opportunity contract. Topic, primary keyword, secondary keywords, search intent, audience, reader problem, content angle, expected coverage, exclusions, duplicate-avoidance context, content role, and platform requirements enter the existing generation call together. The client cannot replace individual fields after confirmation.
16.2 Quality Review

별도의 AI 호출로 다음 내용을 검토한다.

검색 의도 충족
정확성
충분성
구조
가독성
SEO
이미지 전략
CTA 전략
링크 전략
중복
금지 표현
전체 완성도

The same confirmed Opportunity is included in the existing Quality Review call. The reviewer must correct full-manuscript topic drift rather than attach a keyword to an unrelated title. Server-side structured evidence blocks approval when topic fidelity, intent fulfillment, heading/body coverage, or secondary-keyword support remains inconsistent. No additional AI call is introduced for this contract.
16.3 Rule Validation

Rule Validation은 AI 호출과 별개로 실행한다.

Rule Validation은 다음 내용을 검증한다.

Content Model 형식
필수 Metadata
URL 검증
길이 범위
Heading 구조
이미지 ALT
금지된 링크
Platform 제한
Permission Gate
17. Quality Architecture

Quality Engine은 콘텐츠가 사용자에게 전달되기 전 품질을 검토한다.

주요 평가 영역은 다음과 같다.

Search Intent
Reader Value
Accuracy
SEO
Readability
Structure
Completeness
Image Strategy
Internal Links
CTA
Metadata
Platform Suitability
HTML Quality

기본 목표는 각 주요 영역과 Overall Score 95 이상이다.

점수가 목표보다 낮으면 AI는 콘텐츠를 개선해야 한다.

품질 점수는 AI의 내부 품질 통제 수단이 우선이며, 사용자 화면 노출 방식은 Personal Edition과 Commercial Edition에서 다를 수 있다.

18. Editor Architecture

Editor는 사용자에게 일반적인 문서 편집기처럼 보여야 한다.

내부적으로는 Content Model Block 구조를 사용하지만, 사용자가 Block 단위 구현을 의식하게 해서는 안 된다.

Editor는 다음 기능을 지원한다.

제목 편집
본문 편집
Heading 구조 확인
이미지 위치 조정
CTA 위치 조정
Video 위치 조정
목차 확인
Quality Review
Platform Preview
Autosave
History
Restore

Content Model은 내부 Canonical Representation으로 유지한다.

19. Image Strategy Architecture

이미지는 장식이 아니라 콘텐츠 이해를 돕는 전략 요소이다.

AI는 이미지마다 목적을 정의한다.

지원 가능한 이미지 유형은 다음과 같다.

Hero Image
Comparison
Checklist
Infographic
Summary Card
Warning Card
Step Guide
Product Visual

Image Strategy에는 다음 내용이 포함된다.

이미지 필요 여부
이미지 개수
이미지 목적
권장 위치
Composition
Prompt
ALT
Platform별 사용 방식

현재 기본 방향은 이미지 자체 생성보다 이미지 전략 자동화를 우선한다.

20. Internal Link Architecture

내부 링크는 단순 Keyword Similarity만으로 추천하지 않는다.

다음 요소를 종합적으로 고려한다.

검색 의도
독자에게 필요한 다음 정보
Topic Relationship
Content Role
Project Strategy
Published Verification
중복 여부
링크 위치

내부 링크는 Verified Published Content Registry에 존재하는 URL만 사용한다.

21. Publishing Architecture

Publishing은 다음 단계로 진행한다.

Content Approval
    ↓
Publishing Preparation
    ↓
Permission Gate
    ↓
Platform Adapter
    ↓
Registered Workflow
    ↓
External Platform
    ↓
Result Verification
    ↓
Publishing History
21.1 Default Publishing Policy

기본 정책은 다음과 같다.

Review First: ON
Draft Only: ON
Public Publish: OFF
Quality Approval Required: ON
Sequential Draft Save: ON
21.2 Permission Gate

모든 발행 작업은 Permission Gate를 통과해야 한다.

클라이언트 화면에서 권한을 변경하더라도 서버 또는 실행 계층에서 다시 검증한다.

21.3 Registered Workflow

Playwright는 승인된 Registered Workflow 안에서만 실행한다.

AI Engine, Settings 화면 또는 Core Service가 Playwright를 직접 실행해서는 안 된다.

22. Platform Connection Architecture

PlatformConnection은 Workspace가 소유하며 Publishing에만 사용한다.

Project는 Platform Connection을 직접 소유하지 않고 발행 대상 계정을 참조한다.

하나의 Workspace는 플랫폼별 여러 계정을 연결할 수 있다.

Workspace
└── Platform Connections
    ├── Tistory Account A
    ├── Tistory Account B
    ├── WordPress Site A
    └── YouTube Channel A

인증 정보는 원문으로 저장하지 않는다.

SecretStore에는 Secret Reference만 저장한다.

## 22.1 Data Source Connection Architecture

DataSourceConnection도 Workspace가 소유하지만 PlatformConnection과 책임을 공유하지 않는다.

- `PlatformConnection`: Publishing 계정, Draft Save, 플랫폼 권한과 자동화 전용
- `DataSourceConnection`: 검색 시장·콘텐츠 성과 Snapshot과 Evidence 전용

Project는 같은 Workspace의 DataSourceConnection만 `ProjectDataSourceReference` 식별자로 참조한다. Project는 credential, OAuth token, client secret 또는 연결 metadata를 복제하지 않는다.

공식 Provider 호출은 콘텐츠 생성 중 직접 실행하지 않는다. 수동 동기화가 Raw Snapshot을 저장하고 공통 Evidence로 정규화한 뒤, Planning은 Project가 참조한 Evidence만 사용한다.

Data Source and Opportunity Intelligence Foundation은 구현되었다. Google Search Console의 실제 OAuth 로그인, 속성 조회·선택, `https://bright-healthy.tistory.com/`의 `siteOwner` 확인, 실제 동기화와 Snapshot 생성이 외부 검증되었다. NAVER Search Trend 실제 연결·동기화와 legacy Search Console Data Source 삭제(`DELETE /api/data-sources` HTTP 200)도 외부 검증되었다.

GA4와 AdSense 실제 계정 검증은 완료되지 않았다. Google Ads와 Google Trends는 공식 접근 전 비활성 상태다. 토큰 만료 후 자동 갱신, 쿼터 한계와 다양한 실제 Provider 응답은 추가 검증 대상이다.

23. Platform Adapter Contract

모든 Platform Adapter는 공통 계약을 따라야 한다.

Adapter가 제공해야 하는 주요 기능은 다음과 같다.

Connection Validation
Metadata Mapping
Category Mapping
Media Upload
Content Rendering
Preview
Draft Save
Publish
Result Verification
Error Mapping

플랫폼이 일부 기능을 지원하지 않는 경우 명시적인 Capability 상태를 제공해야 한다.

지원하지 않는 기능을 성공한 것처럼 처리해서는 안 된다.

24. Tistory Application

Tistory는 Bright Studio의 첫 번째 실사용 플랫폼이다.

Tistory Application은 다음 범위를 우선 지원한다.

Stored Session
Editor Entry
Category Retrieval
Tistory HTML Rendering
Preview
Image Upload
Draft Save
Draft Verification

초기 단계에서는 공개 발행보다 Draft Save의 안정성을 우선한다.

25. WordPress Application

WordPress는 Tistory 다음 우선순위 플랫폼이다.

WordPress 구현은 공통 Content Model과 Publishing Pipeline을 재사용해야 한다.

WordPress 전용 요구사항은 Adapter 내부에 위치한다.

WordPress의 기본 Theme 기반은 GeneratePress로 표준화한다.

GeneratePress는 Header, Footer, Navigation, Sidebar, Archive와 같은 사이트 외곽 구조를 담당한다.

콘텐츠 본문과 Bright Components의 시각 표현은 Bright Theme가 담당한다.

Bright Theme는 Project별 Theme Skin을 지원할 수 있으며, Theme Skin은 시각 표현만 변경하고 Canonical Content Model과 Bright Component의 의미 구조를 변경해서는 안 된다.

GeneratePress Base Theme를 직접 수정하지 않는다. WordPress 전용 확장은 Child Theme, CSS, Hook 및 WordPress Adapter를 통해 구현한다.



26. YouTube Application

YouTube는 Content Repurposing과 Video Workflow를 지원하는 플랫폼으로 확장한다.

지원 가능한 흐름은 다음과 같다.

Blog to Video
Video to Blog
Long-form to Shorts
Shorts to Blog
Script Generation
Scene Strategy
Thumbnail Strategy
Video Embed

Video는 재사용 가능한 Content Block으로 취급한다.

블로그 콘텐츠에서는 기본적으로 YouTube Embed를 활용할 수 있다.

27. Multi-Platform Workflow

사용자는 하나의 자연어 요청으로 여러 플랫폼용 콘텐츠 생성을 요청할 수 있다.

Natural Language Request
    ↓
Project Strategy
    ↓
Canonical Content Plan
    ↓
Platform Targets
    ├── Tistory
    ├── WordPress
    ├── YouTube
    └── Naver Cafe

공통 전략은 재사용하되 플랫폼별 콘텐츠는 독립적으로 최적화한다.

단순히 동일한 HTML을 모든 플랫폼에 복사해서는 안 된다.

28. Persistence and History

Bright Studio는 콘텐츠와 운영 상태를 지속적으로 저장한다.

저장 대상은 다음과 같다.

Project
Project DNA
ContentDocument
Autosave
Content History
Quality Report
Platform Target
Publishing Preparation
Publishing Result
Published Registry
Media Reference

History는 사용자가 이전 상태를 복구할 수 있도록 유지한다.

29. Security and Safety

Bright Studio는 최소 권한 원칙을 따른다.

기본적으로 허용되는 작업은 안전한 작업으로 제한한다.

연결 확인
미리보기
임시저장

다음 작업은 명시적 권한이 필요하다.

공개 발행
기존 콘텐츠 수정
기존 콘텐츠 삭제
계정 설정 변경
자동 공개 발행

인증 정보, Cookie, Session 및 API Key를 사용자 화면이나 로그에 노출해서는 안 된다.

30. Edition Architecture

Personal Edition과 Commercial Edition은 같은 Core Architecture를 사용한다.

차이는 UX 표현 방식이다.

Personal Edition
상세 품질 점수
상세 AI 판단
고급 설정
진단 정보
개발자 검증 기능
Commercial Edition
단순한 기본 UX
복잡한 진단 숨김
추천 중심 Workflow
최소한의 사용자 결정
Guided Action 중심

Core 로직을 Edition별로 중복 구현해서는 안 된다.

31. Extensibility

새로운 기능을 설계할 때 다음 질문을 먼저 검토한다.

모든 플랫폼에서 재사용할 수 있는가?
Core에 포함되어야 하는가?
특정 App에만 포함되어야 하는가?
Content Model 확장이 필요한가?
기존 Workflow를 재사용할 수 있는가?
AI 호출을 추가하지 않고 해결할 수 있는가?
유지보수 비용을 줄이는가?
32. Future Architecture

향후 확장 가능한 영역은 다음과 같다.

Semantic Search
Knowledge Graph
Topic Cluster Engine
Trend Intelligence
Competitor Intelligence
Search Console 확장 검증
GA4 실제 계정 Integration 검증
Performance Feedback
AI Learning Memory
Team Collaboration
Cloud Sync
Plugin System
Marketplace
Analytics Engine
Campaign Management

이 기능들은 기존 Core와 Content Model 구조를 유지하면서 확장해야 한다.

33. Architecture Acceptance Criteria

Product Architecture는 다음 조건을 만족해야 한다.

Core와 Apps 책임이 명확하다.
플랫폼 공통 로직이 Core에 위치한다.
플랫폼별 로직이 Apps에 위치한다.
Content Model이 Canonical Representation이다.
Project가 콘텐츠 전략의 중심이다.
Workspace가 연결과 계정을 소유한다.
Project DNA가 AI Context에 반영된다.
Content Intelligence가 기존 콘텐츠를 활용한다.
검증된 발행 URL만 내부 링크에 사용한다.
AI Generation과 Quality Review 호출 수를 최소화한다.
Quality Gate를 통과하지 않은 콘텐츠는 발행 준비 상태가 되지 않는다.
Playwright는 승인된 Workflow 안에서만 실행된다.
Permission Gate를 우회할 수 없다.
새로운 플랫폼을 Adapter 방식으로 추가할 수 있다.
기존 기능을 깨뜨리지 않고 확장할 수 있다.
34. Guiding Principle

Bright Studio는 콘텐츠를 대신 작성하는 도구가 아니다.

Bright Studio는 콘텐츠 전략, 생성, 품질, 편집, 발행과 재활용을 통합 관리하는 플랫폼이다.

모든 설계 결정은 다음 목표를 지원해야 한다.

전문적인 품질의 콘텐츠를 최소한의 수작업으로 만들고, 여러 플랫폼에서 지속적으로 운영할 수 있게 한다.
