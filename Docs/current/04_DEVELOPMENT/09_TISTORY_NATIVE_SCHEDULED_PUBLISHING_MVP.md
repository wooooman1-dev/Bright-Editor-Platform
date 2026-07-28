# Tistory Native Scheduled Publishing MVP

Status: Approved / Foundation Implementation In Progress

Approved: 2026-07-28

Repository baseline: `main@0f14b8bee306b77d9b928ba72f8f3a8496ad2000`

Implementation branch: `feat/tistory-native-scheduled-publishing`

## 1. Purpose

Bright Studio는 로컬 스케줄러가 예약 시각까지 대기한 뒤 공개 발행을 실행하지 않는다. Tistory가 제공하는 자체 예약 기능에 사용자가 검토하고 최종 확인한 현재 Content Revision을 등록하고, 외부 예약 상태를 다시 확인한 경우에만 예약 완료로 기록한다.

예약 발행은 기존 임시저장과 다른 결과를 만든다. 예약이 정상 등록되면 Tistory가 지정 시각에 글을 공개할 수 있으므로 별도의 명시 권한과 매 실행 최종 확인이 필요하다.

## 2. Non-negotiable safety policy

- Review First 유지
- Draft Only 기본 정책 유지
- `publish.execute` 기본 Disabled 유지
- 예약 등록 권한은 계정별 `schedule.create`로 별도 관리
- 예약 권한은 `safeDraftPermissions`에 포함하지 않음
- 예약 등록마다 사용자 최종 확인 필요
- AI가 예약 시각을 임의로 결정하거나 자동 실행하지 않음
- 로컬 프로세스가 공개 시각까지 대기하지 않음
- 기존 Tistory Draft worker의 예약·공개 버튼 클릭 금지 정책을 완화하지 않음
- 실제 Tistory 화면을 확인하기 전 selector, locator, 최종 클릭 코드를 작성하지 않음
- 버튼 클릭만으로 성공 처리하지 않고 외부 예약 상태를 다시 검증
- 최종 클릭 이후 결과가 불확실하면 자동 재시도하지 않고 `scheduled_unverified`로 보존

## 3. Architecture boundary

```text
User
→ Schedule Readiness
→ Final Confirmation
→ Publishing Command
→ Server Permission Gate
→ Atomic Schedule Reservation
→ Tistory Publishing Service
→ Tistory Adapter
→ Registered Schedule Workflow
→ Playwright
→ Tistory Native Schedule
→ External Verification
→ Server-owned ScheduledPublication
```

### Core

Core는 플랫폼 독립 계약만 소유한다.

- ScheduledPublication 상태와 전이
- 미래 시각 및 IANA timezone 검증
- deterministic request fingerprint
- 활성 예약 중복 판정
- stable persistence key
- platform-independent schedule adapter interface

Core는 Tistory URL, selector, 버튼 문구 또는 화면 구조를 알지 않는다.

### Application

Application은 다음을 소유한다.

- Workspace / Project / Content 소유권
- 현재 Content Revision 고정
- Quality 및 승인 준비 상태
- PlatformConnection 선택과 권한
- category snapshot
- 원자적 예약 선점
- 영구 저장과 Audit
- API orchestration
- 안전한 재시도 경계

### Apps/Tistory

Apps/Tistory는 다음을 소유한다.

- 실제 Tistory editor / management URL
- Tistory selector와 locator
- 예약 UI 해석
- 날짜·시간 입력
- 예약 등록 최종 클릭
- 관리 목록 및 재진입 검증
- Tistory 결과 정규화

### UI

UI는 예약 날짜·시간 입력, 계정·카테고리·Revision 표시, Readiness checklist, 결과 표시만 담당한다. UI가 Permission Gate, Playwright, SecretStore 또는 외부 selector를 직접 호출하지 않는다.

## 4. Permission contract

Account permissions:

- `schedule.create`
- `schedule.update`
- `schedule.cancel`

MVP registered workflows:

- `schedule.create`
- `schedule.verify`

`schedule.verify`는 외부 상태 읽기 전용이며 `schedule.create` 권한 경계 안에서 실행한다. `schedule.update`와 `schedule.cancel`은 모델에 선언하되 실제 Tistory 수정·취소 동작이 검증되기 전에는 workflow로 등록하지 않는다.

예약 권한을 켜도 다음 권한은 자동으로 켜지지 않는다.

