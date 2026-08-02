export const contentPurposes = ["standard", "adsense_approval"] as const;
export type ContentPurpose = (typeof contentPurposes)[number];

export const approvalPolicyProfileIds = [
  "wordpress_life_economy_v1",
  "tistory_vivarain_art_v1",
] as const;
export type ApprovalPolicyProfileId = (typeof approvalPolicyProfileIds)[number];

export type ApprovalPolicySnapshot = Readonly<{
  contentPurpose: "adsense_approval";
  policyId: "adsense_approval_mode";
  policyVersion: "1.0";
  policyDocumentPath: "Docs/current/01_PRODUCT/15_ADSENSE_APPROVAL_MODE.md";
  profileId: ApprovalPolicyProfileId;
  profileVersion: "1.0";
  profileDisplayName: string;
  profileDocumentPath:
    | "Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md"
    | "Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md";
  siteIdentity: string;
  contentDomain: string;
  requiredPublishingCategoryNames?: readonly string[];
  requiredPrinciples: readonly string[];
  prohibitedClaims: readonly string[];
  sourceRequirements: readonly string[];
  qualityChecks: readonly string[];
}>;

export type ApprovalPreparationIssueCode =
  | "APPROVAL_GUARANTEE_CLAIM"
  | "UNSUPPORTED_PERFORMANCE_CLAIM"
  | "PLACEHOLDER_CONTENT"
  | "FABRICATED_EXPERIENCE"
  | "PROFILE_SOURCE_REQUIREMENT_MISSING"
  | "PROFILE_SOURCE_URL_MISSING"
  | "PROFILE_REVIEW_DATE_MISSING";

export type ApprovalPreparationIssue = Readonly<{
  code: ApprovalPreparationIssueCode;
  message: string;
  blocking: true;
}>;

export type ApprovalPreparationEvidenceContext = Readonly<{
  sourceUrls?: readonly string[];
  reviewedAt?: string;
}>;

export const peopleFirstValueAndTrustPrinciple =
  "애드센스 승인 준비 콘텐츠는 Google 심사 시스템이나 검색 알고리즘을 공략하기 위한 문서가 아니라, 실제 독자의 검색 의도와 문제를 완결적으로 해결하는 독창적이고 검증 가능하며 신뢰할 수 있는 사람 중심 콘텐츠로 작성한다.";

const sharedPrinciples = Object.freeze([
  "사이트와 Project의 주제 및 목적에 일관되게 속한다.",
  "검색 의도와 독자의 실제 문제를 직접 해결한다.",
  "광고가 없어도 독립적인 정보 가치가 있다.",
  "다른 글이나 공식 문서를 문장만 바꿔 재작성하지 않는다.",
  "제목과 키워드만 바꾼 반복 원고와 얇은 목록형 원고를 만들지 않는다.",
  "AI가 누구에게나 만들 수 있는 범용 요약을 넘어서 독자에게 고유한 판단 기준, 관찰 순서, 비교 기준, 예외 또는 실행 방법을 제공한다.",
  "기존 Project 콘텐츠와 비교해 새 원고만의 역할과 정보 가치를 명확히 한다.",
  "누가 검토했는지, 어떤 공식 자료를 사용했는지, 독자를 돕기 위해 왜 이 글을 만드는지가 원고와 사이트 신뢰 구조에서 설명 가능해야 한다.",
  "확인된 사실과 편집 해설 또는 일반적 해석을 구분한다.",
  "확인하지 않은 사실, 인용, 통계, 기관명, 작품명, URL 또는 출처를 만들지 않는다.",
  "검증된 공식 Evidence가 제공되지 않은 사실은 단정하지 않고 확인 필요 상태로 남긴다.",
  "관련성이 확인된 실제 공개 콘텐츠만 내부 링크로 사용한다.",
  "목표 글자 수, 최소 문단 수, 최소 게시물 수 또는 최소 Category 수를 승인 Gate로 사용하지 않는다.",
]);

const sharedProhibitedClaims = Object.freeze([
  "AdSense 승인 보장",
  "100% 승인",
  "반드시 통과",
  "검증되지 않은 수익·검색량·순위·성과 보장",
  "허위 전문가 경험 또는 직접 사용 경험",
]);

