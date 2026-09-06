# UI 흐름 코드 지도

화면이 몇 개이고, 어떻게 전환되고, 각 화면이 어떤 API 를 부르는가.
`app/user-flow` 34개 파일 6,872줄.

앵커는 **식별자**다. `grep -rn '<식별자>' app/user-flow`.
**지도는 색인이지 진실이 아니다.** 고치기 직전에 그 파일을 실제로 읽는다.

버튼이 어떤 서버 action 을 부르는지는 `03_CONTENT_LIFECYCLE.md` 에 있다.
이 지도는 **화면 구조**를 다룬다.

---

## 1. 페이지는 하나뿐이다

```
app/page.tsx (5줄)  →  <FirstRunExperience />
```

Next 라우트는 `/` 하나다. 나머지는 전부 `FirstRunExperience` (490줄) 안의 상태
전환이다. URL 은 `?view=...&projectId=...&contentId=...` 로 표현된다.

---

## 2. 화면 다섯 개

`Screen` 유니온 타입 (`FirstRunExperience.tsx`)

| 이름 | 렌더링 | 파일 |
| --- | --- | --- |
| `home` | 작업 공간 · 프로젝트 목록 | `WorkspaceHome` |
| `connections` | 발행 계정 연결 | `PlatformConnections` |
| `project` | 프로젝트 대시보드 | 프로젝트 화면 컴포넌트 |
| `create` | 기획 · 원고 생성 | `ContentCreationFlow` (663줄) |
| `editor` | 편집기 | `EditorWorkspaceImplementation` (707줄) |

전환은 `setScreen({ name: ... })` 하나로만 일어난다. `screenFromLocation` 이
URL 에서 화면을 복원하므로 새로고침해도 자리가 유지된다.

---

## 3. 데이터가 흐르는 방식

`FirstRunExperience` 가 **`UserData` 전체를 들고 있는 단일 소유자**다.

```
마운트 → GET /api/studio → parseStoredUserData → useState(data)
변경   → persist(next) → setData(next) → PUT /api/studio (전체 스냅샷)
```

즉 화면은 부분 갱신을 보내지 않고 **자기가 아는 전체를 통째로 보낸다.** 서버는
`mergeUserDataSnapshot` 으로 자기 것과 합치고 서버 소유 필드를 지킨다
(`17_PERSISTENCE_MAP.md` 5장).

자식 컴포넌트는 `data` 와 `onPersist` 를 받아 쓴다. 그래서 편집기에서 무엇을 고치든
결국 같은 경로로 저장된다.

---

## 4. 화면별로 부르는 API

| 컴포넌트 | 부르는 것 |
| --- | --- |
| `FirstRunExperience` | `/api/studio` · `/api/connections` |
| `ContentCreationFlow` | `/api/studio` · `/api/connections` · `/api/tistory` |
| `EditorWorkspaceImplementation` | `/api/studio` · `/api/tistory` · `/api/tistory/categories` |
| `ImageBlockEditor` | `/api/media` |
| `ApprovalReadinessActions` | `/api/approval/readiness` · `/api/studio` |
| `WordPressDraftOverlay` | `/api/publishing/wordpress/categories` |
| `WordPressScheduleOverlay` | `/api/publishing/schedules/create` · `/api/studio` |
| `ContentDangerZone` | `/api/studio` |

**대부분이 `/api/studio` 하나로 모인다.** 그 안에서 `action` 으로 갈린다
(14개, `03_CONTENT_LIFECYCLE.md` 2장).

---

## 5. 큰 컴포넌트 넷

### `EditorWorkspaceImplementation` (707줄)

편집기 전체. 안에 든 것:
- 제목·본문 편집, 블록 편집기(`ContentDocumentEditor`)
- 품질 검토 패널 — `QualityStatus`, `ReaderValueSummary`, `ApprovalReadinessStatus`
- AI 문서 수정, AI 개선안, 품질 다시 검토
- 발행 오버레이 진입

핸들러: `review()` · `revise()` · `retryGeneration()` ·
`requestQualityImprovement()` · `approveQualityImprovement()`

### `ContentCreationFlow` (663줄)

기획 화면. `analyze()` 로 후보를 뽑고 `confirm()` 으로 원고를 만든다.
`confirm` 의 `target` 기본값이 `"existing"` 이라 **같은 Content 를 덮어쓴다.**

### `WordPressDraftOverlay` (528줄) / `WordPressScheduleOverlay` (412줄)

발행·예약 오버레이. 카테고리 선택과 예약 시각을 다루고 상태는
`wordpress-draft-overlay-state.ts` (168줄) 로 분리돼 있다.

### `ImageBlockEditor` (308줄)

대표 이미지 UI. **이미지 블록이 문서에 있어야만 렌더링된다** — 없으면 화면 자체가
안 나온다 (D-048 이 생긴 이유). 「미사용 대표이미지 재사용」 목록이 비는 조건은
`16_WORDPRESS_PUBLISHING_MAP.md` 가 아니라 `core/media/ImageCostPolicy` 에 있다.

---

## 6. 표시 전용 모듈 (`.ts`)

컴포넌트에서 계산을 떼어낸 것들이다. 테스트하기 쉬우라고 분리돼 있다.

| 파일 | 하는 일 |
| --- | --- |
| `quality-review-ui.ts` (269) | 서버 품질 보고서를 화면용으로 정규화. 차원 목록·라벨·근거 이름 |
| `opportunity-presentation.ts` (162) | 기획 후보 표시 |
| `wordpress-draft-overlay-state.ts` (168) | 발행 오버레이 상태 기계 |
| `content-schedule-ui.ts` (102) | 예약 상태 표시 |
| `tistory-draft-outcome-ui.ts` (114) | 티스토리 결과 표시 |

품질 차원을 추가하면 `quality-review-ui.ts` 의 `categories` 배열과 세 곳의
`qualityLabel` 맵을 같이 고쳐야 한다 — 안 그러면 화면에 안 나온다.

---

## 7. 주의할 성질

- **화면이 `data` 전체를 보낸다.** 컴포넌트에서 `UserData` 를 잘못 만들면 그대로
  서버로 간다. 서버 병합이 막아주는 범위는 `17_PERSISTENCE_MAP.md` 5장까지다.
- **dev 서버가 코드를 다시 안 읽는 경우가 있다.** 화면 결과가 안 바뀌면 코드 문제로
  단정하기 전에 서버 버전을 의심한다 (규칙 문서 3장).
- **`app/user-flow/user-data.ts` 는 UI 폴더에 있지만 UI 가 아니다.** 상태 전이
  함수 모음이고 서버 라우트도 이것을 쓴다.

---

## 8. 아직 모르는 것

- `FirstRunExperience` 의 히스토리 복원(`screenFromLocation`, `restoringHistory`)
  세부.
- `PlatformConnections` 와 연결 설정 화면 전체.
- `TistoryScheduleOverlay` (387줄), `TistoryDraftOutcomeOverlay` (154줄).
- `ProjectApprovalSettingsCard` (187줄) — 승인 설정 화면.

---

## 9. 확인 명령

```bash
# 화면 다섯 개
grep -n "name: \"" app/user-flow/FirstRunExperience.tsx | head

# 어느 컴포넌트가 어떤 API 를 부르나
grep -rho '"/api/[a-z/-]*"' app/user-flow/*.tsx | sort | uniq -c

# 품질 차원을 추가할 때 같이 고쳐야 하는 곳
grep -rn "qualityLabel\|const categories" app/user-flow/
```
