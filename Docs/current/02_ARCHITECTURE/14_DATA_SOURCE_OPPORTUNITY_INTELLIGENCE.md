# Data Source and Opportunity Intelligence Architecture

Status: Foundation implemented; Google Search Console and NAVER selected flows externally verified; additional provider gates pending

## 1. Ownership and boundaries

```text
Workspace
├── PlatformConnection            publishing only
├── DataSourceConnection          market/performance data only
└── Project
    └── ProjectDataSourceReference
```

`DataSourceConnection` belongs to exactly one Workspace. A Project can reference enabled connections only from the same Workspace. Publishing accounts, automation permissions and Playwright workflows remain separate.

Core owns provider-independent contracts, Evidence semantics, freshness policy and recommendation classification. Application infrastructure owns durable metadata, DPAPI SecretStore integration, official HTTP adapters, raw snapshot files and the local manual-sync service. The UI receives only public metadata and safe errors.

## 2. Persistence

Data Source metadata is stored in `.bright-studio/intelligence/metadata.json` through the existing `SnapshotPersistenceStore` and `JsonFileSnapshotDriver`.

Collections:

- `data-source-connections`
- `project-data-source-references`
- `data-source-snapshots`
- `opportunity-evidence`

Large provider payloads are stored separately under `.bright-studio/intelligence/raw-snapshots/<workspace>/<connection>/<snapshot>.json`. `DataSourceSnapshot` keeps only `rawSnapshotReference`, checksum/fingerprint, resource, period, operation and limitation metadata. Raw responses are never embedded into `UserData` or a Content Opportunity.

Disable, disconnect and deletion have separate contracts. Disable retains Connection metadata, credentials, Project references, snapshots and Evidence while stopping synchronization. Disconnect revokes tokens on a best-effort basis and removes credentials while retaining the Connection, Project references, snapshots and Evidence for reconnection. Data Source deletion removes the Connection card and every same-Workspace Project reference after explicit confirmation, but preserves raw snapshots, Snapshot metadata, normalized Evidence and all Content-owned records.

Deletion reuses the versioned local safe-backup writer. It first writes a secret-free backup, invalidates the active sync operation and pending OAuth state, and removes the credential before committing metadata deletion. A single atomic persistence batch writes an archived source tombstone and removes all related Project references and the Connection. SecretStore deletion failure prevents that final metadata batch. Google revoke failure does not prevent local deletion.

The tombstone retains only connection ID, Workspace, provider, display name, resource configuration, prior status, deletion time and retained/reference counts. Snapshot and Evidence records retain their historical connection ID and provider attribution. New Planning requires both a current Connection and an enabled Project reference, so tombstoned source Evidence is excluded. Existing Content Opportunity evidence IDs and public summaries remain unchanged.

## 3. Secret protection

Google OAuth access data and NAVER client credentials are stored through the existing Windows DPAPI `SecretStore`. Normal connection JSON contains `secretReference` only. API responses remove the reference and expose only `hasCredentials`.

Tokens, refresh tokens and client secrets are not returned, logged or included in safe errors. Provider response bodies are not reflected verbatim on failure.

Application code must not log the OAuth authorization code, raw state, access token, refresh token or client secret. The Next.js development server may print the complete callback request target, including its query string, in its built-in access log before the route can handle or redact it. This is framework development-server behavior rather than an application log. Development terminal output must therefore be treated as sensitive and must not be copied into issues or shared logs. Removing or replacing that framework logger requires a separate custom-server or logging-infrastructure decision and is outside the Data Sources UI flow.

## 4. Sync flow

```text
Manual Sync
→ connection ownership/version/secret validation
→ duplicate period and active-operation guard
→ official Provider Adapter
→ raw snapshot file
→ snapshot metadata
→ provider-specific normalizer
→ common Evidence repository
→ connection ready/error state
```

Deletion marks an in-flight job `superseded` before credential or metadata cleanup. Snapshot, Evidence and Connection repositories reject writes for tombstoned connection IDs, preventing a late Provider response from recording a post-deletion result or recreating the Connection.

Sync is connection-isolated. A failure changes only that connection's current status and retains every previous successful snapshot. The operation ID stored on the connection prevents a late response from committing after disconnect or a newer operation. A fresh successful snapshot for the same period is returned from cache without a provider call.

Freshness is centrally configured per Provider with `fresh`, `aging`, `stale`, and `unavailable`. Search Console, GA4 and AdSense default to 2-day fresh/7-day aging boundaries; NAVER Search Trend defaults to 1-day fresh/3-day aging. Conditional Provider policies exist but do not activate unsupported access.

## 5. Official Provider adapters

- Google Search Console: official Search Analytics API; query/page clicks, site impressions, CTR and average position.
- Google Analytics 4: official Data API `runReport`; page views, users, sessions, engagement and only actually returned configured key events.
- Google AdSense: official v2 report API; earnings, impressions, clicks, CTR and RPM at returned account/site scope.
- NAVER Search Trend: official NAVER DataLab Search API; relative ratio and period change only.
- Google Ads Keyword Planning: conditional, not active until official API and customer authorization are verified.
- Google Trends Official: conditional, not active until official access is verified. No scraping or pytrends fallback exists.

## 6. Evidence semantics

Common Evidence records contain Workspace/Project scope, connection, Provider, type, metric, keyword/topic/content/page context, region/language/device, period, observation/sync time, freshness, verified flag, value/unit/relative value/change, confidence, limitations, source/raw references, version and deterministic fingerprint.

