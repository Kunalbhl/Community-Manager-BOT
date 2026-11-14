/**
 * Any button with a refresh icon (Check now, Sync now, Refresh, Update now ...) spins its icon
 * from the click until the requests it started have finished, so people see it is working.
 */
let pending = 0;
const spinning = new Set<Element>();
let startedAt = 0;

function stopIfIdle() {
  if (pending > 0) return;
  const wait = Math.max(0, 500 - (Date.now() - startedAt));
  setTimeout(() => { if (pending > 0) return; spinning.forEach((el) => el.classList.remove('animate-spin')); spinning.clear(); }, wait);
}

export function initRefreshSpin() {
  if (typeof window === 'undefined' || (window as any).__cmSpin) return;
  (window as any).__cmSpin = true;
  const orig = window.fetch.bind(window);
  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    pending++;
    try { return await orig(...args); } finally { pending--; stopIfIdle(); }
  }) as typeof fetch;
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element)?.closest?.('button');
    const icon = btn?.querySelector('svg.lucide-refresh-cw, svg.lucide-rotate-cw, svg.lucide-refresh-ccw');
    if (!icon || icon.classList.contains('animate-spin')) return;
    icon.classList.add('animate-spin');
    spinning.add(icon);
    startedAt = Date.now();
    setTimeout(stopIfIdle, 50);
    setTimeout(() => { icon.classList.remove('animate-spin'); spinning.delete(icon); }, 30_000); // never spin forever
  }, true);
}
