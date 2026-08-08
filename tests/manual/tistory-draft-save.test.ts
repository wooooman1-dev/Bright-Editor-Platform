import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

import { TistoryPublishingAdapter } from "../../apps/tistory/publishing/TistoryPublishingAdapter";
import type { TistoryDraftSaveResult, TistoryDraftWorkflowStep } from "../../apps/tistory/workflows/TistoryDraftSaveWorkflow";
import { deriveContentTags, type ContentDocument } from "../../core/content";

const enabled = process.env.RUN_TISTORY_DRAFT_SAVE === "1";
const REQUIRED_REOPEN_STEPS: readonly TistoryDraftWorkflowStep["key"][] = [
  "draft_save_confirmed",
  "draft_list_opened",
  "draft_item_identified",
  "draft_reopened",
  "title_reverified",
  "body_reverified",
  "category_reverified",
  "structure_verified",
  "publication_state_verified",
  "draft_verified",
];

describe.skipIf(!enabled)("manual Tistory draft save", () => {
  it("saves one canonical draft, reopens it, and verifies the Stage 4 external gate", async () => {
    const blogId = required("TISTORY_BLOG_ID");
    const storageStatePath = required("TISTORY_STORAGE_STATE_PATH");
    const contentPath = required("TISTORY_CONTENT_PATH");
    const categoryId = required("TISTORY_CATEGORY_ID");
    const categoryName = required("TISTORY_CATEGORY_NAME");
    const document = JSON.parse(await readFile(contentPath, "utf8")) as ContentDocument;
    const prepared = await new TistoryPublishingAdapter().prepare({ content: document, platform: "tistory" });
    const root = await mkdtemp(path.join(tmpdir(), "bright-tistory-draft-gate-"));
    const commandPath = path.join(root, "command.json");

    try {
      await writeFile(commandPath, JSON.stringify({
        blogId,
        storageStatePath,
        title: prepared.payload.title,
        html: prepared.payload.html,
        tags: deriveContentTags(document),
        categoryId,
        categoryName,
      }), { encoding: "utf8", mode: 0o600 });

      const result = await runRegisteredDraftWorker(commandPath);

      expect(result.status).toBe("saved");
      expect(result.saveClicked).toBe(true);
      expect(result.draftSaveClickCount).toBe(1);
      expect(result.draftListVerified).toBe(true);
      expect(result.reopenedDraftVerified).toBe(true);
      expect(result.titleMatched).toBe(true);
      expect(result.bodyMatched).toBe(true);
      expect(result.publicPostCreated).toBe(false);

      for (const key of REQUIRED_REOPEN_STEPS) {
        expect(result.steps?.some((step) => step.key === key && step.passed === true)).toBe(true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});

function runRegisteredDraftWorker(commandPath: string): Promise<TistoryDraftSaveResult> {
  const worker = path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-draft-worker.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, commandPath], {
      cwd: process.cwd(),
      env: { ...process.env, BRIGHT_TISTORY_WORKER_DIAGNOSTICS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => stdout += String(data));
    child.stderr.on("data", (data) => stderr += String(data));
    child.on("error", () => reject(new Error("The registered Tistory draft workflow could not start.")));
    child.on("exit", () => {
      try {
        const line = stdout.trim().split(/\r?\n/).at(-1);
        if (!line) throw new Error("The registered Tistory draft workflow returned no result.");
        resolve(JSON.parse(line) as TistoryDraftSaveResult);
      } catch {
        reject(new Error(`The registered Tistory draft workflow returned an invalid result. ${stderr.trim().slice(0, 500)}`));
      }
    });
  });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
