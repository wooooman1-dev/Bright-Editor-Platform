import { opportunityEvidenceLabel, type ContentOpportunityCandidate, type OpportunityEvidence } from "../../core/content";

const providerLabels: Readonly<Record<string, string>> = Object.freeze({
  googleSearchConsole: "Google Search Console",
  googleAnalytics4: "Google Analytics 4",
  googleAdSense: "Google AdSense",
  youtubeAnalytics: "YouTube Analytics",
  naverSearchTrend: "NAVER 검색 트렌드",
  googleAdsKeywordPlanning: "Google Ads 키워드 플래닝",
  googleTrendsOfficial: "Google Trends 공식 데이터",
  brightStudio: "Bright Studio 내부 데이터",
});

const evidenceTypeLabels: Readonly<Record<string, string>> = Object.freeze({
  contentGap: "콘텐츠 공백",
  internalLinkOpportunity: "내부 링크 기회",
  clusterOpportunity: "콘텐츠 클러스터",
  searchPerformance: "검색 성과",
  searchDemand: "검색 수요",
  relativeTrend: "상대 검색 추세",
  risingTrend: "상승 추세",
  keywordCompetition: "광고 경쟁",
  commercialIntent: "상업 의도",
  pageEngagement: "페이지 참여",
  revenuePerformance: "수익 성과",
  videoPerformance: "동영상 성과",
  editorialInference: "편집 추론",
});

const metricLabels: Readonly<Record<string, string>> = Object.freeze({
  searchTrendRatio: "상대 검색 추세 지수",
  trendChange: "상대 추세 변화율",
  clicks: "클릭 수",
  impressions: "노출 수",
  ctr: "클릭률",
  position: "평균 게재순위",
  pageViews: "페이지 조회 수",
  activeUsers: "활성 사용자 수",
  sessions: "세션 수",
  userEngagementDuration: "사용자 참여 시간",
  views: "조회 수",
  estimatedMinutesWatched: "예상 시청 시간",
  likes: "좋아요 수",
  comments: "댓글 수",
  shares: "공유 수",
  subscribersGained: "구독자 증가",
  subscribersLost: "구독자 감소",
});

const unitLabels: Readonly<Record<string, string>> = Object.freeze({
  relativeRatio: "상대 지수",
  relativeChangeRate: "상대 변화율",
  publishedContentCount: "공개 콘텐츠 수",
  verifiedPublicContentCount: "확인된 공개 콘텐츠 수",
  verifiedPublicPage: "확인된 공개 페이지",
  siteImpressions: "사이트 노출 수",
  clicks: "클릭",
  ratio: "비율",
  count: "건",
  seconds: "초",
  minutes: "분",
  providerCurrency: "데이터 제공자 통화",
});

const limitationTranslations = Object.freeze([
  ["NAVER Search Trend ratios are relative trend indices, not absolute search volume.", "NAVER 검색 트렌드는 절대 검색량이 아닌 상대 추세 지수입니다."],
  ["NAVER ratio is a relative trend index and is not absolute search volume.", "NAVER 검색 트렌드는 절대 검색량이 아닌 상대 추세 지수입니다."],
  ["NAVER ratio is relative and is not absolute search volume.", "NAVER 검색 트렌드는 절대 검색량이 아닌 상대 추세 지수입니다."],
  ["A rising relative trend does not establish absolute market size.", "상승 추세만으로 절대적인 시장 규모를 확정할 수 없습니다."],
  ["Internal growth Evidence is not external market demand.", "Bright Studio 내부 성장 근거는 외부 시장 수요를 뜻하지 않습니다."],
  ["External growth Evidence is not external market demand.", "외부 성장 근거만으로 시장 수요를 확정할 수 없습니다."],
  ["A dedicated Content Library projection is not implemented; only current Project metadata and verified public URLs are used.", "전용 콘텐츠 라이브러리 분석은 아직 구현되지 않아 현재 프로젝트 메타데이터와 확인된 공개 URL만 사용합니다."],
  ["This Evidence identifies a verified public internal-link target; it does not measure search volume.", "이 근거는 확인된 공개 내부 링크 후보를 나타내며 검색량을 측정하지 않습니다."],
  ["Keyword competition and opportunity are AI estimates, not measured search-volume, CPC, or competition data.", "키워드 경쟁과 기회 판단은 AI 추정이며, 측정된 검색량·CPC·경쟁 데이터가 아닙니다."],
  ["Search Console impressions are this site's search-result impressions, not total monthly search volume.", "Search Console 노출은 이 사이트의 검색 결과 노출이며 전체 월간 검색량이 아닙니다."],
  ["Search Console impressions are site performance, not total market demand.", "Search Console 노출은 해당 사이트의 검색 성과이며 전체 시장 수요가 아닙니다."],
  ["GA4 page and engagement metrics describe site performance, not search-market demand.", "GA4 페이지·참여 지표는 사이트 성과이며 검색 시장 수요가 아닙니다."],
  ["Key events are shown only when the GA4 property actually returns configured key-event data.", "주요 이벤트는 GA4 속성이 구성된 이벤트 데이터를 실제로 반환할 때만 표시됩니다."],
  ["AdSense metrics are limited to the provider's returned site/domain scope; they are not attributed to individual posts.", "AdSense 지표는 데이터 제공자가 반환한 사이트·도메인 범위이며 개별 글 성과로 귀속되지 않습니다."],
  ["AdSense metrics are account-level and are not attributed to individual posts.", "AdSense 지표는 계정 단위이며 개별 글 성과로 귀속되지 않습니다."],
  ["CPC or RPM is not converted into predicted post revenue.", "CPC나 RPM을 글의 예상 수익으로 환산하지 않습니다."],
  ["YouTube Analytics values describe the selected channel's observed performance; they are not external search demand.", "YouTube Analytics 값은 선택한 채널의 관측 성과이며 외부 검색 수요가 아닙니다."],
  ["Monetary metrics are not requested by this connection.", "이 연결은 수익 지표를 요청하지 않습니다."],
  ["The official NAVER Search Trend API does not apply the stored region preference; results are not region-filtered.", "NAVER 검색 트렌드 공식 API에는 저장된 지역 설정이 적용되지 않아 결과가 지역별로 필터링되지 않습니다."],
] as const);

