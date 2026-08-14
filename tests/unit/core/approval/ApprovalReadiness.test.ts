import { describe, expect, it } from "vitest";

import {
  evaluateApprovalReadiness,
  resolveApprovalPolicySnapshot,
  type ApprovalDuplicateCheckSnapshot,
  type ApprovalEvidencePack,
  type SiteApprovalReadinessSnapshot,
} from "../../../../core/approval";
import type { ContentDocument, ContentMetadata } from "../../../../core/content";

const evidence: ApprovalEvidencePack = Object.freeze({
  version: "1.0",
  status: "verified",
  reviewedAt: "2026-07-27T00:00:00.000Z",
  sources: Object.freeze([Object.freeze({
    sourceId: "museum-1",
    url: "https://www.moma.org/collection/works/79802",
    title: "The Starry Night",
    publisher: "The Museum of Modern Art",
    sourceType: "official_institution",
    retrievedAt: "2026-07-27T00:00:00.000Z",
    verified: true,
    facts: Object.freeze([Object.freeze({ field: "holdingInstitution", value: "The Museum of Modern Art" })]),
  })]),
});

const duplicate: ApprovalDuplicateCheckSnapshot = Object.freeze({
  version: "1.0",
  status: "passed",
  checkedAt: "2026-07-27T00:00:00.000Z",
  comparedContentIds: Object.freeze(["content-previous"]),
  highestSimilarity: 0.24,
  reasons: Object.freeze([]),
});

const site: SiteApprovalReadinessSnapshot = Object.freeze({
  version: "1.0",
  status: "passed",
  checkedAt: "2026-07-27T00:00:00.000Z",
  checks: Object.freeze([Object.freeze({ key: "navigation", passed: true, message: "탐색 구조가 정상입니다." })]),
});

function document(metadata: Partial<ContentMetadata> = {}): ContentDocument {
  return {
    id: "content-1",
    title: "별이 빛나는 밤 감상 순서",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-27T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 3,
      source: "test",
      updatedAt: "2026-07-27T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      ...metadata,
    },
    blocks: [
      { id: "h1", type: "heading", level: 2, text: "작품을 보는 순서" },
      // Carries a confirmation path, the ordinary state for an approval article:
      // the policy asks every manuscript to tell the reader where to check.
      { id: "p1", type: "paragraph", text: "소장처 공식 페이지 https://www.moma.org/collection/works/79802 에 따라 화면의 소용돌이와 시선 이동을 차례로 관찰합니다." },
    ],
  };
}