- `publish.execute`
- `post.update`
- `post.delete`
- `account.settings.update`

## 5. ScheduledPublication contract

```ts
type ScheduledPublication = Readonly<{
  id: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  platform: "tistory" | "wordpress";
  platformConnectionId: string;
  revisionId: string;
  scheduledAt: string;
  timezone: string;
  status:
    | "registering"
    | "scheduled_verified"
    | "scheduled_unverified"
    | "failed"
    | "cancelled"
    | "published";
  categoryId: string | null;
  categoryName: string | null;
  requestFingerprint: string;
  operationId: string;
  registeredAt?: string;
  verifiedAt?: string;
  externalPostId?: string;
  externalManagementUrl?: string;
  publicUrl?: string;
  attemptCount: number;
  lastAttemptAt: string;
  failureCode?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}>;
```

## 6. Time policy

Core는 시간대가 포함된 ISO datetime과 유효한 IANA timezone을 받는다.

Tistory MVP UI 및 Application policy는 `Asia/Seoul`만 허용한다. 저장 시에는 사용자가 입력한 벽시각 문자열이 아니라 timezone offset이 포함된 절대 시각을 저장한다.

예약 시각은 서버 현재 시각보다 미래여야 한다. 실제 Tistory가 요구하는 최소 예약 간격은 UI 조사 후 확인된 값만 추가한다.

## 7. Revision lock

예약은 현재 canonical `ContentDocument`에서 계산한 `revisionId`에 고정된다.

예약 등록 후 원고를 편집해도 기존 예약의 Revision은 변경하지 않는다. 계정, 카테고리 또는 Revision 변경은 기존 예약을 암묵적으로 수정하지 않는다. MVP에서는 변경된 현재 원고와 활성 예약의 Revision이 다르면 경고하고 새 예약 실행을 차단한다.

## 8. Readiness contract

예약 등록 Readiness는 다음을 모두 확인한다.

- Tistory Workspace 활성화
- Workspace 소유 PlatformConnection
- 연결 및 검증 상태
- 실제 stored session 존재
- Project / Content target 선택
- 현재 계정의 category snapshot
- 현재 canonical document 존재
- 현재 Revision의 standard Quality 승인
- 로컬 이미지가 있으면 `media.upload` 권한
- 계정별 `schedule.create` 권한
- `Asia/Seoul` timezone policy
- 미래 예약 시각
- 같은 Content + Platform의 활성 예약 없음
- Review First
- Draft Only 및 즉시 공개 권한 비활성
- 승인 준비 콘텐츠라면 현재 Revision의 저장된 Approval Readiness와 Evidence 검토 Revision 일치
- 실행 시 최종 사용자 확인

`ready`는 최종 확인을 제외한 준비 상태다. `executable`은 `ready`이면서 최종 확인까지 완료된 상태다.

## 9. Approval-mode content

AdSense 승인 준비 콘텐츠는 예약 시 추가 AI 호출이나 외부 Evidence 재수집을 실행하지 않는다. 현재 Revision에 저장된 deterministic Quality / Approval Readiness 결과만 사용한다.

다음을 모두 충족해야 한다.

- standard Quality approved
- `quality.reviewedRevisionId === currentRevisionId`
- Approval Readiness application ready
- Evidence Pack verified
- `approvalEvidence.reviewedRevisionId === currentRevisionId`

사이트 전체 승인 준비 상태와 개별 원고 예약 가능 상태를 같은 의미로 표시하지 않는다.

## 10. Atomic reservation and duplicate prevention

예약 요청 fingerprint:

```text
workspaceId
+ contentId
+ platform
+ platformConnectionId
+ revisionId
+ scheduledAt
+ timezone
```

서버는 Playwright 실행 전 `studioStore.update()`의 직렬화된 mutation 경계 안에서 다음을 원자적으로 수행한다.

1. Workspace / Project / Content 소유권 확인
2. 동일 fingerprint 요청 확인
3. 같은 Content + Platform 활성 예약 확인
4. `registering` record 삽입

동일한 활성 또는 실패 요청은 기존 record를 반환해 중복 외부 실행을 막는다. 취소 또는 공개 완료 record는 새 예약 생성을 영구 차단하지 않는다.

활성 상태:

- `registering`
- `scheduled_verified`
- `scheduled_unverified`

