import { describe, expect, it } from "vitest";

import { assertNativeFragment } from "../../../../apps/tistory/workflows/tistory-native-media-fragment.mjs";
import { replaceTistoryMediaPlaceholders } from "../../../../apps/tistory/workflows/tistory-native-media-html.mjs";

const placeholder = "https://bright-studio.invalid/tistory-media/image-local";
const remoteUrl = "https://blog.kakaocdn.net/dn/example/native-image.png";
const nativeHtml = `<figure class="imageblock alignCenter" data-ke-type="image" data-origin-width="1200" data-origin-height="800"><span data-url="${remoteUrl}" data-phocus="${remoteUrl}"><img src="${remoteUrl}" alt=""></span></figure>`;

describe("Tistory native media HTML", () => {
  it("replaces only the renderer figure containing the matching placeholder", () => {
    const existingRemote = "https://example.com/already-remote.png";
    const html = `<p>도입 문단</p><figure data-existing="true"><img src="${existingRemote}" alt="기존 원격 이미지"></figure><p>중간 문단</p><figure><img src="${placeholder}" alt="기존 ALT"><figcaption>이미지 설명</figcaption></figure><h2>다음 내용</h2>`;

    const result = replaceTistoryMediaPlaceholders(html, [{
      alt: "탈수 증상을 확인하는 사람",
      blockId: "image-local",
      nativeHtml,
      placeholderUrl: placeholder,
      remoteUrl,
    }]);

    expect(result).not.toContain("bright-studio.invalid");
    expect(result).toContain(`data-existing="true"><img src="${existingRemote}"`);
    expect(result).toContain('class="imageblock alignCenter"');
    expect(result).toContain('data-ke-type="image"');
    expect(result).toContain('data-origin-width="1200"');
    expect(result).toContain('alt="탈수 증상을 확인하는 사람"');
    expect(result).toContain("<figcaption>이미지 설명</figcaption>");
    expect(result.indexOf(existingRemote)).toBeLessThan(result.indexOf("imageblock"));
    expect(result.indexOf("imageblock")).toBeLessThan(result.indexOf("다음 내용"));
  });

  it("preserves separate native wrappers for multiple local images", () => {
    const secondPlaceholder = "https://bright-studio.invalid/tistory-media/image-second";
    const secondRemote = "https://blog.kakaocdn.net/dn/example/native-second.png";
    const secondNative = `<figure class="imageblock" data-ke-type="image"><span data-url="${secondRemote}"><img src="${secondRemote}"></span></figure>`;
    const html = `<figure><img src="${placeholder}" alt="첫 번째"></figure><p>중간</p><figure><img src="${secondPlaceholder}" alt="두 번째"></figure>`;

    const result = replaceTistoryMediaPlaceholders(html, [
      { alt: "첫 번째", blockId: "image-local", nativeHtml, placeholderUrl: placeholder, remoteUrl },
      { alt: "두 번째", blockId: "image-second", nativeHtml: secondNative, placeholderUrl: secondPlaceholder, remoteUrl: secondRemote },
    ]);

    expect(result.match(/data-ke-type="image"/g)).toHaveLength(2);
    expect(result).toContain('alt="첫 번째"');
    expect(result).toContain('alt="두 번째"');
  });

  it("rejects generic, unsafe, and untrusted image fragments", () => {
    expect(() => assertNativeFragment(`<figure><img src="${remoteUrl}"></figure>`)).toThrow(/네이티브 이미지 Wrapper/);
    expect(() => assertNativeFragment(`<figure class="imageblock" data-ke-type="image"><img src="${remoteUrl}" onerror="alert(1)"></figure>`)).toThrow(/허용되지 않은 실행 속성/);
    expect(() => assertNativeFragment('<figure class="imageblock" data-ke-type="image"><img src="https://example.com/image.png"></figure>')).toThrow(/신뢰 가능한 원격 주소/);
  });

  it("fails instead of silently leaving an unresolved local placeholder", () => {
    expect(() => replaceTistoryMediaPlaceholders(`<figure><img src="${placeholder}"></figure>`, [])).toThrow(/변환되지 않았습니다/);
  });
});
