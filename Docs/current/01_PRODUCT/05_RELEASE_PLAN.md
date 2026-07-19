# Bright Studio Release Plan

**Version:** 3.0
**Status:** Approved
**Document Type:** Product Release Plan
**Internal Project Name:** Bright Editor Platform
**User-facing Product Name:** Bright Studio

---

# 1. Purpose

이 문서는 Bright Studio의 각 Release 범위, 출시 조건, 검증 기준과 중단 조건을 정의한다.

Roadmap이 제품 개발의 장기 순서를 정의한다면, Release Plan은 특정 버전을 실제 사용 가능한 상태로 판단하는 기준을 정의한다.

이 문서는 다음 질문에 답해야 한다.

- 이번 Release에 무엇이 포함되는가?
- 무엇은 포함되지 않는가?
- 어떤 사용자 흐름이 실제로 동작해야 하는가?
- 어떤 테스트가 통과해야 하는가?
- 어떤 문제가 있으면 출시를 중단해야 하는가?
- Release 이후 문제가 발생하면 어떻게 복구하는가?
- 다음 Release로 이동하기 위한 조건은 무엇인가?

개발 순서는 `02_ROADMAP.md`, 제품 요구사항은 `01_PRD.md`, 사용자 흐름은 `03_USER_FLOW.md`, 기능별 상세 요구사항은 `04_FEATURE_SPEC.md`, 구조적 책임은 `06_PRODUCT_ARCHITECTURE.md`를 따른다.

---

# 2. Release Philosophy

Bright Studio는 기능이 구현되었다는 이유만으로 출시하지 않는다.

Release는 사용자가 하나의 목적을 처음부터 끝까지 실제로 완료할 수 있을 때만 승인한다.

