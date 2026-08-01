import type { PlatformConnection } from "../../../core/connections";
import {
  isApprovalPolicyProfileId,
  resolveApprovalPolicySnapshot,
} from "../../../core/approval";
import type {
  WordPressCategory,
  WordPressCategoryListResult,
} from "../../../apps/wordpress/WordPressCategoryAdapter";
import {
  resolveProjectStrategy,
  type UserContent,
  type UserData,
  type UserProject,
} from "../../user-flow/user-data";
import { invalidatePublishingContextDependentStateIfChanged } from "./PublishingContextInvalidation";

export type WordPressCategorySelectionSource = "content" | "project" | "connection";

export type WordPressCategorySelectionResolution =
  | Readonly<{
    valid: true;
    source: WordPressCategorySelectionSource;
    categoryIds: readonly string[];
    categoryNames: readonly string[];
    policyCompliant?: boolean;
    requiredCategoryNames?: readonly string[];
    policyReason?: string;
  }>
  | Readonly<{
    valid: false;
    source?: WordPressCategorySelectionSource;
    reason: "missing" | "invalid" | "connection_mismatch";
    invalidCategoryIds: readonly string[];
  }>;

export function applyWordPressPublishingCategories(
  data: UserData,
  projectId: string,
  contentId: string,
  connectionId: string,
  categoryIds: readonly string[],
  categoryResult: WordPressCategoryListResult,
  updatedAt: string,
): UserData {
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === data.workspace?.id);
  const content = data.contents.find((item) => item.id === contentId
    && item.projectId === projectId
    && (item.workspaceId === undefined || item.workspaceId === data.workspace?.id));
  if (!project || !content) throw new Error("WordPress publishing Project or Content could not be found.");
  if (!connectionId.trim()) throw new Error("WordPress connection is required.");
  if (categoryResult.platform !== "wordpress" || categoryResult.platformConnectionId !== connectionId) {
    throw new Error("WordPress category result belongs to a different connection.");
  }

  const selection = validateSelection("content", categoryIds, categoryResult.categories);
  if (!selection.valid) throw new Error(selection.reason === "missing"
    ? "Select at least one WordPress category."
    : "One or more selected WordPress categories are no longer available.");

  const strategy = resolveProjectStrategy(project);
  const otherConnectionCategories = (strategy.defaultWordPressCategories ?? [])
    .filter((category) => category.publishingAccountId !== connectionId);
  const defaultWordPressCategories = Object.freeze([
    ...otherConnectionCategories,
    ...selection.categoryIds.map((id, index) => Object.freeze({
      publishingAccountId: connectionId,
      id,
      name: selection.categoryNames[index],
    })),
  ]);
  const previousPreparation = content.publishingPreparation?.wordpress;
  const featuredImageAssetId = previousPreparation?.publishingAccountId === connectionId
    ? previousPreparation.featuredImageAssetId
    : undefined;

  const next: UserData = {
    ...data,
    projects: data.projects.map((item) => item.id === projectId ? {
      ...item,
      selectedPublishingAccountIds: uniqueAccount(item.selectedPublishingAccountIds, connectionId),
      strategy: { ...strategy, defaultWordPressCategories },
      updatedAt,
    } : item),
    contents: data.contents.map((item) => item.id === contentId ? {
      ...item,
      platform: "wordpress",
      publishingAccountId: connectionId,
      selectedPublishingAccountIds: uniqueAccount(item.selectedPublishingAccountIds, connectionId),
      publishingPreparation: {
        ...item.publishingPreparation,
        wordpress: {
          publishingAccountId: connectionId,
          categoryIds: selection.categoryIds,
          categoryNames: selection.categoryNames,
          ...(featuredImageAssetId ? { featuredImageAssetId } : {}),
          updatedAt,
        },
      },
      updatedAt,
    } : item),
  };
  return invalidatePublishingContextDependentStateIfChanged(
    content,
    next,
    contentId,
    updatedAt,
  );
}

