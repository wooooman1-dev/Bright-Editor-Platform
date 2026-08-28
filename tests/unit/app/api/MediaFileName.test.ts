import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/api/media/route.ts"), "utf8");
const adapter = readFileSync(join(process.cwd(), "apps/wordpress/WordPressMediaAdapter.ts"), "utf8");

/**
 * ai-1787843165123.png 은 워드프레스에 그대로 URL 로 남아 AI 로 만들었다는
 * 표시가 되고 파일명이 설명하는 바도 없다. 한글 파일명은 쓸 수 없다 -
 * 업로드 어댑터가 Content-Disposition 을 위해 ASCII 밖 문자를 전부 - 로 바꾼다.
 */
describe("generated image file name", () => {
  it("names the file by role and date instead of an ai- timestamp", () => {
    expect(source).toContain("function generatedImageFileName(");
    expect(source).toContain("fileName: generatedImageFileName(owner.block.purpose, contentId, generated.fileExtension)");
    expect(source).not.toContain("fileName: `ai-${Date.now()}");
  });

  it("stays inside ASCII because the upload adapter strips everything else", () => {
    expect(adapter).toContain("replace(/[^\\x20-\\x7e]|[\\r\\n\"\\\\/]/g, \"-\")");
    const helper = source.slice(source.indexOf("function generatedImageFileName("));
    expect(helper).toContain('replace(/[^a-z0-9]+/gi, "")');
  });
});
