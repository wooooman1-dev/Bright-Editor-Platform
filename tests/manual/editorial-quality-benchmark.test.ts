import { mkdir, readFile, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const benchmark = vi.hoisted(() => ({ subjectIndex: 0 }));
const actualCatalog = process.env.RUN_EDITORIAL_BENCHMARK === "1" && process.env.BENCHMARK_CATALOG_PATH
  ? (JSON.parse(await readFile(process.env.BENCHMARK_CATALOG_PATH, "utf8")) as { posts?: Array<{ externalPostId: string; title: string; publishedUrl: string; categoryName?: string; keywords?: string[] }>; retrievedAt?: string; state?: string })
  : { posts: [], retrievedAt: "", state: "success" };

const subjects = [
  {
    id: "polypharmacy",
    primaryKeyword: "노인 다중약물복용 관리",
    searchIntent: "노인 다중약물복용의 위험 신호를 구분하고, 약 정리와 병원 상담을 준비할 수 있는 실행 지침을 찾는다.",
    keywords: ["노인 다중약물복용 관리", "다중약물복용 위험 신호", "약 정리 방법", "병원 상담 질문", "복약 기록표"],
    editorialContext: "노인 다중약물복용 관리에 관해 위험 신호, 약 정리 방법, 병원 상담 질문, 실제로 옮겨 적어 쓸 수 있는 복약 기록표를 모두 포함한 건강정보 글을 작성한다.",
    requiredInformation: ["다중약물복용의 의미", "위험이 커지는 상황", "즉시 확인해야 할 위험 신호", "복용 중인 약 정리 방법", "처방약·일반약·건강기능식품 함께 기록", "병원 또는 약국에 가져갈 정보", "상담 시 질문 목록", "임의 중단 금지", "복약 기록표 또는 작성 예시", "가족·보호자가 도울 수 있는 방법", "응급 상황과 일반 상담 상황 구분", "실제 실행 체크리스트", "결론의 행동 요약"],
  },
  {
    id: "morning-exercise",
    primaryKeyword: "50대 초보자 15분 아침 운동",
    searchIntent: "무릎 부담을 낮추면서 아침 15분 동안 안전하게 따라 할 초보 운동 순서와 주간 계획을 찾는다.",
    keywords: ["50대 초보자 15분 아침 운동", "무릎 부담 적은 운동", "아침 워밍업", "저강도 유산소", "초보 근력운동"],
    editorialContext: "50대 초보자를 위한 무릎 부담이 적은 15분 아침 운동 글을 작성한다. 워밍업, 관절 가동, 저강도 유산소, 근력운동, 주의사항, 주간 계획을 모두 포함한다.",
    requiredInformation: ["대상 독자", "운동 전 확인사항", "통증과 불편감 구분", "워밍업", "관절 가동", "저강도 유산소", "근력 동작", "쿨다운", "동작별 시간 또는 반복 기준", "쉬운 변형", "중단해야 할 신호", "무릎 상태에 따른 대체 동작", "1주 실행 계획", "꾸준히 실천하는 방법", "실제 15분 시간표", "결론의 실행 요약"],
  },
  {
    id: "summer-electricity",
    primaryKeyword: "여름철 전기요금 줄이는 방법",
    searchIntent: "가정에서 여름 전기요금을 현실적으로 줄이기 위해 에어컨, 대기전력, 누진구간을 이해하고 가구별로 점검할 방법을 찾는다.",
    keywords: ["여름철 전기요금 줄이는 방법", "에어컨 전기요금 절약", "대기전력", "전기요금 누진구간", "가구별 절약 체크리스트"],
    editorialContext: "여름철 전기요금을 줄이는 현실적인 방법을 설명한다. 에어컨 사용법, 대기전력, 누진구간, 1인·맞벌이·자녀·고령자 가구별 체크리스트를 모두 포함한다. 확인되지 않은 요금이나 절감률은 만들지 않는다.",
    requiredInformation: ["전기요금이 늘어나는 주요 원인", "누진구간을 이해하기 쉬운 방식으로 설명", "에어컨 설정온도와 운전 방식", "제습·냉방의 사용 판단", "선풍기 병행", "필터와 실외기 관리", "대기전력", "냉장고·세탁기·건조기 등 주요 가전", "가구 유형별 실천법", "비용 없이 바로 할 수 있는 방법", "비용이 필요한 개선 방법", "흔한 오해", "월간 체크리스트", "결론의 우선순위 요약"],
  },
] as const;

vi.mock("../../app/application/studio-store", () => ({
  studioStore: {
    get: vi.fn(async () => {
      const subject = subjects[benchmark.subjectIndex];
      return {
        workspace: { id: "benchmark-workspace", name: "Benchmark", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
        brands: [],
        projects: [{ id: "benchmark-project", workspaceId: "benchmark-workspace", name: "Editorial Benchmark", description: "isolated", createdAt: "benchmark", updatedAt: "benchmark" }],
        contents: [{
          id: `benchmark-${subject.id}`,
          workspaceId: "benchmark-workspace",
          projectId: "benchmark-project",
          title: subject.primaryKeyword,
          body: "",
          status: "planning",
          primaryKeyword: subject.primaryKeyword,
          relatedKeywords: subject.keywords.slice(1),
          searchIntent: subject.searchIntent,
          platform: "tistory",
          contentType: "Google SEO 장문 블로그",
          publishingAccountId: "benchmark-connection",
          publishingPreparation: { tistory: { platformCategoryId: "benchmark-category", platformCategoryName: benchmark.subjectIndex === 1 ? "건강운동" : benchmark.subjectIndex === 2 ? "도움되는 정보" : "건강정보" } },
          createdAt: "benchmark",
          updatedAt: "benchmark",
        }],
        qualityReports: [],
      };
    }),
    set: vi.fn(async () => undefined),
  },
}));

vi.mock("../../app/application/connections/connection-runtime", () => ({
  connectionRepository: { findById: vi.fn(async () => ({ id: "benchmark-connection", workspaceId: "benchmark-workspace", platform: "tistory", displayName: "Benchmark", status: "connected", permissions: ["post.read"], publicMetadata: { sessionStateAvailable: true, blogId: "benchmark-bright" }, createdAt: "benchmark", updatedAt: "benchmark" })) },
  targetRepository: { listByProject: vi.fn(async () => [{ id: "benchmark-target", projectId: "benchmark-project", platformConnectionId: "benchmark-connection" }]) },
}));

vi.mock("../../app/application/publishing/TistoryPostCatalogApplicationService", () => ({
  TistoryPostCatalogApplicationService: class {
    async read() { return { cached: true, posts: actualCatalog.posts ?? [], retrievedAt: actualCatalog.retrievedAt ?? "", state: actualCatalog.state ?? "success" }; }
  },
}));

import { POST } from "../../app/api/studio/route";

type Usage = { input_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens?: number; total_tokens?: number };
type CallMetric = { latencyMs: number; model: string; usage: Usage };

const pricing: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, cached: 0.025, output: 2 },
  "gpt-5.6-luna": { input: 1, cached: 0.1, output: 6 },
  "gpt-5.6-terra": { input: 2.5, cached: 0.25, output: 15 },
};

