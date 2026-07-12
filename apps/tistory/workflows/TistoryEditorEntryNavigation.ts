import type { Page } from "playwright";

import { createTistoryUrls } from "../config/TistoryUrls";

const EDITOR_NAVIGATION_TIMEOUT_MS = 15_000;

export type TistoryEditorEntryNavigationErrorCode =
  | "INVALID_BLOG_IDENTIFIER"
  | "NAVIGATION_FAILED"
  | "EDITOR_ENTRY_UNAVAILABLE";

export class TistoryEditorEntryNavigationError extends Error {
  constructor(
    message: string,
    readonly code: TistoryEditorEntryNavigationErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TistoryEditorEntryNavigationError";
  }
}

export type TistoryEditorEntryNavigationResult = Readonly<{
  editorUrl: string;
}>;

export async function navigateToTistoryEditorEntry(
  page: Page,
  blogName: string,
): Promise<TistoryEditorEntryNavigationResult> {
  const editorUrl = getEditorUrl(blogName);

  try {
    await page.goto(editorUrl, {
      timeout: EDITOR_NAVIGATION_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    throw new TistoryEditorEntryNavigationError(
      "Unable to navigate to the Tistory editor entry.",
      "NAVIGATION_FAILED",
      { cause: error },
    );
  }

  if (page.url() !== editorUrl) {
    throw new TistoryEditorEntryNavigationError(
      "The Tistory editor entry is unavailable.",
      "EDITOR_ENTRY_UNAVAILABLE",
    );
  }

  return Object.freeze({ editorUrl });
}

function getEditorUrl(blogName: string): string {
  try {
    return createTistoryUrls(blogName).editor;
  } catch (error) {
    throw new TistoryEditorEntryNavigationError(
      "A valid Tistory blog identifier is required.",
      "INVALID_BLOG_IDENTIFIER",
      { cause: error },
    );
  }
}
