import { readFile } from "node:fs/promises";

import {
  tistoryMediaUploadSelectors,
  uploadSingleTistoryImage,
  uploadTistoryMediaSequentially,
} from "./tistory-media-upload.mjs";
import { tistoryMediaMarkerText } from "./tistory-media-marker.mjs";
import { ensureFirstTistoryImageRepresentative } from "./tistory-representative-image.mjs";

const nativeWrapperSelector = 'figure.imageblock, figure[data-ke-type="image"], figure[data-origin-width], [data-ke-type="image"]';

export async function prepareTistoryMediaInCurrentEditor(page, commandPath = process.argv[2]) {
  if (!commandPath) return Object.freeze({ passed: true, skipped: true, media: Object.freeze([]) });
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  const media = Array.isArray(command.media) ? command.media : [];
  if (!media.length) return Object.freeze({ passed: true, skipped: true, media: Object.freeze([]) });

  let uploadIndex = 0;
  const resolved = await uploadTistoryMediaSequentially(page, media, async (editorPage, item) => {
    const currentIndex = uploadIndex;
    uploadIndex += 1;
    const markerText = tistoryMediaMarkerText(item.blockId);
    const markerFocused = await focusMediaMarker(editorPage, markerText);
    if (!markerFocused) {
      throw mediaPlacementError("media_marker_not_found", "Tistory 본문에서 이미지 위치 Marker를 찾지 못했습니다.", {
        blockId: item.blockId,
        mediaIndex: currentIndex,
      });
    }

    await removeReusableImageInputs(editorPage);
    const uploaded = await uploadSingleTistoryImage(editorPage, item);
    const placement = await placeUploadedImageAtMarker(editorPage, {
      alt: item.alt,
      markerText,
      remoteUrl: uploaded.remoteUrl,
    });
    if (!placement.passed) {
      throw mediaPlacementError(placement.code, placement.message, {
        blockId: item.blockId,
        mediaIndex: currentIndex,
        remoteUrl: uploaded.remoteUrl,
        ...(placement.evidence ? { placement: placement.evidence } : {}),
      });
    }

    const geometry = await waitForPlacedImageGeometry(editorPage, uploaded.remoteUrl);
    if (!geometry.passed) {
      throw mediaPlacementError(
        geometry.code ?? "media_image_geometry_invalid",
        geometry.message ?? "업로드된 이미지가 Tistory 본문에서 정상 크기로 배치되지 않았습니다.",
        {
          blockId: item.blockId,
          mediaIndex: currentIndex,
          remoteUrl: uploaded.remoteUrl,
          placement: placement.metadata,
          geometry: geometry.evidence,
        },
      );
    }

    return Object.freeze({
      ...uploaded,
      alt: item.alt,
      nativeMetadata: Object.freeze({
        ...placement.metadata,
        geometry: geometry.evidence,
      }),
      representativeCandidate: currentIndex === 0,
    });
  });

  const representative = await ensureFirstTistoryImageRepresentative(page, resolved[0].remoteUrl);
  if (!representative.passed) {
    throw mediaPlacementError(representative.code, representative.message, {
      blockId: media[0].blockId,
      mediaIndex: 0,
      remoteUrl: resolved[0].remoteUrl,
      ...(representative.evidence ? { representative: representative.evidence } : {}),
    });
  }
  const prepared = Object.freeze(resolved.map((item, index) => index === 0
    ? Object.freeze({ ...item, representative: representative.evidence, representativeVerified: representative.verified === true })
    : item));

  const verification = await verifySameEditorMedia(page, media.length);
  if (!verification.passed) {
    throw mediaPlacementError(verification.code, verification.message, verification.evidence);
  }

  return Object.freeze({
    passed: true,
    skipped: false,
    media: prepared,
    representativeMedia: prepared[0],
    evidence: Object.freeze({
      ...verification.evidence,
      representative: prepared[0]?.representative,
      representativeVerified: prepared[0]?.representativeVerified === true,
    }),
  });
}

