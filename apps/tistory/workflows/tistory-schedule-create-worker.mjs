import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [commandPath] = process.argv.slice(2);
let browser;
let page;
let finalClickIssued = false;
let registeredAt;
let clickCounts;

try {
  if (!commandPath) throw safeFailure("command_missing", "Tistory 예약 등록 command가 필요합니다.");
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  validateCommand(command);
  const schedule = scheduleParts(command.scheduledAt, command.timezone);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: command.storageStatePath });
  await context.addInitScript(() => {
    window.__brightScheduleCreateClicks = {
      total: 0,
      complete: 0,
      reservation: 0,
      calendar: 0,
      final: 0,
      other: 0,
    };
    document.addEventListener("click", (event) => {
      const control = event.target?.closest?.("button, [role=button], input, a, li");
      const id = String(control?.id ?? "");
      const label = String(control?.getAttribute?.("aria-label") ?? control?.textContent ?? "").replace(/\s+/g, " ").trim();
      const counts = window.__brightScheduleCreateClicks;
      counts.total += 1;
      if (id === "publish-layer-btn") counts.complete += 1;
      else if (id === "publish-btn") counts.final += 1;
      else if (/예약/.test(label) || control?.matches?.("button.btn_date")) counts.reservation += 1;
      else if (control?.closest?.(".box_calendar")) counts.calendar += 1;
      else counts.other += 1;
    }, true);
  });

  page = await context.newPage();
  await page.goto(`https://${command.blogId}.tistory.com/manage/newpost`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  if (!page.url().startsWith(`https://${command.blogId}.tistory.com/manage`)) {
    throw safeFailure("session_expired", "Tistory 로그인 세션이 만료되었습니다.");
  }

  const title = page.locator("#post-title-inp").first();
  if (!await title.isVisible({ timeout: 15000 }).catch(() => false)) {
    throw safeFailure("editor_not_ready", "Tistory 제목 입력 영역을 확인하지 못했습니다.");
  }

  await applyCategory(page, command.categoryId, command.categoryName);
  await title.fill(command.title);
  if ((await title.inputValue()).trim() !== command.title.trim()) {
    throw safeFailure("title_verification_failed", "Tistory 제목 입력값을 확인하지 못했습니다.");
  }

  await fillHtml(page, command.html);
  await fillTags(page, command.tags);

  const beforeState = await editorState(page);
  if (beforeState.title !== command.title.trim() || beforeState.bodyTextLength < minimumBodyLength(command.html)) {
    throw safeFailure("editor_state_not_ready", "예약 등록 직전 제목과 본문 상태를 확인하지 못했습니다.");
  }

  const opener = page.locator("#publish-layer-btn").first();
  if (!await opener.isVisible({ timeout: 10000 }).catch(() => false) || !await opener.isEnabled().catch(() => false)) {
    throw safeFailure("publication_panel_opener_missing", "Tistory 완료 버튼을 확인하지 못했습니다.");
  }
  await opener.click({ timeout: 10000 });

  const publicRadio = page.locator('input[name="basicSet"][value="20"]').first();
  if (!await publicRadio.isVisible({ timeout: 10000 }).catch(() => false)) {
    throw safeFailure("publication_panel_not_opened", "Tistory 발행 설정 패널을 확인하지 못했습니다.");
  }
  await publicRadio.check();
  if (!await publicRadio.isChecked()) {
    throw safeFailure("public_state_not_selected", "예약 공개 상태를 적용하지 못했습니다.");
  }

  const reservation = await visibleReservationButton(page);
  if (!reservation) throw safeFailure("reservation_control_missing", "Tistory 예약 선택 버튼을 확인하지 못했습니다.");
  await reservation.click();

  const dateButton = page.locator("button.btn_reserve").first();
  if (!await dateButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    throw safeFailure("reservation_date_control_missing", "Tistory 예약 날짜 버튼을 확인하지 못했습니다.");
  }
  await dateButton.click();
  await selectCalendarDate(page, schedule.year, schedule.month, schedule.day);

  const hour = page.locator("#dateHour").first();
  const minute = page.locator("#dateMinute").first();
  if (!await hour.isVisible({ timeout: 5000 }).catch(() => false) || !await minute.isVisible().catch(() => false)) {
    throw safeFailure("reservation_time_control_missing", "Tistory 예약 시간 입력란을 확인하지 못했습니다.");
  }
  await hour.fill(schedule.hour);
  await hour.press("Tab");
  await minute.fill(schedule.minute);
  await minute.press("Tab");

  const reservationEvidence = await verifyReservationState(page, schedule);
  if (!reservationEvidence.passed) {
    throw safeFailure("reservation_state_not_verified", "Tistory 예약 날짜와 시간 적용 상태를 확인하지 못했습니다.");
  }

  const finalButton = page.locator("#publish-btn").first();
  if (!await finalButton.isVisible({ timeout: 5000 }).catch(() => false) || !await finalButton.isEnabled().catch(() => false)) {
    throw safeFailure("schedule_submit_missing", "Tistory 예약 등록 버튼을 확인하지 못했습니다.");
  }
  const finalLabel = (await finalButton.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  if (!/공개\s*발행/.test(finalLabel)) {
    throw safeFailure("schedule_submit_unverified", "최종 공개 발행 버튼을 정확히 식별하지 못했습니다.");
  }

  registeredAt = new Date().toISOString();
  finalClickIssued = true;
  await finalButton.click({ timeout: 10000 });
  await page.waitForTimeout(4000);
  clickCounts = await readClickCounts(page);

  const afterState = await editorState(page).catch(() => undefined);
  const verification = await verifyExternalSchedule(page, command, schedule);
  const externalPostId = verification.externalPostId;
  const externalManagementUrl = verification.managementUrl;

  if (verification.verified) {
    process.stdout.write(`${JSON.stringify({
      status: "scheduled_verified",
      workflow: "schedule.create",
      finalClickIssued: true,
      registeredAt,
      verifiedAt: new Date().toISOString(),
      ...(externalPostId ? { externalPostId } : {}),
      ...(externalManagementUrl ? { externalManagementUrl } : {}),
      editorUrl: safeUrl(page.url()),
      clickCounts,
      verification: {
        ...verification,
        reservationEvidence,
        titleLengthBefore: beforeState.title.length,
        bodyTextLengthBefore: beforeState.bodyTextLength,
        titleLengthAfter: afterState?.title.length,
        bodyTextLengthAfter: afterState?.bodyTextLength,
      },
    })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({
      status: "scheduled_unverified",
      workflow: "schedule.create",
      finalClickIssued: true,
      registeredAt,
      ...(externalPostId ? { externalPostId } : {}),
      ...(externalManagementUrl ? { externalManagementUrl } : {}),
      editorUrl: safeUrl(page.url()),
      clickCounts,
      verification: { ...verification, reservationEvidence },
      diagnosticCode: "tistory_schedule_external_verification_pending",
      error: "Tistory 예약 등록 버튼은 실행됐지만 외부 예약 목록에서 상태를 확정하지 못했습니다. 자동 재시도하지 않습니다.",
    })}\n`);
  }
  await context.close();
} catch (error) {
  const diagnosticCode = error?.diagnosticCode ?? "tistory_schedule_create_failed";
  const safeMessage = error?.safeMessage ?? "Tistory 예약 등록을 완료하지 못했습니다.";
  if (page) clickCounts = await readClickCounts(page).catch(() => clickCounts);
  process.stderr.write(`[tistory-schedule-create-worker] ${diagnosticCode}\n`);
  process.stdout.write(`${JSON.stringify({
    status: finalClickIssued ? "scheduled_unverified" : "failed",
    workflow: "schedule.create",
    finalClickIssued,
    ...(registeredAt ? { registeredAt } : {}),
    ...(page ? { editorUrl: safeUrl(page.url()) } : {}),
    ...(clickCounts ? { clickCounts } : {}),
    diagnosticCode,
    error: finalClickIssued
      ? "최종 예약 등록 클릭 이후 상태 확인이 중단됐습니다. 자동 재시도하지 않습니다."
      : safeMessage,
  })}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

function validateCommand(command) {
  for (const key of ["blogId", "storageStatePath", "revisionId", "title", "html", "scheduledAt", "timezone"]) {
    if (typeof command?.[key] !== "string" || !command[key].trim()) throw safeFailure("command_invalid", `Tistory 예약 등록 ${key} 값이 필요합니다.`);
  }
  if (command.timezone !== "Asia/Seoul") throw safeFailure("timezone_not_allowed", "Tistory 예약 발행은 Asia/Seoul 시간대만 사용할 수 있습니다.");
  const timestamp = Date.parse(command.scheduledAt);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) throw safeFailure("schedule_time_invalid", "예약 시각은 현재보다 미래여야 합니다.");
  if (!Array.isArray(command.tags)) throw safeFailure("command_invalid", "Tistory 태그 값이 올바르지 않습니다.");
}

function scheduleParts(value, timezone) {
  const date = new Date(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour,
    minute: parts.minute,
    dateIso: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

async function applyCategory(targetPage, categoryId, categoryName) {
  if (categoryId === null) return;
  const control = targetPage.locator("#category-btn").first();
  if (!await control.isVisible({ timeout: 10000 }).catch(() => false)) throw safeFailure("category_control_missing", "Tistory 카테고리 버튼을 확인하지 못했습니다.");
  await control.click();
  const expectedId = String(categoryId);
  const candidates = targetPage.locator('[role="option"], [data-category-id], [data-id], [data-value], li, button, a').filter({ visible: true });
  let selected;
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    const evidence = await candidate.evaluate((element) => ({
      id: element.getAttribute("data-category-id") ?? element.getAttribute("data-id") ?? element.getAttribute("data-value") ?? element.getAttribute("value") ?? "",
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
    })).catch(() => ({ id: "", text: "" }));
    if (evidence.id === expectedId || (categoryName && evidence.text === categoryName.trim())) { selected = candidate; break; }
  }
  if (!selected) throw safeFailure("category_option_missing", "저장된 Tistory 카테고리를 현재 목록에서 찾지 못했습니다.");
  await selected.click();
}

async function fillHtml(targetPage, html) {
  await switchMode(targetPage, "HTML");
  const wrappers = targetPage.locator(".CodeMirror");
  let selectedIndex = -1;
  for (let index = 0; index < await wrappers.count(); index += 1) {
    const candidate = wrappers.nth(index);
    const evidence = await candidate.evaluate((element) => {
      const editor = element.CodeMirror;
      const mode = editor?.getOption?.("mode");
      const modeName = typeof mode === "string" ? mode : mode?.name ?? "";
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { modeName, visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0, readOnly: Boolean(editor?.getOption?.("readOnly")) };
    }).catch(() => ({ modeName: "", visible: false, readOnly: true }));
    if (evidence.visible && !evidence.readOnly && /html|xml/i.test(evidence.modeName)) { selectedIndex = index; break; }
  }
  if (selectedIndex < 0) throw safeFailure("html_editor_missing", "Tistory HTML CodeMirror 편집기를 식별하지 못했습니다.");
  const written = await wrappers.nth(selectedIndex).evaluate((element, value) => {
    const editor = element.CodeMirror;
    if (!editor?.setValue) return false;
    editor.setValue(value); editor.refresh?.(); editor.focus?.();
    let textarea;
    try { textarea = editor.getTextArea?.(); editor.save?.(); } catch { textarea = undefined; }
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    textarea?.dispatchEvent(new Event("change", { bubbles: true }));
    const reactNode = element.parentElement;
    const fiberKey = reactNode && Object.keys(reactNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    let fiber = fiberKey ? reactNode[fiberKey] : undefined;
    for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      const onChange = fiber.memoizedProps?.onChange;
      if (typeof onChange === "function" && onChange.length === 1) { onChange(value); break; }
    }
    return editor.getValue?.() === value && (!textarea || textarea.value === value);
  }, html).catch(() => false);
  if (!written) throw safeFailure("html_controller_sync_failed", "Tistory HTML 본문 상태를 동기화하지 못했습니다.");
  await targetPage.waitForTimeout(500);
  await switchMode(targetPage, "기본모드");
  const state = await editorState(targetPage);
  if (state.bodyTextLength < minimumBodyLength(html)) throw safeFailure("body_verification_failed", "Tistory 기본모드에서 본문 반영을 확인하지 못했습니다.");
}

async function switchMode(targetPage, targetMode) {
  const button = targetPage.locator("#editor-mode-layer-btn").first();
  if (!await button.isVisible({ timeout: 10000 }).catch(() => false)) throw safeFailure("editor_mode_control_missing", "Tistory 편집 모드 버튼을 찾지 못했습니다.");
  const current = (await button.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  if (current.includes(targetMode)) return;
  await button.click();
  let option = targetMode === "HTML"
    ? targetPage.locator("#editor-mode-html-text").first()
    : targetPage.getByText(targetMode, { exact: true }).filter({ visible: true }).last();
  if (!await option.isVisible({ timeout: 5000 }).catch(() => false)) {
    option = targetPage.getByRole("menuitem", { name: targetMode, exact: true }).filter({ visible: true }).last();
  }
  if (!await option.isVisible({ timeout: 3000 }).catch(() => false)) throw safeFailure("editor_mode_option_missing", `${targetMode} 편집 모드를 찾지 못했습니다.`);
  const dialogHandler = async (dialog) => {
    const text = dialog.message().replace(/\s+/g, " ").trim();
    if (dialog.type() === "confirm" && /편집 모드|작성한 내용|변경|HTML/.test(text)) await dialog.accept();
    else await dialog.dismiss();
  };
  targetPage.on("dialog", dialogHandler);
  try { await option.click(); } finally { targetPage.off("dialog", dialogHandler); }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const label = (await button.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (label.includes(targetMode)) return;
    await targetPage.waitForTimeout(250);
  }
  throw safeFailure("editor_mode_switch_failed", `${targetMode} 편집 모드 전환을 확인하지 못했습니다.`);
}

async function fillTags(targetPage, tags) {
  const input = targetPage.locator("#tagText").first();
  if (!await input.isVisible({ timeout: 5000 }).catch(() => false)) return;
  for (const tag of tags.map((value) => String(value).replace(/^#/, "").trim()).filter(Boolean).slice(0, 20)) {
    await input.fill(tag);
    await input.press("Enter");
  }
}

async function visibleReservationButton(targetPage) {
  const byRole = targetPage.getByRole("button", { name: "예약", exact: true }).filter({ visible: true });
  if (await byRole.count()) return byRole.last();
  const fallback = targetPage.locator("button.btn_date").filter({ visible: true }).first();
  return await fallback.count() ? fallback : undefined;
}

async function selectCalendarDate(targetPage, year, month, day) {
  const header = targetPage.locator(".box_calendar strong.txt_calendar").first();
  if (!await header.isVisible({ timeout: 5000 }).catch(() => false)) throw safeFailure("calendar_missing", "Tistory 예약 달력을 확인하지 못했습니다.");
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const text = (await header.innerText()).replace(/\s+/g, " ").trim();
    const match = text.match(/(\d{4})\D+(\d{1,2})/);
    if (!match) throw safeFailure("calendar_header_invalid", "Tistory 예약 달력의 연월을 읽지 못했습니다.");
    const current = Number(match[1]) * 12 + Number(match[2]);
    const target = year * 12 + month;
    if (current === target) break;
    const selector = current < target ? ".box_calendar button.btn_next" : ".box_calendar button.btn_prev";
    const move = targetPage.locator(selector).first();
    if (!await move.isEnabled().catch(() => false)) throw safeFailure("calendar_navigation_blocked", "Tistory 예약 달력을 목표 월로 이동하지 못했습니다.");
    await move.click();
    await targetPage.waitForTimeout(150);
  }
  const dayButton = targetPage.locator(`.box_calendar table.tbl_calendar .btn_day`).filter({ hasText: new RegExp(`^\\s*${day}\\s*$`) }).first();
  if (!await dayButton.isVisible({ timeout: 3000 }).catch(() => false)) throw safeFailure("calendar_day_missing", "Tistory 예약 달력에서 목표 날짜를 찾지 못했습니다.");
  await dayButton.click();
}

async function verifyReservationState(targetPage, schedule) {
  const hour = await targetPage.locator("#dateHour").inputValue().catch(() => "");
  const minute = await targetPage.locator("#dateMinute").inputValue().catch(() => "");
  const dateLabel = (await targetPage.locator("button.btn_reserve").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const panelText = (await targetPage.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const dateMatched = dateLabel.includes(String(schedule.day)) || panelText.includes(schedule.dateIso) || panelText.includes(`${schedule.year}. ${schedule.month}. ${schedule.day}`);
  const timeMatched = hour.padStart(2, "0") === schedule.hour && minute.padStart(2, "0") === schedule.minute;
  const reservationMatched = /예약/.test(panelText);
  return { passed: dateMatched && timeMatched && reservationMatched, dateMatched, timeMatched, reservationMatched, dateLabel, hour, minute };
}

async function editorState(targetPage) {
  return targetPage.evaluate(() => {
    const title = document.querySelector("#post-title-inp")?.value ?? "";
    const body = window.tinymce?.activeEditor?.getBody?.();
    return { title: String(title).trim(), bodyTextLength: String(body?.textContent ?? "").replace(/\s+/g, " ").trim().length };
  });
}

function minimumBodyLength(html) {
  const plain = String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
  return Math.min(300, Math.max(20, Math.floor(plain.length * 0.25)));
}

async function verifyExternalSchedule(targetPage, command, schedule) {
  const inspect = async () => {
    const text = (await targetPage.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const titleMatched = text.includes(command.title.trim());
    const reservationMatched = /예약/.test(text);
    const dateVariants = [schedule.dateIso, `${schedule.year}.${String(schedule.month).padStart(2, "0")}.${String(schedule.day).padStart(2, "0")}`, `${schedule.year}. ${schedule.month}. ${schedule.day}.`, schedule.time];
    const scheduleMatched = dateVariants.some((value) => text.includes(value));
    return { titleMatched, reservationMatched, scheduleMatched, textSample: text.slice(0, 800) };
  };

  let evidence = await inspect();
  let managementUrl = safeUrl(targetPage.url());
  if (!(evidence.titleMatched && evidence.reservationMatched && evidence.scheduleMatched)) {
    await targetPage.goto(`https://${command.blogId}.tistory.com/manage/posts/`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
    await targetPage.waitForTimeout(1500);
    evidence = await inspect();
    managementUrl = safeUrl(targetPage.url());
  }
  const idMatch = targetPage.url().match(/(?:postId=|\/manage\/(?:post|posts)\/)(\d+)/);
  return {
    verified: evidence.titleMatched && evidence.reservationMatched && evidence.scheduleMatched,
    ...evidence,
    managementUrl,
    ...(idMatch ? { externalPostId: idMatch[1] } : {}),
  };
}

async function readClickCounts(targetPage) {
  return targetPage.evaluate(() => window.__brightScheduleCreateClicks ?? { total: -1, complete: -1, reservation: -1, calendar: -1, final: -1, other: -1 });
}

function safeFailure(diagnosticCode, safeMessage) {
  const error = new Error(safeMessage);
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  return error;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "unknown";
  }
}
