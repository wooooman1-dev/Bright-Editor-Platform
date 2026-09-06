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

  it("names the same two-part shape when the separator moved off the colon", () => {
    const context = buildEditorialRepetitionContext([
      article({ title: "정부지원금 찾는 방법, 대상 후보를 정리하는 순서" }),
      article({ title: "청년 월세 지원 신청 - 접수 전 확인할 서류" }),
    ]);

    expect(context?.instruction).toContain("두 도막 제목");
    expect(context?.instruction).toContain("구분자만 다른 기호로 바꾸는 것은 다른 문형이 아니다");
  });

  it("reads a one-word trailing fragment as a tag rather than a description clause", () => {
    const context = buildEditorialRepetitionContext([
      article({ title: "연말정산 환급 신청 - 요약" }),
    ]);

    expect(context?.instruction).not.toContain("두 도막 제목");
  });

  it("reports every structure a title matches, not only the first", () => {
    const context = buildEditorialRepetitionContext([
      article({ title: "전세자금대출 갈아타기: 준비해야 할 3가지 서류" }),
    ]);

    expect(context?.instruction).toContain("두 도막 제목");
    expect(context?.instruction).toContain("숫자 나열형 제목");
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

describe("editorial repetition context: first heading echo", () => {
  it("flags a first H2 that restates the head of the title", () => {
    const context = buildEditorialRepetitionContext([
      article({
        title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성",
        headings: ["적금 우대금리 조건이란", "가입 전 확인 순서"],
      }),
      article({
        title: "청년 월세 지원 신청 방법, 접수 전 확인할 서류",
        headings: ["청년 월세 지원 신청이란", "서류 준비 순서"],
      }),
    ]);

    expect(context?.instruction).toContain("첫 H2가 제목 앞머리를 거의 그대로 되풀이했다");
    expect(context?.instruction).toContain("적금 우대금리 조건이란");
  });

  it("never asks for headings without the subject, which heading anchoring requires", () => {
    const context = buildEditorialRepetitionContext([
      article({ title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성", headings: ["적금 우대금리 조건이란"] }),
      article({ title: "청년 월세 지원 신청 방법, 접수 전 서류", headings: ["청년 월세 지원 신청이란"] }),
    ]);

    expect(context?.instruction).toContain("주제어 자체를 빼지는 말 것");
  });

  it("treats a single anchoring term as anchoring rather than restatement", () => {
    const context = buildEditorialRepetitionContext([
      article({ title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성", headings: ["우대금리가 갈리는 지점"] }),
      article({ title: "청년 월세 지원 신청 방법, 접수 전 서류", headings: ["월세 부담을 줄이는 순서"] }),
    ]);

    expect(context?.instruction).not.toContain("첫 H2가 제목 앞머리");
  });

  it("stays silent when only one recent article echoes its title", () => {
    const context = buildEditorialRepetitionContext([
      article({ title: "적금 우대금리 조건 확인 방법: 가입 전 충족 가능성", headings: ["적금 우대금리 조건이란"] }),
      article({ title: "청년 월세 지원 신청 방법, 접수 전 서류", headings: ["신청 자격이 갈리는 지점"] }),
    ]);

    expect(context?.instruction).not.toContain("첫 H2가 제목 앞머리");
  });

  /**
   * These three are the real 밝은재테크 articles the rule was calibrated against.
   * Only the first restates its title; the other two carry the subject because
   * heading anchoring requires it, and the third already opens on the reader's
   * first decision, which is exactly what the rule asks for.
   */
  it("separates a restatement from a heading that merely carries the subject", () => {
    const restating = article({
      title: "예금 적금 비교 방법: 돈을 쓸 시점과 저축 방식으로 고르는 기준",
      headings: ["예금 적금 차이: 금리보다 먼저 볼 비교 기준"],
    });
    const advancing = [
      article({
        title: "신용카드 결제일 설정 방법: 월급일과 이용기간을 맞춰 카드값 관리하기",
        headings: ["신용카드 결제일을 정하기 전, 달력에 적을 4가지"],
      }),
      article({
        title: "비상금 규모 설정 방법: 생활비·고정지출로 내 목표액 정하기",
        headings: ["비상금은 어떤 지출을 대비하는 돈인가"],
      }),
    ];

    expect(buildEditorialRepetitionContext([restating, ...advancing])?.instruction)
      .not.toContain("첫 H2가 제목 앞머리");
    expect(buildEditorialRepetitionContext(advancing)?.instruction)
      .not.toContain("첫 H2가 제목 앞머리");
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

function shapedArticle(overrides: Readonly<{
  title: string;
  headings: readonly string[];
  sectionTypes: readonly string[];
  paragraphs: readonly string[];
}>): ContentDocument {
  return {
    id: `doc-${overrides.title}`,
    title: overrides.title,
    metadata: {
      longFormStructure: {
        introductionBlockIds: [],
        conclusionBlockIds: [],
        sections: overrides.sectionTypes.map((sectionType, index) => ({
          headingBlockId: `h-${index}`,
          paragraphBlockIds: [],
          sectionType,
        })),
      },
    },
    blocks: [
      ...overrides.headings.map((heading, index) => ({ id: `h-${index}`, type: "heading", level: 2, text: heading })),
      ...overrides.paragraphs.map((text, index) => ({ id: `p-${index}`, type: "paragraph", text })),
    ],
  } as unknown as ContentDocument;
}

const twoSentences = "첫 문장은 확인 순서를 설명하는 충분히 긴 문단 문장입니다. 두 번째 문장도 같은 길이로 이어집니다.";

describe("repetition beyond the title shape", () => {
  /**
   * 2026-08-20 밝은재테크 실측: 최근 6편의 H2 41개 중 질문형이 0개였고,
   * 문단당 평균 문장 수가 2.4~2.8 로 폭이 0.4 였으며, comparison 과 warning 은
   * 6편 전부에 들어 있었다.
   */
  const repeated = [1, 2, 3].map((index) => shapedArticle({
    title: `주제 ${index} 확인 방법: 순서를 정리하는 기준`,
    headings: ["첫 번째 항목을 먼저 확인합니다", "두 번째 항목도 같이 봅니다"],
    sectionTypes: ["explanation", "comparison", "warning"],
    paragraphs: [twoSentences, twoSentences],
  }));

  it("names the heading form when recent articles never used a question and lean declarative", () => {
    const context = buildEditorialRepetitionContext(repeated);

    expect(context?.instruction).toContain("완결형 서술문");
    expect(context?.instruction).toContain("질문형은 0개");
    expect(context?.recent[0].headingForms).toEqual({ declarative: 2, question: 0, nominal: 0 });
  });

  it("names the section types every recent article shared", () => {
    const context = buildEditorialRepetitionContext(repeated);

    expect(context?.instruction).toContain("explanation, comparison, warning");
    expect(context?.recent[0].sectionTypes).toEqual(["explanation", "comparison", "warning"]);
  });

  it("names the paragraph rhythm when every recent article kept the same length", () => {
    const context = buildEditorialRepetitionContext(repeated);

    expect(context?.instruction).toContain("문단 길이를 고르게 맞추지 말고");
    expect(context?.recent[0].rhythm).toEqual({ paragraphs: 2, averageSentences: 2 });
  });

  it("stays silent when recent articles already vary", () => {
    const varied = [
      shapedArticle({ title: "가", headings: ["확인 순서", "무엇을 먼저 볼까요?"], sectionTypes: ["explanation"], paragraphs: ["한 문장짜리 문단도 충분히 길게 씁니다."] }),
      shapedArticle({ title: "나", headings: ["기준은 어디에 있나요?", "정리"], sectionTypes: ["steps", "faq"], paragraphs: [twoSentences, twoSentences, `${twoSentences} 세 번째 문장까지 이어 붙여 길이를 다르게 만듭니다.`] }),
    ];
    const context = buildEditorialRepetitionContext(varied);

    expect(context?.instruction).not.toContain("완결형 서술문");
    expect(context?.instruction).not.toContain("문단 길이를 고르게 맞추지 말고");
  });
});
