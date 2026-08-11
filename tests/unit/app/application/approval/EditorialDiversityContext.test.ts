import { describe, expect, it } from "vitest";

import { contentEditorialContext } from "../../../../../app/application/approval/ApprovalRuntimePolicy";
import {
  editorialContextWithoutDiversityPolicy,
  editorialDiversityPolicyFromContext,
} from "../../../../../app/application/approval/ApprovalContentPolicy";
import { resolveApprovalPolicySnapshot } from "../../../../../core/approval";
import {
  createProject,
  createWorkspace,
  emptyUserData,
  type UserContent,
  type UserData,
} from "../../../../../app/user-flow/user-data";
import type { ContentDocument } from "../../../../../core/content";

function document(title: string, heading: string): ContentDocument {
  return {
    id: `doc-${title}`,
    title,
    blocks: [
      { id: "intro", type: "paragraph", text: `${title}의 핵심은 조건 확인에 있습니다.` },
      { id: "h", type: "heading", level: 2, text: heading },
    ],
  } as unknown as ContentDocument;
}

function content(overrides: Readonly<{
  id: string;
  projectId?: string;
  title?: string;
  heading?: string;
  updatedAt?: string;
  withDocument?: boolean;
}>): UserContent {
  return {
    id: overrides.id,
    workspaceId: "workspace-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? overrides.id,
    body: "",
    status: "draft",
    creationMethod: "manual",
    updatedAt: overrides.updatedAt ?? "2026-08-01T00:00:00.000Z",
    ...(overrides.withDocument === false
      ? {}
      : { document: document(overrides.title ?? overrides.id, overrides.heading ?? "섹션") }),
  } as unknown as UserContent;
}

function workspaceData(contents: readonly UserContent[]): UserData {
  const base = createProject(createWorkspace(emptyUserData, "Studio", "workspace-1"), {
    id: "project-1",
    name: "밝은재테크",
    brandName: "밝은재테크",
    description: "생활경제 콘텐츠 운영",
    brandIdFactory: () => "brand-1",
    now: "2026-07-27T00:00:00.000Z",
  });
  const withSecondProject = createProject(base, {
    id: "project-2",
    name: "다른 사이트",
    brandName: "다른 브랜드",
    description: "관련 없는 사이트",
    brandIdFactory: () => "brand-2",
    now: "2026-07-27T00:00:00.000Z",
  });
  return { ...withSecondProject, contents: [...withSecondProject.contents, ...contents] };
}

function diversityPolicy(data: UserData, target: UserContent) {
  const parsed = JSON.parse(contentEditorialContext(data, target)) as {
    editorialDiversityPolicy?: {
      rule: string;
      recentArticles: readonly { title: string; headings: readonly string[]; openingSentence: string }[];
    };
  };
  return parsed.editorialDiversityPolicy;
}

describe("editorial diversity generation context", () => {
  it("omits the policy for the first article of a project", () => {
    const target = content({ id: "content-1" });

    expect(diversityPolicy(workspaceData([target]), target)).toBeUndefined();
  });

  it("supplies the recent articles of the same project, newest first", () => {
    const target = content({ id: "content-new", updatedAt: "2026-08-10T00:00:00.000Z" });
    const data = workspaceData([
      content({ id: "content-old", title: "오래된 글", updatedAt: "2026-08-01T00:00:00.000Z" }),
      content({ id: "content-recent", title: "최근 글", updatedAt: "2026-08-09T00:00:00.000Z" }),
      target,
    ]);

    expect(diversityPolicy(data, target)?.recentArticles.map((item) => item.title))
      .toEqual(["최근 글", "오래된 글"]);
  });

  it("excludes the article being generated", () => {
    const target = content({ id: "content-new", title: "지금 쓰는 글" });
    const data = workspaceData([target, content({ id: "content-old", title: "이전 글" })]);

    expect(diversityPolicy(data, target)?.recentArticles.map((item) => item.title))
      .toEqual(["이전 글"]);
  });

  it("does not leak articles from another project", () => {
    const target = content({ id: "content-new" });
    const data = workspaceData([
      target,
      content({ id: "other-project", projectId: "project-2", title: "다른 사이트 글" }),
    ]);

    expect(diversityPolicy(data, target)).toBeUndefined();
  });

  it("ignores contents that have no canonical document yet", () => {
    const target = content({ id: "content-new" });
    const data = workspaceData([target, content({ id: "planning-only", withDocument: false })]);

    expect(diversityPolicy(data, target)).toBeUndefined();
  });

  it("carries the planned shape of recent articles so planning can vary it", () => {
    const target = content({ id: "content-new" });
    const planned = content({ id: "previous", title: "이전 비교 글" });
    const withTarget = {
      ...planned,
      document: {
        ...planned.document!,
        metadata: {
          qualityTarget: {
            contentDepth: "comparison",
            tableNeeds: true,
            checklistNeeds: true,
            requiredContentElements: ["명확한 비교 기준"],
          },
        },
      },
    } as unknown as UserContent;

    const policy = JSON.parse(contentEditorialContext(workspaceData([target, withTarget]), target)) as {
      editorialDiversityPolicy?: { recentArticles: readonly { shape?: { contentDepth: string } }[] };
    };

    expect(policy.editorialDiversityPolicy?.recentArticles[0].shape?.contentDepth).toBe("comparison");
  });

  it("carries the heading and opening sentence the new article must not repeat", () => {
    const target = content({ id: "content-new" });
    const data = workspaceData([
      target,
      content({ id: "previous", title: "적금 우대금리 조건 확인 방법: 판단 기준", heading: "확인 순서" }),
    ]);

    const policy = diversityPolicy(data, target);

    expect(policy?.recentArticles[0]).toMatchObject({
      title: "적금 우대금리 조건 확인 방법: 판단 기준",
      headings: ["확인 순서"],
    });
    expect(policy?.recentArticles[0].openingSentence).toContain("핵심은");
    expect(policy?.rule).toContain("콜론");
  });
});

