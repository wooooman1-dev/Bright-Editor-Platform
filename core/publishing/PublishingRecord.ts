export const publishingExecutionStatuses = Object.freeze([
  "preparing",
  "media_uploaded",
  "draft_created",
  "verified",
  "verification_failed",
  "failed",
  "cleanup_required",
  "unknown_result",
] as const);

export type PublishingExecutionStatus = (typeof publishingExecutionStatuses)[number];

export type PublishingUploadedMediaRecord = Readonly<{
  assetId: string;
  externalMediaId: string;
}>;

export type PublishingVerificationCheckRecord = Readonly<{
  key: string;
  passed: boolean;
}>;

/**
 * Workflows that own an external WordPress post execution. `schedule.create`
 * shares the whole draft pipeline and differs only in the requested post state
 * and the permission it authorizes against. See D-038.
 *
 * `draft.update` rewrites the Post a previous execution already created rather
 * than adding another one. It shares the pipeline and the `draft.create`
 * permission; it is a separate workflow only so the Idempotency Key and the
 * record say which of the two actually happened.
 */
export const publishingExecutionWorkflows = Object.freeze([
  "draft.create",
  "draft.update",
  "schedule.create",
] as const);

export type PublishingExecutionWorkflow = (typeof publishingExecutionWorkflows)[number];

export type PublishingExecutionRecord = Readonly<{
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  contentRevisionId: string;
  executionRevisionId?: string;
  platformConnectionId: string;
  platform: "wordpress";
  workflow: PublishingExecutionWorkflow;
  status: PublishingExecutionStatus;
  /** Present only for `schedule.create`. Offset-bearing ISO instant. */
  scheduledAt?: string;
  scheduledTimezone?: string;
  scheduledPostStatus?: "draft" | "future";
  stage: string;
  externalPostId?: string;
  verified: boolean;
  uploadedMedia: readonly PublishingUploadedMediaRecord[];
  cleanupRequired: boolean;
  verificationChecks: readonly PublishingVerificationCheckRecord[];
  categoryIds: readonly string[];
  categoryNames: readonly string[];
  localImageCount: number;
  featuredImageAssigned: boolean;
  safeErrorCode?: string;
  safeMessage?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type LegacyPublishingRecord = Readonly<{
  id: string;
  contentId: string;
  platformConnectionId: string;
  status: "saved" | "partially_verified" | "failed";
  createdAt: string;
}>;

export type PublishingRecord = LegacyPublishingRecord | PublishingExecutionRecord;

export type DraftCreateIdempotencyIdentity = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  contentRevisionId: string;
  executionRevisionId?: string;
  platformConnectionId: string;
  /** Defaults to `draft.create` so pre-D-038 keys stay byte-identical. */
  workflow?: PublishingExecutionWorkflow;
}>;

export function createDraftCreateIdempotencyKey(input: DraftCreateIdempotencyIdentity): string {
  const workflow = input.workflow ?? "draft.create";
  if (!input.executionRevisionId?.trim()) {
    const fields = [
      input.workspaceId,
      input.projectId,
      input.contentId,
      input.contentRevisionId,
      input.platformConnectionId,
      workflow,
    ];
    return `publishing:v1:${fields.map((value) => encodeURIComponent(value.trim())).join("|")}`;
  }

  const fields = [
    input.workspaceId,
    input.projectId,
    input.contentId,
    input.contentRevisionId,
    input.executionRevisionId,
    input.platformConnectionId,
    workflow,
  ];
  return `publishing:v2:${fields.map((value) => encodeURIComponent(value.trim())).join("|")}`;
}

export function isPublishingExecutionRecord(value: unknown): value is PublishingExecutionRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublishingExecutionRecord>;
  return candidate.schemaVersion === 1
    && typeof candidate.id === "string"
    && typeof candidate.idempotencyKey === "string"
    && candidate.id === candidate.idempotencyKey
    && typeof candidate.workspaceId === "string"
    && typeof candidate.projectId === "string"
    && typeof candidate.contentId === "string"
    && typeof candidate.contentRevisionId === "string"
    && (candidate.executionRevisionId === undefined || typeof candidate.executionRevisionId === "string")
    && typeof candidate.platformConnectionId === "string"
    && candidate.platform === "wordpress"
    && publishingExecutionWorkflows.includes(candidate.workflow as PublishingExecutionWorkflow)
    && publishingExecutionStatuses.includes(candidate.status as PublishingExecutionStatus)
    && typeof candidate.stage === "string"
    && typeof candidate.verified === "boolean"
    && Array.isArray(candidate.uploadedMedia)
    && typeof candidate.cleanupRequired === "boolean"
    && Array.isArray(candidate.verificationChecks)
    && Array.isArray(candidate.categoryIds)
    && Array.isArray(candidate.categoryNames)
    && typeof candidate.localImageCount === "number"
    && typeof candidate.featuredImageAssigned === "boolean"
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string";
}
