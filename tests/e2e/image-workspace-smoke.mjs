import { chromium } from "playwright";

const baseUrl = process.env.BRIGHT_STUDIO_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${baseUrl}/dev/image-workspace`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Image Workspace Verification" }).waitFor();
  await page.getByText("준비됨", { exact: true }).waitFor();

  await expectVisible(page.getByLabel("이미지 별도 제작용 프롬프트"), "standalone image prompt");
  await expectVisible(page.getByLabel("이미지 목적"), "image purpose");
  await expectVisible(page.getByLabel("ALT"), "ALT field");
  await expectVisible(page.getByRole("button", { name: "파일 불러오기" }), "file loading button");
  await expectVisible(page.getByRole("button", { name: "AI 생성하기" }), "AI generation button");
  await expectVisible(page.getByRole("button", { name: "프롬프트 복사" }), "prompt copy button");
  await expectVisible(page.getByText("Project 이미지 재사용", { exact: true }), "Project media reuse control");

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
  await page.getByText("이미지 파일을 불러와 현재 이미지 블록과 Project 이미지에 연결했습니다.", { exact: true }).waitFor({ timeout: 15_000 });

  const previews = page.locator('img[alt="콘텐츠 이미지 미리보기"], img[alt="건강 정보를 설명하는 예시 이미지"]');
  assert(await previews.count() >= 1, "uploaded image preview was not rendered");
  await expectVisible(page.getByRole("link", { name: "원본 보기" }), "original image link");

  const source = await previews.last().getAttribute("src");
  assert(source?.startsWith("/api/media/"), `unexpected media source: ${source}`);
  const mediaResponse = await page.request.get(`${baseUrl}${source}`);
  assert(mediaResponse.ok(), `media endpoint returned ${mediaResponse.status()}`);
  assert(mediaResponse.headers()["content-type"] === "image/png", `unexpected media content type: ${mediaResponse.headers()["content-type"]}`);

  await page.getByText("Project 이미지 재사용", { exact: true }).first().click();
  await page.getByRole("button", { name: "이 이미지 사용" }).first().waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "이 이미지 사용" }).first().click();
  await page.getByText("Project 이미지를 현재 본문 블록에 재사용했습니다. 파일 복사본은 생성하지 않았습니다.", { exact: true }).waitFor({ timeout: 10_000 });

  const studioResponse = await page.request.get(`${baseUrl}/api/studio`);
  assert(studioResponse.ok(), `studio endpoint returned ${studioResponse.status()}`);
  const studio = await studioResponse.json();
  const content = studio.data?.contents?.find((item) => item.id === "ci-image-content");
  const imageBlocks = content?.document?.blocks?.filter((block) => block.type === "image") ?? [];
  assert(imageBlocks.length === 2, `expected 2 canonical image blocks, received ${imageBlocks.length}`);
  assert(imageBlocks.every((block) => block.source === source), "Project media reuse did not preserve the same source");
  assert(imageBlocks[0].assetId && imageBlocks[0].assetId === imageBlocks[1].assetId, "Project media reuse did not preserve the same assetId");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("준비됨", { exact: true }).waitFor();
  await waitForCount(page.locator(`img[src="${source}"]`), 2, "reused image persistence");

  console.log("Image workspace and Project media reuse browser smoke test passed.");
} finally {
  await browser.close();
}

async function expectVisible(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 10_000 });
  assert(await locator.first().isVisible(), `${label} is not visible`);
}

async function waitForCount(locator, expected, label) {
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
