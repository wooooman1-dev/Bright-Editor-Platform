import { describe, expect, it } from "vitest";
import {
  activeProjectIdForConnection,
  duplicateNormalizedProjectNames,
  projectConnectionBuckets,
  singleProjectIds,
} from "../../../../app/settings/DataSourceProjectAssignmentPolicy";

const connections = Object.freeze([{ id: "health-gsc" }, { id: "finance-gsc" }, { id: "unassigned" }]);
const references = Object.freeze([
  { projectId: "health", connectionId: "health-gsc", enabled: true },
  { projectId: "finance", connectionId: "finance-gsc", enabled: true },
]);

describe("DataSourceProjectAssignmentPolicy", () => {
  it("shows a Project only its assigned connections and globally unassigned connections", () => {
    expect(projectConnectionBuckets(connections, references, "health")).toEqual({
      assigned: [{ id: "health-gsc" }],
      available: [{ id: "unassigned" }],
    });
    expect(projectConnectionBuckets(connections, references, "finance")).toEqual({
      assigned: [{ id: "finance-gsc" }],
      available: [{ id: "unassigned" }],
    });
  });

  it("never exposes another Project owner's connection as available", () => {
    const buckets = projectConnectionBuckets(connections, references, "finance");
    expect(buckets.available.map((connection) => connection.id)).not.toContain("health-gsc");
  });

  it("keeps only one explicit Project assignment", () => {
    expect(singleProjectIds(["health", "finance"])).toEqual(["health"]);
    expect(singleProjectIds(["missing", "finance"], new Set(["finance"]))).toEqual(["finance"]);
    expect(singleProjectIds([])).toEqual([]);
  });

  it("resolves the active owner from normalized references", () => {
    expect(activeProjectIdForConnection(references, "health-gsc")).toBe("health");
    expect(activeProjectIdForConnection(references, "unassigned")).toBeUndefined();
  });

  it("detects duplicate Project names after Unicode and whitespace normalization", () => {
    expect(duplicateNormalizedProjectNames([
      { id: "one", name: "건강 정보" },
      { id: "two", name: "  건강   정보 " },
      { id: "three", name: "밝은재테크" },
    ])).toEqual(["건강 정보"]);
  });
});
