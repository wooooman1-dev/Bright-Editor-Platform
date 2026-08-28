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

D-030 Atomic Content Opportunity

Status: Accepted

AI 자동 주제 선정의 확인 단위는 대표 키워드 문자열이 아니라 하나의 Content Opportunity다.

Opportunity는 선정 주제, 대표·보조 키워드, 검색 의도, 대상 독자, 독자 문제, 콘텐츠 방향, 예상 범위, 추천 근거와 근거 출처를 함께 소유한다. 후보 필드를 서로 섞지 않으며 사용자가 확정한 전체 snapshot을 Content에 version과 deterministic fingerprint로 저장한다.

자동 선정 모드는 프로젝트 전략과 기존 콘텐츠 공백 안에서 기회를 고른다. 사용자 지정 모드는 명시된 주제를 다른 검색 의도로 바꾸지 않는다. 검증된 외부 검색 데이터가 없으면 검색량이나 경쟁도 수치를 만들지 않고 AI 추정 또는 콘텐츠 공백 추론임을 표시한다.

Generation과 Quality Review는 저장된 동일 Opportunity를 사용한다. AI 결과는 주제·검색 의도·목차·본문 정합성을 통과한 뒤에만 SEO 제목 보정을 적용한다. 다른 주제의 원고에 대표 키워드를 접두어로 붙여 통과시키지 않으며 정합성 실패는 Quality 및 Publishing Gate를 차단한다.

이 계약은 기존 Generation 1회와 Quality Review 1회의 기본 비용 정책 안에서 수행하며 별도의 의미 검증 AI 호출을 추가하지 않는다.

D-031 Durable Content Planning Workflow

Status: Accepted

`오늘의 글 작성`과 사용자 지정 작성의 Planning은 후보 확정 전이라도 Workspace와 Project에 속한 임시 Content ID를 먼저 확보한다. 분석 요청, 선택 모드, 진행 단계, 후보 전체, 선택 ID, 오류와 재시도 단계는 이 Content에 revision과 operation ID가 있는 직렬화 가능한 workflow snapshot으로 저장한다.

서버 persistence가 canonical source이며 화면 state는 그 projection이다. 화면 이동, 동일 Content 재진입, 새로고침, React 재마운트는 workflow를 초기화하거나 AI 요청을 다시 실행하는 이유가 아니다. 새 글, 취소, 삭제, 명시적 재분석만 새 operation을 시작하거나 기존 Planning을 초기화할 수 있다.

늦게 도착한 이전 operation 응답과 같거나 오래된 revision 저장은 최신 workflow를 변경할 수 없다. 후보는 Content 안에서 Project binding과 fingerprint가 검증된 전체 Content Opportunity 단위로 저장·선택하며, 확정 후 Generation과 Quality Review는 D-030의 canonical Opportunity 계약을 그대로 따른다.

D-032 Workspace Data Sources and Evidence-Classified Opportunities

Status: Accepted

외부 시장·성과 연결인 `DataSourceConnection`은 Publishing용 `PlatformConnection`과 다른 Workspace 소유 리소스다. Project는 같은 Workspace의 Data Source만 식별자로 참조하며 credential, OAuth token, client secret 원문을 소유하지 않는다. 비밀 원문은 D-009의 서버 전용 SecretStore에 저장하고 일반 metadata에는 `secretReference`만 둔다.

공식 Provider API는 Content 생성 시 직접 호출하지 않는다. 수동 동기화는 Provider Adapter를 통해 원본 snapshot을 별도 저장한 뒤 공통 Evidence로 정규화한다. 마지막 성공 snapshot은 이후 동기화 실패와 연결 해제에도 보존하며, connection·Workspace·operation·version 경계를 검증해 중복 호출과 늦은 응답을 차단한다. Google Ads Keyword Planning과 Google Trends는 공식 권한이 확인된 경우에만 활성화하며 scraping, pytrends, 검색 결과 브라우저 자동화와 production mock market data를 사용하지 않는다.

AI는 Evidence를 생성·수정하거나 Provider·metric·Evidence ID를 발명할 수 없다. 서버가 저장된 Evidence 조회, 후보 연결, Workspace 검증, freshness·limitation 계산과 추천 유형 판정을 수행한다. AI는 기존 Planning 1회 안에서 제공된 읽기 전용 Evidence bundle을 참고해 사람에게 읽기 쉬운 기획만 작성한다.

각 Content Opportunity는 서버가 다음 중 정확히 하나로 판정한다.

- `comprehensive`: fresh 또는 aging 상태의 검증된 외부 시장·실제 성과 Evidence와 내부 성장 Evidence가 모두 있고 중복·Project 적합성·검색 의도·안전성 gate를 통과
- `marketOpportunity`: 검증된 외부 Evidence가 있고 내부 성장 근거가 종합 추천에 충분하지 않으며 동일 gate를 통과
- `blogGrowth`: 외부 시장성이 확인되지 않았지만 content gap, verified public internal-link 또는 cluster Evidence가 있고 동일 gate를 통과

Content Opportunity의 자동 선택 순서는 편집 가치 우선이다. 서버는 기존 Planning 계약의 reader problem, concrete search task, coverage, decision criteria, exceptions, actions, Project alignment/exclusions와 기존 공개 Content 중복을 사용해 `사용자 도움 가치 → 사실적 방어 가능성 → 검색 의도 해결 → 기존 Content 대비 추가 가치`를 먼저 결정론적으로 평가한다. 검증된 시장 Evidence, 경쟁도, 희소성, trend와 recommendation type은 이 편집 가치 gate를 통과한 후보 사이에서만 후순위 정렬 근거가 된다. 검색량 또는 희소성만 있고 구체적인 독자 문제가 없는 후보, Project excluded topic, 근거 없는 보장·확정 표현, 구체적인 search task가 없는 후보는 자동 추천하지 않는다. 이 평가는 새로운 Provider 호출이나 저장 모델 migration을 만들지 않으며 기존 VERIFY/CRITICAL Evidence 정책을 변경하지 않는다.

editorial inference만으로 종합 추천이나 시장 기회 추천을 만들지 않는다. stale 외부 Evidence만으로 강한 종합 추천을 만들지 않는다. Evidence가 부족한 유형과 후보 수를 억지로 채우지 않으며 설명할 수 있는 근거가 없으면 전체 1순위 또는 시장 점수를 표시하지 않는다.

추천 유형, Evidence ID·요약, 시장/내부 상태, freshness, limitation과 classification version은 Opportunity fingerprint에 포함한다. 후보 선택과 확정은 이 필드를 주제·키워드·검색 의도와 함께 원자적으로 교체·저장·복원한다. Quality Review는 동일 canonical Opportunity를 사용해 근거 없는 검색량·CPC·시장 순위, stale 최신성 주장, 광고 경쟁도와 SEO 난이도 혼동, CPC/RPM 수익 예측을 차단한다.

D-033 Data Source Disable, Disconnect, and Safe Deletion

Status: Accepted

