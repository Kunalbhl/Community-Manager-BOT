import { EventPick, takeEventFor, attachToEvent, EventTag } from '../../common/EventPick.js';
import { EmojiField } from '../../common/EmojiField.js';
import { useRemembered } from '../../common/useRemembered.js';
import { takeOpenTab } from './SetupGuideView.js';
import React, { useCallback, useEffect, useState } from 'react';
import { TrendingUp, Gift, MousePointerClick, BadgeCheck, ScrollText, Star, Cake, TerminalSquare, Plus, Trash2, Send, RefreshCw, Trophy, BarChart3 } from 'lucide-react';
import { Banner, Card, Toggle, Pick, MultiPick, SaveBar, input, btn, ghost, fmtDate, Resources } from './ServerToolsView.js';
import { MessageComposer } from '../../common/MessageComposer.js';
import { RoleSelect, MemberSelect, MemberName, useDiscordResources } from '../../common/DiscordPickers.js';

export type Tab = 'stats' | 'levels' | 'giveaways' | 'buttonRoles' | 'verification' | 'logs' | 'starboard' | 'birthdays' | 'custom';
const TABS: { id: Tab; label: string; icon: any; hint: string }[] = [
  { id: 'levels', label: 'Levels & XP', icon: TrendingUp, hint: 'Members earn XP by chatting, level up and unlock reward roles. /rank and /leaderboard show progress.' },
  { id: 'giveaways', label: 'Giveaways', icon: Gift, hint: 'Members press Enter; winners are picked fairly when time runs out. Also /giveaway in Discord.' },
  { id: 'buttonRoles', label: 'Button roles', icon: MousePointerClick, hint: 'Let members pick their own roles with buttons: games, regions, pings and more.' },
  { id: 'verification', label: 'Verification', icon: BadgeCheck, hint: 'New members press Verify (optionally solve a quick sum) before they can see the server.' },
  { id: 'logs', label: 'Server logs', icon: ScrollText, hint: 'A private channel that records joins, leaves, deleted and edited messages, role changes and warnings.' },
  { id: 'starboard', label: 'Starboard', icon: Star, hint: 'Messages that get enough star reactions are reposted in a highlight channel.' },
  { id: 'birthdays', label: 'Birthdays', icon: Cake, hint: 'Members save their birthday with /birthday set; the bot celebrates on the day.' },
  { id: 'stats', label: 'Server stats', icon: BarChart3, hint: 'Channels whose names show live numbers: members, a role’s members, online, boosts and more.' },
  { id: 'custom', label: 'Custom commands', icon: TerminalSquare, hint: 'Your own text commands, like !rules or !socials, that reply with your message.' },
];

function useApi(communityId: string) {
  const headers = { 'Content-Type': 'application/json', 'x-community-id': communityId };
  return useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(`/api/v1/communities/${encodeURIComponent(communityId)}${path}`, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j?.error?.message || 'Something went wrong.');
    return j.data;
  }, [communityId]);
}

export function CommunityFeaturesView({ communityId, only }: { communityId: string; only?: Tab }) {
  const api = useApi(communityId);
  const [tab, setTab] = useState<Tab>(() => only || takeOpenTab(['levels', 'giveaways', 'buttonRoles', 'verification', 'logs', 'starboard', 'birthdays', 'custom', 'stats'] as const, 'levels'));
  const [cfg, setCfg] = useState<any>(null);
  const [res, setRes] = useState<Resources | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [c, t] = await Promise.all([api('/features'), api('/toolkit')]);
      setCfg(c); setRes(t.resources);
    } catch (e: any) { setError(e.message); }
  }, [api]);
  useEffect(() => { if (communityId) load(); }, [communityId, load]);

  const save = async (section: string, value: any) => setCfg(await api(`/features/settings/${section}`, 'PUT', value));
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-6">
      {!only && <div>
        <h1 className="text-3xl font-bold text-slate-900">Community features</h1>
        <p className="mt-1 text-slate-500">Levels, giveaways, self-roles, verification, logs, starboard, birthdays and custom commands.</p>
      </div>}
      <div className={`${only ? 'hidden' : 'flex'} gap-2 overflow-x-auto pb-1`}>
        {TABS.map((t) => {
          const on = cfg && (t.id === 'custom' ? cfg.customCommands?.enabled : t.id === 'giveaways' || t.id === 'buttonRoles' || t.id === 'stats' ? null : cfg[t.id]?.enabled);
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
              {on != null && <span className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-300'}`} aria-label={on ? 'on' : 'off'} />}
            </button>
          );
        })}
      </div>
      {!only && <p className="text-sm text-slate-500">{current.hint}</p>}
      {error && <Banner tone="error">{error} <button onClick={load} className="ml-2 underline">Try again</button></Banner>}
      {res && !res.connected && <Banner tone="warn">The bot is not connected to this server right now, so roles and channels can’t be listed.</Banner>}
      {!cfg && !error && <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}
      {cfg && res && (
        <>
          {tab === 'levels' && <LevelsTab api={api} cfg={cfg.levels} res={res} onSave={(v) => save('levels', v)} />}
          {tab === 'giveaways' && <GiveawaysTab api={api} res={res} communityId={communityId} />}
          {tab === 'buttonRoles' && <ButtonRolesTab api={api} res={res} communityId={communityId} />}
          {tab === 'verification' && <VerificationTab api={api} cfg={cfg.verification} res={res} onSave={(v) => save('verification', v)} />}
          {tab === 'logs' && <LogsTab cfg={cfg.logs} res={res} onSave={(v) => save('logs', v)} />}
          {tab === 'starboard' && <StarboardTab cfg={cfg.starboard} res={res} onSave={(v) => save('starboard', v)} />}
          {tab === 'birthdays' && <BirthdaysTab api={api} cfg={cfg.birthdays} res={res} onSave={(v) => save('birthdays', v)} />}
          {tab === 'stats' && <StatsTab api={api} res={res} communityId={communityId} />}
          {tab === 'custom' && <CustomTab cfg={cfg.customCommands} onSave={(v) => save('customCommands', v)} />}
        </>
      )}
    </div>
  );
}

