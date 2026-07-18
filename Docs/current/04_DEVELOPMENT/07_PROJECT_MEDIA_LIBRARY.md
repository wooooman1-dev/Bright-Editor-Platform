# Project Media Library Foundation

## 1. 상태

상태: **Draft PR 구현 완료, 자동 검증 대기**

브랜치:

```text
feat/image-workspace-mvp
```

Project Media Library Foundation은 Image Workspace와 동일한 Draft PR #20에 포함한다. `main`에는 아직 병합하지 않는다.

## 2. 목적

같은 Project에서 이미 업로드하거나 AI로 생성한 이미지를 다른 원고에서 다시 사용할 수 있게 한다.

이미지를 재사용할 때 파일을 복제하지 않는다. Canonical ImageBlock이 동일한 `assetId`와 `source`를 참조하므로 저장 공간과 Tistory 업로드 준비 비용을 줄인다.

이 기능은 Tistory 전용이 아니다. Project 단위 미디어 수집과 재사용은 Core에 두고, Tistory·WordPress·YouTube 등 플랫폼 업로드는 각 Apps Adapter가 담당한다.

## 3. 데이터 원칙

Project Media Library는 다음 두 소스를 결합한다.

1. `UserData.mediaMetadata`
   - 새 파일 업로드와 AI 생성 시 저장한 자산 메타데이터
   - 현재 원고에서 분리된 자산도 재사용 가능
2. Project의 Canonical `ContentDocument`
   - 실제 ImageBlock 참조
   - 이전 버전에서 메타데이터가 저장되지 않은 이미지도 자동 복원

Canonical ContentDocument가 실제 사용 위치의 기준이다. `mediaMetadata`는 검색과 재사용을 돕는 보조 인덱스다.

## 4. Core 구조

```text
core/media/ProjectMediaLibrary.ts
```

주요 계약:

```text
ProjectMediaContent
ProjectMediaReference
ProjectMediaAsset
buildProjectMediaLibrary
```

`buildProjectMediaLibrary`는 다음을 수행한다.

- 요청한 Project의 자산만 수집
- 저장된 메타데이터와 Canonical ImageBlock 결합
- 동일 `assetId` 또는 동일 `source` 중복 제거
- 사용 중인 Content와 Block 참조 계산
- `referenceCount` 계산
- 마지막 참조 시간 기준 정렬
- 메타데이터가 없는 기존 이미지 복원
- 외부 URL과 로컬 업로드 이미지 구분 유지

## 5. API

```text
GET /api/media?contentId={contentId}
```

서버는 `contentId`로 소유 Project를 결정한다. 클라이언트가 임의의 `projectId`를 지정하지 않는다.

응답:

```text
projectId
assets[]
  id
  source
  metadata
  referenceCount
  references[]
  lastReferencedAt
```

파일 업로드 또는 AI 생성 시 `/api/media`는 자산 메타데이터를 `studioStore.update()`로 원자적으로 저장한다.

메타데이터 저장에 실패하면 방금 생성한 로컬 파일을 삭제하고 오류를 반환한다.

## 6. 편집기 사용자 흐름

각 ImageBlock에서 다음 영역을 제공한다.

```text
Project 이미지 재사용
```

사용 흐름:

```text
이미지 블록 열기
→ Project 이미지 재사용 펼치기
→ 같은 Project의 이미지 확인
→ 이 이미지 사용
→ 현재 ImageBlock에 동일 assetId/source 연결
→ 기존 문서 저장·Revision·History 경로 실행
```

재사용 시 다음 필드를 연결한다.

```text
assetId
source
fileName
mimeType
sourceType
ALT
prompt
```

현재 블록의 `purpose`는 유지한다. 같은 원본 이미지를 대표 이미지와 본문 이미지처럼 다른 배치 목적으로 사용할 수 있기 때문이다.

## 7. 하위 호환

이전 원고에 `mediaMetadata`가 없어도 ImageBlock에 실제 `source`가 있으면 Project Media Library에 나타난다.

분류 규칙:

- `/api/media/...` → upload
- 명시적 `ai_generated` → ai_generated
- 명시적 external 또는 기타 HTTPS URL → external

## 8. 비용 정책

Project 이미지 조회와 재사용은 AI API를 호출하지 않는다.

동일 파일을 복사하지 않으며, 로컬 저장 공간을 추가로 사용하지 않는다.

Tistory 임시저장에서는 동일 자산이 여러 블록에 사용되더라도 향후 업로드 결과 캐시를 적용할 수 있도록 동일 `assetId`를 보존한다. 이번 Foundation에서는 Tistory 원격 업로드 캐시를 아직 추가하지 않는다.

## 9. 안전 경계

이번 범위에서는 다음 기능을 제공하지 않는다.

- 이미지 파일 삭제
- 고아 파일 자동 정리
- 여러 Content가 참조하는 자산 강제 삭제
- 이미지 파일 이동 또는 이름 변경
- Tistory 원격 URL 영구 저장
- Project 간 이미지 공유
- Workspace 전체 Media Library
- 태그·폴더·즐겨찾기

삭제는 참조 영향도 계산, backup-first, 실제 파일 정리 실패 복구 정책을 먼저 설계한 뒤 구현한다.

## 10. 자동 검증

단위 테스트:

- 동일 자산의 여러 Content 참조 집계
- `referenceCount` 계산
- 마지막 참조 시간 정렬
- 분리된 저장 자산 유지
- 메타데이터 없는 이전 이미지 복원
- 외부 이미지 분류 유지
- 다른 Project 자산 제외

브라우저 Smoke Test:

```text
이미지 블록 추가
→ PNG 업로드
→ Project 이미지 목록 열기
→ 다른 블록에서 동일 이미지 재사용
→ 두 ImageBlock의 source와 assetId 일치 확인
→ 새로고침
→ 두 이미지 연결 유지 확인
```

## 11. 남은 작업

실행 가능한 환경에서 다음 자동 검증이 필요하다.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Project Media Library 자체는 실제 Tistory 계정 없이 검증할 수 있다.

Tistory 이미지 업로드 실제 계정 검증은 `06_TISTORY_MEDIA_UPLOAD.md`의 별도 완료 기준을 따른다.
