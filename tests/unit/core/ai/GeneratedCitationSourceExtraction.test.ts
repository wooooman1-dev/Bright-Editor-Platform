import { describe, expect, it } from "vitest";
import { generatedDocumentCitationSources } from "../../../../core/ai/AIWorkflow";
import type { ContentDocument } from "../../../../core/content";

describe("generated document citation source extraction", () => {
  it("preserves HTTPS URLs written in article prose as citation candidates", () => {
    const document = {
      title: "리볼빙 확인",
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          text: "금융위원회 자료를 확인하세요: https://www.fsc.go.kr/no040101?cnId=2396&curPage=1.",
        },
      ],
    } as ContentDocument;

    expect(generatedDocumentCitationSources(document)).toEqual([
      {
        url: "https://www.fsc.go.kr/no040101?cnId=2396&curPage=1",
        provenance: "citation",
      },
    ]);
  });
});