const combinations = [
  { id: "mini-terra", generationModel: "gpt-5-mini", reviewModel: "gpt-5.6-terra" },
  { id: "luna-terra", generationModel: "gpt-5.6-luna", reviewModel: "gpt-5.6-terra" },
  { id: "terra-terra", generationModel: "gpt-5.6-terra", reviewModel: "gpt-5.6-terra" },
] as const;

describe.runIf(process.env.RUN_EDITORIAL_BENCHMARK === "1")("isolated Sprint 5 editorial quality benchmark", () => {
  const originalFetch = globalThis.fetch;
  const calls: CallMetric[] = [];
  const results: unknown[] = [];

  beforeAll(() => {
    vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "600000");
    vi.stubEnv("OPENAI_REVIEW_TIMEOUT_MS", "600000");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const startedAt = performance.now();
      const response = await originalFetch(input, init);
      const latencyMs = Math.round(performance.now() - startedAt);
      const requestBody = init?.body instanceof Uint8Array ? JSON.parse(new TextDecoder().decode(init.body)) as { model?: string } : {};
      const payload = await response.clone().json().catch(() => ({})) as { usage?: Usage };
      calls.push({ latencyMs, model: requestBody.model ?? "unknown", usage: payload.usage ?? {} });
      return response;
    });
  });

  afterAll(async () => {
    await mkdir(".bright-studio/benchmarks", { recursive: true });
    await writeFile(".bright-studio/benchmarks/sprint5-editorial-benchmark.json", JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  for (const combination of combinations.filter((item) => !process.env.BENCHMARK_COMBINATION || item.id === process.env.BENCHMARK_COMBINATION)) {
    for (const [subjectIndex, subject] of subjects.entries().filter(([, item]) => !process.env.BENCHMARK_SUBJECT || item.id === process.env.BENCHMARK_SUBJECT)) {
      it(`${combination.id}: ${subject.id}`, async () => {
        benchmark.subjectIndex = subjectIndex;
        vi.stubEnv("OPENAI_GENERATION_MODEL", combination.generationModel);
        vi.stubEnv("OPENAI_REVIEW_MODEL", combination.reviewModel);
        const callStart = calls.length;
        const response = await POST(new Request("http://localhost/api/studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate", input: {
            workspaceId: "benchmark-workspace",
            projectId: "benchmark-project",
            contentId: `benchmark-${subject.id}`,
            contentType: "Google SEO 장문 블로그",
            platform: "tistory",
            keywords: subject.keywords,
            editorialContext: `${subject.editorialContext}\n필수 정보: ${subject.requiredInformation.join(" | ")}`,
          } }),
        }));
        const result = await response.json() as { aiReviewError?: string; attemptHistory?: Array<{ accepted: boolean; phase: string; quality: BenchmarkQuality; rejectionReason?: string }>; document?: BenchmarkDocument; quality?: BenchmarkQuality; initialQuality?: BenchmarkQuality; qualityHistory?: BenchmarkQuality[]; reachedTarget?: boolean };
        const caseCalls = calls.slice(callStart);
        if (response.status !== 200 || result.aiReviewError || !result.document || !result.quality || !result.initialQuality) {
          console.log(`BENCHMARK_FAILURE ${JSON.stringify({ combination, subject: subject.id, status: response.status, error: result.aiReviewError ?? "generation_or_route_failed", calls: caseCalls })}`);
        }
        expect(response.status).toBe(200);
        expect(caseCalls.length).toBeGreaterThanOrEqual(2);
        expect(caseCalls.length).toBeLessThanOrEqual(5);
        expect(result.aiReviewError).toBeUndefined();
        expect(result.document).toBeDefined();
        expect(result.quality).toBeDefined();
        const links = result.document!.blocks.filter((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post") && block.targetUrl);
        expect(links.filter((block) => block.purpose === "internal_link")).toHaveLength(1);
        expect(links.filter((block) => block.purpose === "related_post").length).toBeLessThanOrEqual(3);
        expect(links.every((block) => actualCatalog.posts!.some((post) => post.title === block.label && post.publishedUrl === block.targetUrl))).toBe(true);
        expect(new Set(links.map((block) => block.targetUrl)).size).toBe(links.length);
        const metrics = analyze(result.document!, result.quality!, result.initialQuality!, caseCalls);
        const benchmarkResult = { combination, subject: subject.id, catalogPostCount: actualCatalog.posts!.length, catalogRetrievedAt: actualCatalog.retrievedAt, qualityHistory: result.qualityHistory, attemptHistory: result.attemptHistory, reachedTarget: result.reachedTarget, selectedLinks: links, ...metrics, document: result.document };
        results.push(benchmarkResult);
        console.log(`BENCHMARK_RESULT ${JSON.stringify({ combination, subject: subject.id, ...metrics })}`);
      }, 1_300_000);
    }
  }
});

