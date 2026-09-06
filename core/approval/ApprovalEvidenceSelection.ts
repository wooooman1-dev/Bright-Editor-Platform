import { serializeStructuredList, type ContentDocument } from "../content";
import type {
  ApprovalEvidenceFact,
  ApprovalEvidencePack,
  ApprovalEvidenceProvenance,
  ApprovalEvidenceSource,
  ApprovalEvidenceVerificationStatus,
} from "./ApprovalReadiness";
import {
  approvalFactMatchesPage,
  extractProfileApprovalFacts,
  extractProfileApprovalFactsFromText,
  requiredApprovalFactFields,
} from "./ApprovalEvidenceClaimPolicy";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import {
  canonicalizeApprovalEvidenceUrl as canonicalizeBaseApprovalEvidenceUrl,
  officialSourceAllowed,
  verifyApprovalEvidence as verifyBaseApprovalEvidence,
  type ApprovalEvidenceVerificationResult,
  type ApprovalSourcePage,
} from "./ApprovalEvidenceVerification";

/**
 * Canonicalizes Evidence identity without treating harmless law.go.kr host,
 * path-case, or display parameters as different official sources.
 */
export function canonicalizeApprovalEvidenceUrl(value: string): string {
  const base = canonicalizeBaseApprovalEvidenceUrl(value);
  try {
    const url = new URL(base);
    const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
    if (host !== "law.go.kr") return base;

    url.protocol = "https:";
    url.hostname = "law.go.kr";
    const endpoint = url.pathname.split("/").filter(Boolean).at(-1)?.toLocaleLowerCase("en-US");
    const endpointPath = lawEndpointPaths[endpoint ?? ""];
    if (!endpointPath) return canonicalizeBaseApprovalEvidenceUrl(url.toString());
    url.pathname = endpointPath;

    const identity = lawSourceIdentity(url, endpoint ?? "");
    if (identity) {
      const classCode = queryValue(url, "chrClsCd");
      url.search = "";
      if (classCode) url.searchParams.set("chrClsCd", classCode);
      url.searchParams.set(identity.key, identity.value);
    } else {
      url.searchParams.sort();
    }
    return canonicalizeBaseApprovalEvidenceUrl(url.toString());
  } catch {
    return base;
  }
}

export function approvalEvidenceSourceProvenance(
  source: ApprovalEvidenceSource,
): ApprovalEvidenceProvenance {
  if (source.provenance) return source.provenance;
  if (source.cited === true) return "citation";
  if (source.selected === true) return "user_selected";
  if ((source.linkedBlockIds?.length ?? 0) > 0 || source.facts.length > 0) return "document_link";
  return "search_candidate";
}

/**
 * A source affects readiness only after deterministic selection or an explicit
 * user/document choice. Mere search discovery and unverified AI citation
 * annotations stay in the candidate pool.
 */
export function isApprovalEvidenceSelectedSource(source: ApprovalEvidenceSource): boolean {
  const provenance = approvalEvidenceSourceProvenance(source);
  if (provenance === "user_selected"
    || provenance === "system_verified"
    || provenance === "document_link") {
    return true;
  }
  return source.selected === true && source.verified === true;
}

export function isApprovalEvidenceCandidateSource(source: ApprovalEvidenceSource): boolean {
  return !isApprovalEvidenceSelectedSource(source);
}

