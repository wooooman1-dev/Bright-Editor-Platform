# Platform Adapter Architecture

Version: 2.0

Status: Approved

Sprint: Sprint 8

Document Type: Architecture Specification

Implementation Status: Not Implemented

Integrated Sprint 6 Extension: Tistory Scheduling Contract Approved; Domain and Runtime Not Implemented

---

# 1. Purpose

이 문서는 Bright Studio의 Platform Adapter Architecture와 공통 실행 계약을 정의한다.

Platform Adapter는 플랫폼 독립적인 Core와 외부 Publishing Platform 사이의 경계이다.

Platform Adapter의 목적은 다음과 같다.

- 플랫폼별 인증 및 연결 방식 격리
- 플랫폼별 Metadata 변환
- 플랫폼별 Category 변환
- 플랫폼별 Content Rendering
- Shared Preview 지원
- Draft Save 실행
- 발행 결과 검증
- 플랫폼 오류의 공통 Error 변환
- 여러 플랫폼과 계정에 대한 공통 Publishing Queue 지원
- 새로운 플랫폼 추가 시 Core 변경 최소화

이 문서는 다음 플랫폼을 지원할 수 있는 공통 계약을 정의한다.

- Tistory
- WordPress
- YouTube
- Naver Cafe
- Blog
- Shopping
- Future Platforms

Sprint 8의 실제 구현 우선 대상은 다음과 같다.

