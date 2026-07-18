# Image Workspace MVP

## 1. 문서 목적

이 문서는 Bright Studio 콘텐츠 편집기의 이미지 작업 기능 1차 구현 범위와 운영 경계를 정의한다.

이미지는 장식 요소가 아니라 콘텐츠 전략의 일부다. 따라서 원고 생성 시 이미지의 목적, 배치 의도, ALT, 별도 제작용 프롬프트를 함께 생성하고, 편집기에서 사용자가 직접 파일을 연결하거나 AI로 생성할 수 있어야 한다.

## 2. 현재 구현 상태

상태: **Draft PR 구현 완료, 검증 진행 중**

브랜치:

```text
feat/image-workspace-mvp
```

Draft PR:

```text
#20 feat: add image workspace upload and AI generation
```

`main`에는 아직 병합하지 않는다.

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

## 4. AI 생성 정책

기존 콘텐츠 생성 1회 안에서 이미지 전략을 함께 생성한다.

각 AI 이미지 추천 블록은 다음 값을 포함한다.

```text
purpose
alt
prompt
source
sourceType
```

`prompt`는 본문 작성 지시가 아니라 외부 이미지 도구에서도 바로 사용할 수 있는 독립 제작 프롬프트여야 한다.

별도의 이미지 전략 AI 호출은 추가하지 않는다.

실제 이미지 생성 버튼만 OpenAI Image API를 호출한다.

기본 이미지 모델:

```text
gpt-image-2
```

환경변수로 이미지 공급자 모델을 교체할 수 있다.

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

OpenAI 구현은 `app/application/media/OpenAIImageProvider.ts`에 위치한다.

다른 이미지 공급자를 추가할 때 Core Content Model이나 편집기 흐름을 변경하지 않는다.

## 6. 파일 저장 정책

기본 저장 위치:

```text
.bright-studio/media
```

실제 위치는 Studio 데이터 파일의 상위 폴더를 기준으로 한다.

다음 환경변수로 변경할 수 있다.

```text
BRIGHT_STUDIO_MEDIA_PATH
```

파일명은 사용자가 업로드한 원본 파일명을 저장 경로로 사용하지 않는다. UUID 기반 저장 키를 사용한다.

지원 형식:

```text
image/png
image/jpeg
image/webp
```

기본 최대 업로드 크기:

```text
10MB
```

변경 환경변수:

```text
BRIGHT_STUDIO_MAX_IMAGE_BYTES
```

업로드 시 브라우저 MIME만 신뢰하지 않고 PNG, JPEG, WEBP 파일 시그니처를 서버에서 다시 검사한다.

## 7. 이미지 생성 설정

필수:

```text
OPENAI_API_KEY
```

선택:

```text
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_TIMEOUT_MS=180000
```

AI 이미지 생성은 API 사용량과 비용이 발생할 수 있다.

사용자는 AI 생성 없이 프롬프트만 복사해 외부 도구에서 이미지를 제작할 수 있다.

## 8. 데이터 보호

업로드 또는 AI 생성으로 연결된 이미지는 다음 AI 편집 과정에서 보호한다.

- 최종 품질 편집
- 자동 품질 개선
- 검증된 링크 복원 과정

AI가 연결된 이미지 블록을 누락하거나 `source`를 비워 반환해도 서버 로직이 다음 값을 복원한다.

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

## 9. 이번 MVP에 포함하지 않는 범위

다음 기능은 아직 구현 완료로 판단하지 않는다.

- Project Media Library 목록 화면
- 이미지 재사용 검색
- 이미지 삭제 시 고아 파일 자동 정리
- 이미지 편집, 마스크, 인페인팅
- 이미지 일괄 생성
- 썸네일 전용 편집기
- 이미지 크롭 및 리사이즈
- Tistory 원격 이미지 업로드
- Tistory 첨부 이미지 URL 치환
- WordPress Media Library 업로드

## 10. Tistory 발행 경계

현재 로컬 이미지 주소는 다음 형식이다.

```text
/api/media/{storageKey}
```

이 주소는 Bright Studio 로컬 미리보기에서만 접근 가능하다.

따라서 Tistory 임시저장 시 이미지가 실제 Tistory 첨부 파일로 업로드되고 공개 URL로 치환되기 전까지는 **Tistory 이미지 발행 완료로 판단하지 않는다.**

다음 구현 단계는 Publishing Adapter의 Media Upload 단계다.

권장 흐름:

```text
Canonical ImageBlock
→ Local MediaAsset 확인
→ Tistory Editor 이미지 업로드
→ 업로드 결과 URL 수집
→ 임시 발행용 문서에서 source 치환
→ HTML 입력
→ Draft Save
→ 실제 Draft 이미지 검증
```

Core ContentDocument의 로컬 원본 참조는 유지하고, 플랫폼 업로드 URL은 Publishing 단계의 결과로 관리한다.

## 11. 검증 항목

병합 전 다음 명령이 모두 통과해야 한다.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

수동 검증:

1. 기존 추천 이미지 카드에서 프롬프트가 표시되는지 확인한다.
2. 프롬프트를 수정하고 새로고침 후 유지되는지 확인한다.
3. `요소 추가 → 이미지 추가`가 작동하는지 확인한다.
4. PNG, JPEG, WEBP 파일을 각각 불러온다.
5. 지원하지 않는 파일과 확장자를 위장한 파일이 차단되는지 확인한다.
6. 업로드 후 미리보기와 원본 보기가 작동하는지 확인한다.
7. low, medium, high 품질로 AI 생성을 실행한다.
8. 정사각형, 가로형, 세로형을 각각 생성한다.
9. 생성 후 문서를 새로고침해 이미지 연결이 유지되는지 확인한다.
10. 품질 개선을 실행한 뒤 기존 이미지가 사라지지 않는지 확인한다.
11. OpenAI 키가 없을 때 명확한 오류가 표시되는지 확인한다.
12. 기존 텍스트 편집, 자동저장, History, Quality Review, Tistory Preview, Draft Save 흐름이 깨지지 않았는지 확인한다.

## 12. 완료 기준

다음 조건을 모두 만족할 때 Image Workspace MVP를 완료로 변경한다.

- 자동 CI 통과
- 로컬 파일 불러오기 수동 검증 통과
- AI 이미지 생성 수동 검증 통과
- 새로고침 후 이미지 유지 검증 통과
- 품질 개선 후 이미지 보존 검증 통과
- 기존 임시저장 회귀 검증 통과

Tistory 실제 이미지 업로드는 별도 다음 단계이며, Image Workspace MVP 완료 여부와 분리한다.
