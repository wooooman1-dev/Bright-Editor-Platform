import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_BRIGHT_STUDIO_UI === "1";

describe.skipIf(!enabled)("Bright Studio real UI flow", () => {
  it("persists Workspace, optional Brand reuse, draft, quality, and gate state", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.goto(process.env.BRIGHT_STUDIO_URL ?? "http://localhost:3000", { waitUntil: "networkidle" });
      await expectVisible(page.locator("#workspace-name"));
      await page.locator("#workspace-name").fill("Verification Workspace");
      await page.locator("#workspace-name").locator("xpath=ancestor::form").locator('button[type="submit"]').click();
      await page.reload({ waitUntil: "networkidle" });
      await expectVisible(page.getByText("Verification Workspace", { exact: true }).first());

      await createProject(page, "Project Without Brand", "");
      await openProjectForm(page);
      await createProject(page, "Project With Brand", "Verification Brand");
      await openProjectForm(page);
      await createProject(page, "Project Reusing Brand", "Verification Brand");

      const stateResponse = await page.request.get("http://localhost:3000/api/studio");
      const state = await stateResponse.json() as { data: { brands: unknown[]; projects: Array<{ brandId?: string }> } };
      expect(state.data.brands).toHaveLength(1);
      expect(state.data.projects).toHaveLength(3);
      expect(state.data.projects.filter((project) => project.brandId)).toHaveLength(2);

      const projectCard = page.locator("article").filter({ hasText: "Project With Brand" });
      await projectCard.locator("button").click();
      const contentForm = page.locator('form').first();
      await contentForm.locator('input').fill("Verification Content");
      await contentForm.locator('button[type="submit"]').click();
      await page.getByRole("button", { name: /Verification Content/ }).click();

      await page.getByLabel("Keywords").fill("verification keyword");
      await page.getByRole("button", { name: "Generate content" }).click();
      await expectVisible(page.getByText(/OPENAI_API_KEY is required/));
      expect(await page.locator('textarea').inputValue()).toBe("");

      await page.locator('form input').first().fill("Verification Draft Title");
      await page.locator('form textarea').fill("A short autosaved verification draft.");
      await page.waitForTimeout(1_200);
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("article").filter({ hasText: "Project With Brand" }).locator("button").click();
      await page.getByRole("button", { name: /Verification Draft Title/ }).click();
      expect(await page.locator('form input').first().inputValue()).toBe("Verification Draft Title");
      expect(await page.locator('form textarea').inputValue()).toBe("A short autosaved verification draft.");

      await page.getByRole("button", { name: "Review quality" }).click();
      await expectVisible(page.getByText(/Quality score:/));
      await expectVisible(page.getByText(/Publishing preparation blocked/));
      await page.getByRole("button", { name: "Prepare Tistory draft" }).click();
      await expectVisible(page.getByText(/Publishing blocked: quality score/));
      expect(await page.getByRole("button", { name: /publish/i }).count()).toBe(0);
    } finally {
      await browser.close();
    }
  }, 60_000);
});

async function createProject(page: import("playwright").Page, name: string, brand: string) {
  const form = page.locator("form").first();
  await form.locator("input").nth(0).fill(name);
  await form.locator("input").nth(1).fill(brand);
  await form.locator('button[type="submit"]').click();
  await expectVisible(page.getByText(name, { exact: true }));
}

async function openProjectForm(page: import("playwright").Page) {
  await page.locator("header button").click();
  await expectVisible(page.locator("form").first());
}

async function expectVisible(locator: import("playwright").Locator) {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
}
