import { afterEach, describe, expect, it, vi } from "vitest";
import { officialJson } from "../../../../app/application/data-sources/adapters/OfficialApiSupport";

describe("official Data Source provider errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [401, "DATA_SOURCE_AUTHENTICATION_ERROR", "인증에 실패했습니다. 연결 정보를 다시 설정해 주세요."],
    [403, "DATA_SOURCE_PERMISSION_ERROR", "해당 데이터에 접근할 권한이 없습니다. 계정 권한을 확인해 주세요."],
    [404, "DATA_SOURCE_RESOURCE_NOT_FOUND", "선택한 데이터 리소스를 찾을 수 없습니다. 연결 설정을 확인해 주세요."],
    [429, "DATA_SOURCE_QUOTA_ERROR", "API 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."],
  ])("maps provider status %i to a safe Korean error", async (status, code, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "access-token-secret" } }), { status })));
    const promise = officialJson("https://provider.invalid", {});
    await expect(promise).rejects.toMatchObject({ code, message, status });
    await expect(promise).rejects.not.toThrow("access-token-secret");
  });
});
