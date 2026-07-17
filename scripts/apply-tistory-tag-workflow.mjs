import { readFile, writeFile } from "node:fs/promises";

const path = "apps/tistory/workflows/tistory-draft-worker.mjs";
let source = await readFile(path, "utf8");

if (source.includes('from "./tistory-tags.mjs"')) process.exit(0);

function replaceExact(before, after) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) throw new Error(`Expected one patch target, found ${matches}.`);
  source = source.replace(before, after);
}

replaceExact(
  'import { automationClicksAllowed, editorStateSynchronized, looksAuxiliary, readOnlyClicksAllowed, reopenedDraftVerified, selectCodeMirrorCandidate, selectDraftCandidate, semanticHtmlVerified, verifyCategoryEvidence } from "./tistory-body-editor.mjs";\n',
  'import { automationClicksAllowed, editorStateSynchronized, looksAuxiliary, readOnlyClicksAllowed, reopenedDraftVerified, selectCodeMirrorCandidate, selectDraftCandidate, semanticHtmlVerified, verifyCategoryEvidence } from "./tistory-body-editor.mjs";\nimport { fillTistoryTags, verifyTistoryTags } from "./tistory-tags.mjs";\n',
);

replaceExact(
  '    step("category_reverified", `다시 연 임시글의 카테고리가 ${command.categoryName ?? "없음"}과 일치합니다.`, category.evidence);\n\n    const structure = await verifyRenderedHtml(page, command.html);',
  '    step("category_reverified", `다시 연 임시글의 카테고리가 ${command.categoryName ?? "없음"}과 일치합니다.`, category.evidence);\n\n    const reopenedTags = await verifyTistoryTags(page, command.tags);\n    if (!reopenedTags.passed) fail("tags_reverified", reopenedTags.code, reopenedTags.message);\n    step("tags_reverified", `다시 연 임시글에서 태그 ${reopenedTags.tags.length}개를 확인했습니다.`, reopenedTags.evidence);\n\n    const structure = await verifyRenderedHtml(page, command.html);',
);

replaceExact(
  '  const body = await fillHtmlBody(page, command.html);\n  if (!body.passed) fail(body.failedStep ?? "body_filled", body.code, body.message);\n\n  const finalTitle = await visibleTitle(page);',
  '  const body = await fillHtmlBody(page, command.html);\n  if (!body.passed) fail(body.failedStep ?? "body_filled", body.code, body.message);\n\n  const tags = await fillTistoryTags(page, command.tags);\n  if (!tags.passed) fail("tags_filled", tags.code, tags.message);\n  step("tags_filled", `Tistory 태그 ${tags.tags.length}개를 입력했습니다.`, tags.evidence);\n  step("tags_verified", `입력된 태그 ${tags.tags.length}개를 저장 전에 확인했습니다.`, tags.evidence);\n\n  const finalTitle = await visibleTitle(page);',
);

replaceExact(
  '  step("body_reverified", "다시 연 임시글의 본문이 비어 있지 않고 현재 Renderer 본문과 일치합니다.");\n\n  const reopenedCategory = await verifyCategorySelection(page, command.categoryId, command.categoryName);',
  '  step("body_reverified", "다시 연 임시글의 본문이 비어 있지 않고 현재 Renderer 본문과 일치합니다.");\n\n  const reopenedTags = await verifyTistoryTags(page, command.tags);\n  if (!reopenedTags.passed) fail("tags_reverified", reopenedTags.code, reopenedTags.message);\n  step("tags_reverified", `다시 연 임시글에서 태그 ${reopenedTags.tags.length}개를 확인했습니다.`, reopenedTags.evidence);\n\n  const reopenedCategory = await verifyCategorySelection(page, command.categoryId, command.categoryName);',
);

await writeFile(path, source, "utf8");
