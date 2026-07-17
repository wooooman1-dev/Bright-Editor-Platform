import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { UserData } from "../../user-flow/user-data";

export type ContentDeletionImpact = Readonly<{
  contentId: string;
  projectId: string;
  title: string;
  historyCount: number;
  qualityReportCount: number;
  publishingRecordCount: number;
  scheduledPublishingCount: number;
  mediaMetadataCount: number;
  externalPostsDeleted: false;
}>;

export type ContentDeletionResult = Readonly<{
  data: UserData;
  impact: ContentDeletionImpact;
  backupFileName: string;
}>;

export class ContentDeletionService {
  constructor(
    private readonly backupRoot = path.join(process.cwd(), ".bright-studio", "backups", "content-deletions"),
    private readonly now = () => new Date(),
  ) {}

  impact(data: UserData, workspaceId: string, contentId: string): ContentDeletionImpact {
    const content = data.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId);
    if (!data.workspace || data.workspace.id !== workspaceId || !content) {
      throw new Error("삭제할 콘텐츠를 찾을 수 없습니다.");
    }

    return Object.freeze({
      contentId,
      projectId: content.projectId,
      title: content.title,
      historyCount: (data.history ?? []).filter((item) => item.contentId === contentId).length,
      qualityReportCount: (data.qualityReports ?? []).filter((item) => item.contentId === contentId).length,
      publishingRecordCount: (data.publishingRecords ?? []).filter((item) => item.contentId === contentId).length,
      scheduledPublishingCount: (data.scheduledPublishing ?? []).filter((item) => item.contentId === contentId).length,
      mediaMetadataCount: (data.mediaMetadata ?? []).filter((item) => (item as { contentId?: string }).contentId === contentId).length,
      externalPostsDeleted: false,
    });
  }

  async delete(data: UserData, input: Readonly<{
    workspaceId: string;
    contentId: string;
    confirmationTitle: string;
  }>): Promise<ContentDeletionResult> {
    const impact = this.impact(data, input.workspaceId, input.contentId);
    if (input.confirmationTitle.trim() !== impact.title) {
      throw new Error("삭제 확인을 위해 현재 콘텐츠 제목을 정확히 입력해 주세요.");
    }

    const deletedContent = data.contents.find((item) => item.id === input.contentId)!;
    const deletedHistory = (data.history ?? []).filter((item) => item.contentId === input.contentId);
    const deletedQualityReports = (data.qualityReports ?? []).filter((item) => item.contentId === input.contentId);
    const deletedPublishingRecords = (data.publishingRecords ?? []).filter((item) => item.contentId === input.contentId);
    const deletedScheduledPublishing = (data.scheduledPublishing ?? []).filter((item) => item.contentId === input.contentId);
    const deletedMediaMetadata = (data.mediaMetadata ?? []).filter((item) => (item as { contentId?: string }).contentId === input.contentId);

    const timestamp = this.now().toISOString();
    const safeTimestamp = timestamp.replace(/[:.]/g, "-");
    const backupFileName = `${safeTimestamp}-${safeFileName(input.contentId)}.json`;
    await mkdir(this.backupRoot, { recursive: true });
    await writeFile(
      path.join(this.backupRoot, backupFileName),
      JSON.stringify({
        schemaVersion: 1,
        deletedAt: timestamp,
        workspaceId: input.workspaceId,
        impact,
        content: deletedContent,
        history: deletedHistory,
        qualityReports: deletedQualityReports,
        publishingRecords: deletedPublishingRecords,
        scheduledPublishing: deletedScheduledPublishing,
        mediaMetadata: deletedMediaMetadata,
      }, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );

    const next: UserData = {
      ...data,
      contents: data.contents.filter((item) => item.id !== input.contentId),
      history: (data.history ?? []).filter((item) => item.contentId !== input.contentId),
      qualityReports: (data.qualityReports ?? []).filter((item) => item.contentId !== input.contentId),
      publishingRecords: (data.publishingRecords ?? []).filter((item) => item.contentId !== input.contentId),
      scheduledPublishing: (data.scheduledPublishing ?? []).filter((item) => item.contentId !== input.contentId),
      mediaMetadata: (data.mediaMetadata ?? []).filter((item) => (item as { contentId?: string }).contentId !== input.contentId),
    };

    return Object.freeze({ data: next, impact, backupFileName });
  }
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "content";
}