export function approvalEvidenceDocumentReferences(
  document: ContentDocument,
): ReadonlyMap<string, readonly string[]> {
  const references = new Map<string, Set<string>>();
  for (const block of document.blocks) {
    for (const match of blockText(block).matchAll(/https:\/\/[^\s<>)"'\]}]+/giu)) {
      const url = canonicalizeApprovalEvidenceUrl(trimSourceUrl(match[0]));
      if (!url.startsWith("https://")) continue;
      const blockIds = references.get(url) ?? new Set<string>();
      blockIds.add(block.id);
      references.set(url, blockIds);
    }
  }
  return new Map([...references.entries()].map(([url, blockIds]) => [
    url,
    Object.freeze([...blockIds]),
  ]));
}

/**
 * Candidate Pool -> Selected Evidence -> Verified Claim Snapshot.
 *
 * Search candidates are fetched and inspected, but only the smallest
 * deterministic set that covers the current manuscript's required Claims is
 * promoted to system Evidence. Unselected candidates remain visible for
 * diagnostics and never lower the readiness result.
 */
export function verifyApprovalEvidence(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
  pages: readonly ApprovalSourcePage[],
  reviewedAt: string,
): ApprovalEvidenceVerificationResult {
  const existing = document.metadata?.approvalEvidence;
  if (!existing?.sources.length) {
    return verifyBaseApprovalEvidence(document, profileId, pages, reviewedAt);
  }

  const normalized = normalizeEvidenceSources(existing.sources);
  const pageByUrl = new Map<string, ApprovalSourcePage>();
  for (const page of pages) {
    pageByUrl.set(canonicalizeApprovalEvidenceUrl(page.requestedUrl), normalizePage(page));
    pageByUrl.set(canonicalizeApprovalEvidenceUrl(page.finalUrl), normalizePage(page));
  }

  const baseFacts = extractProfileApprovalFacts(document, profileId);
  const requiredFields = requiredApprovalFactFields(document, profileId, baseFacts);
  const required = new Set(requiredFields);
  const factOccurrences = documentFactOccurrences(document, profileId, baseFacts)
    .filter((fact) => required.has(fact.field));
  const references = approvalEvidenceDocumentReferences(document);

  const entries = normalized.primary.map((source) => {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url);
    const page = pageByUrl.get(canonicalUrl);
    const matchedFacts = page && pageEligible(profileId, page)
      ? factOccurrences.filter((fact) => approvalFactMatchesPage(page, fact))
      : Object.freeze([] as ApprovalEvidenceFact[]);
    return Object.freeze({ source, canonicalUrl, page, matchedFacts });
  });

  const verificationEntries = entries.filter((entry) =>
    approvalEvidenceSourceProvenance(entry.source) !== "search_candidate");
  const covered = new Set(verificationEntries
    .filter((entry) => pageEligible(profileId, entry.page))
    .flatMap((entry) => entry.matchedFacts.map((fact) => fact.field)));

  const searchCandidates = entries
    .filter((entry) => approvalEvidenceSourceProvenance(entry.source) === "search_candidate")
    .filter((entry) => pageEligible(profileId, entry.page))
    .sort((left, right) => {
      const leftScore = uncoveredScore(left.matchedFacts, required, covered);
      const rightScore = uncoveredScore(right.matchedFacts, required, covered);
      return rightScore - leftScore || left.canonicalUrl.localeCompare(right.canonicalUrl);
    });

  const autoSelected: typeof entries = [];
  for (const entry of searchCandidates) {
    const fields = [...new Set(entry.matchedFacts.map((fact) => fact.field))]
      .filter((field) => required.has(field) && !covered.has(field));
    if (!fields.length) continue;
    autoSelected.push(entry);
    for (const field of fields) covered.add(field);
  }

  const preparedSources = [...verificationEntries, ...autoSelected].map((entry) => {
    const provenance = approvalEvidenceSourceProvenance(entry.source) === "search_candidate"
      ? "system_verified" as const
      : approvalEvidenceSourceProvenance(entry.source);
    return Object.freeze({
      ...entry.source,
      url: entry.canonicalUrl,
      canonicalUrl: entry.canonicalUrl,
      provenance,
      selected: provenance === "user_selected"
        || provenance === "system_verified"
        || provenance === "document_link"
        || (provenance === "citation" && entry.source.selected === true),
      linkedBlockIds: Object.freeze([...new Set([
        ...(entry.source.linkedBlockIds ?? []),
        ...(references.get(entry.canonicalUrl) ?? []),
        ...entry.matchedFacts.flatMap((fact) => fact.blockId ? [fact.blockId] : []),
      ])]),
      facts: mergeFacts(entry.source.facts, entry.matchedFacts),
    } satisfies ApprovalEvidenceSource);
  });

  const preparedDocument: ContentDocument = Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata!,
      approvalEvidence: Object.freeze({
        ...existing,
        status: "needs_review" as const,
        sources: Object.freeze(preparedSources),
      }),
    }),
  });
  const selectedUrls = new Set(preparedSources.map((source) =>
    canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url)));
  const selectedPages = [...new Map(pages
    .map((page) => [canonicalizeApprovalEvidenceUrl(page.requestedUrl), normalizePage(page)] as const)
    .filter(([url]) => selectedUrls.has(url))).values()];
  const base = verifyBaseApprovalEvidence(
    preparedDocument,
    profileId,
    Object.freeze(selectedPages),
    reviewedAt,
  );

  const verifiedFields = new Set<string>();
  const evaluatedSources = base.pack.sources.map((source) => {
    const provenance = approvalEvidenceSourceProvenance(source);
    const matchedRequired = (source.matchedFacts ?? []).filter((fact) => required.has(fact.field));
    const explicitlyOwned = provenance === "user_selected"
      || provenance === "system_verified"
      || provenance === "document_link";
    const selected = explicitlyOwned
      || (provenance === "citation" && source.selected === true)
      || (source.verified && matchedRequired.length > 0);
    if (selected && source.verified) {
      for (const fact of matchedRequired) verifiedFields.add(fact.field);
    }
    return Object.freeze({
      ...source,
      selected,
      ...(provenance === "citation" ? { cited: true } : {}),
    } satisfies ApprovalEvidenceSource);
  });

  const evaluatedIds = new Set(evaluatedSources.map((source) => source.sourceId));
  const candidateSources = entries
    .filter((entry) => !evaluatedIds.has(entry.source.sourceId))
    .map((entry) => candidateDiagnostic(entry.source, entry.canonicalUrl, entry.page, profileId, reviewedAt));
  const duplicateSources = normalized.duplicates.map((source) => duplicateCandidate(
    source,
    canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url),
    reviewedAt,
  ));
  const sources = Object.freeze([
    ...evaluatedSources,
    ...candidateSources,
    ...duplicateSources,
  ]);

  const unverifiedFields = requiredFields.filter((field) => !verifiedFields.has(field));
  const selectedVerified = sources.filter((source) =>
    isApprovalEvidenceSelectedSource(source) && source.verified === true);
  /**
   * D-045: 통과 조건은 인정 범위 안의 출처가 실제로 열렸고 그것이 원고에
   * 채택되어 있는가이다. 사실 필드 커버리지는 진단으로만 남긴다.
   *
   * 안쪽 검증에서 커버리지 차단을 걷어내도 이 줄이 같은 차단을 다시 걸고
   * 있었다. 검증 함수가 둘이고 바깥이 안쪽을 감싼다 — 한쪽만 고치면 정책이
   * 반만 바뀐다.
   */
  const verified = selectedVerified.length > 0;
  /**
   * 정보 기준일은 시스템이 소유한다 (D-043).
   *
   * 예전에는 원고가 쓴 `정보 기준일` 줄을 서버가 읽어 이 값으로 삼았고, 그래서
   * 화면에 같은 날짜가 두 번 나왔다 — 원고가 쓴 문단 하나, 시스템이 출처 영역에
   * 찍는 줄 하나. 새 원고는 그 줄을 쓰지 않으므로 이 값도 비고, 출처 영역에는
   * 출처 확인일만 남는다. 확인일을 그대로 기준일로 베껴 쓰면 같은 날짜를 두 이름으로
   * 두 번 보여 주는 것이라 아무것도 더 알려 주지 않는다. 이미 저장된 원고는 본문에
   * 그 줄이 남아 있으므로 계속 읽어 들여 기존 표시를 유지한다.
   */
  const informationAsOf = existing.informationAsOf ?? extractInformationAsOf(document);
  const reasons = [
    ...sources
      .filter((source) => {
        const provenance = approvalEvidenceSourceProvenance(source);
        return provenance !== "search_candidate"
          && source.verified !== true
          && source.verificationStatus !== "excluded"
          && source.verificationStatus !== "duplicate_source"
          && Boolean(source.failureReason);
      })
      .map((source) => source.failureReason!),
    ...(unverifiedFields.length
      ? [`핵심 Claim 검증이 완료되지 않았습니다: ${unverifiedFields.join(", ")}`]
      : []),
    ...(!selectedVerified.length ? ["현재 원고의 필수 Claim을 뒷받침하도록 선택·검증된 공식 출처가 없습니다."] : []),
  ];

  const pack: ApprovalEvidencePack = Object.freeze({
    version: "1.0",
    status: verified ? "verified" : "needs_review",
    coverageStatus: verified ? "verified" : "needs_review",
    ...(verified ? { reviewedAt } : {}),
    ...(informationAsOf ? { informationAsOf } : {}),
    requiredFactFields: Object.freeze([...requiredFields]),
    verifiedFactFields: Object.freeze([...verifiedFields]),
    unverifiedFactFields: Object.freeze(unverifiedFields),
    sources,
  });

  return Object.freeze({
    pack,
    verifiedSourceCount: selectedVerified.length,
    rejectedSourceCount: sources.filter((source) =>
      source.verificationStatus === "duplicate_source"
      || (isApprovalEvidenceSelectedSource(source)
        && source.verified !== true
        && source.verificationStatus !== "excluded")).length,
    reasons: Object.freeze(reasons),
  });
}