```text
Tistory Existing Adapter Alignment
+
WordPress Draft Adapter
+
Shared Preview
+
Shared Publishing Contract
+
Sequential Platform Queue

2. Scope

Sprint 8의 설계 범위는 다음과 같다.

Platform Adapter 공통 Contract
Platform Capability Model
Platform Adapter Registry
Connection Validation Contract
Site Metadata Contract
Category Contract
Rendering Contract
Shared Preview Contract
Draft Save Contract
Draft Verification Contract
Publishing Result Contract
Error Mapping Contract
Sequential Publishing Queue
Multi-account Execution
Retry, Skip, Stop
Idempotency
Audit and History
Tistory Adapter Mapping
WordPress Adapter Mapping
WordPress Draft v1 범위
Architecture Acceptance Criteria

Sprint 8은 Public Publishing 자동화를 활성화하지 않는다.

기본 운영 정책은 다음을 유지한다.

Review First: ON
Draft Only: ON
Public Publish: OFF
Sequential Draft Save: ON
Quality Approval Required: ON
3. Architecture Principles
3.1 Core Independence

Core는 다음 정보를 알지 못한다.

플랫폼 URL 구조
플랫폼 REST Endpoint
플랫폼 DOM
플랫폼 Selector
로그인 화면
Cookie 구조
Session 구조
WordPress Application Password 형식
Tistory Editor 구현
외부 플랫폼 오류 코드

Core는 공통 Platform Contract만 사용한다.

3.2 Adapter Ownership

플랫폼별 로직은 Apps에 속한다.

apps
├── tistory
├── wordpress
├── youtube
├── naver-cafe
├── blog
└── shopping

플랫폼별 Adapter, Renderer, Connection Validator, Category Mapper, Workflow와 Error Mapper는 해당 App 내부에 위치한다.

3.3 Permission Before Execution

외부 플랫폼 작업은 Adapter 호출 전에 서버 측 Permission Gate를 통과해야 한다.

AI or User
→ Publishing Command
→ Permission Gate
→ Publishing Service
→ Platform Adapter
→ Platform API or Registered Workflow
→ External Platform

UI에서 버튼이 보이거나 활성화된 상태는 실행 권한을 의미하지 않는다.

3.4 Capability Before Operation

호출자는 플랫폼 이름만 보고 기능 지원 여부를 추정하지 않는다.

모든 기능 지원 여부는 Adapter가 반환하는 Capability Model로 확인한다.

지원하지 않는 기능을 성공한 것처럼 처리해서는 안 된다.

3.5 Shared Contract, Platform-specific Execution

공통 요청과 결과 형식은 Core 또는 Shared Contract가 소유한다.

실제 실행 방식은 플랫폼별 Adapter가 결정한다.

예:

Tistory
→ Registered Playwright Workflow

WordPress
→ WordPress REST API

Future Platform
→ REST API, SDK or Registered Browser Workflow
3.6 No Duplicate Business Logic

다음 로직은 Adapter별로 중복 구현하지 않는다.

Quality Gate
Permission Gate
Queue 관리
Retry 정책
Publishing History
Audit
Idempotency 정책
ContentDocument Validation

Adapter는 플랫폼별 변환과 실행만 담당한다.

4. High-level Architecture
UI
↓
Application Service
↓
Publishing Service
↓
Permission Gate
↓
Platform Adapter Registry
↓
Selected Platform Adapter
├── Renderer
├── Connection Validator
├── Category Mapper
├── Draft Executor
├── Verification Handler
└── Error Mapper
↓
External Platform

Shared Preview는 외부 플랫폼 실행 없이 생성한다.

ContentDocument
↓
Content Processing Pipeline
↓
Platform Renderer
↓
Rendered Platform Content
↓
Shared Preview Builder
↓
Preview Document

외부 Draft Save는 다음 흐름을 따른다.

Approved ContentDocument
↓
Publishing Preparation
↓
Permission Gate
↓
Platform Render
↓
Platform Draft Execution
↓
External Result
↓
Draft Verification
↓
Publishing History
5. Responsibility Boundaries
5.1 Core Responsibility

Core는 다음을 담당한다.

Canonical ContentDocument
Content Processing
Content Validation
Quality Gate
Publishing Command
Common Request and Result Model
Permission Gate Contract
Queue Orchestration
Idempotency Policy
Publishing History
Audit Contract
Common Error Categories

Core는 외부 플랫폼에 직접 연결하지 않는다.

5.2 Application Service Responsibility

Application Service는 다음을 담당한다.

Workspace와 Project 소유권 확인
Content 상태 확인
Quality Approval 확인
Platform Target 확인
PlatformConnection 확인
Permission Gate 요청
Adapter 선택
Queue 생성
결과 저장
사용자에게 반환할 상태 구성
5.3 Platform Adapter Responsibility

Platform Adapter는 다음을 담당한다.

Capability 제공
연결 검증
플랫폼 Site Metadata 조회
Category 조회와 변환
Platform Metadata 변환
Platform Rendering
Draft Save 실행
Draft 결과 검증
플랫폼 Error Mapping
플랫폼별 External Reference 반환
5.4 Renderer Responsibility

Renderer는 다음을 담당한다.

ContentDocument를 플랫폼 출력으로 변환
플랫폼별 HTML 또는 Payload 생성
지원하지 않는 Block의 Fallback 처리
Platform-specific Validation
Render Warning 생성

Renderer는 다음을 수행하지 않는다.

AI 콘텐츠 재작성
Search Intent 변경
Quality Score 변경
Permission 확인
외부 플랫폼 호출
Publishing History 저장
5.5 Platform Workflow Responsibility

Registered Browser Workflow 또는 API Client는 실제 외부 작업만 수행한다.

다음 비즈니스 판단을 수행하지 않는다.

콘텐츠 품질 승인
발행 권한 승인
대상 플랫폼 선택
Retry 정책 선택
Queue 순서 결정
사용자 승인 여부 판단
6. Platform Identity
type PlatformId =
  | "tistory"
  | "wordpress"
  | "youtube"
  | "naver_cafe"
  | "blog"
  | "shopping";

향후 플랫폼을 추가할 수 있지만, 임의 문자열을 플랫폼 식별자로 사용하지 않는다.

Platform Adapter는 하나의 PlatformId를 소유한다.

interface PlatformIdentity {
  platform: PlatformId;
  adapterVersion: number;
  displayName: string;
}

Adapter Version은 Platform Contract Version과 구분한다.

Contract Version: 공통 Interface Version
Adapter Version: 특정 Adapter 구현 Version
7. Platform Capability Model
7.1 Capability Keys
type PlatformCapabilityKey =
  | "connection_verification"
  | "site_metadata_read"
  | "category_read"
  | "content_render"
  | "shared_preview"
  | "media_upload"
  | "draft_create"
  | "draft_verify"
  | "schedule"
  | "public_publish"
  | "existing_content_update"
  | "existing_content_delete"
  | "account_settings_change";
7.2 Execution Mode
type PlatformExecutionMode =
  | "local"
  | "server_api"
  | "registered_browser_workflow";

의미:

local: 외부 플랫폼 호출 없이 실행
server_api: 서버에서 플랫폼 API 호출
registered_browser_workflow: 승인된 고정 Browser Workflow 실행
7.3 Capability Definition
interface PlatformCapability {
  key: PlatformCapabilityKey;

  supported: boolean;
  enabledByDefault: boolean;

  executionMode: PlatformExecutionMode;

  requiredPermission?: PlatformPermissionKey;

  requiresConnection: boolean;
  requiresQualityApproval: boolean;
  requiresUserConfirmation: boolean;

  reason?: string;
}
7.4 Capability Set
interface PlatformCapabilities {
  platform: PlatformId;
  adapterVersion: number;
  capabilities: PlatformCapability[];
}
7.5 Capability Rules
supported: false인 작업은 호출하지 않는다.
지원하지 않는 작업은 명시적인 unsupported_capability 오류를 반환한다.
Capability는 Permission을 대체하지 않는다.
supported: true여도 Permission Gate에서 거부될 수 있다.
Adapter가 지원하더라도 Workspace에서 해당 플랫폼이 비활성화되어 있으면 실행하지 않는다.
외부 실행 환경이 준비되지 않으면 Capability를 일시적으로 unavailable 상태로 표현할 수 있다.
UI는 Capability를 기준으로 작업을 표시하되 최종 권한은 서버에서 다시 확인한다.
8. Platform Adapter Registry

Platform Adapter는 Registry를 통해 조회한다.

Core나 Application Service에서 플랫폼별 if 분기를 반복하지 않는다.

금지:

if (platform === "tistory") {
  // Tistory logic
}

if (platform === "wordpress") {
  // WordPress logic
}

권장:

const adapter = adapterRegistry.get(platform);
8.1 Registry Contract
interface PlatformAdapterRegistry {
  register(adapter: PlatformAdapter): void;

  get(platform: PlatformId): PlatformAdapter;

  has(platform: PlatformId): boolean;

  list(): PlatformIdentity[];
}
8.2 Registry Rules
동일 Platform과 Adapter Version의 중복 등록을 허용하지 않는다.
등록되지 않은 플랫폼 요청은 명시적인 오류를 반환한다.
Registry는 Adapter 생명주기를 관리할 수 있다.
Registry가 Secret을 저장해서는 안 된다.
Adapter 선택은 UI가 아니라 서버 Application Service에서 수행한다.
9. Common Execution Context

외부 작업은 Permission Gate가 발급한 승인 Context를 필요로 한다.

interface AuthorizedPlatformExecutionContext {
  authorizationId: string;
  auditId: string;
  correlationId: string;

  workspaceId: string;
  projectId: string;
  contentId?: string;

  platform: PlatformId;
  platformConnectionId: string;

  operation: PlatformCapabilityKey;

  authorizedAt: string;
  expiresAt: string;
}
9.1 Execution Context Rules
Adapter는 UI에서 전달된 Permission Flag를 신뢰하지 않는다.
authorizationId는 서버가 생성한 승인 결과를 참조한다.
Context의 Platform과 Adapter Platform이 일치해야 한다.
Context의 Connection과 요청 Connection이 일치해야 한다.
Context의 Operation과 실제 Operation이 일치해야 한다.
만료된 Context로 외부 작업을 실행하지 않는다.
Context에 Secret 원문을 포함하지 않는다.

Shared Preview와 Local Render는 외부 작업이 아니므로 외부 실행 승인 Context를 요구하지 않는다.

10. Platform Connection Boundary

PlatformConnection은 Workspace가 소유한다.

Workspace
└── Platform Connections
    ├── Tistory Account A
    ├── Tistory Account B
    ├── WordPress Site A
    └── WordPress Site B

Project는 PlatformConnection을 복제하지 않고 식별자로 참조한다.

interface PlatformConnectionReference {
  workspaceId: string;
  platformConnectionId: string;
  platform: PlatformId;
}

Platform Adapter가 받는 연결 정보에는 Secret 원문이 포함되지 않는다.

interface ServerPlatformConnectionContext {
  platformConnectionId: string;
  platform: PlatformId;

  connectionProfile: Record<string, unknown>;
  secretReference?: string;

  connectionStatus: PlatformConnectionStatus;
}

Secret 해석은 서버 전용 Platform Connection Infrastructure에서 수행한다.

다음 계층은 SecretStore를 직접 호출하지 않는다.

UI
Client Component
AI Engine
Prompt Engine
Content Engine
Quality Engine
Shared Preview
Generic Core Service
11. Connection Validation Contract
11.1 Request
interface PlatformConnectionValidationRequest {
  connection: ServerPlatformConnectionContext;
  authorization: AuthorizedPlatformExecutionContext;
}
11.2 Result
type PlatformConnectionHealth =
  | "connected"
  | "degraded"
  | "expired"
  | "invalid"
  | "unavailable";

interface PlatformConnectionValidationResult {
  platform: PlatformId;
  platformConnectionId: string;

  health: PlatformConnectionHealth;
  authenticated: boolean;

  externalAccountId?: string;
  externalAccountName?: string;
  siteName?: string;
  siteUrl?: string;

  capabilities?: PlatformCapabilities;

  checkedAt: string;
  warnings: PlatformWarning[];
}
11.3 Validation Rules
연결 검증은 외부 데이터를 수정하지 않는다.
연결 검증은 가장 작은 안전한 Read 요청을 사용한다.
검증 실패 시 Credential 원문을 Error에 포함하지 않는다.
HTTP Response Body 전체를 사용자 로그에 저장하지 않는다.
연결 검증 성공이 Draft Save 성공을 보장하지 않는다.
연결 상태와 Capability 상태를 분리한다.
12. Site Metadata Contract
interface PlatformSiteMetadata {
  platform: PlatformId;
  platformConnectionId: string;

  externalSiteId?: string;
  siteName: string;
  siteUrl: string;

  locale?: string;
  timezone?: string;

  supportedPostTypes?: string[];
  defaultPostType?: string;

  rawMetadataReference?: string;

  retrievedAt: string;
}

rawMetadataReference는 필요 시 서버 내부의 진단 데이터만 참조한다.

외부 Response 전체를 Domain Model로 사용하지 않는다.

13. Category Contract
13.1 Canonical Category
interface PlatformCategory {
  id: string;
  platform: PlatformId;

  externalCategoryId: string;
  name: string;
  slug?: string;

  parentExternalCategoryId?: string;
  depth?: number;

  selectable: boolean;
}
13.2 Category Request
interface PlatformCategoryListRequest {
  connection: ServerPlatformConnectionContext;
  authorization: AuthorizedPlatformExecutionContext;

  search?: string;
  page?: number;
  pageSize?: number;
}
13.3 Category Result
interface PlatformCategoryListResult {
  platform: PlatformId;
  platformConnectionId: string;

  categories: PlatformCategory[];

  hasMore: boolean;
  nextPage?: number;

  retrievedAt: string;
  warnings: PlatformWarning[];
}
13.4 Category Rules
Platform Category는 Content Domain과 다른 개념이다.
Category는 발행 준비 단계에서 조회한다.
Project 기본 Category가 존재하면 실제 조회 결과에 포함되는지 확인한다.
존재하지 않는 Category ID를 임의로 사용하지 않는다.
Category 조회 실패가 ContentDocument를 손상시키면 안 된다.
Category가 없는 플랫폼은 Capability에서 category_read를 지원하지 않는다고 명시한다.
14. Rendering Contract
14.1 Render Request
interface PlatformRenderRequest {
  platform: PlatformId;

  workspaceId: string;
  projectId: string;
  contentId: string;

  contentDocument: ContentDocument;
  contentVersion: number;

  target: PlatformRenderTarget;
  options: PlatformRenderOptions;
}
14.2 Render Target
interface PlatformRenderTarget {
  platformConnectionId?: string;
  postType?: string;
  categoryIds?: string[];
  locale?: string;
}
14.3 Render Options
interface PlatformRenderOptions {
  includeTableOfContents?: boolean;
  includeRelatedContent?: boolean;
  includeImagePlaceholders?: boolean;

  linkPolicy?: "default" | "self_internal_blank_external";
  unsupportedBlockPolicy?: "error" | "warning" | "fallback";

  themeSkinId?: string;
}
14.4 Rendered Content
interface RenderedPlatformContent {
  platform: PlatformId;

  title: string;
  body: string;

  excerpt?: string;
  slug?: string;

  format: "html" | "markdown" | "json" | "plain_text";

  metadata: Record<string, unknown>;

  contentVersion: number;
  rendererVersion: number;

  warnings: PlatformWarning[];
  unsupportedBlocks: UnsupportedBlockResult[];

  checksum: string;
}
14.5 Rendering Rules
Renderer 입력은 Approved ContentDocument다.
Renderer가 ContentDocument 원본을 변경해서는 안 된다.
Render 결과는 deterministic해야 한다.
동일 ContentDocument와 동일 Renderer Version은 가능한 한 동일 결과를 생성해야 한다.
지원하지 않는 Block은 정책에 따라 Error, Warning 또는 Fallback으로 처리한다.
HTML을 Canonical Content 원본으로 역저장하지 않는다.
Render 결과는 Preview와 Draft Save가 동일하게 사용해야 한다.
Preview용 HTML과 실제 Draft Save용 HTML이 서로 다른 Pipeline을 사용해서는 안 된다.
Renderer Version과 Content Version을 결과에 기록한다.
15. Shared Preview Contract

Shared Preview는 외부 플랫폼을 호출하지 않고 플랫폼 출력 결과를 검토하는 기능이다.

15.1 Preview Request
interface SharedPreviewRequest {
  renderResult: RenderedPlatformContent;

  viewport?: "desktop" | "tablet" | "mobile";
  themeSkinId?: string;

  showWarnings?: boolean;
}
15.2 Preview Result
interface SharedPreviewResult {
  platform: PlatformId;

  title: string;
  previewBody: string;

  viewport: "desktop" | "tablet" | "mobile";

  renderChecksum: string;
  rendererVersion: number;

  warnings: PlatformWarning[];

  generatedAt: string;
}
15.3 Preview Rules
Shared Preview는 Secret이나 Platform Session을 사용하지 않는다.
Shared Preview는 외부 콘텐츠를 생성하거나 수정하지 않는다.
Preview 결과는 실제 Draft Save에 사용할 Render 결과와 동일한 Checksum을 가져야 한다.
Preview Shell은 플랫폼의 실제 관리자 화면을 복제한다고 주장하지 않는다.
Preview는 콘텐츠 구조와 플랫폼 출력 형식을 확인하는 용도다.
실제 플랫폼 Theme, Plugin 또는 Custom CSS 차이는 Warning으로 표시할 수 있다.
External Preview가 향후 필요하면 별도의 Capability와 Permission을 추가한다.
16. Draft Save Contract
16.1 Draft Save Request
interface PlatformDraftSaveRequest {
  authorization: AuthorizedPlatformExecutionContext;
  connection: ServerPlatformConnectionContext;

  workspaceId: string;
  projectId: string;
  contentId: string;

  contentVersion: number;

  renderedContent: RenderedPlatformContent;

  categoryIds: string[];
  metadata: Record<string, unknown>;

  idempotencyKey: string;
  attempt: number;
}
16.2 Draft Save Result
type ExternalDraftStatus =
  | "created"
  | "existing_reused"
  | "unknown";

interface PlatformDraftSaveResult {
  platform: PlatformId;
  platformConnectionId: string;

  status: ExternalDraftStatus;

  externalContentId?: string;
  externalEditorUrl?: string;
  externalPreviewUrl?: string;

  externalStatus?: string;

  contentVersion: number;
  renderChecksum: string;

  idempotencyKey: string;

  createdAt?: string;
  updatedAt?: string;

  verificationRequired: boolean;

  warnings: PlatformWarning[];
}
16.3 Draft Save Rules
Draft Save는 Public Publish를 수행하지 않는다.
Draft Save 요청에는 검증된 Render 결과를 사용한다.
요청 Platform과 Render Result Platform이 일치해야 한다.
요청 Content Version과 Render Version이 일치해야 한다.
동일 Idempotency Key의 재시도는 가능한 경우 기존 Draft를 재사용한다.
외부 ID를 받은 경우 Verification 전까지 최종 성공으로 확정하지 않는다.
External Editor URL은 Platform 결과로 확인된 경우에만 저장한다.
AI가 External URL을 생성해서는 안 된다.
Adapter가 성공했다고 반환하더라도 Verification 실패 시 최종 상태는 실패 또는 검증 대기로 남긴다.
17. Draft Verification Contract
17.1 Verification Request
interface PlatformDraftVerificationRequest {
  authorization: AuthorizedPlatformExecutionContext;
  connection: ServerPlatformConnectionContext;

  externalContentId: string;

  expectedContentVersion: number;
  expectedRenderChecksum: string;

  draftSaveResult: PlatformDraftSaveResult;
}
17.2 Verification Result
type PlatformVerificationStatus =
  | "verified"
  | "mismatch"
  | "not_found"
  | "unauthorized"
  | "unavailable";

interface PlatformDraftVerificationResult {
  platform: PlatformId;
  platformConnectionId: string;

  externalContentId: string;

  status: PlatformVerificationStatus;

  externalStatus?: string;
  externalTitle?: string;
  externalUrl?: string;

  contentMatched?: boolean;
  titleMatched?: boolean;
  statusMatched?: boolean;

  verifiedAt: string;

  warnings: PlatformWarning[];
}
17.3 Verification Rules
Draft Save Response만으로 Verification을 대체하지 않는다.
플랫폼에서 외부 ID를 재조회하거나 등록 결과를 다시 확인한다.
최소한 외부 콘텐츠 존재 여부와 Draft 상태를 검증한다.
가능한 플랫폼에서는 Title 또는 Content Fingerprint도 확인한다.
HTML 정규화 차이로 인해 원문 문자열 완전 일치만 요구하지 않는다.
Verification 실패 시 성공으로 기록하지 않는다.
Verification 결과는 Publishing History에 연결한다.
검증되지 않은 Draft URL을 Published Content Registry에 등록하지 않는다.
18. Common Platform Adapter Contract
interface PlatformAdapter {
  readonly identity: PlatformIdentity;

  getCapabilities(): PlatformCapabilities;

  validateConnection(
    request: PlatformConnectionValidationRequest
  ): Promise<PlatformResult<PlatformConnectionValidationResult>>;

  readSiteMetadata(
    request: PlatformConnectionValidationRequest
  ): Promise<PlatformResult<PlatformSiteMetadata>>;

  listCategories(
    request: PlatformCategoryListRequest
  ): Promise<PlatformResult<PlatformCategoryListResult>>;

  render(
    request: PlatformRenderRequest
  ): Promise<PlatformResult<RenderedPlatformContent>>;

  buildPreview(
    request: SharedPreviewRequest
  ): Promise<PlatformResult<SharedPreviewResult>>;

  saveDraft(
    request: PlatformDraftSaveRequest
  ): Promise<PlatformResult<PlatformDraftSaveResult>>;

  verifyDraft(
    request: PlatformDraftVerificationRequest
  ): Promise<PlatformResult<PlatformDraftVerificationResult>>;
}

향후 Capability 확장 시 별도 Interface를 사용할 수 있다.

예:

interface PlatformMediaAdapter {
  uploadMedia(
    request: PlatformMediaUploadRequest
  ): Promise<PlatformResult<PlatformMediaUploadResult>>;
}

interface PlatformPublicPublishingAdapter {
  publish(
    request: PlatformPublishRequest
  ): Promise<PlatformResult<PlatformPublishResult>>;
}

초기 Base Adapter에 Public Publish와 Delete를 강제로 포함하지 않는다.

위험한 기능은 별도 Capability Interface로 분리한다.

19. Common Result Contract
type PlatformResult<T> =
  | {
      ok: true;
      value: T;
      warnings: PlatformWarning[];
    }
  | {
      ok: false;
      error: PlatformError;
      warnings: PlatformWarning[];
    };
19.1 Warning
interface PlatformWarning {
  code: string;
  message: string;

  recoverable: boolean;

  field?: string;
  blockId?: string;
}
19.2 Error Categories
type PlatformErrorCategory =
  | "validation"
  | "unsupported_capability"
  | "connection"
  | "authentication"
  | "authorization"
  | "permission_gate"
  | "rate_limit"
  | "network"
  | "timeout"
  | "rendering"
  | "external_validation"
  | "external_conflict"
  | "verification"
  | "idempotency"
  | "workflow"
  | "repository"
  | "unknown";
19.3 Platform Error
interface PlatformError {
  category: PlatformErrorCategory;

  code: string;
  message: string;

  platform: PlatformId;
  platformConnectionId?: string;

  operation: PlatformCapabilityKey;

  retryable: boolean;
  requiresUserAction: boolean;

  externalStatusCode?: number;
  externalErrorCode?: string;

  correlationId?: string;

  safeDetails?: Record<string, unknown>;
}
19.4 Error Rules
Secret, Password, Cookie와 Authorization Header를 Error에 포함하지 않는다.
외부 Response Body 전체를 사용자에게 노출하지 않는다.
플랫폼 Error Code는 공통 Category로 변환한다.
Retry 가능 여부를 명시한다.
사용자 조치가 필요한 오류와 시스템 재시도 오류를 구분한다.
알 수 없는 오류를 성공으로 처리하지 않는다.
Browser Workflow 오류와 REST API 오류가 동일한 Common Error 형태로 반환되어야 한다.
20. Sequential Publishing Queue

여러 플랫폼 또는 여러 계정이 선택되면 순차 Queue를 사용한다.

동시 실행은 Sprint 8 기본 범위가 아니다.

20.1 Queue Model
type PublishingQueueStatus =
  | "pending"
  | "running"
  | "paused"
  | "stopping"
  | "completed"
  | "completed_with_errors"
  | "stopped"
  | "cancelled";

interface PublishingQueue {
  id: string;

  workspaceId: string;
  projectId: string;
  contentId: string;

  contentVersion: number;

  status: PublishingQueueStatus;

  itemIds: string[];

  currentItemId?: string;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  stoppedReason?: string;
}
20.2 Queue Item Status
type PublishingQueueItemStatus =
  | "queued"
  | "authorizing"
  | "rendering"
  | "ready"
  | "executing"
  | "verifying"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled"
  | "cleanup_required";
20.3 Queue Item
interface PublishingQueueItem {
  id: string;
  queueId: string;

  order: number;

  platform: PlatformId;
  platformConnectionId: string;

  operation: "draft_create";

  status: PublishingQueueItemStatus;

  idempotencyKey: string;
  attempt: number;

  externalContentId?: string;

  error?: PlatformError;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
20.4 Queue Execution
Queue Item
→ Ownership Validation
→ Capability Validation
→ Permission Gate
→ Render
→ Draft Save
→ Verification
→ History Save
→ Next Item
20.5 Queue Ordering

기본 순서는 사용자가 발행 준비 화면에서 확정한 순서를 유지한다.

정렬 기준을 시스템이 임의로 변경하지 않는다.

향후 Platform Priority 설정을 지원할 수 있지만 명시적 정책이 필요하다.

20.6 Partial Failure

한 Item이 실패해도 이미 성공한 Item을 취소하거나 외부 Draft를 자동 삭제하지 않는다.

기본 실패 정책:

Failed Item
→ Error 기록
→ Queue Policy 확인
→ Continue, Pause or Stop

초기 권장 기본값은 실패 후 Pause다.

사용자는 다음을 선택할 수 있다.

Retry
Skip
Stop
Continue to Next
20.7 Retry

Retry는 동일 Queue Item과 동일 논리적 Idempotency Key를 사용한다.

attempt만 증가한다.

외부 ID가 이미 확인된 경우 새 Draft를 생성하기 전에 기존 결과를 재검증한다.

20.8 Skip

Skip은 실행되지 않은 Item 또는 실패한 Item에 적용한다.

Skip 이유를 Audit에 기록한다.

이미 성공한 Item을 Skip 상태로 변경하지 않는다.

20.9 Stop

Stop은 현재 실행 이후 새 Item 시작을 중단한다.

외부 요청이 진행 중인 경우 안전하게 취소할 수 있는지 Adapter가 보장하지 않는 한 강제 중단하지 않는다.

Stop은 이미 성공한 외부 결과를 Rollback하지 않는다.

20.10 Cancel

아직 시작하지 않은 Queue는 Cancel할 수 있다.

이미 외부 작업이 실행된 Queue는 단순 Cancel로 외부 결과를 삭제하지 않는다.

21. Idempotency

Draft Save는 재시도와 Worker 재실행 상황에서 중복 Draft 생성을 방지해야 한다.

21.1 Idempotency Key

권장 구성:

workspaceId
+ projectId
+ contentId
+ contentVersion
+ platformConnectionId
+ operation

위 값을 안정적인 Hash로 변환할 수 있다.

21.2 Idempotency Record
interface PublishingIdempotencyRecord {
  key: string;

  workspaceId: string;
  projectId: string;
  contentId: string;

  platform: PlatformId;
  platformConnectionId: string;

  operation: "draft_create";

  contentVersion: number;
  renderChecksum: string;

  status:
    | "pending"
    | "external_result_received"
    | "verified"
    | "failed"
    | "unknown";

  externalContentId?: string;

  createdAt: string;
  updatedAt: string;
}
21.3 Idempotency Rules
동일 Key의 Verified 작업은 새 Draft를 생성하지 않는다.
External Result는 받았지만 저장에 실패한 경우 재시도 전에 Verification을 수행한다.
외부 ID가 없고 결과가 불명확하면 unknown 상태로 기록한다.
unknown 상태에서는 무조건 재생성하지 않는다.
사용자가 새로운 Draft 생성을 명시적으로 요청하면 새로운 Intent 또는 Key를 생성한다.
Content Version이 변경되면 새로운 Key를 사용할 수 있다.
Retry 횟수 제한을 설정할 수 있어야 한다.
22. Publishing History and Audit
22.1 Publishing History
interface PlatformPublishingHistoryRecord {
  id: string;

  queueId?: string;
  queueItemId?: string;

  workspaceId: string;
  projectId: string;
  contentId: string;

  platform: PlatformId;
  platformConnectionId: string;

  operation: PlatformCapabilityKey;

  contentVersion: number;
  renderChecksum?: string;

  status:
    | "requested"
    | "authorized"
    | "executing"
    | "external_result_received"
    | "verified"
    | "failed"
    | "skipped"
    | "stopped";

  externalContentId?: string;
  externalUrl?: string;

  error?: PlatformError;

  createdAt: string;
  updatedAt: string;
}
22.2 Audit Requirements

Audit에는 다음을 기록한다.

사용자 또는 실행 주체
Workspace
Project
Content
PlatformConnection
Operation
Required Permission
Permission 결과
Adapter
Adapter Version
Workflow 또는 API 실행 방식
Idempotency Key
External Result
Verification Result
Error
Timestamp

다음은 Audit에 기록하지 않는다.

Application Password 원문
Cookie 원문
Session Token 원문
Authorization Header
Platform Password
SecretStore Value
23. Tistory Adapter Mapping

Tistory Adapter는 기존 Tistory Workflow를 공통 Platform Adapter Contract에 맞춘다.

23.1 Tistory Execution Mode
Capability	Execution Mode
Connection Verification	Registered Browser Workflow
Site Metadata Read	Registered Browser Workflow 또는 Stored Configuration
Category Read	Registered Browser Workflow
Content Render	Local
Shared Preview	Local
Draft Create	Registered Browser Workflow
Draft Verify	Registered Browser Workflow
Media Upload	Registered Browser Workflow, 기본 비활성
Public Publish	기본 비활성
23.2 Tistory Components
TistoryPlatformAdapter
├── TistoryConnectionValidator
├── TistoryCategoryMapper
├── TistoryHtmlRenderer
├── TistoryPreviewMapper
├── TistoryDraftSaveWorkflow
├── TistoryDraftVerification
└── TistoryErrorMapper
23.3 Tistory Rules
Browser 실행은 Registered Workflow에서만 수행한다.
Adapter가 Playwright Page를 외부 계층에 노출하지 않는다.
Stored Session은 Tistory App Infrastructure가 관리한다.
Core가 Tistory Selector나 URL을 알지 않는다.
Draft Save Worker와 Category Worker는 공통 Result Contract로 변환한다.
기존 Sprint 1~5 Tistory 동작을 깨뜨리지 않는다.
Sprint 8은 Tistory 구현을 재작성하지 않고 공통 Contract에 정렬한다.
Public Publish는 활성화하지 않는다.
24. WordPress Adapter Architecture

WordPress Adapter는 WordPress REST API를 사용하는 Server API Adapter다.

Publishing Service
→ WordPressPlatformAdapter
→ WordPress API Client
→ WordPress REST API

WordPress Adapter는 Browser Automation에 의존하지 않는다.

특정 WordPress 설치 환경에서 REST API 사용이 불가능한 경우 연결을 지원하지 않는 상태로 명시한다.

24.1 Authentication

WordPress v1 연결은 다음 정보를 사용한다.

Site URL
WordPress Username
Application Password

Application Password 원문은 SecretStore에 저장한다.

PlatformConnection에는 다음과 같은 비민감 정보만 저장한다.

interface WordPressConnectionProfile {
  siteUrl: string;
  username: string;

  defaultPostType?: "posts";
  defaultCategoryId?: string;

  secretReference: string;
}
24.2 URL Normalization

WordPress Site URL은 저장 전에 정규화한다.

정규화 규칙:

HTTPS 사용을 기본 요구
끝의 불필요한 / 제거
관리자 URL이 아니라 Site Base URL 저장
/wp-admin 또는 /wp-json 입력 시 Base URL로 정규화
지원하지 않는 URL Scheme 거부
Redirect 후 확정 URL을 연결 Metadata로 보관 가능
24.3 WordPress REST Scope

Sprint 8 WordPress v1은 다음 REST 작업을 지원한다.

REST API Discovery
Authenticated Connection Verification
Site Metadata Read
Category Read
Post Draft Create
Created Draft Re-read

기본 리소스:

/wp-json/
/wp-json/wp/v2/users/me
/wp-json/wp/v2/categories
/wp-json/wp/v2/posts
/wp-json/wp/v2/posts/{id}

실제 Endpoint는 WordPress Discovery 결과와 Adapter 설정을 통해 구성한다.

Endpoint 문자열을 UI 또는 Core에 하드코딩하지 않는다.

24.4 Connection Verification

권장 흐름:

Site URL Normalize
→ REST API Discovery
→ Authenticated Identity Read
→ Minimum Capability Check
→ Connection Metadata Save

연결 검증은 다음을 확인한다.

REST API 접근 가능
인증 성공
현재 사용자가 Post Draft를 생성할 권한 보유
Posts Endpoint 접근 가능
Categories Endpoint 사용 가능 여부
Site URL과 Site Name
Adapter Capability

연결 검증 중 Post를 생성하지 않는다.

24.5 WordPress Category Read

Category 조회 결과를 Canonical PlatformCategory로 변환한다.

WordPress의 Category ID는 문자열로 정규화하여 Common Contract에 저장할 수 있다.

Pagination을 지원한다.

Category가 많아도 전체 결과를 한 번에 무제한 조회하지 않는다.

24.6 WordPress Rendering

WordPress Renderer 입력:

Approved ContentDocument
+
WordPress Target Settings
+
Bright Component Fallback Rules

출력:

Title
HTML Content
Excerpt
Category IDs
Optional Slug
Render Metadata
Warnings
Checksum

WordPress Renderer는 다음을 수행하지 않는다.

Theme 수정
Plugin 설치
Template 수정
Custom CSS 저장
Gutenberg Editor 직접 제어
외부 Media Upload
24.7 WordPress Draft Creation

Draft 생성 요청은 다음 원칙을 따른다.

POST Post Resource
Status = draft

초기 Payload에 포함할 수 있는 항목:

title
content
excerpt
status
categories
slug

필드가 지원되지 않거나 권한이 없는 경우 Platform Error로 변환한다.

Draft 생성 성공 후 다음 정보를 반환한다.

External Post ID
External Status
Edit Link 또는 확인 가능한 URL
Modified Time
Render Checksum Reference
24.8 WordPress Draft Verification

Draft 생성 이후 외부 Post ID로 다시 조회한다.

최소 검증 항목:

Post 존재
Status가 Draft
Title 일치
Content가 비어 있지 않음
예상 Category 적용 여부
External ID 일치

가능하면 정규화된 Content Fingerprint를 비교한다.

WordPress가 HTML을 정규화할 수 있으므로 문자열 완전 일치만으로 실패 처리하지 않는다.

24.9 WordPress v1 Capabilities
Capability	Supported	Default
Connection Verification	Yes	Enabled
Site Metadata Read	Yes	Enabled
Category Read	Yes	Enabled
Content Render	Yes	Enabled
Shared Preview	Yes	Enabled
Draft Create	Yes	Enabled
Draft Verify	Yes	Enabled
Media Upload	Contract Only	Disabled
Scheduling	No	Disabled
Public Publish	No	Disabled
Existing Post Update	No	Disabled
Post Delete	No	Disabled
Plugin Modification	No	Disabled
Theme Modification	No	Disabled
User Administration	No	Disabled
24.10 WordPress Plugin Compatibility

Sprint 8은 WordPress Core REST API를 기준으로 한다.

특정 SEO Plugin이나 Custom Field Plugin을 필수 의존성으로 추가하지 않는다.

Plugin별 Metadata는 향후 Capability Extension으로 추가한다.

지원하지 않는 Plugin Field를 자동 생성하거나 추측하지 않는다.

25. Multi-account Execution

하나의 Workspace는 동일 플랫폼의 여러 PlatformConnection을 가질 수 있다.

예:

Workspace
├── Tistory Account A
├── Tistory Account B
├── WordPress Site A
└── WordPress Site B
25.1 Multi-account Rules
각 PlatformConnection은 독립적인 Permission을 가진다.
각 Connection은 독립적인 Capability와 Health 상태를 가진다.
같은 플랫폼이라도 Connection별 Category 목록이 다를 수 있다.
Project 기본 Connection은 선택적 기본값이다.
Publishing Preparation에서 실제 대상 Connection을 확인한다.
하나의 Connection 실패가 다른 Connection의 성공 상태를 변경하지 않는다.
Queue Item마다 Connection ID를 저장한다.
Secret과 Session을 Connection 간 공유하지 않는다.
동일 Content를 여러 계정에 저장할 경우 각각 별도 외부 Draft로 취급한다.
26. Security Requirements
26.1 Secret Handling
Secret은 서버 전용 SecretStore에 저장한다.
Client에 Application Password를 반환하지 않는다.
Tistory Cookie와 WordPress Application Password를 동일 일반 설정 필드에 저장하지 않는다.
로그에 Authorization Header를 기록하지 않는다.
Error Message에 Secret 일부를 포함하지 않는다.
Secret Reference만 Domain과 Persistence에 저장한다.
26.2 Network Safety

WordPress 연결 시 다음을 검토한다.

HTTPS 기본 요구
Redirect 제한
Private Network 접근 정책
Localhost 허용 정책
Request Timeout
Response Size 제한
지원 Protocol 제한
URL 재검증

Server-side Request Forgery 방지 정책은 Security Architecture를 따른다.

26.3 Least Privilege
연결된 WordPress 사용자는 필요한 최소 권한만 가져야 한다.
초기 작업은 Draft Creation만 허용한다.
Public Publish는 별도 Permission과 설계 승인 전까지 사용할 수 없다.
Existing Post Update와 Delete는 기본 금지한다.
UI에서 기능을 숨기는 것만으로 권한을 구현하지 않는다.
27. Persistence Requirements

Sprint 8은 다음 데이터를 저장할 수 있어야 한다.

Adapter Identity
Adapter Version
Platform Capabilities
Connection Health
Connection Check Time
Queue
Queue Item
Idempotency Record
Render Checksum
Content Version
External Content ID
External Editor URL
Draft Verification Result
Publishing History
Audit Reference
Error Summary

외부 API Response 전체를 영구 Domain Model로 저장하지 않는다.

진단 목적의 Raw Response가 필요한 경우 별도 제한된 로그에 저장하고 보존 기한을 적용한다.

28. Failure and Recovery
28.1 Rendering Failure
외부 작업을 시작하지 않는다.
Queue Item을 Failed로 기록한다.
ContentDocument를 변경하지 않는다.
사용자가 원인을 수정한 뒤 Retry할 수 있다.
28.2 Authentication Failure
Connection Health를 Invalid 또는 Expired로 갱신한다.
자동으로 Secret을 삭제하지 않는다.
다른 Queue Item은 Connection별 정책에 따라 계속할 수 있다.
사용자에게 재연결이 필요함을 표시한다.
28.3 External Timeout
결과를 즉시 실패로 단정하지 않는다.
외부 ID가 알려진 경우 Verification을 시도한다.
결과가 불명확하면 unknown 또는 cleanup_required 상태를 사용한다.
무조건 새 Draft를 재생성하지 않는다.
28.4 Verification Failure
Draft Save를 최종 성공으로 기록하지 않는다.
External ID가 있으면 History에 보존한다.
Retry 시 먼저 재검증한다.
검증되지 않은 URL을 Published Registry에 전달하지 않는다.
28.5 Persistence Failure After External Success

외부 Draft는 생성됐지만 내부 저장이 실패한 경우:

External Result
→ Internal Persistence Failed
→ cleanup_required
→ External Reference 임시 보존
→ Recovery Job
→ Verify
→ History 복구

외부 Draft를 자동 삭제하지 않는다.

29. Implementation Sequence

Sprint 8 구현은 다음 순서로 진행한다.

Phase 1. Common Contract
Platform Identity
Capability Model
Common Result
Common Error
Render Contract
Preview Contract
Draft Contract
Verification Contract
Phase 2. Adapter Registry
Registry
Adapter Resolution
Unsupported Platform Error
Contract Version Validation
Phase 3. Shared Preview
Renderer Result 연결
Preview Builder
Preview Checksum
Platform Warning
Regression Test
Phase 4. Sequential Queue
Queue Model
Queue Item
Stable Ordering
Retry
Skip
Stop
Partial Failure
History
Phase 5. Tistory Alignment
기존 Tistory Renderer Mapping
기존 Category Workflow Mapping
기존 Draft Workflow Mapping
기존 Verification Mapping
기존 Sprint 1~5 Regression 보호
Phase 6. WordPress Connection
Connection Profile
Secret Reference
URL Normalization
REST Discovery
Authentication Verification
Capability Check
Phase 7. WordPress Draft
Category Read
WordPress Renderer
Shared Preview
Draft Create
Draft Re-read Verification
Error Mapping
Publishing History
Phase 8. Multi-account Verification
여러 Connection 선택
순차 실행
일부 성공
일부 실패
Retry
Skip
Stop
Idempotency
Phase 9. Documentation and Approval
Development Status 갱신
Test 결과 기록
WordPress 실제 계정 검증
Tistory Regression 확인
Sprint 8 완료 판정
30. Testing Requirements
30.1 Contract Tests

모든 Adapter는 동일 Contract Test Suite를 통과해야 한다.

Identity 반환
Capability 반환
Unsupported Capability 처리
Common Error Mapping
Render Result
Preview Checksum
Draft Request Validation
Verification Result
30.2 Tistory Tests
기존 Render 결과 유지
기존 Category 조회 유지
기존 Draft Save 유지
기존 Draft Verification 유지
Permission Gate 우회 불가
Browser Workflow 외부 직접 호출 금지
30.3 WordPress Unit Tests
Site URL Normalization
Authentication Header 생성 경계
Secret 비노출
Capability Mapping
Category Mapping
Render Mapping
Draft Payload
Draft Result Mapping
Verification Mapping
REST Error Mapping
Timeout Mapping
Permission Error Mapping

Unit Test는 실제 네트워크 없이 실행한다.

30.4 WordPress Integration Tests
Mock WordPress REST Server
Connection Verification
Category Pagination
Draft Creation
Draft Re-read
Authentication Failure
Permission Failure
Rate Limit
Network Timeout
Invalid JSON
Plugin-modified Response 허용 범위
30.5 Queue Tests
한 개 Item 성공
여러 Item 순차 성공
첫 Item 실패
중간 Item 실패
Retry 성공
Skip
Stop
Partial Success
동일 Key 중복 방지
Worker Restart 후 재개
External Success 후 Internal Failure 복구
30.6 Manual Verification

실제 WordPress 사이트에서 다음을 확인한다.

Connection
Site Metadata
Category 조회
Preview
Draft 생성
WordPress 관리자 화면에서 Draft 확인
Draft 상태 확인
제목 및 본문 확인
Category 확인
Public Publish가 실행되지 않았는지 확인

실제 외부 검증 전에는 Sprint 8 구현을 완료로 간주하지 않는다.

31. Acceptance Criteria

Sprint 8 상세 설계와 구현은 다음 조건을 만족해야 한다.

31.1 Platform Contract
모든 Platform Adapter가 공통 Contract를 사용한다.
Core에 플랫폼별 분기 로직이 추가되지 않는다.
Capability가 지원 여부를 명시한다.
지원하지 않는 기능이 명시적인 Error를 반환한다.
Adapter Version을 추적할 수 있다.
31.2 Shared Rendering and Preview
ContentDocument가 Canonical Source로 유지된다.
Render 결과가 Preview와 Draft Save에 함께 사용된다.
Preview와 Draft Render Checksum이 일치한다.
Preview가 외부 플랫폼 작업을 실행하지 않는다.
지원하지 않는 Block이 Warning 또는 Error로 표시된다.
31.3 Permission and Safety
모든 외부 작업이 Permission Gate를 통과한다.
UI 상태로 Permission을 우회할 수 없다.
Draft Only가 기본값이다.
Public Publish가 실행되지 않는다.
Existing Content Update와 Delete가 실행되지 않는다.
Secret이 Client와 로그에 노출되지 않는다.
31.4 Sequential Queue
여러 PlatformConnection을 순차 실행한다.
Queue 순서가 안정적이다.
일부 실패가 이미 성공한 결과를 취소하지 않는다.
Retry, Skip, Stop이 동작한다.
Item별 결과와 Error가 기록된다.
Queue 재실행이 중복 Draft를 생성하지 않는다.
31.5 Tistory
기존 Tistory 기능을 공통 Contract에 연결할 수 있다.
기존 Sprint 1~5 기능이 유지된다.
Tistory Browser Automation이 Registered Workflow 안에 유지된다.
Core가 Tistory Selector와 URL을 알지 않는다.
31.6 WordPress
Site URL과 Username, Application Password로 연결할 수 있다.
Application Password 원문이 SecretStore 밖에 저장되지 않는다.
REST API 연결을 검증할 수 있다.
실제 Category를 조회할 수 있다.
Approved ContentDocument를 WordPress HTML로 렌더링할 수 있다.
Shared Preview를 생성할 수 있다.
WordPress Draft를 생성할 수 있다.
생성된 Draft를 외부 ID로 재조회할 수 있다.
Draft 상태를 검증할 수 있다.
WordPress 관리자 화면에서 Draft를 확인할 수 있다.
Public Publish를 수행하지 않는다.
31.7 Idempotency and Recovery
동일 요청 재시도가 중복 Draft를 만들지 않는다.
외부 성공 후 내부 실패를 복구할 수 있다.
결과 불명확 상태에서 무조건 재생성하지 않는다.
외부 ID와 Verification 결과를 History에 보존한다.
실패 원인이 공통 Error Category로 기록된다.
31.8 Platform Independence
WordPress 기능 추가로 Tistory 구현을 복제하지 않는다.
WordPress REST 로직은 apps/wordpress에 위치한다.
Shared Queue와 Publishing Contract는 플랫폼 독립적이다.
향후 새로운 Adapter가 동일 Contract를 구현할 수 있다.
AI Engine과 Quality Engine을 변경하지 않고 플랫폼을 추가할 수 있다.
31.9 Verification
Unit Test 통과
Integration Test 통과
Queue Test 통과
Tistory Regression Test 통과
WordPress 실제 Draft 검증 통과
Documentation 갱신
git diff --check 통과
기존 기능 보호 확인
32. Out of Scope

Sprint 8에서 다음은 제외한다.

WordPress Public Publish
WordPress Scheduling
기존 WordPress Post 수정
WordPress Post 삭제
WordPress Plugin 설치
WordPress Plugin 설정 변경
WordPress Theme 설치
WordPress Theme 수정
WordPress User 관리
WordPress Media 자동 업로드
Featured Image 자동 설정
Yoast SEO 전용 Metadata
Rank Math 전용 Metadata
Custom Post Type 자동 지원
WooCommerce Product 발행
여러 Queue Item 동시 실행
Cross-workspace Publishing
Cloud Worker
OAuth 구현
Tistory Public Publish
YouTube Upload
Naver Cafe Publishing

Out of Scope 기능은 Interface 확장을 막지 않되 Sprint 8 구현에 포함하지 않는다.

32.1 Integrated Sprint 6 Tistory Scheduling Contract

`Sprint 6 — Presentation Architecture, Bright Components and Tistory Scheduling`은 Tistory 자체 예약 기능을 Platform Adapter의 승인된 외부 실행으로 추가한다. 기존 Sprint 6.5 번호는 별도 개발 단계로 사용하지 않는다. 이 절은 Sprint 8의 WordPress 및 Multi-platform 구현 상태를 변경하지 않는다.

Gate 0은 실제 Tistory Draft Save 후 Draft를 다시 열어 제목, 의미 있는 본문 구조, Category와 비공개 상태를 확인하는 전체 E2E 검증이다. Gate 0 통과 전에는 아래 Runtime을 구현하지 않는다.

공통 계약:

```ts
interface ScheduledPublication {
  id: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  contentRevisionId: string;
  renderArtifactId: string;
  renderChecksum: string;
  platform: "tistory";
  platformConnectionId: string;
  categoryId: string | null;
  categoryName: string | null;
  scheduledLocalDateTime: string;
  timeZone: "Asia/Seoul";
  scheduledAt: string;
  status: "pending" | "executing" | "scheduled" | "failed" | "cancelling" | "cancelled" | "unknown";
  externalScheduleId?: string;
  externalContentId?: string;
}