Data Source 비활성화, 연결 해제, 삭제는 서로 다른 동작이다. 비활성화는 Connection과 credential을 유지하고 동기화만 중지한다. 연결 해제는 credential을 제거하되 Connection, Project reference, Snapshot과 Evidence를 유지해 재연결을 허용한다. 데이터 소스 삭제는 명시적 위험 작업으로 Connection과 같은 Workspace의 모든 Project reference를 제거하고 credential, pending OAuth state와 active sync operation을 정리한다.

삭제는 backup-first로 수행하고 삭제 tombstone, 모든 관련 Project reference 제거와 Connection metadata 제거를 하나의 원자적 persistence write로 완료한다. SecretStore 삭제가 실패하면 Connection metadata 제거를 진행하지 않는다. 외부 token revoke 실패는 로컬 정리를 막지 않는다. 진행 중 sync는 삭제 전에 superseded 처리하며 tombstone 이후 늦은 결과가 Snapshot, Evidence 또는 Connection을 다시 저장할 수 없다.

Raw Snapshot, Snapshot metadata, normalized Evidence, 확정된 Content Opportunity의 evidenceIds, Quality Review, ContentDocument와 History는 삭제하지 않는다. tombstone은 provider, 표시 이름, resource와 보존 수량을 비밀정보 없이 기록한다. 삭제된 Connection의 Evidence는 과거 콘텐츠 근거 조회에는 남지만 Project reference와 현재 Connection이 없으므로 신규 Opportunity Planning에는 사용하지 않는다.

D-034 Integrated Sprint 6 Presentation and Tistory Scheduling

Status: Accepted

기존 Sprint 6과 Sprint 6.5의 설계 범위는 `Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling`이라는 하나의 통합 Sprint로 관리한다. Sprint 6.5 번호는 별도 개발 단계로 사용하지 않는다.

통합 Sprint 구현의 Gate 0은 실제 Tistory 계정에서 Draft Save를 실행하고 Draft를 다시 열어 제목, 의미 있는 본문 구조, Category와 비공개 상태를 확인하는 전체 End-to-End 검증이다. 저장 버튼 클릭, 부분 검증 또는 자동 테스트만으로 Gate 0을 통과한 것으로 간주하지 않는다. Gate 0 통과 전에는 통합 Sprint의 Presentation Runtime 또는 Scheduling 구현을 시작하지 않는다.

Workstream A는 Canonical `ContentDocument`에서 deterministic Presentation Resolver, allowlisted Bright Components와 theme-independent semantic HTML을 생성한다. 불변 `RenderArtifact`와 checksum을 저장하고 `PreviewApproval`을 해당 Artifact에 결합한다. Preview와 Tistory Draft는 승인된 동일 Artifact를 사용하며, Draft 재진입 후에는 Tistory가 정규화한 결과의 의미 구조가 일치하는지 검증한다. Presentation Contract Foundation은 구현되었지만 Presentation Runtime은 구현되지 않았다.

Canonical Content의 `longFormStructure.sectionType`과 정규화된 paragraph/list/table block binding은 reader-visible section presentation의 공통 semantic source로 사용할 수 있다. 결정론적 Core projection은 checklist, warning, summary처럼 실제 정보 성격이 명확하고 필요한 구조가 존재할 때만 allowlisted Bright card intent를 만들며, explanation·steps·comparison·table은 의미에 맞는 native semantic HTML을 우선한다. 이 projection은 ContentDocument, factual surfaceText, Claim/Evidence binding 또는 persisted schema를 변경하지 않는다. WordPress와 Tistory renderer는 같은 projection을 각 플랫폼 HTML로 매핑하고, 짧은 label column은 최소 폭·단어 단위 줄바꿈·모바일 horizontal overflow 경계를 적용한다. 전체 RenderArtifact/PreviewApproval Runtime의 나머지 범위는 계속 미구현 상태다.

Workstream B는 `ScheduledPublication`과 `ScheduleJob`을 정의하고 Tistory 자체 예약 기능을 우선 사용한다. 시간대는 `Asia/Seoul`로 고정하며 예약 대상 Content Revision, PlatformConnection Account와 Category를 고정한다. 로컬 Scheduler가 공개 시각까지 대기하거나 자체적으로 공개 작업을 실행하지 않는다.

예약 안전 정책은 다음과 같다.

- `schedule.publish`: 기본 Disabled
- `public.publish`: 기본 Disabled
- Draft Only: Enabled
- Quality Approval과 현재 Content Revision 일치 필수
- 예약 등록, 예약 시간 수정과 예약 취소마다 사용자 명시 승인 필수
- 예약 후 Revision, Account 또는 Category 변경 금지
- Revision, Account 또는 Category 변경 시 기존 예약을 안전하게 취소한 뒤 새 예약 생성
- 예약 시간만 기존 고정 대상을 유지한 채 안전하게 수정 가능
- 예약 취소는 외부 글 삭제가 아님
- Tistory에서 예약 취소 후 Draft 보존이 검증된 경우에만 자동 취소
- 취소 과정에 글 삭제가 필요하면 별도 Delete Permission 승인 전 자동 실행 금지
- 활성 예약의 중복 생성 금지
- 성공한 ScheduleJob 재시도 금지, 실패한 ScheduleJob만 동일 idempotency 경계에서 재시도
- 앱 재시작 후 예약과 Job 상태 복원

로컬 Scheduler, 반복 예약, 다중 플랫폼 예약, AI의 임의 예약 시간 결정과 자동 즉시 공개 발행은 통합 Sprint 범위에서 제외한다. 실제 Tistory 예약 등록·수정·취소와 외부 상태가 검증되기 전에는 Sprint 전체를 `Completed` 또는 `Verified`로 표시하지 않는다.

D-035 Information Sufficiency Over Content Length

Status: Accepted

Bright Studio는 콘텐츠의 최소·선호·최대 글자 수를 Planning 목표, Generation 지시, Quality 점수, Gate 또는 승인 조건으로 사용하지 않는다. 실제 문자 수와 토큰 사용량은 비용·진단 telemetry로 측정할 수 있지만 품질 판정에는 영향을 주지 않는다.

신규 Planning의 `contentDepth`는 `standard`, `deep`, `comparison`만 사용한다. `standard`는 핵심 문제의 직접 해결, `deep`은 복잡한 관계·여러 판단 기준·사례·예외·주의사항·다음 행동, `comparison`은 비교 기준·차이·장단점·상황별 선택 조건을 의미한다. 이 분류는 글자 수 유형이 아니다. 기존 `quick`과 길이 목표가 저장된 데이터는 읽기 호환을 유지하되 `quick`은 standard 정보 정책으로 해석하며 신규 결과로 만들지 않는다.

Planning은 검색 의도, 독자 문제, 핵심 질문, 필수 정보 요소, 판단 기준, 필요한 예시, 주의사항과 예외, 실행 가능한 다음 행동, 비교·표·체크리스트 필요성 및 범위 경계를 하나의 호출에서 정의한다. Generation은 이 정보 계약을 충분히 설명한 뒤 종료하고, 분량 확보를 위한 반복·장황함·임의 URL을 만들지 않는다.

### 2026-08-11 개정: 간결성 선호 문구 제거, 권장 분량 도입