앱 재시작 후 오래된 `registering` 상태는 성공이나 실패로 추측하지 않고 `scheduled_unverified`로 복구한다.

## 11. State transitions

Allowed transitions:

```text
registering
→ scheduled_verified
→ scheduled_unverified
→ failed

scheduled_unverified
→ scheduled_verified
→ cancelled
→ published

scheduled_verified
→ cancelled
→ published

failed
→ registering
```

`scheduled_verified` 전이에는 최소한 외부 등록 시각과 검증 시각이 필요하다. 이전 불확실성 또는 실패 정보는 나중에 검증이 성공하면 제거한다.

성공한 ScheduleJob은 자동 재시도하지 않는다. 실패한 pre-side-effect 실행만 같은 idempotency record에서 명시적으로 재시도할 수 있다.

## 12. External workflow sequence

실제 UI 확인 후 구현할 Tistory schedule worker의 목표 순서:

1. stored session으로 Tistory editor 진입
2. 계정과 blog target 검증
3. 현재 예약 record와 입력 Revision 검증
4. 제목·본문·태그·카테고리·대표 이미지 준비
5. 예약 UI 열기
6. 날짜·시간 입력
7. 입력 값 재읽기
8. 공개 상태가 예약으로 설정됐는지 확인
9. 최종 예약 동작 정확히 1회 실행
10. acknowledgment 확인
11. 관리 목록에서 제목·예약 상태·시각·카테고리 확인
12. 필요 시 재진입해 즉시 공개되지 않았는지 확인
13. 증거와 함께 결과 반환

Selector와 구체적인 단계는 실제 Tistory 화면 조사 전까지 `TBD`다.

## 13. Verification policy

다음만으로 성공 처리하지 않는다.

- 예약 버튼을 클릭함
- editor URL이 변경됨
- toast가 잠깐 보임
- worker process가 0으로 종료됨

최소 검증 대상:

- 최종 예약 click count = 1
- 예약 acknowledgment
- 관리 목록의 동일 제목 또는 외부 식별자
- 예약 상태 표시
- 예약 날짜·시간
- 계정 및 category snapshot
- 즉시 공개되지 않음

모든 필수 증거가 확인되면 `scheduled_verified`다. 최종 클릭 이후 확인이 불완전하면 `scheduled_unverified`다.

## 14. Retry policy

자동 재시도 가능:

- 최종 예약 클릭 전
- 외부 side effect가 없다고 확인됨
- 브라우저 시작 또는 초기 navigation 실패
- 로컬 이미지가 없거나 업로드 전

자동 재시도 금지:

- 예약 최종 클릭 이후
- acknowledgment 이후
- 외부 글 존재 가능성 있음
- 이미지 업로드 이후
- timeout으로 외부 상태가 불확실함

불확실한 경우 새 예약 생성이나 최종 클릭을 반복하지 않고 `schedule.verify`만 수행한다.

## 15. Persistence policy

`scheduledPublishing`은 서버 소유 데이터다. 오래된 클라이언트 전체 snapshot이 예약 record를 삭제하거나 이전 상태로 되돌릴 수 없다.

Rich record는 `id`로 병합한다. Legacy record는 `contentId + platform + scheduledFor`로 안정적인 호환 key를 만든다. 과거, 취소, 실패, 공개 완료 기록을 Content + Platform 하나로 축약하지 않는다.

Canonical `UserData` 타입의 rich record migration은 외부 실행 전에 완료한다. 현재 Foundation 구현은 Legacy 배열을 읽으면서 rich record를 병존시키는 호환 계층을 사용한다.

## 16. Settings UX

Workspace Settings에 계정별 예약 권한 섹션을 제공한다.

- 기본 꺼짐
- 켤 때 결과를 명시적으로 설명
- Tistory가 지정 시각에 글을 공개할 수 있음을 표시
- `publish.execute`는 켜지지 않음을 표시
- Draft 권한과 분리 표시
- 연결되지 않은 계정은 변경 불가

## 17. Editor UX

Editor에는 Tistory Publishing Preparation 카드 안에 별도 예약 영역을 둔다.

필수 표시:

- 선택 계정
- 선택 카테고리
- 현재 Revision ID
- Quality 상태
- Approval-mode 상태
- 대표 이미지 상태
- 예약 날짜
- 예약 시간
- timezone `Asia/Seoul`
- 활성 예약 충돌
- 최종 확인

