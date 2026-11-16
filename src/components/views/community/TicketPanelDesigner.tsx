import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Send, RefreshCw } from 'lucide-react';
import { MessageComposer, mentionsToNames } from '../../common/MessageComposer.js';
import { MemberName, MemberSelect, RoleSelect, ChannelSelect, useDiscordResources } from '../../common/DiscordPickers.js';
import { TemplateField } from '../../common/TemplateField.js';

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition disabled:opacity-50';

export const DEFAULT_PANEL = {
  style: 'DROPDOWN', placeholder: 'Choose what you need help with', content: '', pingStaff: true,
  embed: { title: '🎫 Need help? Open a ticket', description: 'Pick a type below and a private channel opens for you and our staff.', color: '#7c8cff', url: '', authorName: '', authorIcon: '', thumbnail: '', image: '', footerText: '', footerIcon: '', timestamp: false, listTypes: true },
};
export const TICKET_VARS = [
  { token: 'member', label: '@Member', sample: '@Aarav' },
  { token: 'type', label: 'Ticket type', sample: 'Report a member' },
  { token: 'number', label: 'Ticket number', sample: '#0042' },
  { token: 'subject', label: 'Subject', sample: 'Griefing in heist' },
  { token: 'server', label: 'Server name', sample: 'K. Tech Services' },
];
const BTN_COLORS: Record<string, string> = { PRIMARY: 'bg-[#5865f2] text-white', SECONDARY: 'bg-[#4e5058] text-white', SUCCESS: 'bg-[#248046] text-white', DANGER: 'bg-[#da373c] text-white' };