이 결정의 "같은 품질이면 더 간결한 결과를 선호하며" 항목을 제거한다. 원래 취지는 **짧다는 이유로 실패시키지 않는다**는 것이었으나, 구현은 Generation 지시에 `Prefer the shorter result when quality is equal`을 넣어 **적극적으로 짧게 쓰도록 지시**하고 있었다. 취지와 반대 방향의 과잉 구현이다.

밝은재테크 Project 실측이 근거다. 발행된 글의 순수 산문 분량이 870자에서 2,304자까지 2.6배로 널뛰었고 어떤 것도 이를 통제하지 않았다. 2026-08-11 생성분은 1,455자에 4행짜리 표 두 개로, 섹션 완결 판정은 전부 통과했다. `informationElementCount`가 표 한 개를 섹션 최소치만큼 쳐 주기 때문에 표가 설명을 대체할 수 있었다.

대신 Generation 지시에 **권장 분량 4,500~6,000자**(공백·표·목록 제외)를 둔다. 이는 게이트가 아니다. 미달을 이유로 차단하지 않고 품질 점수에도 반영하지 않으며, 계약이 실제로 소진되었다면 미달이 실패가 아님을 지시문에 함께 적는다. 최소·선호·최대 글자 수를 Gate 또는 승인 조건으로 쓰지 않는다는 이 결정의 핵심은 그대로 유지된다.

같은 날, 표나 목록을 담은 섹션은 산문으로도 그 섹션을 설명해야 한다는 규칙을 추가했다(`CONTENT_SECTION_PROSE_INSUFFICIENT`). 이는 글 전체 분량이 아니라 한 섹션이 구조물로 설명을 대신하는 것을 막는 규칙이다.

Quality Engine은 필수 정보 요소를 `missing`, `mentioned`, `sufficient`로 구분하고 `sufficient`만 충족으로 인정한다. 검색 의도, 독자 문제 해결, 섹션 역할 완결성, 정보 밀도, 정확성과 안전성, 판단 기준, 예시, 예외, 다음 행동, 반복과 장황함을 평가한다. 짧다는 이유만으로 실패시키지 않으며 길어도 필수 정보가 부족하거나 반복되면 실패한다. Generation 1회와 Quality Review 1회, standard 승인만 ready인 정책은 유지한다.

Provider 응답과 구조화 형식이 유효해 canonical `ContentDocument`를 만들 수 있다면, Generation 또는 Quality Review의 품질 기준을 충족하지 못해도 문서와 진단을 보존하고 Content를 `in_review`로 둔다. 사용자는 Editor에서 이 문서를 수정하고 다시 Quality Review를 실행할 수 있다. Provider 오류나 구조화 형식 오류처럼 canonical 문서를 만들 수 없는 기술 실패는 문서가 없는 실패로 구분한다. 품질 미달 문서는 `ready` 또는 발행 가능 상태가 아니며, `approved === true && approvalType === "standard"` 조건은 변경하지 않는다.

# D-036 WordPress Draft Publishing MVP

Status: Accepted

WordPress Draft MVP는 WordPress Core REST API를 사용하는 `server_api` 방식이다. WordPress 외부 실행에 Playwright를 사용하지 않는다.

실행 경계는 다음과 같다.

```text
UI
→ Application Service
→ Publishing Service
→ Permission Gate
→ WordPress Adapter
→ WordPress REST API
→ External Re-read Verification
→ Persistence and Audit
→ Completion UI
```

안전 정책은 다음과 같다.

- Review First: ON
- Draft Only: ON
- Public Publish: OFF
- Quality Approval과 현재 Content Revision 일치 필수
- 사용자의 최종 확인 필수
- WordPress Application Password 원문은 SecretStore에만 저장
- UI, Content, Project, Audit, Error와 Log에 Application Password 또는 Authorization Header 저장 금지

Category 결정은 다음과 같다.

- WordPress Category ID는 사이트·Connection별 외부 식별자이므로 코드에 하드코딩하지 않는다.
- 승인 준비에 필요한 Category 이름은 Core 승인 프로필에 단일 정책값으로 둔다.
- WordPress의 실제 Category 목록을 PlatformConnection별로 동적 조회한다.
- 데이터 구조와 REST Payload는 처음부터 복수 Category를 지원한다.
- 현재 AdSense 승인 준비 정책에서는 `생활재테크` Category 하나만 사용한다.
- 앞뒤 공백 제거와 안전한 Unicode 정규화 후 `생활재테크`와 정확히 일치할 때만 정책을 통과한다. `생활경제`를 포함한 유사 이름은 자동 매칭하지 않는다.
- 향후 Category가 추가되면 코드 변경 없이 실제 목록에서 선택할 수 있어야 한다.
- 저장된 Category ID는 Draft 실행 직전에 실제 조회 결과로 재검증한다.
- Category가 삭제되거나 사용할 수 없으면 Readiness를 차단하고 재선택을 요구한다.
- 임의의 Category나 `미분류`로 자동 대체하지 않는다.
- 같은 Workspace라도 WordPress 사이트별 Category 목록과 기본 Category를 독립 관리한다.
- Category 이름이 변경되고 ID가 유지되면 최신 이름으로 동기화할 수 있다.

사이트 정체성과 승인 프로필 표현은 다음과 같이 분리한다.

- 사이트명과 브랜드명은 `밝은재테크`다.
- 콘텐츠 분야는 `생활경제`이며 생활금융, 정부지원, 세금과 주거 정보를 포함할 수 있다.
- WordPress 발행 Category 이름은 `생활재테크`다.
- 내부 호환 식별자 `wordpress_life_economy_v1`은 기존 Project와 Content 복원을 위해 유지하되 사용자 표시명이나 AI Prompt에 노출하지 않는다.
- 사용자 표시용 프로필명은 `WordPress · 밝은재테크`다.
- 브랜드명, 콘텐츠 분야, 발행 Category와 내부 프로필 식별자를 하나의 문자열 의미로 공유하지 않는다.

Category 선택과 기본값 적용 우선순위는 다음과 같다.

1. Content에서 직접 선택한 Category
2. Project `defaultWordPressCategories`
3. `WordPressConnectionProfile.defaultCategoryIds`
4. 유효한 Category가 없으면 Readiness 차단

모든 기본 Category ID는 실제 WordPress 목록으로 재검증한다. 유효하지 않은 값을 `미분류`로 자동 대체하지 않는다.

Media 결정은 다음과 같다.

- WordPress Media Upload Capability는 MVP에서 Supported다.
- D-021 Safe Draft Mode에 따라 `media.upload` Permission 기본값은 계속 Disabled다.
- 로컬 이미지가 있는 Draft만 `media.upload` Permission을 요구한다.
- 사용자가 해당 WordPress Connection에서 `media.upload`를 명시적으로 허용해야 실행한다.
- 이미지가 없는 글은 `media.upload` Permission 없이 Draft Create가 가능하다.
- Media Upload는 Renderer 책임이 아니라 WordPress Media Adapter 책임이다.
- 업로드된 Media ID와 WordPress URL로 본문 이미지를 변환한다.
- ALT를 저장하고 외부 Media 재조회로 확인한다.
- 목적성 대표 이미지가 있는 경우 해당 Media ID를 `featured_media`로 지정한다.
- Featured Image도 외부 Post 재조회로 확인한다.
- Post 생성 실패 후 이미 업로드된 Media를 자동 삭제하지 않는다.
- 이 경우 `cleanup_required` 또는 동등한 안전 상태와 Audit을 남긴다.

