import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveTistoryConnectionWorkerPath, TistoryLoginJob } from "../../../../../apps/tistory/connections/TistoryLoginJob";
import type { ConnectionFailureDiagnostic, ConnectionJobState } from "../../../../../core/connections";

describe("TistoryLoginJob worker path", () => {
  it("resolves the repository-local worker with a Windows-safe string path", () => {
    const root = path.join(path.parse(process.cwd()).root, "bright-editor-platform-test");
    expect(() => resolveTistoryConnectionWorkerPath(root)).not.toThrow();
    const worker = resolveTistoryConnectionWorkerPath(root);
    expect(typeof worker).toBe("string");
    expect(worker).toBe(path.resolve(root, "apps", "tistory", "connections", "tistory-connection-worker.mjs"));
    expect(worker).not.toMatch(/^file:/i);
  });

  it("resolves to the registered worker that exists in this repository", async () => {
    const worker = resolveTistoryConnectionWorkerPath();
    await expect(access(worker)).resolves.toBeUndefined();
    expect(path.relative(process.cwd(), worker)).toBe(path.join("apps", "tistory", "connections", "tistory-connection-worker.mjs"));
  });

  it("returns worker_not_registered safely when the worker file is missing", async () => {
    const missing = path.resolve(process.cwd(), "missing", "tistory-connection-worker.mjs");
    const reports: Array<{ state: ConnectionJobState; message: string; diagnostic?: ConnectionFailureDiagnostic }> = [];
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const job = new TistoryLoginJob("connection-1", "blog", "storage.json", vi.fn(), missing);
    await expect(job.run((state, message, diagnostic) => reports.push({ state, message, diagnostic }), new AbortController().signal)).rejects.toThrow();
    expect(reports).toEqual([expect.objectContaining({ state: "failed", diagnostic: expect.objectContaining({ failureCode: "worker_not_registered" }) })]);
    expect(JSON.stringify(reports)).not.toContain(missing);
    consoleSpy.mockRestore();
  });
});
