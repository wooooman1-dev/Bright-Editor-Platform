import { access, stat } from "node:fs/promises";

export const tistoryMediaUploadSelectors = Object.freeze({
  existingImageInput: 'input[type="file"]#openFile, input[type="file"][accept*="image" i]',
  attachMenu: '[aria-label="첨부"]:visible',
  photoMenuItem: '#attach-image:visible, [role="menuitem"]:has-text("사진"):visible',
});

const editorMediaUnitSelector = 'figure.imageblock, figure[data-ke-type="image"], figure[data-origin-width], [data-ke-type="image"], img';
const editorMediaWrapperSelector = 'figure.imageblock, figure[data-ke-type="image"], figure[data-origin-width], [data-ke-type="image"]';
const trustedMediaHostPattern = /(?:^|\.)(?:kakaocdn\.net|daumcdn\.net|tistory\.com|kakao\.com)$/i;

export async function assertReadableMediaAsset(localPath) {
  let details;
  try {
    details = await stat(localPath);
  } catch (error) {
    if (error?.code === "ENOENT") throw mediaError("media_asset_missing", "업로드할 로컬 이미지 Asset을 찾을 수 없습니다.");
    throw mediaError("media_asset_unreadable", "업로드할 로컬 이미지 Asset을 읽을 수 없습니다.");
  }
  if (!details.isFile() || details.size <= 0) throw mediaError("media_asset_unreadable", "업로드할 로컬 이미지 Asset을 읽을 수 없습니다.");
  try {
    await access(localPath);
  } catch {
    throw mediaError("media_asset_unreadable", "업로드할 로컬 이미지 Asset을 읽을 수 없습니다.");
  }
}

export async function uploadTistoryMediaSequentially(page, media, uploadOne = uploadSingleTistoryImage) {
  const resolved = [];
  for (let index = 0; index < media.length; index += 1) {
    const item = media[index];
    try {
      resolved.push(await uploadOne(page, item));
    } catch (error) {
      throw withMediaEvidence(error, { blockId: item?.blockId, mediaIndex: index });
    }
  }
  return resolved;
}

export async function uploadSingleTistoryImage(page, item) {
  await assertReadableMediaAsset(item.localPath);
  await waitForMediaEditorReady(page);
  const before = await collectEditorMediaSnapshot(page);
  const upload = await setTistoryImageFile(page, item.localPath);
  try {
    const remoteUrl = await waitForNewTrustedEditorImage(page, before);
    return Object.freeze({ blockId: item.blockId, placeholderUrl: item.placeholderUrl, remoteUrl });
  } catch (error) {
    throw withMediaEvidence(error, { blockId: item.blockId, uploadMethod: upload.method });
  }
}

