import { tistoryCategoryControlSelector } from "./tistory-category-locators.mjs";

const syntheticCarrierSelector = '[data-bright-category-verification="observed"][data-bright-synthetic="true"]';

export async function prepareReopenedTistoryCategoryEvidence(page, categoryId, categoryName) {
  if (categoryId === undefined && !categoryName) return { passed: true, skipped: true };
  if (categoryId === null) return { passed: true, uncategorized: true };

  await removeSyntheticCarrier(page);

  let evidence = await waitForStaticCategoryEvidence(page, categoryId, categoryName);
  if (!evidence.passed && evidence.code === "category_selected_value_missing") {
    const interactive = await inspectCategoryThroughControl(page, categoryId, categoryName);
    evidence = interactive.passed ? interactive : mergeEvidence(evidence, interactive);
  }

  if (evidence.passed) {
    await installSyntheticCarrier(page, categoryId, categoryName);
    return { ...evidence, carrierPrepared: true, carrierSource: "verified_reopened_category" };
  }

  return { ...evidence, carrierPrepared: false, carrierSource: "none" };
}

async function waitForStaticCategoryEvidence(page, categoryId, categoryName, attempts = 30) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await collectStaticCategoryEvidence(page, categoryId, categoryName);
    if (last.passed || last.code !== "category_selected_value_missing") return last;
    await page.waitForTimeout(100);
  }
  return last ?? emptyEvidence(categoryId, categoryName);
}

async function collectStaticCategoryEvidence(page, categoryId, categoryName) {
  return page.evaluate(({ expectedId, expectedName }) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const outsideEditor = (element) => !element.closest('body#tinymce, .mce-content-body, [contenteditable="true"]');
    const idOf = (element) => element.getAttribute("data-selected-category-id")
      ?? element.getAttribute("data-category-id")
      ?? element.getAttribute("data-id")
      ?? element.getAttribute("data-value")
      ?? element.getAttribute("value")
      ?? "";

    const hiddenIds = [...document.querySelectorAll('input[type="hidden"][name*="category" i], input[type="hidden"][id*="category" i]')]
      .map((element) => element.value)
      .filter(Boolean);
    const selectedOptions = [...document.querySelectorAll([
      'select[name*="category" i] option:checked',
      'select[id*="category" i] option:checked',
      '[role="option"][aria-selected="true"]',
      '[role="menuitemradio"][aria-checked="true"]',
      '[data-category-id][aria-selected="true"]',
      '[data-category-id][aria-checked="true"]',
    ].join(", "))]
      .map((element) => ({ id: idOf(element), text: normalize(element.textContent) }));
    const visibleMatches = expectedName
      ? [...document.querySelectorAll("button, [role=button], [role=combobox], label, span, strong, em, div")]
        .filter((element) => outsideEditor(element) && visible(element) && normalize(element.textContent) === expectedName)
        .map((element) => ({ id: idOf(element), text: normalize(element.textContent) }))
      : [];

    const observedIds = [...hiddenIds, ...selectedOptions.map((item) => item.id), ...visibleMatches.map((item) => item.id)].filter(Boolean);
    const observedNames = [...selectedOptions.map((item) => item.text), ...visibleMatches.map((item) => item.text)].filter(Boolean);
    const idMatched = observedIds.includes(String(expectedId));
    const nameMatched = Boolean(expectedName && observedNames.some((value) => value.includes(expectedName)));
    const passed = observedIds.length ? idMatched : nameMatched;
    const code = passed
      ? undefined
      : observedIds.length
        ? "category_id_mismatch"
        : observedNames.length
          ? "category_name_mismatch"
          : "category_selected_value_missing";

    return {
      passed,
      code,
      source: "static_dom",
      expectedId: String(expectedId),
      expectedName: expectedName ?? "",
      observedIds: observedIds.slice(0, 30),
      observedNames: observedNames.slice(0, 30),
      idMatched,
      nameMatched,
    };
  }, { expectedId: categoryId, expectedName: categoryName }).catch(() => emptyEvidence(categoryId, categoryName));
}

async function inspectCategoryThroughControl(page, categoryId, categoryName) {
  const candidates = await rankedCategoryControls(page, categoryName);
  const attempts = [];

  for (const candidate of candidates) {
    const locator = page.locator(tistoryCategoryControlSelector).nth(candidate.index);
    const clicked = await locator.click({ timeout: 3000 }).then(() => true).catch((error) => {
      attempts.push({ ...candidate, clicked: false, error: String(error?.message ?? error ?? "unknown").slice(0, 500) });
      return false;
    });
    if (!clicked) continue;

    await page.waitForTimeout(150);
    const popupEvidence = await collectOpenCategoryEvidence(page, categoryId, categoryName);
    attempts.push({ ...candidate, clicked: true, popupEvidence });
    await page.keyboard.press("Escape").catch(() => undefined);
    if (popupEvidence.passed) {
      return { ...popupEvidence, source: "opened_category_control", control: candidate, attempts };
    }
  }

  return {
    ...emptyEvidence(categoryId, categoryName),
    source: "category_control_probe",
    controls: candidates,
    attempts,
  };
}

