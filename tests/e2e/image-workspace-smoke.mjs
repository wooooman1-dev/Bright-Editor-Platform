import { chromium } from "playwright";

const baseUrl = process.env.BRIGHT_STUDIO_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${baseUrl}/dev/image-workspace`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Image Workspace Verification" }).waitFor();
  await page.getByText("준비됨", { exact: true }).waitFor();

  const prompt = page.getByLabel("이미지 별도 제작용 프롬프트");
  await expectVisible(prompt, "standalone image prompt");
  await expectVisible(page.getByLabel("이미지 목적"), "image purpose");
  await expectVisible(page.getByLabel("ALT"), "ALT field");
  await expectVisible(page.getByRole("button", { name: "파일 불러오기" }), "file loading button");
  await expectVisible(page.getByRole("button", { name: "프롬프트 복사" }), "prompt copy button");
  await expectVisible(page.getByText("Project 이미지 재사용", { exact: true }), "Project media reuse control");

  assert((await prompt.inputValue()).trim().length > 0, "standalone image prompt is empty");

  const purpose = page.getByLabel("이미지 목적");
  await purpose.selectOption("hero");
  await expectVisible(page.getByRole("button", { name: "대표이미지 AI 생성" }), "hero AI generation button");
  await purpose.selectOption("inline");
  await expectVisible(
    page.getByText("본문 시각 자료는 표·체크리스트·요약·경고 컴포넌트, Project 이미지 재사용 또는 파일 업로드로 처리하여 AI 이미지 비용을 발생시키지 않습니다.", { exact: true }),
    "inline free-image policy",
  );

  console.log("Image workspace prompt browser smoke test passed.");
} finally {
  await browser.close();
}

async function expectVisible(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 10_000 });
  assert(await locator.first().isVisible(), `${label} is not visible`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
