import { mkdtemp, open, readFile, readdir, rename, unlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { JsonFileSnapshotDriver } from "../../../../app/application/JsonFileSnapshotDriver";
import { SnapshotPersistenceStore, type PersistenceSnapshot, type PersistenceSnapshotDriver } from "../../../../core/data";

describe("studio persistence safety", () => {
  it("commits cross-collection batch mutations in one durable write", async () => {
    let snapshot: PersistenceSnapshot = { connections: { connection: { id: "connection" } }, references: { first: { connectionId: "connection" }, keep: { connectionId: "other" } } };
    const write = vi.fn(async (next: PersistenceSnapshot) => { snapshot = next; });
    const store = new SnapshotPersistenceStore({ read: async () => snapshot, write });
    await store.batch([{ type: "set", collection: "tombstones", id: "connection", value: { status: "archived" } }, { type: "delete", collection: "references", id: "first" }, { type: "delete", collection: "connections", id: "connection" }]);
    expect(write).toHaveBeenCalledOnce();
    expect(snapshot).toEqual({ connections: {}, references: { keep: { connectionId: "other" } }, tombstones: { connection: { status: "archived" } } });
  });

  it("serializes concurrent updates in call order without losing fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-persistence-order-"));
    const store = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(join(directory, "state.json")));
    await store.set("application", "user-data", { category: "old", strategy: "old" });
    const first = store.update<Record<string, string>>("application", "user-data", (current) => ({ ...current, category: "health" }));
    const second = store.update<Record<string, string>>("application", "user-data", (current) => ({ ...current, strategy: "expert" }));
    await Promise.all([first, second]);
    await expect(store.get("application", "user-data")).resolves.toEqual({ category: "health", strategy: "expert" });
  });

  it("continues the queue after a failed write and returns each caller its own result", async () => {
    let snapshot: PersistenceSnapshot = {};
    let writes = 0;
    const driver: PersistenceSnapshotDriver = { read: async () => snapshot, write: async (next) => { writes += 1; if (writes === 1) throw Object.assign(new Error("locked"), { code: "EPERM" }); snapshot = next; } };
    const store = new SnapshotPersistenceStore(driver);
    await expect(store.set("items", "first", 1)).rejects.toThrow("locked");
    await expect(store.set("items", "second", 2)).resolves.toBeUndefined();
    await expect(store.get("items", "second")).resolves.toBe(2);
  });

  it("retries a transient Windows EPERM after the file handle is closed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-persistence-retry-"));
    const file = join(directory, "state.json");
    await writeFile(file, JSON.stringify({ schemaVersion: 1, data: { old: { value: true } } }), "utf8");
    let failed = false;
    const renameWithOneFailure: typeof rename = vi.fn(async (source, destination) => {
      if (!failed && String(source).endsWith(".tmp") && destination === file) { failed = true; throw Object.assign(new Error("busy"), { code: "EPERM", syscall: "rename" }); }
      await rename(source, destination);
    }) as typeof rename;
    const driver = new JsonFileSnapshotDriver(file, { mkdir, open, rename: renameWithOneFailure, unlink });
    await driver.write({ current: { value: true } });
    expect(JSON.parse(await readFile(file, "utf8")).data).toEqual({ current: { value: true } });
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp") || name.endsWith(".bak"))).toEqual([]);
  });

  it("restores the backup and removes temporary files when replacement finally fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-persistence-restore-"));
    const file = join(directory, "state.json");
    const original = JSON.stringify({ schemaVersion: 1, data: { preserved: { value: true } } });
    await writeFile(file, original, "utf8");
    let destinationMoved = false;
    const failingRename: typeof rename = vi.fn(async (source, destination) => {
      const from = String(source), to = String(destination);
      if (from === file && to.endsWith(".bak")) { destinationMoved = true; return rename(source, destination); }
      if (from.endsWith(".bak") && to === file) return rename(source, destination);
      if (from.endsWith(".tmp") && to === file) throw Object.assign(new Error("busy"), { code: destinationMoved ? "EBUSY" : "EPERM", syscall: "rename" });
      return rename(source, destination);
    }) as typeof rename;
    const driver = new JsonFileSnapshotDriver(file, { mkdir, open, rename: failingRename, unlink });
    await expect(driver.write({ replacement: { value: true } })).rejects.toThrow("could not be saved safely");
    expect(await readFile(file, "utf8")).toBe(original);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp") || name.endsWith(".bak"))).toEqual([]);
  });
});