function normalizeEvidenceSources(sources: readonly ApprovalEvidenceSource[]): Readonly<{
  primary: readonly ApprovalEvidenceSource[];
  duplicates: readonly ApprovalEvidenceSource[];
}> {
  const groups = new Map<string, ApprovalEvidenceSource[]>();
  for (const source of sources) {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url);
    const group = groups.get(canonicalUrl) ?? [];
    group.push(source);
    groups.set(canonicalUrl, group);
  }

  const primary: ApprovalEvidenceSource[] = [];
  const duplicates: ApprovalEvidenceSource[] = [];
  for (const [canonicalUrl, group] of groups) {
    const ordered = [...group].sort((left, right) =>
      sourcePriority(right) - sourcePriority(left) || left.sourceId.localeCompare(right.sourceId));
    const winner = ordered[0]!;
    primary.push(Object.freeze({
      ...winner,
      url: canonicalUrl,
      canonicalUrl,
      linkedBlockIds: Object.freeze([...new Set(ordered.flatMap((source) => source.linkedBlockIds ?? []))]),
      facts: mergeFacts(...ordered.map((source) => source.facts)),
      citationExcerpt: ordered.find((source) => source.citationExcerpt)?.citationExcerpt,
    }));
    duplicates.push(...ordered.slice(1));
  }
  return Object.freeze({
    primary: Object.freeze(primary.sort((left, right) => left.url.localeCompare(right.url))),
    duplicates: Object.freeze(duplicates),
  });
}

