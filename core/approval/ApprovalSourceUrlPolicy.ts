export type ApprovalSourceUrlSafety = Readonly<{
  safe: boolean;
  normalizedUrl?: string;
  reason?: string;
}>;

/**
 * Rejects URL forms that must never be fetched by the Evidence verifier.
 *
 * This is a deterministic network-boundary check, not an official-source trust
 * decision. Official-domain policy is evaluated separately after extraction.
 */
export function evaluateApprovalSourceUrlSafety(value: string): ApprovalSourceUrlSafety {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return blocked("URL 형식이 올바르지 않습니다.");
  }

  if (url.protocol !== "https:") return blocked("HTTPS 출처만 검사할 수 있습니다.");
  if (url.username || url.password) return blocked("사용자 인증정보가 포함된 URL은 검사할 수 없습니다.");
  if (url.port && url.port !== "443") return blocked("HTTPS 기본 포트가 아닌 URL은 검사할 수 없습니다.");

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) return blocked("출처 호스트가 비어 있습니다.");
  if (blockedHostname(hostname)) return blocked("로컬·사설·예약 네트워크 호스트는 검사할 수 없습니다.");

  const ipv4 = parseIpv4(hostname);
  if (ipv4 && blockedIpv4(ipv4)) return blocked("로컬·사설·예약 IPv4 주소는 검사할 수 없습니다.");
  if (hostname.includes(":") && blockedIpv6(hostname)) {
    return blocked("로컬·사설·예약 IPv6 주소는 검사할 수 없습니다.");
  }
  if (!ipv4 && !hostname.includes(":") && !hostname.includes(".")) {
    return blocked("공개 도메인으로 확인할 수 없는 단일 호스트명입니다.");
  }

  url.hostname = hostname;
  url.hash = "";
  return Object.freeze({ safe: true, normalizedUrl: url.toString() });
}

function blocked(reason: string): ApprovalSourceUrlSafety {
  return Object.freeze({ safe: false, reason });
}

function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .replace(/\.$/u, "");
}

function blockedHostname(hostname: string): boolean {
  if (blockedExactHosts.has(hostname)) return true;
  return blockedSuffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
}

function parseIpv4(hostname: string): readonly number[] | undefined {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return undefined;
  const parts = hostname.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return Object.freeze(parts);
}

function blockedIpv4(parts: readonly number[]): boolean {
  const [a = 0, b = 0] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && parts[2] === 2)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && parts[2] === 100)
    || (a === 203 && b === 0 && parts[2] === 113)
    || a >= 224;
}

function blockedIpv6(hostname: string): boolean {
  const value = hostname.toLocaleLowerCase("en-US");
  if (value === "::" || value === "::1") return true;
  if (/^(?:fc|fd)/u.test(value)) return true;
  if (/^fe[89ab]/u.test(value)) return true;
  if (/^2001:db8(?::|$)/u.test(value)) return true;

  const mapped = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(value)?.[1];
  const ipv4 = mapped ? parseIpv4(mapped) : undefined;
  return Boolean(ipv4 && blockedIpv4(ipv4));
}

const blockedExactHosts = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data",
  "kubernetes.default",
]);

const blockedSuffixes = Object.freeze([
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".test",
  ".invalid",
  ".example",
  ".onion",
]);
