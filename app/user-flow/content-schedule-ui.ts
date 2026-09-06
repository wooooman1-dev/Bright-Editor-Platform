import {
  isScheduledPublication,
  resolveScheduledPostStatus,
  terminalScheduledPublicationStatuses,
  type ScheduledPublication,
  type ScheduledPublicationStatus,
  type ScheduledPublishingRecord,
} from "../../core/publishing";

export type ContentSchedulePresentation = Readonly<{
  id: string;
  platformLabel: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "neutral";
  scheduledLabel: string;
  postStatusLabel: string;
  externalUrl?: string;
  failureReason?: string;
  active: boolean;
}>;

const platformLabels: Readonly<Record<string, string>> = {
  tistory: "티스토리",
  wordpress: "워드프레스",
};

const statusPresentation: Readonly<Record<ScheduledPublicationStatus, Readonly<{
  label: string;
  tone: ContentSchedulePresentation["statusTone"];
}>>> = {
  registering: { label: "등록 중", tone: "neutral" },
  scheduled_verified: { label: "예약 확인됨", tone: "success" },
  scheduled_unverified: { label: "외부 확인 필요", tone: "warning" },
  failed: { label: "실패", tone: "danger" },
  cancelled: { label: "취소됨", tone: "neutral" },
  published: { label: "발행됨", tone: "success" },
};

/**
 * Newest first so the most recent attempt leads. Legacy records predate the
 * schedule contract and carry no status, so they are not shown.
 */
export function contentSchedules(
  records: readonly ScheduledPublishingRecord[] | undefined,
  contentId: string,
): readonly ScheduledPublication[] {
  return Object.freeze((records ?? [])
    .filter((record): record is ScheduledPublication =>
      isScheduledPublication(record) && record.contentId === contentId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
}

export function partitionContentSchedules(
  schedules: readonly ScheduledPublication[],
): Readonly<{ active: readonly ScheduledPublication[]; finished: readonly ScheduledPublication[] }> {
  return Object.freeze({
    active: Object.freeze(schedules.filter((record) => !terminalScheduledPublicationStatuses.includes(record.status))),
    finished: Object.freeze(schedules.filter((record) => terminalScheduledPublicationStatuses.includes(record.status))),
  });
}

export function contentSchedulePresentation(record: ScheduledPublication): ContentSchedulePresentation {
  const status = statusPresentation[record.status];
  const failureReason = record.lastError ?? record.failureCode;
  return Object.freeze({
    id: record.id,
    platformLabel: platformLabels[record.platform] ?? record.platform,
    statusLabel: status.label,
    statusTone: status.tone,
    scheduledLabel: scheduledLabel(record),
    postStatusLabel: resolveScheduledPostStatus(record) === "future" ? "공개 예약" : "초안 예약",
    ...(record.externalManagementUrl || record.publicUrl
      ? { externalUrl: record.publicUrl ?? record.externalManagementUrl }
      : {}),
    ...(failureReason && (record.status === "failed" || record.status === "scheduled_unverified")
      ? { failureReason }
      : {}),
    active: record.status === "registering"
      || record.status === "scheduled_verified"
      || record.status === "scheduled_unverified",
  });
}

/**
 * Renders the instant in the timezone the schedule was registered with, so the
 * displayed wall clock always matches what the platform will act on.
 */
function scheduledLabel(record: ScheduledPublication): string {
  const timestamp = Date.parse(record.scheduledAt);
  if (!Number.isFinite(timestamp)) return `${record.scheduledAt} · ${record.timezone}`;
  try {
    const formatted = new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: record.timezone,
    }).format(new Date(timestamp));
    return `${formatted} · ${record.timezone}`;
  } catch {
    return `${record.scheduledAt} · ${record.timezone}`;
  }
}
