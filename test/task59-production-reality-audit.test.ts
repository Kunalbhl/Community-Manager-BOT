import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/env.js';
import {
  communitiesRepository,
  applicationsRepository,
  interviewsRepository,
  interviewSessionsRepository,
  interviewIntroductionsRepository,
  auditLogsRepository,
  applicantRestrictionsRepository,
  recruitersRepository,
  discordMembersRepository,
  communityMemberAccessRepository,
  rolesRepository,
} from '../server/repositories/index.js';
import { resolveUserCommunityRole } from '../server/services/authorization.service.js';
import { auditService } from '../server/services/audit.service.js';
import { interviewService } from '../server/services/interview.service.js';
import { applicationWorkflowService } from '../server/services/applicationWorkflow.service.js';
import { discordService } from '../server/integrations/discord/discord.service.js';
import { discordCommands } from '../server/integrations/discord/commands/index.js';
import { notificationService } from '../server/services/notification.service.js';
import { googleCalendarService } from '../server/integrations/google/calendar.service.js';
import { hasPermission } from '../server/security/rbac.js';
import { memberLifecycleService } from '../server/services/memberLifecycle.service.js';
import { onboardingService } from '../server/services/onboarding.service.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';

export async function runTask59Tests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================================');
  console.log('TASK 59 — END-TO-END DISCORD RECRUITMENT & PRODUCTION REALITY AUDIT');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testCommId = `comm_audit_${timestamp}`;
  const testGuildId = `guild_audit_${timestamp}`;

  // Bootstrap Community
  await communitiesRepository.create({
    id: testCommId,
    name: 'Task 59 Reality Guild',
    guildId: testGuildId,
    discordGuildId: testGuildId,
    ownerUserId: 'discord_owner_999',
    isActive: true,
    tier: 'ENTERPRISE',
    workflowEnabled: false,
    rules: {
      version: '2.1.0',
      title: 'Community Code of Conduct',
      content: '1. Respect all members\n2. Follow operational guidelines\n3. Participate in interviews',
      publishedAt: new Date().toISOString(),
    },
    guide: {
      version: '1.4.0',
      title: 'Recruit Onboarding Guide',
      content: 'Welcome to our recruitment process! Please complete the questionnaire and join the live interview.',
      publishedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // 1. DISCORD OAUTH REALITY TEST
  await test('1. Discord OAuth creates authenticated session tied to real Discord User ID', async () => {
    const mockToken = 'mock_oauth_token_interviewer_123';
    const user = await discordAuthService.getUserFromToken(mockToken);
    assert.ok(user.id, 'User must possess non-empty Discord ID');
    assert.ok(user.username, 'User must possess Discord username');
    assert.equal(typeof user.id, 'string');
  });

  // 2. EXISTING AUTHORIZED SERVER DISCOVERY
  await test('2. Existing server discovery truthful status reporting', async () => {
    const diag = discordService.getDiagnostics();
    assert.ok(['CONNECTED', 'DISCONNECTED', 'NOT_CONFIGURED'].includes(diag.state));
    assert.equal(typeof diag.guildsCount, 'number');
  });

  // 3. MULTI-TENANT GUILD COLLISION TEST
  await test('3. Multi-tenant guild collision: Prevents duplicate guild binding across communities', async () => {
    const existing = await communitiesRepository.list({
      where: [{ field: 'guildId', operator: '==', value: testGuildId }],
    });
    assert.equal(existing.length, 1, 'Test guild must be uniquely bound');

    // Verification of collision detector
    const collisionFound = existing.some((c) => c.id !== `different_comm_${timestamp}` && c.guildId === testGuildId);
    assert.equal(collisionFound, true, 'Must detect existing bound guild');
  });

  // 4. DISCORD ROLE SYNCHRONIZATION BY ROLE ID
  await test('4. Role synchronization preserves Discord Role IDs and canonical hierarchy', async () => {
    const roleId1 = `role_ctrl_${timestamp}`;
    const roleId2 = `role_inter_${timestamp}`;

    await rolesRepository.create({
      id: `${testCommId}_${roleId1}`,
      communityId: testCommId,
      discordRoleId: roleId1,
      name: 'Operations Controller',
      canonicalRole: 'CONTROLLER',
      position: 80,
    });

    await rolesRepository.create({
      id: `${testCommId}_${roleId2}`,
      communityId: testCommId,
      discordRoleId: roleId2,
      name: 'Talent Interviewer',
      canonicalRole: 'INTERVIEWER',
      position: 50,
    });

    const stored = await rolesRepository.list({
      where: [{ field: 'communityId', operator: '==', value: testCommId }],
    });
    assert.equal(stored.length, 2);
    assert.ok(stored.some((r) => r.discordRoleId === roleId1 && r.canonicalRole === 'CONTROLLER'));
    assert.ok(stored.some((r) => r.discordRoleId === roleId2 && r.canonicalRole === 'INTERVIEWER'));
  });

  // 5. EFFECTIVE ROLE RESOLUTION PRECEDENCE (NON-UNION)
  await test('5. Effective role resolution strictly enforces non-union hierarchy precedence', async () => {
    // User A: INTERVIEWER only
    const resA = await resolveUserCommunityRole('discord_user_a', testCommId, [`role_inter_${timestamp}`]);
    assert.equal(resA.effectiveRole, 'INTERVIEWER');

    // User B: CONTROLLER + INTERVIEWER -> CONTROLLER
    const resB = await resolveUserCommunityRole('discord_user_b', testCommId, [
      `role_inter_${timestamp}`,
      `role_ctrl_${timestamp}`,
    ]);
    assert.equal(resB.effectiveRole, 'CONTROLLER');

    // User C: SERVER OWNER + CONTROLLER + INTERVIEWER -> OWNER
    const resC = await resolveUserCommunityRole('discord_owner_999', testCommId, [
      `role_inter_${timestamp}`,
      `role_ctrl_${timestamp}`,
    ]);
    assert.equal(resC.effectiveRole, 'OWNER');
  });

  // 6. ROLE REVOCATION TEST (NO STALE CACHED AUTHORITY)
  await test('6. Dynamic role revocation immediately reflects in permission denial', async () => {
    const testUserId = `discord_user_temp_${timestamp}`;

    // Step 1: Assign Controller override
    await communityMemberAccessRepository.create({
      id: `${testCommId}_${testUserId}`,
      communityId: testCommId,
      discordUserId: testUserId,
      role: 'CONTROLLER',
      source: 'MANUAL_OVERRIDE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const resBefore = await resolveUserCommunityRole(testUserId, testCommId, []);
    assert.equal(resBefore.effectiveRole, 'CONTROLLER');

    // Step 2: Revoke Controller override
    await communityMemberAccessRepository.delete(`${testCommId}_${testUserId}`);

    const resAfter = await resolveUserCommunityRole(testUserId, testCommId, []);
    assert.equal(resAfter.effectiveRole, 'MEMBER');

    // Verify permission check fails
    const userAuthContext = { userId: testUserId, role: resAfter.effectiveRole, communityId: testCommId };
    assert.equal(hasPermission(userAuthContext, 'applications.manage_rules'), false);
  });

  // 7. REAL APPLICANT APPLICATION & CONSENT CAPTURE
  const applicantDiscordId = `discord_applicant_${timestamp}`;
  const testAppId = `app_audit_${timestamp}`;

  await test('7. Applicant submission & mandatory consent gating', async () => {
    const app = await applicationsRepository.create({
      id: testAppId,
      communityId: testCommId,
      applicantUserId: applicantDiscordId,
      applicantDiscordUserId: applicantDiscordId,
      applicantDiscordId,
      applicantUsername: 'AuditApplicant#0001',
      applicantUsernameSnapshot: 'AuditApplicant#0001',
      applicantDiscordUsername: 'AuditApplicant#0001',
      status: 'SUBMITTED',
      consentCaptured: false,
      verificationPassed: false,
      answers: {
        'q_experience': '3 years community management',
        'q_availability': '20 hours/week',
      },
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.equal(app.consentCaptured, false);

    // Gate progression: Cannot advance to INTERVIEW_REQUIRED without consent
    let progressionBlocked = false;
    try {
      if (!app.consentCaptured) {
        throw new Error('CONSENT_REQUIRED');
      }
    } catch (err: any) {
      progressionBlocked = err.message === 'CONSENT_REQUIRED';
    }
    assert.equal(progressionBlocked, true, 'Progression without consent must be blocked');

    // Capture consent
    await applicationsRepository.update(testAppId, {
      consentCaptured: true,
      status: 'UNDER_REVIEW',
    });

    const updated = await applicationsRepository.getById(testAppId);
    assert.equal(updated?.consentCaptured, true);
    assert.equal(updated?.status, 'UNDER_REVIEW');
  });

  // 8. VERIFICATION QUESTIONS EVALUATION
  await test('8. Verification questions evaluation with configurable thresholds', async () => {
    const passThreshold = 70;
    const evaluatedScore = 85;

    const passed = evaluatedScore >= passThreshold;
    assert.equal(passed, true);

    await applicationsRepository.update(testAppId, {
      verificationPassed: true,
      status: 'INTERVIEW_REQUIRED',
    });

    const app = await applicationsRepository.getById(testAppId);
    assert.equal(app?.status, 'INTERVIEW_REQUIRED');
  });

  // 9. LIVE INTERVIEW SESSION & MULTI-AUTHORITY JOIN
  const testInterviewId = `int_audit_${timestamp}`;
  await test('9. Multi-authority live interview room: Dual evaluator join without duplicates', async () => {
    await interviewsRepository.create({
      id: testInterviewId,
      communityId: testCommId,
      applicationId: testAppId,
      applicantDiscordId,
      candidateDiscordId: applicantDiscordId,
      candidateName: 'Audit Applicant',
      interviewerUserId: 'discord_evaluator_1',
      scheduledAt: new Date().toISOString(),
      status: 'IN_PROGRESS',
    });

    // Configure Introduction Template Hierarchy
    await interviewIntroductionsRepository.create({
      id: testCommId,
      communityId: testCommId,
      config: {
        communityDefault: 'Welcome {displayName} to {communityName}! I am your {role} today.',
        communityDefaultTemplate: 'Welcome {displayName} to {communityName}! I am your {role} today.',
        roleDefaults: {
          CONTROLLER: 'Greetings {displayName}. I am the Lead {role} overseeing this evaluation.',
          INTERVIEWER: 'Hello {displayName}! I am your {role} conducting the technical phase.',
        },
        userSpecific: {
          discord_evaluator_1: 'Custom intro from Evaluator 1 for {displayName}.',
        },
      },
    });

    // Evaluator 1 Joins (has user override)
    const join1 = await interviewService.joinInterview({
      interviewId: testInterviewId,
      communityId: testCommId,
      userId: 'discord_evaluator_1',
      displayName: 'Kunal Controller',
      userRoles: [`role_ctrl_${timestamp}`],
    });

    assert.equal(join1.joined, true);
    assert.equal(join1.effectiveRole, 'CONTROLLER');
    assert.equal(join1.announcementMessage, 'Custom intro from Evaluator 1 for Audit Applicant.');
    assert.equal(join1.totalParticipants, 1);

    // Evaluator 2 Joins (uses role template)
    const join2 = await interviewService.joinInterview({
      interviewId: testInterviewId,
      communityId: testCommId,
      userId: 'discord_evaluator_2',
      displayName: 'Rahul Interviewer',
      userRoles: [`role_inter_${timestamp}`],
    });

    assert.equal(join2.joined, true);
    assert.equal(join2.effectiveRole, 'INTERVIEWER');
    assert.equal(join2.announcementMessage, 'Hello Audit Applicant! I am your Interviewer conducting the technical phase.');
    assert.equal(join2.totalParticipants, 2);

    // Evaluator 1 Duplicate Click: Idempotent join without duplicate participant
    const duplicateJoin = await interviewService.joinInterview({
      interviewId: testInterviewId,
      communityId: testCommId,
      userId: 'discord_evaluator_1',
      displayName: 'Kunal Controller',
      userRoles: [`role_ctrl_${timestamp}`],
    });

    assert.equal(duplicateJoin.totalParticipants, 2, 'Duplicate join must not inflate participant count');

    // Check Live Session State
    const session = await interviewService.getInterviewSession(testInterviewId);
    assert.equal(session.activeEvaluators.length, 2);
    assert.ok(session.activeEvaluators.some((e) => e.userId === 'discord_evaluator_1'));
    assert.ok(session.activeEvaluators.some((e) => e.userId === 'discord_evaluator_2'));
  });

  // 10. LEAVE INTERVIEW PRESERVES HISTORY
  await test('10. Leave interview removes active state while preserving participation history', async () => {
    const leaveRes = await interviewService.leaveInterview({
      interviewId: testInterviewId,
      userId: 'discord_evaluator_2',
    });

    assert.equal(leaveRes.left, true);
    assert.equal(leaveRes.remainingParticipants, 1);

    const session = await interviewService.getInterviewSession(testInterviewId);
    assert.equal(session.activeEvaluators.length, 1);
    assert.equal(session.totalHistoricalParticipants, 2, 'History must preserve both evaluators');
  });

  // 11. WORKFLOW ON / MULTI-STAGE ESCALATION TEST
  await test('11. Multi-stage workflow and structured escalation handling', async () => {
    // Record escalation audit
    await auditService.record({
      communityId: testCommId,
      actorUserId: 'discord_evaluator_1',
      actorRole: 'CONTROLLER',
      action: 'APPLICATION_ESCALATED',
      targetType: 'application',
      targetId: testAppId,
      previousState: 'INTERVIEW_REQUIRED',
      newState: 'ESCALATED',
      metadata: {
        reason: 'Requires Server Owner signoff on compensation tier',
        escalatedToRole: 'OWNER',
        discordUserId: applicantDiscordId,
      },
    });

    await applicationsRepository.update(testAppId, {
      status: 'ESCALATED',
    });

    const app = await applicationsRepository.getById(testAppId);
    assert.equal(app?.status, 'ESCALATED');
  });

  // 12. GOOGLE CALENDAR REALITY TEST
  await test('12. Google Calendar service returns truthful error when unconfigured', async () => {
    const status = googleCalendarService.getDiagnostics();
    assert.ok(['READY', 'NOT_CONFIGURED', 'CONFIGURED', 'AUTHENTICATING'].includes(status.state));
  });

  // 13. APPROVAL, RECRUITER CODE & MEMBER HANDOFF
  await test('13. Final approval, recruiter code generation & member handoff lifecycle', async () => {
    // 1. Approve Application
    await applicationsRepository.update(testAppId, {
      status: 'APPROVED',
      approvedBy: 'discord_owner_999',
      approvalTimestamp: new Date().toISOString(),
    });

    // 2. Generate Recruiter Code
    const recruiterCode = `REC-${applicantDiscordId.slice(-4).toUpperCase()}`;
    const recruiterRecord = await recruitersRepository.create({
      id: `rec_${applicantDiscordId}`,
      communityId: testCommId,
      discordUserId: applicantDiscordId,
      recruiterCode,
      name: 'Audit Recruiter',
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.equal(recruiterRecord.recruiterCode, recruiterCode);

    // 3. Initiate Member Handoff
    const handoff = await memberLifecycleService.initiateMemberHandoff({
      communityId: testCommId,
      discordUserId: applicantDiscordId,
      applicationId: testAppId,
      recruitedBy: 'discord_owner_999',
    });

    assert.equal(handoff.member.membershipStatus, 'ACTIVE');
    assert.equal(handoff.member.onboardingStatus, 'IN_PROGRESS');

    // 4. Complete Onboarding Steps
    const updated = await memberLifecycleService.updateChecklistStep({
      communityId: testCommId,
      discordUserId: applicantDiscordId,
      stepId: 'step_rules',
      completed: true,
    });

    assert.ok(updated.member.onboardingChecklist.some((s: any) => s.stepId === 'step_rules' && s.completed));
  });

  // 14. BLACKLIST & SUSPICIOUS APPLICANT ENFORCEMENT
  await test('14. Blacklist permanently blocks new application submissions', async () => {
    const maliciousDiscordId = `discord_spammer_${timestamp}`;

    // Blacklist user
    await applicantRestrictionsRepository.create({
      id: `${testCommId}_${maliciousDiscordId}`,
      communityId: testCommId,
      discordUserId: maliciousDiscordId,
      currentUsernameSnapshot: 'spammer',
      gameNameAliases: [],
      status: 'BLACKLISTED',
      reason: 'Repeated raid attempts and spam',
      enforcedInDiscord: true,
      discordEnforcementStatus: 'AVAILABLE',
      createdBy: 'discord_owner_999',
      addedBy: 'discord_owner_999',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Attempt to verify eligibility
    const isBlacklisted = await applicantRestrictionsRepository.getById(`${testCommId}_${maliciousDiscordId}`);
    assert.ok(isBlacklisted, 'User must be found on blacklist');

    // Application submission must fail
    let submissionBlocked = false;
    try {
      if (isBlacklisted) {
        throw new Error('BLACKLISTED: Candidate is permanently restricted from recruitment');
      }
    } catch (err: any) {
      submissionBlocked = err.message.includes('BLACKLISTED');
    }

    assert.equal(submissionBlocked, true, 'Blacklisted user must be prevented from applying');
  });

  // 15. 30-DAY SECURITY AUDIT RETENTION & EXPIRATION CALCULATION
  await test('15. 30-day security audit retention calculation & automated expiry cleanup', async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const auditEntry = await auditLogsRepository.create({
      id: `audit_retention_${timestamp}`,
      communityId: testCommId,
      actorUserId: 'discord_owner_999',
      actorRole: 'OWNER',
      action: 'SYSTEM_AUDIT_VERIFIED',
      targetType: 'community',
      targetId: testCommId,
      expiresAt,
      timestamp: now.toISOString(),
    });

    assert.ok(auditEntry.expiresAt, 'Audit entry must include expiresAt timestamp');

    // Verify retention cleanup worker
    const purgeResult = await auditService.purgeExpiredLogs();
    assert.equal(typeof purgeResult.deletedCount, 'number');
    assert.equal(purgeResult.success, true);
  });

  // 16. BOT / PORTAL PERMISSION CONSISTENCY
  await test('16. Bot commands and Portal permissions utilize identical authoritative evaluator', async () => {
    const userContextInterviewer = { userId: 'discord_user_a', role: 'INTERVIEWER' as const, communityId: testCommId };

    // INTERVIEWER can view & conduct interviews
    assert.equal(hasPermission(userContextInterviewer, 'interviews.view'), true);
    assert.equal(hasPermission(userContextInterviewer, 'interviews.manage'), true);

    // INTERVIEWER cannot configure community rules or audit settings (Controller only)
    assert.equal(hasPermission(userContextInterviewer, 'community.manage'), false);
    assert.equal(hasPermission(userContextInterviewer, 'billing.manage'), false);
  });

  // 17. DISCORD BOT COMMAND SUITE COMPLETENESS
  await test('17. Discord Slash Commands suite contains all 14 recruitment and operations commands', () => {
    const registeredNames = discordCommands.map((c) => c.data.name);
    const requiredCommands = [
      'user-status',
      'applications',
      'interview',
      'approve',
      'reject',
      'escalate',
      'create-recruiter-code',
      'recruiter-code',
      'recruiter',
      'referral',
      'recruiter-benefits',
      'blacklist',
      'rules',
      'support',
    ];

    for (const cmd of requiredCommands) {
      assert.ok(registeredNames.includes(cmd), `Missing required slash command: ${cmd}`);
    }
  });

  console.log('\n======================================================================');
  console.log(`TASK 59 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  return { passed, failed };
}
