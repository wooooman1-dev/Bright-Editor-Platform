# Tistory Media Upload Workflow

## 1. 상태

상태: **Draft PR 구현 완료, 실제 계정 검증 필요**

브랜치:

```text
feat/image-workspace-mvp
```

이 기능은 아직 `main`에 병합하지 않는다. 사용자 로컬 저장소의 미반영 커밋과 문서 변경을 보호한 뒤 통합해야 한다.

## 2. 목적

Bright Studio 로컬 이미지 자산을 Tistory 임시글에 사용할 수 있는 Tistory/Kakao 원격 이미지 주소로 변환한다.

Canonical `ContentDocument`는 다음 정보를 계속 소유한다.

- 이미지 목적
- ALT
- 제작 프롬프트
- 로컬 자산 참조
- 소스 유형

플랫폼별 이미지 업로드는 Tistory App 내부에 격리한다.

## 3. 전체 흐름

```text
ContentDocument 로컬 이미지
→ TistoryMediaUploadPlan
→ Permission Gate: media.upload
→ Tistory 이미지 준비 Worker
→ Tistory/Kakao CDN URL
→ Draft 명령 HTML 치환
→ 기존 Tistory Draft Worker
→ Draft Save
→ 저장된 Draft 재확인
```

기존 Draft Worker는 다음을 계속 담당한다.

- 제목 입력 및 확인
- HTML 본문 입력 및 확인
- 카테고리 적용 및 확인
- 태그 입력 및 확인
- Draft Only 저장
- 저장 완료 신호 확인
- 임시글 재열기
- 제목·본문·카테고리·태그·구조 재검증
- 공개 글 미생성 확인

이미지 준비 Worker는 이미지 업로드와 명령 HTML 치환만 수행한다. Draft Save, 완료, 공개, 예약, 수정, 삭제 버튼을 클릭하지 않는다.

## 4. 기존 Draft Worker 보호

검증된 기존 `tistory-draft-worker.mjs` 본체에 이미지 업로드 로직을 직접 섞지 않는다.

이미지 준비 Worker가 먼저 Tistory CDN URL을 확보하고 command file의 HTML만 치환한다. 그다음 기존 Draft Worker가 치환된 HTML을 읽는다.

이 분리로 다음 회귀 위험을 줄인다.

- 제목 입력 회귀
- 본문 CodeMirror 동기화 회귀
- 카테고리 회귀
- 태그 회귀
- 임시저장 버튼 오인식
- 공개 발행 control 클릭
- Draft 재확인 회귀

## 5. 권한 정책

`media.upload`는 등록된 자동화 권한이다.

다음 기본 안전 권한에는 포함하지 않는다.

```text
safeDraftPermissions
```

따라서 기존 계정과 새 계정 모두 이미지 업로드가 기본적으로 차단된다.

사용자가 다음 경로에서 연결 계정별로 명시적으로 허용해야 한다.

```text
Workspace Settings
→ 이미지 권한
→ 임시저장 시 이미지 업로드 허용
```

이미지 업로드 허용은 다음 권한을 추가하지 않는다.

- 공개 발행
- 기존 글 수정
- 글 삭제
- 계정 설정 변경

## 6. 준비 상태 검사

Canonical 문서에 다음 형식의 이미지가 있으면 Tistory 준비 상태에서 `media.upload`를 검사한다.

```text
/api/media/<validated-storage-key>
```

권한이 없으면 Playwright 이미지 업로드나 Draft Save를 시작하기 전에 중단한다.

로컬 이미지가 없는 원고는 기존 Draft Save와 동일하게 처리한다. 이 경우 `media.upload` 권한을 요구하지 않는다.

## 7. 로컬 파일 보호

검증된 Bright Studio 저장 키만 허용한다. 로컬 절대 경로는 서버 내부에서만 계산하며 브라우저 응답이나 Tistory HTML에 노출하지 않는다.

지원 형식:

- PNG
- JPEG
- WEBP

로컬 파일이 사라졌거나 저장 키가 올바르지 않으면 Tistory Worker를 시작하기 전에 중단한다.

## 8. Placeholder 치환

로컬 이미지 주소를 곧바로 Tistory HTML에 넣지 않는다.

먼저 플랫폼 준비 문서에서 다음 임시 주소로 바꾼다.

```text
https://bright-studio.invalid/tistory-media/<block-id>
```

이미지 업로드가 완료되면 임시 주소를 Tistory/Kakao CDN URL로 교체한다.

모든 placeholder가 치환되지 않으면 기존 Draft Worker를 실행하지 않는다.

Canonical `ContentDocument`의 로컬 source는 변경하지 않는다. 원격 URL은 해당 Tistory 임시저장 명령에서만 사용한다.

## 9. 원격 URL 정책

업로드 결과는 다음 조건을 모두 만족해야 한다.

- HTTPS
- 신뢰된 Tistory/Kakao 전달 호스트

허용 호스트:

- `kakaocdn.net`
- `daumcdn.net`
- `tistory.com`
- `kakao.com`

신뢰하지 않는 외부 호스트나 HTTP 주소가 감지되면 중단한다.

## 10. 진단 정책

다음 진단 모드에서는 이미지 업로드를 실행하지 않는다.

- body editor probe
- category verification probe
- draft reopen verification

진단은 기존 읽기 전용 또는 승인된 제한 범위를 유지한다.

## 11. 감사 기록

로컬 이미지가 실제로 필요한 Draft 작업에는 별도 `media.upload` 감사 기록을 저장한다.

기록 범위:

- Workspace
- Project
- Content
- Platform Connection
- 시작·완료 시간
- 최종 확인 상태
- 성공 또는 안전 오류 코드

Draft 저장 감사 기록과 이미지 업로드 감사 기록을 분리한다.

## 12. 실패 처리

Draft Save 전에 발생할 수 있는 안전 실패:

- 이미지 업로드 권한 없음
- 로컬 미디어 파일 없음
- Tistory 세션 만료
- 이미지 업로드 입력 영역 미발견
- Tistory 원격 이미지 URL 미확인
- 신뢰하지 않는 원격 URL
- 미치환 placeholder 잔존

이미지 준비에 실패하면 기존 Draft Worker를 실행하지 않는다. 따라서 로컬 URL이나 placeholder가 포함된 깨진 HTML을 임시저장하지 않는다.

## 13. 자동 테스트 범위

- 로컬 미디어 감지
- 결정적 placeholder 생성
- 기존 외부 이미지 보존
- placeholder 완전 치환
- HTTPS 제한
- 신뢰 호스트 제한
- 기본 권한 차단
- 명시적 권한 허용
- 이미지 작업 공간 브라우저 업로드
- 새로고침 후 로컬 이미지 유지

## 14. 남은 실제 검증

로컬 통합 후 실제 Tistory 계정에서 한 번 검증해야 한다.

1. 연결 계정의 `media.upload`를 허용한다.
2. 로컬 PNG, JPEG 또는 WEBP 이미지 한 개를 원고에 연결한다.
3. Quality 승인과 최종 확인을 완료한다.
4. Tistory 임시저장을 한 번 실행한다.
5. 저장된 임시글을 다시 연다.
6. 이미지가 정상 표시되는지 확인한다.
7. 이미지 source가 신뢰된 HTTPS Tistory/Kakao 주소인지 확인한다.
8. 공개 글이 생성되지 않았는지 확인한다.
9. Draft Save가 정확히 한 번만 실행됐는지 확인한다.

유료 OpenAI 이미지 호출은 필요하지 않다. 로컬 이미지 파일 한 개로 검증할 수 있다.
