const nativeImageWrapperSelector = [
  "figure.imageblock",
  'figure[data-ke-type="image"]',
  "figure[data-origin-width]",
  '[data-ke-type="image"]',
].join(", ");

const trustedMediaHostPattern = /(?:^|\.)(?:kakaocdn\.net|daumcdn\.net|tistory\.com|kakao\.com)$/i;

export async function captureNativeTistoryImageFragment(page, remoteUrl, timeout = 12000) {
  assertTrustedRemoteUrl(remoteUrl);
  const startedAt = Date.now();
  let lastDiagnostic;

  while (Date.now() - startedAt < timeout) {
    const active = await captureFromActiveEditor(page, remoteUrl);
    if (active?.html) return freezeFragment(active);

    for (const frame of page.frames()) {
      const result = await captureFromFrame(frame, remoteUrl).catch(() => undefined);
      if (result?.html) return freezeFragment(result);
    }

    const fallback = await captureFromMainEditable(page, remoteUrl).catch(() => undefined);
    if (fallback?.html) return freezeFragment(fallback);

    lastDiagnostic = {
      activeTinyMce: await page.evaluate(() => Boolean(window.tinymce?.activeEditor?.getBody?.())).catch(() => false),
      frameCount: page.frames().length,
    };
    await page.waitForTimeout(250);
  }

  throw nativeMediaError(
    "native_media_fragment_not_found",
    "업로드한 이미지는 확인했지만 Tistory 네이티브 이미지 구조를 추출하지 못했습니다.",
    lastDiagnostic,
  );
}

async function captureFromActiveEditor(page, remoteUrl) {
  return page.evaluate(({ url, wrapperSelector }) => {
    const root = window.tinymce?.activeEditor?.getBody?.();
    if (!root) return undefined;
    return findFragment(root, url, wrapperSelector, "tinymce-active-editor");

    function findFragment(rootNode, expectedUrl, selector, context) {
      for (const image of rootNode.querySelectorAll("img")) {
        if (!matchesImage(image, expectedUrl)) continue;
        const wrapper = image.closest(selector);
        if (!wrapper) return undefined;
        return describe(wrapper, image, context);
      }
      return undefined;
    }

    function matchesImage(image, expectedUrl) {
      const values = [image.currentSrc, image.getAttribute("src"), image.getAttribute("data-url"), image.getAttribute("data-phocus")].filter(Boolean);
      let parent = image.parentElement;
      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        for (const attribute of parent.attributes ?? []) {
          if (/(?:src|url|phocus)/i.test(attribute.name) && attribute.value) values.push(attribute.value);
        }
      }
      return values.some((value) => sameRemote(value, expectedUrl));
    }

    function sameRemote(value, expectedUrl) {
      if (value === expectedUrl || value.includes(expectedUrl) || expectedUrl.includes(value)) return true;
      try {
        const left = new URL(value, location.href);
        const right = new URL(expectedUrl, location.href);
        return left.hostname === right.hostname && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
      } catch {
        return false;
      }
    }

    function describe(wrapper, image, context) {
      return {
        html: wrapper.outerHTML,
        metadata: {
          context,
          tagName: wrapper.tagName.toLowerCase(),
          className: typeof wrapper.className === "string" ? wrapper.className.slice(0, 200) : "",
          dataKeType: wrapper.getAttribute("data-ke-type") ?? "",
          originWidth: wrapper.getAttribute("data-origin-width") ?? "",
          originHeight: wrapper.getAttribute("data-origin-height") ?? "",
          hasDataUrl: Boolean(wrapper.querySelector("[data-url]")),
          hasPhocus: Boolean(wrapper.querySelector("[data-phocus]")),
          imageAlt: image.getAttribute("alt") ?? "",
        },
      };
    }
  }, { url: remoteUrl, wrapperSelector: nativeImageWrapperSelector }).catch(() => undefined);
}

