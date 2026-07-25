import type { TistoryDraftSaveResult } from "./TistoryDraftSaveWorkflow";

export type TistoryDraftOutcomeStatus =
  | "verified"
  | "saved_unverified"
  | "duplicate_existing"
  | "diagnosed"
  | "failed";

export type TistoryDraftOutcome = Readonly<{
  status: TistoryDraftOutcomeStatus;
  diagnosticCode?: string;
  editorUrl?: string;
  canReverify: boolean;
  canRetrySave: boolean;
}>;

export function classifyTistoryDraftOutcome(result: TistoryDraftSaveResult): TistoryDraftOutcome {
  const failedRecord = result.steps?.find((step) => !step.passed);
  const diagnosticCode = failedRecord?.diagnosticCode;
  const editorUrl = safeTistoryEditorUrl(result.editorUrl ?? result.diagnostic?.currentUrl);

  if (result.status === "diagnosed") {
    return outcome("diagnosed", diagnosticCode, editorUrl, false, false);
  }

  if (diagnosticCode === "duplicate_draft_exists") {
    return outcome("duplicate_existing", diagnosticCode, editorUrl, true, false);
  }

  const reopenedVerified = result.reopenedDraftVerified === true
    && result.titleMatched === true
    && result.bodyMatched === true
    && result.publicPostCreated === false;
  if ((result.status === "saved" || result.status === "verified") && reopenedVerified) {
    return outcome("verified", diagnosticCode, editorUrl, false, false);
  }

  if (draftSaveConfirmed(result)) {
    return outcome("saved_unverified", diagnosticCode, editorUrl, true, false);
  }

  return outcome("failed", diagnosticCode, editorUrl, false, true);
}

function draftSaveConfirmed(result: TistoryDraftSaveResult): boolean {
  const confirmationStepPassed = result.steps?.some((step) => step.key === "draft_save_confirmed" && step.passed) === true;
  const countIncreased = typeof result.draftCountBefore === "number"
    && typeof result.draftCountAfter === "number"
    && result.draftCountAfter > result.draftCountBefore;
  return confirmationStepPassed && countIncreased;
}

function safeTistoryEditorUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/(?:^|\.)tistory\.com$/i.test(url.hostname)) return undefined;
    if (!url.pathname.startsWith("/manage")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function outcome(
  status: TistoryDraftOutcomeStatus,
  diagnosticCode: string | undefined,
  editorUrl: string | undefined,
  canReverify: boolean,
  canRetrySave: boolean,
): TistoryDraftOutcome {
  return Object.freeze({
    status,
    ...(diagnosticCode ? { diagnosticCode } : {}),
    ...(editorUrl ? { editorUrl } : {}),
    canReverify,
    canRetrySave,
  });
}