const sharedQualityChecks = Object.freeze([
  "사이트 주제 일관성",
  "고유하고 비범용적인 정보 가치",
  "기존 콘텐츠 중복 위험",
  "얇은 콘텐츠 위험",
  "공식 Evidence와 원고 사실의 일치",
  "출처 URL과 기준일·검토일의 역할 명확성",
  "과장 및 보장 표현",
  "독자 문제 해결",
  "공개 준비 완결성",
  "내부 링크 진단 및 사이트 준비 상태와 원고 품질의 분리",
]);

const profileSnapshots: Readonly<Record<ApprovalPolicyProfileId, ApprovalPolicySnapshot>> = Object.freeze({
  wordpress_life_economy_v1: Object.freeze({
    contentPurpose: "adsense_approval",
    policyId: "adsense_approval_mode",
    policyVersion: "1.0",
    policyDocumentPath: "Docs/current/01_PRODUCT/15_ADSENSE_APPROVAL_MODE.md",
    profileId: "wordpress_life_economy_v1",
    profileVersion: "1.0",
    profileDisplayName: "WordPress · 밝은재테크",
    profileDocumentPath: "Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md",
    siteIdentity: "밝은재테크",
    contentDomain: "생활경제, 생활금융, 정부지원, 세금, 주거 정보",
    requiredPublishingCategoryNames: Object.freeze(["생활재테크"]),
    requiredPrinciples: Object.freeze([
      ...sharedPrinciples,
      peopleFirstValueAndTrustPrinciple,
      "독자가 가진 구체적인 질문이나 문제를 먼저 정의하고 서론에서 핵심 답변을 불필요하게 미루지 않는다.",
      "검색 의도를 해결하는 데 필요한 판단 기준과 실행 방법을 빠짐없이 제공한다.",
      "다른 문서를 단순 요약·재작성하지 않고, 주제에 적합한 고유한 설명·비교·사례·계산·체크리스트·주의점·선택 기준 중 필요한 요소로 독창적인 기여를 만든다.",
      "독창성은 확인되지 않은 새로운 사실, 수치, 경험담, 성공 사례 또는 전문가 자격을 발명하는 것이 아니다.",
      "확인 가능한 사실과 편집 해석을 구분하고, 변동 가능한 정보에는 기준일 또는 확인 시점을 표시하며 중요한 주장은 공식 또는 신뢰할 수 있는 출처로 뒷받침한다.",
      "조건에 따라 달라지거나 불확실한 내용은 적용 범위와 한계를 명시한다.",
      "제목과 소제목은 실제 내용을 정확히 설명하고, 키워드 반복·문장 부풀리기·의미 없는 서론과 결론 없이 정보 밀도를 유지하면서 중복과 불필요한 장문을 제거한다.",
      "관련성이 검증된 공개 글만 내부 링크로 사용한다.",
      "승인 보장, 수익 보장, 반드시 통과 또는 100% 승인이라는 표현을 사용하지 않는다.",
      "생활경제 분야의 주제와 대상 독자에게 일관된 원고를 작성한다.",
      "변경 가능한 대상, 기간, 금액, 소득 기준, 금리와 세율은 공식 출처로 확인한다.",
      "본문에는 정보 기준일과 공식 재확인 경로를 제공한다. 출처 확인일과 Claim 최종 검토일은 Bright Studio가 Evidence 검증 후 별도로 기록한다.",
      "공식 문서를 단순 요약하지 않고 독자가 자신의 적용 여부를 판단할 조건, 예외, 확인 순서와 다음 행동을 제공한다.",
      "초기 Category는 생활재테크 하나만 사용하고 초기 Tag를 만들지 않는다.",
    ]),
    prohibitedClaims: Object.freeze([
      ...sharedProhibitedClaims,
      "투자 수익 보장",
      "대출 승인 보장",
      "지원금 수령 보장",
      "확실한 절세",
    ]),
    sourceRequirements: Object.freeze([
      "정부기관 또는 지방자치단체 공식 자료",
      "국세청·법령정보·금융위원회·금융감독원 자료",
      "공공기관 공식 공고와 공식 신청 페이지",
      "공식 HTTPS URL",
      "본문 정보 기준일과 시스템 Evidence 검토일의 역할 분리",
    ]),
    qualityChecks: Object.freeze([
      ...sharedQualityChecks,
      "Reader Value: 독자의 구체적인 질문을 먼저 정의하고 핵심 답변, 판단 기준과 실행 방법을 실제로 제공하는지 평가한다.",
      "Original Contribution: 단순 요약·재작성이 아니라 주제에 적합한 설명, 비교, 사례, 계산, 체크리스트, 주의점 또는 선택 기준으로 고유한 가치를 더하는지 평가한다.",
      "Factual Reliability: 사실과 해석을 구분하고, 변동 정보의 기준일과 신뢰 가능한 출처를 제시하며 확인하지 않은 수치·경험·성공 사례·자격을 만들지 않는지 평가한다.",
      "Completeness: 검색 의도에 필요한 핵심 질문, 조건, 예외, 판단 기준, 실행 방법과 다음 행동을 빠짐없이 충분히 설명하는지 평가한다.",
      "Transparency: 정보의 적용 범위, 불확실성, 한계, 확인 시점과 최종 확인 경로를 독자가 이해할 수 있게 밝히는지 평가한다.",
      "Readability: 제목과 소제목이 실제 내용을 정확히 설명하고, 핵심 답변을 미루거나 키워드를 반복하거나 문장을 부풀리지 않으며 정보 밀도를 유지하는지 평가한다.",
      "Search Intent Satisfaction: 원고 전체가 생활경제 독자의 실제 검색 질문과 문제를 완결적으로 해결하는지 평가한다.",
      "Policy Safety: 승인·수익 보장, 반드시 통과, 100% 승인과 그 밖의 과장·미검증 주장을 차단하되 외부 승인 가능성을 점수화하지 않는다.",
      "변경 가능한 생활경제 정보의 최신성",
      "공식 출처와 신청·확인 경로",
      "독자가 자신의 상황을 판단할 수 있는 조건과 예외",
      "투자·대출·지원금 보장 표현",
    ]),
  }),
  tistory_vivarain_art_v1: Object.freeze({
    contentPurpose: "adsense_approval",
    policyId: "adsense_approval_mode",
    policyVersion: "1.0",
    policyDocumentPath: "Docs/current/01_PRODUCT/15_ADSENSE_APPROVAL_MODE.md",
    profileId: "tistory_vivarain_art_v1",
    profileVersion: "1.0",
    profileDisplayName: "Tistory · 비바레인 미술",
    profileDocumentPath: "Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md",
    siteIdentity: "비바레인",
    contentDomain: "서양미술 화가와 작품 감상 정보",
    requiredPrinciples: Object.freeze([
      ...sharedPrinciples,
      "작품이나 화가를 이해하는 데 필요한 시대적 배경과 실제 관찰 포인트를 제공한다.",
      "작품명, 제작연도, 재료, 크기, 소장처와 인용은 신뢰 가능한 미술기관 자료로 확인한다.",
      "단순 화가 목록, 대표작 목록 또는 생애 연표만으로 원고를 구성하지 않는다.",
      "작품을 어떤 순서로 보고 무엇을 관찰해야 하는지 초보자가 적용할 수 있도록 설명한다.",
      "해석을 확정된 사실처럼 단정하지 않는다.",
    ]),
    prohibitedClaims: Object.freeze([
      ...sharedProhibitedClaims,
      "확인되지 않은 작품 가격 또는 투자 가치",
      "출처 없는 화가 명언과 일화",
      "AI의 미술관 방문 또는 작품 직접 감상 경험",
      "저작권이 확인되지 않은 작품 이미지 재배포 지시",
    ]),
    sourceRequirements: Object.freeze([
      "작품 소장 미술관·박물관의 공식 작품 페이지",
      "작가 재단·공식 아카이브·공공 미술기관 자료",
      "작품명·제작연도·재료·크기·소장처 확인",
      "공식 HTTPS URL",
      "주요 출처와 최종 검토일",
    ]),
    qualityChecks: Object.freeze([
      ...sharedQualityChecks,
      "비바레인 미술 감상 사이트 정체성",
      "작품을 실제로 이해하게 하는 관찰 정보",
      "단순 목록 또는 생애 연표 중심 여부",
      "해석을 사실로 단정하는 표현",
      "허위 체험과 출처 없는 명언·일화",
      "작품 이미지 이용 조건 위험",
    ]),
  }),
});