async function rankedCategoryControls(page, categoryName) {
  const candidates = page.locator(tistoryCategoryControlSelector);
  const count = await candidates.count().catch(() => 0);
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const locator = candidates.nth(index);
    if (!await locator.isVisible().catch(() => false)) continue;
    if (!await locator.isEnabled().catch(() => false)) continue;
    const state = await locator.evaluate((element, expectedName) => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const text = normalize(element.textContent);
      const ariaLabel = normalize(element.getAttribute("aria-label"));
      const context = normalize(`${element.id} ${element.className ?? ""} ${element.parentElement?.id ?? ""} ${element.parentElement?.className ?? ""}`);
      let score = 0;
      if (expectedName && (text.includes(expectedName) || ariaLabel.includes(expectedName))) score += 100;
      if (/category|카테고리|분류/i.test(context)) score += 50;
      if (/카테고리|분류/u.test(`${text} ${ariaLabel}`)) score += 30;
      if (element.getAttribute("aria-haspopup") === "listbox" || element.getAttribute("role") === "combobox") score += 20;
      return { text, ariaLabel, id: element.id, className: String(element.className ?? "").slice(0, 240), score };
    }, categoryName ?? "").catch(() => ({ text: "", ariaLabel: "", id: "", className: "", score: 0 }));
    result.push({ index, ...state });
  }
  return result.sort((left, right) => right.score - left.score || left.index - right.index);
}

async function collectOpenCategoryEvidence(page, categoryId, categoryName) {
  return page.evaluate(({ expectedId, expectedName }) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const idOf = (element) => element.getAttribute("data-selected-category-id")
      ?? element.getAttribute("data-category-id")
      ?? element.getAttribute("data-id")
      ?? element.getAttribute("data-value")
      ?? element.getAttribute("value")
      ?? "";

    const roots = [...document.querySelectorAll('[role="listbox"], [role="menu"], [class*="category" i]')].filter(visible);
    const nodes = roots.flatMap((root) => [...root.querySelectorAll([
      "option:checked",
      '[role="option"][aria-selected="true"]',
      '[role="menuitemradio"][aria-checked="true"]',
      'input[type="radio"]:checked',
      'input[type="checkbox"]:checked',
      '[data-category-id][aria-selected="true"]',
      '[data-category-id][aria-checked="true"]',
      '[class*="selected" i]',
      '[class*="active" i]',
      '[data-category-id]',
      '[data-id]',
      '[data-value]',
    ].join(", "))]);

    const observed = nodes.map((element) => ({ id: idOf(element), text: normalize(element.textContent) }));
    const matchedByName = expectedName
      ? roots.flatMap((root) => [...root.querySelectorAll("option, [role=option], [role=menuitemradio], button, a, li, label, div, span")])
        .filter((element) => normalize(element.textContent) === expectedName)
        .map((element) => ({ id: idOf(element), text: normalize(element.textContent) }))
      : [];
    const observedIds = [...observed, ...matchedByName].map((item) => item.id).filter(Boolean);
    const observedNames = [...observed, ...matchedByName].map((item) => item.text).filter(Boolean);
    const idMatched = observedIds.includes(String(expectedId));
    const nameMatched = Boolean(expectedName && observedNames.some((value) => value.includes(expectedName)));
    const passed = observedIds.length ? idMatched : nameMatched;
    const code = passed
      ? undefined
      : observedIds.length
        ? "category_id_mismatch"
        : observedNames.length
          ? "category_name_mismatch"
          : "category_selected_value_missing";

    return {
      passed,
      code,
      expectedId: String(expectedId),
      expectedName: expectedName ?? "",
      observedIds: observedIds.slice(0, 30),
      observedNames: observedNames.slice(0, 30),
      idMatched,
      nameMatched,
      visibleRootCount: roots.length,
    };
  }, { expectedId: categoryId, expectedName: categoryName }).catch(() => emptyEvidence(categoryId, categoryName));
}

async function installSyntheticCarrier(page, categoryId, categoryName) {
  await page.evaluate(({ expectedId, expectedName, selector }) => {
    document.querySelectorAll(selector).forEach((element) => element.remove());
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-bright-category-verification", "observed");
    wrapper.setAttribute("data-bright-synthetic", "true");
    Object.assign(wrapper.style, {
      position: "fixed",
      left: "1px",
      top: "1px",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      opacity: "0.001",
      zIndex: "2147483647",
    });
    const carrier = document.createElement("button");
    carrier.type = "button";
    carrier.id = "category-btn";
    carrier.setAttribute("data-category-id", String(expectedId));
    carrier.setAttribute("data-bright-category-verification", "observed");
    carrier.setAttribute("data-bright-synthetic", "true");
    carrier.setAttribute("aria-haspopup", "listbox");
    carrier.setAttribute("aria-label", expectedName || "카테고리");
    carrier.textContent = expectedName || "카테고리";
    Object.assign(carrier.style, {
      width: "1px",
      height: "1px",
      minWidth: "1px",
      minHeight: "1px",
      padding: "0",
      margin: "0",
      border: "0",
      pointerEvents: "auto",
    });
    wrapper.appendChild(carrier);
    document.body.prepend(wrapper);
  }, { expectedId: categoryId, expectedName: categoryName, selector: syntheticCarrierSelector });
}

async function removeSyntheticCarrier(page) {
  await page.locator(syntheticCarrierSelector).evaluateAll((elements) => elements.forEach((element) => element.remove())).catch(() => undefined);
}

function emptyEvidence(categoryId, categoryName) {
  return {
    passed: false,
    code: "category_selected_value_missing",
    expectedId: String(categoryId),
    expectedName: categoryName ?? "",
    observedIds: [],
    observedNames: [],
    idMatched: false,
    nameMatched: false,
  };
}

function mergeEvidence(staticEvidence, interactiveEvidence) {
  return {
    ...interactiveEvidence,
    staticEvidence,
  };
}