Tag 결정은 다음과 같다.

- 기술 구조는 향후 Tag 확장이 가능해야 한다.
- 현재 AdSense 승인 준비 단계에서는 Tag를 보내지 않는다.
- WordPress에 존재하는 Tag를 자동 생성하거나 추측하지 않는다.

Idempotency Key는 최소한 다음을 포함한다.

```text
workspaceId
projectId
contentId
current revision 또는 content version
platformConnectionId
draft.create
```

Idempotency 결정은 다음과 같다.

- 동일 Key의 `verified` 결과는 새 Draft를 만들지 않고 기존 결과를 반환한다.
- 외부 ID를 받은 상태에서는 새 Draft 생성 전 기존 외부 Post를 먼저 재검증한다.
- 결과가 `unknown`이면 자동으로 새 Draft를 생성하지 않는다.
- 실패한 요청의 재시도는 사용자 명시 동작으로만 수행한다.
- Revision이 변경되면 새로운 논리적 Key를 사용한다.

`POST /posts` 응답만으로 완료 처리하지 않는다. 생성된 External Post ID를 다시 조회하고 최소한 다음을 검증한다.

- External Post ID
- `status=draft`
- title 일치
- 의미 있는 본문 존재
- 선택한 Category ID 적용
- Tag 미사용 정책
- 필요한 Media 존재
- ALT 적용
- 필요한 Featured Image ID 적용

WordPress HTML 정규화 가능성을 고려해 원문 문자열 완전 일치만 요구하지 않는다.

MVP에서 다음은 제외한다.

- Public Publish
- Scheduled Publishing (`D-038`에서 해제)
- Existing Post Update (`D-046`에서 해제)
- Existing Post Delete
- 자동 Plugin 설치 또는 수정
- Theme 수정
- SEO Plugin 전용 Metadata
- 여러 플랫폼 동시 실행
- 자동 Retry
- 업로드 Media 자동 삭제


---

# D-037 Claim-context Source Authority

Status: Accepted

Source Authority는 고정 정부 도메인 여부와 동일한 개념으로 판정하지 않고 Claim의 실제 정보 소유자 또는 권위 주체를 기준으로 판정한다. 법률·세금·정부지원·금융 규제 Claim은 국가법령정보센터, 실제 담당 정부·공공기관, 국세청, 금융위원회·금융감독원 등 해당 공적 권위 주체를 사용하며 기존 승인 프로필 allowlist와 공공기관 검증을 유지한다.

특정 은행·카드사·보험사 또는 그 밖의 사업자가 소유한 상품의 금리, 중도해지, 상품조건, 수수료, 보험조건 Claim은 해당 Claim subject와 동일한 source owner의 HTTPS 공식 홈페이지, 상품공시, 상품설명서 또는 약관을 authoritative primary source로 인정할 수 있다. 특정 사업자 이름이나 도메인을 Core에 하드코딩하지 않고 공통 entity/source-owner matching 정책을 사용한다.

Source Authority와 Claim relevance는 독립 Gate로 유지한다. 다른 사업자의 공식 페이지는 owner mismatch로 거부하고, 올바른 사업자의 공식 페이지라도 Claim과 무관하면 relevance로 거부한다. 모든 채택 Evidence는 기존 exact excerpt anchor, semantic·temporal verification과 CRITICAL Claim 100% Coverage를 통과해야 한다. NONE은 Evidence N/A, VERIFY는 실패 시 전체 Generation을 차단하지 않고 같은 Generation Prompt에서 해당 구체 Claim을 제거하거나 일반화하며, CRITICAL에만 mandatory Source Preflight와 Generation Gate를 적용한다. Generation 1회와 Quality Review 1회 정책은 변경하지 않는다.

---

# D-040 Approval Source Trust and Corroboration

Status: Superseded by D-045

Approval source readiness does not require a government, institutional, or
other official domain, and it does not require an information-as-of date or a
reader-visible final-review date. The required source is the URL that the AI
actually used when preparing the manuscript.

The source verifier must still fetch the URL and confirm that the page content
is relevant to the manuscript's material factual claims. A URL or a matching
keyword alone is not sufficient.

- An accessible source whose content materially supports the claim may be
  trusted alone when the source is an accepted official/first-party source.
- A non-official or secondary source may be trusted only when an independent
  second source supports the same material claim.
- `citation`, page access, content match, corroboration, and `system_verified`
  remain separate states.
- Missing information dates and reader-visible review-date labels are
  informational diagnostics, not approval-policy blockers.
- General prose Claims do not all become mandatory blockers. Material factual
  Claims remain subject to content-match checks; high-risk unsupported or
  conflicting Claims may still block quality or approval policy.

This decision replaces the assumption that every approval source must pass an
official-domain allowlist and that every required Claim must have an official
source. The source URL, source-content match, and applicable corroboration
route are the trust conditions.

---

# D-041 Generated Citation URL Preservation

Status: Accepted

When an AI-generated manuscript contains a source URL in its body or metadata,
that URL is an Evidence candidate even when the provider's web-search
diagnostics omit it. The candidate remains an ordinary `citation` until the
shared Fetch and Claim-content matcher verifies it. This prevents an unrelated
diagnostic result from replacing the source the manuscript actually used.

The workflow must merge three source inputs before Evidence verification:
generation preflight sources, provider citation diagnostics, and URLs extracted
from the generated document. URL presence alone never bypasses Fetch,
content-match, or applicable corroboration rules.

---

# D-042 AdSense Approval Content Public Scheduling

Status: Accepted

An `adsense_approval` WordPress Content may use `future` scheduled publishing
when the Workspace explicitly enables `wordpressSchedulePublicPublish`, the
current Revision passes the complete Quality, Approval Readiness, permission,
and platform checks, and the user confirms that specific schedule. The global
`publicPublish` setting remains disabled; immediate public publishing is not
enabled by this decision.

This is a scheduled-public exception after review, not an approval guarantee.
Tistory and other platforms remain governed by their own platform-specific
scheduled publishing contracts.

---

# D-043 Information Date Ownership

Status: Accepted

*이전 제목: Information Date Placement and Source Guidance Separation. 2026-08-19
개정.*

원고는 `정보 기준일`을 쓰지 않는다. 정보 기준일과 공식 재확인 경로는 Bright
Studio가 출처 영역에 직접 렌더링한다.

이전 결정은 AI가 쓴 `정보 기준일`을 본문 끝 `정보 기준과 다시 확인할 곳` 섹션
한 곳으로 모았다. 흩어진 날짜의 자리를 고정한 것이지, 그 섹션이 필요한지를 판단한
것은 아니었다. 2026-08-19 밝은재테크 실측에서 같은 값이 한 화면에 두 번 나왔다.
원고가 쓴 `정보 기준일: 2026-08-19` 문단과, 시스템이 출처 카드 아래에 찍는
`출처 확인일: 2026-08-19 · 정보 기준일: 2026-08-19` 줄이다. 공식 재확인 경로로
이름을 부른 정부24 역시 바로 위 출처 카드에 링크로 이미 있다.

