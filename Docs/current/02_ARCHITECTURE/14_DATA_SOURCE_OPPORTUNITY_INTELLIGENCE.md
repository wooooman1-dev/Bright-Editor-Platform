# Data Source and Opportunity Intelligence Architecture

Status: Foundation implemented; Google Search Console and NAVER selected flows externally verified; multi-connection, single-Project ownership and YouTube Analytics changes remain in Draft PR #42 and require current CI plus local external verification

## 1. Ownership and boundaries

```text
Workspace
├── PlatformConnection                 publishing only
├── DataSourceCredential               reusable authentication secret
├── DataSourceConnection[]             one site/channel/account/keyword resource
│   └── DataSourceProjectOwner?        zero or one Project owner
└── Project
    └── ProjectDataSourceReference[]   explicit use permission for owned Connection
```

`DataSourceConnection` belongs to exactly one Workspace and represents exactly one selected Provider resource or one keyword configuration. A Connection is either unassigned or owned by exactly one Project. It is never shared across multiple Projects.

Authentication may be reused without sharing the Connection. A Workspace can create multiple same-Provider Connections that reference the same safe credential while keeping resource identity, Snapshot, Evidence and Project scope separate.

Publishing accounts, automation permissions and Playwright workflows remain separate from Data Sources.

Example:

```text
Workspace
├── shared Google OAuth credential
├── 건강정보 Project
│   ├── GSC · 밝은건강       → bright-healthy.tistory.com
│   ├── NAVER · 건강         → 건강, 운동, 영양
│   └── YouTube · 밝은건강TV → one owned channel
└── 밝은재테크 Project
    ├── GSC · 밝은재테크     → brightjaetech.kr
    └── NAVER · 재테크       → 예금, 적금, 고정비, 보험
```

Core owns provider-independent contracts, Evidence semantics, freshness policy and recommendation classification. Application infrastructure owns durable metadata, DPAPI SecretStore integration, official HTTP adapters, raw snapshot files, Project ownership enforcement and local repair commands. The UI receives only public metadata and safe errors.

## 2. Connection identity and resource isolation

A Provider name is not a Connection identity. Every resource Connection has a unique `connectionId`, display name, immutable resource identity, lifecycle state, snapshots, Evidence and optional Project owner.

Selecting a Provider in Settings must not choose and mutate an existing preferred connection. The explicit workflows are:

```text
새 연결 추가
→ clean add state
→ new OAuth or same-Provider credential reuse
→ authorized resource selection
→ new Connection ID
→ optional single Project assignment

구성 편집
→ exact rendered Connection ID
→ version check
→ display/non-identity configuration update
→ current Project 유지 또는 배정 해제

Project 배정
→ exact Project ID + Connection ID
→ same-Workspace check
→ atomic single-owner claim
```

Search Console, GA4, AdSense and YouTube Analytics use one Provider resource per Connection. NAVER Search Trend uses one Project-oriented keyword set per Connection. Once a resource identity has been selected and stored, it cannot be changed on that Connection:

- Search Console: `siteProperty`
- GA4: `propertyId`
- AdSense: `accountReference` plus `siteReference`
- YouTube Analytics: `channelId`
- NAVER Search Trend: normalized keyword set

A different site, channel, account or keyword strategy requires a new Connection. Existing Google authentication may be reused to create it.

## 3. Project identity and duplicate protection

A Project is the brand, topic, audience and content-strategy boundary. Project identity is determined by immutable Project ID, while a normalized duplicate name in the same Workspace is rejected at the canonical `studioStore` persistence boundary.

Normalization uses Unicode NFKC, trimming, internal whitespace collapse and locale-aware lowercase comparison. Existing legacy duplicates are allowed to persist unchanged only long enough for verified migration; no new duplicate may be introduced and an existing duplicate set may be reduced by migration.

The verified duplicate Project merge command:

```text
npm run project:merge-duplicate -- --source <duplicate-id> --target <canonical-id>
```

must:

1. refuse to run while the Next.js development lock exists;
2. acquire exclusive locks for both data files;
3. verify source and target exist in the same Workspace and have the same normalized name;
4. fingerprint `studio-data.json` and `metadata.json` before replacement;
5. create timestamped backups for both files;
6. move every exact nested source Project ID reference to the target ID;
7. remove only the source Project record;
8. re-read both persisted files;
9. require exact equality with the intended snapshots;
10. require zero remaining source Project ID references;
11. restore both backups if either replacement or verification fails.

Content IDs, manuscript data, Planning candidates, canonical Opportunity, Media IDs and Evidence IDs remain unchanged. Only their Project references move.

