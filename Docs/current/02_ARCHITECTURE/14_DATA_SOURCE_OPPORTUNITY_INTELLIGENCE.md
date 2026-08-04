# Data Source and Opportunity Intelligence Architecture

Status: Foundation implemented; Google Search Console and NAVER selected flows externally verified; multi-connection and YouTube Analytics changes are implemented and automated-verified in Draft PR #42 but remain externally unverified

## 1. Ownership and boundaries

```text
Workspace
├── PlatformConnection            publishing only
├── DataSourceConnection[]        market/performance data only
└── Project
    └── ProjectDataSourceReference[]
```

`DataSourceConnection` belongs to exactly one Workspace. A Workspace can own multiple connections for the same Provider. Each connection represents exactly one selected Provider resource or one keyword configuration. A Project can reference enabled connections only from the same Workspace. Publishing accounts, automation permissions and Playwright workflows remain separate.

Examples:

```text
Workspace
├── GSC · 밝은건강       → bright-healthy.tistory.com
├── GSC · 밝은재테크     → brightjaetech.kr
├── NAVER · 건강         → 건강, 운동, 영양
├── NAVER · 재테크       → 예금, 적금, 고정비, 보험
└── YouTube · 밝은건강TV → one owned YouTube channel
```

Core owns provider-independent contracts, Evidence semantics, freshness policy and recommendation classification. Application infrastructure owns durable metadata, DPAPI SecretStore integration, official HTTP adapters, raw snapshot files and the local manual-sync service. The UI receives only public metadata and safe errors.

## 2. Connection identity and resource isolation

A Provider name is not a Connection identity. Every resource Connection has a unique `connectionId`, display name, resource configuration, lifecycle state, snapshots, Evidence and Project references.

Selecting a Provider in Settings must not choose and mutate an existing preferred connection. The explicit workflows are:

```text
새 연결 추가
→ clean add state
→ new OAuth or same-Provider credential reuse
→ authorized resource selection
→ new Connection ID
→ optional Project assignment

구성 편집
→ exact rendered Connection ID
→ version check
→ resource/config update

Project별 배정
→ exact Project ID + Connection ID
→ same-Workspace ownership check
```

Search Console, GA4, AdSense and YouTube Analytics use one Provider resource per Connection. NAVER Search Trend uses one Project-oriented keyword set per Connection. Different sites, channels or keyword strategies are never combined by overwriting a prior Connection.

## 3. Persistence

Data Source metadata is stored in `.bright-studio/intelligence/metadata.json` through the existing `SnapshotPersistenceStore` and `JsonFileSnapshotDriver`.

Collections:

- `data-source-connections`
- `project-data-source-references`
- `data-source-snapshots`
- `opportunity-evidence`

Large Provider payloads are stored separately under `.bright-studio/intelligence/raw-snapshots/<workspace>/<connection>/<snapshot>.json`. `DataSourceSnapshot` keeps only `rawSnapshotReference`, checksum/fingerprint, resource, period, operation and limitation metadata. Raw responses are never embedded into `UserData` or a Content Opportunity.

Disable, disconnect and deletion have separate contracts. Disable retains Connection metadata, credentials, Project references, snapshots and Evidence while stopping synchronization. Disconnect removes the Connection's credential reference while retaining the Connection, Project references, snapshots and Evidence for reconnection. Data Source deletion removes the Connection card and every same-Workspace Project reference after explicit confirmation, but preserves raw snapshots, Snapshot metadata, normalized Evidence and all Content-owned records.

Deletion reuses the versioned local safe-backup writer. It first writes a secret-free backup, invalidates the active sync operation and pending OAuth state, and removes an unshared credential before committing metadata deletion. A single atomic persistence batch writes an archived source tombstone and removes all related Project references and the Connection. Google revoke failure does not prevent local deletion.

The tombstone retains only connection ID, Workspace, provider, display name, resource configuration, prior status, deletion time and retained/reference counts. Snapshot and Evidence records retain their historical connection ID and provider attribution. New Planning requires both a current Connection and an enabled Project reference, so tombstoned source Evidence is excluded. Existing Content Opportunity evidence IDs and public summaries remain unchanged.

## 4. Credential protection and reuse