```text
Feature Implemented
    ≠
Release Ready
    =
End-to-End Flow Verified
+
Failure Recovery Verified
+
Data Safety Verified
+
Permission Verified
+
Documentation Aligned

3. Release Principles
3.1 End-to-End Before Feature Count

개별 화면과 서비스가 존재하더라도 서로 연결되지 않았다면 Release Ready가 아니다.

첫 번째 제품 Release의 핵심은 다음 흐름이다.

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
AI 콘텐츠 생성
    ↓
Editor
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Tistory Draft Save
    ↓
실제 Draft 확인
3.2 Verified Before Released

외부 플랫폼 작업은 요청 성공이나 버튼 클릭 완료만으로 성공 처리하지 않는다.

가능한 범위에서 실제 외부 결과를 확인해야 한다.

3.3 Draft Before Public Publish

초기 Release는 공개 발행이 아니라 임시저장을 기본으로 한다.

기본 정책:

Review First: ON
Draft Only: ON
Public Publish: OFF
Quality Approval Required: ON
Sequential Draft Save: ON
3.4 Data Safety Before Convenience

콘텐츠, Revision, 설정 또는 Publishing 결과를 잃을 가능성이 있는 문제는 Release를 차단한다.

3.5 Recovery Before Automation Expansion

정상 흐름뿐 아니라 실패 후 복구가 검증되어야 한다.

새 플랫폼이나 공개 발행 자동화는 기존 Draft Workflow의 실패 복구가 안정된 후 진행한다.

3.6 Documentation Before Release

Release 범위와 실제 구현이 다르면 Release를 승인하지 않는다.

관련 문서는 Release 전에 현재 구현과 일치하도록 갱신해야 한다.

4. Release Status Definitions
Status	Meaning
Planned	Release 방향과 목표가 정의된 상태
Designed	범위와 Acceptance Criteria가 승인된 상태
In Development	구현과 통합이 진행 중인 상태
Feature Complete	계획된 기능 구현이 완료된 상태
Verification	정상 및 실패 흐름을 검증하는 상태
Release Candidate	출시 후보 빌드가 고정된 상태
Release Ready	모든 필수 Gate를 통과한 상태
Released	승인된 사용자 범위에 제공된 상태
Monitoring	출시 후 오류와 사용 흐름을 관찰하는 상태
Stabilizing	발견된 문제를 수정하는 상태
Rolled Back	심각한 문제로 이전 안정 버전으로 복귀한 상태
Deferred	출시 범위에서 제외된 상태

Feature Complete는 Release Ready가 아니다.

5. Release Types
5.1 Internal Development Release

개발 및 Architecture 검증을 위한 내부 버전이다.

특징:

Developer Dashboard 사용 가능
Fixture 또는 제한된 Live Data 사용
사용자 Release로 간주하지 않음
실제 데이터 안전성 검증 전 외부 배포 금지
5.2 Internal Alpha

제품 소유자가 실제 데이터를 사용해 전체 흐름을 검증하는 버전이다.

특징:

실제 AI Provider 사용
실제 Platform Connection 사용
실제 Tistory Draft Save
상세 진단 노출
오류 발생 가능성을 전제로 제한적으로 사용
5.3 Personal Alpha

개인 운영자가 실제 콘텐츠 제작에 제한적으로 사용하는 버전이다.

특징:

핵심 Workflow 사용 가능
Draft Only
상세 Quality 정보
수동 복구 가능
일부 고급 기능 미완성 허용
5.4 Personal Stable

개인 운영자가 일상적인 콘텐츠 작업에 지속적으로 사용할 수 있는 버전이다.

특징:

핵심 Workflow 안정화
저장과 복구 검증
반복 실행 안정성
치명적 오류 없음
Tistory Draft Workflow 안정화
5.5 Closed Beta

제한된 외부 사용자가 사용하는 버전이다.

특징:

간단한 Onboarding
오류 안내 개선
Migration 정책
사용량 측정
개인정보와 Secret 관리 검증
지원 가능한 사용자 수 제한
5.6 Commercial Preview

상용 사용자 경험과 서비스 기반을 검증하는 버전이다.

특징:

단순 UX
계정 관리
Cloud 또는 Sync 기반
Usage Policy
Subscription 기반
지원 정책
5.7 Public Release

일반 사용자에게 정식으로 제공하는 버전이다.

Public Release는 별도의 보안, 운영, 지원 및 법적 준비가 완료된 뒤 승인한다.

6. Release Overview
Release	Product Value	Status
Release 0	Internal Foundation	Implemented
Release 1	Personal Tistory Alpha	In Development
Release 2	Personal Tistory Stable	Planned
Release 3	Content Intelligence	Partially Implemented
Release 4	WordPress Alpha	Planned
Release 5	Multi-Platform Personal	Planned
Release 6	Content Repurposing	Planned
Release 7	Analytics Preview	Future
Release 8	Commercial Preview	Future
Release 9	Closed Beta	Future
Release 10	Public Release	Future
7. Release 0 — Internal Foundation
Status

Implemented

Goal

Bright Studio의 Platform-independent Core와 제품 기반을 구축한다.

Included Scope
Architecture
Core와 Apps 분리
Canonical Content Model
Platform Adapter 기반
AI Provider abstraction
Publishing Service
Permission Gate 기반
Tistory Foundation
Browser Foundation
Login Entry
Stored Session Context
Editor Entry
Editor Ready
Tistory HTML Renderer
Draft Workflow 기반
Product Foundation
Home
Workspace
Project
Editor
Publishing Preparation
Settings
Developer Dashboard
Content Foundation
ContentDocument
Content Blocks
Processing Pipeline
Validator
Normalizer
Optimizer
Metadata
Version
Persistence and Quality
Repository
Autosave
History
Revision
Quality Engine
Quality Report
Quality Gate 기반
Release 0 Completion Criteria
Core와 Apps 경계가 존재한다.
ContentDocument가 플랫폼 HTML과 분리된다.
Tistory Session을 복원할 수 있다.
Tistory Editor 진입 기반이 존재한다.
콘텐츠를 저장하고 다시 읽을 수 있다.
Quality Report를 생성할 수 있다.
Publishing Request가 Permission Gate를 거친다.
Known Limitation

Release 0은 기반 기능 구현 버전이며, 사용자 관점의 전체 흐름이 실제 Tistory Draft Save까지 검증되었다는 의미가 아니다.

8. Release 1 — Personal Tistory Alpha
Status

In Development

Goal

Bright Studio에서 콘텐츠 요청부터 실제 Tistory 임시저장 확인까지 하나의 통합 흐름을 완성한다.

Target User
제품 소유자
제한된 개인 운영자
상세 오류와 진단을 이해할 수 있는 사용자
Primary User Flow
Application Start
    ↓
Workspace 선택 또는 생성
    ↓
Enabled Platforms 설정
    ↓
Tistory Connection 확인
    ↓
Project 선택 또는 생성
    ↓
Project DNA 기본값 확인
    ↓
자연어 콘텐츠 요청
    ↓
AI 분석 및 Keyword 추천
    ↓
사용자 확인
    ↓
AI 콘텐츠 생성
    ↓
Editor 진입
    ↓
사용자 수정
    ↓
Autosave
    ↓
새로고침 및 복원
    ↓
Quality Review
    ↓
필요 시 개선
    ↓
Tistory Preview
    ↓
Tistory Account 선택
    ↓
Tistory Category 선택
    ↓
Permission Gate
    ↓
Draft Save
    ↓
실제 Tistory Draft 검증
Included Scope
Workspace and Project
Workspace 생성과 선택
Enabled Platforms
Platform Connections 진입
Project 생성과 선택
선택적 Brand
Project Dashboard
Project DNA 기본 설정
Content Creation
자연어 요청 입력
대상 플랫폼 선택
콘텐츠 유형
Search Intent 분석
Keyword 추천
콘텐츠 방향 제안
사용자 확인
실제 AI Generation
Editor
생성 결과 자동 진입
제목 수정
본문 수정
H2/H3 표시
이미지 전략 표시
CTA와 Video 기반 표시
Autosave
저장 상태
Revision History
Reload 복원
Quality
Rule Validation
AI Quality Review
Overall Score
Dimension Score
Needs Improvement
Automatic Improvement
Outdated Report 처리
Publishing Quality Gate
Tistory Preparation
Tistory Preview
Publishing Account 선택
실제 Category 조회
Category 선택
최신 Revision 확인
이미지 및 링크 상태
Permission 상태
Automation 상태
Tistory Draft Save
Stored Session 확인
Tistory Editor 진입
제목 입력
HTML 입력
Category 적용
지원 범위 내 이미지 업로드
임시저장
결과 검증
Publishing Result 저장
Recovery
AI 실패 후 입력 보존
Autosave 실패 표시
Session 만료 안내
Draft Save 실패 기록
실패한 Publishing Job 재시도
기존 Content와 Revision 보존
Explicitly Excluded
Public Publish
자동 예약 발행
WordPress Draft Save
Multi-platform Queue
Team Collaboration
Cloud Sync
Subscription
Marketplace
Analytics
자체 이미지 생성
기존 외부 글 자동 수정
기존 외부 글 자동 삭제

Release 1의 `자동 예약 발행` 제외는 유지한다. 이는 통합 Sprint 6의 Tistory 예약 기능을 취소하는 의미가 아니라, Sprint 4 실제 Draft E2E Gate와 Release 1 검증이 끝나기 전에 예약 Runtime을 활성화하지 않는다는 의미다.

## Integrated Sprint 6 Delivery Gate

통합 Sprint 명칭은 `Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling`이다. 기존 Sprint 6.5 번호는 별도 개발 단계로 사용하지 않는다.

Gate 0:

- 실제 Tistory Draft Save 실행
- Draft 재진입
- 제목, 의미 있는 본문 구조와 Category 확인
- 공개되지 않은 상태 확인
- `saved` 수준의 전체 결과 확인

Gate 0 통과 전에는 Presentation Runtime과 Scheduling Domain/Runtime 구현을 시작하지 않는다.

Workstream A Release Gate:

- deterministic Presentation Resolver
- theme-independent semantic HTML
- 불변 RenderArtifact와 checksum
- PreviewApproval
- Preview와 Draft의 동일 Artifact 사용
- 실제 Draft 재진입 의미 구조 검증

Workstream B Release Gate:

- `schedule.publish` 기본 OFF와 `public.publish` 기본 OFF
- 예약 등록·시간 수정·취소마다 사용자 명시 승인
- Quality 승인과 현재 Revision 일치
- 고정 Revision, Account와 Category
- Tistory 자체 예약 기능을 사용한 등록·시간 수정·Draft 보존 취소
- 예약 목록과 외부 검증 상태
- 중복 방지, 실패 Job만 재시도, 앱 재시작 복원
- 실제 Tistory 예약 외부 검증

로컬 Scheduler, 반복 예약, 다중 플랫폼 예약, AI 임의 예약 시간 결정과 자동 즉시 공개 발행은 이 Delivery 범위에서 제외한다. 모든 자동 테스트가 통과하더라도 실제 Tistory 외부 검증 전에는 통합 Sprint를 `Completed` 또는 `Verified`로 판정하지 않는다.
Release 1 Functional Gate

다음 기능은 실제로 연결되어야 한다.

Project 생성 후 Create Content로 이동할 수 있다.
자연어 입력 후 AI 분석 결과가 표시된다.
사용자가 Keyword와 방향을 수정할 수 있다.
사용자 확인 후 콘텐츠가 생성된다.
생성된 콘텐츠가 Editor에 표시된다.
수정 내용이 저장된다.
새로고침 후 저장 내용이 복원된다.
최신 Revision을 Quality Review한다.
승인 상태가 Publishing Gate에 반영된다.
실제 Tistory 계정과 Category를 선택할 수 있다.
Tistory Preview를 볼 수 있다.
임시저장을 실행할 수 있다.
실제 Tistory에서 Draft를 확인할 수 있다.
Release 1 Data Gate
콘텐츠 생성 실패 시 입력을 잃지 않는다.
Editor 수정 실패 시 마지막 저장 Revision을 유지한다.
Project 전환 전에 대기 저장을 완료한다.
과거 Revision 복원 시 새 Revision을 생성한다.
Publishing 실패 시 Content를 삭제하거나 변형하지 않는다.
Draft Save 결과가 Content ID 및 Revision ID와 연결된다.
중복 임시저장 실행을 방지한다.
Release 1 Permission Gate
Quality 미승인 콘텐츠를 차단할 수 있다.
Public Publish는 기본 비활성 상태다.
AI가 Permission을 변경할 수 없다.
Playwright는 Registered Workflow를 통해서만 실행된다.
UI를 우회해도 실행 계층에서 Permission을 재검증한다.
잘못된 Workspace 계정을 참조할 수 없다.
Release 1 Verification Gate

다음 실제 환경 검증이 필요하다.

실제 AI Provider
실제 Workspace 데이터
실제 Project
실제 Tistory Connection
실제 Stored Session
실제 Tistory Category
실제 Tistory Editor
실제 Tistory Draft

Fixture만으로 Release 1을 승인하지 않는다.

Release 1 Approval Condition

다음 조건을 모두 만족해야 한다.

Primary User Flow 전체 통과
실제 Tistory Draft 확인
데이터 손실 Critical 문제 없음
Permission 우회 없음
Public Publish 실행 없음
주요 실패 복구 검증
필수 테스트 통과
문서와 구현 정합성 확인
알려진 제한사항 기록
제품 소유자 승인
9. Release 2 — Personal Tistory Stable
Status

Planned

Goal

Release 1의 핵심 흐름을 일상적인 실제 운영에 사용할 수 있는 수준으로 안정화한다.

Included Scope
Release 1 전체 기능
Session 만료 복구 개선
Category 조회 안정화
이미지 업로드 안정화
Publishing 중복 방지 강화
Autosave 충돌 처리
History 안정화
Content Library 개선
Project DNA 기본값 완성
Error Message 개선
Publishing History
Backup과 Safe Deletion
성능과 Logging 개선
Regression Test 확대
Stability Requirements
반복 콘텐츠 생성이 정상 동작한다.
여러 Project 간 전환 시 저장 유실이 없다.
여러 Tistory 계정 선택이 정확히 적용된다.
연결 Session 만료를 정상적으로 감지한다.
실패 후 동일 콘텐츠를 다시 생성하지 않고 Publishing만 재시도할 수 있다.
Draft Save 결과가 중복 기록되지 않는다.
오래된 Quality Report가 현재 점수로 표시되지 않는다.
Release 2 Soak Test

실제 사용 시나리오를 반복 수행한다.

권장 검증:

여러 Workspace
여러 Project
여러 Content
연속 콘텐츠 생성
연속 Quality Review
연속 Draft Save
브라우저 재시작
Application 재시작
Session 만료 후 복구
Network 오류 후 재시도
Release 2 Approval Condition
Release 1 Critical 및 High 문제 해결
핵심 흐름 반복 성공
데이터 손실 없음
사용자 차단 오류 없음
오류 복구 가능
주요 Regression 없음
제품 소유자가 실제 운영에 사용할 수 있음
10. Release 3 — Content Intelligence
Status

Partially Implemented

Goal

기존 콘텐츠와 Project 전략을 다음 콘텐츠 생성에 재사용한다.

Included Scope
Implemented Foundation
Content Opportunity
Planning 상태 Persistence
Workspace-owned DataSourceConnection
same-Workspace ProjectDataSourceReference
Provider Snapshot과 normalized Evidence
Opportunity Evidence classification

Remaining Release Scope — Not Implemented
Project DNA 고급 설정
Content Library
Published Content Registry
Search Intent Memory
Keyword Memory
Topic Memory
Duplicate Detection
Internal Link Intelligence
Related Content Recommendation
AI Context Builder
Verified URL 정책

Foundation Verification Status

Data Source and Opportunity Intelligence Foundation은 `71d4899d feat: add content intelligence and data source workflows`로 `main`과 `origin/main`에 반영되었다. 전체 자동 검증은 118개 파일, 589개 테스트가 통과했고 기존 정책상 6개 파일, 14개 테스트는 skip 상태다. lint, typecheck, test, build와 `git diff --check`도 통과했다.

Google Search Console은 실제 OAuth 로그인, 속성 목록 조회, `https://bright-healthy.tistory.com/` 선택, `siteOwner` 권한, 실제 동기화와 Snapshot 생성을 외부 검증했다. NAVER Search Trend 실제 연결·동기화와 legacy Google Search Console Data Source 삭제도 외부 검증했으며 `DELETE /api/data-sources`가 HTTP 200을 반환했다.