분량도 맞지 않았다. 계약이 요구한 두 문단은 113자인데 생성 계약은 모든 H2에 400자
산문을 요구한다. 그래서 AI가 결론을 두 번 더 반복해 채웠고, 목차 한 줄과 본문 한
섹션이 중복된 내용으로 채워졌다. 제목 `정보 기준과 다시 확인할 곳`은 할 말이 없는
자리에 붙은 탓에 글에 문제가 있어 다시 확인해야 한다는 인상까지 준다.

- 원고는 `정보 기준일`, `출처 확인일`, `최종 검토일` 중 어느 것도 쓰지 않는다.
  세 날짜 모두 시스템 소유다.
- `정보 기준과 다시 확인할 곳` 섹션은 요구하지 않는다.
- 공식 재확인 경로는 시스템이 렌더링하는 출처 목록이 담당한다. 원고가 같은 기관을
  본문 설명에서 자연스럽게 언급하는 것은 막지 않는다. 금지하는 것은 날짜를 쓰는
  일과 별도 안내 섹션을 만드는 일이다.
- 시스템이 출처 영역에 찍는 날짜는 `출처 확인일` 하나다. 원고가 기준일을 쓰지
  않으므로 새 원고에는 `정보 기준일`이 표시되지 않는다. 확인일을 그대로 기준일로
  베껴 쓰지 않는다. 같은 날짜에 이름만 둘을 붙이는 일이라 독자가 얻는 것이 없다.
  이미 본문에 기준일이 적힌 기존 원고는 그 값을 계속 읽어 함께 표시한다.

이 결정은 새 Generation과 Quality Review 결과에 적용한다. 이미 저장된 Draft는 이
결정으로 다시 쓰지 않는다.

---

# D-044 Preserve Existing Manuscripts When Generating a New Content

Status: Accepted

When a Content already has a manuscript, the existing regeneration action keeps
its current replacement behavior and requires explicit confirmation. The
creation flow also exposes a separate action that creates a new Content ID from
the confirmed planning opportunity. That action must preserve the original
Content and route persistence, platform preparation, generation, recovery, and
editor navigation through the new Content ID.

The new Content path is a Content-level copy of the confirmed planning context,
not a document copy. The existing manuscript, review state, and generation
history remain attached to the original Content; generation starts a fresh
manuscript on the new Content.

같은 Content에서 확정 후보를 다른 후보로 바꾸는 경우도 새 원고로 시작한다. 이
경우는 새 Content ID를 만들지 않으므로 위 문단의 범위 밖이었고, 그 틈으로 이전
후보의 제목과 본문이 그대로 남았다. 2026-08-19 밝은재테크 실측: 연말정산 후보를
확정했다가 뒤로 가서 전입신고 후보를 확정하자 Opportunity·대표 키워드·검색 의도는
전입신고로 바뀌고 제목과 본문만 연말정산으로 남아, 생성이 연말정산 주제로 돌았고
주제 이탈·제목 정렬·목차 범위를 포함한 품질 차단 8건이 한 번에 발생했다.

- 확정 후보가 바뀌면 제목, 본문, 저장된 document, 품질 결과, 생성·검토 진단을
  모두 비운다. 이전 후보의 결과물은 새 후보의 원고가 아니다.
- 같은 후보를 다시 확정하는 경우는 지금까지처럼 보존한다. opportunityId는
  fingerprint에서 결정론적으로 파생되므로 두 경우를 값으로 구분할 수 있다.

---

# D-045 Approval Source Scope and Verification Depth

Status: Accepted

이 결정은 `D-040 Approval Source Trust and Corroboration`을 대체한다. D-040은
공식 도메인 요구를 없애고 비공식 출처라도 독립된 두 번째 출처가 같은 주장을
뒷받침하면 신뢰할 수 있게 열었다. 실측 결과 그 경로는 두 가지를 동시에 만들었다.
개인 블로그 두 개가 서로를 뒷받침해 통과할 수 있었고, 반대로 정부 페이지를
근거로 쓴 원고는 페이지 내용 대조에서 계속 막혔다. 2026-08-14 밝은재테크 실측:
승인 대기 원고 12편 중 6편이 `evidence`에서 멈췄고 그 6편의 출처 도메인은 전부
정부·공공기관이었다.

## 인용 가능한 출처의 범위

승인 준비 Content가 인용할 수 있는 출처는 세 등급 중 앞의 둘이다.

- `public_sector` — 정부, 공공기관, 시군구청. 법령·세율·정부 지원처럼 정부가
  소유한 사실의 원문이다.
- `financial_institution` — 은행, 카드사, 증권사. 예금 금리, 중도해지이율,
  연회비, 수수료처럼 그 회사가 소유한 사실의 1차 출처다. D-037의 소유자 대조
  원칙을 도메인 판정에서도 실행한다.
- `unofficial` — 그 밖의 모든 곳. 개인 블로그, 커뮤니티, 비교 사이트, 언론사가
  여기 들어온다.

언론사를 `unofficial`로 두는 것은 신뢰도 판단이 아니라 범위 판단이다. 기사는
발표를 옮긴 2차 자료라 원문이 항상 존재하고, 네이버 제휴 언론사 수백 곳의
목록을 관리하는 비용에 견줄 이득이 없다. 언론사만 답할 수 있는 주장을 다루게
되면 그때 이 결정을 개정한다.

범위는 검증이 아니라 생성에서 강제한다. 승인 준비 생성의 웹 검색은 위 두 등급의
도메인만 결과로 받는다. 찾을 수 없는 곳을 요구하면 생성은 주소를 지어낸다 —
같은 실측에서 국세환급금 원고가 실재하지 않는 `j.nts.go.kr`을 들고 왔고, 국세청
도메인 형태라 도메인 검사는 통과했다.

## 검증의 깊이

출처 검증은 두 가지만 확인한다.

- 도메인이 위 두 등급에 속하는가
- 그 주소가 실제로 열리는가

페이지 내용과 원고 Claim의 일치는 확인하지 않는다. 인용 가능한 곳이 신뢰할 수
있는 기관으로 좁혀져 있으므로 그 페이지에서 왔다는 사실 자체가 근거이고, 값이
한 글자 다르다는 이유로 원고 전체를 막지 않는다. 페이지 존재 확인은 유지한다 —
지어낸 주소를 거르는 유일한 관문이기 때문이다.

비공식 출처의 교차검증 통과 경로는 제거한다. 인용 범위를 좁힌 지금 이 경로는
그 좁힘을 우회하는 문으로만 남는다.

Generation 구조화 Claim의 verbatim anchor 대조는 차단에서 진단으로 내린다. 이
검사는 출처에서 확인한 값과 본문을 대조하는 장치이므로, 내용 대조를 하지 않는
이상 기준값이 없다. 기록은 남긴다.

## 일반 Content와 승인 준비 Content의 분리

일반 Content는 승인 준비 검사를 받지 않으며 출처를 요구하지 않는다. 통과 조건은
원고 품질뿐이다.