## 4. Data Source persistence

Data Source metadata is stored in `.bright-studio/intelligence/metadata.json` through `SnapshotPersistenceStore` and `JsonFileSnapshotDriver`.

Collections:

- `data-source-connections`
- `project-data-source-references`
- `data-source-project-owners`
- `data-source-snapshots`
- `opportunity-evidence`

The Project owner collection is the atomic ownership gate. Legacy references without an owner record are projected through the deterministic canonical-owner policy; only the canonical active reference is visible to Planning and public API consumers.

Large Provider payloads are stored separately under `.bright-studio/intelligence/raw-snapshots/<workspace>/<connection>/<snapshot>.json`. `DataSourceSnapshot` keeps only `rawSnapshotReference`, checksum/fingerprint, resource, period, operation and limitation metadata. Raw responses are never embedded into `UserData` or a Content Opportunity.

Disable, disconnect and deletion have separate contracts. Disable retains Connection metadata, credential, Project owner/reference, snapshots and Evidence while stopping synchronization. Disconnect removes this Connection's credential reference while retaining its metadata, owner/reference, snapshots and Evidence for reconnection. Data Source deletion removes the Connection card, owner and Project references after explicit confirmation, but preserves raw snapshots, Snapshot metadata, normalized Evidence and Content-owned records.

Deletion reuses the versioned local safe-backup writer. It invalidates active sync and pending OAuth state, removes an unshared credential, writes an archived source tombstone and removes ownership/reference metadata atomically. Google revoke failure does not prevent local deletion.

## 5. Credential protection and reuse

Google OAuth access data and NAVER client credentials are stored through the existing Windows DPAPI `SecretStore`. Normal Connection JSON contains `secretReference` only. API responses remove that reference and expose only `hasCredentials`.

Tokens, refresh tokens, client secrets and authorization codes are not returned, logged or included in safe errors. Provider response bodies are not reflected verbatim on failure.

A new Search Console or YouTube Analytics Connection can reuse the credential reference of an active same-Provider Google Connection. Reuse creates a new Connection ID with an empty resource selection and copies only safe server-listed resources. It does not copy selected resource, Project owner, snapshots or Evidence.

Credential lifecycle is reference-aware:

- disconnecting one Connection removes only that Connection's credential reference;
- deleting one Connection does not revoke a credential used by another active Connection;
- reconnecting one Connection does not invalidate other Connections still using the old credential;
- remote revocation and local secret deletion occur only when no other active Connection references that credential;
- Google credentials are not reused across Providers with different OAuth scope sets.

Credential fields remain write-only. Saved token and secret values are never rendered back, including masked originals.

## 6. Settings UI projection

Every current Workspace Project is rendered as an independent area using its immutable Project ID. The top selector only hides or re-adds an existing area; it does not create, rename or rebind Project data.

Each Project area calculates:

```text
assigned = active Connections owned by this Project
available = active Connections with no Project owner
```

A Connection owned by another Project is not rendered in the current area's available list. Therefore a health GSC/NAVER Connection cannot appear as assignable inside a finance or art Project.

The Connection editor uses one Project selector, not multi-select checkboxes. A Connection may remain unassigned, stay with its current owner, or be explicitly unassigned. Moving it to another Project requires first releasing the current owner and then assigning the now-unassigned Connection, while Repository ownership remains the final concurrency guard.

If normalized duplicate Project names already exist, Settings displays a warning and does not suggest deleting either Project before verified migration.

## 7. Sync flow

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

Deletion marks an in-flight job `superseded` before credential or metadata cleanup. Snapshot, Evidence and Connection repositories reject writes for tombstoned connection IDs, preventing late Provider responses from recording post-deletion results or recreating a Connection.

Sync is Connection-isolated. A failure changes only that Connection's current status and retains every previous successful snapshot. The operation ID prevents a late response from committing after disconnect or a newer operation. A fresh successful snapshot for the same period is returned from cache without a Provider call.

Freshness policy:

- Search Console, GA4, AdSense and YouTube Analytics: 2-day fresh / 7-day aging
- NAVER Search Trend: 1-day fresh / 3-day aging
- Google Ads Keyword Planning: 7-day fresh / 30-day aging when activated
- Google Trends Official: 1-day fresh / 7-day aging when activated

## 8. Official Provider adapters

