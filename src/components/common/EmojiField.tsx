import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useDiscordResources } from './DiscordPickers.js';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

/** A single-emoji field: click to open a picker (standard and the server's own emojis), or type one. */
export function EmojiField({ value, onChange, communityId, className = '' }: { value: string; onChange: (v: string) => void; communityId?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const res: any = useDiscordResources(communityId);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const custom = /^<a?:(\w+):(\d+)>$/.exec(value || '');
  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(!open)} title="Pick an emoji"
        className="flex h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xl hover:border-indigo-300">
        {custom ? <img alt={custom[1]} className="h-6 w-6" src={`https://cdn.discordapp.com/emojis/${custom[2]}.${value.startsWith('<a:') ? 'gif' : 'png'}`} /> : value || <span className="text-xs text-slate-400">Emoji</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-50 w-[320px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-slate-100" />}>
            <EmojiPicker
              width="100%" height={360} lazyLoadEmojis emojiStyle={'native' as any}
              searchPlaceHolder="Search emoji" previewConfig={{ showPreview: false }}
              customEmojis={(res?.emojis || []).map((e: any) => ({ id: e.id, names: [e.name], imgUrl: e.url }))}
              onEmojiClick={(d: any) => {
                if (d.isCustom) {
                  const e = (res?.emojis || []).find((x: any) => x.id === d.emoji || x.name === d.names?.[0]);
                  if (e) onChange(`<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`);
                } else onChange(d.emoji);
                setOpen(false);
              }}
            />
          </Suspense>
          <div className="mt-2 flex gap-2">
            <input className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Or type / paste one" value={value} maxLength={64} onChange={(e) => onChange(e.target.value)} />
            {value && <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => onChange('')}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}
