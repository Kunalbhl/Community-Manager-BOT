/** Prizes, draws, replacements and the final result for web-form giveaways. */
import { giveawayFormsRepository, giveawayEntriesRepository, giveawayPrizesRepository, GiveawayEntry, GiveawayPrize } from './giveawayForms.service.js';
import { drawRound, pickReplacement } from './giveawayDraw.logic.js';
import { guildFor } from './toolkit/toolkitConfig.js';
import { logger } from '../logging/logger.js';

const clean = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

async function formOf(communityId: string, formId: string) {
  const f = await giveawayFormsRepository.getById(formId);
  if (!f || f.communityId !== communityId) throw new Error('Form not found.');
  return f;
}
async function entriesOf(communityId: string, formId: string) { return (await giveawayEntriesRepository.listForTenant(communityId)).filter((e) => e.formId === formId); }
async function prizesOf(communityId: string, formId: string) { return (await giveawayPrizesRepository.listForTenant(communityId)).filter((p) => p.formId === formId).sort((a, b) => a.id.localeCompare(b.id)); }

export const giveawayDraw = {
  async prizes(communityId: string, formId: string) { await formOf(communityId, formId); return prizesOf(communityId, formId); },

  async savePrize(communityId: string, formId: string, body: any, prizeId?: string) {
    await formOf(communityId, formId);
    const name = clean(body.name, 120);
    if (!name) throw new Error('Name the prize.');
    const count = Math.min(500, Math.max(1, Math.round(Number(body.count) || 1)));
    if (prizeId) {
      const p = await giveawayPrizesRepository.getById(prizeId);
      if (!p || p.communityId !== communityId) throw new Error('Prize not found.');
      if (p.drawnAt) throw new Error('This prize was already drawn. Use Replace winner for no-shows.');
      return giveawayPrizesRepository.update(prizeId, { name, count, allowRepeat: !!body.allowRepeat } as any);
    }
    return giveawayPrizesRepository.create({ communityId, formId, name, count, allowRepeat: !!body.allowRepeat, winners: [] } as any);
  },

  async deletePrize(communityId: string, prizeId: string) {
    const p = await giveawayPrizesRepository.getById(prizeId);
    if (!p || p.communityId !== communityId) throw new Error('Prize not found.');
    if (p.drawnAt) throw new Error('This prize was already drawn, so it stays in the record.');
    await giveawayPrizesRepository.delete(prizeId);
  },

  /** Draw one, several or all undrawn prizes in a single round. */
  async draw(communityId: string, formId: string, prizeIds: string[], by?: string) {
    const f = await formOf(communityId, formId);
    if (f.status === 'DRAFT') throw new Error('Open the form first.');
    const all = await prizesOf(communityId, formId);
    const chosen = all.filter((p) => prizeIds.includes(p.id));
    if (!chosen.length) throw new Error('Pick at least one prize to draw.');
    if (chosen.some((p) => p.drawnAt)) throw new Error('One of those prizes was already drawn.');
    const entries = await entriesOf(communityId, formId);
    const result = drawRound(entries, chosen.map((p) => ({ id: p.id, count: p.count, allowRepeat: p.allowRepeat, winners: [] })));
    const now = new Date().toISOString();
    for (const p of chosen) {
      const ids = result[p.id] || [];
      for (const eid of ids) { const e = entries.find((x) => x.id === eid)!; await giveawayEntriesRepository.update(eid, { won: [...e.won, p.id] } as any); }
      await giveawayPrizesRepository.update(p.id, { winners: ids, drawnAt: now, drawnBy: by } as any);
    }
    const remaining = (await prizesOf(communityId, formId)).filter((p) => !p.drawnAt).length;
    if (!remaining) await giveawayFormsRepository.update(formId, { status: 'DRAWN' } as any);
    return this.report(communityId, formId);
  },

  /** Replace one winner (no-show, ineligible) with a new person who has not won. The old winner stays in the history. */
  async replaceWinner(communityId: string, prizeId: string, entryId: string, disqualify: boolean) {
    const p = await giveawayPrizesRepository.getById(prizeId);
    if (!p || p.communityId !== communityId) throw new Error('Prize not found.');
    if (!p.winners.includes(entryId)) throw new Error('That person is not a winner of this prize.');
    const entries = await entriesOf(communityId, p.formId);
    const old = entries.find((e) => e.id === entryId)!;
    const repl = pickReplacement(entries, p, [entryId]);
    if (!repl) throw new Error('No one else is eligible to replace this winner.');
    await giveawayEntriesRepository.update(entryId, { won: old.won.filter((x) => x !== prizeId), ...(disqualify ? { status: 'DISQUALIFIED' } : {}) } as any);
    const r = entries.find((e) => e.id === repl)!;
    await giveawayEntriesRepository.update(repl, { won: [...r.won, prizeId] } as any);
    await giveawayPrizesRepository.update(prizeId, { winners: p.winners.map((w) => (w === entryId ? repl : w)) } as any);
    return this.report(communityId, p.formId);
  },

  async setEntryStatus(communityId: string, entryId: string, status: 'VALID' | 'DISQUALIFIED') {
    const e = await giveawayEntriesRepository.getById(entryId);
    if (!e || e.communityId !== communityId) throw new Error('Entry not found.');
    if (status === 'DISQUALIFIED' && e.won.length) throw new Error('This person already won. Use Replace winner on the prize.');
    await giveawayEntriesRepository.update(entryId, { status } as any);
  },

  async report(communityId: string, formId: string) {
    const form = await formOf(communityId, formId);
    const [entries, prizes] = await Promise.all([entriesOf(communityId, formId), prizesOf(communityId, formId)]);
    const byId = new Map(entries.map((e) => [e.id, e]));
    return {
      form,
      totals: { entries: entries.length, valid: entries.filter((e) => e.status === 'VALID').length, disqualified: entries.filter((e) => e.status === 'DISQUALIFIED').length, winners: new Set(prizes.flatMap((p) => p.winners)).size, discord: entries.filter((e) => e.provider === 'discord').length, google: entries.filter((e) => e.provider === 'google').length },
      prizes: prizes.map((p) => ({ ...p, winnerEntries: p.winners.map((id) => byId.get(id)).filter(Boolean) as GiveawayEntry[] })),
    };
  },

  /** Post the result in Discord (names only, no private details) and DM Discord winners. Best effort. */
  async announce(communityId: string, formId: string) {
    const rep = await this.report(communityId, formId);
    const f = rep.form;
    const drawn = rep.prizes.filter((p: any) => p.drawnAt);
    if (!drawn.length) throw new Error('Draw at least one prize first.');
    const guild: any = await guildFor(communityId);
    const channel: any = f.resultChannelId ? guild?.channels?.cache?.get(f.resultChannelId) : null;
    if (!channel) throw new Error('Choose a result channel in the form settings first.');
    const mention = (e: GiveawayEntry) => (e.discordId ? `<@${e.discordId}>` : `**${e.name}**`);
    const lines = drawn.map((p: any) => `🎁 **${p.name}**\n${p.winnerEntries.length ? p.winnerEntries.map(mention).join(', ') : 'No eligible entries'}`);
    const users = drawn.flatMap((p: any) => p.winnerEntries.filter((e: GiveawayEntry) => e.discordId).map((e: GiveawayEntry) => e.discordId));
    await channel.send({
      embeds: [{ title: `🏆 ${f.title}: winners`, description: lines.join('\n\n').slice(0, 4000), color: 0xff5c8a, footer: { text: `${rep.totals.valid} valid entries` } }],
      allowedMentions: { users },
    });
    let dms = 0;
    for (const p of drawn) for (const e of (p as any).winnerEntries as GiveawayEntry[]) {
      if (!e.discordId) continue;
      const u = await guild?.client?.users?.fetch(e.discordId).catch(() => null);
      const ok = await u?.send(`🎉 Congratulations! You won **${p.name}** in **${f.title}**. The server team will contact you about delivery.`).then(() => true).catch(() => false);
      if (ok) dms++; else logger.info(`[GiveawayForms] could not DM winner ${e.discordId}`);
    }
    return { posted: true, dms };
  },
};
