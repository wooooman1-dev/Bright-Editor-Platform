# Bright Studio Roadmap

**Version:** 3.0
**Status:** Approved
**Document Type:** Product Roadmap
**Internal Project Name:** Bright Editor Platform
**User-facing Product Name:** Bright Studio

---

# 1. Purpose

이 문서는 Bright Studio의 제품 개발 순서와 단계별 목표를 정의한다.

Roadmap은 단순한 기능 목록이 아니다.

각 단계에서 다음 내용을 명확히 해야 한다.

- 무엇을 완성하는가
- 사용자에게 어떤 가치가 생기는가
- 무엇을 검증해야 하는가
- 다음 단계로 이동하기 위한 조건은 무엇인가
- 현재 단계에서 하지 않는 것은 무엇인가

이 문서는 제품 개발의 방향과 우선순위를 정의한다.

세부 기능 요구사항은 `04_FEATURE_SPEC.md`, 실제 사용자 흐름은 `03_USER_FLOW.md`, Release 판단 기준은 `05_RELEASE_PLAN.md`를 따른다.

---

# 2. Product Direction

Bright Studio는 단순한 AI Writer나 블로그 자동화 도구가 아니다.

Bright Studio는 다음 전체 콘텐츠 운영 과정을 지원하는 **AI Content Operating System**이다.

