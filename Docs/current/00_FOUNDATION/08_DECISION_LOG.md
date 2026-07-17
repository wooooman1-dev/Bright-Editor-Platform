# Bright Studio Decision Log

> Single Source of Truth
>
> 이 문서는 Bright Studio의 승인된 최종 결정만 기록한다.
> 회의 과정, 임시 아이디어, 미승인 제안은 기록하지 않는다.
>
> 결정 우선순위:
>
> ```text
> Decision Log
> ↓
> AGENTS.md
> ↓
> Product Documents
> ↓
> Architecture Documents
> ↓
> Design Documents
> ↓
> Development Documents
> ↓
> Repository Implementation
> ```
>
> 하위 문서나 구현이 이 문서와 충돌하면 이 문서의 결정을 우선한다.
> 결정을 변경해야 할 경우 먼저 이 문서를 수정하고 관련 문서와 구현을 정렬한다.

---

# D-001 Platform First

Status: Accepted

Bright Studio Core는 특정 플랫폼에 종속되지 않도록 개발한다.

플랫폼별 기능은 Platform Adapter를 통해 제공한다.

초기 및 향후 지원 대상은 다음을 포함한다.

- Tistory
- WordPress
- YouTube
- Naver Cafe
- Blog
- Shopping
- 향후 추가 플랫폼

공통 비즈니스 로직은 Core에 속한다.

플랫폼별 Renderer, 연결, 카테고리 조회, 발행 Workflow 및 자동화 구현은 각 Platform App 또는 Adapter에 속한다.

---

# D-002 Workspace Is the Primary Product Surface

Status: Accepted

사용자가 실제로 가장 많은 작업을 수행하는 공간은 Home이나 Dashboard가 아니라 Workspace이다.

Workspace는 다음 작업의 중심이 된다.

- Project 관리
- Content 생성
- Editing
- Quality Review
- Publishing Preparation
- Platform Connection 관리
- Workspace Settings
- 작업 재개

Home은 진입과 상태 안내를 담당하며 Workspace의 기능을 복제하지 않는다.

---

# D-003 Continue Working Is the Primary Resume Action

Status: Accepted

진행 중인 Project 또는 Content가 존재할 경우 `Continue Working`을 기본 재진입 동작으로 제공한다.

사용자가 미완료 작업을 다시 찾기 위해 여러 화면을 탐색하도록 만들지 않는다.

활성 작업이 없을 때는 허위 또는 비활성 작업을 표시하지 않는다.

---

# D-004 Content Quality Above Quantity

Status: Accepted

Bright Studio의 핵심 가치는 일반 AI 채팅보다 더 많은 콘텐츠를 생성하는 것이 아니라 더 높은 품질의 콘텐츠를 완성하는 데 있다.

시스템은 다음보다 품질을 우선한다.

- 생성량
- 생성 속도
- 불필요한 자동화
- 기능 수
- 사용자에게 보이는 점수 자체

원시 AI 생성 결과는 완성된 콘텐츠로 취급하지 않는다.

---

# D-005 Personal Edition and Commercial Edition

Status: Accepted

Bright Studio는 개인용 제품을 먼저 완성한다.

Personal Edition은 다음을 제공할 수 있다.

- 상세 품질 점수
- 품질 Dimension
- 진단 정보
- 고급 설정
- 전문가용 제어
- 개발 및 검증 정보

Commercial Edition은 다음을 우선한다.

- 단순한 기본 경험
- 최소한의 선택
- 안내 중심 Workflow
- 복잡한 진단 정보의 기본 비노출
- 결과 중심 UX

두 Edition은 동일한 Core와 제품 구조를 사용하며, 기본 노출 수준과 사용 경험을 분리한다.

---

# D-006 Workspace, Optional Brand, and Project-First Ownership

Status: Accepted

Workspace와 Brand는 동일한 개념이 아니다.

소유 구조는 다음과 같다.

