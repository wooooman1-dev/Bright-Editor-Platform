# Bright Studio AdSense Approval Readiness Blueprint

Version: 1.0

Status: Accepted

Applies to: Tistory, WordPress, and every future platform using `adsense_approval`

Last updated: 2026-07-31

---

## 1. Product Objective

승인 준비 콘텐츠의 실제 목적은 단순히 “승인용처럼 보이는 글”을 만드는 것이 아니라, 알려진 AdSense 거절 위험을 가능한 한 제거하고 실제 승인 준비 수준을 높이는 것이다.

Bright Studio는 외부 AdSense 승인 결과를 보장하지 않는다. 그러나 확인 가능한 품질·정책·출처·중복·사이트 완성도 문제를 남긴 채 승인 준비 완료로 표시해서는 안 된다.

다음 표현은 금지한다.

```text
승인 보장
100% 승인
반드시 통과
이 글이면 승인 가능
```

제품이 표시할 수 있는 상태는 내부 준비 상태뿐이다.

```text
원고 품질 승인
출처 검증 통과
중복 검증 통과
사이트 준비 상태 통과
승인 준비 검토 필요
AdSense 신청 준비 안 됨
```

---

## 2. Cross-Platform Rule

Tistory와 WordPress는 서로 다른 승인 품질 기준을 사용하지 않는다.

플랫폼 공통 검증은 Core 또는 플랫폼 독립 Application Service에 둔다.

```text
Core Approval Engine
├─ Article Approval Gate
├─ Evidence Verification
├─ Duplicate Risk Check
└─ Site Approval Readiness Gate
```

플랫폼별 차이는 Profile과 Adapter에 둔다.

```text
Apps
├─ Tistory Vivarain Profile
└─ WordPress 밝은재테크 Profile
```

Tistory는 플랫폼이 일부 기술 기반을 제공하지만, 콘텐츠 품질·출처·저작권·메뉴·카테고리·내부 탐색·신뢰 페이지·모바일 공개 화면 검증 책임이 사라지지 않는다.

WordPress는 사이트 전체를 새로 구성하므로 테마, 메뉴, 카테고리, 태그, 정책 페이지, robots, sitemap, 속도, 모바일, 플러그인 충돌 등 추가 기술 검증이 필요하다.

---

## 3. Article Approval Gate

사람 중심의 유용성·독창성·신뢰성에 대한 canonical 원칙은 `15_ADSENSE_APPROVAL_MODE.md`의 `People-First Value and Trust Principle`을 따른다. 이 Blueprint는 해당 내용을 프로필마다 복사하지 않고 같은 policy/profile snapshot을 Planning, Content Opportunity, Generation 및 Quality Review가 사용하는 계약을 유지한다.

모든 승인 준비 원고는 다음 조건을 만족해야 한다.

- Project와 사이트의 주제 정체성에 일관되게 속한다.
- 검색 의도와 독자의 실제 질문을 직접 해결한다.
- 광고가 없어도 독립적인 정보 가치가 있다.
- 단순 목록, 얇은 요약, 키워드 치환형 원고가 아니다.
- 기존 글이나 공식 자료를 문장만 바꿔 재작성하지 않는다.
- 사실, 일반적 해석, 편집 해설을 구분한다.
- 확인되지 않은 사실, 인용, URL, 기관, 수치, 경험을 만들지 않는다.
- 허위 긴급성, 과장, 공포 자극, 보장 표현을 사용하지 않는다.
- 독자가 실제로 사용할 판단 기준, 예시, 주의사항, 예외와 다음 행동을 제공한다.
- 빈 링크, 예정 링크, 작성자 메모, placeholder를 공개 본문에 남기지 않는다.
- 현재 Content Revision과 Quality Review 결과가 일치한다.

Article Quality Score만으로 승인 준비 완료를 표시하지 않는다.

---

## 4. Evidence Verification

승인 준비 원고는 AI의 일반 지식만으로 사실을 확정해서는 안 된다.

기본 흐름:

```text
공식 자료 수집
→ Evidence Pack 저장
→ 검증된 사실만 Generation에 전달
→ AI Generation 1회
→ 동일 Evidence Pack으로 Quality Review 1회
→ 원고와 Evidence 불일치 시 차단
```

Evidence Pack은 분야에 맞게 최소한 다음을 보존한다.

```text
공식 기관 또는 권리 보유 기관
공식 페이지 URL
자료 제목
확인 날짜
최종 검토 날짜
원고에 사용할 수 있는 검증 사실
변경 가능성
제약과 예외
이미지 또는 자료 이용 조건
```

