import type { Locator, Page } from "playwright";

import { tistoryLoginSelectors } from "../selectors/TistoryLoginSelectors";

export class TistoryLoginPage {
  constructor(private readonly page: Page) {}

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