async function captureFromFrame(frame, remoteUrl) {
  return frame.evaluate(({ url, wrapperSelector, frameName }) => {
    const root = document.body;
    if (!root) return undefined;
    for (const image of root.querySelectorAll("img")) {
      const values = [image.currentSrc, image.getAttribute("src"), image.getAttribute("data-url"), image.getAttribute("data-phocus")].filter(Boolean);
      let parent = image.parentElement;
      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        for (const attribute of parent.attributes ?? []) {
          if (/(?:src|url|phocus)/i.test(attribute.name) && attribute.value) values.push(attribute.value);
        }
      }
      const matched = values.some((value) => {
        if (value === url || value.includes(url) || url.includes(value)) return true;
        try {
          const left = new URL(value, location.href);
          const right = new URL(url, location.href);
          return left.hostname === right.hostname && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
        } catch {
          return false;
        }
      });
      if (!matched) continue;
      const wrapper = image.closest(wrapperSelector);
      if (!wrapper) return undefined;
      return {
        html: wrapper.outerHTML,
        metadata: {
          context: `frame:${frameName || "unnamed"}`,
          tagName: wrapper.tagName.toLowerCase(),
          className: typeof wrapper.className === "string" ? wrapper.className.slice(0, 200) : "",
          dataKeType: wrapper.getAttribute("data-ke-type") ?? "",
          originWidth: wrapper.getAttribute("data-origin-width") ?? "",
          originHeight: wrapper.getAttribute("data-origin-height") ?? "",
          hasDataUrl: Boolean(wrapper.querySelector("[data-url]")),
          hasPhocus: Boolean(wrapper.querySelector("[data-phocus]")),
          imageAlt: image.getAttribute("alt") ?? "",
        },
      };
    }
    return undefined;
  }, { url: remoteUrl, wrapperSelector: nativeImageWrapperSelector, frameName: frame.name() });
}

async function captureFromMainEditable(page, remoteUrl) {
  return page.evaluate(({ url, wrapperSelector }) => {
    const roots = [...document.querySelectorAll('body#tinymce, body.mce-content-body, [contenteditable="true"]')];
    for (const root of roots) {
      for (const image of root.querySelectorAll("img")) {
        const values = [image.currentSrc, image.getAttribute("src"), image.getAttribute("data-url"), image.getAttribute("data-phocus")].filter(Boolean);
        const matched = values.some((value) => value === url || value.includes(url) || url.includes(value));
        if (!matched) continue;
        const wrapper = image.closest(wrapperSelector);
        if (!wrapper) return undefined;
        return {
          html: wrapper.outerHTML,
          metadata: {
            context: "main-contenteditable",
            tagName: wrapper.tagName.toLowerCase(),
            className: typeof wrapper.className === "string" ? wrapper.className.slice(0, 200) : "",
            dataKeType: wrapper.getAttribute("data-ke-type") ?? "",
            originWidth: wrapper.getAttribute("data-origin-width") ?? "",
            originHeight: wrapper.getAttribute("data-origin-height") ?? "",
            hasDataUrl: Boolean(wrapper.querySelector("[data-url]")),
            hasPhocus: Boolean(wrapper.querySelector("[data-phocus]")),
            imageAlt: image.getAttribute("alt") ?? "",
          },
        };
      }
    }
    return undefined;
  }, { url: remoteUrl, wrapperSelector: nativeImageWrapperSelector });
}

function freezeFragment(value) {
  assertNativeFragment(value.html);
  return Object.freeze({ html: value.html, metadata: Object.freeze({ ...(value.metadata ?? {}) }) });
}

export function assertNativeFragment(html) {
  const value = String(html ?? "").trim();
  if (!value || !/<figure\b/i.test(value) || !/(?:class=["'][^"']*imageblock|data-ke-type=["']image["'])/i.test(value)) {
    throw nativeMediaError("native_media_fragment_invalid", "Tistory 네이티브 이미지 Wrapper를 확인하지 못했습니다.");
  }
  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(value)) {
    throw nativeMediaError("native_media_fragment_unsafe", "Tistory 이미지 구조에 허용되지 않은 실행 속성이 포함되어 있습니다.");
  }
  const urls = [...value.matchAll(/https:\/\/[^\s"'<>]+/gi)].map((match) => match[0].replace(/&amp;/g, "&"));
  if (!urls.some(isTrustedRemoteUrl)) {
    throw nativeMediaError("native_media_fragment_untrusted", "Tistory 네이티브 이미지 구조에서 신뢰 가능한 원격 주소를 확인하지 못했습니다.");
  }
}

function assertTrustedRemoteUrl(value) {
  if (!isTrustedRemoteUrl(value)) throw nativeMediaError("native_media_url_untrusted", "Tistory 이미지 주소가 신뢰 가능한 Host가 아닙니다.");
}

function isTrustedRemoteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && trustedMediaHostPattern.test(url.hostname);
  } catch {
    return false;
  }
}

function nativeMediaError(diagnosticCode, safeMessage, evidence) {
  const error = new Error(safeMessage);
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  if (evidence) error.mediaEvidence = Object.freeze({ ...evidence });
  return error;
}