```text
Planning
    ↓
Writing
    ↓
SEO
    ↓
Image Strategy
    ↓
Internal Links
    ↓
CTA Strategy
    ↓
Quality Review
    ↓
Publishing
    ↓
Content Intelligence
    ↓
Performance Improvement

첫 번째 실제 적용 플랫폼은 Tistory이다.

플랫폼 확장 우선순위는 다음과 같다.

Tistory
    ↓
WordPress
    ↓
YouTube
    ↓
Naver Cafe
    ↓
Shopping and Additional Platforms
3. Roadmap Principles

모든 Roadmap 결정은 다음 원칙을 따른다.

3.1 Integration Before Expansion

기반 기능이 각각 존재하더라도 전체 사용자 흐름이 연결되지 않았다면 새로운 대형 기능을 먼저 추가하지 않는다.

현재 최우선 목표는 다음 흐름의 완성이다.

Workspace
    ↓
Project
    ↓
Create Content
    ↓
AI 분석
    ↓
사용자 확인
    ↓
콘텐츠 생성
    ↓
Editor
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Tistory Draft Save
    ↓
실제 Draft 검증
3.2 Function Before Visual Polish

기능 흐름과 실제 사용 가능 상태를 먼저 완성한다.

최종 Brand Design System, Figma 정교화와 시각적 개선은 핵심 기능 검증 이후 진행한다.

3.3 Platform First

공통 기능은 Core에서 재사용한다.

플랫폼별 동작은 Apps와 Platform Adapter 안에 둔다.

3.4 Content Model First

콘텐츠 원본은 Canonical Content Model로 관리한다.

플랫폼별 HTML이나 Script는 Renderer와 Adapter가 생성한다.

3.5 Quality First

콘텐츠는 생성만으로 완료되지 않는다.

Quality Review와 개선 과정을 거쳐 발행 가능한 상태에 도달해야 한다.

3.6 Review First and Draft First

외부 플랫폼 작업의 기본 정책은 다음과 같다.

Review First: ON
Draft Only: ON
Public Publish: OFF
Quality Approval Required: ON
Sequential Draft Save: ON
3.7 Cost Efficient AI

기본 AI 호출 구조는 다음을 목표로 한다.

AI Generation: 1회
AI Quality Review: 1회

규칙 기반 검증과 재사용 가능한 로직으로 불필요한 AI 호출을 줄인다.

3.8 Small and Verifiable Development

개발은 다음 순서를 따른다.

Documentation
    ↓
Design Approval
    ↓
Implementation
    ↓
Test
    ↓
Verification
    ↓
Commit
4. Roadmap Structure

Bright Studio의 개발 계획은 다음 계층으로 관리한다.

Vision
    ↓
Roadmap Stage
    ↓
Epic
    ↓
Feature
    ↓
Task
    ↓
Test
    ↓
Commit
    ↓
Release
Roadmap Stage

제품이 사용자에게 제공하는 큰 가치 단계이다.

Epic

Roadmap Stage를 구성하는 독립적인 기능 집합이다.

Sprint

Epic을 구현하기 위한 개발 실행 단위이다.

Sprint 번호는 작업 순서를 나타내지만, 제품 완료 여부는 실제 Acceptance Criteria와 Release Gate로 판단한다.

5. Status Definitions
Status	Meaning
Planned	방향만 승인된 상태
Designed	상세 설계가 완료된 상태
Approved	구현이 승인된 상태
In Progress	구현 또는 통합 진행 중
Implemented	기능 코드가 구현된 상태
Partially Implemented  승인 범위 중 명시된 Foundation만 구현되고 나머지 범위는 미구현인 상태
Verified	테스트와 실제 동작이 검증된 상태
Release Ready	사용자 관점의 전체 흐름이 검증된 상태
Released	실제 사용 버전으로 배포된 상태
Deferred	현재 우선순위에서 제외된 상태
Future	장기 후보 상태

Implemented와 Verified는 다르다.

개별 기능이 구현되었더라도 실제 계정과 전체 사용자 흐름이 검증되지 않았다면 Release Ready로 처리하지 않는다.

6. Roadmap Overview
Stage	Goal	Status
Stage 1	Platform and Content Foundation	Implemented
Stage 2	Core Product Experience	Implemented
Stage 3	AI Editorial and Quality Foundation	Implemented
Stage 4	Tistory End-to-End Integration	In Progress
Stage 5	Content Intelligence	Partially Implemented
Stage 6	WordPress Expansion	Planned
Stage 7	Multi-Platform Workflow	Planned
Stage 8	Content Repurposing	Planned
Stage 9	Analytics and Optimization	Future
Stage 10	Commercial and Team Platform	Future
Stage 11	Ecosystem and Marketplace	Future

## 6.1 Sprint Baseline and Stage Mapping

이 절은 기존 Sprint 계획과 현재 Roadmap Stage의 연결 관계를 보존한다.

Sprint는 개발 실행 단위이며, Stage는 제품 가치와 장기 완료 상태를 관리하는 단위이다.

| Sprint | Approved Scope | Current Roadmap Stage | Repository Baseline |
|---|---|---|---|
| Sprint 1 | Platform and Content Foundation | Stage 1 | Implemented |
| Sprint 2 | Content Processing Engine | Stage 1 | Implemented |
| Sprint 3 | Product UI Foundation | Stage 2 | Implemented |
| Sprint 4 | Usable Content and Safe Draft Workflow | Stage 2, Stage 4 | Implemented |
| Sprint 5 | Editorial Quality Pipeline | Stage 3 | Implemented |
| Sprint 6 | Presentation Architecture, Bright Components and Tistory Scheduling | Stage 4 presentation and Tistory operation foundation | Approved; Contract Foundation Implemented, Runtime Not Implemented |
| Sprint 7 | Project DNA, Content Library, Internal Link Intelligence | Stage 5 | Design Approved, Not Implemented |
| Sprint 8 | WordPress and Multi-platform Foundation | Stage 6, Stage 7 | Design Approved, Not Implemented |

현재 Repository의 안정 기준점은 `Bright Studio v1.0.0`이다. 해당 Release는 `9946f9ecc9167b343ff0c7763c62437d593764ea`를 기준으로 `v1.0.0` Tag와 Latest Release가 발행되었다. Sprint와 Stage의 완료 여부는 버전 릴리즈 여부와 분리하여 실제 구현, 자동 테스트와 외부 검증 Gate를 기준으로 판단한다.

Sprint 6 이후 문서가 존재하더라도 Sprint 전체를 `Implemented` 또는 `Verified`로 판단해서는 안 된다. 특히 Sprint 7 전체는 미구현이며, 별도로 완료된 Data Source and Opportunity Intelligence Foundation만 `Implemented`다. 실제 상태는 Repository 코드, 자동 테스트, 외부 검증 결과 및 Development 문서를 통해 각각 확인한다.

Sprint와 Stage의 관계는 일대일로 고정하지 않는다. 하나의 Sprint가 여러 Stage의 기반을 만들 수 있고, 하나의 Stage가 여러 Sprint에 걸쳐 완성될 수 있다.

## 6.2 Integrated Sprint 6 Baseline

통합 Sprint의 최종 명칭은 `Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling`이다. 기존 Sprint 6.5는 별도 Sprint 번호로 사용하지 않으며 그 설계 범위는 Sprint 6 Workstream B에 흡수한다.

현재 상태:

- Design: Approved
- Presentation Contract Foundation: Implemented
- Presentation Runtime: Not Implemented
- Scheduling Domain: Not Implemented
- Scheduling Runtime: Not Implemented
- Sprint Status: Approved
- External Verification: Not Started

Gate 0은 Sprint 4에서 남아 있는 실제 Tistory Draft Save 전체 E2E 검증이다. 실제 Draft를 저장하고 다시 열어 제목, 의미 있는 본문 구조, Category와 비공개 상태를 확인해야 한다. Gate 0 통과 전에는 Workstream A Runtime과 Workstream B 구현을 시작하지 않는다.

Workstream A:

Presentation Architecture → Bright Components → deterministic Presentation Resolver → theme-independent semantic HTML → RenderArtifact와 checksum → PreviewApproval → Preview와 Draft 동일 Artifact 사용 → 실제 Draft 재진입 의미 구조 검증

Workstream B:

ScheduledPublication → ScheduleJob → Asia/Seoul → 고정 Revision/Account/Category → Tistory 자체 예약 → 예약 시간 수정 → Draft 보존 예약 취소 → 예약 목록과 상태 → 중복 방지 → 실패 Job만 재시도 → 앱 재시작 복원 → 실제 Tistory 예약 외부 검증

통합 Sprint는 실제 외부 검증 전 `Completed` 또는 `Verified`로 올리지 않는다.

## 6.3 Bright Studio v1.0.0 Release Baseline

Bright Studio의 첫 번째 정식 버전 릴리즈 기준점은 다음과 같다.

- Release: `Bright Studio v1.0.0`
- Status: `Released`
- Release Date: `2026-07-25`
- Tag: `v1.0.0`
- Release Commit: `9946f9ecc9167b343ff0c7763c62437d593764ea`
- Draft Release: No
- Prerelease: No
- Latest Release: Yes

Released scope:

- AI가 반환한 HTML 형식 문단을 canonical `ContentDocument`로 정규화
- 목록, 순서형 절차와 표를 canonical block으로 변환
- 문서 구조와 Quality Review 결과의 정합성 강화
- 자연어 Planning 요청의 줄바꿈과 문단 형식 보존
- 저장된 Content Opportunity와 생성 요청의 정체성 복구 강화
- 선택된 Tistory 연결과 Category 정보를 생성 및 검토 과정에 전달
- 같은 Tistory Category의 검증된 공개 URL만 내부 링크 후보로 사용
- 본문 문맥형 내부 링크 최대 1개
- 하단 관련 글 최대 3개
- 적합한 후보가 부족할 경우 강제 배치하지 않음
- 여러 문장이 포함된 정상 문단을 문장 수만으로 감점하거나 자동 분할하지 않음
- AI Generation 1회와 Quality Review 1회 정책 유지

Release verification baseline:

- Test Files: `137 passed`
- Tests: `693 passed`
- Manual Tests: `17 skipped`
- `npm run lint`: Passed
- TypeScript compilation: Passed
- `npm run build`: Passed
- Next.js production build: Passed
- Browser Planning flow: Verified
- Browser Generation flow: Verified
- Browser Quality Review flow: Verified
- Quality score: `100`
- Quality approval: `standard`
- Publishing readiness: Confirmed
- Contextual internal link: `1`
- Related content links: `3`

Frozen release areas:

- Quality score calculation logic
- Internal link placement logic

이 두 영역은 실제 오류나 회귀가 재현되지 않는 한 변경하지 않는다.

`v1.0.0` 릴리즈는 안정적인 버전 기준점이다. 다만 이 버전 릴리즈 자체가 실제 Tistory Draft를 저장하고 다시 열어 제목, 의미 있는 본문 구조, Category와 비공개 상태를 확인하는 Stage 4 외부 검증 Gate의 완료를 의미하지는 않는다. 해당 검증은 별도의 Gate로 유지한다.

7. Stage 1 — Platform and Content Foundation
Status

Implemented

Goal

특정 플랫폼에 종속되지 않는 Core와 첫 번째 Tistory 자동화 기반을 만든다.

Completed Scope
Platform Foundation
Core와 Apps 경계
Platform Adapter 방향
Platform-independent browser foundation
플랫폼 설정 구조
공통 오류 처리 기반
Tistory Foundation
Tistory App 구조
URL Configuration
Login Entry Navigation
Stored Session Context
Editor Entry
Editor Ready 확인
Canonical Content Foundation
ContentDocument
Content Blocks
Metadata
Content Version
Renderer 입력 구조
Validator 입력 구조
Content Processing
Normalizer
Validator
Optimizer
Processing Pipeline
Invalid Content 차단
Version Compatibility 기반
Completion Criteria
Core가 Tistory URL과 Selector를 알지 않는다.
Apps가 플랫폼별 동작을 소유한다.
ContentDocument가 플랫폼 HTML과 분리된다.
브라우저와 Session 기반이 독립적으로 테스트된다.
Content Processing 결과가 결정적이고 검증 가능하다.

8. Stage 2 — Core Product Experience
Status

Implemented

Goal

사용자가 Workspace와 Project 문맥에서 콘텐츠를 관리할 수 있는 제품 흐름을 만든다.

Completed Scope
Home
상태 기반 Home
Workspace 없음 상태
Project 없음 상태
작업 중 상태
최근 작업 상태
Continue Working 조건
Workspace
Workspace 생성
Workspace 진입
Workspace 설정
Enabled Platforms
Platform Connections 진입
Workspace별 데이터 분리
Project
Project 생성
선택적 Brand
Project Dashboard
Project 소유 Content
Project 설정 기반
Content Experience
Content 생성 기반
Content Editor
Publish Preparation
Developer Verification
Tistory Preview 기반
Completion Criteria
Workspace 없이 Project를 만들 수 없다.
Project 없이 Content를 만들 수 없다.
Brand 없이 Project를 만들 수 있다.
Content가 Project에 속한다.
사용자가 Home에서 다음 행동을 이해할 수 있다.
Fixture와 Live 상태가 구분된다.

9. Stage 3 — AI Editorial and Quality Foundation
Status

Implemented

Goal

Bright Studio가 전문 편집팀처럼 콘텐츠를 생성하고 검토할 수 있는 기반을 만든다.

Completed Scope
AI Workflow
AI Provider abstraction
Generation Workflow
AI 설정 상태
Generation 오류 처리
Agent-ready 구조
Editorial Generation

하나의 Generation에서 다음 역할을 통합한다.

Writer
SEO Specialist
Image Strategist
Internal Link Planner
CTA Advisor
Editor
Persistence
서버 기반 Persistence
Content Repository
Autosave
History
Revision
Restore
Quality Engine
Rule Validation
AI Quality Review
Multi-dimensional Score
Quality Report
Quality Approval Gate
Outdated Report 처리
자동 개선 기반
Publishing Foundation
Publishing Preparation
Permission Gate
Draft Workflow
Tistory Renderer
Preview
Publishing Result
Media Foundation
Image Strategy
Media Library 기반
CTA Block
Video Embed 기반
Asset Reference
Completion Criteria
기본 Generation이 하나의 AI 호출로 동작한다.
Quality Review가 별도 AI 호출로 동작한다.
콘텐츠가 Canonical Content Model로 저장된다.
편집 내용이 Autosave된다.
Revision 복원이 가능하다.
Quality 결과가 Revision과 연결된다.
Publishing 실행 전에 Permission을 검증한다.

10. Stage 4 — Tistory End-to-End Integration
Status

In Progress

Goal

기반 기능을 실제 사용 가능한 하나의 통합 흐름으로 완성한다.

새로운 대형 기능보다 이 단계가 우선한다.

Required User Flow
Workspace 생성 또는 선택
    ↓
Project 생성 또는 선택
    ↓
Create Content
    ↓
자연어 요청 입력
    ↓
AI 검색 의도 및 Keyword 분석
    ↓
사용자 확인
    ↓
AI 콘텐츠 생성
    ↓
Editor 수정
    ↓
Autosave 및 Reload 복원
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Publishing Account 선택
    ↓
Tistory Category 선택
    ↓
Permission Gate
    ↓
Draft Save
    ↓
실제 Tistory Draft 검증
Priority Features
Natural Language Creation
자연어 콘텐츠 요청
대상 플랫폼 선택
검색 의도 분석
추천 Keyword
예상 구성
사용자 확인
생성 시작
Editor Integration
생성 결과 자동 진입
일반 문서형 편집
제목 및 본문 수정
H2/H3 확인
Image, CTA, Video 표시
Autosave
History
Quality Review 연결
Quality Integration
Current Revision 평가
목표 점수 판단
개선 항목 표시
자동 개선
재검토
Publishing Gate 반영
Tistory Preparation
Tistory Account 선택
실제 Category 조회
Category 선택
최신 Revision 고정
Preview
Image 상태
Link Validation
Permission 상태
Tistory Draft Workflow
Stored Session 확인
Tistory Editor 진입
Title 입력
HTML 입력
Category 적용
Image Upload
Draft Save
결과 검증
실패 복구
Release Gate

Stage 4는 다음 조건을 만족해야 완료된다.

실제 OpenAI 또는 승인된 AI Provider로 콘텐츠를 생성한다.
Editor 수정 내용이 저장되고 새로고침 후 복원된다.
Quality Review가 최신 Revision을 평가한다.
실제 Tistory 계정을 선택할 수 있다.
실제 Tistory Category를 선택할 수 있다.
Stored Session으로 Editor에 진입한다.
콘텐츠를 Tistory에 임시저장한다.
사용자가 Tistory에서 Draft를 직접 확인할 수 있다.
실패 시 Content와 Revision을 잃지 않는다.
실패한 Publishing Job만 다시 실행할 수 있다.
Explicitly Deferred

Stage 4 완료 전에는 다음 항목을 우선 개발하지 않는다.

Public Publish 자동화
대규모 Analytics
Team Collaboration
Marketplace
Plugin System
최종 Brand Design System
불필요한 신규 AI Agent
다수 플랫폼 동시 발행

11. Stage 5 — Content Intelligence
Status

Partially Implemented  승인 범위 중 명시된 Foundation만 구현되고 나머지 범위는 미구현인 상태

Goal

Project의 전략과 기존 콘텐츠 지식을 활용하여 반복 입력을 줄이고 콘텐츠 품질을 높인다.

Scope

Implemented Foundation

Content Opportunity
Planning 상태 Persistence
Workspace 소유 DataSourceConnection
같은 Workspace의 DataSourceConnection을 참조하는 ProjectDataSourceReference
Publishing 전용 PlatformConnection과 시장·성과 Evidence 전용 DataSourceConnection 분리
공식 Provider Snapshot과 정규화 Evidence
Evidence 기반 Opportunity 분류와 Quality Guard

Externally Verified Foundation Flows

Google Search Console OAuth 실제 로그인
Search Console 속성 목록 조회
`https://bright-healthy.tistory.com/` 속성 선택과 `siteOwner` 권한 확인
Search Console 실제 동기화와 Snapshot 생성
NAVER Search Trend 실제 연결과 동기화
legacy Google Search Console Data Source 삭제와 `DELETE /api/data-sources` HTTP 200 응답

