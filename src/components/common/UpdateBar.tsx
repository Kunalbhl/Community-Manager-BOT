import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Notices when a new version of the dashboard has been deployed and offers a one-click reload.
 * Each build gives the main script a new file name, so we compare the one this tab loaded with the
 * one the server serves now (checked every 2 minutes and when the tab comes back into view).
 */
export function UpdateBar() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const mine = Array.from(document.querySelectorAll('script[type="module"][src]')).map((s) => (s as HTMLScriptElement).getAttribute('src') || '').find((s) => s.includes('/assets/'));
    if (!mine) return; // dev server
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const html = await fetch(`/?v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : ''));
        const live = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\/assets\/[^"]+)"/)?.[1];
        if (live && live !== mine) setReady(true);
      } catch { /* offline: try later */ }
    };
    const t = window.setInterval(check, 120_000);
    const onVis = () => check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    const first = window.setTimeout(check, 15_000);
    return () => { stop = true; clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, []);
  if (!ready || hidden) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-white/10">
      <span>✨ A new version of the dashboard is ready.</span>
      <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-1.5 font-bold hover:bg-indigo-400"><RefreshCw className="h-4 w-4" />Reload</button>
      <button onClick={() => setHidden(true)} aria-label="Later" className="rounded-lg p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
    </div>
  );
}
