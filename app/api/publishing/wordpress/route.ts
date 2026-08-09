import { NextResponse } from "next/server";

import type { PlatformConnection } from "../../../../core/connections";
import { connectionRepository, secretStore, targetRepository } from "../../../application/connections/connection-runtime";
import { WordPressDraftApplicationService } from "../../../application/publishing/WordPressDraftApplicationService";
import { PersistentWordPressPublishingRecordRepository } from "../../../application/publishing/WordPressPublishingRecordRepository";
import { studioStore } from "../../../application/studio-store";
import { isPlatformEnabled } from "../../../application/settings/WorkspaceSettingsService";
import type { UserContent, UserData, UserProject } from "../../../user-flow/user-data";

const publishingRecords = new PersistentWordPressPublishingRecordRepository(studioStore);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await publishingContext(
      required(url.searchParams.get("workspaceId")),
      required(url.searchParams.get("projectId")),
      required(url.searchParams.get("contentId")),
      required(url.searchParams.get("connectionId")),
    );
    const execution = {
      data: context.data,
      projectId: context.project.id,
      contentId: context.content.id,
      connection: context.connection,
      selectedTarget: context.selectedTarget,
      finalConfirmation: url.searchParams.get("finalConfirmation") === "true",
    } as const;
    const application = service();
    const record = await application.existingRecord(execution);
    try {
      const readiness = await application.readiness(execution);
      return NextResponse.json({ readiness, record: record ?? null });
    } catch (error) {
      const readinessError = safeMessage(error, "WordPress Draft readiness could not be verified.");
      if (record) return NextResponse.json({ readiness: null, record, readinessError });
      throw new Error(readinessError);
    }
  } catch (error) {
    return NextResponse.json({ error: safeMessage(error, "WordPress Draft readiness could not be verified.") }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Readonly<{
      action?: "create_draft";
      workspaceId?: string;
      projectId?: string;
      contentId?: string;
      connectionId?: string;
      finalConfirmation?: boolean;
      slug?: string;
    }>;
    if (body.action !== "create_draft") {
      throw new Error("The requested WordPress workflow is not registered.");
    }
    const context = await publishingContext(
      required(body.workspaceId),
      required(body.projectId),
      required(body.contentId),
      required(body.connectionId),
    );
    const result = await service().execute({
      data: context.data,
      projectId: context.project.id,
      contentId: context.content.id,
      connection: context.connection,
      selectedTarget: context.selectedTarget,
      finalConfirmation: body.finalConfirmation === true,
      ...(typeof body.slug === "string" && body.slug.trim() ? { slug: body.slug.trim() } : {}),
    });
    const status = result.status === "verified" ? 200
      : result.status === "in_progress" || result.duplicateBlocked ? 409
        : 400;
    return NextResponse.json({ result }, { status });
  } catch (error) {
    return NextResponse.json({ error: safeMessage(error, "WordPress Draft creation failed.") }, { status: 400 });
  }
}

function service(): WordPressDraftApplicationService {
  return new WordPressDraftApplicationService({ secrets: secretStore, records: publishingRecords });
}

async function publishingContext(
  workspaceId: string,
  projectId: string,
  contentId: string,
  connectionId: string,
): Promise<Readonly<{
  data: UserData;
  project: UserProject;
  content: UserContent;
  connection: PlatformConnection;
  selectedTarget: boolean;
}>> {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) throw new Error("Workspace was not found.");
  if (!isPlatformEnabled(data, "wordpress")) throw new Error("WordPress is disabled in Workspace Settings.");
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  const content = data.contents.find((item) => item.id === contentId
    && item.projectId === projectId
    && item.workspaceId === workspaceId);
  if (!project || !content) throw new Error("WordPress publishing Project or Content was not found.");
  const connection = await connectionRepository.findById(connectionId);
  if (!connection || connection.workspaceId !== workspaceId || connection.platform !== "wordpress") {
    throw new Error("WordPress Connection was not found.");
  }
  const targets = targetRepository.listByProject ? await targetRepository.listByProject(projectId) : [];
  const selectedInContent = content.publishingAccountId === connectionId
    || content.selectedPublishingAccountIds?.includes(connectionId)
    || project.selectedPublishingAccountIds?.includes(connectionId);
  const selectedTarget = Boolean(selectedInContent
    && targets.some((target) => target.platform === "wordpress" && target.platformConnectionId === connectionId));
  return Object.freeze({ data, project, content, connection, selectedTarget });
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Required WordPress publishing context is missing.");
  return value.trim();
}

function safeMessage(error: unknown, fallback: string): string {
  const value = error instanceof Error ? error.message : "";
  return value && !/authorization|application password|basic\s+[a-z0-9+/=]+/i.test(value) ? value : fallback;
}
