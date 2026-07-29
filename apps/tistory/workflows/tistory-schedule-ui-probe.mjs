import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [commandPath] = process.argv.slice(2);
let browser;
let page;

try {
  if (!commandPath) throw new Error("Schedule UI probe command path is required.");
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  if (typeof command.blogId !== "string" || !command.blogId.trim()) throw new Error("Tistory blog ID is required.");
  if (typeof command.storageStatePath !== "string" || !command.storageStatePath.trim()) throw new Error("Stored Tistory session path is required.");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: command.storageStatePath });
  await context.addInitScript(() => {
    window.__brightScheduleUiProbeClicks = { total: 0, restricted: 0, labels: [] };
    document.addEventListener("click", (event) => {
      const control = event.target?.closest?.("button, [role=button], input, select, a");
      const label = String(
        control?.getAttribute?.("aria-label")
        ?? control?.getAttribute?.("title")
        ?? control?.textContent
        ?? "",
      ).replace(/\s+/g, " ").trim().slice(0, 120);
      window.__brightScheduleUiProbeClicks.total += 1;
      if (/예약|발행|공개|완료|임시저장|삭제|schedule|publish/i.test(label)) {
        window.__brightScheduleUiProbeClicks.restricted += 1;
      }
      if (label && window.__brightScheduleUiProbeClicks.labels.length < 20) {
        window.__brightScheduleUiProbeClicks.labels.push(label);
      }
    }, true);
  });

  page = await context.newPage();
  await page.goto(`https://${command.blogId.trim()}.tistory.com/manage/newpost`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  if (!page.url().startsWith(`https://${command.blogId.trim()}.tistory.com/manage`)) {
    throw safeFailure("session_expired", "Tistory 로그인 세션이 만료되었습니다.");
  }

  const title = page.locator('textarea[placeholder*="제목"], input[placeholder*="제목"], textarea[aria-label*="제목"], input[aria-label*="제목"]').first();
  if (!await title.isVisible({ timeout: 15000 }).catch(() => false)) {
    throw safeFailure("editor_not_ready", "Tistory 편집기 제목 입력 영역을 확인하지 못했습니다.");
  }

  const before = await collectInventory(page);
  await page.waitForTimeout(500);
  const after = await collectInventory(page);
  const clickCounts = await page.evaluate(() => window.__brightScheduleUiProbeClicks ?? { total: -1, restricted: -1, labels: [] });

  if (clickCounts.total !== 0 || clickCounts.restricted !== 0) {
    throw safeFailure("probe_click_detected", "읽기 전용 UI 조사 중 click 이벤트가 감지되었습니다.");
  }
  if (before.titleValueLength !== after.titleValueLength || before.bodyTextLength !== after.bodyTextLength) {
    throw safeFailure("editor_state_changed", "읽기 전용 UI 조사 중 제목 또는 본문 상태가 변경되었습니다.");
  }

  process.stdout.write(`${JSON.stringify({
    status: "diagnosed",
    workflow: "schedule.verify",
    readOnly: true,
    observedAt: new Date().toISOString(),
    editorUrl: safeUrl(page.url()),
    clickCounts,
    inventory: after,
    stateEvidence: {
      titleValueLengthBefore: before.titleValueLength,
      titleValueLengthAfter: after.titleValueLength,
      bodyTextLengthBefore: before.bodyTextLength,
      bodyTextLengthAfter: after.bodyTextLength,
    },
  })}\n`);
  await context.close();
} catch (error) {
  const code = error?.diagnosticCode ?? "schedule_ui_probe_failed";
  const message = error?.safeMessage ?? "Tistory 예약 UI 읽기 전용 조사를 완료하지 못했습니다.";
  process.stderr.write(`[tistory-schedule-ui-probe] ${code}\n`);
  process.stdout.write(`${JSON.stringify({
    status: "failed",
    workflow: "schedule.verify",
    readOnly: true,
    error: message,
    diagnosticCode: code,
    ...(page ? { editorUrl: safeUrl(page.url()) } : {}),
  })}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

async function collectInventory(targetPage) {
  return targetPage.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const descriptor = (element, index) => {
      const classNames = normalize(element.getAttribute("class")).split(" ").filter(Boolean).slice(0, 8);
      return {
        index,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") || undefined,
        type: element.getAttribute("type") || undefined,
        id: element.id || undefined,
        name: element.getAttribute("name") || undefined,
        text: normalize(element.textContent).slice(0, 160) || undefined,
        ariaLabel: element.getAttribute("aria-label") || undefined,
        ariaHaspopup: element.getAttribute("aria-haspopup") || undefined,
        ariaExpanded: element.getAttribute("aria-expanded") || undefined,
        ariaControls: element.getAttribute("aria-controls") || undefined,
        placeholder: element.getAttribute("placeholder") || undefined,
        title: element.getAttribute("title") || undefined,
        disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
        checked: "checked" in element ? Boolean(element.checked) : undefined,
        classNames,
      };
    };

    const selector = [
      "button",
      "[role=button]",
      "input",
      "select",
      "textarea",
      "[role=combobox]",
      "[role=menuitem]",
      "[role=option]",
      "[aria-haspopup]",
      "[aria-controls]",
    ].join(",");
    const controls = [...document.querySelectorAll(selector)]
      .filter(visible)
      .slice(0, 240)
      .map(descriptor);
    const candidatePattern = /예약|발행|공개|완료|임시저장|날짜|시간|schedule|publish|date|time/i;
    const scheduleCandidates = controls.filter((control) => candidatePattern.test([
      control.text,
      control.ariaLabel,
      control.title,
      control.placeholder,
      control.id,
      control.name,
      ...(control.classNames ?? []),
    ].filter(Boolean).join(" "))).slice(0, 80);
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [class*="modal" i], [class*="layer" i], [class*="popup" i]')]
      .filter(visible)
      .slice(0, 20)
      .map((element, index) => ({
        index,
        role: element.getAttribute("role") || undefined,
        id: element.id || undefined,
        text: normalize(element.textContent).slice(0, 240),
      }));
    const titleField = document.querySelector('textarea[placeholder*="제목"], input[placeholder*="제목"], textarea[aria-label*="제목"], input[aria-label*="제목"]');
    const body = window.tinymce?.activeEditor?.getBody?.();
    return {
      pageTitle: normalize(document.title).slice(0, 160),
      controlCount: controls.length,
      controls,
      scheduleCandidateCount: scheduleCandidates.length,
      scheduleCandidates,
      dialogs,
      titleValueLength: typeof titleField?.value === "string" ? titleField.value.length : 0,
      bodyTextLength: normalize(body?.textContent).length,
    };
  });
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
