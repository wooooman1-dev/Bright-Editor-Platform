import { describe, expect, it } from "vitest";

import {
  canonicalizeApprovalEvidenceUrl,
  extractApprovalCitationFacts,
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
    provenance: "citation",
    cited: true,
    selected: true,
    linkedBlockIds: ["p"],
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
    expect(result.pack.sources[0]?.matchedFacts?.map((fact) => fact.value)).toEqual(expect.arrayContaining([
      "The Starry Night",
      "1889년",
      "The Museum of Modern Art",
    ]));
    expect(result.verifiedSourceCount).toBe(1);
  });

  it("matches only the institution, artwork, and artist attached to the current source URL", () => {
    const ngaUrl = "https://www.nga.gov/artworks/1167-portrait-man";
    const trackingNgaUrl = `${ngaUrl}?utm_source=openai`;
    const metUrl = "https://www.metmuseum.org/perspectives/portraits";
    const pack: ApprovalEvidencePack = {
      ...candidatePack,
      sources: [{
        ...candidatePack.sources[0]!,
        sourceId: "nga-1167",
        url: trackingNgaUrl,
        title: "www.nga.gov",
        publisher: "www.nga.gov",
      }],
    };
    const citationDocument: ContentDocument = {
      ...document(),
      title: "서양미술 초상화 감상법",
      metadata: { ...document().metadata!, approvalEvidence: pack },
      blocks: [
        { id: "body", type: "paragraph", text: "미국 국립미술관의 프란스 할스 작품 설명은 손과 몸의 방향을 기록합니다." },
        {
          id: "sources",
          type: "paragraph",
          text: [
            `- National Gallery of Art, Portrait of a Man by Frans Hals: ${trackingNgaUrl}`,
            `- The Metropolitan Museum of Art, What Makes a Portrait?: ${metUrl}`,
            "정보 확인일: 2026년 7월 28일",
          ].join("\n"),
        },
      ],
    };
    const ngaPage: ApprovalSourcePage = {
      requestedUrl: ngaUrl,
      finalUrl: ngaUrl,
      status: 200,
      contentType: "text/html; normalized-from=text/csv",
      title: "Portrait of a Man",
      publisher: "National Gallery of Art Open Data",
      text: "Title: Portrait of a Man Artist: Frans Hals Institution: National Gallery of Art Official Open Data collection record. ".repeat(4),
    };

    expect(extractApprovalCitationFacts(citationDocument, ngaUrl)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "holdingInstitution", value: "National Gallery of Art" }),
      expect.objectContaining({ field: "artworkTitle", value: "Portrait of a Man" }),
      expect.objectContaining({ field: "artist", value: "Frans Hals" }),
    ]));

    const result = verifyApprovalEvidence(
      citationDocument,
      "tistory_vivarain_art_v1",
      [ngaPage],
      "2026-07-28T10:00:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.verifiedSourceCount).toBe(1);
    expect(result.pack.sources[0]).toMatchObject({
      verified: true,
      verificationStatus: "verified",
      selected: true,
    });
    expect(result.pack.sources[0]?.matchedFacts?.map((fact) => fact.value)).toEqual(expect.arrayContaining([
      "National Gallery of Art",
      "Portrait of a Man",
      "Frans Hals",
    ]));
    expect(result.pack.sources[0]?.matchedFacts?.map((fact) => fact.value)).not.toContain("The Metropolitan Museum of Art");
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

  it("keeps a user-generated blog in review until another source corroborates the facts", () => {
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
    expect(result.pack.sources[0]?.verificationStatus).toBe("needs_corroboration");
    expect(result.reasons[0]).toContain("Claim 검증이 완료되지 않았습니다");
  });

  it("verifies matching non-official sources after independent corroboration", () => {
    const firstPage = {
      ...officialPage,
      requestedUrl: "https://example.tistory.com/entry/starry-night",
      finalUrl: "https://example.tistory.com/entry/starry-night",
      publisher: "example.tistory.com",
    };
    const secondPage = {
      ...officialPage,
      requestedUrl: "https://example.com/starry-night-reference",
      finalUrl: "https://example.com/starry-night-reference",
      publisher: "example.com",
    };
    const pack: ApprovalEvidencePack = {
      ...candidatePack,
      sources: [
        { ...candidatePack.sources[0]!, url: firstPage.requestedUrl },
        { ...candidatePack.sources[0]!, sourceId: "source-2", url: secondPage.requestedUrl },
      ],
    };
    const result = verifyApprovalEvidence(
      { ...document(), metadata: { ...document().metadata!, approvalEvidence: pack } },
      "tistory_vivarain_art_v1",
      [firstPage, secondPage],
      "2026-07-27T10:00:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.pack.sources.every((source) => source.verified)).toBe(true);
    expect(result.pack.sources.every((source) => source.trustRoute === "external_corroborated")).toBe(true);
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

  it("accepts an unseen public-sector domain with extracted publisher identity without broadening to arbitrary sites", () => {
    expect(officialSourceAllowed("wordpress_life_economy_v1", {
      ...officialPage,
      requestedUrl: "https://future-agency.gov/notice/2026",
      finalUrl: "https://future-agency.gov/notice/2026",
      publisher: "Future Agency",
    })).toBe(true);
    expect(officialSourceAllowed("wordpress_life_economy_v1", {
      ...officialPage,
      requestedUrl: "https://future-agency.example/notice/2026",
      finalUrl: "https://future-agency.example/notice/2026",
      publisher: "Future Agency",
    })).toBe(false);
  });

  it("verifies the three linked continuing-transaction Claims without treating HTTP 200 and an official host as sufficient", () => {
    const lawUrl = "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
    const claimText = "계속거래 등에 관한 계약에서는 사업자가 계약 내용을 적은 계약서를 소비자에게 발급해야 하며, 해지·해제로 생기는 손실을 현저히 초과하는 위약금을 청구하거나 실제 공급분을 초과해 받은 대금의 환급을 부당하게 거부해서는 안 된다는 기준이 규정되어 있습니다. (law.go.kr)";
    const lawDocument: ContentDocument = {
      ...document(),
      title: "고정지출 줄이는 방법",
      metadata: {
        ...document().metadata!,
        approvalEvidence: {
          version: "1.0",
          status: "needs_review",
          sources: [{
            sourceId: "law-article",
            url: lawUrl,
            canonicalUrl: lawUrl,
            title: "국가법령정보센터 | 조문정보",
            publisher: "law.go.kr",
            sourceType: "official_law",
            retrievedAt: "2026-08-01T00:00:00.000Z",
            verified: false,
            provenance: "citation",
            cited: true,
            selected: true,
            citationExcerpt: `([law.go.kr](${lawUrl}?utm_source=openai))`,
            linkedBlockIds: ["source"],
            facts: [],
          }],
        },
      },
      blocks: [
        { id: "claim", type: "paragraph", text: claimText },
        { id: "source", type: "paragraph", text: `정보 기준일은 2026년 8월 1일입니다.\n출처: https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501` },
      ],
    };
    const officialButUnrelated: ApprovalSourcePage = {
      requestedUrl: lawUrl,
      finalUrl: lawUrl,
      status: 200,
      contentType: "text/html;charset=UTF-8",
      title: "국가법령정보센터 | 조문정보",
      publisher: "law.go.kr",
      text: "국가법령정보센터의 다른 법령 조문입니다. 직접 연결된 계속거래 계약·위약금·환급 근거를 포함하지 않습니다. ".repeat(8),
    };

    const mismatch = verifyApprovalEvidence(lawDocument, "wordpress_life_economy_v1", [officialButUnrelated], "2026-08-01T01:00:00.000Z");
    expect(mismatch.pack.status).toBe("needs_review");
    expect(mismatch.pack.sources[0]).toMatchObject({
      accessVerificationStatus: "verified",
      officialDomainVerificationStatus: "verified",
      claimVerificationStatus: "failed",
      verified: false,
    });

    const verified = verifyApprovalEvidence(lawDocument, "wordpress_life_economy_v1", [{
      ...officialButUnrelated,
      text: "방문판매 등에 관한 법률 제30조에 따라 계속거래업자는 계약서를 소비자에게 발급하여야 한다. 제32조는 손실을 현저하게 초과하는 위약금 청구를 금지하고, 실제 공급된 재화등의 대가를 초과해 수령한 대금의 환급을 부당하게 거부하지 못하도록 한다. ".repeat(4),
    }], "2026-08-01T02:00:00.000Z");

    expect(verified.pack.status).toBe("verified");
    expect(verified.pack.sources[0]).toMatchObject({
      title: "방문판매 등에 관한 법률 제30조·제32조",
      publisher: "국가법령정보센터",
      accessVerificationStatus: "verified",
      officialDomainVerificationStatus: "verified",
      claimVerificationStatus: "verified",
      checkedAt: "2026-08-01T02:00:00.000Z",
      linkedBlockIds: expect.arrayContaining(["claim", "source"]),
    });
    expect(verified.pack.sources[0]?.matchedFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "continuingTransactionContractDocument", blockId: "claim", excerpt: claimText }),
      expect.objectContaining({ field: "excessiveTerminationPenalty", blockId: "claim" }),
      expect.objectContaining({ field: "excessPaymentRefund", blockId: "claim" }),
    ]));
  });
});
