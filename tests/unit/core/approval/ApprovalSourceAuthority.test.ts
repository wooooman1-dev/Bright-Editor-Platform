import { describe, expect, it } from "vitest";
import {
  approvalClaimAuthorityKind,
  evaluateApprovalSourceAuthority,
  evaluateApprovalSourceRelevance,
  type ApprovalSourcePage,
  type VerificationClaimSpec,
} from "../../../../core/approval";
import { createContentOpportunityCandidate, type ContentOpportunityCandidate } from "../../../../core/content";

const profileId = "wordpress_life_economy_v1" as const;

function claim(overrides: Partial<VerificationClaimSpec> = {}): VerificationClaimSpec {
  return {
    claimId: "claim-product-rate",
    atomicity: "single_assertion",
    field: "interestRate",
    kind: "ratio",
    statement: "Alpha Bank Prime Savings product interest rate is 3.5%.",
    rawValue: "3.5%",
    qualifiers: { subject: "Alpha Bank", scope: "Prime Savings product" },
    temporalRequirement: { mode: "current" },
    required: true,
    risk: "critical",
    ...overrides,
  };
}

function page(overrides: Partial<ApprovalSourcePage> = {}): ApprovalSourcePage {
  return {
    requestedUrl: "https://alpha-bank.example/products/prime-savings",
    finalUrl: "https://alpha-bank.example/products/prime-savings",
    status: 200,
    contentType: "text/html",
    title: "Alpha Bank Prime Savings official product page",
    publisher: "Alpha Bank",
    text: "Alpha Bank Prime Savings official product disclosure. The current interest rate is 3.5%. Product terms and early termination conditions apply.",
    documentFormat: "html",
    extractionStatus: "extracted",
    contentLength: 240,
    ...overrides,
  };
}

describe("Claim-context source authority", () => {
  it("accepts a named bank product Claim from that bank's official product page", () => {
    expect(evaluateApprovalSourceAuthority({ profileId, page: page(), claims: [claim()] }))
      .toMatchObject({
        status: "passed",
        authorityKinds: ["entity_product"],
        matchedClaimIds: ["claim-product-rate"],
        sourceOwner: "Alpha Bank",
      });
  });

  it("rejects another bank's official page for the named bank Claim", () => {
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [claim()],
      page: page({
        requestedUrl: "https://beta-bank.example/products/prime-savings",
        finalUrl: "https://beta-bank.example/products/prime-savings",
        title: "Beta Bank Prime Savings official product page",
        publisher: "Beta Bank",
        text: "Beta Bank Prime Savings official product disclosure. The current interest rate is 3.5%.",
      }),
    })).toMatchObject({
      status: "rejected",
      diagnosticCode: "source_owner_mismatch",
      rejectedClaimIds: ["claim-product-rate"],
    });
  });

  it("does not accept a similarly named publisher as the Claim owner", () => {
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [claim()],
      page: page({
        requestedUrl: "https://alpha-financial-news.example/prime-savings",
        finalUrl: "https://alpha-financial-news.example/prime-savings",
        publisher: "Alpha Financial News",
      }),
    })).toMatchObject({ status: "rejected", diagnosticCode: "source_owner_mismatch" });
  });

  it("rejects an unrelated financial regulator page for an entity-owned product Claim", () => {
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [claim()],
      page: page({
        requestedUrl: "https://www.fsc.go.kr/policy/general",
        finalUrl: "https://www.fsc.go.kr/policy/general",
        title: "General financial policy",
        publisher: "Financial Services Commission",
        text: "General financial policy and market supervision information.",
      }),
    })).toMatchObject({ status: "rejected", diagnosticCode: "source_owner_mismatch" });
  });

  it("keeps the official regulator policy for a financial-regulation Claim", () => {
    const regulation = claim({
      claimId: "claim-financial-regulation",
      field: "financialRegulation",
      kind: "legal",
      statement: "The financial regulation requires the described disclosure.",
      rawValue: undefined,
      qualifiers: { subject: "Financial disclosure regulation" },
    });
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [regulation],
      page: page({
        requestedUrl: "https://www.fsc.go.kr/policy/disclosure",
        finalUrl: "https://www.fsc.go.kr/policy/disclosure",
        title: "Financial disclosure regulation",
        publisher: "Financial Services Commission",
        text: "Official financial regulation and disclosure requirements.",
      }),
    })).toMatchObject({ status: "passed", authorityKinds: ["financial_regulation"] });
  });

  it("keeps the official tax authority policy for a tax Claim", () => {
    const tax = claim({
      claimId: "claim-tax-rate",
      field: "taxRate",
      statement: "The applicable tax rate is 10%.",
      rawValue: "10%",
      qualifiers: { subject: "Value-added tax" },
    });
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [tax],
      page: page({
        requestedUrl: "https://www.nts.go.kr/tax/value-added-tax",
        finalUrl: "https://www.nts.go.kr/tax/value-added-tax",
        title: "Value-added tax rate",
        publisher: "National Tax Service",
        text: "Official value-added tax guidance states the applicable tax rate.",
      }),
    })).toMatchObject({ status: "passed", authorityKinds: ["tax"] });
  });

  it("keeps relevance separate and rejects an official owner page for another product", () => {
    const unrelated = page({
      requestedUrl: "https://alpha-bank.example/products/home-loan",
      finalUrl: "https://alpha-bank.example/products/home-loan",
      title: "Alpha Bank Home Loan official product page",
      text: "Alpha Bank Home Loan official product disclosure. Mortgage repayment and collateral conditions apply.",
    });
    expect(evaluateApprovalSourceAuthority({ profileId, page: unrelated, claims: [claim()] }).status)
      .toBe("passed");
    expect(evaluateApprovalSourceRelevance({
      profileId,
      opportunity: opportunity(),
      page: unrelated,
      additionalScope: [claim().statement, claim().qualifiers.scope ?? ""],
      minimumClaimCoverage: 0.5,
    })).toMatchObject({ status: "rejected", diagnosticCode: "source_topic_relevance_unverified" });
  });
});

