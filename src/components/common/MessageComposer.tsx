import { boldBlocks } from '../../../shared/utils/discordText.js';
import { CategoryPicker } from './CategoryPicker.js';
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';

const EmojiPicker = lazy(() => import('emoji-picker-react'));
import { Smile, AtSign, Hash, Shield, FileText, Save, X, Sparkles, Type, Eye, ChevronDown } from 'lucide-react';
import { DecorPicker } from './DecorPicker.js';
import { useDiscordResources, currentCommunityId } from './DiscordPickers.js';
import { MemberPick } from '../views/community/ServerToolsView.js';

/**
 * Message box used wherever people write longer Discord messages.
 * Toolbar inserts at the cursor: emoji (incl. the server's own), @member, @role, #channel,
 * a saved template, or saves the text as a new template. Mentions are stored in Discord's
 * format (<@id>, <@&id>, <#id>) so they work when the bot posts, and the preview shows names.
 */

const memberNameCache = new Map<string, string>();
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Discord format (<#id>, <@&id>, <@id>) -> readable (#name, @role, @member). */
export function mentionsToNames(v: string, res: any) {
  const chans = [...(res?.textChannels || []), ...(res?.voiceChannels || [])];
  return String(v || '')
    .replace(/<#(\d+)>/g, (m, id) => { const c = chans.find((x: any) => x.id === id); return c ? `#${c.name}` : m; })
    .replace(/<@&(\d+)>/g, (m, id) => { const r = res?.roles?.find((x: any) => x.id === id); return r ? `@${r.name}` : m; })
    .replace(/<@!?(\d+)>/g, (m, id) => (memberNameCache.has(id) ? `@${memberNameCache.get(id)}` : m));
}

/** Readable -> Discord format, for every channel, role and known member name (longest names first). */
function namesToMentions(v: string, res: any) {
  const tokens: { text: string; raw: string }[] = [
    ...[...(res?.textChannels || []), ...(res?.voiceChannels || [])].map((c: any) => ({ text: `#${c.name}`, raw: `<#${c.id}>` })),
    ...(res?.roles || []).map((r: any) => ({ text: `@${r.name}`, raw: `<@&${r.id}>` })),
    ...Array.from(memberNameCache.entries()).map(([id, n]) => ({ text: `@${n}`, raw: `<@${id}>` })),
  ].sort((a, b) => b.text.length - a.text.length);
  let out = v;
  for (const t of tokens) out = out.replace(new RegExp(`${esc(t.text)}(?![\\p{L}\\p{N}_-])`, 'gu'), t.raw);
  return out;
}

interface Template { id: string; name: string; content: string; category?: string }

export function MessageComposer({
  value, onChange, communityId, rows = 6, placeholder, maxLength = 2000, allowTemplates = true, defaultCategory, textareaRef, vars,
}: {
  value: string; onChange: (v: string) => void; communityId?: string; rows?: number; placeholder?: string;
  maxLength?: number; allowTemplates?: boolean; defaultCategory?: string; textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Optional variable buttons shown under the box, e.g. {{username}}. */
  vars?: { token: string; label: string; wrap?: string }[];
}) {
  const cid = communityId || currentCommunityId();
  const res: any = useDiscordResources(cid);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = (textareaRef as React.RefObject<HTMLTextAreaElement>) || ownRef;
  const [open, setOpen] = useState<null | 'emoji' | 'decor' | 'member' | 'role' | 'channel' | 'template' | 'save'>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tName, setTName] = useState('');
  const [tCat, setTCat] = useState(defaultCategory || 'General');
  const [note, setNote] = useState('');

  // The box shows names (#rules, @Moderator, @Aarav); what's saved and sent uses Discord's mention format.
  const [, rerender] = useState(0);
  useEffect(() => {
    const ids = Array.from(String(value || '').matchAll(/<@!?(\d{15,21})>/g)).map((m) => m[1]).filter((id) => !memberNameCache.has(id));
    if (!ids.length || !cid) return;
    Promise.all(ids.map((id) => fetch(`/api/v1/communities/${encodeURIComponent(cid)}/discord/member-search?q=${id}`, { credentials: 'include', headers: { 'x-community-id': cid } })
      .then((r) => r.json()).then((j) => { if (j?.data?.[0]?.name) memberNameCache.set(id, j.data[0].name); }).catch(() => undefined))).then(() => rerender((n) => n + 1));
  }, [value, cid]);
  const display = mentionsToNames(value, res);
  const commit = (shown: string) => onChange(namesToMentions(shown, res).slice(0, maxLength));

  const insert = (text: string) => {
    const el = ref.current;
    const shownText = mentionsToNames(text, res);
    const start = el?.selectionStart ?? display.length;
    const end = el?.selectionEnd ?? display.length;
    commit(display.slice(0, start) + shownText + display.slice(end));
    requestAnimationFrame(() => { if (el) { el.focus(); const p = start + shownText.length; el.setSelectionRange(p, p); } });
  };

  /** Discord formatting: wrap the selected text (or each selected line) in the marks. */
  const wrap = (before: string, after = before, linePrefix = false) => {
    const el = ref.current;
    const start = el?.selectionStart ?? display.length;
    const end = el?.selectionEnd ?? display.length;
    const sel = display.slice(start, end) || 'text';
    const out = linePrefix ? sel.split('\n').map((l) => `${before}${l}`).join('\n')
      : sel.split('\n').map((l) => (l.trim() ? `${before}${l}${after}` : l)).join('\n');
    commit(display.slice(0, start) + out + display.slice(end));
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(start, start + out.length); } });
  };
  const [preview, setPreview] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);
  const [pendingT, setPendingT] = useState<Template | null>(null);
  const useTemplate = (t: Template) => { if (value.trim()) setPendingT(t); else { onChange(t.content); } setOpen(null); };
  const applyTemplate = (mode: 'replace' | 'append') => { if (!pendingT) return; onChange(mode === 'replace' ? pendingT.content : `${value.replace(/\s+$/, '')}\n\n${pendingT.content}`.slice(0, maxLength)); setPendingT(null); };
  const fmtBtn = (label: string, title: string, fn: () => void, cls = '') => (
    <button type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={fn} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700`}>
      <span className={`inline-block w-6 text-center text-sm ${cls}`}>{label}</span><span>{title.replace(/ \(.*\)$/, '')}</span>
    </button>
  );

  const loadTemplates = () => fetch(`/api/v1/engagement/templates?communityId=${encodeURIComponent(cid)}`, { credentials: 'include', headers: { 'x-community-id': cid } })
    .then((r) => r.json()).then((j) => setTemplates(j.templates || [])).catch(() => undefined);
  useEffect(() => { if (open === 'template' || open === 'save') loadTemplates(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTemplate = async () => {
    if (!tName.trim() || !value.trim()) return;
    const r = await fetch(`/api/v1/engagement/templates?communityId=${encodeURIComponent(cid)}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-community-id': cid },
      body: JSON.stringify({ name: tName.trim(), category: tCat.trim() || 'General', content: value }),
    });
    const j = await r.json().catch(() => ({}));
    setNote(r.ok ? `Saved as “${tName.trim()}”.` : j?.message || j?.error?.message || 'Could not save the template.');
    if (r.ok) { setTName(''); setOpen(null); }
    setTimeout(() => setNote(''), 4000);
  };


  const btn = (key: typeof open, Icon: any, label: string) => (
    <button type="button" title={label} aria-label={label} aria-expanded={open === key}
      onClick={() => setOpen(open === key ? null : key)}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-indigo-50 hover:text-indigo-700 ${open === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}>
      <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
    </button>
  );
  const groups = Array.from(new Set(templates.map((t) => t.category || 'General')));

  return (
    <div>
    <div className="rounded-xl border border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-1.5 py-1">
        {btn('emoji', Smile, 'Emoji')}
        {btn('decor', Sparkles, 'Symbols')}
        {btn('member', AtSign, 'Member')}
        {btn('role', Shield, 'Role')}
        {btn('channel', Hash, 'Channel')}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {/* Text formatting: opens on hover or click, hides when the pointer leaves. */}
        <div className="relative" onMouseEnter={() => setFmtOpen(true)} onMouseLeave={() => setFmtOpen(false)}>
          <button type="button" aria-expanded={fmtOpen} onMouseDown={(e) => e.preventDefault()} onClick={() => setFmtOpen(!fmtOpen)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-indigo-50 hover:text-indigo-700 ${fmtOpen ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}>
            <Type className="h-3.5 w-3.5" /><span className="hidden sm:inline">Text formatting</span><ChevronDown className="h-3 w-3" />
          </button>
          {fmtOpen && (
            <div className="absolute left-0 top-full z-30 pt-1">
              <div className="grid w-56 grid-cols-1 gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {fmtBtn('B', 'Bold (**text**)', () => wrap('**'), 'font-black')}
                {fmtBtn('I', 'Italic (*text*)', () => wrap('*'), 'italic font-serif')}
                {fmtBtn('U', 'Underline (__text__)', () => wrap('__'), 'underline')}
                {fmtBtn('S', 'Strikethrough (~~text~~)', () => wrap('~~'), 'line-through')}
                {fmtBtn('H', 'Big heading (# )', () => wrap('# ', '', true), 'font-black')}
                {fmtBtn('h', 'Small heading (### )', () => wrap('### ', '', true), 'font-bold')}
                {fmtBtn('❝', 'Quote (> )', () => wrap('> ', '', true))}
                {fmtBtn('</>', 'Code (`text`)', () => wrap('`'), 'font-mono')}
                <p className="px-2 pt-1 text-[11px] text-slate-400">Select text first, then pick a style.</p>
              </div>
            </div>
          )}
        </div>
        {allowTemplates && <>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {btn('template', FileText, 'Use template')}
          {btn('save', Save, 'Save as template')}
        </>}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button type="button" onClick={() => setPreview(!preview)} aria-pressed={preview}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-indigo-50 hover:text-indigo-700 ${preview ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}>
          <Eye className="h-3.5 w-3.5" /><span className="hidden sm:inline">{preview ? 'Hide preview' : 'Preview'}</span>
        </button>
        <span className={`ml-auto px-1 text-[11px] tabular-nums ${value.length > maxLength * 0.9 ? 'text-rose-600' : 'text-slate-400'}`}>{value.length}/{maxLength}</span>
      </div>

      {open && (
        <div className="relative border-b border-slate-200 bg-slate-50 p-3">
          <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="absolute right-2 top-2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          {open === 'emoji' && (
            <div className="pr-6">
              <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-slate-200/60" />}>
                <EmojiPicker
                  width="100%"
                  height={360}
                  lazyLoadEmojis
                  emojiStyle={'native' as any}
                  theme={(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as any}
                  searchPlaceHolder="Search emoji"
                  previewConfig={{ showPreview: false }}
                  customEmojis={(res?.emojis || []).map((e: any) => ({ id: e.id, names: [e.name], imgUrl: e.url }))}
                  onEmojiClick={(d: any) => {
                    if (d.isCustom) {
                      const e = (res?.emojis || []).find((x: any) => x.id === d.emoji || x.name === d.names?.[0]);
                      if (e) insert(`<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`);
                    } else insert(d.emoji);
                  }}
                />
              </Suspense>
              {!!res?.emojis?.length && <p className="mt-1 text-[11px] text-slate-500">Your server’s own emojis are under “Custom”. Recently used emojis appear at the top.</p>}
            </div>
          )}
          {open === 'decor' && <DecorPicker onPick={insert} />}
          {open === 'member' && (
            <div className="pr-6">
              <p className="mb-2 text-xs text-slate-500">Search a member to mention them.</p>
              <MemberPick communityId={cid} value={null} placeholder="Search members" onChange={(m) => { if (m) { memberNameCache.set(m.id, m.name); insert(`<@${m.id}> `); setOpen(null); } }} />
            </div>
          )}
          {(open === 'role' || open === 'channel') && (
            <div className="max-w-md pr-6">
              <select autoFocus defaultValue="" aria-label={open === 'role' ? 'Choose a role to mention' : 'Choose a channel to link'}
                onChange={(e) => { const id = e.target.value; if (!id) return; insert(open === 'role' ? `<@&${id}> ` : `<#${id}> `); setOpen(null); }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none">
                <option value="">{res ? (open === 'role' ? 'Choose a role to mention' : 'Choose a channel to link') : 'Loading…'}</option>
                {open === 'role'
                  ? (res?.roles || []).map((o: any) => <option key={o.id} value={o.id}>@{o.name}</option>)
                  : <>
                    <optgroup label="Text channels">{(res?.textChannels || []).map((o: any) => <option key={o.id} value={o.id}>#{o.name}</option>)}</optgroup>
                    {!!res?.voiceChannels?.length && <optgroup label="Voice channels">{res.voiceChannels.map((o: any) => <option key={o.id} value={o.id}>🔊 {o.name}</option>)}</optgroup>}
                  </>}
              </select>
            </div>
          )}
          {open === 'template' && (
            <div className="max-h-56 space-y-3 overflow-y-auto pr-6">
              {!templates.length && <p className="text-xs text-slate-500">No saved templates yet. Write a message and use “Save as template”.</p>}
              {groups.map((g) => (
                <div key={g}>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{g}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {templates.filter((t) => (t.category || 'General') === g).map((t) => (
                      <button key={t.id} type="button" onClick={() => useTemplate(t)}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-left hover:border-indigo-400">
                        <div className="text-xs font-bold text-slate-800">{t.name}</div>
                        <div className="line-clamp-2 text-xs text-slate-500">{t.content}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {open === 'save' && (
            <div className="flex flex-wrap items-end gap-2 pr-6">
              <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">Template name
                <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="e.g. Weekly event reminder" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <label className="min-w-32 text-xs font-semibold text-slate-600">Category
                <div className="mt-1"><CategoryPicker value={tCat} onChange={setTCat} existing={groups} /></div>
              </label>
              <button type="button" disabled={!tName.trim() || !value.trim()} onClick={saveTemplate} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save</button>
            </div>
          )}
        </div>
      )}

      {pendingT && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Use “{pendingT.name}”: the box already has text.</span>
          <button type="button" onClick={() => applyTemplate('replace')} className="rounded-md bg-indigo-600 px-2.5 py-1 font-bold text-white">Clear and replace</button>
          <button type="button" onClick={() => applyTemplate('append')} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-bold text-slate-700">Keep and add below</button>
          <button type="button" onClick={() => setPendingT(null)} className="ml-auto font-semibold text-slate-500 hover:text-slate-800">Cancel</button>
        </div>
      )}
      <textarea ref={ref} rows={rows} value={display} placeholder={placeholder}
        onChange={(e) => commit(e.target.value)} className="block w-full resize-y rounded-b-xl border-0 bg-transparent px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-0" />
      {!!vars?.length && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 px-3 py-2">
          <span className="text-xs font-semibold text-slate-500">Insert:</span>
          {vars.map((v) => <button key={v.token} type="button" onClick={() => insert(v.wrap || `{{${v.token}}}`)} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">{v.label}</button>)}
        </div>
      )}
      {note && <div className="border-t border-slate-200 px-3 py-2 text-xs font-semibold text-emerald-700">{note}</div>}
    </div>
    {preview && (
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center justify-between bg-slate-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>Preview in Discord</span>
          <button type="button" aria-label="Close preview" onClick={() => setPreview(false)} className="text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className="max-h-96 overflow-auto bg-[#313338] px-4 py-3 text-[14px] leading-relaxed text-[#dbdee1]" dangerouslySetInnerHTML={{ __html: display.trim() ? discordPreview(display) : '<span style="color:#949ba4">Nothing to preview yet.</span>' }} />
      </div>
    )}
    </div>
  );
}

/** Rough preview of Discord markdown (bold, italic, underline, strike, headings, quotes, code, mentions). */
export function discordPreview(text: string) {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (t: string) => esc(t)
    .replace(/`([^`]+)`/g, '<code style="background:#2b2d31;padding:0 4px;border-radius:4px">$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/(^|\s)([@#][\w\-·・ ]{1,40}?)(?=\s|$|[.,!])/g, '$1<span style="background:rgba(88,101,242,.3);color:#c9cdfb;border-radius:3px;padding:0 2px">$2</span>');
  return boldBlocks(text).split('\n').map((l) => {
    if (/^### /.test(l)) return `<div style="font-weight:700;font-size:16px">${inline(l.slice(4))}</div>`;
    if (/^## /.test(l)) return `<div style="font-weight:700;font-size:20px">${inline(l.slice(3))}</div>`;
    if (/^# /.test(l)) return `<div style="font-weight:800;font-size:24px">${inline(l.slice(2))}</div>`;
    if (/^-# /.test(l)) return `<div style="font-size:12px;color:#949ba4">${inline(l.slice(3))}</div>`;
    if (/^> /.test(l)) return `<div style="border-left:4px solid #4e5058;padding-left:8px">${inline(l.slice(2)) || '&nbsp;'}</div>`;
    return `<div>${inline(l) || '&nbsp;'}</div>`;
  }).join('');
}