GA4와 AdSense 실제 계정 검증은 남아 있다. Google Ads와 Google Trends는 공식 접근 전 비활성이다. 토큰 만료 후 자동 갱신, 쿼터 한계와 다양한 실제 Provider 응답도 추가 검증 Gate다.

Project DNA, Content Library, Published Content Registry, Search Intent Memory, Keyword Memory, Topic Memory, Duplicate Detection, Cannibalization Detection과 Internal Link Intelligence가 미구현이므로 Release 3 전체를 `Implemented`, `Verified` 또는 Release Ready로 판단하지 않는다.
Primary User Flow
Create Content
    ↓
Project DNA 조회
    ↓
기존 콘텐츠 조회
    ↓
중복 위험 분석
    ↓
Keyword 및 Search Intent 추천
    ↓
사용자 확인
    ↓
콘텐츠 생성
    ↓
Verified Internal Link 추천
    ↓
Quality Review
Release Gate
Project DNA가 자동 적용된다.
사용자가 적용된 전략을 확인할 수 있다.
Keyword 일치만으로 중복 처리하지 않는다.
Repurposing 콘텐츠를 잘못된 중복으로 판단하지 않는다.
Verified Published URL만 내부 링크로 사용한다.
존재하지 않는 URL을 생성하지 않는다.
현재 콘텐츠 자신을 추천하지 않는다.
Draft URL을 Published URL로 사용하지 않는다.
추천을 사용자가 수정하거나 거절할 수 있다.
11. Release 4 — WordPress Alpha
Status