export function normalizeContentPurpose(value: unknown): ContentPurpose {
  return value === "adsense_approval" ? "adsense_approval" : "standard";
}

export function isApprovalPolicyProfileId(value: unknown): value is ApprovalPolicyProfileId {
  return typeof value === "string" && approvalPolicyProfileIds.includes(value as ApprovalPolicyProfileId);
}

export function resolveApprovalPolicySnapshot(
  purpose: unknown,
  profileId: unknown,
): ApprovalPolicySnapshot | undefined {
  if (normalizeContentPurpose(purpose) !== "adsense_approval") return undefined;
  if (!isApprovalPolicyProfileId(profileId)) {
    throw new Error("승인 준비 모드에는 승인된 Project 정책 프로필이 필요합니다.");
  }
  return profileSnapshots[profileId];
}

export function approvalPolicyProfileDisplayName(profileId: ApprovalPolicyProfileId): string {
  return profileSnapshots[profileId].profileDisplayName;
}

export function approvalPolicyPromptContext(snapshot: ApprovalPolicySnapshot): string {
  return [
    `Content purpose: ${snapshot.contentPurpose}`,
    `Approval policy: ${snapshot.policyId}@${snapshot.policyVersion}`,
    `Approval profile: ${snapshot.profileDisplayName}@${snapshot.profileVersion}`,
    `Policy documents reviewed: ${snapshot.policyDocumentPath} | ${snapshot.profileDocumentPath} | Docs/current/01_PRODUCT/17_ADSENSE_APPROVAL_READINESS_BLUEPRINT.md`,
    `Site and brand identity (metadata only): ${snapshot.siteIdentity}`,
    `Content domain: ${snapshot.contentDomain}`,
    ...(snapshot.requiredPublishingCategoryNames?.length
      ? [`Required publishing categories: ${snapshot.requiredPublishingCategoryNames.join(" | ")}`]
      : []),
    `Required principles: ${snapshot.requiredPrinciples.join(" | ")}`,
    `Prohibited claims: ${snapshot.prohibitedClaims.join(" | ")}`,
    `Source requirements: ${snapshot.sourceRequirements.join(" | ")}`,
    `Approval quality checks: ${snapshot.qualityChecks.join(" | ")}`,
    "Identity and publishing category boundary: site or brand identity, approval profile display names, and publishing Category labels are metadata, not default search keywords. Do not insert them into the title, body, meta description, image prompt or ALT, tags, or CTA merely because they appear in this policy.",
    "Approval writing strategy: produce people-first, unique, non-commodity content that gives the reader a usable observation order, decision criteria, exceptions, comparison, or next action unavailable from a generic summary.",
    "Evidence integrity: use only verified official Evidence supplied by the server. Never invent a source URL, citation, institution, date, quote, artwork fact, eligibility rule, amount, rate, or deadline. If verified Evidence is unavailable, preserve the limitation instead of fabricating certainty.",
    "Duplicate integrity: the new article must have a distinct role, search intent, structure, claims, and reader value compared with existing Project content. Do not create a template clone with only names or keywords changed.",
    "Readiness separation: article Quality approval, approval-policy compliance, Evidence verification, duplicate verification, internal-link diagnostics, and site readiness are independent states. Never imply that a high article score means AdSense application readiness.",
    "Never claim or imply that AdSense approval is guaranteed.",
  ].join("\n");
}