async function focusMediaMarker(page, markerText) {
  return page.evaluate((expected) => {
    const editor = window.tinymce?.activeEditor;
    const body = editor?.getBody?.();
    if (!editor || !body) return false;
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const marker = [...body.querySelectorAll("p, div, span")].find((node) => normalize(node.textContent) === expected);
    if (!marker) return false;
    const markerBlock = marker.closest("p, div") ?? marker;
    editor.focus();
    editor.selection.select(markerBlock);
    editor.selection.collapse(true);
    return true;
  }, markerText).catch(() => false);
}

async function placeUploadedImageAtMarker(page, input) {
  return page.evaluate(({ alt, markerText, remoteUrl, wrapperSelector }) => {
    const editor = window.tinymce?.activeEditor;
    const body = editor?.getBody?.();
    if (!editor || !body) {
      return { passed: false, code: "media_editor_unavailable", message: "Tistory 기본모드 편집기를 확인하지 못했습니다." };
    }

    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const marker = [...body.querySelectorAll("p, div, span")].find((node) => normalize(node.textContent) === markerText);
    if (!marker) {
      return { passed: false, code: "media_marker_not_found_after_upload", message: "이미지 업로드 후 원래 위치 Marker를 다시 찾지 못했습니다." };
    }
    const markerBlock = marker.closest("p, div") ?? marker;

    const sameRemote = (value, expected) => {
      if (!value) return false;
      if (value === expected || value.includes(expected) || expected.includes(value)) return true;
      try {
        const left = new URL(value, location.href);
        const right = new URL(expected, location.href);
        return left.hostname === right.hostname && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
      } catch {
        return false;
      }
    };

    const image = [...body.querySelectorAll("img")].find((node) => {
      const values = [node.currentSrc, node.getAttribute("src"), node.getAttribute("data-url"), node.getAttribute("data-phocus")].filter(Boolean);
      let parent = node.parentElement;
      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        for (const attribute of parent.attributes ?? []) {
          if (/(?:src|url|phocus)/i.test(attribute.name) && attribute.value) values.push(attribute.value);
        }
      }
      return values.some((value) => sameRemote(value, remoteUrl));
    });
    if (!image) {
      return { passed: false, code: "media_uploaded_image_not_found", message: "업로드된 이미지를 현재 Tistory 본문에서 식별하지 못했습니다." };
    }

    const wrapper = image.closest(wrapperSelector) ?? image;
    const markerParent = markerBlock.parentNode;
    if (wrapper !== markerBlock && !markerParent) {
      return {
        passed: false,
        code: "media_marker_block_parent_missing",
        message: "이미지 위치 Marker 블록의 상위 요소를 확인하지 못했습니다.",
      };
    }
    image.setAttribute("alt", String(alt ?? "").trim());

    const replaceMarkerBlock = () => {
      if (wrapper === markerBlock) return;
      markerParent.insertBefore(wrapper, markerBlock);
      markerBlock.remove();
    };
    if (typeof editor.undoManager?.transact === "function") editor.undoManager.transact(replaceMarkerBlock);
    else replaceMarkerBlock();

    editor.selection.select(wrapper);
    editor.nodeChanged?.();
    editor.setDirty?.(true);
    editor.save?.();
    editor.fire?.("change");

    const wrapperRect = wrapper.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    return {
      passed: true,
      metadata: {
        tagName: wrapper.tagName.toLowerCase(),
        className: typeof wrapper.className === "string" ? wrapper.className.slice(0, 200) : "",
        dataKeType: wrapper.getAttribute?.("data-ke-type") ?? "",
        originWidth: wrapper.getAttribute?.("data-origin-width") ?? "",
        originHeight: wrapper.getAttribute?.("data-origin-height") ?? "",
        hasDataUrl: Boolean(wrapper.querySelector?.("[data-url]")),
        hasPhocus: Boolean(wrapper.querySelector?.("[data-phocus]")),
        markerTagName: marker.tagName.toLowerCase(),
        markerBlockTagName: markerBlock.tagName.toLowerCase(),
        markerWasInline: marker !== markerBlock,
        wrapperParentTagName: wrapper.parentElement?.tagName?.toLowerCase?.() ?? "",
        wrapperRect: { width: wrapperRect.width, height: wrapperRect.height },
        imageRect: { width: imageRect.width, height: imageRect.height },
      },
    };
  }, { ...input, wrapperSelector: nativeWrapperSelector }).catch((error) => ({
    passed: false,
    code: "media_marker_replacement_failed",
    message: "업로드된 이미지를 원고의 지정 위치에 배치하지 못했습니다.",
    evidence: { error: String(error?.message ?? error ?? "unknown").slice(0, 1000) },
  }));
}