Generation 구조화 Claim 게이트는 승인 정책 스냅샷이 있는 Content에서만 실행한다.
이 게이트는 "CRITICAL Claim이 있는가"만 물어 왔기 때문에 일반 Content도 기획에
CRITICAL Claim이 하나 잡히면 들어왔고, 걸리면 점수와 무관하게 승인을 껐다. 품질
100점 일반 원고가 "1년" 한 단어로 막히던 경로가 이것이다.

## 구조 진단의 차단 범위

발행을 막는 구조 조건은 글 전체 산문 분량 하나로 한정한다. 섹션 단위 산문 미달과
약속한 비교의 미실행은 진단과 최종 편집 지시로 전달하되 차단하지 않는다. 5,074자
원고가 한 섹션 10자 부족으로 멈추는 것은 글의 완성도를 가르는 선이 아니다.
AdSense가 거부하는 것은 얕은 글이므로 그 기준만 남긴다.

## 적용 보완 (2026-08-19)

이 결정은 생성 경로에만 적용되어 있었다. 승인 준비와 발행 경로에는 같은 내용
대조가 그대로 남아, 품질 100점으로 승인된 원고가 발행 단계에서 멈췄다. 실측에서
Claim 3건이 모두 `insufficient`였고 사유는 `claim_evidence_excerpt_not_found`,
`claim_value_not_found`, `evidence_anchor_unverified`, `temporal_evidence_missing`
— 전부 페이지 본문과 원고를 대조하는 검사였다.

- Verification Generation Gate는 Claim별 내용 상태로 막지 않는다. 계획·Snapshot
  지문, 미지의 결과, 중복 결과 같은 구조 무결성만 본다.
- Claim에 출처를 연결할 때 supports·normalizedValue·freshness를 요구하지 않는다.
  셋 다 내용 대조의 산물이라, 남겨 두면 어떤 Claim도 출처를 가질 수 없다.
- 원고의 수치가 검증된 Claim 값과 일치하는지 보는 검사는 발행을 막지 않는다.
  값 일치를 만들던 대조가 없으므로 통과할 수 없는 검사가 된다. 개수는 계속
  노출한다. 검토 단계에서 생성된 수치가 바뀌는 것은 계속 막는다.
- 계획된 Claim이 구조화 사실 목록에 연결되지 않았다는 사실은 무결성 위반이
  아니다. 생성이 그 값을 쓰지 않기로 할 수 있다.
- 저장된 binding과 서버 재계산 결과의 불일치는 차단 사유가 아니다. binding은
  Snapshot에서 파생되는 값이고 재계산이 권위다. 파생값을 비교해 막으면 판정
  규칙을 바꿀 때마다 이미 저장된 원고가 전부 발행 불가가 된다.
- Bright Studio가 스스로 쓴 블록은 생성 Claim 검사 대상이 아니다. 출처 목록,
  출처 링크, 출처 확인일·정보 기준일 줄이 여기에 해당한다. 계약이 요구해서
  시스템이 넣은 날짜가 원고가 지어낸 사실로 잡히고 있었다.
- 승인 준비 검사 문구에서 "페이지 내용과 원고 Claim 일치", "교차 확인"을 걷는다.
  하지 않는 검사를 했다고 보고하고 있었다.
- 사람이 편집기에서 고위험 수치를 바꾼 경우는 발행을 막지 않고 경고한다. 어떤
  값이 어느 위치에서 바뀌었는지를 경고 문구에 함께 표시한다. 출처 내용 대조를
  하지 않는 이상 "검증된 값"이라는 기준이 없어 차단은 통과할 수 없는 관문이
  되지만, 값이 바뀐 사실 자체는 사용자가 알아야 한다.
- 생성 직후 사실 검증도 페이지 내용을 대조하지 않는다. 인용문이 페이지 본문에
  그대로 있는지와 페이지가 Claim을 의미상 뒷받침하는지를 보던 두 검사를 걷는다.
  이 두 검사는 통과하지 못한 문장을 문단째 원고에서 삭제하므로, 남겨 두면 내용
  검증이 완성된 글을 깎아내는 마지막 통로가 된다. 2026-08-19 밝은재테크 실측:
  출처가 law.go.kr 조문 페이지이고 인용문까지 저장돼 있던 주택임대차보호법
  제3조의2 우선변제권 문단이 여기서 걸려 사라졌고, 그 결과가 정보 완성도
  85점이었다. 남는 판정은 셋이다 — 생성이 인용한 URL인가, 인용 범위 안의 공식
  도메인인가, 그 주소가 실제로 열리는가.

## 적용 보완 (2026-08-28)

미연결 수치 경고를 저장된 출처 발췌와 대조해 걸러낸다.

이 경고의 허용 목록은 verified Claim 에서만 만들어진다. 내용 대조를 걷어낸 뒤로
verified 가 되는 Claim 이 없으므로 허용 목록은 항상 비고, 본문의 모든 수치가 예외
없이 경고가 된다. 2026-08-28 실측: 근로장려금 원고의 경고 19개가 전부 국세청
발췌에 실재하는 값이었고, 전체 원고의 개선 작업 112개 중 23개가 이 오탐이었다.
숫자가 많은 좋은 원고일수록 경고가 늘어나 목록 전체를 못 믿게 만든다.

- 경고를 내기 전에 문서에 저장된 출처 발췌에서 같은 값을 찾고, 있으면 경고하지
  않는다. 판정이 아니라 경고를 줄이는 필터이며 발행은 여전히 막지 않는다. 비교
  대상은 남의 페이지가 아니라 서버가 이미 가져와 문서에 저장한 발췌다.
- 정부 문서의 축약 날짜를 한국어 전개형으로 펼쳐 함께 비교한다. 국세청 신청기간이
  `’26.5.1.~6.1.` 이고 원고는 `2026년 5월 1일` 로 푼다. 같은 날짜인데 글자가
  겹치지 않아 그대로 비교하면 정상값이 경고로 남는다.
- 발췌가 없으면 걸러내지 않는다. 비교할 근거가 없는 상태이므로 전과 같이 남긴다.
- 경고 문구를 실제 검사와 일치시킨다. "확인된 출처에 연결되지 않은 값" 은 하지
  않는 검사를 말하고 있었다. "가져온 출처 발췌 어디에서도 찾을 수 없는 값" 으로
  바꾼다.

---

# D-046 Existing Post Update

Status: Accepted

이 결정은 `D-036 WordPress Draft Publishing MVP`의 제외 항목 중 `Existing Post
Update`만 해제한다. `Existing Post Delete`, 자동 Plugin 설치·수정, Theme 수정,
여러 플랫폼 동시 실행, 자동 Retry 제외는 그대로 유지한다.

발행 실행 식별자는 원고 리비전을 포함한다. 그래서 원고를 한 문장이라도 고치면
식별자가 바뀌고, 중복 방지 장치는 그것을 처음 보는 발행으로 판단해 새 Post를
만들었다. 2026-08-14 밝은재테크 실측: 원고 한 편이 Post 92, 95, 98, 101 네 개가
되었고, 이미 색인된 98번을 사용자가 직접 휴지통으로 옮겨야 했다. 고칠 때마다
주소가 새로 생기므로 색인도 매번 처음부터 시작한다.

