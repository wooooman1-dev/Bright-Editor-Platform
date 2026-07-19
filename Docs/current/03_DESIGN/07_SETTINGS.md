# Settings

Simple First

Visible Settings - Project - Platform - Writing Style - Publishing

Advanced settings stay hidden.

Settings navigation places Enabled Platforms directly above Platform Connections. It uses checkboxes for Tistory, WordPress, YouTube, and Naver Cafe. Disabled platforms are hidden from Overview and Platform Connections rather than shown as Not Connected.

The first Workspace entry uses a dedicated, beginner-friendly platform selection screen only when Enabled Platforms has never been configured. Continue is disabled until at least one platform is selected. After saving, the user lands on Platform Connections and may connect or Skip for now.

Data Sources is a separate Settings section from Platform Connections. It lists Search Console, GA4, AdSense, NAVER Search Trend and conditional official Google Ads/Trends access. Each configured connection shows enabled state, sync state, last attempt, last success, freshness, latest period, limitation and safe recent error. Users can configure a resource, manually sync, disconnect credentials while retaining snapshots, and choose which same-Workspace Projects may use the connection.

Data Source cards distinguish Disable, Disconnect and **데이터 소스 삭제**. A disconnected card replaces the meaningless Disconnect action with `이미 연결 해제됨` and offers deletion. Active cards require a second strong confirmation that credentials will also be removed. The confirmation identifies provider, display name, resource, status, Connection ID context and Workspace-wide Project reference count, and states that the card/references are removed while existing Snapshot and Evidence remain. Cancel sends no request. Successful deletion removes the card immediately, refreshes server state and selects the next safe same-provider Connection.

Credential fields are write-only. Saved token, refresh token and client secret values are never rendered back, including masked originals.