Server validation protects meaning:

- Search Console impressions remain site search performance, not monthly market demand.
- GA4 remains page engagement, not search demand.
- NAVER and official Trends values remain relative indices, not absolute search volume.
- Google Ads competition requires an explicit advertising-versus-SEO limitation.
- AdSense values cannot be attributed to a post without page-level provider data.
- Editorial inference cannot be marked as verified market Evidence.

## 7. Internal growth Evidence

Until the dedicated Content Library projection is implemented, the internal Evidence builder uses only current Project strategy and Contents with verified public HTTP(S) URLs. Drafts are not public performance. It can produce `contentGap`, `clusterOpportunity`, and `internalLinkOpportunity`, each with the limitation that it is not external search demand.

## 8. Planning and recommendation classification

Planning reads only Project-referenced connection Evidence. It caps and filters the bundle to Project context before adding it to the existing single Planning AI request. The AI cannot attach canonical Evidence. After parsing, the server matches stored Evidence to each candidate, checks duplicate/public content, Project alignment, search-intent clarity and deterministic health-safety restrictions, then classifies and sorts candidates.

Order is deterministic: comprehensive, market opportunity, blog growth; within a type, verified Evidence, freshness and stable opportunity identity are used. No unexplained numeric market score or first-place badge is produced.

The classification result and Evidence summary become part of the Opportunity fingerprint. PUT persistence validates every non-empty Evidence ID against the current Workspace before merging Planning state.

## 9. Quality Review

Generation and Quality Review use the confirmed canonical Opportunity. The existing Quality call count does not change. Deterministic review rules block unsupported market-volume/CPC/rank claims when market Evidence is unavailable, stale-as-current claims, Ads competition as SEO difficulty, CPC/RPM revenue prediction and recommendation type as a manuscript quality score.

## 10. Verification status

Implementation is present in `71d4899d feat: add content intelligence and data source workflows`, which is pushed to `main` and `origin/main`.

Automated verification passed lint, typecheck, the full test suite, production build and `git diff --check`. The full suite passed 118 files and 589 tests; 6 files and 14 tests remain skipped by existing policy. Automated verification does not replace real Provider verification.

Externally verified with real accounts and Provider responses:

- Google Search Console OAuth login completed successfully.
- The actual Search Console property list was returned.
- `https://bright-healthy.tistory.com/` was selected with `siteOwner` permission.
- An actual Search Console sync completed and created a Snapshot.
- NAVER Search Trend connected and synchronized successfully.
- The legacy Google Search Console Data Source was actually deleted, and `DELETE /api/data-sources` returned HTTP 200.

Remaining external verification gates:

- GA4 and AdSense real-account connection, resource selection and synchronization
- automatic refresh after an access token actually expires
- real quota limits and throttling behavior
- additional production response variants from every supported Provider

Google Ads Keyword Planning and Google Trends remain inactive until official access is verified. The completed checks above do not mark those Providers, GA4 or AdSense as externally verified.

## 11. Google Search Console OAuth 2.0

Search Console uses the official `googleapis` Node.js client and only requests:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

The server flow is:

```text
GET /api/data-sources/google/start
→ cryptographically random one-time server state
→ Google consent
→ GET /api/data-sources/google/callback
→ authorization code exchange
→ granted-scope verification
→ DPAPI SecretStore token persistence
→ Search Console sites.list
→ configurationRequired Connection
→ user selects a server-listed site property
→ connected Connection
```

The OAuth state store persists only a SHA-256 state identifier and Workspace/Provider/Connection/return-path/timestamp context in the intelligence metadata store. State is short-lived, one-time, and cannot carry credentials. Only internal Bright Studio return paths are accepted.

Stored Google credentials contain the access token, refresh token, expiry, token type, and granted scopes. They do not contain the authorization code, OAuth client secret, or ID token. Automatic access-token refresh writes a new access token and expiry back through DPAPI while preserving an existing refresh token when Google omits it.

Legacy Search Console connections containing only a manually entered access token are not upgraded implicitly. Before deletion they remain recoverable, retain snapshots and Evidence, and are publicly presented as requiring Google account reconnection. The observed legacy Connection used for this implementation was subsequently deleted through the safe deletion contract; the API returned HTTP 200 while retained historical records remained subject to the preservation policy in section 2.

Disconnect first invalidates pending local OAuth state, then makes a best-effort call to Google's official token revocation endpoint. Revocation timeout or failure never prevents local DPAPI credential deletion, Connection disconnection, or snapshot/Evidence retention.

### 11.1 Google Cloud development setup

1. In Google Cloud Console, enable the **Google Search Console API**.
2. Configure **Google Auth Platform** for the development project.
3. Add the Google accounts used for development under **Test users**.
4. Add only the Search Console read-only scope: `https://www.googleapis.com/auth/webmasters.readonly`.
5. Create an OAuth client with application type **Web application**.
6. Register this exact authorized redirect URI:

```text
http://localhost:3000/api/data-sources/google/callback
```

7. Set server environment variables without committing their values:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/data-sources/google/callback
```

Do not add `.env` or `client_secret.json` to Git. Restart the development server after changing environment variables.

8. Open Workspace Settings → Data Sources and select **Google 계정으로 연결**.
9. Approve the read-only permission and return to Bright Studio.
10. Select one of the Search Console site properties returned by `sites.list`.
11. Save the Connection and run **수동 동기화**.
12. Verify that API responses, browser URLs, logs, and normal JSON metadata contain no access token, refresh token, authorization code, or OAuth client secret.
