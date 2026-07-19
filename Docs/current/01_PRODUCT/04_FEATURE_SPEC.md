# Feature Specification

**Version:** 3.0
**Status:** Approved
**Document Type:** Product Feature Specification
**Internal Project Name:** Bright Editor Platform
**User-facing Product Name:** Bright Studio

---

# 1. Purpose

이 문서는 Bright Studio의 제품 기능을 Epic과 Feature 단위로 정의한다.

각 기능의 목적, 사용자 가치, 책임 범위, 주요 동작, 제외 범위와 완료 조건을 명확하게 하여 다음 작업의 기준으로 사용한다.

- 제품 설계
- Sprint 계획
- 구현 승인
- 테스트 설계
- 품질 검증
- 문서 정합성 검토
- Release 판단

이 문서는 구현 코드의 세부 구조를 직접 정의하지 않는다.

기술 구조는 Architecture 문서를 따르고, 실제 구현 순서는 Development Plan과 Release Plan을 따른다.

---

# 2. Feature Management Structure

Bright Studio의 기능 관리는 다음 계층을 따른다.

```text
Product Vision
    ↓
Roadmap
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

2.1 Epic

사용자에게 독립적인 제품 가치를 제공하는 큰 기능 집합이다.

2.2 Feature

Epic을 구성하는 구현 가능한 제품 기능이다.

2.3 Task

Feature를 구현하기 위한 작은 작업 단위이다.

2.4 Acceptance Criteria

Feature 완료 여부를 판단하는 검증 가능한 조건이다.

3. Feature Status

각 Feature는 다음 상태 중 하나를 가진다.

Status	Meaning
Proposed	아이디어 또는 후보 단계
Planned	Roadmap에 포함되었으나 상세 설계 전
Designed	상세 설계 완료
Approved	구현 승인 완료
In Progress	구현 진행 중
Implemented	코드 구현 완료
Verified	테스트와 실제 동작 검증 완료
Deferred	이후 단계로 연기
Deprecated	더 이상 사용하지 않음

문서 설계 완료와 실제 구현 완료를 혼동해서는 안 된다.

4. Product Feature Principles

모든 Feature는 다음 원칙을 따라야 한다.

4.1 Platform First

공통 기능은 특정 플랫폼에 종속되지 않아야 한다.

4.2 Core First

재사용 가능한 로직은 Core에 위치한다.

4.3 Project First

콘텐츠 기능은 Project 문맥 안에서 동작한다.

4.4 Content Model First

콘텐츠 원본은 Canonical Content Model이어야 한다.

4.5 Quality First

생성 결과는 품질 검토를 거쳐야 한다.

4.6 Review First

외부 플랫폼 작업 전 사용자의 검토를 기본으로 한다.

4.7 Draft First

초기 자동화는 공개 발행보다 임시저장을 우선한다.

4.8 Cost Efficient

불필요한 AI 호출을 추가하지 않는다.

4.9 Safe Automation

Playwright는 승인된 Workflow와 Permission Gate를 통해서만 실행한다.

4.10 Protect Existing Features

새 기능은 기존 Workspace, Project, Editor, Quality, Publishing 기능을 깨뜨려서는 안 된다.

5. Epic Overview
Epic	Name	Status
Epic 1	Core Content Workflow	Implemented; External E2E Verification Pending
Epic 2	Content Intelligence	Partially Implemented
Epic 3	Multi-Platform Expansion	Planned
Epic 4	Content Repurposing	Planned
Epic 5	Analytics and Learning	Future
Epic 6	Team and Commercial Platform	Future
6. Epic 1 — Core Content Workflow
Status

Implemented; External E2E Verification Pending

Epic 1은 Workspace에서 콘텐츠를 생성하고 편집한 뒤 품질 검토와 Tistory 임시저장까지 연결하는 기본 제품 흐름을 제공한다.

Workspace
    ↓
Project
    ↓
Create Content
    ↓
AI Generation
    ↓
Editor
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Draft Save
7. Feature 1.1 — Workspace Management
Purpose

사용자가 Project, Platform Connection, Publishing Account와 설정을 관리할 수 있는 독립적인 작업 공간을 제공한다.

User Value

여러 콘텐츠 프로젝트와 플랫폼 계정을 하나의 운영 단위에서 안전하게 관리할 수 있다.

Core Requirements
Workspace 생성
Workspace 조회
Workspace 선택
Workspace 설정
Workspace 삭제
Workspace별 데이터 격리
안전한 삭제 및 Backup
활성 플랫폼 관리
Ownership

Workspace는 다음 항목을 소유한다.

Brand
Project
Platform Connection
Publishing Account
Workspace Settings
Permission Policy
Asset Reference
Acceptance Criteria
Workspace 없이 Project를 생성할 수 없다.
서로 다른 Workspace의 데이터가 섞이지 않는다.
삭제 전 영향 범위를 표시한다.
삭제 전 안전한 Backup을 생성한다.
정확한 Workspace 이름 확인 없이 삭제할 수 없다.
8. Feature 1.2 — Brand Management
Purpose

선택적으로 콘텐츠의 브랜드 문맥을 관리한다.

Rules
Brand는 필수가 아니다.
Project는 Brand 없이 생성할 수 있다.
하나의 Brand는 여러 Project와 연결할 수 있다.
Brand가 Project를 직접 소유하는 것으로 처리하지 않는다.
Project의 직접 소유자는 Workspace이다.
Data
Brand Name
Description
Audience
Tone
Visual Direction
Default Strategy Reference
Acceptance Criteria
Brand 입력 없이 Project를 생성할 수 있다.
Brand 삭제가 Project 삭제로 자동 연결되지 않는다.
Brand 전략은 Project DNA보다 우선하지 않는다.
Project별 Override를 지원할 수 있어야 한다.
9. Feature 1.3 — Project Management
Purpose

콘텐츠 전략, 생성, 편집, 품질과 발행을 하나의 운영 문맥으로 관리한다.

Required Fields
Project Name
Workspace ID
Optional Fields
Brand
Description
Default Platform
Default Content Type
Category
Target Audience
Project DNA
Project Responsibilities
콘텐츠 전략
콘텐츠 소유
기본 플랫폼
기본 발행 대상
품질 목표
Content Library
Publishing History
Project DNA
Acceptance Criteria
모든 Content는 하나의 Project에 속한다.
Project를 선택하지 않고 콘텐츠 생성을 시작할 수 없다.
Project 기본 전략이 콘텐츠 생성에 자동 반영된다.
Project 삭제 전 포함 콘텐츠와 발행 기록 영향을 표시한다.
10. Feature 1.4 — First-Run Experience
Purpose

처음 사용하는 사용자도 최소한의 설정으로 Workspace에 진입할 수 있도록 한다.

Flow
First Visit
    ↓
Create Workspace
    ↓
Select Enabled Platforms
    ↓
Platform Connections
    ↓
Connect or Skip
    ↓
Enter Workspace
Requirements
Workspace 생성
사용 플랫폼 선택
연결 설정으로 이동
연결 건너뛰기
Workspace 진입
이후 Settings에서 변경 가능
Acceptance Criteria
플랫폼을 연결하지 않아도 Workspace에 진입할 수 있다.
비활성 플랫폼은 생성 및 발행 Workflow에서 제외된다.
연결되지 않은 플랫폼 기능은 명확히 비활성 상태로 표시된다.
Fixture 데이터가 실제 데이터처럼 표시되지 않는다.
11. Feature 1.5 — Natural Language Content Creation
Purpose

사용자가 복잡한 설정 화면 대신 자연어로 콘텐츠 제작 요청을 시작할 수 있도록 한다.

Example Input
40대 여성을 대상으로 집에서 할 수 있는 허리 운동 글을 만들어 주세요.
티스토리용으로 만들고 초보자가 따라 하기 쉽게 설명해 주세요.
Input
Natural Language Request
Project
Target Platforms
Optional Category
Optional Source Content
Optional Keywords
AI Analysis

AI는 생성 전에 다음 내용을 분석한다.

핵심 주제
검색 의도
대상 독자
콘텐츠 유형
추천 키워드
추천 구성
예상 콘텐츠 방향
플랫폼 적합성
중복 위험

기본 자동 선정 모드에서는 키워드 목록이 아니라 완전한 Content Opportunity 후보를 반환한다. 각 후보는 주제, 대표·보조 키워드, 검색 의도, 독자 문제, 방향, 예상 범위, 추천 근거와 데이터 출처가 하나의 계약을 이룬다. 사용자가 주제를 명시한 경우 후보는 그 주제와 같은 검색 의도 안에 머문다. 외부 검색 데이터가 없으면 AI 추정과 콘텐츠 공백 추론으로 표시하고 검색량 수치를 만들지 않는다.
Confirmation

사용자는 AI 분석 결과를 확인하고 수정할 수 있어야 한다.

Acceptance Criteria
자연어 요청에서 핵심 생성 조건을 추출한다.
AI 분석 결과를 본문 생성 전에 표시한다.
사용자가 완전한 Content Opportunity를 선택할 수 있다. 직접 입력한 키워드는 기존 후보 필드와 결합하지 않고 Planning에서 다시 완전한 기회로 확인한다.
사용자의 확인 없이 최종 콘텐츠 생성을 시작하지 않는다.
서버가 확정 Opportunity의 identity, version, fingerprint와 소유권을 검증한 뒤 저장 snapshot만 Generation에 전달한다.
Project DNA가 자동 적용된다.
12. Feature 1.6 — AI Editorial Generation
Purpose

한 번의 AI Generation으로 전문 편집팀의 주요 역할을 통합 수행한다.

AI Roles
Writer
SEO Specialist
Image Strategist
Internal Link Planner
CTA Advisor
Editor
Required Thinking Order
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
Content Model Generation

The entire confirmed Content Opportunity is immutable input to Generation and Quality Review. Topic fidelity and search-intent fulfillment must be visible across title, H2 structure, body, image strategy, link context, and CTA. A keyword-prefixed unrelated manuscript is invalid and blocked rather than cosmetically corrected.
Output
Title
Metadata
Search Intent
Keywords
ContentDocument
Image Strategy
CTA Strategy
Internal Link Requirement
Related Content Requirement
Rules
완성된 콘텐츠를 생성해야 한다.
Outline이나 작성 지침만 반환해서는 안 된다.
존재하지 않는 URL을 생성해서는 안 된다.
제공되지 않은 통계나 경험을 만들어서는 안 된다.
Project DNA를 반영해야 한다.
Canonical Content Model로 변환 가능해야 한다.
Acceptance Criteria
기본 생성 호출은 1회이다.
플랫폼 HTML이 아닌 ContentDocument를 생성한다.
제목과 본문을 포함한 완성 원고를 생성한다.
이미지 목적과 ALT 전략을 포함한다.
CTA 필요 여부를 판단한다.
내부 링크는 검증된 URL만 사용한다.
AI 호출 실패 시 기존 콘텐츠를 손상시키지 않는다.
13. Feature 1.7 — Content Editor
Purpose

사용자가 AI가 생성한 콘텐츠를 일반적인 문서 편집기 방식으로 검토하고 수정할 수 있도록 한다.

Requirements
제목 편집
본문 편집
Heading 구조 확인
이미지 위치 확인
이미지 전략 수정
CTA 위치 수정
Video 위치 수정
링크 수정
목차 확인
Autosave
History
Restore
Quality Review 실행
Platform Preview 이동
UX Rules
Block 구현 구조를 사용자에게 과도하게 노출하지 않는다.
일반 문서 편집기처럼 보여야 한다.
H2와 H3가 시각적으로 명확히 구분되어야 한다.
버튼은 실제 버튼 형태로 보여야 한다.
이미지와 버튼을 문서 흐름 안에서 이동할 수 있어야 한다.
Acceptance Criteria
수정 내용이 자동 저장된다.
새로고침 후 마지막 저장 상태를 복원한다.
이전 Revision을 복원할 수 있다.
Content Model 무결성을 유지한다.
저장 실패를 성공으로 표시하지 않는다.
14. Feature 1.8 — Persistence, Autosave and History
Purpose

콘텐츠와 편집 상태가 브라우저 전환이나 페이지 새로고침으로 유실되지 않도록 한다.

Stored Data
Project
ContentDocument
Content Metadata
Editor State
Autosave
Revision History
Quality Report
Publishing Preparation
Publishing Result
Requirements
서버 기반 Persistence
Autosave
명시적 Save State
Revision 생성
History 조회
Revision Restore
저장 오류 처리
Acceptance Criteria
브라우저 메모리에만 의존하지 않는다.
Autosave 요청 시작이 아니라 저장 완료를 기준으로 성공 처리한다.
Project 전환 전 대기 저장을 완료한다.
저장 실패 시 사용자에게 상태를 표시한다.
Restore 후 새로운 Revision을 생성한다.
15. Feature 1.9 — Quality Engine
Purpose

콘텐츠가 사용자와 외부 플랫폼에 전달되기 전에 품질을 검토한다.

Evaluation Areas
Search Intent
Reader Value
Accuracy
SEO
Readability
Structure
Completeness
Information Density
Image Strategy
Internal Links
Related Content
CTA
Metadata
Platform Suitability
HTML Quality
Duplicate Risk
Prohibited Expression
Unsupported Claim
Workflow
Generated Content
    ↓
Rule Validation
    ↓
AI Quality Review
    ↓
Automatic Improvement
    ↓
Final Rule Validation
    ↓
Approved or In Review
Target
Search Intent: 95+
SEO: 95+
Readability: 95+
HTML Quality: 95+
Overall: 95+
Rules
점수를 높이기 위해 평가 기준을 완화해서는 안 된다.
품질 보고서는 실제 Content Revision과 연결되어야 한다.
콘텐츠 변경 후 기존 품질 결과는 outdated 상태가 되어야 한다.
자동 개선은 검증된 URL을 변경하거나 삭제해서는 안 된다.
Acceptance Criteria
Generation과 별도 Quality Review AI 호출을 사용한다.
규칙 기반 검증은 AI 호출 없이 수행한다.
품질 목표 미달 사유를 구체적으로 제공한다.
수정 후 다시 평가할 수 있다.
승인 여부가 Publishing Gate에 반영된다.
16. Feature 1.10 — Image Strategy
Purpose

콘텐츠 이해와 전달에 필요한 이미지를 목적 중심으로 설계한다.

Image Types
Hero Image
Comparison
Checklist
Infographic
Summary Card
Warning Card
Step Guide
Product Visual
Output
이미지 필요 여부
이미지 목적
추천 위치
Prompt
ALT
Composition
Platform Usage
Rules
이미지는 장식 목적으로만 추가하지 않는다.
각 이미지에 명확한 목적이 있어야 한다.
이미지가 없어도 되는 콘텐츠에는 불필요하게 추천하지 않는다.
실제 이미지 Source가 없으면 전략 Block으로 유지한다.
Acceptance Criteria
모든 이미지 추천에 목적과 ALT가 있다.
이미지 위치가 본문 내용과 연결된다.
플랫폼별 이미지 규격을 Adapter에서 처리할 수 있다.
이미지 생성 API를 필수 전제로 하지 않는다.
17. Feature 1.11 — CTA Strategy
Purpose

독자 행동에 실제 도움이 되는 경우에만 적절한 CTA를 배치한다.

CTA Types
Internal Navigation
Related Content
Product
Consultation
Subscription
Download
External Conversion
Rules
CTA는 항상 필요한 기능이 아니다.
콘텐츠 목적과 독자 흐름을 기준으로 필요 여부를 판단한다.
내부 CTA는 기본적으로 현재 창에서 연다.
외부 CTA는 새 창과 안전한 rel 속성을 적용한다.
승인되지 않은 URL을 생성해서는 안 된다.
Acceptance Criteria
CTA 목적이 Metadata로 구분된다.
내부 링크와 외부 링크 정책이 분리된다.
빈 URL은 Editor에서 입력 필요 상태로 표시한다.
발행 전 URL Validation을 수행한다.
18. Feature 1.12 — Platform Preview
Purpose

발행 전에 실제 플랫폼에 가까운 결과를 확인할 수 있도록 한다.

Requirements
Canonical Content Preview
Tistory Preview
향후 WordPress Preview
플랫폼별 HTML 확인
이미지·버튼·목차 확인
Metadata 확인
Link Target 확인
Acceptance Criteria
Preview는 저장된 최신 Content Revision을 사용한다.
Preview가 원본 ContentDocument를 변경하지 않는다.
플랫폼별 Renderer 결과를 사용한다.
지원하지 않는 플랫폼 Preview를 성공으로 표시하지 않는다.
19. Feature 1.13 — Platform Connections
Purpose

Workspace와 외부 콘텐츠 플랫폼 계정을 안전하게 연결한다.

Ownership

Platform Connection은 Workspace가 소유한다.

Project는 발행 대상 Connection을 참조한다.

Requirements
다중 플랫폼
플랫폼별 다중 계정
연결 상태
연결 검증
Stored Session
Secret Reference
Disconnect
Cleanup State
Last Check Result
Security Rules
API Key, Cookie, Session 원문을 화면에 표시하지 않는다.
Secret은 안전한 OS 저장소를 사용한다.
저장 데이터에는 Secret Reference만 남긴다.
연결 해제 시 관련 Session 정리 상태를 추적한다.
Acceptance Criteria
하나의 Workspace에 여러 Tistory 계정을 연결할 수 있다.
Connection ID와 Secret Reference가 분리된다.
연결 실패 이유를 명확히 표시한다.
실제 연결과 Fixture를 구분한다.
Project가 연결 정보를 복사해서 저장하지 않는다.
20. Feature 1.14 — Publishing Preparation
Purpose

외부 플랫폼 작업 전에 발행 조건과 대상을 최종 검토한다.

Preparation Data
Target Platform
Publishing Account
Platform Category
Content Revision
Quality Status
Image Status
Link Status
Permission Status
Draft or Publish Mode
Flow
Editor
    ↓
Quality Approval
    ↓
Publishing Preparation
    ↓
Account Selection
    ↓
Platform Category Selection
    ↓
Preview
    ↓
Permission Gate
Acceptance Criteria
발행 대상 계정을 확인할 수 있다.
플랫폼 카테고리를 선택할 수 있다.
Quality 미승인 상태를 표시한다.
Draft와 Public Publish를 명확히 구분한다.
선택한 Content Revision이 이후 발행까지 유지된다.
21. Feature 1.15 — Permission Gate
Purpose

위험한 외부 플랫폼 작업이 승인 없이 실행되지 않도록 한다.

Default Policy
Review First: ON
Draft Only: ON
Public Publish: OFF
Quality Approval Required: ON
Sequential Draft Save: ON
Protected Actions
Draft Save
Public Publish
Existing Content Edit
Delete
Account Setting Change
Scheduled Publish
Rules
클라이언트 UI 상태만 신뢰하지 않는다.
실행 직전에 권한을 다시 검증한다.
AI는 권한을 변경할 수 없다.
승인된 Workflow 외 자동화 실행을 금지한다.
Acceptance Criteria
권한이 없는 작업은 서버 실행 계층에서 차단된다.
차단 이유를 사용자에게 표시한다.
Public Publish는 기본적으로 비활성화된다.
Permission 변경 이력을 추적할 수 있다.
22. Feature 1.16 — Tistory Draft Save
Purpose

승인된 콘텐츠를 Tistory Editor에 입력하고 안전하게 임시저장한다.

Workflow
Permission Gate
    ↓
Publishing Service
    ↓
Tistory Adapter
    ↓
Registered Draft Workflow
    ↓
Playwright Worker
    ↓
Tistory Editor
    ↓
Draft Save
    ↓
Result Verification
Requirements
Stored Session 사용
Editor 진입
Title 입력
HTML 입력
Category 선택
Image Upload
Draft Save
결과 검증
오류 매핑
Rules
Settings나 AI Engine이 Playwright를 직접 실행하지 않는다.
Tistory API를 필수 전제로 하지 않는다.
공개 발행은 Draft Save와 별도 기능으로 관리한다.
임의 Sleep보다 명확한 상태 검증을 사용한다.
Acceptance Criteria
승인된 Workflow를 통해서만 실행된다.
최신 승인 Content Revision을 사용한다.
선택한 계정과 카테고리를 사용한다.
임시저장 성공을 실제 결과로 검증한다.
세션 만료, Editor 진입 실패, 저장 실패를 구분한다.
실패 시 원본 콘텐츠와 Project 상태를 손상시키지 않는다.

22.1 Feature 1.17 — Tistory Scheduled Publication

Purpose

Quality 승인된 특정 Content Revision을 사용자가 선택한 Tistory Account와 Category에 안전하게 예약하고, 예약 시간 수정·취소·상태 확인과 실패 복구를 제공한다.

Domain

- `ScheduledPublication`: Workspace, Project, Content, 고정 Revision, Account, Category, `Asia/Seoul` 예약 시각, 외부 예약 식별자와 현재 상태
- `ScheduleJob`: create, update-time, cancel, verify 작업의 idempotency, attempt, 결과와 안전한 오류

Workflow

Publishing Preparation
    ↓
Quality Approval and Current Revision Check
    ↓
PreviewApproval and RenderArtifact Checksum
    ↓
Schedule Permission Gate
    ↓
Explicit User Approval
    ↓
Tistory Registered Scheduling Workflow
    ↓
External Schedule Verification
    ↓
Persistent Status and Audit

Default Policy

- `schedule.publish`: OFF
- `public.publish`: OFF
- Draft Only: ON
- Time Zone: `Asia/Seoul`
- Tistory native scheduling first

Rules

- 예약 등록, 예약 시간 수정과 예약 취소마다 사용자 명시 승인을 요구한다.
- Quality 승인은 예약 대상 Revision과 일치해야 한다.
- 예약 생성 후 Revision, Account와 Category를 변경할 수 없다.
- 해당 항목 변경은 기존 예약을 취소하고 새 예약을 생성한다.
- 기존 고정 대상을 유지하는 예약 시간만 안전하게 수정할 수 있다.
- 같은 활성 예약을 중복 생성하지 않는다.
- 성공한 ScheduleJob은 재시도하지 않고 실패한 Job만 재시도한다.
- 예약과 Job 상태는 앱 재시작 후 복원한다.
- 예약 취소는 글 삭제가 아니다.
- Tistory에서 예약 취소 후 Draft 보존이 가능한 것으로 실제 검증된 경우에만 자동 취소한다.
- 취소에 글 삭제가 필요하면 별도 Delete Permission 승인 전 자동 실행하지 않는다.
- AI가 예약 시간을 임의로 결정하지 않는다.

Acceptance Criteria

- 승인된 고정 Revision, Account와 Category로 Tistory 예약을 등록하고 외부 결과를 검증한다.
- 예약 시간을 수정하고 변경된 외부 시각을 검증한다.
- Draft를 보존하는 방식으로 예약을 취소하고 외부 상태를 검증한다.
- 예약 목록에 로컬 상태와 검증된 외부 상태를 구분해 표시한다.
- 중복 예약, stale Revision, Permission 누락과 사용자 승인 누락을 서버에서 차단한다.
- 실패 Job만 재시도하며 성공한 외부 예약을 중복 생성하지 않는다.
- 앱 재시작 후 pending, failed와 unknown 상태를 복원하고 안전하게 조정한다.

Out of Scope

- 로컬 Scheduler
- 반복 예약
- 다중 플랫폼 예약
- AI의 임의 예약 시간 결정
- 자동 즉시 공개 발행

22.2 Integrated Sprint 6 Presentation Boundary

`Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling`은 기존 Sprint 6과 Sprint 6.5 범위를 하나로 관리한다. 별도 Sprint 6.5 개발 단계는 두지 않는다.

Presentation Contract Foundation은 구현되어 있다. Bright Components, deterministic Presentation Resolver, theme-independent semantic HTML, RenderArtifact/checksum, PreviewApproval과 Preview/Draft 동일 Artifact Runtime은 구현되지 않았다.

실제 Tistory Draft Save 후 재진입하여 제목, 의미 있는 본문 구조, Category와 비공개 상태를 확인하는 Gate 0을 통과하기 전에는 통합 Sprint Runtime 구현을 시작하지 않는다. Sprint 전체는 외부 검증 전 `Completed` 또는 `Verified`로 표시하지 않는다.
23. Epic 1 Completion Criteria

Epic 1은 다음 통합 흐름이 실제로 검증되었을 때 완료로 판단한다.

Workspace
    ↓
Project
    ↓
Create Content
    ↓
Natural Language Request
    ↓
AI Analysis
    ↓
User Confirmation
    ↓
AI Generation
    ↓
Editor
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Tistory Draft Save
    ↓
Actual Draft Verification

Epic 1의 개별 기반 기능은 구현되어 있으나, Release 판단 시에는 위 전체 흐름의 실제 계정 검증 결과를 별도로 확인해야 한다.

실제 Tistory Draft를 다시 열어 제목, 의미 있는 본문, 카테고리와 비공개 상태를 확인하기 전에는 Epic 1을 `Verified`로 표시하지 않는다.

24. Epic 2 — Content Intelligence
Status

Partially Implemented

Epic 2는 Project와 기존 콘텐츠 데이터를 활용하여 Bright Studio가 반복 작업을 줄이고 더 정확한 추천을 제공하도록 한다.

Epic Goal
Project 전략 자동 적용
기존 콘텐츠 활용
중복 콘텐츠 방지
검증된 내부 링크 추천
유용한 관련 콘텐츠 추천
AI Context 품질 향상
향후 학습형 콘텐츠 운영 기반 마련
25. Feature 2.1 — Project DNA
Purpose

Project의 장기 콘텐츠 전략을 저장하고 모든 콘텐츠 생성에 자동 적용한다.

Data Groups
Identity
Editorial Strategy
Audience Strategy
Topic Strategy
SEO Strategy
Image Strategy
CTA Strategy
Internal Link Strategy
Related Content Strategy
Publishing Defaults
Quality Target
Requirements
Project 생성 시 선택적 설정
이후 Settings에서 수정
콘텐츠 생성 시 자동 상속
콘텐츠별 Override
Version 관리
Validation
AI Context 변환
Rules
Project DNA는 AI Prompt 문자열 자체를 저장하지 않는다.
플랫폼 인증 정보는 포함하지 않는다.
콘텐츠별 사용자 입력이 Project 기본값보다 우선한다.
Brand 기본값이 있어도 Project DNA가 우선한다.
Acceptance Criteria
콘텐츠 생성 요청에 Project DNA가 자동 포함된다.
설정되지 않은 항목에 안전한 기본값을 사용한다.
사용자 Override를 보존한다.
Project DNA 변경이 기존 발행 콘텐츠를 자동 변경하지 않는다.
Version과 변경 시간을 추적한다.
26. Feature 2.2 — Content Library
Purpose

Project에서 생성된 모든 콘텐츠를 운영 가능한 데이터로 관리한다.

Stored Information
Content ID
Project ID
Title
Summary
Content Type
Topics
Keywords
Search Intent
Audience
Platform Targets
Status
Quality Score
Current Revision
Created Date
Updated Date
Publishing References
Content Status
Planning
Draft
Editing
In Review
Ready
Draft Saved
Scheduled
Published
Failed
Archived
Acceptance Criteria
모든 콘텐츠가 Project 기준으로 조회된다.
상태별 필터를 지원할 수 있다.
현재 Revision과 Quality 상태를 연결한다.
삭제된 콘텐츠와 Published Registry 관계를 안전하게 처리한다.
Library 데이터는 추천과 중복 검사의 기반으로 사용할 수 있다.
27. Feature 2.3 — Published Content Registry
Purpose

실제로 발행이 검증된 콘텐츠와 URL을 관리한다.

Stored Information
Content ID
Project ID
Platform
Publishing Account
External Content ID
Published URL
Published Title
Category
Topics
Keywords
Search Intent
Audience
Summary
Published Date
Verification Status
Last Verified Date
Verification Status
Pending
Verified
Failed
Removed
Unknown
Rules
발행 요청 성공만으로 Verified 처리하지 않는다.
실제 URL 또는 외부 결과를 검증해야 한다.
내부 링크 추천에는 Verified 상태만 사용한다.
Removed 콘텐츠를 추천하지 않는다.
Acceptance Criteria
Content와 외부 URL 관계가 저장된다.
플랫폼별 동일 콘텐츠 URL을 구분한다.
검증되지 않은 URL을 내부 링크에 사용하지 않는다.
URL 변경 또는 삭제 상태를 갱신할 수 있다.
AI가 Registry에 없는 URL을 생성하지 못하도록 한다.
28. Feature 2.4 — Search Intent Memory
Purpose

Project에서 이미 다룬 검색 의도와 아직 다루지 않은 검색 의도를 관리한다.

Stored Information
Primary Intent
Secondary Intent
Intent Type
Related Content IDs
Coverage Status
Coverage Summary
Last Used Date
Confidence
Intent Types
Informational
Navigational
Commercial
Transactional
Comparison
Problem Solving
How-to
Local
News or Trend
Requirements
콘텐츠 생성 후 검색 의도 저장
발행 상태 연결
유사 검색 의도 조회
중복 위험 표시
확장 가능한 세부 의도 추천
Acceptance Criteria
동일 표현이 아니어도 유사 의도를 탐지할 수 있는 구조를 가진다.
Draft와 Published 의도를 구분한다.
단순 Keyword 일치만으로 중복 판단하지 않는다.
AI Planning Context에 기존 의도 정보를 제공한다.
29. Feature 2.5 — Keyword Memory
Purpose

Project 내 Keyword 사용 이력을 관리하여 중복과 Keyword Cannibalization 위험을 줄인다.

Stored Information
Keyword
Keyword Type
Content IDs
Search Intent
Usage Role
Status
Last Used Date
Frequency
Cannibalization Risk
Keyword Types
Primary
Secondary
Long-tail
Related Term
Entity
Brand Term
Excluded Term
Requirements
생성 콘텐츠 Keyword 저장
발행 상태 연결
중복 사용 조회
Primary Keyword 충돌 탐지
관련 Keyword 추천
Acceptance Criteria
Keyword 사용 콘텐츠를 조회할 수 있다.
같은 Keyword라도 검색 의도가 다르면 별도로 판단한다.
단순 횟수만으로 사용을 금지하지 않는다.
제외 Keyword가 AI Context에 반영된다.
Keyword Stuffing을 유도하지 않는다.

30. Feature 2.6 — Topic Memory
Purpose

Project가 이미 다룬 주제, 세부 주제와 Topic Cluster 관계를 관리한다.

Data
Topic
Parent Topic
Child Topics
Related Topics
Content IDs
Coverage Level
Authority Role
Last Updated
Content Roles
Pillar
Cluster
Supporting
Comparison
Conversion
Update
News
Acceptance Criteria
콘텐츠와 Topic 관계를 저장한다.
동일 Keyword라도 다른 Topic 문맥을 구분한다.
관련 콘텐츠 추천에 Topic 관계를 사용할 수 있다.
향후 Topic Cluster Engine으로 확장 가능해야 한다.
31. Feature 2.7 — Duplicate Detection
Purpose

기존 콘텐츠와 지나치게 유사한 콘텐츠가 생성되거나 발행되는 것을 방지한다.

Detection Signals
Search Intent Similarity
Topic Similarity
Title Similarity
Keyword Overlap
Outline Similarity
Content Purpose
Audience
Platform
Existing Drafts
Published Content
Risk Levels
None
Low
Medium
High
Critical
Actions
그대로 진행
차별화 방향 추천
기존 글 업데이트 추천
통합 추천
생성 중단 경고
사용자 승인 요청
Rules
단순 Keyword 일치만으로 차단하지 않는다.
Draft와 Published 콘텐츠를 모두 검사한다.
동일 콘텐츠의 플랫폼 변환은 중복으로 잘못 판단하지 않는다.
Repurposing 관계를 고려한다.
Acceptance Criteria
생성 전 유사 콘텐츠 후보를 제공한다.
생성 후 ContentDocument를 다시 검사할 수 있다.
위험 판단 근거를 제공한다.
사용자의 명시적 승인 없이 기존 콘텐츠를 덮어쓰지 않는다.
Critical 위험은 Publishing Preparation에서 경고한다.
32. Feature 2.8 — Internal Link Intelligence
Purpose

현재 콘텐츠를 이해하는 데 도움이 되는 검증된 내부 콘텐츠를 추천한다.

Candidate Source
같은 Project의 Published Registry
향후 승인된 Workspace 공용 콘텐츠
Verified 상태 콘텐츠만 포함
Ranking Signals
Reader Next Need
Search Intent Relationship
Topic Relationship
Content Role
Contextual Relevance
Helpfulness
Link Position
Publication Status
Duplicate Link Risk
Output
Target Content ID
Verified URL
Recommended Anchor
Recommended Position
Recommendation Reason
Confidence
Link Purpose
Rules
존재하지 않는 URL을 생성하지 않는다.
Keyword Similarity만으로 순위를 정하지 않는다.
현재 콘텐츠 자신을 추천하지 않는다.
동일 URL을 과도하게 반복하지 않는다.
내부 링크는 기본적으로 현재 창에서 연다.
Acceptance Criteria
Verified Published Content만 추천한다.
추천 이유를 설명할 수 있다.
본문 문맥에 맞는 위치를 제안한다.
사용자가 추천을 수락, 수정 또는 제외할 수 있다.
URL이 없는 경우 빈 URL을 만들어 추천하지 않는다.
33. Feature 2.9 — Related Content Recommendation
Purpose

독자가 현재 글을 읽은 뒤 다음으로 보면 도움이 되는 콘텐츠를 추천한다.

Difference from Internal Link

Internal Link는 본문 흐름 안에 배치된다.

Related Content는 본문 하단 또는 별도 추천 영역에 배치된다.

Ranking Signals
Reader Journey
Search Intent Continuity
Topic Expansion
Practical Usefulness
Content Freshness
Content Quality
Publication Verification
Diversity
Requirements
기본 최대 추천 수 설정
같은 콘텐츠 제외
중복 URL 제거
유사한 추천만 반복하지 않기
플랫폼별 표현 방식 분리
Acceptance Criteria
키워드 중복보다 유용성을 우선한다.
검증된 발행 콘텐츠만 사용한다.
추천 결과에 콘텐츠 제목과 URL을 포함한다.
관련 이유 또는 관계 유형을 보존한다.
플랫폼 Renderer가 추천 블록을 변환할 수 있다.
34. Feature 2.10 — AI Context Builder
Purpose

AI Generation과 Quality Review에 필요한 Project 지식을 안전하고 일관되게 조립한다.

Context Sources
Workspace Policy
    ↓
Brand Defaults
    ↓
Project DNA
    ↓
Current User Request
    ↓
Content Library
    ↓
Published Registry
    ↓
Search Intent Memory
    ↓
Keyword Memory
    ↓
Topic Memory
    ↓
Duplicate Candidates
    ↓
Internal Link Candidates
    ↓
Quality History
Priority
안전 및 제품 정책
사용자 현재 요청
콘텐츠별 Override
Project DNA
Brand Defaults
시스템 기본값
Requirements
필요한 Context만 포함
Token 비용 제한
민감 정보 제거
플랫폼 독립 구조
동일 입력에 일관된 결과
Context Version
Source 추적
Rules
AI는 Repository를 직접 조회하지 않는다.
Secret, Cookie, Session을 포함하지 않는다.
검증되지 않은 URL을 포함하지 않는다.
오래된 데이터와 최신 데이터를 구분한다.
Context가 없더라도 안전하게 Generation을 진행할 수 있어야 한다.
Acceptance Criteria
Project DNA가 항상 Generation Context에 포함된다.
사용자 입력 우선순위를 보장한다.
추천 후보와 확정 링크를 구분한다.
Context 크기 제한 정책을 가진다.
AI 요청에 어떤 데이터가 사용되었는지 추적할 수 있다.
35. Feature 2.11 — Content Intelligence Repository
Purpose

Content Intelligence Domain을 저장소 구현과 분리한다.

Repository Interfaces
ProjectDNARepository
ContentLibraryRepository
PublishedRegistryRepository
SearchIntentRepository
KeywordMemoryRepository
TopicMemoryRepository
RecommendationRepository
QualityHistoryRepository
Requirements
Domain Interface
Infrastructure Implementation
Workspace 및 Project Scope
Transaction Safety
Version Migration
Backup Compatibility
Test Double 지원
Acceptance Criteria
Application Layer가 저장 방식에 직접 의존하지 않는다.
AI Engine이 Repository를 직접 호출하지 않는다.
Local Storage 구현을 이후 Database로 교체할 수 있다.
Repository 실패가 기존 콘텐츠를 손상시키지 않는다.
Workspace 경계를 우회할 수 없다.
36. Feature 2.12 — Content Intelligence User Experience
Purpose

복잡한 Intelligence 결과를 사용자가 쉽게 이해하고 결정할 수 있도록 한다.

User-Facing Recommendations
이미 다룬 주제 알림
검색 의도 중복 경고
추천 Keyword
기존 글 업데이트 제안
내부 링크 추천
관련 콘텐츠 추천
Project DNA 자동 적용 안내
Commercial Edition
복잡한 점수와 기술 정보를 숨긴다.
권장 행동 중심으로 표시한다.
사용자의 선택 수를 최소화한다.
Personal Edition
상세 점수
중복 후보
추천 근거
AI Context 상세
고급 Override
진단 정보
Acceptance Criteria
사용자에게 내부 Architecture 용어를 강요하지 않는다.
추천과 확정 상태를 시각적으로 구분한다.
사용자가 모든 추천을 거절할 수 있다.
자동 적용된 Project 전략을 확인할 수 있다.
경고만 표시하고 사용자를 막는 기능과 실제 Gate를 구분한다.
37. Epic 2 End-to-End Workflow
Create Content
    ↓
Load Project DNA
    ↓
Build Initial Intelligence Context
    ↓
Analyze Search Intent
    ↓
Check Keyword and Topic Memory
    ↓
Detect Duplicate Risk
    ↓
Recommend Content Direction
    ↓
User Confirmation
    ↓
AI Generation
    ↓
Quality Review
    ↓
Recommend Verified Internal Links
    ↓
Recommend Related Content
    ↓
Editor
    ↓
Publishing
    ↓
Verify Published Result
    ↓
Update Published Registry
    ↓
Update Search Intent Memory
    ↓
Update Keyword Memory
    ↓
Update Topic Memory
38. Epic 2 Acceptance Criteria

Epic 2는 다음 조건을 만족해야 한다.

Project DNA가 모든 콘텐츠 생성에 자동 적용된다.
Content Library가 Project 콘텐츠를 관리한다.
실제 발행이 검증된 URL이 Registry에 저장된다.
검색 의도 사용 이력을 조회할 수 있다.
Keyword 사용 이력과 충돌 위험을 조회할 수 있다.
Topic 관계를 저장할 수 있다.
콘텐츠 생성 전에 중복 위험을 확인한다.
검증된 콘텐츠만 내부 링크로 추천한다.
관련 콘텐츠를 Keyword 일치보다 유용성 기준으로 추천한다.
AI Context Builder가 필요한 정보를 통합한다.
AI가 Repository나 SecretStore를 직접 조회하지 않는다.
사용자가 추천을 확인하고 수정하거나 거절할 수 있다.
기존 Epic 1 Workflow가 손상되지 않는다.

## 38.1 Epic 2 Current Implementation Boundary

`71d4899d feat: add content intelligence and data source workflows`에서 다음 Foundation이 구현되어 `main`과 `origin/main`에 반영되었다.

- 완전한 Content Opportunity 후보, 원자적 확정 snapshot, version과 fingerprint 검증
- 재진입·새로고침 후 복원되는 Planning 상태 Persistence와 operation/revision 경계
- Workspace가 소유하는 `DataSourceConnection`
- Project가 같은 Workspace의 Data Source만 식별자로 참조하는 `ProjectDataSourceReference`
- Publishing 전용 `PlatformConnection`과 시장·성과 Evidence 전용 `DataSourceConnection` 분리
- 공식 Provider Adapter, Raw Snapshot, 정규화 Evidence, 수동 동기화와 Opportunity 분류
- Data Source disable, disconnect와 safe deletion의 분리

실계정 외부 검증이 완료된 범위는 다음과 같다.

- Google Search Console OAuth 실제 로그인
- 실제 Search Console 속성 목록 조회
- `https://bright-healthy.tistory.com/` 선택과 `siteOwner` 권한 확인
- 실제 Search Console 동기화와 Snapshot 생성
- NAVER Search Trend 실제 연결과 동기화
- legacy Google Search Console Data Source 실제 삭제와 `DELETE /api/data-sources` HTTP 200 확인

