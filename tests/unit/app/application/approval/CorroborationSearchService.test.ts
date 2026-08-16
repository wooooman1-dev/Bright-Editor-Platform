import { describe, expect, it } from "vitest";

import { searchCorroborationCandidates } from "../../../../../app/application/approval/CorroborationSearchService";
import type { ApprovalEvidenceSource } from "../../../../../core/approval/ApprovalReadiness";
import type { SiteApprovalReadinessFetch } from "../../../../../core/approval/SiteApprovalReadinessAdapter";

function source(overrides: Partial<ApprovalEvidenceSource> = {}): ApprovalEvidenceSource {
  return {
    sourceId: "source-a",
    url: "https://blog.example.com/lease",
    finalUrl: "https://blog.example.com/lease",
    title: "계약갱신요구권 안내",
    publisher: "blog.example.com",
    sourceType: "web",
    retrievedAt: "2026-08-16T00:00:00.000Z",
    verified: false,
    facts: [
      { field: "renewalRight", value: "임차인은 계약갱신요구권을 행사할 수 있다" },
    ],
    matchedFacts: [
      { field: "renewalRight", value: "임차인은 계약갱신요구권을 행사할 수 있다" },
    ],
    provenance: "search_candidate",
    selected: false,
    verificationStatus: "needs_corroboration",
    official: false,
    ...overrides,
  };
}

function htmlResult(url: string, title: string): string {
  return `<html><body><a class="result__a" href="${url}">${title}</a></body></html>`;
}

function pageHtml(title: string, text: string): string {
  return `<html><head><title>${title}</title></head><body>${text.repeat(20)}</body></html>`;
}

function response(url: string, body: string, contentType = "text/html; charset=utf-8"): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("CorroborationSearchService", () => {
  it("finds an independent corroborating page while excluding the original institution", async () => {
    const fetcher: SiteApprovalReadinessFetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://html.duckduckgo.com/")) {
        return response(url, htmlResult("https://blog.example.com/other", "같은 기관 안내")
          + htmlResult("https://public.example.org/lease", "공공기관 계약갱신요구권 안내"));
      }
      if (url === "https://blog.example.com/other") {
        return response(url, pageHtml("같은 기관 안내", "임차인은 계약갱신요구권을 행사할 수 있다."));
      }
      if (url === "https://public.example.org/lease") {
        return response(url, pageHtml("공공기관 계약갱신요구권 안내", "임차인은 계약갱신요구권을 행사할 수 있다."));
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
    expect(result.candidates[0]).toMatchObject({
      url: "https://public.example.org/lease",
      publisher: "public.example.org",
      originalSourceId: "source-a",
      facts: [expect.objectContaining({ field: "renewalRight" })],
    });
  });

  it("does not add a candidate when search results only contain the same institution", async () => {
    const fetcher: SiteApprovalReadinessFetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://html.duckduckgo.com/")) {
        return response(url, htmlResult("https://blog.example.com/other", "같은 기관 안내"));
      }
      return response(url, pageHtml("같은 기관 안내", "임차인은 계약갱신요구권을 행사할 수 있다."));
    };

    const result = await searchCorroborationCandidates(
      source(),
      fetcher,
      new Date("2026-08-16T00:00:00.000Z"),
    );

    expect(result.candidates).toEqual([]);
  });

  it("does not add a candidate for a completed historical application page", async () => {
    const fetcher: SiteApprovalReadinessFetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://html.duckduckgo.com/")) {
        return response(url, htmlResult("https://public.example.org/2024-apply", "2024년 신청기간 안내"));
      }
      return response(url, pageHtml(
        "2024년 신청기간 안내",
        "2024년 신청기간은 3월부터 4월까지이며 접수가 종료되었습니다. 임차인은 계약갱신요구권을 행사할 수 있다.",
      ));
    };

    const result = await searchCorroborationCandidates(
      source(),
      fetcher,
      new Date("2026-08-16T00:00:00.000Z"),
    );

    expect(result.candidates).toEqual([]);
  });
});
