# WordPress Draft Publishing MVP

Status: Approved / Not Implemented

Branch: `feat/wordpress-draft-publishing`

Base Commit: `1c38eab75492c156b222c30c947be672a68b39df`

---

## 1. Goal

승인된 현재 Content Revision을 사용해 WordPress Core REST API로 안전한 비공개 Draft를 생성하고, 외부 Post와 Media를 다시 조회해 결과를 검증한 뒤 Audit과 완료 UI에 반영한다.

Review First와 Draft Only를 유지하고 Public Publish는 실행하지 않는다. 이 MVP는 AdSense 승인을 보장하지 않으며 WordPress 생활경제 Project의 내부 승인 준비 상태와 Draft 저장 결과만 검증한다.

## 2. Existing Verified Foundation

현재 Repository에서 확인된 구현 기반은 다음과 같다.

- Workspace Settings의 WordPress Connection UI
- `/wp-json` REST discovery
- 인증된 `/wp-json/wp/v2/users/me?context=edit` 확인
- `edit_posts` Capability 확인
- Application Password의 서버 전용 SecretStore 저장
- Secret을 제외한 안전한 public connection metadata 반환
- `WordPressHtmlRenderer`
- title, 렌더링된 content와 `status=draft`만 POST하는 기초 `WordPressDraftPublishingAdapter`
- `category.read`, `category.select`, `media.upload`, `draft.create`, `draft.verify`가 등록된 Core Permission workflows

위 기반은 연결과 기초 변환을 확인한 상태다. Category 준비, Media Upload, ALT, Featured Image, Idempotency, 외부 재조회 Verification, 통합 Audit과 완료 UI는 아직 구현되지 않았다.

## 3. Architecture

WordPress Draft MVP의 실행 방식은 `server_api`이며 WordPress에 Playwright를 사용하지 않는다.

```text
UI
→ Application Service
→ Publishing Service
→ Permission Gate
→ WordPress Adapter
→ WordPress REST API
→ External Re-read Verification
→ Persistence and Audit
→ Completion UI
```

Quality, Permission, Idempotency와 Audit 정책은 플랫폼 공통 Core/Application 경계를 재사용한다. WordPress URL, REST resource, 인증, Category, Media, Draft와 Verification 차이는 Apps/WordPress에 격리한다.

## 4. Responsibility Boundaries

- Core/Application: Workspace·Project·Content ownership, current Revision, Quality Approval, Draft Only/Public Off, final confirmation, Permission Gate, Idempotency, 상태 전이, Persistence와 Audit
- Apps/WordPress: REST discovery와 request, Category pagination·정규화, WordPress HTML rendering, Media upload·ALT, Draft create, Media/Post re-read, WordPress error mapping
- UI: 실제 Connection과 Category 선택, media Permission 상태와 Readiness 표시, 최종 확인, 실행 결과 표시
- Renderer: deterministic HTML과 Media Reference 생성; Secret 조회, REST 요청과 Media Upload는 수행하지 않음
- SecretStore boundary: Application Password 원문 저장과 서버 실행 시 해석; UI와 Domain에는 원문을 반환하지 않음

## 5. MVP Scope

- 기존 WordPress Connection 재사용과 실행 직전 연결 상태 확인
- PlatformConnection별 실제 Category 동적 조회와 복수 Category ID 계약
- 현재 정책에 따른 `생활경제` Category 선택
- 동일 WordPress Renderer 기반 Preview와 Draft
- 조건부 WordPress Media Upload
- ALT 저장과 외부 Media 재조회 검증
- 목적성 대표 이미지의 `featured_media` 지정
- `status=draft` Post 생성
- Idempotency와 중복 Draft 방지
- 외부 Post 재조회 Verification
- Persistence, Audit와 완료 UI
- 기존 Tistory Draft와 Tistory 예약발행 회귀 보호

## 6. Deliberately Excluded Scope

- Public Publish
- Scheduled Publishing
- Existing Post Update
- Existing Post Delete
- 자동 Plugin 설치 또는 수정
- Theme 수정
- SEO Plugin 전용 Metadata
- 여러 플랫폼 동시 실행
- 자동 Retry
- 업로드 Media 자동 삭제

## 7. Connection and Secret Boundary

Application Password 원문은 SecretStore에만 저장한다. PlatformConnection은 `secretReference`와 안전한 site/user metadata만 유지한다.

Application Service는 Workspace가 Connection을 소유하고 WordPress가 활성화되어 있으며 Connection 상태가 `connected`인지 검증한다. Adapter 호출 직전에 서버에서 Secret을 해석하되 다음 위치에는 Password 또는 Authorization Header를 저장하지 않는다.