```text
Workspace
├── Project
└── Brand
    └── Project

규칙:

Workspace는 사용자의 독립적인 작업 공간이다.
Brand는 선택 항목이다.
Brand 없이 Project를 생성할 수 있다.
Project Name은 필수이다.
Brand Name은 선택이다.
입력한 Brand가 현재 Workspace에 존재하면 기존 Brand를 재사용한다.
존재하지 않으면 새 Brand를 생성할 수 있다.
모든 Project는 하나의 Workspace에 속한다.
Project는 하나의 Brand에 선택적으로 속할 수 있다.
모든 Content는 하나의 Project에 속한다.
Content가 Workspace나 Brand에 직접 소유되어서는 안 된다.

기본 생성 흐름에서 Brand 생성을 필수 단계로 만들지 않는다.

D-007 Workspace Owns Platform Connections

Status: Accepted

Publishing Account 또는 PlatformConnection은 Workspace가 소유한다.

Project는 연결 정보를 복제하지 않고 PlatformConnection의 식별자만 참조한다.

하나의 Workspace에는 동일 플랫폼의 여러 계정을 연결할 수 있다.

예:

Workspace
├── Tistory Account A
├── Tistory Account B
├── WordPress Site A
└── WordPress Site B

Credential, Cookie, Session, API Key 등의 원문은 Project나 브라우저 상태에 저장하지 않는다.

D-008 Platform Connections Location and Timing

Status: Accepted

Platform Connections는 일반 Workspace 콘텐츠 생성 화면이 아니라 Workspace Settings에서 관리한다.

사용자는 최초 설정 또는 필요 시 Settings에서 플랫폼 계정을 연결한다.

Content 생성 도중에는 이미 설정된 연결을 다시 요구하지 않는다.

Content 및 Project는 연결된 Publishing Account를 참조한다.

D-009 SecretStore and Connection Job Boundary

Status: Accepted

민감정보는 서버 전용 SecretStore 뒤에 보관한다.

저장 가능한 클라이언트 데이터에는 Secret 원문이 아니라 secretReference만 포함한다.

로컬 환경의 headed login 또는 연결 확인 작업은 서버 측 Local Connection Job Runner를 통해 실행한다.

플랫폼별 로그인, 연결 검증, 세션 복원 및 자동화 구현은 해당 Platform App에 속한다.

Settings, UI, AI 또는 일반 Core 모듈이 SecretStore나 Playwright를 직접 호출해서는 안 된다.

D-010 Enabled Platforms

Status: Accepted

Workspace Settings에서 사용할 플랫폼을 먼저 선택한다.

지원 가능한 전체 플랫폼 중 사용자가 활성화한 플랫폼만 다음 영역에 표시한다.

Settings Overview
Platform Connections
Project
Content Creation
Publishing Preparation

플랫폼 활성화 상태와 Publishing Account 연결 상태는 서로 다른 상태이다.

플랫폼을 비활성화해도 기존 Credential 또는 Publishing Account를 자동 삭제하지 않는다.

AI의 Platform Recommendation은 해당 Workspace에서 활성화된 플랫폼 범위 안에서만 수행한다.

D-011 Enabled Platforms Onboarding

Status: Accepted

Workspace에 Enabled Platforms 설정이 없으면 일반 Workspace 화면보다 먼저 플랫폼 선택 화면으로 유도한다.

사용자가 직접 선택하기 전에는 임의의 플랫폼을 자동 활성화하지 않는다.

플랫폼 선택 후 연결 설정으로 이동할 수 있지만 연결은 건너뛸 수 있다.

연결 전에도 다음 기능은 사용할 수 있다.

AI Planning
Content Generation
Editor
Local Quality Review

다음 기능은 연결 및 실행 환경의 준비 상태에 따라 제한한다.

Platform Preview
Category Read
Media Upload
External Draft Save
Scheduling
Public Publishing
D-012 Natural Language Content Creation

Status: Accepted

Content 생성은 카테고리 또는 세부 설정 선택으로 시작하지 않는다.

사용자는 자연어로 만들고 싶은 콘텐츠를 설명한다.

예:

50대를 위한 혈당 관리 글을 만들고 싶어

AI는 입력과 Project 설정을 바탕으로 다음을 분석하거나 추천한다.

Domain
Search Intent
Keyword
Audience
Goal
Content Type
Platform

사용자는 추천 결과를 확인하고 필요한 항목만 수정하거나 승인한다.

D-013 Domain Recommendation

Status: Accepted

Domain은 기본 생성 흐름에서 사용자가 먼저 선택하지 않는다.

AI가 자연어 입력과 Project 설정을 바탕으로 Domain을 추천한다.

사용자는 AI 추천을 수정할 수 있다.

Project에 명시적인 기본 Domain 또는 Content Strategy가 존재하면 AI는 이를 우선 Context로 사용한다.

D-014 AI Editorial Workflow

Status: Accepted

AI는 단순한 Writer로 동작하지 않는다.

하나의 Generation Workflow에서 다음 책임을 통합한다.

Search Intent Analysis
Reader Analysis
Content Planning
Writing
SEO
Image Strategy
Internal Link Strategy
CTA Strategy
Ad Strategy
Editing

Generation 이후 별도의 Quality Review Workflow를 한 번 실행한다.

기본 비용 정책은 다음과 같다.

AI Generation: 1 major call
Quality Review: 1 major call

추가 AI 호출은 명확한 제품 또는 품질상의 근거가 있을 때만 허용한다.

D-015 Automatic Quality Review

Status: Accepted

Generation 이후 시스템은 자동으로 Quality Review를 수행한다.

기본 Workflow에서 사용자가 최초 검토를 위해 Run Quality Review 버튼을 눌러야 하는 구조로 만들지 않는다.

사용자는 필요할 때 다음 동작을 수행할 수 있다.

다시 검토
AI 수정 요청
직접 수정
세부 진단 확인
D-016 Quality Goal

Status: Accepted

품질 목표는 다음과 같다.

SEO: 95 이상
Search Intent: 95 이상
Readability: 95 이상
HTML Quality: 95 이상
Overall: 95 이상

목표 미달 시 시스템은 다음 중 하나를 수행한다.

자동 개선
재검토
해결할 수 없는 문제 명시
반드시 필요한 사용자 정보 요청

점수만 높이기 위한 형식적 수정은 허용하지 않는다.

D-017 Quality Engine

Status: Accepted

Quality Engine은 단순 체크리스트가 아니다.

Quality Engine은 실제 콘텐츠 품질을 다차원으로 평가한다.

평가 범위는 다음을 포함한다.

SEO
Search Intent
Readability
Structure
Content Sufficiency
HTML Quality
Image Strategy
Internal Links
CTA
Metadata
Platform Readiness
Validation Errors
Duplicate or Unnecessary Content

저장된 Legacy Quality 데이터가 최신 Dimension을 포함하지 않는 경우 호환 보정을 수행한다.

D-018 User Edit Invalidates Quality Approval

Status: Accepted

사용자가 제목, 본문, 구조 또는 품질에 영향을 주는 콘텐츠 요소를 수정하면 기존 Quality 승인은 무효화된다.

수정된 콘텐츠는 재검토 대상이 된다.

단순 UI 상태 변경이나 품질과 무관한 메타데이터 변경까지 불필요하게 Quality를 무효화해서는 안 된다.

D-019 Publishing Safety Defaults

Status: Accepted

기본 발행 정책은 다음과 같다.

Review First: Enabled
Draft Only: Enabled
Public Publish: Disabled
Sequential Draft Save: Enabled
Quality Approval Required: Enabled

Public Publish, 기존 외부 콘텐츠 수정, 외부 콘텐츠 삭제 및 계정 설정 변경은 초기 기본 권한에서 비활성화한다.

D-020 Permission-Gated Platform Automation

Status: Accepted

모든 외부 플랫폼 작업은 Permission Gate와 Allowlisted Workflow를 통해서만 실행한다.

권한은 Workspace가 소유한 각 PlatformConnection 단위로 관리한다.

AI와 일반 Core 모듈은 다음을 직접 제어하지 않는다.

Playwright
Platform API
Browser Selector
External URL
Cookie
Session
Browser Action

외부 작업 경계는 다음과 같다.

AI or User
→ Publishing Command
→ Server-side Permission Gate
→ Publishing Service
→ Platform Adapter
→ Registered Workflow
→ External Platform

UI에서 버튼이 보이거나 활성화되어 있다는 사실은 권한 승인을 의미하지 않는다.

모든 권한은 서버에서 다시 검증한다.

D-021 Safe Draft Mode Permissions

Status: Accepted

새 Publishing Account의 기본 권한은 Safe Draft Mode를 따른다.

초기 기본값:

Connection Verification: Enabled
External Draft Creation: Enabled
Platform Category Read/Select: Enabled when supported
Media Upload: Disabled
Scheduling: Disabled
Public Publishing: Disabled
Existing External Content Modification: Disabled
External Content Deletion: Disabled
Account Setting Changes: Disabled

새로운 외부 Workflow를 추가할 때는 반드시 대응하는 Permission을 선언해야 한다.

D-022 Sequential Publishing Queue

Status: Accepted

여러 Publishing Account 또는 여러 플랫폼이 선택된 경우 기본 실행 방식은 동시 실행이 아니라 순차 Queue이다.

순차 실행은 다음을 가능하게 해야 한다.

계정별 결과 확인
실패 지점 식별
일부 성공 및 일부 실패 상태 기록
재시도
중복 발행 방지
Audit 기록

한 대상의 실패가 이미 성공한 대상의 결과를 자동 취소해서는 안 된다.

D-023 Playwright Isolation

Status: Accepted

Playwright는 Infrastructure이며 Business Logic을 포함하지 않는다.

Playwright Workflow는 승인된 고정 작업만 실행한다.

호출 경로는 다음을 따른다.

Permission Gate
→ Publishing Service
→ Platform Adapter
→ Registered Workflow
→ Playwright

금지 사항:

AI의 Playwright 직접 호출
UI의 Playwright 직접 호출
Settings API의 Playwright 직접 호출
Core에서 Selector 또는 Platform URL 관리
임의 브라우저 명령 실행
등록되지 않은 Workflow 실행
D-024 Tistory Category Selection

Status: Accepted

Tistory Category는 Content 생성 전에 선택하지 않는다.

발행 준비 단계에서 연결된 Tistory 계정의 실제 Category를 조회한다.

사용자는 실제 Category 목록에서 발행 대상을 선택한다.

Project에 기본 Tistory Category가 저장되어 있으면 유효성을 확인한 뒤 기본 선택으로 사용할 수 있다.

D-025 Settings Operational State

Status: Accepted

Settings는 Workspace 단위의 실제 운영 설정 화면이다.

Settings Overview 상태는 Fixture가 아니라 다음 실제 상태를 기준으로 계산한다.

Persistence
AI Provider Configuration
Platform Connection Verification
Browser Capability
Automation Worker
Stored Session
Permission Configuration

Developer 환경에서 Fixture를 사용할 경우 Fixture임을 명확하게 표시한다.

Credential, Cookie, Session 및 API Key 원문은 Workspace 밖이나 브라우저로 전달하지 않는다.

D-026 Review First

Status: Accepted

외부 작업 전에 사용자는 다음을 확인할 수 있어야 한다.

Preview
Content
Quality Result
Publishing Account
Platform Category
External Action Type

사용자는 다음을 수행할 수 있다.

직접 수정
AI 수정 요청
Quality Review 재실행
외부 작업 취소
허용된 작업 승인

AI 생성 완료가 외부 실행 승인을 의미하지 않는다.

D-027 Audit and Verification

Status: Accepted

외부 Workflow 실행은 검증 가능한 기록을 남겨야 한다.

기록 범위는 다음을 포함한다.

Workspace
Project
Content
PlatformConnection
Workflow
Required Permission
Requested Action
Execution Result
Error
Timestamp

Permission과 Workflow 테스트를 통과하기 전에는 실제 외부 플랫폼 검증을 완료한 것으로 간주하지 않는다.

D-028 UX Philosophy

Status: Accepted

사용자는 가능한 한 적은 결정을 반복한다.

AI와 시스템은 설정, Project Strategy 및 기존 정보를 활용해 가능한 한 많은 판단을 수행한다.

사용자는 다음에 집중한다.

Intent
Recommendation Confirmation
Content Review
Final Approval
Consequential Action Approval

단순화를 이유로 사용자의 최종 통제권이나 안전 확인을 제거해서는 안 된다.

D-029 Architecture Change Policy

Status: Accepted

승인된 Architecture는 Epic 또는 Sprint 구현 편의를 위해 임의로 변경하지 않는다.

Architecture 변경이 필요한 경우 순서는 다음과 같다.

현재 Repository와 관련 문서 확인
변경 필요성 및 영향 범위 분석
Decision Log 수정 또는 새 Decision 추가
Product 및 Architecture 문서 정렬
Design 및 Development 문서 정렬
사용자 승인
구현
테스트와 검증
문서 상태 갱신

구현이 Architecture 결정을 선행해서는 안 된다.


---

# 통합 결과

이 완성본은 다음 문제를 해결합니다.

- `06_DECISION_LOG.md`의 고유 결정 보존
- `08_DECISION_LOG.md`의 최신 결정 보존
- 중복된 `D-016` 번호 해결
- 뒤바뀐 `D-015`, `D-016` 순서 해결
- Workspace·Brand·Project 구조 보존
- Personal/Commercial 정책 보존
- Permission Gate 세부 정책 보존
- Safe Draft Mode 보존
- Sequential Publishing Queue 보존
- SecretStore 및 Connection Job Runner 경계 보존
- 최신 Enabled Platforms 및 Onboarding 정책 보존
- Decision Log를 하나의 명확한 Source of Truth로 통합

따라서 적용 후에는 **`06_DECISION_LOG.md`를 삭제하고 `08_DECISION_LOG.md`만 유지**하면 됩니다.