export function formatOpportunityConfidence(value: number): string {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return `${Math.round(normalized * 100)}%`;
}

export function contentDepthLabel(value: string): string {
  return ({
    quick: "핵심 요약 가이드",
    standard: "핵심 문제 해결 가이드",
    deep: "심층 가이드",
    comparison: "비교·선택 가이드",
  } as const)[value as "quick" | "standard" | "deep" | "comparison"] ?? contentTypeLabel(value);
}

export function contentTypeLabel(value: string): string {
  return ({
    how_to: "실행 방법",
    comparison: "비교·선택 가이드",
    guide: "가이드",
    article: "정보 글",
    informational: "정보 안내",
  } as const)[value as "how_to" | "comparison" | "guide" | "article" | "informational"] ?? value;
}

export function topicComplexityLabel(value: ContentOpportunityCandidate["qualityTarget"]["topicComplexity"]): string {
  return ({ low: "낮음", moderate: "보통", high: "높음" } as const)[value];
}

export function freshnessLabel(value: ContentOpportunityCandidate["freshness"]): string {
  return value === "fresh" ? "최신" : value === "aging" ? "갱신 권장" : value === "stale" ? "오래됨" : "확인 불가";
}

export function providerLabel(value: string | undefined): string {
  return value ? providerLabels[value] ?? "기타 데이터 출처" : "데이터 출처 미확인";
}

export function platformLabel(value: string): string {
  return ({ tistory: "Tistory", wordpress: "WordPress", youtube: "YouTube", naver_cafe: "NAVER 카페", canonical: "공통 원고" } as const)[value as "tistory" | "wordpress" | "youtube" | "naver_cafe" | "canonical"] ?? value;
}

export function evidenceTypeLabel(value: string): string {
  return evidenceTypeLabels[value] ?? "기타 근거";
}

export function formatOpportunityEvidenceSummary(value: OpportunityEvidence): string {
  const source = value.provider ? providerLabel(value.provider) : opportunityEvidenceLabel(value.source);
  const parts = value.summary.split(" · ").map(formatSummaryPart).filter(Boolean);
  return [source, ...parts.filter((part, index) => !(index === 0 && part === source))].join(" · ");
}

export function formatEvidenceLimitations(values: readonly (string | undefined)[]): readonly string[] {
  const result: string[] = [];
  values.forEach((value) => {
    let remaining = value?.trim() ?? "";
    if (!remaining) return;
    limitationTranslations.forEach(([source, translated]) => {
      if (!remaining.includes(source)) return;
      result.push(translated);
      remaining = remaining.replaceAll(source, " ");
    });
    remaining = remaining.replace(/\s+/g, " ").trim();
    if (remaining) result.push(remaining.replaceAll("Evidence", "근거").replaceAll("evidence", "근거").replaceAll("Project", "프로젝트").replaceAll("stale", "오래됨"));
  });
  return Object.freeze([...new Set(result)]);
}

function formatSummaryPart(value: string): string {
  const part = value.trim();
  if (!part) return "";
  if (providerLabels[part]) return providerLabels[part];
  if (evidenceTypeLabels[part]) return evidenceTypeLabels[part];
  if (metricLabels[part]) return metricLabels[part];
  if (unitLabels[part]) return unitLabels[part];
  const measured = part.match(/^(.+?)\s+([A-Za-z][A-Za-z0-9]*)$/);
  return measured && unitLabels[measured[2]] ? `${measured[1]} ${unitLabels[measured[2]]}` : part;
}
