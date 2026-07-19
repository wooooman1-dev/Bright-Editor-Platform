# User Flow

**Version:** 3.1
**Status:** Approved
**Document Type:** Product User Flow
**Internal Project Name:** Bright Editor Platform
**User-facing Product Name:** Bright Studio

---

# 1. Purpose

이 문서는 Bright Studio에서 사용자가 콘텐츠를 기획하고 생성하고 편집하고 검토한 뒤 외부 플랫폼에 임시저장하거나 발행하기까지의 전체 사용자 흐름을 정의한다.

이 문서는 다음 작업의 기준으로 사용한다.

- 화면 설계
- 기능 연결
- 사용자 경험 설계
- 상태 전환
- 오류 및 복구 설계
- 통합 테스트
- Sprint 완료 검증
- Release 판단

사용자 흐름은 화면 이동만 의미하지 않는다.

각 단계는 다음 요소를 함께 정의해야 한다.

- 사용자가 보는 정보
- 사용자가 수행하는 행동
- 시스템이 수행하는 처리
- AI가 수행하는 판단
- 다음 단계로 이동하기 위한 조건
- 실패 시 복구 방법

---

# 2. User Experience Principles

Bright Studio는 복잡한 AI 설정 도구처럼 보여서는 안 된다.

기본 사용자 경험은 다음과 같이 단순해야 한다.

