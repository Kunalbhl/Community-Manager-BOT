import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';

const EmojiPicker = lazy(() => import('emoji-picker-react'));
import { Smile, AtSign, Hash, Shield, FileText, Save, X, Sparkles } from 'lucide-react';
import { DecorPicker } from './DecorPicker.js';
import { useDiscordResources, currentCommunityId } from './DiscordPickers.js';
import { MemberPick } from '../views/community/ServerToolsView.js';

/**
 * Message box used wherever people write longer Discord messages.
 * Toolbar inserts at the cursor: emoji (incl. the server's own), @member, @role, #channel,
 * a saved template, or saves the text as a new template. Mentions are stored in Discord's
 * format (<@id>, <@&id>, <#id>) so they work when the bot posts, and the preview shows names.
 */

interface Template { id: string; name: string; content: string; category?: string }

export function MessageComposer({
  value, onChange, communityId, rows = 6, placeholder, maxLength = 2000, allowTemplates = true, defaultCategory, textareaRef,
}: {
  value: string; onChange: (v: string) => void; communityId?: string; rows?: number; placeholder?: string;
  maxLength?: number; allowTemplates?: boolean; defaultCategory?: string; textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
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
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  const insert = (text: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + text + value.slice(end)).slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => { if (el) { el.focus(); const p = start + text.length; el.setSelectionRange(p, p); } });
  };

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

  // Preview: show names instead of raw IDs.
  const preview = value
    .replace(/<@&(\d+)>/g, (_, id) => `@${res?.roles?.find((r: any) => r.id === id)?.name || 'role'}`)
    .replace(/<@!?(\d+)>/g, (_, id) => `@${memberNames[id] || 'member'}`)
    .replace(/<#(\d+)>/g, (_, id) => `#${[...(res?.textChannels || []), ...(res?.voiceChannels || [])].find((c: any) => c.id === id)?.name || 'channel'}`)
    .replace(/<a?:(\w+):\d+>/g, ':$1:');
  const hasMention = preview !== value;

  const btn = (key: typeof open, Icon: any, label: string) => (
    <button type="button" title={label} aria-label={label} aria-expanded={open === key}
      onClick={() => setOpen(open === key ? null : key)}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-indigo-50 hover:text-indigo-700 ${open === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}>
      <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
    </button>
  );
  const groups = Array.from(new Set(templates.map((t) => t.category || 'General')));

  return (
    <div className="rounded-xl border border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-1.5 py-1">
        {btn('emoji', Smile, 'Emoji')}
        {btn('decor', Sparkles, 'Symbols')}
        {btn('member', AtSign, 'Member')}
        {btn('role', Shield, 'Role')}
        {btn('channel', Hash, 'Channel')}
        {allowTemplates && <>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {btn('template', FileText, 'Use template')}
          {btn('save', Save, 'Save as template')}
        </>}
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
              <MemberPick communityId={cid} value={null} placeholder="Search members" onChange={(m) => { if (m) { setMemberNames((n) => ({ ...n, [m.id]: m.name })); insert(`<@${m.id}> `); setOpen(null); } }} />
            </div>
          )}
          {(open === 'role' || open === 'channel') && (
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-6">
              {(open === 'role' ? res?.roles : [...(res?.textChannels || []), ...(res?.voiceChannels || [])])?.map((o: any) => (
                <button key={o.id} type="button" onClick={() => { insert(open === 'role' ? `<@&${o.id}> ` : `<#${o.id}> `); setOpen(null); }}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
                  style={open === 'role' && o.color && o.color !== '#000000' ? { color: o.color } : undefined}>
                  {open === 'role' ? '@' : '#'}{o.name}
                </button>
              )) || <span className="text-xs text-slate-500">Loading…</span>}
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
                      <button key={t.id} type="button" onClick={() => { onChange(value ? `${value}\n${t.content}` : t.content); setOpen(null); }}
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
                <input list="cm-template-cats" value={tCat} onChange={(e) => setTCat(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <datalist id="cm-template-cats">{['General', 'Announcement', 'Recruitment', 'Promotion', 'Event', 'Reminder', 'Moderation', ...groups].filter((v, i, a) => a.indexOf(v) === i).map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <button type="button" disabled={!tName.trim() || !value.trim()} onClick={saveTemplate} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save</button>
            </div>
          )}
        </div>
      )}

      <textarea ref={ref} rows={rows} value={value} maxLength={maxLength} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className="block w-full resize-y rounded-b-xl border-0 bg-transparent px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-0" />
      {(hasMention || note) && (
        <div className="border-t border-slate-200 px-3 py-2 text-xs">
          {note && <p className="mb-1 font-semibold text-emerald-700">{note}</p>}
          {hasMention && <><span className="font-semibold text-slate-500">How it looks in Discord: </span><span className="whitespace-pre-wrap text-slate-700">{preview}</span></>}
        </div>
      )}
    </div>
  );
}
