# Image Workspace MVP

## 1. 문서 목적

이 문서는 Bright Studio 콘텐츠 편집기의 이미지 작업 기능과 Tistory 임시저장 연결 범위를 정의한다.

이미지는 장식 요소가 아니라 콘텐츠 전략의 일부다. 원고 생성 시 이미지의 목적, 배치 의도, ALT, 별도 제작용 프롬프트를 함께 만들고, 편집기에서 사용자가 직접 파일을 연결하거나 AI로 생성할 수 있어야 한다.

## 2. 현재 구현 상태

상태: **Draft PR 구현 완료, 자동·실계정 검증 진행 중**

브랜치:

```text
feat/image-workspace-mvp
```

Draft PR:

```text
#20 feat: add image workspace and Tistory media upload
```

`main`에는 아직 병합하지 않는다. 사용자 로컬 저장소의 미반영 커밋과 문서 변경을 먼저 보호해야 한다.

## 3. 사용자 기능 범위

각 이미지 블록에서 다음 기능을 제공한다.

- 이미지 별도 제작용 프롬프트 표시 및 수정
- 이미지 목적 선택
  - 대표 이미지
  - 본문 설명
  - 비교
  - 체크리스트
  - 인포그래픽
  - 요약 카드
  - 주의 카드
- ALT 작성 및 수정
- PNG, JPEG, WEBP 파일 불러오기
- OpenAI 이미지 생성
- 이미지 비율 선택
  - 1536x1024
  - 1024x1024
  - 1024x1536
- 생성 품질 선택
  - low
  - medium
  - high
- 프롬프트 복사
- 연결된 이미지 미리보기 및 원본 보기
- `요소 추가 → 이미지 추가`를 통한 독립 이미지 제작 영역 생성

## 4. AI 생성 및 비용 정책

기존 콘텐츠 생성 1회 안에서 이미지 전략을 함께 생성한다.

각 AI 이미지 추천 블록은 다음 값을 포함한다.

```text
purpose
alt
prompt
source
sourceType
```

`prompt`는 본문 작성 지시가 아니라 외부 이미지 도구에서도 바로 사용할 수 있는 독립 제작 프롬프트다.

별도의 이미지 전략 AI 호출은 추가하지 않는다. 실제 `AI 생성하기`를 사용자가 명시적으로 선택한 경우에만 OpenAI Image API를 호출한다.

기본 이미지 모델:

```text
gpt-image-2
```

설정:

```text
OPENAI_API_KEY
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_TIMEOUT_MS=180000
```

AI 이미지 생성은 API 사용량과 비용이 발생할 수 있다. 프롬프트 복사 또는 로컬 파일 불러오기는 이미지 생성 API를 호출하지 않는다.

## 5. Core 모델

### ImageBlock 확장

```text
assetId
fileName
mimeType
prompt
purpose
sourceType
```

`sourceType` 값:

```text
planned
upload
ai_generated
external
```

### ImageProvider

Core는 특정 공급자에 의존하지 않는 `ImageProvider` 계약을 가진다.

OpenAI 구현은 다음 위치에 있다.

```text
app/application/media/OpenAIImageProvider.ts
```

다른 이미지 공급자를 추가할 때 Core Content Model이나 편집기 흐름을 변경하지 않는다.

## 6. 로컬 파일 저장 정책

기본 저장 위치:

```text
.bright-studio/media
```

환경변수로 변경할 수 있다.

```text
BRIGHT_STUDIO_MEDIA_PATH
BRIGHT_STUDIO_MAX_IMAGE_BYTES
```

기본 최대 크기는 10MB다.

지원 형식:

```text
image/png
image/jpeg
image/webp
```

파일명은 UUID 기반 저장 키를 사용한다. 원본 파일명을 로컬 저장 경로로 직접 사용하지 않는다.

업로드 시 브라우저가 전달한 확장자와 MIME만 신뢰하지 않고 PNG, JPEG, WEBP 파일 시그니처를 서버에서 다시 검사한다.

## 7. 데이터 보호

업로드 또는 AI 생성으로 연결된 이미지는 다음 AI 편집 과정에서 보호한다.

- 최종 품질 편집
- 자동 품질 개선
- 검증된 링크 복원 과정

AI가 연결된 이미지 블록을 누락하거나 `source`를 비워 반환해도 서버가 다음 값을 복원한다.

```text
block id
source
assetId
sourceType
fileName
mimeType
prompt
purpose
```

ALT는 AI 결과에 유효한 값이 있으면 개선된 값을 허용하고, 비어 있으면 원본을 복원한다.

소스가 비어 있는 계획 단계의 추천 이미지는 사용자가 삭제한 경우 강제로 되살리지 않는다.

## 8. Tistory 이미지 업로드 경계

Bright Studio 로컬 이미지 주소는 다음 형식이다.

```text
/api/media/{validatedStorageKey}
```

