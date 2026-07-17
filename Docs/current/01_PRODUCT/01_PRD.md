# Bright Studio Product Requirements Document

**Version:** 3.0
**Status:** Approved
**Document Type:** Product Requirements Document
**Internal Project Name:** Bright Editor Platform
**User-facing Product Name:** Bright Studio

---

# 1. Purpose

이 문서는 Bright Studio가 해결해야 하는 사용자 문제와 제품 목표, 핵심 사용자, 제품 범위, 필수 요구사항 및 성공 기준을 정의한다.

PRD는 다음 질문에 답해야 한다.

- 누구를 위한 제품인가?
- 사용자가 겪는 핵심 문제는 무엇인가?
- Bright Studio는 어떤 방식으로 문제를 해결하는가?
- 첫 번째 실제 제품 범위는 어디까지인가?
- 반드시 동작해야 하는 핵심 사용자 흐름은 무엇인가?
- 제품 성공을 어떻게 판단하는가?
- 현재 제품에서 하지 않는 것은 무엇인가?

세부 제품 구조는 `06_PRODUCT_ARCHITECTURE.md`, 사용자 흐름은 `03_USER_FLOW.md`, 기능 단위 요구사항은 `04_FEATURE_SPEC.md`, 개발 순서는 `02_ROADMAP.md`, Release 판단은 `05_RELEASE_PLAN.md`를 따른다.

---

# 2. Product Identity

## 2.1 Internal Project Name

