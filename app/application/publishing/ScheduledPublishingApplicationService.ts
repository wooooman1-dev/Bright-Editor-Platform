import type { PersistenceStore } from "../../../core/data";
import {
  assertScheduledPublicationTransition,
  assertValidScheduleTime,
  createScheduleRequestFingerprint,
  hasActiveScheduledPublication,
  isScheduledPublication,
  ScheduledPublicationError,
  type ScheduledPublication,
  type ScheduledPublicationStatus,
  type ScheduledPublishingRecord,
} from "../../../core/publishing";
import type { UserData } from "../../user-flow/user-data";

const USER_DATA_COLLECTION = "application";
const USER_DATA_ID = "user-data";

export type ScheduleAwareUserData = Omit<UserData, "scheduledPublishing"> & Readonly<{
  scheduledPublishing?: readonly ScheduledPublishingRecord[];
}>;

export type ScheduleReservationInput = Readonly<{
  id: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  platform: "tistory" | "wordpress";
  platformConnectionId: string;
  revisionId: string;
  scheduledAt: string;
  timezone: string;
  categoryId: string | null;
  categoryName: string | null;
  operationId: string;
  now?: string;
}>;

export type ScheduleReservationResult = Readonly<{
  data: ScheduleAwareUserData;
  reservation: ScheduledPublication;
  created: boolean;
}>;

export type ScheduleTransitionInput = Readonly<{
  workspaceId: string;
  scheduleId: string;
  status: ScheduledPublicationStatus;
  now?: string;
  registeredAt?: string;
  verifiedAt?: string;
  externalPostId?: string;
  externalManagementUrl?: string;
  publicUrl?: string;
  failureCode?: string;
  lastError?: string;
}>;

export class ScheduledPublishingApplicationService {
  constructor(
    private readonly store: PersistenceStore,
    private readonly now = () => new Date(),
  ) {}

