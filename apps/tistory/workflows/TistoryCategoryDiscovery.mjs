import { tistoryCategoryControlSelector } from "./tistory-category-locators.mjs";

export async function readTistoryCategories(page) {
  const namedCategoryButton = page.getByRole("button", { name: /카테고리|분류/ }).first();
  const categoryControl = await namedCategoryButton.count()
    ? namedCategoryButton
    : page.locator(`${tistoryCategoryControlSelector}, select[name*="category" i], select[id*="category" i]`).first();
  await categoryControl.waitFor({ state: "attached", timeout: 15000 });
  if (await categoryControl.evaluate((element) => element.tagName !== "SELECT") && await categoryControl.isVisible()) await categoryControl.click();
  const categoryRoot = page.getByRole("listbox").first();
  await categoryRoot.waitFor({ state: "attached", timeout: 10000 });
  await categoryRoot.locator("option, [role=option], [data-category-id], [data-id], [data-value], input[value], button, a, li").first().waitFor({ state: "attached", timeout: 10000 });
  return categoryRoot.evaluate((root) => {
    const nodes = root.matches("select") ? [...root.querySelectorAll("option")] : [...root.querySelectorAll("[data-category-id], [data-id], [data-value], [role=option], input[value], button, a, li")];
    const seen = new Set();
    return nodes.flatMap((node) => {
      const element = /** @type {HTMLElement} */ (node);
      const carrier = element.closest("[data-category-id], [data-id], [data-value], [value]") ?? element.querySelector("[data-category-id], [data-id], [data-value], [value]") ?? element;
      const href = element.closest("a")?.getAttribute("href") ?? element.querySelector("a")?.getAttribute("href") ?? "";
      const id = carrier.getAttribute("data-category-id") ?? carrier.getAttribute("data-id") ?? carrier.getAttribute("data-value") ?? carrier.getAttribute("value") ?? element.id.match(/^category-item-(\d+)$/)?.[1] ?? href.match(/category(?:Id)?[=/](\d+)/i)?.[1] ?? "";
      const name = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!/^\d+$/.test(id) || !name || id === "0" || seen.has(id) || /카테고리\s*없음|선택\s*안함|분류\s*없음/.test(name)) return [];
      seen.add(id);
      const listItem = element.closest("li");
      const nestedDepth = listItem ? Math.max(0, [...root.querySelectorAll("li")].filter((candidate) => candidate !== listItem && candidate.contains(listItem)).length) : 0;
      const depth = Number(element.getAttribute("data-depth") ?? element.getAttribute("aria-level") ?? nestedDepth);
      const parentId = element.getAttribute("data-parent-id") ?? listItem?.parentElement?.closest("li")?.querySelector("[data-category-id], [data-id], [data-value], [value]")?.getAttribute("data-category-id") ?? undefined;
      return [{ id, name, depth: Number.isFinite(depth) ? Math.max(0, depth) : 0, ...(parentId && /^\d+$/.test(parentId) ? { parentId } : {}) }];
    });
  });
}

export function resolveCategoryIdByName(categoryName, categories) {
  const expected = normalizeCategoryName(categoryName);
  if (!expected) return undefined;
  const matches = categories.filter((category) => normalizeCategoryName(category.name) === expected);
  return matches.length === 1 && /^\d+$/.test(String(matches[0].id)) ? String(matches[0].id) : undefined;
}

function normalizeCategoryName(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s·._-]+/gu, "").trim();
}