- 갱신 대상은 그 원고가 이미 차지한 Post 하나뿐이다. 다른 Post는 건드리지 않는다.
- 갱신 요청은 `status`를 보내지 않는다. 독자가 이미 볼 수 있는 Post를 임시글로
  되돌리지 않는다. `slug`도 보내지 않으므로 주소가 유지된다.
- 대상 Post가 실제로 존재하는지 확인한 뒤에만 갱신한다. WordPress가 그 Post를
  더는 갖고 있지 않으면 첫 발행이므로 새 Post를 만든다.
- 확인 직후 대상이 사라졌다면 그 실행은 멈춘다. 사용자가 요청하지 않은 Post를
  대신 만들지 않는다.
- 예약 발행은 언제나 새 Post를 만든다. 예약된 공개는 정의상 새 Post다.
- Permission은 `draft.create`를 재사용한다. 만들도록 허용한 Post를 고치는 데
  별도 승인을 다시 받을 이유가 없다. 실행 기록의 workflow는 `draft.update`로
  남겨 무엇이 일어났는지 구분한다.
- 갱신 요청은 재시도해도 안전하다. 같은 본문을 두 번 써도 Post는 하나다.

Review First · Draft Only 정책은 변경하지 않는다. 공개 여부는 계속 사용자가
결정한다.

---

# D-047 Market Evidence Matching and Confidence Separation

Status: Accepted

이 결정은 외부 시장 Evidence를 후보 주제에 붙이는 방법과, 붙지 않았을 때의
표시 방법을 정한다. `D-045`가 정한 승인 출처 범위와는 다른 층이다. 외부 시장
Evidence는 무엇을 쓸지 고르는 기획 단계의 수요 근거이고, 승인 출처는 원고의
사실을 뒷받침하는 인용이다. 둘은 서로를 대체하지 않는다.

2026-08-19 밝은재테크 실측이 근거다. Data Source 연결 4개가 모두 `ready`이고
스냅샷 37건, 외부 Evidence 184건이 전부 `fresh`인데도 그날 제안된 후보
「연금저축 IRP 차이」와 「전입신고 확정일자」는 매칭 Evidence가 0건이었다.
`marketEvidenceStatus`는 `unavailable`, `confidence`는 내부 Evidence 고정값인
0.75만 남았다. 연결도 동기화도 정상이었고, 원인은 매칭 방식이었다.

- 매칭이 부분문자열 비교다. 「연금저축」과 등록 키워드 「적금」은 같은 영역인데
  토큰이 겹치지 않아 0건이 된다.
- NAVER Search Trend는 연결 하나당 키워드 5개가 상한이다. 등록하지 않은
  키워드는 데이터가 생성되지 않는다. 키워드를 늘려 해결하려면 연결을 계속
  쪼개야 하고, 그렇게 해도 커버리지는 등록 수만큼만 늘어난다.
- Google Search Console은 등록 대상이 아니라 사이트에 실제로 유입된 검색어를
  가져온다. 원리상 이미 색인·노출된 주제만 보이므로 신규 주제 발굴에는 쓸 수
  없다. 실측 시점 색인 2건, 쿼리 6개였다.

## 결정

**매칭은 주제군 기반으로 하되 결정론을 유지한다.** 후보의 주제·키워드와
Evidence 키워드를 같은 주제군에 속하는지로 판정한다. 부분문자열 겹침만으로
판정하지 않는다. 이 판정에 AI 호출을 추가하지 않는다. 매칭은 값이 같으면
언제나 같은 결과를 내는 구조적 규칙이어야 한다. 기획 단계 비용을 늘리면서
얻을 정확도가 아니다.

**외부 시장 Evidence가 없다는 사실은 신뢰도 감점이 아니다.** 지금까지는 매칭
Evidence의 평균 신뢰도가 곧 후보 신뢰도였기 때문에, 외부 Evidence가 붙지
않으면 내부 Evidence 고정값만 남아 낮은 숫자가 표시되었다. 낮은 숫자는 주제가
나쁘다는 뜻으로 읽히지만 실제로는 등록 키워드와 겹치지 않았다는 뜻뿐이다.
외부 Evidence 유무는 `marketEvidenceStatus`가 이미 별도로 표현하므로, 신뢰도
숫자는 그 사실을 중복해서 깎지 않는다.

구체적으로 신뢰도는 매칭된 Evidence 전체가 아니라 그중 가장 강한 계층의
평균으로 계산한다. 외부 Evidence가 하나라도 붙으면 외부만, 없으면 내부만
평균한다. 계층을 섞으면 외부 Evidence가 이미 붙은 후보에 내부 Evidence를 더할
때 신뢰도가 내려가는 역전이 생긴다. Evidence가 늘어서 신뢰도가 떨어지는 숫자는
읽는 사람에게 아무 뜻도 전달하지 못한다.

**등록 키워드는 기획에 힌트로만 준다.** 등록 키워드 목록을 기획 단계에 참고
정보로 전달해, 나머지 조건이 같으면 데이터가 있는 주제를 고르도록 유도한다.
주제 범위를 등록 키워드로 제한하지 않는다. 등록 키워드는 사용자가 그때까지
떠올린 것일 뿐이고, 5개 상한 때문에 영역 전체를 대표하지도 못한다. 제한하면
독자 문제 해결이라는 목적보다 데이터 편의가 앞서게 된다.

## 유지하는 것

외부 시장 Evidence 없이 검색량, CPC, 시장 순위, 높은 수요를 주장하지 못하게
막는 검사는 그대로 둔다. 근거 없는 수치 주장을 막는 것은 정확한 가드레일이며,
이 결정이 완화하는 대상이 아니다. `stale` Evidence를 최신 데이터처럼 서술하지
못하게 하는 검사도 유지한다.

## 제외

- 키워드 자동 등록. 사용자가 등록한 resource를 시스템이 대신 바꾸지 않는다.
- 외부 시장 Evidence를 원고의 출처로 사용하는 것. 출처 범위는 `D-045`가 정한
  공식 출처만이다. 검색 트렌드 지표는 인용 출처가 아니다.
- 매칭 판정을 위한 AI 호출.

---

# D-048 Every Article Guarantees One Hero Image

Status: Accepted

원고 한 편에는 대표 이미지 한 장이 항상 붙는다. 생성 응답이 이미지를 주지
않아도 마찬가지다.

2026-08-28 실측이 근거다. 근로장려금 원고(`content-mtcqjahd-oesz46`)는 이미지
블록 0개로 저장됐고, 그 앞의 원고 13편은 전부 `imageCount: 1`이었다. 이미지
블록이 없으면 대표 이미지 생성 화면 자체가 렌더링되지 않아 사용자가 이미지를
만들 방법이 없고, 그 상태로 WordPress 초안 3784까지 발행됐다. 발행 기록은
`featuredImageAssigned: false`인데도 `featured_media` 검증을 통과했다. 이
검사는 블록과 업로드의 일치만 보고 존재 여부를 보지 않기 때문이다.

원인은 두 곳이다. 생성 프롬프트가 "대표 이미지가 꼭 필요하지 않으면 0개를
반환하라"고 명시적으로 허용했고, 그 뒤에 이를 보정하는 코드가 없었다. 또한
`appendPlacementBlocks`는 모델이 준 `afterSection`과 일치하는 배치 지점이
없으면 이미지를 경고 없이 버린다.