### Tistory Vivarain Art

최소 검증 대상:

- 작가명
- 작품명
- 제작연도
- 재료
- 크기
- 소장처
- 공식 미술관·박물관·재단·공공 아카이브 페이지
- 주요 출처와 최종 검토일
- 이미지 이용 조건

### WordPress 밝은재테크

최소 검증 대상:

- 공식 기관
- 공식 페이지 URL
- 적용 대상
- 신청 또는 적용 기간
- 금액, 소득 기준, 금리, 세율
- 예외와 주의사항
- 정보 기준일과 최종 검토일

본문에 `출처`라는 단어가 있다는 이유만으로 검증 통과 처리하지 않는다.

---

## 5. Duplicate Risk Check

새 원고는 기존 공개 글과 기존 canonical Content 전체를 비교해야 한다.

검사 범위:

- 주제 중복
- 검색 의도 중복
- 독자 문제 중복
- H2 구조 반복
- 핵심 주장 반복
- 같은 서론·결론 템플릿 반복
- 문장 유사도
- 공식 자료 단순 재작성
- 기존 글 대비 새롭게 제공하는 정보 가치

제목이나 작가명, 제도명만 바뀌고 제공 가치가 같은 원고는 승인 준비 상태로 통과시키지 않는다.

후보 수를 채우기 위해 유사 원고를 만들지 않는다.

---

## 6. Internal Link and Navigation Policy

내부 링크는 승인 목적 글에서도 제외하지 않는다.

기본 정책:

```text
본문 문맥 내부 링크: 최대 1개
하단 관련 글: 최대 3개
적합한 공개 후보가 없으면 0개
```

관련성이 없는 글을 슬롯 채우기 목적으로 넣지 않는다.

다음 상태는 서로 구분해 표시해야 한다.

```text
적합한 후보 없음
카테고리 누락
공개 글 카탈로그 조회 실패
후보는 있으나 배치 실패
정상 배치 완료
```

내부 링크를 점수 계산에서 제외할 수는 있지만, 후보 또는 시스템 상태를 평가하지 않은 채 100점만 표시해서는 안 된다.

사이트 전체 탐색 가능성은 Site Approval Readiness Gate에서 별도로 평가한다.

---

## 7. Site Approval Readiness Gate

AdSense 승인 준비는 글 한 편이 아니라 사이트 전체 상태를 대상으로 한다.

Tistory와 WordPress 모두 다음을 확인한다.

- 사이트 주제와 대상 독자가 명확하다.
- 메뉴와 카테고리를 통해 주요 콘텐츠를 찾을 수 있다.
- 빈 카테고리, 빈 메뉴, 빈 공개 페이지가 없다.
- 깨진 링크와 고아 글이 없다.
- 소개, 문의, 개인정보처리방침 등 필요한 신뢰 페이지가 공개되어 있다.
- 모바일 공개 화면이 정상적으로 읽힌다.
- 공개 글이 실제로 접근 가능하다.
- 저작권과 이미지 이용 조건에 문제가 없다.
- 전체 글의 주제와 품질이 일관된다.
- 공사 중이거나 placeholder 사이트처럼 보이지 않는다.

### Additional WordPress Checks

- HTTPS
- robots.txt
- XML sitemap
- 검색 및 AdSense crawler 접근
- GeneratePress 기반 Theme 구조
- Category와 Tag archive 품질
- 불필요한 빈 archive 차단
- 플러그인 충돌
- 모바일 레이아웃
- 성능과 깨진 Template
- 광고 코드와 사용자 경험 충돌

### Automatic Audit Boundary

현재 자동 Site Approval Readiness는 공개 사이트에서 실제로 관찰할 수 있는 사실만 판정한다.

자동 검사 범위:

- 안전한 공개 사이트 주소
- 공개 접근과 응답 상태
- HTTPS
- 페이지 제목과 의미 있는 본문
- Project 주제와 사이트 정체성 신호
- 모바일 viewport 설정
- 메뉴와 공개 탐색 링크
- Category 또는 archive 링크
- 개인정보처리방침
- 사이트 소개와 문의 경로
- 공사 중·점검 중·placeholder 문구
- robots.txt
- homepage noindex와 crawler 전체 차단
- XML sitemap 접근

현재 연결 방식으로 확정할 수 없는 다음 항목은 자동 통과나 실패로 만들지 않는다.

