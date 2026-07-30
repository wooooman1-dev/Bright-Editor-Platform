import type { PlatformConnection } from "../../../core/connections";
import type { SiteApprovalReadinessSnapshot } from "../../../core/approval";

export const wordpressManualSiteReviewKeys = Object.freeze([
  "theme_plugin_review",
  "mobile_visual_review",
  "performance_review",
  "copyright_review",
  "site_quality_consistency",
  "search_console_review",
] as const);

export type WordPressManualSiteReviewKey =
  (typeof wordpressManualSiteReviewKeys)[number];

type SiteCheck = SiteApprovalReadinessSnapshot["checks"][number] & Readonly<{
  reviewedAt?: string;
}>;

export type IdentifiedSiteApprovalReadinessSnapshot =
  SiteApprovalReadinessSnapshot & Readonly<{
    platform?: "wordpress";
    connectionId?: string;
    siteUrl?: string;
    checks: readonly SiteCheck[];
  }>;

export function isWordPressManualSiteReviewKey(
  value: string,
): value is WordPressManualSiteReviewKey {
  return (wordpressManualSiteReviewKeys as readonly string[]).includes(value);
}

export function identifyWordPressSiteSnapshot(
  snapshot: SiteApprovalReadinessSnapshot,
  connection: PlatformConnection,
): IdentifiedSiteApprovalReadinessSnapshot {
  return Object.freeze({
    ...snapshot,
    platform: "wordpress",
    connectionId: connection.id,
    siteUrl: connectionSiteUrl(connection),
    checks: Object.freeze(snapshot.checks.map((check) => Object.freeze({ ...check }))),
  });
}

export function mergeWordPressManualReviewsAfterAudit(
  previous: SiteApprovalReadinessSnapshot | undefined,
  audited: SiteApprovalReadinessSnapshot,
  connection: PlatformConnection,
): IdentifiedSiteApprovalReadinessSnapshot {
  const identified = identifyWordPressSiteSnapshot(audited, connection);
  if (!previous || !sameSiteIdentity(previous, connection)) return identified;

  const previousChecks = new Map(
    previous.checks
      .filter((check) => isWordPressManualSiteReviewKey(check.key))
      .map((check) => [check.key, check as SiteCheck]),
  );
  const checks = identified.checks.map((check) => {
    const prior = previousChecks.get(check.key);
    if (!prior?.passed) return check;
    return Object.freeze({
      ...check,
      passed: true,
      message: completedMessage(check.message, prior.reviewedAt),
      ...(prior.reviewedAt ? { reviewedAt: prior.reviewedAt } : {}),
    });
  });

  return Object.freeze({
    ...identified,
    status: resolvedStatus(identified, checks),
    checks: Object.freeze(checks),
  });
}

export function updateWordPressManualReview(
  snapshot: SiteApprovalReadinessSnapshot | undefined,
  connection: PlatformConnection,
  key: WordPressManualSiteReviewKey,
  completed: boolean,
  reviewedAt: string,
): IdentifiedSiteApprovalReadinessSnapshot {
  if (!snapshot) {
    throw new Error("WordPress 사이트 승인 준비 검사를 먼저 실행해 주세요.");
  }
  if (!sameSiteIdentity(snapshot, connection)) {
    throw new Error("WordPress 사이트 또는 연결이 변경되었습니다. 사이트 검사를 다시 실행해 주세요.");
  }

  let found = false;
  const checks = snapshot.checks.map((check) => {
    if (check.key !== key) return Object.freeze({ ...check });
    found = true;
    const baseMessage = stripCompletionMessage(check.message);
    return Object.freeze({
      ...check,
      passed: completed,
      message: completed ? completedMessage(baseMessage, reviewedAt) : baseMessage,
      ...(completed ? { reviewedAt } : {}),
    });
  });
  if (!found) throw new Error("저장할 WordPress 수동 검토 항목을 찾지 못했습니다.");

  const identified = identifyWordPressSiteSnapshot({
    ...snapshot,
    checks: Object.freeze(checks),
  }, connection);
  return Object.freeze({
    ...identified,
    status: resolvedStatus(snapshot, checks),
    checks: Object.freeze(checks),
  });
}

export function connectionSiteUrl(connection: PlatformConnection): string {
  const value = connection.publicMetadata.siteUrl;
  return typeof value === "string" ? normalizeSiteIdentity(value) : "";
}

function sameSiteIdentity(
  snapshot: SiteApprovalReadinessSnapshot,
  connection: PlatformConnection,
): boolean {
  const identified = snapshot as IdentifiedSiteApprovalReadinessSnapshot;
  return identified.platform === "wordpress"
    && identified.connectionId === connection.id
    && Boolean(identified.siteUrl)
    && normalizeSiteIdentity(identified.siteUrl ?? "")
      === connectionSiteUrl(connection);
}

function resolvedStatus(
  previous: SiteApprovalReadinessSnapshot,
  checks: readonly SiteCheck[],
): SiteApprovalReadinessSnapshot["status"] {
  const requiredFailure = checks.some(
    (check) => !check.passed && check.requirement !== "recommended",
  );
  if (!requiredFailure) return "passed";
  return previous.status === "blocked" ? "blocked" : "needs_review";
}

function completedMessage(message: string, reviewedAt?: string): string {
  const base = stripCompletionMessage(message);
  const timestamp = reviewedAt ? ` (${reviewedAt})` : "";
  return `${base} · 사용자 검토 완료${timestamp}`;
}

function stripCompletionMessage(message: string): string {
  return message.replace(/\s*·\s*사용자 검토 완료(?:\s*\([^)]*\))?\s*$/u, "").trim();
}

function normalizeSiteIdentity(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    return url.toString();
  } catch {
    return value.trim();
  }
}
