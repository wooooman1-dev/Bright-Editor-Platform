# 저장·병합 코드 지도

데이터가 어디에 어떻게 저장되고, 클라이언트와 서버가 같은 파일을 고칠 때
무엇이 이기는가. 약 2,180줄.

앵커는 **식별자**다. `grep -rn '<식별자>' app core`.
**지도는 색인이지 진실이 아니다.** 고치기 직전에 그 파일을 실제로 읽는다.

---

## 1. 전부 파일 하나다

```
.bright-studio/studio-data.json      (2026-08-29 기준 약 21MB)
```

`studioDataPath` — 환경변수 `BRIGHT_STUDIO_DATA_PATH` 가 있으면 그 경로,
없으면 `process.cwd()/.bright-studio/studio-data.json`.

**git 추적 대상이 아니다.** 이 기계의 밝은재테크 Project 데이터가 여기 있고,
진단은 대부분 이 파일 실측으로 한다.

구조:

```
{ schemaVersion: 1,
  data: { application: { "user-data": UserData } } }
```

`collection = "application"`, `id = "user-data"` 하나뿐이다. `UserData` 안에
`workspace` · `brands` · `projects` · `contents` · `history` · `mediaMetadata` ·
`qualityReports` · `publishingRecords` · `scheduledPublishing` 이 배열로 들어간다.

이미지 원본은 이 파일이 아니라 `.bright-studio/media/<uuid>.png` 에 있고,
문서에는 `/api/media/<uuid>.png` 경로만 남는다.

---

## 2. 저장소는 세 겹으로 감싸여 있다

`app/application/studio-store.ts`

```
ProjectIdentityPersistenceStore      ← 바깥. Project 신원 규칙
  └ ApprovalAwarePersistenceStore    ← 승인 정책 불변 규칙
      └ SnapshotPersistenceStore     ← 직렬화·순서 보장
          └ JsonFileSnapshotDriver   ← 실제 파일 쓰기
```

바깥 두 겹은 **쓰기를 거부할 수 있는 관문**이다.

| 겹 | 거부하는 것 |
| --- | --- |
| `ProjectIdentityPersistenceStore` | Project ID 중복, 같은 Workspace 안 Project 이름 중복, 형식 오류 |
| `ApprovalAwarePersistenceStore` | Planning 이 시작된 Content 의 **콘텐츠 목적 변경**, **승인 정책 snapshot 변경**, 형식 오류 |

승인 정책이 도중에 바뀌면 이미 만들어진 Claim 계약의 기준이 흔들리므로 막는다.

---

## 3. 읽기는 매번 디스크에서 한다

`SnapshotPersistenceStore` 는 **메모리 캐시가 없다.** `get`·`list` 가 호출될 때마다
`driver.read()` 로 파일을 다시 읽는다.

그래서 dev 서버가 떠 있는 동안에도 파일을 직접 고치면 다음 요청부터 반영된다.
(2026-08-28 에 근로장려금 원고에 hero 블록을 직접 넣은 것이 이 성질 덕분이다.)

쓰기는 `mutate` 하나로 모인다:

```ts
const operation = this.queue.then(async () => {
  const snapshot = (await this.driver.read()) ?? {};
  await this.driver.write(update(snapshot));
});
```

`queue` 로 직렬화한다 — 동시 쓰기가 서로를 덮어쓰지 않는다.

---

## 4. 파일 쓰기는 임시 파일 → rename

`JsonFileSnapshotDriver.write`

1. `<파일>.<pid>.<uuid>.tmp` 로 새로 쓰고 `fsync`
2. `rename(tmp → 본파일)`
3. rename 이 `EPERM`/`EBUSY`/`EACCES`/`EEXIST` 로 실패하면
   본파일을 `.bak` 으로 옮기고 다시 시도, 실패하면 `.bak` 을 되돌린다

부분 저장된 파일이 남지 않게 하려는 구조다. 윈도우에서 파일 잠금이 잦아서 재시도
경로가 붙어 있다.

---

## 5. 병합 — 클라이언트와 서버가 부딪힐 때

두 함수가 있고 **쓰는 쪽이 다르다.**

### `mergeUserDataSnapshot(current, input)` — 클라이언트가 보낸 전체 스냅샷

`app/api/studio/route.ts` 의 저장 엔드포인트에서 쓴다. 브라우저가 자기가 아는
`UserData` 전체를 보내면, 서버에 있는 것과 항목별로 합친다.

