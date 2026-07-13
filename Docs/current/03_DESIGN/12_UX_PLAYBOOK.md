# Bright Studio UX Playbook

## 1. UX Goal

> 처음 사용하는 사람도 5분 안에 첫 콘텐츠를 만들 수 있어야 한다.

사용자는 Content Model, Block, Prompt, SEO 전략을 이해할 필요가 없다.

---

## 2. Primary User Flow

```text
Home
→ What do you want to create?
→ Minimal input
→ AI creates and improves
→ User reviews
→ Publish Ready
→ Publish
```

---

## 3. Grandma Test

다음 조건을 만족해야 한다.

- 설명서 없이 시작 가능
- 다음 행동이 화면에 보임
- 전문 용어가 없음
- 작은 글자에 의존하지 않음
- 오류가 발생하면 해결 방법을 안내
- 실수해도 되돌릴 수 있음
- 사용자의 선택을 최소화

---

## 4. First Run Experience

첫 실행에서 설정 화면을 먼저 보여주지 않는다.

권장 구조:

```text
안녕하세요.

오늘 무엇을 만들고 싶으세요?

[블로그 글]
[유튜브 콘텐츠]
[상품 소개]
[자유롭게 작성]
```

사용자는 제품의 구조를 배우지 않고 바로 결과를 만든다.

---

## 5. Empty State

빈 화면을 그대로 보여주지 않는다.

모든 Empty State는 하나 이상을 제공한다.

- 추천 시작점
- 예시
- 최근 작업
- 가져오기
- AI 추천
- Primary Action

---

## 6. One Primary Action

한 화면에는 가장 중요한 행동 하나를 명확히 보여준다.

보조 행동은 시각적으로 약하게 처리하거나 필요할 때 노출한다.

---

## 7. Progressive Disclosure

### 기본

- 제목
- 본문
- 사진
- 영상
- 게시

### 필요 시

- 버튼
- 표
- FAQ
- 내부 링크
- SEO
- 광고
- 고급 설정

사용자에게 Block이라는 개념을 강요하지 않는다.

---

## 8. AI Interaction

AI는 다음 방식으로 동작한다.

- 먼저 추천한다.
- 이유는 필요할 때만 보여준다.
- 사용자의 작업을 가로막지 않는다.
- 결과를 자동으로 개선한다.
- 실패 시 기술 오류 대신 해결 방법을 안내한다.

예:

```text
이미지 설명이 비어 있어요.
검색과 접근성을 위해 자동으로 작성할까요?
```

---

## 9. Quality Experience

### Commercial Edition

```text
게시 준비 완료
AI가 품질 검사를 마쳤습니다.
```

세부 점수는 기본적으로 숨긴다.

### Personal Edition

- Overall
- SEO
- Readability
- Search Intent
- Image Strategy
- CTA
- Internal Links
- 상세 개선 근거

낮은 점수를 단순 경고로 보여주기보다 자동 개선 결과와 남은 이유를 설명한다.

---

## 10. Error Experience

오류 메시지는 다음 형식을 따른다.

1. 무슨 일이 발생했는가
2. 사용자의 작업이 안전한가
3. 다음에 무엇을 하면 되는가

예:

```text
영상을 불러오지 못했습니다.
작성한 내용은 그대로 보관되어 있습니다.
링크를 다시 확인하거나 나중에 추가할 수 있습니다.
```

---

## 11. Loading Experience

단순한 `Loading...`보다 실제 진행 단계를 보여준다.

```text
검색 의도를 확인하고 있어요.
독자에게 필요한 내용을 정리하고 있어요.
콘텐츠 구조를 만들고 있어요.
품질을 검토하고 있어요.
```

내부 구현 단계를 그대로 노출하지 않고 사용자 가치 중심으로 표현한다.

---

## 12. Navigation

Navigation은 제품 구조보다 사용자의 목적을 반영한다.

권장:

- Home
- Projects
- Create
- Publish
- Settings

Personal Edition의 고급 기능은 별도 패널이나 Advanced View로 제공한다.

---

## 13. UX Acceptance Criteria

새 화면은 다음을 만족해야 한다.

- 첫 행동을 3초 안에 알 수 있음
- Primary Action이 하나임
- 불필요한 설정이 기본 화면에 없음
- 작은 글자 없이 사용 가능
- 빈 화면이 없음
- 오류 해결 방법이 보임
- AI가 사용자의 다음 행동을 줄여 줌
- Personal 기능이 Commercial 경험을 방해하지 않음