Remaining Content Intelligence Scope — Not Implemented

Project DNA
주요 주제
세부 주제
제외 주제
대상 독자
Tone
콘텐츠 유형
기본 플랫폼
목표 분량
SEO 정책
Image 정책
CTA 정책
Internal Link 정책
Related Content 정책
Publishing Default
Quality Target
Content Library
Project 콘텐츠 목록
Content Status
Current Revision
Quality 상태
Publishing 상태
검색과 필터
Archive
Published Content Registry
실제 공개 URL
Platform
External Content ID
Publishing Account
Search Intent
Topics
Keywords
Verification Status
Search Intent Memory
기존 검색 의도
Coverage 상태
유사 검색 의도
미작성 세부 의도
Draft와 Published 구분
Keyword Memory
Primary Keyword
Secondary Keyword
Long-tail Keyword
사용 이력
Cannibalization Risk
Excluded Keyword
Topic Memory
Main Topic
Subtopic
Topic Cluster
Pillar와 Supporting 관계
Coverage Level
Duplicate Detection
검색 의도 유사성
Topic 유사성
Keyword 중복
Outline 유사성
기존 Draft
Published Content
Repurposing 관계
Internal Link Intelligence
Verified URL만 사용
독자 흐름 중심 추천
Anchor 추천
본문 위치 추천
Recommendation Reason
Related Content Recommendation
본문 하단 추천
최대 추천 수
Reader Journey
Topic Expansion
다양성
Verified Published Content
AI Context Builder
Project DNA
User Request
Existing Content
Search Intent
Keyword Memory
Topic Memory
Duplicate Candidates
Verified Link Candidates
Quality History
Implementation Order
Project DNA
    ↓
