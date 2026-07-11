import type { BrowserContext, Page } from "playwright";

import { BrowserManager } from "./BrowserManager";
import type { BrowserContextManagerOptions } from "./BrowserContextOptions";
import { BrowserSessionManager } from "./BrowserSessionManager";

export class BrowserContextManager {
  private readonly contextOptions: Omit<
    BrowserContextManagerOptions,
    "storageStatePath"
  >;
  private readonly sessionManager: BrowserSessionManager | undefined;
  private context: BrowserContext | undefined;

  constructor(
    private readonly browserManager: BrowserManager,
    options: BrowserContextManagerOptions = {},
  ) {
    const { storageStatePath, ...contextOptions } = options;

    this.contextOptions = contextOptions;
    this.sessionManager = storageStatePath
      ? new BrowserSessionManager(storageStatePath)
      : undefined;
  }

  async create(): Promise<BrowserContext> {
    if (this.context?.browser()?.isConnected()) {
      return this.context;
    }

    const browser = await this.browserManager.launch();
    const storageState = (await this.sessionManager?.exists())
      ? this.sessionManager?.getStorageStatePath()
      : undefined;

    this.context = await browser.newContext({
      ...this.contextOptions,
      storageState,
    });

    return this.context;
  }

  async newPage(): Promise<Page> {
    const context = await this.create();
    return context.newPage();
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = undefined;

    if (!context?.browser()?.isConnected()) {
      return;
    }

    await context.close();
  }
}