Planned

Goal

Tistory에서 검증된 Architecture를 WordPress에 재사용한다.

Included Scope
WordPress Connection
Secret Reference
WordPress Renderer
Category
Tag
Featured Image
WordPress Preview
Draft Save
External Post ID
Draft URL
Result Verification
Retry
Publishing History
Architecture Gate
WordPress가 Tistory 구현을 복사하지 않는다.
공통 Content Model을 사용한다.
공통 Publishing Service를 사용한다.
WordPress 특화 로직은 WordPress App에 위치한다.
Core에 WordPress URL, Category 또는 API 특화 로직이 들어가지 않는다.
Release Gate
실제 WordPress 사이트 연결
실제 Draft 생성
실제 External Post ID 확인
실제 Draft URL 확인
Tistory Workflow Regression 없음
계정 및 Site 혼동 없음
실패 후 Draft Job만 재시도 가능
12. Release 5 — Multi-Platform Personal
Status

Planned

Goal

하나의 콘텐츠 요청에서 여러 플랫폼 콘텐츠를 준비하고 순차적으로 임시저장한다.

Included Scope
Tistory와 WordPress 동시 Target
공통 콘텐츠 전략
플랫폼별 콘텐츠 최적화
플랫폼별 Preview
플랫폼별 Account 선택
플랫폼별 Category 선택
Sequential Publishing Queue
Partial Success
Independent Retry
Multi-platform Publishing History
Release Gate
동일한 HTML을 모든 플랫폼에 복사하지 않는다.
플랫폼마다 독립적인 Revision 또는 Variant를 관리한다.
한 플랫폼 실패가 다른 플랫폼 성공을 취소하지 않는다.
실패한 플랫폼 작업만 재시도할 수 있다.
Queue 상태가 실제 작업 상태와 일치한다.
계정과 Category가 플랫폼 간 섞이지 않는다.
중복 Draft Save를 방지한다.
13. Release 6 — Content Repurposing
Status

