import { useEffect, useRef } from 'react';

/**
 * Live updates from the Discord server. One connection per server is shared by the whole page.
 * Listeners get the kinds that changed: 'channels' | 'roles' | 'members' | 'emojis' | 'guild',
 * or 'focus' when the tab becomes visible again (catch-up after being away).
 */
type Cb = (kinds: string[]) => void;
const listeners = new Map<string, Set<Cb>>();
const sources = new Map<string, EventSource>();

function emit(id: string, kinds: string[]) { listeners.get(id)?.forEach((cb) => { try { cb(kinds); } catch { /* ignore */ } }); }

function open(id: string) {
  if (sources.has(id) || typeof EventSource === 'undefined') return;
  const es = new EventSource(`/api/v1/communities/${encodeURIComponent(id)}/live`, { withCredentials: true });
  es.addEventListener('change', (e: MessageEvent) => { try { emit(id, JSON.parse(e.data).kinds || []); } catch { emit(id, ['all']); } });
  sources.set(id, es); // EventSource reconnects on its own after errors
}

if (typeof window !== 'undefined') {
  let last = Date.now();
  const back = () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 3000) return;
    last = Date.now();
    listeners.forEach((_, id) => emit(id, ['focus']));
  };
  window.addEventListener('focus', back);
  document.addEventListener('visibilitychange', back);
}

export function subscribeLive(id: string, cb: Cb): () => void {
  if (!id) return () => undefined;
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(cb);
  open(id);
  return () => {
    const set = listeners.get(id);
    set?.delete(cb);
    if (set && !set.size) { sources.get(id)?.close(); sources.delete(id); listeners.delete(id); }
  };
}

/** Calls cb when any of `kinds` change in Discord (or on 'focus'). Empty kinds = any change. */
export function useLive(communityId: string | undefined, cb: (kinds: string[]) => void, kinds: string[] = []) {
  const ref = useRef(cb);
  ref.current = cb;
  const key = kinds.join(',');
  useEffect(() => {
    if (!communityId) return;
    return subscribeLive(communityId, (k) => {
      if (!kinds.length || k.includes('focus') || k.includes('all') || k.some((x) => kinds.includes(x))) ref.current(k);
    });
  }, [communityId, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
