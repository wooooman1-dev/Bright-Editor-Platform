import { chromium } from "playwright";

const baseUrl = process.env.BRIGHT_STUDIO_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${baseUrl}/dev/image-workspace`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Image Workspace Verification" }).waitFor();
  await page.getByText("준비됨", { exact: true }).waitFor();

  await expectVisible(page.getByText("이미지 별도 제작용 프롬프트", { exact: true }), "standalone image prompt");
  await expectVisible(page.getByText("이미지 목적", { exact: true }), "image purpose");
  await expectVisible(page.getByText("ALT", { exact: true }), "ALT field");
  await expectVisible(page.getByRole("button", { name: "파일 불러오기" }), "file loading button");
  await expectVisible(page.getByRole("button", { name: "AI 생성하기" }), "AI generation button");
  await expectVisible(page.getByRole("button", { name: "프롬프트 복사" }), "prompt copy button");

  await page.getByText("요소 추가", { exact: true }).click();
  await page.getByRole("button", { name: "이미지 추가" }).click();
  await waitForCount(page.getByText("이미지 전략", { exact: true }), 2, "new image workspace");

  const inputs = page.locator('input[type="file"]');
  const inputCount = await inputs.count();
  assert(inputCount >= 2, `expected at least 2 image inputs, received ${inputCount}`);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  );
  await inputs.nth(inputCount - 1).setInputFiles({ name: "verification.png", mimeType: "image/png", buffer: png });
  await page.getByText("이미지 파일을 불러와 현재 이미지 블록에 연결했습니다.", { exact: true }).waitFor({ timeout: 15_000 });

  const previews = page.locator('img[alt="콘텐츠 이미지 미리보기"], img[alt="건강 정보를 설명하는 예시 이미지"]');
  assert(await previews.count() >= 1, "uploaded image preview was not rendered");
  await expectVisible(page.getByRole("link", { name: "원본 보기" }), "original image link");

  const source = await previews.last().getAttribute("src");
  assert(source?.startsWith("/api/media/"), `unexpected media source: ${source}`);
  const mediaResponse = await page.request.get(`${baseUrl}${source}`);
  assert(mediaResponse.ok(), `media endpoint returned ${mediaResponse.status()}`);
  assert(mediaResponse.headers()["content-type"] === "image/png", `unexpected media content type: ${mediaResponse.headers()["content-type"]}`);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("준비됨", { exact: true }).waitFor();
  const persisted = page.locator(`img[src="${source}"]`);
  await persisted.waitFor({ timeout: 10_000 });

  console.log("Image workspace browser smoke test passed.");
} finally {
  await browser.close();
}

async function expectVisible(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 10_000 });
  assert(await locator.first().isVisible(), `${label} is not visible`);
}

async function waitForCount(locator, expected, label) {
  await locator.first().waitFor({ state: "visible", timeout: 10_000 });
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (await locator.count() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}: expected ${expected}, received ${await locator.count()}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