Google OAuth access data and NAVER client credentials are stored through the existing Windows DPAPI `SecretStore`. Normal Connection JSON contains `secretReference` only. API responses remove the reference and expose only `hasCredentials`.

Tokens, refresh tokens, client secrets and authorization codes are not returned, logged or included in safe errors. Provider response bodies are not reflected verbatim on failure.

A new Search Console or YouTube Analytics Connection can reuse the credential reference of an active same-Provider Google Connection. Reuse creates a new Connection ID with an empty resource selection and copies only the safe server-listed resources. It does not copy snapshots, Evidence, Project references or the selected resource.

A credential may therefore be referenced by multiple active resource Connections. Lifecycle rules are reference-aware:

- Disconnecting one Connection removes only its credential reference.
- Deleting one Connection does not revoke or delete a credential used by another active Connection.
- Reconnecting one Connection may replace its credential without invalidating other Connections that still reference the old credential.
- Remote revocation and local secret deletion occur only when no other active Connection references that credential.
- Google credentials are not reused across Providers with different required OAuth scope sets.

Credential fields remain write-only. Saved token and secret values are never rendered back, including masked originals.

Application code must not log OAuth authorization codes, raw state, access tokens, refresh tokens or client secrets. Development terminal output may contain framework-generated callback URLs and must be treated as sensitive.

## 5. Sync flow

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

Sync is Connection-isolated. A failure changes only that Connection's current status and retains every previous successful snapshot. The operation ID stored on the Connection prevents a late response from committing after disconnect or a newer operation. A fresh successful snapshot for the same period is returned from cache without a Provider call.

Freshness is centrally configured per Provider with `fresh`, `aging`, `stale`, and `unavailable`:

- Search Console, GA4, AdSense and YouTube Analytics: 2-day fresh / 7-day aging
- NAVER Search Trend: 1-day fresh / 3-day aging
- Google Ads Keyword Planning: 7-day fresh / 30-day aging when activated
- Google Trends Official: 1-day fresh / 7-day aging when activated

## 6. Official Provider adapters

- Google Search Console: official Search Analytics API; query/page clicks, site impressions, CTR and average position.
- Google Analytics 4: official Data API `runReport`; page views, users, sessions, engagement and only actually returned configured key events.
- Google AdSense: official v2 report API; earnings, impressions, clicks, CTR and RPM at returned account/site scope.
- YouTube Analytics: official YouTube Data API for the authorized account's channel list and YouTube Analytics `reports.query` for selected-channel views, estimated minutes watched, likes, comments, shares and subscriber gains/losses. Monetary metrics are not requested.
- NAVER Search Trend: official NAVER DataLab Search API; relative ratio and period change only.
- Google Ads Keyword Planning: conditional, not active until official API and customer authorization are verified.
- Google Trends Official: conditional, not active until official access is verified. No scraping or pytrends fallback exists.

## 7. Evidence semantics

Common Evidence records contain Workspace/Project scope, connection, Provider, type, metric, keyword/topic/content/page context, region/language/device, period, observation/sync time, freshness, verified flag, value/unit/relative value/change, confidence, limitations, source/raw references, version and deterministic fingerprint.

Server validation protects meaning:

- Search Console impressions remain site search performance, not monthly market demand.
- GA4 remains page engagement, not search demand.
- YouTube Analytics remains selected-channel first-party performance, not external search demand.
- NAVER and official Trends values remain relative indices, not absolute search volume.
- Google Ads competition requires an explicit advertising-versus-SEO limitation.
- AdSense values cannot be attributed to a post without page-level Provider data.
- Editorial inference cannot be marked as verified market Evidence.

YouTube metrics use `videoPerformance`. They may contribute verified first-party performance context but never prove total market size, absolute search demand or predicted earnings.

## 8. Internal growth Evidence

Until the dedicated Content Library projection is implemented, the internal Evidence builder uses only current Project strategy and Contents with verified public HTTP(S) URLs. Drafts are not public performance. It can produce `contentGap`, `clusterOpportunity`, and `internalLinkOpportunity`, each with the limitation that it is not external search demand.

## 9. Planning and recommendation classification

Planning reads only Evidence from Connections explicitly referenced by the current Project. Connection status, enabled state, same-Workspace ownership, resource context, Evidence verification, freshness and Project-topic matching remain required.

