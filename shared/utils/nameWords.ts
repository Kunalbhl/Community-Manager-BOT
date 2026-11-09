/**
 * Split a Discord name into the words a person would read, for recruiter-code patterns.
 *   "MrTechnicalGamer"      -> Mr, Technical, Gamer
 *   "mr.technical_gamer99"  -> mr, technical, gamer
 *   "𝗠𝗿 𝗧𝗲𝗰𝗵𝗻𝗶𝗰𝗮𝗹 ꧁Gamer꧂"  -> Mr, Technical, Gamer   (styled letters become normal letters)
 *   "XMLParserBot"          -> XML, Parser, Bot
 *   "|_Scream_|"            -> Scream
 * Numbers, emoji and symbols are ignored.
 */
export function nameWords(name: string): string[] {
  const plain = String(name || '')
    .normalize('NFKD')                       // 𝗠 -> M, é -> e + accent
    .replace(/[̀-ͯ]/g, '')         // drop accents
    .replace(/[^A-Za-z]+/g, ' ')             // numbers, emoji, symbols -> space
    .replace(/([a-z])([A-Z])/g, '$1 $2')     // camelCase: rT -> r T
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // XMLParser -> XML Parser
    .trim();
  return plain ? plain.split(/\s+/) : [];
}

export interface CodePattern { mode?: string; prefix?: string; suffix?: string; separator?: string; firstN?: number; lastM?: number; padding?: number; next?: number }

/** The name part of a code: initials, first letters, or first + last letters. */
export function codeNamePart(p: CodePattern, name: string): string {
  const words = nameWords(name).map((w) => w.toUpperCase());
  const letters = words.join('');
  const n = Math.max(1, Math.min(8, Number(p.firstN) || 3));
  const m = Math.max(1, Math.min(8, Number(p.lastM) || 2));
  if (!letters) return 'X';
  // One-word names give their first two letters, so codes aren't a single letter.
  if (p.mode === 'INITIALS') return words.length === 1 ? letters.slice(0, 2) : words.map((w) => w[0]).join('').slice(0, 6);
  if (p.mode === 'FIRST') return letters.slice(0, n);
  if (p.mode === 'FIRST_LAST') return letters.length <= n + m ? letters : letters.slice(0, n) + letters.slice(-m);
  return '';
}

export function buildCode(p: CodePattern, n: number, name = ''): string {
  const num = String(n).padStart(Math.max(1, Math.min(8, Number(p.padding) || 3)), '0');
  const mid = p.mode && p.mode !== 'FIXED' ? `${codeNamePart(p, name)}${p.separator ?? '-'}` : '';
  return `${p.prefix || ''}${mid}${num}${p.suffix || ''}`.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}
