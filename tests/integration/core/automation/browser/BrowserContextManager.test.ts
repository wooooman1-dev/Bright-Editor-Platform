import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BrowserContextManager,
  BrowserManager,
  BrowserSessionManager,
} from "../../../../../core/automation/browser";

describe("BrowserContextManager", () => {
  let browserManager: BrowserManager;
  let contextManagers: BrowserContextManager[];
  let temporaryDirectory: string;

  beforeEach(async () => {
    browserManager = new BrowserManager();
    contextManagers = [];
    temporaryDirectory = await mkdtemp(join(tmpdir(), "bright-context-"));
  });

  afterEach(async () => {
    await Promise.all(contextManagers.map((manager) => manager.close()));
    await browserManager.close();
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  function createContextManager(
    options?: ConstructorParameters<typeof BrowserContextManager>[1],
  ): BrowserContextManager {
    const manager = new BrowserContextManager(browserManager, options);
    contextManagers.push(manager);
    return manager;
  }

  it("creates and reuses a browser context", async () => {
    const manager = createContextManager();

    const firstContext = await manager.create();
    const secondContext = await manager.create();

    expect(secondContext).toBe(firstContext);
    expect(firstContext.browser()?.isConnected()).toBe(true);
  });

  it("creates a new page with normalized context options", async () => {
    const manager = createContextManager({
      locale: "ko-KR",
      viewport: { height: 720, width: 1280 },
    });

    const page = await manager.newPage();

    expect(await page.evaluate(() => navigator.language)).toBe("ko-KR");
    expect(page.viewportSize()).toEqual({ height: 720, width: 1280 });
  });

  it("loads an existing storage state from a normalized path", async () => {
    const storageStatePath = join(
      temporaryDirectory,
      "sessions",
      "nested",
      "..",
      "state.json",
    );
    const sessionManager = new BrowserSessionManager(storageStatePath);
    const seedManager = createContextManager();
    const seedContext = await seedManager.create();
    await seedContext.addCookies([
      {
        domain: "example.com",
        name: "test-session",
        path: "/",
        value: "saved",
      },
    ]);
    await sessionManager.save(seedContext);

    const manager = createContextManager({ storageStatePath });
    const context = await manager.create();

    expect(await context.cookies()).toContainEqual(
      expect.objectContaining({ name: "test-session", value: "saved" }),
    );
  });

  it("creates a context when an optional storage state is missing", async () => {
    const manager = createContextManager({
      storageStatePath: join(temporaryDirectory, "missing", "state.json"),
    });

    const context = await manager.create();

    expect(context.browser()?.isConnected()).toBe(true);
  });

  it("closes the browser context safely more than once", async () => {
    const manager = createContextManager();
    const page = await manager.newPage();

    await manager.close();
    await manager.close();

    expect(page.isClosed()).toBe(true);
  });
});
