import assert from 'node:assert/strict';
const url = process.env.TEST_DATABASE_URL;
if (!url) { console.log('SKIP: TEST_DATABASE_URL not set'); process.exit(0); }
process.env.DATABASE_URL = url;
process.env.DATABASE_SCHEMA = 'cm_rem_' + Date.now();
const { interviewsRepository } = await import('../server/repositories/index.js');
const { reviewReminders } = await import('../server/services/reviewReminders.service.js');
const { postgresStore } = await import('../server/repositories/postgres.store.js');

const in8 = new Date(Date.now() + 8 * 60000).toISOString();
const in45 = new Date(Date.now() + 45 * 60000).toISOString();
const in5h = new Date(Date.now() + 5 * 3600000).toISOString();
await interviewsRepository.create({ id: 'iv10', communityId: 'c', applicationId: 'a', applicantDiscordId: '123456789012345678', interviewerUserId: 'usr_223456789012345678', status: 'SCHEDULED', scheduledAt: in8 } as any);
await interviewsRepository.create({ id: 'iv60', communityId: 'c', applicationId: 'b', applicantDiscordId: '123456789012345679', interviewerUserId: 'usr_223456789012345679', status: 'SCHEDULED', scheduledAt: in45 } as any);
await interviewsRepository.create({ id: 'ivLater', communityId: 'c', applicationId: 'd', applicantDiscordId: '1', interviewerUserId: 'x', status: 'SCHEDULED', scheduledAt: in5h } as any);

await reviewReminders.sendInterviewReminders();
const a: any = await interviewsRepository.getById('iv10');
const b: any = await interviewsRepository.getById('iv60');
const c: any = await interviewsRepository.getById('ivLater');
assert.ok(a.reminder10SentAt, '10-minute reminder marked'); assert.ok(!a.reminder60SentAt);
assert.ok(b.reminder60SentAt, '60-minute reminder marked'); assert.ok(!b.reminder10SentAt);
assert.ok(!c.reminder60SentAt && !c.reminder10SentAt, 'far-future interview untouched');
const first = a.reminder10SentAt;
await reviewReminders.sendInterviewReminders();
assert.equal(((await interviewsRepository.getById('iv10')) as any).reminder10SentAt, first, 'never sent twice');
await postgresStore.close();
console.log('reminders: all checks passed');