Planned

Goal

기존 콘텐츠를 다른 플랫폼과 콘텐츠 유형으로 재사용한다.

Included Scope
Existing Content Source
YouTube Source
Transcript Source
Article to Video Script
Video to Article
Long-form to Shorts
Source-Derived Relationship
플랫폼별 최적화
Repurposing Quality Review
Release Gate
원본 콘텐츠를 변경하지 않는다.
새 ContentDocument를 생성한다.
Source 관계를 저장한다.
단순 복사가 아니라 Target Format에 맞게 변환한다.
Duplicate Detection이 정상 Repurposing을 차단하지 않는다.
각 변환 콘텐츠가 별도 Quality Review를 가진다.
14. Release 7 — Analytics Preview
Status

Future

Goal

발행된 콘텐츠의 성과를 콘텐츠 전략과 개선 추천에 활용한다.

Planned Scope
Search Console
GA4
WordPress Analytics
YouTube Analytics
Content Performance
Keyword Performance
Search Intent Performance
Content Decay
Refresh Recommendation
Topic Authority
Entry Conditions
Published Content Registry 안정화
외부 URL 검증 안정화
Content와 External ID 관계 안정화
사용자 동의 및 데이터 보안 설계
Platform API 또는 합법적 데이터 연결 방식 확정
15. Release 8 — Commercial Preview
Status

Future

Goal

개인용 Core를 기술 지식이 적은 사용자를 위한 단순한 상용 경험으로 확장한다.

Planned Scope
Simplified Onboarding
Guided Workflow
Smart Default
복잡한 Quality Score 기본 숨김
Account
Cloud Data
Subscription 기반
Usage Limit
Support Workflow
Commercial Settings
Entry Conditions
Personal Tistory Stable
WordPress Alpha 검증
핵심 데이터 모델 안정화
Migration 정책
Cloud Security 설계
AI 비용 측정
사용량 제한 정책
개인정보 처리 정책
지원 운영 계획
16. Release 9 — Closed Beta
Status

Future

Goal

제한된 외부 사용자를 통해 제품 안정성과 상용 UX를 검증한다.

Required Preparation
사용자 계정
Onboarding
Backup
Migration
Telemetry
Crash Reporting
Support Contact
Privacy Policy
Terms
Data Export
Account Deletion
Usage Limit
Cost Protection
Beta Exit Criteria
Critical 오류 0
데이터 손실 오류 0
Permission 우회 0
일반 사용자가 도움 없이 핵심 Workflow 완료
AI 비용이 계획 범위 안에 있음
지원 가능한 오류 수준
사용자 피드백 기반 주요 UX 문제 해결
17. Release 10 — Public Release
Status

Future

Goal

Bright Studio를 일반 사용자에게 안정적으로 제공한다.

Public Release Entry Conditions
Closed Beta 완료
Security Review
Privacy Review
Legal Documentation
Operational Monitoring
Incident Response
Backup and Restore
Billing Validation
User Support
Release Notes
Rollback Plan
Data Migration Test
Capacity Test
Public Release Rule

Public Release는 제품 기능 완성만으로 승인하지 않는다.

서비스 운영, 보안, 비용, 지원과 법적 준비가 함께 완료되어야 한다.

18. Universal Release Gates

모든 Release는 다음 Gate를 검토한다.

