import type { Page } from "playwright";

import type { EditorAdapter } from "../../../core/editor";

export abstract class TistoryEditorAdapter implements EditorAdapter {
  protected constructor(protected readonly page: Page) {}

  abstract prepare(): Promise<void>;
  abstract isReady(): Promise<boolean>;
  abstract setTitle(title: string): Promise<void>;
  abstract setContent(content: string): Promise<void>;
  abstract insertImage(
    image: Parameters<EditorAdapter["insertImage"]>[0],
  ): Promise<void>;
  abstract insertVideo(
    video: Parameters<EditorAdapter["insertVideo"]>[0],
  ): Promise<void>;
  abstract insertButton(
    button: Parameters<EditorAdapter["insertButton"]>[0],
  ): Promise<void>;
  abstract saveDraft(): Promise<void>;
  abstract publish(): Promise<void>;
}
