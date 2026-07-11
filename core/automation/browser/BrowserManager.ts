import { chromium, type Browser } from "playwright";

import {
  defaultBrowserOptions,
  type BrowserOptions,
} from "./BrowserOptions";

export class BrowserManager {
  private browser: Browser | undefined;

  constructor(private readonly options: BrowserOptions = defaultBrowserOptions) {}

  async launch(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    this.browser = await chromium.launch(this.options);
    return this.browser;
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;

    if (!browser?.isConnected()) {
      return;
    }

    await browser.close();
  }
}