export async function setTistoryImageFile(page, localPath, controlTimeout = 5000) {
  const existing = await imageFileInputs(page);
  for (const input of existing) {
    if (!await input.isEnabled().catch(() => false)) continue;
    try {
      await input.setInputFiles(localPath);
      return Object.freeze({ method: "existing_input" });
    } catch {
      throw mediaError("media_file_rejected", "Tistory 이미지 입력 영역이 선택한 파일을 허용하지 않았습니다.");
    }
  }

  const attachMenus = page.locator(tistoryMediaUploadSelectors.attachMenu);
  const attachMenu = attachMenus.last();
  if (!await attachMenu.isVisible().catch(() => false)) {
    throw mediaError("media_upload_control_missing", "Tistory 에디터에서 첨부 Control을 찾지 못했습니다.");
  }
  await attachMenu.click({ timeout: controlTimeout }).catch(() => {
    throw mediaError("media_upload_control_missing", "Tistory 에디터의 첨부 Control을 열지 못했습니다.");
  });

  const photoMenuItem = page.locator(tistoryMediaUploadSelectors.photoMenuItem).first();
  try {
    await photoMenuItem.waitFor({ state: "visible", timeout: controlTimeout });
  } catch {
    throw mediaError("media_upload_control_missing", "Tistory 첨부 메뉴에서 사진 Control을 찾지 못했습니다.");
  }

  const chooserPromise = page.waitForEvent("filechooser", { timeout: controlTimeout }).catch(() => undefined);
  await photoMenuItem.click({ timeout: controlTimeout }).catch(() => {
    throw mediaError("media_filechooser_not_opened", "Tistory 사진 Control을 실행하지 못했습니다.");
  });
  const chooser = await chooserPromise;
  if (chooser) {
    try {
      await chooser.setFiles(localPath);
      return Object.freeze({ method: "filechooser" });
    } catch {
      throw mediaError("media_file_rejected", "Tistory filechooser가 선택한 이미지 파일을 허용하지 않았습니다.");
    }
  }

  const generated = await imageFileInputs(page);
  const input = generated.at(-1);
  if (!input) {
    const fileInputCount = await countFileInputs(page);
    if (fileInputCount > 0) throw mediaError("media_file_input_missing", "Tistory가 이미지 업로드용 file input을 제공하지 않았습니다.");
    throw mediaError("media_filechooser_not_opened", "Tistory 사진 Control이 filechooser를 열지 않았습니다.");
  }
  try {
    await input.setInputFiles(localPath);
    return Object.freeze({ method: "generated_input" });
  } catch {
    throw mediaError("media_file_rejected", "Tistory 이미지 입력 영역이 선택한 파일을 허용하지 않았습니다.");
  }
}

export async function waitForNewTrustedEditorImage(page, before, timeout = 45000) {
  const baseline = normalizeSnapshot(before);
  const started = Date.now();
  let insertedMediaObserved = false;
  let lastSnapshot = baseline;

  while (Date.now() - started < timeout) {
    const current = await collectEditorMediaSnapshot(page);
    lastSnapshot = current;
    if (current.totalMediaCount > baseline.totalMediaCount) insertedMediaObserved = true;
    const remoteUrl = increasedTrustedUrl(current, baseline);
    if (insertedMediaObserved && remoteUrl) return remoteUrl;
    await page.waitForTimeout(250);
  }

  const evidence = {
    baselineMediaCount: baseline.totalMediaCount,
    lastMediaCount: lastSnapshot.totalMediaCount,
    baselineTrustedUrlCount: totalUrlCount(baseline.trustedUrlCounts),
    lastTrustedUrlCount: totalUrlCount(lastSnapshot.trustedUrlCounts),
  };
  if (insertedMediaObserved) {
    throw mediaError("media_insert_failed", "업로드한 이미지 구조는 생성됐지만 Tistory 본문에서 신뢰 가능한 원격 이미지 주소를 확인하지 못했습니다.", evidence);
  }
  throw mediaError("media_upload_timeout", "Tistory 이미지 업로드 후 본문 이미지 구조가 생성되지 않았습니다.", evidence);
}

export async function collectEditorMediaSnapshot(page) {
  const contexts = [];
  const activeEditor = await collectActiveTinyMceMedia(page);
  if (activeEditor.available) {
    contexts.push({ id: "tinymce-active-editor", entries: activeEditor.entries });
  } else {
    const frames = page.frames();
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      if (frame === page.mainFrame()) continue;
      const descriptor = await describeFrame(frame, index);
      if (!descriptor.isEditor) continue;
      const entries = await collectFrameMedia(frame).catch(() => []);
      contexts.push({ id: descriptor.id, entries });
    }
  }

  if (!contexts.length) {
    const fallback = await collectMainEditableMedia(page).catch(() => ({ available: false, entries: [] }));
    if (fallback.available) contexts.push({ id: "main-contenteditable", entries: fallback.entries });
  }

  return buildSnapshot(contexts);
}

export async function collectTrustedImageUrls(page) {
  const snapshot = await collectEditorMediaSnapshot(page);
  return new Set(Object.keys(snapshot.trustedUrlCounts));
}

async function waitForMediaEditorReady(page) {
  const title = page.locator('textarea[placeholder*="제목"], input[placeholder*="제목"]').first();
  try {
    await title.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.tinymce?.activeEditor?.getBody?.()), undefined, { timeout: 15000 });
  } catch {
    throw mediaError("media_upload_control_missing", "Tistory 에디터가 이미지 업로드 준비 상태가 되지 않았습니다.");
  }
}

