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
  profileDocumentPath:
    | "Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md"
    | "Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md";
  siteIdentity: string;
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
  | "PROFILE_SOURCE_REQUIREMENT_MISSING";

export type ApprovalPreparationIssue = Readonly<{
  code: ApprovalPreparationIssueCode;
  message: string;
  blocking: true;
}>;

const sharedPrinciples = Object.freeze([
  "사이트와 Project의 주제 및 목적에 일관되게 속한다.",
  "검색 의도와 독자의 실제 문제를 직접 해결한다.",
  "광고가 없어도 독립적인 정보 가치가 있다.",
  "다른 글이나 공식 문서를 문장만 바꿔 재작성하지 않는다.",
  "제목과 키워드만 바꾼 반복 원고와 얇은 목록형 원고를 만들지 않는다.",
  "확인된 사실과 편집 해설 또는 일반적 해석을 구분한다.",
  "확인하지 않은 사실, 인용, 통계, 기관명, 작품명, URL 또는 출처를 만들지 않는다.",
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
  "고유 정보 가치",
  "기존 콘텐츠 중복 위험",
  "얇은 콘텐츠 위험",
  "사실 및 출처 신뢰성",
  "과장 및 보장 표현",
  "독자 문제 해결",
  "공개 준비 완결성",
]);

const profileSnapshots: Readonly<Record<ApprovalPolicyProfileId, ApprovalPolicySnapshot>> = Object.freeze({
  wordpress_life_economy_v1: Object.freeze({
    contentPurpose: "adsense_approval",
    policyId: "adsense_approval_mode",
    policyVersion: "1.0",
    policyDocumentPath: "Docs/current/01_PRODUCT/15_ADSENSE_APPROVAL_MODE.md",
    profileId: "wordpress_life_economy_v1",
    profileVersion: "1.0",
    profileDocumentPath: "Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md",
    siteIdentity: "복잡한 정부지원, 세금, 주거, 생활금융 기초 제도를 일반 독자가 공식 확인처에서 스스로 확인할 수 있도록 쉽게 설명한다.",
    requiredPrinciples: Object.freeze([
      ...sharedPrinciples,
      "변경 가능한 대상, 기간, 금액, 소득 기준, 금리와 세율은 공식 출처로 확인한다.",
      "정보 기준일, 최종 검토일과 공식 확인 경로를 제공한다.",
      "초기 Category는 생활경제 하나만 사용하고 초기 Tag를 만들지 않는다.",
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
      "정보 기준일과 최종 검토일",
    ]),
    qualityChecks: Object.freeze([
      ...sharedQualityChecks,
      "변경 가능한 생활경제 정보의 최신성",
      "공식 출처와 신청·확인 경로",
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
    profileDocumentPath: "Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md",
    siteIdentity: "미술 초보 일반 독자가 서양미술의 화가와 작품을 시대적 배경, 시각적 특징, 감상 포인트와 확인 가능한 자료를 통해 쉽게 이해하도록 돕는다.",
    requiredPrinciples: Object.freeze([
      ...sharedPrinciples,
      "작품이나 화가를 이해하는 데 필요한 시대적 배경과 실제 관찰 포인트를 제공한다.",
      "작품명, 제작연도, 재료, 크기, 소장처와 인용은 신뢰 가능한 미술기관 자료로 확인한다.",
      "단순 화가 목록, 대표작 목록 또는 생애 연표만으로 원고를 구성하지 않는다.",
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

export function approvalPolicyPromptContext(snapshot: ApprovalPolicySnapshot): string {
  return [
    `Content purpose: ${snapshot.contentPurpose}`,
    `Approval policy: ${snapshot.policyId}@${snapshot.policyVersion}`,
    `Approval profile: ${snapshot.profileId}@${snapshot.profileVersion}`,
    `Policy documents reviewed: ${snapshot.policyDocumentPath} | ${snapshot.profileDocumentPath}`,
    `Site identity: ${snapshot.siteIdentity}`,
    `Required principles: ${snapshot.requiredPrinciples.join(" | ")}`,
    `Prohibited claims: ${snapshot.prohibitedClaims.join(" | ")}`,
    `Source requirements: ${snapshot.sourceRequirements.join(" | ")}`,
    `Approval quality checks: ${snapshot.qualityChecks.join(" | ")}`,
    "Never claim or imply that AdSense approval is guaranteed.",
  ].join("\n");
}

export function evaluateApprovalPreparationText(
  text: string,
  snapshot: ApprovalPolicySnapshot,
): readonly ApprovalPreparationIssue[] {
  const issues: ApprovalPreparationIssue[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();

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

  const hasSourceSignal = /(?:출처|참고 자료|공식 자료|공식 페이지|소장처|최종 검토일|정보 기준일)/i.test(normalized);
  if (!hasSourceSignal && snapshot.sourceRequirements.length > 0) {
    issues.push({ code: "PROFILE_SOURCE_REQUIREMENT_MISSING", message: "적용 프로필이 요구하는 출처 또는 검토 기준 표시가 없습니다.", blocking: true });
  }

  return Object.freeze(issues);
}
