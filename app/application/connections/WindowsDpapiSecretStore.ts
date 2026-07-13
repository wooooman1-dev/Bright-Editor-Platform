import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import type { SecretStore } from "../../../core/connections";

export class WindowsDpapiSecretStore implements SecretStore {
  constructor(private readonly directory: string) {}
  async storeSecret(scope: string, secretData: string): Promise<string> {
    const reference = `${safe(scope)}-${randomUUID()}`;
    await this.write(reference, secretData); return reference;
  }
  async readSecret(reference: string): Promise<string> {
    try { return await dpapi("decrypt", await readFile(this.path(reference), "utf8")); }
    catch { throw new Error("Stored credentials could not be decrypted. Reconnect is required."); }
  }
  async replaceSecret(reference: string, secretData: string): Promise<void> { await this.write(reference, secretData); }
  async deleteSecret(reference: string): Promise<void> { try { await unlink(this.path(reference)); } catch (error) { if (!missing(error)) throw new Error("Stored credentials could not be removed."); } }
  async secretExists(reference: string): Promise<boolean> { try { await readFile(this.path(reference)); return true; } catch (error) { if (missing(error)) return false; throw error; } }
  private async write(reference: string, secret: string) {
    const path = this.path(reference); await mkdir(dirname(path), { recursive: true });
    const encrypted = await dpapi("encrypt", secret); const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, encrypted, { encoding: "utf8", mode: 0o600 }); await rename(temporary, path);
  }
  private path(reference: string) { if (!/^[a-zA-Z0-9_-]+$/.test(reference)) throw new Error("Invalid secret reference."); return join(this.directory, `${reference}.bin`); }
}

async function dpapi(operation: "encrypt" | "decrypt", input: string): Promise<string> {
  const transform = operation === "encrypt"
    ? "$b=[Text.Encoding]::UTF8.GetBytes($payload);[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"
    : "$b=[Convert]::FromBase64String($payload);[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
  const script = `Add-Type -AssemblyName System.Security;$payload=[Console]::In.ReadToEnd();${transform}`;
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "", error = ""; child.stdout.on("data", (data) => output += data); child.stderr.on("data", (data) => error += data);
    child.on("exit", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error || "Windows secret protection failed.")));
    child.stdin.end(input);
  });
}
function safe(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, "-"); }
function missing(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
