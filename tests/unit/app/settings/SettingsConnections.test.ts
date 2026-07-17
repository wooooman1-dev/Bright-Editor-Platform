import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { compatibleReplacementConnections } from "../../../../app/settings/SettingsConnections";
import type { PublicConnection } from "../../../../app/settings/settings-types";

function tistory(
  id: string,
  status: PublicConnection["status"],
  blogId: string,
): PublicConnection {
  return {
    id,
    platform: "tistory",
    displayName: blogId,
    status,
    updatedAt: "2026-07-18T00:00:00.000Z",
    permissions: ["draft.create"],
    publishingPolicy: "review_first",
    publicMetadata: { blogId, blogUrl: `https://${blogId}.tistory.com`, sessionStateAvailable: status === "connected" },
  };
}

describe("SettingsConnections migration UI", () => {
  it("offers only a connected account for the same platform and publishing site", () => {
    const source = tistory("old", "disconnected", "bright-healthy");
    const replacement = tistory("new", "connected", "bright-healthy");
    const candidates = compatibleReplacementConnections([
      source,
      replacement,
      tistory("same-disconnected", "disconnected", "bright-healthy"),
      tistory("other-blog", "connected", "another-blog"),
      {
        id: "wordpress",
        platform: "wordpress",
        displayName: "Bright WordPress",
        status: "connected",
        updatedAt: "2026-07-18T00:00:00.000Z",
        permissions: ["draft.create"],
        publishingPolicy: "review_first",
        publicMetadata: { siteUrl: "https://bright-healthy.tistory.com" },
      },
    ], source);

    expect(candidates.map((item) => item.id)).toEqual([replacement.id]);
  });

  it("removes typed name confirmation and keeps the explicit migration action", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsConnections.tsx"), "utf8");
    expect(source).toContain("연결 해제됨");
    expect(source).toContain("참조 이전 후 삭제");
    expect(source).toContain('action: "migrate-delete-connection"');
    expect(source).not.toContain("deletion.confirmation");
    expect(source).not.toContain("placeholder={deletion.name}");
  });

  it("keeps a visible success banner with the server-reported Project and Content counts", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsConnections.tsx"), "utf8");
    expect(source).toContain("result.message");
    expect(source).toContain("참조 Project ${result.projectCount ?? 0}개와 Content ${result.contentCount ?? 0}개");
    expect(source).toContain("sticky top-4");
    expect(source).toContain("bg-emerald-50");
    expect(source).toContain('aria-live="polite"');
  });

  it("distinguishes same-ID reconnect from duplicate-account migration", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsConnections.tsx"), "utf8");
    expect(source).toContain("다시 연결");
    expect(source).toContain("새 Tistory 계정 연결");
    expect(source).toContain("기존 Project ${projectReferences}개 · Content ${contentReferences}개 참조 유지 중");
    expect(source).toContain("Project ${projectReferences}개 · Content ${contentReferences}개 참조 유지됨");
    expect(source).toContain("const activeDeletion");
    expect(source).toContain('connection.status === "disconnected"');
    expect(source).toContain("setDeletion(undefined)");
  });
});