async function waitForPlacedImageGeometry(page, remoteUrl, attempts = 20) {
  let latest;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await inspectPlacedImageGeometry(page, remoteUrl);
    if (latest.passed) return latest;
    await page.waitForTimeout(100);
  }
  return latest ?? {
    passed: false,
    code: "media_image_geometry_unavailable",
    message: "업로드된 이미지의 Tistory 본문 배치 크기를 확인하지 못했습니다.",
    evidence: {},
  };
}

async function inspectPlacedImageGeometry(page, remoteUrl) {
  return page.evaluate(({ expectedUrl, wrapperSelector }) => {
    const editor = window.tinymce?.activeEditor;
    const body = editor?.getBody?.();
    if (!body) {
      return {
        passed: false,
        code: "media_image_geometry_editor_unavailable",
        message: "이미지 배치 크기를 확인할 Tistory 편집기를 찾지 못했습니다.",
        evidence: { editorAvailable: false },
      };
    }
    const sameRemote = (value, expected) => {
      if (!value) return false;
      if (value === expected || value.includes(expected) || expected.includes(value)) return true;
      try {
        const left = new URL(value, location.href);
        const right = new URL(expected, location.href);
        return left.hostname === right.hostname && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
      } catch {
        return false;
      }
    };
    const image = [...body.querySelectorAll("img")].find((node) => {
      const values = [node.currentSrc, node.getAttribute("src"), node.getAttribute("data-url"), node.getAttribute("data-phocus")].filter(Boolean);
      let parent = node.parentElement;
      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        for (const attribute of parent.attributes ?? []) {
          if (/(?:src|url|phocus)/i.test(attribute.name) && attribute.value) values.push(attribute.value);
        }
      }
      return values.some((value) => sameRemote(value, expectedUrl));
    });
    if (!image) {
      return {
        passed: false,
        code: "media_image_geometry_target_missing",
        message: "배치 크기를 확인할 업로드 이미지를 찾지 못했습니다.",
        evidence: { editorAvailable: true, imageFound: false },
      };
    }

    const wrapper = image.closest(wrapperSelector) ?? image;
    const imageRect = image.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const minimumWidth = Math.min(120, Math.max(60, bodyRect.width * 0.15));
    const minimumHeight = 60;
    const evidence = {
      editorAvailable: true,
      imageFound: true,
      imageComplete: Boolean(image.complete),
      naturalWidth: image.naturalWidth ?? 0,
      naturalHeight: image.naturalHeight ?? 0,
      imageRect: { width: imageRect.width, height: imageRect.height },
      wrapperRect: { width: wrapperRect.width, height: wrapperRect.height },
      bodyRect: { width: bodyRect.width, height: bodyRect.height },
      minimumWidth,
      minimumHeight,
      wrapperParentTagName: wrapper.parentElement?.tagName?.toLowerCase?.() ?? "",
      wrapperInsideParagraph: Boolean(wrapper.closest("p")),
    };
    const passed = imageRect.width >= minimumWidth
      && imageRect.height >= minimumHeight
      && wrapperRect.width >= minimumWidth
      && wrapperRect.height >= minimumHeight
      && !evidence.wrapperInsideParagraph;
    return passed
      ? { passed: true, evidence }
      : {
          passed: false,
          code: "media_image_geometry_invalid",
          message: "업로드된 이미지가 Tistory 본문에서 비정상적으로 좁거나 문단 내부에 배치되었습니다.",
          evidence,
        };
  }, { expectedUrl: remoteUrl, wrapperSelector: nativeWrapperSelector }).catch((error) => ({
    passed: false,
    code: "media_image_geometry_inspection_failed",
    message: "업로드된 이미지의 Tistory 본문 배치 크기를 확인하지 못했습니다.",
    evidence: { error: String(error?.message ?? error ?? "unknown").slice(0, 1000) },
  }));
}

