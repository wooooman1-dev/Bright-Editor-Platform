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

export type PublishingExecutionRecord = Readonly<{
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  contentRevisionId: string;
  platformConnectionId: string;
  platform: "wordpress";
  workflow: "draft.create";
  status: PublishingExecutionStatus;
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
  platformConnectionId: string;
}>;

export function createDraftCreateIdempotencyKey(input: DraftCreateIdempotencyIdentity): string {
  const fields = [
    input.workspaceId,
    input.projectId,
    input.contentId,
    input.contentRevisionId,
    input.platformConnectionId,
    "draft.create",
  ];
  return `publishing:v1:${fields.map((value) => encodeURIComponent(value.trim())).join("|")}`;
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
    && typeof candidate.platformConnectionId === "string"
    && candidate.platform === "wordpress"
    && candidate.workflow === "draft.create"
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
