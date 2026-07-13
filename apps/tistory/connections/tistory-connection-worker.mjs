import { access, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const failure = (failureCode, safeMessage, remediation) => ({ failureCode, safeMessage, remediation });

export function classifyTistoryConnectionFailure(error, currentPhase) {
  const taggedCode = error && typeof error === "object" ? error.connectionFailureCode : undefined;
  const detail = String(error?.message ?? error ?? "");
  if (taggedCode === "browser_backend_unavailable") return failure("browser_backend_unavailable", "Browser automation is unavailable on this server.", "Install the configured browser backend, then restart Bright Studio.");
  if (taggedCode === "chromium_not_installed") return failure("chromium_not_installed", "Chromium is not installed for browser automation.", "Install the Playwright Chromium browser, then try again.");
  if (taggedCode === "browser_launch_failed" || currentPhase === "launch") return failure("browser_launch_failed", "The login browser could not be opened.", "Close other browser automation processes and verify desktop browser access, then try again.");
  if (/ERR_NETWORK_ACCESS_DENIED/i.test(detail)) return failure("network_access_denied", "Tistory network access is blocked on this machine.", "Allow this server to access tistory.com in the firewall, proxy, or network policy, then try again.");
  if (currentPhase === "login" && /Timeout/i.test(detail)) return failure("login_timeout", "Tistory login was not completed in time.", "Complete the login within five minutes, then try connecting again.");
  if (currentPhase === "session" || taggedCode === "session_not_created") return failure("session_not_created", "The Tistory login session could not be saved.", "Check local data write permission and available disk space, then reconnect.");
  if (currentPhase === "navigate" || currentPhase === "login") return failure("verification_failed", "The selected Tistory blog could not be verified.", "Confirm the blog address and account access, then reconnect.");
  return failure("unknown_error", "The Tistory connection failed unexpectedly.", "Try again. If the problem continues, check the server log.");
}

async function main() {
  const [blogId, storagePath] = process.argv.slice(2);
  const send = (state, message, diagnostic) => process.stdout.write(`${JSON.stringify({ state, message, ...(diagnostic ?? {}) })}\n`);
  let browser;
  let phase = "backend";
  try {
    let chromium;
    try { ({ chromium } = await import("playwright")); }
    catch (error) { throw tagged(error, "browser_backend_unavailable"); }
    phase = "chromium";
    try { await access(chromium.executablePath()); }
    catch (error) { throw tagged(error, "chromium_not_installed"); }
    send("starting", "Opening the Tistory login window.");
    phase = "launch";
    try { browser = await chromium.launch({ headless: false }); }
    catch (error) { throw tagged(error, "browser_launch_failed"); }
    const context = await browser.newContext();
    const page = await context.newPage();
    phase = "navigate";
    await page.goto(`https://${blogId}.tistory.com/manage/newpost`, { waitUntil: "domcontentloaded", timeout: 30000 });
    send("waiting_for_user", "Waiting for you to complete Tistory login.");
    phase = "login";
    await page.waitForURL((url) => url.hostname === `${blogId}.tistory.com` && url.pathname.startsWith("/manage"), { timeout: 300000 });
    send("verifying", "Verifying access to the selected blog.");
    phase = "session";
    await mkdir(dirname(storagePath), { recursive: true });
    await context.storageState({ path: storagePath });
    if ((await stat(storagePath)).size === 0) throw tagged(new Error("Storage state file is empty."), "session_not_created");
    send("completed", "Tistory connected.");
    await context.close();
    process.exitCode = 0;
  } catch (error) {
    console.error("[tistory-connection-worker] failure", { phase, error });
    const diagnostic = classifyTistoryConnectionFailure(error, phase);
    send("failed", diagnostic.safeMessage, diagnostic);
    process.exitCode = 1;
  } finally { await browser?.close(); }
}

function tagged(error, failureCode) { if (error && typeof error === "object") error.connectionFailureCode = failureCode; return error; }

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
