/**
 * Two-way links between any two features (event, giveaway, giveaway form, poll, announcement, campaign, reminder, role panel).
 * A link is stored once and shows on both sides.
 */
import { FirestoreRepository } from '../repositories/firestore.repository.js';

export const LINK_KINDS = ['event', 'announcement', 'campaign', 'reminder', 'poll', 'giveaway', 'giveawayForm', 'rolePanel'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export interface LinkDoc { id: string; communityId: string; aType: LinkKind; aId: string; bType: LinkKind; bId: string; createdBy?: string; createdAt: string }
export const featureLinksRepository = new FirestoreRepository<LinkDoc>('featureLinks');

export const isKind = (v: any): v is LinkKind => (LINK_KINDS as readonly string[]).includes(String(v));

async function repoFor(kind: LinkKind): Promise<any> {
  const r: any = await import('../repositories/index.js');
  switch (kind) {
    case 'event': return r.eventsRepository;
    case 'announcement': return r.announcementsRepository;
    case 'campaign': return r.campaignsRepository;
    case 'reminder': return r.remindersRepository;
    case 'poll': return r.pollsRepository;
    case 'giveaway': return (await import('./features/community.service.js')).giveawaysRepository;
    case 'giveawayForm': return (await import('./giveawayForms.service.js').catch(() => ({ giveawayFormsRepository: null }))).giveawayFormsRepository;
    case 'rolePanel': return (await import('./features/community.service.js')).buttonRolePanelsRepository;
  }
}

function describe(kind: LinkKind, it: any) {
  return {
    type: kind, id: it.id,
    title: it.title || it.name || it.question || it.prize || String(it.message || it.content || '').slice(0, 80) || '—',
    status: it.status || (it.ended ? 'ENDED' : it.endsAt ? 'ACTIVE' : ''),
    when: it.startAt || it.scheduledAt || it.triggerAt || it.endsAt || it.closesAt || it.sentAt || it.createdAt,
  };
}

async function load(communityId: string, kind: LinkKind, id: string) {
  const repo = await repoFor(kind);
  const it: any = repo && id ? await repo.getById(id).catch(() => null) : null;
  return it && it.communityId === communityId ? it : null;
}

export const links = {
  /** Everything linked to one item, from either side, with live status. Old event links are included. */
  async list(communityId: string, kind: LinkKind, id: string) {
    const all = await featureLinksRepository.listForTenant(communityId).catch(() => [] as LinkDoc[]);
    const out = new Map<string, any>();
    for (const l of all) {
      const other = l.aType === kind && l.aId === id ? { t: l.bType, i: l.bId } : l.bType === kind && l.bId === id ? { t: l.aType, i: l.aId } : null;
      if (!other) continue;
      const it = await load(communityId, other.t, other.i);
      if (it) out.set(`${other.t}:${other.i}`, { ...describe(other.t, it), linkId: l.id });
    }
    if (kind === 'event') {
      const e = await load(communityId, 'event', id);
      for (const l of ((e as any)?.links || []) as any[]) {
        if (!isKind(l.type) || out.has(`${l.type}:${l.id}`)) continue;
        const it = await load(communityId, l.type, l.id);
        if (it) out.set(`${l.type}:${l.id}`, { ...describe(l.type, it), linkId: '' });
      }
    } else {
      // Items attached to an event the old way (eventId on the item).
      const it: any = await load(communityId, kind, id);
      if (it?.eventId && !out.has(`event:${it.eventId}`)) {
        const e = await load(communityId, 'event', it.eventId);
        if (e) out.set(`event:${it.eventId}`, { ...describe('event', e), linkId: '' });
      }
    }
    return Array.from(out.values()).sort((a, b) => String(a.when).localeCompare(String(b.when)));
  },

  async link(communityId: string, a: { type: LinkKind; id: string }, b: { type: LinkKind; id: string }, by?: string) {
    if (a.type === b.type && a.id === b.id) throw new Error('An item cannot be linked to itself.');
    if (!(await load(communityId, a.type, a.id)) || !(await load(communityId, b.type, b.id))) throw new Error('Item not found.');
    const all = await featureLinksRepository.listForTenant(communityId).catch(() => [] as LinkDoc[]);
    const same = (l: LinkDoc) => (l.aType === a.type && l.aId === a.id && l.bType === b.type && l.bId === b.id) || (l.aType === b.type && l.aId === b.id && l.bType === a.type && l.bId === a.id);
    const dup = all.find(same);
    if (dup) return dup;
    return featureLinksRepository.create({ communityId, aType: a.type, aId: a.id, bType: b.type, bId: b.id, createdBy: by, createdAt: new Date().toISOString() } as any);
  },

  async unlink(communityId: string, linkId: string) {
    const l = await featureLinksRepository.getById(linkId).catch(() => null);
    if (!l || l.communityId !== communityId) throw new Error('Link not found.');
    await featureLinksRepository.delete(linkId);
  },

  /** Items of one kind that can be picked in the "+ Link" menu. */
  async options(communityId: string, kind: LinkKind) {
    const repo = await repoFor(kind);
    if (!repo) return [];
    const list: any[] = await repo.listForTenant(communityId).catch(() => []);
    return list.map((it) => describe(kind, it)).sort((a, b) => String(b.when).localeCompare(String(a.when))).slice(0, 100);
  },
};
