import { describe, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { TistoryDraftApplicationService } from "../../../../app/application/publishing/TistoryDraftApplicationService";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";

const connection: PlatformConnection = { id: "account", workspaceId: "workspace", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: { blogId: "blog" }, createdAt: "now", updatedAt: "now", selectedAsDefault: false, version: 1, automationPermissions: safeDraftPermissions, publishingPolicy: "review_first" };
const input = { workspaceId: "workspace", projectId: "project", contentId: "content", connection, document: { id: "content", title: "Harmless Verification Draft", blocks: [{ id: "p", type: "paragraph" as const, text: "Meaningful body content for verification." }] }, finalConfirmation: true, selectedTarget: false };

describe("Tistory publishing application boundary", () => {
  it("rejects client bypass when the account is not a selected Project target and audits failure", async () => {
    const audits = { save: vi.fn() };
    const result = await new TistoryDraftApplicationService(audits).execute(input);
    expect(result.status).toBe("failed"); expect(result.saveClicked).toBe(false);
    expect(audits.save).toHaveBeenCalledWith(expect.objectContaining({ workflow: "draft.create", result: "failed" }));
  });
  it("rejects expired or disconnected accounts before launching the registered worker", async () => {
    const result = await new TistoryDraftApplicationService({ save: vi.fn() }).execute({ ...input, selectedTarget: true, connection: { ...connection, status: "expired" } });
    expect(result.status).toBe("failed"); expect(result.error).toContain("verified");
  });
  it("passes the persisted selected category ID to the registered draft worker", async () => {
    const root = path.join(tmpdir(), `bright-tistory-draft-${Date.now()}`);
    const executeWorker = vi.fn(async (commandPath: string) => {
      const command = JSON.parse(await readFile(commandPath, "utf8")) as { categoryId?: string };
      expect(command.categoryId).toBe("category-42");
      return { saveClicked: true, saveNotificationDetected: true, draftIdDetected: true, draftListVerified: true, reopenedDraftVerified: true, titleMatched: true, bodyMatched: true, publicPostCreated: false as const, status: "saved" as const };
    });
    try {
      const result = await new TistoryDraftApplicationService({ save: vi.fn() }, root, () => new Date("2026-01-01T00:00:00.000Z"), executeWorker).execute({ ...input, selectedTarget: true, categoryId: "category-42", connection: { ...connection, publicMetadata: { blogId: "blog", sessionStateAvailable: true } } });
      expect(result.status).toBe("saved"); expect(executeWorker).toHaveBeenCalledOnce();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
