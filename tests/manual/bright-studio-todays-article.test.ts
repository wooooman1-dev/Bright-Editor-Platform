import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

import {
  runOperationWithTerminalCleanup,
  waitForOperationTerminalState,
  type OperationTerminalState,
} from "../e2e/bright-studio-operation-lifecycle";

const enabled = process.env.RUN_BRIGHT_STUDIO_TODAYS_ARTICLE_E2E === "1";
const baseUrl = process.env.BRIGHT_STUDIO_URL ?? "http://localhost:3000";
const operationTimeoutMs = 10 * 60_000;

describe.skipIf(!enabled)("Bright Studio Today’s Article production UI E2E", () => {
  it("keeps the browser alive through terminal Planning and the first downstream terminal state", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const studioResponses: Array<Readonly<{ action: string; status: number; body: unknown }>> = [];
    page.on("response", (response) => {
      if (!response.url().endsWith("/api/studio") || response.request().method() !== "POST") return;
      const postData = response.request().postData() ?? "";
      const action = postData.match(/"action"\s*:\s*"([^"]+)"/)?.[1];
      if (!action) return;
      void response.json()
        .catch(() => undefined)
        .then((body) => { studioResponses.push({ action, status: response.status(), body }); });
    });

    await runOperationWithTerminalCleanup({
      operation: "Today’s Article production UI E2E",
      run: async () => {
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        const project = page.locator("article").filter({ hasText: "밝은재테크" }).last();
        await project.getByRole("button", { name: "프로젝트 열기" }).click();
        await page.getByRole("button", { name: "오늘 글 작성", exact: true }).click();
        await page.waitForURL(/contentId=/, { timeout: 20_000 });
        const contentId = new URL(page.url()).searchParams.get("contentId");
        expect(contentId).toMatch(/^content-/);
        console.log(JSON.stringify({ CONTENT_ID: contentId, E2E_BOUNDARY: "new-content" }));

        const planning = await waitForOperationTerminalState({
          operation: "Planning",
          timeoutMs: operationTimeoutMs,
          readState: async (): Promise<OperationTerminalState<unknown> | undefined> => {
            const failed = studioResponses.find((item) =>
              (item.action === "plan" || item.action === "manual-plan") && item.status >= 400);
            if (failed) return { status: "failure", value: { boundary: "Planning", response: failed } };
            const generate = page.getByRole("button", { name: /원고 만들기/ }).last();
            if (await generate.count() && await generate.isEnabled()) {
              return { status: "success", value: { boundary: "Planning", contentId } };
            }
            return undefined;
          },
        });
        console.log(JSON.stringify({ PLANNING: planning }));
        if (planning.status === "failure") throw new Error(`FIRST_FAILURE_BOUNDARY=Planning ${JSON.stringify(planning.value)}`);

        await page.getByRole("button", { name: /원고 만들기/ }).last().click();
        const downstream = await waitForOperationTerminalState({
          operation: "Source Preflight / Generation",
          timeoutMs: operationTimeoutMs,
          readState: async (): Promise<OperationTerminalState<unknown> | undefined> => {
            const response = studioResponses.find((item) => item.action === "generate");
            if (!response) return undefined;
            return response.status >= 400
              ? { status: "failure", value: { boundary: "Source Preflight or Generation", response } }
              : { status: "success", value: { boundary: "Generation", response } };
          },
        });
        console.log(JSON.stringify({ DOWNSTREAM: downstream }));
        if (downstream.status === "failure") throw new Error(`FIRST_FAILURE_BOUNDARY=Source Preflight or Generation ${JSON.stringify(downstream.value)}`);
      },
      cleanup: async () => {
        await page.close();
        await browser.close();
      },
    });
  }, operationTimeoutMs + 30_000);
});
