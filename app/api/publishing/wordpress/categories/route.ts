import { NextResponse } from "next/server";

import type { PlatformConnection } from "../../../../../core/connections";
import { PublishingPermissionGate } from "../../../../../core/publishing";
import { WordPressCategoryAdapter } from "../../../../../apps/wordpress";
import {
  connectionRepository,
  secretStore,
  targetRepository,
} from "../../../../application/connections/connection-runtime";
import {
  applyWordPressPublishingCategories,
  resolveWordPressCategorySelection,
} from "../../../../application/publishing/WordPressPublishingPreparation";
import { assertWordPressCategoryLookupAllowed } from "../../../../application/publishing/WordPressDraftReadiness";
import { isPlatformEnabled } from "../../../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../../../application/studio-store";
import type {
  UserContent,
  UserData,
  UserProject,
} from "../../../../user-flow/user-data";

type OwnedContext = Readonly<{
  data: UserData;
  project: UserProject;
  content: UserContent;
  connection: PlatformConnection;
}>;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await ownedContext(
      required(url.searchParams.get("workspaceId")),
      required(url.searchParams.get("projectId")),
      required(url.searchParams.get("contentId")),
      required(url.searchParams.get("connectionId")),
    );
    const catalog = await readCatalog(context);
    const selection = resolveWordPressCategorySelection({
      project: context.project,
      content: context.content,
      connection: context.connection,
      categoryResult: catalog,
    });

    return NextResponse.json({
      categories: catalog.categories,
      selection,
      preparation: context.content.publishingPreparation?.wordpress ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Readonly<{
      workspaceId?: string;
      projectId?: string;
      contentId?: string;
      connectionId?: string;
      categoryIds?: unknown;
    }>;
    const workspaceId = required(body.workspaceId);
    const projectId = required(body.projectId);
    const contentId = required(body.contentId);
    const connectionId = required(body.connectionId);
    const categoryIds = requiredCategoryIds(body.categoryIds);
    const context = await ownedContext(workspaceId, projectId, contentId, connectionId);

    new PublishingPermissionGate().authorize({
      workspaceId,
      projectId,
      contentId,
      platformConnectionId: connectionId,
      workflow: "category.select",
      finalConfirmation: true,
    }, context.connection);

    const catalog = await readCatalog(context);
    const updatedAt = new Date().toISOString();
    const data = await studioStore.update<UserData>("application", "user-data", (current) => {
      const fresh = currentData(current, workspaceId, projectId, contentId);
      return applyWordPressPublishingCategories(
        fresh,
        projectId,
        contentId,
        connectionId,
        categoryIds,
        catalog,
        updatedAt,
      );
    });
    const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
    const content = data.contents.find((item) => item.id === contentId
      && item.projectId === projectId
      && item.workspaceId === workspaceId);
    if (!project || !content) throw new Error("WordPress Category selection could not be restored.");

    const selection = resolveWordPressCategorySelection({
      project,
      content,
      connection: context.connection,
      categoryResult: catalog,
    });

    return NextResponse.json({
      categories: catalog.categories,
      selection,
      preparation: content.publishingPreparation?.wordpress ?? null,
      data,
    });
  } catch (error) {
    return failure(error);
  }
}

async function ownedContext(
  workspaceId: string,
  projectId: string,
  contentId: string,
  connectionId: string,
): Promise<OwnedContext> {
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) throw new Error("Workspace was not found.");
  if (!isPlatformEnabled(data, "wordpress")) throw new Error("WordPress is disabled in Workspace Settings.");

  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
  const content = data.contents.find((item) => item.id === contentId
    && item.projectId === projectId
    && item.workspaceId === workspaceId);
  if (!project || !content) throw new Error("WordPress publishing Project or Content was not found.");

  const connection = await connectionRepository.findById(connectionId);
  if (!connection
    || connection.workspaceId !== workspaceId
    || connection.platform !== "wordpress") {
    throw new Error("WordPress Connection was not found.");
  }

  const targets = targetRepository.listByProject
    ? await targetRepository.listByProject(projectId)
    : [];
  const selected = content.publishingAccountId === connectionId
    || content.selectedPublishingAccountIds?.includes(connectionId)
    || project.selectedPublishingAccountIds?.includes(connectionId);
  const selectedTarget = Boolean(selected
    && targets.some((target) => target.platform === "wordpress"
      && target.platformConnectionId === connectionId));
  if (!selectedTarget) throw new Error("Select this WordPress Connection as the publishing target.");

  return Object.freeze({ data, project, content, connection });
}

async function readCatalog(context: OwnedContext) {
  assertWordPressCategoryLookupAllowed(context);
  const siteUrl = publicString(context.connection, "siteUrl");
  const username = publicString(context.connection, "username");
  if (!siteUrl || !username || !context.connection.secretReference) {
    throw new Error("WordPress reconnect is required.");
  }

  let applicationPassword: string;
  try {
    applicationPassword = await secretStore.readSecret(context.connection.secretReference);
  } catch {
    throw new Error("WordPress reconnect is required.");
  }
  if (!applicationPassword.trim()) throw new Error("WordPress reconnect is required.");

  return new WordPressCategoryAdapter().listAllCategories({
    siteUrl,
    username,
    applicationPassword,
    platformConnectionId: context.connection.id,
    pageSize: 100,
  });
}

function currentData(
  data: UserData | undefined,
  workspaceId: string,
  projectId: string,
  contentId: string,
): UserData {
  if (data?.workspace?.id !== workspaceId
    || !data.projects.some((item) => item.id === projectId && item.workspaceId === workspaceId)
    || !data.contents.some((item) => item.id === contentId
      && item.projectId === projectId
      && item.workspaceId === workspaceId)) {
    throw new Error("WordPress publishing context changed before Category selection was saved.");
  }
  return data;
}

function requiredCategoryIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("Select at least one WordPress Category.");
  const categoryIds = [...new Set(value
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => String(item).trim())
    .filter(Boolean))];
  if (!categoryIds.length) throw new Error("Select at least one WordPress Category.");
  return Object.freeze(categoryIds);
}

function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Required WordPress publishing context is missing.");
  }
  return value.trim();
}

function publicString(connection: PlatformConnection, key: string): string | undefined {
  const value = connection.publicMetadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function failure(error: unknown) {
  const value = error instanceof Error ? error.message : "";
  const message = value && !/authorization|application password|basic\s+[a-z0-9+/=]+/i.test(value)
    ? value
    : "WordPress Category selection failed.";
  return NextResponse.json({ error: message }, { status: 400 });
}