이 주소는 로컬 미리보기용이며 Tistory HTML의 최종 이미지 주소로 사용할 수 없다.

Tistory 임시저장 시 다음 흐름을 사용한다.

```text
Canonical ImageBlock
→ 로컬 MediaAsset 확인
→ TistoryMediaUploadPlan
→ Permission Gate: media.upload
→ 등록된 Tistory 이미지 준비 Worker
→ Tistory/Kakao HTTPS CDN URL 확인
→ 임시 발행 HTML의 placeholder 치환
→ 기존 Tistory Draft Worker
→ Draft Save
→ 저장된 Draft 재확인
```

Core `ContentDocument`의 로컬 원본 참조는 유지한다. 플랫폼 CDN URL은 해당 임시저장 명령에서만 사용한다.

자세한 정책은 다음 문서를 따른다.

```text
Docs/current/04_DEVELOPMENT/06_TISTORY_MEDIA_UPLOAD.md
```

## 9. 이미지 업로드 권한

`media.upload`는 등록된 자동화 권한이지만 기본 안전 권한에는 포함하지 않는다.

사용자가 다음 경로에서 연결 계정별로 명시적으로 허용해야 한다.

```text
Workspace Settings
→ 이미지 권한
→ 임시저장 시 이미지 업로드 허용
```

이미지 업로드를 허용해도 다음 권한은 켜지지 않는다.

- 공개 발행
- 기존 글 수정
- 글 삭제
- 계정 설정 변경

로컬 이미지가 있는데 권한이 꺼져 있으면 Playwright 업로드와 Draft Save를 시작하기 전에 중단한다.

이미지가 없는 원고는 기존 Draft 저장 흐름과 동일하게 처리하며 `media.upload` 권한을 요구하지 않는다.

## 10. Tistory 원격 주소 보호

업로드 후 다음 조건을 모두 만족하는 주소만 사용한다.

- HTTPS
- 신뢰된 Tistory/Kakao 전달 호스트
  - `kakaocdn.net`
  - `daumcdn.net`
  - `tistory.com`
  - `kakao.com`

모든 임시 placeholder가 원격 주소로 치환되지 않으면 기존 Draft Worker를 시작하지 않는다.

본문 편집기, 카테고리, 기존 Draft 재확인 진단 모드에서는 이미지 업로드를 실행하지 않는다.

## 11. 이번 범위에 포함하지 않는 기능

- Project Media Library 목록 화면
- 이미지 재사용 검색
- 고아 파일 자동 정리
- 이미지 편집, 마스크, 인페인팅
- 이미지 일괄 생성
- 썸네일 전용 편집기
- 이미지 크롭 및 리사이즈
- WordPress Media Library 업로드
- 공개 발행

## 12. 자동 검증 범위

자동 검증은 다음을 포함한다.

- 이미지 프롬프트·목적·ALT UI 표시
- 독립 이미지 요소 추가
- PNG 업로드
- 로컬 미디어 API MIME 확인
- 편집기 미리보기
- 새로고침 후 이미지 연결 유지
- AI 품질 수정 후 이미지 보호
- 로컬 이미지 업로드 계획 생성
- 기존 외부 이미지 보존
- placeholder 완전 치환
- HTTPS 및 신뢰 호스트 제한
- `media.upload` 기본 차단
- 명시적 권한 허용
- Tistory 준비 상태의 이미지 권한 검사

## 13. 남은 실제 검증

병합 전 다음 명령이 통과해야 한다.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

실제 Tistory 계정에서 마지막으로 다음을 확인해야 한다.

1. 연결된 Tistory 계정의 `media.upload`를 허용한다.
2. 로컬 PNG, JPEG 또는 WEBP 이미지가 연결된 원고를 연다.
3. 현재 Revision의 Quality 승인을 완료한다.
4. 최종 확인 후 임시저장을 한 번 실행한다.
5. 저장된 Tistory 임시글을 다시 연다.
6. 이미지가 정상 표시되는지 확인한다.
7. 이미지 주소가 신뢰된 HTTPS Tistory/Kakao 주소인지 확인한다.
8. 공개 글이 생성되지 않았는지 확인한다.
9. Draft Save가 정확히 한 번만 실행됐는지 확인한다.

이 검증에는 유료 AI 이미지 생성이 필요하지 않다. 로컬 이미지 파일 한 개면 충분하다.

## 14. 완료 기준

다음 조건을 모두 만족할 때 Image Workspace와 Tistory Media Upload를 완료로 변경한다.

- lint 통과
- typecheck 통과
- 전체 테스트 통과
- production build 통과
- 이미지 작업 공간 브라우저 검증 통과
- 실제 Tistory 이미지 업로드 및 Draft 재확인 통과
- Draft Only, Review First, Permission Gate 회귀 없음
- 공개 발행이 발생하지 않음
