const nativeWrapperSelector = 'figure.imageblock, figure[data-ke-type="image"], figure[data-origin-width], [data-ke-type="image"]';
const representativeControlSelector = ".mce-represent-image-btn";

export function representativeControlLooksSelected(state) {
  if (!state || typeof state !== "object") return false;
  const label = String(state.label ?? "").replace(/\s+/gu, " ").trim();
  const className = String(state.className ?? "");
  const dataState = String(state.dataState ?? "");
  return state.checked === true
    || state.ariaPressed === "true"
    || state.ariaChecked === "true"
    || state.ariaSelected === "true"
    || state.dataSelected === "true"
    || state.dataActive === "true"
    || /^(?:active|selected|checked|on)$/iu.test(dataState)
    || /해제|선택됨|설정됨/u.test(label)
    || /(?:^|\s)(?:active|selected|checked|on)(?:\s|$)/iu.test(className);
}

export async function ensureFirstTistoryImageRepresentative(page, remoteUrl) {
  const selection = await selectRepresentativeCandidate(page, remoteUrl);
  if (!selection.passed) return selection;

  const trustedClick = await clickRepresentativeCandidate(page, remoteUrl);
  if (!trustedClick.passed) {
    return representativeFailure(
      trustedClick.code ?? "representative_image_click_failed",
      trustedClick.message ?? "대표이미지 후보를 실제 Tistory 편집 화면에서 클릭하지 못했습니다.",
      { selection, trustedClick },
    );
  }

  const located = await waitForRepresentativeControl(page);
  if (!located) {
    return representativeFailure(
      "representative_control_not_found",
      "첫 번째 이미지의 대표이미지 설정 control을 찾지 못했습니다.",
      {
        selection,
        trustedClick,
        controls: await representativeControlDiagnostics(page),
      },
    );
  }

  const before = await readRepresentativeControlState(located.locator);
  if (representativeControlLooksSelected(before)) {
    return {
      passed: true,
      attempted: true,
      verified: true,
      evidence: {
        selection,
        trustedClick,
        selector: representativeControlSelector,
        context: located.context,
        before,
        after: before,
        action: "already_selected",
      },
    };
  }

  const clicked = await located.locator.click({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!clicked) {
    return representativeFailure(
      "representative_control_not_clickable",
      "첫 번째 이미지의 대표이미지 설정 control을 클릭하지 못했습니다.",
      {
        selection,
        trustedClick,
        selector: representativeControlSelector,
        context: located.context,
        before,
      },
    );
  }

  const selected = await waitForRepresentativeSelection(page, located.locator);
  const evidence = {
    selection,
    trustedClick,
    selector: representativeControlSelector,
    context: located.context,
    before,
    after: selected.state,
    action: selected.verified ? "selected_and_verified" : "control_clicked_unverified",
  };

  if (!selected.verified) {
    return representativeFailure(
      "representative_selection_not_verified",
      "첫 번째 이미지를 대표이미지로 설정했지만 선택 상태를 다시 확인하지 못했습니다.",
      evidence,
    );
  }

  return { passed: true, attempted: true, verified: true, evidence };
}

function representativeFailure(code, message, evidence) {
  return {
    passed: false,
    attempted: true,
    verified: false,
    code,
    message,
    evidence: {
      ...evidence,
      failure: { code, message },
    },
  };
}

async function selectRepresentativeCandidate(page, remoteUrl) {
  return page.evaluate(({ expectedUrl, wrapperSelector }) => {
    const editor = window.tinymce?.activeEditor;
    const body = editor?.getBody?.();
    if (!editor || !body) {
      return {
        passed: false,
        code: "representative_editor_unavailable",
        message: "대표이미지를 설정할 Tistory 편집기를 확인하지 못했습니다.",
      };
    }

    const sameRemote = (value, expected) => {
      if (!value) return false;
      if (value === expected || value.includes(expected) || expected.includes(value)) return true;
      try {
        const left = new URL(value, location.href);
        const right = new URL(expected, location.href);
        return left.hostname === right.hostname
          && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
      } catch {
        return false;
      }
    };

    const image = [...body.querySelectorAll("img")].find((node) => {
      const values = [
        node.currentSrc,
        node.getAttribute("src"),
        node.getAttribute("data-url"),
        node.getAttribute("data-phocus"),
      ].filter(Boolean);
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
        code: "representative_image_not_found",
        message: "대표이미지 후보인 첫 번째 업로드 이미지를 본문에서 찾지 못했습니다.",
      };
    }

    const wrapper = image.closest(wrapperSelector) ?? image;
    wrapper.scrollIntoView?.({ block: "center", inline: "center" });
    editor.focus();
    editor.selection.select(wrapper);
    editor.nodeChanged?.();
    return {
      passed: true,
      tagName: wrapper.tagName.toLowerCase(),
      className: typeof wrapper.className === "string" ? wrapper.className.slice(0, 200) : "",
      sourcePresent: Boolean(image.currentSrc || image.getAttribute("src")),
    };
  }, { expectedUrl: remoteUrl, wrapperSelector: nativeWrapperSelector }).catch(() => ({
    passed: false,
    code: "representative_image_selection_failed",
    message: "첫 번째 이미지를 대표이미지 후보로 선택하지 못했습니다.",
  }));
}

async function clickRepresentativeCandidate(page, remoteUrl) {
  const frames = page.frames();
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const images = frame.locator("figure img, [data-ke-type=\"image\"] img");
    const count = await images.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const image = images.nth(index);
      const matched = await image.evaluate((node, expectedUrl) => {
        const sameRemote = (value, expected) => {
          if (!value) return false;
          if (value === expected || value.includes(expected) || expected.includes(value)) return true;
          try {
            const left = new URL(value, location.href);
            const right = new URL(expected, location.href);
            return left.hostname === right.hostname
              && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
          } catch {
            return false;
          }
        };
        const values = [
          node.currentSrc,
          node.getAttribute("src"),
          node.getAttribute("data-url"),
          node.getAttribute("data-phocus"),
        ].filter(Boolean);
        let parent = node.parentElement;
        for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
          for (const attribute of parent.attributes ?? []) {
            if (/(?:src|url|phocus)/i.test(attribute.name) && attribute.value) values.push(attribute.value);
          }
        }
        return values.some((value) => sameRemote(value, expectedUrl));
      }, remoteUrl).catch(() => false);
      if (!matched) continue;

      await image.scrollIntoViewIfNeeded().catch(() => undefined);
      const visible = await image.isVisible().catch(() => false);
      const clicked = visible
        && await image.click({ timeout: 5000 }).then(() => true).catch(() => false);
      if (!clicked) {
        return {
          passed: false,
          code: "representative_image_click_failed",
          message: "대표이미지 후보를 실제 Tistory 편집 화면에서 클릭하지 못했습니다.",
          context: frame === page.mainFrame() ? "main" : `frame:${frameIndex}`,
          imageIndex: index,
        };
      }
      return {
        passed: true,
        trusted: true,
        context: frame === page.mainFrame() ? "main" : `frame:${frameIndex}`,
        imageIndex: index,
      };
    }
  }

  return {
    passed: false,
    code: "representative_click_target_not_found",
    message: "대표이미지 후보의 실제 이미지 element를 Tistory 편집 화면에서 찾지 못했습니다.",
  };
}

