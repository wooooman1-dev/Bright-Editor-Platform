# Bright Design Language

## 1. Purpose

Bright Design Language(BDL)는 Bright Studio의 화면, 구성 요소, 움직임, 문구를 하나의 경험으로 묶는 시각 언어다.

단순한 디자인 토큰 목록이 아니라 Bright Studio다움을 유지하기 위한 기준이다.

---

## 2. Core Design Direction

> 감각적인 브랜드 웹사이트처럼 보이고, 가장 쉬운 콘텐츠 Studio처럼 동작한다.

---

## 3. Layout Principles

### 3.1 Generous Space

정보를 빽빽하게 배치하지 않는다.

여백은 낭비가 아니라 집중을 위한 도구다.

### 3.2 One Visual Focus

한 화면에는 하나의 중심이 있어야 한다.

- 홈: 무엇을 만들지 선택
- Composer: 콘텐츠
- Preview: 결과
- Publish: 발행 행동

### 3.3 Minimal Chrome

고정 Toolbar, 복잡한 Sidebar, Status Bar를 기본으로 사용하지 않는다.

필요한 기능은 상황에 맞게 나타난다.

### 3.4 Progressive Disclosure

초보자는 핵심 기능만 본다.

세부 설정은 필요할 때 열 수 있다.

### 3.5 Responsive by Design

긴 번역 문장, 다양한 화면 크기, 확대 환경을 고려한다.

텍스트 길이가 바뀌어도 레이아웃이 깨지지 않아야 한다.

---

## 4. Visual Hierarchy

우선순위:

1. 현재 콘텐츠
2. 현재 단계의 주요 행동
3. AI 제안
4. 보조 정보
5. 고급 설정

점수와 진단은 Personal Edition에서도 콘텐츠보다 강하게 보여서는 안 된다.

---

## 5. Color Principles

최종 브랜드 컬러는 Logo Sprint에서 확정한다.

현재 원칙:

- 한 개의 명확한 Primary Identity
- 한 개의 제한된 Accent
- 넓은 Neutral Surface
- 상태 컬러는 의미가 있을 때만 사용
- 그라디언트는 브랜드 시그니처에만 제한적으로 사용
- 경고와 성공을 색상만으로 표현하지 않음

컬러는 장식보다 브랜드 인식과 행동 유도에 사용한다.

---

## 6. Typography Principles

- 큰 제목은 브랜드 감성과 자신감을 전달한다.
- 본문은 장시간 읽어도 편안해야 한다.
- 입력 화면에서 폰트가 작아지지 않는다.
- 고령 사용자를 고려해 충분한 크기와 행간을 유지한다.
- 숫자, 점수, 메타데이터는 비교하기 쉽게 정렬한다.

사용자의 기본 브라우저 확대에서도 핵심 흐름이 유지되어야 한다.

---

## 7. Component Principles

### Button

버튼 이름은 기능보다 행동을 말한다.

권장:

- 새 글 만들기
- AI가 이어쓰기
- 이미지 추가
- 게시 준비하기

지양:

- Execute
- Apply
- Submit
- Process

한 화면의 Primary Button은 원칙적으로 하나다.

### Card

카드는 모든 정보를 감싸는 기본 장식이 아니다.

다음 중 하나일 때만 사용한다.

- 선택 가능한 대상
- 독립된 결과
- 요약 정보
- 다음 행동 제안

### Input

사용자가 무엇을 입력해야 하는지 명확한 예시를 제공한다.

빈 상태에서 막히지 않도록 시작 문구나 샘플을 제공한다.

### Navigation

사용자-facing 기본 메뉴는 최소화한다.

예시:

- Home
- Projects
- Create
- Publish
- Settings

---

## 8. Motion Principles

Motion은 감탄보다 이해를 돕기 위해 사용한다.

### 사용 목적

- 상태 전환 설명
- AI 진행 과정 표현
- 결과 생성
- 작업 완료
- 요소 재배치

### 금지

- 모든 Hover에 과도한 움직임
- 긴 인트로 애니메이션
- 생산성을 방해하는 축하 효과
- 의미 없는 로딩 Spinner 반복

### Signature Motion 후보

- 부드럽게 퍼지는 Bright Glow
- 콘텐츠 블록이 자연스럽게 정렬되는 움직임
- 품질 검사가 완료되며 선명해지는 상태
- 발행 준비 완료 시 절제된 확신 모션

---

## 9. Accessibility Principles

Grandma First는 Accessibility를 포함한다.

- 충분한 대비
- 키보드 탐색
- 명확한 Focus
- 최소 터치 영역 확보
- 색상에만 의존하지 않는 상태 표현
- 쉬운 문구
- 확대 시 레이아웃 유지
- 짧고 분명한 오류 해결 방법

---

## 10. No Generic Review

다음에 해당하면 재설계한다.

- SaaS Dashboard 템플릿처럼 보임
- Sidebar와 카드가 과도하게 많음
- AI 서비스에서 흔한 보라색 그라디언트를 무분별하게 사용
- 버튼과 Badge가 지나치게 많음
- 콘텐츠보다 설정이 먼저 보임
- 디자인만 보고 Bright Studio를 구분하기 어려움
