import type { PlatformConnection } from "../../../core/connections";
import { evaluateApprovalDraftIntegrity, evaluateGeneratedClaimVerificationIntegrity, resolveApprovalTemporalRequirement } from "../../../core/approval";
import { editorialRevisionId, PublishingGate } from "../../../core/quality";
import { PublishingPermissionGate } from "../../../core/publishing";
import type { WordPressCategoryListResult } from "../../../apps/wordpress";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../settings/WorkspaceSettingsService";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";
import { contentOwnedIdentityContamination } from "./ContentOwnedIdentityPolicy";
import { resolveWordPressCategorySelection, type WordPressCategorySelectionResolution } from "./WordPressPublishingPreparation";
import { hasWordPressLocalMedia } from "./WordPressMediaPreparation";

export type WordPressDraftReadinessCheck = Readonly<{ key: string; passed: boolean; message: string }>;
export type WordPressDraftReadiness = Readonly<{ ready: boolean; executable: boolean; checks: readonly WordPressDraftReadinessCheck[]; localImageCount: number; categorySelection: WordPressCategorySelectionResolution; featuredImageAssetId?: string }>;

export function calculateWordPressDraftReadiness(input: Readonly<{ data: UserData; project: UserProject; content: UserContent; connection?: PlatformConnection; categoryResult: WordPressCategoryListResult; selectedTarget: boolean; finalConfirmation: boolean; mediaValidationPassed?: boolean; featuredImageAssetId?: string }>): WordPressDraftReadiness {
  const { data, project, content, connection } = input;
  const workspaceId = data.workspace?.id;
  const enabled = isPlatformEnabled(data, "wordpress");
  const projectOwned = Boolean(workspaceId && project.workspaceId === workspaceId && data.projects.some((item) => item.id === project.id && item.workspaceId === workspaceId));
  const contentOwned = Boolean(projectOwned && content.workspaceId === workspaceId && content.projectId === project.id && data.contents.some((item) => item.id === content.id && item.projectId === project.id && item.workspaceId === workspaceId));
  const connectionOwned = Boolean(connection && workspaceId && connection.workspaceId === workspaceId && connection.platform === "wordpress");
  const connected = connectionOwned && connection?.status === "connected";
  const verified = Boolean(connected && validVerificationTime(connection?.lastVerifiedAt) && connection?.publicMetadata.canCreateDrafts === true && connection.secretReference && metadataString(connection, "siteUrl") && metadataString(connection, "username"));
  const selectedTarget = Boolean(connection && contentOwned && input.selectedTarget && (content.publishingAccountId === connection.id || content.selectedPublishingAccountIds?.includes(connection.id) || project.selectedPublishingAccountIds?.includes(connection.id)));
  const categorySelection = connection ? resolveWordPressCategorySelection({ project, content, connection, categoryResult: input.categoryResult }) : invalidCategorySelection();
  const categoriesReady = !input.categoryResult.hasMore && categorySelection.valid && categorySelection.source === "content" && categorySelection.policyCompliant !== false;
  const qualityReady = standardQualityReady(content);
  const currentRevisionId = content.document ? editorialRevisionId(content.document) : undefined;

  // Official Source First contract: Approval Evidence presence itself is not a readiness gate.
  // Generated Claim Verification is different: a current document with an explicit verification
  // plan must pass its Claim integrity gate before a WordPress draft can be considered ready.
  const generatedClaimIntegrity = content.document
    ? evaluateGeneratedClaimVerificationIntegrity({
        document: content.document,
        plan: content.opportunity?.verificationPlan,
        currentRevisionId,
      })
    : Object.freeze({
        passed: !content.opportunity?.verificationPlan,
        reasons: content.opportunity?.verificationPlan
          ? Object.freeze(["검증할 canonical 원고가 없습니다."])
          : Object.freeze([]),
      });
  const generatedClaimFailureMessage = generatedClaimIntegrity.passed
    ? content.opportunity?.verificationPlan
      ? "현재 원고의 고위험 Claim 검증 상태를 확인했습니다."
      : "현재 원고에는 explicit Verification Claim Gate가 필요하지 않습니다."
    : generatedClaimIntegrity.reasons.join(" ")
      || generatedClaimIntegrity.bindings
        .filter((binding) => binding.reference.referenceType === "unverifiedDetected")
        .map((binding) => `검증되지 않은 고위험 사실이 원고에 남아 있습니다: ${binding.matchedText}.`)
        .join(" ")
      || "현재 원고의 고위험 Claim 검증 상태를 확인해야 합니다.";
  const approvalIntegrity = content.document ? evaluateApprovalDraftIntegrity(content.document, false, resolveApprovalTemporalRequirement(content.opportunity) !== "not_required") : Object.freeze({ passed: false, reasons: Object.freeze(["기준 원고가 없습니다."]) });
  const policy = resolveWorkspaceSettings(data).publishing;
  const localImageCount = content.document?.blocks.filter((block) => block.type === "image" && /^\/api\/media\//i.test(block.source)).length ?? 0;
  const mediaFilesReady = localImageCount === 0 || input.mediaValidationPassed === true;
  const categoryRead = permissionAllowed("category.read", data, project, content, connection);
  const categorySelect = permissionAllowed("category.select", data, project, content, connection);
  const draftCreate = permissionAllowed("draft.create", data, project, content, connection);
  const draftVerify = permissionAllowed("draft.verify", data, project, content, connection);
  const mediaUpload = !hasWordPressLocalMedia(content.document) || permissionAllowed("media.upload", data, project, content, connection);
  const identityContamination = contentOwnedIdentityContamination(data, project, content);

  const checks: readonly WordPressDraftReadinessCheck[] = Object.freeze([
    check("workspace_project_content_ownership", projectOwned && contentOwned, "작업공간, 프로젝트와 콘텐츠의 소유 관계를 확인했습니다.", "작업공간, 프로젝트와 콘텐츠의 소유 관계가 일치해야 합니다."),
    check("wordpress_enabled", enabled, "작업공간에서 워드프레스가 활성화되어 있습니다.", "작업공간 설정에서 워드프레스를 활성화해야 합니다."),
    check("connection", connectionOwned && connected && verified, "안전하게 저장되고 검증된 워드프레스 연결 계정을 확인했습니다.", "비밀번호가 안전하게 저장된 연결·검증 완료 워드프레스 계정이 필요합니다."),
    check("selected_target", selectedTarget, "이 워드프레스 계정이 발행 대상으로 선택되어 있습니다.", "이 워드프레스 계정을 발행 대상으로 선택해야 합니다."),
    check("category_catalog", categoriesReady, categorySelection.valid && categorySelection.policyCompliant !== false ? `워드프레스 카테고리 ${categorySelection.categoryIds.length}개를 검증했습니다.` : "워드프레스 카테고리를 확인했습니다.", categoryMessage(categorySelection, input.categoryResult.hasMore)),
    check("planning_identity", identityContamination.length === 0, "기획 주제와 검색 키워드에 프로젝트명 또는 브랜드명이 검색어로 섞이지 않았습니다.", `기존 기획에 검색 주제가 아닌 프로젝트명 또는 브랜드명이 포함되어 있습니다: ${identityContamination.join(", ")}. 새 Content에서 Planning을 다시 실행해 주세요.`),
    check("quality_revision", qualityReady, "현재 문서 버전의 기본 품질 승인을 확인했습니다.", "현재 문서 버전이 기본 품질 승인을 통과해야 합니다."),
    check("generated_claim_verification", generatedClaimIntegrity.passed, generatedClaimFailureMessage, generatedClaimFailureMessage),
    check("approval_article_integrity", approvalIntegrity.passed, "현재 승인 준비 원고의 정책·중복 무결성을 확인했습니다.", approvalIntegrity.reasons.join(" ") || "현재 승인 준비 원고의 무결성을 확인해야 합니다."),
    check("review_first", policy.reviewFirst, "검토 후 저장 정책이 활성화되어 있습니다.", "검토 후 저장 정책이 활성화되어 있어야 합니다."),
    check("draft_only", policy.draftOnly, "임시글만 저장 정책이 활성화되어 있습니다.", "임시글만 저장 정책이 활성화되어 있어야 합니다."),
    check("public_publish_off", !policy.publicPublish, "공개 발행이 비활성화되어 있습니다.", "공개 발행은 비활성화되어 있어야 합니다."),
    check("category_read_permission", categoryRead, "카테고리 조회 권한을 확인했습니다.", "연결 계정에 카테고리 조회 권한이 필요합니다."),
    check("category_select_permission", categorySelect, "카테고리 선택 권한을 확인했습니다.", "연결 계정에 카테고리 선택 권한이 필요합니다."),
    check("draft_create_permission", draftCreate, "임시글 생성 권한을 확인했습니다.", "연결 계정에 임시글 생성 권한이 필요합니다."),
    check("draft_verify_permission", draftVerify, "임시글 검증 권한을 확인했습니다.", "연결 계정에 임시글 검증 권한이 필요합니다."),
    check("local_media", mediaFilesReady, localImageCount === 0 ? "검증할 로컬 이미지가 없습니다." : "모든 로컬 이미지의 소유권, 파일 존재, 형식과 크기를 검증했습니다.", "모든 로컬 이미지는 소유권, 파일 존재, 형식과 크기 검증을 통과해야 합니다."),
    check("media_upload_permission", mediaUpload, localImageCount === 0 ? "로컬 이미지가 없어 이미지 업로드 권한이 필요하지 않습니다." : "이미지 업로드 권한을 확인했습니다.", "로컬 이미지가 있으면 이미지 업로드 권한을 명시적으로 허용해야 합니다."),
    check("final_confirmation", input.finalConfirmation, "사용자의 최종 확인이 완료되었습니다.", "사용자의 최종 확인이 필요합니다."),
  ]);

  const ready = checks
    .filter((item) => item.key !== "final_confirmation" && item.key !== "approval_article_integrity")
    .every((item) => item.passed);
  return Object.freeze({ ready, executable: ready && input.finalConfirmation, checks, localImageCount, categorySelection, ...(input.featuredImageAssetId ? { featuredImageAssetId: input.featuredImageAssetId } : {}) });
}

export function assertWordPressCategoryLookupAllowed(input: Readonly<{ data: UserData; project: UserProject; content: UserContent; connection: PlatformConnection }>): void {
  const workspaceId = input.data.workspace?.id;
  if (!workspaceId || input.project.workspaceId !== workspaceId || input.content.workspaceId !== workspaceId || input.content.projectId !== input.project.id || !input.data.projects.some((item) => item.id === input.project.id && item.workspaceId === workspaceId) || !input.data.contents.some((item) => item.id === input.content.id && item.projectId === input.project.id && item.workspaceId === workspaceId)) throw new Error("워드프레스 발행 대상의 소유 관계를 확인하지 못했습니다.");
  if (!isPlatformEnabled(input.data, "wordpress")) throw new Error("작업공간 설정에서 워드프레스를 활성화해야 합니다.");
  if (input.connection.workspaceId !== workspaceId || input.connection.platform !== "wordpress") throw new Error("워드프레스 연결 계정의 소유 관계를 확인하지 못했습니다.");
  if (input.connection.status !== "connected" || !validVerificationTime(input.connection.lastVerifiedAt)) throw new Error("연결과 검증이 완료된 워드프레스 계정이 필요합니다.");
  new PublishingPermissionGate().authorize({ workspaceId, projectId: input.project.id, contentId: input.content.id, platformConnectionId: input.connection.id, workflow: "category.read", finalConfirmation: true }, input.connection);
}

function standardQualityReady(content: UserContent): boolean { if (!content.document || !content.quality) return false; try { new PublishingGate().assertReady(content.quality, editorialRevisionId(content.document), content.document); return true; } catch { return false; } }

function permissionAllowed(workflow: string, data: UserData, project: UserProject, content: UserContent, connection?: PlatformConnection): boolean {
  if (!data.workspace || !connection) return false;
  try { new PublishingPermissionGate().authorize({ workspaceId: data.workspace.id, projectId: project.id, contentId: content.id, platformConnectionId: connection.id, workflow, finalConfirmation: true }, connection); return true; } catch { return false; }
}
function metadataString(connection: PlatformConnection, key: string): string | undefined { const value = connection.publicMetadata[key]; return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function validVerificationTime(value: string | undefined): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function categoryMessage(selection: WordPressCategorySelectionResolution, incomplete: boolean): string {
  if (incomplete) return "실행 전에 워드프레스 카테고리 전체 목록을 모두 불러와야 합니다.";
  if (selection.valid && selection.policyCompliant === false) return selection.policyReason ?? "승인 준비 정책의 필수 카테고리와 실제 WordPress 카테고리가 일치하지 않습니다.";
  if (selection.valid && selection.source !== "content") return "프로젝트 또는 연결의 기본 카테고리는 제안값입니다. 콘텐츠에 명시적으로 적용해야 합니다.";
  if (selection.valid) return `워드프레스 카테고리 ${selection.categoryIds.length}개를 검증했습니다.`;
  if (selection.reason === "connection_mismatch") return "카테고리 목록이 다른 워드프레스 연결 계정에서 조회되었습니다.";
  if (selection.reason === "missing") return "사용 가능한 워드프레스 카테고리를 하나 이상 선택하세요.";
  return "선택한 워드프레스 카테고리가 삭제되었거나 더 이상 사용할 수 없습니다.";
}
function invalidCategorySelection(): WordPressCategorySelectionResolution { return Object.freeze({ valid: false, reason: "invalid", invalidCategoryIds: Object.freeze([]) }); }
function check(key: string, passed: boolean, passedMessage: string, failedMessage: string): WordPressDraftReadinessCheck { return Object.freeze({ key, passed, message: passed ? passedMessage : failedMessage }); }
