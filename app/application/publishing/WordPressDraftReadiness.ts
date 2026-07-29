import type { PlatformConnection } from "../../../core/connections";
import { contentRevisionId, PublishingGate } from "../../../core/quality";
import { PublishingPermissionGate } from "../../../core/publishing";
import type { WordPressCategoryListResult } from "../../../apps/wordpress";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../settings/WorkspaceSettingsService";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";
import {
  resolveWordPressCategorySelection,
  type WordPressCategorySelectionResolution,
} from "./WordPressPublishingPreparation";
import { hasWordPressLocalMedia } from "./WordPressMediaPreparation";

export type WordPressDraftReadinessCheck = Readonly<{
  key: string;
  passed: boolean;
  message: string;
}>;

export type WordPressDraftReadiness = Readonly<{
  ready: boolean;
  executable: boolean;
  checks: readonly WordPressDraftReadinessCheck[];
  localImageCount: number;
  categorySelection: WordPressCategorySelectionResolution;
}>;

export function calculateWordPressDraftReadiness(input: Readonly<{
  data: UserData;
  project: UserProject;
  content: UserContent;
  connection?: PlatformConnection;
  categoryResult: WordPressCategoryListResult;
  selectedTarget: boolean;
  finalConfirmation: boolean;
  mediaValidationPassed?: boolean;
}>): WordPressDraftReadiness {
  const { data, project, content, connection } = input;
  const workspaceId = data.workspace?.id;
  const enabled = isPlatformEnabled(data, "wordpress");
  const projectOwned = Boolean(workspaceId
    && project.workspaceId === workspaceId
    && data.projects.some((item) => item.id === project.id && item.workspaceId === workspaceId));
  const contentOwned = Boolean(projectOwned
    && content.workspaceId === workspaceId
    && content.projectId === project.id
    && data.contents.some((item) => item.id === content.id
      && item.projectId === project.id
      && item.workspaceId === workspaceId));
  const connectionOwned = Boolean(connection
    && workspaceId
    && connection.workspaceId === workspaceId
    && connection.platform === "wordpress");
  const connected = connectionOwned && connection?.status === "connected";
  const verified = Boolean(connected
    && validVerificationTime(connection?.lastVerifiedAt)
    && connection?.publicMetadata.canCreateDrafts === true
    && connection.secretReference
    && metadataString(connection, "siteUrl")
    && metadataString(connection, "username"));
  const selectedTarget = Boolean(connection
    && contentOwned
    && input.selectedTarget
    && (content.publishingAccountId === connection.id
      || content.selectedPublishingAccountIds?.includes(connection.id)
      || project.selectedPublishingAccountIds?.includes(connection.id)));
  const categorySelection = connection
    ? resolveWordPressCategorySelection({ project, content, connection, categoryResult: input.categoryResult })
    : invalidCategorySelection();
  const categoriesReady = !input.categoryResult.hasMore && categorySelection.valid;
  const qualityReady = standardQualityReady(content);
  const policy = resolveWorkspaceSettings(data).publishing;
  const localImageCount = content.document?.blocks.filter((block) => block.type === "image"
    && /^\/api\/media\//i.test(block.source)).length ?? 0;
  const mediaFilesReady = localImageCount === 0 || input.mediaValidationPassed === true;
  const categoryRead = permissionAllowed("category.read", data, project, content, connection);
  const categorySelect = permissionAllowed("category.select", data, project, content, connection);
  const draftCreate = permissionAllowed("draft.create", data, project, content, connection);
  const draftVerify = permissionAllowed("draft.verify", data, project, content, connection);
  const mediaUpload = !hasWordPressLocalMedia(content.document)
    || permissionAllowed("media.upload", data, project, content, connection);

  const checks: readonly WordPressDraftReadinessCheck[] = Object.freeze([
    check("workspace_project_content_ownership", projectOwned && contentOwned, "Workspace, Project, and Content ownership must match."),
    check("wordpress_enabled", enabled, "WordPress must be enabled in Workspace Settings."),
    check("connection", connectionOwned && connected && verified, "A connected and verified WordPress Connection with a stored secret is required."),
    check("selected_target", selectedTarget, "Select this WordPress Connection as the publishing target."),
    check("category_catalog", categoriesReady, categoryMessage(categorySelection, input.categoryResult.hasMore)),
    check("quality_revision", qualityReady, "The current Content Revision requires standard Quality Approval."),
    check("review_first", policy.reviewFirst, "Review First must remain enabled."),
    check("draft_only", policy.draftOnly, "Draft Only must remain enabled."),
    check("public_publish_off", !policy.publicPublish, "Public Publish must remain disabled."),
    check("category_read_permission", categoryRead, "The Connection must allow category.read."),
    check("category_select_permission", categorySelect, "The Connection must allow category.select."),
    check("draft_create_permission", draftCreate, "The Connection must allow draft.create."),
    check("draft_verify_permission", draftVerify, "The Connection must allow draft.verify."),
    check("local_media", mediaFilesReady, "Every local image must pass ownership, file, format, and size validation."),
    check("media_upload_permission", mediaUpload, "Local images require explicit media.upload permission."),
    check("final_confirmation", input.finalConfirmation, "Final user confirmation is required."),
  ]);
  const ready = checks.filter((item) => item.key !== "final_confirmation").every((item) => item.passed);
  return Object.freeze({
    ready,
    executable: ready && input.finalConfirmation,
    checks,
    localImageCount,
    categorySelection,
  });
}

export function assertWordPressCategoryLookupAllowed(input: Readonly<{
  data: UserData;
  project: UserProject;
  content: UserContent;
  connection: PlatformConnection;
}>): void {
  const workspaceId = input.data.workspace?.id;
  if (!workspaceId
    || input.project.workspaceId !== workspaceId
    || input.content.workspaceId !== workspaceId
    || input.content.projectId !== input.project.id
    || !input.data.projects.some((item) => item.id === input.project.id && item.workspaceId === workspaceId)
    || !input.data.contents.some((item) => item.id === input.content.id
      && item.projectId === input.project.id
      && item.workspaceId === workspaceId)) {
    throw new Error("WordPress publishing ownership verification failed.");
  }
  if (!isPlatformEnabled(input.data, "wordpress")) throw new Error("WordPress is disabled in Workspace Settings.");
  if (input.connection.workspaceId !== workspaceId || input.connection.platform !== "wordpress") {
    throw new Error("WordPress Connection ownership verification failed.");
  }
  if (input.connection.status !== "connected" || !validVerificationTime(input.connection.lastVerifiedAt)) {
    throw new Error("A connected and verified WordPress Connection is required.");
  }
  new PublishingPermissionGate().authorize({
    workspaceId,
    projectId: input.project.id,
    contentId: input.content.id,
    platformConnectionId: input.connection.id,
    workflow: "category.read",
    finalConfirmation: true,
  }, input.connection);
}

function standardQualityReady(content: UserContent): boolean {
  if (!content.document || !content.quality) return false;
  try {
    new PublishingGate().assertReady(content.quality, contentRevisionId(content.document), content.document);
    return true;
  } catch { return false; }
}

function permissionAllowed(
  workflow: string,
  data: UserData,
  project: UserProject,
  content: UserContent,
  connection?: PlatformConnection,
): boolean {
  if (!data.workspace || !connection) return false;
  try {
    new PublishingPermissionGate().authorize({
      workspaceId: data.workspace.id,
      projectId: project.id,
      contentId: content.id,
      platformConnectionId: connection.id,
      workflow,
      finalConfirmation: true,
    }, connection);
    return true;
  } catch { return false; }
}

function metadataString(connection: PlatformConnection, key: string): string | undefined {
  const value = connection.publicMetadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validVerificationTime(value: string | undefined): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function categoryMessage(selection: WordPressCategorySelectionResolution, incomplete: boolean): string {
  if (incomplete) return "The complete WordPress Category catalog is required before execution.";
  if (selection.valid) return `Validated ${selection.categoryIds.length} WordPress Category selection(s).`;
  if (selection.reason === "connection_mismatch") return "The Category catalog belongs to a different WordPress Connection.";
  if (selection.reason === "missing") return "Select at least one valid WordPress Category.";
  return "A selected WordPress Category was deleted or is no longer available.";
}

function invalidCategorySelection(): WordPressCategorySelectionResolution {
  return Object.freeze({ valid: false, reason: "invalid", invalidCategoryIds: Object.freeze([]) });
}

function check(key: string, passed: boolean, message: string): WordPressDraftReadinessCheck {
  return Object.freeze({ key, passed, message });
}
