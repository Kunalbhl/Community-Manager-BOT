/**
 * Reward wallet: countable rewards (e.g. "Modded Heist") that recruiters earn and later use.
 *
 * Every change is one line in a ledger, never an overwritten number:
 *   EARN      +n  an invite reward credited it (linked to the grant, recruiter code and recruit)
 *   REVERSAL  -n  that reward was taken back (the recruit left)
 *   ADJUST    ±n  staff correction with a reason
 *   CLAIM     -n  used; PENDING until staff approve when the item needs approval, then APPROVED or DENIED
 * Balance = earned - reversed + adjustments - used - pending, worked out from the ledger every time.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { guildFor } from '../toolkit/toolkitConfig.js';

export interface RewardItem {
  id: string;
  communityId: string;
  name: string;
  emoji: string;
  description: string;
  /** AUTO: using it takes effect at once. STAFF: a staff member confirms each use. */
  claimApproval: 'AUTO' | 'STAFF';
  /** Where use requests and the use log are posted. */
  logChannelId?: string;
  /** Most that can be used at once (0 = no limit). */
  maxPerClaim: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TxKind = 'EARN' | 'REVERSAL' | 'ADJUST' | 'CLAIM';
export type TxStatus = 'APPROVED' | 'PENDING' | 'DENIED' | 'CANCELLED';
export interface WalletTx {
  id: string;
  communityId: string;
  itemId: string;
  memberId: string;
  memberName?: string;
  kind: TxKind;
  /** Positive for gains, negative for use and reversals. */
  amount: number;
  status: TxStatus;
  note?: string;
  /** Where it came from. */
  grantId?: string;
  ruleName?: string;
  recruiterCode?: string;
  recruitId?: string;
  recruitName?: string;
  /** Event or session the use was for, e.g. "Heist night 14 Nov". */
  forEvent?: string;
  by: string;
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
}

export const rewardItemsRepository = new FirestoreRepository<RewardItem>('rewardItems');
export const walletTxRepository = new FirestoreRepository<WalletTx>('rewardWalletTx');

const nowIso = () => new Date().toISOString();
const snow = (v: unknown) => typeof v === 'string' && /^\d{15,22}$/.test(v);

export interface Balance { itemId: string; memberId: string; memberName: string; earned: number; reversed: number; adjusted: number; used: number; pending: number; available: number; byCode: Record<string, number>; lastAt: string }

export function balancesFrom(txs: WalletTx[]): Balance[] {
  const m = new Map<string, Balance>();
  for (const t of txs) {
    const k = `${t.itemId}|${t.memberId}`;
    let b = m.get(k);
    if (!b) { b = { itemId: t.itemId, memberId: t.memberId, memberName: t.memberName || t.memberId, earned: 0, reversed: 0, adjusted: 0, used: 0, pending: 0, available: 0, byCode: {}, lastAt: '' }; m.set(k, b); }
    if (t.memberName) b.memberName = t.memberName;
    if (t.createdAt > b.lastAt) b.lastAt = t.createdAt;
    if (t.kind === 'EARN' && t.status === 'APPROVED') { b.earned += t.amount; const c = t.recruiterCode || 'No code'; b.byCode[c] = (b.byCode[c] || 0) + t.amount; }
    if (t.kind === 'REVERSAL' && t.status === 'APPROVED') { b.reversed += -t.amount; const c = t.recruiterCode || 'No code'; b.byCode[c] = (b.byCode[c] || 0) + t.amount; }
    if (t.kind === 'ADJUST' && t.status === 'APPROVED') b.adjusted += t.amount;
    if (t.kind === 'CLAIM' && t.status === 'APPROVED') b.used += -t.amount;
    if (t.kind === 'CLAIM' && t.status === 'PENDING') b.pending += -t.amount;
  }
  for (const b of m.values()) b.available = b.earned - b.reversed + b.adjusted - b.used - b.pending;
  return Array.from(m.values());
}

