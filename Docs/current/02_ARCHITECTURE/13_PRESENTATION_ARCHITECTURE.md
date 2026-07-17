# Presentation Architecture

Version: 1.0

Status: Approved

Sprint: Sprint 6

Document Type: Architecture Specification

Owner: Core Platform

Implementation Status: Not Implemented

---

# 1. Purpose

이 문서는 Bright Studio의 Presentation Architecture를 정의한다.

Presentation Architecture는 Canonical ContentDocument를 플랫폼별로 안전하고 일관된 발행 결과물로 변환하는 계층이다.

Bright Studio는 콘텐츠 원본에 HTML, CSS 또는 특정 플랫폼 표현을 직접 저장하지 않는다.

콘텐츠의 의미와 플랫폼 표현은 다음과 같이 분리한다.

```text
ContentDocument
= 무엇을 전달하는가

PresentationDocument
= 어떤 의미적 구성요소로 표현할 것인가

Theme
= 시각적으로 어떻게 보일 것인가

Platform Renderer
= 대상 플랫폼에 어떤 HTML 또는 Payload로 출력할 것인가

Presentation Architecture의 목적은 다음과 같다.

Canonical Content와 시각적 표현의 분리
Bright Content Components 정의
Component Registry와 Schema 정의
Theme Token과 Theme Profile 정의
플랫폼별 Renderer 계약 정의
지원되지 않는 Component의 의미 보존 Fallback
접근 가능한 Semantic HTML 생성
Preview와 실제 Draft Save 결과의 일관성 보장
Component, Theme, Renderer의 Version Compatibility 관리
Tistory와 WordPress에서 동일한 Content Model 재사용
미래 플랫폼 확장 시 Presentation 로직 복제 방지

Presentation Architecture는 콘텐츠를 생성하거나 외부 플랫폼에 발행하지 않는다.

콘텐츠 생성은 AI Engine이 담당하고, 외부 실행은 Publishing Engine과 Platform Adapter가 담당한다.

2. Scope

Sprint 6의 설계 범위는 다음과 같다.

Presentation Model
Presentation Resolver
Bright Content Component Model
Component Schema
Component Registry
Component Resolution
Component Variant
Component Fallback
Theme System
Theme Token Contract
Theme Profile과 Theme Ownership
Renderer Contract
HTML Contract
Accessibility Contract
Security and Sanitization
Version Compatibility
Presentation Snapshot
Render Artifact Consistency
Shared Preview Consistency
Tistory Renderer Mapping
WordPress Renderer Mapping
GeneratePress와 Bright Theme 책임 경계
Testing Requirements
Architecture Acceptance Criteria

Sprint 6은 시각 디자인을 완성하는 Sprint가 아니다.

Sprint 6의 목적은 시각 디자인이 플랫폼마다 임의로 구현되지 않도록 안정적인 Presentation 계약을 만드는 것이다.

3. Related Documents

이 문서는 다음 문서와 함께 사용한다.

01_PRODUCT/06_PRODUCT_ARCHITECTURE.md
01_PRODUCT/07_PRODUCT_PRINCIPLES.md
01_PRODUCT/08_QUALITY_ENGINE.md
02_ARCHITECTURE/08_PLATFORM_ADAPTER.md
02_ARCHITECTURE/11_PLATFORM_CONNECTIONS.md
02_ARCHITECTURE/12_PLATFORM_AUTOMATION_PERMISSIONS.md
Design System 관련 문서
Content Model 관련 Architecture 문서
Content Processing 관련 Architecture 문서

책임 경계는 다음과 같다.

Product Architecture
→ 제품 수준의 책임과 방향

Presentation Architecture
→ 콘텐츠 표현과 Renderer 계약

Platform Adapter Architecture
→ Preview, Draft Save, Verification, Queue, 외부 실행

Design System
→ 실제 시각 Token과 디자인 규칙

이 문서는 Platform Adapter의 외부 실행 계약을 재정의하지 않는다.

RenderedPlatformContent, Shared Preview, Draft Save, Verification과 Queue의 외부 실행 계약은 08_PLATFORM_ADAPTER.md를 따른다.

4. Architecture Principles
4.1 Canonical Content First

ContentDocument는 콘텐츠의 유일한 Canonical Source다.

PresentationDocument, HTML, CSS와 Platform Payload는 모두 ContentDocument에서 파생되는 결과물이다.

다음은 허용하지 않는다.

HTML을 콘텐츠 원본으로 저장
CSS Class를 콘텐츠 의미로 사용
WordPress HTML을 Tistory 콘텐츠 원본으로 재사용
Preview HTML을 사용자의 편집 원본으로 사용
Theme가 콘텐츠 문장을 변경
Renderer가 ContentDocument를 직접 수정
4.2 Meaning Before Appearance

모든 Presentation 결정은 시각적 모양보다 콘텐츠의 의미를 우선한다.

예:

경고
→ Warning Semantic Role
→ Warning Component
→ Warning Variant
→ Platform HTML

AI 또는 사용자가 특정 색상과 CSS Class를 직접 결정하는 방식이 아니라, 의미적 역할을 먼저 선택한다.

4.3 Deterministic Resolution

동일한 입력과 동일한 Version 조합은 가능한 한 동일한 Presentation 결과를 생성해야 한다.

Content Version
+
Presentation Policy Version
+
Component Registry Version
+
Theme Token Version
+
Renderer Version
=
Stable Render Result

Presentation Resolver는 불필요한 AI 호출 없이 결정론적으로 실행한다.

4.4 Platform Independence

Presentation Model은 다음 정보를 알지 못한다.

Tistory Editor DOM
WordPress REST Endpoint
GeneratePress 내부 Template
플랫폼 로그인 방식
Playwright Selector
Cookie와 Session
외부 플랫폼 API 인증 정보

플랫폼 차이는 Platform Renderer와 Platform Adapter 내부에 격리한다.

4.5 Semantic Fallback

지원하지 않는 Component를 조용히 삭제하지 않는다.

시각적 표현을 완전히 지원하지 못해도 콘텐츠의 의미와 내용은 반드시 보존한다.

Exact Component
→ Supported Variant
→ Default Variant
→ Semantic HTML Fallback
→ Plain Readable Content
4.6 Accessibility by Default

접근성은 선택 기능이 아니다.

모든 Component와 Renderer는 기본적으로 다음을 만족해야 한다.

Semantic HTML
적절한 Heading 구조
이미지 ALT
Table Header
색상 외의 의미 전달
키보드 접근
명확한 Link와 CTA
CSS가 없어도 읽을 수 있는 구조
4.7 No Additional AI Call

Sprint 6으로 인해 주요 AI 호출을 추가하지 않는다.

기본 정책은 다음을 유지한다.

AI Generation: 1 major call
Quality Review: 1 major call

Component 선택, Theme 적용, Fallback과 HTML 생성은 결정론적 로직으로 처리한다.

4.8 Safe Output

AI가 생성한 Raw HTML, CSS 또는 JavaScript를 그대로 발행하지 않는다.

최종 출력은 허용된 Component, Renderer, Sanitizer와 HTML Contract를 통과해야 한다.

5. Terminology
5.1 ContentDocument

플랫폼과 표현 방식에 독립적인 Canonical Content Model이다.

ContentDocument는 다음과 같은 의미적 콘텐츠를 저장한다.

Heading
Paragraph
List
Image
Video
Table
Quote
CTA Intent
Related Content Intent
Notice Intent
Warning Intent
기타 Canonical Block
5.2 PresentationDocument

ContentDocument에서 파생된 플랫폼 대상 표현 계획이다.

PresentationDocument는 어떤 Content Block을 어떤 Bright Component와 Variant로 표현할지 정의한다.

PresentationDocument는 Canonical Source가 아니다.

5.3 Bright Content Component

발행 콘텐츠 본문을 표현하는 재사용 가능한 의미적 Component다.

Bright Studio 프로그램 화면에 사용하는 React UI Component와 구분한다.

Application UI Component
= Bright Studio 프로그램 화면용 Component

Bright Content Component
= Tistory, WordPress 등 발행 콘텐츠 본문용 Component
5.4 Component Definition

Component의 ID, Semantic Role, Props, Variant, 접근성 요구사항과 Fallback을 정의하는 Schema다.

5.5 Component Registry

사용 가능한 Component Definition과 Version을 관리하는 Registry다.

5.6 Theme Token

색상, 타이포그래피, 간격, 테두리와 같은 디자인 값을 의미 기반 이름으로 정의한 값이다.

5.7 Theme Profile

Theme Token 집합과 Platform Mapping을 참조하는 재사용 가능한 Theme 설정이다.

5.8 Platform Renderer

PresentationDocument를 특정 플랫폼의 HTML 또는 Payload로 변환하는 Component다.

5.9 Render Artifact

Renderer가 생성한 불변 출력 결과다.

Shared Preview와 Draft Save는 동일한 Render Artifact를 사용해야 한다.

6. Responsibility Boundaries
6.1 AI Engine Responsibility

AI Engine은 다음을 결정할 수 있다.

콘텐츠 의미
정보 구조
경고 여부
요약 여부
체크리스트 여부
비교 구조 여부
CTA 목적
관련 콘텐츠 필요 여부
이미지와 동영상의 의미적 역할
Component Intent

AI Engine은 다음을 직접 결정하지 않는다.

CSS Class 이름
실제 색상값
Inline Style
Theme Token 값
임의 HTML
JavaScript
Platform DOM
Platform Selector
Component 구현 파일명
GeneratePress Template
WordPress Plugin Field
6.2 Content Engine Responsibility

Content Engine은 다음을 담당한다.

Canonical ContentDocument
Canonical Block
Content Validation
Content Normalization
Content Version
의미적 Component Intent 저장

Content Engine은 플랫폼 HTML을 생성하지 않는다.

6.3 Presentation Engine Responsibility

Presentation Engine은 다음을 담당한다.

Presentation Request 검증
Component Intent 해석
Component Definition 조회
Variant 선택
Theme Profile 해석
Platform Capability 확인
Fallback 결정
PresentationDocument 생성
Presentation Warning 생성
Presentation Snapshot 생성
6.4 Component Registry Responsibility

Component Registry는 다음을 담당한다.

Component ID 등록
Component Schema 조회
Version 조회
Variant Validation
Platform Support 조회
Fallback Chain 조회
Deprecated Component 관리
Migration 가능 여부 제공

Component Registry는 HTML을 직접 생성하지 않는다.

6.5 Theme System Responsibility

Theme System은 다음을 담당한다.

Theme Profile 조회
Token 상속
Token Override
Token Validation
Platform CSS Mapping
Theme Version
Resolved Theme Hash

Theme는 콘텐츠의 의미나 순서를 변경하지 않는다.

6.6 Platform Renderer Responsibility

Platform Renderer는 다음을 담당한다.

PresentationDocument 해석
Platform Component Mapping
Semantic HTML 생성
Class Namespace 적용
Theme Token Mapping
Platform-specific Validation
HTML Sanitization
Render Warning 생성
Render Checksum 생성

Platform Renderer는 다음을 수행하지 않는다.

AI 콘텐츠 재작성
Project DNA 수정
Quality Approval 결정
Permission 확인
외부 플랫폼 호출
Secret 조회
Draft Save 실행
6.7 Platform Adapter Responsibility

Platform Adapter는 Renderer가 생성한 Render Artifact를 받아 다음을 수행한다.

Shared Preview 연결
Permission Gate 이후 외부 실행
Draft Save
Draft Verification
Publishing History
외부 오류 변환

Platform Adapter 상세 계약은 08_PLATFORM_ADAPTER.md를 따른다.

7. Presentation Pipeline

Presentation Pipeline은 다음 순서를 따른다.

ContentDocument
↓
Content Processing Validation
↓
Presentation Resolution Request
↓
Presentation Resolver
├── Component Registry
├── Theme Resolver
├── Platform Presentation Capabilities
└── Fallback Policy
↓
PresentationDocument
↓
Platform Renderer
↓
HTML Contract Validation
↓
Accessibility Validation
↓
Sanitization
↓
RenderedPlatformContent
↓
Render Artifact
├── Shared Preview
└── Draft Save
7.1 Pipeline Rules
ContentDocument Validation 실패 시 Presentation을 생성하지 않는다.
Presentation Resolution 실패 시 Renderer를 실행하지 않는다.
Renderer 실패 시 Preview와 Draft Save를 실행하지 않는다.
HTML Contract Validation 실패 시 발행을 차단한다.
Sanitization 결과가 콘텐츠 의미를 손상시키면 성공으로 처리하지 않는다.
Preview와 Draft Save가 서로 다른 Pipeline을 사용해서는 안 된다.
Pipeline 단계별 Version과 Warning을 추적해야 한다.
8. Presentation Resolution Request
interface PresentationResolutionRequest {
  workspaceId: string;
  projectId: string;
  contentId: string;

  sourceContentVersion: number;
  contentDocument: ContentDocument;

  targetPlatform: PlatformId;

  themeReference?: ThemeReference;

  presentationPolicyVersion: number;
  requestedComponentRegistryVersion?: number;

  options: PresentationResolutionOptions;
}
interface PresentationResolutionOptions {
  unsupportedComponentPolicy:
    | "error"
    | "fallback"
    | "warning";

  preserveSourceOrder: boolean;

  includeTableOfContents: boolean;
  includeRelatedContent: boolean;
  includeImagePlaceholders: boolean;

  accessibilityLevel: "required";
}
8.1 Request Rules
sourceContentVersion과 ContentDocument Version이 일치해야 한다.
Target Platform은 등록된 Platform이어야 한다.
Theme Reference가 없으면 Project, Brand, Workspace와 System 순서로 기본 Theme를 해석한다.
Unsupported Component Policy가 없으면 fallback을 기본값으로 사용한다.
Source Block 순서를 임의로 변경하지 않는다.
Presentation Resolver가 콘텐츠 문장을 새로 생성해서는 안 된다.
9. Presentation Model
9.1 PresentationDocument
interface PresentationDocument {
  id: string;

  schemaVersion: number;

  workspaceId: string;
  projectId: string;

  sourceContentId: string;
  sourceContentVersion: number;

  targetPlatform: PlatformId;

  themeReference: ThemeReference;
  resolvedThemeHash: string;

  nodes: PresentationNode[];

  presentationPolicyVersion: number;
  componentRegistryVersion: number;
  themeTokenVersion: number;
  htmlContractVersion: number;

  warnings: PresentationWarning[];

  createdAt: string;
}
9.2 Presentation Node
type PresentationNode =
  | ComponentPresentationNode
  | SemanticFallbackNode;
interface ComponentPresentationNode {
  id: string;

  nodeType: "component";

  componentId: string;
  componentSchemaVersion: number;

  semanticRole: BrightSemanticRole;
  variant: string;

  sourceBlockIds: string[];

  props: Record<string, unknown>;

  fallbackPolicy: ComponentFallbackPolicy;
}
interface SemanticFallbackNode {
  id: string;

  nodeType: "semantic_fallback";

  semanticRole: BrightSemanticRole;

  sourceBlockIds: string[];

  fallbackElement:
    | "section"
    | "aside"
    | "figure"
    | "blockquote"
    | "table"
    | "ul"
    | "ol"
    | "div";

  reason: string;
}
9.3 Presentation Model Rules
모든 Node는 하나 이상의 Source Block과 연결되어야 한다.
Source Block 없이 Presentation Text를 임의 생성하지 않는다.
하나의 Source Block을 여러 Node가 참조하는 경우 중복 출력 여부를 검증한다.
PresentationDocument는 Platform HTML을 저장하지 않는다.
CSS Class와 Inline Style을 Presentation Props로 저장하지 않는다.
Props는 Component Schema가 허용한 값만 포함한다.
PresentationDocument는 Renderer가 재현 가능한 형태여야 한다.
10. Bright Semantic Roles

초기 Semantic Role은 다음과 같다.

type BrightSemanticRole =
  | "standard_content"
  | "notice"
  | "warning"
  | "summary"
  | "checklist"
  | "comparison"
  | "call_to_action"
  | "related_content"
  | "faq"
  | "data_table"
  | "image_figure"
  | "video_embed"
  | "quote"
  | "key_takeaway";

Semantic Role은 시각적 이름이 아니다.

예:

warning
= 독자에게 주의가 필요한 정보

summary
= 핵심 내용을 압축한 정보

call_to_action
= 명확한 다음 행동을 안내하는 요소

blue_card, rounded_box, large_button과 같은 시각 중심 Role은 허용하지 않는다.

11. Bright Content Component Model
11.1 Component Definition
interface BrightComponentDefinition {
  componentId: string;

  displayName: string;
  description: string;

  schemaVersion: number;

  semanticRole: BrightSemanticRole;

  supportedVariants: BrightComponentVariant[];

  propsSchema: ComponentPropsSchema;

  accessibilityRequirements: string[];

  defaultFallback: ComponentFallbackPolicy;

  deprecated: boolean;
  replacementComponentId?: string;
}
11.2 Component Variant
interface BrightComponentVariant {
  variantId: string;

  displayName: string;

  supportedPlatforms?: PlatformId[];

  requiredCapabilities?: PresentationCapabilityKey[];

  deprecated: boolean;
}
11.3 Component Props Schema
interface ComponentPropsSchema {
  required: string[];
  optional: string[];

  allowedProperties: Record<
    string,
    ComponentPropertyDefinition
  >;

  additionalProperties: false;
}
interface ComponentPropertyDefinition {
  type:
    | "string"
    | "number"
    | "boolean"
    | "string_array"
    | "content_reference"
    | "link_reference"
    | "image_reference"
    | "video_reference";

  required?: boolean;

  minLength?: number;
  maxLength?: number;

  allowedValues?: string[];
}
11.4 Component ID Rules

Component ID는 안정적인 Namespace를 사용한다.

bright.notice
bright.warning
bright.summary-card
bright.checklist
bright.comparison
bright.cta
bright.related-content
bright.faq
bright.table
bright.image-figure
bright.video-embed
bright.quote
bright.key-takeaway

Component ID에 Platform 이름을 포함하지 않는다.

금지:

tistory-warning-card
wordpress-summary-box
generatepress-cta

플랫폼별 구현은 Renderer Mapping에서 처리한다.

12. Initial Bright Component Registry

Sprint 6 초기 Registry는 다음 Component를 포함한다.

Component ID	Semantic Role	주요 목적
bright.notice	notice	참고 또는 안내 정보
bright.warning	warning	주의가 필요한 정보
bright.summary-card	summary	핵심 내용 요약
bright.checklist	checklist	실행 항목 또는 확인 목록
bright.comparison	comparison	대상 간 비교
bright.cta	call_to_action	다음 행동 안내
bright.related-content	related_content	검증된 관련 콘텐츠 안내
bright.faq	faq	질문과 답변 구조
bright.table	data_table	구조화된 데이터
bright.image-figure	image_figure	이미지와 설명
bright.video-embed	video_embed	동영상과 대체 정보
bright.quote	quote	인용 또는 강조 문장
bright.key-takeaway	key_takeaway	핵심 결론
12.1 Initial Scope Rules
초기 Component 수를 불필요하게 늘리지 않는다.
하나의 Component가 단순 색상 차이로 여러 Component로 분리되지 않도록 한다.
시각적 차이는 Variant와 Theme로 처리한다.
새로운 Component는 기존 Semantic Role과 Fallback으로 해결할 수 없는 경우에만 추가한다.
Component 추가 시 Schema, Accessibility, Fallback, Renderer Mapping과 Test가 모두 필요하다.
13. Component Registry
13.1 Registry Contract
interface BrightComponentRegistry {
  getRegistryVersion(): number;

  register(
    definition: BrightComponentDefinition
  ): void;

  get(
    componentId: string,
    schemaVersion?: number
  ): BrightComponentDefinition;

  has(
    componentId: string,
    schemaVersion?: number
  ): boolean;

  list(): BrightComponentDefinition[];

  resolveCompatibleVersion(
    componentId: string,
    requestedVersion: number
  ): ComponentCompatibilityResult;

  getFallbackChain(
    componentId: string,
    platform: PlatformId
  ): ComponentFallbackCandidate[];
}
13.2 Registry Rules
동일 Component ID와 Schema Version의 중복 등록을 허용하지 않는다.
등록되지 않은 Component를 임의 출력하지 않는다.
Deprecated Component 사용 시 Warning을 생성한다.
Replacement가 있는 경우 명시적 Migration 또는 Fallback을 제공한다.
Registry는 Theme 값을 저장하지 않는다.
Registry는 Platform HTML을 저장하지 않는다.
Registry Version이 변경되면 Render Artifact에 기록한다.
14. Component Resolution

Component Resolution은 다음 순서로 수행한다.

Semantic Content Intent
↓
Requested Component Intent
↓
Component Registry Lookup
↓
Schema Validation
↓
Platform Capability Check
↓
Variant Resolution
↓
Fallback Resolution
↓
Presentation Node
14.1 Resolution Priority
Explicit Valid Component Intent
→ Project Presentation Policy
→ Semantic Role Default Component
→ Platform-supported Variant
→ Default Variant
→ Semantic Fallback
14.2 Resolution Rules
명시적 Intent가 Schema를 위반하면 그대로 사용하지 않는다.
AI가 존재하지 않는 Component ID를 지정해도 Registry가 거부한다.
Theme는 Component 선택을 변경하지 않는다.
Platform Capability가 없는 Variant를 사용하지 않는다.
Fallback이 존재하는 경우 의미를 보존한다.
Fallback도 불가능하면 발행을 차단한다.
Component Resolution 결과는 이유와 Warning을 기록한다.
14.3 Resolution Result
interface ComponentResolutionResult {
  componentId: string;
  componentSchemaVersion: number;

  selectedVariant: string;

  resolutionSource:
    | "explicit_intent"
    | "project_policy"
    | "semantic_default"
    | "fallback";

  fallbackApplied: boolean;

  warnings: PresentationWarning[];
}
15. Component Fallback
15.1 Fallback Policy
type ComponentFallbackPolicy =
  | {
      mode: "component";
      fallbackComponentId: string;
    }
  | {
      mode: "semantic_html";
      fallbackElement: string;
    }
  | {
      mode: "plain_content";
    }
  | {
      mode: "error";
    };
15.2 Required Fallback Order
Exact Component and Variant
→ Same Component Default Variant
→ Compatible Component
→ Semantic HTML
→ Plain Readable Content
→ Blocking Error
15.3 Fallback Examples
Warning
<aside data-bright-role="warning">
  <strong>주의</strong>
  <p>경고 내용</p>
</aside>
Summary
<section data-bright-role="summary">
  <h2>핵심 요약</h2>
  <ul>
    <li>요약 내용</li>
  </ul>
</section>
Checklist
<section data-bright-role="checklist">
  <h2>체크리스트</h2>
  <ul>
    <li>확인 항목</li>
  </ul>
</section>
15.4 Forbidden Fallback Behavior

다음은 허용하지 않는다.

Component 전체 삭제
본문 Text 누락
Warning을 일반 장식 Box로 변경
Link Reference를 임의 URL로 변경
Image ALT 제거
Table을 읽을 수 없는 Text로 변환
Video 대체 설명 없이 Embed 제거
Fallback 적용 사실을 숨김
16. Presentation Capability Model

Platform Adapter의 실행 Capability와 Presentation Capability는 구분한다.

Execution Capability
= Draft Save, Verification, Category Read

Presentation Capability
= Component, Variant, HTML Feature 지원
16.1 Presentation Capability
type PresentationCapabilityKey =
  | "semantic_html"
  | "component_classes"
  | "external_stylesheet"
  | "safe_inline_style"
  | "table"
  | "responsive_table"
  | "image_figure"
  | "video_embed"
  | "details_summary"
  | "custom_data_attributes"
  | "theme_tokens";
interface PlatformPresentationCapabilities {
  platform: PlatformId;

  rendererVersion: number;

  capabilities: Record<
    PresentationCapabilityKey,
    boolean
  >;

  supportedComponents: PlatformComponentSupport[];
}
interface PlatformComponentSupport {
  componentId: string;

  supported: boolean;

  supportedVariants: string[];

  fallbackAvailable: boolean;

  reason?: string;
}
16.2 Capability Rules
Renderer는 Capability에 없는 기능을 지원한다고 가정하지 않는다.
Platform Capability 차이로 콘텐츠 의미가 달라져서는 안 된다.
CSS 지원 여부와 Semantic HTML 지원 여부를 구분한다.
Theme가 적용되지 않아도 콘텐츠가 읽혀야 한다.
Capability 변경은 Renderer Version 또는 Capability Version으로 추적한다.
17. Theme System

Theme System은 Bright Content Component의 시각 표현을 제어한다.

Theme는 콘텐츠 의미, 문장, 순서와 Link Target을 변경하지 않는다.

17.1 Theme Reference
interface ThemeReference {
  themeProfileId: string;
  themeProfileVersion: number;
}
17.2 Theme Profile
interface ThemeProfile {
  id: string;

  name: string;

  ownerType:
    | "system"
    | "workspace";

  ownerId?: string;

  version: number;

  baseThemeProfileId?: string;

  tokenOverrides: Partial<ThemeTokenSet>;

  supportedPlatforms?: PlatformId[];

  createdAt: string;
  updatedAt: string;
}

Brand와 Project는 Theme Profile을 직접 소유하기보다 Workspace가 소유한 Theme Profile을 참조한다.

Workspace
└── Theme Profiles

Brand
└── Default Theme Profile Reference

Project
└── Selected Theme Profile Reference
17.3 Theme Resolution Priority
Project Selected Theme
→ Brand Default Theme
→ Workspace Default Theme
→ System Bright Default Theme

사용자가 Project에서 명시적으로 Theme를 선택했다면 Brand 기본값보다 우선한다.

17.4 Theme Rules
ContentDocument에 전체 Token 값을 복사하지 않는다.
PresentationDocument는 Theme Reference와 Resolved Theme Hash를 저장한다.
System Default Theme는 삭제할 수 없다.
Workspace Theme는 다른 Workspace에서 조회할 수 없다.
Theme 변경은 기존 ContentDocument를 변경하지 않는다.
Theme 변경 후 Preview 승인은 무효화된다.
Theme Profile 삭제 시 사용 중인 Project 영향을 먼저 계산한다.
18. Theme Token Contract

Theme Token은 의미 기반 이름을 사용한다.

실제 CSS Property 이름이나 특정 Component 이름에 종속되지 않는다.

18.1 Token Set
interface ThemeTokenSet {
  color: {
    textPrimary: string;
    textSecondary: string;
    textMuted: string;

    surfaceDefault: string;
    surfaceSubtle: string;
    surfaceElevated: string;

    accentPrimary: string;
    accentSecondary: string;

    borderSubtle: string;
    borderStrong: string;

    stateInfo: string;
    stateWarning: string;
    stateDanger: string;
    stateSuccess: string;

    linkDefault: string;
    linkVisited?: string;
  };

  typography: {
    bodyFontFamily: string;
    headingFontFamily: string;

    bodyFontSize: string;
    bodyLineHeight: string;

    heading2FontSize: string;
    heading2LineHeight: string;
    heading2Weight: number;

    heading3FontSize: string;
    heading3LineHeight: string;
    heading3Weight: number;

    captionFontSize: string;
    captionLineHeight: string;
  };

  spacing: {
    inlineSmall: string;
    inlineMedium: string;

    blockSmall: string;
    blockMedium: string;
    blockLarge: string;

    componentPadding: string;
    sectionGap: string;
  };

  radius: {
    small: string;
    medium: string;
    card: string;
  };

  border: {
    subtleWidth: string;
    strongWidth: string;
  };

  shadow: {
    card: string;
    elevated: string;
  };

  content: {
    maxWidth: string;
    paragraphMaxWidth?: string;
  };
}
18.2 Token Rules
Token 값은 Theme Validator를 통과해야 한다.
Script 또는 CSS Injection이 가능한 값을 허용하지 않는다.
Component별 고정 색상값을 Component Schema에 저장하지 않는다.
Warning, Success와 같은 상태 Token은 색상 외 표현과 함께 사용한다.
Pixel 값만 강제하지 않고 안전한 CSS 단위를 허용할 수 있다.
Platform Renderer는 지원하지 않는 Token을 안전한 기본값으로 대체할 수 있다.
Token Fallback은 Warning으로 기록한다.
Theme Token Version을 Render Artifact에 기록한다.
18.3 Token Validation

다음은 거부한다.

url(...)
expression(...)
javascript:
<script>
CSS Custom Property 탈출 문자열
Inline Event Handler
지원하지 않는 CSS Function
지나치게 큰 Layout 값
접근성을 심각하게 훼손하는 값

색상 대비가 기준에 미달할 경우 Theme Validation Error 또는 Warning을 생성한다.

19. Renderer Contract
19.1 Renderer Identity
interface PresentationRendererIdentity {
  platform: PlatformId;

  rendererVersion: number;

  presentationSchemaVersions: number[];
  htmlContractVersions: number[];

  componentRegistryVersions: number[];
}
19.2 Render Request
interface PresentationRenderRequest {
  presentationDocument: PresentationDocument;

  resolvedTheme: ResolvedTheme;

  capabilities: PlatformPresentationCapabilities;

  rendererIdentity: PresentationRendererIdentity;
}
19.3 Resolved Theme
interface ResolvedTheme {
  themeProfileId: string;
  themeProfileVersion: number;

  themeTokenVersion: number;

  tokens: ThemeTokenSet;

  resolvedThemeHash: string;

  warnings: PresentationWarning[];
}
19.4 Render Result

Presentation Renderer는 08_PLATFORM_ADAPTER.md에서 정의한 RenderedPlatformContent 형식으로 결과를 반환한다.

Renderer 내부 결과는 최소 다음 정보를 제공해야 한다.

interface PresentationRenderMetadata {
  sourceContentVersion: number;

  presentationSchemaVersion: number;
  presentationPolicyVersion: number;

  componentRegistryVersion: number;
  themeTokenVersion: number;
  htmlContractVersion: number;
  rendererVersion: number;

  resolvedThemeHash: string;

  presentationChecksum: string;
  renderChecksum: string;
}
19.5 Renderer Rules
PresentationDocument를 직접 수정하지 않는다.
동일 입력에 대해 가능한 한 동일 HTML을 생성한다.
Platform Renderer가 AI를 호출하지 않는다.
Source Block과 출력 Element의 추적 정보를 보존할 수 있어야 한다.
Renderer가 지원하지 않는 Node를 조용히 무시하지 않는다.
HTML Sanitization 이후 최종 Checksum을 계산한다.
Preview와 Draft Save는 Sanitization 완료 후 동일 결과를 사용한다.
Renderer Error는 Platform Common Error로 변환될 수 있어야 한다.
20. HTML Contract
20.1 General Rules
Semantic HTML을 우선한다.
발행 본문에는 불필요한 Wrapper를 만들지 않는다.
CSS가 없어도 콘텐츠를 읽을 수 있어야 한다.
Body Renderer는 기본적으로 H2부터 시작한다.
플랫폼의 Post Title이 H1 역할을 담당한다.
Heading Level을 건너뛰지 않는다.
빈 Heading을 생성하지 않는다.
빈 Paragraph를 Layout 용도로 사용하지 않는다.
Component Class는 Bright Namespace를 사용한다.
Component Root에 식별 가능한 Data Attribute를 추가한다.
20.2 Component Root
<section
  class="bright-component bright-summary-card"
  data-bright-component="bright.summary-card"
  data-bright-version="1"
  data-bright-role="summary"
>
  ...
</section>

플랫폼이 Custom Data Attribute를 제거하는 경우 Class와 Semantic Element만으로도 읽을 수 있어야 한다.

20.3 Class Namespace

허용 Namespace:

bright-component
bright-component__*
bright-component--*
bright-content-*
bright-theme-*

다음은 피한다.

card
box
button
warning
content
section

일반적인 Class 이름으로 외부 Theme와 충돌하지 않도록 한다.

20.4 Headings
Platform Post Title은 H1로 취급한다.
본문 주요 Section은 H2를 사용한다.
H2 내부 하위 항목은 H3를 사용한다.
Component 내부 제목은 전체 Heading 구조를 깨뜨리지 않아야 한다.
장식용 Text에 Heading Element를 사용하지 않는다.
Related Content나 CTA 제목도 문서 Heading 흐름을 고려한다.
20.5 Paragraph and List
일반 본문은 p를 사용한다.
순서가 없는 목록은 ul을 사용한다.
순서가 중요한 경우 ol을 사용한다.
목록을 Paragraph와 <br> 조합으로 흉내 내지 않는다.
과도한 p 분할을 피한다.
Layout 목적의 빈 li를 생성하지 않는다.
20.6 Links

내부 링크 기본 정책:

<a href="verified-internal-url" target="_self">
  링크 문구
</a>

외부 링크 기본 정책:

<a
  href="verified-external-url"
  target="_blank"
  rel="noopener noreferrer"
>
  링크 문구
</a>

규칙:

AI가 URL 문자열을 임의 생성하지 않는다.
검증된 Link Reference를 사용한다.
javascript:, data:와 지원하지 않는 Scheme을 거부한다.
Link Text는 목적을 이해할 수 있어야 한다.
동일 URL의 과도한 반복을 방지한다.
CTA가 URL 이동을 수행하면 button이 아니라 a를 사용한다.
실제 Application Action에만 button을 사용한다.
20.7 Images

Image Figure 기본 구조:

<figure class="bright-component bright-image-figure">
  <img
    src="verified-image-reference"
    alt="이미지 설명"
  >
  <figcaption>필요한 경우 이미지 설명</figcaption>
</figure>

규칙:

정보성 이미지에는 의미 있는 ALT가 필요하다.
장식 이미지는 빈 ALT를 명시할 수 있다.
파일명이 ALT로 자동 사용되어서는 안 된다.
이미지 크기만으로 의미를 전달하지 않는다.
외부 URL은 검증된 Media Reference를 사용한다.
플랫폼이 이미지를 지원하지 않으면 ALT와 설명을 보존한다.
20.8 Tables

Table은 다음을 포함해야 한다.

table
필요한 경우 caption
Header Cell th
적절한 scope
읽을 수 있는 행과 열 구조

Layout 목적으로 Table을 사용하지 않는다.

너무 넓은 Table은 Platform Capability에 따라 Responsive Wrapper 또는 Semantic Fallback을 사용한다.

20.9 Video

Video Embed는 다음을 제공해야 한다.

검증된 Embed Reference
영상 제목 또는 설명
Embed 실패 시 사용할 Link 또는 대체 설명
플랫폼에서 허용된 Provider

임의 iframe HTML을 AI 출력에서 직접 사용하지 않는다.

Renderer가 Allowlist 기반 Embed를 생성한다.

20.10 Script and Event Handler

다음은 금지한다.

<script>
<style>의 임의 삽입
onclick
onload
onerror
기타 Inline Event Handler
javascript: URL
임의 iframe
임의 Form
추적 Pixel
사용자 입력 Raw HTML
20.11 Inline Style

기본 정책은 Inline Style 금지다.

플랫폼에서 외부 CSS와 Class를 지원하지 않아 의미 보존에 필요한 경우에만 Renderer가 허용된 최소 Inline Style을 생성할 수 있다.

AI와 사용자 Content Input은 Inline Style을 직접 제공할 수 없다.

허용 Inline Style은 별도 Allowlist를 사용한다.

21. Accessibility Contract
21.1 General Requirements
Semantic Element를 우선한다.
색상만으로 상태를 전달하지 않는다.
Text Contrast를 검증한다.
키보드로 Link와 Interactive Element에 접근할 수 있어야 한다.
Focus를 제거하는 Style을 사용하지 않는다.
Native HTML로 해결할 수 있는 경우 ARIA를 추가하지 않는다.
의미 없는 ARIA Role을 사용하지 않는다.
21.2 Warning and Notice

Warning Component는 다음 중 하나 이상을 포함한다.

명확한 제목
상태 Text
Icon의 대체 Text 또는 장식 처리
Semantic aside

색상만 바꾸고 Warning 의미를 전달해서는 안 된다.

21.3 CTA

CTA는 다음을 만족해야 한다.

목적이 명확한 Link Text
Link와 배경의 충분한 대비
URL 존재 여부 검증
Link Target Policy 적용
빈 Link 금지
동일 페이지에 과도한 CTA 반복 금지
21.4 FAQ

FAQ는 질문과 답변의 관계가 문서 구조로 표현되어야 한다.

초기 구현에서는 JavaScript Accordion을 필수로 하지 않는다.

플랫폼이 지원하면 details와 summary를 사용할 수 있지만, 지원하지 않는 경우 제목과 본문 구조로 Fallback한다.

21.5 Comparison

Comparison은 색상만으로 우열을 표현하지 않는다.

Label, Heading, Text 또는 Symbol을 함께 제공한다.

21.6 Validation Result
interface AccessibilityValidationResult {
  valid: boolean;

  errors: AccessibilityIssue[];
  warnings: AccessibilityIssue[];
}

접근성 필수 Error가 존재하면 발행을 차단한다.

22. Security and Sanitization
22.1 Input Trust Boundary

다음 입력은 신뢰하지 않는다.

AI가 생성한 Text
사용자 입력 Link
사용자 입력 Embed URL
외부 콘텐츠 Metadata
Platform에서 반환한 HTML
Imported Content
Legacy HTML
22.2 Sanitization Pipeline
Presentation Render
↓
Allowed Element Validation
↓
Allowed Attribute Validation
↓
URL Scheme Validation
↓
Embed Provider Validation
↓
Class Namespace Validation
↓
Inline Style Allowlist Validation
↓
Sanitization
↓
Post-sanitization Semantic Validation
↓
Final Render Checksum
22.3 Allowed HTML

초기 Allowlist는 다음과 같은 Semantic Element를 중심으로 구성한다.

article
section
aside
header
footer
nav
h2
h3
h4
p
strong
em
small
mark
ul
ol
li
blockquote
figure
figcaption
img
a
table
caption
thead
tbody
tfoot
tr
th
td
details
summary
div
span
br

플랫폼별 제약에 따라 일부 Element는 제외할 수 있다.

22.4 Attribute Rules

허용 가능 Attribute 예:

class
id
href
target
rel
src
alt
title
width
height
loading
scope
colspan
rowspan
data-bright-component
data-bright-version
data-bright-role

모든 data-*를 무제한 허용하지 않는다.

22.5 Sanitization Rules
Sanitizer가 콘텐츠 Text를 불필요하게 제거하지 않아야 한다.
Sanitization 전후 의미 손실을 검증한다.
필수 Content가 제거되면 성공으로 처리하지 않는다.
Sanitizer 결과는 Renderer Version과 함께 Test한다.
Platform별 추가 Sanitization이 있어도 Common HTML Contract를 위반하지 않아야 한다.
23. Version Compatibility

다음 Version을 각각 구분한다.

Content Schema Version
Presentation Schema Version
Presentation Policy Version
Component Schema Version
Component Registry Version
Theme Profile Version
Theme Token Version
HTML Contract Version
Platform Renderer Version
Platform Adapter Version
23.1 Compatibility Status
type PresentationCompatibilityStatus =
  | "supported"
  | "migratable"
  | "fallback_available"
  | "incompatible";
23.2 Compatibility Result
interface PresentationCompatibilityResult {
  status: PresentationCompatibilityStatus;

  sourceVersion: number;
  targetVersion: number;

  migrationId?: string;
  fallbackComponentId?: string;

  warnings: PresentationWarning[];
}
23.3 Compatibility Rules
Supported

현재 Version으로 그대로 처리할 수 있다.

Migratable

명시적 Migration을 실행한 후 처리할 수 있다.

Migration은 Source Snapshot을 변경하지 않고 새 Version 결과를 생성한다.

Fallback Available

원래 Component 표현은 불가능하지만 의미를 보존하는 Fallback이 존재한다.

Incompatible

의미 보존이 불가능하거나 안전한 출력이 불가능하다.

이 경우 Preview와 Draft Save를 차단한다.

23.4 Version Rules
Version 불일치를 Warning만 남기고 임의 처리하지 않는다.
Renderer가 지원하는 Presentation Schema Version을 명시한다.
Migration은 Test 가능한 순수 변환으로 구현한다.
Deprecated Component는 즉시 삭제하지 않는다.
Render Artifact에 사용된 모든 주요 Version을 기록한다.
Version 변경으로 Render Checksum이 달라지면 Preview 승인을 무효화한다.
24. Persistence and Snapshots
24.1 Canonical Persistence

ContentDocument만 Canonical Content Source로 저장한다.

PresentationDocument와 Render Artifact는 다음 목적을 위한 파생 Snapshot으로 저장할 수 있다.

Preview 재현
Draft Save 재사용
Audit
오류 분석
Version 비교
Verification
24.2 Presentation Snapshot
interface PresentationSnapshot {
  id: string;

  workspaceId: string;
  projectId: string;

  contentId: string;
  contentVersion: number;

  targetPlatform: PlatformId;

  presentationDocument: PresentationDocument;

  presentationChecksum: string;

  createdAt: string;
}
24.3 Render Artifact
interface RenderArtifact {
  id: string;

  workspaceId: string;
  projectId: string;

  contentId: string;
  contentVersion: number;

  targetPlatform: PlatformId;

  renderedContent: RenderedPlatformContent;

  metadata: PresentationRenderMetadata;

  renderChecksum: string;

  status:
    | "generated"
    | "previewed"
    | "approved"
    | "invalidated"
    | "used_for_draft";

  createdAt: string;
  invalidatedAt?: string;
}
24.4 Persistence Rules
HTML을 ContentDocument 원본으로 역저장하지 않는다.
Render Artifact는 불변으로 취급한다.
변경이 필요한 경우 새 Artifact를 생성한다.
Secret과 Credential을 Snapshot에 저장하지 않는다.
Theme 전체 설정 대신 사용된 Version과 Hash를 기록할 수 있다.
Snapshot 보존 정책은 History와 Audit 정책을 따른다.
Archive된 Content의 Snapshot은 기본 추천이나 생성 Context에 포함하지 않는다.
25. Preview Consistency

Preview와 Draft Save는 동일한 Render Artifact를 사용해야 한다.

ContentDocument
↓
Presentation Resolution
↓
Platform Render
↓
Sanitization
↓
Render Artifact
├── Shared Preview
└── Draft Save
25.1 Preview Approval
interface PreviewApproval {
  id: string;

  renderArtifactId: string;
  renderChecksum: string;

  contentVersion: number;

  presentationSchemaVersion: number;
  componentRegistryVersion: number;
  themeTokenVersion: number;
  htmlContractVersion: number;
  rendererVersion: number;

  approvedAt: string;
  approvedBy: string;
}
25.2 Invalidation Conditions

다음 중 하나라도 변경되면 기존 Preview Approval을 무효화한다.

Content Version
Presentation Schema Version
Presentation Policy Version
Component Schema Version
Component Registry Version
Theme Profile Version
Theme Token Version
Resolved Theme Hash
HTML Contract Version
Renderer Version
Sanitizer Version
Target Platform
Category 또는 Platform Metadata가 Render 결과에 영향을 주는 경우 해당 Metadata
25.3 Draft Save Rule

Draft Save 요청의 Render Checksum은 승인된 Preview Checksum과 일치해야 한다.

일치하지 않는 경우:

Draft Save Block
→ Re-render
→ New Preview
→ User Review
→ New Approval

Preview와 실제 Draft HTML이 다른 Pipeline에서 생성되어서는 안 된다.

26. Tistory Presentation Mapping

Tistory Presentation은 기존 Tistory HTML Renderer와 안전하게 통합한다.

PresentationDocument
→ Tistory Presentation Renderer
→ Tistory-compatible Semantic HTML
→ Sanitization
→ Render Artifact
→ Tistory Platform Adapter
26.1 Tistory Responsibilities
TistoryPresentationRenderer
├── TistoryComponentMapper
├── TistoryThemeMapper
├── TistoryHtmlSerializer
├── TistorySanitizer
└── TistoryPresentationValidator
26.2 Tistory Rules
Tistory Selector를 PresentationDocument에 포함하지 않는다.
Playwright Page를 Presentation Engine에 전달하지 않는다.
기존 Tistory HTML Renderer를 한 번에 제거하거나 재작성하지 않는다.
기존 Block Rendering과 Bright Component Rendering을 단계적으로 연결한다.
Tistory에서 Custom CSS가 적용되지 않아도 읽을 수 있는 HTML을 생성한다.
Tistory Skin에 강하게 종속된 Class를 Canonical Component ID로 사용하지 않는다.
필요한 경우 Tistory-safe Inline Fallback을 제한적으로 사용할 수 있다.
Tistory Editor가 HTML을 정규화하는 경우 Verification 시 의미적 일치 여부를 확인한다.
Public Publish 기능은 Sprint 6 범위가 아니다.
26.3 Tistory Initial Component Support

초기 지원 권장 범위:

Notice
Warning
Summary Card
Checklist
CTA
Related Content
Table
Image Figure
Video Embed
Quote
Key Takeaway

Comparison과 FAQ의 고급 Interaction은 Semantic HTML Fallback을 우선한다.

27. WordPress Presentation Mapping

WordPress Presentation은 WordPress Core REST API를 사용하는 Platform Adapter에 Render Artifact를 제공한다.

PresentationDocument
→ WordPress Presentation Renderer
→ Semantic Bright Component HTML
→ Sanitization
→ Render Artifact
→ WordPress Platform Adapter
→ Draft Save
27.1 Responsibility Boundary
GeneratePress
= Site Shell
  Header
  Footer
  Navigation
  Global Layout
  Page Container

Bright Theme
= Child Theme / Content Design System
  Bright Component CSS
  Theme Token CSS
  Content Typography
  Content Body Visual Identity

Bright Studio Renderer
= Semantic Bright Component HTML
  Stable Classes
  Data Attributes
  Accessible Fallback
27.2 GeneratePress Rules
GeneratePress 원본 Theme를 직접 수정하지 않는다.
GeneratePress Core File을 덮어쓰지 않는다.
Bright Theme 또는 Child Theme, Hook과 CSS를 사용한다.
Bright Component HTML을 GeneratePress 전용 구조에 종속시키지 않는다.
GeneratePress가 없어도 의미적으로 읽을 수 있는 HTML을 생성한다.
Header, Footer와 Navigation은 Bright Content Component의 책임이 아니다.
27.3 Bright Theme Rules

Bright Theme는 다음을 담당한다.

Theme Token을 CSS Variable 또는 안전한 CSS로 변환
Bright Component Style
본문 Typography
Component 간 기본 간격
Responsive Presentation
Brand Skin

Bright Theme는 다음을 수행하지 않는다.

콘텐츠 문장 수정
Heading 순서 변경
내부 링크 대상 변경
CTA 목적 변경
Canonical Content 변경
WordPress Plugin 설치
GeneratePress 원본 수정
27.4 WordPress Initial Component Support

초기 지원 권장 범위:

Notice
Warning
Summary Card
Checklist
Comparison
CTA
Related Content
FAQ
Table
Image Figure
Video Embed
Quote
Key Takeaway

WordPress Theme가 설치되지 않은 상태에서도 Semantic HTML Fallback으로 읽을 수 있어야 한다.

28. Presentation Warning and Error
28.1 Warning
interface PresentationWarning {
  code: string;
  message: string;

  severity:
    | "info"
    | "warning";

  sourceBlockId?: string;
  componentId?: string;

  recoverable: boolean;
}
28.2 Error Category
type PresentationErrorCategory =
  | "validation"
  | "unsupported_component"
  | "unsupported_variant"
  | "schema_version"
  | "registry_version"
  | "theme"
  | "theme_token"
  | "capability"
  | "fallback"
  | "accessibility"
  | "html_contract"
  | "sanitization"
  | "rendering"
  | "checksum"
  | "unknown";
28.3 Presentation Error
interface PresentationError {
  category: PresentationErrorCategory;

  code: string;
  message: string;

  retryable: boolean;
  requiresUserAction: boolean;

  sourceBlockId?: string;
  componentId?: string;

  safeDetails?: Record<string, unknown>;
}
28.4 Error Rules
Error에 사용자 콘텐츠 전체를 불필요하게 포함하지 않는다.
Secret이나 Platform Credential을 포함하지 않는다.
Fallback 가능한 오류와 발행 차단 오류를 구분한다.
접근성 필수 Error를 Warning으로 낮추지 않는다.
Sanitization으로 필수 콘텐츠가 제거된 경우 성공 처리하지 않는다.
알 수 없는 Component를 조용히 일반 div로 출력하지 않는다.
29. Implementation Sequence

Sprint 6 구현은 Sprint 7과 Sprint 8 설계를 기반으로 다음 순서로 진행한다.

Phase 1. Foundation
Presentation Terminology 확정
Presentation Schema 정의
Semantic Role 정의
Presentation Warning과 Error 정의
Version 체계 정의
Phase 2. Component Foundation
Initial Bright Component Definition
Component Props Schema
Component Registry
Variant Validation
Fallback Chain
Registry Contract Test
Phase 3. Theme Foundation
Theme Profile
Theme Reference
Theme Token Set
Theme Resolution
Theme Validation
Theme Hash
System Default Bright Theme
Phase 4. Presentation Resolver
Content Intent Mapping
Component Resolution
Platform Capability Check
Variant Resolution
Fallback Resolution
PresentationDocument 생성
Deterministic Test
Phase 5. HTML Contract
Semantic HTML Rule
Link Policy
Image Policy
Table Policy
Embed Policy
Class Namespace
Data Attribute
Allowlist
Sanitization
Accessibility Validation
Phase 6. Renderer Contract
Common Renderer Identity
Tistory Renderer Contract
WordPress Renderer Contract
Render Metadata
Checksum
Version Compatibility
Phase 7. Preview Consistency
Presentation Snapshot
Render Artifact
Preview Approval
Invalidation Rule
Sprint 8 Shared Preview 연결
Draft Save Checksum Gate
Phase 8. Tistory Integration
기존 Tistory Renderer 분석
기존 HTML 출력 보호
Bright Component Mapping
Semantic Fallback
Regression Test
실제 Tistory Draft 확인
Phase 9. WordPress Integration
WordPress Renderer
Bright Component HTML
GeneratePress Responsibility 확인
Bright Theme CSS Contract
Shared Preview
실제 WordPress Draft 확인
Phase 10. Documentation and Verification
Design System Token 연결
Component Catalog 문서화
Test 결과 기록
Development Status 갱신
Sprint 6 완료 판정
30. Testing Requirements
30.1 Presentation Schema Tests
유효한 PresentationDocument
Source Block 누락
잘못된 Content Version
잘못된 Component ID
허용되지 않는 Props
잘못된 Variant
추가 Property 거부
잘못된 Theme Reference
30.2 Component Registry Tests
Component 등록
중복 등록 거부
Version 조회
Deprecated Component
Replacement 조회
Platform 지원 확인
Fallback Chain
Registry Version 변경
30.3 Resolution Tests
Explicit Intent
Project Default
Semantic Default
Variant Fallback
Component Fallback
Semantic HTML Fallback
Incompatible Component 차단
동일 입력의 안정적 결과
30.4 Theme Tests
System Default Theme
Workspace Theme
Brand Default Reference
Project Theme Override
Token 상속
잘못된 Token
Injection 문자열
Contrast Warning
Resolved Theme Hash
Theme 변경 시 Preview 무효화
30.5 HTML Contract Tests
Heading 순서
내부 링크 _self
외부 링크 _blank
noopener noreferrer
URL Scheme 차단
ALT 필수
Table Header
Script 제거
Event Handler 제거
임의 Iframe 거부
Class Namespace
Data Attribute
CSS 없이 읽을 수 있는 구조
30.6 Accessibility Tests
색상 외 Warning 표시
CTA Link Text
Keyboard 접근
Image ALT
Table Scope
FAQ Fallback
Comparison Label
Native HTML 우선
Blocking Accessibility Error
30.7 Renderer Tests
Tistory Render
WordPress Render
동일 입력 Checksum
Renderer Version 변경
Unsupported Component
Sanitization 후 의미 보존
Preview와 Draft Artifact 동일성
Platform Capability 차이
30.8 Snapshot Tests
Presentation Snapshot 저장
Render Artifact 불변성
Preview Approval
Content 수정 후 무효화
Theme 수정 후 무효화
Registry 수정 후 무효화
Renderer 수정 후 무효화
승인되지 않은 Checksum의 Draft Save 차단
30.9 Regression Tests
Sprint 1~5 기존 Tistory 출력 보호
Sprint 7 Content Intelligence Link Reference 보호
Sprint 8 Platform Adapter Contract 보호
Quality Gate 우회 불가
Permission Gate 우회 불가
Draft Only 기본 정책 유지
30.10 Manual Verification

실제 플랫폼에서 다음을 확인한다.

Tistory
Preview
Heading
Notice
Warning
Summary Card
Checklist
CTA
내부 링크
Table
Image ALT
Video Embed
Draft Save
실제 Editor에서 내용 유지
WordPress
Shared Preview
Bright Component HTML
GeneratePress 환경 표시
Bright Theme 적용 전 가독성
Bright Theme 적용 후 표현
Draft Save
WordPress 관리자 화면에서 실제 Draft 확인
Public Publish 미실행
31. Acceptance Criteria

Sprint 6 상세 설계와 구현은 다음 조건을 만족해야 한다.

31.1 Canonical Content
ContentDocument가 Canonical Source로 유지된다.
PresentationDocument가 ContentDocument를 대체하지 않는다.
HTML이 콘텐츠 원본으로 저장되지 않는다.
Theme 변경이 ContentDocument를 수정하지 않는다.
Renderer가 ContentDocument를 직접 변경하지 않는다.
31.2 Presentation Model
PresentationDocument Schema가 정의된다.
모든 Presentation Node가 Source Block과 연결된다.
Semantic Role과 Component ID가 구분된다.
Platform HTML이 PresentationDocument에 저장되지 않는다.
Props가 Component Schema로 검증된다.
동일 입력에서 안정적인 결과를 생성한다.
31.3 Bright Components
Initial Bright Component Registry가 정의된다.
Component ID가 플랫폼에 종속되지 않는다.
Variant가 Schema로 검증된다.
Unsupported Component에 Fallback이 적용된다.
Component 내용이 조용히 삭제되지 않는다.
UI Component와 Content Component가 구분된다.
31.4 AI Boundary
AI가 Raw HTML을 최종 출력으로 제공하지 않는다.
AI가 CSS Class나 Theme Token을 선택하지 않는다.
AI가 존재하지 않는 Component를 강제로 사용할 수 없다.
Component Resolution에 추가 주요 AI 호출이 필요하지 않다.
기존 1회 Generation과 1회 Quality Review 정책을 유지한다.
31.5 Theme System
Theme Token Contract가 정의된다.
System Default Bright Theme가 존재한다.
Workspace Theme Profile을 지원한다.
Brand Default와 Project Selection을 지원한다.
Theme Token이 검증된다.
Theme 변경이 Preview Approval을 무효화한다.
Content에 전체 Token 값이 복사되지 않는다.
31.6 HTML Contract
Semantic HTML을 생성한다.
Body Heading이 H2부터 시작한다.
Heading 순서가 유지된다.
이미지 ALT를 검증한다.
Table Header와 Scope를 지원한다.
내부 링크 기본 동작이 _self다.
외부 링크에 안전한 Target과 Rel을 적용한다.
Script와 Inline Event Handler를 허용하지 않는다.
AI 생성 Raw HTML을 허용하지 않는다.
CSS 없이도 본문을 읽을 수 있다.
31.7 Accessibility
색상만으로 상태를 전달하지 않는다.
CTA 목적을 Text로 이해할 수 있다.
Native Semantic HTML을 우선한다.
필수 Accessibility Error가 발행을 차단한다.
Component Fallback에서도 동일 의미가 유지된다.
31.8 Security
HTML Allowlist가 적용된다.
URL Scheme이 검증된다.
Embed Provider가 검증된다.
Script와 Injection이 제거된다.
Sanitization 후 의미 손실을 검증한다.
Secret과 Credential이 Presentation 계층에 전달되지 않는다.
31.9 Version Compatibility
주요 Version이 분리된다.
Supported, Migratable, Fallback Available와 Incompatible을 구분한다.
Incompatible 상태에서 발행을 차단한다.
Migration은 명시적이고 Test 가능하다.
Render Artifact에 Version을 기록한다.
Version 변경 시 Preview Approval을 무효화한다.
31.10 Preview Consistency
Shared Preview와 Draft Save가 동일 Render Artifact를 사용한다.
Render Checksum이 일치한다.
Content 변경 시 기존 Preview가 무효화된다.
Theme 변경 시 기존 Preview가 무효화된다.
Component Registry 변경 시 기존 Preview가 무효화된다.
Renderer 변경 시 기존 Preview가 무효화된다.
Checksum이 다른 결과를 승인 없이 Draft Save할 수 없다.
31.11 Tistory
기존 Tistory HTML Rendering을 보호한다.
Tistory 전용 Selector가 Core에 들어가지 않는다.
Bright Component를 단계적으로 적용할 수 있다.
CSS가 없어도 의미가 유지된다.
Registered Browser Workflow 경계를 유지한다.
실제 Tistory Draft에서 결과를 확인할 수 있다.
31.12 WordPress
WordPress Renderer가 공통 Presentation Contract를 사용한다.
GeneratePress와 Bright Theme의 책임이 분리된다.
GeneratePress 원본 Theme를 수정하지 않는다.
Bright Component HTML이 GeneratePress에 강하게 종속되지 않는다.
Bright Theme가 없어도 콘텐츠를 읽을 수 있다.
실제 WordPress Draft에서 결과를 확인할 수 있다.
31.13 Platform Independence
Presentation Engine이 Platform REST Endpoint를 알지 않는다.
Presentation Engine이 Playwright를 호출하지 않는다.
Core에 플랫폼별 HTML 분기가 반복되지 않는다.
새로운 Platform Renderer가 동일 계약을 구현할 수 있다.
Tistory와 WordPress가 동일 Component Definition을 재사용한다.
31.14 Verification
Unit Test 통과
Contract Test 통과
Accessibility Test 통과
Sanitization Test 통과
Tistory Regression Test 통과
WordPress Renderer Test 통과
Preview Consistency Test 통과
실제 Tistory Draft 검증
실제 WordPress Draft 검증
git diff --check 통과
관련 문서 갱신
32. Out of Scope

Sprint 6에서 다음은 제외한다.

Bright Studio Application UI 전체 재디자인
Drag and Drop Page Builder
사용자가 자유롭게 HTML 입력
사용자가 자유롭게 CSS 입력
JavaScript Component
Interactive Widget Framework
External Script Embed
광고 Network Script
WordPress Theme 자동 설치
WordPress Plugin 자동 설치
GeneratePress 원본 수정
Tistory Skin 자동 수정
Theme Marketplace
Component Marketplace
사용자 정의 Component Code
AI가 직접 CSS를 생성하는 기능
AI 호출을 추가한 Component Designer
Public Publish
기존 발행 콘텐츠 자동 수정
Cloud Theme Sync
Cross-workspace Theme Sharing
Dynamic Personalization
A/B Test
Performance Analytics

Out of Scope 기능은 향후 확장을 막지 않되 Sprint 6 구현에 포함하지 않는다.

33. Future Expansion

향후 다음 기능을 확장할 수 있다.

Additional Bright Components
Component Catalog UI
Theme Editor
Brand Theme Presets
Theme Marketplace
Component Marketplace
Custom Component Extension
WordPress Block Mapping
Gutenberg Native Block Rendering
Advanced Responsive Rules
Print Styles
Dark Mode Content Theme
Accessibility Level Profiles
Platform-specific Preview
Performance-based Component Recommendation
A/B Testing
Content Presentation Analytics
Team Theme Governance
Cloud Theme Sync
Component Migration Tool
Legacy HTML Import
Design Token Export
GeneratePress Hook Integration
Additional WordPress Theme Adapters

향후 기능은 Canonical Content, Semantic Role, Component Registry와 Safe Renderer 계약을 유지하면서 확장해야 한다.

34. Final Architecture Rule

Presentation Architecture의 목적은 콘텐츠를 화려하게 꾸미는 것이 아니다.

목적은 콘텐츠의 의미를 보존하면서 모든 플랫폼에서 일관되고 안전하며 접근 가능한 형태로 표현하는 것이다.

모든 구현은 다음 경계를 유지해야 한다.

Canonical ContentDocument
→ Semantic Presentation Intent
→ Deterministic Presentation Resolver
→ Allowlisted Bright Component
→ Validated Theme
→ Platform Renderer
→ Sanitized Render Artifact
→ Shared Preview
→ Permission-Gated Draft Save

다음 동작은 허용하지 않는다.

AI → Raw HTML Publishing
AI → CSS Generation
ContentDocument → Platform DOM
Theme → Content Meaning Change
Renderer → SecretStore
Presentation Engine → Playwright
Preview → Separate Render Pipeline
Unsupported Component → Silent Deletion

Sprint 6은 디자인을 플랫폼별로 별도 구현하는 작업이 아니다.

Tistory, WordPress와 미래 플랫폼이 하나의 Canonical Content, Component Registry, Theme System과 HTML Contract를 공유하도록 만드는 작업이다.

