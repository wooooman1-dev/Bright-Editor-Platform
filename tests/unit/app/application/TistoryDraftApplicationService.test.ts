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
      const command = JSON.parse(await readFile(commandPath, "utf8")) as { categoryId?: string; categoryName?: string };
      expect(command.categoryId).toBe("category-42");
      expect(command.categoryName).toBe("Health");
      return { saveClicked: true, saveNotificationDetected: true, draftIdDetected: true, draftListVerified: true, reopenedDraftVerified: true, titleMatched: true, bodyMatched: true, publicPostCreated: false as const, status: "saved" as const };
    });
    try {
      const result = await new TistoryDraftApplicationService({ save: vi.fn() }, root, () => new Date("2026-01-01T00:00:00.000Z"), executeWorker).execute({ ...input, selectedTarget: true, categoryId: "category-42", categoryName: "Health", connection: { ...connection, publicMetadata: { blogId: "blog", sessionStateAvailable: true } } });
      expect(result.status).toBe("saved"); expect(executeWorker).toHaveBeenCalledOnce();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("preserves the exact failed workflow step instead of reporting a false success", async () => {
    const executeWorker = vi.fn(async () => ({ saveClicked: true, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: true, bodyMatched: true, publicPostCreated: false as const, status: "failed" as const, failedStep: "draft_save_confirmed" as const, steps: [{ key: "title_filled" as const, passed: true, message: "ok" }, { key: "draft_save_confirmed" as const, passed: false, diagnosticCode: "draft_save_not_confirmed", message: "not confirmed" }], error: "not confirmed" }));
    const result = await new TistoryDraftApplicationService({ save: vi.fn() }, path.join(tmpdir(), `bright-tistory-step-${Date.now()}`), undefined, executeWorker).execute({ ...input, selectedTarget: true, categoryId: "category-42", categoryName: "Health", connection: { ...connection, publicMetadata: { blogId: "blog", sessionStateAvailable: true } } });
    expect(result.status).toBe("failed");
    expect(result.failedStep).toBe("draft_save_confirmed");
    expect(result.steps?.find((step) => !step.passed)?.diagnosticCode).toBe("draft_save_not_confirmed");
  });
  it("runs the fixed body-editor probe as draft.verify without a save click", async () => {
    const root = path.join(tmpdir(), `bright-tistory-probe-${Date.now()}`);
    const audits = { save: vi.fn() };
    const executeWorker = vi.fn(async (commandPath: string) => {
      const command = JSON.parse(await readFile(commandPath, "utf8")) as { diagnosticMode?: string };
      expect(command.diagnosticMode).toBe("body_editor_probe");
      return { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false as const, status: "diagnosed" as const, steps: [] };
    });
    try {
      const result = await new TistoryDraftApplicationService(audits, root, undefined, executeWorker).execute({ ...input, selectedTarget: true, categoryId: "category-42", categoryName: "Health", diagnosticMode: "body_editor_probe", connection: { ...connection, publicMetadata: { blogId: "blog", sessionStateAvailable: true } } });
      expect(result.status).toBe("diagnosed");
      expect(result.saveClicked).toBe(false);
      expect(audits.save).toHaveBeenCalledWith(expect.objectContaining({ workflow: "draft.verify", requiredPermission: "draft.verify", result: "diagnosed" }));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("runs the fixed read-only Draft reopen workflow through draft.verify", async () => {
    const root = path.join(tmpdir(), `bright-tistory-reopen-${Date.now()}`);
    const audits = { save: vi.fn() };
    const executeWorker = vi.fn(async (commandPath: string) => {
      const command = JSON.parse(await readFile(commandPath, "utf8")) as { diagnosticMode?: string };
      expect(command.diagnosticMode).toBe("draft_reopen_verify");
      return { saveClicked: false, saveNotificationDetected: false, draftIdDetected: true, draftListVerified: true, reopenedDraftVerified: true, titleMatched: true, bodyMatched: true, publicPostCreated: false as const, status: "verified" as const, draftSaveClickCount: 0 };
    });
    try {
      const result = await new TistoryDraftApplicationService(audits, root, undefined, executeWorker).execute({ ...input, selectedTarget: true, categoryId: "category-42", categoryName: "Health", diagnosticMode: "draft_reopen_verify", connection: { ...connection, publicMetadata: { blogId: "blog", sessionStateAvailable: true } } });
      expect(result.status).toBe("verified");
      expect(result.saveClicked).toBe(false);
      expect(result.draftSaveClickCount).toBe(0);
      expect(audits.save).toHaveBeenCalledWith(expect.objectContaining({ workflow: "draft.verify", requiredPermission: "draft.verify", result: "verified" }));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("preserves partial failure after a single external draft click", async () => {
    const executeWorker = vi.fn(async () => ({ saveClicked: true, saveNotificationDetected: true, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: true, bodyMatched: false, publicPostCreated: false as const, status: "partial_failure" as const, failedStep: "body_reverified" as const, draftSaveClickCount: 1, steps: [{ key: "draft_save_clicked" as const, passed: true, message: "clicked" }, { key: "body_reverified" as const, passed: false, diagnosticCode: "reopened_body_empty", message: "empty" }], error: "empty" }));
    const result = await new TistoryDraftApplicationService({ save: vi.fn() }, path.join(tmpdir(), `bright-tistory-partial-${Date.now()}`), undefined, executeWorker).execute({ ...input, selectedTarget: true, categoryId: "category-42", categoryName: "Health", connection: { ...connection, publicMetadata: { blogId: "blog", sessionStateAvailable: true } } });
    expect(result.status).toBe("partial_failure");
    expect(result.draftSaveClickCount).toBe(1);
    expect(result.failedStep).toBe("body_reverified");
  });
});