export const wallet = {
  async items(communityId: string, onlyActive = false) {
    const all = await rewardItemsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.filter((i) => !onlyActive || i.active).sort((a, b) => a.name.localeCompare(b.name));
  },
  async item(communityId: string, id: string) {
    const i = await rewardItemsRepository.getById(id).catch(() => null);
    if (!i || i.communityId !== communityId) throw new Error('That reward item no longer exists.');
    return i;
  },
  /** Finds an item by name for Discord commands ("heist" → "Modded Heist"). */
  async findItem(communityId: string, q: string) {
    const items = await this.items(communityId, true);
    const n = q.trim().toLowerCase();
    return items.find((i) => i.id === q) || items.find((i) => i.name.toLowerCase() === n) || items.find((i) => i.name.toLowerCase().includes(n)) || (items.length === 1 ? items[0] : null);
  },
  async saveItem(communityId: string, b: any, id?: string) {
    const name = String(b?.name || '').trim().slice(0, 60);
    if (!name) throw new Error('Give the reward item a name, e.g. Modded Heist.');
    const data = {
      name, emoji: String(b?.emoji || '🎟️').trim().slice(0, 16), description: String(b?.description || '').trim().slice(0, 300),
      claimApproval: b?.claimApproval === 'STAFF' ? 'STAFF' : 'AUTO', logChannelId: snow(b?.logChannelId) ? b.logChannelId : '',
      maxPerClaim: Math.max(0, Math.min(1000, Math.round(Number(b?.maxPerClaim) || 0))), active: b?.active !== false, updatedAt: nowIso(),
    } as const;
    if (id) { await this.item(communityId, id); return rewardItemsRepository.update(id, data as any); }
    return rewardItemsRepository.create({ ...data, communityId, createdAt: nowIso() } as any);
  },

  async txs(communityId: string, filter?: { memberId?: string; itemId?: string }) {
    const where: any[] = [{ field: 'communityId', operator: '==', value: communityId }];
    if (filter?.memberId) where.push({ field: 'memberId', operator: '==', value: filter.memberId });
    const all = await walletTxRepository.list({ where });
    return all.filter((t) => !filter?.itemId || t.itemId === filter.itemId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async balance(communityId: string, memberId: string, itemId: string): Promise<Balance> {
    const b = balancesFrom(await this.txs(communityId, { memberId, itemId }))[0];
    return b || { itemId, memberId, memberName: memberId, earned: 0, reversed: 0, adjusted: 0, used: 0, pending: 0, available: 0, byCode: {}, lastAt: '' };
  },

  /** Credit from an invite reward. The id is fixed per grant, so it can never be added twice. */
  async earn(p: { communityId: string; itemId: string; amount: number; grantId: string; memberId: string; memberName?: string; ruleName: string; recruiterCode?: string; recruitId?: string; recruitName?: string }) {
    const id = `earn_${p.grantId}`.slice(0, 180);
    if (await walletTxRepository.getById(id).catch(() => null)) return null;
    const tx = await walletTxRepository.create({ id, communityId: p.communityId, itemId: p.itemId, memberId: p.memberId, memberName: p.memberName, kind: 'EARN', amount: Math.abs(p.amount), status: 'APPROVED', grantId: p.grantId, ruleName: p.ruleName, recruiterCode: p.recruiterCode, recruitId: p.recruitId, recruitName: p.recruitName, by: 'system', createdAt: nowIso() } as any);
    await this.log(p.communityId, tx, `➕ <@${p.memberId}> earned **${tx.amount}** for ${p.recruitId ? `recruiting <@${p.recruitId}>` : p.ruleName}${p.recruiterCode ? ` (code ${p.recruiterCode})` : ''}.`);
    return tx;
  },
  /** Takes back what a grant gave (once). */
  async reverse(communityId: string, grantId: string, why: string) {
    const earn: any = await walletTxRepository.getById(`earn_${grantId}`.slice(0, 180)).catch(() => null);
    if (!earn) return null;
    const id = `rev_${grantId}`.slice(0, 180);
    if (await walletTxRepository.getById(id).catch(() => null)) return null;
    const tx = await walletTxRepository.create({ ...earn, id, kind: 'REVERSAL', amount: -earn.amount, note: why, by: 'system', createdAt: nowIso() } as any);
    await this.log(communityId, tx, `➖ **${earn.amount}** taken back from <@${earn.memberId}>: ${why}`);
    return tx;
  },
  async adjust(communityId: string, p: { itemId: string; memberId: string; memberName?: string; amount: number; note: string; by: string }) {
    await this.item(communityId, p.itemId);
    const amount = Math.round(Number(p.amount));
    if (!snow(p.memberId)) throw new Error('Pick the member.');
    if (!amount) throw new Error('Enter a number to add (or a minus number to remove).');
    if (!p.note?.trim()) throw new Error('Add a short reason.');
    const tx = await walletTxRepository.create({ communityId, itemId: p.itemId, memberId: p.memberId, memberName: p.memberName, kind: 'ADJUST', amount, status: 'APPROVED', note: p.note.trim().slice(0, 300), by: p.by, createdAt: nowIso() } as any);
    await this.log(communityId, tx, `✏️ ${p.by} ${amount > 0 ? 'added' : 'removed'} **${Math.abs(amount)}** ${amount > 0 ? 'to' : 'from'} <@${p.memberId}>: ${tx.note}`);
    return tx;
  },

  /**
   * Uses rewards. `byStaff` means a staff member recorded it (always approved at once).
   * Otherwise the member asked, and the item's approval setting decides.
   */
  async claim(communityId: string, p: { itemId: string; memberId: string; memberName?: string; amount: number; forEvent?: string; by: string; byStaff: boolean }) {
    const item = await this.item(communityId, p.itemId);
    if (!item.active) throw new Error(`${item.name} can’t be used right now.`);
    const amount = Math.round(Number(p.amount));
    if (!(amount >= 1)) throw new Error('Use at least 1.');
    if (item.maxPerClaim && amount > item.maxPerClaim && !p.byStaff) throw new Error(`You can use at most ${item.maxPerClaim} at a time.`);
    const bal = await this.balance(communityId, p.memberId, p.itemId);
    if (amount > bal.available) throw new Error(`Not enough ${item.emoji} ${item.name}: ${bal.available} available${bal.pending ? ` (${bal.pending} waiting for approval)` : ''}.`);
    const pending = !p.byStaff && item.claimApproval === 'STAFF';
    const tx = await walletTxRepository.create({ communityId, itemId: item.id, memberId: p.memberId, memberName: p.memberName, kind: 'CLAIM', amount: -amount, status: pending ? 'PENDING' : 'APPROVED', forEvent: (p.forEvent || '').slice(0, 120), by: p.by, decidedBy: pending ? undefined : p.by, decidedAt: pending ? undefined : nowIso(), createdAt: nowIso() } as any);
    const left = bal.available - amount;
    if (pending) await this.postApproval(communityId, item, tx, left);
    else await this.log(communityId, tx, `🎯 <@${p.memberId}> used **${amount}× ${item.emoji} ${item.name}**${tx.forEvent ? ` for *${tx.forEvent}*` : ''}${p.byStaff ? ` (recorded by ${p.by})` : ''}. **${left}** left.`);
    return { tx, item, left, pending };
  },
  async decide(communityId: string, txId: string, approve: boolean, by: string, byId?: string) {
    const tx = await walletTxRepository.getById(txId).catch(() => null);
    if (!tx || tx.communityId !== communityId || tx.kind !== 'CLAIM') throw new Error('Request not found.');
    if (tx.status !== 'PENDING') throw new Error(`Already ${tx.status === 'APPROVED' ? 'approved' : 'handled'}${tx.decidedBy ? ` by ${tx.decidedBy}` : ''}.`);
    const out = await walletTxRepository.update(tx.id, { status: approve ? 'APPROVED' : 'DENIED', decidedBy: by, decidedAt: nowIso() } as any);
    void import('../recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.refreshRecruiter(communityId, tx.memberId)).catch(() => undefined);
    const item = await this.item(communityId, tx.itemId).catch(() => null);
    const bal = await this.balance(communityId, tx.memberId, tx.itemId);
    const guild: any = await guildFor(communityId);
    const member: any = guild ? await guild.members.fetch(tx.memberId).catch(() => null) : null;
    await member?.send({ content: approve ? `✅ Your use of **${-tx.amount}× ${item?.emoji} ${item?.name}** in [**${guild.name || 'the server'}**](https://discord.com/channels/${guild.id || ''}) was approved by ${byId ? `<@${byId}>` : by}. You have **${bal.available}** left.` : `❌ Your request to use **${-tx.amount}× ${item?.emoji} ${item?.name}** in [**${guild.name || 'the server'}**](https://discord.com/channels/${guild.id || ''}) was declined by ${byId ? `<@${byId}>` : by}. Nothing was taken; you still have **${bal.available}**.` }).catch(() => undefined);
    return { tx: out, available: bal.available };
  },
  async cancel(communityId: string, txId: string, memberId: string) {
    const tx = await walletTxRepository.getById(txId).catch(() => null);
    if (!tx || tx.communityId !== communityId || tx.memberId !== memberId || tx.status !== 'PENDING') throw new Error('Nothing to cancel.');
    return walletTxRepository.update(tx.id, { status: 'CANCELLED', decidedBy: 'member', decidedAt: nowIso() } as any);
  },

  async channel(communityId: string, item: RewardItem) {
    const guild: any = await guildFor(communityId);
    let chId = item.logChannelId;
    if (!chId) { const { getToolkit } = await import('../toolkit/toolkitConfig.js'); const t: any = await getToolkit(communityId).catch(() => null); chId = t?.recruitment?.logChannelId; }
    return chId ? guild?.channels.cache.get(chId) : null;
  },
  async log(communityId: string, tx: WalletTx, text: string) {
    void import('../recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.refreshRecruiter(communityId, tx.memberId)).catch(() => undefined);
    const item = await this.item(communityId, tx.itemId).catch(() => null);
    if (!item) return;
    const ch: any = await this.channel(communityId, item);
    await ch?.send?.({ content: `${item.emoji} **${item.name}** · ${text}`.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => undefined);
  },
  async postApproval(communityId: string, item: RewardItem, tx: WalletTx, leftAfter: number) {
    const ch: any = await this.channel(communityId, item);
    if (!ch?.send) return;
    const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle(`${item.emoji} Use request: ${-tx.amount}× ${item.name}`)
      .setDescription(`<@${tx.memberId}> wants to use **${-tx.amount}**${tx.forEvent ? ` for *${tx.forEvent}*` : ''}.\nThey will have **${leftAfter}** left if approved.`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`cm:rw:ok:${tx.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cm:rw:no:${tx.id}`).setLabel('Decline').setStyle(ButtonStyle.Secondary),
    );
    await ch.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }).catch(() => undefined);
  },

  /** The message with "Use" buttons that staff post before an event. */
  panel(item: RewardItem, forEvent: string) {
    const embed = new EmbedBuilder().setColor(0x6366f1).setTitle(`${item.emoji} Use your ${item.name}`)
      .setDescription(`${forEvent ? `For **${forEvent}**.\n` : ''}Press **Use 1** to spend one, **Use more** to pick how many, or **My balance** to check what you have. ${item.claimApproval === 'STAFF' ? 'Staff confirm each use.' : 'It is taken from your balance at once.'}${item.description ? `\n\n${item.description}` : ''}`);
    const ev = encodeURIComponent(forEvent).slice(0, 60);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`cm:rw:use1:${item.id}|${ev}`.slice(0, 100)).setLabel('Use 1').setEmoji('🎯').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cm:rw:usen:${item.id}|${ev}`.slice(0, 100)).setLabel('Use more').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cm:rw:bal:${item.id}`).setLabel('My balance').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row] };
  },

  /** Plain-text balance for Discord replies. */
  async describeBalances(communityId: string, memberId: string) {
    const [items, txs] = await Promise.all([this.items(communityId), this.txs(communityId, { memberId })]);
    const bals = balancesFrom(txs);
    const lines = items.filter((i) => i.active || bals.some((b) => b.itemId === i.id)).map((i) => {
      const b = bals.find((x) => x.itemId === i.id);
      if (!b) return `${i.emoji} **${i.name}:** 0`;
      return `${i.emoji} **${i.name}: ${b.available} available** · earned ${b.earned - b.reversed}${b.adjusted ? ` · adjusted ${b.adjusted > 0 ? '+' : ''}${b.adjusted}` : ''} · used ${b.used}${b.pending ? ` · ${b.pending} waiting` : ''}`;
    });
    return lines;
  },
};
