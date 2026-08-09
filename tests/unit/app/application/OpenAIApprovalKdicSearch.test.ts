import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "../../../../app/application/OpenAIProvider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI approval KDIC search", () => {
  it("includes the official KDIC domain in the existing Generation web search", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return {
        ok: true,
        json: async () => ({
          id: "response-kdic",
          model: "gpt-5-test",
          status: "completed",
          output_text: "{\"title\":\"예금자보호 확인 방법\"}",
          output: [],
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIProvider("sk-test-key", "gpt-5-test", 5_000).generate({
      instruction: "예금자보호 공식 자료를 사용해 작성하세요.",
      metadata: {
        task: "content-generation",
        contentType: "article",
        approvalPurpose: "adsense_approval",
        approvalProfileId: "wordpress_life_economy_v1",
      },
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(new TextDecoder().decode(request?.body as Uint8Array)) as {
      tools?: readonly Readonly<{ filters?: Readonly<{ allowed_domains?: readonly string[] }> }>[];
    };
    expect(body.tools?.[0]?.filters?.allowed_domains).toContain("kdic.or.kr");
  });
});