- UI state와 API response
- Content와 Project
- Publishing preparation과 completion result
- Audit, Error와 Log
- Idempotency record

현재 기초 Draft Adapter가 credential을 직접 받는 형태는 통합 실행 계약이 아니다. 구현 시 UI 또는 일반 Domain이 Secret을 전달하지 않는 서버 전용 경계로 연결해야 한다.

## 8. Dynamic Category Strategy

Category ID와 이름을 코드에 하드코딩하지 않는다. WordPress의 실제 Category 목록을 PlatformConnection별로 pagination 조회하고 Canonical Category로 변환한다.

선택 계약은 `readonly string[]` Category ID 배열을 사용한다. 현재 UI에서 하나만 선택하더라도 Domain과 REST Payload는 처음부터 복수 선택을 지원한다.

저장된 Category ID는 Draft 실행 직전에 실제 조회 결과로 재검증한다. 삭제되었거나 선택할 수 없으면 Readiness를 차단하고 재선택을 요구한다. 임의 Category 또는 `미분류`로 자동 대체하지 않는다.

같은 Workspace라도 WordPress 사이트별 Category 목록과 기본값을 독립 관리한다. ID가 유지되고 이름만 변경되면 실제 최신 이름으로 동기화할 수 있다.

Project 기본값 제안은 Connection별 복수 Category를 지원하는 additive 구조다.

```ts
defaultWordPressCategories?: readonly {
  publishingAccountId: string;
  id: string;
  name: string;
}[];
```

Category 선택과 기본값 적용 우선순위는 다음과 같다.

1. Content에서 직접 선택한 Category
2. Project `defaultWordPressCategories`
3. `WordPressConnectionProfile.defaultCategoryIds`
4. 유효한 Category가 없으면 Readiness 차단

모든 기본 Category ID는 실제 WordPress 목록으로 재검증한다. 유효하지 않은 값을 `미분류`로 자동 대체하지 않는다.

## 9. Current AdSense Category and Tag Policy

현재 승인된 AdSense Approval Content Policy에서는 실제 WordPress 목록에 존재하는 `생활경제` Category 하나만 사용한다. 정부지원, 세금 기초, 주거 제도와 생활금융 기초는 초기에는 별도 Category가 아니라 콘텐츠 주제다.

현재 정책에서는 Tag를 보내지 않는다. WordPress에 존재하는 Tag를 자동 생성하거나 추측하지 않는다. 기술 계약은 향후 승인된 정책 변경 시 Tag 확장이 가능해야 한다.

## 10. WordPress Publishing Preparation Data

기존 Tistory 구조는 마이그레이션하거나 변경하지 않는다. WordPress 준비 정보는 다음과 같이 additive하게 추가한다.

```ts
publishingPreparation?: {
  tistory?: ExistingTistoryPreparation;
  wordpress?: {
    publishingAccountId: string;
    categoryIds: readonly string[];
    categoryNames: readonly string[];
    featuredImageAssetId?: string;
    updatedAt: string;
  };
}
```

기존 Content에 WordPress 준비 정보가 없으면 미선택 상태로 읽는다. 저장과 복원 과정에서 Tistory 준비 정보를 덮어쓰지 않는다.

## 11. Media Upload Strategy

WordPress Media Upload Capability는 MVP에서 Supported다. D-021 Safe Draft Mode에 따라 `media.upload` Permission 기본값은 Disabled를 유지한다.

- 로컬 이미지가 있는 Draft만 `media.upload` Permission을 요구한다.
- 사용자가 대상 WordPress Connection에서 `media.upload`를 명시적으로 허용해야 한다.
- 로컬 이미지가 없으면 Media 단계를 생략하고 `draft.create`를 계속할 수 있다.
- 로컬 Media의 Workspace/Content ownership, 파일 존재, 지원 형식과 크기를 외부 요청 전에 검증한다.
- WordPress Media Resource에 POST하고 Media ID와 source URL을 받는다.
- Media Upload는 WordPress Media Adapter가 수행하며 Renderer는 수행하지 않는다.

## 12. ALT and Featured Image Strategy

각 업로드 Media에는 canonical image block의 ALT를 저장한다. 저장 후 외부 Media ID를 다시 조회하여 Media 존재, source URL과 ALT 적용을 확인한다.

`featuredImageAssetId`가 가리키는 목적성 대표 이미지가 정상 업로드되고 검증되면 해당 WordPress Media ID를 Post payload의 `featured_media`로 지정한다. Draft 생성 후 외부 Post를 다시 조회해 같은 ID가 적용되었는지 확인한다.