The service caps and filters the bundle to Project context before adding it to the existing single Planning AI request. The AI cannot attach canonical Evidence. After parsing, the server matches stored Evidence to each candidate, checks duplicate/public content, Project alignment, search-intent clarity and deterministic safety restrictions, then classifies and sorts candidates.

Order is deterministic: comprehensive, market opportunity, blog growth; within a type, verified Evidence, freshness and stable Opportunity identity are used. No unexplained numeric market score or first-place badge is produced.

The classification result and Evidence summary become part of the Opportunity fingerprint. PUT persistence validates every non-empty Evidence ID against the current Workspace before merging Planning state.

A healthy Workspace connection that is not assigned to the current Project is intentionally excluded. The UI must distinguish this from an unavailable or disconnected Provider so the user can correct Project assignment rather than reconnecting the wrong site.

## 10. Quality Review

Generation and Quality Review use the confirmed canonical Opportunity. The existing Quality call count does not change. Deterministic review rules block unsupported market-volume/CPC/rank claims when market Evidence is unavailable, stale-as-current claims, Ads competition as SEO difficulty, CPC/RPM revenue prediction and recommendation type as a manuscript quality score.

YouTube channel performance cannot justify search-volume, universal audience-demand or revenue claims.

## 11. Google OAuth providers

### 11.1 Search Console

Search Console requests only:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

The server lists authorized site properties and rejects any property not returned by that authorized resource list.

### 11.2 YouTube Analytics

YouTube Analytics requests only the read-only scopes required for channel identity and Analytics reports:

```text
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

The server flow is:

```text
GET /api/data-sources/google/start?provider=youtubeAnalytics
→ one-time Workspace-bound OAuth state
→ Google consent
→ provider-specific scope verification
→ DPAPI SecretStore token persistence
→ YouTube channels.list(mine=true)
→ configurationRequired Connection
→ user selects one returned channel
→ connected Connection
→ manual sync through reports.query
```

A typed or client-supplied channel title is not canonical. The server stores the title associated with the selected server-listed channel ID.

### 11.3 Shared state and return path

The OAuth state store persists only a SHA-256 state identifier and Workspace/Provider/Connection/return-path/timestamp context. State is short-lived, one-time and cannot carry credentials. Only internal Workspace Settings return paths are accepted. The callback returns the exact new Connection ID and Provider so the client hydrates the new resource Connection rather than an older preferred Connection.

Stored Google credentials contain the access token, refresh token, expiry, token type and granted scopes. They do not contain the authorization code, OAuth client secret or ID token. Automatic access-token refresh writes a new access token and expiry through DPAPI while preserving an existing refresh token when Google omits it.

## 12. Verification status

Externally verified before this Draft PR:

- Google Search Console OAuth login completed successfully.
- The actual Search Console property list was returned.
- `https://bright-healthy.tistory.com/` was selected with `siteOwner` permission.
- An actual Search Console sync completed and created a Snapshot.
- NAVER Search Trend connected and synchronized successfully.
- A legacy Search Console Data Source was safely deleted while historical records remained preserved.

Implemented in Draft PR #42 and automated-verified, but not yet externally verified:

- explicit Provider-level `새 연결 추가`
- multiple same-Provider resource Connections
- same-Provider Google credential reuse
- reference-aware disconnect/delete/reconnect protection
- separate Project assignment UI
- multiple NAVER keyword-set Connections
- YouTube Analytics OAuth, channel selection, sync and Evidence normalization

Automated validation at commit `12e20c83ed99732c8b88f962482efa8cc0e041fe`:

- GitHub Actions run: `30874382710`
- Job: `91882765362`
- TypeScript typecheck: passed
- ESLint with zero-warning gate: passed
- complete non-E2E Vitest suite: passed
- Next.js production build: passed
- Job conclusion: success

Remaining external gates:

- local UI verification with existing health Connections preserved
- creation of a separate `brightjaetech.kr` Search Console Connection
- creation and Project assignment of a finance NAVER keyword-set Connection
- real YouTube OAuth, owned-channel selection, sync and Snapshot/Evidence verification
- GA4 and AdSense real-account connection, resource selection and synchronization
- automatic refresh after an access token actually expires
- real quota limits, throttling and additional production response variants

No multi-connection or YouTube Analytics feature may be marked externally verified merely because automated tests pass.