describe("depth classification isolation", () => {
  it("strips the diversity policy so recent titles cannot pin the planned depth", () => {
    const context = JSON.stringify({
      projectStrategy: { domain: "생활경제" },
      editorialDiversityPolicy: {
        rule: "제목 문형을 반복하지 말 것",
        recentArticles: [{ title: "예금 적금 비교 방법: 차이와 장단점", headings: [], openingSentence: "" }],
      },
    });

    const stripped = editorialContextWithoutDiversityPolicy(context);

    expect(stripped).not.toContain("비교");
    expect(stripped).not.toContain("장단점");
    expect(JSON.parse(stripped)).toEqual({ projectStrategy: { domain: "생활경제" } });
  });

  it("leaves a context without the diversity policy untouched", () => {
    const context = JSON.stringify({ projectStrategy: { domain: "생활경제" } });

    expect(editorialContextWithoutDiversityPolicy(context)).toBe(context);
  });

  it("returns the original value when the context is not JSON", () => {
    expect(editorialContextWithoutDiversityPolicy("plain text")).toBe("plain text");
  });

  it("keeps the diversity policy in the generation context", () => {
    const target = content({ id: "content-new" });
    const data = workspaceData([target, content({ id: "previous", title: "이전 글" })]);

    expect(contentEditorialContext(data, target)).toContain("editorialDiversityPolicy");
  });
});

describe("reading the diversity policy back out of the context", () => {
  it("returns the policy Planning has to restate at instruction rank", () => {
    const target = content({ id: "content-new" });
    const data = workspaceData([target, content({ id: "previous", title: "이전 글" })]);

    const policy = editorialDiversityPolicyFromContext(contentEditorialContext(data, target));

    expect(policy?.recentArticles?.map((item) => item.title)).toEqual(["이전 글"]);
    expect(policy?.rule).toBeTruthy();
  });

  it.each([
    ["a context without the policy", JSON.stringify({ projectStrategy: { domain: "생활경제" } })],
    ["a value that is not JSON", "plain text"],
    ["an empty value", ""],
    ["no value", undefined],
  ])("returns undefined for %s", (_label, context) => {
    expect(editorialDiversityPolicyFromContext(context)).toBeUndefined();
  });
});

function approvalContent(overrides: Parameters<typeof content>[0]): UserContent {
  const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
  return {
    ...content(overrides),
    contentPurpose: snapshot.contentPurpose,
    approvalPolicyId: snapshot.policyId,
    approvalPolicyVersion: snapshot.policyVersion,
    approvalProfileId: snapshot.profileId,
    approvalProfileVersion: snapshot.profileVersion,
  } as unknown as UserContent;
}

function formatOptionIds(data: UserData, target: UserContent): readonly string[] | undefined {
  const parsed = JSON.parse(contentEditorialContext(data, target)) as {
    editorialDiversityPolicy?: { formatOptions?: readonly { id: string }[] };
  };
  return parsed.editorialDiversityPolicy?.formatOptions?.map((option) => option.id);
}

describe("editorial format options in the generation context", () => {
  it("offers the shapes from the first article, before any recent article exists", () => {
    const target = approvalContent({ id: "content-1" });

    expect(formatOptionIds(workspaceData([target]), target))
      .toEqual(["procedure", "eligibility", "criteria", "correction", "calculation"]);
  });

  it("offers the shapes alongside the recent-article summary once articles exist", () => {
    const target = approvalContent({ id: "content-new" });
    const data = workspaceData([target, approvalContent({ id: "previous", title: "이전 글" })]);
    const policy = diversityPolicy(data, target);

    expect(formatOptionIds(data, target)).toHaveLength(5);
    expect(policy?.recentArticles.map((item) => item.title)).toEqual(["이전 글"]);
  });

  it("offers no shapes to a Project that is not preparing for approval", () => {
    const target = content({ id: "content-1" });

    expect(formatOptionIds(workspaceData([target]), target)).toBeUndefined();
  });

  /**
   * The shape descriptions carry 비교 and 차이, the very words the depth
   * classifier keys on. They travel inside editorialDiversityPolicy so the
   * existing strip removes them before classification.
   */
  it("keeps the shape descriptions out of the depth classification context", () => {
    const target = approvalContent({ id: "content-1" });
    const context = contentEditorialContext(workspaceData([target]), target);

    expect(context).toContain("기준 비교형");

    const stripped = editorialContextWithoutDiversityPolicy(context);

    expect(stripped).not.toContain("기준 비교형");
    expect(stripped).not.toContain("formatOptions");
  });
});