Content Library
    ↓
Published Content Registry
    ↓
Search Intent and Keyword Memory
    ↓
Topic Memory
    ↓
Duplicate Detection
    ↓
Internal Link Intelligence
    ↓
Related Content Recommendation
    ↓
AI Context Builder Integration

Foundation Verification Boundary

자동 검증은 전체 118개 파일, 589개 테스트 통과이며 기존 정책상 6개 파일, 14개 테스트는 skip 상태다. lint, typecheck, test, build와 `git diff --check`가 통과했다.

Google Analytics 4와 Google AdSense의 실제 계정 검증은 완료되지 않았다. Google Ads Keyword Planning과 Google Trends는 공식 접근 확인 전 비활성 상태를 유지한다. 토큰 만료 후 자동 갱신, 실제 API 쿼터 한계와 다양한 Provider production 응답은 추가 외부 검증 항목이다.

Content Intelligence 전체는 부분 구현 상태다. Project DNA, Content Library, Published Content Registry, Search Intent Memory, Keyword Memory, Topic Memory, Duplicate Detection, Cannibalization Detection과 Internal Link Intelligence가 구현되기 전에는 Stage 5 전체를 `Implemented` 또는 `Verified`로 올리지 않는다.
Completion Criteria
Project DNA가 생성 요청에 자동 적용된다.
기존 콘텐츠를 생성 전에 조회한다.
중복 위험을 사용자에게 설명한다.
존재하지 않는 URL을 AI가 만들지 않는다.
Verified 콘텐츠만 내부 링크로 추천한다.
추천을 사용자가 수정하거나 거절할 수 있다.
Content Intelligence가 기존 Stage 4 흐름을 깨뜨리지 않는다.
불필요하게 Content Library 전체를 AI Prompt에 넣지 않는다.