function sourcePriority(source: ApprovalEvidenceSource): number {
  const provenance = approvalEvidenceSourceProvenance(source);
  if (provenance === "user_selected") return 50;
  if (provenance === "system_verified") return 40;
  if (provenance === "document_link") return 30;
  if (provenance === "citation") return 20;
  return 10;
}

function documentFactOccurrences(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
  fallback: readonly ApprovalEvidenceFact[],
): readonly ApprovalEvidenceFact[] {
  const found = new Map<string, ApprovalEvidenceFact>();
  for (const block of document.blocks) {
    const text = blockText(block);
    for (const fact of extractProfileApprovalFactsFromText(text, profileId)) {
      const withLocation = Object.freeze({ ...fact, blockId: block.id, excerpt: text });
      found.set(`${fact.field}:${normalizeFact(fact.value)}:${block.id}`, withLocation);
    }
  }
  for (const fact of fallback) {
    const key = `${fact.field}:${normalizeFact(fact.value)}:${fact.blockId ?? ""}`;
    if (!found.has(key)) found.set(key, fact);
  }
  return Object.freeze([...found.values()]);
}

function pageEligible(
  profileId: ApprovalPolicyProfileId,
  page: ApprovalSourcePage | undefined,
): page is ApprovalSourcePage {
  return Boolean(
    page
    && !page.fetchError
    && page.status >= 200
    && page.status < 400
    && securePage(page)
    && extractedPage(page)
    && page.text.trim().length >= 200
    && officialSourceAllowed(profileId, page),
  );
}

