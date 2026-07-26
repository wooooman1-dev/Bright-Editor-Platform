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
  const failedRecord = result.steps?.find((step) => !step.passed && step.warning !== true);
  const warningRecord = result.steps?.find((step) => !step.passed && step.warning === true);
  const diagnosticCode = failedRecord?.diagnosticCode ?? warningRecord?.diagnosticCode;
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
  if ((result.status === "saved" || result.status === "verified") && reopenedVerified && representativeVerificationPassed(result)) {
    return outcome("verified", diagnosticCode, editorUrl, false, false);
  }

  if (representativeUiWarningOnly(result)) {
    return outcome("verified", diagnosticCode, editorUrl, false, false);
  }

  if (draftSaveConfirmed(result)) {
    return outcome("saved_unverified", diagnosticCode, editorUrl, true, false);
  }

  return outcome("failed", diagnosticCode, editorUrl, false, true);
}

function representativeVerificationPassed(result: TistoryDraftSaveResult): boolean {
  const steps = result.steps ?? [];
  const representativeRequired = steps.some((step) =>
    step.key === "representative_image_verified"
    || step.key === "representative_persisted_verified"
    || step.key === "representative_reverified"
    || Boolean(step.evidence?.representative && typeof step.evidence.representative === "object" && !(step.evidence.representative as { skipped?: unknown }).skipped),
  );
  if (!representativeRequired) return true;
  return steps.some((step) => step.key === "representative_image_verified" && step.passed === true)
    && steps.some((step) => step.key === "representative_persisted_verified" && step.passed === true);
}

function representativeUiWarningOnly(result: TistoryDraftSaveResult): boolean {
  if (!["partial_failure", "partially_verified"].includes(result.status)) return false;
  const steps = result.steps ?? [];
  const required = [
    "draft_save_confirmed",
    "title_reverified",
    "body_reverified",
    "media_reverified",
    "representative_image_verified",
    "representative_persisted_verified",
    "category_reverified",
    "tags_reverified",
    "structure_verified",
    "publication_state_verified",
    "draft_verified",
  ] as const;
  if (!required.every((key) => steps.some((step) => step.key === key && step.passed === true))) return false;
  const failures = steps.filter((step) => !step.passed);
  return failures.length > 0 && failures.every((step) =>
    step.key === "representative_reverified"
    && step.warning === true
    && step.diagnosticCode === "tistory_representative_ui_not_rehydrated",
  );
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