원칙: **서버가 소유한 것은 클라이언트가 못 덮는다.**

| 지키는 것 | 함수 |
| --- | --- |
| 발행 관련 Project 설정 | `preserveServerPublishingProject` |
| 발행 관련 Content 필드 | `preserveServerPublishingContent` |
| 생성 Claim 검증 기록 | `preserveServerGeneratedClaimVerification` |
| 더 새로운 Planning 진행 상태 | `preserveNewerPlanningWorkflow` |
| 확정된 Opportunity | `isNewerConfirmedOpportunitySelection` 이 아니면 서버 것 유지 |

그 밖에는 `updatedAt` 비교로 정한다 — `isOlderSnapshot` 이면 서버 것을 남긴다.
`validatePlanningContent` 가 형식을 검사하고, 어긋나면 저장 자체가 거부된다.

### `mergeServerMutationSnapshot(current, base, next)` — 서버가 만든 변경

`persistServerMutation` 이 쓴다. 생성·검토·발행처럼 **서버가 결과를 만든 경우**다.

`base` 는 작업을 시작할 때의 상태, `next` 는 만들어낸 결과다. 그 사이에 다른 요청이
파일을 고쳤을 수 있으므로, **내가 실제로 바꾼 항목만** 골라 현재 파일에 얹는다.

대상: `contents` · `history` · `mediaMetadata` · `publishingRecords` ·
`qualityReports` · `scheduledPublishing`.

`mergeChangedByKey` 가 키별로 base 와 next 를 비교해 달라진 것만 적용한다.

---

## 6. UserData 를 만지는 함수들

`app/user-flow/user-data.ts` (751줄) — 상태 전이는 전부 여기 있다.

**생성** `createWorkspace` · `createProject` · `createContent` · `createContentFromPlan`

**Planning** `startContentPlanning` · `completeContentPlanning` ·
`selectContentPlanningOpportunity` · `failContentPlanning`

**Generation** `startContentGeneration` · `completeContentGeneration`

**문서** `applyCanonicalDocument` · `saveDraft` · `updateContent`

**Project** `updateProjectStrategy` · `renameProject` · `updateProjectTargets` ·
`resolveProjectStrategy`

**직렬화** `parseStoredUserData` · `documentToEditableText` · `userDataStorageKey`

`applyCanonicalDocument` 는 문서를 통째로 교체하고 `status` 를 `draft` 로 되돌리며
`quality` 를 지운다. 그래서 문서가 바뀌면 이전 품질 검토는 자동으로 무효가 된다.

`startContentPlanning` 안에 이 프로젝트에서 유일한 덮어쓰기 금지가 있다:

```ts
if (existing?.document) {
  throw new Error("원고가 생성된 Content는 새 Planning 요청으로 덮어쓸 수 없습니다.");
}
```

**Planning 에만 걸린다.** 생성 경로에는 같은 가드가 없다 — 자세한 것은
`03_CONTENT_LIFECYCLE.md`.

---

## 7. 이력

`history` 배열에 문서 변경이 쌓인다. 항목은
`{ id, contentId, document, reason, recordedAt, version }` 이고
`reason` 은 `ai_revision` · `autosave` 등이다.

`applyCanonicalDocument` 가 호출될 때 함께 기록된다. 저장된 이력으로 "이 원고가
언제 어떻게 바뀌었나" 를 되짚을 수 있다.

---

## 8. 아직 모르는 것

- 클라이언트 쪽 저장 (`userDataStorageKey = "bright-studio-user-data-v1"`) 이
  실제로 어디서 읽고 쓰이는지 추적하지 않았다.
- `ApprovalAwarePersistenceStore` 678줄 중 승인 정책 불변 검사 외의 부분.
- 백업 파일들(`.bright-studio/backups/`)을 누가 만드는지.

---

## 9. 확인 명령

```bash
# 저장 구조 훑기
python3 -c "
import json
d=json.load(open('.bright-studio/studio-data.json',encoding='utf-8'))
u=d['data']['application']['user-data']
for k,v in u.items(): print(k, len(v) if hasattr(v,'__len__') else v)
"

# 쓰기를 거부하는 지점
grep -n 'throw new Error' app/application/ProjectIdentityPersistenceStore.ts app/application/approval/ApprovalAwarePersistenceStore.ts

# 서버가 지키는 필드
grep -n '^function preserve' app/application/persistence/mergeUserDataSnapshot.ts
```