export function approvalPolicySnapshotFromEditorialContext(
  editorialContext: unknown,
): ApprovalPolicySnapshot | undefined {
  if (typeof editorialContext !== "string" || !editorialContext.includes("Content purpose: adsense_approval")) {
    return undefined;
  }
  if (!editorialContext.includes("Approval policy: adsense_approval_mode@1.0")) {
    throw new Error("Canonical editorial context contains an unsupported approval policy version.");
  }
  const profileId = approvalPolicyProfileIds.find((value) => {
    const snapshot = profileSnapshots[value];
    return editorialContext.includes(`Approval profile: ${snapshot.profileDisplayName}@${snapshot.profileVersion}`)
      || editorialContext.includes(`Approval profile: ${value}@${snapshot.profileVersion}`);
  });
  if (!profileId) {
    throw new Error("Canonical editorial context is missing an approved policy profile.");
  }
  return resolveApprovalPolicySnapshot("adsense_approval", profileId);
}

export function evaluateApprovalPreparationText(
  text: string,
  snapshot: ApprovalPolicySnapshot,
  evidence: ApprovalPreparationEvidenceContext = {},
): readonly ApprovalPreparationIssue[] {
  const issues: ApprovalPreparationIssue[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();
  const evidenceSourceUrls = (evidence.sourceUrls ?? []).filter((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  });

  if (/(?:애드센스|AdSense).{0,18}(?:100\s*%|무조건|반드시|확실히).{0,12}(?:승인|통과)|(?:승인|통과).{0,18}(?:보장|확정)/i.test(normalized)) {
    issues.push({ code: "APPROVAL_GUARANTEE_CLAIM", message: "AdSense 승인 또는 통과를 보장하는 표현이 있습니다.", blocking: true });
  }
  if (/(?:수익|검색량|상위\s*노출|순위|대출\s*승인|지원금\s*수령).{0,18}(?:100\s*%|무조건|보장|확정|반드시)/i.test(normalized)) {
    issues.push({ code: "UNSUPPORTED_PERFORMANCE_CLAIM", message: "검증되지 않은 성과·수익·승인 보장 표현이 있습니다.", blocking: true });
  }
  if (/(?:lorem ipsum|내용을 입력|여기에 .+ 입력|추가 예정|작성 예정|placeholder|todo|tbd)/i.test(normalized)) {
    issues.push({ code: "PLACEHOLDER_CONTENT", message: "공개 원고에 placeholder 또는 작성 예정 문구가 남아 있습니다.", blocking: true });
  }
  if (/(?:제가|저는|나는|직접).{0,24}(?:미술관을 방문|작품을 보았|사용했|신청했|경험했|해봤)/i.test(normalized)) {
    issues.push({ code: "FABRICATED_EXPERIENCE", message: "확인할 수 없는 직접 경험 또는 방문 경험을 사실처럼 표현했습니다.", blocking: true });
  }

  const hasSourceSignal = evidenceSourceUrls.length > 0
    || /(?:출처|참고 자료|공식 자료|공식 페이지|소장처|최종 검토일|정보 기준일)/i.test(normalized);
  if (!hasSourceSignal && snapshot.sourceRequirements.length > 0) {
    issues.push({ code: "PROFILE_SOURCE_REQUIREMENT_MISSING", message: "적용 프로필이 요구하는 출처 또는 검토 기준 표시가 없습니다.", blocking: true });
  }

  const hasSourceUrl = evidenceSourceUrls.length > 0
    || /https:\/\/[^\s<>)"']+/i.test(normalized);
  if (!hasSourceUrl && snapshot.sourceRequirements.length > 0) {
    issues.push({ code: "PROFILE_SOURCE_URL_MISSING", message: "공식 출처를 확인할 수 있는 HTTPS URL이 없습니다.", blocking: true });
  }

  const hasReviewDate = Boolean(evidence.reviewedAt && Number.isFinite(Date.parse(evidence.reviewedAt)))
    || /(?:(?:최종\s*검토일|정보\s*기준일)(?:\s*(?:과|와|및)\s*(?:최종\s*검토일|정보\s*기준일))?)\s*(?:은|는|이|가)?\s*[:：]?\s*(?:20\d{2}[-./년]\s*\d{1,2}(?:[-./월]\s*\d{1,2})?|20\d{2}[-./]\d{1,2}(?:[-./]\d{1,2})?)/i.test(normalized);
  if (!hasReviewDate && snapshot.sourceRequirements.length > 0) {
    issues.push({ code: "PROFILE_REVIEW_DATE_MISSING", message: "정보 기준일 또는 최종 검토일을 확인할 수 없습니다.", blocking: true });
  }

  return Object.freeze(issues);
}
