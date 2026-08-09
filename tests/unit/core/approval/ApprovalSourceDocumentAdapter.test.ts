import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  approvalSourceDocumentFormats,
  type ApprovalSourceExtractionStatus,
} from "../../../../core/approval/ApprovalSourceDocumentAdapter";
import { normalizeApprovalSourceDocumentServer as normalizeApprovalSourceDocument } from "../../../../core/approval/ApprovalSourceDocumentServerAdapter";

const statuses = new Set<ApprovalSourceExtractionStatus>([
  "extracted",
  "empty",
  "unsupported",
  "too_large",
  "malformed",
  "unavailable",
]);

function input(
  body: string | Uint8Array,
  contentType: string,
  overrides: Partial<Parameters<typeof normalizeApprovalSourceDocument>[0]> = {},
) {
  return {
    requestedUrl: "https://law.go.kr/source",
    finalUrl: "https://law.go.kr/source",
    status: 200,
    contentType,
    bytes: typeof body === "string" ? new TextEncoder().encode(body) : body,
    ...overrides,
  };
}

describe("ApprovalSourceDocumentAdapter", () => {
  it("extracts safe text and metadata from HTML", () => {
    const result = normalizeApprovalSourceDocument(input(
      "<!doctype html><html><head><title>공식 조문</title><meta property=\"og:site_name\" content=\"국가법령정보센터\"></head><body><script>ignore()</script><main>방문판매 등에 관한 법률 제2조 계속거래 정의와 계약 기준입니다.</main></body></html>",
      "text/html; charset=utf-8",
    ));

    expect(result).toMatchObject({
      format: "html",
      extractionStatus: "extracted",
      title: "공식 조문",
      publisher: "국가법령정보센터",
    });
    expect(result.text).toContain("계속거래 정의");
    expect(result.text).not.toContain("ignore()");
  });

  it("keeps visible headings in the canonical HTML document text", () => {
    const result = normalizeApprovalSourceDocument(input(
      "<html><head><title>Metadata title</title></head><body><h2>Visible legal heading</h2><p>Body passage with enough text for extraction.</p></body></html>",
      "text/html; charset=utf-8",
    ));

    expect(result.text).toContain("Visible legal heading");
    expect(result.text).not.toContain("Metadata title");
  });

  it("sniffs and extracts textual bodies even when the MIME header is generic", () => {
    const result = normalizeApprovalSourceDocument(input(
      "공식 기관 안내\n지원 대상과 신청 기간 및 금액 기준을 설명하는 공개 문서입니다.",
      "application/octet-stream",
    ));

    expect(result).toMatchObject({ format: "plain_text", extractionStatus: "extracted" });
  });

  it("flattens JSON, XML, and CSV into deterministic Claim text", () => {
    const json = normalizeApprovalSourceDocument(input(
      JSON.stringify({ title: "공식 지원 기준", eligibility: "대한민국 거주자", amount: "10만원" }),
      "application/json",
    ));
    const xml = normalizeApprovalSourceDocument(input(
      "<?xml version=\"1.0\"?><document><title>공식 시행령</title><threshold>금액 10만원 기간 3개월</threshold></document>",
      "application/xml",
    ));
    const csv = normalizeApprovalSourceDocument(input(
      "field,value\namount,10만원\nperiod,3개월\n",
      "text/csv",
    ));

    expect(json).toMatchObject({ format: "json", extractionStatus: "extracted", title: "공식 지원 기준" });
    expect(json.text).toContain("eligibility: 대한민국 거주자");
    expect(xml).toMatchObject({ format: "xml", extractionStatus: "extracted", title: "공식 시행령" });
    expect(xml.text).toContain("금액 10만원 기간 3개월");
    expect(csv).toMatchObject({ format: "csv", extractionStatus: "extracted" });
    expect(csv.text).toContain("amount | 10만원");
  });

  it("extracts direct and Flate-compressed text-layer PDFs and rejects an image-only PDF", () => {
    const textPdf = normalizeApprovalSourceDocument(input(
      "%PDF-1.4\n1 0 obj<</Title (Official Claim)>>endobj\nBT (Continuing transaction official claim text with enough readable evidence for deterministic comparison.) Tj ET\n%%EOF",
      "application/pdf",
    ));
    const compressedText = deflateSync(Buffer.from(
      "BT (Compressed official claim text with enough evidence for deterministic comparison.) Tj ET",
      "latin1",
    ));
    const compressedPdf = new Uint8Array([
      ...new TextEncoder().encode("%PDF-1.7\n1 0 obj<</Filter/FlateDecode/Length 99>>\nstream\n"),
      ...compressedText,
      ...new TextEncoder().encode("\nendstream\n%%EOF"),
    ]);
    const imagePdf = normalizeApprovalSourceDocument(input(
      new TextEncoder().encode("%PDF-1.7\n1 0 obj<</Filter/FlateDecode/Length 99>>stream\nx\u009c\u0000\u0001\u0002\nendstream\n%%EOF"),
      "application/pdf",
    ));
    const compressed = normalizeApprovalSourceDocument(input(compressedPdf, "application/pdf"));

    expect(textPdf).toMatchObject({ format: "pdf", extractionStatus: "extracted", title: "Official Claim" });
    expect(textPdf.text).toContain("deterministic comparison");
    expect(compressed).toMatchObject({ format: "pdf", extractionStatus: "extracted" });
    expect(compressed.text).toContain("Compressed official claim text");
    expect(imagePdf).toMatchObject({ format: "pdf", extractionStatus: "unsupported" });
  });

  it("classifies malformed, empty, oversized, binary, and unavailable inputs without throwing", () => {
    const malformed = normalizeApprovalSourceDocument(input("{not-json", "application/json"));
    const empty = normalizeApprovalSourceDocument(input("", "text/html"));
    const oversized = normalizeApprovalSourceDocument(input("<html>prefix</html>", "text/html", { tooLarge: true }));
    const binary = normalizeApprovalSourceDocument(input(new Uint8Array([0, 1, 2, 3, 255, 0, 17]), "application/octet-stream"));
    const unavailable = normalizeApprovalSourceDocument(input("", "", { status: 0, fetchError: "Timeout" }));

    expect(malformed.extractionStatus).toBe("malformed");
    expect(empty.extractionStatus).toBe("empty");
    expect(oversized.extractionStatus).toBe("too_large");
    expect(binary.extractionStatus).toBe("unsupported");
    expect(unavailable.extractionStatus).toBe("unavailable");
  });

  it("decodes named character references instead of leaking the entity name as text", () => {
    const result = normalizeApprovalSourceDocument(input(
      "<html><body><p>월세액 지급 증빙 서류 &rarr; 연말정산 시 회사에 제출</p>"
      + "<p>기준&middot;요건 &ndash; &ldquo;대통령령&rdquo; &nbsp;&hellip; 100&deg;</p></body></html>",
      "text/html",
    ));

    expect(result.extractionStatus).toBe("extracted");
    expect(result.text).toContain("증빙 서류 → 연말정산");
    expect(result.text).toContain("기준·요건 – “대통령령”");
    // The entity names themselves must never survive into evidence text.
    expect(result.text).not.toMatch(/\b(?:rarr|middot|ndash|ldquo|rdquo|hellip|deg)\b/u);
  });

  it("drops an unknown named reference rather than inlining its letters", () => {
    const result = normalizeApprovalSourceDocument(input(
      "<html><body><p>공제 대상&notarealentity;여부를 확인</p></body></html>",
      "text/html",
    ));

    expect(result.text).not.toContain("notarealentity");
    expect(result.text).toContain("공제 대상");
    expect(result.text).toContain("여부를 확인");
  });

  it("does not re-decode a character reference produced by decoding another", () => {
    const result = normalizeApprovalSourceDocument(input(
      "<html><body><p>literal &amp;rarr; stays literal</p></body></html>",
      "text/html",
    ));

    expect(result.text).toContain("&rarr;");
    expect(result.text).not.toContain("→");
  });

  it("assigns every deterministic byte sequence one terminal state and never throws", () => {
    let seed = 0x13579bdf;
    for (let caseIndex = 0; caseIndex < 256; caseIndex += 1) {
      const length = caseIndex % 97;
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        bytes[index] = seed & 0xff;
      }
      const result = normalizeApprovalSourceDocument(input(bytes, caseIndex % 2 ? "application/octet-stream" : ""));
      expect(approvalSourceDocumentFormats).toContain(result.format);
      expect(statuses.has(result.extractionStatus)).toBe(true);
      expect(result.contentLength).toBe(length);
    }
  });
});
