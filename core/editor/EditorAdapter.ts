export type EditorMediaInput = Readonly<{
  source: string;
}>;

export type EditorButtonInput = Readonly<{
  label: string;
  targetUrl: string;
}>;

export interface EditorAdapter {
  prepare(): Promise<void>;
  isReady(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  setContent(content: string): Promise<void>;
  insertImage(image: EditorMediaInput): Promise<void>;
  insertVideo(video: EditorMediaInput): Promise<void>;
  insertButton(button: EditorButtonInput): Promise<void>;
  saveDraft(): Promise<void>;
  publish(): Promise<void>;
}