describe("ApprovalReadiness", () => {
  it("keeps a 100-point article separate from application readiness", () => {
    const report = evaluateApprovalReadiness(document(), [], true);

    expect(report.applicationReady).toBe(false);
    expect(report.status).toBe("needs_review");
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "standard_quality", status: "passed" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "not_evaluated" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "duplicate", status: "not_evaluated" }));
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "site_readiness", status: "not_evaluated" }));
  });

  it("passes internal links when the catalog was evaluated and no eligible candidate exists", () => {
    const report = evaluateApprovalReadiness(document({
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "internal_links",
      status: "passed",
      message: expect.stringContaining("기존 공개 글 후보가 없어"),
    }));
  });

  it("does not block internal links when no existing candidate is available", () => {
    const report = evaluateApprovalReadiness(document({
      internalLinkCatalogStatus: "category_missing",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.checks).toContainEqual(expect.objectContaining({ key: "internal_links", status: "passed" }));
  });

  it("blocks internal links when candidates exist but no link was placed", () => {
    const report = evaluateApprovalReadiness(document({
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 1,
    }), [], true);

    expect(report.status).toBe("blocked");
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "internal_links", status: "blocked" }));
  });

  it("accepts verified core sources while preserving rejected candidate diagnostics", () => {
    const mixedEvidence: ApprovalEvidencePack = {
      ...evidence,
      sources: [
        evidence.sources[0]!,
        {
          sourceId: "museum-duplicate",
          url: "https://www.moma.org/collection/works/79802?utm_source=openai",
          title: "The Starry Night",
          publisher: "www.moma.org",
          sourceType: "official_institution",
          retrievedAt: "2026-07-27T00:00:00.000Z",
          verified: false,
          facts: [],
          selected: false,
          verificationStatus: "duplicate_source",
          failureReason: "동일한 canonical 출처입니다.",
        },
      ],
    };
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: mixedEvidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
  });

  it("does not block application readiness when only a recommended site item is missing", () => {
    const siteWithRecommendation: SiteApprovalReadinessSnapshot = {
      version: "1.0",
      status: "passed",
      checkedAt: "2026-07-27T00:00:00.000Z",
      checks: [
        { key: "privacy", passed: true, message: "개인정보처리방침을 확인했습니다." },
        { key: "about_contact", passed: false, message: "권장: 소개 페이지가 없습니다.", requirement: "recommended" },
      ],
    };
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: evidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: siteWithRecommendation,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "site_readiness",
      status: "passed",
      message: expect.stringContaining("권장 보완 항목 1개"),
    }));
  });

  it("marks the site application-ready only after every independent gate passes", () => {
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: evidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true);

    expect(report.applicationReady).toBe(true);
    expect(report.status).toBe("ready");
    expect(report.checks.every((check) => check.status === "passed")).toBe(true);
  });

  it("does not require official evidence when explicit verification is not required", () => {
    const report = evaluateApprovalReadiness(document({
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, false);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "evidence",
      status: "passed",
      applicable: false,
    }));
  });

  it("does not let a stale legacy Evidence diagnostic block a now non-applicable check", () => {
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: {
        version: "1.0",
        status: "missing",
        coverageStatus: "missing",
        presentationStatus: "conflict",
        presentationReasons: ["legacy conflict"],
        sources: [],
      },
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, false);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "evidence",
      status: "passed",
      applicable: false,
    }));
  });

  it("requires official evidence when explicit verification is required", () => {
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: { ...evidence, status: "missing", sources: [] },
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, true);

    expect(report.applicationReady).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "blocked" }));
  });

  it("passes required official evidence when a verified HTTPS source is present", () => {
    const report = evaluateApprovalReadiness(document({
      approvalEvidence: evidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, true);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
  });

  it("does not let an approval profile create Evidence applicability", () => {
    const policy = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    const report = evaluateApprovalReadiness(document({
      approvalPolicy: policy,
      approvalEvidence: { version: "1.0", status: "missing", sources: [] },
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, false);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({
      key: "evidence",
      status: "passed",
      applicable: false,
    }));
  });

  it("passes mandatory Evidence from complete Claim coverage", () => {
    const policy = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    const coveredEvidence: ApprovalEvidencePack = {
      ...evidence,
      coverageStatus: "verified",
      requiredFactFields: ["eligibility", "amount", "schedule"],
      verifiedFactFields: ["eligibility", "amount", "schedule"],
      unverifiedFactFields: [],
    };
    const report = evaluateApprovalReadiness(document({
      approvalPolicy: policy,
      approvalEvidence: coveredEvidence,
      approvalDuplicateCheck: duplicate,
      siteApprovalReadiness: site,
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    }), [], true, true);

    expect(report.applicationReady).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
  });

  /**
   * Reproduces `content-msrfq4gt-fc8ub1`: every scored dimension is 100, yet the
   * manuscript is blocked by task-level rules. The readiness card used to say
   * only "기본 품질 승인을 통과하지 못했습니다", which named nothing the user
   * could act on and could not be reconciled with the 100 shown beside it.
   */
  describe("standard quality blocking reasons", () => {
    it("names the blocking tasks instead of only reporting that quality failed", () => {
      const report = evaluateApprovalReadiness(document(), [], false, true, false, [
        "CONTENT_SECTION_PROSE_INSUFFICIENT: 국민연금 예상수령액 조회 방법",
        "CONTENT_SECTION_PROSE_INSUFFICIENT: 국민연금 예상연금액과 실제 지급 판단",
      ]);

      const check = report.checks.find((item) => item.key === "standard_quality")!;
      expect(check.status).toBe("blocked");
      expect(check.message).toContain("차단 항목 2개");
      expect(check.action).toContain("CONTENT_SECTION_PROSE_INSUFFICIENT: 국민연금 예상수령액 조회 방법");
      expect(check.action).toContain("CONTENT_SECTION_PROSE_INSUFFICIENT: 국민연금 예상연금액과 실제 지급 판단");
    });

    it("deduplicates repeated blocking tasks", () => {
      const report = evaluateApprovalReadiness(document(), [], false, true, false, [
        "CONTENT_DECLARED_COMPARISON_MISSING",
        " CONTENT_DECLARED_COMPARISON_MISSING ",
      ]);

      expect(report.checks.find((item) => item.key === "standard_quality")?.message)
        .toContain("차단 항목 1개");
    });

    it("keeps the superseded-review diagnosis when the manuscript changed after review", () => {
      const report = evaluateApprovalReadiness(document(), [], false, true, true, ["stale reason"]);

      const check = report.checks.find((item) => item.key === "standard_quality")!;
      expect(check.message).toContain("마지막 품질 검토 이후");
      expect(check.action).toContain("품질 검토를 다시 실행");
    });

    it("says nothing extra when no blocking task was supplied", () => {
      const report = evaluateApprovalReadiness(document(), [], false);

      expect(report.checks.find((item) => item.key === "standard_quality")?.action)
        .toBe("원고 품질 진단을 반영한 뒤 다시 검토하세요.");
    });
  });

  /**
   * The Evidence card must exist even when no mandatory Claim applies. Measured
   * on the 밝은재테크 corpus, 8 of 16 approval manuscripts land in this branch,
   * and several of them had sentences withdrawn from the published article
   * because their source anchor failed — none of which was reported anywhere.
   */
  describe("non-mandatory Evidence reporting", () => {
    const withdrawnInventory = {
      schemaVersion: 1 as const,
      items: [{
        claimId: "verification-claim-3e32537e",
        origin: "generation" as const,
        risk: "verify" as const,
        surfaceText: "국민연금 예상수령액은 2028년부터 12% 인상됩니다.",
        statement: "국민연금 예상수령액은 2028년부터 12% 인상된다.",
        kind: "ratio" as const,
        normalizedValueJson: "{}",
        qualifiers: {},
        locations: [],
        disposition: "removed" as const,
        evidenceStatus: "unsupported" as const,
        diagnosticCode: "verify_evidence_anchor_unverified",
      }],
      retainedClaimIds: [],
      removedClaimCount: 1,
    };

    it("stays a represented check rather than an absent one", () => {
      const report = evaluateApprovalReadiness(document(), [], true, false);

      const check = report.checks.find((item) => item.key === "evidence")!;
      expect(check.applicable).toBe(false);
      expect(check.status).toBe("passed");
      expect(check.action).toContain("필수(CRITICAL) Claim");
    });

    it("reports the sentences that were withdrawn because their source failed", () => {
      const report = evaluateApprovalReadiness(document({
        generatedFactualClaimInventory: withdrawnInventory,
      }), [], true, false);

      const check = report.checks.find((item) => item.key === "evidence")!;
      expect(check.message).toContain("원고에서 제외된 문장 1개");
      expect(check.action).toContain("국민연금 예상수령액은 2028년부터 12% 인상된다.");
    });

    it("refuses to call an article application-ready after sentences were withdrawn from it", () => {
      const report = evaluateApprovalReadiness(document({
        generatedFactualClaimInventory: withdrawnInventory,
      }), [], true, false);

      // Reporting "sentences were dropped" and "ready to apply" in the same
      // snapshot is the aggregate contradicting itself. It is not `blocked`:
      // no policy rule was broken, but a person has to confirm the manuscript
      // still says what it promises without the withdrawn sentences.
      const check = report.checks.find((item) => item.key === "evidence")!;
      expect(check.status).toBe("needs_review");
      expect(report.applicationReady).toBe(false);
      expect(report.status).toBe("needs_review");
    });

    function withBody(text: string): ContentDocument {
      const base = document();
      return { ...base, blocks: [base.blocks[0]!, { id: "p1", type: "paragraph", text }] };
    }

    it("reports an article that gives the reader no way to check anything", () => {
      // The policy asks the body to carry a route back to the source material,
      // and that duty does not disappear because no Claim was mandatory.
      const check = evaluateApprovalReadiness(withBody("화면의 소용돌이와 시선 이동을 차례로 관찰합니다."), [], true, false)
        .checks.find((item) => item.key === "evidence")!;
      expect(check.status).toBe("needs_review");
      expect(check.message).toContain("확인할 경로 표시 없음");
      expect(check.action).toContain("상품설명서");
    });

    it("accepts a named official document when no institutional page exists to link", () => {
      const check = evaluateApprovalReadiness(
        withBody("계약의 상품설명서와 대출거래약정서에 적힌 조건으로 확인하세요."), [], true, false,
      ).checks.find((item) => item.key === "evidence")!;
      expect(check.status).toBe("passed");
      expect(check.message).not.toContain("확인할 경로 표시 없음");
    });

    it("does not report a withdrawal whose text is still published", () => {
      const published = document({
        generatedFactualClaimInventory: {
          ...withdrawnInventory,
          items: [{ ...withdrawnInventory.items[0]!, surfaceText: "작품을 보는 순서" }],
        },
      });

      const check = evaluateApprovalReadiness(published, [], true, false)
        .checks.find((item) => item.key === "evidence")!;
      expect(check.message).not.toContain("제외된 문장");
    });

    it("never lets a non-mandatory Evidence check mask a required one", () => {
      const report = evaluateApprovalReadiness(document({
        approvalEvidence: { ...evidence, status: "missing", sources: [] },
        approvalDuplicateCheck: duplicate,
        siteApprovalReadiness: site,
        internalLinkCatalogStatus: "evaluated",
        availableRelatedContentCandidates: 0,
        generatedFactualClaimInventory: withdrawnInventory,
      }), [], true, true);

      const check = report.checks.find((item) => item.key === "evidence")!;
      expect(check.status).toBe("blocked");
      expect(check.applicable).toBeUndefined();
      expect(report.applicationReady).toBe(false);
    });
  });
});