12. Stage 6 — WordPress Expansion
Status

Planned

Goal

Tistory에서 검증된 공통 Architecture를 WordPress에 재사용하여 두 번째 실제 발행 플랫폼을 완성한다.

Scope
WordPress Connection
Site URL
Authentication
Connection Validation
Secret Reference
Multi Account
Disconnect
WordPress Renderer
ContentDocument 변환
Heading
Paragraph
Image
Video
Button
Table
Internal Link
Related Content
Metadata
WordPress Publishing Preparation
Site 선택
Category
Tag
Featured Image
Author
Draft Status
Preview
WordPress Draft Save
Draft 생성
External Post ID
Draft URL
Result Verification
Retry
Published Registry 연동
Completion Criteria
WordPress 기능이 Tistory 구현을 직접 복사하지 않는다.
공통 Publishing Service와 Adapter Contract를 사용한다.
WordPress 특화 로직은 WordPress App에 위치한다.
실제 WordPress Draft를 생성하고 확인한다.
Tistory Workflow에 Regression이 없다.

13. Stage 7 — Multi-Platform Workflow
Status

Planned

Goal

한 번의 콘텐츠 요청으로 여러 플랫폼 콘텐츠를 준비하고 안전하게 순차 처리한다.

Scope
Multi-platform target selection
Platform capability registry
Shared publishing contract
Shared preview contract
Platform-specific content optimization
Sequential Publishing Queue
Multi-account selection
Platform-specific categories
Independent result state
Retry and Resume
Partial Success handling
Default Flow
Natural Language Request
    ↓
공통 콘텐츠 전략
    ↓
플랫폼별 콘텐츠 생성
    ↓
공통 Quality Review
    ↓
플랫폼별 Preview
    ↓
사용자 확인
    ↓
Sequential Publishing Queue
    ↓
플랫폼별 결과 검증
Rules
같은 HTML을 모든 플랫폼에 복사하지 않는다.
플랫폼마다 독립적인 결과 상태를 가진다.
한 플랫폼 실패가 다른 플랫폼의 성공을 취소하지 않는다.
실패한 플랫폼 작업만 다시 실행할 수 있다.
기본 실행은 순차 처리한다.
각 플랫폼의 Permission Gate를 독립적으로 적용한다.
Completion Criteria
Tistory와 WordPress를 하나의 요청에서 선택할 수 있다.
각 플랫폼 Preview를 별도로 확인할 수 있다.
발행 대상 계정을 플랫폼별로 선택할 수 있다.
Queue 순서와 상태를 확인할 수 있다.
Partial Success를 올바르게 기록한다.
중복 Draft 저장을 방지한다.

14. Stage 8 — Content Repurposing
Status

Planned

Goal

하나의 콘텐츠를 다른 플랫폼과 형식에 맞게 재사용하여 콘텐츠 생산 비용을 줄인다.

Source Types
Existing ContentDocument
Tistory Article
WordPress Article
YouTube Video
YouTube Transcript
YouTube Shorts Script
Approved External Source
Target Types
Tistory Article
WordPress Article
YouTube Long-form Script
YouTube Shorts Script
Naver Cafe Post
Newsletter
Shopping Content
Social Summary
Example Flows
YouTube Video
    ↓
Transcript and Metadata
    ↓
Blog Article
    ↓
SEO and Internal Link Strategy
    ↓
Quality Review
Blog Article
    ↓
YouTube Script
    ↓
Scene Strategy
    ↓
Video Production Workflow
Long-form Content
    ↓
Shorts Script
    ↓
Hook Optimization
    ↓
Voice and Scene Workflow
Rules
원본과 변환 콘텐츠의 관계를 저장한다.
단순 복사가 아니라 플랫폼별로 최적화한다.
Canonical Source를 추적한다.
Repurposing 관계를 Duplicate Detection이 중복으로 잘못 판단하지 않는다.
원본 콘텐츠를 자동 변경하지 않는다.
Completion Criteria
기존 콘텐츠를 Source로 선택할 수 있다.
Target Format을 선택할 수 있다.
새 ContentDocument를 생성한다.
Source와 Derived Content 관계를 저장한다.
변환 결과에 별도 Quality Review를 실행한다.

15. Stage 9 — Analytics and Optimization
Status

Future

Goal

콘텐츠의 실제 성과를 분석하고 다음 콘텐츠 전략과 기존 콘텐츠 개선에 활용한다.

Planned Scope
Google Search Console
GA4
WordPress Analytics
YouTube Analytics
Content Performance Dashboard
Keyword Performance
Search Intent Performance
Internal Link Performance
Topic Authority
Content Decay Detection
Content Refresh Recommendation
Conversion Tracking
Performance Feedback Context
Rules
Analytics 데이터는 사실 데이터와 추정 데이터를 구분한다.
성과가 높다는 이유만으로 품질 기준을 낮추지 않는다.
외부 데이터를 AI Prompt에 무제한 포함하지 않는다.
자동 콘텐츠 수정 전 사용자 검토를 거친다.
플랫폼별 지표를 하나의 의미 없는 점수로 단순 합산하지 않는다.
Completion Criteria
Content와 실제 성과 데이터를 연결한다.
플랫폼별 데이터 Source를 구분한다.
성과 저하 콘텐츠를 발견할 수 있다.
개선 추천의 근거를 제공한다.
기존 Content Intelligence와 연동한다.

