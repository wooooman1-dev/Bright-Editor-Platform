import { google } from "googleapis";
import { DataSourceError } from "../DataSourceErrors";

export const GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GOOGLE_YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const GOOGLE_YOUTUBE_ANALYTICS_READONLY_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

export type GoogleOAuthConfiguration = Readonly<{ clientId: string; clientSecret: string; redirectUri: string }>;
type GoogleOAuthEnvironment = Readonly<Record<string, string | undefined>>;

export class GoogleOAuthClientFactory {
  constructor(private readonly environment: GoogleOAuthEnvironment = process.env) {}

  configured(): boolean { return Boolean(configuration(this.environment)); }

  redirectUri(): string | undefined { return configuration(this.environment)?.redirectUri; }

  create() {
    const value = configuration(this.environment);
    if (!value) throw new DataSourceError("Google OAuth 설정이 필요합니다.", "GOOGLE_OAUTH_NOT_CONFIGURED", 503);
    return new google.auth.OAuth2(value.clientId, value.clientSecret, value.redirectUri);
  }

  authorizationUrl(provider: string, state: string, promptForConsent: boolean): string {
    return this.create().generateAuthUrl({ access_type: "offline", include_granted_scopes: true, response_type: "code", scope: [...this.scopes(provider)], state, ...(promptForConsent ? { prompt: "consent" } : {}) });
  }

  scopes(provider: string): readonly string[] {
    if (provider === "googleSearchConsole") return Object.freeze([GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE]);
    if (provider === "youtubeAnalytics") return Object.freeze([GOOGLE_YOUTUBE_READONLY_SCOPE, GOOGLE_YOUTUBE_ANALYTICS_READONLY_SCOPE]);
    throw new DataSourceError("지원하지 않는 Google OAuth Provider입니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "provider");
  }
}

export type GoogleOAuthClient = ReturnType<GoogleOAuthClientFactory["create"]>;

function configuration(environment: GoogleOAuthEnvironment): GoogleOAuthConfiguration | undefined {
  const clientId = environment.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = environment.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  return clientId && clientSecret && redirectUri ? Object.freeze({ clientId, clientSecret, redirectUri }) : undefined;
}
