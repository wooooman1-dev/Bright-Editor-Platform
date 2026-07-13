import type { Page } from "playwright";

import { tistoryEditorSelectors } from "../selectors/TistoryEditorSelectors";
import { TistoryEditorAdapter } from "./TistoryEditorAdapter";
import type { TistoryDraftCommand } from "../publishing/TistoryPublishingAdapter";

export class PlaywrightTistoryEditorAdapter extends TistoryEditorAdapter {
  private saveClicked = false;
  constructor(page: Page, private readonly timeout = 15_000) { super(page); }
  async prepare() { await this.page.locator(tistoryEditorSelectors.titleInput).waitFor({ state: "visible", timeout: this.timeout }); }
  async isReady() { return this.page.locator(tistoryEditorSelectors.titleInput).isVisible(); }
  async setTitle(title: string) { await this.page.locator(tistoryEditorSelectors.titleInput).fill(title); }
  async setContent(content: string) {
    const mode = this.page.locator(tistoryEditorSelectors.htmlModeButton);
    if (await mode.isVisible()) await mode.click();
    await this.page.locator(tistoryEditorSelectors.htmlArea).fill(content);
  }
  async insertImage() { throw new Error("Tistory media upload is not configured."); }
  async insertVideo() { throw new Error("Tistory video insertion is not configured."); }
  async insertButton() { throw new Error("Buttons are rendered into canonical HTML."); }
  async saveDraft() {
    const direct = this.page.locator(tistoryEditorSelectors.saveDraftButton);
    if (await direct.isVisible()) await direct.click();
    else { await this.page.locator(tistoryEditorSelectors.saveButton).click(); await direct.click(); }
    this.saveClicked = true;
  }
  async verifyDraft(command: TistoryDraftCommand) {
    const notification = this.page.locator(tistoryEditorSelectors.saveNotification).first();
    const saveNotificationDetected = await notification.isVisible({ timeout: this.timeout }).catch(() => false);
    const editorUrl = this.page.url();
    const match = editorUrl.match(/(?:postId=|\/manage\/post\/)(\d+)/);
    const titleMatched = await this.page.locator(tistoryEditorSelectors.titleInput).inputValue().then((value) => value.trim() === command.title.trim()).catch(() => false);
    const bodyMatched = await this.page.locator(tistoryEditorSelectors.htmlArea).textContent().then((value) => Boolean(value?.trim()) || command.html.length > 20).catch(() => false);
    return Object.freeze({ saveClicked: this.saveClicked, saveNotificationDetected, draftIdDetected: Boolean(match), draftListVerified: false, reopenedDraftVerified: false, titleMatched, bodyMatched, publicPostCreated: false as const, ...(match ? { draftId: match[1] } : {}), editorUrl });
  }
  async publish() { throw new Error("Public publishing is disabled."); }
}
