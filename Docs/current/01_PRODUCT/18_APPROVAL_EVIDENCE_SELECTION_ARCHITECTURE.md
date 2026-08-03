# Bright Studio Approval Evidence Selection Architecture

Version: 1.0

Status: Accepted

Applies to: Tistory, WordPress, and every future platform using `adsense_approval`

Last updated: 2026-08-03

Related documents:

- `14_ADSENSE_APPROVAL_CONTENT_POLICY.md`
- `15_ADSENSE_APPROVAL_MODE.md`
- `17_ADSENSE_APPROVAL_READINESS_BLUEPRINT.md`

---

## 1. Decision

검색 결과 전체를 승인 근거로 취급하지 않는다.

Bright Studio의 승인 출처 처리는 다음 세 단계를 분리한다.

```text
Source Discovery
→ Candidate Pool
→ Selected Evidence
→ Verified Claim Snapshot
```

새로운 검색 후보가 발견됐다는 이유만으로 기존 원고의 승인 준비 상태를 변경하거나 다시 실패시켜서는 안 된다.

---

## 2. Candidate Pool

Candidate Pool은 공식 근거로 사용할 가능성이 있는 검색 결과의 발견 목록이다.

후보는 다음 성격을 가진다.

- 아직 원고의 특정 Claim을 뒷받침하는 최종 근거가 아니다.
- 후보 자체의 Claim 불일치나 중복은 승인 준비 상태를 차단하지 않는다.
- 후보가 새로 추가돼도 저장된 승인 준비 실행 식별자는 변경되지 않는다.
- UI에서는 최종 근거와 분리해 `검색 후보 · 승인 판정 제외` 상태로 표시한다.
- 동일한 공식 페이지의 URL 표현 차이는 canonical identity로 통합한다.

후보는 진단과 향후 선택을 위해 보존할 수 있지만, 선택되기 전에는 Evidence Gate의 통과·실패 계산에 포함하지 않는다.

---

## 3. Selected Evidence

Selected Evidence는 현재 원고의 필수 Claim을 실제로 뒷받침하도록 채택된 공식 출처다.

선택 경로는 다음으로 제한한다.

- 사용자가 명시적으로 선택한 출처
- 원고에 명시적으로 연결된 공식 출처
- 시스템이 필수 Claim의 미검증 범위를 채우기 위해 결정적으로 선택한 최소 출처 집합

시스템 자동 선택은 후보 수를 채우는 작업이 아니다. 아직 검증되지 않은 필수 Claim을 가장 직접적으로 뒷받침하는 최소 출처만 승격한다.

선택된 출처는 다음 항목을 보존한다.

```text
canonical source URL
source provenance
linked Content block IDs
matched Claim roles
retrieved/check date
verification result
failure reason when verification fails
```

---

## 4. Verified Claim Snapshot

Selected Evidence가 공식 페이지 접근, 공식 도메인, Claim 일치 검증을 통과하면 현재 Content Revision에 대한 Verified Claim Snapshot을 만든다.

Snapshot은 최소한 다음 경계를 가진다.

```text
Content Revision ID
Approval Profile
Claim role / verified fact field
Selected source identity
Publishing context identity
Evidence verification date
Manuscript information-as-of date
Verification status
```

`정보 기준일`은 원고가 소유하는 날짜다.

`출처 확인일`과 `Claim 최종 검토일`은 시스템 Evidence가 소유하는 날짜다.

새로운 후보 발견은 Snapshot을 무효화하지 않는다.

다음 변경은 해당 Snapshot을 다시 검증해야 한다.

- 원고 Claim 또는 관련 Content block 변경
- 선택된 출처 변경
- 선택 출처의 공식 페이지 검증 결과 변경
- Approval Profile 변경
- 발행 계정·카테고리 등 Publishing Context 변경

---

## 5. URL Canonicalization and Deduplication

동일한 공식 페이지를 URL 문자열 차이 때문에 서로 다른 출처로 취급하지 않는다.

최소 정규화 범위:

- host 대소문자
- `www` 유무
- 허용되는 공식 경로 표현 차이
- 추적용 query parameter 제거
- 공식 페이지 identity parameter 보존
- 동일 canonical identity의 중복 후보 제거

`law.go.kr` 조문·법령해석례는 조문 또는 해석례 식별자를 중심으로 canonical identity를 만든다. 화면 표시나 라우팅에 필요한 공식 parameter는 보존한다.

중복 후보는 진단상 보존할 수 있지만 승인 판정에는 포함하지 않는다.

---

## 6. Readiness Identity Rule

승인 준비 실행 식별자는 다음만 반영한다.

```text
Current Content Revision
Publishing Context
Selected / explicitly owned Evidence
```

선택되지 않은 검색 후보는 Evidence fingerprint에서 제외한다.

따라서 같은 원고와 같은 선택 근거에 후보만 추가된 경우 저장된 현재 승인 준비 결과를 재사용한다.

---

## 7. UI Contract

승인 준비 화면은 출처를 한 목록으로 섞지 않는다.

```text
공식 근거 N개
검색 후보 M개
```

선택된 공식 근거에는 검증 완료, Claim 불일치, 검토 필요 상태를 표시한다.

검색 후보는 접힌 보조 영역에 표시하고 다음 의미를 명확히 알린다.

```text
새 후보는 채택되기 전까지 Claim coverage와 승인 상태를 변경하지 않습니다.
```

원고 기준일, Claim coverage, 최종 검토일은 서로 다른 역할로 표시한다.

---

## 8. Cross-Platform Boundary

Candidate Pool, Selected Evidence, Claim verification, canonicalization, snapshot identity는 Core에 둔다.

플랫폼별 차이는 Approval Profile과 공개 사이트 Adapter에 둔다.

```text
Core
├─ Evidence Candidate Pool
├─ Evidence Selection
├─ Claim Verification
├─ Source Canonicalization
└─ Verified Claim Snapshot

Apps
├─ Tistory Approval Profile / Adapter
├─ WordPress Approval Profile / Adapter
└─ Future Platform Profile / Adapter
```

WordPress 전용 예외로 후보 오류를 숨기거나 특정 법령 URL을 하드코딩해 통과시키지 않는다.

---

## 9. AI Call Policy

Evidence 후보가 추가되거나 deterministic selection이 다시 실행됐다는 이유로 AI 호출을 추가하지 않는다.

기본 호출 정책은 유지한다.

```text
AI Generation: 1 call
Quality Review: 1 call
```

후보 분리, 출처 정규화, Claim 선택, Snapshot 무효화 판단은 재사용 가능한 deterministic Core 로직으로 처리한다.

---

## 10. Acceptance Criteria

다음 조건을 모두 만족해야 이 구조가 구현된 것으로 본다.

- 관련 없는 새 후보가 추가돼도 기존 승인 준비 결과가 변하지 않는다.
- 필수 Claim을 덮는 후보만 Selected Evidence로 승격된다.
- 선택되지 않은 후보의 Claim 불일치는 승인 차단 사유가 아니다.
- 같은 공식 출처의 URL 변형은 하나의 canonical identity로 처리된다.
- 선택된 출처 또는 원고 Claim 변경 시에는 다시 검증된다.
- 원고의 `정보 기준일`과 시스템의 검토 날짜가 분리된다.
- UI에서 공식 근거와 검색 후보가 분리된다.
- Tistory와 WordPress가 같은 Core selection 계약을 사용한다.
- 새로운 AI 호출 없이 동작한다.
- 전체 typecheck, lint, test, production build가 통과한다.
