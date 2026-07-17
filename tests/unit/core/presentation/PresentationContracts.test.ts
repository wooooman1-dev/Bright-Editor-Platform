import { describe, expect, it } from "vitest";

import {
  brightSemanticRoles,
  platformIds,
  validatePresentationDocument,
  type PresentationDocument,
} from "../../../../core/presentation";

function validDocument(): PresentationDocument {
  return {
    id: "presentation-1",
    schemaVersion: 1,
    workspaceId: "workspace-1",
    projectId: "project-1",
    sourceContentId: "content-1",
    sourceContentVersion: 0,
    targetPlatform: "tistory",
    themeReference: { themeProfileId: "bright-default", themeProfileVersion: 1 },
    resolvedThemeHash: "theme-hash",
    nodes: [
      {
        id: "node-1",
        nodeType: "component",
        componentId: "bright.notice",
        componentSchemaVersion: 1,
        semanticRole: "notice",
        variant: "default",
        sourceBlockIds: ["block-1"],
        props: { text: "안내" },
        fallbackPolicy: { mode: "semantic", fallbackElement: "aside" },
      },
      {
        id: "node-2",
        nodeType: "semantic_fallback",
        semanticRole: "standard_content",
        sourceBlockIds: ["block-2"],
        fallbackElement: "section",
        reason: "No specialized component was requested.",
      },
    ],
    presentationPolicyVersion: 1,
    componentRegistryVersion: 1,
    themeTokenVersion: 1,
    htmlContractVersion: 1,
    warnings: [],
    createdAt: "2026-07-17T00:00:00.000Z",
  };
}

describe("Presentation contract foundation", () => {
  it("exposes only approved platform identities and semantic roles", () => {
    expect(platformIds).toEqual(["tistory", "wordpress", "youtube", "naver_cafe", "blog", "shopping"]);
    expect(brightSemanticRoles).toContain("call_to_action");
    expect(brightSemanticRoles).toContain("image_figure");
    expect(brightSemanticRoles).not.toContain("blue_card");
  });

  it("accepts a valid platform-independent PresentationDocument", () => {
    expect(validatePresentationDocument(validDocument())).toEqual({ valid: true, issues: [] });
  });

  it("does not mutate the document while validating", () => {
    const document = validDocument();
    const before = JSON.stringify(document);
    validatePresentationDocument(document);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("requires every node to trace at least one non-empty source block", () => {
    const document = validDocument();
    const invalid = {
      ...document,
      nodes: [
        { ...document.nodes[0], sourceBlockIds: [] },
        { ...document.nodes[1], sourceBlockIds: [" "] },
      ],
    } as PresentationDocument;
    const result = validatePresentationDocument(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("source_block");
  });

  it("rejects invalid versions and missing component identity", () => {
    const document = validDocument();
    const invalid = {
      ...document,
      schemaVersion: 0,
      componentRegistryVersion: -1,
      nodes: [{ ...document.nodes[0], componentId: "", variant: "", componentSchemaVersion: 0 }],
    } as PresentationDocument;
    const result = validatePresentationDocument(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "version")).toBe(true);
    expect(result.issues.filter((issue) => issue.code === "component")).toHaveLength(2);
  });

  it("rejects platform HTML or CSS fields stored on PresentationDocument", () => {
    const invalid = { ...validDocument(), html: "<script>alert(1)</script>", css: "body{}" } as PresentationDocument;
    const result = validatePresentationDocument(invalid);
    expect(result.issues.filter((issue) => issue.code === "forbidden_field").map((issue) => issue.path)).toEqual(["html", "css"]);
  });
});
