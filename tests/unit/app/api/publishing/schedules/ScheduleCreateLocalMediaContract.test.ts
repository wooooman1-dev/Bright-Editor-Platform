import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "app/api/publishing/schedules/create/route.ts"),
  "utf8",
);

describe("Tistory schedule local media route contract", () => {
  it("creates a Tistory media plan and passes local files into schedule execution", () => {
    expect(source).toContain("createTistoryMediaUploadPlan(content.document)");
    expect(source).toContain("content: mediaPlan.document");
    expect(source).toContain("localMediaFilePath(item.storageKey)");
    expect(source).toContain("media,");
  });

  it("does not block a readiness-approved local image before the registered media workflow", () => {
    expect(source).not.toContain("로컬 이미지가 포함된 원고의 예약발행은 이미지 업로드 통합 후 사용할 수 있습니다");
    expect(source).not.toMatch(/localImages\.length[\s\S]{0,300}throw new Error/);
  });
});
