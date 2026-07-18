# Persistence Snapshot Merge Policy

## 1. 상태

상태: **Draft PR 구현 완료, 자동 검증 대기**

브랜치:

```text
feat/image-workspace-mvp
```

이 정책은 Image Workspace, Project Media Library, AI 생성, 품질검토가 동일한 `UserData` 파일을 사용할 때 발생할 수 있는 오래된 전체 스냅샷 덮어쓰기를 방지한다.

## 2. 해결하는 문제

기존 `/api/studio` PUT은 다음 순서로 저장했다.

```text
현재 상태 GET
→ 클라이언트 전체 UserData 적용
→ SET
```

이 사이에 `/api/media`가 새 이미지 메타데이터를 원자적으로 저장하면, 늦게 도착한 전체 UserData 저장이 새 `mediaMetadata`를 다시 지울 수 있었다.

긴 AI 생성과 품질검토도 작업 시작 시 읽은 오래된 UserData를 마지막에 `set()`하므로, 작업 도중 완료된 이미지 업로드나 다른 서버 기록을 덮어쓸 위험이 있었다.

## 3. 구현 위치

```text
app/application/persistence/mergeUserDataSnapshot.ts
app/api/studio/route.ts
```

## 4. 클라이언트 전체 스냅샷 병합

`mergeUserDataSnapshot(current, incoming)`을 사용한다.

```text
클라이언트 PUT
→ studioStore.update()
→ 최신 서버 상태를 callback 안에서 읽음
→ 클라이언트 편집 내용 병합
→ 서버 소유 필드 보존
→ 한 번의 Snapshot write
```

서버 소유 컬렉션:

```text
history
mediaMetadata
publishingRecords
qualityReports
scheduledPublishing
```

Content별 `quality`도 클라이언트 전체 스냅샷이 변경할 수 없고 서버 상태를 유지한다.

최초 상태가 아직 없는 경우에만 유효한 첫 스냅샷을 그대로 저장한다.

## 5. 서버 Workflow 병합

AI 생성, Final Review, 품질 승인, 품질 재검토는 `mergeServerMutationSnapshot(current, base, next)`를 사용한다.

```text
base
= Workflow 시작 시 읽은 상태

next
= Workflow가 계산한 결과

current
= 저장 직전의 최신 서버 상태
```

Workflow는 `base`와 `next`를 비교해 실제로 변경한 기록만 `current`에 적용한다.

따라서 다음 상황에서 서로 관련 없는 최신 기록을 보존한다.

```text
AI 생성 진행 중
→ 다른 이미지 업로드 완료
→ mediaMetadata 저장
→ AI 생성 완료
→ AI 문서와 History만 적용
→ 방금 저장된 mediaMetadata 유지
```

동일 방식으로 다른 Content에서 새로 저장된 품질 기록, History, 발행 기록, 예약 정보도 오래된 Workflow 스냅샷으로 덮어쓰지 않는다.

## 6. 병합 키

```text
history              → id
mediaMetadata        → id, source 중복 제거
publishingRecords    → id
qualityReports       → contentId
scheduledPublishing  → contentId + platform
```

Workflow가 기준 상태에서 제거한 기록은 최신 상태에서도 제거하고, 새로 추가하거나 변경한 기록만 적용한다.

값 비교는 현재 로컬 JSON 저장소에서 사용하는 직렬화 가능한 데이터 구조를 기준으로 한다.

## 7. 삭제 경계

`delete-content`는 일반 병합 경로에 포함하지 않는다.

콘텐츠 삭제는 다음을 포함하는 별도 보호 작업이다.

```text
영향도 계산
→ backup-first
→ Content 및 연관 상태 제거
→ cleanup 결과 적용
```

일반적인 합치기 정책을 사용하면 의도적으로 삭제한 History 또는 참조가 최신 상태에서 다시 살아날 수 있다. 따라서 현재는 `ContentDeletionService` 결과를 직접 저장하며, 삭제 동시성은 별도 삭제 트랜잭션 설계에서 다룬다.

## 8. 자동 검증

단위 테스트:

```text
stale 클라이언트 저장이 최신 mediaMetadata를 지우지 않음
서버 Quality가 클라이언트 Quality보다 우선함
서버 소유 컬렉션 보존
AI Workflow 결과와 동시 이미지 업로드 병합
다른 Content의 최신 품질 기록 보존
동일 contentId의 Workflow 품질 결과 적용
잘못된 전체 스냅샷 차단
```

소스 회귀 테스트:

```text
/api/studio PUT이 studioStore.update() 사용
긴 Workflow가 persistServerMutation() 사용
mergeServerMutationSnapshot(current, base, next) 연결
직접 studioStore.set()은 delete-content 한 곳만 유지
```

## 9. 남은 검증

실행 가능한 환경에서 다음을 확인해야 한다.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

추가 통합 검증:

```text
이미지 업로드 직후 문서 저장
→ mediaMetadata 유지

AI 품질검토 진행 중 이미지 업로드
→ 품질 결과와 이미지 메타데이터 모두 유지

서로 다른 Content 품질검토 연속 실행
→ 각 Content의 최신 qualityReports 유지
```

실제 Tistory 계정은 이 Persistence 병합 검증에 필요하지 않다.