- Google Search Console: official Search Analytics API; query/page clicks, site impressions, CTR and average position.
- Google Analytics 4: official Data API `runReport`; page views, users, sessions, engagement and only returned configured key events.
- Google AdSense: official v2 report API; earnings, impressions, clicks, CTR and RPM at returned account/site scope.
- YouTube Analytics: official YouTube Data API for the authorized account's channel list and YouTube Analytics `reports.query` for selected-channel views, estimated minutes watched, likes, comments, shares and subscriber gains/losses. Monetary metrics are not requested.
- NAVER Search Trend: official NAVER DataLab Search API; relative ratio and period change only.
- Google Ads Keyword Planning: conditional, inactive until official API and customer authorization are verified.
- Google Trends Official: conditional, inactive until official access is verified. No scraping or pytrends fallback exists.

## 9. Evidence semantics

Common Evidence records contain Workspace/Project scope, Connection, Provider, type, metric, keyword/topic/content/page context, region/language/device, period, observation/sync time, freshness, verified flag, value/unit/relative value/change, confidence, limitations, source/raw references, version and deterministic fingerprint.

Server validation protects meaning:

- Search Console impressions are site search performance, not monthly market demand.
- GA4 is page engagement, not search demand.
- YouTube Analytics is selected-channel first-party performance, not external search demand.
- NAVER and official Trends values are relative indices, not absolute search volume.
- Google Ads competition requires an advertising-versus-SEO limitation.
- AdSense values cannot be attributed to a post without page-level Provider data.
- Editorial inference cannot be marked as verified market Evidence.

## 10. Planning and recommendation classification

Planning reads only Evidence from the Connection currently owned and explicitly referenced by the current Project. Connection status, enabled state, same-Workspace scope, resource context, Evidence verification, freshness and Project-topic matching remain required.

The service caps and filters the Evidence bundle to Project context before adding it to the existing single Planning AI request. The AI cannot attach canonical Evidence. After parsing, the server matches stored Evidence to each candidate, checks duplicate/public content, Project alignment, search-intent clarity and deterministic safety restrictions, then classifies and sorts candidates.

Order is deterministic: comprehensive, market opportunity, blog growth; within a type, verified Evidence, freshness and stable Opportunity identity are used. No unexplained numeric market score or first-place badge is produced.

A healthy Workspace Connection owned by another Project or left unassigned is intentionally excluded. The UI must guide the user to create a separate resource Connection rather than reusing the wrong site's Connection.

## 11. Quality Review

Generation and Quality Review use the confirmed canonical Opportunity. The existing one Generation call plus one Quality Review call policy does not change. Deterministic review rules block unsupported market-volume/CPC/rank claims, stale-as-current claims, Ads competition as SEO difficulty, CPC/RPM revenue prediction and recommendation type as manuscript quality score.

YouTube channel performance cannot justify search-volume, universal audience-demand or revenue claims.

## 12. Google OAuth providers

Search Console requests only:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

YouTube Analytics requests only:

```text
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

OAuth state persists only a SHA-256 state identifier and Workspace/Provider/Connection/return-path/timestamp context. State is short-lived, one-time and cannot carry credentials. Only internal Workspace Settings return paths are accepted. The callback returns the exact new Connection ID and Provider so the client hydrates the created Connection.

Server-listed Search Console properties and owned YouTube channels are canonical. Typed or client-supplied identifiers not present in that list are rejected.

## 13. Verification status

Externally verified before the current correction:

- Google Search Console OAuth login and real property list;
- `https://bright-healthy.tistory.com/` selection with `siteOwner` permission;
- real Search Console sync and Snapshot creation;
- NAVER Search Trend connection and synchronization;
- safe deletion of a legacy Search Console Data Source while historical records remained.

Implemented in Draft PR #42 but requiring current CI and local external verification:

- explicit Provider-level new Connection flow;
- multiple same-Provider resource Connections;
- same-Provider Google credential reuse;
- single-Project Connection ownership with atomic conflict protection;
- hiding other Project-owned Connections from available lists;
- single Project selection in the editor;
- immutable established resource identity;
- normalized public Project reference projection;
- duplicate Project name persistence guard;
- verified two-file duplicate Project merge command;
- multiple NAVER keyword-set Connections;
- YouTube Analytics OAuth, channel selection, sync and Evidence normalization.

Remaining external gates:

- current Draft PR CI success;
- verified local merge of the duplicate `건강정보` Project with source ID zero afterward;
- one `건강정보` area rendered after migration;
- health GSC/NAVER visible only in the canonical health Project;
- no health Connection cards in finance or art Project areas;
- creation of separate `brightjaetech.kr` Search Console and finance NAVER Connections;
- real YouTube OAuth, channel selection, Snapshot and Evidence creation;
- GA4 and AdSense real-account connection and synchronization;
- automatic refresh after an access token expires;
- real quota, throttling and production response variants.

No feature is externally verified merely because automated tests pass.