```text
무엇을 만들지 말한다
    ↓
Bright Studio가 방향을 분석한다
    ↓
사용자가 확인한다
    ↓
Bright Studio가 완성 콘텐츠를 만든다
    ↓
사용자가 검토하고 수정한다
    ↓
Bright Studio가 품질을 검토한다
    ↓
사용자가 플랫폼 결과를 확인한다
    ↓
안전하게 임시저장한다

내부적으로는 Content Model, AI Context, Quality Engine, Platform Adapter와 Publishing Workflow가 동작하지만, 일반 사용자에게 내부 구조를 학습하도록 요구해서는 안 된다.

주요 UX 원칙은 다음과 같다.

한국어 기본
최소 입력 우선
고급 설정은 선택적으로 제공
추천 중심
명확한 다음 행동
실제 상태와 UI 상태 일치
실패 시 입력과 콘텐츠 보존
일반 문서 편집기와 유사한 Editor 경험
위험한 외부 작업 전 명시적 확인
Fixture와 Live 상태 명확히 구분
3. Primary End-to-End Flow

Bright Studio의 핵심 사용자 흐름은 다음과 같다.

Home
    ↓
Workspace 선택 또는 생성
    ↓
Project 선택 또는 생성
    ↓
Create Content
    ↓
자연어 요청 입력
    ↓
AI 분석
    ↓
대표 키워드 간편 확인
    ↓
사용자 승인
    ↓
AI 콘텐츠 생성
    ↓
Editor
    ↓
Quality Review
    ↓
콘텐츠 개선
    ↓
Platform Preview
    ↓
Publishing Preparation
    ↓
Permission Gate
    ↓
Platform Draft Save
    ↓
외부 결과 검증
    ↓
Content Library 및 Intelligence 갱신

### 3.1 대표 키워드 확인과 AI 분석 표시 정책

기본 생성 흐름은 긴 AI 분석 결과를 독립 화면으로 노출하지 않는다. AI 분석이 끝나면 기존 생성 화면 안에 Content Opportunity 후보와 명시적 확정 버튼이 있는 간결한 확인 카드를 표시한다. 각 후보는 선정 주제, 대표 키워드, 검색 의도, 보조 키워드, 주요 범위, 추천 근거와 데이터 출처를 하나의 세트로 보여 준다. 추천 1순위는 기본 선택할 수 있지만 사용자가 확정 버튼을 누르기 전에는 콘텐츠 생성 API를 호출하지 않는다.

AI 자동 선정 모드에서는 프로젝트 전략과 기존 콘텐츠 공백을 바탕으로 아직 다루지 않은 Content Opportunity를 제안한다. 사용자 지정 모드에서는 사용자가 명시한 주제를 고정하고 같은 검색 의도 안에서만 후보를 만든다. 검색량 공급원이 연결되지 않은 현재 상태에서는 `AI 추정`, `콘텐츠 공백 추론`, `근거 미확인`을 구분하며 검색량·CPC·경쟁도 수치를 만들거나 실제 데이터처럼 표현하지 않는다.

Planning 후보는 확정값이 아니다. 사용자가 후보를 선택하면 대표 키워드 문자열만이 아니라 주제·검색 의도·보조 키워드·독자 문제·콘텐츠 방향·예상 범위·근거가 포함된 Opportunity 전체가 Content에 snapshot으로 저장된다. `Content.primaryKeyword`는 이 snapshot의 SEO mirror이며 생성 요청의 첫 키워드, Quality Context, Final Review, AI 수정, 품질 개선과 발행 준비가 같은 Opportunity를 공유한다. 직접 입력한 키워드는 기존 후보의 나머지 필드와 즉시 결합하지 않으며, 해당 키워드를 명시한 기존 Planning 호출로 완전한 Opportunity를 다시 확인한 뒤에만 생성할 수 있다.

확정된 Content에는 기존 Planning 결과를 함께 보존한다. Editor의 제목 영역 근처에는 대표 키워드·검색 의도·대상 독자 요약을 표시하고, 전체 AI 분석은 기본적으로 접힌 `AI 분석 상세보기`에서 복원한다. 상세보기를 열거나 닫아도 문서 편집 상태를 변경하지 않으며 별도 AI 호출을 만들지 않는다.

AI 결과는 Canonical Document로 채택하기 전에 확정 Opportunity의 주제, 대표 키워드, 검색 의도, 목차, 본문 핵심 범위와 보조 키워드 지원을 먼저 검증한다. 본문과 목차가 같은 기획을 따르고 제목만 대표 키워드 표현을 빠뜨린 경우에만 Core SEO 정책이 NFKC와 공백을 정규화해 한 번 자연스럽게 보정한다. 다른 주제의 제목·본문에는 키워드를 접두어로 결합하지 않으며 Quality 승인과 발행 준비를 차단한다. 사용자가 Editor에서 직접 제목을 수정해 키워드를 제거한 경우 Autosave가 강제로 되돌리지 않고 명시적 보정 선택을 제공한다.

Opportunity 저장은 generation보다 먼저 완료되어야 한다. 서버는 Workspace·Project·Content 소유권, opportunity ID/version/fingerprint, 주제, 대표 키워드, 검색 의도와 보조 키워드가 저장된 snapshot과 모두 일치하는지 확인하고 클라이언트의 개별 기획 필드 대신 서버 snapshot을 생성 입력으로 사용한다. 오래된 Autosave와 AI Workflow 결과가 경합해도 확정 Opportunity와 그 canonical mirror를 제거하거나 다른 Content의 값으로 바꿀 수 없다.

Planning 요청을 시작하면 후보 확정 전이라도 Project에 속한 임시 Content와 workflow snapshot을 먼저 저장한다. 분석 중 이동하거나 새로고침해도 같은 Content ID의 요청, 단계, 후보 전체, 선택 ID, 오류와 재시도 지점을 복원하며 재진입만으로 새 AI 요청을 만들지 않는다. 명시적 재분석은 새 operation ID와 revision으로 시작하고, 이전 응답은 최신 후보를 덮어쓸 수 없다.

현재 첫 번째 실제 플랫폼 검증 대상은 Tistory이다.

초기 Release의 핵심 성공 기준은 다음 통합 흐름이다.

Workspace
    ↓
Project
    ↓
Create Content
    ↓
AI 분석
    ↓
대표 키워드 간편 확인
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
실제 Draft 확인
4. Product Navigation

Bright Studio의 주요 화면 관계는 다음과 같다.

Home

├── Workspace 생성
├── Workspace 선택
└── 최근 작업 계속하기

Workspace

├── Workspace Dashboard
├── Project 목록
├── Content Library
├── 최근 콘텐츠
├── Platform 상태
└── Workspace Settings

Project

├── Project Dashboard
├── Create Content
├── Content Library
├── Project DNA
├── Publishing History
└── Project Settings

Content

├── Planning
├── Editor
├── Quality Review
├── Preview
├── Publishing Preparation
└── Publishing Result

Settings

├── Overview
├── AI
├── Enabled Platforms
├── Platform Connections
├── Publishing
├── Automation
├── Workspace
├── Appearance
└── Danger Zone

Sidebar 또는 다른 Navigation 구조를 임의로 추가하지 않는다.

화면 구조를 변경할 때는 기존 Product Navigation과 사용자 이동 경로를 우선 검토한다.

5. First-Run and Workspace Flow
5.1 First-Run Entry

사용자가 Bright Studio를 처음 실행했으며 Workspace가 없는 경우 다음 흐름을 따른다.

Application Start
    ↓
Workspace 없음 확인
    ↓
Welcome
    ↓
Workspace 생성
    ↓
Enabled Platforms 선택
    ↓
Platform Connection 안내
    ↓
연결 또는 건너뛰기
    ↓
Workspace 진입
5.2 Welcome Screen

사용자는 다음 정보를 본다.

Bright Studio의 간단한 소개
새 Workspace 만들기
기존 Workspace가 있다면 Workspace 목록
최근 활성 Workspace

기술 Architecture나 내부 엔진 설명은 기본 화면에 표시하지 않는다.

Workspace가 없으면 새 작업공간 만들기를 가장 명확한 Primary Action으로 제공한다.

5.3 Workspace Creation

필수 입력:

Workspace Name

선택 입력:

Description

규칙:

이름은 비어 있을 수 없다.
앞뒤 공백은 정리한다.
저장이 완료되기 전에 생성 완료로 표시하지 않는다.
생성 후 빈 Dashboard로 바로 보내지 않고 Enabled Platforms 단계로 이동한다.
5.4 Workspace Ownership

Workspace는 다음 항목을 소유한다.

Brand
Project
Platform Connection
Publishing Account
Workspace Settings
Permission Policy
Assets

Workspace와 Brand는 동일한 개념이 아니다.

6. Enabled Platforms and Connection Onboarding
6.1 Enabled Platforms

사용자는 Workspace에서 사용할 플랫폼을 선택한다.

초기 후보는 다음과 같다.

Tistory
WordPress
YouTube
Naver Cafe

플랫폼 상태는 기능별로 구분한다.

콘텐츠 생성 지원
Preview 지원
연결 지원
Draft Save 지원
Public Publish 지원
준비 중
미지원

지원하지 않는 기능을 정상 동작하는 것처럼 표시해서는 안 된다.

6.2 Platform Selection Rules
플랫폼 연결 없이도 Workspace에 진입할 수 있다.
플랫폼 연결 없이도 콘텐츠 생성은 가능하다.
비활성 플랫폼은 새 생성 및 발행 Workflow에서 기본 제외한다.
이후 Settings에서 활성 상태를 변경할 수 있다.
기존 콘텐츠와 발행 이력은 플랫폼 비활성화로 삭제하지 않는다.
6.3 Connection Onboarding
Enabled Platform 확인
    ↓
연결 가능한 플랫폼 표시
    ↓
계정 연결
또는
나중에 연결
    ↓
Workspace 진입

플랫폼별 상태:

Connected
Connection Required
Needs Login
Session Expired
Error
Unsupported

인증 정보, Cookie, Session, API Key 원문은 화면에 표시하지 않는다.

7. Home and Workspace Dashboard
7.1 Home States

Home은 저장된 데이터 상태에 따라 다르게 표시한다.

Workspace 없음
Workspace 생성 안내
불필요한 빈 콘텐츠 목록 미표시
Workspace만 존재
Workspace 진입
첫 Project 생성 안내
Project 존재, 콘텐츠 없음
콘텐츠 만들기 안내
활성 Project 표시
작업 중 콘텐츠 존재
Continue Working
최근 수정 콘텐츠
최근 Project
발행 이력 존재
최근 콘텐츠
최근 Draft Save 또는 Publish 상태
다음 추천 작업

Continue Working은 실제 활성 Project 또는 최근 콘텐츠가 있을 때만 표시한다.

7.2 Workspace Dashboard

사용자는 다음 정보를 본다.

Workspace Name
Project 목록
최근 콘텐츠
최근 작업
연결된 플랫폼
연결 문제
콘텐츠 만들기
Project 만들기
Settings 이동

Primary Actions:

새 Project 만들기
기존 Project 열기
최근 콘텐츠 계속 편집
Platform Connection 문제 해결

Dashboard 통계와 상태는 실제 저장된 Live 데이터를 기준으로 한다.

Fixture를 사용하는 경우 반드시 Fixture임을 명시한다.

8. Project Creation and Project Dashboard
8.1 Project Creation

필수 입력:

Project Name
Workspace

선택 입력:

Brand
Description
Main Category
Default Platform
Default Content Type

기본 흐름:

새 Project 만들기
    ↓
Project 이름 입력
    ↓
Brand 선택 또는 미선택
    ↓
기본 콘텐츠 정보 입력
    ↓
Project 생성
    ↓
Project DNA 설정 제안
    ↓
Project Dashboard 진입
8.2 Brand Rules

Brand는 선택 항목이다.

정상적인 소유 구조는 다음 두 형태를 모두 지원한다.

Workspace
└── Project
Workspace
└── Brand
    └── Project

Project의 직접 소유자는 항상 Workspace이다.

8.3 Project Dashboard

사용자는 다음 정보를 본다.

Project Name
Project 설명
Project DNA 요약
최근 콘텐츠
콘텐츠 상태
최근 품질 결과
최근 임시저장 결과
기본 플랫폼
다음 추천 작업

Primary Actions:

콘텐츠 만들기
기존 콘텐츠 열기
Project DNA 수정
Content Library 보기
Publishing History 보기
Project Settings 열기

콘텐츠가 없는 경우 다음 행동을 명확히 안내한다.

무엇을 만들고 싶은지 Bright Studio에 말해 주세요.
9. Project DNA Flow

Project DNA는 콘텐츠를 만들 때마다 반복 입력해야 하는 전략을 Project에 저장한다.

9.1 Entry Points
Project 생성 직후
Project Dashboard
Project Settings
Create Content 시작 전
9.2 Basic Settings
주요 주제
대상 독자
기본 콘텐츠 유형
기본 플랫폼
기본 톤
목표 분량
9.3 Advanced Settings
세부 주제
제외 주제
검색 의도 전략
SEO 정책
이미지 정책
CTA 정책
내부 링크 정책
관련 콘텐츠 정책
품질 목표
기본 발행 계정
기본 플랫폼 카테고리
9.4 Flow
Project DNA 설정 시작
    ↓
기본 전략 입력
    ↓
선택적 고급 전략 입력
    ↓
설정 요약 확인
    ↓
저장
    ↓
Project에 적용
9.5 Rules
Project DNA 입력을 완료하지 않아도 콘텐츠 생성은 가능하다.
설정되지 않은 값에는 안전한 System Default를 사용한다.
우선순위는 다음과 같다.
제품 안전 정책
    ↓
현재 사용자 요청
    ↓
콘텐츠별 Override
    ↓
Project DNA
    ↓
Brand Default
    ↓
System Default
Project DNA 변경이 기존 발행 콘텐츠를 자동 변경해서는 안 된다.
사용자는 어떤 기본 전략이 자동 적용되었는지 확인할 수 있어야 한다.
10. Create Content and Natural Language Request
10.1 Entry Points
Home
Workspace Dashboard
Project Dashboard
Content Library
최근 작업 추천
10.2 Required Context

콘텐츠 생성에는 다음 문맥이 필요하다.

Workspace
Project

Project가 선택되지 않은 상태에서는 먼저 Project 선택 또는 생성을 요청한다.

10.3 Natural Language Input

사용자는 자연어로 무엇을 만들지 입력한다.

예:

40대 여성이 집에서 따라 할 수 있는 허리 운동 글을 만들어 주세요.
초보자도 쉽게 이해할 수 있게 설명하고 티스토리용으로 작성해 주세요.
10.4 Optional Controls
대상 플랫폼
콘텐츠 유형
전체 도메인 카테고리
원본 콘텐츠
참고 키워드
제외 조건
목표 분량
콘텐츠별 Override

기본 화면에서는 자연어 입력과 핵심 선택만 보여준다.

고급 설정은 필요할 때 펼쳐서 사용한다.

10.5 Platform Target Selection

Enabled Platforms만 기본 선택 대상으로 표시한다.

예:

☑ Tistory
☐ WordPress
☐ YouTube
☐ Naver Cafe

생성 가능 상태와 발행 가능 상태를 구분한다.

여러 플랫폼을 선택하면 공통 전략은 재사용하되, 각 플랫폼 콘텐츠는 별도로 최적화한다.

동일한 HTML을 모든 플랫폼에 그대로 복사하지 않는다.

11. AI Analysis and User Confirmation

최종 콘텐츠 생성 전에 AI는 요청을 분석하고 사용자 확인을 받아야 한다.

11.1 Analysis Process
User Request
    ↓
Project DNA 조회
    ↓
Content Intelligence 조회
    ↓
Search Intent 분석
    ↓
Reader 분석
    ↓
Keyword 후보 생성
    ↓
Topic 및 기존 콘텐츠 검사
    ↓
중복 위험 분석
    ↓
콘텐츠 방향 생성
11.2 User Sees
이해한 주제
대상 독자
검색 의도
추천 핵심 키워드
추천 보조 키워드
추천 콘텐츠 유형
예상 구성
대상 플랫폼
예상 분량
Project DNA 적용 내용
기존 콘텐츠 중복 위험
추천 작성 방향
11.3 User Actions
그대로 생성
키워드 수정
대상 독자 수정
콘텐츠 방향 수정
플랫폼 수정
다시 분석
생성 취소
11.4 Confirmation Rules
분석 결과를 완성 콘텐츠처럼 표시하지 않는다.
사용자 확인 전 최종 Generation을 실행하지 않는다.
높은 중복 위험이 있다면 차별화 방향을 제안한다.
새 글보다 기존 글 업데이트가 적절한 경우 해당 선택지를 제공한다.
AI 추천을 사용자가 수정하거나 거절할 수 있어야 한다.
12. Duplicate Detection Flow

중복 검사는 AI 분석 단계와 Generation 이후에 실행할 수 있다.

12.1 Detection Signals
검색 의도 유사성
주제 유사성
제목 유사성
Keyword 중복
Outline 유사성
콘텐츠 목적
대상 독자
기존 Draft
Published Content
Repurposing 관계
12.2 Risk States
None
Low
Medium
High
Critical
12.3 User Sees
유사 콘텐츠 제목
콘텐츠 상태
유사한 이유
검색 의도 관계
Keyword 관계
추천 행동
12.4 Recommended Actions
새 글로 계속
검색 의도 변경
차별화 방향 적용
기존 콘텐츠 업데이트
기존 콘텐츠와 통합
생성 취소
12.5 Rules
Keyword 일치만으로 중복 처리하지 않는다.
같은 원본의 플랫폼 변환은 중복 콘텐츠로 잘못 판단하지 않는다.
사용자 승인 없이 기존 콘텐츠를 덮어쓰지 않는다.
Critical 위험은 Publishing Preparation에서도 다시 표시한다.
13. AI Generation Flow
13.1 Generation Confirmation

최종 Generation 전에 다음 내용을 확인한다.

Project
콘텐츠 주제
검색 의도
대상 독자
핵심 키워드
대상 플랫폼
예상 분량
Project DNA 적용 여부
중복 위험

필요한 경우 AI 실행 구조를 간단히 표시할 수 있다.

콘텐츠 생성 1회
품질 검토 1회

복잡한 Token 또는 내부 Prompt 정보는 기본 사용자 화면에 표시하지 않는다.

13.2 Processing State

권장 진행 문구:

요청 분석 중
콘텐츠 구조 설계 중
본문 작성 중
SEO와 이미지 전략 반영 중
최종 편집 중
콘텐츠 구성 중

가짜 퍼센트 또는 실제 처리와 무관한 진행률을 표시하지 않는다.

오류가 발생하면 Loading 상태를 반드시 종료한다.

13.3 Generation Output

생성 결과에는 다음 정보가 포함된다.

Title
Metadata
Search Intent
Keyword Strategy
ContentDocument
Image Strategy
CTA Strategy
Internal Link Requirement
Related Content Requirement
13.4 Success
Generation 완료
    ↓
Content 저장
    ↓
Initial Revision 생성
    ↓
Editor 진입
13.5 Failure
Generation 실패
    ↓
오류 원인 표시
    ↓
입력 유지
    ↓
다시 시도
또는
AI 설정 확인

Generation 실패 시 빈 콘텐츠를 정상 결과로 저장하지 않는다.

기존 콘텐츠 수정 과정에서 실패하면 현재 Revision을 보존한다.

14. Editor, Autosave and History
14.1 Editor Experience

Editor는 일반 문서 편집기처럼 보여야 한다.

내부 Block Model은 Canonical Representation으로 유지하지만, 사용자가 내부 구현을 의식하게 해서는 안 된다.

사용자는 다음을 볼 수 있다.

제목
본문
Heading 구조
이미지
CTA 버튼
Video
내부 링크
목차
저장 상태
품질 상태
Preview
Quality Review
14.2 Editor Actions
제목 수정
본문 수정
문단 추가 및 삭제
H2/H3 변경
이미지 이동
이미지 전략 수정
CTA 이동
링크 수정
Video 이동
Revision History 확인
품질검토 실행
Platform Preview 확인
14.3 UX Rules
Block ID나 JSON을 기본 노출하지 않는다.
H2와 H3는 시각적으로 명확히 구분한다.
버튼은 코드가 아니라 실제 버튼 형태로 보인다.
이미지, 버튼, Video는 문서 흐름 안에서 이동할 수 있어야 한다.
Editor의 변경이 Content Model 무결성을 깨뜨리지 않아야 한다.
14.4 Autosave Flow
사용자 수정
    ↓
변경 감지
    ↓
Autosave 대기
    ↓
저장 요청
    ↓
저장 Transaction 완료
    ↓
저장 완료 표시

Save States:

변경 없음
저장 대기 중
저장 중
저장 완료
저장 실패

규칙:

요청 시작만으로 저장 완료 처리하지 않는다.
실제 저장 완료를 기준으로 성공 처리한다.
Project 또는 콘텐츠 전환 전에 대기 저장을 완료한다.
저장 실패 시 기존 데이터를 유지한다.
페이지 새로고침 후 마지막 저장 상태를 복원한다.
14.5 History and Restore
History 열기
    ↓
Revision 선택
    ↓
미리보기 또는 차이 확인
    ↓
복원 확인
    ↓
새 Revision으로 복원

과거 Revision을 직접 수정하지 않는다.

복원 결과는 새로운 Revision으로 저장한다.

15. Quality Review and Improvement
15.1 Entry Points
Editor
Content Library
Project Dashboard
Publishing Preparation
15.2 Review Flow
저장된 Revision
    ↓
Rule Validation
    ↓
AI Quality Review
    ↓
Quality Report
    ↓
목표 점수 비교
    ↓
승인 또는 개선 필요
15.3 Quality Areas
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
15.4 Result States
Approved
목표 품질 충족
Preview 및 Publishing Preparation 진행 가능
Needs Improvement
목표 미달
개선 항목 표시
자동 개선 또는 직접 수정 가능
Review Failed
AI 또는 Rule Validation 실패
기존 콘텐츠 유지
재시도 가능
15.5 Report Rules
Quality Report는 평가 대상 Revision과 연결한다.
콘텐츠 수정 후 기존 Report는 outdated 상태가 된다.
오래된 점수를 현재 점수처럼 표시하지 않는다.
단순 체크리스트 개수만으로 100점을 주지 않는다.
품질 기준을 완화하여 목표 점수를 만들지 않는다.
15.6 Automatic Improvement
Needs Improvement
    ↓
개선 항목 확인
    ↓
자동 개선 선택
    ↓
기존 Revision 보존
    ↓
개선 Revision 생성
    ↓
Rule Validation
    ↓
Quality Review 재실행

자동 개선은 다음 원칙을 지킨다.

사용자 핵심 의도 유지
Project DNA 유지
콘텐츠별 Override 유지
검증된 URL 유지
기존 Revision 보존
무제한 반복 개선 금지

Quality Approval Required가 활성화된 경우 승인되지 않은 콘텐츠는 외부 발행 실행 단계로 이동할 수 없다.

16. Image, CTA and Video Flow
16.1 Image Strategy

각 이미지에는 다음 정보가 연결된다.

이미지 유형
이미지 목적
추천 위치
Prompt
ALT
Source 상태

Image States:

전략만 존재
이미지 필요
로컬 이미지 연결
업로드 준비
플랫폼 업로드 완료
업로드 실패

사용자 Actions:

Prompt 복사
로컬 이미지 선택
이미지 교체
이미지 연결 해제
위치 이동
ALT 수정

이미지가 없어도 콘텐츠 생성 자체는 실패하지 않는다.

이미지 전략과 실제 Asset을 구분한다.

16.2 CTA

CTA에는 다음 정보가 연결된다.

목적
버튼 문구
URL
추천 위치
Link Type

내부 CTA:

target="_self"

외부 CTA:

target="_blank"
rel="noopener noreferrer"

URL이 없으면 입력 필요 상태로 표시한다.

AI는 승인되지 않은 URL을 생성해서는 안 된다.

CTA는 항상 필수가 아니다.

16.3 Video

Video는 Content Model의 재사용 가능한 Block으로 관리한다.

사용자는 다음을 수행할 수 있다.

YouTube URL 연결
Embed Preview 확인
위치 이동
설명 수정
연결 해제

블로그 콘텐츠에서는 기본적으로 YouTube Embed를 활용할 수 있다.

17. Content Intelligence Recommendations
17.1 Internal Link Flow
현재 콘텐츠 분석
    ↓
Published Registry 조회
    ↓
Verified 콘텐츠 필터
    ↓
검색 의도 및 독자 흐름 비교
    ↓
추천 위치 계산
    ↓
후보 제공

사용자가 보는 정보:

추천 콘텐츠 제목
추천 이유
추천 Anchor
추천 위치
Verified URL

사용자 Actions:

적용
Anchor 수정
위치 수정
제외
다른 추천 확인

규칙:

Verified Published Content만 사용한다.
존재하지 않는 URL을 생성하지 않는다.
현재 콘텐츠 자신을 추천하지 않는다.
동일 URL을 과도하게 반복하지 않는다.
내부 링크는 기본적으로 현재 창에서 연다.
17.2 Related Content

관련 콘텐츠는 본문 하단에서 독자에게 도움이 될 다음 콘텐츠를 추천한다.

기본적으로 최대 3개를 제안할 수 있다.

추천 기준:

Reader Journey
Search Intent Continuity
Topic Relationship
Practical Usefulness
Content Quality
Publication Verification
Recommendation Diversity

Keyword 유사도만으로 추천하지 않는다.

사용자는 추천을 수락, 수정, 교체 또는 삭제할 수 있다.

17.3 Intelligence Memory Update

콘텐츠 생성, 품질 승인, 발행 검증 이후 다음 정보가 갱신될 수 있다.

Search Intent Memory
Keyword Memory
Topic Memory
Duplicate Candidates
Published Content Registry
Recommendation Candidates

Draft와 Published 상태를 구분한다.

실제 공개 발행이 검증되지 않은 Draft URL은 Published Content로 처리하지 않는다.

18. Platform Preview Flow

Platform Preview는 저장된 최신 Content Revision을 대상 플랫폼 형식으로 확인하는 단계이다.

18.1 Flow
Preview 선택
    ↓
Target Platform 선택
    ↓
Platform Renderer 실행
    ↓
Preview 생성
    ↓
사용자 확인
18.2 Preview Types
Canonical Preview
Tistory Preview
WordPress Preview
향후 Platform Preview
18.3 User Sees
제목
본문
목차
이미지
버튼
Video
내부 링크
관련 콘텐츠
Platform Metadata
Rendering 상태
18.4 Rules
Preview는 원본 ContentDocument를 변경하지 않는다.
최신 저장 Revision을 사용한다.
플랫폼별 Renderer 결과를 사용한다.
지원하지 않는 Preview를 성공한 것처럼 표시하지 않는다.
실제 플랫폼 Editor와 차이가 있을 경우 필요한 안내를 제공한다.
19. Publishing Preparation Flow

Publishing Preparation은 외부 플랫폼 작업 전에 대상과 실행 조건을 최종 확인하는 단계이다.

19.1 Flow
Platform Preview
    ↓
Publishing Preparation
    ↓
Platform 선택
    ↓
Publishing Account 선택
    ↓
Platform Category 선택
    ↓
Content Revision 확인
    ↓
Quality 상태 확인
    ↓
Image 및 Link 상태 확인
    ↓
Permission 확인
    ↓
실행 준비 완료
19.2 User Sees
대상 플랫폼
발행 계정
플랫폼 카테고리
Draft 또는 Public Publish
대상 Content Revision
Quality 상태
이미지 누락
링크 오류
중복 위험
Permission 상태
Automation 상태
실행 가능 여부
19.3 Account Selection

Workspace에 연결된 플랫폼 계정을 표시한다.

예:

Tistory

○ bright-healthy
○ second-blog

Project 기본 계정이 있으면 자동 제안할 수 있다.

세션이 만료된 계정은 실행할 수 없으며 재연결 필요 상태로 표시한다.

19.4 Category Selection

플랫폼 계정을 선택한 뒤 실제 계정의 플랫폼 카테고리를 조회한다.

Account 선택
    ↓
Category 조회
    ↓
목록 표시
    ↓
Category 선택
    ↓
Preparation 저장

콘텐츠 도메인 카테고리와 플랫폼 카테고리를 구분한다.

플랫폼 카테고리를 AI가 임의 문자열로 생성해서는 안 된다.

Project에 저장된 기본 카테고리는 추천값이며, 최종 실행 전에 확인할 수 있어야 한다.

20. Permission Gate and Publishing Policy

모든 외부 플랫폼 작업은 Permission Gate를 통과해야 한다.

20.1 Default Policy
Review First: ON
Draft Only: ON
Public Publish: OFF
Quality Approval Required: ON
Sequential Draft Save: ON
20.2 Flow
실행 요청
    ↓
현재 Permission 조회
    ↓
Quality 승인 확인
    ↓
작업 유형 확인
    ↓
Server-side Permission 재검증
    ↓
허용 또는 차단
20.3 Block Reasons
Platform 비활성
Platform Connection 없음
Session 만료
Quality 미승인
Draft Save 권한 없음
Public Publish 비활성화
Account 미선택
Category 미선택
최신 Revision 미저장
Automation Worker 사용 불가
승인되지 않은 Workflow
20.4 Rules
클라이언트 UI 상태만 신뢰하지 않는다.
실행 직전에 서버 또는 실행 계층에서 다시 검증한다.
AI는 Permission을 변경할 수 없다.
Playwright는 승인된 Registered Workflow 안에서만 실행한다.
Settings 화면과 AI Engine은 Playwright를 직접 호출하지 않는다.
차단 시 해결 방법을 사용자에게 제공한다.
21. Tistory Draft Save and Verification

Tistory는 Bright Studio의 첫 번째 실제 Publishing Workflow이다.

21.1 Preconditions
Tistory가 Enabled Platform
유효한 Tistory Connection
Stored Session 존재
대상 계정 선택
Platform Category 선택
저장된 Content Revision
Quality Gate 통과
Draft Save Permission 허용
Automation Worker 사용 가능
21.2 Flow
임시저장 실행
    ↓
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
Tistory Editor 진입
    ↓
제목 입력
    ↓
HTML 입력
    ↓
카테고리 설정
    ↓
이미지 업로드
    ↓
임시저장
    ↓
결과 검증
21.3 User Progress
대기 중
Editor 진입 중
콘텐츠 입력 중
이미지 업로드 중
임시저장 중
결과 확인 중
성공 또는 실패
21.4 Success Verification

성공은 임시저장 버튼 클릭 완료만 의미하지 않는다.

가능한 범위에서 다음을 검증한다.

Tistory Editor 상태
저장 완료 메시지
Draft 목록 또는 Editor 저장 상태
External Draft ID
Draft URL
제목 일치
저장 시각

저장 결과:

Content ID
Revision ID
Platform
Account
Category
Workflow ID
Draft ID
Draft URL
Saved Date
Verification Result

실제 검증이 완료된 경우에만 Content 상태를 Draft Saved로 변경한다.

Draft Save는 공개 발행이 아니므로 Published Registry의 공개 콘텐츠로 처리하지 않는다.

21.5 Failure Types
Browser backend unavailable
Chromium unavailable
Worker unavailable
Session missing
Session expired
Login redirect
Editor entry failed
Category load failed
HTML input failed
Image upload failed
Draft save failed
Result verification failed
Permission denied
21.6 Failure Rules
Content와 Revision을 보존한다.
실패한 Publishing Job만 재시도한다.
연결 문제와 콘텐츠 문제를 구분한다.
실패 단계와 해결 방법을 표시한다.
내부 Stack Trace는 일반 사용자에게 노출하지 않는다.
실패를 성공 상태로 저장하지 않는다.
22. Content Library and Publishing Records
22.1 Content Library

사용자는 Project의 콘텐츠를 상태별로 관리한다.

표시 정보:

제목
콘텐츠 유형
플랫폼 대상
콘텐츠 상태
품질 상태
최근 수정일
Draft Save 또는 Publish 상태
중복 위험
다음 추천 작업

필터:

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

사용자 Actions:

콘텐츠 열기
Editor 이동
Quality Review
Preview
Publishing Preparation
History
Archive
삭제

Archive와 Delete는 구분한다.

Published 콘텐츠를 삭제할 때는 Registry와 내부 링크에 미치는 영향을 표시한다.

Bright Studio의 콘텐츠 삭제가 외부 플랫폼 콘텐츠 삭제를 자동 실행해서는 안 된다.

22.2 Publishing Records

모든 외부 작업은 결과 기록을 남긴다.

Requested
Running
Succeeded
Failed
Verification Pending
Verified

발행 요청 성공만으로 Published 처리하지 않는다.

외부 결과가 실제로 검증된 경우에만 Published Registry를 갱신한다.

22.3 Published Content Registry

실제 공개 발행이 검증된 콘텐츠에는 다음 정보를 저장할 수 있다.

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

내부 링크와 관련 콘텐츠 추천에는 Verified 상태만 사용한다.

23. Settings, Safety and System States
23.1 Settings Navigation
Settings

├── Overview
├── AI
├── Enabled Platforms
├── Platform Connections
├── Publishing
├── Automation
├── Workspace
├── Appearance
└── Danger Zone
Overview
Workspace 정보
Project 및 콘텐츠 수
활성 플랫폼
연결된 계정
최근 저장
최근 발행
문제 상태
AI
Provider
구성 상태
Model
연결 테스트
Generation 상태
Quality Review 상태

API Key 원문을 다시 표시하지 않는다.

Enabled Platforms
플랫폼 활성화
플랫폼 비활성화
플랫폼 기능 지원 상태

비활성화가 기존 콘텐츠와 이력을 삭제해서는 안 된다.

Platform Connections
플랫폼별 계정
Connection 상태
다시 로그인
연결 확인
계정 추가
기본 계정
연결 해제

Connection 해제 전 관련 Project와 Publishing Preparation에 미치는 영향을 표시한다.

Publishing
Review First
Draft Only
Public Publish
Quality Approval Required
Sequential Draft Save
기본 계정 및 정책

위험한 옵션은 명시적 확인을 요구한다.

Automation
Browser backend 상태
Chromium 상태
Worker 상태
Stored Session 상태
최근 검사
최근 실행 결과

Settings에서는 Publishing Workflow를 직접 실행하지 않는다.

Workspace
이름
설명
기본 설정
Backup 상태
Appearance

Appearance는 기능 안정화 이후 확장한다.

Appearance 설정이 Core Workflow를 변경해서는 안 된다.

Danger Zone
Project 삭제
Workspace 삭제
Platform Connection 정리
전체 데이터 초기화
23.2 Safe Deletion
삭제 요청
    ↓
영향도 계산
    ↓
관련 데이터 표시
    ↓
Backup 생성
    ↓
정확한 이름 입력
    ↓
최종 확인
    ↓
삭제 실행
    ↓
결과 검증

규칙:

Backup First
정확한 이름 확인
외부 플랫폼 콘텐츠 자동 삭제 금지
Cleanup 실패 시 cleanup_required 유지
실패를 성공으로 표시하지 않음
23.3 Empty States

Workspace:

첫 Project를 만들어 콘텐츠 작업을 시작하세요.

Project:

무엇을 만들고 싶은지 Bright Studio에 말해 주세요.

Content Library:

아직 만든 콘텐츠가 없습니다.

Platform Connection:

콘텐츠는 먼저 만들 수 있습니다.
임시저장할 때 플랫폼 계정을 연결하세요.

빈 화면에 단순히 No data만 표시하지 않는다.

23.4 Loading States
실제 작업 상태를 표시한다.
무한 Loading을 방지한다.
오류 발생 시 Loading을 종료한다.
가능한 경우 취소 또는 재시도를 제공한다.
가짜 퍼센트를 표시하지 않는다.
23.5 Error States

오류 메시지는 다음 내용을 포함한다.

무엇이 실패했는지
기존 데이터가 보존되었는지
사용자가 무엇을 해야 하는지
다시 시도할 수 있는지

예:

AI 콘텐츠 생성에 실패했습니다.
입력한 내용은 그대로 보존되었습니다.
잠시 후 다시 시도하거나 AI 설정을 확인해 주세요.
23.6 Confirmation Required

다음 작업은 명시적 확인이 필요하다.

Workspace 삭제
Project 삭제
Platform Connection 해제
Public Publish
기존 외부 콘텐츠 수정
기존 외부 콘텐츠 삭제
전체 데이터 초기화
저장되지 않은 변경 폐기
23.7 Developer Dashboard

경로:

/dev

목적:

Fixture / Live 구분
Content Processing 검증
Publishing 상태 확인
Platform Connection 진단
Worker 상태 확인
URL Builder
오류 상세 확인

Developer Dashboard도 Permission Gate와 Publishing Service를 우회해서는 안 된다.

24. State Model, Release Verification and Future Flows
24.1 Content State Model

기본 상태 흐름:

Planning
    ↓
Draft
    ↓
Editing
    ↓
In Review
    ↓
Ready
    ↓
Draft Saved
    ↓
Published

예외 상태:

Failed
Archived

상태는 실제 결과에 따라 변경한다.

Generation 시작만으로 Draft 완료 처리하지 않는다.
Quality Review 시작만으로 Ready 처리하지 않는다.
Draft Save 버튼 클릭만으로 Draft Saved 처리하지 않는다.
Publish 요청만으로 Published 처리하지 않는다.
24.2 Primary Release Verification

Release 전에 다음 흐름을 실제로 검증해야 한다.

Workspace 생성
    ↓
Enabled Platforms 선택
    ↓
Project 생성
    ↓
Project DNA 저장
    ↓
자연어 콘텐츠 요청
    ↓
AI 분석
    ↓
추천 키워드 확인
    ↓
콘텐츠 생성
    ↓
Editor 수정
    ↓
Autosave
    ↓
새로고침 후 복원
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Tistory 계정 선택
    ↓
카테고리 선택
    ↓
Draft Save
    ↓
실제 Tistory Draft 확인

이 흐름이 중간 우회 없이 정상 작동해야 기본 사용 가능 상태로 판단한다.

24.3 Failure Recovery Verification
Draft Save 실행
    ↓
Stored Session 만료 확인
    ↓
작업 중단
    ↓
Content 및 Revision 보존
    ↓
Publishing Result Failed 저장
    ↓
재로그인 안내
    ↓
Platform Connection 재연결
    ↓
동일 Preparation으로 복귀
    ↓
실패한 Draft Save만 재시도
    ↓
결과 검증
24.4 Future Multi-Platform Flow
Natural Language Request
    ↓
Project Context
    ↓
Canonical Content Plan
    ↓
Platform 선택
    ├── Tistory
    ├── WordPress
    ├── YouTube
    └── Naver Cafe
    ↓
플랫폼별 콘텐츠 최적화
    ↓
품질 검토
    ↓
플랫폼별 Preview
    ↓
Sequential Publishing Queue
    ↓
플랫폼별 결과 검증

한 플랫폼의 실패가 다른 플랫폼의 성공 결과를 취소해서는 안 된다.

실패한 플랫폼 작업만 다시 실행할 수 있어야 한다.

24.5 Future Content Repurposing Flow
기존 콘텐츠 선택
    ↓
원본 유형 확인
    ↓
변환 목표 선택
    ↓
핵심 메시지 추출
    ↓
Project DNA 적용
    ↓
대상 플랫폼 최적화
    ↓
새 ContentDocument 생성
    ↓
원본 관계 저장
    ↓
Quality Review

예:

YouTube Video
    ↓
Transcript 및 Metadata
    ↓
Tistory Article
    ↓
Tistory Draft Save
Blog Article
    ↓
YouTube Script
    ↓
Scene Strategy
    ↓
Video Workflow
24.6 Edition Experience

Personal Edition:

상세 품질 점수
중복 후보
추천 근거
Project DNA 상세
AI Context 진단
고급 설정
Developer Verification

Commercial Edition:

복잡한 점수 기본 숨김
추천 행동 중심
설정 최소화
내부 Architecture 용어 숨김
필수 결정만 사용자에게 요청

두 Edition은 같은 Core Workflow를 사용한다.

24.7 Acceptance Criteria

전체 User Flow는 다음 조건을 만족해야 한다.

첫 사용자가 Workspace를 생성할 수 있다.
Platform Connection 없이 콘텐츠 생성을 시작할 수 있다.
Project 없이 콘텐츠를 생성할 수 없다.
Brand 없이 Project를 생성할 수 있다.
Project DNA가 콘텐츠 생성에 자동 반영된다.
자연어 요청 후 AI 분석 결과를 먼저 확인한다.
사용자 승인 후 최종 콘텐츠를 생성한다.
Generation 실패 시 입력과 기존 콘텐츠를 보존한다.
Editor에서 콘텐츠를 일반 문서처럼 수정할 수 있다.
Autosave 상태가 실제 저장 결과와 일치한다.
새로고침 후 저장된 콘텐츠를 복원한다.
History에서 이전 Revision을 복원할 수 있다.
Quality Report가 현재 Revision과 연결된다.
콘텐츠 수정 후 기존 Quality Report를 outdated 처리한다.
Verified URL만 내부 링크로 추천한다.
Preview가 원본 ContentDocument를 변경하지 않는다.
실제 플랫폼 계정과 카테고리를 발행 전에 선택할 수 있다.
Permission Gate가 외부 작업을 실행 직전에 검증한다.
Playwright가 승인된 Workflow 안에서만 실행된다.
Draft Save 성공을 실제 외부 결과로 검증한다.
실패 후 콘텐츠를 잃지 않고 재시도할 수 있다.
Draft Save와 Public Publish를 구분한다.
Fixture와 Live 상태를 명확히 구분한다.
복잡한 내부 구조를 일반 사용자에게 강요하지 않는다.
Guiding Principle

Bright Studio의 사용자 흐름은 사용자가 AI와 시스템 구조를 학습하게 만드는 것이 목적이 아니다.

사용자는 무엇을 만들지 결정하고 결과를 검토한다.

Bright Studio는 다음 과정을 책임진다.

요청 이해
전략 적용
콘텐츠 생성
품질 개선
플랫폼 변환
안전한 임시저장
결과 검증
콘텐츠 지식 갱신

모든 화면과 기능은 사용자가 최소한의 수작업으로 전문적인 콘텐츠를 완성할 수 있도록 설계해야 한다.

## Data Source-backed Today's Content Flow

```text
오늘의 글 작성
→ 기존 Workspace / Project / durable Planning Content 확인
→ Project가 참조한 최신 저장 Evidence 조회
→ 실제 Project metadata 기반 내부 성장 Evidence 조회
→ 기존 Planning AI 1회에 읽기 전용 Evidence bundle 제공
→ 서버 Evidence 재연결·검증·추천 유형 판정
→ 후보 전체 snapshot 저장
→ 사용자 후보와 근거 확인
→ Opportunity 원자적 확정
→ 기존 Generation 1회
→ 기존 Quality Review 1회
```

화면 이동, 새로고침과 재진입은 외부 sync나 AI Planning 재실행 사유가 아니다. 연결이나 snapshot이 없으면 블로그 성장 추천을 표시하고 검색 수요 미검증 limitation을 함께 표시한다. 외부 sync는 Workspace Settings의 Data Sources에서 사용자가 명시적으로 실행한다.
