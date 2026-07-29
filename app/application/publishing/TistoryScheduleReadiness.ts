import type { PlatformConnection } from "../../../core/connections";
import { normalizeContentPurpose } from "../../../core/approval";
import { contentRevisionId, isApprovalApplicationReady } from "../../../core/quality";
import {
  assertValidScheduleTime,
  hasActiveScheduledPublication,
  PublishingPermissionGate,
  type ScheduledPublishingRecord,
} from "../../../core/publishing";
import type { ApprovalAwareContent } from "../approval/ApprovalContentPolicy";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";
import { calculateTistoryReadiness, type TistoryReadinessCheck } from "./TistoryPublishingPreparation";

export type TistoryScheduleReadiness = Readonly<{
  ready: boolean;
  executable: boolean;
  checks: readonly TistoryReadinessCheck[];
}>;

export async function calculateTistoryScheduleReadiness(input: Readonly<{
  data: UserData;
  project: UserProject;
  content: UserContent;
  connection?: PlatformConnection;
  selectedTarget: boolean;
  scheduledAt: string;
  timezone: string;
  finalConfirmation: boolean;
  scheduledPublishing?: readonly ScheduledPublishingRecord[];
  now?: Date;
  root?: string;
}>): Promise<TistoryScheduleReadiness> {
  const base = await calculateTistoryReadiness({
    data: input.data,
    project: input.project,
    content: input.content,
    connection: input.connection,
    selectedTarget: input.selectedTarget,
    finalConfirmation: input.finalConfirmation,
    root: input.root,
  });
  const checks: TistoryReadinessCheck[] = base.checks.filter((check) => (
    check.key !== "permission_gate" && check.key !== "final_confirmation"
  ));

  const connection = input.connection;
  let schedulePermissionPassed = false;
  if (
    connection
    && connection.platform === "tistory"
    && input.data.workspace
    && connection.workspaceId === input.data.workspace.id
  ) {
    try {
      new PublishingPermissionGate().authorize({
        workspaceId: input.data.workspace.id,
        projectId: input.project.id,
        contentId: input.content.id,
        platformConnectionId: connection.id,
        workflow: "schedule.create",
        finalConfirmation: true,
      }, connection);
      schedulePermissionPassed = true;
    } catch {
      schedulePermissionPassed = false;
    }
  }
  checks.push({
    key: "schedule_permission",
    passed: schedulePermissionPassed,
    message: schedulePermissionPassed
      ? "Permission Gate에서 티스토리 예약 등록이 허용되었습니다."
      : "이 Tistory 계정의 예약 등록 권한을 설정에서 명시적으로 허용해 주세요.",
  });

  const timezonePolicyPassed = input.timezone.trim() === "Asia/Seoul";
  checks.push({
    key: "schedule_timezone_policy",
    passed: timezonePolicyPassed,
    message: timezonePolicyPassed
      ? "Tistory 예약 발행 MVP의 Asia/Seoul 시간대가 적용되었습니다."
      : "Tistory 예약 발행 MVP는 Asia/Seoul 시간대만 사용할 수 있습니다.",
  });

  let scheduleTimePassed = false;
  let scheduleTimeMessage = "예약 시각을 확인해 주세요.";
  try {
    const validated = assertValidScheduleTime(
      { scheduledAt: input.scheduledAt, timezone: input.timezone },
      input.now ?? new Date(),
    );
    scheduleTimePassed = true;
    scheduleTimeMessage = `${validated.timezone} 기준 미래 예약 시각이 확인되었습니다.`;
  } catch (error) {
    scheduleTimeMessage = error instanceof Error ? error.message : scheduleTimeMessage;
  }
  checks.push({ key: "schedule_time", passed: scheduleTimePassed, message: scheduleTimeMessage });

  const duplicatePassed = !hasActiveScheduledPublication(input.scheduledPublishing, {
    contentId: input.content.id,
    platform: "tistory",
  });
  checks.push({
    key: "active_schedule",
    passed: duplicatePassed,
    message: duplicatePassed
      ? "이 콘텐츠에 활성 티스토리 예약이 없습니다."
      : "이 콘텐츠에는 이미 활성 티스토리 예약이 있습니다. 기존 예약을 확인해 주세요.",
  });

  const revisionId = input.content.document ? contentRevisionId(input.content.document) : undefined;
  const approvalContent = input.content as ApprovalAwareContent;
  const approvalMode = normalizeContentPurpose(approvalContent.contentPurpose) === "adsense_approval";
  const approvalReportCurrent = Boolean(
    !approvalMode
    || (
      input.content.quality
      && revisionId
      && input.content.quality.reviewedRevisionId === revisionId
      && isApprovalApplicationReady(input.content.quality)
      && input.content.document?.metadata?.approvalEvidence?.reviewedRevisionId === revisionId
    )
  );
  checks.push({
    key: "approval_readiness",
    passed: approvalReportCurrent,
    message: approvalMode
      ? approvalReportCurrent
        ? "현재 Revision의 승인 준비 Readiness와 Evidence 검토가 확인되었습니다."
        : "현재 Revision의 승인 준비 Readiness와 Evidence 최종 검토가 필요합니다."
      : "일반 콘텐츠에는 별도의 승인 준비 Readiness가 필요하지 않습니다.",
  });

  checks.push({
    key: "final_confirmation",
    passed: input.finalConfirmation,
    message: input.finalConfirmation ? "예약 등록 최종 확인이 완료되었습니다." : "예약 등록 전 최종 확인이 필요합니다.",
  });

  const ready = checks.filter((check) => check.key !== "final_confirmation").every((check) => check.passed);
  return Object.freeze({
    ready,
    executable: ready && input.finalConfirmation,
    checks: Object.freeze(checks),
  });
}