async function waitForRepresentativeControl(page, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const located = await findRepresentativeControl(page);
    if (located) return located;
    await page.waitForTimeout(100);
  }
  return undefined;
}

async function findRepresentativeControl(page) {
  const candidates = page.locator(representativeControlSelector);
  const count = await candidates.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const locator = candidates.nth(index);
    if (!await locator.isVisible().catch(() => false)) continue;
    if (!await locator.isEnabled().catch(() => true)) continue;
    return { locator, context: "main", index };
  }
  return undefined;
}

async function waitForRepresentativeSelection(page, locator, attempts = 30) {
  let state;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    state = await readRepresentativeControlState(locator);
    if (representativeControlLooksSelected(state)) return { verified: true, state };
    await page.waitForTimeout(100);
  }
  return { verified: false, state };
}

async function readRepresentativeControlState(locator) {
  return locator.evaluate((element) => ({
    label: String(element.textContent ?? "").replace(/\s+/g, " ").trim(),
    tagName: element.tagName.toLowerCase(),
    className: String(element.className ?? ""),
    checked: Boolean(element.checked),
    ariaPressed: element.getAttribute?.("aria-pressed") ?? "",
    ariaChecked: element.getAttribute?.("aria-checked") ?? "",
    ariaSelected: element.getAttribute?.("aria-selected") ?? "",
    dataSelected: element.getAttribute?.("data-selected") ?? "",
    dataActive: element.getAttribute?.("data-active") ?? "",
    dataState: element.getAttribute?.("data-state") ?? "",
  })).catch(() => ({
    label: "",
    tagName: "",
    className: "",
    checked: false,
    ariaPressed: "",
    ariaChecked: "",
    ariaSelected: "",
    dataSelected: "",
    dataActive: "",
    dataState: "",
  }));
}

async function representativeControlDiagnostics(page) {
  const candidates = page.locator(representativeControlSelector);
  const count = await candidates.count().catch(() => 0);
  const controls = [];
  for (let index = 0; index < count; index += 1) {
    const locator = candidates.nth(index);
    controls.push({
      index,
      visible: await locator.isVisible().catch(() => false),
      enabled: await locator.isEnabled().catch(() => false),
      state: await readRepresentativeControlState(locator),
    });
  }
  return {
    selector: representativeControlSelector,
    count,
    controls,
  };
}