자동 검증은 전체 118개 파일, 589개 테스트 통과다. 기존 정책상 6개 파일, 14개 테스트는 skip이며 lint, typecheck, test, build와 `git diff --check`가 통과했다. 이는 자동 검증 결과이며 위에 별도로 명시한 외부 검증 범위를 대신하지 않는다.

Project DNA, Content Library, Published Content Registry, Search Intent Memory, Keyword Memory, Topic Memory, Duplicate Detection, Cannibalization Detection과 Internal Link Intelligence는 아직 구현되지 않았다. 따라서 Epic 2 전체는 `Partially Implemented`이며 `Implemented` 또는 `Verified`가 아니다.

GA4와 AdSense 실제 계정 검증, 토큰 만료 후 자동 갱신, 쿼터 한계와 다양한 실제 Provider 응답 검증은 남아 있다. Google Ads와 Google Trends는 공식 접근 전 비활성 상태를 유지한다.
39. Epic 3 — Multi-Platform Expansion
Status

Planned

Goal

공통 Content Model과 Publishing Pipeline을 기반으로 Tistory 이외의 플랫폼을 확장한다.

Planned Features
WordPress Connection
WordPress Preview
WordPress Draft Save
Multi-Account Publishing
Platform Capability Registry
Shared Publishing Contract
Sequential Platform Queue
Multi-Platform Status
Platform Error Mapping
Platform-Specific Category Mapping
40. Feature 3.1 — WordPress Draft Save
Purpose