```text
Bright Editor Platform

다음 영역에서만 사용한다.

Repository
Source Code
Architecture
Internal Documentation
Development Tools
2.2 User-facing Product Name
Bright Studio

모든 사용자 화면과 외부 제품 표현에서는 Bright Studio를 사용한다.

사용자는 Bright Editor Platform을 사용하는 것이 아니라 Bright Studio를 사용한다.

2.3 Product Positioning

Bright Studio는 다음과 같은 제품이 아니다.

단순 AI Writer
Prompt 모음
블로그 글 자동 생성기
Tistory 전용 자동화 프로그램
단순 HTML Generator
검토 없이 콘텐츠를 자동 발행하는 도구

Bright Studio는 다음과 같은 제품이다.

콘텐츠의 기획, 생성, 편집, 품질검토, 플랫폼 변환, 발행 준비 및 운영 지식을 하나의 Workflow로 관리하는 AI Content Operating System

3. Vision and Mission
3.1 Vision

Bright Studio는 사용자가 콘텐츠 아이디어와 최종 결정에 집중할 수 있도록 콘텐츠 운영의 반복적이고 전문적인 작업을 책임진다.

장기적으로 사용자는 하나의 콘텐츠 전략을 여러 플랫폼에서 재사용하고, 기존 콘텐츠 지식을 활용하며, 일관된 품질로 콘텐츠를 운영할 수 있어야 한다.

3.2 Mission

사용자가 최소한의 수작업으로 자랑스럽게 공개할 수 있는 전문 품질의 콘텐츠를 완성하도록 돕는다.

3.3 North Star
사용자는 무엇을 만들지 결정한다.
Bright Studio는 그것을 발행 가능한 전문 콘텐츠로 완성한다.

제품의 성공은 기능 개수나 생성량이 아니라 다음 결과로 판단한다.

결과물이 더 좋아졌는가?
반복 작업이 줄었는가?
사용자가 현재 해야 할 일을 쉽게 이해하는가?
실제 플랫폼 작업까지 안전하게 완료되는가?
기존 콘텐츠 운영 지식이 다음 작업에 재사용되는가?
4. Problem Statement

콘텐츠 제작자는 하나의 콘텐츠를 완성하기 위해 많은 도구와 반복 작업을 사용해야 한다.

대표적인 문제는 다음과 같다.

4.1 Fragmented Workflow

기획, 작성, SEO, 이미지, 편집, 품질검토와 발행 작업이 서로 다른 도구에 분산되어 있다.

사용자는 각 도구 사이에서 내용을 복사하고 상태를 직접 기억해야 한다.

4.2 Inconsistent Content Quality

일반적인 AI 생성 결과는 다음 문제를 가질 수 있다.

검색 의도와 맞지 않음
독자에게 실제 도움이 부족함
반복되거나 얕은 내용
부자연스러운 문장
과도한 Keyword 반복
구조적 완성도 부족
검증되지 않은 링크
필요한 이미지 전략 부재
플랫폼에 맞지 않는 출력

사용자는 AI 결과를 다시 검토하고 여러 번 수정해야 한다.

4.3 Repetitive Setup

사용자는 콘텐츠를 만들 때마다 다음 정보를 반복해서 입력한다.

대상 독자
Tone
주요 주제
제외 주제
목표 분량
SEO 방향
이미지 수와 유형
CTA 정책
내부 링크 정책
기본 플랫폼
발행 계정과 카테고리
4.4 Disconnected Publishing

좋은 콘텐츠를 만들어도 플랫폼 Editor에 직접 이동하여 다음 작업을 반복해야 한다.

제목 입력
본문 변환
HTML 입력
이미지 업로드
카테고리 선택
임시저장
결과 확인
4.5 Lost Content Knowledge

기존에 어떤 글을 작성했는지, 어떤 Keyword와 검색 의도를 사용했는지, 어떤 글을 내부 링크로 연결할 수 있는지 관리하기 어렵다.

그 결과 다음 문제가 발생한다.

유사 콘텐츠 중복
Keyword Cannibalization
존재하지 않는 내부 링크
관련 콘텐츠 추천 누락
Project 전략 불일치
과거 콘텐츠 활용 부족
4.6 Risky Automation

외부 플랫폼 자동화는 다음 위험을 가진다.

잘못된 계정에 저장
공개 발행 오작동
Session 만료
중복 저장
실패했지만 성공으로 표시
사용자 승인 없이 외부 작업 실행
기존 콘텐츠 수정 또는 삭제

Bright Studio는 자동화 속도보다 사용자 통제와 안전성을 우선해야 한다.

5. Product Solution

Bright Studio는 하나의 연결된 콘텐츠 Workflow를 제공한다.

Workspace
    ↓
Project
    ↓
자연어 콘텐츠 요청
    ↓
AI 분석 및 추천
    ↓
사용자 확인
    ↓
AI Editorial Generation
    ↓
일반 문서형 Editor
    ↓
Quality Review 및 개선
    ↓
Platform Preview
    ↓
Publishing Preparation
    ↓
Permission Gate
    ↓
Draft Save
    ↓
외부 결과 검증
    ↓
Content Intelligence 갱신

Bright Studio는 AI를 단순 생성기로 사용하지 않는다.

하나의 AI Generation이 다음 전문 역할을 통합 수행한다.

Writer
SEO Specialist
Image Strategist
Internal Link Planner
CTA Advisor
Editor

Generation 이후 별도의 Quality Review AI가 결과를 검토한다.

기본 목표는 다음과 같다.

AI Generation: 1회
AI Quality Review: 1회
6. Target Users
6.1 Primary User — Personal Creator

첫 번째 핵심 사용자는 여러 콘텐츠 플랫폼을 직접 운영하는 개인 콘텐츠 제작자이다.

대표 사용자:

전문 블로거
YouTube Creator
SEO 중심 콘텐츠 운영자
1인 미디어 운영자
제휴 및 수익형 콘텐츠 운영자
다수의 블로그 또는 플랫폼 계정을 관리하는 사용자

주요 요구:

높은 콘텐츠 품질
반복 설정 감소
상세 품질 진단
직접 수정 가능
Platform Preview
안전한 임시저장
다중 계정 관리
기존 콘텐츠 활용
6.2 Secondary User — Small Business Operator
소상공인
쇼핑몰 운영자
소규모 마케팅 담당자
지역 사업자
전문 지식은 있지만 콘텐츠 제작 경험이 부족한 사용자

주요 요구:

간단한 시작
최소한의 설정
자동 추천
전문 용어 최소화
안전한 기본값
명확한 다음 행동
6.3 Future User — Content Team
Writer
Editor
Reviewer
Publisher
Team Administrator

Team Workflow는 장기 확장 대상이며 초기 제품 범위에 포함하지 않는다.

7. Product Editions

Bright Studio는 같은 Core를 사용하면서 사용자 경험을 다르게 제공할 수 있다.

7.1 Personal Edition

Personal Edition은 고급 사용자와 실제 콘텐츠 운영자가 사용할 수 있는 상세 기능을 제공한다.

기본 노출 기능:

Overall Quality Score
항목별 Quality Score
SEO 진단
Search Intent 진단
Readability 진단
Duplicate Candidates
Internal Link 추천 근거
Project DNA 고급 설정
Publishing 진단
Platform Connection 상태
Manual Override
Developer Verification
7.2 Commercial Edition

Commercial Edition은 기술적 복잡성을 숨기고 권장 행동 중심으로 제공한다.

기본 경험:

자연어 요청 중심
Smart Default
필수 설정 최소화
자동 적용된 Project 전략
복잡한 점수 기본 숨김
문제보다 해결 행동 제시
Review First
Guided Publishing
최소한의 Platform 설정

예:

SEO Score 82
Search Intent Score 86

보다 다음과 같은 안내를 우선한다.

검색자가 궁금해하는 핵심 내용을 조금 더 보강하면 발행 준비가 완료됩니다.
7.3 Shared Core Rule

Personal Edition과 Commercial Edition을 별도 제품 코드로 복제하지 않는다.

두 Edition은 다음을 공유한다.

Content Model
AI Engine
Quality Engine
Project DNA
Content Intelligence
Publishing Service
Platform Adapter
Permission Gate

차이는 정보 노출 수준과 사용자 조작 범위에 둔다.

8. Product Principles
8.1 Content Quality Above Everything Else

새 기능과 빠른 생성보다 콘텐츠 품질을 우선한다.

기능은 다음 질문을 통과해야 한다.

결과물의 실질적인 품질을 높이는가?
독자에게 더 도움이 되는가?
검색 의도를 더 정확히 충족하는가?
사용자의 수정 부담을 줄이는가?
8.2 Project First

콘텐츠 작업은 Project 문맥 안에서 이루어진다.

Project는 콘텐츠 운영 전략과 결과물을 관리하는 기본 단위이다.

8.3 Workspace First

Workspace는 다음을 소유하는 최상위 사용자 작업 공간이다.

Brand
Project
Platform Connection
Publishing Account
Assets
Workspace Settings
Permission Policy

Workspace와 Brand를 동일하게 취급하지 않는다.

8.4 Content Model First

콘텐츠는 플랫폼별 HTML을 원본으로 저장하지 않는다.

Canonical Content Model을 원본으로 관리하고 플랫폼별 Renderer가 결과를 생성한다.

8.5 Platform First

공통 기능은 Core에서 재사용한다.

Tistory, WordPress, YouTube와 같은 플랫폼 특화 로직은 Apps에 위치한다.

8.6 Simplicity First

내부 Architecture는 복잡할 수 있지만 사용자 경험은 단순해야 한다.

사용자는 내부 Block ID, JSON, Prompt와 기술적 Workflow를 알 필요가 없다.

8.7 Continue Working

Bright Studio는 사용자의 현재 작업 상태를 기억한다.

최근 Project
최근 콘텐츠
마지막 Revision
저장 상태
품질 상태
미완료 Publishing Job
추천 다음 작업
8.8 Review First

AI 결과와 외부 작업은 사용자 검토를 기본으로 한다.

8.9 Draft First

초기 외부 플랫폼 자동화는 공개 발행보다 임시저장을 우선한다.

8.10 Safe Automation

자동화는 사용자의 명시적 권한과 승인된 Workflow 안에서만 실행한다.

9. Product Ownership Model

제품의 기본 소유 구조는 다음과 같다.

Workspace
├── Brand
├── Project
├── Platform Connection
├── Publishing Account
├── Asset
└── Workspace Settings

Project
├── Project DNA
├── Content
├── Content Library
├── Publishing Target
└── Publishing History

Content
├── ContentDocument
├── Revision
├── Quality Report
├── Preview
├── Publishing Job
└── Published Record
9.1 Workspace

사용자 작업 공간이며 Project와 Platform Connection을 소유한다.

9.2 Brand

선택 항목이다.

Brand 없이도 Project를 생성할 수 있다.

9.3 Project

콘텐츠 전략과 결과물을 관리하는 운영 단위이다.

9.4 Content

Project가 소유하는 개별 콘텐츠 결과물이다.

9.5 Platform Connection

Workspace가 소유하며 Project는 대상 Reference만 사용한다.

9.6 Publishing Account

하나의 Platform에 여러 계정을 연결할 수 있다.

10. Core User Workflow

첫 번째 Release에서 반드시 완성되어야 하는 핵심 흐름은 다음과 같다.

Home
    ↓
Workspace 선택 또는 생성
    ↓
Project 선택 또는 생성
    ↓
Create Content
    ↓
자연어 요청
    ↓
AI 검색 의도 및 Keyword 분석
    ↓
사용자 확인
    ↓
콘텐츠 생성
    ↓
Editor
    ↓
Autosave
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Publishing Preparation
    ↓
Tistory Account와 Category 선택
    ↓
Permission Gate
    ↓
Draft Save
    ↓
실제 Tistory Draft 검증

이 흐름이 여러 개발자 화면이나 수동 우회를 거치지 않고 연결되어야 한다.

11. Natural Language Content Creation Requirements
11.1 User Input

사용자는 자연어로 만들고 싶은 콘텐츠를 설명한다.

예:

40대 여성이 집에서 쉽게 따라 할 수 있는 허리 운동 글을 만들어 주세요.
초보자도 이해하기 쉽게 작성하고 티스토리용으로 준비해 주세요.
11.2 Optional Input
대상 플랫폼
콘텐츠 유형
전체 도메인 카테고리
대상 독자
참고 Keyword
제외 조건
목표 분량
원본 콘텐츠
Content Override
11.3 AI Analysis

최종 생성 전에 다음을 분석한다.

주제
Search Intent
대상 독자
Primary Keyword
Secondary Keywords
추천 콘텐츠 유형
예상 구조
예상 분량
Project DNA 적용 내용
기존 콘텐츠 중복 위험
기존 콘텐츠 업데이트 가능성
11.4 User Confirmation

사용자는 다음 행동을 할 수 있어야 한다.

그대로 생성
Keyword 수정
대상 독자 수정
방향 수정
대상 플랫폼 변경
다시 분석
생성 취소

사용자의 확인 없이 최종 콘텐츠 Generation을 실행하지 않는다.

12. AI Editorial Requirements
12.1 Hybrid AI Architecture

기본 AI Workflow는 다음으로 구성한다.

Editorial Generation
    ↓
Rule Validation
    ↓
Quality Review
    ↓
Improvement
12.2 Generation Responsibilities

하나의 Generation에서 다음 작업을 통합한다.

Search Intent Analysis
Reader Analysis
Content Planning
Writing
SEO Optimization
Image Strategy
Internal Link Requirement
CTA Strategy
Editing
Metadata Generation
Content Model Generation
12.3 Quality Review Responsibilities

별도 Quality Review는 다음을 검토한다.

검색 의도 충족
독자 유용성
정확성
SEO
가독성
콘텐츠 구조
정보 충분성
반복 및 얕은 문단
이미지 전략
내부 링크
CTA
Metadata
플랫폼 적합성
HTML Quality
금지 표현
검증되지 않은 주장
검증되지 않은 URL
12.4 Cost Requirements
불필요한 Agent 분리를 피한다.
동일한 Context를 여러 번 생성하지 않는다.
규칙으로 처리 가능한 검증은 AI 호출 없이 처리한다.
Content Library 전체를 무조건 Prompt에 포함하지 않는다.
관련성 높은 Context만 선별한다.
실패 재시도 횟수에 제한을 둔다.
12.5 Agent-ready Requirement

현재는 통합 AI Workflow를 사용하지만 장기적으로 역할을 독립 Agent로 분리할 수 있어야 한다.

현재 비용 최적화를 해치면서 미리 다중 Agent로 구현하지 않는다.

13. Editor Requirements
13.1 Editor Experience

Editor는 일반적인 문서 편집기처럼 동작해야 한다.

내부 Block Model은 구현 세부사항으로 유지한다.

기본 화면에서 다음을 노출하지 않는다.

Block ID
Raw JSON
내부 Schema
Prompt
AI Response 원문
13.2 Required Editing
제목 수정
본문 수정
문단 추가 및 삭제
H2/H3 구조 변경
이미지 위치 조정
CTA 위치 조정
내부 링크 수정
Video 위치 조정
목차 확인
Metadata 확인
Preview 이동
Quality Review 실행
13.3 Visual Requirements
H2와 H3를 시각적으로 구분한다.
CTA는 코드가 아닌 실제 버튼으로 표시한다.
이미지와 Video는 문서 흐름 안에서 표시한다.
콘텐츠 저장 상태를 명확히 보여준다.
Quality 결과가 오래된 상태인지 표시한다.
13.4 Autosave
사용자 편집을 자동 저장한다.
실제 저장 Transaction 완료 후 성공으로 표시한다.
콘텐츠 또는 Project 전환 전 대기 저장을 완료한다.
저장 실패 시 기존 데이터를 보존한다.
새로고침 후 마지막 저장 Revision을 복원한다.
13.5 Revision History
Revision 목록
Revision Preview
이전 버전 Restore
현재 Revision 표시
Restore 결과를 새 Revision으로 저장

과거 Revision을 직접 덮어쓰지 않는다.

14. Quality Requirements
14.1 Quality Goal

각 콘텐츠는 다음 목표를 지향한다.

Search Intent: 95 이상
SEO: 95 이상
Readability: 95 이상
HTML Quality: 95 이상
Overall Quality: 95 이상

점수는 단순 기능 체크 개수가 아니라 실제 콘텐츠 완성도를 평가해야 한다.

14.2 Quality States
Not Reviewed
Reviewing
Approved
Needs Improvement
Review Failed
Outdated
14.3 Revision Binding

Quality Report는 특정 Content Revision과 연결한다.

콘텐츠가 수정되면 기존 Report는 Outdated로 변경한다.

14.4 Improvement

목표 미달 시 다음 선택을 제공한다.

자동 개선
Editor에서 직접 수정
다시 검토
현재 상태 유지

자동 개선은 기존 Revision을 보존하고 새 Revision을 생성해야 한다.

14.5 Quality Gate

Quality Approval Required가 활성화된 경우 승인되지 않은 콘텐츠는 외부 Platform Workflow를 실행할 수 없다.

품질 목표를 맞추기 위해 평가 기준 자체를 낮추지 않는다.

15. Project DNA Requirements

Project DNA는 Project에 반복적으로 적용되는 콘텐츠 전략이다.

15.1 Required Capability

사용자는 Project마다 다음 기본값을 설정할 수 있어야 한다.

주요 주제
세부 주제
제외 주제
대상 독자
Tone
기본 콘텐츠 유형
기본 플랫폼
목표 분량
SEO 정책
이미지 정책
CTA 정책
내부 링크 정책
관련 콘텐츠 정책
품질 목표
기본 발행 계정
기본 플랫폼 카테고리
15.2 Application Rules
Project DNA는 새로운 콘텐츠 생성에 자동 반영한다.
사용자는 콘텐츠별로 Override할 수 있다.
Project DNA가 없어도 안전한 기본값으로 생성할 수 있다.
Project DNA 변경은 기존 Published 콘텐츠를 자동 수정하지 않는다.
어떤 설정이 적용되었는지 사용자가 확인할 수 있어야 한다.
16. Content Intelligence Requirements

Bright Studio는 기존 콘텐츠를 단순 파일 목록이 아닌 Project의 운영 지식으로 활용해야 한다.

16.1 Content Library

다음 정보를 관리한다.

제목
콘텐츠 유형
상태
현재 Revision
Quality 상태
대상 플랫폼
Publishing 상태
수정일
중복 위험
16.2 Published Content Registry

실제로 공개 발행이 검증된 콘텐츠에 대해 다음 정보를 저장한다.

Content ID
Platform
Publishing Account
External Content ID
Published URL
Category
Topics
Keywords
Search Intent
Audience
Summary
Published Date
Verification Status
16.3 Search Intent Memory
기존 Search Intent
관련 콘텐츠
Coverage
중복 위험
미작성 세부 의도
Draft와 Published 구분
16.4 Keyword Memory
Primary Keyword
Secondary Keyword
Long-tail Keyword
사용 이력
Cannibalization Risk
제외 Keyword
16.5 Topic Memory
Main Topic
Subtopic
Topic Cluster
Pillar 관계
Supporting Content 관계
Coverage Level
16.6 Duplicate Detection

다음 요소를 함께 분석한다.

Search Intent
Topic
Keyword
Title
Outline
대상 독자
콘텐츠 목적
Existing Draft
Published Content
Repurposing 관계

Keyword가 같다는 이유만으로 중복 처리하지 않는다.

16.7 Internal Link Intelligence
Verified Published URL만 사용
현재 콘텐츠 자신 제외
독자에게 도움이 되는 흐름 우선
Anchor 추천
추천 위치
추천 이유
사용자 승인 및 수정
16.8 Related Content
본문 하단에 관련 콘텐츠 추천
기본 최대 3개
Keyword 유사도보다 독자 유용성 우선
Verified Published Content만 사용
추천 교체 및 삭제 가능
17. Image, CTA and Video Requirements
17.1 Image Strategy

이미지는 장식이 아니라 콘텐츠 목적을 가져야 한다.

지원 이미지 유형:

Hero Image
Comparison
Checklist
Infographic
Summary Card
Warning Card
Step Guide
Product Context

각 이미지 전략에는 다음이 포함된다.

이미지 목적
추천 위치
Prompt
ALT
Asset 상태

이미지 자체 자동 생성은 초기 필수 범위가 아니다.

17.2 CTA

CTA에는 다음 정보를 저장한다.

목적
문구
URL
위치
Link Type

내부 링크:

target="_self"

외부 링크:

target="_blank"
rel="noopener noreferrer"

AI는 확인되지 않은 URL을 만들어서는 안 된다.

17.3 Video

Video는 Content Model의 재사용 가능한 Block이어야 한다.

블로그 콘텐츠에서는 YouTube Embed를 기본 활용 방식으로 지원한다.

사용자는 다음을 할 수 있어야 한다.

YouTube URL 연결
Preview 확인
위치 이동
설명 수정
연결 해제
18. Platform and Publishing Requirements
18.1 Platform Priority

플랫폼 지원 우선순위는 다음과 같다.

Tistory
    ↓
WordPress
    ↓
YouTube
    ↓
Naver Cafe
    ↓
Shopping
18.2 Platform Capability

플랫폼마다 다음 지원 상태를 구분한다.

Content Generation
Preview
Connection
Draft Save
Public Publish
Category
Media Upload
Analytics

지원하지 않는 기능을 성공 가능한 것처럼 표시하지 않는다.

18.3 Platform Connection
Workspace가 소유한다.
여러 계정을 연결할 수 있다.
Project는 Connection Reference를 사용한다.
Secret 원문을 데이터베이스나 UI에 노출하지 않는다.
연결 상태와 Session 만료를 구분한다.
연결 해제 시 영향을 표시한다.
18.4 Publishing Preparation

사용자는 외부 작업 전에 다음을 확인할 수 있어야 한다.

대상 Platform
Publishing Account
Platform Category
Content Revision
Quality 상태
Image 상태
Link 상태
Permission 상태
Automation 상태
Draft 또는 Public Publish
18.5 Platform Category

전체 콘텐츠 도메인 Category와 실제 플랫폼 Category를 구분한다.

플랫폼 Category는 실제 연결 계정에서 조회하고 Publishing Preparation 단계에서 선택한다.

19. Permission and Automation Requirements
19.1 Default Publishing Policy

초기 기본값은 다음과 같다.

Review First: ON
Draft Only: ON
Public Publish: OFF
Quality Approval Required: ON
Sequential Draft Save: ON
19.2 Permission Gate

외부 플랫폼 작업은 실행 직전에 Permission Gate에서 다시 검증한다.

검증 항목:

Enabled Platform
Publishing Account
Connection 상태
Stored Session
Quality Approval
작업 유형
Draft Permission
Public Publish Permission
Category
Current Revision
Registered Workflow
Worker 상태
19.3 Playwright Policy

Playwright는 다음 경로로만 실행한다.

User Action
    ↓
Publishing Service
    ↓
Permission Gate
    ↓
Platform Adapter
    ↓
Registered Workflow
    ↓
Playwright Worker

금지:

AI Engine의 직접 Playwright 호출
Core에서 플랫폼 Selector 사용
Settings 화면의 Publishing Workflow 직접 호출
승인되지 않은 자유형 Browser 제어
Public Publish 기본 활성화
19.4 External Result Verification

외부 버튼 클릭 완료만으로 성공 처리하지 않는다.

가능한 범위에서 다음을 검증한다.

저장 완료 상태
External ID
Draft URL 또는 Published URL
제목
계정
Category
저장 시각
Verification 상태
20. Tistory MVP Requirements

Tistory는 첫 번째 실제 운영 검증 플랫폼이다.

20.1 Required Flow
Tistory Connection
    ↓
Stored Session 확인
    ↓
Publishing Account 선택
    ↓
Category 조회 및 선택
    ↓
Content Revision 고정
    ↓
Tistory HTML Rendering
    ↓
Preview
    ↓
Permission Gate
    ↓
Editor 진입
    ↓
Title 입력
    ↓
HTML 입력
    ↓
Category 적용
    ↓
Image Upload
    ↓
Draft Save
    ↓
실제 결과 검증
20.2 Required Result

사용자는 Bright Studio에서 만든 콘텐츠가 실제 Tistory 임시저장 글로 존재하는 것을 확인할 수 있어야 한다.

20.3 Failure Recovery

다음 문제가 발생해도 Content와 Revision은 보존해야 한다.

Session 만료
Editor 진입 실패
Category 조회 실패
HTML 입력 실패
Image Upload 실패
Draft Save 실패
결과 검증 실패
Browser Worker 오류

재시도는 전체 콘텐츠를 다시 생성하는 것이 아니라 실패한 Publishing Job만 대상으로 한다.

20.4 Public Publish

초기 MVP에서는 Public Publish를 기본 범위에 포함하지 않는다.

Draft Save 안정화와 사용자 검증 이후 별도 Release로 확장한다.

21. Non-Functional Requirements
21.1 Reliability
저장 성공 UI는 실제 저장 완료와 일치해야 한다.
새로고침 후 저장된 Revision을 복원해야 한다.
AI 실패 시 사용자 입력을 보존해야 한다.
Publishing 실패 시 콘텐츠를 보존해야 한다.
외부 결과 검증 전 성공으로 표시하지 않는다.
중복 Publishing 실행을 방지한다.
21.2 Performance

목표 기준:

일반 Editor 입력에 사용자가 느낄 수 있는 지연이 없어야 한다.
Autosave는 사용 흐름을 방해하지 않아야 한다.
Workspace와 Project는 로딩 상태를 명확히 표시해야 한다.
AI와 Publishing 장기 작업은 현재 단계를 표시해야 한다.
가짜 진행률을 표시하지 않는다.

구체적인 성능 수치는 실제 환경 측정 후 Release Plan에서 관리한다.

21.3 Security
API Key, Cookie, Token과 Session 원문을 UI에 노출하지 않는다.
Secret Reference만 일반 데이터 저장소에 유지한다.
Local Secret은 OS 보안 저장소를 사용한다.
Permission을 서버 또는 실행 계층에서 재검증한다.
삭제 전 Backup을 생성한다.
위험 작업은 명시적 사용자 확인을 요구한다.
21.4 Scalability
Core는 플랫폼 독립적이어야 한다.
새 플랫폼은 Adapter로 추가할 수 있어야 한다.
Content Model은 Versioning을 지원해야 한다.
AI Provider를 교체할 수 있어야 한다.
Personal과 Commercial Edition이 같은 Core를 사용해야 한다.
향후 Cloud와 Team 확장을 막지 않아야 한다.
21.5 Maintainability
공통 로직은 Core에 위치한다.
플랫폼별 로직은 Apps에 위치한다.
기능은 작은 검증 가능한 단위로 구현한다.
기존 기능을 보호하는 Regression Test가 필요하다.
Architecture 변경 전 문서를 먼저 수정한다.
21.6 Accessibility and Usability
한국어를 기본 UI 언어로 사용한다.
기술 용어보다 사용자 행동을 중심으로 안내한다.
Empty State는 다음 행동을 알려준다.
오류 메시지는 원인과 해결 방법을 포함한다.
주요 버튼과 상태를 명확하게 구분한다.
초보자도 고급 설정 없이 핵심 Workflow를 완료할 수 있어야 한다.
22. MVP Scope

첫 번째 실제 제품 범위는 Personal Tistory Edition이다.

22.1 In Scope
Workspace
선택적 Brand
Project
Enabled Platforms
Tistory Platform Connection
Project DNA 기본 설정
자연어 콘텐츠 요청
AI Analysis
Keyword Recommendation
User Confirmation
Editorial Generation
Canonical Content Model
일반 문서형 Editor
Autosave
Revision History
Quality Review
Automatic Improvement
Image Strategy
CTA와 Video 기반
Internal Link Requirement
Tistory Renderer
Tistory Preview
Publishing Preparation
Tistory Account 선택
실제 Category 선택
Permission Gate
Tistory Draft Save
외부 Draft 검증
실패 복구
Content Library 기본
22.2 MVP Completion Condition

개별 기능 구현이 아니라 다음 전체 흐름이 실제로 동작해야 한다.

Workspace
    ↓
Project
    ↓
자연어 요청
    ↓
AI 분석
    ↓
콘텐츠 생성
    ↓
Editor 수정
    ↓
Autosave 및 Reload 복원
    ↓
Quality Review
    ↓
Tistory Preview
    ↓
Account와 Category 선택
    ↓
Draft Save
    ↓
실제 Tistory Draft 확인
23. Out of Scope

초기 MVP에서 제외한다.

Public Publish 기본 자동화
기존 외부 콘텐츠 자동 수정
기존 외부 콘텐츠 자동 삭제
실시간 공동 편집
Team Role System
Comment와 Approval Assignment
Marketplace
Plugin Store
자체 이미지 생성 모델
무제한 Multi-Agent
무검토 완전 자동 발행
전체 Analytics Platform
Subscription
Cloud Collaboration
Mobile Native Application
모든 플랫폼 동시 구현
Deprecated Tistory API
자유형 Browser Agent

이 기능들은 영구 제외가 아니라 선행 조건이 충족된 뒤 Roadmap에서 다시 평가한다.

24. Platform Expansion Requirements
24.1 WordPress

Tistory Workflow가 실제 검증된 후 다음 플랫폼으로 확장한다.

필수 범위:

WordPress Connection
WordPress Renderer
Category와 Tag
Featured Image
WordPress Preview
Draft Save
External Post ID
Result Verification

WordPress 구현은 Tistory 코드를 복사하지 않고 공통 Publishing Contract를 사용한다.

24.2 YouTube

YouTube는 다음 방향을 지원한다.

기존 영상 Source 활용
Script 생성
Blog to Video 변환
Video Embed
YouTube Metadata
Repurposing 관계

초기 Bright Studio 범위에서는 YouTube 자동 업로드보다 콘텐츠 생성과 재활용을 우선할 수 있다.

24.3 Naver Cafe
Cafe Post 생성
Platform-specific Formatting
Category 또는 Board 선택
Preview
Draft 또는 안전한 저장 Workflow
24.4 Shopping
Product Content
Comparison
Product CTA
Commerce Metadata
Platform-specific Rendering

모든 확장은 Canonical Content Model과 Platform Adapter를 사용한다.

25. Content Repurposing Requirements

Bright Studio는 콘텐츠를 한 번 만들고 여러 형식으로 재사용할 수 있어야 한다.

지원 방향:

YouTube Video
    ↓
Blog Article
Blog Article
    ↓
YouTube Script
Long-form Content
    ↓
Shorts Script
Article
    ↓
Naver Cafe Post

요구사항:

Source Content 선택
Target Format 선택
핵심 메시지 추출
플랫폼별 최적화
새 ContentDocument 생성
Source와 Derived 관계 저장
Duplicate Detection 예외 처리
별도 Quality Review

단순 복사 기능으로 구현하지 않는다.

26. Success Metrics
26.1 Content Quality

목표:

Search Intent: 95 이상
SEO: 95 이상
Readability: 95 이상
HTML Quality: 95 이상
Overall Quality: 95 이상

점수 외에도 다음을 확인한다.

필수 정보 누락 여부
반복 문단
사실 근거 부족
독자 실용성
검색 의도 이탈
검증되지 않은 링크
플랫폼 결과 품질
26.2 Workflow Completion

핵심 지표:

Workspace 생성 성공률
Project 생성 성공률
AI Analysis 완료율
Generation 성공률
Editor 저장 성공률
Reload 복원 성공률
Quality Review 성공률
Preview 성공률
Draft Save 성공률
External Verification 성공률
End-to-End 완료율
26.3 User Efficiency
콘텐츠당 반복 입력 감소
Project DNA 재사용률
AI 결과 수정 시간 감소
Platform 복사 작업 감소
기존 콘텐츠 탐색 시간 감소
실패 후 복구 시간 감소
26.4 Reliability
데이터 손실 발생률
잘못된 저장 성공 표시
중복 Draft 생성률
Session 만료 복구율
Publishing Job 재시도 성공률
Permission 우회 발생률

Permission 우회 목표는 0이다.

26.5 Content Intelligence

향후 측정:

Duplicate Risk 발견률
Verified Internal Link 사용률
Related Content 적용률
존재하지 않는 URL 생성률
Project DNA 적용률
기존 콘텐츠 업데이트 선택률

존재하지 않는 내부 URL 생성 목표는 0이다.

27. Product Acceptance Criteria

Bright Studio의 기본 제품 요구사항은 다음 조건을 만족해야 한다.

Product Structure
Workspace가 Project와 Platform Connection을 소유한다.
Brand 없이 Project를 생성할 수 있다.
Content가 Project에 속한다.
여러 Platform Account를 연결할 수 있다.
Project가 기본 Publishing Target을 참조할 수 있다.
Content Creation
자연어 요청으로 콘텐츠 생성을 시작할 수 있다.
AI 분석 결과를 Generation 전에 확인할 수 있다.
사용자가 Keyword와 방향을 수정할 수 있다.
사용자 승인 후 최종 Generation을 실행한다.
Generation 실패 시 입력을 보존한다.
Editor
일반 문서처럼 콘텐츠를 편집할 수 있다.
내부 Block 구조를 기본 노출하지 않는다.
H2/H3, 이미지, CTA와 Video를 시각적으로 확인할 수 있다.
Autosave 상태가 실제 저장과 일치한다.
새로고침 후 저장 내용을 복원한다.
Revision을 복원할 수 있다.
Quality
Quality Report가 특정 Revision과 연결된다.
수정 후 이전 Report를 Outdated 처리한다.
목표 미달 항목을 확인할 수 있다.
자동 개선이 기존 Revision을 보존한다.
Quality Approval이 Publishing Gate에 반영된다.
Intelligence
Project DNA가 새 콘텐츠에 적용된다.
기존 콘텐츠 중복 위험을 확인할 수 있다.
Verified URL만 내부 링크로 추천한다.
현재 콘텐츠 자신을 추천하지 않는다.
Draft URL을 Published URL로 취급하지 않는다.
Publishing
실제 Platform Account를 선택할 수 있다.
실제 Platform Category를 선택할 수 있다.
Preview가 원본 ContentDocument를 변경하지 않는다.
Permission Gate가 외부 작업을 검증한다.
Playwright가 Registered Workflow에서만 실행된다.
Draft Save 결과를 실제 외부 상태로 검증한다.
실패 후 Content와 Revision을 잃지 않는다.
실패한 Publishing Job만 재시도할 수 있다.
Draft Save와 Public Publish를 구분한다.
28. Definition of Product Success

Bright Studio는 사용자가 다음과 같이 느낄 때 성공한 제품이다.

내가 무엇을 해야 할지 항상 알 수 있다.
같은 설정을 반복하지 않아도 된다.
일반 AI보다 결과물이 더 완성되어 있다.
수정하고 검토하는 과정이 편하다.
콘텐츠를 잃을 걱정이 없다.
실제 플랫폼에 안전하게 저장할 수 있다.
기존 콘텐츠가 다음 콘텐츠에 도움이 된다.
여러 플랫폼을 운영해도 Workflow가 복잡해지지 않는다.

제품 성공은 기능을 많이 구현하는 것이 아니다.

다음 전체 결과를 안정적으로 제공하는 것이다.

좋은 콘텐츠를 만든다
    ↓
사용자가 쉽게 검토한다
    ↓
안전하게 외부 플랫폼에 전달한다
    ↓
그 결과를 다음 콘텐츠에 재사용한다
29. Guiding Principle

Bright Studio의 목적은 콘텐츠 발행 횟수를 늘리는 것이 아니다.

사용자가 전문 편집팀 없이도 전문 편집팀 수준의 콘텐츠 운영 과정을 사용할 수 있도록 만드는 것이다.

모든 제품 결정은 다음 질문을 통과해야 한다.

사용자의 콘텐츠 품질을 높이는가?
반복 작업을 줄이는가?
사용자의 통제권을 유지하는가?
실제 전체 Workflow를 더 완성하는가?
플랫폼 확장에 재사용할 수 있는가?
기존 기능과 데이터를 보호하는가?
불필요한 AI 비용을 줄이는가?
사용자가 결과를 신뢰할 수 있는가?

Bright Studio는 자동화를 위해 품질과 안전을 희생하지 않는다.