import { takeOpenTab } from './SetupGuideView.js';
import React, { useCallback, useEffect, useState } from 'react';
import { TrendingUp, Gift, MousePointerClick, BadgeCheck, ScrollText, Star, Cake, TerminalSquare, Plus, Trash2, Send, RefreshCw, Trophy } from 'lucide-react';
import { Banner, Card, Toggle, Pick, MultiPick, SaveBar, input, btn, ghost, fmtDate, Resources } from './ServerToolsView.js';

type Tab = 'levels' | 'giveaways' | 'buttonRoles' | 'verification' | 'logs' | 'starboard' | 'birthdays' | 'custom';
const TABS: { id: Tab; label: string; icon: any; hint: string }[] = [
  { id: 'levels', label: 'Levels & XP', icon: TrendingUp, hint: 'Members earn XP by chatting, level up and unlock reward roles. /rank and /leaderboard show progress.' },
  { id: 'giveaways', label: 'Giveaways', icon: Gift, hint: 'Members press Enter; winners are picked fairly when time runs out. Also /giveaway in Discord.' },
  { id: 'buttonRoles', label: 'Button roles', icon: MousePointerClick, hint: 'Let members pick their own roles with buttons: games, regions, pings and more.' },
  { id: 'verification', label: 'Verification', icon: BadgeCheck, hint: 'New members press Verify (optionally solve a quick sum) before they can see the server.' },
  { id: 'logs', label: 'Server logs', icon: ScrollText, hint: 'A private channel that records joins, leaves, deleted and edited messages, role changes and warnings.' },
  { id: 'starboard', label: 'Starboard', icon: Star, hint: 'Messages that get enough star reactions are reposted in a highlight channel.' },
  { id: 'birthdays', label: 'Birthdays', icon: Cake, hint: 'Members save their birthday with /birthday set; the bot celebrates on the day.' },
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

export function CommunityFeaturesView({ communityId }: { communityId: string }) {
  const api = useApi(communityId);
  const [tab, setTab] = useState<Tab>(() => takeOpenTab(['levels', 'giveaways', 'buttonRoles', 'verification', 'logs', 'starboard', 'birthdays', 'custom'] as const, 'levels'));
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
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Community features</h1>
        <p className="mt-1 text-slate-500">Levels, giveaways, self-roles, verification, logs, starboard, birthdays and custom commands.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const on = cfg && (t.id === 'custom' ? cfg.customCommands?.enabled : t.id === 'giveaways' || t.id === 'buttonRoles' ? null : cfg[t.id]?.enabled);
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
              {on != null && <span className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-300'}`} aria-label={on ? 'on' : 'off'} />}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-slate-500">{current.hint}</p>
      {error && <Banner tone="error">{error} <button onClick={load} className="ml-2 underline">Try again</button></Banner>}
      {res && !res.connected && <Banner tone="warn">The bot is not connected to this server right now, so roles and channels can’t be listed.</Banner>}
      {!cfg && !error && <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}
      {cfg && res && (
        <>
          {tab === 'levels' && <LevelsTab api={api} cfg={cfg.levels} res={res} onSave={(v) => save('levels', v)} />}
          {tab === 'giveaways' && <GiveawaysTab api={api} res={res} />}
          {tab === 'buttonRoles' && <ButtonRolesTab api={api} res={res} />}
          {tab === 'verification' && <VerificationTab api={api} cfg={cfg.verification} res={res} onSave={(v) => save('verification', v)} />}
          {tab === 'logs' && <LogsTab cfg={cfg.logs} res={res} onSave={(v) => save('logs', v)} />}
          {tab === 'starboard' && <StarboardTab cfg={cfg.starboard} res={res} onSave={(v) => save('starboard', v)} />}
          {tab === 'birthdays' && <BirthdaysTab api={api} cfg={cfg.birthdays} res={res} onSave={(v) => save('birthdays', v)} />}
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
function GiveawaysTab({ api, res }: any) {
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
          <button className={btn} onClick={async () => { setMsg(''); try { await api('/features/giveaways', 'POST', f); setMsg('Giveaway started.'); setF({ ...f, prize: '', description: '' }); load(); } catch (e: any) { setMsg(e.message); } }}><Gift className="h-4 w-4" /> Start giveaway</button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </div>
      </Card>
      <Card title="Giveaways">
        {!list ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : !list.length ? <p className="text-sm text-slate-500">No giveaways yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {list.slice(0, 30).map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><div className="font-semibold text-slate-900">🎁 {g.prize}</div>
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
function ButtonRolesTab({ api, res }: any) {
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
          <Label t="Description"><textarea rows={2} className={input} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Label>
          <div className="space-y-2">
            {f.buttons.map((b: any, i: number) => (
              <div key={i} className="grid grid-cols-[70px_1fr_1fr_auto] gap-2">
                <input className={input} placeholder="🎮" value={b.emoji} onChange={(e) => setB(i, { emoji: e.target.value })} />
                <input className={input} placeholder="Button label" value={b.label} onChange={(e) => setB(i, { label: e.target.value })} />
                <Pick options={res.roles} value={b.roleId} onChange={(v) => setB(i, { roleId: v, label: b.label || res.roles.find((r: any) => r.id === v)?.name || '' })} placeholder="Role" />
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setF({ ...f, buttons: f.buttons.filter((_: any, n: number) => n !== i) })} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {f.buttons.length < 25 && <button className={ghost} onClick={() => setF({ ...f, buttons: [...f.buttons, { roleId: '', label: '', emoji: '' }] })}><Plus className="h-4 w-4" /> Add button</button>}
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
  const [ch, setCh] = useState('');
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
