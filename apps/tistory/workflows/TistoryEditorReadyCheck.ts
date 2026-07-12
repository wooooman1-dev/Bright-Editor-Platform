import type { Page } from "playwright";

import { createTistoryUrls } from "../config/TistoryUrls";
import {
  navigateToTistoryEditorEntry,
  TistoryEditorEntryNavigationError,
} from "./TistoryEditorEntryNavigation";

const EDITOR_READY_TIMEOUT_MS = 10_000;

export type TistoryEditorReadyCheckErrorCode =
  | "INVALID_BLOG_IDENTIFIER"
  | "EDITOR_NOT_READY"
  | "SESSION_EXPIRED"
  | "EDITOR_UNAVAILABLE";

export class TistoryEditorReadyCheckError extends Error {
  constructor(
    message: string,
    readonly code: TistoryEditorReadyCheckErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TistoryEditorReadyCheckError";
  }
}

export type TistoryEditorReadyCheckResult = Readonly<{
  editorUrl: string;
  status: "ready";
}>;

export async function checkTistoryEditorReady(
  page: Page,
  blogName: string,
): Promise<TistoryEditorReadyCheckResult> {
  const urls = getTistoryUrls(blogName);

  try {
    await navigateToTistoryEditorEntry(page, blogName);
  } catch (error) {
    throw normalizeEntryError(page.url(), urls.login, error);
  }

  try {
    await page.waitForLoadState("load", { timeout: EDITOR_READY_TIMEOUT_MS });
  } catch (error) {
    throw new TistoryEditorReadyCheckError(
      "The Tistory editor is not ready.",
      "EDITOR_NOT_READY",
      { cause: error },
    );
  }

  const currentUrl = page.url();

  if (isLoginUrl(currentUrl, urls.login)) {
    throw createSessionExpiredError();
  }

  if (currentUrl !== urls.editor) {
    throw createEditorUnavailableError();
  }

  return Object.freeze({ editorUrl: urls.editor, status: "ready" });
}

function getTistoryUrls(blogName: string) {
  try {
    return createTistoryUrls(blogName);
  } catch (error) {
    throw new TistoryEditorReadyCheckError(
      "A valid Tistory blog identifier is required.",
      "INVALID_BLOG_IDENTIFIER",
      { cause: error },
    );
  }
}

function normalizeEntryError(
  currentUrl: string,
  loginUrl: string,
  cause: unknown,
): TistoryEditorReadyCheckError {
  if (isLoginUrl(currentUrl, loginUrl)) {
    return createSessionExpiredError(cause);
  }

  if (
    cause instanceof TistoryEditorEntryNavigationError &&
    cause.code === "INVALID_BLOG_IDENTIFIER"
  ) {
    return new TistoryEditorReadyCheckError(
      "A valid Tistory blog identifier is required.",
      "INVALID_BLOG_IDENTIFIER",
      { cause },
    );
  }

  return createEditorUnavailableError(cause);
}

function isLoginUrl(currentUrl: string, loginUrl: string): boolean {
  return currentUrl === loginUrl || currentUrl.startsWith(`${loginUrl}?`);
}

function createSessionExpiredError(cause?: unknown) {
  return new TistoryEditorReadyCheckError(
    "The Tistory session has expired.",
    "SESSION_EXPIRED",
    cause === undefined ? undefined : { cause },
  );
}

function createEditorUnavailableError(cause?: unknown) {
  return new TistoryEditorReadyCheckError(
    "The Tistory editor is unavailable.",
    "EDITOR_UNAVAILABLE",
    cause === undefined ? undefined : { cause },
  );
}
