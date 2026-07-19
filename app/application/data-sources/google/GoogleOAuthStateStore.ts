import { createHash, randomBytes } from "node:crypto";
import type { PersistenceStore } from "../../../../core/data";
import type { DataSourceProvider } from "../../../../core/intelligence";
import { DataSourceError } from "../DataSourceErrors";

const collection = "google-oauth-states";
const defaultLifetimeMs = 10 * 60 * 1000;

export type GoogleOAuthState = Readonly<{
  stateId: string;
  workspaceId: string;
  provider: DataSourceProvider;
  connectionId?: string;
  returnTo: string;
  createdAt: string;
  expiresAt: string;
}>;

export class GoogleOAuthStateStore {
  private readonly consuming = new Set<string>();
  constructor(private readonly store: PersistenceStore, private readonly now: () => Date = () => new Date()) {}

  async create(input: Readonly<{ workspaceId: string; provider: DataSourceProvider; connectionId?: string; returnTo: string; lifetimeMs?: number }>): Promise<Readonly<{ state: string; context: GoogleOAuthState }>> {
    await this.removeExpired();
    const state = randomBytes(32).toString("base64url"), createdAt = this.now(), stateId = key(state), returnTo = safeInternalReturnTo(input.returnTo);
    if (new URL(returnTo, "http://bright-studio.local").pathname !== `/workspaces/${encodeURIComponent(input.workspaceId)}/settings`) throw new DataSourceError("OAuth 복귀 경로의 Workspace가 일치하지 않습니다.", "DATA_SOURCE_WORKSPACE_FORBIDDEN", 403, "returnTo");
    const context: GoogleOAuthState = Object.freeze({ stateId, workspaceId: input.workspaceId, provider: input.provider, ...(input.connectionId ? { connectionId: input.connectionId } : {}), returnTo, createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + (input.lifetimeMs ?? defaultLifetimeMs)).toISOString() });
    await this.store.set(collection, stateId, context);
    return Object.freeze({ state, context });
  }

  async consume(state: string): Promise<GoogleOAuthState> {
    if (!/^[A-Za-z0-9_-]{40,}$/.test(state)) throw invalidState();
    const id = key(state);
    if (this.consuming.has(id)) throw invalidState();
    this.consuming.add(id);
    try {
      const context = await this.store.get<GoogleOAuthState>(collection, id);
      if (!context) throw invalidState();
      await this.store.delete(collection, id);
      if (Date.parse(context.expiresAt) <= this.now().getTime()) throw new DataSourceError("Google 연결 요청이 만료되었습니다. 다시 시작해 주세요.", "GOOGLE_OAUTH_STATE_EXPIRED", 400);
      return context;
    } finally { this.consuming.delete(id); }
  }

  async invalidate(input: Readonly<{ workspaceId: string; connectionId?: string }>): Promise<void> {
    const values = await this.store.list<GoogleOAuthState>(collection);
    for (const value of values) if (value.workspaceId === input.workspaceId && (!input.connectionId || value.connectionId === input.connectionId)) await this.store.delete(collection, value.stateId);
  }

  private async removeExpired(): Promise<void> {
    const values = await this.store.list<GoogleOAuthState>(collection), now = this.now().getTime();
    for (const value of values) if (Date.parse(value.expiresAt) <= now) await this.store.delete(collection, value.stateId);
  }
}

export function safeInternalReturnTo(value: string): string {
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001f]/.test(candidate)) throw new DataSourceError("안전한 내부 복귀 경로가 필요합니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "returnTo");
  const parsed = new URL(candidate, "http://bright-studio.local");
  if (parsed.origin !== "http://bright-studio.local") throw new DataSourceError("외부 복귀 경로는 사용할 수 없습니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "returnTo");
  if (!/^\/workspaces\/[^/]+\/settings\/?$/.test(parsed.pathname)) throw new DataSourceError("Google OAuth는 Workspace 설정 화면으로만 복귀할 수 있습니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "returnTo");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function key(state: string): string { return createHash("sha256").update(state).digest("hex"); }
function invalidState() { return new DataSourceError("Google 연결 요청을 확인할 수 없습니다. 다시 시작해 주세요.", "GOOGLE_OAUTH_STATE_INVALID", 400); }
