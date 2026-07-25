const markerPrefix = "[[BRIGHT_TISTORY_MEDIA:";
const markerSuffix = "]]";
const placeholderOrigin = "https://bright-studio.invalid/tistory-media/";

export function tistoryMediaMarkerText(blockId) {
  const value = String(blockId ?? "").trim();
  if (!value) throw mediaMarkerError("media_marker_block_id_missing", "이미지 Marker에 사용할 Block ID가 없습니다.");
  return `${markerPrefix}${value}${markerSuffix}`;
}

export function replaceTistoryMediaPlaceholdersWithMarkers(html, media) {
  let output = String(html ?? "");
  for (const item of media ?? []) output = replaceSinglePlaceholder(output, item);
  if (output.includes(placeholderOrigin)) {
    throw mediaMarkerError("media_placeholder_unresolved", "일부 로컬 이미지 위치를 Tistory 업로드 Marker로 변환하지 못했습니다.");
  }
  return output;
}

export function isTistoryMediaMarkerText(value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.startsWith(markerPrefix) && normalized.endsWith(markerSuffix);
}

function replaceSinglePlaceholder(html, item) {
  const placeholderUrl = String(item?.placeholderUrl ?? "");
  if (!placeholderUrl || !html.includes(placeholderUrl)) {
    throw mediaMarkerError("media_placeholder_missing", "원고에서 변환할 이미지 Placeholder를 찾지 못했습니다.");
  }

  const marker = `<p class="bright-tistory-media-marker">${escapeHtml(tistoryMediaMarkerText(item?.blockId))}</p>`;
  const figures = [...html.matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi)];
  const figure = figures.find((match) => match[0].includes(placeholderUrl));
  if (figure) return html.replace(figure[0], marker);

  const imagePattern = new RegExp(`<img\\b[^>]*\\bsrc=(['"])${escapeRegExp(placeholderUrl)}\\1[^>]*>`, "i");
  if (imagePattern.test(html)) return html.replace(imagePattern, marker);

  throw mediaMarkerError("media_placeholder_structure_unknown", "이미지 Placeholder 주변의 Renderer HTML 구조를 확인하지 못했습니다.");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function mediaMarkerError(diagnosticCode, safeMessage) {
  const error = new Error(safeMessage);
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  return error;
}
