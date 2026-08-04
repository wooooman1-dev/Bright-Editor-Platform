# Settings

Simple First

Visible Settings - Project - Platform - Writing Style - Publishing

Advanced settings stay hidden.

Settings navigation places Enabled Platforms directly above Platform Connections. It uses checkboxes for Tistory, WordPress, YouTube, and Naver Cafe. Disabled platforms are hidden from Overview and Platform Connections rather than shown as Not Connected.

The first Workspace entry uses a dedicated, beginner-friendly platform selection screen only when Enabled Platforms has never been configured. Continue is disabled until at least one platform is selected. After saving, the user lands on Platform Connections and may connect or Skip for now.

## Data Sources

Data Sources is separate from Platform Connections. Platform Connections are publishing destinations; Data Sources are market and first-party performance inputs. Connecting Tistory, WordPress or YouTube for publishing does not automatically authorize Search Console, GA4, AdSense, NAVER Search Trend or YouTube Analytics.

The primary grouping is **Project**, not publishing platform.

```text
Project: 건강정보
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

A Workspace can own multiple `DataSourceConnection` records for the same Provider. Each site, channel, account resource or keyword set has its own Connection ID. A Connection is unassigned or belongs to exactly one Project. Authentication credentials may be reused across separate Connections; a resource Connection itself is never shared across Projects.

The Data Sources screen uses this order:

1. existing Project area selection;
2. explicit Provider connection creation;
3. Connection resource and single Project assignment confirmation;
4. one Workspace-level unassigned Connection area;
5. independent assigned-only Project management areas.

### Existing Project areas

The Project selector lists Projects that already exist in the Workspace. It does not create Project data.

`선택한 Project 영역 만들기` adds the selected existing Project as an independent lower management area. It must not navigate to a Project creation page or call `createProject`.

All current Workspace Projects are shown as independent areas by default. Closing an area hides only that UI area; it never deletes the Project, Connection, Snapshot, Evidence, owner or reference. A hidden area can be added again through the selector.

Each area keeps its own immutable Project ID and renders from that ID. Changing the top selector must not rename, replace or rebind an existing area. Duplicate identical Project IDs are deduplicated defensively at render state initialization, but different IDs with the same normalized name are shown separately with a prominent migration warning because they represent real persisted Project records.

```text
Project areas
├── 건강정보                  projectId: project-health
├── 비바레인 미술 감상 가이드 projectId: project-art
└── 밝은재테크                projectId: project-finance
```

The canonical Project persistence boundary rejects newly introduced duplicate IDs and normalized duplicate names in the same Workspace. Legacy duplicate names may remain unchanged only until the verified merge command is run; Settings must not suggest deleting either record before that migration.

### Provider selection and new connection

The generic `Provider 선택해서 새 연결 추가` action does not immediately open a preferred Provider form. Every enabled Provider card has its own explicit `이 Provider 연결 추가` action.

Provider cards display the current same-Provider Connection count. Clicking the card body alone is not a hidden create or edit command. Existing Connection cards have a separate `구성 편집` action.

Each Project area also exposes direct `GSC 연결 추가` and `NAVER 연결 추가` actions. Starting from a Project area preselects only that area's Project in the connection editor; the single selection remains visible before save.

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

### Single Project assignment

The Connection editor exposes one selector under `이 연결을 사용할 Project`.

- No Project is assigned implicitly merely because it is first.
- Starting from a Project area may preselect that one Project.
- Selecting no Project stores a Workspace-only, unassigned Connection excluded from Opportunity Planning.
- A Connection can have at most one active Project owner/reference.
- Google OAuth return preserves at most one pending Project choice until resource selection and final save.
- An established Connection can stay with its owner or be unassigned.
- Moving it to another Project requires first saving it as unassigned and then assigning it from the Workspace unassigned Connection area.

The Repository owner claim is the final atomic concurrency gate. A second Project assignment returns a safe `409 DATA_SOURCE_PROJECT_SCOPE_CONFLICT` response identifying the existing owner and directing the user to add a separate Connection.

### Workspace unassigned Connection area

Connections with no active Project owner are rendered once in the Workspace-level `Workspace 미배정 연결` area.

```text
Workspace 미배정 연결
└── one Connection card
    ├── configuration, sync and lifecycle actions
    ├── one Project selector
    └── 선택한 Project에 배정