18.1 Scope Gate
In Scope이 명확하다.
Out of Scope이 명확하다.
Release 도중 범위가 무제한 확장되지 않았다.
구현 결과가 승인된 문서와 일치한다.
18.2 Functional Gate
Primary User Flow가 동작한다.
필수 화면과 서비스가 연결된다.
사용자가 수동 개발 우회 없이 작업을 완료한다.
정상 결과가 올바른 상태로 저장된다.
18.3 Quality Gate
Quality 기준이 정의되어 있다.
Quality Report가 올바른 Revision과 연결된다.
오래된 Report가 현재 결과로 표시되지 않는다.
목표 미달 콘텐츠의 처리가 명확하다.
18.4 Data Gate
저장과 복원이 정상이다.
실패 시 기존 데이터가 보존된다.
삭제 전 Backup 정책을 적용한다.
Data Migration이 필요한 경우 검증한다.
사용자 데이터 간 경계가 유지된다.
18.5 Security Gate
Secret 원문을 노출하지 않는다.
Permission을 실행 계층에서 검증한다.
외부 플랫폼 작업을 Allowlist Workflow로 제한한다.
위험 작업은 사용자 확인을 요구한다.
사용자의 계정과 Workspace가 잘못 연결되지 않는다.
18.6 Publishing Gate
대상 Platform이 명확하다.
대상 Account가 명확하다.
대상 Category가 명확하다.
Content Revision이 고정된다.
외부 결과를 검증한다.
중복 실행을 방지한다.
실패 후 안전하게 재시도할 수 있다.
18.7 Regression Gate
기존 주요 Workflow가 유지된다.
저장 데이터 호환성이 유지된다.
기존 Connection이 손상되지 않는다.
이전 플랫폼 Workflow가 정상이다.
관련 Unit, Integration, End-to-End Test가 통과한다.
18.8 Documentation Gate
PRD가 최신 상태다.
Roadmap이 최신 상태다.
User Flow가 최신 상태다.
Feature Specification이 최신 상태다.
Product Architecture가 최신 상태다.
Release Plan이 실제 범위와 일치한다.
변경된 Architecture Decision이 기록된다.
알려진 제한사항이 기록된다.
19. Required Test Levels
19.1 Static Validation
Type Check
Lint
Formatting 또는 Diff Check
Schema Validation
Dependency Review
19.2 Unit Test

주요 대상:

Content Processing
Quality Rules
Permission Rules
URL Validation
Link Policy
Project DNA Merge
Duplicate Detection
State Transition
Renderer
19.3 Integration Test

주요 대상:

Repository와 Autosave
Content와 Revision
Quality와 Publishing Gate
Workspace와 Platform Connection
Publishing Preparation
Adapter와 Workflow
Secret Reference
Publishing Result
19.4 End-to-End Test

주요 대상:

Workspace 생성
Project 생성
콘텐츠 생성
Editor 저장
Reload 복원
Quality Review
Preview
Publishing Preparation
Draft Save
실제 결과 확인
19.5 Manual Verification

외부 플랫폼 UI와 Session을 사용하는 Workflow는 실제 계정에서 수동 검증을 병행한다.

자동 테스트 통과만으로 실제 Tistory 또는 WordPress 결과를 보장하지 않는다.

19.6 Recovery Test

다음 실패를 의도적으로 검증한다.

AI Provider 오류
Network 오류
Autosave 오류
Browser Worker 오류
Session 만료
Platform Login Redirect
Category 조회 실패
HTML 입력 실패
Image Upload 실패
Draft Save 실패
Result Verification 실패
Application 재시작
20. Severity Classification
Severity	Meaning	Release Decision
Critical	데이터 손실, 권한 우회, 잘못된 외부 공개, Secret 노출	즉시 차단
High	핵심 Workflow 완료 불가, 반복 실패, 잘못된 계정 작업	원칙적으로 차단
Medium	우회 가능한 기능 오류, 일부 상태 불일치	영향도에 따라 판단
Low	표현, 사소한 UI, 비핵심 개선	Known Issue로 허용 가능
Critical Examples
저장 완료로 표시되었지만 실제 데이터 없음
다른 Workspace 계정에 Draft 저장
Public Publish OFF 상태에서 공개 발행
API Key 또는 Session 원문 노출
기존 콘텐츠 자동 삭제
Publishing 실패가 Content 삭제로 이어짐
Permission Gate 우회
Backup 없이 대규모 데이터 삭제
High Examples
콘텐츠 Generation 불가
Editor Reload 후 콘텐츠 유실
Quality 승인 후에도 Draft Save 불가
실제 Draft가 없는데 성공으로 기록
Session 만료 후 복구 불가
잘못된 Category 저장
중복 Draft 반복 생성
21. Release Blocking Conditions

다음 중 하나라도 발생하면 Release를 중단한다.

Critical 문제 존재
해결되지 않은 데이터 손실 가능성
Permission Gate 우회 가능
Secret 노출 가능
잘못된 계정에 외부 작업 가능
Public Publish 비활성 상태에서 공개 발행 가능
실제 외부 결과 없이 성공 처리
Primary User Flow 완료 불가
저장 및 복원 실패
Migration이 기존 데이터를 손상시킴
필수 문서와 구현이 충돌
필수 테스트 미통과
Rollback 또는 Recovery 경로 없음
22. Allowed Known Issues

다음 조건을 모두 만족하는 문제는 제한적으로 Known Issue로 허용할 수 있다.

Critical 또는 High가 아니다.
데이터 손실이 없다.
Permission과 Security에 영향이 없다.
핵심 Workflow 완료를 막지 않는다.
사용자에게 명확히 안내할 수 있다.
우회 방법이 안전하다.
다음 Release의 수정 계획이 있다.

Known Issue에는 다음을 기록한다.

증상
영향 범위
우회 방법
수정 예정 Release
관련 테스트
담당 영역
23. Release Candidate Process
23.1 Scope Freeze

Release Candidate 진입 시 새로운 기능 추가를 중단한다.

허용 작업:

Bug Fix
Test 보강
Documentation 정합성
성능 개선
오류 메시지 개선
Release 차단 문제 해결

금지 작업:

새로운 Epic
Architecture 변경
새로운 플랫폼
신규 AI Agent
데이터 모델 대규모 변경
시각 디자인 전면 교체
23.2 Candidate Verification
Scope Freeze
    ↓
Build
    ↓
Static Validation
    ↓
