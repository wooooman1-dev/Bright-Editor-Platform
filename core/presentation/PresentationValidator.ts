import {
  brightSemanticRoles,
  platformIds,
  semanticFallbackElements,
  type PresentationDocument,
  type PresentationNode,
} from "./PresentationModel";

export type PresentationValidationIssueCode =
  | "required"
  | "version"
  | "platform"
  | "semantic_role"
  | "source_block"
  | "component"
  | "fallback"
  | "forbidden_field";

export type PresentationValidationIssue = Readonly<{
  code: PresentationValidationIssueCode;
  path: string;
  message: string;
}>;

export type PresentationValidationResult = Readonly<{
  valid: boolean;
  issues: readonly PresentationValidationIssue[];
}>;

const forbiddenTopLevelFields = ["html", "css", "style", "inlineStyle"] as const;

export function validatePresentationDocument(document: PresentationDocument): PresentationValidationResult {
  const issues: PresentationValidationIssue[] = [];
  required(issues, document.id, "id");
  required(issues, document.workspaceId, "workspaceId");
  required(issues, document.projectId, "projectId");
  required(issues, document.sourceContentId, "sourceContentId");
  required(issues, document.resolvedThemeHash, "resolvedThemeHash");
  required(issues, document.themeReference.themeProfileId, "themeReference.themeProfileId");
  required(issues, document.createdAt, "createdAt");

  positiveVersion(issues, document.schemaVersion, "schemaVersion");
  nonNegativeVersion(issues, document.sourceContentVersion, "sourceContentVersion");
  positiveVersion(issues, document.themeReference.themeProfileVersion, "themeReference.themeProfileVersion");
  positiveVersion(issues, document.presentationPolicyVersion, "presentationPolicyVersion");
  positiveVersion(issues, document.componentRegistryVersion, "componentRegistryVersion");
  positiveVersion(issues, document.themeTokenVersion, "themeTokenVersion");
  positiveVersion(issues, document.htmlContractVersion, "htmlContractVersion");

  if (!platformIds.includes(document.targetPlatform)) {
    issues.push({ code: "platform", path: "targetPlatform", message: "Target platform is not registered." });
  }

  for (const field of forbiddenTopLevelFields) {
    if (Object.prototype.hasOwnProperty.call(document, field)) {
      issues.push({ code: "forbidden_field", path: field, message: "PresentationDocument must not store platform HTML or CSS." });
    }
  }

  document.nodes.forEach((node, index) => validateNode(issues, node, `nodes[${index}]`));

  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

function validateNode(issues: PresentationValidationIssue[], node: PresentationNode, path: string): void {
  required(issues, node.id, `${path}.id`);
  if (!brightSemanticRoles.includes(node.semanticRole)) {
    issues.push({ code: "semantic_role", path: `${path}.semanticRole`, message: "Semantic role is not registered." });
  }
  if (node.sourceBlockIds.length === 0) {
    issues.push({ code: "source_block", path: `${path}.sourceBlockIds`, message: "A presentation node must reference at least one source block." });
  }
  node.sourceBlockIds.forEach((id, index) => required(issues, id, `${path}.sourceBlockIds[${index}]`, "source_block"));

  if (node.nodeType === "component") {
    required(issues, node.componentId, `${path}.componentId`, "component");
    required(issues, node.variant, `${path}.variant`, "component");
    positiveVersion(issues, node.componentSchemaVersion, `${path}.componentSchemaVersion`);
    if (node.fallbackPolicy.mode === "component") required(issues, node.fallbackPolicy.fallbackComponentId, `${path}.fallbackPolicy.fallbackComponentId`, "fallback");
    if (node.fallbackPolicy.mode === "semantic" && !semanticFallbackElements.includes(node.fallbackPolicy.fallbackElement)) {
      issues.push({ code: "fallback", path: `${path}.fallbackPolicy.fallbackElement`, message: "Semantic fallback element is not supported." });
    }
    return;
  }

  required(issues, node.reason, `${path}.reason`, "fallback");
  if (!semanticFallbackElements.includes(node.fallbackElement)) {
    issues.push({ code: "fallback", path: `${path}.fallbackElement`, message: "Semantic fallback element is not supported." });
  }
}

function required(
  issues: PresentationValidationIssue[],
  value: string,
  path: string,
  code: PresentationValidationIssueCode = "required",
): void {
  if (!value.trim()) issues.push({ code, path, message: "A non-empty value is required." });
}

function positiveVersion(issues: PresentationValidationIssue[], value: number, path: string): void {
  if (!Number.isInteger(value) || value <= 0) issues.push({ code: "version", path, message: "Version must be a positive integer." });
}

function nonNegativeVersion(issues: PresentationValidationIssue[], value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0) issues.push({ code: "version", path, message: "Version must be a non-negative integer." });
}