/**
 * `entityProductPattern` contains `보험사?`, and Korean writes 고용보험 without a
 * space, so the entity-product test matched the 보험 inside every public social
 * insurance programme. Such a Claim then demanded a page owned by its subject,
 * which no public programme has, and every government portal carrying the rule
 * was rejected as `source_owner_mismatch`.
 */
describe("Public programme Claims are not entity products", () => {
  const publicClaims: readonly [string, string, string][] = [
    ["실업급여 수급자격은 고용보험 피보험단위기간 180일 이상이어야 한다", "고용노동부", "government_program"],
    ["구직급여 지급 기간은 고용보험법 시행령에 따른다", "고용노동부", "government_program"],
    ["국민건강보험 지역가입자 보험료 부과 기준", "국민건강보험공단", "government_program"],
    ["산재보험 요양급여 신청 절차", "근로복지공단", "government_program"],
    ["월세 세액공제 대상은 총급여 8천만원 이하 무주택 세대주", "국세청", "tax"],
  ];

  it.each(publicClaims)("classifies %s as a public authority Claim", (statement, subject, expected) => {
    expect(approvalClaimAuthorityKind(claim({
      statement,
      qualifiers: { subject },
      kind: "eligibility",
    }))).toBe(expected);
  });

  it("accepts the national law portal for an unemployment benefit Claim", () => {
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [claim({
        claimId: "claim-unemployment-eligibility",
        statement: "실업급여 수급자격은 고용보험 피보험단위기간 180일 이상이어야 한다",
        qualifiers: { subject: "고용노동부" },
        kind: "eligibility",
      })],
      page: page({
        requestedUrl: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202",
        finalUrl: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202",
        title: "국가법령정보센터 | 조문정보",
        publisher: "국가법령정보센터",
        text: "고용보험법에 따른 구직급여 수급요건은 이직일 이전 18개월간 피보험단위기간이 통산하여 180일 이상일 것을 요구한다.",
      }),
    })).toMatchObject({ status: "passed", authorityKinds: ["government_program"] });
  });

  it("still refuses another bank's page for a named bank product Claim", () => {
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [claim()],
      page: page({
        requestedUrl: "https://beta-bank.example/products/prime-savings",
        finalUrl: "https://beta-bank.example/products/prime-savings",
        publisher: "Beta Bank",
      }),
    })).toMatchObject({ status: "rejected", diagnosticCode: "source_owner_mismatch" });
  });
});

function opportunity(): ContentOpportunityCandidate {
  return createContentOpportunityCandidate({
    sourceRequest: "Explain the Alpha Bank Prime Savings rate and early termination terms.",
    selectionMode: "userSpecified",
    selectedTopic: "Alpha Bank Prime Savings product terms",
    primaryKeyword: "Alpha Bank Prime Savings",
    secondaryKeywords: ["savings interest rate", "early termination"],
    searchIntent: "Understand the Prime Savings product terms.",
    audience: "deposit customers",
    contentType: "article",
    contentAngle: "first-party product explanation",
    readerProblem: "Understand the savings product.",
    expectedCoverage: ["Prime Savings interest rate", "early termination conditions"],
    selectionRationale: "user request",
    opportunityEvidence: [{ source: "unknown", summary: "pending verification" }],
    confidence: 1,
    cautions: [],
    projectId: "project-authority",
  });
}
