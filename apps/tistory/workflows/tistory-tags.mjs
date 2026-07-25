import { readFile } from "node:fs/promises";

import { prepareTistoryMediaInCurrentEditor } from "./tistory-same-editor-media.mjs";

const TAG_INPUT_SELECTOR = [
  'input[placeholder="#태그입력"]',
  'input[placeholder*="태그"]',
  'textarea[placeholder*="태그"]',
  '[contenteditable="true"][data-placeholder*="태그"]',
  '[contenteditable="true"][aria-label*="태그"]',
].join(", ");

const NATIVE_IMAGE_WRAPPER_SELECTOR = [
  "figure.imageblock",
  'figure[data-ke-type="image"]',
  "figure[data-origin-width]",
  '[data-ke-type="image"]',
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
  if (expected.length) {
    const input = await visibleTagInput(page);
    if (!input) {
      return {
        passed: false,
        code: "tag_input_not_found",
        message: "Tistory 태그 입력 영역을 찾지 못했습니다.",
        tags: expected,
        evidence: { media: mediaEvidence(media) },
      };
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
        code: verification.code ?? "tag_input_verification_failed",
        message: verification.message ?? "태그를 입력했지만 생성된 태그를 확인하지 못했습니다.",
        evidence: { ...(verification.evidence ?? {}), upload: mediaEvidence(media) },
      };
    }
    return { ...verification, evidence: { ...(verification.evidence ?? {}), upload: mediaEvidence(media) } };
  }

  const verification = await verifyTistoryTags(page, []);
  if (!verification.passed) return verification;
  return {
    ...verification,
    skipped: true,
    evidence: { ...(verification.evidence ?? {}), upload: mediaEvidence(media) },
  };
}

export async function verifyTistoryTags(page, values, resolvedInput) {
  const expected = normalizeTistoryTags(values);
  const workflow = await readWorkflowContext();
  const evidence = {};

  if (expected.length) {
    const input = resolvedInput ?? await visibleTagInput(page);
    if (!input) {
      return {
        passed: false,
        code: "tag_input_not_found",
        message: "저장된 Tistory 태그 영역을 찾지 못했습니다.",
        tags: expected,
      };
    }

    const samples = await readTagEvidence(page, input);
    const normalizedEvidence = samples.join(" ").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}-]/gu, "");
    const missing = expected.filter((tag) => !normalizedEvidence.includes(tag.toLocaleLowerCase("ko-KR")));
    evidence.tags = { expected, missing, samples: samples.slice(0, 12) };
    if (missing.length) {
      return {
        passed: false,
        code: "tag_values_missing",
        message: `저장된 태그에서 ${missing.join(", ")} 항목을 확인하지 못했습니다.`,
        tags: expected,
        evidence,
      };
    }
  } else {
    evidence.tags = { expected: [], missing: [], samples: [] };
  }

  const media = await verifyPersistedTistoryMedia(page, workflow.mediaCount);
  evidence.media = media.evidence;
  if (!media.passed) {
    return {
      passed: false,
      code: media.code,
      message: media.message,
      tags: expected,
      evidence,
    };
  }

  const category = await prepareObservedCategoryCarrier(
    page,
    workflow.categoryId,
    workflow.categoryName,
  );
  evidence.category = category;

  return {
    passed: true,
    tags: expected,
    skipped: expected.length === 0,
    evidence,
  };
}

async function readWorkflowContext(commandPath = process.argv[2]) {
  if (!commandPath) return { mediaCount: 0, categoryId: undefined, categoryName: undefined };
  try {
    const command = JSON.parse(await readFile(commandPath, "utf8"));
    return {
      mediaCount: Array.isArray(command.media) ? command.media.length : 0,
      categoryId: command.categoryId,
      categoryName: typeof command.categoryName === "string" ? command.categoryName : undefined,
    };
  } catch {
    return { mediaCount: 0, categoryId: undefined, categoryName: undefined };
  }
}

