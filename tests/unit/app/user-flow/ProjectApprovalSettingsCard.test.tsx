import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  compatibleApprovalProfiles,
  defaultApprovalProfileId,
  ProjectApprovalSettingsCard,
} from "../../../../app/user-flow/ProjectApprovalSettingsCard";
import type {
  UserData,
  UserProject,
} from "../../../../app/user-flow/user-data";

function project(
  strategy: Readonly<Record<string, unknown>> = { defaultPlatform: "tistory" },
): UserProject {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "비바레인 미술 감상 가이드",
    description: "미술 초보를 위한 감상 가이드",
    strategy: strategy as UserProject["strategy"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

function data(value: UserProject): UserData {
  return {
    workspace: {
      id: "workspace-1",
      name: "Studio",
      settings: {
        enabledPlatforms: ["tistory"],
        publishing: {
          reviewFirst: true,
          draftOnly: true,
          publicPublish: false,
          sequentialDraftSave: true,
          qualityApprovalRequired: true,
        },
        appearance: { theme: "system" },
      },
    },
    brands: [],
    projects: [value],
    contents: [],
    qualityReports: [],
  };
}

describe("ProjectApprovalSettingsCard", () => {
  it("defaults a Tistory Project to the Vivarain art approval profile", () => {
    const value = project({ defaultPlatform: "tistory" });

    expect(defaultApprovalProfileId(value)).toBe("tistory_vivarain_art_v1");
    expect(compatibleApprovalProfiles(value)).toEqual(["tistory_vivarain_art_v1"]);
  });

  it("defaults a WordPress Project to the life-economy approval profile", () => {
    const value = project({ defaultPlatform: "wordpress" });

    expect(defaultApprovalProfileId(value)).toBe("wordpress_life_economy_v1");
    expect(compatibleApprovalProfiles(value)).toEqual(["wordpress_life_economy_v1"]);
  });

  it("renders the persisted approval mode and exact Content snapshot notice", () => {
    const value = project({
      defaultPlatform: "tistory",
      defaultContentPurpose: "adsense_approval",
      approvalProfileId: "tistory_vivarain_art_v1",
    });

    const html = renderToStaticMarkup(
      <ProjectApprovalSettingsCard
        data={data(value)}
        onPersist={vi.fn(async () => undefined)}
        project={value}
      />,
    );

    expect(html).toContain("콘텐츠 목적");
    expect(html).toContain("애드센스 승인 준비");
    expect(html).toContain("Tistory · 비바레인 미술");
    expect(html).toContain("승인 가능성을 보장하지 않습니다");
    expect(html).toContain("기존 콘텐츠의 정책은 변경하지 않습니다");
  });

  it("renders the WordPress profile with the actual brightjaetech brand identity", () => {
    const value = {
      ...project({
        defaultPlatform: "wordpress",
        defaultContentPurpose: "adsense_approval",
        approvalProfileId: "wordpress_life_economy_v1",
      }),
      name: "밝은재테크",
    } as UserProject;

    const html = renderToStaticMarkup(
      <ProjectApprovalSettingsCard
        data={data(value)}
        onPersist={vi.fn(async () => undefined)}
        project={value}
      />,
    );

    expect(html).toContain("WordPress · 밝은재테크");
    expect(html).not.toContain("WordPress · 생활경제");
  });

  /**
   * 2026-09-04: subtopics·excludedTopics 는 읽기 전용 칩으로만 보여줬다.
   * updateProjectStrategy 는 이미 있었으니 편집 입력만 추가한다.
   */
  it("renders editable subtopics and excludedTopics fields seeded with the persisted strategy", () => {
    const value = project({
      defaultPlatform: "tistory",
      subtopics: ["청년내일저축계좌", "근로장려금"],
      excludedTopics: ["투자 추천"],
    });

    const html = renderToStaticMarkup(
      <ProjectApprovalSettingsCard
        data={data(value)}
        onPersist={vi.fn(async () => undefined)}
        project={value}
      />,
    );

    expect(html).toContain("세부 주제");
    expect(html).toContain("제외 주제");
    expect(html).toContain("청년내일저축계좌, 근로장려금");
    expect(html).toContain("투자 추천");
    expect(html).toContain("세부·제외 주제 저장");
  });

  it("keeps a persisted legacy profile visible instead of silently replacing it", () => {
    const value = project({
      defaultPlatform: "tistory",
      defaultContentPurpose: "adsense_approval",
      approvalProfileId: "wordpress_life_economy_v1",
    });

    expect(compatibleApprovalProfiles(value, "wordpress_life_economy_v1")).toEqual([
      "tistory_vivarain_art_v1",
      "wordpress_life_economy_v1",
    ]);
  });
});
