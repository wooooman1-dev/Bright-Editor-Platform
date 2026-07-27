# Bright Studio AdSense Approval Preparation Mode

Version: 1.0

Status: Accepted

Applies to: Bright Studio의 플랫폼 공통 AdSense 승인 준비 콘텐츠 Workflow

Last updated: 2026-07-27

---

## 1. Purpose

이 문서는 Bright Studio가 Tistory, WordPress 및 향후 플랫폼에서 AdSense 승인 준비용 콘텐츠를 기획, 생성, 검토, 편집하고 Draft로 저장할 때 적용할 공통 제품 정책을 정의한다.

이 기능은 AdSense 승인을 보장하지 않는다. Bright Studio는 외부 승인 가능성을 단정하지 않고 이 문서에 정의된 내부 준비 상태만 보고한다.

승인 준비 모드는 글 개수나 글자 수를 채우는 기능이 아니다. 사이트 정체성, 독자 문제 해결, 고유한 정보 가치, 정확성, 완결성 및 사이트 신뢰성을 우선한다.

---

## 2. Canonical Content Purpose

콘텐츠 목적은 다음 두 값만 사용한다.

```text
standard
adsense_approval
```

`adsense_approval`은 Project의 기본 목적이 될 수 있고, Content Planning을 시작할 때 Content에 snapshot으로 저장한다.

Planning이 시작된 뒤에는 해당 Content의 목적과 적용 정책 버전을 임의로 바꾸지 않는다. 목적을 바꾸려면 현재 Planning을 명시적으로 취소하고 새 Content로 다시 시작한다.

기존 Project와 Content에 목적 값이 없으면 `standard`로 읽는다.

---

## 3. Policy Review Contract

승인 준비 Content의 각 주요 단계는 실행 전에 다음 정책을 확인한다.

```text
공통 승인 준비 정책
+
Project 승인 정책 프로필
+
Project Content Strategy
+
확정된 Content Opportunity
```

적용 단계:

```text
Planning
→ Content Opportunity
→ Generation
→ Quality Review
→ Editor 재검토
→ Rendering
→ Draft Preparation
```

공통 정책과 Project 프로필의 식별자 및 버전은 Content에 저장하여 화면 이동, 새로고침, 재검토 후에도 동일한 정책을 사용한다.

정책 문서는 개발 문서에만 머물지 않는다. Runtime은 승인된 정책 계약을 Planning, Generation 및 Quality Review Context에 포함해야 한다.

---

## 4. Common Approval Preparation Requirements

승인 준비 원고는 다음 기준을 충족해야 한다.

- 사이트와 Project의 주제 및 목적에 일관되게 속한다.
- 사용자의 검색 의도와 실제 문제를 직접 해결한다.
- 광고가 없어도 독립적인 정보 가치가 있다.
- 다른 글이나 공식 문서를 문장만 바꿔 재작성하지 않는다.
- 제목과 키워드만 바꾼 반복 원고가 아니다.
- 단순 목록, 얇은 요약, 의미 없는 서론과 결론으로 분량을 늘리지 않는다.
- 핵심 설명, 판단 기준, 필요한 예시, 주의사항, 예외 및 다음 행동이 주제에 맞게 완결되어 있다.
- 확인된 사실과 편집 해설 또는 일반적 해석을 구분한다.
- 확인하지 않은 사실, 인용, 통계, 기관명, 작품명, URL 또는 출처를 만들지 않는다.
- 과장, 공포 자극, 허위 긴급성, 보장 표현 및 승인 유도 문구를 사용하지 않는다.
- 기존 공개 콘텐츠와 실제 관련성이 있을 때만 내부 링크를 사용한다.
- 빈 내부 링크, 예정 링크, 편집자 메모 및 공개 placeholder를 출력하지 않는다.
- 저작권과 출처가 불명확한 이미지 또는 자료 사용을 요구하지 않는다.
- 모바일에서도 제목, 문단, 목록, 표와 강조 요소가 읽기 쉽다.

---

## 5. Prohibited Claims

다음 표현과 의미는 승인 준비 상태를 차단한다.

- `AdSense 승인 보장`
- `100% 승인`
- `이 글이면 반드시 통과`
- 검증되지 않은 수익, 검색량, 순위 또는 성과 보장
- 근거 없는 전문가 경험 또는 직접 사용 경험
- 존재하지 않는 공식 기관, 인물, 작품, 출처 또는 URL
- 다른 콘텐츠를 복제하거나 단어만 바꾼 대량 유사 원고