function securePage(page: ApprovalSourcePage): boolean {
  try {
    return new URL(page.finalUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function extractedPage(page: ApprovalSourcePage): boolean {
  if (page.extractionStatus) return page.extractionStatus === "extracted";
  return /(?:text\/(?:html|plain|csv|xml)|application\/(?:xhtml\+xml|json|xml)|\+json|\+xml)/iu.test(page.contentType);
}

function normalizePage(page: ApprovalSourcePage): ApprovalSourcePage {
  return Object.freeze({
    ...page,
    requestedUrl: canonicalizeApprovalEvidenceUrl(page.requestedUrl),
    finalUrl: canonicalizeApprovalEvidenceUrl(page.finalUrl),
  });
}

function uncoveredScore(
  facts: readonly ApprovalEvidenceFact[],
  required: ReadonlySet<string>,
  covered: ReadonlySet<string>,
): number {
  return new Set(facts.map((fact) => fact.field)
    .filter((field) => required.has(field) && !covered.has(field))).size;
}

function mergeFacts(...collections: readonly (readonly ApprovalEvidenceFact[])[]): readonly ApprovalEvidenceFact[] {
  const found = new Map<string, ApprovalEvidenceFact>();
  for (const fact of collections.flat()) {
    const key = `${fact.field}:${normalizeFact(fact.value)}:${fact.blockId ?? ""}`;
    if (!found.has(key)) found.set(key, fact);
  }
  return Object.freeze([...found.values()]);
}

function candidateDiagnostic(
  source: ApprovalEvidenceSource,
  canonicalUrl: string,
  page: ApprovalSourcePage | undefined,
  profileId: ApprovalPolicyProfileId,
  checkedAt: string,
): ApprovalEvidenceSource {
  if (!page || page.fetchError || page.extractionStatus === "unavailable") {
    return candidateWithStatus(source, canonicalUrl, checkedAt, "unreachable", page?.fetchError || page?.extractionReason || "출처 페이지를 불러오지 못했습니다.", page);
  }
  if (page.status < 200 || page.status >= 400 || !securePage(page)) {
    return candidateWithStatus(source, canonicalUrl, checkedAt, "unreachable", `HTTPS 공개 페이지로 정상 응답하지 않았습니다 (HTTP ${page.status}).`, page);
  }
  if (page.extractionStatus === "too_large") {
    return candidateWithStatus(source, canonicalUrl, checkedAt, "content_too_large", page.extractionReason || "출처 응답이 검증 허용 크기를 초과했습니다.", page);
  }
  if (page.extractionStatus === "malformed") {
    return candidateWithStatus(source, canonicalUrl, checkedAt, "malformed_content", page.extractionReason || "출처 문서가 손상되었거나 형식 규칙에 맞지 않습니다.", page);
  }
  if (page.extractionStatus === "empty") {
    return candidateWithStatus(source, canonicalUrl, checkedAt, "empty_content", page.extractionReason || "출처 본문이 비어 있습니다.", page);
  }
  if (page.extractionStatus === "unsupported" || !extractedPage(page)) {
    return candidateWithStatus(source, canonicalUrl, checkedAt, "unsupported_content_type", page.extractionReason || "출처 문서 형식을 지원하지 않습니다.", page);
  }
  if (!officialSourceAllowed(profileId, page)) {
    return candidateWithStatus(source, canonicalUrl, checkedAt, "unofficial_source", "적용 프로필의 공식 출처로 확인되지 않았습니다.", page);
  }
  return excludedCandidate(source, canonicalUrl, checkedAt, page);
}

function candidateWithStatus(
  source: ApprovalEvidenceSource,
  canonicalUrl: string,
  checkedAt: string,
  verificationStatus: ApprovalEvidenceVerificationStatus,
  failureReason: string,
  page?: ApprovalSourcePage,
): ApprovalEvidenceSource {
  const accessVerificationStatus = verificationStatus === "unreachable" ? "failed" as const : "verified" as const;
  const officialDomainVerificationStatus = verificationStatus === "unofficial_source" ? "failed" as const : "not_evaluated" as const;
  return Object.freeze({
    ...source,
    url: canonicalUrl,
    canonicalUrl,
    verified: false,
    selected: false,
    ...(page?.finalUrl ? { finalUrl: page.finalUrl } : {}),
    ...(page?.status !== undefined ? { httpStatus: page.status } : {}),
    ...(page?.contentType ? { contentType: page.contentType } : {}),
    ...(page?.documentFormat ? { documentFormat: page.documentFormat } : {}),
    ...(page?.extractionStatus ? { extractionStatus: page.extractionStatus } : {}),
    ...(page?.extractionReason ? { extractionReason: page.extractionReason } : {}),
    ...(page?.contentLength !== undefined ? { contentLength: page.contentLength } : {}),
    verificationStatus,
    accessVerificationStatus,
    officialDomainVerificationStatus,
    claimVerificationStatus: "not_evaluated",
    failureReason,
    checkedAt,
  });
}

function excludedCandidate(
  source: ApprovalEvidenceSource,
  canonicalUrl: string,
  checkedAt: string,
  page?: ApprovalSourcePage,
): ApprovalEvidenceSource {
  return Object.freeze({
    ...source,
    url: canonicalUrl,
    canonicalUrl,
    verified: false,
    selected: false,
    ...(page?.finalUrl ? { finalUrl: page.finalUrl } : {}),
    ...(page?.status !== undefined ? { httpStatus: page.status } : {}),
    ...(page?.contentType ? { contentType: page.contentType } : {}),
    ...(page?.documentFormat ? { documentFormat: page.documentFormat } : {}),
    ...(page?.extractionStatus ? { extractionStatus: page.extractionStatus } : {}),
    ...(page?.extractionReason ? { extractionReason: page.extractionReason } : {}),
    ...(page?.contentLength !== undefined ? { contentLength: page.contentLength } : {}),
    verificationStatus: "excluded",
    accessVerificationStatus: "verified",
    officialDomainVerificationStatus: "verified",
    claimVerificationStatus: "not_evaluated",
    failureReason: "검색 후보이며 이번 원고의 필수 Claim을 뒷받침하는 최종 근거로 선택되지 않아 승인 판정에서 제외했습니다.",
    checkedAt,
  });
}

function duplicateCandidate(
  source: ApprovalEvidenceSource,
  canonicalUrl: string,
  checkedAt: string,
): ApprovalEvidenceSource {
  return Object.freeze({
    ...source,
    url: canonicalUrl,
    canonicalUrl,
    verified: false,
    selected: false,
    verificationStatus: "duplicate_source",
    accessVerificationStatus: "not_evaluated",
    officialDomainVerificationStatus: "not_evaluated",
    claimVerificationStatus: "not_evaluated",
    failureReason: "동일한 canonical 공식 출처가 이미 후보 풀에 있어 중복 후보로 제외했습니다.",
    checkedAt,
  });
}

function extractInformationAsOf(document: ContentDocument): string | undefined {
  const text = document.blocks.map(blockText).join("\n");
  const match = /정보\s*기준일\s*(?:은|는|이|가)?\s*[:：]?\s*(20\d{2})\s*(?:년|[-./])\s*(\d{1,2})(?:\s*(?:월|[-./])\s*(\d{1,2})\s*(?:일)?)?/iu.exec(text);
  if (!match) return undefined;
  const year = match[1];
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : undefined;
  if (!year || month < 1 || month > 12 || (day !== undefined && (day < 1 || day > 31))) return undefined;
  return day === undefined
    ? `${year}-${String(month).padStart(2, "0")}`
    : `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function blockText(block: ContentDocument["blocks"][number]): string {
  if (block.type === "heading" || block.type === "paragraph") return block.text;
  if (block.type === "list") return serializeStructuredList(block);
  if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()].join("\n");
  if (block.type === "button") return `${block.label}\n${block.targetUrl}`;
  if (block.type === "image") return `${block.alt}\n${block.prompt ?? ""}`;
  return block.source;
}

function normalizeFact(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function trimSourceUrl(value: string): string {
  return value.replace(/[.,;:!?]+$/gu, "");
}

function lawSourceIdentity(
  url: URL,
  endpoint: string,
): Readonly<{ key: string; value: string }> | undefined {
  if (endpoint === "lslinkcommoninfo.do" || endpoint === "lslawlinkinfo.do") {
    const article = queryValue(url, "lsJoLnkSeq");
    if (article) return Object.freeze({ key: "lsJoLnkSeq", value: article });
    const pattern = queryValue(url, "lspttninfSeq");
    if (pattern) return Object.freeze({ key: "lspttninfSeq", value: pattern });
  }
  if (endpoint === "expcinfop.do") {
    const interpretation = queryValue(url, "expcSeq");
    if (interpretation) return Object.freeze({ key: "expcSeq", value: interpretation });
  }
  return undefined;
}

function queryValue(url: URL, name: string): string | undefined {
  const expected = name.toLocaleLowerCase("en-US");
  for (const [key, value] of url.searchParams) {
    if (key.toLocaleLowerCase("en-US") === expected && value.trim()) return value.trim();
  }
  return undefined;
}

const lawEndpointPaths: Readonly<Record<string, string>> = Object.freeze({
  "lslinkcommoninfo.do": "/lsLinkCommonInfo.do",
  "lslawlinkinfo.do": "/lsLawLinkInfo.do",
  "expcinfop.do": "/expcInfoP.do",
  "lsinfop.do": "/lsInfoP.do",
});
