# 13. Content Intelligence

Version: 2.0
Status: Approved
Sprint: Sprint 7
Owner: Core Platform
Implementation Status: Not Implemented

---

# 1. Purpose

Content Intelligence는 Bright Studio의 플랫폼 독립적인 지식 및 추천 계층이다.

Bright Studio는 매번 독립적으로 콘텐츠를 생성하는 AI Writer가 아니다.

프로젝트 전략, 콘텐츠 이력, 발행 결과, 검색 의도, 키워드, 품질 결과와 콘텐츠 간 관계를 축적하여 다음 콘텐츠 생성에 재사용하는 AI Content Operating System이다.

Content Intelligence는 다음을 책임진다.

- Project DNA 조회
- Content Library 관리
- Published Content Registry 관리
- Search Intent Memory 관리
- Keyword Memory 관리
- Topic Memory 관리
- Quality History 연결
- 관련 콘텐츠 추천
- 내부 링크 추천
- 중복 콘텐츠 감지
- AI Generation용 Context 구성

Content Intelligence는 콘텐츠를 직접 생성하거나 발행하지 않는다.

AI Generation은 AI Engine이 담당하며, 외부 플랫폼 발행과 검증은 Publishing Engine 및 Platform Adapter가 담당한다.

---

# 2. Goals

Sprint 7의 목표는 다음과 같다.

- Project DNA를 모든 콘텐츠 생성 Context에 적용
- Project 단위 Content Library 구축
- 검증된 발행 콘텐츠만 관리하는 Published Content Registry 구축
- Search Intent Memory 구축
- Keyword Memory 구축
- Topic Memory 구축
- Related Content Recommendation 구축
- Internal Link Intelligence 구축
- Duplicate Content Detection 구축
- AI Context Builder 구축
- Quality History 연결
- 발행 결과의 안전한 등록 및 재검증 지원
- 플랫폼 독립적인 Repository 및 Service 계약 정의

Sprint 7은 콘텐츠 생성량을 늘리는 기능이 아니다.

기존 지식과 검증된 콘텐츠를 재사용하여 콘텐츠 품질, 일관성, 내부 연결성과 운영 효율을 높이는 기반을 구축한다.

---

# 3. Design Principles

## 3.1 Project-Owned Intelligence

Content Intelligence 데이터는 Project 문맥에 속한다.

Workspace는 Project와 Platform Connection을 소유하지만, 콘텐츠 전략과 콘텐츠 지식은 Project별로 분리한다.

다른 Project의 데이터를 기본 Context로 자동 혼합하지 않는다.

향후 Workspace 간 공유 기능이 추가되더라도 명시적인 공유 정책과 권한을 통해서만 수행한다.

## 3.2 Knowledge Is Preserved

사용자의 콘텐츠 지식은 물리적으로 즉시 삭제하지 않는다.

일반 삭제 동작은 기본적으로 Archive 상태로 전환한다.

다만 다음 데이터는 보안, 개인정보, 법적 요구 또는 명시적 영구 삭제 요청에 따라 제거할 수 있다.

- Secret
- Credential
- 개인 식별 정보
- 사용자가 영구 삭제를 승인한 데이터
- 보존 기한이 만료된 운영 데이터

Archive 데이터는 기본 추천 및 AI Context 대상에서 제외한다.

## 3.3 Verified Data First

내부 링크와 관련 콘텐츠 추천은 검증된 Published Content를 우선 사용한다.

URL 문자열이 존재한다는 사실만으로 Published 또는 Verified로 간주하지 않는다.

발행 성공 결과와 외부 플랫폼 검증 결과가 모두 확인되어야 한다.

## 3.4 AI Uses Curated Memory

AI는 Repository나 Database를 직접 조회하지 않는다.

AI에 전달되는 정보는 AI Context Builder가 선택하고 정규화한 Context로 제한한다.

모든 저장 데이터를 프롬프트에 넣지 않는다.

## 3.5 Recommendation Before Manual Search

시스템은 가능한 경우 다음 항목을 자동 추천한다.

- 관련 콘텐츠
- 내부 링크
- 다음 콘텐츠 주제
- Search Intent
- Keyword
- Topic Cluster
- 콘텐츠 중복 경고

사용자는 추천 결과를 검토하고 수정하거나 제외할 수 있다.

추천은 강제 적용이 아니다.

## 3.6 Platform Independent

Content Intelligence는 특정 플랫폼의 HTML, Category 구조, URL 형식 또는 Editor DOM을 알지 못한다.

다음 플랫폼이 동일한 Intelligence 기능을 재사용할 수 있어야 한다.

- Tistory
- WordPress
- YouTube
- Naver Cafe
- Blog
- Shopping
- Future Platforms

플랫폼별 발행 Metadata와 검증 결과는 Platform Adapter가 공통 형식으로 변환하여 전달한다.

## 3.7 Explainable Recommendation

추천 결과는 최소한 다음 정보를 포함해야 한다.

- 추천 대상
- 추천 점수
- 추천 이유
- 사용된 신호
- 제외 또는 감점 사유
- 검증 상태

점수만 반환하고 이유를 제공하지 않는 추천은 허용하지 않는다.

## 3.8 Cost Efficient

Content Intelligence는 AI 호출을 불필요하게 증가시키지 않는다.

가능한 작업은 결정론적 로직으로 수행한다.

