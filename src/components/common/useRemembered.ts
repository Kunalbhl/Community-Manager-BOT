import { useEffect, useState } from 'react';

/** Like useState, but remembers the last value in this browser (e.g. the channel picked last time). */
export function useRemembered(key: string, initial = ''): [string, (v: string) => void] {
  const k = `cm:last:${key}`;
  const [v, setV] = useState<string>(() => { try { return localStorage.getItem(k) || initial; } catch { return initial; } });
  useEffect(() => { try { if (v) localStorage.setItem(k, v); } catch { /* storage unavailable */ } }, [k, v]);
  return [v, setV];
}