async function verifySameEditorMedia(page, expectedCount) {
  const evidence = await page.evaluate(({ expected, wrapperSelector }) => {
    const body = window.tinymce?.activeEditor?.getBody?.();
    if (!body) return { editorAvailable: false, expectedCount: expected, imageCount: 0, nativeImageCount: 0, markerCount: -1 };
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const markers = [...body.querySelectorAll("p, div, span")].filter((node) => /^\[\[BRIGHT_TISTORY_MEDIA:.+\]\]$/.test(normalize(node.textContent)));
    const images = [...body.querySelectorAll("img")];
    const nativeImages = images.filter((image) => Boolean(image.closest(wrapperSelector)));
    return {
      editorAvailable: true,
      expectedCount: expected,
      imageCount: images.length,
      nativeImageCount: nativeImages.length,
      markerCount: markers.length,
      altCount: images.filter((image) => Boolean(normalize(image.getAttribute("alt")))).length,
      invalidParagraphImageCount: nativeImages.filter((image) => Boolean(image.closest(wrapperSelector)?.closest("p"))).length,
    };
  }, { expected: expectedCount, wrapperSelector: nativeWrapperSelector }).catch(() => ({
    editorAvailable: false,
    expectedCount,
    imageCount: 0,
    nativeImageCount: 0,
    markerCount: -1,
    altCount: 0,
    invalidParagraphImageCount: -1,
  }));

  if (!evidence.editorAvailable) return { passed: false, code: "media_editor_unavailable", message: "Tistory 편집기에서 업로드 결과를 확인하지 못했습니다.", evidence };
  if (evidence.markerCount !== 0) return { passed: false, code: "media_marker_remaining", message: "이미지 업로드 후 제거되지 않은 위치 Marker가 있습니다.", evidence };
  if (evidence.imageCount < expectedCount || evidence.nativeImageCount < expectedCount) return { passed: false, code: "media_native_image_count_mismatch", message: "Tistory 네이티브 이미지 수가 원고 이미지 수와 일치하지 않습니다.", evidence };
  if (evidence.invalidParagraphImageCount !== 0) return { passed: false, code: "media_native_image_nested_in_paragraph", message: "Tistory 네이티브 이미지가 문단 내부에 잘못 배치되었습니다.", evidence };
  if (evidence.altCount < expectedCount) return { passed: false, code: "media_alt_missing", message: "업로드된 이미지의 ALT 정보를 모두 확인하지 못했습니다.", evidence };
  return { passed: true, evidence };
}

async function removeReusableImageInputs(page) {
  for (const frame of page.frames()) {
    const inputs = frame.locator(tistoryMediaUploadSelectors.existingImageInput);
    await inputs.evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => undefined);
  }
}

function mediaPlacementError(diagnosticCode, safeMessage, mediaEvidence) {
  const error = new Error(safeMessage);
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  if (mediaEvidence) error.mediaEvidence = Object.freeze({ ...mediaEvidence });
  return error;
}