type BenchmarkBlock = { type: string; level?: number; text?: string; purpose?: string; label?: string; target?: string; targetUrl?: string };
type BenchmarkDocument = { title: string; metadata?: { metaDescription?: string }; blocks: BenchmarkBlock[] };
type BenchmarkQuality = { overallScore: number; approved: boolean; dimensions: Array<{ category: string; score: number }>; tasks: Array<{ category: string; message: string }> };

function analyze(document: BenchmarkDocument, quality: BenchmarkQuality, initialQuality: BenchmarkQuality, calls: CallMetric[]) {
  const paragraphs = document.blocks.filter((block) => block.type === "paragraph" && block.text).map((block) => block.text!);
  const headings = document.blocks.filter((block) => block.type === "heading");
  const allProse = paragraphs.join("\n");
  const sentences = allProse.split(/(?<=[.!?。])\s+/).map(normalize).filter((item) => item.length >= 12);
  const sentenceCounts = new Map<string, number>();
  for (const sentence of sentences) sentenceCounts.set(sentence, (sentenceCounts.get(sentence) ?? 0) + 1);
  const repeatedSentences = [...sentenceCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
  const sectionLengths = h2SectionLengths(document.blocks);
  const intro = paragraphs[0] ?? "";
  const conclusion = paragraphs.at(-1) ?? "";
  const phaseCost = calls.map((call) => cost(call.usage, pricing[call.model]));
  return {
    title: document.title,
    chars: allProse.length,
    charsNoWhitespace: allProse.replace(/\s/g, "").length,
    h2: headings.filter((heading) => heading.level === 2).length,
    h3: headings.filter((heading) => heading.level === 3).length,
    h2SectionChars: sectionLengths,
    paragraphCount: paragraphs.length,
    averageParagraphChars: Math.round(allProse.length / Math.max(1, paragraphs.length)),
    qualityBefore: initialQuality.overallScore,
    qualityAfter: quality.overallScore,
    approved: quality.approved,
    dimensions: Object.fromEntries(quality.dimensions.map((item) => [item.category, item.score])),
    remainingTasks: quality.tasks.map((task) => `${task.category}: ${task.message}`),
    repeatedSentences,
    clicheCount: countMatches(allProse, [/알아보겠습니다/g, /중요합니다/g, /도움이 됩니다/g, /살펴보겠습니다/g]),
    fabricatedExperienceCount: countMatches(allProse, [/제가 직접/g, /제가 해보/g, /사용해 보니/g, /경험상/g]),
    unsupportedNumberSignals: countMatches(allProse, [/\d+(?:\.\d+)?\s*%/g, /\d+\s*명 중/g, /\d+(?:\.\d+)?\s*배/g, /연구에 따르면/g]),
    actionableSignals: countMatches(allProse, [/체크리스트/g, /기록표/g, /단계/g, /확인하세요/g, /준비하세요/g, /실천/g]),
    cautionSignals: countMatches(allProse, [/주의/g, /위험 신호/g, /진료/g, /상담/g, /중단/g]),
    internalLinks: document.blocks.filter((block) => block.type === "button" && block.purpose === "internal_link" && block.targetUrl).length,
    relatedPosts: document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post" && block.targetUrl).length,
    introSample: sample(intro),
    middleSample: sample(paragraphs[Math.floor(paragraphs.length / 2)] ?? ""),
    conclusionSample: sample(conclusion),
    calls,
    totalLatencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
    generationCostUsd: round(phaseCost[0] ?? 0, 6),
    reviewCostUsd: round(phaseCost[1] ?? 0, 6),
    totalCostUsd: round(phaseCost.reduce((sum, item) => sum + item, 0), 6),
  };
}

function h2SectionLengths(blocks: BenchmarkBlock[]): number[] {
  const starts = blocks.flatMap((block, index) => block.type === "heading" && block.level === 2 ? [index] : []);
  return starts.map((start, index) => blocks.slice(start + 1, starts[index + 1] ?? blocks.length).filter((block) => block.type === "paragraph").reduce((sum, block) => sum + (block.text?.length ?? 0), 0));
}

function cost(usage: Usage, price: { input: number; cached: number; output: number } | undefined): number {
  if (!price) throw new Error("Official pricing is missing for a benchmark model.");
  const input = usage.input_tokens ?? 0;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  return ((input - cached) * price.input + cached * price.cached + (usage.output_tokens ?? 0) * price.output) / 1_000_000;
}

function countMatches(value: string, patterns: RegExp[]): number { return patterns.reduce((sum, pattern) => sum + [...value.matchAll(pattern)].length, 0); }
function normalize(value: string): string { return value.replace(/\s+/g, " ").trim().toLowerCase(); }
function sample(value: string): string { return value.replace(/\s+/g, " ").trim().slice(0, 180); }
function round(value: number, digits: number): number { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