async function imageFileInputs(page) {
  const inputs = [];
  for (const frame of page.frames()) {
    const candidates = frame.locator(tistoryMediaUploadSelectors.existingImageInput);
    for (let index = 0; index < await candidates.count(); index += 1) inputs.push(candidates.nth(index));
  }
  return inputs;
}

async function countFileInputs(page) {
  let count = 0;
  for (const frame of page.frames()) count += await frame.locator('input[type="file"]').count();
  return count;
}

async function collectActiveTinyMceMedia(page) {
  return page.evaluate(({ unitSelector, wrapperSelector }) => {
    const body = window.tinymce?.activeEditor?.getBody?.();
    if (!body) return { available: false, entries: [] };
    return { available: true, entries: collectUnits(body, unitSelector, wrapperSelector) };

    function collectUnits(root, unitsSelector, wrappersSelector) {
      const candidates = [...root.querySelectorAll(unitsSelector)];
      return candidates
        .filter((element) => !(element.tagName === "IMG" && element.closest(wrappersSelector)))
        .map((element, index) => describeUnit(element, root, index));
    }

    function describeUnit(element, root, index) {
      const carriers = [element, ...element.querySelectorAll("*")];
      if (element.tagName === "IMG") {
        let parent = element.parentElement;
        for (let depth = 0; parent && parent !== root && depth < 3; depth += 1, parent = parent.parentElement) carriers.push(parent);
      }
      const values = [];
      const names = new Set();
      for (const carrier of carriers) {
        for (const attribute of carrier.attributes ?? []) {
          if (!/(?:src|url|phocus)/i.test(attribute.name)) continue;
          names.add(attribute.name);
          if (attribute.value) values.push(attribute.value);
        }
      }
      return { index, tagName: element.tagName.toLowerCase(), attributeNames: [...names].sort(), attributeValues: values };
    }
  }, { unitSelector: editorMediaUnitSelector, wrapperSelector: editorMediaWrapperSelector }).catch(() => ({ available: false, entries: [] }));
}

async function collectFrameMedia(frame) {
  return frame.evaluate(({ unitSelector, wrapperSelector }) => {
    const root = document.body;
    if (!root) return [];
    const candidates = [...root.querySelectorAll(unitSelector)];
    return candidates
      .filter((element) => !(element.tagName === "IMG" && element.closest(wrapperSelector)))
      .map((element, index) => {
        const carriers = [element, ...element.querySelectorAll("*")];
        if (element.tagName === "IMG") {
          let parent = element.parentElement;
          for (let depth = 0; parent && parent !== root && depth < 3; depth += 1, parent = parent.parentElement) carriers.push(parent);
        }
        const values = [];
        const names = new Set();
        for (const carrier of carriers) {
          for (const attribute of carrier.attributes ?? []) {
            if (!/(?:src|url|phocus)/i.test(attribute.name)) continue;
            names.add(attribute.name);
            if (attribute.value) values.push(attribute.value);
          }
        }
        return { index, tagName: element.tagName.toLowerCase(), attributeNames: [...names].sort(), attributeValues: values };
      });
  }, { unitSelector: editorMediaUnitSelector, wrapperSelector: editorMediaWrapperSelector });
}

