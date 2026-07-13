import type { AIProvider } from "../../core/ai";
import type { ContentPlanningResult } from "../user-flow/user-data";
import type { WorkspacePlatform } from "../user-flow/user-data";

const DISCLOSURE = "Keyword competition and opportunity are AI estimates, not measured search-volume, CPC, or competition data.";

export class ContentPlanningStrategy {
  constructor(private readonly provider: AIProvider) {}

  async analyze(naturalLanguageRequest: string, enabledPlatforms?: readonly WorkspacePlatform[]): Promise<ContentPlanningResult> {
    const request = naturalLanguageRequest.trim();
    if (!request) throw new Error("What would you like to create?");
    const response = await this.provider.generate({
      instruction: `Analyze this content request as an editorial strategist. Do not write the final content and do not invent measured keyword volume, CPC, or competition numbers.
Request: ${request}
Enabled publishing platforms: ${enabledPlatforms ? (enabledPlatforms.join(", ") || "none") : "not restricted"}. ${enabledPlatforms ? "Recommend platforms only from this list." : ""}
Return JSON only with: interpretedIntent, domain, targetAudience, contentGoal, recommendedPrimaryKeyword, keywordCandidates (3-6), searchIntent, recommendedContentType, recommendedPlatforms, suggestedTitleAngles (3-5), relatedKeywords, contentCluster, recommendationReason, confidence (0-1), estimateDisclosure.`,
      metadata: { task: "content-planning" },
    });
    const plan = parsePlanningResult(response.content);
    return enabledPlatforms ? filterPlanningPlatforms(plan, enabledPlatforms) : plan;
  }
}

export function filterPlanningPlatforms(plan: ContentPlanningResult, enabledPlatforms: readonly WorkspacePlatform[]): ContentPlanningResult {
  const allowed = new Set(enabledPlatforms);
  const recommendedPlatforms = plan.recommendedPlatforms.map(normalizePlatform).filter((platform): platform is WorkspacePlatform => platform !== undefined).filter((platform) => allowed.has(platform));
  return Object.freeze({ ...plan, recommendedPlatforms: Object.freeze([...new Set(recommendedPlatforms)]) });
}

export function createManualPlanningResult(request: string): ContentPlanningResult {
  const value = request.trim();
  if (!value) throw new Error("What would you like to create?");
  return Object.freeze({
    interpretedIntent: value, domain: "Not classified", targetAudience: "To be defined by the author",
    contentGoal: "Create a useful draft from the request", recommendedPrimaryKeyword: value,
    keywordCandidates: Object.freeze([value]), searchIntent: "To be confirmed manually", recommendedContentType: "article",
    recommendedPlatforms: Object.freeze([]), suggestedTitleAngles: Object.freeze([value]), relatedKeywords: Object.freeze([]),
    contentCluster: Object.freeze([]), recommendationReason: "Manual planning is active because AI planning is unavailable or was skipped.",
    confidence: 0, estimateDisclosure: DISCLOSURE,
  });
}

export function parsePlanningResult(raw: string): ContentPlanningResult {
  const value = JSON.parse(stripFence(raw)) as Record<string, unknown>;
  const keyword = text(value.recommendedPrimaryKeyword, "recommendedPrimaryKeyword");
  const confidence = typeof value.confidence === "number" ? Math.max(0, Math.min(1, value.confidence)) : 0;
  return Object.freeze({
    interpretedIntent: text(value.interpretedIntent, "interpretedIntent"), domain: text(value.domain, "domain"),
    targetAudience: text(value.targetAudience, "targetAudience"), contentGoal: text(value.contentGoal, "contentGoal"),
    recommendedPrimaryKeyword: keyword, keywordCandidates: list(value.keywordCandidates, [keyword]),
    searchIntent: text(value.searchIntent, "searchIntent"), recommendedContentType: text(value.recommendedContentType, "recommendedContentType"),
    recommendedPlatforms: list(value.recommendedPlatforms), suggestedTitleAngles: list(value.suggestedTitleAngles, [keyword]),
    relatedKeywords: list(value.relatedKeywords), contentCluster: list(value.contentCluster),
    recommendationReason: text(value.recommendationReason, "recommendationReason"), confidence,
    estimateDisclosure: typeof value.estimateDisclosure === "string" && value.estimateDisclosure.trim() ? `${value.estimateDisclosure.trim()} ${DISCLOSURE}` : DISCLOSURE,
  });
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`AI planning response is missing ${name}.`);
  return value.trim();
}
function list(value: unknown, fallback: readonly string[] = []): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([...fallback]);
  const values = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return Object.freeze(values.length ? values : [...fallback]);
}
function stripFence(value: string): string { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
function normalizePlatform(value: string): WorkspacePlatform | undefined {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "tistory" || normalized === "wordpress" || normalized === "youtube" || normalized === "naver_cafe" ? normalized : undefined;
}