Canonical ContentDocument를 WordPress용 결과로 변환하고 임시저장한다.

Requirements
WordPress Connection
Site Validation
WordPress Renderer
Category Mapping
Featured Image
Draft Save
Result Verification
Published Registry Integration
Acceptance Criteria
Tistory 전용 코드를 재사용하지 않는다.
공통 Publishing Pipeline을 사용한다.
WordPress 특화 로직은 WordPress App에 위치한다.
실제 Draft ID와 URL을 저장한다.
실패를 성공으로 처리하지 않는다.
41. Feature 3.2 — Sequential Platform Queue
Purpose

여러 플랫폼 발행 요청을 순차적으로 안전하게 실행한다.

Requirements
Target Queue
순차 실행
플랫폼별 Permission Gate
결과 기록
실패 격리
Retry
Cancel
Resume
Rules
하나의 플랫폼 실패가 이미 완료된 결과를 취소하지 않는다.
기본적으로 동시 발행하지 않는다.
각 플랫폼의 결과를 독립적으로 기록한다.
Acceptance Criteria
Queue 순서를 확인할 수 있다.
각 작업 상태를 개별 표시한다.
실패한 작업만 다시 실행할 수 있다.
중복 저장을 방지한다.
42. Epic 4 — Content Repurposing
Status