interface ScheduleJob {
  id: string;
  scheduledPublicationId: string;
  operation: "create" | "update-time" | "cancel" | "verify";
  idempotencyKey: string;
  status: "queued" | "running" | "succeeded" | "failed" | "unknown";
  attempt: number;
  retryable: boolean;
}
```

Adapter/Workflow 경계:

- Core는 예약 Domain, 상태 전이, idempotency, 시간과 Permission 요구사항을 정의한다.
- Apps/Tistory는 예약 UI, DOM, selector, 예약 목록 조회와 Draft 보존 취소 동작을 소유한다.
- AI와 Core는 Playwright를 직접 호출하지 않는다.
- 모든 create, update-time, cancel은 서버 Permission Gate와 Registered Workflow를 통과한다.
- `schedule.publish`와 `public.publish`는 기본 OFF이며 Draft Only는 기본 ON이다.
- Quality Approval, 현재 Revision, 승인된 RenderArtifact/checksum이 실행 직전에 일치해야 한다.
- Revision, Account와 Category는 예약 생성 시 고정하고 이후 변경하지 않는다.
- 예약 시간 수정만 동일 예약에서 허용한다. 고정 대상 변경은 안전한 취소 후 새 예약으로 처리한다.
- 예약 취소는 삭제가 아니다. Tistory에서 Draft 보존이 검증된 경우에만 자동 취소한다.
- 삭제가 필요한 취소 흐름은 별도 Delete Permission 승인 전 실행하지 않는다.
- 성공 Job은 재시도하지 않고 실패 Job만 동일 idempotency 경계에서 재시도한다.
- 예약과 Job 상태는 앱 재시작 후 복원하고 `unknown` 외부 결과는 재실행 전에 조회·조정한다.

통합 Sprint에서 로컬 Scheduler, 반복 예약, 다중 플랫폼 예약, AI 임의 예약 시각 결정과 자동 즉시 공개 발행은 지원하지 않는다. 실제 Tistory 예약 등록·수정·취소와 외부 상태가 검증되기 전에는 이 범위를 `Completed` 또는 `Verified`로 표시하지 않는다.

33. Future Expansion

향후 다음 Capability를 추가할 수 있다.

Media Upload
Featured Image
Scheduling
Public Publish
Existing Content Update
Existing Content Delete
Custom Post Types
Plugin Metadata Extension
SEO Plugin Integration
WordPress Multisite
OAuth
Concurrent Queue
Distributed Worker
Rate Limit Scheduler
Platform Health Monitoring
Platform-specific External Preview
YouTube Upload
Naver Cafe Adapter
Shopping Adapter

위 기능은 기존 Common Contract와 Permission Gate를 유지하면서 확장해야 한다.

34. Final Architecture Rule

Platform Adapter의 목적은 플랫폼별 코드를 한 파일에 모으는 것이 아니다.

목적은 플랫폼 차이를 명확한 계약 뒤에 격리하여 Core, AI Workflow, Quality Engine, Content Model과 Publishing Queue가 모든 플랫폼에서 재사용되도록 만드는 것이다.

모든 구현은 다음 경계를 유지해야 한다.

Canonical Content
→ Shared Publishing Contract
→ Permission Gate
→ Platform Adapter
→ Approved External Execution
→ Verification
→ History

다음 동작은 허용하지 않는다.

AI → External Platform
UI → Playwright
Core → Platform REST Endpoint
Renderer → SecretStore
Adapter → Quality Approval Decision
Workflow → Permission Decision

Sprint 8은 WordPress 기능을 별도로 붙이는 작업이 아니다.

Tistory와 WordPress가 하나의 안전하고 검증 가능한 Publishing Architecture를 공유하도록 만드는 작업이다.


문서 검토 후 승인한다면 상단만 다음처럼 변경하면 됩니다.

```markdown
Status: Approved

Implementation Status: Not Implemented
