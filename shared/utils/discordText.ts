/**
 * A line with only "*" (or "**") above and below a block makes the whole block bold,
 * so text pasted from another bot keeps its look. Headings / quotes / lists keep their prefix.
 */
export function boldBlocks(text: string): string {
  const lines = String(text || '').split('\n');
  const marker = (l: string) => /^\s*\*{1,2}\s*$/.test(l);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (marker(lines[i])) {
      const close = lines.findIndex((l, j) => j > i && marker(l));
      if (close > i) {
        for (const l of lines.slice(i + 1, close)) {
          if (!l.trim() || /^[-—_=.'"`~]{3,}$/.test(l.trim())) { out.push(l); continue; }
          const m = /^(\s*(?:#{1,3} |-# |> |[-*] |\d+\. )?)(.*)$/.exec(l)!;
          const body = m[2].replace(/\*\*/g, '').trim();
          out.push(body ? `${m[1]}**${body}**` : l);
        }
        i = close;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}