async function collectMainEditableMedia(page) {
  return page.evaluate(({ unitSelector, wrapperSelector }) => {
    const root = document.querySelector('body#tinymce, body.mce-content-body, [contenteditable="true"]');
    if (!root) return { available: false, entries: [] };
    const candidates = [...root.querySelectorAll(unitSelector)];
    const entries = candidates
      .filter((element) => !(element.tagName === "IMG" && element.closest(wrapperSelector)))
      .map((element, index) => {
        const carriers = [element, ...element.querySelectorAll("*")];
        if (element.tagName === "IMG") {
          let parent = element.parentElement;
          for (let depth = 0; parent && parent !== root && depth < 3; depth += 1, parent = parent.parentElement) carriers.push(parent);
        }
        const values = [];
        const names = new Set();
        for (const carrier of carriers) {
          for (const attribute of carrier.attributes ?? []) {
            if (!/(?:src|url|phocus)/i.test(attribute.name)) continue;
            names.add(attribute.name);
            if (attribute.value) values.push(attribute.value);
          }
        }
        return { index, tagName: element.tagName.toLowerCase(), attributeNames: [...names].sort(), attributeValues: values };
      });
    return { available: true, entries };
  }, { unitSelector: editorMediaUnitSelector, wrapperSelector: editorMediaWrapperSelector });
}

async function describeFrame(frame, index) {
  let elementId = "";
  let elementName = "";
  try {
    const element = await frame.frameElement();
    elementId = await element.getAttribute("id") ?? "";
    elementName = await element.getAttribute("name") ?? "";
  } catch {
    // Cross-origin or detached frames are not editor candidates.
  }
  const frameName = frame.name() ?? "";
  const namedEditor = /editor-tistory_ifr/i.test(`${elementId} ${elementName} ${frameName}`);
  const editorBody = await frame.locator('body#tinymce, body.mce-content-body, body[contenteditable="true"]').count().then((count) => count > 0).catch(() => false);
  return {
    id: `frame:${elementId || elementName || frameName || index}`,
    isEditor: namedEditor || editorBody,
  };
}

function buildSnapshot(contexts) {
  const trustedUrlCounts = {};
  let totalMediaCount = 0;
  const safeContexts = contexts.map((context) => {
    const entries = context.entries.map((entry) => {
      const trustedUrls = [...new Set((entry.attributeValues ?? []).map(trustedImageUrl).filter(Boolean))];
      for (const url of trustedUrls) trustedUrlCounts[url] = (trustedUrlCounts[url] ?? 0) + 1;
      totalMediaCount += 1;
      return Object.freeze({
        index: entry.index,
        tagName: entry.tagName,
        attributeNames: Object.freeze([...(entry.attributeNames ?? [])]),
        trustedUrls: Object.freeze(trustedUrls),
      });
    });
    return Object.freeze({ id: context.id, entries: Object.freeze(entries) });
  });
  return Object.freeze({ contexts: Object.freeze(safeContexts), totalMediaCount, trustedUrlCounts: Object.freeze(trustedUrlCounts) });
}

function normalizeSnapshot(value) {
  if (value && typeof value === "object" && typeof value.totalMediaCount === "number" && value.trustedUrlCounts) return value;
  const trustedUrlCounts = {};
  if (value instanceof Set) {
    for (const item of value) {
      const url = trustedImageUrl(item) ?? String(item);
      trustedUrlCounts[url] = (trustedUrlCounts[url] ?? 0) + 1;
    }
  }
  return Object.freeze({ contexts: Object.freeze([]), totalMediaCount: 0, trustedUrlCounts: Object.freeze(trustedUrlCounts) });
}

function increasedTrustedUrl(current, baseline) {
  for (const [url, count] of Object.entries(current.trustedUrlCounts)) {
    if (count > (baseline.trustedUrlCounts[url] ?? 0)) return url;
  }
  return undefined;
}

function totalUrlCount(counts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function trustedImageUrl(value) {
  if (typeof value !== "string") return undefined;
  let candidate = value.trim();
  if (!candidate) return undefined;
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  if (!/^https:\/\//i.test(candidate)) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !trustedMediaHostPattern.test(url.hostname)) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function withMediaEvidence(error, evidence) {
  if (!error || typeof error !== "object") return error;
  error.mediaEvidence = Object.freeze({ ...(error.mediaEvidence ?? {}), ...withoutUndefined(evidence) });
  return error;
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function mediaError(diagnosticCode, safeMessage, evidence = undefined) {
  const error = new Error(safeMessage);
  error.name = "TistoryMediaUploadError";
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  if (evidence) error.mediaEvidence = Object.freeze(withoutUndefined(evidence));
  return error;
}
