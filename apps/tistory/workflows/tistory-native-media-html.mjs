import { assertNativeFragment } from "./tistory-native-media-fragment.mjs";

const placeholderOrigin = "https://bright-studio.invalid/tistory-media/";

export function replaceTistoryMediaPlaceholders(html, resolvedMedia) {
  let output = String(html ?? "");
  for (const item of resolvedMedia ?? []) {
    output = replaceSinglePlaceholder(output, item);
  }
  if (output.includes(placeholderOrigin)) {
    throw nativeHtmlError("media_placeholder_unresolved", "일부 로컬 이미지가 Tistory 네이티브 이미지 구조로 변환되지 않았습니다.");
  }
  return output;
}

function replaceSinglePlaceholder(html, item) {
  const placeholderUrl = String(item?.placeholderUrl ?? "");
  const nativeHtml = String(item?.nativeHtml ?? "");
  if (!placeholderUrl || !html.includes(placeholderUrl)) {
    throw nativeHtmlError("media_placeholder_missing", "원고에서 변환할 이미지 Placeholder를 찾지 못했습니다.");
  }
  assertNativeFragment(nativeHtml);

  const withAlt = applyAlt(nativeHtml, item?.alt);
  const figurePattern = new RegExp(
    `<figure\\b[^>]*>[\\s\\S]*?<img\\b[^>]*\\bsrc=(['"])${escapeRegExp(placeholderUrl)}\\1[^>]*>[\\s\\S]*?<\\/figure>`,
    "i",
  );
  const figureMatch = html.match(figurePattern);
  if (figureMatch) {
    const caption = figureMatch[0].match(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/i)?.[0];
    return html.replace(figurePattern, mergeCaption(withAlt, caption));
  }

  const imagePattern = new RegExp(`<img\\b[^>]*\\bsrc=(['"])${escapeRegExp(placeholderUrl)}\\1[^>]*>`, "i");
  if (imagePattern.test(html)) return html.replace(imagePattern, withAlt);

  throw nativeHtmlError("media_placeholder_structure_unknown", "이미지 Placeholder 주변의 Renderer HTML 구조를 확인하지 못했습니다.");
}

function applyAlt(nativeHtml, alt) {
  const value = String(alt ?? "").trim();
  if (!value) return nativeHtml;
  const escaped = escapeAttribute(value);
  if (/<img\b[^>]*\balt=(['"])[\s\S]*?\1/i.test(nativeHtml)) {
    return nativeHtml.replace(/(<img\b[^>]*\balt=)(['"])[\s\S]*?\2/i, `$1"${escaped}"`);
  }
  return nativeHtml.replace(/<img\b/i, `<img alt="${escaped}"`);
}

function mergeCaption(nativeHtml, caption) {
  if (!caption || /<figcaption\b/i.test(nativeHtml)) return nativeHtml;
  if (/<\/figure>\s*$/i.test(nativeHtml)) return nativeHtml.replace(/<\/figure>\s*$/i, `${caption}</figure>`);
  return `${nativeHtml}${caption}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nativeHtmlError(diagnosticCode, safeMessage) {
  const error = new Error(safeMessage);
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  return error;
}
