import { describe, expect, it } from "vitest";

import {
  canonicalizeApprovalEvidenceUrl,
  officialSourceAllowed,
  verifyApprovalEvidence,
  type ApprovalEvidencePack,
  type ApprovalSourcePage,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const sourceUrl = "https://www.moma.org/collection/works/79802";
const candidatePack: ApprovalEvidencePack = {
  version: "1.0",
  status: "needs_review",
  sources: [{
    sourceId: "museum-1",
    url: sourceUrl,
    title: "The Starry Night",
    publisher: "www.moma.org",
    sourceType: "official_institution",
    retrievedAt: "2026-07-27T00:00:00.000Z",
    verified: false,
    facts: [{ field: "citedContext", value: "공식 페이지 후보" }],
  }],
};

function document(): ContentDocument {
  return {
    id: "content-1",
    title: "별이 빛나는 밤 감상 가이드",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-27T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 2,
      source: "test",
      updatedAt: "2026-07-27T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      approvalEvidence: candidatePack,
    },
    blocks: [
      { id: "h", type: "heading", level: 2, text: "작품 기본 정보" },
      { id: "p", type: "paragraph", text: "작품명: The Starry Night\n제작연도: 1889년\n소장처: The Museum of Modern Art" },
    ],
  };
}

const officialPage: ApprovalSourcePage = {
  requestedUrl: sourceUrl,
  finalUrl: sourceUrl,
  status: 200,
  contentType: "text/html; charset=utf-8",
  title: "The Starry Night | MoMA",
  publisher: "The Museum of Modern Art",
  text: "The Starry Night was created in 1889. The Museum of Modern Art collection presents this work and its material information.".repeat(4),
};

describe("ApprovalEvidenceVerification", () => {
  it("verifies a reachable official museum page only when canonical facts also match", () => {
    const result = verifyApprovalEvidence(
      document(),
      "tistory_vivarain_art_v1",
      [officialPage],
      "2026-07-27T10:00:00.000Z",
    );

    expect(result.pack).toMatchObject({
      status: "verified",
      reviewedAt: "2026-07-27T10:00:00.000Z",
      sources: [{ verified: true, publisher: "The Museum of Modern Art", verificationStatus: "verified" }],
    });
    expect(result.pack.sources[0]?.facts.map((fact) => fact.value)).toEqual(expect.arrayContaining([
      "The Starry Night",
      "1889년",
      "The Museum of Modern Art",
    ]));
    expect(result.verifiedSourceCount).toBe(1);
  });

  it("deduplicates tracking variants while preserving the rejected candidate diagnosis", () => {
    const trackingUrl = `${sourceUrl}?utm_source=openai`;
    const pack: ApprovalEvidencePack = {
      ...candidatePack,
      sources: [
        { ...candidatePack.sources[0]!, sourceId: "museum-tracking", url: trackingUrl },
        { ...candidatePack.sources[0]!, sourceId: "museum-canonical", url: sourceUrl },
      ],
    };
    const result = verifyApprovalEvidence(
      { ...document(), metadata: { ...document().metadata!, approvalEvidence: pack } },
      "tistory_vivarain_art_v1",
      [officialPage],
      "2026-07-27T10:00:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.verifiedSourceCount).toBe(1);
    expect(result.rejectedSourceCount).toBe(1);
    expect(result.pack.sources[0]).toMatchObject({ verified: true, canonicalUrl: sourceUrl, selected: true });
    expect(result.pack.sources[1]).toMatchObject({ verified: false, verificationStatus: "duplicate_source", selected: false });
    expect(result.pack.sources[1]?.failureReason).toContain("중복 후보");
  });

  it("normalizes tracking parameters and trailing slashes for candidate identity", () => {
    expect(canonicalizeApprovalEvidenceUrl("https://www.getty.edu/news/what-is-chiaroscuro/?utm_source=openai"))
      .toBe("https://www.getty.edu/news/what-is-chiaroscuro");
  });

  it("records official PDF candidates as unsupported instead of unreachable HTML", () => {
    const pdfUrl = "https://www.nga.gov/content/dam/ngaweb/education/guide.pdf";
    const pack: ApprovalEvidencePack = {
      ...candidatePack,
      sources: [{ ...candidatePack.sources[0]!, sourceId: "nga-pdf", url: pdfUrl }],
    };
    const result = verifyApprovalEvidence(
      { ...document(), metadata: { ...document().metadata!, approvalEvidence: pack } },
      "tistory_vivarain_art_v1",
      [{
        requestedUrl: pdfUrl,
        finalUrl: pdfUrl,
        status: 200,
        contentType: "application/pdf",
        title: "",
        publisher: "www.nga.gov",
        text: "",
      }],
      "2026-07-27T10:00:00.000Z",
    );

    expect(result.pack.status).toBe("needs_review");
    expect(result.pack.sources[0]).toMatchObject({
      verified: false,
      official: true,
      verificationStatus: "unsupported_content_type",
      contentType: "application/pdf",
    });
  });

  it("does not verify a user-generated blog even when the text repeats the article facts", () => {
    const page = {
      ...officialPage,
      requestedUrl: "https://example.tistory.com/entry/starry-night",
      finalUrl: "https://example.tistory.com/entry/starry-night",
      title: "개인 블로그 작품 소개",
      publisher: "example.tistory.com",
    };
    const pack: ApprovalEvidencePack = {
      ...candidatePack,
      sources: [{ ...candidatePack.sources[0]!, url: page.requestedUrl }],
    };
    const result = verifyApprovalEvidence(
      { ...document(), metadata: { ...document().metadata!, approvalEvidence: pack } },
      "tistory_vivarain_art_v1",
      [page],
      "2026-07-27T10:00:00.000Z",
    );

    expect(result.pack.status).toBe("needs_review");
    expect(result.pack.sources[0]?.verified).toBe(false);
    expect(result.pack.sources[0]?.verificationStatus).toBe("unofficial_source");
    expect(result.reasons[0]).toContain("공식 출처로 확인되지 않았습니다");
  });

  it("accepts explicitly trusted Getty pages for the Vivarain art profile", () => {
    expect(officialSourceAllowed("tistory_vivarain_art_v1", {
      ...officialPage,
      requestedUrl: "https://www.getty.edu/news/what-is-chiaroscuro/",
      finalUrl: "https://www.getty.edu/news/what-is-chiaroscuro/",
      title: "What Is Chiaroscuro?",
      publisher: "Getty",
    })).toBe(true);
  });

  it("restricts 생활경제 Evidence to approved public-sector domains", () => {
    expect(officialSourceAllowed("wordpress_life_economy_v1", {
      ...officialPage,
      requestedUrl: "https://www.gov.kr/service/test",
      finalUrl: "https://www.gov.kr/service/test",
    })).toBe(true);
    expect(officialSourceAllowed("wordpress_life_economy_v1", officialPage)).toBe(false);
  });
});