export function resolveWordPressCategorySelection(input: Readonly<{
  project: UserProject;
  content: UserContent;
  connection: PlatformConnection;
  categoryResult: WordPressCategoryListResult;
}>): WordPressCategorySelectionResolution {
  if (input.connection.platform !== "wordpress"
    || input.project.workspaceId !== input.connection.workspaceId
    || (input.content.workspaceId !== undefined && input.content.workspaceId !== input.connection.workspaceId)
    || input.content.projectId !== input.project.id) {
    return invalidResolution(undefined, []);
  }
  if (input.categoryResult.platform !== "wordpress"
    || input.categoryResult.platformConnectionId !== input.connection.id) {
    return connectionMismatchResolution();
  }

  const direct = input.content.publishingPreparation?.wordpress;
  if (direct?.publishingAccountId === input.connection.id) {
    return withApprovalCategoryPolicy(
      input.content,
      validateSelection("content", direct.categoryIds, input.categoryResult.categories),
    );
  }

  const projectIds = (input.project.strategy?.defaultWordPressCategories ?? [])
    .filter((category) => category.publishingAccountId === input.connection.id)
    .map((category) => category.id);
  if (projectIds.length) return withApprovalCategoryPolicy(
    input.content,
    validateSelection("project", projectIds, input.categoryResult.categories),
  );

  const connectionIds = connectionDefaultCategoryIds(input.connection);
  if (connectionIds !== undefined) return withApprovalCategoryPolicy(
    input.content,
    validateSelection("connection", connectionIds, input.categoryResult.categories),
  );

  return Object.freeze({ valid: false, reason: "missing", invalidCategoryIds: Object.freeze([]) });
}

function withApprovalCategoryPolicy(
  content: UserContent,
  selection: WordPressCategorySelectionResolution,
): WordPressCategorySelectionResolution {
  const approvalContent = content as UserContent & Readonly<{
    contentPurpose?: string;
    approvalProfileId?: string;
  }>;
  if (!selection.valid
    || approvalContent.contentPurpose !== "adsense_approval"
    || !isApprovalPolicyProfileId(approvalContent.approvalProfileId)) return selection;
  const requiredCategoryNames = resolveApprovalPolicySnapshot(
    approvalContent.contentPurpose,
    approvalContent.approvalProfileId,
  )?.requiredPublishingCategoryNames;
  if (!requiredCategoryNames?.length) return selection;
  const policyCompliant = selection.categoryNames.length === requiredCategoryNames.length
    && selection.categoryNames.every((name, index) =>
      normalizePolicyCategoryName(name) === normalizePolicyCategoryName(requiredCategoryNames[index] ?? ""));
  return Object.freeze({
    ...selection,
    policyCompliant,
    requiredCategoryNames,
    ...(!policyCompliant ? {
      policyReason: `승인 준비 정책은 WordPress 카테고리 '${requiredCategoryNames.join(", ")}'와 현재 Connection에서 선택한 실제 카테고리 이름의 정확한 일치를 요구합니다. 다른 이름은 자동으로 대체하거나 유사 이름으로 인정하지 않습니다.`,
    } : {}),
  });
}

function normalizePolicyCategoryName(value: string): string {
  return value.normalize("NFKC").trim();
}

function validateSelection(
  source: WordPressCategorySelectionSource,
  values: readonly string[],
  categories: readonly WordPressCategory[],
): WordPressCategorySelectionResolution {
  const categoryIds = uniqueIds(values);
  if (!categoryIds.length) {
    return Object.freeze({ valid: false, source, reason: "missing", invalidCategoryIds: Object.freeze([]) });
  }
  const available = new Map(categories
    .filter((category) => category.platform === "wordpress" && category.selectable)
    .map((category) => [category.externalCategoryId, category]));
  const invalidCategoryIds = categoryIds.filter((id) => !available.has(id));
  if (invalidCategoryIds.length) return invalidResolution(source, invalidCategoryIds);
  return Object.freeze({
    valid: true,
    source,
    categoryIds: Object.freeze(categoryIds),
    categoryNames: Object.freeze(categoryIds.map((id) => available.get(id)!.name)),
  });
}

function connectionDefaultCategoryIds(connection: PlatformConnection): readonly string[] | undefined {
  const value = connection.publicMetadata.defaultCategoryIds;
  if (!Array.isArray(value)) return undefined;
  return value.filter((id): id is string => typeof id === "string");
}

function invalidResolution(
  source: WordPressCategorySelectionSource | undefined,
  invalidCategoryIds: readonly string[],
): WordPressCategorySelectionResolution {
  return Object.freeze({
    valid: false,
    ...(source ? { source } : {}),
    reason: "invalid",
    invalidCategoryIds: Object.freeze([...invalidCategoryIds]),
  });
}

function connectionMismatchResolution(): WordPressCategorySelectionResolution {
  return Object.freeze({
    valid: false,
    reason: "connection_mismatch",
    invalidCategoryIds: Object.freeze([]),
  });
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueAccount(values: readonly string[] | undefined, connectionId: string): readonly string[] {
  return [...new Set([...(values ?? []), connectionId])];
}
