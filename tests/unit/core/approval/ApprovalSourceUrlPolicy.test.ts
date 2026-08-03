import { describe, expect, it } from "vitest";

import { evaluateApprovalSourceUrlSafety } from "../../../../core/approval";

describe("ApprovalSourceUrlPolicy", () => {
  it.each([
    "http://law.go.kr/source",
    "ftp://law.go.kr/source",
    "https://user:secret@law.go.kr/source",
    "https://law.go.kr:8443/source",
    "https://localhost/source",
    "https://service.internal/source",
    "https://127.0.0.1/source",
    "https://10.0.0.1/source",
    "https://169.254.169.254/latest/meta-data",
    "https://172.16.0.1/source",
    "https://192.168.1.1/source",
    "https://[::1]/source",
    "https://[fd00::1]/source",
    "https://[fe80::1]/source",
    "https://[2001:db8::1]/source",
    "https://metadata.google.internal/computeMetadata/v1",
  ])("blocks unsafe network target %s", (url) => {
    const result = evaluateApprovalSourceUrlSafety(url);
    expect(result.safe).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it.each([
    "https://law.go.kr/LSW/lsInfoP.do?lsiSeq=1",
    "https://www.kdic.or.kr/guide",
    "https://www.nga.gov/artworks/1/example.html",
    "https://203.0.114.1/public",
    "https://[2001:4860:4860::8888]/public",
  ])("allows syntactically safe public HTTPS target %s", (url) => {
    const result = evaluateApprovalSourceUrlSafety(url);
    expect(result).toMatchObject({ safe: true });
    expect(result.normalizedUrl).toMatch(/^https:\/\//u);
  });

  it("never throws for malformed or unusual URL input", () => {
    const inputs = ["", "not a url", "https://", "\u0000", "https://exa mple.com", "https://[]/"];
    for (const value of inputs) {
      expect(() => evaluateApprovalSourceUrlSafety(value)).not.toThrow();
      expect(evaluateApprovalSourceUrlSafety(value).safe).toBe(false);
    }
  });
});
