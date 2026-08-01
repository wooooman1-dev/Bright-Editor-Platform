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

Planning은 검색 의도, 독자 문제, 핵심 질문, 필수 정보 요소, 판단 기준, 필요한 예시, 주의사항과 예외, 실행 가능한 다음 행동, 비교·표·체크리스트 필요성 및 범위 경계를 하나의 호출에서 정의한다. Generation은 이 정보 계약을 충분히 설명한 뒤 종료하고, 같은 품질이면 더 간결한 결과를 선호하며, 분량 확보를 위한 반복·장황함·임의 URL을 만들지 않는다.

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
- Scheduled Publishing
- Existing Post Update
- Existing Post Delete
- 자동 Plugin 설치 또는 수정
- Theme 수정
- SEO Plugin 전용 Metadata
- 여러 플랫폼 동시 실행
- 자동 Retry
- 업로드 Media 자동 삭제


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