Planned

Goal

하나의 원본 콘텐츠를 여러 플랫폼과 형식에 맞게 재활용한다.

Supported Sources
Blog Article
YouTube Transcript
YouTube Video Metadata
Shorts Script
Existing ContentDocument
External Approved Source
Supported Outputs
Tistory Article
WordPress Article
Naver Cafe Post
YouTube Long-form Script
YouTube Shorts Script
Shopping Content
Newsletter
Social Summary
Rules
하나의 Canonical Source를 유지한다.
플랫폼별로 독립 최적화한다.
단순 복사로 처리하지 않는다.
원본과 변환본 관계를 저장한다.
Duplicate Detection이 Repurposing을 중복으로 잘못 판단하지 않아야 한다.
43. Epic 5 — Analytics and Learning
Status

Future

Planned Features
Search Console Integration
GA4 Integration
Content Performance
Keyword Performance
Internal Link Performance
Topic Authority
Content Decay Detection
Refresh Recommendation
Performance Feedback Context
Trend Intelligence
Competitor Intelligence

Analytics 데이터는 이후 AI Context 개선에 사용할 수 있으나, 자동 학습 데이터로 무조건 신뢰해서는 안 된다.

44. Epic 6 — Team and Commercial Platform
Status

Future

Planned Features
Team Workspace
Roles and Permissions
Approval Workflow
Shared Brand
Comments
Assignment
Organization Settings
Cloud Sync
Subscription
Usage Limits
Audit Log
Plugin System
Marketplace