Unit Test
    ↓
Integration Test
    ↓
End-to-End Test
    ↓
Manual Platform Verification
    ↓
Failure Recovery Verification
    ↓
Documentation Review
    ↓
Release Decision
23.3 Candidate Identification

각 Release Candidate는 식별 가능한 Version 또는 Tag를 가져야 한다.

예:

v0.1.0-alpha.1
v0.1.0-alpha.2
v0.1.0-rc.1
24. Versioning Policy

Bright Studio는 Semantic Versioning을 기본 참고 규칙으로 사용한다.

MAJOR.MINOR.PATCH
Major
호환되지 않는 Data Model 변경
핵심 Workflow 또는 Platform Contract 대규모 변경
사용자 Migration이 필요한 변경
Minor
새로운 사용자 가치
새로운 Epic
새로운 Platform
기존 호환성을 유지하는 기능 확장
Patch
Bug Fix
성능 개선
문서 수정
호환성을 유지하는 안정화

초기 개발 단계에서는 다음 식별자를 사용할 수 있다.

alpha
beta
rc

Version 번호만으로 Release 품질을 판단하지 않는다.

25. Release Approval Checklist
Product
 Release 목표가 명확하다.
 Primary User Flow가 완료된다.
 In Scope 기능이 구현되었다.
 Out of Scope 기능이 실수로 노출되지 않는다.
 사용자에게 다음 행동이 명확하다.
Content
 AI Generation이 실제 콘텐츠를 만든다.
 Content Model이 유효하다.
 Editor에서 정상 수정할 수 있다.
 Autosave가 실제로 완료된다.
 Revision 복원이 가능하다.
Quality
 현재 Revision을 평가한다.
 Quality 상태가 정확하다.
 Outdated 상태가 처리된다.
 개선 후 기존 Revision이 보존된다.
 Publishing Gate와 연결된다.
Publishing
 대상 Platform이 정확하다.
 대상 Account가 정확하다.
 Category가 실제 값이다.
 Preview가 정상이다.
 Permission Gate가 통과 또는 차단한다.
 외부 결과가 실제로 검증된다.
 실패한 작업만 재시도할 수 있다.
Data and Security
 데이터 손실 문제가 없다.
 Secret 원문이 노출되지 않는다.
 Workspace 경계가 유지된다.
 위험한 작업에 확인이 있다.
 Backup 및 복구 경로가 있다.
Testing
 Static Validation 통과
 Unit Test 통과
 Integration Test 통과
 End-to-End Test 통과
 Manual Platform Verification 통과
 Failure Recovery Test 통과
 Regression Test 통과
Documentation
 PRD 최신
 Roadmap 최신
 User Flow 최신
 Feature Specification 최신
 Product Architecture 최신
 Release Plan 최신
 Known Issues 기록
 Release Notes 준비
26. Rollback Policy

Release 이후 다음 문제가 발생하면 Rollback을 검토한다.

데이터 손실
Permission 우회
Secret 노출
잘못된 외부 발행
Workspace 데이터 혼합
반복적인 Application 실행 불가
Migration 실패
핵심 Draft Workflow 전면 실패
Rollback Priorities
외부 작업 중단
추가 데이터 손상 방지
사용자 데이터 Backup
이전 안정 버전 복구
원인 기록
영향을 받은 데이터 조사
수정 버전 검증
재배포 승인

Rollback 과정에서 사용자의 최신 콘텐츠를 무조건 이전 버전으로 덮어쓰지 않는다.

Application Version Rollback과 User Data Rollback을 구분한다.

27. Migration Policy

데이터 구조 변경이 있는 Release는 Migration 계획을 가져야 한다.

필수 항목:

기존 Version
Target Version
변경되는 Schema
Backup 위치
Migration 절차
실패 처리
Rollback 가능 여부
검증 Query 또는 Test
사용자 영향
Migration Rules
Migration 전 Backup
반복 실행 안전성
부분 실패 감지
성공 여부 기록
기존 데이터 무단 삭제 금지
Legacy 데이터 호환 또는 명시적 변환
Migration 실패를 Application 정상 상태로 표시하지 않음
28. Post-Release Monitoring

Release 이후 다음을 관찰한다.

Application Start 오류
Workspace Load 오류
Project Load 오류
AI Generation 실패율
Autosave 실패율
Quality Review 실패율
Preview 실패율
Draft Save 실패율
External Verification 실패율
Session 만료 빈도
중복 Draft 발생
데이터 복구 요청
사용자 차단 Workflow
Monitoring Period

Release 유형에 따라 안정화 기간을 둔다.

Internal Alpha: 실행 직후 집중 관찰
Personal Alpha: 실제 운영 단위 관찰
Stable: 반복 사용 관찰
Beta: 사용자 집단별 관찰
Public: 지속적 운영 Monitoring

새로운 대형 기능은 이전 Release의 안정화 기간과 주요 문제 해결 후 시작한다.

29. Release Notes Requirements

각 Release는 다음 내용을 포함하는 Release Notes를 제공한다.

Version
Release Date
Release Type
핵심 사용자 가치
추가 기능
개선 기능
수정된 문제
알려진 제한
Data Migration 여부
Platform Connection 영향
사용자 확인 필요 사항
Rollback 가능 여부
다음 Release 방향

내부 Commit 목록만 Release Notes로 사용하지 않는다.

