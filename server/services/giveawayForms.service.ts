/** Giveaway web forms: data model (forms, entries, prizes). Logic is added in later steps. */
import { FirestoreRepository } from '../repositories/firestore.repository.js';

export interface FormQuestion { id: string; label: string; type: 'text' | 'longtext' | 'phone' | 'email' | 'choice'; required: boolean; options?: string[]; private?: boolean }
export interface GiveawayForm {
  id: string; communityId: string; slug: string; title: string; description?: string;
  questions: FormQuestion[]; opensAt?: string; closesAt?: string; status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'DRAWN';
  requireGuildMember?: boolean; requiredRoleId?: string; allowDiscord: boolean; allowGoogle: boolean;
  sheetUrl?: string; sheetId?: string; resultChannelId?: string; createdBy?: string; createdAt: string;
}
export interface GiveawayEntry {
  id: string; communityId: string; formId: string; provider: 'discord' | 'google'; userKey: string; discordId?: string;
  name: string; email?: string; answers: Record<string, string>; status: 'VALID' | 'DISQUALIFIED'; won: string[]; createdAt: string;
}
export interface GiveawayPrize { id: string; communityId: string; formId: string; name: string; count: number; allowRepeat: boolean; winners: string[]; drawnAt?: string; drawnBy?: string }

export const giveawayFormsRepository = new FirestoreRepository<GiveawayForm>('giveawayForms');
export const giveawayEntriesRepository = new FirestoreRepository<GiveawayEntry>('giveawayEntries');
export const giveawayPrizesRepository = new FirestoreRepository<GiveawayPrize>('giveawayPrizes');
