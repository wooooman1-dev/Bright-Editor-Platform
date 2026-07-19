import { randomUUID } from "node:crypto";
import type { SecretStore } from "../../../../core/connections";
import type { DataSourceConnection, DataSourceConnectionRepository } from "../../../../core/intelligence";
import { DataSourceError } from "../DataSourceErrors";
import type { GoogleOAuthCredentialService } from "./GoogleOAuthCredentialService";
import type { GoogleSearchConsoleService } from "./GoogleSearchConsoleService";

export type GoogleOAuthCompletion = Readonly<{ connection: DataSourceConnection; resourceRequired: boolean }>;

export class GoogleSearchConsoleOAuthFlow {
  constructor(
    private readonly connections: DataSourceConnectionRepository,
    private readonly secrets: SecretStore,
    private readonly credentials: Pick<GoogleOAuthCredentialService, "exchangeCode">,
    private readonly searchConsole: Pick<GoogleSearchConsoleService, "listSites">,
  ) {}

  async complete(input: Readonly<{ workspaceId: string; connectionId?: string; code: string }>): Promise<GoogleOAuthCompletion> {
    const existing = input.connectionId ? await this.connections.findById(input.connectionId) : undefined;
    if (input.connectionId && (!existing || existing.workspaceId !== input.workspaceId)) throw new DataSourceError("이 Workspace에서 Data Source 연결에 접근할 수 없습니다.", "DATA_SOURCE_WORKSPACE_FORBIDDEN", 403);
    if (existing && existing.provider !== "googleSearchConsole") throw new DataSourceError("Google OAuth 연결 대상 Provider가 일치하지 않습니다.", "GOOGLE_OAUTH_STATE_INVALID", 400);
    const exchanged = await this.credentials.exchangeCode(input.code, existing?.secretReference);
    const availableResources = await this.searchConsole.listSites(exchanged.client);
    const selected = existing?.resourceConfiguration.siteProperty;
    const retainsSelection = Boolean(selected && availableResources.some((value) => value.siteUrl === selected));
    const resourceConfiguration = retainsSelection ? existing!.resourceConfiguration : Object.freeze(Object.fromEntries(Object.entries(existing?.resourceConfiguration ?? {}).filter(([key]) => key !== "siteProperty")));
    const secretReference = await this.secrets.storeSecret(`data-source-${input.workspaceId}-googleSearchConsole`, JSON.stringify(exchanged.credential));
    const current = existing ? await this.connections.findById(existing.id) : undefined;
    if (existing && (!current || current.workspaceId !== input.workspaceId || current.provider !== "googleSearchConsole")) { await this.secrets.deleteSecret(secretReference); throw new DataSourceError("연결 정보가 변경되었습니다. Google 연결을 다시 시작해 주세요.", "DATA_SOURCE_CONFLICT", 409); }
    const now = new Date().toISOString();
    const connection: DataSourceConnection = Object.freeze({
      id: current?.id ?? randomUUID(), workspaceId: input.workspaceId, provider: "googleSearchConsole", displayName: current?.displayName ?? "Google Search Console",
      status: retainsSelection ? "connected" : "configurationRequired", secretReference, credentialMode: "googleOAuth", resourceConfiguration,
      availableResources, enabled: current?.enabled ?? true, lastSyncAttemptAt: current?.lastSyncAttemptAt, lastSuccessfulSyncAt: current?.lastSuccessfulSyncAt,
      createdAt: current?.createdAt ?? now, updatedAt: now, version: (current?.version ?? 0) + 1,
    });
    try { await this.connections.save(connection); }
    catch (error) { await this.secrets.deleteSecret(secretReference); throw error; }
    if (current?.secretReference && current.secretReference !== secretReference) await this.secrets.deleteSecret(current.secretReference).catch(() => undefined);
    return Object.freeze({ connection, resourceRequired: !retainsSelection });
  }
}
