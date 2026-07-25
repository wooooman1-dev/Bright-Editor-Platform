export const tistoryCategoryControlSelector = [
  "#category-btn",
  'button[aria-controls*="category" i]',
  '[role="button"][aria-controls*="category" i]',
  'button[aria-haspopup="listbox"]',
  '[role="button"][aria-haspopup="listbox"]',
  '[role="combobox"]',
  'button[id*="category" i]',
  '[role="button"][id*="category" i]',
  'button[class*="category" i]',
  '[role="button"][class*="category" i]',
  '[id*="category" i] button',
  '[class*="category" i] button',
].join(", ");