/** Discord-style markdown preview: bold, italic, underline, code, headings and readable mentions. */
function md(text: string, res: any) {
  const esc = mentionsToNames(text || '', res).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/^### (.*)$/gm, '<div class="text-base font-bold">$1</div>').replace(/^## (.*)$/gm, '<div class="text-lg font-bold">$1</div>').replace(/^# (.*)$/gm, '<div class="text-xl font-extrabold">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code class="rounded bg-black/30 px-1">$1</code>')
    .replace(/(^|\s)([#@][\w\-À-￿ ]{1,40}?)(?=\s|$|[.,!?])/g, '$1<span class="rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]">$2</span>')
    .replace(/\n/g, '<br/>');
}

function Preview({ panel, types, res }: any) {
  const e = panel.embed;
  const list = types.map((t: any) => `${t.emoji} **${t.label}**${t.description ? ` · ${t.description}` : ''}`).join('\n');
  const desc = [e.description, e.listTypes ? list : ''].filter(Boolean).join('\n\n');
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-[#313338] p-4 text-[15px] leading-snug text-[#dbdee1]">
      <div className="flex gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
        <div className="min-w-0 flex-1">
          <div className="text-sm"><b className="text-white">Community Manager</b> <span className="rounded bg-[#5865f2] px-1 text-[10px] font-bold text-white">APP</span> <span className="text-xs text-[#949ba4]">Today</span></div>
          {panel.content && <div className="mt-1 break-words" dangerouslySetInnerHTML={{ __html: md(panel.content, res) }} />}
          {(e.title || desc || e.image || e.authorName) && (
            <div className="mt-1 max-w-[520px] rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderColor: e.color }}>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  {e.authorName && <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">{e.authorIcon && <img src={e.authorIcon} alt="" className="h-6 w-6 rounded-full" />}{e.authorName}</div>}
                  {e.title && <div className={`font-bold ${e.url ? 'text-[#00a8fc]' : 'text-white'}`}>{e.title}</div>}
                  {desc && <div className="mt-1 break-words text-sm" dangerouslySetInnerHTML={{ __html: md(desc, res) }} />}
                </div>
                {e.thumbnail && <img src={e.thumbnail} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />}
              </div>
              {e.image && <img key={e.image} src={e.image} alt="" className="mt-3 max-h-72 w-full rounded object-cover" onError={(ev) => { const el = ev.currentTarget; el.replaceWith(Object.assign(document.createElement('div'), { className: 'mt-3 rounded bg-black/20 p-3 text-xs text-[#b5bac1]', textContent: 'This link has expired in the browser, so the preview can’t show it. When you post or update the panel, the bot refreshes Discord links and stores the image with the message so it keeps working.' })); }} />}
              {(e.footerText || e.timestamp) && <div className="mt-2 flex items-center gap-2 text-xs text-[#b5bac1]">{e.footerIcon && <img src={e.footerIcon} alt="" className="h-5 w-5 rounded-full" />}{e.footerText}{e.footerText && e.timestamp ? ' • ' : ''}{e.timestamp ? 'Today' : ''}</div>}
            </div>
          )}
          {panel.style === 'BUTTONS' ? (
            <div className="mt-2 flex max-w-[520px] flex-wrap gap-2">{types.slice(0, 25).map((t: any, i: number) => <span key={i} className={`rounded px-4 py-1.5 text-sm font-medium ${BTN_COLORS[t.buttonStyle || 'SECONDARY']}`}>{t.emoji} {t.label}</span>)}</div>
          ) : (
            <div className="mt-2 max-w-[520px]">
              <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 text-left text-sm text-[#949ba4]">{panel.placeholder}<ChevronDown className="h-4 w-4" /></button>
              {open && <div className="mt-1 rounded border border-[#1e1f22] bg-[#2b2d31]">{types.map((t: any, i: number) => <div key={i} className="px-3 py-2 text-sm hover:bg-[#35373c]"><div className="text-white">{t.emoji} {t.label}</div>{t.description && <div className="text-xs text-[#949ba4]">{t.description}</div>}</div>)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{hint && <span className="font-normal text-slate-500"> · {hint}</span>}<div className="mt-1">{children}</div></label>;
}

/** Panel designer: dropdown or buttons, a full embed editor, text and pings above it, and a live Discord preview. */
export function TicketPanelDesigner({ communityId, c, setC, api }: { communityId: string; c: any; setC: (v: any) => void; api: any }) {
  const res: any = useDiscordResources(communityId);
  const panel = { ...DEFAULT_PANEL, ...(c.panel || {}), embed: { ...DEFAULT_PANEL.embed, ...(c.panel?.embed || {}) } };
  const setP = (patch: any) => setC({ ...c, panel: { ...panel, ...patch } });
  const setE = (patch: any) => setP({ embed: { ...panel.embed, ...patch } });
  const [channel, setChannel] = useState(panel.channelId || '');
  const [msg, setMsg] = useState('');
  const [more, setMore] = useState(false);
  const post = async (mode: 'UPDATE' | 'NEW') => {
    setMsg('Saving and posting…');
    try {
      await api('/settings/tickets', 'PUT', { ...c, panel });
      const r = await api('/tickets/panel', 'POST', { channelId: channel, mode });
      setC({ ...c, panel: { ...panel, channelId: r.channelId, messageId: r.messageId } });
      setMsg(r.updated ? 'Panel updated in Discord (same message).' : 'Panel posted.');
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-700">How members pick a type</div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {[['DROPDOWN', 'Dropdown menu', 'Tidy; up to 25 types'], ['BUTTONS', 'Buttons', 'One click; colour per type']].map(([k, t, h]) => (
              <button key={k} type="button" onClick={() => setP({ style: k })} className={`rounded-xl border p-3 text-left ${panel.style === k ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:bg-slate-50'}`}><div className="font-bold text-slate-900">{t}</div><div className="text-xs text-slate-500">{h}</div></button>
            ))}
          </div>
        </div>
        {panel.style === 'DROPDOWN' && <Row label="Dropdown text"><input className={input} value={panel.placeholder} maxLength={100} onChange={(e) => setP({ placeholder: e.target.value })} /></Row>}
        <Row label="Message above the panel" hint="optional; mention roles or members here to notify them when it is posted">
          <MessageComposer communityId={communityId} value={panel.content} onChange={(v) => setP({ content: v })} rows={2} allowTemplates={false} placeholder="e.g. @Members our support desk is open" />
        </Row>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 text-sm font-black text-slate-900">Embed</div>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Row label="Title"><input className={input} value={panel.embed.title} maxLength={256} onChange={(e) => setE({ title: e.target.value })} /></Row>
              <Row label="Colour"><input type="color" className="h-[38px] w-16 cursor-pointer rounded-xl border border-slate-300" value={panel.embed.color} onChange={(e) => setE({ color: e.target.value })} /></Row>
            </div>
            <Row label="Description"><MessageComposer communityId={communityId} value={panel.embed.description} onChange={(v) => setE({ description: v })} rows={6} maxLength={4000} /></Row>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={panel.embed.listTypes} onChange={(e) => setE({ listTypes: e.target.checked })} />Add the list of ticket types under the description</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Big image" hint="link"><input className={input} value={panel.embed.image} onChange={(e) => setE({ image: e.target.value.trim() })} placeholder="https://…png" /></Row>
              <Row label="Small image (top right)" hint="link"><input className={input} value={panel.embed.thumbnail} onChange={(e) => setE({ thumbnail: e.target.value.trim() })} placeholder="https://…png" /></Row>
            </div>
            <button type="button" className="flex items-center gap-1 text-sm font-semibold text-indigo-700" onClick={() => setMore(!more)}>{more ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Author, footer, link and time</button>
            {more && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="Author name"><input className={input} value={panel.embed.authorName} maxLength={256} onChange={(e) => setE({ authorName: e.target.value })} /></Row>
                <Row label="Author icon" hint="link"><input className={input} value={panel.embed.authorIcon} onChange={(e) => setE({ authorIcon: e.target.value.trim() })} /></Row>
                <Row label="Footer text"><input className={input} value={panel.embed.footerText} maxLength={2048} onChange={(e) => setE({ footerText: e.target.value })} /></Row>
                <Row label="Footer icon" hint="link"><input className={input} value={panel.embed.footerIcon} onChange={(e) => setE({ footerIcon: e.target.value.trim() })} /></Row>
                <Row label="Title link" hint="opens when the title is clicked"><input className={input} value={panel.embed.url} onChange={(e) => setE({ url: e.target.value.trim() })} placeholder="https://…" /></Row>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={panel.embed.timestamp} onChange={(e) => setE({ timestamp: e.target.checked })} />Show the time it was posted</label>
              </div>
            )}
            <p className="text-xs text-slate-500">Images must be https links. Discord image links (right-click → Copy Link) expire after a day, so the bot saves those images into the panel message when posting; they keep working.</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={panel.pingStaff} onChange={(e) => setP({ pingStaff: e.target.checked })} />Ping the staff roles when a ticket opens (each type can add more people below)</label>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div className="text-sm font-black text-slate-900">Post to Discord</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="min-w-[220px] flex-1"><ChannelSelect communityId={communityId} value={channel} onChange={setChannel} placeholder="Choose a channel" /></div>
            {panel.messageId && panel.channelId === channel
              ? <button className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={!channel} onClick={() => post('UPDATE')}><RefreshCw className="h-4 w-4" />Save & update panel</button>
              : <button className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={!channel} onClick={() => post('UPDATE')}><Send className="h-4 w-4" />{panel.messageId ? 'Save & move panel here' : 'Save & post'}</button>}
          </div>
          {msg && <p className="mt-2 text-sm text-slate-700">{msg}</p>}
          <p className="mt-2 text-xs text-slate-500">There is only ever one panel: saving again edits the same message (nobody is pinged again). Choosing another channel moves it there and removes the old one.</p>
        </div>
      </div>
      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 text-sm font-semibold text-slate-700">Live preview</div>
        <Preview panel={panel} types={c.types} res={res} />
      </div>
    </div>
  );
}

/** Per-type extras: button colour, who gets pinged and the first message in the ticket. */
export function TicketTypeExtras({ communityId, t, set }: { communityId: string; t: any; set: (patch: any) => void }) {
  const res: any = useDiscordResources(communityId);
  const [who, setWho] = useState('');
  const users: string[] = t.pingUserIds || [];
  const roles: string[] = t.pingRoleIds || [];
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 lg:grid-cols-2">
      <Row label="Button colour" hint="when the panel uses buttons">
        <div className="flex gap-1.5">{Object.keys(BTN_COLORS).map((k) => <button key={k} type="button" onClick={() => set({ buttonStyle: k })} className={`h-8 flex-1 rounded-lg text-xs font-bold ${BTN_COLORS[k]} ${(t.buttonStyle || 'SECONDARY') === k ? 'ring-2 ring-indigo-400 ring-offset-2' : 'opacity-70'}`}>{k === 'PRIMARY' ? 'Blurple' : k === 'SECONDARY' ? 'Grey' : k === 'SUCCESS' ? 'Green' : 'Red'}</button>)}</div>
      </Row>
      <div className="text-sm font-semibold text-slate-700">Also ping when opened <span className="font-normal text-slate-500">· they are added to the ticket</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {roles.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">@{res?.roles?.find((r: any) => r.id === id)?.name || 'role'}<button type="button" onClick={() => set({ pingRoleIds: roles.filter((x) => x !== id) })}>×</button></span>)}
          {users.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">@<MemberName id={id} communityId={communityId} /><button type="button" onClick={() => set({ pingUserIds: users.filter((x) => x !== id) })}>×</button></span>)}
        </div>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <RoleSelect communityId={communityId} value="" exclude={roles} onChange={(id) => id && set({ pingRoleIds: [...roles, id] })} placeholder="Add a role" />
          <MemberSelect key={users.length} communityId={communityId} value={who} onChange={(id) => { if (id && !users.includes(id)) set({ pingUserIds: [...users, id] }); setWho(''); }} placeholder="Add a member" />
        </div>
      </div>
      <Row label="First message title" hint="optional"><input className={input} value={t.welcomeTitle || ''} maxLength={256} onChange={(e) => set({ welcomeTitle: e.target.value })} placeholder={`${t.emoji} ${t.label} · {number}`} /></Row>
      <div className="lg:col-span-2"><TemplateField label="First message in the ticket (optional)" value={t.welcomeMessage || ''} onChange={(v) => set({ welcomeMessage: v })} vars={TICKET_VARS} rows={3} /></div>
    </div>
  );
}