Commercial 기능도 기존 Core와 Project Architecture를 재사용해야 한다.

45. Global Non-Functional Requirements
45.1 Maintainability
기능별 책임이 분리되어야 한다.
Core와 Apps 경계를 지켜야 한다.
중복 구현을 피해야 한다.
45.2 Reliability
저장 실패를 성공으로 표시하지 않는다.
외부 플랫폼 결과를 검증한다.
실패 시 기존 데이터를 보존한다.
45.3 Security
Secret 원문을 저장 데이터에 포함하지 않는다.
외부 작업은 Permission Gate를 통과한다.
Workspace 데이터 경계를 보장한다.
45.4 Performance
불필요한 AI 호출을 피한다.
필요한 Context만 AI에 전달한다.
큰 Content Library를 전체 Prompt에 넣지 않는다.
45.5 Accessibility
기술 지식이 없는 사용자도 기본 기능을 사용할 수 있어야 한다.
핵심 동작은 명확한 한국어로 제공한다.
로딩, 성공, 실패 상태를 시각적으로 구분한다.
45.6 Testability
외부 네트워크 없이 Core Unit Test가 가능해야 한다.
Platform Workflow는 의존성을 주입할 수 있어야 한다.
Fixture와 Live 검증을 구분해야 한다.
46. Global Acceptance Criteria

