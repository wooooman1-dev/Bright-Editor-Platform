import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(join(process.cwd(), "apps/tistory/workflows/tistory-media-preparation-worker.mjs"), "utf8");
const serviceSource = readFileSync(join(process.cwd(), "app/application/publishing/TistoryDraftApplicationService.ts"), "utf8");

describe("Tistory native media preparation contract", () => {
  it("captures the native Tistory wrapper after each real upload", () => {
    expect(workerSource).toContain("captureNativeTistoryImageFragment");
    expect(workerSource).toContain("nativeHtml: native.html");
    expect(workerSource).toContain("nativeMetadata: native.metadata");
  });

  it("replaces renderer placeholders with native image HTML instead of CDN URLs only", () => {
    expect(workerSource).toContain("replaceTistoryMediaPlaceholders");
    expect(workerSource).not.toContain("html.replaceAll(item.placeholderUrl, item.remoteUrl)");
  });

  it("keeps the first uploaded image as the deterministic representative candidate", () => {
    expect(workerSource).toContain("representativeCandidate: currentIndex === 0");
    expect(workerSource).toContain("representativeMedia: resolved[0]");
  });

  it("still completes media preparation before the registered Draft Worker", () => {
    expect(serviceSource.indexOf("await this.executeMediaWorker(commandPath)")).toBeLessThan(serviceSource.indexOf("await this.executeWorker(commandPath)"));
  });
});
