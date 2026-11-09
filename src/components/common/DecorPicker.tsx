import React, { useMemo, useState } from 'react';

/**
 * Copy-paste decorations that Discord shows as text (no images): symbols, frames, dividers,
 * kaomoji and styled letters. Works in messages, embeds, nicknames and channel names.
 */
const SETS: Record<string, string[]> = {
  Symbols: ['✦', '✧', '★', '☆', '✪', '✯', '✰', '❖', '❂', '✿', '❀', '❁', '✾', '❃', '✺', '✹', '✸', '✷', '✶', '✵', '⚝', '⛧', '♔', '♕', '♚', '♛', '⚜', '☾', '☽', '☼', '☀', '⚡', '♡', '♥', '❣', '❦', '❧', '☯', '☮', '✠', '✟', '☠', '⚔', '⚑', '⚐', '✓', '✔', '✗', '✘', '➤', '➜', '➔', '➳', '⇢', '⇨', '⟶', '↬', '↳', '↪', '⤷', '•', '◦', '‣', '⁃', '∘', '◈', '◇', '◆', '◉', '◎', '●', '○', '▣', '▢', '■', '□', '▪', '▫', '▲', '△', '▼', '▽', '◀', '▶', '❯', '❮', '»', '«', '›', '‹', '⌘', '∞', '§', '¶', '†', '‡', '№', '™', '©', '®', '℗'],
  Frames: ['꧁ ꧂', '༺ ༻', '『 』', '「 」', '【 】', '〔 〕', '〖 〗', '《 》', '〈 〉', '⟦ ⟧', '⟨ ⟩', '❰ ❱', '❮ ❯', '⦅ ⦆', '⦗ ⦘', '꧁༺ ༻꧂', '★彡 彡★', '•°• •°•', '✦ ✦', '⋆⁺₊ ₊⁺⋆', '˗ˏˋ ˎˊ˗', '┊ ┊', '| |', '◤ ◢', '▸ ◂', '⫷ ⫸', '⟪ ⟫'],
  Dividers: ['━━━━━━━━━━━━', '──────────────', '═════════════', '┈┈┈┈┈┈┈┈┈┈┈┈', '•─────⋅☾☽⋅─────•', '✦•┈๑⋅⋯ ⋯⋅๑┈•✦', '❖ ── ✦ ── ❖', '⊱ ────── {.⋅ ✯ ⋅.} ────── ⊰', '・‥…━━━━━━━☆☆☆━━━━━━━…‥・', '◈ ━━━━━━━━ ◈', '▬▬▬▬▬▬▬▬▬▬▬', '⋆｡°✩ ⋆｡°✩ ⋆｡°✩', '˚₊‧꒰ა ☆ ໒꒱ ‧₊˚', '⟡ ⟡ ⟡ ⟡ ⟡', '꒷꒦꒷꒦꒷꒦꒷꒦꒷'],
  Kaomoji: ['(づ｡◕‿‿◕｡)づ', '(づ๑•ᴗ•๑)づ♡', '(｡♥‿♥｡)', '(◕‿◕✿)', '(✿◠‿◠)', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '٩(◕‿◕｡)۶', '(＾▽＾)', '(≧◡≦)', '(•‿•)', '(¬‿¬)', '(⌐■_■)', 'ʕ•ᴥ•ʔ', '(=^･ω･^=)', '(ᵔᴥᵔ)', '(,,>﹏<,,)', '(╥﹏╥)', '(ಥ﹏ಥ)', '(ノಠ益ಠ)ノ彡┻━┻', '┬─┬ノ( º _ ºノ)', '¯\\_(ツ)_/¯', '(•_•)', '( •_•)>⌐■-■', '(ง •̀_•́)ง', 'ᕦ(ò_óˇ)ᕤ', '(☞ﾟヮﾟ)☞', '☜(ﾟヮﾟ☜)', '(っ˘ڡ˘ς)', '(っ◔◡◔)っ ♥', '(*≧ω≦)', '(⁄ ⁄•⁄ω⁄•⁄ ⁄)', 'ヽ(•‿•)ノ', '(～￣▽￣)～', '(´• ω •`)', '(¬_¬")', '(o_O)'],
  Fancy: ['𓆩♡𓆪', '𓁹‿𓁹', '𓍯𓂃𓏧♡', 'ᥫ᭡', '𐙚', '♡⃝', '✿⃝', '◌⃝', '⸙', '⁂', '⁑', '⌗', '⌑', '⍟', '⎊', '⏣', '⟁', '⧉', '⨳', '༄', '࿐', '࿔', '⸺', '‧₊˚', '˚✧', '⊹', '᯽', '✮⋆˙', '⋆˚࿔', 'ꕥ', 'ꕤ', 'ꔛ', '𖤐', '𖥔', '𖦹', '𖧷', '𑁍'],
};