- WordPress 관리자 내부의 Theme·Plugin 상태와 충돌
- Google Search Console 및 Google Analytics 계정 연결 상태
- 실제 검색 색인 상태와 sitemap 제출 처리 상태
- Lighthouse 또는 실제 사용자 성능 점수
- 사이트 전체 이미지와 자료의 법적 저작권 확정
- 공개 글 전체의 주제·품질 일관성에 대한 완전한 전수 판정
- 외부 AdSense 승인 가능성

이 항목은 글마다 사용자가 체크하는 수동 통과 항목으로 만들지 않는다. 현재 자동 준비 상태를 차단하지 않으며, 향후 관리자 진단·Search Console·성능 측정·사이트 전수 검사 연동이 구현되면 실제 관찰 결과로 대체한다.

이미 완료된 사이트 운영 설정은 각 Content의 수동 체크박스로 반복 입력하지 않는다. Site Approval Readiness는 자동 검사 결과와 별도 운영 설정을 혼동하지 않는다.

Google Search Console 연결, Google Analytics 연결, 검색엔진 차단 여부, 실제 색인 상태, sitemap 제출 상태와 AdSense 승인 가능성은 Content Quality 점수로 판정하지 않는다. 자동 연동이 없는 상태에서는 공개 사이트 검사 결과에 포함하지 않으며, 연결이 구현되면 Site Approval Readiness의 별도 관찰 상태로 관리한다. 사이트가 검색엔진 색인을 차단하고 있어도 그 사실만으로 원고 품질을 실패 처리하지 않는다.

사이트 Gate가 미완료이면 원고 품질이 100이어도 `AdSense 신청 준비 완료`로 표시하지 않는다.

---

## 8. Quality Status Contract

승인 준비 화면은 다음 상태를 분리한다.

```text
원고 품질
출처 검증
중복 검증
승인 정책
내부 링크 진단
사이트 준비 상태
```

`standard 품질 승인`과 `승인 준비 정책 통과`를 같은 의미로 표시하지 않는다.

Content Quality는 독자 가치, 독창적 기여, 사실 신뢰성, 완결성, 투명성, 가독성, 검색 의도 충족과 정책 안전성을 평가한다. Site Readiness는 현재 연결된 Adapter가 실제로 관찰할 수 있는 crawler 접근, 공개 탐색, 신뢰 페이지, sitemap 및 사이트 운영 상태를 별도 평가한다. 어느 한쪽의 통과가 다른 쪽의 통과를 자동으로 만들지 않는다.

예:

```text
원고 품질: 100
표준 품질 승인: 통과
승인 정책: 통과
출처 검증: 검토 필요
중복 검증: 통과
내부 링크: 카테고리 누락
사이트 준비 상태: 미완료
AdSense 신청 준비: 안 됨
```

---

## 9. AI Call and Cost Policy

기존 비용 원칙을 유지한다.

```text
AI Generation: 1회
AI Quality Review: 1회
```

Evidence 수집, URL 검증, metadata 검증, duplicate fingerprint, 내부 링크 후보 확인, 사이트 구조 검증은 가능한 한 규칙 기반 또는 Provider Adapter 기반으로 처리한다.

승인 준비 전용 추가 AI 호출을 기본 구조로 만들지 않는다.

---

## 10. Publishing Safety

```text
Review First: ON
Draft Only: ON
Public Publish: OFF
Scheduling: OFF
```

실제 플랫폼 Draft 저장은 저장 후 다시 열어 제목, 의미 있는 본문, 카테고리, 이미지, Draft 상태를 검증하기 전까지 완료로 표시하지 않는다.

승인 준비 기준 충족과 외부 AdSense 승인은 서로 다른 상태다.

---

## 11. Completion Boundary

승인 준비 시스템 완료는 다음을 모두 확인한 뒤에만 선언한다.

- Article Approval Gate
- Evidence Pack 저장과 복원
- 원고 사실과 Evidence 일치 검증
- Duplicate Risk Check
- 내부 링크 상태 진단
- Site Approval Readiness Gate
- 표준 품질과 승인 준비 상태 UI 분리
- Tistory 실제 승인 준비 원고 생성·재진입 검증
- WordPress 실제 Draft 생성·재진입 검증
- Generation 1회 + Quality Review 1회 유지
- 기존 standard 콘텐츠 회귀 없음
- lint, typecheck, tests, build 통과

자동 테스트나 내부 점수만으로 외부 AdSense 승인 가능성을 보장하거나 실제 승인 완료라고 말하지 않는다.
