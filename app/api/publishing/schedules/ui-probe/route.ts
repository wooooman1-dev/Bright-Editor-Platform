import { NextResponse } from "next/server";

import {
  TistoryScheduleUiProbeApplicationService,
  type TistoryScheduleUiProbeAuditRecord,
} from "../../../../application/publishing/TistoryScheduleUiProbeApplicationService";
import { connectionStore } from "../../../../application/connections/connection-runtime";
import {
  resolveScheduleProbeContext,
  type ScheduleProbeRequestBody,
} from "../ScheduleProbeContext";

export async function POST(request: Request) {
  try {
    const body = await request.json() as ScheduleProbeRequestBody;
    const context = await resolveScheduleProbeContext(body);
    const audits = {
      save: (record: TistoryScheduleUiProbeAuditRecord) => (
        connectionStore.set("publishing-audits", record.operationId, record)
      ),
    };
    const result = await new TistoryScheduleUiProbeApplicationService(audits)
      .execute(context);
    return NextResponse.json(
      { result },
      { status: result.status === "diagnosed" ? 200 : 400 },
    );
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : "Tistory 예약 UI 읽기 전용 조사를 완료하지 못했습니다.",
    }, { status: 400 });
  }
}
