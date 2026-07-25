const nativeWrapperSelector = 'figure.imageblock, figure[data-ke-type="image"], figure[data-origin-width], [data-ke-type="image"]';
const representativeLabelPattern = /대표\s*이미지|대표이미지|^대표$/u;
const representativeAttributeSelector = [
  '[aria-label*="대표"]',
  '[title*="대표"]',
  '[data-tooltip*="대표"]',
  '[data-tooltip-content*="대표"]',
  '[data-title*="대표"]',
  '[data-name*="대표"]',
].join(", ");
const representativeInteractiveSelector = [
  "button",
  '[role="button"]',
  "a",
  "label",
  'input[type="checkbox"]',
  '[role="checkbox"]',
  representativeAttributeSelector,
].join(", ");

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

  await page.waitForTimeout(250);
  const located = await findRepresentativeControl(page);
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
      evidence: { selection, trustedClick, context: located.context, before, after: before, action: "already_selected" },
    };
  }

  const clicked = await located.locator.click({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!clicked) {
    return representativeFailure(
      "representative_control_not_clickable",
      "첫 번째 이미지의 대표이미지 설정 control을 클릭하지 못했습니다.",
      { selection, trustedClick, context: located.context, before },
    );
  }

  await page.waitForTimeout(400);
  const afterLocated = await findRepresentativeControl(page);
  const after = afterLocated ? await readRepresentativeControlState(afterLocated.locator) : undefined;
  const feedback = await representativeFeedback(page);
  const verified = representativeControlLooksSelected(after)
    || feedback.some((value) => /대표.*(?:설정|지정|선택|완료)/u.test(value));
  const evidence = {
    selection,
    trustedClick,
    context: afterLocated?.context ?? located.context,
    before,
    after,
    feedback,
    action: verified ? "selected_and_verified" : "control_clicked_unverified",
  };

  if (!verified) {
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
      return { passed: false, code: "representative_editor_unavailable", message: "대표이미지를 설정할 Tistory 편집기를 확인하지 못했습니다." };
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
      return { passed: false, code: "representative_image_not_found", message: "대표이미지 후보인 첫 번째 업로드 이미지를 본문에서 찾지 못했습니다." };
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
  for (let frameIndex = 0; frameIndex < page.frames().length; frameIndex += 1) {
    const frame = page.frames()[frameIndex];
    const images = frame.locator("img");
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
            return left.hostname === right.hostname && decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
          } catch {
            return false;
          }
        };
        const values = [node.currentSrc, node.getAttribute("src"), node.getAttribute("data-url"), node.getAttribute("data-phocus")].filter(Boolean);
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
      const clicked = visible && await image.click({ force: true, timeout: 5000 }).then(() => true).catch(() => false);
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

async function findRepresentativeControl(page) {
  const frames = page.frames();
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const candidates = frame.locator(representativeInteractiveSelector);
    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const locator = candidates.nth(index);
      if (!await locator.isVisible().catch(() => false)) continue;
      const state = await readRepresentativeControlState(locator);
      if (!representativeLabelPattern.test(state.label)) continue;
      const enabled = await locator.isEnabled().catch(() => true);
      const clickable = enabled && await locator.click({ trial: true, timeout: 1000 }).then(() => true).catch(() => false);
      if (!clickable) continue;
      return { locator, context: frame === page.mainFrame() ? "main" : `frame:${frameIndex}` };
    }
  }
  return undefined;
}

async function readRepresentativeControlState(locator) {
  return locator.evaluate((element) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const input = element instanceof HTMLInputElement
      ? element
      : element.querySelector?.('input[type="checkbox"], [role="checkbox"]');
    const associatedLabel = element instanceof HTMLInputElement && element.id
      ? document.querySelector(`label[for=${JSON.stringify(element.id)}]`)
      : undefined;
    const nearby = [element.parentElement, element.previousElementSibling, element.nextElementSibling]
      .map((node) => normalize(node?.textContent))
      .filter((value) => value && value.length <= 160 && /대표/u.test(value));
    const descendantAttributes = [...element.querySelectorAll?.("*") ?? []]
      .flatMap((node) => [
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("data-tooltip"),
        node.getAttribute?.("data-tooltip-content"),
        node.getAttribute?.("data-title"),
        node.getAttribute?.("data-name"),
      ])
      .filter(Boolean);
    const datasetValues = Object.values(element.dataset ?? {});
    const label = [
      element.textContent,
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.getAttribute?.("data-tooltip"),
      element.getAttribute?.("data-tooltip-content"),
      element.getAttribute?.("data-title"),
      element.getAttribute?.("data-name"),
      associatedLabel?.textContent,
      ...descendantAttributes,
      ...datasetValues,
      ...nearby,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return {
      label,
      tagName: element.tagName.toLowerCase(),
      className: String(element.className ?? ""),
      checked: Boolean(input?.checked),
      ariaPressed: element.getAttribute?.("aria-pressed") ?? "",
      ariaChecked: element.getAttribute?.("aria-checked") ?? input?.getAttribute?.("aria-checked") ?? "",
      ariaSelected: element.getAttribute?.("aria-selected") ?? "",
      dataSelected: element.getAttribute?.("data-selected") ?? "",
      dataActive: element.getAttribute?.("data-active") ?? "",
      dataState: element.getAttribute?.("data-state") ?? "",
    };
  }).catch(() => ({
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
  const diagnostics = [];
  for (let frameIndex = 0; frameIndex < page.frames().length; frameIndex += 1) {
    const frame = page.frames()[frameIndex];
    const candidates = frame.locator(representativeInteractiveSelector);
    const count = Math.min(await candidates.count().catch(() => 0), 160);
    for (let index = 0; index < count; index += 1) {
      const locator = candidates.nth(index);
      if (!await locator.isVisible().catch(() => false)) continue;
      const state = await readRepresentativeControlState(locator);
      if (!/대표/u.test(state.label)) continue;
      diagnostics.push({
        context: frame === page.mainFrame() ? "main" : `frame:${frameIndex}`,
        index,
        ...state,
      });
      if (diagnostics.length >= 20) return diagnostics;
    }
  }
  return diagnostics;
}

async function representativeFeedback(page) {
  const values = [];
  for (const frame of page.frames()) {
    const texts = await frame.locator('[role="alert"]:visible, [class*="toast" i]:visible, [class*="snackbar" i]:visible')
      .allTextContents()
      .catch(() => []);
    values.push(...texts);
  }
  return values.map((value) => String(value).replace(/\s+/gu, " ").trim()).filter(Boolean).slice(-8);
}
