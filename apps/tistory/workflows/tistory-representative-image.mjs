const nativeWrapperSelector = 'figure.imageblock, figure[data-ke-type="image"], figure[data-origin-width], [data-ke-type="image"]';
const representativeLabelPattern = /대표\s*이미지|대표이미지|^대표$/u;

export function representativeControlLooksSelected(state) {
  if (!state || typeof state !== "object") return false;
  const label = String(state.label ?? "").replace(/\s+/gu, " ").trim();
  const className = String(state.className ?? "");
  return state.checked === true
    || state.ariaPressed === "true"
    || state.ariaChecked === "true"
    || state.dataSelected === "true"
    || state.dataActive === "true"
    || /해제|선택됨|설정됨/u.test(label)
    || /(?:^|\s)(?:active|selected|checked|on)(?:\s|$)/iu.test(className);
}

export async function ensureFirstTistoryImageRepresentative(page, remoteUrl) {
  const selection = await selectRepresentativeCandidate(page, remoteUrl);
  if (!selection.passed) return selection;

  await page.waitForTimeout(150);
  const located = await findRepresentativeControl(page);
  if (!located) {
    return {
      passed: false,
      code: "representative_control_not_found",
      message: "첫 번째 이미지의 대표이미지 설정 control을 찾지 못했습니다.",
      evidence: { selection, labels: await representativeControlLabels(page) },
    };
  }

  const before = await readRepresentativeControlState(located.locator);
  if (representativeControlLooksSelected(before)) {
    return {
      passed: true,
      verified: true,
      evidence: { selection, context: located.context, before, after: before, action: "already_selected" },
    };
  }

  const clicked = await located.locator.click({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!clicked) {
    return {
      passed: false,
      code: "representative_control_not_clickable",
      message: "첫 번째 이미지의 대표이미지 설정 control을 클릭하지 못했습니다.",
      evidence: { selection, context: located.context, before },
    };
  }

  await page.waitForTimeout(300);
  const afterLocated = await findRepresentativeControl(page);
  const after = afterLocated ? await readRepresentativeControlState(afterLocated.locator) : undefined;
  const feedback = await representativeFeedback(page);
  const verified = representativeControlLooksSelected(after)
    || feedback.some((value) => /대표.*(?:설정|지정|선택|완료)/u.test(value));

  return {
    passed: true,
    verified,
    evidence: {
      selection,
      context: afterLocated?.context ?? located.context,
      before,
      after,
      feedback,
      action: verified ? "selected_and_verified" : "control_clicked",
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
    for (const type of ["mousedown", "mouseup", "click"]) {
      image.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
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

async function findRepresentativeControl(page) {
  const frames = page.frames();
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const candidates = frame.locator('button, [role="button"], a, label, input[type="checkbox"]');
    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const locator = candidates.nth(index);
      if (!await locator.isVisible().catch(() => false)) continue;
      const state = await readRepresentativeControlState(locator);
      if (!representativeLabelPattern.test(state.label)) continue;
      const enabled = await locator.isEnabled().catch(() => true);
      if (!enabled) continue;
      return { locator, context: frame === page.mainFrame() ? "main" : `frame:${frameIndex}` };
    }
  }
  return undefined;
}

async function readRepresentativeControlState(locator) {
  return locator.evaluate((element) => {
    const input = element instanceof HTMLInputElement ? element : element.querySelector?.('input[type="checkbox"]');
    const label = [
      element.textContent,
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.getAttribute?.("data-tooltip"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return {
      label,
      className: String(element.className ?? ""),
      checked: Boolean(input?.checked),
      ariaPressed: element.getAttribute?.("aria-pressed") ?? "",
      ariaChecked: element.getAttribute?.("aria-checked") ?? "",
      dataSelected: element.getAttribute?.("data-selected") ?? "",
      dataActive: element.getAttribute?.("data-active") ?? "",
    };
  }).catch(() => ({ label: "", className: "", checked: false, ariaPressed: "", ariaChecked: "", dataSelected: "", dataActive: "" }));
}

async function representativeControlLabels(page) {
  const labels = [];
  for (const frame of page.frames()) {
    const values = await frame.locator('button:visible, [role="button"]:visible, label:visible').evaluateAll((elements) => elements.map((element) => [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean).slice(-20)).catch(() => []);
    labels.push(...values);
  }
  return [...new Set(labels)].slice(-30);
}

async function representativeFeedback(page) {
  const values = await page.locator('[role="alert"]:visible, [class*="toast" i]:visible, [class*="snackbar" i]:visible').allTextContents().catch(() => []);
  return values.map((value) => String(value).replace(/\s+/gu, " ").trim()).filter(Boolean).slice(-8);
}