16. Stage 10 — Commercial and Team Platform
Status

Future

Goal

개인용 고품질 콘텐츠 도구를 팀과 상용 서비스로 확장한다.

Planned Scope
Commercial Experience
Simple onboarding
Smart Default
Guided Workflow
복잡한 점수 기본 숨김
행동 중심 품질 안내
최소 설정
Usage Limit
Subscription
Team Workspace
Organization
Team Member
Role
Permission
Assignment
Comment
Approval Workflow
Reviewer
Publisher
Audit Log
Cloud Platform
Account
Cloud Sync
Backup
Multi-device
Shared Assets
Organization Settings
Rules
개인판과 상용판은 같은 Core를 사용한다.
상용판을 위해 Core를 복제하지 않는다.
상용 UX는 기능을 삭제하는 것이 아니라 복잡성을 숨긴다.
팀 권한과 Publishing Permission을 구분한다.
Cloud 전환 전 Local Data Migration을 설계한다.
Completion Criteria
개인판 기능과 Core를 재사용한다.
Workspace 데이터 경계를 보장한다.
역할별 작업 권한을 검증한다.
승인 Workflow를 우회할 수 없다.
상용 사용자가 고급 설정 없이 기본 작업을 완료할 수 있다.

17. Stage 11 — Ecosystem and Marketplace
Status

Future

Goal

Bright Studio를 외부 기능과 플랫폼이 확장 가능한 콘텐츠 운영 생태계로 발전시킨다.

Planned Scope
Plugin System
Extension API
Template Marketplace
Prompt Template
Platform Adapter SDK
Asset Integration
Third-party Analytics
Commerce Integration
Workflow Marketplace
Entry Conditions

이 단계는 다음 조건을 만족한 뒤에만 시작한다.

Core API 안정화
Content Model Versioning 안정화
Platform Adapter Contract 검증
Security Model 검증
Commercial Edition 운영
Plugin Permission Model 설계
Backward Compatibility 정책 수립

Marketplace를 제품 초기 확장의 수단으로 사용하지 않는다.

18. Design and Brand Roadmap

디자인은 제품 기능과 분리된 장식 작업이 아니다.

다만 실제 사용 흐름이 검증되기 전에 최종 Design System을 우선하지 않는다.

Phase 1 — Functional UX
명확한 Navigation
상태 기반 Home
사용 가능한 Workspace
일반 문서형 Editor
명확한 Loading
Empty State
Error Recovery
Publishing Progress
Phase 2 — Product Design Refinement
Information Architecture 정리
주요 Workflow 단순화
Personal and Commercial UX 분리
Accessibility
Responsive Layout
Design Token 준비
Phase 3 — Brand Design System
Brand Identity
Bright Design Language
Typography
Color System
Component Library
Figma Library
Motion Principle
Illustration Direction
Entry Condition

Stage 4의 Tistory 실제 End-to-End Workflow가 검증된 후 본격적인 최종 시각 디자인을 진행한다.

기능 오류를 디자인으로 숨겨서는 안 된다.

19. Personal Edition Roadmap
Goal

전문 사용자와 실제 운영자가 사용할 수 있는 고품질 개인용 도구를 먼저 완성한다.

Priority
Tistory End-to-End
Project DNA
Content Intelligence
WordPress
Multi-platform
Repurposing
Analytics
Advanced Diagnostics
Personal Features
상세 Quality Score
SEO 진단
Search Intent 진단
AI Recommendation Reason
Duplicate Candidates
Project DNA Advanced Settings
Platform Diagnostics
Developer Verification
Manual Override

Personal Edition은 Bright Studio의 Core 제품 품질을 검증하는 기준 버전이다.

20. Commercial Edition Roadmap
Goal

기술 지식이 없는 사용자도 최소한의 입력으로 전문 콘텐츠를 완성할 수 있게 한다.

Entry Conditions
개인판 핵심 Workflow 안정화
Tistory 및 WordPress 실제 검증
오류 복구 안정화
설정 Migration 설계
Cloud Security 설계
비용 측정과 사용량 정책 수립
Commercial Priorities
Simple onboarding
Guided content creation
Smart Default
Hidden complexity
Recommended actions
Stable draft workflow
Subscription
Team workflow
UX Principle

상용판에서는 다음과 같은 기술적 표현보다 행동 중심 안내를 우선한다.

기술 중심:

SEO Score: 87
Search Intent Score: 82

행동 중심:

검색자가 궁금해하는 내용을 조금 더 보강하면 발행 준비가 완료됩니다.
21. Explicit Non-Priorities

현재 Roadmap에서 다음 항목은 우선 개발하지 않는다.

AI Agent 수를 늘리는 작업
자체 이미지 생성 모델
공개 발행 자동화
무제한 플랫폼 동시 실행
실시간 공동 편집
Marketplace
Plugin Store
Enterprise 권한 시스템
완전 자동 무검토 발행
기존 외부 콘텐츠 자동 삭제
불필요한 Dashboard 통계
기능 검증 전 대규모 디자인 변경
Deprecated Tistory API 의존
Core에서 직접 Playwright 실행

이 항목들은 영구 제외가 아니라 선행 조건이 충족될 때 다시 검토한다.

22. Release Sequence

Bright Studio의 Release 순서는 다음을 따른다.

