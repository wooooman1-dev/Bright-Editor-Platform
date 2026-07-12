import { describe, expect, it } from "vitest";

import type {
  ContentDocument,
  ContentVersion,
} from "../../../../core/content";

describe("ContentVersion", () => {
  it("represents an initial version as a reference-based foundation", () => {
    const document: ContentDocument = {
      blocks: [],
      id: "document",
      title: "Title",
    };
    const version: ContentVersion = {
      content: document,
      createdAt: "2026-07-12T00:00:00.000Z",
      documentId: document.id,
      id: "document-v1",
      version: 1,
    };

    expect(version.version).toBe(1);
    expect(version.content).toBe(document);
  });

  it("provides readonly fields without implementing version increments", () => {
    const version: ContentVersion = {
      content: { blocks: [], id: "document", title: "Title" },
      createdAt: "2026-07-12T00:00:00.000Z",
      documentId: "document",
      id: "document-v1",
      version: 1,
    };

    if (false) {
      // @ts-expect-error ContentVersion fields are readonly by contract.
      version.version = 2;
    }

    expect(version).not.toHaveProperty("increment");
  });
});
