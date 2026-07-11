import type { BrowserContextOptions as PlaywrightBrowserContextOptions } from "playwright";

export type BrowserContextManagerOptions = Omit<
  PlaywrightBrowserContextOptions,
  "storageState"
> & {
  storageStatePath?: string;
};
