import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "../../../../app/application/OpenAIProvider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI approval web search", () => {
  it("uses web search inside the existing approval generation call and captures cited sources", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        id: "response-1",
        model: "gpt-5-test",
        status: "completed",
        output_text: "{\"title\":\"공식 자료 기반 원고\"}",
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                { type: "url", url: "https://www.gov.kr/portal/service/serviceInfo/test" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                text: "공식 신청 대상과 기준",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://www.gov.kr/portal/service/serviceInfo/test",
                    title: "정부24 공식 안내",
                    start_index: 0,
                    end_index: 12,
                  },
                ],
              },
            ],
          },
        ],
        usage: { output_tokens: 120 },
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    const response = await new OpenAIProvider("sk-test-key", "gpt-5-test", 5_000).generate({
      instruction: "공식 자료를 사용해 작성하세요.",
      metadata: {
        task: "content-generation",
        contentType: "article",
        approvalPurpose: "adsense_approval",
        approvalProfileId: "wordpress_life_economy_v1",
      },
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(new TextDecoder().decode(request?.body as Uint8Array)) as Record<string, unknown>;
    expect(body).toMatchObject({
      tools: [{
        type: "web_search",
        search_context_size: "high",
        filters: { allowed_domains: expect.arrayContaining(["gov.kr", "law.go.kr", "nts.go.kr"]) },
      }],
      include: ["web_search_call.action.sources"],
    });
    expect(response.diagnostics?.webSources).toEqual([
      {
        url: "https://www.gov.kr/portal/service/serviceInfo/test",
        title: "정부24 공식 안내",
        excerpt: "공식 신청 대상과 기준",
      },
    ]);
  });

  it("does not use web search for standard generation", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        id: "response-2",
        model: "gpt-5-test",
        status: "completed",
        output_text: "{\"title\":\"일반 원고\"}",
        output: [],
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIProvider("sk-test-key", "gpt-5-test", 5_000).generate({
      instruction: "일반 원고를 작성하세요.",
      metadata: { task: "content-generation", contentType: "article" },
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(new TextDecoder().decode(request?.body as Uint8Array)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("include");
  });
});
