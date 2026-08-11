import { describe, expect, it } from "vitest";

import { buildEditorialRepetitionContext } from "../../../../core/content";
import type { ContentDocument } from "../../../../core/content";

function article(overrides: Readonly<{
  title: string;
  headings?: readonly string[];
  opening?: string;
}>): ContentDocument {
  return {
    id: `doc-${overrides.title}`,
    title: overrides.title,
    blocks: [
      ...(overrides.opening ? [{ id: "intro", type: "paragraph", text: overrides.opening }] : []),
      ...(overrides.headings ?? []).map((heading, index) => ({
        id: `h-${index}`,
        type: "heading",
        level: 2,
        text: heading,
      })),
    ],
  } as unknown as ContentDocument;
}

describe("editorial repetition context", () => {
  it("returns nothing when the project has no earlier article", () => {
    expect(buildEditorialRepetitionContext([])).toBeUndefined();
  });

  it("summarises title, H2 headings and the opening sentence of recent articles", () => {
    const context = buildEditorialRepetitionContext([
      article({
        title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성을 판단하는 기준",
        headings: ["우대금리 조건이 나뉘는 기준", "가입 전 확인 순서"],
        opening: "적금 우대금리의 핵심은 조건 충족 가능성에 있습니다. 두 번째 문장은 제외됩니다.",
      }),
    ]);

    expect(context?.recent).toHaveLength(1);
    expect(context?.recent[0]).toMatchObject({
      title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성을 판단하는 기준",
      headings: ["우대금리 조건이 나뉘는 기준", "가입 전 확인 순서"],
    });
    expect(context?.recent[0].openingSentence).toBe("적금 우대금리의 핵심은 조건 충족 가능성에 있습니다.");
  });

  it("keeps only the requested number of recent articles", () => {
    const documents = ["첫 번째 글", "두 번째 글", "세 번째 글", "네 번째 글"].map((title) => article({ title }));

    expect(buildEditorialRepetitionContext(documents)?.recent.map((item) => item.title))
      .toEqual(["첫 번째 글", "두 번째 글", "세 번째 글"]);
    expect(buildEditorialRepetitionContext(documents, 1)?.recent.map((item) => item.title))
      .toEqual(["첫 번째 글"]);
  });

  it("names the repeated colon title shape so it is not reused", () => {
    const context = buildEditorialRepetitionContext([
      article({ title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성" }),
      article({ title: "신용카드 명세서 보는 방법: 결제 예정금액 확인 순서" }),
    ]);

    expect(context?.instruction).toContain("콜론");
    expect(context?.instruction).toContain("제목 문형");
  });

  it("does not invent a shape warning when recent titles share no pattern", () => {
    const context = buildEditorialRepetitionContext([article({ title: "생활비를 줄이는 현실적인 순서" })]);

    expect(context?.instruction).not.toContain("콜론");
    expect(context?.instruction).not.toContain("질문형");
  });

  it("forbids changing facts in the name of diversity", () => {
    const context = buildEditorialRepetitionContext([article({ title: "생활비 절약 순서" })]);

    expect(context?.instruction).toContain("사실을 바꾸거나 근거 없는 내용을 추가하지 않는다");
  });

  it("ignores untitled documents", () => {
    expect(buildEditorialRepetitionContext([article({ title: "   " })])).toBeUndefined();
  });

  it("collects only H2 headings so section-level subheadings do not dominate", () => {
    const document = {
      id: "doc",
      title: "제목",
      blocks: [
        { id: "h2", type: "heading", level: 2, text: "주요 섹션" },
        { id: "h3", type: "heading", level: 3, text: "하위 항목" },
      ],
    } as unknown as ContentDocument;

    expect(buildEditorialRepetitionContext([document])?.recent[0].headings).toEqual(["주요 섹션"]);
  });
});

function plannedArticle(title: string, contentDepth: string): ContentDocument {
  return {
    id: `doc-${title}`,
    title,
    metadata: {
      qualityTarget: {
        contentDepth,
        tableNeeds: true,
        checklistNeeds: true,
        requiredContentElements: ["명확한 비교 기준", "차이와 장단점"],
      },
    },
    blocks: [{ id: "intro", type: "paragraph", text: `${title} 안내입니다.` }],
  } as unknown as ContentDocument;
}

describe("editorial repetition context: planned shape", () => {
  it("carries the planned shape so planning can vary it", () => {
    const context = buildEditorialRepetitionContext([plannedArticle("비교 글", "comparison")]);

    expect(context?.recent[0].shape).toMatchObject({
      contentDepth: "comparison",
      tableNeeds: true,
      checklistNeeds: true,
      requiredContentElements: ["명확한 비교 기준", "차이와 장단점"],
    });
  });

  it("flags a repeated plan shape when recent articles share one depth", () => {
    const context = buildEditorialRepetitionContext([
      plannedArticle("첫 비교 글", "comparison"),
      plannedArticle("두 번째 비교 글", "comparison"),
    ]);

    expect(context?.instruction).toContain("contentDepth=comparison");
    expect(context?.instruction).toContain("다른 접근 각도");
  });

  it("stays silent when recent plan shapes already differ", () => {
    const context = buildEditorialRepetitionContext([
      plannedArticle("비교 글", "comparison"),
      plannedArticle("설명 글", "standard"),
    ]);

    expect(context?.instruction).not.toContain("contentDepth=");
  });

  it("never asks for fewer required elements", () => {
    const context = buildEditorialRepetitionContext([
      plannedArticle("첫 비교 글", "comparison"),
      plannedArticle("두 번째 비교 글", "comparison"),
    ]);

    expect(context?.instruction).toContain("완결성 기준은 낮추지 않는다");
    expect(context?.instruction).toContain("정한 것은 반드시 충족한다");
  });

  it("omits the shape for documents planned before quality targets were stored", () => {
    expect(buildEditorialRepetitionContext([article({ title: "예전 글" })])?.recent[0].shape)
      .toBeUndefined();
  });
});

describe("editorial repetition context: bounded payload", () => {
  it("caps the summarized headings so a long article cannot grow later prompts", () => {
    const document = {
      id: "long",
      title: "긴 글",
      blocks: Array.from({ length: 12 }, (_, index) => ({
        id: `h-${index}`,
        type: "heading",
        level: 2,
        text: `섹션 ${index + 1}`,
      })),
    } as unknown as ContentDocument;

    expect(buildEditorialRepetitionContext([document])?.recent[0].headings).toHaveLength(6);
  });

  it("caps the summarized required elements", () => {
    const document = {
      id: "many",
      title: "요소가 많은 글",
      metadata: {
        qualityTarget: {
          contentDepth: "deep",
          tableNeeds: false,
          checklistNeeds: false,
          requiredContentElements: Array.from({ length: 9 }, (_, index) => `요소 ${index + 1}`),
        },
      },
      blocks: [{ id: "p", type: "paragraph", text: "본문입니다." }],
    } as unknown as ContentDocument;

    expect(buildEditorialRepetitionContext([document])?.recent[0].shape?.requiredContentElements)
      .toHaveLength(5);
  });
});
