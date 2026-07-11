import type { LaunchOptions } from "playwright";

export type BrowserOptions = Pick<LaunchOptions, "args" | "headless" | "slowMo">;

export const defaultBrowserOptions: BrowserOptions = {
  headless: true,
};
