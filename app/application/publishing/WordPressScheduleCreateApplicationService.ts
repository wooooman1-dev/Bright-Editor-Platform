import { normalizeContentPurpose } from "../../../core/approval";
import type { PlatformConnection } from "../../../core/connections";
import type { ScheduledPostStatus } from "../../../core/publishing";
import { normalizeSiteUrl } from "../../../apps/wordpress";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { resolveWorkspaceSettings } from "../settings/WorkspaceSettingsService";
import type {
  WordPressDraftApplicationService,
  WordPressDraftExecutionResult,
} from "./WordPressDraftApplicationService";

export type WordPressScheduleCreateInput = Readonly<{
  data: UserData;
  projectId: string;
  contentId: string;
  connection: PlatformConnection;
  selectedTarget: boolean;
  scheduledAt: string;
  timezone: string;
  postStatus: ScheduledPostStatus;
  finalConfirmation: boolean;
}>;

export type WordPressScheduleCreateResult = Readonly<{
  status: "scheduled_verified" | "scheduled_unverified" | "failed";
  workflow: "schedule.create";
  postStatus: ScheduledPostStatus;
  registeredAt?: string;
  verifiedAt?: string;
  externalPostId?: string;
  externalManagementUrl?: string;
  diagnosticCode?: string;
  error?: string;
  execution: WordPressDraftExecutionResult;
}>;

export class WordPressScheduleCreateError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WordPressScheduleCreateError";
  }
}

/**
 * Owns the WordPress-specific schedule policy and maps a Draft pipeline
 * execution onto the platform-independent ScheduledPublication contract.
 * The external work itself is delegated, so the media, rendering, integrity and
 * verification behaviour stays identical to the Draft path. See D-038.
 */
export class WordPressScheduleCreateApplicationService {
  constructor(
    private readonly drafts: WordPressDraftApplicationService,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: WordPressScheduleCreateInput): Promise<WordPressScheduleCreateResult> {
    assertSchedulePolicy(input);
    const startedAt = this.now().toISOString();
    const execution = await this.drafts.execute({
      data: input.data,
      projectId: input.projectId,
      contentId: input.contentId,
      connection: input.connection,
      selectedTarget: input.selectedTarget,
      finalConfirmation: input.finalConfirmation,
      // Every registration carries its own final confirmation, so a previous
      // attempt that created nothing externally must not block this one.
      explicitNewAttempt: true,
      schedule: {
        scheduledAt: input.scheduledAt,
        timezone: input.timezone,
        postStatus: input.postStatus,
      },
    });
    return this.result(execution, input, startedAt);
  }

  private result(
    execution: WordPressDraftExecutionResult,
    input: WordPressScheduleCreateInput,
    startedAt: string,
  ): WordPressScheduleCreateResult {
    const externalPostId = execution.externalId;
    const externalManagementUrl = managementUrl(input.connection, externalPostId);
    const base = Object.freeze({
      workflow: "schedule.create" as const,
      postStatus: input.postStatus,
      ...(externalPostId ? { externalPostId } : {}),
      ...(externalManagementUrl ? { externalManagementUrl } : {}),
      execution,
    });
    if (execution.status === "verified") {
      return Object.freeze({
        ...base,
        status: "scheduled_verified",
        registeredAt: execution.record?.createdAt ?? startedAt,
        verifiedAt: execution.record?.updatedAt ?? this.now().toISOString(),
      });
    }
    // The post exists externally but its state could not be confirmed. Preserve
    // it as unverified so no automatic retry creates a second scheduled post.
    if (execution.status === "unknown_result" || execution.status === "verification_failed") {
      return Object.freeze({
        ...base,
        status: "scheduled_unverified",
        registeredAt: execution.record?.createdAt ?? startedAt,
        diagnosticCode: execution.record?.safeErrorCode ?? "WORDPRESS_SCHEDULE_UNVERIFIED",
        error: execution.error ?? "WordPress 예약 상태를 다시 확인해야 합니다.",
      });
    }
    return Object.freeze({
      ...base,
      status: "failed",
      diagnosticCode: execution.record?.safeErrorCode
        ?? (execution.duplicateBlocked ? "WORDPRESS_SCHEDULE_DUPLICATE_BLOCKED" : "WORDPRESS_SCHEDULE_CREATE_FAILED"),
      error: execution.error ?? "WordPress 예약 등록을 완료하지 못했습니다.",
    });
  }
}

function assertSchedulePolicy(input: WordPressScheduleCreateInput): void {
  if (input.connection.platform !== "wordpress") {
    throw new WordPressScheduleCreateError("PLATFORM_MISMATCH", "WordPress 발행 계정이 필요합니다.");
  }
  if (!input.selectedTarget) {
    throw new WordPressScheduleCreateError("TARGET_NOT_SELECTED", "선택한 WordPress 계정이 현재 Project의 발행 대상이 아닙니다.");
  }
  if (!input.finalConfirmation) {
    throw new WordPressScheduleCreateError("CONFIRMATION_REQUIRED", "예약 등록 전 최종 사용자 확인이 필요합니다.");
  }
  if (input.postStatus !== "future") return;

  const policy = resolveWorkspaceSettings(input.data);
  if (policy.publishing.wordpressSchedulePublicPublish !== true) {
    throw new WordPressScheduleCreateError(
      "SCHEDULE_PUBLIC_PUBLISH_DISABLED",
      "예약 공개 발행이 꺼져 있습니다. Workspace 설정에서 허용한 뒤 다시 시도하거나 초안 예약을 사용해 주세요.",
    );
  }
  const content = input.data.contents.find((item) => item.id === input.contentId);
  if (approvalPurpose(content)) {
    throw new WordPressScheduleCreateError(
      "SCHEDULE_APPROVAL_CONTENT_PUBLIC_BLOCKED",
      "AdSense 승인 준비 콘텐츠는 예약 공개 발행을 사용할 수 없습니다. 초안 예약으로 등록해 주세요.",
    );
  }
}

function approvalPurpose(content: UserContent | undefined): boolean {
  if (!content) return false;
  const aware = content as UserContent & Readonly<{ contentPurpose?: unknown }>;
  return normalizeContentPurpose(aware.contentPurpose) === "adsense_approval";
}

function managementUrl(connection: PlatformConnection, externalPostId?: string): string | undefined {
  const siteUrl = connection.publicMetadata.siteUrl;
  if (!externalPostId || typeof siteUrl !== "string" || !siteUrl.trim()) return undefined;
  try {
    return `${normalizeSiteUrl(siteUrl)}/wp-admin/post.php?post=${encodeURIComponent(externalPostId)}&action=edit`;
  } catch {
    return undefined;
  }
}
