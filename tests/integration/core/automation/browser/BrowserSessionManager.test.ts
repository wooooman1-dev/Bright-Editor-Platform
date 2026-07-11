import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BrowserManager,
  BrowserSessionError,
  BrowserSessionManager,
} from "../../../../../core/automation/browser";

describe("BrowserSessionManager", () => {
  let browserManager: BrowserManager;
  let temporaryDirectory: string;

  beforeEach(async () => {
    browserManager = new BrowserManager();
    temporaryDirectory = await mkdtemp(join(tmpdir(), "bright-browser-session-"));
  });

  afterEach(async () => {
    await browserManager.close();
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  it("resolves the storage state path predictably", () => {
    const inputPath = join(temporaryDirectory, "nested", "..", "session.json");
    const manager = new BrowserSessionManager(inputPath);

    expect(manager.getStorageStatePath()).toBe(
      resolve(temporaryDirectory, "session.json"),
    );
  });

  it("rejects an invalid storage state path", () => {
    expect(() => new BrowserSessionManager("  ")).toThrow(BrowserSessionError);
  });

  it("reports a missing session", async () => {
    const manager = new BrowserSessionManager(
      join(temporaryDirectory, "missing", "session.json"),
    );

    await expect(manager.exists()).resolves.toBe(false);
  });

  it("saves storage state and reports that it exists", async () => {
    const storageStatePath = join(
      temporaryDirectory,
      "created-directory",
      "session.json",
    );
    const manager = new BrowserSessionManager(storageStatePath);
    const browser = await browserManager.launch();
    const context = await browser.newContext();

    await manager.save(context);

    await expect(manager.exists()).resolves.toBe(true);
    await expect(readFile(storageStatePath, "utf8")).resolves.toContain(
      '"cookies": []',
    );

    await context.close();
  });

  it("deletes a saved session safely more than once", async () => {
    const manager = new BrowserSessionManager(
      join(temporaryDirectory, "session.json"),
    );
    const browser = await browserManager.launch();
    const context = await browser.newContext();
    await manager.save(context);

    await manager.delete();
    await manager.delete();

    await expect(manager.exists()).resolves.toBe(false);
    await context.close();
  });
});