Release 0 — Internal Foundation
Core Architecture
Tistory Foundation
Content Model
Processing Pipeline
Basic Product Screens
Persistence
Quality Foundation
Release 1 — Personal Tistory Alpha
Workspace
Project
Natural Language Creation
AI Generation
Editor
Quality Review
Tistory Preview
Tistory Draft Save
Actual Draft Verification
Release 2 — Personal Tistory Stable
Error Recovery
Session Recovery
Category Stability
Image Upload Stability
History and Restore
Content Library
Project DNA Basic
Regression Stability
Release 3 — Content Intelligence
Project DNA Advanced
Search Intent Memory
Keyword Memory
Topic Memory
Duplicate Detection
Internal Link Intelligence
Related Content
Release 4 — WordPress Alpha
WordPress Connection
WordPress Preview
WordPress Draft Save
Actual Draft Verification
Release 5 — Multi-Platform Personal
Tistory and WordPress Target Selection
Sequential Queue
Multi-account
Platform Result Management
Partial Failure Recovery
Release 6 — Content Repurposing
Video to Article
Article to Video Script
Long-form to Shorts
Source Relationship
Repurposing Quality Review
Release 7 — Analytics Preview
External Performance Data
Content Performance
Refresh Recommendations
Topic Performance
Release 8 — Commercial Preview
Simplified UX
Account and Cloud Foundation
Subscription Foundation
Team Workflow Foundation

각 Release의 세부 승인 기준은 05_RELEASE_PLAN.md에서 정의한다.

23. Current Priority

현재 가장 중요한 작업은 새로운 Roadmap Stage를 추가하는 것이 아니다.

다음 실제 흐름을 완성하고 검증하는 것이 최우선이다.

Workspace
    ↓
Project
    ↓
Create Content
    ↓
자연어 입력
    ↓
AI 분석 및 Keyword 추천
    ↓
사용자 확인
    ↓
AI 콘텐츠 생성
    ↓
Editor
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Tistory Category 선택
    ↓
Tistory Draft Save
    ↓
실제 Tistory Draft 검증

이 흐름을 막는 오류와 미연결 기능을 먼저 해결한다.

Stage 4가 Release Ready가 되기 전에는 새 플랫폼 또는 대형 기능 개발보다 통합 안정화를 우선한다.

24. Roadmap Change Policy

Roadmap은 다음 상황에서 변경할 수 있다.

사용자 검증으로 우선순위가 변경된 경우
실제 플랫폼 제약이 발견된 경우
Architecture 결함이 확인된 경우
보안 또는 데이터 손실 위험이 발견된 경우
AI 비용이 지속 가능하지 않은 경우
기존 기능의 Regression이 발생한 경우

Roadmap 변경 시 다음을 기록한다.

변경 이유
기존 계획
새로운 계획
영향을 받는 Epic
영향을 받는 Release
Migration 필요 여부
문서 변경 목록

일시적인 아이디어만으로 Architecture와 Roadmap을 동시에 변경하지 않는다.

25. Stage Entry Gate

새 Stage는 다음 조건을 충족한 뒤 시작한다.

이전 Stage의 필수 Acceptance Criteria 충족
실제 사용자 흐름 검증
Critical 및 High 데이터 손실 위험 없음
주요 Regression Test 통과
관련 문서 정합성 확인
다음 Stage Architecture 승인
명확한 In Scope과 Out of Scope
구현 순서 승인
Rollback 또는 Recovery 전략 존재

필요한 경우 일부 설계 작업은 병행할 수 있지만, 실제 구현 우선순위는 현재 Stage 완료를 방해해서는 안 된다.

26. Roadmap Success Metrics
Product Usability
사용자가 현재 해야 할 일을 쉽게 이해한다.
Workspace에서 실제 콘텐츠 생성을 시작할 수 있다.
Project 생성 후 막히지 않는다.
생성부터 Draft Save까지 중간 우회가 없다.
Content Quality

목표:

Search Intent: 95+
SEO: 95+
Readability: 95+
HTML Quality: 95+
Overall Quality: 95+

목표 미달 시 결과를 숨기거나 기준을 낮추지 않고 콘텐츠를 개선한다.

Reliability
Autosave 성공 상태가 실제 저장 결과와 일치한다.
새로고침 후 콘텐츠가 복원된다.
Generation 실패 시 입력이 보존된다.
Publishing 실패 시 콘텐츠가 보존된다.
외부 결과 검증 전 성공으로 처리하지 않는다.
Publishing
Tistory Editor에 정상 진입한다.
계정과 Category를 선택할 수 있다.
실제 Draft가 생성된다.
사용자에게 검증 가능한 결과를 제공한다.
실패한 작업만 재시도할 수 있다.
Architecture
Core가 플랫폼 구현을 알지 않는다.
Apps가 플랫폼별 로직을 소유한다.
Canonical Content Model을 유지한다.
AI가 Playwright를 직접 호출하지 않는다.
Permission Gate를 우회하지 않는다.
새 플랫폼이 Adapter 방식으로 추가된다.
27. Definition of Roadmap Completion

Roadmap의 한 단계는 기능 목록을 구현했다고 완료되지 않는다.

다음 조건을 모두 만족해야 한다.

단계의 사용자 가치가 실제로 제공된다.
End-to-End 사용자 흐름이 동작한다.
정상 흐름이 검증된다.
주요 실패 흐름이 검증된다.
저장 데이터가 보존된다.
Permission과 Security가 검증된다.
실제 외부 플랫폼 결과가 검증된다.
Regression Test가 통과한다.
관련 문서가 최신 상태다.
Release Gate가 승인된다.
28. Guiding Principle