30. Current Release Decision

현재 Bright Studio는 다음 상태로 판단한다.

Release 0 — Internal Foundation
Status: Implemented
Release 1 — Personal Tistory Alpha
Status: In Development

현재 최우선 Release 목표는 다음과 같다.

자연어 콘텐츠 요청
    ↓
AI 분석
    ↓
콘텐츠 생성
    ↓
Editor 수정 및 저장
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Tistory Draft Save
    ↓
실제 Draft 검증

기반 기능이 구현되었다는 이유만으로 Release 1 완료로 판단하지 않는다.

실제 Tistory 계정에서 End-to-End 검증이 완료되어야 한다.

31. Release 1 Final Acceptance Scenario

다음 Scenario가 실제로 통과해야 한다.

Scenario A — Normal Flow
Application을 실행한다.
Workspace를 생성하거나 선택한다.
Tistory를 Enabled Platform으로 설정한다.
Tistory 계정 연결 상태를 확인한다.
Project를 생성한다.
자연어로 콘텐츠를 요청한다.
AI 분석 결과와 추천 Keyword를 확인한다.
콘텐츠 생성을 승인한다.
생성된 콘텐츠가 Editor에 표시된다.
제목과 본문을 수정한다.
저장 완료를 확인한다.
페이지를 새로고침한다.
수정 내용이 복원되는지 확인한다.
Quality Review를 실행한다.
필요한 경우 콘텐츠를 개선한다.
Tistory Preview를 확인한다.
실제 Tistory Account를 선택한다.
실제 Category를 선택한다.
임시저장을 실행한다.
Permission Gate가 실행되는지 확인한다.
Tistory Editor에 콘텐츠가 입력되는지 확인한다.
임시저장이 완료되는지 확인한다.
실제 Tistory Draft 목록에서 콘텐츠를 확인한다.
Bright Studio에 결과가 기록되는지 확인한다.
Scenario B — Session Expired
저장된 Tistory Session을 만료시킨다.
Draft Save를 실행한다.
시스템이 Login Redirect 또는 Session 만료를 감지한다.
Publishing Job을 Failed 상태로 기록한다.
Content와 Revision이 보존되는지 확인한다.
사용자에게 재연결 방법을 표시한다.
Tistory에 다시 로그인한다.
기존 Publishing Preparation으로 복귀한다.
실패한 Draft Save만 다시 실행한다.
실제 Draft를 확인한다.
Scenario C — AI Failure
AI Provider를 실패 상태로 만든다.
콘텐츠 생성을 실행한다.
Loading이 종료되는지 확인한다.
자연어 요청과 사용자 설정이 보존되는지 확인한다.
빈 Content가 성공 결과로 저장되지 않는지 확인한다.
정상 Provider 상태에서 다시 실행한다.
콘텐츠가 정상 생성되는지 확인한다.
Scenario D — Autosave Failure
Editor에서 콘텐츠를 수정한다.
저장 실패 상황을 만든다.
저장 실패가 명확히 표시되는지 확인한다.
기존 저장 Revision이 보존되는지 확인한다.
다른 Project로 전환할 때 경고 또는 재시도가 동작하는지 확인한다.
저장 복구 후 최신 내용이 유지되는지 확인한다.
Scenario E — Permission Denied
Draft Save Permission을 비활성화한다.
임시저장을 요청한다.
UI와 실행 계층 모두에서 작업이 차단되는지 확인한다.
Playwright Worker가 실행되지 않는지 확인한다.
콘텐츠와 Preparation이 보존되는지 확인한다.

Release 1은 Scenario A와 주요 실패 Scenario가 통과해야 승인한다.

32. Definition of Release Done

Release는 다음 조건을 모두 충족했을 때 완료된다.

승인된 사용자 가치가 실제로 제공된다.
Primary End-to-End Flow가 통과한다.
주요 실패 흐름에서 데이터가 보존된다.
외부 결과가 실제로 검증된다.
Permission과 Security가 검증된다.
Critical 및 High 차단 문제가 없다.
필수 Test Suite가 통과한다.
Regression이 없다.
관련 문서가 최신 상태다.
Known Issue와 제한사항이 기록된다.
Rollback 또는 Recovery 경로가 존재한다.
제품 소유자가 Release를 승인한다.
33. Guiding Principle

Bright Studio는 기능이 존재하기 때문에 출시하지 않는다.

사용자가 다음 과정을 안전하게 완료할 수 있을 때 출시한다.

원하는 콘텐츠를 설명한다
    ↓
전문적인 콘텐츠를 얻는다
    ↓
쉽게 수정하고 검토한다
    ↓
콘텐츠를 잃지 않는다
    ↓
올바른 플랫폼과 계정에 전달한다
    ↓
실제 결과를 확인한다

모든 Release 결정은 다음 질문을 통과해야 한다.

사용자가 실제 목적을 끝까지 완료할 수 있는가?
실패해도 콘텐츠와 설정이 보존되는가?
외부 작업이 사용자 권한 안에서만 실행되는가?
실제 결과를 확인할 수 있는가?
기존 기능을 손상시키지 않는가?
문제가 생겼을 때 복구할 수 있는가?
문서와 구현이 일치하는가?

Bright Studio는 빠른 출시보다 신뢰할 수 있는 출시를 우선한다.
