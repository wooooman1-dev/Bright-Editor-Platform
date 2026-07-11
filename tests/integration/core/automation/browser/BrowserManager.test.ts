import { afterEach, describe, expect, it } from "vitest";

import { BrowserManager } from "../../../../../core/automation/browser";

describe("BrowserManager", () => {
  let manager: BrowserManager | undefined;

  afterEach(async () => {
    await manager?.close();
  });

  it("launches Chromium", async () => {
    manager = new BrowserManager();

    const browser = await manager.launch();

    expect(browser.browserType().name()).toBe("chromium");
    expect(browser.isConnected()).toBe(true);
  });

  it("reuses a connected browser", async () => {
    manager = new BrowserManager();

    const firstBrowser = await manager.launch();
    const secondBrowser = await manager.launch();

    expect(secondBrowser).toBe(firstBrowser);
  });

  it("closes safely when called more than once", async () => {
    manager = new BrowserManager();
    const browser = await manager.launch();

    await manager.close();
    await manager.close();

    expect(browser.isConnected()).toBe(false);
  });
});
