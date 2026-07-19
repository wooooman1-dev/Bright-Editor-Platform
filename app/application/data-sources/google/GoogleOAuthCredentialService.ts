import type { SecretStore } from "../../../../core/connections";
import type { DataSourceConnection } from "../../../../core/intelligence";
import { DataSourceError } from "../DataSourceErrors";
import { GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE, type GoogleOAuthClient, type GoogleOAuthClientFactory } from "./GoogleOAuthClientFactory";

export type StoredGoogleOAuthCredential = Readonly<{
  kind: "googleOAuth";
  accessToken: string;
  refreshToken: string;
  expiryDate?: number;
  tokenType?: string;
  grantedScopes: readonly string[];
}>;

export type AuthorizedGoogleSession = Readonly<{
  client: GoogleOAuthClient;
  persist: () => Promise<void>;
}>;

export class GoogleOAuthCredentialService {
  constructor(private readonly secrets: SecretStore, private readonly clients: Pick<GoogleOAuthClientFactory, "create">) {}

  async hasRefreshToken(secretReference?: string): Promise<boolean> {
    if (!secretReference) return false;
    try { return Boolean(parseStoredCredential(await this.secrets.readSecret(secretReference))?.refreshToken); }
    catch { return false; }
  }

  async revoke(connection: DataSourceConnection): Promise<void> {
    if (connection.credentialMode !== "googleOAuth" || !connection.secretReference) return;
    try {
      const credential = parseStoredCredential(await this.secrets.readSecret(connection.secretReference));
      if (!credential?.refreshToken) return;
      const client = this.clients.create();
      await Promise.race([client.revokeToken(credential.refreshToken), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
    } catch { /* Local credential removal remains authoritative even if Google revoke fails. */ }
  }

  async exchangeCode(code: string, priorSecretReference?: string): Promise<Readonly<{ client: GoogleOAuthClient; credential: StoredGoogleOAuthCredential }>> {
    const client = this.clients.create();
    try {
      const { tokens } = await client.getToken(code);
      const prior = !tokens.refresh_token && priorSecretReference ? parseStoredCredential(await this.secrets.readSecret(priorSecretReference)) : undefined;
      const accessToken = tokens.access_token?.trim();
      const refreshToken = tokens.refresh_token?.trim() || prior?.refreshToken;
      if (!accessToken || !refreshToken) throw new DataSourceError("Google에서 장기 연결용 인증 정보를 받지 못했습니다. 다시 동의해 주세요.", "GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED", 401);
      client.setCredentials({ ...tokens, access_token: accessToken, refresh_token: refreshToken });
      const grantedScopes = await grantedScopesFor(client, accessToken, tokens.scope);
      requireSearchConsoleScope(grantedScopes);
      return Object.freeze({ client, credential: freezeCredential({ accessToken, refreshToken, expiryDate: tokens.expiry_date ?? undefined, tokenType: tokens.token_type ?? undefined, grantedScopes }) });
    } catch (error) {
      if (error instanceof DataSourceError) throw error;
      throw new DataSourceError("Google 인증 코드를 교환하지 못했습니다. 연결을 다시 시작해 주세요.", "GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED", 401);
    }
  }

  async authorized(connection: DataSourceConnection): Promise<AuthorizedGoogleSession> {
    if (!connection.secretReference) throw reconnectRequired();
    let stored: string;
    try { stored = await this.secrets.readSecret(connection.secretReference); }
    catch { throw reconnectRequired(); }
    const credential = parseStoredCredential(stored);
    if (!credential) throw reconnectRequired();
    const client = this.clients.create();
    let current = credential, persistence = Promise.resolve();
    client.on("tokens", (tokens) => {
      current = freezeCredential({ accessToken: tokens.access_token?.trim() || current.accessToken, refreshToken: tokens.refresh_token?.trim() || current.refreshToken, expiryDate: tokens.expiry_date ?? current.expiryDate, tokenType: tokens.token_type ?? current.tokenType, grantedScopes: current.grantedScopes });
      persistence = persistence.then(() => this.secrets.replaceSecret(connection.secretReference!, JSON.stringify(current)));
    });
    client.setCredentials({ access_token: current.accessToken, refresh_token: current.refreshToken, expiry_date: current.expiryDate, token_type: current.tokenType, scope: current.grantedScopes.join(" ") });
    try {
      const token = await client.getAccessToken();
      if (!token.token) throw new Error();
      await persistence;
      return Object.freeze({ client, persist: () => persistence });
    } catch {
      await persistence.catch(() => undefined);
      throw new DataSourceError("Google 인증을 갱신하지 못했습니다. 계정을 다시 연결해 주세요.", "GOOGLE_OAUTH_REFRESH_FAILED", 401);
    }
  }
}

export function parseStoredCredential(value: string): StoredGoogleOAuthCredential | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.kind !== "googleOAuth" || typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return undefined;
    const grantedScopes = Array.isArray(parsed.grantedScopes) ? parsed.grantedScopes.filter((scope): scope is string => typeof scope === "string") : [];
    return freezeCredential({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiryDate: typeof parsed.expiryDate === "number" ? parsed.expiryDate : undefined, tokenType: typeof parsed.tokenType === "string" ? parsed.tokenType : undefined, grantedScopes });
  } catch { return undefined; }
}

async function grantedScopesFor(client: GoogleOAuthClient, accessToken: string, tokenScope?: string | null): Promise<readonly string[]> {
  const supplied = tokenScope?.split(/\s+/).filter(Boolean) ?? [];
  if (supplied.length) return Object.freeze([...new Set(supplied)].sort());
  try { return Object.freeze([...new Set((await client.getTokenInfo(accessToken)).scopes)].sort()); }
  catch { throw new DataSourceError("승인된 Google 권한을 확인하지 못했습니다. 연결을 다시 시작해 주세요.", "GOOGLE_OAUTH_SCOPE_MISSING", 401); }
}
function requireSearchConsoleScope(scopes: readonly string[]) { if (!scopes.includes(GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE)) throw new DataSourceError("Search Console 읽기 권한이 승인되지 않았습니다. Google 계정을 다시 연결해 주세요.", "GOOGLE_OAUTH_SCOPE_MISSING", 403); }
function freezeCredential(value: Omit<StoredGoogleOAuthCredential, "kind">): StoredGoogleOAuthCredential { return Object.freeze({ kind: "googleOAuth", accessToken: value.accessToken, refreshToken: value.refreshToken, ...(value.expiryDate ? { expiryDate: value.expiryDate } : {}), ...(value.tokenType ? { tokenType: value.tokenType } : {}), grantedScopes: Object.freeze([...value.grantedScopes]) }); }
function reconnectRequired() { return new DataSourceError("기존 수동 token 연결입니다. Google 계정으로 다시 연결해 주세요.", "DATA_SOURCE_AUTHENTICATION_ERROR", 401); }
