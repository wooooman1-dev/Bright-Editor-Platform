import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  placeRecommendedPosts,
  rankRelatedPosts,
  type ButtonBlock,
  type ContentDocument,
  type PublicPostCandidate,
} from "../../core/content";
import { contentRevisionId, QualityEngine } from "../../core/quality";

const contexts = {
  polypharmacy: {
    primaryKeyword: "노인 다중약물복용 관리",
    searchIntent: "노인 다중약물복용의 위험 신호를 구분하고, 약 정리와 병원 상담을 준비할 수 있는 실행 지침",
  },
  "morning-exercise": {
    primaryKeyword: "50대 초보자 15분 아침 운동",
    searchIntent: "무릎 부담을 낮추면서 아침 15분 동안 안전하게 따라 할 초보 운동 순서와 주간 계획",
  },
  "summer-electricity": {
    primaryKeyword: "여름철 전기요금 줄이는 방법",
    searchIntent: "가정에서 여름 전기요금을 현실적으로 줄이기 위한 에어컨, 대기전력, 누진구간과 가구별 실천법",
  },
} as const;

describe.runIf(process.env.RUN_CATALOG_REVALIDATION === "1")(
  "saved Sprint 5 manuscripts with current real-catalog ranking",
  () => {
    it("recalculates links and Quality without another AI call", async () => {
      const artifact = JSON.parse(
        await readFile(required(process.env.BENCHMARK_ARTIFACT_PATH), "utf8"),
      ) as {
        results: Array<{
          subject: keyof typeof contexts;
          document: ContentDocument;
        }>;
      };
      const catalog = JSON.parse(
        await readFile(required(process.env.BENCHMARK_CATALOG_PATH), "utf8"),
      ) as { posts: PublicPostCandidate[] };

      const summaries = artifact.results.map((result) => {
        const withoutLinks = {
          ...result.document,
          blocks: result.document.blocks.filter(
            (block) =>
              block.type !== "button" ||
              (block.purpose !== "internal_link" && block.purpose !== "related_post"),
          ),
        };
        const ranked = rankRelatedPosts(
          withoutLinks,
          catalog.posts,
          contexts[result.subject],
        );
        const document = placeRecommendedPosts(withoutLinks, ranked);
        const quality = new QualityEngine().review(document, {
          ...contexts[result.subject],
          contentType: "Google SEO 장문 블로그",
          platform: "tistory",
        });
        const links = document.blocks.filter(
          (block): block is ButtonBlock =>
            block.type === "button" &&
            (block.purpose === "internal_link" || block.purpose === "related_post"),
        );

        expect(quality.reviewedRevisionId).toBe(contentRevisionId(document));
        expect(new Set(links.map((block) => block.targetUrl)).size).toBe(
          links.length,
        );

        return {
          subject: result.subject,
          candidateCount: ranked.length,
          links: links.map((block) => ({
            purpose: block.purpose,
            label: block.label,
            target: block.target,
            url: block.targetUrl,
          })),
          overallScore: quality.overallScore,
          approved: quality.approved,
          dimensions: Object.fromEntries(
            quality.dimensions.map((dimension) => [
              dimension.category,
              dimension.score,
            ]),
          ),
          revisionMatches: true,
        };
      });

      console.log(`CATALOG_REVALIDATION ${JSON.stringify(summaries)}`);
    });
  },
);

function required(value?: string) {
  if (!value) {
    throw new Error("Benchmark artifact and catalog paths are required.");
  }
  return value;
}