대표 이미지 후보가 없으면 임의 이미지를 Featured Image로 선택하지 않는다.

## 13. Rendering and Media URL Replacement

`WordPressHtmlRenderer`는 deterministic HTML을 만들고 로컬 이미지 Placeholder 또는 Media Reference를 Render 결과에 유지할 수 있다.

Application Service는 검증된 로컬 Media를 WordPress Media Adapter로 업로드한 뒤 Media ID와 source URL mapping을 사용해 본문 이미지 Source를 교체한다. Preview와 최종 Draft HTML은 동일 Render Artifact 또는 동일 deterministic Renderer 결과에서 파생되어야 한다.

Media URL 교체는 canonical ContentDocument를 변경하지 않는다. Render checksum, Media mapping과 최종 payload 관계를 Audit 가능한 형태로 유지한다.

## 14. Readiness Gate

외부 요청 전에 최소한 다음을 모두 확인한다.

- 현재 Content Revision과 standard Quality Approval 일치
- Draft Only ON과 Public Publish OFF
- WordPress Connection `connected`
- 선택된 Project publishing target
- 실제 Category 재조회와 선택 ID 유효성
- `category.read`, `category.select`, `draft.create`, `draft.verify` Permission
- 로컬 Media가 있으면 명시적 `media.upload` Permission
- 사용자 final confirmation

단일 원고 점수 또는 Draft 생성 성공을 AdSense 사이트 신청 준비 완료로 해석하지 않는다.

## 15. Draft Create Payload

MVP Post payload 범위는 다음과 같다.

```text
title
content
excerpt
status=draft
categories
optional slug
optional featured_media
```

`categories`는 검증된 string ID 배열을 WordPress REST 형식으로 변환한 결과다. 현재 AdSense 정책에서는 `tags` 필드를 보내지 않는다.

## 16. Idempotency and Duplicate Prevention

논리적 Idempotency Key는 최소한 다음을 포함한다.

```text
workspaceId
projectId
contentId
current revision 또는 content version
platformConnectionId
draft.create
```

- 동일 Key의 `verified` 결과가 있으면 새 Draft를 만들지 않고 기존 결과를 반환한다.
- 외부 ID를 받은 기록이 있으면 생성 전에 기존 외부 Post를 먼저 재검증한다.
- 결과가 `unknown`이면 자동으로 새 Draft를 만들지 않는다.
- 실패 요청의 재시도는 사용자의 명시 동작으로만 수행한다.
- Revision이 바뀌면 새로운 논리적 Key를 사용한다.
- 외부 요청 직전 pending record를 내구성 있게 저장하고 결과 상태를 `external_result_received`, `verified`, `failed` 또는 `unknown`으로 구분한다.

## 17. External Re-read Verification

`POST /posts` 응답만으로 완료 처리하지 않는다. 반환된 External Post ID를 다시 조회한다.

최소 검증 항목:

- External Post ID
- `status=draft`
- title 일치
- 의미 있는 본문 존재
- 선택한 Category ID 적용
- 현재 정책에서 Tag 미사용
- 필요한 Media URL 존재
- 필요한 ALT가 Media 재조회에서 확인됨
- 필요한 Featured Image ID 적용

WordPress가 HTML을 정규화할 수 있으므로 원문 문자열 완전 일치만 요구하지 않는다. 정규화된 의미 구조, 예상 핵심 본문과 Media reference를 비교한다.

## 18. Audit and Completion Result

Audit은 주체, Workspace, Project, Content, current Revision, PlatformConnection, workflow, required Permission, final confirmation, Idempotency Key, Render checksum, Media 결과, External Post ID, Verification 결과, 안전한 Error code와 timestamp를 기록한다.

Completion UI는 verified Draft의 External Post ID, Draft 상태, Connection, Category, Media/ALT/Featured Image 검증 결과와 관리자 확인 동작을 표시한다. Secret, Authorization Header와 원시 외부 response는 표시하거나 저장하지 않는다.

## 19. Failure and Recovery

- Category 삭제/비활성: 외부 write 전 차단하고 재선택 요구
- Media 일부 실패: Post를 생성하지 않고 안전한 실패 상태와 성공한 Media reference를 기록
- Media 성공 후 Post 실패: 업로드 Media를 자동 삭제하지 않고 `cleanup_required` 또는 동등 상태와 Audit 기록
- Post ID 수신 후 persistence 실패: 새 Draft 생성 전 외부 Post 재조회
- timeout 또는 결과 불명확: `unknown`으로 보존하고 자동 재생성 금지
- Verification mismatch: 완료로 표시하지 않고 External ID와 mismatch 진단 보존
- 인증 실패: Connection 재확인 요구; Secret 자동 삭제 금지
- Retry: 실패 요청에 대한 사용자 명시 동작으로만 수행

