import { afterEach, describe, expect, it, vi } from "vitest";

import {
  explicitApprovalSourcePreflightFormat,
  approvalSourcePreflightFormat,
  OpenAIProvider,
} from "../../../../app/application/OpenAIProvider";
import { approvalSourcePreflightMaximumClaimsPerSource } from "../../../../core/ai/ApprovalSourcePreflight";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI approval web search", () => {
  it("uses web search inside a legacy approval generation call and captures one canonical source", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return {
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
                  { type: "url", url: "https://www.gov.kr/portal/service/serviceInfo/test?utm_source=openai" },
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
      } as Response;
    });
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
        provenance: "citation",
      },
    ]);
  });

  it("does not attach web search to approval source preflight", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return {
        ok: true,
        json: async () => ({
          id: "response-preflight",
          model: "gpt-5-test",
          status: "completed",
          output_text: "{\"sources\":[]}",
          output: [],
          usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIProvider("sk-test-key", "gpt-5-test", 5_000).generate({
      instruction: "공식 출처만 찾으세요.",
      metadata: {
        task: "approval-source-preflight",
        contentType: "article",
        approvalPurpose: "adsense_approval",
        approvalProfileId: "wordpress_life_economy_v1",
      },
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(new TextDecoder().decode(request?.body as Uint8Array)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("include");
    expect(body).toMatchObject({
      max_output_tokens: 12_000,
      text: { format: { name: "approval_source_preflight", strict: true }, verbosity: "low" },
    });
  });

  it("selects the explicit schema only for explicit verification mode", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ output_text: "{\"sources\":[]}" }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAIProvider("sk-test-key", "gpt-5-test", 5_000);
    await provider.generate({ instruction: "fixture", metadata: { task: "approval-source-preflight", verificationMode: "explicit" } });
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo, RequestInit]>;
    const explicitBody = JSON.parse(new TextDecoder().decode(calls[0]?.[1]?.body as Uint8Array)) as { text: { format: unknown } };
    await provider.generate({ instruction: "fixture", metadata: { task: "approval-source-preflight" } });
    const legacyBody = JSON.parse(new TextDecoder().decode(calls[1]?.[1]?.body as Uint8Array)) as { text: { format: unknown } };
    expect(explicitBody.text.format).toEqual(expect.objectContaining({ name: "explicit_approval_source_preflight" }));
    expect(legacyBody.text.format).toEqual(expect.objectContaining({ name: "approval_source_preflight" }));
  });

  it("keeps the strict source schema aligned with the parsed Claim contract", () => {
    const sourceSchema = approvalSourcePreflightFormat.schema.properties
      .sources.items;
    const claimSchema = sourceSchema.properties.claims;

    expect(sourceSchema.required).toEqual([
      "url",
      "title",
      "evidenceExcerpt",
      "claims",
    ]);
    expect(claimSchema.maxItems)
      .toBe(approvalSourcePreflightMaximumClaimsPerSource);
    expect(claimSchema.items.additionalProperties).toBe(false);
    expect(claimSchema.items.required).toEqual([
      "field",
      "value",
      "evidenceExcerpt",
    ]);
    expect(Object.keys(claimSchema.items.properties)).toEqual([
      "field",
      "value",
      "evidenceExcerpt",
    ]);
  });

  it("documents the verbatim evidence contract in both source preflight schemas", () => {
    for (const format of [approvalSourcePreflightFormat, explicitApprovalSourcePreflightFormat]) {
      const sourceSchema = format.schema.properties.sources.items;
      const sourceEvidenceDescription = sourceSchema.properties.evidenceExcerpt.description;
      const claimEvidenceDescription = sourceSchema.properties.claims.items.properties.evidenceExcerpt.description;
      expect(sourceEvidenceDescription).toContain("verbatim");
      expect(sourceEvidenceDescription).toContain("canonical extracted text");
      expect(sourceEvidenceDescription).toContain("paraphrase");
      expect(sourceEvidenceDescription).toContain("synthesize");
      expect(claimEvidenceDescription).toContain("verbatim");
      expect(claimEvidenceDescription).toContain("canonical extracted text");
    }
  });

  it("does not attach web search to Generation after a verified preflight bundle exists", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return {
        ok: true,
        json: async () => ({
          id: "response-generation",
          model: "gpt-5-test",
          status: "completed",
          output_text: "{\"title\":\"사전검증 출처 기반 원고\"}",
          output: [],
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIProvider("sk-test-key", "gpt-5-test", 5_000).generate({
      instruction: "사전검증된 출처 범위 안에서 작성하세요.",
      metadata: {
        task: "content-generation",
        contentType: "article",
        approvalPurpose: "adsense_approval",
        approvalProfileId: "wordpress_life_economy_v1",
        approvalEvidenceMode: "preflight_verified",
      },
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(new TextDecoder().decode(request?.body as Uint8Array)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("include");
  });

  it("does not use web search for standard generation", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      void args;
      return {
        ok: true,
        json: async () => ({
          id: "response-2",
          model: "gpt-5-test",
          status: "completed",
          output_text: "{\"title\":\"일반 원고\"}",
          output: [],
        }),
      } as Response;
    });
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
