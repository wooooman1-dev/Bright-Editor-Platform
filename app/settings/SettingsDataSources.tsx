"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DataSourceConnectionErrorCode, DataSourceProvider, DataSourceResourceConfiguration } from "../../core/intelligence";

export type PublicDataSourceConnection = Readonly<{
  id: string;
  provider: DataSourceProvider;
  displayName: string;
  status: string;
  enabled: boolean;
  version: number;
  resourceConfiguration: DataSourceResourceConfiguration;
  hasCredentials: boolean;
  projectReferenceCount?: number;
  credentialMode?: "googleOAuth" | "legacyManualToken" | "providerCredential";
  availableResources?: readonly Readonly<{ siteUrl: string; permissionLevel?: string }>[];
  lastSyncAttemptAt?: string;
  lastSuccessfulSyncAt?: string;
  lastError?: string;
  lastErrorCode?: DataSourceConnectionErrorCode;
  updatedAt?: string;
  freshness: string;
  latestSnapshot?: Readonly<{ periodStart: string; periodEnd: string; syncedAt: string; limitations: readonly string[] }> | null;
}>;
type ProjectReference = Readonly<{ projectId: string; connectionId: string; enabled: boolean }>;
type DataSourceField = "displayName" | "siteProperty" | "propertyId" | "accountReference" | "keywords" | "accessToken" | "clientId" | "clientSecret";
type FieldErrors = Partial<Record<DataSourceField, string>>;

const providers: readonly Readonly<{ provider: DataSourceProvider; label: string; enabled: boolean; description: string }>[] = [
  { provider: "googleSearchConsole", label: "Google Search Console", enabled: true, description: "사이트 검색 노출·클릭·CTR·평균 게재순위" },
  { provider: "googleAnalytics4", label: "Google Analytics 4", enabled: true, description: "페이지 조회·사용자·세션·참여 성과" },
  { provider: "googleAdSense", label: "Google AdSense", enabled: true, description: "공식 보고서 범위의 수익·노출·클릭·CTR·RPM" },
  { provider: "naverSearchTrend", label: "NAVER Search Trend", enabled: true, description: "절대 검색량이 아닌 상대 검색 추세" },
  { provider: "googleAdsKeywordPlanning", label: "Google Ads Keyword Planning", enabled: false, description: "공식 API 권한과 고객 계정 확인 후 활성화" },
  { provider: "googleTrendsOfficial", label: "Google Trends Official", enabled: false, description: "공식 접근 권한 확인 전 비활성화 · scraping 미사용" },
];
const defaultPeriodEnd = new Date().toISOString().slice(0, 10);
const defaultPeriodStart = new Date(Date.parse(defaultPeriodEnd) - 27 * 86400000).toISOString().slice(0, 10);

