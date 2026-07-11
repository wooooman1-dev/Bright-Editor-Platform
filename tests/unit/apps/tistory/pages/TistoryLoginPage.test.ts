import type { Locator, Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import { TistoryLoginPage } from "../../../../../apps/tistory";
import { tistoryLoginSelectors } from "../../../../../apps/tistory/selectors/TistoryLoginSelectors";

describe("TistoryLoginPage", () => {
  it("creates the Kakao login-entry locator from the injected page", () => {
    const kakaoLoginLocator = {} as Locator;
    const getByRole = vi.fn(() => kakaoLoginLocator);
    const page = { getByRole } as unknown as Page;
    const loginPage = new TistoryLoginPage(page);

    expect(loginPage.kakaoLoginLink).toBe(kakaoLoginLocator);
    expect(getByRole).toHaveBeenCalledWith("link", {
      exact: true,
      name: tistoryLoginSelectors.kakaoLoginLinkName,
    });
  });

  it("creates the account lookup locator from the injected page", () => {
    const accountLookupLocator = {} as Locator;
    const getByRole = vi.fn(() => accountLookupLocator);
    const page = { getByRole } as unknown as Page;
    const loginPage = new TistoryLoginPage(page);

    expect(loginPage.accountLookupLink).toBe(accountLookupLocator);
    expect(getByRole).toHaveBeenCalledWith("link", {
      exact: true,
      name: tistoryLoginSelectors.accountLookupLinkName,
    });
  });

  it("keeps the confirmed login-entry selector names platform-specific", () => {
    expect(tistoryLoginSelectors).toEqual({
      accountLookupLinkName: "내 티스토리 계정을 모르겠어요",
      kakaoLoginLinkName: "카카오계정으로 로그인",
    });
  });
});
