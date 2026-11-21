/**
 * Since 16 Nov 2026 Discord sends channels the bot cannot View with the name "___hidden___" (flag CHANNEL_OBFUSCATED, 1 << 17)
 * and leaves them out of REST lists. Those channels are real; the data we hold for them is not. Never show, rename,
 * snapshot, restore or treat them as deleted. The fix for the owner is to give the bot View Channel there (or Administrator).
 */
export const CHANNEL_OBFUSCATED = 1 << 17;
export const HIDDEN_NAME = '___hidden___';

export function isObfuscated(c: any): boolean {
  if (!c) return false;
  try {
    const f: any = c.flags;
    const bits = typeof f === 'number' ? f : Number(f?.bitfield ?? 0);
    if (bits && (bits & CHANNEL_OBFUSCATED) !== 0) return true;
  } catch { /* fall through to the name check */ }
  return c.name === HIDDEN_NAME;
}

export const usableChannels = (list: any[]) => list.filter((c) => !isObfuscated(c));
