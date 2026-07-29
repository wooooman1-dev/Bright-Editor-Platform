export const scheduledPublicationStatuses = [
  "registering",
  "scheduled_verified",
  "scheduled_unverified",
  "failed",
  "cancelled",
  "published",
] as const;

export type ScheduledPublicationStatus = (typeof scheduledPublicationStatuses)[number];

export const activeScheduledPublicationStatuses: readonly ScheduledPublicationStatus[] = Object.freeze([
  "registering",
  "scheduled_verified",
  "scheduled_unverified",
]);

export type ScheduledPublication = Readonly<{
  id: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  platform: "tistory" | "wordpress";
  platformConnectionId: string;
  revisionId: string;
  scheduledAt: string;
  timezone: string;
  status: ScheduledPublicationStatus;
  categoryId: string | null;
  categoryName: string | null;
  requestFingerprint: string;
  operationId: string;
  registeredAt?: string;
  verifiedAt?: string;
  externalPostId?: string;
  externalManagementUrl?: string;
  publicUrl?: string;
  attemptCount: number;
  lastAttemptAt: string;
  failureCode?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type LegacyScheduledPublication = Readonly<{
  contentId: string;
  platform: string;
  scheduledFor: string;
}>;

export type ScheduledPublishingRecord = ScheduledPublication | LegacyScheduledPublication;

export type ScheduleRequestIdentity = Readonly<{
  workspaceId: string;
  contentId: string;
  platform: string;
  platformConnectionId: string;
  revisionId: string;
  scheduledAt: string;
  timezone: string;
}>;

const TRANSITIONS: Readonly<Record<ScheduledPublicationStatus, readonly ScheduledPublicationStatus[]>> = Object.freeze({
  registering: transitionList("scheduled_verified", "scheduled_unverified", "failed"),
  scheduled_verified: transitionList("cancelled", "published"),
  scheduled_unverified: transitionList("scheduled_verified", "cancelled", "published"),
  failed: transitionList("registering"),
  cancelled: transitionList(),
  published: transitionList(),
});

export function isScheduledPublication(record: unknown): record is ScheduledPublication {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Partial<ScheduledPublication>;
  return typeof candidate.id === "string"
    && typeof candidate.workspaceId === "string"
    && typeof candidate.projectId === "string"
    && typeof candidate.contentId === "string"
    && (candidate.platform === "tistory" || candidate.platform === "wordpress")
    && typeof candidate.platformConnectionId === "string"
    && typeof candidate.revisionId === "string"
    && typeof candidate.scheduledAt === "string"
    && typeof candidate.timezone === "string"
    && typeof candidate.status === "string"
    && scheduledPublicationStatuses.includes(candidate.status as ScheduledPublicationStatus)
    && isNullableString(candidate.categoryId)
    && isNullableString(candidate.categoryName)
    && typeof candidate.requestFingerprint === "string"
    && typeof candidate.operationId === "string"
    && typeof candidate.attemptCount === "number"
    && Number.isInteger(candidate.attemptCount)
    && candidate.attemptCount >= 0
    && typeof candidate.lastAttemptAt === "string"
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
    && isOptionalString(candidate.registeredAt)
    && isOptionalString(candidate.verifiedAt)
    && isOptionalString(candidate.externalPostId)
    && isOptionalString(candidate.externalManagementUrl)
    && isOptionalString(candidate.publicUrl)
    && isOptionalString(candidate.failureCode)
    && isOptionalString(candidate.lastError);
}

export function isLegacyScheduledPublication(record: unknown): record is LegacyScheduledPublication {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Partial<LegacyScheduledPublication>;
  return typeof candidate.contentId === "string"
    && typeof candidate.platform === "string"
    && typeof candidate.scheduledFor === "string";
}

export function scheduledPublicationStorageKey(record: unknown): string {
  if (isScheduledPublication(record)) return record.id;
  if (isLegacyScheduledPublication(record)) {
    return `legacy:${record.contentId}:${record.platform}:${record.scheduledFor}`;
  }
  return `invalid:${encodeURIComponent(safeSerializedValue(record))}`;
}

export function createScheduleRequestFingerprint(input: ScheduleRequestIdentity): string {
  const fields = [
    input.workspaceId,
    input.contentId,
    input.platform,
    input.platformConnectionId,
    input.revisionId,
    input.scheduledAt,
    input.timezone,
  ];
  return `schedule:v1:${fields.map((value) => encodeURIComponent(value.trim())).join("|")}`;
}

export function assertValidScheduleTime(
  input: Readonly<{ scheduledAt: string; timezone: string }>,
  now = new Date(),
): Readonly<{ scheduledAt: string; timezone: string; instant: Date }> {
  const scheduledAt = input.scheduledAt.trim();
  const timezone = input.timezone.trim();
  if (!scheduledAt || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(scheduledAt)) {
    throw new ScheduledPublicationError("SCHEDULE_DATETIME_INVALID", "예약 시각은 시간대가 포함된 ISO datetime이어야 합니다.");
  }
  const timestamp = Date.parse(scheduledAt);
  if (!Number.isFinite(timestamp)) {
    throw new ScheduledPublicationError("SCHEDULE_DATETIME_INVALID", "예약 시각이 유효하지 않습니다.");
  }
  if (!isValidTimeZone(timezone)) {
    throw new ScheduledPublicationError("SCHEDULE_TIMEZONE_INVALID", "예약 시간대가 유효한 IANA timezone이 아닙니다.");
  }
  if (timestamp <= now.getTime()) {
    throw new ScheduledPublicationError("SCHEDULE_NOT_FUTURE", "예약 시각은 현재보다 미래여야 합니다.");
  }
  return Object.freeze({ scheduledAt, timezone, instant: new Date(timestamp) });
}

export function hasActiveScheduledPublication(
  records: readonly ScheduledPublishingRecord[] | undefined,
  input: Readonly<{ contentId: string; platform: string; exceptId?: string }>,
): boolean {
  return (records ?? []).some((record) => isScheduledPublication(record)
    && record.id !== input.exceptId
    && record.contentId === input.contentId
    && record.platform === input.platform
    && activeScheduledPublicationStatuses.includes(record.status));
}

export function assertScheduledPublicationTransition(
  current: ScheduledPublicationStatus,
  next: ScheduledPublicationStatus,
): void {
  if (current === next) return;
  if (!TRANSITIONS[current].includes(next)) {
    throw new ScheduledPublicationError(
      "SCHEDULE_STATUS_TRANSITION_INVALID",
      `예약 상태를 ${current}에서 ${next}(으)로 변경할 수 없습니다.`,
    );
  }
}

export class ScheduledPublicationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ScheduledPublicationError";
  }
}

function transitionList(...statuses: ScheduledPublicationStatus[]): readonly ScheduledPublicationStatus[] {
  return Object.freeze(statuses);
}

function isValidTimeZone(value: string): boolean {
  if (!value || !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function safeSerializedValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}
