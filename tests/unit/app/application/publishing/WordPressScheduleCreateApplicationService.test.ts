import { describe, expect, it, vi } from "vitest";

import type { PlatformConnection } from "../../../../../core/connections";
import type {
  WordPressDraftApplicationService,
  WordPressDraftExecutionResult,
} from "../../../../../app/application/publishing/WordPressDraftApplicationService";
import {
  WordPressScheduleCreateApplicationService,
  WordPressScheduleCreateError,
} from "../../../../../app/application/publishing/WordPressScheduleCreateApplicationService";
import type { UserData } from "../../../../../app/user-flow/user-data";

const connection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  platform: "wordpress",
  status: "connected",
  publicMetadata: { siteUrl: "https://example.com" },
} as unknown as PlatformConnection;

function userData(overrides: Readonly<{
  wordpressSchedulePublicPublish?: boolean;
  contentPurpose?: string;
}> = {}): UserData {
  return {
    workspace: {
      id: "workspace-1",
      name: "Studio",
      settings: {
        enabledPlatforms: ["wordpress"],
        publishing: {
          reviewFirst: true,
          draftOnly: true,
          publicPublish: false,
          sequentialDraftSave: true,
          qualityApprovalRequired: true,
          wordpressSchedulePublicPublish: overrides.wordpressSchedulePublicPublish === true,
        },
        appearance: { theme: "system" },
      },
    },
    brands: [],
    projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project" }],
    contents: [{
      id: "content-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      title: "Title",
      ...(overrides.contentPurpose ? { contentPurpose: overrides.contentPurpose } : {}),
    }],
  } as unknown as UserData;
}

function drafts(result: WordPressDraftExecutionResult) {
  const execute = vi.fn<WordPressDraftApplicationService["execute"]>(async () => result);
  return { service: { execute } as unknown as WordPressDraftApplicationService, execute };
}

function executionResult(overrides: Partial<WordPressDraftExecutionResult> = {}): WordPressDraftExecutionResult {
  return Object.freeze({
    status: "verified",
    stage: "complete",
    cleanupRequired: false,
    uploadedMedia: [],
    externalId: "501",
    record: {
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:05.000Z",
    },
    ...overrides,
  } as WordPressDraftExecutionResult);
}

function input(overrides: Partial<Parameters<WordPressScheduleCreateApplicationService["execute"]>[0]> = {}) {
  return {
    data: userData(),
    projectId: "project-1",
    contentId: "content-1",
    connection,
    selectedTarget: true,
    scheduledAt: "2026-09-01T18:00:00+09:00",
    timezone: "Asia/Seoul",
    postStatus: "draft" as const,
    finalConfirmation: true,
    ...overrides,
  };
}

describe("WordPress schedule create application service", () => {
  it("delegates to the Draft pipeline with the requested schedule", async () => {
    const { service, execute } = drafts(executionResult());

    const result = await new WordPressScheduleCreateApplicationService(service).execute(input());

    expect(result.status).toBe("scheduled_verified");
    expect(result.externalPostId).toBe("501");
    expect(result.externalManagementUrl).toBe("https://example.com/wp-admin/post.php?post=501&action=edit");
    expect(execute.mock.calls[0][0]).toMatchObject({
      schedule: { scheduledAt: "2026-09-01T18:00:00+09:00", timezone: "Asia/Seoul", postStatus: "draft" },
    });
  });

  it("requests an explicit new attempt so a previous failed registration cannot block a retry", async () => {
    const { service, execute } = drafts(executionResult());

    await new WordPressScheduleCreateApplicationService(service).execute(input());

    expect(execute.mock.calls[0][0]).toMatchObject({ explicitNewAttempt: true });
  });

  it("blocks a public schedule while the Workspace keeps scheduled public publishing disabled", async () => {
    const { service, execute } = drafts(executionResult());

    await expect(new WordPressScheduleCreateApplicationService(service)
      .execute(input({ postStatus: "future" })))
      .rejects.toMatchObject({ code: "SCHEDULE_PUBLIC_PUBLISH_DISABLED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows a public schedule once the Workspace enables it", async () => {
    const { service, execute } = drafts(executionResult());

    const result = await new WordPressScheduleCreateApplicationService(service).execute(input({
      data: userData({ wordpressSchedulePublicPublish: true }),
      postStatus: "future",
    }));

    expect(result.status).toBe("scheduled_verified");
    expect(execute.mock.calls[0][0]).toMatchObject({ schedule: { postStatus: "future" } });
  });

  it("allows a public schedule for AdSense approval content when the explicit setting is enabled", async () => {
    const { service, execute } = drafts(executionResult());

    const result = await new WordPressScheduleCreateApplicationService(service).execute(input({
      data: userData({ wordpressSchedulePublicPublish: true, contentPurpose: "adsense_approval" }),
      postStatus: "future",
    }));
    expect(result.status).toBe("scheduled_verified");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("still allows a draft schedule for AdSense approval content", async () => {
    const { service } = drafts(executionResult());

    const result = await new WordPressScheduleCreateApplicationService(service).execute(input({
      data: userData({ wordpressSchedulePublicPublish: true, contentPurpose: "adsense_approval" }),
      postStatus: "draft",
    }));

    expect(result.status).toBe("scheduled_verified");
  });

  it("requires the selected account to be a publishing target and an explicit confirmation", async () => {
    const { service } = drafts(executionResult());
    const application = new WordPressScheduleCreateApplicationService(service);

    await expect(application.execute(input({ selectedTarget: false })))
      .rejects.toBeInstanceOf(WordPressScheduleCreateError);
    await expect(application.execute(input({ finalConfirmation: false })))
      .rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  });

  it.each([
    ["unknown_result" as const],
    ["verification_failed" as const],
  ])("preserves a %s execution as unverified instead of retrying", async (status) => {
    const { service } = drafts(executionResult({
      status,
      error: "external state unknown",
      record: {
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:05.000Z",
        safeErrorCode: "DRAFT_VERIFICATION_UNKNOWN",
      },
    } as Partial<WordPressDraftExecutionResult>));

    const result = await new WordPressScheduleCreateApplicationService(service).execute(input());

    expect(result.status).toBe("scheduled_unverified");
    expect(result.diagnosticCode).toBe("DRAFT_VERIFICATION_UNKNOWN");
    expect(result.registeredAt).toBe("2026-08-10T00:00:00.000Z");
  });

  it("reports a blocked duplicate execution as a failed schedule", async () => {
    const { service } = drafts(executionResult({
      status: "failed",
      duplicateBlocked: true,
      externalId: undefined,
      record: undefined,
      error: "already in progress",
    } as Partial<WordPressDraftExecutionResult>));

    const result = await new WordPressScheduleCreateApplicationService(service).execute(input());

    expect(result.status).toBe("failed");
    expect(result.diagnosticCode).toBe("WORDPRESS_SCHEDULE_DUPLICATE_BLOCKED");
    expect(result.externalManagementUrl).toBeUndefined();
  });
});
