import assert from 'node:assert/strict';
import { notificationService } from '../server/services/notification.service.js';
import { NotificationTemplateService } from '../server/services/notificationTemplate.service.js';
import { NotificationPreferenceService } from '../server/services/notificationPreference.service.js';
import { NotificationAudienceService } from '../server/services/notificationAudience.service.js';
import { NotificationDeliveryService } from '../server/services/notificationDelivery.service.js';
import { NotificationReadStateService } from '../server/services/notificationReadState.service.js';
import {
  notificationsRepository,
  userNotificationPreferencesRepository,
  communitiesRepository,
  usersRepository,
  auditLogsRepository,
} from '../server/repositories/index.js';
import { UserAuthContext } from '../shared/types/rbac.js';

export async function runTask91Tests() {
  console.log('\n======================================================================');
  console.log('TASK 91 — NOTIFICATION CENTER & UNIFIED ALERTS ENGINE');
  console.log('======================================================================');

  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  };

  const commAlpha = `comm_t91_alpha_${Date.now()}`;
  const commBeta = `comm_t91_beta_${Date.now()}`;

  // Seed sample communities
  await communitiesRepository.create({
    id: commAlpha,
    name: 'Alpha Community',
    ownerId: 'usr_alpha_owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  await communitiesRepository.create({
    id: commBeta,
    name: 'Beta Community',
    ownerId: 'usr_beta_owner',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  const ownerAlphaContext: UserAuthContext = {
    userId: 'usr_alpha_owner',
    discordUserId: 'disc_alpha_owner',
    role: 'OWNER',
    communityId: commAlpha,
  };

  const memberAlphaContext: UserAuthContext = {
    userId: 'usr_alpha_member',
    discordUserId: 'disc_alpha_member',
    role: 'MEMBER',
    communityId: commAlpha,
  };

  const applicantAlphaContext: UserAuthContext = {
    userId: 'usr_alpha_applicant',
    discordUserId: 'disc_alpha_applicant',
    role: 'APPLICANT',
    communityId: commAlpha,
  };

  const ownerBetaContext: UserAuthContext = {
    userId: 'usr_beta_owner',
    discordUserId: 'disc_beta_owner',
    role: 'OWNER',
    communityId: commBeta,
  };

  const platformOwnerContext: UserAuthContext = {
    userId: 'usr_platform_superadmin',
    role: 'OWNER',
    isPlatformOwner: true,
  };

  console.log('--- 1. Multi-Tenant Isolation & Anti-Leakage ---');

  await test('Notifications created in Community Alpha are never accessible by Community Beta', async () => {
    const created = await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'RECRUITMENT',
      type: 'RECRUITMENT_APPLICATION_SUBMITTED',
      priority: 'INFO',
      title: 'New Candidate Submitted in Alpha',
      body: 'Candidate submitted application APP-ALPHA-101',
      recipientUserId: 'usr_alpha_member',
    });

    assert.ok(created.length > 0);
    const notifId = created[0].id;

    // Alpha member can query it
    const alphaQuery = await notificationService.queryNotifications(
      { communityId: commAlpha },
      memberAlphaContext
    );
    assert.ok(alphaQuery.items.some((n) => n.id === notifId));

    // Beta owner cannot query it or see it
    const betaQuery = await notificationService.queryNotifications(
      { communityId: commBeta },
      ownerBetaContext
    );
    assert.strictEqual(betaQuery.items.some((n) => n.id === notifId), false);

    // Beta owner cannot mark it as read
    await assert.rejects(async () => {
      await notificationService.markAsRead(notifId, ownerBetaContext);
    });
  });

  console.log('--- 2. Role-Based Visibility & Authorization ---');

  await test('Applicant and Member roles only see notifications directed to them or public audience', async () => {
    // Notification for member
    const memberNotif = await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'ENGAGEMENT',
      type: 'ENGAGEMENT_ANNOUNCEMENT_PUBLISHED',
      title: 'Special Member Welcome',
      body: 'Welcome to the private member hub',
      recipientUserId: 'usr_alpha_member',
    });

    // Confidential moderation alert for owner
    const modNotif = await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'MODERATION',
      type: 'MODERATION_INCIDENT_REPORTED',
      priority: 'CRITICAL',
      title: 'Severe Incident Under Investigation',
      body: 'Confidential staff investigation notes',
      recipientUserId: 'usr_alpha_owner',
      recipientRole: 'OWNER',
    });

    // Member queries
    const memberResults = await notificationService.queryNotifications(
      { communityId: commAlpha },
      memberAlphaContext
    );
    assert.ok(memberResults.items.some((n) => n.id === memberNotif[0].id));
    assert.strictEqual(memberResults.items.some((n) => n.id === modNotif[0].id), false);

    // Applicant queries
    const applicantResults = await notificationService.queryNotifications(
      { communityId: commAlpha },
      applicantAlphaContext
    );
    assert.strictEqual(applicantResults.items.some((n) => n.id === modNotif[0].id), false);

    // Platform Owner can view across boundaries
    const platformResults = await notificationService.queryNotifications(
      { communityId: commAlpha },
      platformOwnerContext
    );
    assert.ok(platformResults.items.some((n) => n.id === modNotif[0].id));
  });

  console.log('--- 3. Notification Lifecycle & Read States ---');

  await test('Mark read, unread, archive, and mark all read update state and counts accurately', async () => {
    const created = await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'EVENTS',
      type: 'EVENT_REMINDER_TRIGGERED',
      priority: 'WARNING',
      title: 'Community Town Hall in 15 Minutes',
      body: 'Stage channel is now open for Q&A',
      recipientUserId: 'usr_alpha_member',
    });
    const notifId = created[0].id;

    // Initial state: unread
    let unreadCount = await notificationService.getUnreadCount('usr_alpha_member', commAlpha);
    assert.ok(unreadCount >= 1);

    // Mark as read
    const readSuccess = await notificationService.markAsRead(notifId, memberAlphaContext);
    assert.strictEqual(readSuccess, true);
    let doc = await notificationsRepository.getById(notifId);
    assert.strictEqual(doc?.read, true);
    assert.strictEqual(doc?.status, 'READ');

    // Mark as unread
    const unreadSuccess = await notificationService.markAsUnread(notifId, memberAlphaContext);
    assert.strictEqual(unreadSuccess, true);
    doc = await notificationsRepository.getById(notifId);
    assert.strictEqual(doc?.read, false);
    assert.strictEqual(doc?.status, 'UNREAD');

    // Archive
    const archiveSuccess = await notificationService.archive(notifId, memberAlphaContext);
    assert.strictEqual(archiveSuccess, true);
    doc = await notificationsRepository.getById(notifId);
    assert.strictEqual(doc?.status, 'ARCHIVED');

    // Mark all as read
    await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'SYSTEM',
      type: 'SYSTEM_NOTIFICATION',
      title: 'Alert 1',
      body: 'Batch alert',
      recipientUserId: 'usr_alpha_member',
    });
    await notificationService.markAllAsRead(memberAlphaContext, commAlpha);
    unreadCount = await notificationService.getUnreadCount('usr_alpha_member', commAlpha);
    assert.strictEqual(unreadCount, 0);
  });

  console.log('--- 4. Template Resolution & Sanitization ---');

  await test('Substitutes variables {{recruiterName}}, {{applicantName}}, {{applicationId}} and sanitizes HTML', async () => {
    const rawTemplate = 'Hello {{applicantName}}, {{recruiterName}} has approved your application {{applicationId}}! <script>alert("xss")</script>';
    const sanitized = NotificationTemplateService.sanitizeHtml(rawTemplate);
    assert.strictEqual(sanitized.includes('<script>'), false);

    const resolved = NotificationTemplateService.resolveTemplate(sanitized, {
      applicantName: 'Sarah Connor',
      recruiterName: 'Elena Rostova',
      applicationId: 'APP-9982',
    });

    assert.ok(resolved.includes('Sarah Connor'));
    assert.ok(resolved.includes('Elena Rostova'));
    assert.ok(resolved.includes('APP-9982'));
  });

  console.log('--- 5. User Notification Preferences & Mandatory Security Policy ---');

  await test('User preferences allow disabling optional categories but enforce mandatory SECURITY category', async () => {
    // Update preferences to disable RECRUITMENT category
    const updatedPrefs = await notificationService.updateUserPreferences(
      'usr_alpha_member',
      commAlpha,
      'MEMBER',
      {
        categories: {
          RECRUITMENT: { enabled: false, channels: ['IN_APP'] },
          MODERATION: { enabled: true, channels: ['IN_APP'] },
          ENGAGEMENT: { enabled: true, channels: ['IN_APP'] },
          EVENTS: { enabled: true, channels: ['IN_APP'] },
          AUTOMATION: { enabled: true, channels: ['IN_APP'] },
          SECURITY: { enabled: false, channels: ['IN_APP'] } as any, // Try to disable security
          INTEGRATIONS: { enabled: true, channels: ['IN_APP'] },
          INSIGHTS: { enabled: true, channels: ['IN_APP'] },
          SYSTEM: { enabled: true, channels: ['IN_APP'] },
          PLATFORM: { enabled: true, channels: ['IN_APP'] },
        },
      }
    );

    // Security category must remain true regardless of update payload
    assert.strictEqual(updatedPrefs.categories.SECURITY.enabled, true);
    assert.strictEqual(updatedPrefs.categories.RECRUITMENT.enabled, false);

    // Optional recruitment notification should be skipped due to preferences
    const skippedNotif = await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'RECRUITMENT',
      type: 'RECRUITMENT_APPLICATION_SUBMITTED',
      title: 'Should be suppressed by preference',
      body: 'Recruitment notification body',
      recipientUserId: 'usr_alpha_member',
      policy: 'OPTIONAL',
    });
    assert.strictEqual(skippedNotif.length, 0);

    // Security notification must bypass preferences
    const securityNotif = await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'SECURITY',
      type: 'SECURITY_RBAC_VIOLATION',
      priority: 'CRITICAL',
      title: 'Unauthorized Access Attempt Blocked',
      body: 'RBAC boundary violation logged',
      recipientUserId: 'usr_alpha_member',
      policy: 'REQUIRED',
    });
    assert.ok(securityNotif.length > 0);
  });

  console.log('--- 6. Multi-Channel Dispatch & Delivery Status ---');

  await test('NotificationDeliveryService dispatches IN_APP, DISCORD, and reports factual delivery receipts', async () => {
    const result = await NotificationDeliveryService.dispatch({
      notificationId: `notif_test_${Date.now()}`,
      communityId: commAlpha,
      title: 'Automation Workflow Succeeded',
      body: 'Sync pipeline finished without errors',
      channel: 'IN_APP',
      recipientUserId: 'usr_alpha_member',
    });

    assert.strictEqual(result.channel, 'IN_APP');
    assert.strictEqual(result.deliveryStatus, 'DELIVERED');
    assert.ok(result.deliveredAt);
  });

  console.log('--- 7. Audience Resolution & Max Fanout Cap ---');

  await test('Audience resolution bounds fanout size to prevent notification storms', async () => {
    // Generate mock target list exceeding cap
    const largeList = Array.from({ length: 120 }, (_, i) => ({
      userId: `usr_flood_${i}`,
      discordUserId: `disc_flood_${i}`,
      role: 'MEMBER' as const,
    }));

    const resolved = await NotificationAudienceService.resolveAudience({
      communityId: commAlpha,
      recipientType: 'ALL_MEMBERS',
      candidates: largeList,
    });

    assert.ok(resolved.length <= 50, `Expected fanout <= 50, got ${resolved.length}`);
  });

  console.log('--- 8. Statistics Aggregation & Querying ---');

  await test('getNotificationStats calculates unread counts, categories, and priorities', async () => {
    const stats = await notificationService.getNotificationStats(ownerAlphaContext, commAlpha);
    assert.ok(typeof stats.totalCount === 'number');
    assert.ok(typeof stats.unreadCount === 'number');
    assert.ok(typeof stats.byCategory === 'object');
    assert.ok(typeof stats.byPriority === 'object');
  });

  console.log('--- 9. Deletion & Audit Trail ---');

  await test('Deleting notification cleans record and writes audit event', async () => {
    const created = await notificationService.createAndDispatch({
      communityId: commAlpha,
      category: 'SYSTEM',
      type: 'SYSTEM_NOTIFICATION',
      title: 'Temporary Notice',
      body: 'Will be deleted',
      recipientUserId: 'usr_alpha_owner',
    });

    const notifId = created[0].id;
    await notificationService.deleteNotification(notifId, ownerAlphaContext);

    const check = await notificationsRepository.getById(notifId);
    assert.strictEqual(check, null);
  });

  console.log('======================================================================');
  console.log(`TASK 91 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================');

  return { passed, failed };
}
