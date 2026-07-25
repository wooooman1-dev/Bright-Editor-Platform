import { prepareTistoryMediaInCurrentEditor } from "./tistory-same-editor-media.mjs";

const TAG_INPUT_SELECTOR = [
  'input[placeholder="#태그입력"]',
  'input[placeholder*="태그"]',
  'textarea[placeholder*="태그"]',
  '[contenteditable="true"][data-placeholder*="태그"]',
  '[contenteditable="true"][aria-label*="태그"]',
].join(", ");

export function normalizeTistoryTags(values, limit = 8) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value ?? "")
      .replace(/^#+/u, "")
      .replace(/\s+/gu, "")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/^-+|-+$/gu, "")
      .trim();
    const key = normalized.toLocaleLowerCase("ko-KR");
    if (!normalized || normalized.length > 24 || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= Math.max(1, limit)) break;
  }
  return result;
}

export async function fillTistoryTags(page, values) {
  let media;
  try {
    media = await prepareTistoryMediaInCurrentEditor(page);
  } catch (error) {
    return {
      passed: false,
      code: error?.diagnosticCode ?? "media_same_editor_upload_failed",
      message: error?.safeMessage ?? "현재 Tistory 편집기에서 이미지를 업로드하지 못했습니다.",
      tags: normalizeTistoryTags(values),
      evidence: error?.mediaEvidence,
    };
  }

  const expected = normalizeTistoryTags(values);
  if (!expected.length) {
    return {
      passed: true,
      tags: [],
      skipped: true,
      evidence: { expected: [], media: mediaEvidence(media) },
    };
  }

  const input = await visibleTagInput(page);
  if (!input) {
    return { passed: false, code: "tag_input_not_found", message: "Tistory 태그 입력 영역을 찾지 못했습니다.", tags: expected, evidence: { media: mediaEvidence(media) } };
  }

  for (const tag of expected) {
    await input.fill(tag);
    await input.press("Enter");
    await page.waitForTimeout(100);
  }

  const verification = await verifyTistoryTags(page, expected, input);
  if (!verification.passed) {
    return {
      ...verification,
      code: "tag_input_verification_failed",
      message: "태그를 입력했지만 생성된 태그를 확인하지 못했습니다.",
      evidence: { ...(verification.evidence ?? {}), media: mediaEvidence(media) },
    };
  }
  return { ...verification, evidence: { ...(verification.evidence ?? {}), media: mediaEvidence(media) } };
}

export async function verifyTistoryTags(page, values, resolvedInput) {
  const expected = normalizeTistoryTags(values);
  if (!expected.length) return { passed: true, tags: [], skipped: true, evidence: { expected: [] } };

  const input = resolvedInput ?? await visibleTagInput(page);
  if (!input) {
    return { passed: false, code: "tag_input_not_found", message: "저장된 Tistory 태그 영역을 찾지 못했습니다.", tags: expected };
  }

  const evidence = await readTagEvidence(page, input);
  const normalizedEvidence = evidence.join(" ").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}-]/gu, "");
  const missing = expected.filter((tag) => !normalizedEvidence.includes(tag.toLocaleLowerCase("ko-KR")));
  return {
    passed: missing.length === 0,
    tags: expected,
    evidence: { expected, missing, samples: evidence.slice(0, 12) },
    ...(missing.length ? { code: "tag_values_missing", message: `저장된 태그에서 ${missing.join(", ")} 항목을 확인하지 못했습니다.` } : {}),
  };
}

function mediaEvidence(media) {
  if (!media || media.skipped) return { skipped: true, count: 0 };
  return {
    skipped: false,
    count: media.media?.length ?? 0,
    representativeBlockId: media.representativeMedia?.blockId,
    ...(media.evidence ?? {}),
  };
}

async function visibleTagInput(page) {
  const candidates = page.locator(TAG_INPUT_SELECTOR);
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEditable().catch(() => false)) return candidate;
  }
  return undefined;
}

async function readTagEvidence(page, input) {
  const parentTexts = await input.evaluate((element) => {
    const values = [];
    let current = element.parentElement;
    for (let depth = 0; depth < 4 && current; depth += 1) {
      const text = (current.innerText ?? current.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text && text.length <= 600) values.push(text);
      current = current.parentElement;
    }
    return values;
  }).catch(() => []);

  const explicitTokens = await page.locator([
    "[data-tag]",
    '[class*="tag" i] [class*="item" i]',
    '[class*="tag" i] [class*="chip" i]',
    '[class*="tag" i] li',
    '[class*="tag" i] button',
  ].join(", ")).allTextContents().catch(() => []);

  return [...parentTexts, ...explicitTokens]
    .map((value) => String(value).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
