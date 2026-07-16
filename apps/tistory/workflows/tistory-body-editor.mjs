const HTML_MODE_PATTERN = /html|htmlmixed|xml/i;
const AUXILIARY_PATTERN = /search|find|replace|template|snippet|preview|dialog|modal/i;

export function rankCodeMirrorCandidates(candidates) {
  return candidates
    .map((candidate) => ({ ...candidate, score: score(candidate) }))
    .filter((candidate) => candidate.initialized && candidate.attached && !candidate.readOnly && !candidate.auxiliary)
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

export function selectCodeMirrorCandidate(candidates) {
  const ranked = rankCodeMirrorCandidates(candidates);
  const selected = ranked[0];
  if (!selected || !selected.inEditorContainer || !HTML_MODE_PATTERN.test(selected.modeName ?? "")) return undefined;
  const runnerUp = ranked[1];
  if (runnerUp && runnerUp.score === selected.score && runnerUp.inEditorContainer === selected.inEditorContainer) return undefined;
  return selected;
}

export function editorStateSynchronized(state) {
  return Boolean(state.instanceContainsProbe && state.stableAfterReactUpdate && (!state.backingTextareaApplicable || state.textareaContainsProbe) && state.renderedContainsProbe && state.changeObserved);
}

function score(candidate) {
  let value = 0;
  if (candidate.inEditorContainer) value += 100;
  if (candidate.inActiveModeRegion) value += 40;
  if (HTML_MODE_PATTERN.test(candidate.modeName ?? "")) value += 30;
  if (candidate.textareaAttached) value += 15;
  if (candidate.width > 0) value += 5;
  if (candidate.height > 0) value += 5;
  if (candidate.display !== "none") value += 3;
  if (candidate.visibility !== "hidden") value += 2;
  return value;
}

export function looksAuxiliary(value) { return AUXILIARY_PATTERN.test(value ?? ""); }

export function semanticHtmlVerified(evidence) {
  return Boolean(evidence?.textLengthWithinTolerance && evidence.firstParagraphMatched && evidence.paragraphCount > 0 && evidence.h2Matched && evidence.tocMatched && evidence.internalLinksMatched && evidence.relatedLinksMatched && evidence.ctaLinksMatched && evidence.invalidPlaceholderLinks === 0 && evidence.imagesMatched);
}

export function automationClicksAllowed(clicks) { return clicks?.draft === 1 && clicks.complete === 0 && clicks.publish === 0; }

export function readOnlyClicksAllowed(clicks) {
  return Boolean(clicks && ["draft", "complete", "publish", "schedule", "delete"].every((key) => clicks[key] === 0));
}

export function selectDraftCandidate(candidates, title, preferredId) {
  const exact = candidates.filter((candidate) => candidate.scope === "draft-list" && candidate.visible && candidate.tagName !== "textarea" && candidate.tagName !== "input" && candidate.title === title);
  if (preferredId) {
    const identified = exact.filter((candidate) => candidate.id === preferredId);
    if (identified.length === 1) return { candidate: identified[0] };
    if (identified.length > 1) return { code: "duplicate_draft_candidates" };
  }
  if (exact.length === 1) return { candidate: exact[0] };
  return { code: exact.length > 1 ? "duplicate_draft_candidates" : "draft_item_not_found" };
}

export function reopenedDraftVerified(state) { return Boolean(state?.titleMatched && state.bodyMatched && state.categoryMatched && state.structureMatched && state.publicPostCreated === false); }

export function verifyCategoryEvidence(evidence, categoryId, categoryName) {
  const expectedId = String(categoryId);
  const observedIds = [evidence?.controlSelectedId, ...(evidence?.selectedOptions ?? []).map((item) => item.id), ...(evidence?.hiddenValues ?? [])].filter(Boolean);
  const observedNames = [evidence?.controlText, evidence?.ariaLabel, ...(evidence?.selectedOptions ?? []).map((item) => item.text)].filter(Boolean);
  if (!observedIds.length && !observedNames.length) return { passed: false, code: "category_selected_value_missing" };
  if (observedIds.length && !observedIds.includes(expectedId)) return { passed: false, code: "category_id_mismatch" };
  if (categoryName && !observedNames.some((value) => value.includes(categoryName))) return { passed: false, code: "category_name_mismatch" };
  return { passed: true, idVerified: observedIds.includes(expectedId), nameVerified: Boolean(categoryName && observedNames.some((value) => value.includes(categoryName))) };
}