Bright Studio의 제품 Feature는 다음 조건을 만족해야 한다.

모든 콘텐츠가 Project에 속한다.
Workspace가 Platform Connection을 소유한다.
Canonical Content Model을 사용한다.
플랫폼별 변환은 Adapter에서 수행한다.
Project DNA가 AI Workflow에 반영된다.
Generation과 Quality Review AI 호출을 최소화한다.
품질 미승인 상태가 명확히 표시된다.
검증되지 않은 URL을 생성하거나 사용하지 않는다.
Playwright가 승인된 Workflow 외부에서 실행되지 않는다.
Permission Gate를 우회할 수 없다.
Draft Save 결과를 실제로 검증한다.
새 기능이 기존 기능을 손상시키지 않는다.
Personal Edition과 Commercial Edition이 같은 Core를 사용한다.
향후 플랫폼을 Adapter 방식으로 추가할 수 있다.
47. Definition of Done

Feature는 다음 조건을 모두 만족해야 완료로 판단한다.

상세 설계가 승인되었다.
Architecture 책임 위치가 명확하다.
In Scope과 Out of Scope이 정의되었다.
구현이 완료되었다.
Unit Test가 통과한다.
Integration Test가 통과한다.
Regression Test가 통과한다.
사용자 흐름이 검증되었다.
오류와 실패 상태가 검증되었다.
관련 문서가 업데이트되었다.
Git Diff Check가 통과한다.
완료 상태가 실제 검증 결과와 일치한다.
48. Guiding Principle

Bright Studio의 기능은 단순히 많은 도구를 제공하기 위해 만들어지지 않는다.

모든 Feature는 사용자가 전문적인 콘텐츠를 더 쉽게 만들고, 검토하고, 여러 플랫폼에서 지속적으로 운영할 수 있도록 해야 한다.

새 기능은 다음 질문을 통과해야 한다.

사용자에게 실제 가치가 있는가?
모든 플랫폼에서 재사용할 수 있는가?
Core에 속하는가, App에 속하는가?
유지보수 비용을 줄이는가?
AI 호출을 추가하지 않고 해결할 수 있는가?
기존 Workflow를 더 단순하게 만드는가?
