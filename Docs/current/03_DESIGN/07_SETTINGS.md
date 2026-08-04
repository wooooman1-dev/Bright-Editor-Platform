# Settings

Simple First

Visible Settings - Project - Platform - Writing Style - Publishing

Advanced settings stay hidden.

Settings navigation places Enabled Platforms directly above Platform Connections. It uses checkboxes for Tistory, WordPress, YouTube, and Naver Cafe. Disabled platforms are hidden from Overview and Platform Connections rather than shown as Not Connected.

The first Workspace entry uses a dedicated, beginner-friendly platform selection screen only when Enabled Platforms has never been configured. Continue is disabled until at least one platform is selected. After saving, the user lands on Platform Connections and may connect or Skip for now.

## Data Sources

Data Sources is a separate Settings section from Platform Connections. Platform Connections are publishing destinations; Data Sources are market and first-party performance inputs. Connecting Tistory, WordPress or YouTube for publishing does not automatically authorize Search Console, GA4, AdSense, NAVER Search Trend or YouTube Analytics.

A Workspace can own multiple `DataSourceConnection` records for the same Provider. The UI must never silently replace or edit an existing connection when the user selects a Provider card.

The Data Sources screen is divided into three explicit operations:

1. **Provider selection and 새 연결 추가**
2. **One connection resource configuration or existing connection editing**
3. **Project별 데이터 소스 배정**

Each Provider card displays the current connection count. `새 연결 추가` always opens a clean add state and preserves every existing connection. Existing cards have a separate `구성 편집` action.

Examples:

```text
Google Search Console
├── GSC · 밝은건강     → bright-healthy.tistory.com
└── GSC · 밝은재테크   → brightjaetech.kr

NAVER Search Trend
├── NAVER · 건강       → 건강, 운동, 영양
└── NAVER · 재테크     → 예금, 적금, 고정비, 보험

YouTube Analytics
└── YouTube · 밝은건강TV → selected owned channel
```

Every configured connection has its own ID, display name, resource, sync state, last attempt, last success, freshness, latest period, limitations, safe recent error and Workspace-wide Project reference count. A Project may opt into any number of enabled same-Workspace connections. Opportunity Planning reads only connections explicitly assigned to that Project.

### Google resource connections

Google Search Console and YouTube Analytics use official OAuth and server-listed resources. A new connection can either start a new Google OAuth flow or reuse the stored credential of an active connection for the same Provider. Reuse creates a new `DataSourceConnection` with a new ID and empty resource selection; it does not overwrite the source connection.

A reused Google credential may be referenced by multiple resource connections. Disconnecting, deleting or reconnecting one connection must not revoke or delete a credential still used by another active connection. Each connection removes only its own credential reference. Remote revocation and local secret deletion occur only when no active connection still references that credential.

Search Console properties and YouTube channels are selected only from server-returned authorized resources. Typed or spoofed resource identifiers are rejected. The YouTube connection requests read-only YouTube and YouTube Analytics access and does not request monetary metrics.

### Provider-specific configuration

- Search Console: one authorized site property per Connection.
- GA4: one property per Connection.
- AdSense: one account/site resource per Connection.
- YouTube Analytics: one owned channel per Connection.
- NAVER Search Trend: one Project-oriented keyword set per Connection. Multiple keyword sets require separate Connections.
- Google Ads Keyword Planning and Google Trends Official remain disabled until official API access is verified. No scraping fallback is used.

Credential fields are write-only. Saved access tokens, refresh tokens, client IDs and client secrets are never rendered back, including masked originals.

### Lifecycle actions

Users can configure a resource, manually sync, disable, disconnect, delete and choose which same-Workspace Projects may use each connection.

Data Source cards distinguish Disable, Disconnect and **데이터 소스 삭제**. Disable keeps credentials and metadata while stopping use. Disconnect removes this Connection's credential reference while retaining snapshots and Evidence. A disconnected card replaces the meaningless Disconnect action with `이미 연결 해제됨` and offers deletion.

Deletion requires explicit confirmation. Active cards require a second strong confirmation that credentials may also be removed. The confirmation identifies provider, display name, resource, status, Connection ID context and Workspace-wide Project reference count, and states that the card/references are removed while existing Snapshot and Evidence remain. Cancel sends no request. Successful deletion removes the card immediately, refreshes server state and returns the editor to a clean add state.