Bright Studio의 Roadmap은 가장 많은 기능을 가장 빠르게 추가하기 위한 계획이 아니다.

사용자가 실제로 사용할 수 있는 전문 콘텐츠 운영 흐름을 하나씩 완성하기 위한 계획이다.

모든 다음 단계는 다음 질문을 통과해야 한다.

현재 사용 흐름을 더 완성하는가?
사용자가 실제로 얻는 가치가 있는가?
모든 플랫폼에서 재사용할 수 있는가?
Core와 Apps의 책임을 지키는가?
유지보수 비용을 줄이는가?
불필요한 AI 호출을 줄이는가?
기존 기능을 보호하는가?
실제 검증이 가능한가?

Bright Studio는 기능 수가 아니라 완성도와 신뢰성으로 성장한다.

29. Current Implementation Addendum — 2026-08-08

이 절은 기존 Stage/Sprint/Release 설계를 삭제하거나 새 Stage를 만드는 변경이 아니다. 현재 Draft PR `#42`에서 실제 구현이 기존 Roadmap baseline보다 앞서 진행된 부분만 기록한다.

기존 표와 Stage 설명이 이 절의 실제 Repository 상태와 충돌할 경우, 현재 구현 상태를 판단할 때만 이 절과 `04_CURRENT_DEVELOPMENT_STATUS.md`를 우선한다. Stage 전체 완료 여부와 장기 순서는 기존 Roadmap Gate를 유지한다.

Current repository context:

```text
Base branch: fix/wordpress-full-audit
Feature branch: feat/data-source-multi-connections
Pull request: #42
PR state: Open / Draft / Unmerged
Latest automated-verified code HEAD before documentation-only sync:
88efad926c49b1f7ab3bcd011ad7562ffb98122a
GitHub Actions run: 31235886063
```

Latest automated verification:

```text
Typecheck: passed
Lint: passed
Test: passed
Build: passed
Test Files: 292 passed | 8 skipped
Tests: 1629 passed | 20 skipped
```

Automated verification is not external Provider/UI verification.

Stage 5 / Sprint 7 foundation has advanced beyond the older `Design Approved, Not Implemented` baseline. The full Sprint remains Partially Implemented, but Project-scoped Data Source ownership, reusable provider credentials through separate resource Connections, immutable resource identity, current Google resource discovery, Workspace-unassigned projection, duplicate Project persistence protection/migration, Project-scoped GSC/NAVER Evidence delivery, Opportunity confidence corrections and stale/cross-Project isolation guards are implemented and regression-protected.

This does not mark Project DNA, complete Content Library, Published Registry, memory, cannibalization or full Internal Link Intelligence complete.

Detailed Data Source status:

```text
Docs/current/04_DEVELOPMENT/05_DATA_SOURCE_MULTI_CONNECTION_STATUS.md
```

The Bright Finance Source Preflight incident introduced a Core-shared Verification Claim workstream that is now implemented and automated-verified:

```text
approval-aware Planning
→ explicit Verification Plan
→ primary-topic Claim scope
→ Source Preflight only when required
→ actual source verification
→ temporal/freshness verification
→ VerificationSnapshot
→ Generation Verification Gate
→ verified Generation bundle
→ Generation 1 call
→ Generated Claim Binding
→ server-owned verification persistence
→ current-manuscript deterministic verification
→ Quality Review 1 call
→ shared publishing-readiness consumption
```

Status rules:

- the original Bright Finance 400 was an internal `APPROVAL_SOURCE_NOT_READY` workflow rejection mapped to HTTP 400, not proof of an OpenAI transport 400;
- internal-link/related-content mentions do not activate an unrelated full specialized Claim bundle by themselves;
- approval-policy context automatically selects explicit Verification Planning;
- the strict Planning schema was corrected before automatic rollout;
- new public HTTPS source URLs are handled through dynamic source identity rather than an exact closed URL list;
- a new source is not automatically trusted: official-source, support, freshness and conflict rules still apply;
- unsupported high-risk generated scalar values can block Quality after Generation;
- verification is shared Core logic, not separate WordPress/Tistory truth systems;
- no additional AI Claim-verification agent/call was added.

Detailed Verification status and policy:

```text
Docs/current/04_DEVELOPMENT/07_VERIFICATION_CLAIM_SOURCE_STATUS.md
Docs/current/01_PRODUCT/20_APPROVAL_SOURCE_PREFLIGHT.md
```

The earlier conceptual phrase `Phase 6 — Quality Review Claim Linkage` is not an outstanding separate implementation milestone in the current repository. Its responsibility is already implemented in the canonical verification persistence and Quality integrity path.

The older Stage 6 `Planned` and Sprint 8 `Design Approved, Not Implemented` labels remain historical Roadmap baselines, but they no longer describe every component currently present in the branch. The Repository contains WordPress implementation foundation beyond the original primitive-only snapshot plus shared Generated Claim verification consumption in publishing readiness. This does not mark Stage 6 or Sprint 8 complete.

The current Source/Verification external Gate remains:

```text
new Bright Finance Content
→ Planning 1 call
→ verify explicit Verification Plan
→ inspect scoped Claims
→ Source Preflight
→ inspect newly discovered real sources and VerificationSnapshot
→ only if valid: Generation 1 call
→ Quality Review 1 call
→ inspect final HTML and verification metadata
```

Manual harness:

```text
tests/manual/bright-finance-source-live-verification.test.ts
```

This harness does not execute WordPress Draft save or public publishing. A real WordPress Draft using the latest Source/Verification correction has not been performed as part of this workstream. Public publish remains unauthorized.

While the user's local environment is unavailable, documentation synchronization, deterministic regression coverage and architecture audit may continue. External verification remains `Pending` until actual local/provider evidence exists.