// Styled-letter alphabets (Unicode Mathematical Alphanumeric Symbols and friends).
const BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const mapRange = (upper: number, lower: number, digit?: number) => (ch: string) => {
  const i = BASE.indexOf(ch);
  if (i < 0) return ch;
  if (i < 26) return String.fromCodePoint(upper + i);
  if (i < 52) return String.fromCodePoint(lower + i - 26);
  return digit ? String.fromCodePoint(digit + i - 52) : ch;
};
const fromList = (list: string) => {
  const chars = Array.from(list);
  return (ch: string) => { const i = BASE.indexOf(ch); return i >= 0 && chars[i] ? chars[i] : ch; };
};
const STYLES: { name: string; fn: (c: string) => string }[] = [
  { name: 'Bold', fn: mapRange(0x1d400, 0x1d41a, 0x1d7ce) },
  { name: 'Bold sans', fn: mapRange(0x1d5d4, 0x1d5ee, 0x1d7ec) },
  { name: 'Italic sans', fn: mapRange(0x1d608, 0x1d622) },
  { name: 'Bold italic', fn: mapRange(0x1d468, 0x1d482) },
  { name: 'Script', fn: mapRange(0x1d4d0, 0x1d4ea) },
  { name: 'Gothic', fn: mapRange(0x1d56c, 0x1d586) },
  { name: 'Double', fn: fromList('𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡') },
  { name: 'Mono', fn: mapRange(0x1d670, 0x1d68a, 0x1d7f6) },
  { name: 'Small caps', fn: fromList('ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ0123456789') },
  { name: 'Bubble', fn: fromList('ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ⓪①②③④⑤⑥⑦⑧⑨') },
  { name: 'Squared', fn: fromList('🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉0123456789') },
  { name: 'Wide', fn: fromList('ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９') },
];
const styled = (text: string, fn: (c: string) => string) => Array.from(text).map(fn).join('');

const RECENT_KEY = 'cm_recent_decor';
const getRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };

export function DecorPicker({ onPick }: { onPick: (text: string) => void }) {
  const [tab, setTab] = useState<string>(() => (getRecent().length ? 'Recent' : 'Symbols'));
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const recent = useMemo(getRecent, [tab]);
  const pick = (t: string) => {
    onPick(t);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...getRecent().filter((x) => x !== t)].slice(0, 24))); } catch { /* ignore */ }
  };
  const tabs = [...(recent.length ? ['Recent'] : []), ...Object.keys(SETS), 'Fancy text'];
  const items = tab === 'Recent' ? recent : (SETS[tab] || []);
  const shown = q ? Object.values(SETS).flat().filter((x) => x.includes(q)) : items;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1 pr-6">
        {tabs.map((k) => <button key={k} type="button" onClick={() => { setTab(k); setQ(''); }} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tab === k && !q ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}>{k}</button>)}
        {tab !== 'Fancy text' && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a symbol (paste one)" className="ml-auto w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" />}
      </div>
      {tab === 'Fancy text' ? (
        <div>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type text to style it, e.g. Community Manager" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          <div className="mt-2 grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-2">
            {STYLES.map((s) => {
              const out = styled(text || 'Community Manager', s.fn);
              return (
                <button key={s.name} type="button" onClick={() => pick(out)} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-400">
                  <span className="truncate text-base text-slate-900">{out}</span><span className="shrink-0 text-[11px] text-slate-500">{s.name}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Styled letters are special characters, so screen readers and search may not read them as normal words. Use them for titles, not whole messages.</p>
        </div>
      ) : (
        <div className="flex max-h-52 flex-wrap gap-1 overflow-y-auto">
          {shown.map((s) => (
            <button key={s} type="button" title={s} onClick={() => pick(s)}
              className={`rounded-lg border border-transparent bg-white px-2 py-1 text-slate-800 transition hover:border-indigo-300 hover:shadow-sm ${s.length > 3 ? 'text-sm' : 'min-w-9 text-lg'}`}>{s}</button>
          ))}
          {!shown.length && <span className="text-xs text-slate-500">Nothing found.</span>}
        </div>
      )}
    </div>
  );
}
