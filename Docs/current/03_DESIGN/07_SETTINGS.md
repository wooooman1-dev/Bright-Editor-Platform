# Settings

Simple First

Visible Settings - Project - Platform - Writing Style - Publishing

Advanced settings stay hidden.

Settings navigation places Enabled Platforms directly above Platform Connections. It uses checkboxes for Tistory, WordPress, YouTube, and Naver Cafe. Disabled platforms are hidden from Overview and Platform Connections rather than shown as Not Connected.

The first Workspace entry uses a dedicated, beginner-friendly platform selection screen only when Enabled Platforms has never been configured. Continue is disabled until at least one platform is selected. After saving, the user lands on Platform Connections and may connect or Skip for now.

## Data Sources

Data Sources is a separate Settings section from Platform Connections. Platform Connections are publishing destinations; Data Sources are market and first-party performance inputs. Connecting Tistory, WordPress or YouTube for publishing does not automatically authorize Search Console, GA4, AdSense, NAVER Search Trend or YouTube Analytics.

The primary grouping is **Project**, not publishing platform.

```text
Project: 건강 정보
├── Publishing targets: Tistory, YouTube, Naver Cafe
├── GSC · 밝은건강
├── NAVER · 건강
└── YouTube · 밝은건강TV

Project: 밝은재테크
├── Publishing target: WordPress
├── GSC · 밝은재테크
├── GA4 · 밝은재테크
├── AdSense · 밝은재테크
└── NAVER · 재테크
```

A Project is the brand, topic, audience and content-strategy boundary. Tistory, WordPress, YouTube and Naver Cafe are Platform Targets inside a Project. The same strategy must not be split into separate Projects merely because the output platform differs.

A Workspace can own multiple `DataSourceConnection` records for the same Provider. Each site, channel, account resource or keyword set has its own Connection ID. The UI must never silently replace or edit an existing connection when the user selects a Provider.

The Data Sources screen uses this order:

1. **Project context selection**
2. **Explicit Provider connection creation**
3. **Connection resource and Project assignment confirmation**
4. **Assigned versus available Connection management**

### Project context

The first section asks which Project the user is configuring. The first Project is not silently selected. The user must choose a Project explicitly, or continue with Workspace-only connection creation.

A `새 Project 만들기` action opens the dedicated Project creation screen. After successful creation, the user returns to Data Sources with the new Project selected.

Selecting a Project changes only the assignment view. It never moves, duplicates or rewrites a Workspace Connection.

### Provider selection and new connection

The generic `Provider 선택해서 새 연결 추가` action does not immediately open a preferred Provider form. Every enabled Provider card has its own explicit `이 Provider 연결 추가` action.

Provider cards display the current same-Provider Connection count. Clicking the card body alone is not a hidden create or edit command. Existing Connection cards have a separate `구성 편집` action.

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

### Explicit Project assignment

The Connection editor lists all Workspace Projects under `이 연결을 사용할 Project`.

- No Project is assigned implicitly merely because it is the first Project.
- Starting a new Connection while an explicit Project context is selected may preselect that Project, but the selection remains visible and editable before save.
- Selecting no Project stores a Workspace-only Connection that is excluded from every Project's Opportunity Planning.
- Saving or editing synchronizes only the explicit Project checkboxes.
- Google OAuth return preserves the user's pending Project choices until resource selection and final save.

Every configured connection has its own ID, display name, resource, sync state, last attempt, last success, freshness, latest period, limitations, safe recent error and Workspace-wide Project reference count. A Project may opt into any number of enabled same-Workspace connections. Opportunity Planning reads only connections explicitly assigned to that Project.

### Project assignment view

After a Project is selected, the screen separates Connections into:

```text
<Project>에 배정된 연결
배정 가능한 Workspace 연결
```

The assigned section contains only references for the selected Project. The available section contains the remaining Workspace Connections. Each card has an explicit `이 Project에 배정` or `이 Project에서 제외` action. A Connection assigned to a different Project is not presented as though it belongs to the currently selected Project.

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

Deletion requires explicit confirmation. Active cards require a second strong confirmation that credentials may also be removed. The confirmation identifies provider, display name, resource, status, Connection ID context and Workspace-wide Project reference count, and states that the card/references are removed while existing Snapshot and Evidence remain. Cancel sends no request. Successful deletion removes the card immediately, refreshes server state and closes an editor that was showing the deleted Connection.
