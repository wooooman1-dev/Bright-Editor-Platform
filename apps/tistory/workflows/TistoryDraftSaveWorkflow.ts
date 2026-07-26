import type { EditorAdapter } from "../../../core/editor";
import type { TistoryDraftCommand } from "../publishing/TistoryPublishingAdapter";

export type TistoryDraftVerification = Readonly<{
  saveClicked: boolean;
  saveNotificationDetected: boolean;
  draftIdDetected: boolean;
  draftListVerified: boolean;
  reopenedDraftVerified: boolean;
  titleMatched: boolean;
  bodyMatched: boolean;
  publicPostCreated: false;
}>;
export type TistoryDraftRuntimeFailure = Readonly<{
  name?: string;
  message?: string;
}>;
export type TistoryDraftDiagnostic = Readonly<{
  runtimeFailure?: TistoryDraftRuntimeFailure;
  currentUrl?: string;
  [key: string]: unknown;
}>;
export type TistoryDraftSaveResult = TistoryDraftVerification & Readonly<{
  status: "saved" | "verified" | "partial_failure" | "partially_verified" | "diagnosed" | "failed";
  steps?: readonly TistoryDraftWorkflowStep[];
  failedStep?: TistoryDraftWorkflowStep["key"];
  error?: string;
  draftId?: string;
  draftCount?: number;
  draftCountBefore?: number;
  draftCountAfter?: number;
  draftSaveClickCount?: number;
  savedAt?: string;
  verification?: Readonly<Record<string, unknown>>;
  diagnostic?: TistoryDraftDiagnostic;
  draftList?: Readonly<Record<string, unknown>>;
  editorUrl?: string;
  probe?: TistoryBodyEditorProbeResult;
}>;
export type TistoryBodyEditorProbeResult = Readonly<{
  modeBefore: string;
  modeAfter: string;
  modeRestored: string;
  candidates: readonly Record<string, unknown>[];
  selectedIndex?: number;
  instanceContainsProbe: boolean;
  stableAfterReactUpdate: boolean;
  backingTextareaApplicable: boolean;
  textareaContainsProbe: boolean;
  renderedContainsProbe: boolean;
  renderedProbeDiagnostic?: Readonly<Record<string, unknown>>;
  changeObserved: boolean;
  controllerCallbackInvoked?: boolean;
  restored: boolean;
  draftCountBefore?: number;
  draftCountAfter?: number;
  restrictedControlClicks: number;
}>;
export type TistoryDraftWorkflowStep = Readonly<{
  key: "session_loaded" | "editor_opened" | "editor_ready" | "draft_preflight" | "body_editor_identified" | "probe_applied" | "probe_verified" | "probe_restored" | "category_applied" | "category_verified" | "title_filled" | "title_verified" | "html_mode_opened" | "body_filled" | "body_verified" | "media_prepared" | "representative_image_verified" | "representative_persisted_verified" | "tags_filled" | "tags_verified" | "draft_save_clicked" | "draft_save_confirmed" | "draft_list_opened" | "draft_item_identified" | "draft_reopened" | "title_reverified" | "body_reverified" | "media_reverified" | "representative_reverified" | "category_reverified" | "tags_reverified" | "structure_verified" | "publication_state_verified" | "draft_verified";
  passed: boolean;
  warning?: boolean;
  diagnosticCode?: string;
  message: string;
  evidence?: Readonly<Record<string, unknown>>;
}>;

export interface TistoryDraftVerifier { verifyDraft(command: TistoryDraftCommand): Promise<Omit<TistoryDraftSaveResult, "status">>; }

export async function saveTistoryDraft(adapter: EditorAdapter, command: TistoryDraftCommand): Promise<TistoryDraftSaveResult> {
  try {
    await adapter.prepare();
    if (!await adapter.isReady()) return failed("Tistory editor is not ready.");
    await adapter.setTitle(command.title);
    await adapter.setContent(command.html);
    await adapter.saveDraft();
    if (!("verifyDraft" in adapter) || typeof adapter.verifyDraft !== "function") {
      return { ...emptyVerification(), saveClicked: true, status: "partially_verified" };
    }
    const verification = await (adapter as EditorAdapter & TistoryDraftVerifier).verifyDraft(command);
    const reliable = verification.saveClicked && verification.saveNotificationDetected && verification.draftListVerified && verification.reopenedDraftVerified
      && verification.titleMatched && verification.bodyMatched && verification.publicPostCreated === false;
    return { ...verification, status: reliable ? "saved" : "partially_verified" };
  } catch (error) { return failed(error instanceof Error ? error.message : "Tistory draft save failed."); }
}

function failed(error: string): TistoryDraftSaveResult { return { ...emptyVerification(), error, status: "failed" }; }
function emptyVerification(): TistoryDraftVerification { return { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false }; }