## 20. UI Flow

```text
WordPress Connection 확인
→ 실제 Category 조회
→ Category 선택
→ Preview와 Readiness 확인
→ Media Permission 및 업로드 계획 확인
→ 사용자 최종 확인
→ Media Upload와 ALT 검증
→ Draft Create
→ External Post Re-read
→ Audit 저장
→ Completion UI
```

Public Publish, Schedule, Update와 Delete UI는 제공하거나 활성화하지 않는다.

## 21. Planned Files

다음 목록은 구현 전에 Repository 구조와 책임 중복을 다시 확인해야 하는 계획이며 파일 생성 승인이 아니다.

- `app/api/publishing/wordpress/route.ts`
- `app/application/publishing/WordPressPublishingPreparation.ts`
- `app/application/publishing/WordPressDraftReadiness.ts`
- `app/application/publishing/WordPressDraftApplicationService.ts`
- `apps/wordpress/WordPressRestClient.ts`
- `apps/wordpress/WordPressCategoryAdapter.ts`
- `apps/wordpress/WordPressMediaAdapter.ts`
- `apps/wordpress/WordPressDraftPublishingAdapter.ts`
- `apps/wordpress/WordPressDraftVerificationAdapter.ts`
- `app/user-flow/WordPressDraftOverlay.tsx`

현재 `core/publishing/Publishing.ts`의 `PublishingAdapterRegistry`와 `PublishingPipeline`, 기존 Connection Repository, Permission Gate, Persistence와 Tistory Application Service 경계를 구현 직전에 다시 읽는다. 기존 Registry/Publishing 구조로 책임을 충족할 수 있으면 불필요한 새 파일이나 병렬 Service를 만들지 않는다. 기존 파일을 확장할지 새 파일을 만들지는 실제 의존성과 테스트 경계를 확인한 뒤 최소 범위로 결정한다.

## 22. Automated Test Plan

- URL normalization과 Connection ownership
- Workspace/Project/Content ownership
- platform enabled
- connected status
- selected target
- current Revision and Quality approval
- Draft Only/Public Off
- final confirmation
- Category dynamic read와 pagination
- multiple Category IDs
- missing/deleted Category block
- no automatic Uncategorized fallback
- no tags under current policy
- media permission conditional
- media upload and URL mapping
- ALT
- `featured_media`
- media partial failure와 `cleanup_required`
- draft create payload
- re-read verification
- title/content/category/media mismatch
- idempotency
- unknown result no auto-recreate
- secret and Authorization Header redaction
- Audit
- Tistory Draft와 예약발행 regression protection

자동 테스트는 실제 WordPress network 없이 REST client와 repository 경계를 제어해 실행한다. 이후 실제 사이트 검증을 별도 Gate로 수행한다.

## 23. Real External Verification Plan

1. Bright Studio Settings에서 WordPress Connection을 확인한다.
2. WordPress 실제 Category 목록을 조회한다.
3. `생활경제` Category를 선택한다.
4. 승인된 현재 Content Revision을 사용한다.
5. 로컬 이미지를 업로드한다.
6. ALT 적용을 확인한다.
7. Featured Image를 적용한다.
8. Draft를 생성한다.
9. WordPress 관리자에서 비공개 Draft를 확인한다.
10. External Post ID를 재조회한다.
11. 제목, 본문, Category, Media, ALT와 Featured Image를 확인한다.
12. Public Post가 생성되지 않았는지 확인한다.
13. 완료 UI와 Audit을 확인한다.

## 24. Implementation Sequence

1. Documentation and Contract Alignment
2. Additive Data Model
3. Category Read and Preparation
4. Readiness
5. Media Upload
6. ALT and Featured Image
7. Draft Create
8. External Verification
9. Idempotency and Audit
10. Completion UI
11. Automated Regression
12. Real WordPress Verification

각 단계는 독립적으로 `Implement → Test → Review → Commit` 순서를 따른다. 이번 문서 작업에는 코드 구현과 Commit이 포함되지 않는다.

## 25. Approval Gate

이 상세 설계는 Approved지만 구현 상태는 Not Implemented다. 현재 Gate는 이 문서와 관련 Source of Truth의 targeted diff를 사용자에게 제시하고 승인을 받는 것이다.

문서 diff 승인 전에는 구현을 시작하지 않는다. 구현 후에도 자동 테스트와 실제 WordPress Draft 외부 검증을 모두 통과하기 전에는 MVP를 Implemented, Completed 또는 Verified로 표시하지 않는다.
