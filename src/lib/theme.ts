/** Dashboard theme: 'system' follows the browser/OS setting. Stored per browser. */
export type ThemeChoice = 'system' | 'dark' | 'light';
const KEY = 'cm_theme';
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme(): ThemeChoice {
  try { const t = localStorage.getItem(KEY); if (t === 'dark' || t === 'light') return t; } catch { /* ignore */ }
  return 'system';
}
function apply() {
  const t = getTheme();
  const dark = t === 'dark' || (t === 'system' && !!mq?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
export function setTheme(t: ThemeChoice) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* ignore */ }
  apply();
  window.dispatchEvent(new Event('cm:theme'));
}
export function initTheme() {
  apply();
  mq?.addEventListener?.('change', apply);
}