Readiness 확인 UI는 외부 클릭을 실행하지 않는다. 실제 예약 실행 버튼은 Tistory UI 조사와 worker 구현 후에만 활성화한다.

## 18. API boundary

Foundation API:

- `POST /api/publishing/schedules/readiness`
- `POST /api/connections/schedule-permission`

Future execution API:

- `POST /api/publishing/schedules`
- `POST /api/publishing/schedules/{id}/verify`
- `GET /api/publishing/schedules`

API는 UI가 전달한 document, quality, permission 또는 ownership을 신뢰하지 않고 서버 저장 상태를 다시 읽는다.

## 19. Audit policy

예약 관련 Audit는 최소 다음을 기록한다.

- workspaceId
- projectId
- contentId
- revisionId
- platformConnectionId
- workflow
- operationId
- requestFingerprint
- scheduledAt
- timezone
- category snapshot
- attempt count
- result status
- failure code
- external evidence summary
- createdAt / updatedAt

민감한 storage state, 쿠키, 토큰, 원문 HTML 전체는 Audit에 저장하지 않는다.

## 20. Test policy

### Core

- permission isolation
- schedule time validation
- timezone validation
- fingerprint stability
- active duplicate detection
- transition policy
- malformed record tolerance

### Application

- atomic reservation
- concurrent duplicate request
- idempotent identical request
- cancelled request re-registration
- stale registering recovery
- verified evidence timestamp requirements
- ownership rejection
- current Revision lock
- Approval-mode readiness

### Persistence

- server-owned schedule preservation
- rich records merged by ID
- legacy records preserved by stable key
- stale client snapshot cannot remove schedules

### API

- server-owned context resolution
- Tistory connection ownership and platform validation
- missing boolean permission request rejection
- non-Asia/Seoul rejection
- selected target resolution

### Regression

- existing Draft flow unchanged
- Draft worker restricted click monitor unchanged
- public publish permission remains disabled
- media permission remains independent
- category persistence remains protected

## 21. Validation sequence

Required before Ready for Review:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
git status
```

### 2026-07-28 local validation observation

Observed on Windows branch before follow-up fixes:

- `npm run lint`: passed
- `git diff --check`: passed
- `npm run typecheck`: failed because `core/publishing/index.ts` exported nonexistent `./PublishingQueue` and transition arrays widened to `string[]`
- `npm test`: 154 files / 798 tests passed, 28 suites failed to import because of the same nonexistent export
- `npm run build`: failed because of the same nonexistent export

Follow-up fixes committed:

- removed the nonexistent `PublishingQueue` export
- explicitly typed scheduled-publication transition arrays

All validation commands must be rerun after pulling the follow-up commits. No pass is claimed until the new output is observed.

## 22. Manual Tistory investigation sequence

Automated validation이 모두 통과한 뒤에만 진행한다.

1. 기존 검증된 Content와 stored session 사용
2. 최종 예약 클릭 없이 에디터 진입
3. 예약 관련 control 구조와 접근성 속성 기록
4. 공개/완료/임시저장/예약 control 구분
5. 날짜·시간 입력 방식 기록
6. 예약 목록 및 상태 표시 구조 기록
7. 모든 제한 클릭 count 0 확인
8. 조사 증거를 문서화

실제 조사 결과가 없는 selector는 코드에 추가하지 않는다.

## 23. MVP exclusions

- AI 자동 예약 시각 선택
- 대량 자동 예약 queue
- 로컬 background scheduler
- 즉시 공개 발행
- 예약 수정
- 예약 취소
- WordPress 예약 실행
- 예약된 글의 자동 공개 완료 판정
- 별도 published content registry 확장

## 24. Current implementation status

Implemented:

- Core ScheduledPublication contract
- schedule permissions and Permission Gate workflows
- atomic reservation application service
- legacy-compatible schedule persistence merge
- Tistory schedule Readiness service
- server-owned Readiness API
- account-level Settings permission API and UI
- focused unit tests and safety tests

Not implemented:

- canonical rich `UserData` migration
- Editor schedule input card
- execution APIs
- Tistory schedule probe
- Tistory schedule adapter / worker / selector
- actual native schedule registration
- external verification
- publication-time verification

The pull request remains Draft. It must not be merged until automated validation, actual Tistory UI inspection, native schedule registration, external verification, and later publication-time verification are complete.
