import { describe, expect, it, vi } from "vitest";
import { NaverWebSearchProvider } from "../../../../../app/application/approval/NaverWebSearchProvider";
import { fetchDuckDuckGoUrls } from "../../../../../core/ai/ApprovalSourcePreflight";

const connection = {
  id: "naver-1",
  workspaceId: "workspace-1",
  provider: "naverSearchTrend" as const,
  displayName: "NAVER Search Trend",
  status: "ready" as const,
  secretReference: "secret-1",
  resourceConfiguration: { keywords: ["예금자보호"] },
  enabled: true,
  createdAt: "now",
  updatedAt: "now",
  version: 1,
};

function fetcher(response: Response) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    expect(String(url)).toContain("https://openapi.naver.com/v1/search/webkr.json");
    expect(init?.headers).toMatchObject({
      "X-Naver-Client-Id": "client-id",
      "X-Naver-Client-Secret": "client-secret",
    });
    return response;
  });
}

describe("NaverWebSearchProvider", () => {
  it("reuses the active Search Trend SecretStore credential and returns only item links", async () => {
    const provider = new NaverWebSearchProvider(
      "workspace-1",
      { listByWorkspace: vi.fn(async () => [connection]) } as never,
      { readSecret: vi.fn(async () => JSON.stringify({ clientId: "client-id", clientSecret: "client-secret" })) } as never,
    );
    const result = await provider.search("2026년 예금자보호 한도", fetcher(new Response(JSON.stringify({ items: [
      { title: "snippet is not evidence", link: "https://agency.example/one" },
      { title: "second", link: "http://blocked.example/two" },
    ] }), { status: 200 })));
    expect(result).toEqual(["https://agency.example/one"]);
  });

  it("fails closed on Naver API errors", async () => {
    const provider = new NaverWebSearchProvider(
      "workspace-1",
      { listByWorkspace: vi.fn(async () => [connection]) } as never,
      { readSecret: vi.fn(async () => JSON.stringify({ clientId: "client-id", clientSecret: "client-secret" })) } as never,
    );
    await expect(provider.search("claim", fetcher(new Response("rate limited", { status: 429 })))).resolves.toEqual([]);
  });

  it("tries the next active connection when an earlier credential is unusable", async () => {
    const secondConnection = { ...connection, id: "naver-2", secretReference: "secret-2" };
    const provider = new NaverWebSearchProvider(
      "workspace-1",
      { listByWorkspace: vi.fn(async () => [connection, secondConnection]) } as never,
      { readSecret: vi.fn(async (reference: string) => reference === "secret-1"
        ? JSON.stringify({})
        : JSON.stringify({ clientId: "client-id", clientSecret: "client-secret" })) } as never,
    );
    await expect(provider.search("claim", fetcher(new Response(JSON.stringify({ items: [
      { link: "https://official.example/source" },
    ] }), { status: 200 })))).resolves.toEqual(["https://official.example/source"]);
  });
});

describe("DuckDuckGo to Naver fallback", () => {
  it("does not call Naver after a DuckDuckGo result", async () => {
    const naver = { search: vi.fn(async () => ["https://naver.example/unused"]) };
    const fetch = vi.fn(async () => new Response('<a class="result__a" href="https://official.example/source">source</a>', { status: 200 }));
    await expect(fetchDuckDuckGoUrls("claim", fetch, undefined, naver)).resolves.toEqual(["https://official.example/source"]);
    expect(naver.search).not.toHaveBeenCalled();
  });

  it("uses the identical query when DuckDuckGo times out and preserves provider failure as an empty result", async () => {
    const naver = { search: vi.fn(async (query: string) => [`https://agency.example/${encodeURIComponent(query)}`]) };
    const fetch = vi.fn(async () => { throw new Error("timeout"); });
    await expect(fetchDuckDuckGoUrls("2026년 예금자보호 한도 5,000만원", fetch, undefined, naver)).resolves.toEqual([
      "https://agency.example/2026%EB%85%84%20%EC%98%88%EA%B8%88%EC%9E%90%EB%B3%B4%ED%98%B8%20%ED%95%9C%EB%8F%84%205%2C000%EB%A7%8C%EC%9B%90",
    ]);
    expect(naver.search).toHaveBeenCalledWith("2026년 예금자보호 한도 5,000만원", fetch);
  });

  it("does not retry Naver after an empty fallback result", async () => {
    const naver = { search: vi.fn(async () => []) };
    const fetch = vi.fn(async () => new Response("", { status: 503 }));
    await expect(fetchDuckDuckGoUrls("claim", fetch, undefined, naver)).resolves.toEqual([]);
    expect(naver.search).toHaveBeenCalledTimes(1);
  });
});
