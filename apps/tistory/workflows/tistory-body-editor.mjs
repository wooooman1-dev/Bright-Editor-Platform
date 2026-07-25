const HTML_MODE_PATTERN = /html|htmlmixed|xml/i;
const AUXILIARY_PATTERN = /search|find|replace|template|snippet|preview|dialog|modal/i;
const SEMANTIC_DIAGNOSTIC_PREFIX = "[tistory-semantic-html]";

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

export function semanticHtmlDiagnosticCode(evidence) {
  if (!evidence?.textLengthWithinTolerance) return "rendered_text_length_mismatch";
  if (!evidence?.firstParagraphMatched) return "rendered_first_paragraph_mismatch";
  if (!(evidence?.paragraphCount > 0)) return "rendered_paragraph_missing";
  if (!evidence?.h2Matched) return "rendered_heading_missing";
  if (!evidence?.tocMatched) return "rendered_toc_missing";
  if (!evidence?.internalLinksMatched) return "rendered_internal_link_missing";
  if (!evidence?.relatedLinksMatched) return "rendered_related_posts_missing";
  if (!evidence?.ctaLinksMatched) return "rendered_cta_link_missing";
  if ((evidence?.invalidPlaceholderLinks ?? 0) > 0) return "rendered_placeholder_link_present";
  const imageCountDelegatedToMediaGate = evidence?.expectedImageCount === 0 && evidence?.imageCount > 0;
  if (!evidence?.imagesMatched && !imageCountDelegatedToMediaGate) return "rendered_image_mismatch";
  return undefined;
}

export function semanticHtmlVerified(evidence) {
  const diagnosticCode = semanticHtmlDiagnosticCode(evidence);
  if (diagnosticCode) writeSemanticDiagnostic(diagnosticCode, evidence);
  return diagnosticCode === undefined;
}

function writeSemanticDiagnostic(code, evidence) {
  if (typeof process === "undefined" || process.env?.BRIGHT_TISTORY_WORKER_DIAGNOSTICS !== "1") return;
  try {
    process.stderr.write(`${SEMANTIC_DIAGNOSTIC_PREFIX} ${JSON.stringify({ code, evidence })}\n`);
  } catch {
    process.stderr.write(`${SEMANTIC_DIAGNOSTIC_PREFIX} ${JSON.stringify({ code })}\n`);
  }
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
  const idVerified = observedIds.includes(expectedId);
  const nameVerified = Boolean(categoryName && observedNames.some((value) => value.includes(categoryName)));
  if (!observedIds.length && !observedNames.length) return { passed: false, code: "category_selected_value_missing" };
  if (idVerified || nameVerified) return { passed: true, idVerified, nameVerified };
  if (observedIds.length) return { passed: false, code: "category_id_mismatch" };
  if (categoryName && observedNames.length) return { passed: false, code: "category_name_mismatch" };
  return { passed: false, code: "category_selected_value_missing" };
}
