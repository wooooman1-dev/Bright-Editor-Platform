import type { Page } from "playwright";

export type TistoryDraftStartupFailure = Readonly<{
  failedStep: "session_loaded" | "editor_opened" | "editor_ready";
  diagnosticCode: string;
  safeMessage: string;
}>;

export function openTistoryEditor(
  page: Page,
  blogId: string,
  options?: Readonly<{ attempts?: number; timeout?: number; retryDelay?: number }>,
): Promise<Readonly<{ attempt: number; editorUrl: string }>>;

export function normalizeTistoryDraftStartupError(
  error: unknown,
  phase: "command_loaded" | "browser_launched" | "session_loaded" | "editor_navigation" | "editor_ready",
): TistoryDraftStartupFailure;
