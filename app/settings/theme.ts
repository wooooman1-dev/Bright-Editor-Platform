import type { ThemePreference } from "../user-flow/user-data";

export function applyTheme(theme: ThemePreference): void {
  document.documentElement.dataset.theme = theme;
}
