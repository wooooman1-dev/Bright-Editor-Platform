import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [commandPath] = process.argv.slice(2);
let browser;
let context;
let page;
let failureEvidence;

try {
  if (!commandPath) {
    throw new Error("Schedule panel probe command path is required.");
  }
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  if (typeof command.blogId !== "string" || !command.blogId.trim()) {
    throw new Error("Tistory blog ID is required.");
  }
  if (
    typeof command.storageStatePath !== "string"
    || !command.storageStatePath.trim()
  ) {
    throw new Error("Stored Tistory session path is required.");
  }

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    storageState: command.storageStatePath,
  });
  await context.addInitScript(() => {
    const normalize = (value) => String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const utf8Base64 = (value) => {
      const bytes = new TextEncoder().encode(String(value ?? ""));
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    };
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const elementSignature = (element) => {
      if (element.id) return `id:${element.id}`;
      const parts = [];
      let current = element;
      while (current && current !== document.body && parts.length < 10) {
        const parent = current.parentElement;
        if (!parent) break;
        const siblings = [...parent.children].filter(
          (candidate) => candidate.tagName === current.tagName,
        );
        const index = siblings.indexOf(current) + 1;
        parts.unshift(
          `${current.tagName.toLowerCase()}:nth-of-type(${index})`,
        );
        current = parent;
      }
      return `path:${parts.join(">")}`;
    };
    const controlSnapshot = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        signature: elementSignature(element),
        visible: isVisible(element),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        hidden: Boolean(element.hidden)
          || element.getAttribute("aria-hidden") === "true",
        className: normalize(element.getAttribute("class")).slice(0, 500),
        ariaExpanded: element.getAttribute("aria-expanded") || undefined,
        ariaHidden: element.getAttribute("aria-hidden") || undefined,
        ariaChecked: element.getAttribute("aria-checked") || undefined,
        checked: "checked" in element ? Boolean(element.checked) : undefined,
        disabled: element.matches(":disabled")
          || element.getAttribute("aria-disabled") === "true",
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    };
    const snapshotKey = (snapshot) => JSON.stringify([
      snapshot?.visible,
      snapshot?.display,
      snapshot?.visibility,
      snapshot?.opacity,
      snapshot?.hidden,
      snapshot?.className,
      snapshot?.ariaExpanded,
      snapshot?.ariaHidden,
      snapshot?.ariaChecked,
      snapshot?.checked,
      snapshot?.disabled,
      snapshot?.rect?.x,
      snapshot?.rect?.y,
      snapshot?.rect?.width,
      snapshot?.rect?.height,
    ]);
    const editorState = () => {
      const titleField = document.querySelector(
        '#post-title-inp, textarea[placeholder*="제목"], input[placeholder*="제목"], textarea[aria-label*="제목"], input[aria-label*="제목"]',
      );
      const body = window.tinymce?.activeEditor?.getBody?.();
      return {
        titleValueLength: typeof titleField?.value === "string"
          ? titleField.value.length
          : 0,
        bodyTextLength: normalize(body?.textContent).length,
      };
    };

    window.__brightSchedulePanelProbeUtils = {
      normalize,
      utf8Base64,
      isVisible,
      elementSignature,
      controlSnapshot,
      snapshotKey,
      editorState,
    };
    window.__brightSchedulePanelProbeClicks = {
      total: 0,
      allowedOpen: 0,
      restricted: 0,
      targets: [],
    };
    document.addEventListener("click", (event) => {
      const control = event.target?.closest?.(
        "button, [role=button], input, select, textarea, a",
      );
      const id = String(control?.id ?? "");
      const label = String(
        control?.getAttribute?.("aria-label")
          ?? control?.getAttribute?.("title")
          ?? control?.textContent
          ?? "",
      ).replace(/\s+/g, " ").trim().slice(0, 120);
      const target = {
        id: id || undefined,
        tag: control?.tagName?.toLowerCase?.() || undefined,
        role: control?.getAttribute?.("role") || undefined,
        type: control?.getAttribute?.("type") || undefined,
        label: label || undefined,
        labelBase64: label ? utf8Base64(label) : undefined,
      };
      window.__brightSchedulePanelProbeClicks.total += 1;
      if (id === "publish-layer-btn") {
        window.__brightSchedulePanelProbeClicks.allowedOpen += 1;
      } else {
        window.__brightSchedulePanelProbeClicks.restricted += 1;
      }
      if (window.__brightSchedulePanelProbeClicks.targets.length < 10) {
        window.__brightSchedulePanelProbeClicks.targets.push(target);
      }
    }, true);
  });

  page = await context.newPage();
  await page.goto(
    `https://${command.blogId.trim()}.tistory.com/manage/newpost`,
    { waitUntil: "domcontentloaded", timeout: 30000 },
  );
  if (
    !page.url().startsWith(
      `https://${command.blogId.trim()}.tistory.com/manage`,
    )
  ) {
    throw safeFailure(
      "session_expired",
      "Tistory 로그인 세션이 만료되었습니다.",
    );
  }

  const title = page.locator(
    '#post-title-inp, textarea[placeholder*="제목"], input[placeholder*="제목"], textarea[aria-label*="제목"], input[aria-label*="제목"]',
  ).first();
  if (!await title.isVisible({ timeout: 15000 }).catch(() => false)) {
    throw safeFailure(
      "editor_not_ready",
      "Tistory 편집기 제목 입력 영역을 확인하지 못했습니다.",
    );
  }

  const opener = page.locator("#publish-layer-btn").first();
  if (!await opener.isVisible({ timeout: 10000 }).catch(() => false)) {
    throw safeFailure(
      "publication_panel_opener_missing",
      "검증된 Tistory 발행 패널 열기 버튼을 확인하지 못했습니다.",
    );
  }
  const openerEvidence = await opener.evaluate((element) => ({
    tag: element.tagName.toLowerCase(),
    id: element.id || undefined,
    type: element.getAttribute("type") || undefined,
    role: element.getAttribute("role") || undefined,
    ariaExpanded: element.getAttribute("aria-expanded") || undefined,
    ariaControls: element.getAttribute("aria-controls") || undefined,
    disabled: element.matches(":disabled")
      || element.getAttribute("aria-disabled") === "true",
    hasFormOwner: Boolean(element.form),
  }));
  if (
    openerEvidence.tag !== "button"
    || openerEvidence.id !== "publish-layer-btn"
    || openerEvidence.disabled
    || openerEvidence.type === "submit"
    || (!openerEvidence.type && openerEvidence.hasFormOwner)
  ) {
    throw safeFailure(
      "publication_panel_opener_unsafe",
      "발행 패널 열기 버튼이 안전한 비제출 버튼인지 확인하지 못했습니다.",
    );
  }

  const before = await collectBaseline(page);
  await opener.click({ timeout: 10000 });
  await page.waitForTimeout(700);
  const clickCounts = await page.evaluate(() => (
    window.__brightSchedulePanelProbeClicks
      ?? {
        total: -1,
        allowedOpen: -1,
        restricted: -1,
        targets: [],
      }
  ));
  const after = await collectPanelInventory(page, before);
  const afterState = await collectEditorState(page);
  const stateEvidence = {
    titleValueLengthBefore: before.titleValueLength,
    titleValueLengthAfter: afterState.titleValueLength,
    bodyTextLengthBefore: before.bodyTextLength,
    bodyTextLengthAfter: afterState.bodyTextLength,
  };
  failureEvidence = Object.freeze({
    clickCounts,
    inventory: {
      ...after,
      opener: openerEvidence,
    },
    stateEvidence,
  });

  if (
    clickCounts.total !== 1
    || clickCounts.allowedOpen !== 1
    || clickCounts.restricted !== 0
    || clickCounts.targets.length !== 1
    || clickCounts.targets[0]?.id !== "publish-layer-btn"
  ) {
    throw safeFailure(
      "unexpected_panel_probe_click",
      "발행 패널 조사에서 허용되지 않은 click 이벤트가 감지되었습니다.",
    );
  }
  if (!after.panelRoot || after.controlCount < 1) {
    throw safeFailure(
      "publication_panel_not_isolated",
      "발행 패널의 새로 표시된 독립 영역을 확인하지 못했습니다.",
    );
  }
  if (
    before.titleValueLength !== afterState.titleValueLength
    || before.bodyTextLength !== afterState.bodyTextLength
  ) {
    throw safeFailure(
      "editor_state_changed",
      "발행 패널 조사 중 제목 또는 본문 상태가 변경되었습니다.",
    );
  }

  process.stdout.write(`${JSON.stringify({
    status: "diagnosed",
    workflow: "schedule.verify",
    probeStage: "publication-panel",
    readOnly: true,
    observedAt: new Date().toISOString(),
    editorUrl: safeUrl(page.url()),
    ...failureEvidence,
  })}\n`);
  await context.close();
} catch (error) {
  const code = error?.diagnosticCode ?? "schedule_panel_probe_failed";
  const message = error?.safeMessage
    ?? "Tistory 발행 패널 읽기 전용 조사를 완료하지 못했습니다.";
  process.stderr.write(`[tistory-schedule-panel-probe] ${code}\n`);
  process.stdout.write(`${JSON.stringify({
    status: "failed",
    workflow: "schedule.verify",
    probeStage: "publication-panel",
    readOnly: true,
    error: message,
    diagnosticCode: code,
    ...(page ? { editorUrl: safeUrl(page.url()) } : {}),
    ...(failureEvidence ?? {}),
  })}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

async function collectBaseline(targetPage) {
  return targetPage.evaluate(() => {
    const utils = window.__brightSchedulePanelProbeUtils;
    const selector = controlSelector();
    const visibleSignatures = [...document.querySelectorAll("body *")]
      .filter(utils.isVisible)
      .slice(0, 10000)
      .map(utils.elementSignature);
    const controlSnapshots = [...document.querySelectorAll(selector)]
      .slice(0, 1200)
      .map(utils.controlSnapshot);
    return {
      visibleSignatures,
      controlSnapshots,
      ...utils.editorState(),
    };

    function controlSelector() {
      return [
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
    }
  });
}

async function collectEditorState(targetPage) {
  return targetPage.evaluate(() => (
    window.__brightSchedulePanelProbeUtils.editorState()
  ));
}

async function collectPanelInventory(targetPage, baseline) {
  return targetPage.evaluate((beforeEvidence) => {
    const utils = window.__brightSchedulePanelProbeUtils;
    const {
      normalize,
      utf8Base64,
      isVisible,
      elementSignature,
      controlSnapshot,
      snapshotKey,
    } = utils;
    const beforeVisible = new Set(beforeEvidence.visibleSignatures);
    const beforeControls = new Map(
      beforeEvidence.controlSnapshots.map((snapshot) => [
        snapshot.signature,
        snapshot,
      ]),
    );
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
    const containerSelector = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[aria-modal="true"]',
      '[class*="layer" i]',
      '[class*="popup" i]',
      '[class*="publish" i]',
      '[id*="publish" i]',
      '[id*="schedule" i]',
    ].join(",");
    const allControls = [...document.querySelectorAll(selector)];
    const visibleControls = allControls.filter(isVisible);
    const newlyVisibleControls = visibleControls.filter(
      (element) => !beforeVisible.has(elementSignature(element)),
    );
    const changedVisibleControls = visibleControls.filter((element) => {
      const current = controlSnapshot(element);
      const previous = beforeControls.get(current.signature);
      return !previous || snapshotKey(previous) !== snapshotKey(current);
    });
    const diagnosticSeedControls = newlyVisibleControls.length
      ? newlyVisibleControls
      : changedVisibleControls.filter(
        (element) => element.id !== "publish-layer-btn",
      );

    const commonAncestor = findCommonAncestor(diagnosticSeedControls);
    const ancestorCandidates = collectAncestorCandidates(
      diagnosticSeedControls,
      commonAncestor,
    );
    let panelRoot;
    if (newlyVisibleControls.length > 0) {
      let current = newlyVisibleControls[0];
      while (current && current !== document.body) {
        const containsAll = newlyVisibleControls.every(
          (element) => current.contains(element),
        );
        if (
          containsAll
          && isVisible(current)
          && !beforeVisible.has(elementSignature(current))
        ) {
          panelRoot = current;
          break;
        }
        current = current.parentElement;
      }
    }
    if (
      panelRoot === document.body
      || panelRoot === document.documentElement
    ) {
      panelRoot = undefined;
    }

    const panelControls = panelRoot
      ? [
        ...(panelRoot.matches(selector) ? [panelRoot] : []),
        ...panelRoot.querySelectorAll(selector),
      ].filter(isVisible).slice(0, 160)
      : [];
    const isolatedContainers = panelRoot
      ? [
        panelRoot,
        ...panelRoot.querySelectorAll(containerSelector),
      ].filter((element, index, values) => (
        isVisible(element) && values.indexOf(element) === index
      )).slice(0, 40)
      : [];
    const visiblePanelLikeContainers = [
      ...document.querySelectorAll(containerSelector),
    ].filter(isVisible).slice(0, 60);
    const openerAfter = document.querySelector("#publish-layer-btn");

    return {
      characterSet: document.characterSet,
      pageTitle: normalize(document.title).slice(0, 160),
      baselineVisibleElementCount: beforeEvidence.visibleSignatures.length,
      baselineControlSnapshotCount: beforeEvidence.controlSnapshots.length,
      visibleControlCount: visibleControls.length,
      newlyVisibleControlCount: newlyVisibleControls.length,
      changedVisibleControlCount: changedVisibleControls.length,
      controlCount: panelControls.length,
      panelRoot: panelRoot ? describeContainer(panelRoot) : undefined,
      commonAncestorCandidate: commonAncestor
        && commonAncestor !== document.body
        && commonAncestor !== document.documentElement
        ? describeContainer(commonAncestor)
        : undefined,
      newlyVisibleControls: newlyVisibleControls.slice(0, 50)
        .map((element, index) => describeControl(element, index)),
      changedVisibleControls: changedVisibleControls.slice(0, 60)
        .map((element, index) => describeControl(element, index)),
      ancestorCandidates,
      controls: panelControls.map(
        (element, index) => describeControl(element, index),
      ),
      containers: isolatedContainers.map((element, index) => ({
        index,
        ...describeContainer(element),
      })),
      panelLikeContainers: visiblePanelLikeContainers.map(
        (element, index) => ({
          index,
          ...describeContainer(element),
        }),
      ),
      openerAfter: openerAfter
        ? describeControl(openerAfter, 0)
        : undefined,
    };

    function findCommonAncestor(elements) {
      if (!elements.length) return undefined;
      let current = elements[0];
      while (current) {
        if (elements.every((element) => current.contains(element))) {
          return current;
        }
        current = current.parentElement;
      }
      return undefined;
    }

    function collectAncestorCandidates(elements, common) {
      if (!elements.length) return [];
      const candidates = [];
      let current = elements[0];
      while (
        current
        && current !== document.body
        && current !== document.documentElement
        && candidates.length < 16
      ) {
        const visibleDescendants = [
          ...(current.matches(selector) ? [current] : []),
          ...current.querySelectorAll(selector),
        ].filter(isVisible);
        candidates.push({
          index: candidates.length,
          containsAllDiagnosticControls: elements.every(
            (element) => current.contains(element),
          ),
          isCommonAncestor: current === common,
          wasVisibleBefore: beforeVisible.has(elementSignature(current)),
          isPanelLike: current.matches(containerSelector),
          visibleControlDescendantCount: visibleDescendants.length,
          newlyVisibleControlDescendantCount: newlyVisibleControls.filter(
            (element) => current.contains(element),
          ).length,
          ...describeContainer(current),
        });
        current = current.parentElement;
      }
      return candidates;
    }

    function describeControl(element, index) {
      const text = normalize(element.textContent).slice(0, 200);
      const ariaLabel = normalize(
        element.getAttribute("aria-label"),
      ).slice(0, 160);
      const title = normalize(
        element.getAttribute("title"),
      ).slice(0, 160);
      const placeholder = normalize(
        element.getAttribute("placeholder"),
      ).slice(0, 160);
      const signature = elementSignature(element);
      const currentSnapshot = controlSnapshot(element);
      const previousSnapshot = beforeControls.get(signature);
      return {
        index,
        signature,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") || undefined,
        type: element.getAttribute("type") || undefined,
        id: element.id || undefined,
        name: element.getAttribute("name") || undefined,
        text: text || undefined,
        textBase64: text ? utf8Base64(text) : undefined,
        ariaLabel: ariaLabel || undefined,
        ariaLabelBase64: ariaLabel ? utf8Base64(ariaLabel) : undefined,
        ariaHaspopup: element.getAttribute("aria-haspopup") || undefined,
        ariaExpanded: element.getAttribute("aria-expanded") || undefined,
        ariaControls: element.getAttribute("aria-controls") || undefined,
        ariaChecked: element.getAttribute("aria-checked") || undefined,
        ariaHidden: element.getAttribute("aria-hidden") || undefined,
        placeholder: placeholder || undefined,
        placeholderBase64: placeholder
          ? utf8Base64(placeholder)
          : undefined,
        title: title || undefined,
        titleBase64: title ? utf8Base64(title) : undefined,
        disabled: currentSnapshot.disabled,
        checked: currentSnapshot.checked,
        newlyVisible: !beforeVisible.has(signature),
        changedSinceBaseline: !previousSnapshot
          || snapshotKey(previousSnapshot) !== snapshotKey(currentSnapshot),
        wasVisibleBefore: beforeVisible.has(signature),
        rect: currentSnapshot.rect,
        classNames: normalize(element.getAttribute("class"))
          .split(" ")
          .filter(Boolean)
          .slice(0, 10),
      };
    }

    function describeContainer(element) {
      const text = normalize(element.textContent).slice(0, 500);
      const rect = element.getBoundingClientRect();
      const signature = elementSignature(element);
      return {
        signature,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") || undefined,
        id: element.id || undefined,
        ariaModal: element.getAttribute("aria-modal") || undefined,
        ariaLabel: element.getAttribute("aria-label") || undefined,
        ariaExpanded: element.getAttribute("aria-expanded") || undefined,
        ariaControls: element.getAttribute("aria-controls") || undefined,
        wasVisibleBefore: beforeVisible.has(signature),
        text: text || undefined,
        textBase64: text ? utf8Base64(text) : undefined,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        classNames: normalize(element.getAttribute("class"))
          .split(" ")
          .filter(Boolean)
          .slice(0, 12),
      };
    }
  }, baseline);
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