const Label = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="block text-sm font-medium text-slate-700">{t}<div className="mt-1">{children}</div></label>;

/* ---------------- Levels ---------------- */
function LevelsTab({ api, cfg, res, onSave }: any) {
  const [c, setC] = useState(cfg);
  const [board, setBoard] = useState<any[] | null>(null);
  const loadBoard = useCallback(() => api('/features/leaderboard').then(setBoard).catch(() => setBoard([])), [api]);
  useEffect(() => { loadBoard(); }, [loadBoard]);
  return (
    <div className="grid gap-6 2xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card title="Levels & XP" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />}>
          <div className="grid gap-4 md:grid-cols-3">
            <Label t="XP per message (min)"><input type="number" className={input} value={c.minXp} onChange={(e) => setC({ ...c, minXp: Number(e.target.value) })} /></Label>
            <Label t="XP per message (max)"><input type="number" className={input} value={c.maxXp} onChange={(e) => setC({ ...c, maxXp: Number(e.target.value) })} /></Label>
            <Label t="Cooldown (seconds)"><input type="number" className={input} value={c.cooldownSeconds} onChange={(e) => setC({ ...c, cooldownSeconds: Number(e.target.value) })} /></Label>
            <Label t="Level-up message goes to">
              <select className={input} value={c.announce} onChange={(e) => setC({ ...c, announce: e.target.value })}>
                <option value="SAME_CHANNEL">Same channel</option><option value="CHANNEL">A chosen channel</option><option value="DM">Direct message</option><option value="OFF">Don’t announce</option>
              </select>
            </Label>
            {c.announce === 'CHANNEL' && <Label t="Channel"><Pick options={res.textChannels} value={c.channelId} onChange={(v) => setC({ ...c, channelId: v })} placeholder="Choose a channel" /></Label>}
            <div className="md:col-span-3"><Label t="Level-up message ({user}, {username}, {level}, {server})"><input className={input} value={c.message} onChange={(e) => setC({ ...c, message: e.target.value })} /></Label></div>
            <div className="text-sm font-medium text-slate-700 md:col-span-3 lg:col-span-1">No XP in channels<div className="mt-1"><MultiPick options={res.textChannels} value={c.noXpChannelIds} onChange={(v) => setC({ ...c, noXpChannelIds: v })} placeholder="Add a channel" prefix="#" /></div></div>
            <div className="text-sm font-medium text-slate-700 md:col-span-3 lg:col-span-2">No XP for roles<div className="mt-1"><MultiPick options={res.roles} value={c.noXpRoleIds} onChange={(v) => setC({ ...c, noXpRoleIds: v })} placeholder="Add a role" prefix="@" /></div></div>
            <div className="rounded-xl border border-slate-200 p-4 md:col-span-3">
              <div className="font-semibold text-slate-900">Voice XP</div>
              <p className="text-xs text-slate-500">Members also earn XP every minute they spend in voice channels. Messages in a voice channel’s text chat already count like normal messages. Discord doesn’t let bots hear who is talking without recording, so “active” means not deafened{c.voiceIgnoreMuted !== false ? ' or muted' : ''}.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Label t="XP per minute in voice (0 = off)"><input type="number" min={0} max={100} className={input} value={c.voiceXpPerMinute || 0} onChange={(e) => setC({ ...c, voiceXpPerMinute: Number(e.target.value) })} /></Label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={c.voiceRequireOthers !== false} onChange={(e) => setC({ ...c, voiceRequireOthers: e.target.checked })} />Only when at least 2 people are in the channel</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={c.voiceIgnoreMuted !== false} onChange={(e) => setC({ ...c, voiceIgnoreMuted: e.target.checked })} />No XP while muted</label>
              </div>
              <p className="mt-2 text-xs text-slate-500">The server’s AFK channel and channels in “No XP in channels” never give voice XP.</p>
            </div>
          </div>
        </Card>
        <Card title="Reward roles" desc="Given automatically when a member reaches the level."
          right={<button className={ghost} onClick={() => setC({ ...c, rewards: [...c.rewards, { level: 5, roleId: '' }] })}><Plus className="h-4 w-4" /> Add reward</button>}>
          <div className="space-y-2">
            {c.rewards.map((r: any, i: number) => (
              <div key={i} className="grid grid-cols-[auto_100px_1fr_auto] items-center gap-3 text-sm">
                <span className="text-slate-500">Level</span>
                <input type="number" min={1} className={input} value={r.level} onChange={(e) => setC({ ...c, rewards: c.rewards.map((x: any, n: number) => (n === i ? { ...x, level: Number(e.target.value) } : x)) })} />
                <Pick options={res.roles} value={r.roleId} onChange={(v) => setC({ ...c, rewards: c.rewards.map((x: any, n: number) => (n === i ? { ...x, roleId: v } : x)) })} placeholder="Choose a role" />
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setC({ ...c, rewards: c.rewards.filter((_: any, n: number) => n !== i) })} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {!c.rewards.length && <p className="text-sm text-slate-500">No reward roles yet.</p>}
          </div>
          <div className="mt-4"><Toggle on={c.keepOldRewards} onChange={(v) => setC({ ...c, keepOldRewards: v })} label="Keep lower reward roles when a higher one is earned" /></div>
          <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
        </Card>
      </div>
      <Card title="Leaderboard" right={<button className={ghost} onClick={loadBoard}><RefreshCw className="h-4 w-4" /></button>}>
        {!board ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : !board.length ? <p className="text-sm text-slate-500">No XP earned yet.</p> : (
          <ol className="space-y-2">
            {board.slice(0, 25).map((m) => (
              <li key={m.userId} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${m.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{m.rank <= 3 ? <Trophy className="h-4 w-4" /> : m.rank}</span>
                <div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-900">{m.username}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${Math.round((m.into / m.needed) * 100)}%` }} /></div></div>
                <div className="text-right text-xs text-slate-500"><div className="text-sm font-bold text-slate-900">Lv {m.level}</div>{m.xp} XP</div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Giveaways ---------------- */
function GiveawaysTab({ api, res, communityId }: any) {
  const [evt, setEvt] = useState(takeEventFor);
  const [f, setF] = useState({ channelId: '', prize: '', description: '', winners: 1, durationMinutes: 1440, requiredRoleId: '' });
  const [list, setList] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api('/features/giveaways').then(setList).catch(() => setList([])), [api]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const act = async (id: string, what: string) => { setMsg(''); try { await api(`/features/giveaways/${id}/${what}`, 'POST'); load(); } catch (e: any) { setMsg(e.message); } };
  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_1.2fr]">
      <Card title="Start a giveaway">
        <div className="space-y-4">
          <Label t="Prize"><input className={input} value={f.prize} onChange={(e) => setF({ ...f, prize: e.target.value })} placeholder="Discord Nitro" /></Label>
          <Label t="Details (optional)"><textarea rows={2} className={input} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Label>
          <div className="grid gap-4 md:grid-cols-3">
            <Label t="Channel"><Pick options={res.textChannels} value={f.channelId} onChange={(v) => setF({ ...f, channelId: v })} placeholder="Choose" /></Label>
            <Label t="Winners"><input type="number" min={1} max={20} className={input} value={f.winners} onChange={(e) => setF({ ...f, winners: Number(e.target.value) })} /></Label>
            <Label t="Runs for">
              <select className={input} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })}>
                {[[10, '10 minutes'], [60, '1 hour'], [360, '6 hours'], [1440, '1 day'], [4320, '3 days'], [10080, '1 week'], [20160, '2 weeks']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Label>
          </div>
          <Label t="Only members with this role can enter (optional)"><Pick options={res.roles} value={f.requiredRoleId} onChange={(v) => setF({ ...f, requiredRoleId: v })} placeholder="Anyone can enter" /></Label>
          <EventPick communityId={communityId} value={evt} onChange={setEvt} />
          <button className={btn} onClick={async () => { setMsg(''); try { const g = await api('/features/giveaways', 'POST', f); await attachToEvent(communityId, evt, 'giveaway', { id: g?.id }); setMsg('Giveaway started.'); setF({ ...f, prize: '', description: '' }); load(); } catch (e: any) { setMsg(e.message); } }}><Gift className="h-4 w-4" /> Start giveaway</button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </div>
      </Card>
      <Card title="Giveaways">
        {!list ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : !list.length ? <p className="text-sm text-slate-500">No giveaways yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {list.slice(0, 30).map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><div className="font-semibold text-slate-900">🎁 {g.prize}<EventTag item={g} /></div>
                  <div className="text-xs text-slate-500">{g.entrants.length} entries · {g.winners} winner(s) · {g.status === 'RUNNING' ? `ends ${fmtDate(new Date(g.endsAt).toISOString())}` : g.status.toLowerCase()}{g.winnerIds?.length ? ` · won by ${g.winnerIds.length}` : ''}</div></div>
                <div className="flex gap-3 text-xs font-semibold">
                  {g.status === 'RUNNING' && <><button className="text-indigo-600 hover:underline" onClick={() => act(g.id, 'end')}>End now</button><button className="text-rose-600 hover:underline" onClick={() => act(g.id, 'cancel')}>Cancel</button></>}
                  {g.status === 'ENDED' && <button className="text-indigo-600 hover:underline" onClick={() => api(`/features/giveaways/${g.id}/end?reroll=1`, 'POST').then(load).catch((e: any) => setMsg(e.message))}>Reroll</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Button roles ---------------- */
function RoleChipsField({ communityId, label, hint, ids, onChange }: any) {
  const r: any = useDiscordResources(communityId);
  return (
    <div className="text-sm font-semibold text-slate-700">{label}<div className="text-xs font-normal text-slate-500">{hint}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">{ids.map((id: string) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">@{r?.roles?.find((x: any) => x.id === id)?.name || 'role'}<button type="button" onClick={() => onChange(ids.filter((x: string) => x !== id))}>×</button></span>)}</div>
      <div className="mt-1"><RoleSelect communityId={communityId} value="" exclude={ids} onChange={(id) => id && onChange([...ids, id])} placeholder="Add a role" /></div>
    </div>
  );
}

function ButtonRolesTab({ api, res, communityId }: any) {
  const blank = { title: 'Pick your roles', description: '', mode: 'TOGGLE', buttons: [{ roleId: '', label: '', emoji: '' }], channelId: '' };
  const [panels, setPanels] = useState<any[]>([]);
  const [f, setF] = useState<any>(blank);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api('/features/button-roles').then(setPanels).catch(() => undefined), [api]);
  useEffect(() => { load(); }, [load]);
  const setB = (i: number, p: any) => setF({ ...f, buttons: f.buttons.map((b: any, n: number) => (n === i ? { ...b, ...p } : b)) });
  return (
    <div className="grid gap-6 2xl:grid-cols-[1.3fr_1fr]">
      <Card title={f.id ? 'Edit panel' : 'New role panel'} right={f.id && <button className={ghost} onClick={() => setF(blank)}>New panel</button>}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Label t="Title"><input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Label>
            <Label t="Mode"><select className={input} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="TOGGLE">Pick any (press again to remove)</option><option value="ONE_ONLY">Pick one only</option></select></Label>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="text-sm font-medium text-slate-700">Look
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[['BUTTONS', 'Classic', 'Message with a row of coloured buttons'], ['CARDS', 'Premium frame', 'Coloured frame with the server picture, your text, the buttons, a big image and a footer']].map(([v, l, d]) => (
                  <button key={v} type="button" onClick={() => setF({ ...f, layout: v })} className={`rounded-xl border p-3 text-left ${((f.layout || 'BUTTONS') === v) ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200'}`}><b className="text-sm">{l}</b><span className="block text-xs text-slate-500">{d}</span></button>
                ))}
              </div>
            </div>
            <Label t="Frame colour"><div className="flex items-center gap-2"><input type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200" value={f.color || '#7c8cff'} onChange={(e) => setF({ ...f, color: e.target.value })} />{f.color && <button type="button" className="text-xs text-slate-500 underline" onClick={() => setF({ ...f, color: '' })}>Auto</button>}</div><span className="text-xs text-slate-500">Auto = colour of the first role</span></Label>
          </div>
          <Label t="Description"><MessageComposer communityId={communityId} value={f.description} onChange={(v) => setF({ ...f, description: v })} rows={8} maxLength={4000} /></Label>
          <div className="space-y-2">
            {f.buttons.map((b: any, i: number) => (
              <div key={i} className="rounded-xl border border-slate-200 p-2">
                <div className="grid grid-cols-[70px_1fr_1fr_110px_auto_auto] gap-2">
                  <EmojiField communityId={communityId} value={b.emoji || ''} onChange={(v) => setB(i, { emoji: v })} />
                  <input className={input} placeholder="Button label" value={b.label} onChange={(e) => setB(i, { label: e.target.value })} />
                  <Pick options={res.roles} value={b.roleId} onChange={(v) => setB(i, { roleId: v, label: b.label || res.roles.find((r: any) => r.id === v)?.name || '' })} placeholder="Role" />
                  <select className={`${input} ${({ BLUE: 'text-indigo-600', GREEN: 'text-emerald-600', RED: 'text-rose-600', GREY: 'text-slate-600' } as any)[b.style] || ''}`} value={b.style || 'AUTO'} onChange={(e) => setB(i, { style: e.target.value })} title="Button colour">
                    <option value="AUTO">🎨 Auto</option><option value="BLUE">🔵 Blue</option><option value="GREEN">🟢 Green</option><option value="RED">🔴 Red</option><option value="GREY">⚪ Grey</option>
                  </select>
                  <button type="button" className={`rounded-lg px-2 text-xs font-semibold ${(b.requiredRoleIds?.length || b.blockedRoleIds?.length) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`} onClick={() => setB(i, { _open: !b._open })}>{(b.requiredRoleIds?.length || b.blockedRoleIds?.length) ? `🔒 ${(b.requiredRoleIds?.length || 0) + (b.blockedRoleIds?.length || 0)}` : 'More'}</button>
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setF({ ...f, buttons: f.buttons.filter((_: any, n: number) => n !== i) })} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
                {b._open && (
                  <div className="mt-2 grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-2">
                    {false && <><Label t="Short description (cards look)"><input className={input} maxLength={200} value={b.description || ''} onChange={(e) => setB(i, { description: e.target.value })} placeholder="e.g. Unlocks the GTA V channels" /></Label>
                    <Label t="Button text (cards look)"><input className={input} maxLength={40} value={b.buttonText || ''} onChange={(e) => setB(i, { buttonText: e.target.value })} placeholder="Choose" /></Label></>}
                    <RoleChipsField communityId={communityId} label="Who can take this role" hint="Only members with any of these roles. Empty = anyone who can use the panel." ids={b.requiredRoleIds || []} onChange={(l: string[]) => setB(i, { requiredRoleIds: l })} />
                    <RoleChipsField communityId={communityId} label="Who can’t take it" hint="Members with any of these roles are refused." ids={b.blockedRoleIds || []} onChange={(l: string[]) => setB(i, { blockedRoleIds: l })} />
                  </div>
                )}
              </div>
            ))}
            {f.buttons.length < 25 && <button className={ghost} onClick={() => setF({ ...f, buttons: [...f.buttons, { roleId: '', label: '', emoji: '' }] })}><Plus className="h-4 w-4" /> Add button</button>}
          </div>
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-2">
            <RoleChipsField communityId={communityId} label="Who can use the whole panel" hint="Only members with any of these roles. Empty = everyone who can see the channel. Each button can add its own rule with Who." ids={f.requiredRoleIds || []} onChange={(l: string[]) => setF({ ...f, requiredRoleIds: l })} />
            <RoleChipsField communityId={communityId} label="Who can’t use it" hint="Members with any of these roles are refused." ids={f.blockedRoleIds || []} onChange={(l: string[]) => setF({ ...f, blockedRoleIds: l })} />
            <p className="text-xs text-slate-500 md:col-span-2">Button colours: Discord only offers blue, green, red and grey. <b>Auto</b> picks a colour that makes the emoji stand out (🎯 red emoji → blue button, 🧙 blue emoji → green button). If you pick the same colour as the emoji, the emoji is hard to see. <b>More</b> on a button sets who can take it and, in the cards look, its description. Who can <b>see</b> the panel is set by the channel’s own permissions in Discord. Picking a role in “Pick one only” mode removes the other roles of this panel, and the member is told exactly what was added and removed.</p>
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
            <Label t="Thumbnail image link (top right)"><input className={input} value={f.thumbnailUrl || ''} onChange={(e) => setF({ ...f, thumbnailUrl: e.target.value })} placeholder="https://… (empty = server icon)" /></Label>
            <Label t="Big image link (above the footer)"><input className={input} value={f.imageUrl || ''} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://…png / .gif" /></Label>
            <Label t="Footer text"><input className={input} maxLength={200} value={f.footerText || ''} onChange={(e) => setF({ ...f, footerText: e.target.value })} placeholder="e.g. DONS OF SYNDICATE · Pick one game" /></Label>
            <Label t="Footer icon link (classic look)"><input className={input} value={f.footerIconUrl || ''} onChange={(e) => setF({ ...f, footerIconUrl: e.target.value })} placeholder="https://…" /></Label>
            <p className="text-xs text-slate-500 md:col-span-2">Links must start with https://. Tip: right-click an image in Discord → Copy Link.</p>
          </div>
          <Label t="Post or update in channel"><Pick options={res.textChannels} value={f.channelId} onChange={(v) => setF({ ...f, channelId: v })} placeholder="Save without posting" /></Label>
          <button className={btn} onClick={async () => { setMsg(''); try { const p = await api('/features/button-roles', 'POST', f); setF({ ...p, channelId: p.channelId || '' }); setMsg(f.channelId ? 'Saved and posted.' : 'Saved.'); load(); } catch (e: any) { setMsg(e.message); } }}><Send className="h-4 w-4" /> Save panel</button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </div>
      </Card>
      <Card title="Your panels">
        {!panels.length ? <p className="text-sm text-slate-500">No panels yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {panels.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div><div className="font-semibold text-slate-900">{p.title}</div><div className="text-xs text-slate-500">{p.buttons.length} roles · {p.mode === 'ONE_ONLY' ? 'one only' : 'pick any'}{p.channelId ? ' · posted' : ''}</div></div>
                <div className="flex gap-3 text-xs font-semibold">
                  <button className="text-indigo-600 hover:underline" onClick={() => setF({ ...p, channelId: p.channelId || '' })}>Edit</button>
                  <button className="text-rose-600 hover:underline" onClick={() => api(`/features/button-roles/${p.id}`, 'DELETE').then(load)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Verification ---------------- */
function VerificationTab({ api, cfg, res, onSave }: any) {
  const [c, setC] = useState(cfg);
  const [ch, setCh] = useRemembered('verify:' + (typeof location !== 'undefined' ? location.pathname : ''));
  const [msg, setMsg] = useState('');
  return (
    <Card title="Verification" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />}
      desc="Tip: hide your channels from @everyone and show them to the verified role, so only verified members see the server.">
      <div className="grid gap-4 md:grid-cols-3">
        <Label t="Role given when verified"><Pick options={res.roles} value={c.roleId} onChange={(v) => setC({ ...c, roleId: v })} placeholder="Choose a role" /></Label>
        <Label t="Role removed when verified (optional)"><Pick options={res.roles} value={c.removeRoleId} onChange={(v) => setC({ ...c, removeRoleId: v })} placeholder="None" /></Label>
        <Label t="Check"><select className={input} value={c.mode} onChange={(e) => setC({ ...c, mode: e.target.value })}><option value="BUTTON">Press a button</option><option value="MATH">Solve a quick sum (stops simple bots)</option></select></Label>
        <div className="md:col-span-3"><Label t="Panel message"><textarea rows={3} className={input} value={c.message} onChange={(e) => setC({ ...c, message: e.target.value })} /></Label></div>
      </div>
      <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
      <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
        <div className="min-w-[240px] flex-1"><Pick options={res.textChannels} value={ch} onChange={setCh} placeholder="Channel for the Verify panel" /></div>
        <button className={btn} disabled={!ch} onClick={async () => { setMsg(''); try { await api('/features/verification/panel', 'POST', { channelId: ch }); setMsg('Panel posted.'); } catch (e: any) { setMsg(e.message); } }}><Send className="h-4 w-4" /> Post panel</button>
      </div>
      {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
    </Card>
  );
}

/* ---------------- Logs ---------------- */
const LOG_EVENTS: [string, string][] = [['memberJoin', 'Members joining'], ['memberLeave', 'Members leaving'], ['messageDelete', 'Deleted messages'], ['messageEdit', 'Edited messages'], ['roleChange', 'Role changes'], ['nicknameChange', 'Nickname changes'], ['moderation', 'Warnings and automatic actions']];
function LogsTab({ cfg, res, onSave }: any) {
  const [c, setC] = useState(cfg);
  return (
    <Card title="Server logs" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />} desc="Use a channel only staff can see.">
      <div className="max-w-md"><Label t="Log channel"><Pick options={res.textChannels} value={c.channelId} onChange={(v) => setC({ ...c, channelId: v })} placeholder="Choose a channel" /></Label></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {LOG_EVENTS.map(([k, l]) => (
          <div key={k} className="rounded-xl border border-slate-200 p-3"><Toggle on={c.events[k]} onChange={(v) => setC({ ...c, events: { ...c.events, [k]: v } })} label={l} /></div>
        ))}
      </div>
      <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
    </Card>
  );
}

/* ---------------- Starboard ---------------- */
function StarboardTab({ cfg, res, onSave }: any) {
  const [c, setC] = useState(cfg);
  return (
    <Card title="Starboard" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />}>
      <div className="grid gap-4 md:grid-cols-3">
        <Label t="Highlight channel"><Pick options={res.textChannels} value={c.channelId} onChange={(v) => setC({ ...c, channelId: v })} placeholder="Choose a channel" /></Label>
        <Label t="Emoji"><input className={input} value={c.emoji} onChange={(e) => setC({ ...c, emoji: e.target.value })} /></Label>
        <Label t="Reactions needed"><input type="number" min={1} className={input} value={c.threshold} onChange={(e) => setC({ ...c, threshold: Number(e.target.value) })} /></Label>
      </div>
      <div className="mt-4"><Toggle on={c.allowSelfStar} onChange={(v) => setC({ ...c, allowSelfStar: v })} label="Count the author’s own reaction" /></div>
      <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
    </Card>
  );
}

/* ---------------- Birthdays ---------------- */
function BirthdaysTab({ api, cfg, res, onSave }: any) {
  const [c, setC] = useState(cfg);
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api('/features/birthdays').then(setList).catch(() => undefined); }, [api]);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div className="grid gap-6 2xl:grid-cols-[1.3fr_1fr]">
      <Card title="Birthdays" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Label t="Announcement channel"><Pick options={res.textChannels} value={c.channelId} onChange={(v) => setC({ ...c, channelId: v })} placeholder="Choose a channel" /></Label>
          <Label t="Birthday role for the day (optional)"><Pick options={res.roles} value={c.roleId} onChange={(v) => setC({ ...c, roleId: v })} placeholder="None" /></Label>
          <Label t="Announce at (hour)"><select className={input} value={c.hour} onChange={(e) => setC({ ...c, hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Label>
          <Label t="Time zone"><input className={input} value={c.timezone} onChange={(e) => setC({ ...c, timezone: e.target.value })} placeholder="Asia/Kolkata" /></Label>
          <div className="md:col-span-2"><Label t="Message ({user}, {username}, {server})"><input className={input} value={c.message} onChange={(e) => setC({ ...c, message: e.target.value })} /></Label></div>
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 md:col-span-2"><input type="checkbox" className="mt-0.5" checked={!!c.askOnJoin} onChange={(e) => setC({ ...c, askOnJoin: e.target.checked })} /><span><b>Ask new members for their birthday</b><br /><span className="text-xs text-slate-500">A few seconds after joining, the bot sends a private message with “Share my birthday” and “No thanks”. Sharing is optional; only day and month are saved, and members can change or remove it with /birthday.</span></span></label>
        </div>
        <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
      </Card>
      <Card title={`Saved birthdays (${list.length})`}>
        {!list.length ? <p className="text-sm text-slate-500">Members add theirs with /birthday set.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">{list.map((b) => <li key={b.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="truncate">{b.username}</span><span className="font-semibold text-slate-700">{b.day} {months[b.month - 1]}</span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Custom commands ---------------- */
function CustomTab({ cfg, onSave }: any) {
  const [c, setC] = useState(cfg);
  const setCmd = (i: number, p: any) => setC({ ...c, commands: c.commands.map((x: any, n: number) => (n === i ? { ...x, ...p } : x)) });
  return (
    <Card title="Custom commands" right={<div className="flex items-center gap-3"><Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />
      <button className={ghost} onClick={() => setC({ ...c, commands: [...c.commands, { name: '', response: '', embed: false, deleteTrigger: false }] })}><Plus className="h-4 w-4" /> Add command</button></div>}>
      <div className="max-w-[140px]"><Label t="Prefix"><input className={input} value={c.prefix} maxLength={3} onChange={(e) => setC({ ...c, prefix: e.target.value })} /></Label></div>
      <div className="mt-5 space-y-3">
        {c.commands.map((cmd: any, i: number) => (
          <div key={i} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[200px_1fr_auto] lg:items-start">
            <div className="flex items-center gap-1"><span className="font-mono text-slate-500">{c.prefix}</span><input className={input} placeholder="name" value={cmd.name} onChange={(e) => setCmd(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /></div>
            <div className="space-y-2">
              <textarea rows={2} className={input} placeholder="Reply ({user}, {username}, {server})" value={cmd.response} onChange={(e) => setCmd(i, { response: e.target.value })} />
              <div className="flex flex-wrap gap-5"><Toggle on={cmd.embed} onChange={(v) => setCmd(i, { embed: v })} label="Show as a card" /><Toggle on={cmd.deleteTrigger} onChange={(v) => setCmd(i, { deleteTrigger: v })} label="Delete the member’s command message" /></div>
            </div>
            <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setC({ ...c, commands: c.commands.filter((_: any, n: number) => n !== i) })} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {!c.commands.length && <p className="text-sm text-slate-500">Example: <span className="font-mono">!socials</span> → “Follow us on Instagram and YouTube!”</p>}
      </div>
      <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
    </Card>
  );
}

/* ---------------- Server stats ---------------- */
const STAT_HELP: Record<string, string> = {
  members: 'Everyone in the server, bots included.',
  humans: 'Everyone except bots.',
  bots: 'Only bots.',
  online: 'Members shown as online, idle or busy (Discord’s own count).',
  role: 'Members who have the role you pick, e.g. GTA V or MC members.',
  inVoice: 'People sitting in any voice channel right now.',
  boosts: 'How many boosts the server has.',
  boostTier: 'Boost level 0 to 3.',
  joinedToday: 'Members who joined in the last 24 hours.',
  goal: 'How many members are still needed to reach your goal. Use {goal} to show the goal.',
  channels: 'Text and voice channels (categories not counted).',
  roles: 'Roles in the server.',
};

function StatsTab({ api, res, communityId }: any) {
  const blank = { kind: 'members', template: '👥 · MEMBERS : {count}', format: 'plain', roleId: '', goal: '', mode: 'new', categoryId: '', newCategoryName: '📊 • SERVER STATS • 📊', channelId: '', lock: true };
  const [data, setData] = useState<any>(null);
  const [f, setF] = useState<any>(blank);
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/features/server-stats').then(setData).catch((e: any) => setMsg(e.message)), [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (f.kind === 'role' && !f.roleId) return setPreview(null);
      api('/features/server-stats/preview', 'POST', f).then(setPreview).catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [f.kind, f.template, f.format, f.roleId, f.goal, api]);
  const kinds = data?.kinds || [];
  const voice = (res as any).voiceChannels || [];
  const chName = (id: string) => voice.find((c: any) => c.id === id)?.name;
  const pickKind = (k: string) => { const ex = kinds.find((x: any) => x.id === k)?.example; setF({ ...f, kind: k, template: f.id ? f.template : ex || f.template }); };
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const body: any = { ...f };
      if (f.id || f.mode === 'existing') { delete body.categoryId; delete body.newCategoryName; } else { delete body.channelId; if (f.categoryId) delete body.newCategoryName; }
      await api('/features/server-stats', 'POST', body);
      setMsg(f.id ? 'Saved. The channel name is updated now.' : f.mode === 'existing' ? 'Linked. The channel now updates on its own.' : 'Counter channel created.');
      setF(blank); load();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <div className="grid gap-6 2xl:grid-cols-[1.2fr_1fr]">
      <Card title={f.id ? 'Edit counter' : 'Add a counter'} desc="The bot renames a voice channel to show a live number. Discord lets a channel be renamed about twice in 10 minutes, so numbers update within 5 minutes." right={f.id && <button className={ghost} onClick={() => setF(blank)}>New counter</button>}>
        <div className="space-y-4">
          <Label t="What to count">
            <select className={input} value={f.kind} onChange={(e) => pickKind(e.target.value)}>{kinds.map((k: any) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            <p className="mt-1 text-xs text-slate-500">{STAT_HELP[f.kind]}</p>
          </Label>
          {f.kind === 'role' && <Label t="Role to count"><RoleSelect communityId={communityId} value={f.roleId} onChange={(v) => setF({ ...f, roleId: v || '' })} placeholder="Pick a role" /></Label>}
          {f.kind === 'goal' && <Label t="Member goal"><input type="number" min={1} className={input} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="500" /></Label>}
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <Label t="Channel name">
              <input className={input} value={f.template} maxLength={100} onChange={(e) => setF({ ...f, template: e.target.value })} />
              <p className="mt-1 text-xs text-slate-500">Put <b>{'{count}'}</b> where the number goes. Emojis and styled letters work. Also: {'{goal}'}, {'{server}'}.</p>
            </Label>
            <Label t="Number style"><select className={input} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}><option value="plain">1234</option><option value="comma">1,234</option><option value="short">1.2k</option></select></Label>
          </div>
          <div className="rounded-xl bg-slate-800 px-4 py-3 text-sm text-slate-200">🔊 {preview ? preview.name : <span className="text-slate-400">Preview appears here</span>}{preview && <span className="ml-2 text-xs text-slate-400">(live value {preview.value})</span>}</div>
          {!f.id && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <div className="flex gap-2 text-sm">
                <button type="button" className={`rounded-lg px-3 py-1.5 font-semibold ${f.mode === 'new' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setF({ ...f, mode: 'new' })}>Create a new channel</button>
                <button type="button" className={`rounded-lg px-3 py-1.5 font-semibold ${f.mode === 'existing' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setF({ ...f, mode: 'existing' })}>Use a channel I already have</button>
              </div>
              {f.mode === 'new' ? (
                <>
                  <Label t="Category"><Pick options={res.categories} value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} placeholder="Make a new category" /></Label>
                  {!f.categoryId && <Label t="New category name"><input className={input} value={f.newCategoryName} onChange={(e) => setF({ ...f, newCategoryName: e.target.value })} /></Label>}
                  <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={f.lock} onChange={(e) => setF({ ...f, lock: e.target.checked })} /><span>Nobody can join it<span className="block text-xs text-slate-500">Members can see the channel but not connect. This only applies to the new channel; no other channel or role is changed.</span></span></label>
                </>
              ) : (
                <>
                  {data?.existing?.length > 0 && <div className="flex flex-wrap gap-2">{data.existing.map((c: any) => <button key={c.id} type="button" className={`rounded-full border px-3 py-1 text-xs font-semibold ${f.channelId === c.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`} onClick={() => setF({ ...f, channelId: c.id, template: c.template })}>🔊 {c.name}</button>)}</div>}
                  <Label t="Channel"><Pick options={voice} value={f.channelId} onChange={(v) => setF({ ...f, channelId: v })} placeholder="Pick a voice channel" /></Label>
                  <p className="text-xs text-slate-500">The channel’s permissions stay exactly as you set them. The bot only changes its name, so it needs Manage Channels on it.</p>
                </>
              )}
            </div>
          )}
          <button className={btn} disabled={busy} onClick={save}><Send className="h-4 w-4" /> {f.id ? 'Save' : f.mode === 'existing' ? 'Link channel' : 'Create counter'}</button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </div>
      </Card>
      <GrowthReportCard api={api} res={res} communityId={communityId} />
      <Card title="Your counters" right={<button className={ghost} disabled={busy} onClick={async () => { setBusy(true); try { setData({ ...data, counters: await api('/features/server-stats/refresh', 'POST') }); setMsg('Updated.'); } catch (e: any) { setMsg(e.message); } setBusy(false); }}><RefreshCw className="h-4 w-4" /> Update now</button>}>
        {!data ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" /> : !data.counters.length ? <p className="text-sm text-slate-500">No counters yet. Add one, or link the stat channels you already have.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.counters.map((c: any) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">🔊 {c.channelName || c.lastName || chName(c.channelId) || 'Channel'}</div>
                  <div className="text-xs text-slate-500">{kinds.find((k: any) => k.id === c.kind)?.label}{c.lastUpdatedAt ? ` · updated ${fmtDate(c.lastUpdatedAt)}` : ''}</div>
                  {c.channelMissing && <div className="text-xs text-rose-600">The channel was deleted in Discord. Delete this counter or make a new one.</div>}
                  {c.lastError && c.lastError !== 'missing' && <div className="text-xs text-amber-700">{c.lastError}</div>}
                </div>
                <div className="flex shrink-0 gap-3 text-xs font-semibold">
                  <button className="text-indigo-600 hover:underline" onClick={() => setF({ ...blank, ...c, roleId: c.roleId || '', goal: c.goal || '' })}>Edit</button>
                  <button className="text-rose-600 hover:underline" onClick={async () => {
                    const both = c.createdByBot ? window.confirm('Also delete the channel in Discord? Press Cancel to keep the channel and only stop updating it.') : false;
                    try { await api(`/features/server-stats/${c.id}${both ? '?channel=1' : ''}`, 'DELETE'); load(); } catch (e: any) { setMsg(e.message); }
                  }}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Growth reports ---------------- */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function GrowthReportCard({ api, res, communityId }: any) {
  const [s, setS] = useState<any>(null);
  const [pv, setPv] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/features/growth-report').then((d: any) => { setS({ ...d.settings, timezone: d.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone }); setPv(d.preview); }).catch((e: any) => setMsg(e.message)); }, [api]);
  useEffect(() => { if (s) api(`/features/growth-report?frequency=${s.frequency}`).then((d: any) => setPv(d.preview)).catch(() => undefined); }, [s?.frequency]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <Card title="Server reports"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></Card>;
  const chips = (key: string, label: string, hint: string) => (
    <div className="text-sm font-medium text-slate-700">{label}<div className="text-xs font-normal text-slate-500">{hint}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">{(s[key] || []).map((id: string) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{key === 'dmUserIds' ? <MemberName id={id} communityId={communityId} /> : `@${res.roles.find((r: any) => r.id === id)?.name || 'role'}`}<button type="button" onClick={() => setS({ ...s, [key]: s[key].filter((x: string) => x !== id) })}>×</button></span>)}</div>
      <div className="mt-1">{key === 'dmUserIds' ? <MemberSelect communityId={communityId} value="" onChange={(id: any) => id && setS({ ...s, dmUserIds: [...s.dmUserIds, typeof id === 'string' ? id : id.id] })} placeholder="Add a member" /> : <RoleSelect communityId={communityId} value="" exclude={s[key]} onChange={(id: any) => id && setS({ ...s, [key]: [...s[key], id] })} placeholder="Add a role" />}</div>
    </div>
  );
  const save = async () => { setBusy(true); setMsg(''); try { setS(await api('/features/growth-report', 'PUT', s)); setMsg(s.enabled ? '✓ Saved. Reports will go out on schedule.' : '✓ Saved (switched off).'); } catch (e: any) { setMsg(e.message); } setBusy(false); };
  const sendNow = async () => { setBusy(true); setMsg(''); try { const r = await api('/features/growth-report', 'POST', s); setMsg(`Sent: ${r.result}`); } catch (e: any) { setMsg(e.message); } setBusy(false); };
  return (
    <div className="2xl:col-span-2">
      <Card title="Server reports" desc="A growth report (joins, leaves, net growth, who stayed, top inviters, applications) sent on a schedule to a channel, to members of roles by DM, or to chosen members by DM.">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />Send reports automatically</label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Label t="How often"><select className={input} value={s.frequency} onChange={(e) => setS({ ...s, frequency: e.target.value })}><option value="WEEKLY">Every week</option><option value="BIWEEKLY">Every two weeks</option><option value="MONTHLY">Every month</option></select></Label>
              {s.frequency === 'MONTHLY'
                ? <Label t="Day of month"><select className={input} value={s.monthDay} onChange={(e) => setS({ ...s, monthDay: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></Label>
                : <Label t="Day"><select className={input} value={s.weekday} onChange={(e) => setS({ ...s, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Label>}
              <Label t="Time"><select className={input} value={s.hour} onChange={(e) => setS({ ...s, hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`}</option>)}</select><span className="text-xs text-slate-500">{s.timezone}</span></Label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Label t="Post in channel"><Pick options={res.textChannels} value={s.channelId} onChange={(v) => setS({ ...s, channelId: v })} placeholder="Don't post in a channel" /></Label>
              {chips('pingRoleIds', 'Ping roles with the post', 'Mentioned in the channel post.')}
              {chips('dmRoleIds', 'DM everyone with these roles', 'e.g. your staff role. Up to 100 people.')}
              {chips('dmUserIds', 'DM these members', 'e.g. the owner.')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className={btn} disabled={busy} onClick={save}><Send className="h-4 w-4" />Save</button>
              <button className={ghost} disabled={busy} onClick={sendNow}>Send one now</button>
              {msg && <span className="text-sm text-slate-600">{msg}</span>}
            </div>
            {s.lastSentAt && <p className="text-xs text-slate-500">Last sent {fmtDate(s.lastSentAt)}{s.lastResult ? ` · ${s.lastResult}` : ''}</p>}
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Preview (right now)</div>
            <div className="rounded-lg border-l-4 border-emerald-500 bg-[#2b2d31] p-3 text-[13px] text-slate-200">
              <div className="font-bold text-white">📊 {s.frequency === 'MONTHLY' ? 'Monthly' : s.frequency === 'BIWEEKLY' ? 'Two-week' : 'Weekly'} server report</div>
              {pv ? <>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><b className="text-white">📥 Joined</b><br />+{pv.joins}</div><div><b className="text-white">📤 Left</b><br />-{pv.leaves}</div><div><b className="text-white">📈 Net</b><br />{pv.net >= 0 ? '+' : ''}{pv.net} ({pv.growthPct.toFixed(1)}%)</div>
                  <div><b className="text-white">👥 Members</b><br />{pv.members}</div><div><b className="text-white">🧲 Still here</b><br />{pv.stayed}/{pv.joins}</div><div><b className="text-white">📝 Applied</b><br />{pv.apps} · ✅{pv.approved}</div></div>
                <div className="mt-2 text-xs"><b className="text-white">🏆 Top inviters</b><br />{pv.top.length ? pv.top.map(([id, n]: any, i: number) => <div key={id}>{['🥇', '🥈', '🥉', '4.', '5.'][i]} <MemberName id={id} communityId={communityId} /> · {n}</div>) : 'No tracked invites yet.'}</div>
              </> : <div className="mt-2 text-xs text-slate-400">Loading…</div>}
            </div>
            <p className="mt-2 text-xs text-slate-500">Leaves are counted from today on; joins also use each member’s join date, so the first report is already useful.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