```

The same unassigned Connection must not be repeated under every Project. Repetition gives the false impression that the Connection already belongs to each Project and multiplies destructive configuration, sync and deletion controls across the page.

The Workspace area calculates:

```text
unassigned = Connections with no active Project owner
```

Each unassigned card provides one explicit Project selector. Assignment sends the selected immutable Project ID and exact Connection ID. After the server accepts the atomic owner claim and the screen refreshes, the card disappears from the Workspace area and appears only in the assigned Project area.

### Independent Project management areas

Each lower Project area calculates only:

```text
assigned = Connections owned by this Project
```

A Project area never renders unassigned Connections and never renders a Connection owned by another Project. This prevents one unassigned or health-specific GSC/NAVER card, including its edit, sync, disable, disconnect and delete actions, from appearing repeatedly inside health, finance and art Project areas.

The area uses its own Project ID when filtering and when sending `set-project-reference` for release. It never uses a shared top selector value for assignment actions.

Every visible assigned Connection card displays its actual Project name derived from normalized public Workspace references and exposes `이 Project에서 제외`. Releasing the Connection moves it to the single Workspace unassigned area; it does not duplicate it across Project areas.

### Resource identity

Each Connection represents one stable resource identity:

- Search Console: one authorized `siteProperty`;
- GA4: one `propertyId`;
- AdSense: one account/site pair;
- YouTube Analytics: one owned `channelId`;
- NAVER Search Trend: one normalized keyword set.

After an identity is saved, the corresponding field is read-only in the editor and the API independently rejects identity replacement. Otherwise old Snapshot and Evidence records could be mixed with a different site, channel, account or keyword strategy under the same Connection ID.

A different resource requires a new Connection. For Google Search Console and YouTube Analytics, the user may reuse the stored credential of an active same-Provider Connection. Reuse creates a new ID with empty resource selection; it does not overwrite the source Connection or copy owner, Snapshot or Evidence data.

Search Console properties and YouTube channels are selected only from server-returned authorized resources. Typed or spoofed resource identifiers are rejected. YouTube requests read-only channel and Analytics scopes and does not request monetary metrics.

### Credential reuse and lifecycle

A reused Google credential may be referenced by multiple resource Connections. Disconnecting, deleting or reconnecting one Connection must not revoke or delete a credential still used by another active Connection. Each Connection removes only its own credential reference. Remote revocation and local secret deletion occur only when no active Connection still references that credential.

Credential fields are write-only. Saved access tokens, refresh tokens, client IDs and client secrets are never rendered back, including masked originals.

Data Source cards distinguish Disable, Disconnect and **데이터 소스 삭제**:

- Disable keeps credential, metadata, owner/reference, snapshots and Evidence while stopping use.
- Disconnect removes this Connection's credential reference while retaining historical data.
- Delete removes the card, owner and references after explicit confirmation while preserving existing Snapshot and Evidence records.

A disconnected card shows `이미 연결 해제됨` and offers deletion. Active deletion requires a second strong confirmation that credentials may also be removed. Cancel sends no request. Successful deletion refreshes server state and closes an editor showing the deleted Connection.

### Duplicate Project migration

When Settings detects normalized duplicate Project names, it displays a warning and preserves both areas until migration. The supported command is:

```text
npm run project:merge-duplicate -- --source <duplicate Project ID> --target <canonical Project ID>
```

The command refuses to run while the Next.js development server lock exists, backs up both `studio-data.json` and `metadata.json`, moves all exact nested Project ID references, removes only the source Project record, re-reads both files and requires zero remaining source ID references. On any replacement or verification failure, both files are restored from backup.
