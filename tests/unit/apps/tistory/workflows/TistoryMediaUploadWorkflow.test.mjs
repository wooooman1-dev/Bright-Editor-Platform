import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

import {
  assertReadableMediaAsset,
  collectEditorMediaSnapshot,
  setTistoryImageFile,
  uploadTistoryMediaSequentially,
  waitForNewTrustedEditorImage,
} from "../../../../../apps/tistory/workflows/tistory-media-upload.mjs";

let browser;
let directory;
let imagePath;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  directory = await mkdtemp(path.join(tmpdir(), "bright-tistory-media-"));
  imagePath = path.join(directory, "image.png");
  await writeFile(imagePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

afterAll(async () => {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
});

describe("Tistory media upload workflow", () => {
  it("uses an existing image file input even when it is hidden", async () => {
    const page = await browser.newPage();
    await page.setContent('<input hidden id="openFile" type="file" accept="image/png" multiple>');
    const result = await setTistoryImageFile(page, imagePath);
    expect(result.method).toBe("existing_input");
    expect(await page.locator("#openFile").evaluate((input) => input.files?.length)).toBe(1);
    await page.close();
  });

  it("opens the current two-step attach menu and handles its filechooser", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <button aria-label="첨부" onclick="document.querySelector('#attach-image').hidden=false">첨부</button>
      <div hidden id="attach-image" role="menuitem" onclick="const input=document.createElement('input'); input.hidden=true; input.id='openFile'; input.type='file'; input.accept='image/png'; input.multiple=true; document.body.append(input); input.click()">사진</div>
    `);
    const result = await setTistoryImageFile(page, imagePath);
    expect(result.method).toBe("filechooser");
    expect(await page.locator("#openFile").evaluate((input) => input.files?.length)).toBe(1);
    await page.close();
  });

  it("waits for a trusted uploaded image to be inserted into the editor body", async () => {
    const page = await browser.newPage();
    await page.setContent("<main id=editor></main>");
    await page.evaluate(() => {
      window.tinymce = { activeEditor: { getBody: () => document.querySelector("#editor") } };
      setTimeout(() => {
        const image = document.createElement("img");
        image.src = "https://blog.kakaocdn.net/dn/example/upload.png";
        document.querySelector("#editor").append(image);
      }, 20);
    });
    await expect(waitForNewTrustedEditorImage(page, new Set(), 2000)).resolves.toContain("blog.kakaocdn.net");
    await page.close();
  });


  it("accepts a Tistory image wrapper whose trusted URL is stored in data-url", async () => {
    const page = await browser.newPage();
    await page.setContent("<main id=editor></main>");
    await page.evaluate(() => {
      window.tinymce = { activeEditor: { getBody: () => document.querySelector("#editor") } };
    });
    const before = await collectEditorMediaSnapshot(page);
    await page.evaluate(() => {
      setTimeout(() => {
        const figure = document.createElement("figure");
        figure.className = "imageblock alignCenter";
        const carrier = document.createElement("span");
        carrier.dataset.url = "//blog.kakaocdn.net/dn/example/wrapper.png";
        const image = document.createElement("img");
        image.src = "blob:https://example.test/temporary";
        carrier.append(image);
        figure.append(carrier);
        document.querySelector("#editor").append(figure);
      }, 20);
    });
    await expect(waitForNewTrustedEditorImage(page, before, 2000)).resolves.toContain("blog.kakaocdn.net");
    await page.close();
  });

  it("accepts data-mce-src when the visible src is still temporary", async () => {
    const page = await browser.newPage();
    await page.setContent("<main id=editor></main>");
    await page.evaluate(() => {
      window.tinymce = { activeEditor: { getBody: () => document.querySelector("#editor") } };
    });
    const before = await collectEditorMediaSnapshot(page);
    await page.evaluate(() => {
      setTimeout(() => {
        const image = document.createElement("img");
        image.src = "data:image/png;base64,AA==";
        image.setAttribute("data-mce-src", "https://blog.kakaocdn.net/dn/example/mce.png");
        document.querySelector("#editor").append(image);
      }, 20);
    });
    await expect(waitForNewTrustedEditorImage(page, before, 2000)).resolves.toContain("mce.png");
    await page.close();
  });

  it("waits for a newly inserted wrapper to receive its final CDN URL", async () => {
    const page = await browser.newPage();
    await page.setContent("<main id=editor></main>");
    const baseline = await page.evaluate(() => {
      window.tinymce = { activeEditor: { getBody: () => document.querySelector("#editor") } };
      return true;
    });
    expect(baseline).toBe(true);
    const before = await collectEditorMediaSnapshot(page);
    await page.evaluate(() => {
      const figure = document.createElement("figure");
      figure.className = "imageblock";
      const image = document.createElement("img");
      image.src = "blob:https://example.test/pending";
      figure.append(image);
      document.querySelector("#editor").append(figure);
      setTimeout(() => figure.setAttribute("data-phocus", "https://blog.kakaocdn.net/dn/example/final.png"), 30);
    });
    await expect(waitForNewTrustedEditorImage(page, before, 2000)).resolves.toContain("final.png");
    await page.close();
  });

  it("uses an independent baseline for each sequential image", async () => {
    const page = await browser.newPage();
    await page.setContent("<main id=editor></main>");
    await page.evaluate(() => {
      window.tinymce = { activeEditor: { getBody: () => document.querySelector("#editor") } };
    });
    const uploadOne = async (targetPage, item) => {
      const before = await collectEditorMediaSnapshot(targetPage);
      await targetPage.evaluate(({ id, url }) => {
        const figure = document.createElement("figure");
        figure.className = "imageblock";
        figure.dataset.url = url;
        figure.dataset.testId = id;
        figure.append(document.createElement("img"));
        document.querySelector("#editor").append(figure);
      }, { id: item.blockId, url: `https://blog.kakaocdn.net/dn/example/${item.blockId}.png` });
      const remoteUrl = await waitForNewTrustedEditorImage(targetPage, before, 1000);
      return { blockId: item.blockId, remoteUrl };
    };
    const resolved = await uploadTistoryMediaSequentially(page, [{ blockId: "first" }, { blockId: "second" }], uploadOne);
    expect(resolved.map((item) => item.remoteUrl)).toEqual([
      "https://blog.kakaocdn.net/dn/example/first.png",
      "https://blog.kakaocdn.net/dn/example/second.png",
    ]);
    await page.close();
  });

  it("reports media_insert_failed when a new editor image has no trusted remote URL", async () => {
    const page = await browser.newPage();
    await page.setContent("<main id=editor></main>");
    await page.evaluate(() => {
      window.tinymce = { activeEditor: { getBody: () => document.querySelector("#editor") } };
    });
    const before = await collectEditorMediaSnapshot(page);
    await page.evaluate(() => {
      const image = document.createElement("img");
      image.src = "blob:https://example.test/pending";
      document.querySelector("#editor").append(image);
    });
    await expect(waitForNewTrustedEditorImage(page, before, 100)).rejects.toMatchObject({
      diagnosticCode: "media_insert_failed",
      mediaEvidence: expect.objectContaining({ baselineMediaCount: 0, lastMediaCount: 1 }),
    });
    await page.close();
  });

  it("reports media_upload_timeout when no editor image structure is created", async () => {
    const page = await browser.newPage();
    await page.setContent("<main id=editor></main>");
    await page.evaluate(() => {
      window.tinymce = { activeEditor: { getBody: () => document.querySelector("#editor") } };
    });
    const before = await collectEditorMediaSnapshot(page);
    await expect(waitForNewTrustedEditorImage(page, before, 100)).rejects.toMatchObject({
      diagnosticCode: "media_upload_timeout",
      mediaEvidence: expect.objectContaining({ baselineMediaCount: 0, lastMediaCount: 0 }),
    });
    await page.close();
  });

  it("does not continue when no upload control or input exists", async () => {
    const page = await browser.newPage();
    await page.setContent("<main>editor</main>");
    await expect(setTistoryImageFile(page, imagePath)).rejects.toMatchObject({ diagnosticCode: "media_upload_control_missing" });
    await page.close();
  });

  it("classifies missing and unreadable local assets before browser interaction", async () => {
    await expect(assertReadableMediaAsset(path.join(directory, "missing.png"))).rejects.toMatchObject({ diagnosticCode: "media_asset_missing" });
    await expect(assertReadableMediaAsset(directory)).rejects.toMatchObject({ diagnosticCode: "media_asset_unreadable" });
  });

  it("distinguishes a non-image file input from a missing filechooser", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <button aria-label="첨부" onclick="document.querySelector('#attach-image').hidden=false">첨부</button>
      <div hidden id="attach-image" role="menuitem">사진</div>
      <input hidden type="file" accept="text/plain">
    `);
    await expect(setTistoryImageFile(page, imagePath, 500)).rejects.toMatchObject({ diagnosticCode: "media_file_input_missing" });
    await page.close();
  });

  it("uploads multiple images sequentially in source order", async () => {
    const order = [];
    const media = [{ blockId: "first" }, { blockId: "second" }];
    const resolved = await uploadTistoryMediaSequentially({}, media, async (_page, item) => {
      order.push(item.blockId);
      return { blockId: item.blockId, remoteUrl: `https://blog.kakaocdn.net/${item.blockId}.png` };
    });
    expect(order).toEqual(["first", "second"]);
    expect(resolved.map((item) => item.blockId)).toEqual(order);
  });
});