  async reserve(input: ScheduleReservationInput): Promise<ScheduleReservationResult> {
    const now = normalizedTimestamp(input.now ?? this.now().toISOString(), "예약 생성 시각");
    const validatedTime = assertValidScheduleTime(
      { scheduledAt: input.scheduledAt, timezone: input.timezone },
      new Date(now),
    );
    const identity = Object.freeze({
      workspaceId: required(input.workspaceId, "Workspace ID"),
      contentId: required(input.contentId, "Content ID"),
      platform: input.platform,
      platformConnectionId: required(input.platformConnectionId, "PlatformConnection ID"),
      revisionId: required(input.revisionId, "Revision ID"),
      scheduledAt: validatedTime.scheduledAt,
      timezone: validatedTime.timezone,
    });
    const requestFingerprint = createScheduleRequestFingerprint(identity);
    const scheduleId = required(input.id, "Schedule ID");
    const projectId = required(input.projectId, "Project ID");
    const operationId = required(input.operationId, "Operation ID");
    let reservation: ScheduledPublication | undefined;
    let created = false;

    const data = await this.store.update<ScheduleAwareUserData>(USER_DATA_COLLECTION, USER_DATA_ID, (current) => {
      const owned = assertOwnedData(current, identity.workspaceId, projectId, identity.contentId);
      const records = owned.scheduledPublishing ?? [];
      const identical = records.find((record): record is ScheduledPublication => (
        isScheduledPublication(record)
        && record.requestFingerprint === requestFingerprint
        && record.status !== "cancelled"
        && record.status !== "published"
      ));
      if (identical) {
        reservation = identical;
        return owned;
      }
      if (records.some((record) => isScheduledPublication(record) && record.id === scheduleId)) {
        throw new ScheduledPublicationError("SCHEDULE_ID_CONFLICT", "같은 예약 ID가 다른 요청에 이미 사용되었습니다.");
      }
      if (hasActiveScheduledPublication(records, { contentId: identity.contentId, platform: identity.platform })) {
        throw new ScheduledPublicationError("SCHEDULE_ALREADY_ACTIVE", "이 콘텐츠에는 이미 활성 예약이 있습니다.");
      }

      reservation = Object.freeze({
        id: scheduleId,
        workspaceId: identity.workspaceId,
        projectId,
        contentId: identity.contentId,
        platform: input.platform,
        platformConnectionId: identity.platformConnectionId,
        revisionId: identity.revisionId,
        scheduledAt: identity.scheduledAt,
        timezone: identity.timezone,
        status: "registering",
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        requestFingerprint,
        operationId,
        attemptCount: 0,
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      created = true;
      return Object.freeze({
        ...owned,
        scheduledPublishing: Object.freeze([...records, reservation]),
      });
    });

    if (!reservation) {
      throw new ScheduledPublicationError("SCHEDULE_RESERVATION_MISSING", "예약 선점 결과를 확인할 수 없습니다.");
    }
    return Object.freeze({ data, reservation, created });
  }

  async beginAttempt(input: Readonly<{ workspaceId: string; scheduleId: string; now?: string }>): Promise<ScheduledPublication> {
    const now = normalizedTimestamp(input.now ?? this.now().toISOString(), "예약 시도 시각");
    let updated: ScheduledPublication | undefined;
    await this.store.update<ScheduleAwareUserData>(USER_DATA_COLLECTION, USER_DATA_ID, (current) => {
      const data = assertWorkspaceData(current, input.workspaceId);
      const record = findScheduledPublication(data, input.scheduleId);
      if (record.status === "failed") assertScheduledPublicationTransition(record.status, "registering");
      else if (record.status !== "registering") {
        throw new ScheduledPublicationError("SCHEDULE_ATTEMPT_NOT_ALLOWED", "현재 예약 상태에서는 등록 시도를 시작할 수 없습니다.");
      }
      updated = Object.freeze({
        ...record,
        status: "registering",
        attemptCount: record.attemptCount + 1,
        lastAttemptAt: now,
        failureCode: undefined,
        lastError: undefined,
        updatedAt: now,
      });
      return replaceSchedule(data, updated);
    });
    return requireUpdated(updated);
  }

  async transition(input: ScheduleTransitionInput): Promise<ScheduledPublication> {
    const now = normalizedTimestamp(input.now ?? this.now().toISOString(), "예약 상태 변경 시각");
    if (input.status === "scheduled_verified" && (!input.registeredAt || !input.verifiedAt)) {
      throw new ScheduledPublicationError(
        "SCHEDULE_VERIFICATION_EVIDENCE_REQUIRED",
        "예약 검증 완료에는 외부 등록 시각과 검증 시각이 필요합니다.",
      );
    }
    let updated: ScheduledPublication | undefined;
    await this.store.update<ScheduleAwareUserData>(USER_DATA_COLLECTION, USER_DATA_ID, (current) => {
      const data = assertWorkspaceData(current, input.workspaceId);
      const record = findScheduledPublication(data, input.scheduleId);
      assertScheduledPublicationTransition(record.status, input.status);
      const keepsFailure = input.status === "failed" || input.status === "scheduled_unverified";
      updated = Object.freeze({
        ...record,
        status: input.status,
        ...(!keepsFailure ? { failureCode: undefined, lastError: undefined } : {}),
        ...(input.registeredAt ? { registeredAt: normalizedTimestamp(input.registeredAt, "예약 등록 시각") } : {}),
        ...(input.verifiedAt ? { verifiedAt: normalizedTimestamp(input.verifiedAt, "예약 검증 시각") } : {}),
        ...(input.externalPostId ? { externalPostId: input.externalPostId } : {}),
        ...(input.externalManagementUrl ? { externalManagementUrl: input.externalManagementUrl } : {}),
        ...(input.publicUrl ? { publicUrl: input.publicUrl } : {}),
        ...(input.failureCode ? { failureCode: input.failureCode } : {}),
        ...(input.lastError ? { lastError: input.lastError } : {}),
        updatedAt: now,
      });
      return replaceSchedule(data, updated);
    });
    return requireUpdated(updated);
  }

  async recoverInterruptedRegistrations(input: Readonly<{
    workspaceId: string;
    staleBefore: string;
    now?: string;
  }>): Promise<readonly ScheduledPublication[]> {
    const staleBefore = Date.parse(normalizedTimestamp(input.staleBefore, "중단 판정 기준 시각"));
    const now = normalizedTimestamp(input.now ?? this.now().toISOString(), "예약 복구 시각");
    const recovered: ScheduledPublication[] = [];
    await this.store.update<ScheduleAwareUserData>(USER_DATA_COLLECTION, USER_DATA_ID, (current) => {
      const data = assertWorkspaceData(current, input.workspaceId);
      const records = (data.scheduledPublishing ?? []).map((record) => {
        if (!isScheduledPublication(record) || record.status !== "registering") return record;
        const updatedAt = Date.parse(record.updatedAt);
        if (!Number.isFinite(updatedAt) || updatedAt > staleBefore) return record;
        const next = Object.freeze({
          ...record,
          status: "scheduled_unverified" as const,
          failureCode: "SCHEDULE_REGISTRATION_INTERRUPTED",
          lastError: "예약 등록 작업이 중단되어 외부 상태를 다시 확인해야 합니다.",
          updatedAt: now,
        });
        recovered.push(next);
        return next;
      });
      return recovered.length
        ? Object.freeze({ ...data, scheduledPublishing: Object.freeze(records) })
        : data;
    });
    return Object.freeze(recovered);
  }
}

function assertOwnedData(
  data: ScheduleAwareUserData | undefined,
  workspaceId: string,
  projectId: string,
  contentId: string,
): ScheduleAwareUserData {
  const owned = assertWorkspaceData(data, workspaceId);
  const project = owned.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  const content = owned.contents.find((item) => (
    item.id === contentId
    && item.projectId === projectId
    && (item.workspaceId === undefined || item.workspaceId === workspaceId)
  ));
  if (!project || !content) {
    throw new ScheduledPublicationError("SCHEDULE_OWNERSHIP_INVALID", "예약 대상 Project 또는 Content의 소유권이 일치하지 않습니다.");
  }
  return owned;
}

function assertWorkspaceData(data: ScheduleAwareUserData | undefined, workspaceId: string): ScheduleAwareUserData {
  if (!data?.workspace || data.workspace.id !== workspaceId) {
    throw new ScheduledPublicationError("SCHEDULE_WORKSPACE_NOT_FOUND", "예약 대상 Workspace를 찾을 수 없습니다.");
  }
  return data;
}

function findScheduledPublication(data: ScheduleAwareUserData, scheduleId: string): ScheduledPublication {
  const record = (data.scheduledPublishing ?? []).find((candidate) => isScheduledPublication(candidate) && candidate.id === scheduleId);
  if (!record || !isScheduledPublication(record)) {
    throw new ScheduledPublicationError("SCHEDULE_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
  }
  if (record.workspaceId !== data.workspace?.id) {
    throw new ScheduledPublicationError("SCHEDULE_OWNERSHIP_INVALID", "예약 정보가 현재 Workspace에 속하지 않습니다.");
  }
  return record;
}

function replaceSchedule(data: ScheduleAwareUserData, record: ScheduledPublication): ScheduleAwareUserData {
  return Object.freeze({
    ...data,
    scheduledPublishing: Object.freeze((data.scheduledPublishing ?? []).map((candidate) => (
      isScheduledPublication(candidate) && candidate.id === record.id ? record : candidate
    ))),
  });
}

function requireUpdated(record: ScheduledPublication | undefined): ScheduledPublication {
  if (!record) throw new ScheduledPublicationError("SCHEDULE_UPDATE_MISSING", "예약 상태 변경 결과를 확인할 수 없습니다.");
  return record;
}

function normalizedTimestamp(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !Number.isFinite(Date.parse(normalized))) {
    throw new ScheduledPublicationError("SCHEDULE_TIMESTAMP_INVALID", `${label}이 유효하지 않습니다.`);
  }
  return normalized;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ScheduledPublicationError("SCHEDULE_CONTEXT_REQUIRED", `${label}가 필요합니다.`);
  return normalized;
}
