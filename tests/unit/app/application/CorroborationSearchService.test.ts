import { describe, expect, it } from "vitest";
import {
  searchCorroborationCandidates,
  searchMissingApprovalFactCandidates,
} from "../../../../app/application/approval/CorroborationSearchService";
import type { ApprovalEvidenceSource } from "../../../../core/approval/ApprovalReadiness";

function source(): ApprovalEvidenceSource {
  return {
    sourceId: "source-a",
    url: "https://first.example.com/lease",
    title: "계약갱신요구권 안내",
    publisher: "first.example.com",
    sourceType: "official_institution",
    retrievedAt: "2026-08-16T00:00:00.000Z",
    verified: false,
    facts: [{ field: "renewalRight", value: "임차인은 계약갱신요구권을 행사할 수 있다" }],
    matchedFacts: [{ field: "renewalRight", value: "임차인은 계약갱신요구권을 행사할 수 있다" }],
    official: false,
    verificationStatus: "needs_corroboration",
  };
}

describe("CorroborationSearchService", () => {
  it("uses a free DuckDuckGo result, fetches the page, and keeps only an independent institution", async () => {
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.startsWith("https://html.duckduckgo.com/")) {
        return new Response(`
          <a class="result__a" href="https://second.example.org/lease">계약갱신요구권 안내</a>
          <a class="result__a" href="https://first.example.com/other">같은 기관 다른 페이지</a>
        `, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://second.example.org/lease") {
        return new Response(`
          <html><head><title>계약갱신요구권 안내</title></head>
          <body>임차인은 계약갱신요구권을 행사할 수 있다. 임대차 계약의 갱신과 관련된 안내입니다. 현재 기준의 일반적인 설명입니다.</body></html>
        `, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://first.example.com/other") {
        return new Response(`
          <html><head><title>계약갱신요구권 안내</title></head>
          <body>임차인은 계약갱신요구권을 행사할 수 있다. 같은 기관의 다른 페이지입니다.</body></html>
        `, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("not found", { status: 404 });
    };

    const result = await searchCorroborationCandidates(
      source(),
      fetcher,
      new Date("2026-08-16T00:00:00.000Z"),
    );

    expect(result.searchedQueries.length).toBeGreaterThan(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.institutionGroupId).not.toBe("institution-unknown");
    expect(result.candidates[0]?.publisher).toBe("second.example.org");
  });

  it("does not accept an expired event page as corroboration", async () => {
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.startsWith("https://html.duckduckgo.com/")) {
        return new Response(
          `<a class="result__a" href="https://second.example.org/event">2024년 지원사업 신청기간</a>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response(
        `<html><head><title>2024년 지원사업 신청기간</title></head><body>2024년 지원사업 신청기간과 접수 마감 안내입니다. 임차인은 계약갱신요구권을 행사할 수 있다.</body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    };

    const result = await searchCorroborationCandidates(
      source(),
      fetcher,
      new Date("2026-08-16T00:00:00.000Z"),
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("searches uncovered facts independently without an LLM call", async () => {
    const fact = {
      field: "eligibility",
      value: "소득 기준 중위소득 100% 이하인 가구",
    };
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.startsWith("https://html.duckduckgo.com/")) {
        return new Response(
          `<a class="result__a" href="https://www.gov.kr/benefit">지원 대상 안내</a>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (url === "https://www.gov.kr/benefit") {
        return new Response(
          `<html><head><title>지원 대상 안내</title></head><body>소득 기준 중위소득 100% 이하인 가구를 지원 대상으로 합니다. 신청 절차와 제출 서류를 안내합니다.</body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const result = await searchMissingApprovalFactCandidates(
      [fact],
      fetcher,
      new Date("2026-08-16T00:00:00.000Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.field).toBe("eligibility");
    expect(result[0]?.candidates).toHaveLength(1);
    expect(result[0]?.candidates[0]?.url).toBe("https://www.gov.kr/benefit");
    expect(result[0]?.candidates[0]?.facts).toEqual([fact]);
  });
});
