const nativeImageSelector = [
  "body#tinymce figure.imageblock img",
  'body#tinymce figure[data-ke-type="image"] img',
  "body#tinymce figure[data-origin-width] img",
  'body#tinymce [data-ke-type="image"] img',
  ".mce-content-body figure.imageblock img",
  '.mce-content-body figure[data-ke-type="image"] img',
].join(", ");

const representativeControlSelector = ".mce-represent-image-btn";

export function reopenedRepresentativeLooksSelected(state) {
  if (!state || typeof state !== "object") return false;
  const className = String(state.className ?? "");
  const dataState = String(state.dataState ?? "");
  return state.ariaPressed === "true"
    || state.ariaChecked === "true"
    || state.ariaSelected === "true"
    || state.dataSelected === "true"
    || state.dataActive === "true"
    || /^(?:active|selected|checked|on)$/iu.test(dataState)
    || /(?:^|\s)(?:active|selected|checked|on)(?:\s|$)/iu.test(className);
}

export async function verifyReopenedTistoryRepresentativeImage(page, expectedMediaCount) {
  const target = await firstReopenedNativeImage(page);
  if (!target) {
    if (!(expectedMediaCount > 0)) {
      return { passed: true, evidence: { skipped: true, expectedMediaCount: 0, nativeImageFound: false } };
    }
    return {
      passed: false,
      code: "representative_persistence_image_not_found",
      message: "다시 연 Tistory 본문에서 대표이미지 후보인 첫 번째 네이티브 이미지를 찾지 못했습니다.",
      evidence: { expectedMediaCount, selector: nativeImageSelector },
    };
  }

  const click = await target.locator.scrollIntoViewIfNeeded({ timeout: 5000 })
    .then(() => target.locator.click({ timeout: 5000 }))
    .then(() => ({ passed: true }))
    .catch((error) => ({
      passed: false,
      error: {
        name: String(error?.name ?? "Error").slice(0, 120),
        message: String(error?.message ?? error ?? "unknown").slice(0, 1200),
      },
    }));

  if (!click.passed) {
    return {
      passed: false,
      code: "representative_persistence_image_click_failed",
      message: "다시 연 Tistory 본문의 첫 번째 이미지를 대표이미지 확인 대상으로 선택하지 못했습니다.",
      evidence: { expectedMediaCount, context: target.context, imageIndex: target.imageIndex, click },
    };
  }

  const located = await waitForRepresentativeControl(page);
  if (!located) {
    return {
      passed: false,
      code: "representative_persistence_control_not_found",
      message: "다시 연 Tistory 편집기에서 대표이미지 control을 찾지 못했습니다.",
      evidence: {
        expectedMediaCount,
        context: target.context,
        imageIndex: target.imageIndex,
        selector: representativeControlSelector,
        controlCount: await page.locator(representativeControlSelector).count().catch(() => 0),
      },
    };
  }

  const state = await readRepresentativeControlState(located.locator);
  if (!reopenedRepresentativeLooksSelected(state)) {
    return {
      passed: false,
      code: "representative_persistence_not_selected",
      message: "다시 연 Tistory 임시글에서 첫 번째 이미지의 대표이미지 지정 상태가 유지되지 않았습니다.",
      evidence: {
        expectedMediaCount,
        context: target.context,
        imageIndex: target.imageIndex,
        selector: representativeControlSelector,
        controlContext: located.context,
        state,
      },
    };
  }

  return {
    passed: true,
    evidence: {
      expectedMediaCount,
      nativeImageFound: true,
      context: target.context,
      imageIndex: target.imageIndex,
      selector: representativeControlSelector,
      controlContext: located.context,
      state,
    },
  };
}

async function firstReopenedNativeImage(page) {
  const frames = page.frames();
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const images = frame.locator(nativeImageSelector);
    const count = await images.count().catch(() => 0);
    for (let imageIndex = 0; imageIndex < count; imageIndex += 1) {
      const locator = images.nth(imageIndex);
      if (!await locator.isVisible().catch(() => false)) continue;
      return {
        locator,
        imageIndex,
        context: frame === page.mainFrame() ? "main" : `frame:${frameIndex}`,
      };
    }
  }
  return undefined;
}

async function waitForRepresentativeControl(page, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidates = page.locator(representativeControlSelector);
    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const locator = candidates.nth(index);
      if (!await locator.isVisible().catch(() => false)) continue;
      return { locator, context: "main", index };
    }
    await page.waitForTimeout(100);
  }
  return undefined;
}

async function readRepresentativeControlState(locator) {
  return locator.evaluate((element) => ({
    tagName: element.tagName.toLowerCase(),
    className: String(element.className ?? ""),
    ariaPressed: element.getAttribute?.("aria-pressed") ?? "",
    ariaChecked: element.getAttribute?.("aria-checked") ?? "",
    ariaSelected: element.getAttribute?.("aria-selected") ?? "",
    dataSelected: element.getAttribute?.("data-selected") ?? "",
    dataActive: element.getAttribute?.("data-active") ?? "",
    dataState: element.getAttribute?.("data-state") ?? "",
  })).catch(() => ({
    tagName: "",
    className: "",
    ariaPressed: "",
    ariaChecked: "",
    ariaSelected: "",
    dataSelected: "",
    dataActive: "",
    dataState: "",
  }));
}
