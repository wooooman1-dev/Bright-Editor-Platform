import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeTistoryTags } from "../../../../apps/tistory/workflows/tistory-tags.mjs";

const workerSource = readFileSync(join(process.cwd(), "apps/tistory/workflows/tistory-draft-worker.mjs"), "utf8");
const serviceSource = readFileSync(join(process.cwd(), "app/application/publishing/TistoryDraftApplicationService.ts"), "utf8");

describe("Tistory tags", () => {
  it("normalizes hash, whitespace, punctuation, duplicates, and maximum count", () => {
    expect(normalizeTistoryTags([
      "#장내 마이크로바이옴",
      "장내마이크로바이옴",
      " 정신 건강 ",
      "프로바이오틱스!",
      "프리바이오틱스",
      "식이섬유",
      "만성 염증",
      "장 건강",
      "추가 태그",
    ])).toEqual([
      "장내마이크로바이옴",
      "정신건강",
      "프로바이오틱스",
      "프리바이오틱스",
      "식이섬유",
      "만성염증",
      "장건강",
      "추가태그",
    ]);
  });

  it("passes derived tags into the worker command", () => {
    expect(serviceSource).toContain("deriveContentTags(input.document, input.primaryKeyword)");
    expect(serviceSource).toContain("title: prepared.payload.title, html: prepared.payload.html, tags,");
  });

  it("fills and re-verifies tags before treating a Tistory Draft as saved", () => {
    expect(workerSource).toContain('import { fillTistoryTags, verifyTistoryTags } from "./tistory-tags.mjs";');
    expect(workerSource).toContain("const tags = await fillTistoryTags(page, command.tags);");
    expect(workerSource).toContain('step("tags_verified"');
    expect(workerSource.match(/const reopenedTags = await verifyTistoryTags\(page, command\.tags\);/gu)).toHaveLength(2);
    expect(workerSource).toContain('step("tags_reverified"');
  });
});
