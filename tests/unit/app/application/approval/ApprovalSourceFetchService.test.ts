import { describe, expect, it, vi } from "vitest";

import {
  fetchApprovalSourcePage,
  fetchApprovalSourcePages,
} from "../../../../../app/application/approval/ApprovalSourceFetchService";

describe("ApprovalSourceFetchService", () => {
  it("blocks unsafe initial URLs before any network call", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const page = await fetchApprovalSourcePage(
      "https://127.0.0.1/private",
      fetcher,
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(page).toMatchObject({
      status: 0,
      documentFormat: "unknown",
      extractionStatus: "unavailable",
    });
    expect(page.fetchError).toContain("URL 안전성 검사 차단");
  });

  it("follows only validated public HTTPS redirects and extracts the final page", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(init?.redirect).toBe("manual");
      if (url.includes("/start")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://law.go.kr/final" },
        });
      }
      return new Response(
        "<!doctype html><html><head><title>최종 공식 문서</title></head><body>공식 법령 본문과 검증할 Claim 내용입니다.</body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    });

    const page = await fetchApprovalSourcePage("https://law.go.kr/start", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(page).toMatchObject({
      finalUrl: "https://law.go.kr/final",
      status: 200,
      documentFormat: "html",
      extractionStatus: "extracted",
      title: "최종 공식 문서",
    });
  });

  it("stops a public redirect chain before it reaches a private target", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://169.254.169.254/latest/meta-data" },
    }));

    const page = await fetchApprovalSourcePage("https://law.go.kr/start", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(page.status).toBe(0);
    expect(page.extractionStatus).toBe("unavailable");
    expect(page.fetchError).toContain("URL 안전성 검사 차단");
  });

  it("terminates redirect loops deterministically", async () => {
    let count = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      count += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://law.go.kr/redirect-${count}` },
      });
    });

    const page = await fetchApprovalSourcePage("https://law.go.kr/start", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(page.status).toBe(0);
    expect(page.fetchError).toContain("리다이렉트가 5회를 초과");
  });

  it("classifies declared and streamed oversized responses without retaining the full body", async () => {
    const declaredFetcher = vi.fn<typeof fetch>(async () => new Response("small", {
      status: 200,
      headers: {
        "content-type": "text/plain",
        "content-length": "2000000",
      },
    }));
    const streamedFetcher = vi.fn<typeof fetch>(async () => new Response("a".repeat(1_500_001), {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));

    const declared = await fetchApprovalSourcePage("https://law.go.kr/declared-large", declaredFetcher);
    const streamed = await fetchApprovalSourcePage("https://law.go.kr/streamed-large", streamedFetcher);

    expect(declared).toMatchObject({
      extractionStatus: "too_large",
      contentLength: 2_000_000,
    });
    expect(streamed.extractionStatus).toBe("too_large");
    expect(streamed.contentLength).toBeGreaterThan(1_500_000);
  });

  it("returns one terminal record for every mixed source input", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => new Response(
      String(input).endsWith(".json") ? "{broken" : "official text source content",
      {
        status: 200,
        headers: {
          "content-type": String(input).endsWith(".json") ? "application/json" : "text/plain",
        },
      },
    ));

    const pages = await fetchApprovalSourcePages([
      "https://law.go.kr/source.txt",
      "https://law.go.kr/source.json",
      "https://localhost/private",
    ], fetcher);

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.extractionStatus)).toEqual([
      "extracted",
      "malformed",
      "unavailable",
    ]);
  });
});
