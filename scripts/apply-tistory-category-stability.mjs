import { readFile, writeFile } from "node:fs/promises";

const path = "apps/tistory/workflows/tistory-draft-worker.mjs";
let source = await readFile(path, "utf8");

if (source.includes("category_control_not_clickable")) process.exit(0);

function replaceExact(before, after) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) throw new Error(`Expected one patch target, found ${matches}.`);
  source = source.replace(before, after);
}

replaceExact(
  '  const descriptor = await describeCategoryControl(control);\n  await control.click();\n  const root = targetPage.getByRole("listbox").first();',
  '  const descriptor = await describeCategoryControl(control);\n  const categoryClicked = await control.click({ timeout: 5000 }).then(() => true).catch(() => false);\n  if (!categoryClicked) return { passed: false, code: "category_control_not_clickable", message: "보이는 Tistory 카테고리 버튼을 클릭하지 못했습니다." };\n  const root = targetPage.getByRole("listbox").first();',
);

replaceExact(
  '      const control = candidate.nth(index);\n      if (await control.isVisible().catch(() => false)) return control;',
  '      const control = candidate.nth(index);\n      const visible = await control.isVisible().catch(() => false);\n      const enabled = await control.isEnabled().catch(() => false);\n      const clickable = visible && enabled && await control.click({ trial: true, timeout: 1000 }).then(() => true).catch(() => false);\n      if (clickable) return control;',
);

await writeFile(path, source, "utf8");
