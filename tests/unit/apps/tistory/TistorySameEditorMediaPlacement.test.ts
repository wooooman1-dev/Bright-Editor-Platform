import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-same-editor-media.mjs"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("Tistory same-editor media placement", () => {
  it("promotes an inline marker to its nearest block before placing the native image", () => {
    expect(source).toContain('const markerBlock = marker.closest("p, div") ?? marker;');
    expect(source).toContain("markerParent.insertBefore(wrapper, markerBlock);");
    expect(source).toContain("markerBlock.remove();");
    expect(source).not.toContain("marker.parentNode?.insertBefore(wrapper, marker);");
  });

  it("verifies image geometry before attempting representative-image selection", () => {
    const geometryIndex = source.indexOf("const geometry = await waitForPlacedImageGeometry");
    const representativeIndex = source.indexOf("const representative = await ensureFirstTistoryImageRepresentative");

    expect(geometryIndex).toBeGreaterThan(-1);
    expect(representativeIndex).toBeGreaterThan(geometryIndex);
    expect(source).toContain('code: "media_image_geometry_invalid"');
    expect(source).toContain("wrapperInsideParagraph");
  });

  it("rejects native Tistory images that remain nested inside a paragraph", () => {
    expect(source).toContain("invalidParagraphImageCount");
    expect(source).toContain('code: "media_native_image_nested_in_paragraph"');
  });
});