- 상태 필터링
- 검증 상태 확인
- Keyword 중복 확인
- URL 존재 여부 확인
- 기본 점수 계산
- 제외 규칙 적용

AI는 의미적 관계 판단이 필요한 경우에만 제한적으로 활용한다.

기본 정책은 다음을 유지한다.

```text
AI Generation: 1 major call
Quality Review: 1 major call

4. Core Components

Sprint 7은 다음 Core Component로 구성된다.

ProjectDNAService
ContentLibraryService
PublishedRegistryService
ContentMetadataService
KeywordMemoryService
SearchIntentMemoryService
TopicMemoryService
QualityHistoryService
RelatedContentService
InternalLinkService
DuplicateDetectionService
AIContextBuilder
ContentIntelligenceFacade
4.1 ContentIntelligenceFacade

외부 Application Service와 AI Workflow는 개별 Repository를 직접 조합하지 않는다.

ContentIntelligenceFacade 또는 동일한 책임의 Application Service를 통해 필요한 Intelligence 기능을 요청한다.

예:

AI Workflow
→ ContentIntelligenceFacade
→ Domain Services
→ Repositories
→ Storage
4.2 Service Responsibility

Service는 다음을 담당한다.

Use Case 실행
Business Rule 적용
여러 Repository 결과 조합
Recommendation 계산
상태 전이 검증
Idempotency 처리
오류 분류
Audit 정보 생성
4.3 Repository Responsibility

Repository는 다음만 담당한다.

저장
조회
수정
Archive
조건 검색
중복 Key 확인
Transaction 경계 지원

Repository는 추천 점수 계산, AI Context 구성 또는 발행 검증 판단을 소유하지 않는다.

5. Layer Architecture

Content Intelligence의 의존성 방향은 다음과 같다.

UI / API / AI Workflow
        ↓
Application Service
        ↓
ContentIntelligenceFacade
        ↓
Domain Services
        ↓
Repository Interfaces
        ↓
Repository Implementations
        ↓
Storage

AI Context 생성 흐름은 다음과 같다.

AI Workflow
    ↓
AI Context Builder
    ↓
Content Intelligence Facade
    ├── Project DNA Service
    ├── Content Library Service
    ├── Published Registry Service
    ├── Keyword Memory Service
    ├── Search Intent Memory Service
    ├── Topic Memory Service
    ├── Related Content Service
    ├── Internal Link Service
    ├── Duplicate Detection Service
    └── Quality History Service
            ↓
       Repository Interfaces
            ↓
          Storage

금지되는 의존성은 다음과 같다.

AI Provider → Repository
UI Component → Database
Platform Adapter → Content Intelligence Storage
Repository → AI Provider
Content Intelligence → Playwright
Content Intelligence → Platform DOM

Platform Adapter는 발행 또는 검증 결과를 Publishing Service에 반환한다.

Publishing Service는 공통 결과를 Content Intelligence Service에 전달한다.

6. Project DNA

Project DNA는 Project의 장기 콘텐츠 전략을 저장한다.

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

AI는 콘텐츠 생성 전에 Project DNA를 참조해야 한다.

Project DNA가 없거나 일부 항목이 비어 있어도 콘텐츠 생성을 완전히 차단하지 않는다.

비어 있는 항목은 다음 우선순위로 보완한다.

Explicit User Input
→ Project DNA
→ AI Recommendation
→ Platform Default
→ System Default

Project DNA의 Canonical Model, Validation, Versioning과 상세 Repository 계약은 09_PROJECT_DNA.md를 따른다.

7. Content Library

Content Library는 Project에서 생성된 모든 Content의 운영 Index다.

Content Library는 ContentDocument 자체를 중복 저장하는 별도 원본 저장소가 아니다.

ContentDocument의 Canonical Source는 기존 Content Repository가 유지한다.

Content Library는 콘텐츠 검색, 상태 관리, Intelligence 분석과 추천에 필요한 Metadata Projection을 제공한다.

7.1 Ownership

모든 Content Library Entry는 하나의 Project에 속한다.

Workspace
└── Project
    └── Content Library
        └── Content Library Entry

Content Library Entry가 Workspace 또는 Brand에 직접 속해서는 안 된다.

7.2 Content Status

지원 상태는 다음과 같다.

planning
draft
editing
quality_review
ready
draft_saved
scheduled
published
failed
archived

상태 이름은 UI Label과 분리할 수 있지만 Domain 상태는 하나의 Canonical Enum을 사용해야 한다.

7.3 State Transition

기본 상태 전이는 다음과 같다.

planning
→ draft
→ editing
→ quality_review
→ ready
→ draft_saved
→ scheduled
→ published

예외 전이:

any active state → failed
any non-deleted state → archived
failed → previous recoverable state
archived → restored previous state

published 상태는 Published Registry의 Verified 상태와 동일하지 않을 수 있다.

Content Library의 published는 발행 Workflow가 성공 결과를 받은 상태를 의미한다.

내부 링크 사용 가능 여부는 Published Registry의 Verification 상태를 기준으로 판단한다.

7.4 Content Library Entry
type ContentLifecycleStatus =
  | "planning"
  | "draft"
  | "editing"
  | "quality_review"
  | "ready"
  | "draft_saved"
  | "scheduled"
  | "published"
  | "failed"
  | "archived";

interface ContentLibraryEntry {
  id: string;
  workspaceId: string;
  projectId: string;
  contentId: string;

  title: string;
  summary?: string;

  contentType?: string;
  domain?: string;
  category?: string;

  topics: string[];
  keywords: KeywordReference[];
  searchIntent?: SearchIntentReference;
  audience?: string[];

  lifecycleStatus: ContentLifecycleStatus;

  latestQualityReportId?: string;
  latestQualityScore?: number;

  platformTargets: PlatformTargetReference[];
  publishedRecordIds: string[];

  createdAt: string;
  updatedAt: string;
  archivedAt?: string;

  version: number;
}
7.5 Content Library Rules
contentId는 Project 안에서 하나의 Library Entry와만 연결된다.
Library Entry는 Canonical ContentDocument를 대체하지 않는다.
ContentDocument 변경 시 관련 Metadata Projection을 갱신할 수 있다.
Quality Review가 갱신되면 최신 Quality Reference를 반영한다.
Archive Entry는 기본 추천, 중복 검사와 AI Context에서 제외한다.
Failed Entry는 중복 검사에는 사용할 수 있지만 내부 링크 추천에는 사용할 수 없다.
Library Entry 생성과 Content 생성은 가능한 한 동일 Transaction 또는 복구 가능한 Workflow로 처리한다.
8. Published Content Registry

Published Content Registry는 외부 플랫폼에서 실제 발행이 확인된 콘텐츠 기록을 관리한다.

Content Library는 모든 콘텐츠를 관리하지만 Published Registry는 검증된 외부 발행 결과만 관리한다.

8.1 Published Registry and Publishing History

Publishing History는 발행 시도와 실행 결과를 기록한다.

Published Registry는 검증이 완료된 발행 결과의 현재 유효 상태를 관리한다.

Publishing History
- 요청
- 실행
- 성공
- 실패
- 재시도
- 오류
- 시간

Published Registry
- 검증된 URL
- 플랫폼
- 계정
- 콘텐츠 연결
- 현재 유효 상태

발행에 실패한 시도는 Publishing History에는 남지만 Published Registry에는 등록하지 않는다.

8.2 Verification Status
type PublicationVerificationStatus =
  | "pending"
  | "verified"
  | "failed"
  | "stale"
  | "removed";

상태 의미:

pending: 발행 성공 결과를 받았지만 외부 검증 전
verified: 외부 플랫폼에서 콘텐츠 존재와 식별 정보 확인 완료
failed: 검증 실패
stale: 이전에는 검증됐지만 최신 재검증이 필요함
removed: 외부 플랫폼에서 삭제 또는 접근 불가가 확인됨

내부 링크와 관련 콘텐츠 추천에는 기본적으로 verified만 사용한다.

8.3 Published Content Record
interface PublishedContentRecord {
  id: string;

  workspaceId: string;
  projectId: string;
  contentId: string;
  contentLibraryEntryId: string;

  platform: string;
  platformConnectionId: string;

  externalContentId?: string;
  canonicalUrl: string;

  title: string;
  summary?: string;
  category?: string;

  topics: string[];
  keywords: KeywordReference[];
  searchIntent?: SearchIntentReference;
  audience?: string[];

  publishedAt?: string;
  verifiedAt?: string;
  lastCheckedAt?: string;

  verificationStatus: PublicationVerificationStatus;
  verificationMethod?: string;

  publishingHistoryId: string;

  contentVersion: number;
  recordVersion: number;

  createdAt: string;
  updatedAt: string;
}
8.4 Registration Rule

Published Registry 등록 흐름은 다음과 같다.

Publishing Workflow Success
→ Publishing History 저장
→ Published Record pending 생성 또는 갱신
→ Platform Verification 실행
→ Verification 성공
→ verified 전환
→ Recommendation 대상 포함

Draft Save는 Published Registry에 verified published content로 등록하지 않는다.

예약 상태도 실제 공개 발행 검증 전에는 verified로 처리하지 않는다.

8.5 Idempotency

동일한 외부 콘텐츠가 중복 등록되지 않도록 Idempotency Key를 사용한다.

권장 Key 구성:

platform
+ platformConnectionId
+ externalContentId

externalContentId가 제공되지 않는 플랫폼에서는 검증된 Canonical URL을 보조 Key로 사용할 수 있다.

동일 Key에 대한 재시도는 새 Record를 생성하지 않고 기존 Record를 갱신한다.

8.6 URL Safety

다음 규칙을 적용한다.

AI가 URL을 임의로 생성해서는 안 된다.
사용자 입력 URL도 검증 없이 내부 링크 후보로 사용하지 않는다.
Canonical URL은 Platform Verification 결과에서 수신한다.
javascript:, data: 및 지원하지 않는 Scheme은 저장하지 않는다.
외부 URL 형식과 허용 Domain은 Platform Adapter 결과를 기반으로 검증한다.
removed, failed, stale Record는 기본 내부 링크 후보에서 제외한다.
9. Search Intent Memory

Search Intent Memory는 Project가 이미 다룬 검색 의도와 향후 다룰 의도를 관리한다.

단순 문자열 목록이 아니라 콘텐츠, 주제, 키워드와 연결된 기록이다.

9.1 Search Intent Type

기본 Intent 예:

Informational
How-to
Problem Solving
Comparison
Commercial Investigation
Transactional
Review
Navigational
Inspirational
Educational

도메인별 세부 Intent를 확장할 수 있다.

9.2 Search Intent Record
interface SearchIntentRecord {
  id: string;
  projectId: string;

  intentType: string;
  normalizedIntent: string;
  description?: string;

  topicIds: string[];
  keywordIds: string[];
  contentIds: string[];

  fulfillmentStatus:
    | "planned"
    | "drafted"
    | "published"
    | "verified"
    | "archived";

  confidence: number;

  firstUsedAt?: string;
  lastUsedAt?: string;
  useCount: number;

  createdAt: string;
  updatedAt: string;
}
9.3 Search Intent Rules
새로운 콘텐츠가 기존 Intent와 같다는 이유만으로 자동 차단하지 않는다.
Topic, Audience, Content Role과 문제 해결 범위가 다르면 별도 콘텐츠가 가능하다.
동일 Intent와 동일 Topic이 반복되고 독자 가치 차이가 부족하면 중복 경고를 생성한다.
Verified Published Content와 연결된 Intent는 높은 신뢰도로 취급한다.
Archive된 콘텐츠만 연결된 Intent는 기본 충족 상태로 간주하지 않을 수 있다.
10. Keyword Memory

Keyword Memory는 Project에서 사용하거나 계획한 Keyword를 관리한다.

10.1 Keyword Type
type KeywordRole =
  | "primary"
  | "secondary"
  | "long_tail"
  | "supporting"
  | "excluded";
10.2 Keyword Record
interface KeywordRecord {
  id: string;
  projectId: string;

  normalizedKeyword: string;
  displayKeyword: string;

  role: KeywordRole;

  topicIds: string[];
  contentIds: string[];

  usageStatus:
    | "planned"
    | "drafted"
    | "published"
    | "verified"
    | "archived";

  firstUsedAt?: string;
  lastUsedAt?: string;
  useCount: number;

  isExcluded: boolean;
  exclusionReason?: string;

  createdAt: string;
  updatedAt: string;
}
10.3 Keyword Rules
대소문자, 공백과 불필요한 기호를 정규화한다.
원문 표시값은 별도로 보존할 수 있다.
Excluded Keyword는 AI Context에 금지 또는 회피 항목으로 전달한다.
동일 Keyword 사용만으로 중복 콘텐츠로 판단하지 않는다.
Search Intent, Topic, Audience와 Content Role을 함께 평가한다.
Keyword Memory는 검색량 데이터의 Source of Truth가 아니다.
외부 검색량이나 Ranking 데이터는 향후 별도 Intelligence Provider를 통해 연결한다.
11. Related Content Engine

Related Content Engine은 독자에게 다음으로 도움이 될 콘텐츠를 추천한다.

단순 Keyword Similarity만으로 순위를 결정하지 않는다.

11.1 Candidate Eligibility

기본 후보 조건:

같은 Project에 속함
Published Registry 상태가 verified
현재 콘텐츠와 동일 Record가 아님
Archive 또는 Removed 상태가 아님
URL 검증 완료
사용자 또는 Project 정책에 의해 제외되지 않음

Project 정책이 허용하는 경우 향후 다른 Project의 콘텐츠를 추천할 수 있지만, 기본 범위는 동일 Project이다.

11.2 Ranking Signals

추천 점수는 다음 신호를 조합할 수 있다.

Reader Next Need
Search Intent Relationship
Topic Relationship
Audience Match
Content Role Complementarity
Funnel or Journey Sequence
Series Relationship
Keyword Relationship
Quality Score
Publication Freshness
Existing Link Saturation
Duplicate Risk
Verification Confidence
11.3 Recommendation Result
interface RelatedContentRecommendation {
  publishedContentRecordId: string;
  contentId: string;

  score: number;
  confidence: number;

  reasons: string[];
  matchedSignals: string[];
  penalties: string[];

  recommendedPlacement:
    | "body"
    | "after_section"
    | "related_content_block"
    | "cta_support";

  verifiedUrl: string;
}
11.4 Ranking Policy

초기 구현은 결정론적 가중치 기반으로 시작할 수 있다.

점수 예시:

Reader Next Need             25
Search Intent Relationship   20
Topic Relationship           15
Audience Match               10
Content Role Fit             10
Quality                       8
Freshness                     5
Series Relationship           5
Verification Confidence       2
Total                        100

정확한 가중치는 구현 및 실제 검증을 통해 조정할 수 있다.

가중치 변경은 Recommendation Contract를 깨뜨리지 않아야 한다.

12. Internal Link Intelligence

Internal Link Intelligence는 현재 콘텐츠 안에 삽입할 검증된 내부 링크 후보를 추천한다.

12.1 Link Eligibility

내부 링크 후보는 다음 조건을 모두 만족해야 한다.

Published Registry 상태가 verified
Canonical URL 존재
현재 콘텐츠와 다른 외부 발행 Record
Project의 내부 링크 정책에 부합
중복 링크 정책을 위반하지 않음
Anchor 의미와 대상 콘텐츠가 일치
독자에게 실질적인 다음 정보를 제공
12.2 Link Recommendation Result
interface InternalLinkRecommendation {
  id: string;

  sourceContentId: string;
  targetPublishedRecordId: string;

  targetUrl: string;
  targetTitle: string;

  suggestedAnchorText: string;
  suggestedBlockId?: string;
  suggestedPosition?: "before" | "after" | "inside";

  score: number;
  confidence: number;

  reasons: string[];
  warnings: string[];

  targetBehavior: "_self";
}

내부 링크의 기본 target은 _self다.

외부 수익화 또는 제휴 링크 정책과 혼합하지 않는다.

12.3 Placement Rules
동일 URL을 과도하게 반복하지 않는다.
같은 문단에 여러 내부 링크를 집중시키지 않는다.
독자의 흐름을 끊는 위치를 피한다.
CTA와 내부 링크의 역할을 혼합하지 않는다.
본문 중간 추천과 하단 관련 콘텐츠 추천을 별도로 계산할 수 있다.
사용자가 제거한 링크를 동일 편집 Session에서 자동 재삽입하지 않는다.
12.4 Link Safety
AI가 URL 문자열을 직접 작성하지 않는다.
AI는 publishedContentRecordId 또는 Context에서 제공된 검증된 Link Reference만 사용한다.
최종 ContentDocument 생성 시 Rule Validator가 Link Reference와 URL을 다시 확인한다.
검증 실패 시 링크 Block을 제거하거나 사용자에게 경고한다.
13. Duplicate Detection

Duplicate Detection은 새로운 콘텐츠가 기존 콘텐츠의 가치를 불필요하게 반복하는지 판단한다.

제목 또는 Keyword가 같다는 이유만으로 중복으로 확정하지 않는다.

13.1 Detection Signals
Normalized Title Similarity
Primary Keyword Overlap
Secondary Keyword Overlap
Search Intent Similarity
Topic Similarity
Audience Similarity
Content Role Similarity
Outline Similarity
Summary Similarity
Existing Verified Content Coverage
Planned or Draft Content Coverage
13.2 Duplicate Severity
type DuplicateSeverity =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "critical";

정책:

none: 정상 진행
low: 정보 제공만
medium: 차별화 권장
high: 생성 전 사용자 확인 또는 AI 차별화 계획 필요
critical: 기본적으로 생성 차단, 명시적 Override 필요
13.3 Duplicate Detection Result
interface DuplicateDetectionResult {
  severity: DuplicateSeverity;
  score: number;
  confidence: number;

  comparedContentIds: string[];
  strongestMatchContentId?: string;

  matchedSignals: string[];
  reasons: string[];

  differentiationSuggestions: string[];

  requiresConfirmation: boolean;
  blocksGeneration: boolean;
}
13.4 Blocking Policy

critical 중복의 예:

동일 Project
동일 Search Intent
동일 Primary Topic
동일 Audience
동일 문제 해결 범위
기존 Verified Published Content와 실질적 차별점 없음

다음 경우에는 유사해도 생성할 수 있다.

플랫폼 형식이 본질적으로 다름
대상 독자가 다름
검색 의도가 다름
업데이트 또는 최신화 목적
비교 대상이 다름
시리즈의 다른 단계
사용자 요청에 따른 의도적 재가공

Override 시 이유와 사용자를 기록한다.

14. AI Context Builder

AI Context Builder는 AI Workflow에 필요한 Project 지식을 제한된 구조로 전달한다.

AI는 Repository 또는 Database를 직접 조회하지 않는다.

14.1 Context Input

AI Context Builder는 다음 정보를 입력으로 받을 수 있다.

Workspace ID
Project ID
Current Content ID
User Request
Target Platforms
Content Type
Context Purpose
Token or Size Budget
14.2 Context Purpose
type AIContextPurpose =
  | "planning"
  | "generation"
  | "quality_review"
  | "revision"
  | "internal_linking"
  | "related_content";

목적별로 필요한 정보만 포함한다.

예를 들어 Quality Review Context에는 모든 Keyword Memory를 넣을 필요가 없다.

14.3 Context Sections
interface ContentIntelligenceContext {
  contextVersion: number;
  generatedAt: string;

  projectId: string;
  purpose: AIContextPurpose;

  projectDNA: ProjectDNAContext;

  currentContent?: CurrentContentContext;

  searchIntentMemory: SearchIntentContextItem[];
  keywordMemory: KeywordContextItem[];
  topicMemory: TopicContextItem[];

  duplicateAssessment?: DuplicateDetectionResult;

  relatedContentCandidates: RelatedContentContextItem[];
  internalLinkCandidates: InternalLinkContextItem[];

  qualityHistorySummary?: QualityHistoryContext;

  exclusions: ContextExclusion[];
  warnings: string[];

  sourceReferences: ContextSourceReference[];
}
14.4 Context Budget

모든 Repository 데이터를 Context에 포함하지 않는다.

기본 선택 순서:

Explicit User Input
→ Project DNA
→ Current Content
→ Critical Exclusions
→ Duplicate Assessment
→ Highest-value Related Content
→ Verified Internal Link Candidates
→ Relevant Intent and Keyword Memory
→ Quality History Summary

Context Builder는 다음 제한을 지원해야 한다.

최대 후보 수
최대 Summary 길이
최대 Keyword 수
최대 Intent 수
최대 Link 수
목적별 Section 포함 여부
전체 Size 또는 Token Budget

초기 권장값:

Related Content Candidate: 최대 5개
Internal Link Candidate: 최대 5개
Search Intent Memory: 최대 10개
Keyword Memory: 최대 20개
Quality History: 최근 유효 결과 요약
Source Reference: Context에 실제 포함된 항목만

정확한 값은 Provider Context Limit와 품질 검증을 통해 조정할 수 있다.

14.5 Context Traceability

AI Context의 각 주요 항목은 Source Reference를 가져야 한다.

AI 결과가 존재하지 않는 콘텐츠 또는 URL을 인용하지 않도록 다음을 추적한다.

Source Type
Source ID
Content ID
Published Record ID
Verification Status
Included Fields
14.6 Context Snapshot

Generation 및 Quality Review 실행 시 사용한 Context Version 또는 Snapshot Reference를 저장할 수 있어야 한다.

이는 다음에 사용한다.

결과 재현
Recommendation 검증
오류 분석
품질 비교
향후 Context 정책 개선

Snapshot에 Secret이나 Credential을 포함해서는 안 된다.

15. Workflow
15.1 Content Planning and Generation
Natural Language Request
→ Project 확인
→ Project DNA 조회
→ Current Content Context 확인
→ Search Intent Memory 조회
→ Keyword Memory 조회
→ Topic Memory 조회
→ Duplicate Detection
→ Related Content Candidate 계산
→ Internal Link Candidate 계산
→ AI Context Builder 실행
→ AI Generation
→ Rule Validation
→ AI Quality Review
→ Rule Validation
→ ContentDocument 저장
→ Content Library Entry 갱신
→ Memory 갱신
→ Quality History 연결
15.2 Draft Save
Approved ContentDocument
→ Publishing Preparation
→ Permission Gate
→ Platform Adapter
→ External Draft Save
→ Publishing History 저장
→ Content Library 상태를 draft_saved로 갱신

Draft Save는 Published Registry의 Verified Published Record를 생성하지 않는다.

15.3 Public Publishing
Approved ContentDocument
→ Publishing Preparation
→ Permission Gate
→ Platform Adapter
→ Public Publish
→ Publishing History 저장
→ Published Registry pending 생성 또는 갱신
→ External Result Verification
→ verified 또는 failed
→ Content Library 상태 갱신
→ Recommendation Index 갱신
15.4 Verification Failure
Publish Success Response
→ Verification Failed
→ Published Record remains pending or failed
→ Internal Link Candidate에서 제외
→ Publishing History에 오류 기록
→ 재검증 가능

외부 발행이 성공했더라도 검증이 실패하면 Verified Content로 사용하지 않는다.

15.5 Content Update

기존 발행 콘텐츠가 수정되면 다음을 수행한다.

새로운 Content Version 저장
Publishing History 기록
Published Record의 contentVersion 갱신
Verification 상태를 필요 시 pending 또는 stale로 전환
재검증 완료 전 추천 신뢰도를 낮추거나 후보에서 제외
15.6 Archive

Content Archive 시:

Content Library 상태를 archived로 전환
기본 AI Context에서 제외
Duplicate History는 필요에 따라 보존
Published Record는 외부 콘텐츠가 존재하는 경우 자동 삭제하지 않음
외부 콘텐츠 상태와 내부 Archive 상태를 분리
16. Error Handling and Recovery
16.1 Error Categories
type ContentIntelligenceErrorCategory =
  | "validation"
  | "not_found"
  | "conflict"
  | "permission"
  | "verification"
  | "repository"
  | "external_dependency"
  | "context_budget"
  | "unknown";
16.2 Failure Policy
Recommendation 실패가 ContentDocument 저장을 손상시키면 안 된다.
Memory 갱신 실패가 기존 Content를 삭제하거나 변경하면 안 된다.
Published Registry 검증 실패 시 Verified로 저장하지 않는다.
일부 Repository 저장 실패 시 가능한 경우 Transaction을 Rollback한다.
Rollback이 불가능한 외부 작업은 cleanup_required 또는 복구 상태로 기록한다.
재시도 가능한 오류와 사용자 수정이 필요한 오류를 구분한다.
오류를 조용히 무시하지 않는다.
16.3 Idempotent Retry

다음 작업은 재시도 시 중복 데이터를 생성하지 않아야 한다.

Content Library Entry 생성
Published Registry 등록
Keyword Memory 갱신
Search Intent Memory 갱신
Quality History 연결
Verification 결과 저장

각 작업은 안정적인 Domain Key 또는 Idempotency Key를 사용한다.

17. Security and Data Retention

Content Intelligence는 다음 데이터를 저장하지 않는다.

API Key 원문
Cookie 원문
Session Token 원문
Platform Password
Secret Value
Browser Storage 원문

Platform Connection은 platformConnectionId만 참조한다.

17.1 Data Isolation
모든 조회는 Workspace 및 Project 경계를 검증한다.
다른 Workspace의 Library Entry를 조회할 수 없어야 한다.
Project ID만으로 조회하더라도 Workspace 소유권을 확인한다.
AI Context에 다른 Project 데이터가 실수로 포함되지 않아야 한다.
17.2 Archive and Permanent Deletion

기본 삭제는 Archive다.

영구 삭제는 다음 절차를 따른다.

User Request
→ Permission 확인
→ Impact 계산
→ Backup Policy 적용
→ Related Record 처리
→ Permanent Delete
→ Audit 기록

Published Registry 삭제가 외부 플랫폼 콘텐츠 삭제를 의미하지 않는다.

외부 콘텐츠 삭제는 별도의 Permission-Gated Publishing Workflow를 통해서만 수행한다.

18. Repository Contracts

구체적인 구현 언어와 Storage 기술은 Architecture 및 Repository 현황을 확인한 뒤 결정한다.

최소 Repository Interface는 다음 책임을 제공해야 한다.

18.1 Content Library Repository
interface ContentLibraryRepository {
  findById(id: string): Promise<ContentLibraryEntry | null>;

  findByContentId(
    projectId: string,
    contentId: string
  ): Promise<ContentLibraryEntry | null>;

  searchByProject(
    projectId: string,
    query: ContentLibraryQuery
  ): Promise<ContentLibraryEntry[]>;

  save(entry: ContentLibraryEntry): Promise<void>;

  updateStatus(
    id: string,
    status: ContentLifecycleStatus
  ): Promise<void>;

  archive(id: string, archivedAt: string): Promise<void>;
}
18.2 Published Registry Repository
interface PublishedRegistryRepository {
  findById(id: string): Promise<PublishedContentRecord | null>;

  findByExternalIdentity(
    platform: string,
    platformConnectionId: string,
    externalContentId: string
  ): Promise<PublishedContentRecord | null>;

  findVerifiedCandidates(
    projectId: string,
    query: PublishedCandidateQuery
  ): Promise<PublishedContentRecord[]>;

  save(record: PublishedContentRecord): Promise<void>;

  updateVerification(
    id: string,
    result: PublicationVerificationResult
  ): Promise<void>;
}
18.3 Memory Repositories

Keyword, Search Intent와 Topic Memory는 각각 Repository를 분리하거나 공통 Memory Repository를 사용할 수 있다.

단, Domain Type과 Business Rule은 분리해야 한다.

18.4 Quality History Repository

Quality History는 기존 Quality Engine의 Report를 중복 저장하지 않는다.

Content Intelligence는 Quality Report ID와 필요한 Summary Projection만 참조한다.

19. Recommendation Contract

모든 추천 Service는 공통적으로 다음 특성을 가져야 한다.

결정론적 Candidate Filtering
점수화
Confidence
이유
감점 사유
Verification 상태
Stable Identifier
최대 결과 수
동일 입력에 대한 안정적 결과

공통 형태:

interface RecommendationResult<T> {
  items: T[];
  generatedAt: string;
  policyVersion: number;
  warnings: string[];
}

추천 정책이 변경되면 policyVersion을 갱신한다.

과거 결과를 재현할 필요가 있는 경우 사용된 Policy Version을 저장한다.

20. Implementation Sequence

Sprint 7 구현은 다음 순서로 진행한다.

Phase 1. Domain and Repository Foundation
Canonical Enum 정의
Content Library Entry 정의
Published Content Record 정의
Memory Record 정의
Repository Interface 정의
Migration 및 Version 정책 정의
Phase 2. Content Library
Content 생성 시 Entry 생성
Autosave 및 History와 연결
Lifecycle 상태 전이
Archive와 Restore
검색 및 필터링
Phase 3. Published Registry
Publishing History 연결
Pending Record 생성
Verification 상태 관리
Idempotency
Verified Candidate Query
Phase 4. Memory
Keyword Memory
Search Intent Memory
Topic Memory
Quality History Projection
Phase 5. Intelligence
Duplicate Detection
Related Content Recommendation
Internal Link Recommendation
Explainable Score
Phase 6. AI Context Builder
Purpose별 Context
Budget
Source Reference
Snapshot
AI Workflow 연결
Phase 7. Verification
Unit Test
Repository Integration Test
Publishing Result Integration Test
AI Context Snapshot Test
Regression Test
Manual Verification
Documentation Update
21. Acceptance Criteria

Sprint 7은 다음 조건을 모두 만족할 때 설계 및 구현 완료로 간주한다.

21.1 Project DNA
Project DNA가 콘텐츠 생성 Context에 자동 적용된다.
사용자 입력이 Project DNA보다 우선한다.
Project DNA가 없는 경우 안전한 기본값으로 진행할 수 있다.
Project DNA 상세 계약은 09_PROJECT_DNA.md와 일치한다.
21.2 Content Library
모든 Content가 하나의 Project와 Library Entry에 연결된다.
ContentDocument가 Canonical Source로 유지된다.
Lifecycle 상태 전이가 검증된다.
Archive된 Entry가 기본 추천과 AI Context에서 제외된다.
Quality Report 및 Publishing Result를 참조할 수 있다.
동일 Content에 Library Entry가 중복 생성되지 않는다.
21.3 Published Registry
Draft Save 결과는 Verified Published Record로 등록되지 않는다.
Public Publish 성공 후 Record가 pending으로 생성된다.
외부 검증 성공 후에만 verified가 된다.
검증 실패 URL은 내부 링크에 사용되지 않는다.
동일 외부 콘텐츠의 재시도가 중복 Record를 만들지 않는다.
Removed 또는 Stale Record가 기본 추천 후보에서 제외된다.
21.4 Memory
Keyword가 Project 단위로 정규화되어 저장된다.
Search Intent가 콘텐츠와 연결된다.
Excluded Keyword가 AI Context에 반영된다.
동일 Keyword 사용만으로 콘텐츠가 자동 차단되지 않는다.
Archive 정책이 Memory 조회에 적용된다.
21.5 Related Content
검증된 Published Content만 기본 후보로 사용한다.
단순 Keyword Similarity 외의 신호를 사용한다.
Recommendation Result에 점수와 이유가 포함된다.
현재 콘텐츠 자신을 추천하지 않는다.
최대 추천 수를 제한할 수 있다.
21.6 Internal Links
AI가 존재하지 않는 URL을 생성할 수 없다.
검증된 Link Reference만 ContentDocument에 적용할 수 있다.
동일 URL의 과도한 반복을 방지한다.
내부 링크 기본 동작은 _self다.
Link Validation 실패 시 발행 전 차단 또는 제거된다.
21.7 Duplicate Detection
Title, Keyword, Search Intent, Topic, Audience와 Content Role을 함께 평가한다.
Severity와 Score를 반환한다.
High 또는 Critical 결과에 이유와 차별화 제안을 제공한다.
Critical Duplicate는 기본적으로 생성 확인 또는 차단 정책을 적용한다.
사용자 Override가 기록된다.
21.8 AI Context Builder
AI가 Repository를 직접 조회하지 않는다.
Context Purpose별로 포함 정보가 달라진다.
Context Budget을 초과하지 않도록 제한한다.
Source Reference를 제공한다.
Secret 및 Credential이 Context에 포함되지 않는다.
Generation과 Quality Review의 주요 AI 호출 정책을 유지한다.
21.9 Failure and Recovery
일부 Recommendation 실패가 Content 저장을 손상시키지 않는다.
Verification 실패가 Verified 상태로 저장되지 않는다.
재시도 작업이 중복 데이터를 만들지 않는다.
오류가 분류되고 기록된다.
복구 불가능한 부분 실패가 명시적인 상태로 남는다.
21.10 Platform Independence
Core가 Platform DOM, URL 또는 Selector를 알지 않는다.
Platform Adapter가 공통 Publishing Result를 반환한다.
Tistory 외 플랫폼에서도 동일한 Content Intelligence 계약을 재사용할 수 있다.
새로운 플랫폼 추가 시 Intelligence Domain Model을 복제하지 않는다.
21.11 Test and Documentation
Unit Test가 통과한다.
Repository Integration Test가 통과한다.
Published Verification Test가 통과한다.
AI Context Builder Test가 통과한다.
Regression Test가 기존 Sprint 1~5 기능을 보호한다.
관련 Architecture 및 Development 문서가 갱신된다.
22. Out of Scope

Sprint 7에서 다음은 구현 범위에 포함하지 않는다.

Google Search Console 실제 연동
GA4 실제 연동
외부 Keyword Search Volume Provider
실시간 Ranking Tracking
Competitor Crawling
Knowledge Graph
Vector Database 필수 도입
Cross-Workspace Recommendation
자동 공개 발행
AI 호출 추가를 전제로 한 다중 Agent 시스템
사용자 행동 기반 개인화 추천
Cloud Sync

향후 확장을 고려해 Interface를 막지 않되, Sprint 7 구현에 선제적으로 포함하지 않는다.

23. Future Expansion

향후 확장 가능한 영역은 다음과 같다.

Google Search Console
GA4
Search Ranking
Competitor Analysis
Trend Intelligence
Topic Cluster AI
Semantic Search
Semantic Graph
Knowledge Graph
Vector Search
AI Learning Feedback
Content Performance Feedback
Cross-Project Knowledge Sharing
Team Collaboration
Cloud Sync

향후 기능은 기존 Content Library, Published Registry, Memory 및 AI Context Builder 계약을 유지하면서 확장해야 한다.

24. Final Principle

Content Intelligence의 목적은 데이터를 많이 저장하는 것이 아니다.

검증된 프로젝트 지식과 콘텐츠 이력을 필요한 순간에 정확하게 재사용하여 다음 콘텐츠의 품질을 높이는 것이다.

모든 구현은 다음 원칙을 만족해야 한다.

Project-Owned
Platform-Independent
Verified-Data-First
Explainable
Cost-Efficient
Recoverable
AI-Context-Safe

적용 후에는 `Status: Draft – Ready for Approval` 상태로 검토하고, 내용이 승인되면 다음 두 줄만 변경하면 됩니다.

```markdown
Status: Approved
Implementation Status: Not Implemented
```

## 25. Workspace Data Sources and Opportunity Recommendation Types

Implementation status: Foundation implemented; official-account verification pending.

External market and performance data is owned by Workspace-level `DataSourceConnection`, not by Project and not by Publishing `PlatformConnection`. Projects opt into same-Workspace connections by reference. Credentials remain in SecretStore.

Official Provider data follows this lifecycle:

```text
Manual Sync
→ Raw Snapshot
→ Normalized Evidence
→ Project-scoped Planning Context
→ Server Evidence Matching
→ Recommendation Classification
```

Content creation never calls an external market API in real time. No connection or snapshot is required for internal blog-growth planning.

Every candidate has one server-classified recommendation type:

- `comprehensive` / 종합 추천: current verified external Evidence plus internal growth Evidence.
- `marketOpportunity` / 시장 기회 추천: verified external Evidence without enough internal growth support for comprehensive.
- `blogGrowth` / 블로그 성장 추천: internal content-gap/link/cluster Evidence without verified external market opportunity.

Editorial inference alone is never market Evidence. Candidate counts and types are not balanced artificially. Cards do not claim an overall first place or fabricated score. They show Evidence summary, Provider, period, freshness, confidence and limitations.

AI can organize a topic, intent, reader problem and rationale from a read-only bundle but cannot create canonical Evidence. The server validates Evidence IDs, Workspace ownership, freshness and classification after AI output and stores those fields atomically with the complete Opportunity.
