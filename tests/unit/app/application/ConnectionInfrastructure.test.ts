import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { WindowsDpapiSecretStore } from "../../../../app/application/connections/WindowsDpapiSecretStore";
import { LocalConnectionJobRunner } from "../../../../app/application/connections/LocalConnectionJobRunner";

describe.runIf(process.platform === "win32")("Windows DPAPI SecretStore", () => {
  it("stores, reads, replaces, and deletes without plaintext", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-secret-")); const store = new WindowsDpapiSecretStore(directory);
    const reference = await store.storeSecret("wordpress", "secret-one"); expect(await store.readSecret(reference)).toBe("secret-one");
    expect(await readFile(join(directory, `${reference}.bin`), "utf8")).not.toContain("secret-one");
    await store.replaceSecret(reference, "secret-two"); expect(await store.readSecret(reference)).toBe("secret-two");
    await store.deleteSecret(reference); expect(await store.secretExists(reference)).toBe(false);
  });
  it("does not replace unreadable encrypted data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-secret-bad-")); const store = new WindowsDpapiSecretStore(directory);
    const reference = await store.storeSecret("wordpress", "safe"); const file = join(directory, `${reference}.bin`); await writeFile(file, "invalid", "utf8");
    await expect(store.readSecret(reference)).rejects.toThrow("Reconnect"); expect(await readFile(file, "utf8")).toBe("invalid");
  });
});

describe("LocalConnectionJobRunner", () => {
  it("reports completion and prevents duplicate active jobs", async () => {
    let finish!: () => void; const running = new Promise<void>((resolve) => finish = resolve); const runner = new LocalConnectionJobRunner(1000);
    const job = { connectionId: "connection-1", run: vi.fn(async (report: (state: "waiting_for_user", message: string) => void) => { report("waiting_for_user", "Waiting."); await running; }) };
    const status = await runner.start(job); await expect(runner.start(job)).rejects.toThrow("already active"); finish(); await vi.waitFor(() => expect(runner.status(status.id)?.state).toBe("completed"));
  });
  it("supports cancellation", async () => { const runner = new LocalConnectionJobRunner(); const status = await runner.start({ connectionId: "c", run: async (_report, signal) => new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")))) }); expect((await runner.cancel(status.id)).state).toBe("cancelled"); });
  it("preserves safe structured failure diagnostics instead of overwriting them", async () => {
    const runner = new LocalConnectionJobRunner();
    const status = await runner.start({ connectionId: "c", run: async (report) => { report("failed", "Worker unavailable.", { failureCode: "worker_not_registered", safeMessage: "The worker is unavailable.", remediation: "Restart Bright Studio." }); throw new Error("C:\\private\\worker stack"); } });
    await vi.waitFor(() => expect(runner.status(status.id)?.state).toBe("failed"));
    expect(runner.status(status.id)).toMatchObject({ failureCode: "worker_not_registered", safeMessage: "The worker is unavailable.", remediation: "Restart Bright Studio." });
    expect(JSON.stringify(runner.status(status.id))).not.toContain("private");
  });
});
