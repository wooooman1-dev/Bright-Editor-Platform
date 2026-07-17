import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { automationClicksAllowed, editorStateSynchronized, looksAuxiliary, readOnlyClicksAllowed, reopenedDraftVerified, selectCodeMirrorCandidate, selectDraftCandidate, semanticHtmlVerified, verifyCategoryEvidence } from "./tistory-body-editor.mjs";
import { fillTistoryTags, verifyTistoryTags } from "./tistory-tags.mjs";

const [commandPath] = process.argv.slice(2);
const empty = { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false };
const PROBE_HTML = '<p data-bright-studio-probe="true">Bright Studio editor probe</p>';
const PROBE_TEXT = "Bright Studio editor probe";
const steps = [];
let browser;
let page;
let failedStep;
let draftLookupDiagnostic;
let draftOpenDiagnostic;
let bodyProbeDiagnostic;
let nativeModeDialogDiagnostic;
let runtimeFailureDiagnostic;
let expectedHtmlForDiagnostic = "";
let draftSaveClickCount = 0;
let draftCountBefore;
let draftCountAfter;
let verificationEvidence;
let automationClickCounts;

try {
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  expectedHtmlForDiagnostic = command.html;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: command.storageStatePath });
  step("session_loaded", "저장된 Tistory 세션을 불러왔습니다.");
  page = await context.newPage();
  await page.goto(`https://${command.blogId}.tistory.com/manage/newpost`, { waitUntil: "domcontentloaded", timeout: 30000 });
  step("editor_opened", "Tistory 글쓰기 화면을 열었습니다.");
  if (!page.url().startsWith(`https://${command.blogId}.tistory.com/manage`)) fail("editor_ready", "session_expired", "Tistory 로그인 세션이 만료되었습니다.");

  const title = await visibleTitle(page);
  if (!title) fail("editor_ready", "title_selector_not_found", "Tistory 에디터 제목 입력 영역을 찾지 못했습니다.");
  step("editor_ready", "Tistory 에디터 입력 영역을 확인했습니다.");

  if (command.diagnosticMode === "body_editor_probe") {
    const probe = await runBodyEditorProbe(page);
    bodyProbeDiagnostic = probe;
    if (!probe.passed) fail(probe.failedStep ?? "body_editor_identified", probe.diagnosticCode ?? "body_editor_probe_failed", probe.message ?? "Tistory 본문 편집기 진단을 완료하지 못했습니다.");
    process.stdout.write(`${JSON.stringify({ ...empty, status: "diagnosed", steps, probe: probe.result, editorUrl: safeUrl(page.url()) })}\n`);
    await context.close(); await browser.close(); process.exit(0);
  }

  if (command.diagnosticMode === "category_verification_probe") {
    await installRestrictedClickMonitor(page);
    const countBefore = await currentDraftCount(page);
    const category = await selectCategory(page, command.categoryId, command.categoryName);
    if (!category.passed) fail("category_applied", category.code, category.message);
    step("category_applied", `카테고리 ${command.categoryName ?? "없음"}을 적용했습니다.`, category.applicationEvidence);
    const verified = await verifyCategorySelection(page, command.categoryId, command.categoryName, category.descriptor);
    if (!verified.passed) fail("category_verified", verified.code, verified.message);
    step("category_verified", `동일 stable locator로 카테고리 ${command.categoryName ?? "없음"}을 재검증했습니다.`, verified.evidence);
    const countAfter = await currentDraftCount(page); const clicks = await readAutomationClickCounts(page);
    if (countBefore !== countAfter || clicks.draft !== 0 || clicks.complete !== 0 || clicks.publish !== 0) fail("category_verified", "category_listbox_state_invalid", "카테고리 진단 중 저장 또는 공개 관련 상태가 변경되었습니다.");
    process.stdout.write(`${JSON.stringify({ ...empty, status: "diagnosed", steps, categoryProbe: { descriptor: category.descriptor, evidence: verified.evidence, draftCountBefore: countBefore, draftCountAfter: countAfter, clicks }, editorUrl: safeUrl(page.url()) })}\n`);
    await context.close(); await browser.close(); process.exit(0);
  }

  if (command.diagnosticMode === "draft_reopen_verify") {
    await installRestrictedClickMonitor(page);
    draftCountBefore = await currentDraftCount(page);
    if (!draftCountBefore) fail("draft_list_opened", "draft_list_control_not_found", "기존 Tistory 임시글 목록을 여는 control을 찾지 못했습니다.");
    const reopened = await reopenExistingDraft(page, command.title);
    if (!reopened.passed) fail(reopened.failedStep, reopened.code, reopened.message);
    draftLookupDiagnostic = reopened.draftList;
    draftOpenDiagnostic = reopened.open;
    step("draft_list_opened", "Tistory 임시글 목록 container를 열었습니다.", reopened.draftList.container);
    step("draft_item_identified", "목록 내부에서 현재 Content와 정확히 일치하는 임시글 한 건을 식별했습니다.", reopened.item);
    step("draft_reopened", "식별한 기존 임시글을 읽기 전용 검증을 위해 다시 열었습니다.", reopened.open);

    const reopenedTitle = await visibleTitle(page);
    const titleMatched = Boolean(reopenedTitle) && await readTitle(reopenedTitle) === command.title.trim();
    if (!titleMatched) fail("title_reverified", "reopened_title_mismatch", "다시 연 임시글의 제목이 현재 Content 제목과 일치하지 않습니다.");
    step("title_reverified", "다시 연 임시글의 제목이 정확히 일치합니다.");

    const bodyMatched = await readMeaningfulBody(page, command.html);
    if (!bodyMatched) fail("body_reverified", "reopened_body_empty", "다시 연 임시글의 본문이 비어 있거나 기대 길이에 미달합니다.");
    step("body_reverified", "다시 연 임시글의 본문이 비어 있지 않고 현재 Renderer 본문과 일치합니다.");

    const category = await verifyCategorySelection(page, command.categoryId, command.categoryName);
    if (!category.passed) fail("category_reverified", "reopened_category_mismatch", "다시 연 임시글의 카테고리가 건강정보와 일치하지 않습니다.");
    step("category_reverified", `다시 연 임시글의 카테고리가 ${command.categoryName ?? "없음"}과 일치합니다.`, category.evidence);

    const reopenedTags = await verifyTistoryTags(page, command.tags);
    if (!reopenedTags.passed) fail("tags_reverified", reopenedTags.code, reopenedTags.message);
    step("tags_reverified", `다시 연 임시글에서 태그 ${reopenedTags.tags.length}개를 확인했습니다.`, reopenedTags.evidence);

    const structure = await verifyRenderedHtml(page, command.html);
    verificationEvidence = structure.diagnostic;
    if (!structure.passed) fail("structure_verified", structureDiagnosticCode(structure.diagnostic), "다시 연 임시글의 목차, H2, 내부링크 또는 관련 글 구조가 일치하지 않습니다.");
    step("structure_verified", "다시 연 임시글의 목차, H2, paragraph, 내부링크와 관련 글을 의미 기반으로 확인했습니다.", structure.diagnostic);

    draftCountAfter = await currentDraftCount(page);
    const clickCounts = await readAutomationClickCounts(page);
    if (draftCountAfter !== draftCountBefore || !readOnlyClicksAllowed(clickCounts)) fail("publication_state_verified", "restricted_control_clicked", "읽기 전용 검증 중 저장·완료·공개·예약·삭제 control 사용 또는 Draft 수 변경이 감지되었습니다.");
    step("publication_state_verified", "임시저장·완료·공개·예약·삭제 control을 사용하지 않았고 Draft 수가 유지됐습니다.", clickCounts);
    if (!reopenedDraftVerified({ titleMatched, bodyMatched, categoryMatched: category.passed, structureMatched: structure.passed, publicPostCreated: false })) fail("draft_verified", "draft_reopen_verification_failed", "기존 임시글의 최종 검증 결과가 완전하지 않습니다.");
    step("draft_verified", "기존 Tistory 임시글의 제목, 본문, 카테고리, 구조와 비공개 상태를 모두 확인했습니다.");
    process.stdout.write(`${JSON.stringify({ ...empty, saveClicked: false, draftIdDetected: Boolean(reopened.item.id), draftListVerified: true, reopenedDraftVerified: true, titleMatched: true, bodyMatched: true, publicPostCreated: false, status: "verified", steps, ...(reopened.item.id ? { draftId: reopened.item.id } : {}), draftCount: draftCountAfter, draftCountBefore, draftCountAfter, draftSaveClickCount: 0, verification: verificationEvidence, draftList: reopened.draftList, clickCounts, editorUrl: safeUrl(page.url()) })}\n`);
    await context.close(); await browser.close(); process.exit(0);
  }

  await installRestrictedClickMonitor(page);

  const existingDraftCount = await currentDraftCount(page);
  const existing = existingDraftCount ? await reopenExistingDraft(page, command.title) : undefined;
  if (existing?.passed) fail("draft_reopened", "duplicate_draft_exists", "같은 제목의 기존 Tistory 임시글이 있어 새 임시저장을 실행하지 않았습니다.");

  const category = await selectCategory(page, command.categoryId, command.categoryName);
  if (!category.passed) fail("category_applied", category.code, category.message);
  step("category_applied", command.categoryName ? `카테고리 ${command.categoryName}을 적용했습니다.` : "카테고리 없음을 적용했습니다.");
  const categoryVerification = await verifyCategorySelection(page, command.categoryId, command.categoryName, category.descriptor);
  if (!categoryVerification.passed) fail("category_verified", categoryVerification.code, categoryVerification.message);
  step("category_verified", `카테고리 ${command.categoryName ?? "없음"} 선택값을 다시 확인했습니다.`, categoryVerification.evidence);

  await title.fill(command.title);
  step("title_filled", "Tistory 제목 입력을 완료했습니다.");
  const titleMatchedBeforeSave = await readTitle(title) === command.title.trim();
  if (!titleMatchedBeforeSave) fail("title_verified", "title_verification_failed", "제목을 입력했지만 입력값을 확인하지 못했습니다.");
  step("title_verified", "제목 입력값이 현재 Content 제목과 일치합니다.");

  const body = await fillHtmlBody(page, command.html);
  if (!body.passed) fail(body.failedStep ?? "body_filled", body.code, body.message);

  const tags = await fillTistoryTags(page, command.tags);
  if (!tags.passed) fail("tags_filled", tags.code, tags.message);
  step("tags_filled", `Tistory 태그 ${tags.tags.length}개를 입력했습니다.`, tags.evidence);
  step("tags_verified", `입력된 태그 ${tags.tags.length}개를 저장 전에 확인했습니다.`, tags.evidence);

  const finalTitle = await visibleTitle(page);
  if (!finalTitle || await readTitle(finalTitle) !== command.title.trim()) fail("title_verified", "title_verification_failed", "임시저장 직전 제목이 현재 Content와 일치하지 않습니다.");
  const finalCategory = await verifyCategorySelection(page, command.categoryId, command.categoryName, category.descriptor);
  if (!finalCategory.passed) fail("category_verified", finalCategory.code, finalCategory.message);
  const finalBody = await verifyRenderedHtml(page, command.html);
  if (!finalBody.passed) fail("body_verified", "body_verification_failed", "임시저장 직전 Tistory 본문 상태를 확인하지 못했습니다.");

  const saveButton = await visibleDraftButton(page);
  if (!saveButton) fail("draft_save_clicked", "draft_button_not_found", "Tistory 임시저장 버튼을 찾지 못했습니다.");
  const saveLabel = (await saveButton.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  if (saveLabel !== "임시저장") fail("draft_save_clicked", "draft_button_not_found", "임시저장 count 또는 완료 control과 실제 임시저장 버튼을 구분하지 못했습니다.");
  draftCountBefore = await currentDraftCount(page);
  await saveButton.click();
  draftSaveClickCount += 1;
  automationClickCounts = await readAutomationClickCounts(page);
  if (!automationClicksAllowed(automationClickCounts)) fail("draft_save_clicked", "publication_state_invalid", "임시저장 외 완료 또는 공개 발행 control 사용이 감지되었습니다.");
  step("draft_save_clicked", "Tistory 임시저장 버튼을 정확히 한 번 클릭했습니다.", { clickCount: draftSaveClickCount, draftCountBefore });

  const confirmation = await waitForSaveConfirmation(page, draftCountBefore);
  draftCountAfter = confirmation.count ?? await currentDraftCount(page);
  if (!confirmation.confirmed) fail("draft_save_confirmed", "draft_save_not_confirmed", "임시저장 완료 신호를 확인하지 못했습니다.");
  if (draftCountBefore === undefined || draftCountAfter === undefined || draftCountAfter <= draftCountBefore) fail("draft_save_confirmed", "draft_count_not_increased", "임시저장 수가 증가하지 않았습니다.");
  step("draft_save_confirmed", "임시저장 완료 신호와 count 증가를 확인했습니다.", { draftCountBefore, draftCountAfter });

  const reopened = await reopenExistingDraft(page, command.title);
  if (!reopened.passed) fail("draft_reopened", reopened.code, reopened.message);
  step("draft_list_opened", "임시저장 목록에서 방금 생성한 제목을 찾았습니다.", reopened.draftList?.container);
  step("draft_item_identified", "목록 내부에서 방금 생성한 임시글 항목을 식별했습니다.", reopened.item);
  step("draft_reopened", "저장된 임시글을 다시 열었습니다.");

  const reopenedTitle = await visibleTitle(page);
  const reopenedTitleMatched = Boolean(reopenedTitle) && await readTitle(reopenedTitle) === command.title.trim();
  if (!reopenedTitleMatched) fail("title_reverified", "reopened_title_mismatch", "다시 연 임시글의 제목이 현재 Content 제목과 일치하지 않습니다.");
  step("title_reverified", "다시 연 임시글의 제목이 정확히 일치합니다.");

  const reopenedBody = await readMeaningfulBody(page, command.html);
  if (!reopenedBody) fail("body_reverified", "reopened_body_empty", "다시 연 임시글의 본문이 비어 있거나 기대 길이에 미달합니다.");
  step("body_reverified", "다시 연 임시글의 본문이 비어 있지 않고 현재 Renderer 본문과 일치합니다.");

  const reopenedTags = await verifyTistoryTags(page, command.tags);
  if (!reopenedTags.passed) fail("tags_reverified", reopenedTags.code, reopenedTags.message);
  step("tags_reverified", `다시 연 임시글에서 태그 ${reopenedTags.tags.length}개를 확인했습니다.`, reopenedTags.evidence);

  const reopenedCategory = await verifyCategorySelection(page, command.categoryId, command.categoryName);
  if (!reopenedCategory.passed) fail("category_reverified", reopenedCategory.code === "category_id_mismatch" ? "reopened_category_mismatch" : reopenedCategory.code, reopenedCategory.message);
  step("category_reverified", `다시 연 임시글의 카테고리가 ${command.categoryName ?? "없음"}과 일치합니다.`, reopenedCategory.evidence);

  const structure = await verifyRenderedHtml(page, command.html);
  verificationEvidence = structure.diagnostic;
  if (!structure.passed) fail("structure_verified", "structure_verification_failed", "다시 연 임시글의 목차, H2, 내부링크 또는 관련 글 구조가 일치하지 않습니다.");
  step("structure_verified", "목차, H2, paragraph, 내부링크, 관련 글, CTA와 이미지 상태를 의미 기반으로 확인했습니다.", structure.diagnostic);

  const clickCounts = automationClickCounts ?? await readAutomationClickCounts(page);
  if (draftSaveClickCount !== 1 || !automationClicksAllowed(clickCounts)) fail("publication_state_verified", "publication_state_invalid", "임시저장 외 완료 또는 공개 발행 control 사용이 감지되었습니다.");
  step("publication_state_verified", "임시저장 1회만 실행됐고 완료·공개 발행 control은 사용되지 않았습니다.", clickCounts);
  if (!reopenedDraftVerified({ titleMatched: reopenedTitleMatched, bodyMatched: reopenedBody, categoryMatched: reopenedCategory.passed, structureMatched: structure.passed, publicPostCreated: false })) fail("draft_verified", "draft_reopen_verification_failed", "다시 연 임시글의 최종 검증 결과가 완전하지 않습니다.");
  step("draft_verified", "새 Tistory 임시글의 제목, 본문, 카테고리, 구조와 비공개 상태를 모두 확인했습니다.");

  const editorUrl = page.url();
  const idMatch = editorUrl.match(/(?:postId=|\/manage\/(?:newpost|post)\/)(\d+)/);
  const savedAt = new Date().toISOString();
  process.stdout.write(`${JSON.stringify({ ...empty, saveClicked: true, saveNotificationDetected: confirmation.confirmed, draftIdDetected: Boolean(idMatch), draftListVerified: true, reopenedDraftVerified: true, titleMatched: true, bodyMatched: true, publicPostCreated: false, ...(idMatch ? { draftId: idMatch[1] } : {}), draftCount: draftCountAfter, draftCountBefore, draftCountAfter, draftSaveClickCount, savedAt, verification: verificationEvidence, editorUrl: safeUrl(editorUrl), status: "saved", steps })}\n`);
  await context.close();
} catch (error) {
  runtimeFailureDiagnostic = { name: String(error?.name ?? "Error").slice(0, 80), message: String(error?.message ?? "unknown").replace(/[A-Z]:\\[^\s]+/gi, "[path]").slice(0, 240) };
  const code = error?.diagnosticCode ?? "unknown_error";
  const message = error?.safeMessage ?? "Tistory 임시저장 작업을 완료하지 못했습니다.";
  if (failedStep && !steps.some((item) => item.key === failedStep && !item.passed)) steps.push({ key: failedStep, passed: false, diagnosticCode: code, message });
  const diagnostic = page ? await safeDiagnostic(page, expectedHtmlForDiagnostic).catch(() => undefined) : undefined;
  process.stderr.write(`[tistory-draft-worker] ${failedStep ?? "startup"}:${code}\n`);
  const status = draftSaveClickCount > 0 ? "partial_failure" : "failed";
  process.stdout.write(`${JSON.stringify({ ...empty, saveClicked: draftSaveClickCount > 0, status, steps, failedStep, error: message, draftSaveClickCount, ...(draftCountBefore !== undefined ? { draftCountBefore } : {}), ...(draftCountAfter !== undefined ? { draftCountAfter } : {}), ...(verificationEvidence ? { verification: verificationEvidence } : {}), ...(diagnostic ? { diagnostic } : {}) })}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

function step(key, message, evidence) { steps.push({ key, passed: true, message, ...(evidence ? { evidence } : {}) }); }
function fail(key, diagnosticCode, safeMessage) { failedStep = key; const error = new Error(safeMessage); error.diagnosticCode = diagnosticCode; error.safeMessage = safeMessage; throw error; }

async function visibleTitle(targetPage) {
  const candidates = targetPage.locator('textarea[placeholder="제목을 입력하세요"], input[placeholder="제목을 입력하세요"], textarea[placeholder*="제목"], input[placeholder*="제목"], textarea[aria-label*="제목"], input[aria-label*="제목"]');
  for (let index = 0; index < await candidates.count(); index += 1) { const candidate = candidates.nth(index); if (await candidate.isVisible().catch(() => false) && await candidate.isEditable().catch(() => false)) return candidate; }
  return undefined;
}
async function readTitle(locator) { return (await locator.inputValue().catch(() => locator.textContent().then((value) => value ?? ""))).trim(); }

async function selectCategory(targetPage, categoryId, categoryName) {
  const native = targetPage.locator('select[name*="category" i], select[id*="category" i]');
  for (let index = 0; index < await native.count(); index += 1) {
    const select = native.nth(index); if (!await select.isVisible().catch(() => false)) continue;
    await select.selectOption(categoryId === null ? "0" : String(categoryId));
    return { passed: true, descriptor: await describeCategoryControl(select), applicationEvidence: await categorySelectionEvidence(targetPage, select) };
  }
  const control = await findCategoryControl(targetPage, undefined, categoryName);
  if (!await control.isVisible({ timeout: 10000 }).catch(() => false)) return { passed: false, code: "category_selector_not_found", message: "카테고리 선택 버튼을 찾지 못했습니다." };
  const descriptor = await describeCategoryControl(control);
  await control.click();
  const root = targetPage.getByRole("listbox").first();
  if (!await root.isVisible({ timeout: 10000 }).catch(() => false)) return { passed: false, code: "category_list_not_opened", message: "카테고리 목록을 열지 못했습니다." };
  const selected = await root.evaluate((element, input) => {
    const nodes = [...element.querySelectorAll("option, [role=option], [data-category-id], [data-id], [data-value], input[value], button, a, li")];
    const expectedId = input.categoryId === null ? "0" : String(input.categoryId);
    const match = nodes.find((node) => {
      const carrier = node.closest("[data-category-id], [data-id], [data-value], [value]") ?? node.querySelector("[data-category-id], [data-id], [data-value], [value]") ?? node;
      const id = carrier.getAttribute("data-category-id") ?? carrier.getAttribute("data-id") ?? carrier.getAttribute("data-value") ?? carrier.getAttribute("value") ?? "";
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      return id === expectedId || (input.categoryName && text.includes(input.categoryName));
    });
    if (!match) return false;
    const clickable = match.closest("button, a, li, [role=option]") ?? match;
    clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, { categoryId, categoryName });
  if (!selected) return { passed: false, code: "category_option_not_found", message: "저장된 Tistory 카테고리를 현재 목록에서 찾지 못했습니다." };
  const stableControl = await findCategoryControl(targetPage, descriptor, categoryName);
  return { passed: true, descriptor, applicationEvidence: await categorySelectionEvidence(targetPage, stableControl) };
}

async function findCategoryControl(targetPage, descriptor, categoryName) {
  const candidates = [];
  if (descriptor?.id) candidates.push(targetPage.locator(`[id=${JSON.stringify(descriptor.id)}]`));
  if (descriptor?.ariaControls) candidates.push(targetPage.locator(`[aria-controls=${JSON.stringify(descriptor.ariaControls)}]`));
  if (descriptor?.ariaHaspopup) candidates.push(targetPage.locator(`[aria-haspopup=${JSON.stringify(descriptor.ariaHaspopup)}]`));
  candidates.push(targetPage.locator('#category-btn, button[aria-controls*="category" i], button[aria-haspopup="listbox"], [class*="category" i] button'));
  if (categoryName) candidates.push(targetPage.getByRole("button", { name: new RegExp(escapeRegExp(categoryName)) }));
  candidates.push(targetPage.getByRole("button", { name: /카테고리|분류/ }));
  for (const candidate of candidates) {
    for (let index = 0; index < await candidate.count(); index += 1) {
      const control = candidate.nth(index);
      if (await control.isVisible().catch(() => false)) return control;
    }
  }
  return targetPage.locator("button").filter({ hasText: "__bright_studio_missing_category_control__" }).first();
}

async function describeCategoryControl(control) {
  return control.evaluate((element) => ({ id: element.id || undefined, ariaControls: element.getAttribute("aria-controls") || undefined, ariaHaspopup: element.getAttribute("aria-haspopup") || undefined, tagName: element.tagName.toLowerCase() })).catch(() => ({}));
}

async function categorySelectionEvidence(targetPage, control) {
  const controlEvidence = await control.evaluate((element) => ({
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
    ariaLabel: element.getAttribute("aria-label") ?? "",
    selectedId: element.getAttribute("data-selected-category-id") ?? element.getAttribute("data-category-id") ?? element.getAttribute("data-value") ?? element.getAttribute("value") ?? "",
  })).catch(() => ({ text: "", ariaLabel: "", selectedId: "" }));
  const selectedEvidence = await targetPage.locator('select[name*="category" i] option:checked, select[id*="category" i] option:checked, [role="option"][aria-selected="true"]').evaluateAll((elements) => elements.map((element) => ({ text: (element.textContent ?? "").replace(/\s+/g, " ").trim(), id: element.getAttribute("data-category-id") ?? element.getAttribute("data-id") ?? element.getAttribute("data-value") ?? element.getAttribute("value") ?? "" }))).catch(() => []);
  const hiddenValues = await targetPage.locator('input[type="hidden"][name*="category" i], input[type="hidden"][id*="category" i]').evaluateAll((elements) => elements.map((element) => element.value).filter(Boolean)).catch(() => []);
  return { controlText: controlEvidence.text, ariaLabel: controlEvidence.ariaLabel, controlSelectedId: controlEvidence.selectedId, selectedOptions: selectedEvidence, hiddenValues };
}

async function verifyCategorySelection(targetPage, categoryId, categoryName, descriptor) {
  if (categoryId === null) return { passed: true, evidence: { uncategorized: true } };
  const control = await findCategoryControl(targetPage, descriptor, categoryName);
  if (!await control.isVisible().catch(() => false)) return { passed: false, code: "category_control_not_found", message: "선택 후 Tistory 카테고리 control을 다시 찾지 못했습니다." };
  const evidence = await categorySelectionEvidence(targetPage, control);
  const result = verifyCategoryEvidence(evidence, categoryId, categoryName);
  if (!result.passed) {
    const messages = { category_selected_value_missing: "선택된 Tistory 카테고리 값을 DOM에서 확인하지 못했습니다.", category_id_mismatch: "선택된 Tistory 카테고리 ID가 저장값과 일치하지 않습니다.", category_name_mismatch: "선택된 Tistory 카테고리 이름이 건강정보와 일치하지 않습니다." };
    return { passed: false, code: result.code, message: messages[result.code] ?? "선택된 Tistory 카테고리를 검증하지 못했습니다.", evidence };
  }
  return { passed: true, evidence: { ...evidence, idVerified: result.idVerified, nameVerified: result.nameVerified } };
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function fillHtmlBody(targetPage, html) {
  const switched = await switchEditorMode(targetPage, "HTML");
  if (!switched.passed) return { passed: false, failedStep: "html_mode_opened", code: "html_mode_switch_failed", message: switched.message };
  step("html_mode_opened", "native confirm 승인 후 Tistory HTML 모드 활성화를 확인했습니다.", { modeLabel: switched.label });
  const candidates = await inspectCodeMirrors(targetPage);
  const selected = selectCodeMirrorCandidate(candidates);
  if (!selected) return { passed: false, failedStep: "body_editor_identified", code: "body_editor_not_ready", message: "실제 Tistory HTML 본문 편집기를 식별하지 못했습니다." };
  step("body_editor_identified", "#html-editor-container의 htmlmixed CodeMirror를 식별했습니다.", { index: selected.index, modeName: selected.modeName, markdownExcluded: selected.modeName !== "markdown" });
  const wrapper = targetPage.locator(".CodeMirror").nth(selected.index);
  const written = await wrapper.evaluate((element, value) => {
    const editor = element.CodeMirror;
    if (!editor?.setValue || editor.getOption?.("readOnly")) return { written: false, controllerCallbackInvoked: false, codeMirrorLength: 0, backingTextareaSynchronized: false };
    editor.setValue(value); editor.refresh?.(); editor.focus?.();
    let textarea;
    try { textarea = editor.getTextArea?.(); editor.save?.(); } catch { textarea = undefined; }
    textarea?.dispatchEvent(new Event("input", { bubbles: true })); textarea?.dispatchEvent(new Event("change", { bubbles: true }));
    const backingTextareaSynchronized = !textarea || textarea.value === value;
    const reactNode = element.parentElement;
    const fiberKey = reactNode && Object.keys(reactNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    let fiber = fiberKey ? reactNode[fiberKey] : undefined;
    for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      const onChange = fiber.memoizedProps?.onChange;
      if (typeof onChange === "function" && onChange.length === 1) { onChange(value); return { written: editor.getValue?.() === value, controllerCallbackInvoked: true, codeMirrorLength: (editor.getValue?.() ?? "").length, backingTextareaSynchronized }; }
    }
    return { written: editor.getValue?.() === value, controllerCallbackInvoked: false, codeMirrorLength: (editor.getValue?.() ?? "").length, backingTextareaSynchronized };
  }, html).catch(() => ({ written: false, controllerCallbackInvoked: false, codeMirrorLength: 0, backingTextareaSynchronized: false }));
  if (!written.written || !written.controllerCallbackInvoked || !written.backingTextareaSynchronized) return { passed: false, failedStep: "body_filled", code: "body_controller_sync_failed", message: "HTML 본문을 Tistory 편집 상태에 반영하지 못했습니다." };
  if (!await waitForCodeMirrorValueStability(targetPage, selected.index, html)) return { passed: false, failedStep: "body_filled", code: "body_controller_sync_failed", message: "입력한 HTML 본문이 Tistory editor model에 유지되지 않았습니다." };
  step("body_filled", "Renderer HTML을 CodeMirror와 React onChange(html) controller에 반영했습니다.", { codeMirrorLength: written.codeMirrorLength, expectedLength: html.length, backingTextareaSynchronized: written.backingTextareaSynchronized, controllerCallbackInvoked: written.controllerCallbackInvoked });
  const basic = await switchEditorMode(targetPage, "기본모드");
  if (!basic.passed) return { passed: false, failedStep: "body_verified", code: "body_verification_failed", message: basic.message };
  const rendered = await verifyRenderedHtml(targetPage, html);
  if (!rendered.passed) return { passed: false, failedStep: "body_verified", code: "body_verification_failed", message: "Tistory 기본모드에서 Renderer HTML 본문을 확인하지 못했습니다." };
  step("body_verified", "TinyMCE 실제 본문에서 길이, 첫 문단, H2와 목차를 확인했습니다.", rendered.diagnostic);
  return { passed: true, kind: "codemirror", index: selected.index, diagnostic: rendered.diagnostic };
}

async function runBodyEditorProbe(targetPage) {
  await installRestrictedClickMonitor(targetPage);
  const draftCountBefore = await currentDraftCount(targetPage);
  const modeBefore = await readEditorMode(targetPage);
  const switched = await switchEditorMode(targetPage, "HTML");
  if (!switched.passed) return probeFailure("body_editor_identified", switched.code, switched.message, { modeBefore, modeAfter: await readEditorMode(targetPage), draftCountBefore, candidates: await inspectCodeMirrors(targetPage), modeTransition: switched.diagnostic });

  const modeAfter = await readEditorMode(targetPage);
  const candidates = await inspectCodeMirrors(targetPage);
  const selected = selectCodeMirrorCandidate(candidates);
  if (!selected) return probeFailure("body_editor_identified", "body_editor_ambiguous", "실제 Tistory 본문 CodeMirror를 하나로 식별하지 못했습니다.", { modeBefore, modeAfter, draftCountBefore, candidates });
  step("body_editor_identified", `Tistory 본문 CodeMirror ${selected.index}번을 식별했습니다.`);

  let originalValue = "";
  let probeApplied = false;
  let instanceContainsProbe = false;
  let stableAfterReactUpdate = false;
  let backingTextareaApplicable = false;
  let textareaContainsProbe = false;
  let renderedContainsProbe = false;
  let renderedProbeDiagnostic;
  let changeObserved = false;
  let controllerCallbackInvoked = false;
  let restoreFailure;
  try {
    const wrapper = targetPage.locator(".CodeMirror").nth(selected.index);
    originalValue = await wrapper.evaluate((element) => element.CodeMirror?.getValue?.() ?? "");
    const applied = await wrapper.evaluate((element, input) => {
      const editor = element.CodeMirror;
      if (!editor?.setValue || editor.getOption?.("readOnly")) return { applied: false, instanceContainsProbe: false, backingTextareaApplicable: false, textareaContainsProbe: false, changeObserved: false };
      element.__brightStudioProbeChangeObserved = false;
      const onChange = () => { element.__brightStudioProbeChangeObserved = true; };
      editor.on?.("change", onChange);
      editor.setValue(input.html);
      editor.refresh?.(); editor.focus?.();
      let textarea;
      try { textarea = editor.getTextArea?.(); editor.save?.(); } catch { textarea = undefined; }
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      textarea?.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      const value = editor.getValue?.() ?? "";
      const textareaValue = textarea?.value ?? "";
      editor.off?.("change", onChange);
      const reactNode = element.parentElement;
      const fiberKey = reactNode && Object.keys(reactNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
      let fiber = fiberKey ? reactNode[fiberKey] : undefined;
      let controllerCallbackInvoked = false;
      for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
        const onChange = fiber.memoizedProps?.onChange;
        if (typeof onChange === "function" && onChange.length === 1) { onChange(input.html); controllerCallbackInvoked = true; break; }
      }
      return { applied: true, instanceContainsProbe: value.includes(input.marker), backingTextareaApplicable: Boolean(textarea), textareaContainsProbe: textareaValue.includes(input.marker), changeObserved: element.__brightStudioProbeChangeObserved === true, controllerCallbackInvoked };
    }, { html: PROBE_HTML, marker: PROBE_TEXT });
    probeApplied = applied.applied;
    instanceContainsProbe = applied.instanceContainsProbe;
    backingTextareaApplicable = applied.backingTextareaApplicable;
    textareaContainsProbe = applied.textareaContainsProbe;
    changeObserved = applied.changeObserved;
    controllerCallbackInvoked = applied.controllerCallbackInvoked;
    if (!probeApplied) return probeFailure("probe_applied", "probe_input_failed", "식별한 CodeMirror에 probe를 입력하지 못했습니다.", { modeBefore, modeAfter, draftCountBefore, candidates, selectedIndex: selected.index });
    step("probe_applied", "저장하지 않는 본문 probe를 식별한 CodeMirror에 입력했습니다.");

    stableAfterReactUpdate = await waitForCodeMirrorValueStability(targetPage, selected.index, PROBE_HTML);
    await wrapper.evaluate((element) => {
      const input = element.CodeMirror?.getInputField?.();
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
      input?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      element.CodeMirror?.focus?.();
    }).catch(() => undefined);

    const basic = await switchEditorMode(targetPage, "기본모드");
    renderedProbeDiagnostic = basic.passed ? { ...await inspectRenderedProbe(targetPage), modeSwitch: basic } : { present: false, modeSwitch: basic };
    renderedContainsProbe = renderedProbeDiagnostic.present;
    if (!editorStateSynchronized({ instanceContainsProbe, stableAfterReactUpdate, backingTextareaApplicable, textareaContainsProbe, renderedContainsProbe, changeObserved })) {
      return probeFailure("probe_verified", "probe_state_not_synchronized", "CodeMirror 값은 변경됐지만 Tistory 실제 편집 상태 동기화를 확인하지 못했습니다.", { modeBefore, modeAfter, draftCountBefore, candidates, selectedIndex: selected.index, instanceContainsProbe, stableAfterReactUpdate, backingTextareaApplicable, textareaContainsProbe, renderedContainsProbe, renderedProbeDiagnostic, changeObserved, controllerCallbackInvoked });
    }
    step("probe_verified", "CodeMirror, backing textarea와 기본모드 본문에서 probe 반영을 확인했습니다.");
  } finally {
    if (probeApplied) {
      const htmlMode = await switchEditorMode(targetPage, "HTML");
      if (!htmlMode.passed) restoreFailure = "restore_html_mode_failed";
      else {
        const restored = await restoreProbeValue(targetPage, originalValue);
        if (!restored) restoreFailure = "probe_restore_failed";
      }
      if (/기본모드/.test(modeBefore)) {
        const originalMode = await switchEditorMode(targetPage, "기본모드");
        if (!originalMode.passed) restoreFailure ??= "original_mode_restore_failed";
      }
    }
  }

  const modeRestored = await readEditorMode(targetPage);
  const restored = !restoreFailure && !await probePresentAnywhere(targetPage);
  if (restored) step("probe_restored", "probe를 제거하고 원래 본문 값과 편집 모드를 복구했습니다.");
  const draftCountAfter = await currentDraftCount(targetPage);
  const restrictedControlClicks = await readRestrictedClickCount(targetPage);
  const result = { modeBefore, modeAfter, modeRestored, candidates, selectedIndex: selected.index, instanceContainsProbe, stableAfterReactUpdate, backingTextareaApplicable, textareaContainsProbe, renderedContainsProbe, renderedProbeDiagnostic, changeObserved, controllerCallbackInvoked, restored, draftCountBefore, draftCountAfter, restrictedControlClicks };
  if (!restored) return probeFailure("probe_restored", restoreFailure ?? "probe_restore_verification_failed", "probe 또는 편집 모드를 원래 상태로 복구하지 못했습니다.", result);
  if (draftCountBefore !== draftCountAfter) return probeFailure("probe_restored", "draft_count_changed", "진단 중 임시저장 수가 변경되었습니다.", result);
  if (restrictedControlClicks !== 0) return probeFailure("probe_restored", "restricted_control_clicked", "진단 중 저장 또는 공개 관련 control 클릭이 감지되었습니다.", result);
  return { passed: true, result };
}

function probeFailure(failedStep, diagnosticCode, message, result) { return { passed: false, failedStep, diagnosticCode, message, result }; }

async function installRestrictedClickMonitor(targetPage) {
  const install = () => {
    window.__brightStudioAutomationClicks = { draft: 0, complete: 0, publish: 0, schedule: 0, delete: 0 };
    document.addEventListener("click", (event) => {
      const control = event.target?.closest?.("button, [role=button]");
      const label = (control?.textContent ?? control?.getAttribute?.("aria-label") ?? "").replace(/\s+/g, " ").trim();
      if (label === "임시저장") window.__brightStudioAutomationClicks.draft += 1;
      else if (label === "완료") window.__brightStudioAutomationClicks.complete += 1;
      else if (/발행/.test(label)) window.__brightStudioAutomationClicks.publish += 1;
      else if (/예약/.test(label)) window.__brightStudioAutomationClicks.schedule += 1;
      else if (/삭제/.test(label)) window.__brightStudioAutomationClicks.delete += 1;
    }, true);
  };
  await targetPage.addInitScript(install);
  await targetPage.evaluate(install);
}
async function readAutomationClickCounts(targetPage) { return targetPage.evaluate(() => window.__brightStudioAutomationClicks ?? { draft: 0, complete: 0, publish: 0, schedule: 0, delete: 0 }).catch(() => ({ draft: -1, complete: -1, publish: -1, schedule: -1, delete: -1 })); }
async function readRestrictedClickCount(targetPage) { const counts = await readAutomationClickCounts(targetPage); return counts.draft + counts.complete + counts.publish + counts.schedule + counts.delete; }

async function readEditorMode(targetPage) {
  const control = await editorModeControl(targetPage);
  return control ? (await control.innerText().catch(() => "")).replace(/\s+/g, " ").trim() : "unknown";
}

async function editorModeControl(targetPage) {
  const controls = targetPage.getByRole("button", { name: /기본모드|HTML|마크다운|에디터 모드/ });
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (await control.isVisible().catch(() => false) && await control.isEnabled().catch(() => false)) return control;
  }
  return undefined;
}

async function switchEditorMode(targetPage, targetMode) {
  const current = await readEditorMode(targetPage);
  if (current.includes(targetMode)) return waitForEditorMode(targetPage, targetMode);
  const control = await editorModeControl(targetPage);
  if (!control) return { passed: false, code: "editor_mode_control_not_found", message: "Tistory 편집 모드 control을 찾지 못했습니다." };
  await control.click();
  const options = targetPage.getByRole("menuitem", { name: targetMode, exact: true });
  let option = options.filter({ visible: true }).last();
  if (!await option.isVisible({ timeout: 3000 }).catch(() => false)) option = targetPage.getByText(targetMode, { exact: true }).filter({ visible: true }).last();
  if (!await option.isVisible({ timeout: 3000 }).catch(() => false)) return { passed: false, code: "editor_mode_option_not_found", message: `${targetMode} 편집 모드 option을 찾지 못했습니다.` };
  nativeModeDialogDiagnostic = undefined;
  const dialogHandler = async (dialog) => {
    const message = dialog.message().replace(/\s+/g, " ").trim();
    const accepted = dialog.type() === "confirm" && (message.includes(targetMode) || /편집 모드|작성한 내용|변경/.test(message));
    nativeModeDialogDiagnostic = { type: dialog.type(), message: message.slice(0, 240), accepted };
    if (accepted) await dialog.accept(); else await dialog.dismiss();
  };
  targetPage.on("dialog", dialogHandler);
  try { await option.click(); await targetPage.waitForTimeout(100); }
  finally { targetPage.off("dialog", dialogHandler); }
  await confirmModeTransition(targetPage, targetMode);
  const result = await waitForEditorMode(targetPage, targetMode);
  return result.passed ? { ...result, ...(nativeModeDialogDiagnostic ? { nativeDialog: nativeModeDialogDiagnostic } : {}) } : { ...result, diagnostic: await modeTransitionDiagnostic(targetPage) };
}

async function waitForCodeMirrorValueStability(targetPage, index, expectedValue) {
  let consecutive = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const matches = await targetPage.locator(".CodeMirror").nth(index).evaluate((element, expected) => (element.CodeMirror?.getValue?.() ?? "") === expected, expectedValue).catch(() => false);
    consecutive = matches ? consecutive + 1 : 0;
    if (consecutive >= 5) return true;
    await targetPage.waitForTimeout(100);
  }
  return false;
}

async function verifyRenderedHtml(targetPage, expectedHtml) {
  const renderedHtml = await targetPage.evaluate(() => window.tinymce?.activeEditor?.getContent?.() ?? "").catch(() => "");
  const comparison = await targetPage.evaluate(({ expected, actual }) => {
    const analyze = (html) => {
      const document = new DOMParser().parseFromString(html, "text/html");
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const urls = (selector) => [...document.querySelectorAll(selector)].map((node) => node.getAttribute("href") ?? "").filter((href) => href && href !== "#");
      const firstParagraph = normalize(document.querySelector("p")?.textContent);
      return {
        textLength: normalize(document.body.textContent).length,
        firstParagraphToken: firstParagraph.slice(0, 48),
        paragraphCount: document.querySelectorAll("p").length,
        h2Texts: [...document.querySelectorAll("h2")].map((node) => normalize(node.textContent)).filter(Boolean),
        tocUrls: urls('.bright-toc a[href^="#"]'),
        contentUrls: urls('a[href]:not([href^="#"])'),
        relatedUrls: urls('.bright-related-posts a[href]'),
        ctaUrls: urls('.bright-cta a[href], a.bright-cta[href]'),
        invalidPlaceholderLinks: [...document.querySelectorAll('a[href=""], a[href="#"]')].length,
        images: [...document.querySelectorAll("img")].map((node) => ({ sourcePresent: Boolean(node.getAttribute("src")), altPresent: Boolean(normalize(node.getAttribute("alt"))) })),
      };
    };
    const wanted = analyze(expected); const found = analyze(actual);
    const containsAll = (actualValues, expectedValues) => expectedValues.every((value) => actualValues.includes(value));
    return {
      expectedTextLength: wanted.textLength,
      renderedTextLength: found.textLength,
      textLengthWithinTolerance: wanted.textLength > 0 && found.textLength >= Math.floor(wanted.textLength * 0.75),
      firstParagraphMatched: Boolean(wanted.firstParagraphToken) && found.firstParagraphToken.includes(wanted.firstParagraphToken.slice(0, 32)),
      paragraphCount: found.paragraphCount,
      expectedH2Count: wanted.h2Texts.length,
      h2Count: found.h2Texts.length,
      h2Matched: wanted.h2Texts.length > 0 && containsAll(found.h2Texts, wanted.h2Texts),
      expectedTocLinkCount: wanted.tocUrls.length,
      tocLinkCount: found.tocUrls.length,
      tocMatched: wanted.tocUrls.length > 0 && containsAll(found.tocUrls, wanted.tocUrls),
      expectedInternalLinkCount: wanted.contentUrls.length,
      internalLinkCount: found.contentUrls.length,
      internalLinksMatched: wanted.contentUrls.length > 0 && containsAll(found.contentUrls, wanted.contentUrls),
      expectedRelatedLinkCount: wanted.relatedUrls.length,
      relatedLinkCount: found.relatedUrls.length,
      relatedLinksMatched: wanted.relatedUrls.length > 0 && containsAll(found.relatedUrls, wanted.relatedUrls),
      expectedCtaLinkCount: wanted.ctaUrls.length,
      ctaLinkCount: found.ctaUrls.length,
      ctaLinksMatched: containsAll(found.ctaUrls, wanted.ctaUrls),
      invalidPlaceholderLinks: found.invalidPlaceholderLinks,
      expectedImageCount: wanted.images.length,
      imageCount: found.images.length,
      imagesMatched: wanted.images.length === found.images.length && found.images.every((image) => image.sourcePresent && image.altPresent),
    };
  }, { expected: expectedHtml, actual: renderedHtml }).catch(() => undefined);
  const passed = semanticHtmlVerified(comparison);
  return { passed, diagnostic: { expectedLength: expectedHtml.length, renderedLength: renderedHtml.length, ...(comparison ?? {}) } };
}

async function confirmModeTransition(targetPage, targetMode) {
  const roots = targetPage.locator('[role="dialog"], [role="alertdialog"], [class*="modal" i], [class*="layer" i], [class*="popup" i]').filter({ visible: true });
  for (let index = 0; index < await roots.count(); index += 1) {
    const root = roots.nth(index);
    const text = (await root.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (!text.includes(targetMode) && !/편집 모드|작성한 내용|변경/.test(text)) continue;
    const confirm = root.getByRole("button", { name: /확인|전환/, exact: false }).filter({ visible: true }).last();
    if (await confirm.isVisible().catch(() => false)) { await confirm.click(); return true; }
  }
  const confirms = targetPage.getByRole("button", { name: /확인|전환/, exact: false }).filter({ visible: true });
  for (let index = 0; index < await confirms.count(); index += 1) {
    const confirm = confirms.nth(index);
    const context = await confirm.evaluate((element) => (element.parentElement?.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500)).catch(() => "");
    if (context.includes(targetMode) || /편집 모드|작성한 내용|변경/.test(context)) { await confirm.click(); return true; }
  }
  return false;
}

async function modeTransitionDiagnostic(targetPage) {
  const buttons = targetPage.getByRole("button").filter({ visible: true });
  const buttonLabels = (await buttons.allInnerTexts().catch(() => [])).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean).slice(-12);
  const layers = targetPage.locator('[role="dialog"]:visible, [role="alertdialog"]:visible, [class*="modal" i]:visible, [class*="layer" i]:visible, [class*="popup" i]:visible');
  const layerTexts = (await layers.allInnerTexts().catch(() => [])).map((value) => value.replace(/\s+/g, " ").trim().slice(0, 300)).filter(Boolean).slice(-8);
  return { modeLabel: await readEditorMode(targetPage), buttonLabels, layerTexts, ...(nativeModeDialogDiagnostic ? { nativeDialog: nativeModeDialogDiagnostic } : {}) };
}

async function waitForEditorMode(targetPage, targetMode) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const label = await readEditorMode(targetPage);
    const initialized = targetMode === "HTML" ? await targetPage.locator(".CodeMirror").evaluateAll((elements) => elements.some((element) => Boolean(element.CodeMirror?.getValue))) : true;
    const overlayVisible = await targetPage.locator('[class*="loading" i]:visible, [class*="overlay" i]:visible').filter({ hasText: /로딩|loading/i }).count().then((count) => count > 0).catch(() => false);
    if (label.includes(targetMode) && initialized && !overlayVisible) return { passed: true, label };
    await targetPage.waitForTimeout(250);
  }
  return { passed: false, code: "editor_mode_switch_incomplete", message: `${targetMode} 편집 모드 전환 완료 상태를 확인하지 못했습니다.` };
}

async function inspectCodeMirrors(targetPage) {
  const raw = await targetPage.locator(".CodeMirror").evaluateAll((elements) => elements.map((element, index) => {
    const editor = element.CodeMirror;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    let backingTextarea;
    try { backingTextarea = editor?.getTextArea?.(); } catch { backingTextarea = undefined; }
    const inputTextarea = element.querySelector("textarea");
    const ancestors = [];
    let current = element.parentElement;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const currentStyle = getComputedStyle(current);
      ancestors.push({ tag: current.tagName.toLowerCase(), id: current.id || undefined, className: typeof current.className === "string" ? current.className.slice(0, 160) : undefined, display: currentStyle.display, visibility: currentStyle.visibility, hidden: current.hidden || current.getAttribute("aria-hidden") === "true" });
    }
    const hierarchy = ancestors.map((item) => `${item.id ?? ""} ${item.className ?? ""}`).join(" ");
    const mode = editor?.getOption?.("mode");
    const modeName = typeof mode === "string" ? mode : mode?.name ?? "unknown";
    const hiddenAncestor = ancestors.some((item) => item.hidden || item.display === "none" || item.visibility === "hidden");
    const handlerCounts = Object.fromEntries(Object.entries(editor?._handlers ?? {}).map(([key, handlers]) => [key, Array.isArray(handlers) ? handlers.length : 0]));
    const reactChain = [];
    const reactNode = element.parentElement;
    const fiberKey = reactNode && Object.keys(reactNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    let fiber = fiberKey ? reactNode[fiberKey] : undefined;
    for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      const type = fiber.elementType ?? fiber.type;
      const props = fiber.memoizedProps ?? {};
      reactChain.push({ typeName: typeof type === "string" ? type : type?.displayName ?? type?.name ?? "anonymous", propKeys: Object.keys(props).filter((key) => !/value|html|content|title/i.test(key)).slice(0, 24), functionArities: Object.fromEntries(Object.entries(props).filter(([key, value]) => key === "onChange" && typeof value === "function").map(([key, value]) => [key, value.length])) });
    }
    return { index, initialized: Boolean(editor?.getValue), attached: element.isConnected, wrapperId: element.id || undefined, wrapperClass: String(element.className).slice(0, 200), parentId: element.parentElement?.id || undefined, parentClass: String(element.parentElement?.className ?? "").slice(0, 200), modeName, valueLength: (editor?.getValue?.() ?? "").length, readOnly: Boolean(editor?.getOption?.("readOnly")), textareaAttached: Boolean(inputTextarea?.isConnected), textareaId: inputTextarea?.id || undefined, backingTextareaAttached: Boolean(backingTextarea?.isConnected), width: Math.round(rect.width), height: Math.round(rect.height), x: Math.round(rect.x), y: Math.round(rect.y), display: style.display, visibility: style.visibility, opacity: style.opacity, offsetParent: Boolean(element.offsetParent), hiddenAttribute: element.hidden, ariaHidden: element.getAttribute("aria-hidden") === "true", hiddenAncestor, inEditorContainer: Boolean(element.closest('#editor, #editor-container, [id*="editor" i], [class*="editor" i], [class*="post" i], [class*="content" i]')), inActiveModeRegion: !hiddenAncestor, handlerCounts, reactChain, hierarchy: ancestors, auxiliaryHint: hierarchy };
  }));
  return raw.map((candidate) => ({ ...candidate, auxiliary: looksAuxiliary(candidate.auxiliaryHint), auxiliaryHint: undefined }));
}

async function inspectRenderedProbe(targetPage) {
  const mainDocumentContainsProbe = await targetPage.evaluate((marker) => {
    const root = document.querySelector("#editorContainer") ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(".CodeMirror, script, style")) continue;
      let current = parent; let visible = true;
      while (current && current !== root.parentElement) { const style = getComputedStyle(current); if (current.hidden || style.display === "none" || style.visibility === "hidden") { visible = false; break; } current = current.parentElement; }
      if (visible && (node.textContent ?? "").includes(marker)) return true;
    }
    return false;
  }, PROBE_TEXT).catch(() => false);
  const frameDiagnostics = [];
  for (const frame of targetPage.frames()) {
    if (frame === targetPage.mainFrame()) continue;
    const containsProbe = await frame.locator("body").evaluate((body, marker) => (body.textContent ?? "").includes(marker), PROBE_TEXT).catch(() => false);
    const attributeProbe = await frame.locator('[data-bright-studio-probe="true"]').count().then((count) => count > 0).catch(() => false);
    let path = "unknown"; try { const url = new URL(frame.url()); path = `${url.origin}${url.pathname}`; } catch {}
    frameDiagnostics.push({ name: frame.name().slice(0, 100), path, containsProbe, attributeProbe });
  }
  const editorRuntime = await targetPage.evaluate(() => ({ tinymceAvailable: Boolean(window.tinymce), tinymceEditorCount: window.tinymce?.editors?.length ?? 0, activeEditorId: String(window.tinymce?.activeEditor?.id ?? "").slice(0, 100), activeEditorBodyLength: (window.tinymce?.activeEditor?.getBody?.()?.textContent ?? "").length })).catch(() => ({ tinymceAvailable: false, tinymceEditorCount: 0, activeEditorId: "", activeEditorBodyLength: 0 }));
  return { present: mainDocumentContainsProbe || frameDiagnostics.some((item) => item.containsProbe || item.attributeProbe), mainDocumentContainsProbe, frameDiagnostics, iframeCount: await targetPage.locator("#editorContainer iframe").count(), editorRuntime };
}

async function restoreProbeValue(targetPage, originalValue) {
  const wrappers = targetPage.locator(".CodeMirror");
  for (let index = 0; index < await wrappers.count(); index += 1) {
    const wrapper = wrappers.nth(index);
    const containsProbe = await wrapper.evaluate((element, marker) => (element.CodeMirror?.getValue?.() ?? "").includes(marker), PROBE_TEXT).catch(() => false);
    if (!containsProbe) continue;
    return wrapper.evaluate((element, value) => {
      const editor = element.CodeMirror; if (!editor?.setValue) return false;
      editor.setValue(value); editor.refresh?.();
      let textarea;
      try { textarea = editor.getTextArea?.(); editor.save?.(); } catch { textarea = undefined; }
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      textarea?.dispatchEvent(new Event("change", { bubbles: true }));
      const reactNode = element.parentElement;
      const fiberKey = reactNode && Object.keys(reactNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
      let fiber = fiberKey ? reactNode[fiberKey] : undefined;
      for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
        const onChange = fiber.memoizedProps?.onChange;
        if (typeof onChange === "function" && onChange.length === 1) { onChange(value); break; }
      }
      return !(editor.getValue?.() ?? "").includes("Bright Studio editor probe") && !(textarea?.value ?? "").includes("Bright Studio editor probe");
    }, originalValue).catch(() => false);
  }
  return false;
}

async function probePresentAnywhere(targetPage) {
  const inCodeMirror = await targetPage.locator(".CodeMirror").evaluateAll((elements, marker) => elements.some((element) => (element.CodeMirror?.getValue?.() ?? "").includes(marker) || (element.CodeMirror?.getTextArea?.()?.value ?? "").includes(marker)), PROBE_TEXT).catch(() => true);
  if (inCodeMirror) return true;
  if (await targetPage.locator('[data-bright-studio-probe="true"]').count()) return true;
  for (const frame of targetPage.frames()) if (await frame.locator('[data-bright-studio-probe="true"]').count().catch(() => 0)) return true;
  return (await inspectRenderedProbe(targetPage)).present;
}

function bodyValueMatches(value, expectedHtml) {
  const actual = plain(value), expected = plain(expectedHtml), token = expected.slice(0, 40);
  return actual.length >= Math.min(120, Math.max(20, Math.floor(expected.length * 0.15))) && (!token || actual.includes(token.slice(0, 20)));
}
function plain(value) { return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim(); }

async function visibleDraftButton(targetPage) {
  const buttons = targetPage.getByRole("button", { name: /^임시저장(?:\s*\d+)?$/ });
  let fallback;
  for (let index = 0; index < await buttons.count(); index += 1) { const button = buttons.nth(index); if (!await button.isVisible().catch(() => false) || !await button.isEnabled().catch(() => false)) continue; const label = await button.innerText().catch(() => ""); if (draftCount(label) === undefined) return button; fallback ??= button; }
  return fallback;
}
async function visibleDraftListButton(targetPage) {
  const buttons = targetPage.getByRole("button", { name: /임시저장/ });
  for (let index = 0; index < await buttons.count(); index += 1) { const button = buttons.nth(index); if (!await button.isVisible().catch(() => false)) continue; if (draftCount(await button.innerText().catch(() => "")) !== undefined) return button; }
  return undefined;
}
function draftCount(value) { const text = String(value).trim(); const match = text.match(/임시저장\s*(\d+)/) ?? text.match(/^(\d+)$/); return match ? Number(match[1]) : undefined; }
async function currentDraftCount(targetPage) { const button = await visibleDraftListButton(targetPage); return button ? draftCount(await button.innerText().catch(() => "")) : undefined; }
async function waitForSaveConfirmation(targetPage, countBefore) {
  let notificationDetected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const alert = targetPage.locator('[role="alert"]:has-text("저장"), .toast:has-text("저장"), text=/임시저장.*(완료|되었습니다)/').first();
    if (await alert.isVisible().catch(() => false)) notificationDetected = true;
    const current = await currentDraftCount(targetPage);
    if (current !== undefined && countBefore !== undefined && current > countBefore) return { confirmed: true, signal: notificationDetected ? "notification_and_count" : "count", count: current };
    await targetPage.waitForTimeout(500);
  }
  return { confirmed: false, notificationDetected };
}

async function reopenExistingDraft(targetPage, title, preferredId) {
  const count = await currentDraftCount(targetPage);
  if (!count) return reopenFailure("draft_list_opened", "draft_list_control_not_found", "기존 Tistory 임시글 목록을 여는 control을 찾지 못했습니다.");
  const listButton = await visibleDraftListButton(targetPage);
  if (!listButton) return reopenFailure("draft_list_opened", "draft_list_control_not_found", "기존 Tistory 임시글 목록을 여는 control을 찾지 못했습니다.");
  await listButton.click();
  const located = await waitForDraftListContainer(targetPage, title);
  if (!located) return reopenFailure("draft_list_opened", "draft_list_container_not_found", "Tistory 임시글 목록 container를 찾지 못했습니다.");
  const { container, diagnostic: containerDiagnostic } = located;
  const candidates = await draftCandidates(container, title);
  const selected = selectDraftCandidate(candidates, title.trim(), preferredId);
  const draftList = { container: containerDiagnostic, itemCount: candidates.length, items: candidates.map(safeDraftCandidate) };
  if (!selected.candidate) return { ...reopenFailure("draft_item_identified", selected.code ?? "draft_item_not_found", selected.code === "duplicate_draft_candidates" ? "같은 제목의 임시글 후보가 여러 건이라 안전하게 식별할 수 없습니다." : "현재 Content 제목과 일치하는 임시글 항목을 목록에서 찾지 못했습니다."), draftList };
  const itemHandle = await draftCandidateHandle(container, title.trim(), selected.candidate.candidateIndex);
  const item = itemHandle?.asElement();
  if (!item) return { ...reopenFailure("draft_item_identified", "draft_item_open_control_not_found", "식별한 임시글 항목의 열기 control을 찾지 못했습니다."), draftList };
  const openHandle = await item.evaluateHandle((element) => {
    const restricted = /임시저장|완료|발행|예약|삭제/;
    const controls = [element, ...element.querySelectorAll('button, a[href], [role="button"]')];
    return controls.find((control) => !restricted.test((control.textContent ?? control.getAttribute?.("aria-label") ?? "").replace(/\s+/g, " ").trim())) ?? null;
  });
  const openControl = openHandle.asElement();
  if (!openControl) return { ...reopenFailure("draft_item_identified", "draft_item_open_control_not_found", "식별한 임시글 항목의 열기 control을 찾지 못했습니다."), draftList };
  await openControl.click({ timeout: 10000 });
  const confirmation = targetPage.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({ hasText: /불러오기|임시저장/ }).last();
  if (await confirmation.isVisible().catch(() => false)) {
    const confirm = confirmation.getByRole("button", { name: /불러오기|열기|확인/ }).filter({ visible: true }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
  }
  let loaded = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const titleControl = await visibleTitle(targetPage);
    const titleMatches = Boolean(titleControl) && await readTitle(titleControl) === title.trim();
    const listClosed = !await container.isVisible().catch(() => false);
    const bodyReady = await targetPage.evaluate(() => Boolean(window.tinymce?.activeEditor?.getBody?.())).catch(() => false);
    if (titleMatches && listClosed && bodyReady) { loaded = true; break; }
    await targetPage.waitForTimeout(250);
  }
  const open = { listClosed: !await container.isVisible().catch(() => false), titleLoaded: loaded, currentUrl: safeUrl(targetPage.url()) };
  if (!loaded) return { ...reopenFailure("draft_reopened", "draft_reopen_timeout", "임시글 항목을 열었지만 에디터 로드를 확인하지 못했습니다."), draftList, item: safeDraftCandidate(selected.candidate), open };
  return { passed: true, draftList, item: safeDraftCandidate(selected.candidate), open };
}

function reopenFailure(failedStep, code, message) { return { passed: false, failedStep, code, message }; }

async function waitForDraftListContainer(targetPage, title) {
  const roots = targetPage.locator('[role="dialog"], [aria-modal="true"], [role="listbox"], [id*="draft" i], [class*="draft" i], [class*="layer" i], [class*="popup" i]');
  let fallback;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (let index = 0; index < await roots.count(); index += 1) {
      const root = roots.nth(index);
      if (!await root.isVisible().catch(() => false)) continue;
      const data = await root.evaluate((element, expectedTitle) => {
        const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
        const text = normalize(element.textContent);
        const hasExactTitle = [...element.querySelectorAll("*")].some((node) => !["INPUT", "TEXTAREA"].includes(node.tagName) && normalize(node.textContent) === expectedTitle);
        const rect = element.getBoundingClientRect();
        return { role: element.getAttribute("role") ?? "", id: element.id ?? "", className: String(element.className ?? "").slice(0, 180), ariaModal: element.getAttribute("aria-modal") ?? "", ariaLabelledby: element.getAttribute("aria-labelledby") ?? "", ariaControls: element.getAttribute("aria-controls") ?? "", loading: /로딩|loading/i.test(text), hasExactTitle, area: Math.round(rect.width * rect.height) };
      }, title.trim()).catch(() => undefined);
      if (!data || data.loading) continue;
      if (!fallback && (data.role === "dialog" || data.ariaModal === "true")) fallback = { container: root, diagnostic: data };
      if (data.hasExactTitle) return { container: root, diagnostic: data };
    }
    await targetPage.waitForTimeout(250);
  }
  return fallback;
}

async function draftCandidates(container, title) {
  return container.evaluate((root, expectedTitle) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const exactNodes = [...root.querySelectorAll("*")].filter((node) => !["INPUT", "TEXTAREA"].includes(node.tagName) && normalize(node.textContent) === expectedTitle);
    const items = [];
    for (const node of exactNodes) {
      const item = node.closest('li, article, [role="option"], [data-draft-id], [data-post-id], [data-id], button, a[href], [role="button"]');
      if (!item || !root.contains(item) || items.includes(item)) continue;
      items.push(item);
    }
    return items.map((item, candidateIndex) => {
      const rect = item.getBoundingClientRect();
      const id = item.getAttribute("data-draft-id") ?? item.getAttribute("data-post-id") ?? item.getAttribute("data-id") ?? item.getAttribute("data-value") ?? (item.getAttribute("href")?.match(/(?:postId=|\/)(\d+)(?:\D|$)/)?.[1]) ?? "";
      const dateNode = item.querySelector('time, [class*="date" i], [class*="time" i]');
      return { scope: "draft-list", visible: rect.width > 0 && rect.height > 0, tagName: item.tagName.toLowerCase(), title: expectedTitle, id, href: String(item.getAttribute("href") ?? "").slice(0, 180), date: normalize(dateNode?.textContent).slice(0, 80), className: String(item.className ?? "").slice(0, 140), candidateIndex };
    });
  }, title.trim()).catch(() => []);
}

async function draftCandidateHandle(container, title, candidateIndex) {
  return container.evaluateHandle((root, input) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const exactNodes = [...root.querySelectorAll("*")].filter((node) => !["INPUT", "TEXTAREA"].includes(node.tagName) && normalize(node.textContent) === input.title);
    const items = [];
    for (const node of exactNodes) {
      const item = node.closest('li, article, [role="option"], [data-draft-id], [data-post-id], [data-id], button, a[href], [role="button"]');
      if (item && root.contains(item) && !items.includes(item)) items.push(item);
    }
    return items[input.candidateIndex] ?? null;
  }, { title, candidateIndex });
}

function safeDraftCandidate(candidate) { return { title: candidate.title, id: candidate.id || undefined, date: candidate.date || undefined, tagName: candidate.tagName, className: candidate.className, hrefPresent: Boolean(candidate.href), candidateIndex: candidate.candidateIndex }; }

function structureDiagnosticCode(diagnostic) {
  if (!diagnostic?.h2Matched) return "reopened_heading_missing";
  if (!diagnostic?.tocMatched) return "reopened_toc_missing";
  if (!diagnostic?.internalLinksMatched) return "reopened_internal_link_missing";
  if (!diagnostic?.relatedLinksMatched) return "reopened_related_posts_missing";
  return "structure_verification_failed";
}
async function readMeaningfulBody(targetPage, expectedHtml) {
  const editorHtml = await targetPage.evaluate(() => window.tinymce?.activeEditor?.getContent?.() ?? "").catch(() => "");
  if (bodyValueMatches(editorHtml, expectedHtml)) return true;
  const areas = targetPage.locator('textarea:not([placeholder*="제목"]), [contenteditable="true"]');
  for (let index = 0; index < await areas.count(); index += 1) {
    const area = areas.nth(index); if (!await area.isVisible().catch(() => false)) continue;
    const value = await area.inputValue().catch(() => area.innerHTML().catch(() => ""));
    if (bodyValueMatches(value, expectedHtml)) return true;
  }
  const codeMirrors = targetPage.locator(".CodeMirror");
  for (let index = 0; index < await codeMirrors.count(); index += 1) {
    const value = await codeMirrors.nth(index).evaluate((element) => element.CodeMirror?.getValue?.() ?? "").catch(() => "");
    if (bodyValueMatches(value, expectedHtml)) return true;
  }
  return false;
}

async function safeDiagnostic(targetPage, expectedHtml) {
  const codeMirrorDiagnostics = [];
  const codeMirrors = targetPage.locator(".CodeMirror");
  for (let index = 0; index < await codeMirrors.count(); index += 1) { const value = await codeMirrors.nth(index).evaluate((element) => element.CodeMirror?.getValue?.() ?? "").catch(() => ""); codeMirrorDiagnostics.push({ index, htmlLength: value.length, textLength: plain(value).length, matchesExpected: bodyValueMatches(value, expectedHtml) }); }
  return {
    currentUrl: safeUrl(targetPage.url()),
    titleCandidates: await targetPage.locator('textarea[placeholder*="제목"], input[placeholder*="제목"], [aria-label*="제목"]').count(),
    visibleTitleCandidates: await targetPage.locator('textarea[placeholder*="제목"]:visible, input[placeholder*="제목"]:visible, [aria-label*="제목"]:visible').count(),
    bodyTextareas: await targetPage.locator('textarea:not([placeholder*="제목"])').count(),
    visibleBodyTextareas: await targetPage.locator('textarea:not([placeholder*="제목"]):visible').count(),
    contenteditables: await targetPage.locator('[contenteditable="true"]').count(),
    codeMirrors: await targetPage.locator(".CodeMirror").count(),
    visibleCodeMirrors: await targetPage.locator(".CodeMirror:visible").count(),
    codeMirrorDiagnostics,
    categoryControls: await targetPage.locator('button:has-text("카테고리"), [aria-controls*="category" i], select[name*="category" i]').count(),
    listboxes: await targetPage.getByRole("listbox").count(),
    draftButtons: await targetPage.getByRole("button", { name: /임시저장/ }).count(),
    draftButtonLabels: await targetPage.getByRole("button", { name: /임시저장/ }).allInnerTexts().then((values) => values.slice(0, 4)),
    ...(draftLookupDiagnostic ? { draftLookup: draftLookupDiagnostic } : {}),
    ...(draftOpenDiagnostic ? { draftOpen: draftOpenDiagnostic } : {}),
    ...(bodyProbeDiagnostic ? { bodyProbe: bodyProbeDiagnostic } : {}),
    ...(runtimeFailureDiagnostic ? { runtimeFailure: runtimeFailureDiagnostic } : {}),
  };
}
function safeUrl(value) { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "unknown"; } }
