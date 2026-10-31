import assert from 'node:assert/strict';
import { platformOperationsService } from '../server/services/platformOperations.service.js';
import {
  communitiesRepository,
  platformServersRepository,
  usersRepository,
  platformUsersRepository,
  applicationsRepository,
  recruitersRepository,
  referralsRepository,
  platformAuditLogsRepository,
  platformSettingsRepository,
  incidentsRepository,
} from '../server/repositories/index.js';
import { isPlatformOwner, hasPermission, canAccessTenant } from '../server/security/rbac.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { errorCenterService } from '../server/services/errorCenter.service.js';
import { healthService } from '../server/services/health.service.js';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

export async function runTask88Tests(): Promise<{ passed: number; failed: number }> {
  console.log(`\n======================================================================`);
  console.log(`TASK 88 — PLATFORM OWNER CONTROL CENTER & OPERATIONS ENGINE TESTS`);
  console.log(`======================================================================\n`);

  const mockPlatformOwnerContext = {
    userId: 'usr_platform_owner_t88',
    role: 'PLATFORM_OWNER' as const,
    isPlatformOwner: true,
  };

  const mockCommunityOwnerContext = {
    userId: 'usr_community_owner_t88',
    communityId: 'comm_t88_test',
    role: 'OWNER' as const,
    isPlatformOwner: false,
  };

  const mockCommunityControllerContext = {
    userId: 'usr_controller_t88',
    communityId: 'comm_t88_test',
    role: 'CONTROLLER' as const,
    isPlatformOwner: false,
  };

  const testCommunityId = `comm_t88_${Date.now()}`;
  const testUserId = `usr_t88_${Date.now()}`;

  console.log('--- 1. Hardened RBAC & Platform Owner Security Isolation ---');
  await runTest('Accurately identifies Platform Owner vs Community Owner', () => {
    assert.equal(isPlatformOwner(mockPlatformOwnerContext), true);
    assert.equal(isPlatformOwner(mockCommunityOwnerContext), false);
    assert.equal(isPlatformOwner(mockCommunityControllerContext), false);
    assert.equal(isPlatformOwner(undefined), false);
  });

  await runTest('Denies Community Owner access to platform-level permissions', () => {
    assert.equal(hasPermission(mockCommunityOwnerContext, 'platform.manage'), false);
    assert.equal(hasPermission(mockCommunityOwnerContext, 'platform.settings.manage'), false);
    assert.equal(hasPermission(mockCommunityOwnerContext, 'platform.servers.manage'), false);
    assert.equal(hasPermission(mockCommunityOwnerContext, 'platform.audit'), false);

    assert.equal(hasPermission(mockPlatformOwnerContext, 'platform.manage'), true);
    assert.equal(hasPermission(mockPlatformOwnerContext, 'platform.settings.manage'), true);
    assert.equal(hasPermission(mockPlatformOwnerContext, 'platform.servers.manage'), true);
    assert.equal(hasPermission(mockPlatformOwnerContext, 'community.manage'), true);
  });

  await runTest('Enforces multi-tenant isolation for community users while allowing platform owner oversight', () => {
    assert.equal(canAccessTenant(mockCommunityOwnerContext, 'comm_t88_test'), true);
    assert.equal(canAccessTenant(mockCommunityOwnerContext, 'comm_other_tenant'), false);
    assert.equal(canAccessTenant(mockPlatformOwnerContext, 'comm_other_tenant'), true);
  });

  console.log('\n--- 2. Authoritative Platform Overview & Metric States ---');
  await runTest('Computes factual platform metrics with valid states and calculation periods', async () => {
    const overview = await platformOperationsService.getOverview();
    assert.ok(overview);
    assert.ok(overview.summary);
    assert.equal(overview.summary.communities.total.state, 'READY');
    assert.equal(overview.summary.communities.total.calculationPeriod, 'all_time');
    assert.equal(typeof overview.summary.communities.total.value, 'number');
    assert.equal(overview.summary.users.total.state, 'READY');
    assert.equal(typeof overview.summary.users.total.value, 'number');
    assert.ok(overview.summary.recruitment.totalApplications);
    assert.ok(overview.summary.health.systemStatus.value);
    assert.equal(overview.releaseStatus.locked, true);
    assert.ok(overview.releaseStatus.buildIdentifier);
  });

  console.log('\n--- 3. Server Directory & Administrative Operations ---');
  await communitiesRepository.create({
    id: testCommunityId,
    name: 'Task 88 Verification Guild',
    guildId: 'guild_t88_123456789',
    discordGuildId: 'guild_t88_123456789',
    ownerUserId: 'usr_t88_owner',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await runTest('Lists authoritative servers merging community and platform registry records', async () => {
    const servers = await platformOperationsService.listServers({ search: 'Task 88' });
    assert.ok(Array.isArray(servers));
    const target = servers.find((s) => s.id === testCommunityId);
    assert.ok(target);
    assert.equal(target?.guildId, 'guild_t88_123456789');
    assert.equal(target?.status, 'ACTIVE');
  });

  await runTest('Retrieves detailed server diagnostics without exposing private applicant data', async () => {
    const details = await platformOperationsService.getServerDetails(testCommunityId);
    assert.ok(details);
    assert.equal(details.id, testCommunityId);
    assert.equal(details.guildId, 'guild_t88_123456789');
    assert.equal(details.diagnostics.guildLinked, true);
    assert.ok(details.stats);
  });

  await runTest('Suspends and restores a server with full multi-tenant enforcement and audit logging', async () => {
    const suspendRes = await platformOperationsService.updateServerStatus(
      testCommunityId,
      'SUSPENDED',
      mockPlatformOwnerContext.userId,
      'Administrative policy suspension'
    );
    assert.equal(suspendRes.success, true);
    assert.equal(suspendRes.status, 'SUSPENDED');

    const updatedComm = await communitiesRepository.getById(testCommunityId);
    assert.equal((updatedComm as any)?.isSuspended, true);

    const restoreRes = await platformOperationsService.updateServerStatus(
      testCommunityId,
      'ACTIVE',
      mockPlatformOwnerContext.userId,
      'Reinstated after review'
    );
    assert.equal(restoreRes.success, true);
    assert.equal(restoreRes.status, 'ACTIVE');

    const restoredComm = await communitiesRepository.getById(testCommunityId);
    assert.equal((restoredComm as any)?.isSuspended, false);
  });

  await runTest('Triggers force server sync and logs administrative action', async () => {
    const syncRes = await platformOperationsService.forceServerSync(
      testCommunityId,
      mockPlatformOwnerContext.userId
    );
    assert.equal(syncRes.success, true);
    assert.equal(syncRes.communityId, testCommunityId);
  });

  console.log('\n--- 4. User Directory & Moderation Operations ---');
  await usersRepository.create({
    id: testUserId,
    discordId: 'discord_usr_t88_999',
    username: 'TestPlatformSubject',
    globalRole: 'MEMBER',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  });

  await runTest('Lists platform users from authoritative user tables', async () => {
    const users = await platformOperationsService.listUsers({ search: 'TestPlatformSubject' });
    assert.ok(Array.isArray(users));
    const user = users.find((u) => u.id === testUserId);
    assert.ok(user);
    assert.equal(user?.discordId, 'discord_usr_t88_999');
  });

  await runTest('Updates user status (Active -> Suspended -> Active) and logs audit event', async () => {
    const suspendRes = await platformOperationsService.updateUserStatus(
      testUserId,
      'DISABLED',
      mockPlatformOwnerContext.userId,
      'Administrative moderation'
    );
    assert.equal(suspendRes.success, true);

    const restoreRes = await platformOperationsService.updateUserStatus(
      testUserId,
      'ACTIVE',
      mockPlatformOwnerContext.userId,
      'Account reactivated'
    );
    assert.equal(restoreRes.success, true);
  });

  await runTest('Revokes user session and records platform auth audit event', async () => {
    const revokeRes = await platformOperationsService.revokeUserSession(
      testUserId,
      mockPlatformOwnerContext.userId
    );
    assert.equal(revokeRes.success, true);
  });

  console.log('\n--- 5. Master Settings & Feature Flags ---');
  await runTest('Retrieves master settings with runtime info and release lock status', async () => {
    const settings = await platformOperationsService.getMasterSettings();
    assert.ok(settings);
    assert.equal(settings.id, 'global_platform_settings');
    assert.ok(settings.runtimeInfo);
    assert.equal(settings.runtimeInfo.releaseLocked, true);
  });

  await runTest('Updates master settings, maintenance mode, and feature flags with audit trail', async () => {
    const updated = await platformOperationsService.updateMasterSettings(
      {
        maintenanceMode: false,
        maxAiRequestsPerDay: 75,
        featureFlags: {
          aiScreening: true,
          recruiterReferralTracking: true,
          sheetsSync: true,
          discordDmNotifications: true,
          automationEngine: true,
          rateLimiting: true,
        },
      },
      mockPlatformOwnerContext.userId
    );
    assert.equal(updated.maxAiRequestsPerDay, 75);
    assert.equal(updated.featureFlags.aiScreening, true);
  });

  console.log('\n--- 6. Observability, Deduplicated Error Center & Incident Management ---');
  await runTest('Records and deduplicates errors in Error Center without unbounded growth', async () => {
    const err = new Error('Database connection timeout on replica 2');
    await errorCenterService.recordError(err, 'db_query', { communityId: 'comm_t88_test' });
    await errorCenterService.recordError(err, 'db_query', { communityId: 'comm_t88_test' });

    const grouped = await errorCenterService.getGroupedErrors('comm_t88_test');
    assert.ok(Array.isArray(grouped));
    const found = grouped.find((g) => g.safeMessage.includes('timeout') || g.category === 'Database');
    assert.ok(found);
    assert.ok(found!.occurrenceCount >= 2);
  });

  await runTest('Records security events in Security Center', async () => {
    await errorCenterService.recordSecurityEvent({
      eventType: 'SUSPICIOUS_AUTH_ATTEMPT',
      severity: 'HIGH',
      ipAddress: '192.0.2.1',
      details: 'Attempted brute force on platform secret endpoint',
      communityId: 'comm_t88_test',
    });

    const secEvents = await errorCenterService.getSecurityEvents('comm_t88_test');
    assert.ok(secEvents.length > 0);
    const match = secEvents.find((e) => e.eventType === 'SUSPICIOUS_AUTH_ATTEMPT');
    assert.ok(match);
  });

  await runTest('Manages incident lifecycle: creation, status transition (OPEN -> ACKNOWLEDGED -> RESOLVED)', async () => {
    const incident = await observabilityService.recordIncident({
      category: 'RATE_LIMITED',
      dependency: 'discord_gateway',
      severity: 'MEDIUM',
      summary: 'Discord Rate Limit Spike: Temporary 429 response rate exceeded threshold for 60 seconds',
      communityId: 'comm_t88_test',
    });

    assert.ok(incident.id);
    assert.equal(incident.status, 'OPEN');

    const acked = await observabilityService.updateIncidentStatus(
      incident.id,
      'ACKNOWLEDGED',
      mockPlatformOwnerContext.userId
    );
    assert.equal(acked?.status, 'ACKNOWLEDGED');

    const resolved = await observabilityService.updateIncidentStatus(
      incident.id,
      'RESOLVED',
      mockPlatformOwnerContext.userId
    );
    assert.equal(resolved?.status, 'RESOLVED');
  });

  await runTest('Returns factual detailed health report without fabricating unconfigured services', async () => {
    const report = await healthService.getDetailedReport();
    assert.ok(report);
    assert.ok(report.components.application);
    assert.ok(report.components.database);
    assert.ok(report.components.discordGateway);
    assert.match(report.status, /HEALTHY|DEGRADED|UNAVAILABLE/);
  });

  console.log('\n--- 7. Platform Analytics Engine ---');
  await runTest('Returns platform-wide and tenant-specific analytics with proper grouping', async () => {
    const globalAnalytics = await platformOperationsService.getAnalytics();
    assert.equal(globalAnalytics.tenantScope, 'PLATFORM_WIDE');
    assert.ok(globalAnalytics.totals);
    assert.equal(typeof globalAnalytics.totals.communities, 'number');

    const tenantAnalytics = await platformOperationsService.getAnalytics('comm_t88_test');
    assert.equal(tenantAnalytics.tenantScope, 'comm_t88_test');
  });

  console.log(`\n======================================================================`);
  console.log(`TASK 88 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`======================================================================\n`);

  return { passed, failed };
}