export function SettingsDataSources({ projects, workspaceId }: { projects: readonly Readonly<{ id: string; name: string }>[]; workspaceId: string }) {
  const oauthReturnHandled = useRef(false);
  const selectionInitialized = useRef(false);
  const [connections, setConnections] = useState<readonly PublicDataSourceConnection[]>([]);
  const [references, setReferences] = useState<readonly ProjectReference[]>([]);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [provider, setProvider] = useState<DataSourceProvider>("googleSearchConsole");
  const [displayName, setDisplayName] = useState("Search Console");
  const [resource, setResource] = useState<Record<string, string>>({});
  const [accessToken, setAccessToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [editingConnectionId, setEditingConnectionId] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [googleOAuthConfigured, setGoogleOAuthConfigured] = useState(false);
  const periodEnd = defaultPeriodEnd;
  const periodStart = defaultPeriodStart;

  const editConnection = useCallback((connection: PublicDataSourceConnection) => {
    setProvider(connection.provider);
    setDisplayName(connection.displayName);
    setResource(resourceFormValue(connection.resourceConfiguration));
    setAccessToken(""); setClientId(""); setClientSecret(""); setFieldErrors({});
    setEditingConnectionId(connection.id);
    selectionInitialized.current = true;
  }, []);

  const refresh = useCallback(async (preferredConnectionId?: string, preferredProvider: DataSourceProvider = "googleSearchConsole") => {
    const query = new URLSearchParams({ workspaceId, ...(projectId ? { projectId } : {}) });
    const response = await fetch(`/api/data-sources?${query}`, { cache: "no-store" }), result = await response.json() as { connections?: PublicDataSourceConnection[]; projectReferences?: ProjectReference[]; googleOAuth?: { configured?: boolean }; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Data Sources를 불러오지 못했습니다.");
    const nextConnections = result.connections ?? [];
    setConnections(nextConnections); setReferences(result.projectReferences ?? []); setGoogleOAuthConfigured(result.googleOAuth?.configured === true);
    const connection = selectPreferredDataSourceConnection(nextConnections, preferredProvider, preferredConnectionId);
    if (preferredConnectionId || !selectionInitialized.current) {
      if (connection) editConnection(connection);
      else if (preferredConnectionId) setNotice("OAuth로 생성된 Google Search Console 연결을 찾을 수 없습니다. 설정 데이터를 새로고침한 뒤 다시 연결해 주세요.");
      selectionInitialized.current = true;
    }
    return Boolean(!preferredConnectionId || connection?.id === preferredConnectionId);
  }, [editConnection, projectId, workspaceId]);

  useEffect(() => {
    const oauthReturn = oauthReturnHandled.current ? emptyOAuthReturn : readOAuthReturn();
    oauthReturnHandled.current = true;
    if (oauthReturn.message) setNotice(oauthReturn.message);
    void refresh(oauthReturn.connectionId || undefined).then(() => {
      if (oauthReturn.outcome) removeOAuthReturnQuery();
    }).catch((error) => setNotice(message(error)));
  }, [refresh]);

  const action = async (body: Record<string, unknown>) => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/data-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
      const result = await response.json() as Record<string, unknown> & { error?: string; code?: string; field?: string };
      if (!response.ok) throw new DataSourceClientError(result.error ?? "Data Source 요청을 처리하지 못했습니다.", result.field);
      await refresh(); return result;
    } finally { setBusy(false); }
  };

  const save = async () => {
    const existing = connections.find((value) => value.id === editingConnectionId);
    const errors = validateDataSourceFields({ provider, displayName, resource, accessToken, clientId, clientSecret, hasCredentials: existing?.hasCredentials === true });
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setNotice(""); return; }
    const configuration: Record<string, unknown> = provider === "googleSearchConsole" ? { siteProperty: resource.siteProperty, country: resource.country, device: resource.device, searchType: resource.searchType || "web" }
      : provider === "googleAnalytics4" ? { propertyId: resource.propertyId, streamReference: resource.streamReference }
        : provider === "googleAdSense" ? { accountReference: resource.accountReference, siteReference: resource.siteReference }
          : { region: resource.region, device: resource.device, gender: resource.gender, ages: split(resource.ages), keywords: split(resource.keywords) };
    const credentials = provider === "googleSearchConsole" ? {} : provider === "naverSearchTrend" ? { clientId, clientSecret } : { accessToken };
    await action({ action: "save-connection", provider, displayName, resourceConfiguration: configuration, credentials, enabled: true, ...(existing ? { connectionId: existing.id, connectionVersion: existing.version } : {}) });
    setAccessToken(""); setClientId(""); setClientSecret(""); setNotice("연결 메타데이터를 저장했습니다. 비밀 원문은 다시 표시되지 않습니다.");
  };

  const startGoogleOAuth = (connectionId?: string) => {
    const query = new URLSearchParams({ workspaceId, provider: "googleSearchConsole", returnTo: window.location.pathname, ...(connectionId ? { connectionId } : {}) });
    window.location.assign(`/api/data-sources/google/start?${query}`);
  };

  const sync = async (connection: PublicDataSourceConnection) => {
    const result = await action({ action: "sync", connectionId: connection.id, connectionVersion: connection.version, periodStart, periodEnd, operationId: crypto.randomUUID() }) as { job?: { id: string; state: string; message: string } };
    if (!result.job || result.job.state === "completed") { setNotice(result.job?.message ?? "동기화가 완료되었습니다."); return; }
    setNotice("공식 Provider 동기화가 진행 중입니다. 화면을 이동해도 마지막 성공 snapshot은 유지됩니다.");
    void poll(result.job.id);
  };

  const deleteDataSource = async (connection: PublicDataSourceConnection) => {
    if (!window.confirm(dataSourceDeletionConfirmation(connection))) return;
    const active = connection.status !== "disconnected";
    if (active && !window.confirm("현재 연결과 자격 증명도 함께 제거됩니다.\n\n연결 해제 후 데이터 소스를 삭제할까요?")) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/data-sources", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, connectionId: connection.id, connectionVersion: connection.version, confirmationMode: active ? "disconnectAndDelete" : "deleteDisconnected" }) });
      const result = await response.json() as { error?: string; field?: string };
      if (!response.ok) throw new DataSourceClientError(result.error ?? "데이터 소스 연결을 삭제하지 못했습니다.", result.field);
      setConnections((current) => current.filter((value) => value.id !== connection.id));
      setReferences((current) => current.filter((value) => value.connectionId !== connection.id));
      if (editingConnectionId === connection.id) { setEditingConnectionId(""); setDisplayName(providerLabel(connection.provider)); setResource({}); setFieldErrors({}); }
      selectionInitialized.current = false;
      await refresh(undefined, connection.provider);
      setNotice("데이터 소스 연결을 삭제했습니다. 기존 Snapshot과 Evidence는 보존됩니다.");
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  };

  const poll = async (jobId: string) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const response = await fetch(`/api/data-sources?workspaceId=${encodeURIComponent(workspaceId)}&jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" }), result = await response.json() as { job?: { state: string; message: string } };
      if (result.job && ["completed", "failed", "superseded"].includes(result.job.state)) { await refresh(); setNotice(result.job.state === "failed" ? "" : result.job.message); return; }
    }
    setNotice("동기화는 계속될 수 있습니다. 잠시 후 마지막 성공 시각을 다시 확인해 주세요.");
  };

  const handleError = (error: unknown) => {
    const field = error instanceof DataSourceClientError ? error.field : undefined;
    if (error instanceof DataSourceClientError && isDataSourceField(field)) setFieldErrors((current) => ({ ...current, [field]: error.message }));
    else setNotice(message(error));
  };

  const changeResource = (field: DataSourceField, value: string) => {
    setResource((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const selectedProvider = providers.find((value) => value.provider === provider)!;
  const editingConnection = connections.find((value) => value.id === editingConnectionId);
  const hasGoogleOAuthCredential = editingConnection?.credentialMode === "googleOAuth" && editingConnection.hasCredentials;
  return <div className="space-y-5">
    <section className="rounded-[20px] border border-black/6 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">외부 시장·성과 Data Sources</h2>
      <p className="mt-2 text-sm leading-6 text-[#77777f]">발행용 플랫폼 연결과 별도로 Workspace가 소유합니다. 원고 생성 시 실시간 호출하지 않고 마지막 성공 snapshot만 사용합니다.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{providers.map((item) => <button className={`rounded-xl border p-4 text-left ${provider === item.provider ? "border-[#ff6b6b] bg-[#fff7f7]" : ""}`} disabled={!item.enabled} key={item.provider} onClick={() => { const preferred = selectPreferredDataSourceConnection(connections, item.provider); if (preferred) editConnection(preferred); else { setProvider(item.provider); setDisplayName(item.label); setResource({}); setEditingConnectionId(""); setFieldErrors({}); } }} type="button"><strong className="block text-sm">{item.label}</strong><span className="mt-2 block text-xs leading-5 text-[#77777f]">{item.description}</span>{!item.enabled ? <span className="mt-2 block text-xs font-semibold text-amber-800">구성 필요</span> : null}</button>)}</div>
      {selectedProvider.enabled ? <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field error={fieldErrors.displayName} label="표시 이름 (필수)" onChange={(value) => { setDisplayName(value); setFieldErrors((current) => ({ ...current, displayName: undefined })); }} value={displayName} />
        {provider === "googleSearchConsole" ? <><div className="rounded-xl border bg-[#f8f8fa] p-4 sm:col-span-2"><p className="text-sm font-semibold">Google 계정 연결</p><p className="mt-1 text-xs leading-5 text-[#77777f]">{hasGoogleOAuthCredential ? "Google 계정이 연결되었습니다. Search Console 읽기 전용 권한만 사용합니다." : "Google 계정 승인 후 접근 가능한 Search Console 사이트 속성을 불러옵니다."}</p>{googleOAuthConfigured ? <button className="mt-3 rounded-lg border bg-white px-4 py-2 text-sm font-semibold" disabled={busy} onClick={() => startGoogleOAuth(editingConnection?.id)} type="button">{hasGoogleOAuthCredential ? "Google 계정 다시 연결" : "Google 계정으로 연결"}</button> : <p className="mt-3 text-sm font-semibold text-amber-800">Google OAuth 설정이 필요합니다. 서버 환경변수를 확인해 주세요.</p>}</div>{hasGoogleOAuthCredential ? <><SelectField error={fieldErrors.siteProperty} label="Search Console 사이트 속성 (필수)" onChange={(value) => changeResource("siteProperty", value)} options={editingConnection.availableResources ?? []} value={resource.siteProperty ?? ""} />{editingConnection.availableResources?.length ? null : <p className="self-end rounded-xl bg-amber-50 p-3 text-sm text-amber-900">접근 가능한 Search Console 사이트 속성이 없습니다. Search Console 계정 권한을 확인해 주세요.</p>}<Field label="Country (선택)" onChange={(value) => setResource({ ...resource, country: value })} value={resource.country ?? ""} /><Field label="Device (선택)" onChange={(value) => setResource({ ...resource, device: value })} placeholder="mobile" value={resource.device ?? ""} /></> : null}</> : null}
        {provider === "googleAnalytics4" ? <><Field error={fieldErrors.propertyId} label="GA4 property ID (필수)" onChange={(value) => changeResource("propertyId", value)} placeholder="123456789" value={resource.propertyId ?? ""} /><Field label="Stream reference (선택)" onChange={(value) => setResource({ ...resource, streamReference: value })} value={resource.streamReference ?? ""} /></> : null}
        {provider === "googleAdSense" ? <><Field error={fieldErrors.accountReference} label="AdSense account (필수)" onChange={(value) => changeResource("accountReference", value)} placeholder="pub-... 또는 account ID" value={resource.accountReference ?? ""} /><Field label="Site reference (선택)" onChange={(value) => setResource({ ...resource, siteReference: value })} value={resource.siteReference ?? ""} /></> : null}
        {provider === "naverSearchTrend" ? <><Field error={fieldErrors.keywords} label="검색어 (필수, 쉼표 구분)" onChange={(value) => changeResource("keywords", value)} value={resource.keywords ?? ""} /><Field label="Device (선택)" onChange={(value) => setResource({ ...resource, device: value })} placeholder="pc 또는 mo" value={resource.device ?? ""} /><Field label="Region preference (API 미지원 시 limitation)" onChange={(value) => setResource({ ...resource, region: value })} value={resource.region ?? ""} /><Field error={fieldErrors.clientId} label="NAVER Client ID (필수)" onChange={(value) => { setClientId(value); setFieldErrors((current) => ({ ...current, clientId: undefined })); }} value={clientId} /></> : null}
        {provider === "naverSearchTrend" ? <SecretField error={fieldErrors.clientSecret} label="NAVER Client Secret (필수)" onChange={(value) => { setClientSecret(value); setFieldErrors((current) => ({ ...current, clientSecret: undefined })); }} value={clientSecret} /> : provider === "googleSearchConsole" ? null : <SecretField error={fieldErrors.accessToken} label="OAuth access token (필수)" onChange={(value) => { setAccessToken(value); setFieldErrors((current) => ({ ...current, accessToken: undefined })); }} value={accessToken} />}
        {provider !== "googleSearchConsole" || hasGoogleOAuthCredential ? <div className="sm:col-span-2"><button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void save().catch(handleError)} type="button">{editingConnectionId ? "연결 구성 업데이트" : "연결 구성 저장"}</button>{editingConnectionId ? <button className="ml-2 rounded-xl border px-5 py-3 text-sm font-semibold" onClick={() => { setEditingConnectionId(""); setFieldErrors({}); }} type="button">편집 취소</button> : null}<p className="mt-2 text-xs text-[#77777f]">Credential은 DPAPI SecretStore에 저장되며 API 응답과 화면에 다시 반환되지 않습니다.</p></div> : null}
      </div> : null}
    </section>

    <section className="rounded-[20px] border border-black/6 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">연결 상태와 Project 사용 범위</h2><p className="mt-1 text-sm text-[#77777f]">연결은 Workspace에서 재사용하고 Project별로 Evidence 사용 여부를 선택합니다.</p></div>{projects.length ? <label className="text-sm font-semibold">Project<select className="ml-2 rounded-lg border px-3 py-2 font-normal" onChange={(event) => setProjectId(event.target.value)} value={projectId}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : null}</div>
      <div className="mt-5 space-y-3">{connections.length ? connections.map((connection) => {
        const referenced = references.some((value) => value.connectionId === connection.id && value.enabled);
        const reconnectRequired = connection.status === "error" && (connection.lastErrorCode === "DATA_SOURCE_AUTHENTICATION_ERROR" || connection.lastErrorCode === "GOOGLE_OAUTH_REFRESH_FAILED");
        return <article aria-current={editingConnectionId === connection.id ? "true" : undefined} className={`rounded-xl border p-4 ${editingConnectionId === connection.id ? "border-[#ff6b6b] bg-[#fffafa]" : ""}`} key={connection.id}><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{providerLabel(connection.provider)} · {connection.displayName}</p><p className="mt-1 text-sm text-[#77777f]">{statusLabel(connection.status, reconnectRequired)} · freshness {freshnessLabel(connection.freshness)}</p><p className="mt-1 text-xs text-[#92929a]">연결 ID: {connection.id} · Project 참조 {connection.projectReferenceCount ?? 0}개</p><p className="mt-1 text-xs text-[#92929a]">선택 resource: {connectionResourceLabel(connection)} · 마지막 성공: {formatDate(connection.lastSuccessfulSyncAt)} · 최근 시도: {formatDate(connection.lastSyncAttemptAt)}</p>{connection.latestSnapshot ? <p className="mt-2 text-xs text-[#77777f]">기간 {connection.latestSnapshot.periodStart}~{connection.latestSnapshot.periodEnd} · {connection.latestSnapshot.limitations.join(" ")}</p> : <p className="mt-2 text-xs text-amber-800">성공 snapshot 없음</p>}{connection.lastError ? <p className="mt-2 text-sm text-red-700">{connectionErrorLabel(connection.lastErrorCode, connection.lastError)}</p> : null}</div><div className="flex flex-wrap gap-2"><button className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={() => { if (reconnectRequired && connection.provider === "googleSearchConsole") { startGoogleOAuth(connection.id); return; } editConnection(connection); setNotice(`${connection.displayName} 연결을 편집하고 있습니다.`); window.scrollTo({ top: 0, behavior: "smooth" }); }} type="button">{reconnectRequired ? "다시 연결" : "구성 편집"}</button><button className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || connection.status === "syncing" || !connection.enabled} onClick={() => void sync(connection).catch((error) => setNotice(message(error)))} type="button">{connection.status === "syncing" ? "동기화 중…" : "수동 동기화"}</button><button className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={busy || connection.status === "disconnected"} onClick={() => void action({ action: "set-enabled", connectionId: connection.id, connectionVersion: connection.version, enabled: !connection.enabled }).catch((error) => setNotice(message(error)))} type="button">{connection.enabled ? "비활성화" : "활성화"}</button>{connection.status === "disconnected" ? <span className="self-center text-xs text-[#77777f]">이미 연결 해제됨</span> : <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700" disabled={busy} onClick={() => { if (window.confirm("연결과 비밀정보를 해제할까요? 마지막 성공 snapshot과 Evidence는 유지됩니다.")) void action({ action: "disconnect", connectionId: connection.id, connectionVersion: connection.version }).then(() => setNotice("연결을 해제했습니다. 기존 snapshot은 유지됩니다.")).catch((error) => setNotice(message(error))); }} type="button">연결 해제</button>}<button className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800" disabled={busy} onClick={() => void deleteDataSource(connection)} type="button">데이터 소스 삭제</button></div></div>{projectId ? <label className="mt-4 flex gap-2 border-t pt-4 text-sm"><input checked={referenced} onChange={(event) => void action({ action: "set-project-reference", projectId, connectionId: connection.id, enabled: event.target.checked }).catch((error) => setNotice(message(error)))} type="checkbox" />이 Project의 Opportunity Planning에서 사용</label> : null}</article>;
      }) : <p className="rounded-xl bg-[#f8f8fa] p-4 text-sm text-[#77777f]">구성된 Data Source가 없습니다. 외부 데이터가 없어도 블로그 성장 추천은 계속 사용할 수 있습니다.</p>}</div>
    </section>
    <p aria-live="polite" className="text-sm text-[#66666f]">{notice}</p>
  </div>;
}

function Field({ error, label, onChange, placeholder, value }: { error?: string; label: string; onChange: (value: string) => void; placeholder?: string; value: string }) { return <label className="text-sm font-semibold">{label}<input aria-invalid={Boolean(error)} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />{error ? <span className="mt-1 block text-xs font-normal text-red-700">{error}</span> : null}</label>; }
function SecretField(props: Parameters<typeof Field>[0]) { return <label className="text-sm font-semibold">{props.label}<input aria-invalid={Boolean(props.error)} autoComplete="off" className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => props.onChange(event.target.value)} type="password" value={props.value} />{props.error ? <span className="mt-1 block text-xs font-normal text-red-700">{props.error}</span> : null}</label>; }
function SelectField({ error, label, onChange, options, value }: { error?: string; label: string; onChange: (value: string) => void; options: readonly Readonly<{ siteUrl: string; permissionLevel?: string }>[]; value: string }) { return <label className="text-sm font-semibold">{label}<select aria-invalid={Boolean(error)} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => onChange(event.target.value)} value={value}><option value="">사이트 속성을 선택해 주세요.</option>{options.map((option) => <option key={option.siteUrl} value={option.siteUrl}>{option.siteUrl}{option.permissionLevel ? ` · ${option.permissionLevel}` : ""}</option>)}</select>{error ? <span className="mt-1 block text-xs font-normal text-red-700">{error}</span> : null}</label>; }
function split(value?: string) { return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? []; }
function providerLabel(value: DataSourceProvider) { return providers.find((item) => item.provider === value)?.label ?? value; }
export function dataSourceDeletionConfirmation(connection: PublicDataSourceConnection): string {
  return `이 데이터 소스 연결을 삭제하시겠습니까?\n\nProvider: ${providerLabel(connection.provider)}\n표시 이름: ${connection.displayName}\n선택된 resource: ${connectionResourceLabel(connection)}\n현재 상태: ${statusLabel(connection.status)}\nProject 참조: ${connection.projectReferenceCount ?? 0}개\n\n연결 카드와 Project 사용 설정은 제거됩니다.\n기존 Snapshot과 이미 콘텐츠에 사용된 Evidence는 보존됩니다.\n삭제 후 다시 사용하려면 새 연결을 만들어야 합니다.`;
}
function connectionResourceLabel(connection: PublicDataSourceConnection): string { return connection.resourceConfiguration.siteProperty ?? connection.resourceConfiguration.propertyId ?? connection.resourceConfiguration.accountReference ?? connection.resourceConfiguration.keywords?.join(", ") ?? "선택된 resource 없음"; }
function statusLabel(value: string, reconnectRequired = false) { if (reconnectRequired) return "재연결 필요"; return ({ disconnected: "연결 해제됨", configurationRequired: "구성 필요", connected: "동기화 준비", syncing: "동기화 중", ready: "사용 가능", stale: "오래된 데이터", error: "최근 동기화 오류" } as Record<string, string>)[value] ?? value; }
function freshnessLabel(value: string) { return ({ fresh: "최신", aging: "갱신 권장", stale: "오래됨", unavailable: "확인 불가" } as Record<string, string>)[value] ?? value; }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString("ko-KR") : "기록 없음"; }
function message(error: unknown) { return error instanceof Error ? error.message : "Data Source 요청을 처리하지 못했습니다."; }

class DataSourceClientError extends Error { constructor(message: string, readonly field?: string) { super(message); this.name = "DataSourceClientError"; } }
function isDataSourceField(value?: string): value is DataSourceField { return Boolean(value && ["displayName", "siteProperty", "propertyId", "accountReference", "keywords", "accessToken", "clientId", "clientSecret"].includes(value)); }
function connectionErrorLabel(code?: DataSourceConnectionErrorCode, value?: string) {
  if (code === "DATA_SOURCE_AUTHENTICATION_ERROR") return "인증에 실패했습니다. 연결 정보를 다시 설정해 주세요.";
  if (code === "DATA_SOURCE_PERMISSION_ERROR") return "해당 데이터에 접근할 권한이 없습니다. 계정 권한을 확인해 주세요.";
  if (code === "DATA_SOURCE_QUOTA_ERROR") return "API 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "DATA_SOURCE_RESOURCE_NOT_FOUND") return "선택한 데이터 리소스를 찾을 수 없습니다. 연결 설정을 확인해 주세요.";
  return value ?? "Provider 동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

function oauthOutcomeMessage(outcome: string, code: string | null) {
  if (outcome === "success" || outcome === "connected") return "Google Search Console 연결을 완료했습니다.";
  if (outcome === "resourceRequired") return "Google 계정을 연결했습니다. 사용할 Search Console 사이트 속성을 선택해 주세요.";
  if (outcome === "noProperties") return "접근 가능한 Search Console 사이트 속성이 없습니다. Search Console 계정 권한을 확인해 주세요.";
  return ({ GOOGLE_OAUTH_ACCESS_DENIED: "Google 계정 연결이 취소되었거나 승인되지 않았습니다.", GOOGLE_OAUTH_SCOPE_MISSING: "Search Console 읽기 권한이 승인되지 않았습니다. 다시 연결해 주세요.", GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED: "Google 인증을 완료하지 못했습니다. 다시 연결해 주세요.", DATA_SOURCE_WORKSPACE_FORBIDDEN: "이 Workspace에서 Google 연결을 완료할 수 없습니다." } as Record<string, string>)[code ?? ""] ?? "Google 계정 연결을 완료하지 못했습니다. 다시 시도해 주세요.";
}

type OAuthReturn = Readonly<{ outcome: string; connectionId: string; message: string }>;
const emptyOAuthReturn: OAuthReturn = Object.freeze({ outcome: "", connectionId: "", message: "" });

export function parseOAuthReturn(search: string): OAuthReturn {
  const query = new URLSearchParams(search), outcome = query.get("dataSourceOAuth") ?? "", connectionId = query.get("connectionId") ?? "";
  return Object.freeze({ outcome, connectionId, message: outcome ? oauthOutcomeMessage(outcome, query.get("oauthCode")) : "" });
}

function readOAuthReturn(): OAuthReturn { return typeof window === "undefined" ? emptyOAuthReturn : parseOAuthReturn(window.location.search); }
function removeOAuthReturnQuery() {
  const query = new URLSearchParams(window.location.search);
  query.delete("dataSourceOAuth"); query.delete("connectionId"); query.delete("oauthCode");
  window.history.replaceState(null, "", `${window.location.pathname}${query.size ? `?${query}` : ""}${window.location.hash}`);
}

export function selectPreferredDataSourceConnection(connections: readonly PublicDataSourceConnection[], provider: DataSourceProvider, preferredConnectionId?: string): PublicDataSourceConnection | undefined {
  if (preferredConnectionId) return connections.find((connection) => connection.id === preferredConnectionId && connection.provider === provider);
  return [...connections].filter((connection) => connection.provider === provider).sort((left, right) => {
    const priority = (connection: PublicDataSourceConnection) => {
      if (["ready", "connected", "syncing", "stale"].includes(connection.status)) return 4;
      if (connection.status === "configurationRequired" && connection.hasCredentials) return 3;
      if (connection.status === "error" && connection.hasCredentials) return 2;
      return 1;
    };
    return priority(right) - priority(left) || String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
  })[0];
}

function resourceFormValue(configuration: DataSourceResourceConfiguration): Record<string, string> {
  return Object.fromEntries(Object.entries(configuration).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value ?? "")]));
}

export function validateDataSourceFields(input: Readonly<{ provider: DataSourceProvider; displayName: string; resource: Record<string, string>; accessToken: string; clientId: string; clientSecret: string; hasCredentials: boolean }>): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.displayName.trim()) errors.displayName = "표시 이름을 입력해 주세요.";
  if (input.provider === "googleSearchConsole" && !input.resource.siteProperty?.trim()) errors.siteProperty = "Search Console 사이트 속성을 입력해 주세요.";
  if (input.provider === "googleAnalytics4" && !input.resource.propertyId?.trim()) errors.propertyId = "GA4 property ID를 입력해 주세요.";
  if (input.provider === "googleAdSense" && !input.resource.accountReference?.trim()) errors.accountReference = "AdSense 계정 리소스를 입력해 주세요.";
  if (input.provider === "naverSearchTrend" && !split(input.resource.keywords).length) errors.keywords = "NAVER 검색어를 하나 이상 입력해 주세요.";
  if (input.provider === "naverSearchTrend") {
    if ((!input.hasCredentials || input.clientId || input.clientSecret) && !input.clientId.trim()) errors.clientId = "NAVER Client ID를 입력해 주세요.";
    if ((!input.hasCredentials || input.clientId || input.clientSecret) && !input.clientSecret.trim()) errors.clientSecret = "NAVER Client Secret을 입력해 주세요.";
  } else if (input.provider !== "googleSearchConsole" && !input.hasCredentials && !input.accessToken.trim()) errors.accessToken = "OAuth access token을 입력해 주세요.";
  return errors;
}