Bright Studio의 사용자 표시 상태는 다음처럼 제한한다.

```text
승인 준비 기준 충족
검토 필요
정책 미충족
출처 보완 필요
중복 위험
얇은 콘텐츠 위험
```

---

## 6. Quality Gate

승인 준비 모드는 기존 표준 품질 승인을 대체하지 않는다.

통과 조건:

```text
기존 standard Quality Approval
+
승인 준비 공통 정책 통과
+
적용 Project 프로필 통과
+
현재 Content Revision과 Review 일치
```

승인 준비 검토는 다음 진단을 포함한다.

- 사이트 주제 일관성
- 고유 정보 가치
- 기존 콘텐츠 중복 위험
- 얇은 콘텐츠 위험
- 사실 및 출처 신뢰성
- 과장 및 보장 표현
- 독자 문제 해결
- 공개 준비 완결성

품질 미달 원고도 canonical ContentDocument를 만들 수 있으면 삭제하지 않고 `in_review` 상태로 Editor에 보존한다.

---

## 7. Information Sufficiency

승인 준비 품질은 목표 글자 수, 최소 문단 수, 최소 게시물 수 또는 최소 Category 수로 판단하지 않는다.

필요한 정보량은 검색 의도와 독자 문제에 따라 결정한다. 표, 목록, 체크리스트와 단계 구조는 prose를 대체할 수 있다.

반복, 장황함, 의미 없는 확장 및 승인용 글 개수 채우기는 실패로 본다.

---

## 8. AI Call Policy

승인 준비 모드도 기존 비용 정책을 유지한다.

```text
AI Generation: 1회
Quality Review: 1회
```

승인 준비 전용 별도 AI 호출을 추가하지 않는다. 정책은 기존 Planning, Generation 및 Quality Review Context에 통합한다.

규칙 기반 검증으로 처리 가능한 금지 표현, placeholder, 정책 버전, 상태 일치 및 필수 metadata는 AI 호출 없이 검사한다.

---

## 9. Publishing Safety

승인 준비 모드의 기본 외부 작업 정책은 다음과 같다.

```text
Review First: ON
Draft Only: ON
Public Publish: OFF
Scheduling: OFF
```

승인 준비 기준 충족은 외부 공개 승인이 아니다. Tistory 또는 WordPress Draft Save는 각 플랫폼 Adapter의 검증 조건을 별도로 통과해야 한다.

---

## 10. Project Profiles

공통 정책은 분야별 사실 기준을 임의로 결정하지 않는다. 각 Project는 승인된 정책 프로필을 사용한다.

초기 프로필:

```text
wordpress_life_economy_v1
→ Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md

tistory_vivarain_art_v1
→ Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md
```

Project 프로필은 다음을 정의한다.

- 사이트 정체성
- 대상 독자
- 허용 주제와 제외 주제
- 우선 출처
- 변경 가능한 정보의 기준일 정책
- 분야별 고유성 기준
- 분야별 금지 표현과 안전 기준
- 필요한 공개 페이지와 사이트 완성도 조건

프로필이 없거나 읽을 수 없으면 승인 준비 완료 상태로 만들지 않는다.

---

## 11. Runtime Persistence

승인 준비 Content에는 최소한 다음 정보를 보존한다.

```text
contentPurpose
approvalPolicyId
approvalPolicyVersion
approvalProfileId
approvalProfileVersion
```

Project에는 기본값을 보존한다.

```text
defaultContentPurpose
approvalProfileId
```

기존 저장 데이터는 삭제하거나 일괄 변환하지 않는다. 누락된 값은 읽기 시 `standard`로 해석한다.

---

## 12. Completion Boundary

승인 준비 모드 구현 완료는 다음을 모두 확인한 뒤에만 선언한다.

- Project 기본 목적 저장 및 복원
- Content 목적과 정책 snapshot 저장 및 복원
- Planning Context 적용
- Generation Context 적용
- Quality Review Gate 적용
- Editor에서 적용 정책과 미달 이유 표시
- 기존 standard Content 회귀 없음
- Generation 1회 + Quality Review 1회 유지
- lint, typecheck, automated tests, build 통과
- 실제 브라우저에서 승인 준비 Content 생성 및 재진입 확인

자동 테스트만으로 외부 AdSense 승인 또는 플랫폼 Draft 저장을 검증했다고 말하지 않는다.
