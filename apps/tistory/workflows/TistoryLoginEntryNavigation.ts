import type { Page } from "playwright";

import { createTistoryUrls } from "../config/TistoryUrls";
import { TistoryLoginPage } from "../pages/TistoryLoginPage";

const LOGIN_NAVIGATION_TIMEOUT_MS = 15_000;
const LOGIN_ENTRY_TIMEOUT_MS = 10_000;

export type TistoryLoginEntryNavigationErrorCode =
  | "INVALID_BLOG_IDENTIFIER"
  | "NAVIGATION_FAILED"
  | "LOGIN_ENTRY_UNAVAILABLE";

export class TistoryLoginEntryNavigationError extends Error {
  constructor(
    message: string,
    readonly code: TistoryLoginEntryNavigationErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TistoryLoginEntryNavigationError";
  }
}

export type TistoryLoginEntryNavigationResult = Readonly<{
  loginUrl: string;
}>;

export async function navigateToTistoryLoginEntry(
  page: Page,
  blogName: string,
): Promise<TistoryLoginEntryNavigationResult> {
  const loginUrl = getLoginUrl(blogName);

  try {
    await page.goto(loginUrl, {
      timeout: LOGIN_NAVIGATION_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    throw new TistoryLoginEntryNavigationError(
      "Unable to navigate to the Tistory login entry.",
      "NAVIGATION_FAILED",
      { cause: error },
    );
  }

  try {
    const loginPage = new TistoryLoginPage(page);
    await loginPage.waitForLoginEntry(LOGIN_ENTRY_TIMEOUT_MS);
  } catch (error) {
    throw new TistoryLoginEntryNavigationError(
      "The Tistory login entry is unavailable.",
      "LOGIN_ENTRY_UNAVAILABLE",
      { cause: error },
    );
  }

  return Object.freeze({ loginUrl });
}

function getLoginUrl(blogName: string): string {
  try {
    return createTistoryUrls(blogName).login;
  } catch (error) {
    throw new TistoryLoginEntryNavigationError(
      "A valid Tistory blog identifier is required.",
      "INVALID_BLOG_IDENTIFIER",
      { cause: error },
    );
  }
}
