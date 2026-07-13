export const tistoryEditorSelectors = Object.freeze({
  htmlArea: '[contenteditable="true"]',
  htmlModeButton: 'button:has-text("HTML")',
  saveButton: 'button:has-text("완료")',
  saveDraftButton: 'button:has-text("임시저장")',
  saveNotification: '[role="alert"]:has-text("저장"), .toast:has-text("저장"), text=/임시저장.*(완료|되었습니다)/',
  titleInput: 'textarea[placeholder*="제목"], input[placeholder*="제목"]',
});