async function verifyPersistedTistoryMedia(page, expectedCount) {
  if (!(expectedCount > 0)) {
    return { passed: true, evidence: { expectedCount: 0, skipped: true } };
  }

  const evidence = await page.evaluate(({ expected, wrapperSelector }) => {
    const body = window.tinymce?.activeEditor?.getBody?.();
    if (!body) {
      return {
        editorAvailable: false,
        expectedCount: expected,
        imageCount: 0,
        nativeImageCount: 0,
        altCount: 0,
        markerCount: -1,
      };
    }
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const images = [...body.querySelectorAll("img")];
    const nativeImages = images.filter((image) => Boolean(image.closest(wrapperSelector)));
    const markers = [...body.querySelectorAll("p, div, span")].filter((node) =>
      /^\[\[BRIGHT_TISTORY_MEDIA:.+\]\]$/.test(normalize(node.textContent)),
    );
    return {
      editorAvailable: true,
      expectedCount: expected,
      imageCount: images.length,
      nativeImageCount: nativeImages.length,
      altCount: images.filter((image) => Boolean(normalize(image.getAttribute("alt")))).length,
      markerCount: markers.length,
      nativeMetadataCount: nativeImages.filter((image) => {
        const wrapper = image.closest(wrapperSelector);
        return Boolean(
          wrapper?.getAttribute("data-ke-type")
          || wrapper?.getAttribute("data-origin-width")
          || image.getAttribute("data-url")
          || image.getAttribute("data-phocus"),
        );
      }).length,
    };
  }, { expected: expectedCount, wrapperSelector: NATIVE_IMAGE_WRAPPER_SELECTOR }).catch(() => ({
    editorAvailable: false,
    expectedCount,
    imageCount: 0,
    nativeImageCount: 0,
    altCount: 0,
    markerCount: -1,
    nativeMetadataCount: 0,
  }));

  if (!evidence.editorAvailable) {
    return {
      passed: false,
      code: "media_persistence_editor_unavailable",
      message: "다시 연 Tistory 편집기에서 이미지 상태를 확인하지 못했습니다.",
      evidence,
    };
  }
  if (evidence.markerCount !== 0) {
    return {
      passed: false,
      code: "media_persistence_marker_remaining",
      message: "다시 연 Tistory 본문에 제거되지 않은 이미지 Marker가 있습니다.",
      evidence,
    };
  }
  if (evidence.imageCount < expectedCount || evidence.nativeImageCount < expectedCount) {
    return {
      passed: false,
      code: "media_persistence_count_mismatch",
      message: "다시 연 Tistory 본문에서 원고 이미지 수만큼 네이티브 이미지를 확인하지 못했습니다.",
      evidence,
    };
  }
  if (evidence.altCount < expectedCount) {
    return {
      passed: false,
      code: "media_persistence_alt_missing",
      message: "다시 연 Tistory 본문에서 이미지 ALT 정보를 모두 확인하지 못했습니다.",
      evidence,
    };
  }
  if (evidence.nativeMetadataCount < expectedCount) {
    return {
      passed: false,
      code: "media_persistence_native_metadata_missing",
      message: "다시 연 Tistory 본문에서 네이티브 이미지 첨부 정보를 모두 확인하지 못했습니다.",
      evidence,
    };
  }
  return { passed: true, evidence };
}

async function prepareObservedCategoryCarrier(page, categoryId, categoryName) {
  if (categoryId === undefined && !categoryName) return { skipped: true };
  if (categoryId === null) return { passed: true, uncategorized: true };

  return page.evaluate(({ expectedId, expectedName }) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const outsideEditor = (element) => !element.closest('body#tinymce, .mce-content-body, [contenteditable="true"]');

    const hiddenIds = [...document.querySelectorAll('input[type="hidden"][name*="category" i], input[type="hidden"][id*="category" i]')]
      .map((element) => element.value)
      .filter(Boolean);
    const selectedOptions = [...document.querySelectorAll('select[name*="category" i] option:checked, select[id*="category" i] option:checked, [role="option"][aria-selected="true"]')]
      .map((element) => ({
        id: element.getAttribute("data-category-id")
          ?? element.getAttribute("data-id")
          ?? element.getAttribute("data-value")
          ?? element.getAttribute("value")
          ?? "",
        text: normalize(element.textContent),
      }));

    const textCandidates = expectedName
      ? [...document.querySelectorAll("button, [role=button], label, span, strong, em, div")]
        .filter((element) => outsideEditor(element) && visible(element) && normalize(element.textContent) === expectedName)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const context = `${element.id} ${element.className ?? ""} ${element.parentElement?.id ?? ""} ${element.parentElement?.className ?? ""}`;
          const categoryContext = /category|카테고리|분류/i.test(String(context));
          return { element, area: rect.width * rect.height, categoryContext };
        })
        .sort((left, right) => Number(right.categoryContext) - Number(left.categoryContext) || left.area - right.area)
      : [];

    const observedIds = [
      ...hiddenIds,
      ...selectedOptions.map((item) => item.id),
      ...textCandidates.map(({ element }) => element.getAttribute("data-category-id") ?? element.getAttribute("data-value") ?? ""),
    ].filter(Boolean);
    const observedNames = [
      ...selectedOptions.map((item) => item.text),
      ...textCandidates.map(({ element }) => normalize(element.textContent)),
    ].filter(Boolean);

    const idMatched = observedIds.includes(String(expectedId));
    const nameMatched = Boolean(expectedName && observedNames.some((value) => value.includes(expectedName)));
    const passed = idMatched || nameMatched;
    const carrier = textCandidates[0]?.element;

    if (passed && carrier) {
      if (carrier.id && carrier.id !== "category-btn") carrier.setAttribute("data-bright-original-id", carrier.id);
      carrier.id = "category-btn";
      carrier.setAttribute("data-bright-category-verification", "observed");
      carrier.setAttribute("data-category-id", String(expectedId));
      carrier.setAttribute("aria-haspopup", "listbox");
    }

    return {
      passed,
      expectedId: String(expectedId),
      expectedName: expectedName ?? "",
      observedIds: observedIds.slice(0, 20),
      observedNames: observedNames.slice(0, 20),
      idMatched,
      nameMatched,
      carrierPrepared: Boolean(passed && carrier),
      carrierTagName: carrier?.tagName?.toLowerCase() ?? "",
      carrierCategoryContext: Boolean(textCandidates[0]?.categoryContext),
    };
  }, { expectedId: categoryId, expectedName: categoryName }).catch(() => ({
    passed: false,
    expectedId: String(categoryId),
    expectedName: categoryName ?? "",
    carrierPrepared: false,
  }));
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
