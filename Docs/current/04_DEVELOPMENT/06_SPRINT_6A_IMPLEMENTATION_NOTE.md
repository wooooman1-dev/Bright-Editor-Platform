# Sprint 6A — Presentation Contract Foundation Historical Note

Status: Implemented Foundation; Absorbed into Integrated Sprint 6

Integrated Sprint: `Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling`

이 문서는 삭제하지 않는 구현 이력 문서다. Sprint 6A에서 완료한 계약 기반은 통합 Sprint 6 Workstream A의 Foundation으로 흡수되었다. Sprint 6A나 기존 Sprint 6.5는 별도 개발 단계 또는 완료 판정 단위로 사용하지 않는다.

## Implemented Foundation

- Platform-independent PresentationDocument and PresentationNode contracts
- Approved PlatformId and BrightSemanticRole contracts
- Presentation resolution request/options contracts
- ThemeReference boundary only
- Presentation warning, error, version, and compatibility contracts
- Pure PresentationDocument validation
- TistoryHtmlRenderer characterization baseline tests

## Not Implemented

Workstream A Runtime:

- Component Registry
- Bright Component definitions
- Theme tokens and deterministic Presentation Resolver
- Theme-independent semantic HTML contract and sanitizer
- RenderArtifact and checksum
- PreviewApproval and invalidation
- Preview and Draft same-Artifact Runtime
- Tistory Draft reopen semantic verification

Workstream B Domain and Runtime:

- ScheduledPublication and ScheduleJob
- Asia/Seoul scheduling policy
- schedule.publish Permission and registered workflows
- pinned Revision, Account and Category
- Tistory native schedule create, update-time, cancel, list and verify
- duplicate prevention and failed-only retry
- restart restoration
- real Tistory schedule verification

## Gate 0

통합 Sprint 구현 전 실제 Tistory Draft Save 전체 E2E를 통과해야 한다. 실제 Draft를 저장하고 다시 열어 제목, 의미 있는 본문 구조, Category와 비공개 상태를 확인해야 한다. Save click, partial verification 또는 자동 테스트만으로는 Gate 0을 통과하지 않는다.

Gate 0 통과 전에는 Workstream A Runtime 또는 Workstream B 구현을 시작하지 않는다.

## Protection Boundary

Foundation 구현은 ContentDocument persistence, AI workflows, Quality Gate, Permission Gate, Tistory renderer Runtime, Preview Runtime, Draft Save Runtime 또는 Playwright workflows를 변경하지 않았다.

통합 Sprint는 Presentation과 Scheduling Runtime 및 실제 외부 검증이 모두 완료되기 전에는 `Completed` 또는 `Verified`로 표시하지 않는다.
