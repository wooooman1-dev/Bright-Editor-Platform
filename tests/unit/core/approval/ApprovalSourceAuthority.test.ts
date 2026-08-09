import { describe, expect, it } from "vitest";
import {
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

  it("keeps a government law page for an employment-insurance eligibility Claim instead of requiring a matching product owner", () => {
    const unemploymentEligibility = claim({
      claimId: "claim-unemployment-eligibility",
      field: "수급자격 판단 요소",
      kind: "eligibility",
      statement: "구직급여 수급자격은 이직 사유와 고용보험 피보험 단위기간을 포함한 법정 요건에 따라 판단된다.",
      rawValue: undefined,
      qualifiers: {
        subject: "구직급여 수급자격",
        scope: "대한민국 고용보험 제도",
        basis: "고용보험 관련 법령 및 공식 안내",
      },
    });
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [unemploymentEligibility],
      page: page({
        requestedUrl: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033135841",
        finalUrl: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033135841",
        title: "고용보험법 제40조(구직급여의 수급 요건)",
        publisher: "국가법령정보센터",
        text: "고용보험법 제40조는 구직급여의 수급 요건을 정한다.",
      }),
    })).toMatchObject({ status: "passed", authorityKinds: ["law"] });
  });

  it("keeps a declared legal Claim a law Claim even when it discusses 보험 and 약관", () => {
    const insurancePayout = claim({
      claimId: "claim-insurance-payout",
      field: "보험금 지급 여부 판단 기준",
      kind: "legal",
      statement: "보험금 지급 여부는 개별 보험계약의 약관과 사고 또는 진료 사실을 기준으로 판단해야 한다.",
      rawValue: undefined,
      qualifiers: {
        subject: "보험금 지급 여부",
        scope: "개별 보험계약 및 보험사고·진료 사실",
        basis: "보험약관 및 개별 사실관계",
      },
    });
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [insurancePayout],
      page: page({
        requestedUrl: "https://law.go.kr/LSW/precInfoP.do?precSeq=216511",
        finalUrl: "https://law.go.kr/LSW/precInfoP.do?precSeq=216511",
        title: "판례 > 보험금 | 국가법령정보센터",
        publisher: "국가법령정보센터",
        text: "상법 제638조 이하는 보험계약의 효력과 보험금 지급 의무를 정한다.",
      }),
    })).toMatchObject({ status: "passed", authorityKinds: ["law"] });
  });

  it("does not treat a Claim that merely mentions 보험 as owned by a named insurer", () => {
    const claimDocuments = claim({
      claimId: "claim-insurance-documents",
      field: "보험금 청구 필요 서류",
      kind: "general",
      statement: "보험금 청구에 필요한 서류는 보험 종류와 계약별 보험사 공식 안내에서 확인해야 한다.",
      rawValue: undefined,
      qualifiers: { subject: "보험금 청구", scope: "필요 서류", basis: "보험사 공식 안내" },
    });
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [claimDocuments],
      page: page({
        requestedUrl: "https://www.fss.or.kr/fss/bbs/B0000203/view.do",
        finalUrl: "https://www.fss.or.kr/fss/bbs/B0000203/view.do",
        title: "보험금 청구 안내",
        publisher: "금융감독원",
        text: "보험금 청구 시 필요한 서류는 보험 종류에 따라 다르다.",
      }),
    }).authorityKinds).not.toContain("entity_product");
  });

  it("still binds a Claim whose subject names the entity to that entity's page", () => {
    expect(evaluateApprovalSourceAuthority({
      profileId,
      claims: [claim({ qualifiers: { subject: "Alpha Bank", scope: "Prime Savings product" } })],
      page: page({
        requestedUrl: "https://www.fss.or.kr/fss/bbs/B0000203/view.do",
        finalUrl: "https://www.fss.or.kr/fss/bbs/B0000203/view.do",
        publisher: "금융감독원",
      }),
    })).toMatchObject({ status: "rejected", diagnosticCode: "source_owner_mismatch" });
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
