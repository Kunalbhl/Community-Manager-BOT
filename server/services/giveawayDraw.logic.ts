/** Pure draw logic for web-form giveaways (no database), so the "never the same winner twice" rule is easy to test. */
import { randomInt } from 'crypto';

export interface DrawEntry { id: string; status: string; won: string[] }
export interface DrawPrize { id: string; count: number; allowRepeat: boolean; winners: string[] }

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Draws several prizes in one round. Nobody wins two prizes in the same round, and (unless a prize allows repeats)
 * nobody who already won any prize on this form is picked again. Returns winners per prize id.
 */
export function drawRound(entries: DrawEntry[], prizes: DrawPrize[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const takenNow = new Set<string>();
  const valid = entries.filter((e) => e.status === 'VALID');
  for (const p of prizes) {
    const pool = shuffle(valid.filter((e) => !takenNow.has(e.id) && (p.allowRepeat || e.won.length === 0)));
    const picked = pool.slice(0, Math.max(0, p.count)).map((e) => e.id);
    picked.forEach((id) => takenNow.add(id));
    out[p.id] = picked;
  }
  return out;
}

/** Picks one replacement for a prize: not already a winner of that prize, and not a past winner unless repeats are allowed. */
export function pickReplacement(entries: DrawEntry[], prize: DrawPrize, excludeIds: string[] = []): string | null {
  const pool = shuffle(entries.filter((e) => e.status === 'VALID' && !prize.winners.includes(e.id) && !excludeIds.includes(e.id) && (prize.allowRepeat || e.won.length === 0)));
  return pool[0]?.id ?? null;
}
