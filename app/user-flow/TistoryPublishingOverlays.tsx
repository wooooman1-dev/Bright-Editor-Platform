"use client";

import { useEffect, useState } from "react";

import type { UserData } from "./user-data";
import { TistoryDraftOutcomeOverlay } from "./TistoryDraftOutcomeOverlay";
import { TistoryScheduleOverlay } from "./TistoryScheduleOverlay";

export function TistoryPublishingOverlays() {
  const [locationKey, setLocationKey] = useState("");
  const [tistoryEnabled, setTistoryEnabled] = useState(false);

  useEffect(() => {
    let previous = "";
    const sync = () => {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== previous) {
        previous = current;
        setLocationKey(current);
      }
    };
    sync();
    const timer = window.setInterval(sync, 250);
    window.addEventListener("popstate", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (!isEditorLocation(locationKey)) {
      setTistoryEnabled(false);
      return;
    }
    let active = true;
    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { data?: UserData };
        if (!response.ok) throw new Error("Bright Studio 상태를 불러오지 못했습니다.");
        if (!active) return;
        setTistoryEnabled(Boolean(result.data?.workspace?.settings?.enabledPlatforms.includes("tistory")));
      })
      .catch(() => { if (active) setTistoryEnabled(false); });
    return () => { active = false; };
  }, [locationKey]);

  if (!tistoryEnabled) return null;
  return <>
    <TistoryDraftOutcomeOverlay />
    <TistoryScheduleOverlay />
  </>;
}

function isEditorLocation(locationKey: string): boolean {
  if (!locationKey) return false;
  const queryIndex = locationKey.indexOf("?");
  const query = new URLSearchParams(queryIndex >= 0 ? locationKey.slice(queryIndex + 1) : "");
  return query.get("view") === "editor";
}
