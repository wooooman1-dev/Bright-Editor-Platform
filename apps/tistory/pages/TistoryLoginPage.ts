import type { Locator, Page } from "playwright";

import { tistoryLoginSelectors } from "../selectors/TistoryLoginSelectors";

export class TistoryLoginPage {
  constructor(private readonly page: Page) {}

  async waitForLoginEntry(timeout: number): Promise<void> {
    await this.kakaoLoginLink.waitFor({ state: "visible", timeout });
  }

  get kakaoLoginLink(): Locator {
    return this.page.getByRole("link", {
      exact: true,
      name: tistoryLoginSelectors.kakaoLoginLinkName,
    });
  }

  get accountLookupLink(): Locator {
    return this.page.getByRole("link", {
      exact: true,
      name: tistoryLoginSelectors.accountLookupLinkName,
    });
  }
}
