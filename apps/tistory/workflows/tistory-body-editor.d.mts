export type CodeMirrorCandidate = Readonly<{
  index: number;
  initialized: boolean;
  attached: boolean;
  readOnly: boolean;
  auxiliary: boolean;
  inEditorContainer: boolean;
  inActiveModeRegion: boolean;
  modeName: string;
  textareaAttached: boolean;
  width: number;
  height: number;
  display: string;
  visibility: string;
  [key: string]: unknown;
}>;

export function rankCodeMirrorCandidates(candidates: readonly CodeMirrorCandidate[]): readonly (CodeMirrorCandidate & { score: number })[];
export function selectCodeMirrorCandidate(candidates: readonly CodeMirrorCandidate[]): (CodeMirrorCandidate & { score: number }) | undefined;
export function editorStateSynchronized(state: Readonly<{ instanceContainsProbe: boolean; stableAfterReactUpdate: boolean; backingTextareaApplicable: boolean; textareaContainsProbe: boolean; renderedContainsProbe: boolean; changeObserved: boolean }>): boolean;
export function looksAuxiliary(value: string): boolean;
export function semanticHtmlDiagnosticCode(evidence: Readonly<Record<string, unknown>> | undefined): string | undefined;
export function semanticHtmlVerified(evidence: Readonly<Record<string, unknown>> | undefined): boolean;
export function automationClicksAllowed(clicks: Readonly<{ draft: number; complete: number; publish: number }> | undefined): boolean;
export function readOnlyClicksAllowed(clicks: Readonly<{ draft: number; complete: number; publish: number; schedule: number; delete: number }> | undefined): boolean;
export type DraftCandidate = Readonly<{ scope: string; visible: boolean; tagName: string; title: string; id?: string; [key: string]: unknown }>;
export function selectDraftCandidate(candidates: readonly DraftCandidate[], title: string, preferredId?: string): Readonly<{ candidate?: DraftCandidate; code?: "duplicate_draft_candidates" | "draft_item_not_found" }>;
export function reopenedDraftVerified(state: Readonly<{ titleMatched: boolean; bodyMatched: boolean; categoryMatched: boolean; structureMatched: boolean; publicPostCreated: boolean }> | undefined): boolean;
export function verifyCategoryEvidence(evidence: Readonly<Record<string, unknown>>, categoryId: string, categoryName: string): Readonly<{ passed: boolean; code?: string; idVerified?: boolean; nameVerified?: boolean }>;