- 생성 프롬프트는 대표 이미지 정확히 한 장을 요구한다. 0개 반환은 선택지가
  아니다.
- 모델 응답과 무관하게 코드가 대표 이미지를 보장한다. 파싱 결과에 `hero`
  이미지 블록이 없으면 도입부 뒤에 직접 삽입한다. 제작 프롬프트는 넣지 않고
  `ensureDistinctImagePrompts`가 섹션 맥락으로 채운다.
- 판단 기준은 "이미지가 있는가"가 아니라 "`hero`가 있는가"다. 본문 이미지는
  `applyGeneratedImageCostPolicy`가 걷어내므로, 본문 이미지만 있는 응답을
  통과시키면 결국 0장으로 끝난다.
- `afterSection`은 실제 배치 지점으로 맞춘다. `hero`는 도입부 뒤(0)로 고정하고
  나머지는 존재하는 섹션 범위로 자른다.

유료 이미지 생성 예산은 그대로다. 원고당 대표 이미지 한 장은 이전부터
`automaticAIImageLimit = 1`이 허용하던 범위다.

# D-049 Hero Image Visual Registers

Status: Accepted

대표 이미지는 시각 계열을 골라서 만든다. 최근 원고가 쓴 계열은 다시 쓰지 않는다.

2026-08-28 실측이 근거다. 밝은재테크 대표 이미지 57장의 프롬프트에서 '장면'
75%, '책상' 47%, '자연광' 43%, '계산기' 22%, '스마트폰' 22%. 주제가 서로 다른
근로장려금 원고와 국민연금 임의계속가입 원고의 결과물이 중년 인물, 원목 식탁,
계산기, 스프링 노트, 스마트폰, 서류, 화분, 창 자연광까지 거의 같은 사진이었다.

원인은 세 곳이다.

- `PURPOSE_POLICIES.hero`와 변주 목록(FOCUS/BACKGROUND/COMPOSITION/VIEWPOINT)이
  전부 "사람이 도구로 행동하는 장면" 한 갈래였다. 사람이 없는 선택지가 목록에
  아예 없었다. 프롬프트 57개 중 20개가 이 템플릿에서 나왔다.
- 나머지 37개는 모델이 직접 썼는데 생성 프롬프트에 시각 지침이 없었다. Project
  전략의 `imageStrategy`는 ALT placeholder 규칙이라 그림 지침이 아니다.
- 중복 검사(`analyzeImagePrompts`, 임계 0.72)가 한 문서 안에서만 돈다. 원고마다
  이미지가 1장이므로 이 검사는 한 번도 발동한 적이 없다. 대표 이미지를 원고
  사이에서 비교한 장치가 없었다.

결정:

- 대표 이미지 시각 계열을 다섯 개로 나눈다. 상황 사진, 사물 정물, 평면 개념
  그래픽, 관계 도식, 장소·환경. 사람이 등장하는 계열은 그중 하나뿐이다.
- 같은 Project 의 최근 대표 이미지 프롬프트 8개를 생성 입력으로 넘긴다
  (`GenerationInput.recentHeroImagePrompts`). 최근 5개 안에 쓰인 계열은 고르지
  않고, 남은 후보 중에서 원고별로 결정적으로 회전한다.
- 생성 프롬프트에도 계열 목록과 최근에 쓴 계열을 알려준다. 코드가 프롬프트를
  다시 쓰는 경로만으로는 모델이 쓴 프롬프트를 못 고치기 때문이다.
- 모델이 쓴 대표 이미지 프롬프트가 최근과 같은 계열이면 `hero_register_repeated`
  로 잡아 다른 계열로 다시 쓴다. 발행은 막지 않는다.
- 이미지 안에 읽을 수 있는 글자나 숫자를 그리지 않는다. 2026-08-28 근로장려금
  대표 이미지는 "화면 글자는 보이지 않게"라고 썼는데도 '가족관계', '신청 자격
  확인 순서' 같은 한글이 그려져 나왔다. AI가 그린 글자는 틀릴 수 있고 대표
  이미지는 틀린 수치를 실을 수 없다.

이 결정은 이미 발행된 이미지를 바꾸지 않는다. 다시 만드는 것은 장당 유료
호출이므로 별도 판단이다.

# D-038 WordPress Scheduled Publishing

Status: Accepted

이 결정은 `D-036 WordPress Draft Publishing MVP`의 제외 항목 중 `Scheduled Publishing`만 해제한다. `D-036`의 나머지 제외 항목인 Existing Post Delete, 자동 Plugin 설치·수정, Theme 수정, 여러 플랫폼 동시 실행, 자동 Retry는 그대로 유지한다. `Existing Post Update`는 이후 `D-046`이 해제했다. `D-034`가 Tistory 전용으로 승인한 예약 계약을 WordPress로 확장하되 Tistory 구현을 복제하지 않는다.

WordPress는 Tistory와 달리 공식 REST API가 예약을 지원하므로 브라우저 자동화 Worker를 사용하지 않는다. `POST /wp-json/wp/v2/posts`에 `status`와 `date_gmt`를 전달하는 방식만 사용한다.

예약 상태는 두 가지를 지원한다.

- `draft` 예약: 글을 초안으로 유지하고 예약 시각만 플랫폼에 기록한다. 실제 공개는 사용자가 별도로 승인해야 한다. Review First · Draft Only 정책과 충돌하지 않으므로 기본값이다.
- `future` 예약: `status=future`와 `date_gmt`로 등록하여 지정 시각에 자동 공개된다. 공개 발행에 해당하므로 기본 Disabled이다.

`future` 예약은 Workspace Setting `wordpressSchedulePublicPublish`가 명시적으로 Enabled일 때만 실행할 수 있다. 이 설정의 기본값은 `false`이며, Workspace의 `publicPublish` 불변식은 변경하지 않는다. 즉시 공개 발행은 계속 금지한다. `adsense_approval` Content도 현재 Revision의 품질·승인준비·권한 검사를 통과한 경우에 한해 이 예약 공개 경로를 사용할 수 있다.

예약 안전 정책은 `D-034`와 동일하게 적용한다.

- `schedule.create` Permission 필수, 예약마다 사용자 명시 최종 확인 필수
- 활성 예약의 중복 생성 금지
- 예약 후 Revision, Account 또는 Category 변경 금지
- 성공한 예약의 자동 재시도 금지
- 로컬 Scheduler가 공개 시각까지 대기하거나 자체적으로 공개 작업을 실행하지 않음

`POST /posts` 응답만으로 완료 처리하지 않는다. 생성된 External Post ID를 다시 조회하여 `D-036`의 Draft 검증 항목에 더해 요청한 `status`와 `date_gmt`가 실제로 적용되었는지 검증한다. 검증하지 못한 예약은 `scheduled_unverified`로 보존하고 자동 재시도하지 않는다.

AdSense 승인 준비 단계의 Content에도 `future` 예약을 적용할 수 있다. 단, `wordpressSchedulePublicPublish` 명시적 허용, 현재 Revision의 전체 예약 준비 검사 통과, 예약별 사용자 최종 확인을 모두 요구한다. 승인 준비 통과 자체가 AdSense 승인을 보장하지는 않는다.

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
