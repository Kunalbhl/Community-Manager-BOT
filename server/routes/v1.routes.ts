import { Router } from 'express';
import { config } from '../config/env.js';
import { searchController } from '../controllers/search.controller.js';
import { DiscordResourcesController } from '../controllers/discordResources.controller.js';
import { getCommunityDiscordSettings, updateCommunityDiscordSettings } from '../controllers/discordSettings.controller.js';
import { getHealth, getLiveness, getReadiness, getExternalDependenciesHealth, getProductionReadiness, verifyFirestoreReadiness } from '../controllers/health.controller.js';
import { authLogin, authCallback, authLogout, getAuthSession, getAuthDiagnostics } from '../controllers/auth.controller.js';
import {
  getUserGuilds,
  getBotInstallUrl,
  connectCommunity,
  getGuildDiagnostics,
  resolveAndSyncGuildHandler,
  getDiscordDeveloperPortalAudit,
  updateAppDirectoryStatusHandler,
  reconcileGuildsHandler,
  getDiscordProductionReadiness,
  getDiscordDiagnostics,
  getOpsDiscordConnection,
} from '../controllers/discordConnect.controller.js';
import {
  runLiveVerification,
  runDiscordReadOnlyCheck,
  getVerificationReport,
  verifyDiscordBotTokenStatus,
  runDiscordCredentialIsolationDiagnostic,
} from '../controllers/opsVerification.controller.js';
import {
  trackTelemetryEvent,
  getOnboardingFunnel,
  getRecoveryGuidance,
} from '../controllers/telemetry.controller.js';
import {
  listMembers,
  getMemberDetail,
  getMember360,
  assignMemberRole,
  removeMemberRole,
  syncSingleMember,
  notifyMember,
  syncMembers,
  assignRecruiterCode,
  exportMembersCsv,
  previewBulkImport,
  confirmBulkImport,
} from '../controllers/members.controller.js';
import {
  getCommunity,
  updateCommunity,
  listCommunities,
  getRecruiterIdentity,
  updateRecruiterIdentity,
  resetRecruiterIdentity,
} from '../controllers/community.controller.js';
import {
  listApplications,
  getApplication,
  submitApplication,
  updateApplicationStatus,
  analyzeApplicationHandler,
  getPublicForm,
  getDraftApplication,
  saveDraftApplication,
  getCandidateInterviews,
  submitAdditionalInfo,
  simulateDiscordJoin,
  verifyDiscordJoin,
} from '../controllers/applications.controller.js';
import {
  listInterviews,
  getInterview,
  scheduleInterviewHandler,
  startInterviewHandler,
  completeInterviewHandler,
  cancelInterviewHandler,
  joinInterviewHandler,
  leaveInterviewHandler,
  getInterviewSessionHandler,
  getInterviewIntroductionsHandler,
  updateInterviewIntroductionsHandler,
} from '../controllers/interview.controller.js';
import {
  listCommunityAuditLogs,
  cleanupExpiredAuditLogsHandler,
} from '../controllers/audit.controller.js';
import { listRecruiters, getRecruiter, getRecruiterMe } from '../controllers/recruiters.controller.js';
import {
  listRecruiterCodes,
  createRecruiterCode,
  revokeRecruiterCode,
  updateRecruiterCodeStatus,
  getPublicActiveRecruiterCodes,
} from '../controllers/recruiterCodes.controller.js';
import {
  getWelcomeConfig,
  updateWelcomeConfig,
  getWelcomeAuditHistory,
  previewWelcomeMessages,
  getSetupStatus,
  getCommunityRules,
  acknowledgeRules,
  getMemberJourneyStatus,
  retryOnboardingOperations,
} from '../controllers/welcome.controller.js';
import { listUsers, getUser, updateUserRole } from '../controllers/users.controller.js';
import {
  getCommunityMemberAccessList,
  createOrUpdateCommunityMemberAccess,
  deleteCommunityMemberAccess,
  getCommunityDiscordRoles,
  getCommunityDiscordChannels,
  updateCommunityRoleMappings,
} from '../controllers/memberAccess.controller.js';
import {
  listNotifications,
  markNotificationRead,
  markNotificationUnread,
  archiveNotification,
  markAllNotificationsRead,
  getNotificationStats,
  getUnreadNotificationCount,
  getNotificationPreferences,
  updateNotificationPreferences,
  dispatchNotification,
  deleteNotification,
} from '../controllers/notifications.controller.js';
import { getReportsSummary, exportReports } from '../controllers/reports.controller.js';
import {
  getSystemSettings,
  updateSettings,
  getConsolidatedSettings,
  updateCommunitySettings,
  getSettingsDiagnostics,
  validateCommunitySettings,
  getPermissionsSettings,
  updatePermissionsSettings,
  getNotificationSettings,
  updateNotificationSettings,
  getSecuritySettings,
  updateSecuritySettings,
  getPlansUsageSettings,
} from '../controllers/settings.controller.js';
import {
  listAllowedChannels,
  addAllowedChannel,
  removeAllowedChannel,
  listRecruiterBenefits,
  configureRecruiterBenefit,
  evaluateRecruiterBenefits,
  deleteRecruiterBenefit,
  listReferralLifecycle,
  confirmMemberJoin,
  getNotificationHistory,
  checkApplicantRisk,
  listRestrictions,
  flagUserRestriction,
  unflagUserRestriction,
  enforceDiscordRestrictionHandler,
  listQuestions,
  createApplicationQuestion,
  deleteApplicationQuestion,
  createInterviewQuestion,
  deleteInterviewQuestion,
  getGoogleSheetsConfig,
  connectGoogleSheet,
  syncGoogleSheet,
  getDiscordCapabilities,
  getDiscordConnectionCenter,
  runDiscordSmokeTest,
  getUnifiedIntegrationStatus,
  configureGoogleFormHandler,
  importGoogleFormSubmissionHandler,
  configureGoogleCalendarHandler,
  scheduleGoogleCalendarEventHandler,
  cancelGoogleCalendarEventHandler,
  getUserCalendarStatusHandler,
  skipUserCalendarSetupHandler,
  connectUserCalendarHandler,
  disconnectUserCalendarHandler,
  getGoogleOAuthAuthorizeUrlHandler,
  handleGoogleOAuthCallbackHandler,
  listUserCalendarsHandler,
  selectUserCalendarHandler,
  rescheduleGoogleCalendarEventHandler,
  triggerCalendarReauthHandler,
} from '../controllers/trustRecruitment.controller.js';
import {
  getPlatformOverview,
  listPlatformServers,
  getPlatformServer,
  updatePlatformServerStatus,
  forcePlatformServerSync,
  listPlatformUsers,
  updatePlatformUserStatus,
  revokePlatformUserSession,
  getPlatformAnalytics,
  listPlatformFeedback,
  createPlatformFeedback,
  updatePlatformFeedback,
  getSystemHealth,
  getPlatformSettings,
  updatePlatformSettings,
  listPlatformAuditLogs,
  getPlatformQuotas,
  listPlatformIncidents,
  updatePlatformIncidentStatus,
  getPlatformErrorCenter,
  getPlatformSecurityCenter,
  getPlatformAiUsage,
} from '../controllers/platform.controller.js';
import { recruiterRecordsController } from '../controllers/recruiterRecords.controller.js';
import { getPublicContact, postPublicContact } from '../controllers/publicContact.controller.js';
import * as Toolkit from '../controllers/toolkit.controller.js';
import * as Features from '../controllers/features.controller.js';
import { getSocialCordStatus, setSocialCordEnabled } from '../controllers/socialcord.controller.js';
import { requirePermission, requirePlatformOwner, requireTenantAccess, requirePermissionOrApplicant } from '../middleware/auth.js';
import { AiCommunityManagerController } from '../controllers/aiCommunityManager.controller.js';
import {
  getEntitlementsStatus,
  updateCommunityPlan,
  resetCommunityUsage,
  getCommunityOverview,
  getAnnouncements,
  createAnnouncement,
  cancelAnnouncement,
  getCampaigns,
  createCampaign,
  getReminders,
  createReminder,
  getPolls,
  createPoll,
  votePoll,
  getMessageTemplates,
  createMessageTemplate,
  getWarnings,
  createWarning,
  getAutomationRegistries,
  getAutomationWorkflows,
  createAutomationWorkflow,
  updateAutomationWorkflow,
  updateWorkflowStatus,
  deleteAutomationWorkflow,
  testAutomationWorkflow,
  getAutomationExecutions,
  getInsightsSummary,
  consultAi,
} from '../controllers/communityManager.controller.js';
import {
  createEvent,
  editEvent,
  duplicateEvent,
  publishEvent,
  unpublishEvent,
  archiveEvent,
  startEvent,
  completeEvent,
  cancelEvent,
  listEvents,
  getEvent,
  registerMember,
  cancelRegistration,
  getRegistrations,
  markAttendance,
  checkIn,
  getEventAnalytics,
  listSchedules,
  createSchedule,
  getSchedule,
  editSchedule,
  pauseSchedule,
  resumeSchedule,
  cancelSchedule,
} from '../controllers/events.controller.js';
import {
  getWarningsHandler,
  createWarningHandler,
  revokeWarningHandler,
  getLogsHandler,
  getBlacklistHandler,
  blacklistMemberHandler,
  unblacklistMemberHandler,
  getRulesHandler,
  createRuleHandler,
  updateRuleHandler,
  publishRulesHandler,
  getAutoModRulesHandler,
  createAutoModRuleHandler,
  updateAutoModRuleStatusHandler,
  getIncidentsHandler,
  createIncidentHandler,
  updateIncidentHandler,
  executeDiscordActionHandler,
  executeBulkDiscordActionHandler,
  getModerationAnalyticsHandler,
  getRestrictionsHandler,
  createRestrictionHandler,
  revokeRestrictionHandler,
  getSecurityAuditHandler,
} from '../controllers/moderation.controller.js';
import { InsightsController } from '../controllers/insights.controller.js';
import * as WorkspaceController from '../controllers/workspace.controller.js';

const router = Router();

// Workspace Routes
router.post('/workspaces', WorkspaceController.createWorkspace);
router.get('/workspaces', WorkspaceController.listUserWorkspaces);
router.get('/workspaces/:id', WorkspaceController.getWorkspace);
router.patch('/workspaces/:id', WorkspaceController.updateWorkspace);
router.post('/workspaces/:id/communities', WorkspaceController.addCommunityToWorkspace);
router.delete('/workspaces/:id/communities/:communityId', WorkspaceController.removeCommunityFromWorkspace);
router.post('/workspaces/:id/invitations', WorkspaceController.inviteMember);
router.post('/workspaces/invitations/:invitationId/accept', WorkspaceController.acceptInvitation);
router.post('/workspaces/:id/invitations/:invitationId/revoke', WorkspaceController.revokeInvitation);
router.patch('/workspaces/:id/members/:targetUserId', WorkspaceController.updateMemberRole);
router.delete('/workspaces/:id/members/:targetUserId', WorkspaceController.removeMember);
router.post('/workspaces/:id/transfer-ownership', WorkspaceController.transferOwnership);
router.post('/workspaces/:id/deletion', WorkspaceController.protectedDeletionWorkflow);

// Public contact page (no login)
router.get('/public/contact', getPublicContact);
router.post('/public/contact', postPublicContact);

// 1. Health checks (public)
router.get('/health', getHealth);
router.get('/health/live', getLiveness);
router.get('/health/ready', getReadiness);
router.get('/health/external', getExternalDependenciesHealth);
router.get('/production-readiness', getProductionReadiness);
router.get('/production-readiness/verify-firestore', verifyFirestoreReadiness);

// 2. Auth routes
router.get('/auth/session', getAuthSession);
router.get('/auth/login', authLogin);
router.post('/auth/login', authLogin);
router.get('/auth/callback', authCallback);
router.post('/auth/logout', authLogout);
router.get('/auth/logout', authLogout);
router.get('/auth/diagnostic', getAuthDiagnostics);
router.get('/auth/diagnostics', getAuthDiagnostics);

// Discord Guild Connection & Diagnostics
router.get('/discord/guilds', DiscordResourcesController.getGuilds);
router.get('/discord/guilds/:guildId/channels', DiscordResourcesController.getGuildChannels);
router.get('/discord/guilds/:guildId/roles', DiscordResourcesController.getGuildRoles);
router.get('/discord/guilds/:guildId/members', DiscordResourcesController.getGuildMembers);
router.get('/discord/communities/:communityId/resources', DiscordResourcesController.getCommunityResources);
router.get('/communities/:communityId/discord/resources', DiscordResourcesController.getCommunityResources);
router.get('/discord/communities/:communityId/channels', DiscordResourcesController.getCommunityChannels);
router.get('/communities/:communityId/discord/channels', DiscordResourcesController.getCommunityChannels);
router.get('/discord/communities/:communityId/roles', DiscordResourcesController.getCommunityRoles);
router.get('/communities/:communityId/discord/roles', DiscordResourcesController.getCommunityRoles);
router.get('/discord/communities/:communityId/members', DiscordResourcesController.getCommunityMembers);
router.get('/communities/:communityId/discord/members', DiscordResourcesController.getCommunityMembers);

// Community Persistent Discord Settings
// SocialCord Notifier add-on (separate bot; this only stores the on/off choice and links).
// Community features: levels, giveaways, button roles, verification, logs, starboard, birthdays, custom commands
const ft = '/communities/:communityId/features';
const view = [requireTenantAccess(), requirePermission('community.view')];
const manage = [requireTenantAccess(), requirePermission('settings.manage')];
router.get(ft, ...view, Features.getFeaturesHandler);
router.put(`${ft}/settings/:section`, ...manage, Features.saveFeatureSectionHandler);
router.get('/communities/:communityId/home-summary', ...view, Features.homeSummaryHandler);
router.get(`${ft}/leaderboard`, ...view, Features.leaderboardHandler);
router.post(`${ft}/levels/xp`, ...manage, Features.setXpHandler);
router.post(`${ft}/verification/panel`, ...manage, Features.postVerifyPanelHandler);
router.get(`${ft}/birthdays`, ...view, Features.listBirthdaysHandler);
router.get(`${ft}/button-roles`, ...view, Features.listPanelsHandler);
router.post(`${ft}/button-roles`, ...manage, Features.savePanelHandler);
router.delete(`${ft}/button-roles/:panelId`, ...manage, Features.deletePanelHandler);
router.get(`${ft}/giveaways`, ...view, Features.listGiveawaysHandler);
router.post(`${ft}/giveaways`, ...manage, Features.startGiveawayHandler);
router.post(`${ft}/giveaways/:giveawayId/end`, ...manage, Features.endGiveawayHandler);
router.post(`${ft}/giveaways/:giveawayId/cancel`, ...manage, Features.cancelGiveawayHandler);

// Server toolkit: tickets, warning policy, role rules, review rooms, bulk tools
const tk = '/communities/:communityId/toolkit';
router.get(tk, requireTenantAccess(), requirePermission('community.view'), Toolkit.getToolkitHandler);
router.put(`${tk}/settings/:section`, requireTenantAccess(), requirePermission('settings.manage'), Toolkit.saveToolkitSectionHandler);
router.post(`${tk}/tickets/panel`, requireTenantAccess(), requirePermission('settings.manage'), Toolkit.postTicketPanelHandler);
router.get(`${tk}/tickets`, requireTenantAccess(), requirePermission('community.view'), Toolkit.listTicketsHandler);
router.post(`${tk}/tickets/:ticketId/close`, requireTenantAccess(), requirePermission('community.manage'), Toolkit.closeTicketHandler);
router.get(`${tk}/warnings`, requireTenantAccess(), requirePermission('community.view'), Toolkit.listWarningsHandler);
router.post(`${tk}/warnings`, requireTenantAccess(), requirePermission('community.manage'), Toolkit.issueWarningHandler);
router.post(`${tk}/warnings/:strikeId/revoke`, requireTenantAccess(), requirePermission('community.manage'), Toolkit.revokeWarningHandler);
router.post(`${tk}/recruitment/draft-quiz`, requireTenantAccess(), requirePermission('settings.manage'), Toolkit.draftQuizHandler);
router.get(`${tk}/recruitment/threshold`, requireTenantAccess(), requirePermission('community.view'), Toolkit.screeningThresholdHandler);
router.post(`${tk}/recruitment/panel`, requireTenantAccess(), requirePermission('settings.manage'), Toolkit.postApplyPanelHandler);
router.get('/communities/:communityId/discord/member-search', requireTenantAccess(), requirePermission('community.view'), Toolkit.searchMembersHandler);
router.get(`${tk}/review-rooms`, requireTenantAccess(), requirePermission('applications.view'), Toolkit.listReviewRoomsHandler);
router.post(`${tk}/bulk/preview`, requireTenantAccess(), requirePermission('community.manage'), Toolkit.bulkPreviewHandler);
router.post(`${tk}/bulk`, requireTenantAccess(), requirePermission('community.manage'), Toolkit.bulkStartHandler);
router.get(`${tk}/bulk`, requireTenantAccess(), requirePermission('community.manage'), Toolkit.bulkListHandler);
router.post(`${tk}/bulk/:jobId/cancel`, requireTenantAccess(), requirePermission('community.manage'), Toolkit.bulkCancelHandler);
router.get('/communities/:communityId/integrations/socialcord', requireTenantAccess(), getSocialCordStatus);
router.put('/communities/:communityId/integrations/socialcord', requireTenantAccess(), requirePermission('settings.manage'), setSocialCordEnabled);
router.get('/communities/:communityId/discord-settings', getCommunityDiscordSettings);
router.put('/communities/:communityId/discord-settings', updateCommunityDiscordSettings);
router.patch('/communities/:communityId/discord-settings', updateCommunityDiscordSettings);
router.get('/communities/:communityId/settings/discord', getCommunityDiscordSettings);
router.put('/communities/:communityId/settings/discord', updateCommunityDiscordSettings);
router.patch('/communities/:communityId/settings/discord', updateCommunityDiscordSettings);
router.get('/discord/guilds/list', getUserGuilds);
router.get('/discord/user-guilds', getUserGuilds);
router.get('/discord/bot-install-url', getBotInstallUrl);
router.post('/discord/connect-community', connectCommunity);
router.post('/discord/resolve-link', resolveAndSyncGuildHandler);
router.get('/discord/diagnostics/:guildId', getGuildDiagnostics);
router.get('/discord/developer-portal-audit', getDiscordDeveloperPortalAudit);
router.post('/discord/app-directory-status', updateAppDirectoryStatusHandler);
router.post('/discord/reconcile-guilds', reconcileGuildsHandler);
router.get('/discord/production-readiness', requirePermission('community.manage'), getDiscordProductionReadiness);
router.get('/ops/discord/connection', getOpsDiscordConnection);

// Production Onboarding Telemetry & Error Recovery
router.post('/telemetry/event', trackTelemetryEvent);
router.get('/telemetry/onboarding-funnel', getOnboardingFunnel);
router.get('/telemetry/recovery-guidance/:errorStatus', getRecoveryGuidance);

// Member Management & Synchronization (STATIC endpoints BEFORE :discordUserId)
router.get('/community/members', listMembers);
router.post('/community/members/sync', syncMembers);
router.get('/community/members/export', exportMembersCsv);
router.post('/community/members/import-preview', previewBulkImport);
router.post('/community/members/import-confirm', confirmBulkImport);
router.get('/community/members/:discordUserId', getMemberDetail);
router.get('/community/members/:discordUserId/360', getMember360);
router.post('/community/members/:discordUserId/assign-code', assignRecruiterCode);
router.post('/community/members/:discordUserId/roles', requirePermission('users.manage'), assignMemberRole);
router.delete('/community/members/:discordUserId/roles/:roleId', requirePermission('users.manage'), removeMemberRole);
router.post('/community/members/:discordUserId/sync', syncSingleMember);
router.post('/community/members/:discordUserId/notify', notifyMember);

// ==========================================
// PLATFORM ADMINISTRATION ROUTES (TASK 1.5 & TASK 88)
// Protected strictly by requirePlatformOwner
// ==========================================
router.get('/platform/overview', requirePlatformOwner, getPlatformOverview);
router.get('/platform/servers', requirePlatformOwner, listPlatformServers);
router.get('/platform/servers/:id', requirePlatformOwner, getPlatformServer);
router.patch('/platform/servers/:id/status', requirePlatformOwner, updatePlatformServerStatus);
router.post('/platform/servers/:id/sync', requirePlatformOwner, forcePlatformServerSync);
router.get('/platform/users', requirePlatformOwner, listPlatformUsers);
router.patch('/platform/users/:id/status', requirePlatformOwner, updatePlatformUserStatus);
router.post('/platform/users/:id/revoke-session', requirePlatformOwner, revokePlatformUserSession);
router.get('/platform/analytics', requirePlatformOwner, getPlatformAnalytics);
router.get('/platform/feedback', requirePlatformOwner, listPlatformFeedback);
router.post('/platform/feedback', createPlatformFeedback); // Open to all users/owners to submit feedback
router.patch('/platform/feedback/:id', requirePlatformOwner, updatePlatformFeedback);
router.get('/platform/health', requirePlatformOwner, getSystemHealth);
router.get('/platform/incidents', requirePlatformOwner, listPlatformIncidents);
router.patch('/platform/incidents/:id', requirePlatformOwner, updatePlatformIncidentStatus);
router.get('/platform/settings', requirePlatformOwner, getPlatformSettings);
router.patch('/platform/settings', requirePlatformOwner, updatePlatformSettings);
router.get('/platform/audit', requirePlatformOwner, listPlatformAuditLogs);
router.get('/platform/quotas', requirePlatformOwner, getPlatformQuotas);
router.get('/platform/errors', requirePlatformOwner, getPlatformErrorCenter);
router.get('/platform/security', requirePlatformOwner, getPlatformSecurityCenter);
router.get('/platform/ai/usage', requirePlatformOwner, getPlatformAiUsage);
router.get('/platform/search', requirePlatformOwner, (req, res, next) => searchController.platformSearch(req, res, next));

// Global Search & Universal Command Center (Task 89)
router.get('/search', (req, res, next) => searchController.search(req, res, next));
router.post('/search/command', (req, res, next) => searchController.executeCommand(req, res, next));

import {
  getOnboardingStatus,
  startOnboarding,
  getUserGuilds as getOnboardingUserGuilds,
  selectAndVerifyServer,
  runInitialSync,
  configureCommunity,
  completeOnboarding,
  switchServer,
  getOnboardingChecklist,
  recordFirstValueAction,
} from '../controllers/onboarding.controller.js';

// ==========================================
// COMMUNITY-SCOPED ROUTES (MULTI-TENANT)
// ==========================================

// Onboarding Routes
router.get('/onboarding/status', getOnboardingStatus);
router.get('/onboarding/checklist', getOnboardingChecklist);
router.post('/onboarding/first-value', recordFirstValueAction);
router.post('/onboarding/start', startOnboarding);
router.get('/onboarding/user-guilds', getOnboardingUserGuilds);
router.post('/onboarding/verify-server', selectAndVerifyServer);
router.post('/onboarding/sync', runInitialSync);
router.post('/onboarding/configure', configureCommunity);
router.post('/onboarding/complete', completeOnboarding);
router.post('/onboarding/switch-server', switchServer);

// 3. Community routes - Specific/Static endpoints FIRST
router.get('/community', listCommunities);
router.get('/community/welcome-config', getWelcomeConfig);
router.put('/community/welcome-config', updateWelcomeConfig);
router.patch('/community/welcome-config', updateWelcomeConfig);
router.get('/community/welcome-audits', getWelcomeAuditHistory);
router.post('/community/welcome-preview', previewWelcomeMessages);
router.get('/community/setup-status', getSetupStatus);
router.get('/community/rules', getCommunityRules);
router.post('/community/rules/acknowledge', acknowledgeRules);
router.get('/community/member-journey-status', getMemberJourneyStatus);
router.post('/community/welcome-config/retry', retryOnboardingOperations);
router.get('/community/channels', listAllowedChannels);
router.post('/community/channels', addAllowedChannel);
router.delete('/community/channels/:id', removeAllowedChannel);
router.get('/community/questions', listQuestions);
router.post('/community/application-questions', createApplicationQuestion);
router.delete('/community/application-questions/:id', deleteApplicationQuestion);
router.post('/community/interview-questions', createInterviewQuestion);
router.delete('/community/interview-questions/:id', deleteInterviewQuestion);

// Community parameterized endpoints
router.get('/community/:id', getCommunity);
router.patch('/community/:id', requirePermission('community.manage'), updateCommunity);
router.get('/community/:id/recruiter-identity', getRecruiterIdentity);
router.patch('/community/:id/recruiter-identity', updateRecruiterIdentity);
router.post('/community/:id/recruiter-identity/reset', resetRecruiterIdentity);

// 4. Application routes
router.get('/applications', requirePermissionOrApplicant('applications.view'), listApplications);
router.get('/applications/:id', requirePermissionOrApplicant('applications.view'), getApplication);
router.post('/applications', submitApplication);
router.patch('/applications/:id/status', requirePermission('applications.review'), updateApplicationStatus);
router.post('/applications/:id/analyze', requirePermission('applications.review'), analyzeApplicationHandler);

// 4.0. Candidate Portal routes
router.get('/applications/forms/public/:communityId', getPublicForm);
router.get('/applications/drafts/find', getDraftApplication);
router.post('/applications/drafts/save', saveDraftApplication);
router.get('/applications/:id/interviews', getCandidateInterviews);
router.post('/applications/:id/additional-info', submitAdditionalInfo);
if (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION') {
  router.post('/applications/:id/simulate-join', simulateDiscordJoin);
} else {
  router.post('/applications/:id/simulate-join', (req, res) => {
    res.status(403).json({
      error: 'FORBIDDEN: Simulation endpoints are disabled in production runtime modes.',
      code: 'SIMULATION_DISABLED',
    });
  });
}
router.post('/applications/:id/verify-join', verifyDiscordJoin);

// 4.1. Interview routes
router.get('/interviews', requirePermission('interviews.view'), listInterviews);
router.get('/interviews/:id', requirePermission('interviews.view'), getInterview);
router.post('/interviews', requirePermission('interviews.manage'), scheduleInterviewHandler);
router.patch('/interviews/:id/start', requirePermission('interviews.manage'), startInterviewHandler);
router.patch('/interviews/:id/complete', requirePermission('interviews.manage'), completeInterviewHandler);
router.patch('/interviews/:id/cancel', requirePermission('interviews.manage'), cancelInterviewHandler);
router.post('/interviews/:id/join', joinInterviewHandler);
router.post('/interviews/:id/leave', leaveInterviewHandler);
router.get('/interviews/:id/session', getInterviewSessionHandler);

// Interview Introduction Config & Community Audit routes
router.get('/community/interview-introductions', getInterviewIntroductionsHandler);
router.put('/community/interview-introductions', updateInterviewIntroductionsHandler);
router.get('/communities/:communityId/interview-introductions', getInterviewIntroductionsHandler);
router.put('/communities/:communityId/interview-introductions', updateInterviewIntroductionsHandler);
router.get('/community/audit-logs', listCommunityAuditLogs);
router.post('/community/audit-logs/cleanup', cleanupExpiredAuditLogsHandler);
router.get('/communities/:communityId/audit-logs', listCommunityAuditLogs);
router.post('/communities/:communityId/audit-logs/cleanup', cleanupExpiredAuditLogsHandler);

// 5. Recruiter routes
router.get('/recruiters/me', getRecruiterMe);
router.get('/recruiters', requirePermission('recruiters.view'), listRecruiters);
router.get('/recruiters/:id', requirePermission('recruiters.view'), getRecruiter);

// 6. Recruiter Codes routes
router.get('/recruiter-codes', requirePermission('recruiterCodes.view'), listRecruiterCodes);
router.get('/recruitment/public-codes', getPublicActiveRecruiterCodes);
router.get('/recruitment/:communityId/public-codes', getPublicActiveRecruiterCodes);
router.post('/recruiter-codes', requirePermission('recruiterCodes.create'), createRecruiterCode);
router.patch('/recruiter-codes/:id/status', requirePermission('recruiterCodes.revoke'), updateRecruiterCodeStatus);
router.delete('/recruiter-codes/:id', requirePermission('recruiterCodes.revoke'), revokeRecruiterCode);

// 7. Users & Permissions routes
router.get('/users', requirePermission('users.view'), listUsers);
router.get('/users/:id', requirePermission('users.view'), getUser);
router.patch('/users/:id/role', requirePermission('users.manage'), updateUserRole);

// Permissions & Member Access Override
router.get('/community/:id/member-access', requirePermission('community.manage'), getCommunityMemberAccessList);
router.post('/community/:id/member-access', requirePermission('community.manage'), createOrUpdateCommunityMemberAccess);
router.delete('/community/:id/member-access/:discordUserId', requirePermission('community.manage'), deleteCommunityMemberAccess);
router.get('/community/:id/discord-roles', requirePermission('community.manage'), getCommunityDiscordRoles);
router.get('/community/:id/discord-channels', requirePermission('community.manage'), getCommunityDiscordChannels);
router.post('/community/:id/discord-role-mappings', requirePermission('community.manage'), updateCommunityRoleMappings);

// 8. Notifications routes (Task 91 Unified Alerts & Notification Engine)
router.get('/notifications', requirePermission('notifications.view'), listNotifications);
router.get('/notifications/stats', requirePermission('notifications.view'), getNotificationStats);
router.get('/notifications/unread-count', getUnreadNotificationCount);
router.get('/notifications/preferences', requirePermission('notifications.view'), getNotificationPreferences);
router.put('/notifications/preferences', requirePermission('notifications.view'), updateNotificationPreferences);
router.patch('/notifications/preferences', requirePermission('notifications.view'), updateNotificationPreferences);
router.post('/notifications/mark-all-read', requirePermission('notifications.view'), markAllNotificationsRead);
router.post('/notifications/dispatch', requirePermission('notifications.view'), dispatchNotification);
router.patch('/notifications/:id/read', markNotificationRead);
router.patch('/notifications/:id/unread', markNotificationUnread);
router.patch('/notifications/:id/archive', archiveNotification);
router.delete('/notifications/:id', requirePermission('notifications.view'), deleteNotification);

// 9. Reports routes
router.get('/reports', requirePermission('reports.view'), getReportsSummary);
router.post('/reports/export', requirePermission('reports.export'), exportReports);

// 10. System Settings routes
router.get('/settings', requirePermission('settings.view'), getSystemSettings);
router.patch('/settings', requirePermission('settings.manage'), updateSettings);

// Canonical Community Settings & Configuration Control Plane (Task 87)
router.get('/communities/:communityId/settings', requireTenantAccess('communityId'), requirePermission('settings.view'), getConsolidatedSettings);
router.patch('/communities/:communityId/settings', requireTenantAccess('communityId'), requirePermission('settings.manage'), updateCommunitySettings);
router.get('/communities/:communityId/settings/diagnostics', requireTenantAccess('communityId'), requirePermission('settings.view'), getSettingsDiagnostics);
router.post('/communities/:communityId/settings/validate', requireTenantAccess('communityId'), requirePermission('settings.view'), validateCommunitySettings);
router.get('/communities/:communityId/settings/permissions', requireTenantAccess('communityId'), requirePermission('settings.view'), getPermissionsSettings);
router.patch('/communities/:communityId/settings/permissions', requireTenantAccess('communityId'), requirePermission('settings.manage'), updatePermissionsSettings);
router.get('/communities/:communityId/settings/notifications', requireTenantAccess('communityId'), requirePermission('settings.view'), getNotificationSettings);
router.patch('/communities/:communityId/settings/notifications', requireTenantAccess('communityId'), requirePermission('settings.manage'), updateNotificationSettings);
router.get('/communities/:communityId/settings/security', requireTenantAccess('communityId'), requirePermission('settings.view'), getSecuritySettings);
router.patch('/communities/:communityId/settings/security', requireTenantAccess('communityId'), requirePermission('settings.manage'), updateSecuritySettings);
router.get('/communities/:communityId/settings/plans-usage', requireTenantAccess('communityId'), requirePermission('settings.view'), getPlansUsageSettings);

// Aliases for /settings/community/:communityId
router.get('/settings/community/:communityId', requireTenantAccess('communityId'), requirePermission('settings.view'), getConsolidatedSettings);
router.patch('/settings/community/:communityId', requireTenantAccess('communityId'), requirePermission('settings.manage'), updateCommunitySettings);

// ==========================================
// TASK 1.7 ROUTES — TRUST, CHANNELS, BENEFITS, BLACKLIST & SHEETS
// ==========================================

// 12. Recruiter Benefits
router.get('/recruiter-benefits', listRecruiterBenefits);
router.post('/recruiter-benefits', configureRecruiterBenefit);
router.get('/recruiter-benefits/evaluate', evaluateRecruiterBenefits);
router.delete('/recruiter-benefits/:id', deleteRecruiterBenefit);

// 13. Referral Lifecycle & Confirmation
router.get('/referrals/lifecycle', listReferralLifecycle);
router.post('/referrals/confirm-join', confirmMemberJoin);
router.get('/referrals/notifications/history', getNotificationHistory);

// 14. Applicant Restrictions & Risk Evaluation
router.post('/restrictions/check-risk', checkApplicantRisk);
router.get('/restrictions', listRestrictions);
router.post('/restrictions', flagUserRestriction);
router.post('/restrictions/:id/unflag', unflagUserRestriction);
router.post('/restrictions/:id/enforce', enforceDiscordRestrictionHandler);

// 16. Google Sheets Integration
router.get('/integrations/google-sheets', getGoogleSheetsConfig);
router.post('/integrations/google-sheets', connectGoogleSheet);
router.post('/integrations/google-sheets/sync', syncGoogleSheet);

// 17. Discord Capability & Permissions Matrix
router.get('/discord/capabilities', getDiscordCapabilities);
router.get('/discord/connection-center', getDiscordConnectionCenter);
router.get('/integrations/discord/connection-center', getDiscordConnectionCenter);
router.get('/discord/diagnostics', getDiscordDiagnostics);
router.get('/integrations/discord/diagnostics', getDiscordDiagnostics);
router.post('/discord/smoke-test', runDiscordSmokeTest);

import {
  configureIntegrationHandler,
  verifyIntegrationHandler,
  getIntegrationRegistryHandler,
  getCanonicalIntegrationsHandler,
  getCanonicalIntegrationHandler,
  connectCanonicalIntegrationHandler,
  disconnectCanonicalIntegrationHandler,
  testCanonicalIntegrationHandler,
  syncCanonicalIntegrationHandler,
  getCanonicalSyncHistoryHandler,
  getOverallIntegrationsHealthHandler,
} from '../controllers/integrationCenter.controller.js';

// 18. Unified Integration Center & Canonical Connectivity Engine (Task 86)
router.get('/integrations/unified-status', getUnifiedIntegrationStatus);
router.get('/integrations/registry', getIntegrationRegistryHandler);
router.get('/integrations/canonical', getCanonicalIntegrationsHandler);
router.get('/integrations/canonical/:key', getCanonicalIntegrationHandler);
router.post('/integrations/canonical/:key/connect', requirePermission('settings.manage'), connectCanonicalIntegrationHandler);
router.post('/integrations/canonical/:key/disconnect', requirePermission('settings.manage'), disconnectCanonicalIntegrationHandler);
router.post('/integrations/canonical/:key/test', requirePermission('settings.manage'), testCanonicalIntegrationHandler);
router.post('/integrations/canonical/:key/sync', requirePermission('settings.manage'), syncCanonicalIntegrationHandler);
router.get('/integrations/canonical/:key/sync-history', requirePermission('settings.manage'), getCanonicalSyncHistoryHandler);
router.get('/integrations/health', getOverallIntegrationsHealthHandler);

router.post('/integrations/configure', requirePermission('settings.manage'), configureIntegrationHandler);
router.post('/integrations/verify', requirePermission('settings.manage'), verifyIntegrationHandler);
router.post('/integrations/google-forms/config', requirePermission('settings.manage'), configureGoogleFormHandler);
router.post('/integrations/google-forms/import', importGoogleFormSubmissionHandler);
router.post('/integrations/google-calendar/config', requirePermission('settings.manage'), configureGoogleCalendarHandler);
router.post('/integrations/google-calendar/schedule', requirePermission('interviews.manage'), scheduleGoogleCalendarEventHandler);
router.post('/integrations/google-calendar/cancel', requirePermission('interviews.manage'), cancelGoogleCalendarEventHandler);

// Task 61 & 62 User-Scoped Google Calendar Setup & Runtime Management
router.get('/calendar/setup-status', getUserCalendarStatusHandler);
router.post('/calendar/skip', skipUserCalendarSetupHandler);
router.post('/calendar/connect', connectUserCalendarHandler);
router.post('/calendar/disconnect', disconnectUserCalendarHandler);
router.get('/calendar/oauth/authorize', getGoogleOAuthAuthorizeUrlHandler);
router.get('/calendar/oauth/callback', handleGoogleOAuthCallbackHandler);
router.get('/calendar/calendars', listUserCalendarsHandler);
router.post('/calendar/select-calendar', selectUserCalendarHandler);
router.post('/calendar/reschedule', rescheduleGoogleCalendarEventHandler);
router.post('/calendar/trigger-reauth', triggerCalendarReauthHandler);

// ==========================================
// TASK 9 ROUTES — RECRUITER RECORD, BENEFIT CLAIMS & REPORTS
// ==========================================
router.get('/community/recruiter-record-config', (req, res, next) => recruiterRecordsController.getConfig(req, res).catch(next));
router.put('/community/recruiter-record-config', requirePermission('settings.manage'), (req, res, next) => recruiterRecordsController.updateConfig(req, res).catch(next));
router.post('/community/recruiter-record-config/test-message', (req, res, next) => recruiterRecordsController.testMessage(req, res).catch(next));
router.get('/community/recruiter-record-report', requirePermission('reports.view'), (req, res, next) => recruiterRecordsController.getCommunityReport(req, res).catch(next));
router.get('/community/recruiter-code-report', requirePermission('reports.view'), (req, res, next) => recruiterRecordsController.getCodeReport(req, res).catch(next));
router.post('/community/recruiter-records/sync-sheets', requirePermission('settings.manage'), (req, res, next) => recruiterRecordsController.syncSheets(req, res).catch(next));

// Recruiter Records API (STATIC routes FIRST before parameterized /:id)
router.get('/recruiter-records/reports', requirePermission('reports.view'), (req, res, next) => recruiterRecordsController.getReports(req, res).catch(next));
router.get('/recruiter-records/benefits/pending', requirePermission('rewards.view'), (req, res, next) => recruiterRecordsController.getPendingBenefits(req, res).catch(next));
router.get('/recruiter-records/recruiter/:recruiterDiscordUserId', requirePermission('recruiters.view'), (req, res, next) => recruiterRecordsController.getByRecruiter(req, res).catch(next));
router.get('/recruiter-records/code/:recruiterCode', requirePermission('recruiterCodes.view'), (req, res, next) => recruiterRecordsController.getByCode(req, res).catch(next));
router.get('/recruiter-records', requirePermission('recruiters.view'), (req, res, next) => recruiterRecordsController.listRecords(req, res).catch(next));
router.get('/recruiter-records/:id', requirePermission('recruiters.view'), (req, res, next) => recruiterRecordsController.getById(req, res).catch(next));
router.post('/recruiter-records/:id/claim-benefit', requirePermission('rewards.manage'), (req, res, next) => recruiterRecordsController.claimBenefit(req, res).catch(next));
router.post('/recruiter-records/:id/fulfill-benefit', requirePermission('rewards.manage'), (req, res, next) => recruiterRecordsController.fulfillBenefit(req, res).catch(next));
router.post('/recruiter-records/:id/retry-message', requirePermission('settings.manage'), (req, res, next) => recruiterRecordsController.retryMessage(req, res).catch(next));

// ==========================================
// TASK 14 — COMMUNITY MANAGER MODULAR ROUTES
// ==========================================

// Entitlements status & plan management
router.get('/entitlements/status', getEntitlementsStatus);
router.get('/plan', getEntitlementsStatus);
router.post('/plan', requirePermission('settings.manage'), updateCommunityPlan);
router.post('/usage/reset', requirePermission('settings.manage'), resetCommunityUsage);

// Truthful Community Overview Dashboard
router.get('/community/overview', getCommunityOverview);
router.get('/community/overview-dashboard', getCommunityOverview);
router.get('/community/:id/overview', getCommunityOverview);
router.get('/community/:id/overview-dashboard', getCommunityOverview);

// Engagement module
router.get('/engagement/announcements', requirePermission('community.view'), getAnnouncements);
router.post('/engagement/announcements', requirePermission('community.manage'), createAnnouncement);
router.post('/engagement/announcements/:id/cancel', requirePermission('community.manage'), cancelAnnouncement);

router.get('/engagement/campaigns', requirePermission('community.view'), getCampaigns);
router.post('/engagement/campaigns', requirePermission('community.manage'), createCampaign);

router.get('/engagement/reminders', requirePermission('community.view'), getReminders);
router.post('/engagement/reminders', requirePermission('community.manage'), createReminder);

router.get('/engagement/polls', requirePermission('community.view'), getPolls);
router.post('/engagement/polls', requirePermission('community.manage'), createPoll);
router.post('/engagement/polls/:id/vote', votePoll);

router.get('/engagement/templates', requirePermission('community.view'), getMessageTemplates);
router.post('/engagement/templates', requirePermission('community.manage'), createMessageTemplate);

// Moderation module
router.get('/moderation/warnings', requirePermission('community.view'), getWarningsHandler);
router.post('/moderation/warnings', requirePermission('community.manage'), createWarningHandler);
router.post('/moderation/warnings/:id/revoke', requirePermission('community.manage'), revokeWarningHandler);
router.get('/moderation/logs', requirePermission('community.view'), getLogsHandler);
router.get('/moderation/blacklist', requirePermission('community.view'), getBlacklistHandler);
router.post('/moderation/blacklist', requirePermission('community.manage'), blacklistMemberHandler);
router.delete('/moderation/blacklist/:discordUserId', requirePermission('community.manage'), unblacklistMemberHandler);
router.get('/moderation/rules', requirePermission('community.view'), getRulesHandler);
router.post('/moderation/rules', requirePermission('community.manage'), createRuleHandler);
router.patch('/moderation/rules/:id', requirePermission('community.manage'), updateRuleHandler);
router.post('/moderation/rules/publish', requirePermission('community.manage'), publishRulesHandler);
router.get('/moderation/automod', requirePermission('community.view'), getAutoModRulesHandler);
router.post('/moderation/automod', requirePermission('community.manage'), createAutoModRuleHandler);
router.patch('/moderation/automod/:id/status', requirePermission('community.manage'), updateAutoModRuleStatusHandler);
router.get('/moderation/incidents', requirePermission('community.view'), getIncidentsHandler);
router.post('/moderation/incidents', requirePermission('community.manage'), createIncidentHandler);
router.patch('/moderation/incidents/:id', requirePermission('community.manage'), updateIncidentHandler);
router.post('/moderation/execute', requirePermission('community.manage'), executeDiscordActionHandler);
router.post('/moderation/execute-bulk', requirePermission('community.manage'), executeBulkDiscordActionHandler);
router.get('/moderation/analytics', requirePermission('community.view'), getModerationAnalyticsHandler);
router.get('/moderation/restrictions', requirePermission('community.view'), getRestrictionsHandler);
router.post('/moderation/restrictions', requirePermission('community.manage'), createRestrictionHandler);
router.post('/moderation/restrictions/:id/revoke', requirePermission('community.manage'), revokeRestrictionHandler);
router.get('/moderation/audit', requirePermission('community.view'), getSecurityAuditHandler);

// Events module
router.get('/events', requirePermission('community.view'), listEvents);
router.post('/events', requirePermission('community.manage'), createEvent);
router.get('/events/analytics', requirePermission('community.view'), getEventAnalytics);
router.get('/events/:eventId', requirePermission('community.view'), getEvent);
router.patch('/events/:eventId', requirePermission('community.manage'), editEvent);
router.post('/events/:eventId/publish', requirePermission('community.manage'), publishEvent);
router.post('/events/:eventId/unpublish', requirePermission('community.manage'), unpublishEvent);
router.post('/events/:eventId/archive', requirePermission('community.manage'), archiveEvent);
router.post('/events/:eventId/start', requirePermission('community.manage'), startEvent);
router.post('/events/:eventId/complete', requirePermission('community.manage'), completeEvent);
router.post('/events/:eventId/duplicate', requirePermission('community.manage'), duplicateEvent);
router.post('/events/:eventId/cancel', requirePermission('community.manage'), cancelEvent);
router.get('/events/:eventId/registrations', requirePermission('community.view'), getRegistrations);
router.post('/events/:eventId/register', registerMember);
router.post('/events/:eventId/register/cancel', cancelRegistration);
router.post('/events/:eventId/attendance/mark', requirePermission('community.manage'), markAttendance);
router.post('/events/:eventId/check-in', checkIn);

// Schedules module
router.get('/schedules', requirePermission('community.view'), listSchedules);
router.post('/schedules', requirePermission('community.manage'), createSchedule);
router.get('/schedules/:id', requirePermission('community.view'), getSchedule);
router.patch('/schedules/:id', requirePermission('community.manage'), editSchedule);
router.post('/schedules/:id/pause', requirePermission('community.manage'), pauseSchedule);
router.post('/schedules/:id/resume', requirePermission('community.manage'), resumeSchedule);
router.post('/schedules/:id/cancel', requirePermission('community.manage'), cancelSchedule);

// Automation module
router.get('/automation/registries', requirePermission('community.view'), getAutomationRegistries);
router.get('/automation/workflows', requirePermission('community.view'), getAutomationWorkflows);
router.post('/automation/workflows', requirePermission('community.manage'), createAutomationWorkflow);
router.put('/automation/workflows/:id', requirePermission('community.manage'), updateAutomationWorkflow);
router.patch('/automation/workflows/:id/status', requirePermission('community.manage'), updateWorkflowStatus);
router.delete('/automation/workflows/:id', requirePermission('community.manage'), deleteAutomationWorkflow);
router.post('/automation/workflows/:id/test', requirePermission('community.manage'), testAutomationWorkflow);
router.get('/automation/executions', requirePermission('community.view'), getAutomationExecutions);

// Unified Insights module (Task 20 Engine)
router.get('/insights/summary', requirePermission('reports.view'), getInsightsSummary);
router.get('/insights/overview', requirePermission('reports.view'), InsightsController.getOverview);
router.get('/insights/community', requirePermission('reports.view'), InsightsController.getCommunity);
router.get('/insights/engagement', requirePermission('reports.view'), InsightsController.getEngagement);
router.get('/insights/recruitment', requirePermission('reports.view'), InsightsController.getRecruitment);
router.get('/insights/moderation', requirePermission('reports.view'), InsightsController.getModeration);
router.get('/insights/events', requirePermission('reports.view'), InsightsController.getEvents);
router.get('/insights/automation', requirePermission('reports.view'), InsightsController.getAutomation);
router.get('/insights/health', requirePermission('reports.view'), InsightsController.getHealth);
router.post('/insights/export', requirePermission('reports.view'), InsightsController.exportData);
router.post('/insights/cache/invalidate', requirePermission('community.manage'), InsightsController.invalidateCache);

// Task 85: Recruitment Analytics routes
router.get('/insights/recruitment/funnel', requirePermission('reports.view'), InsightsController.getRecruitmentFunnel);
router.get('/insights/recruitment/recruiters', requirePermission('reports.view'), InsightsController.getRecruiterPerformance);
router.get('/insights/recruitment/campaigns', requirePermission('reports.view'), InsightsController.getCampaignPerformance);
router.get('/insights/recruitment/sources', requirePermission('reports.view'), InsightsController.getSourcePerformance);

// Task 85: Retention Intelligence routes
router.get('/insights/retention/cohorts', requirePermission('reports.view'), InsightsController.getRetentionCohorts);
router.get('/insights/retention/alerts', requirePermission('reports.view'), InsightsController.getRetentionAlerts);
router.get('/insights/retention/onboarding', requirePermission('reports.view'), InsightsController.getRetentionOnboarding);
router.get('/insights/retention/crossovers', requirePermission('reports.view'), InsightsController.getRetentionCrossovers);

// Task 85: Community Brain AI routes
router.get('/insights/brain/status', requirePermission('reports.view'), InsightsController.getBrainStatus);
router.post('/insights/brain/query', requirePermission('reports.view'), InsightsController.queryBrain);

// Server-side Gemini AI module (Legacy)
router.post('/ai/consult', consultAi);

// AI Community Manager Architecture & Context Foundation (Task 21.1)
router.post(
  '/communities/:communityId/ai/ask',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.ask
);

// Task 21.9: Contextual AI Actions directly from Insights Engine
router.post(
  '/communities/:communityId/ai/contextual-action',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.executeContextualAction
);

// AI Conversations & Memory Management (Task 21.5)
router.post(
  '/communities/:communityId/ai/conversations',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.createConversation
);
router.get(
  '/communities/:communityId/ai/conversations',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.listConversations
);
router.get(
  '/communities/:communityId/ai/conversations/:conversationId',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getConversation
);
router.patch(
  '/communities/:communityId/ai/conversations/:conversationId/title',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.renameConversation
);
router.patch(
  '/communities/:communityId/ai/conversations/:conversationId',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.renameConversation
);
router.delete(
  '/communities/:communityId/ai/conversations/:conversationId',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.deleteConversation
);
router.post(
  '/communities/:communityId/ai/conversations/:conversationId/clear-context',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.clearConversationContext
);
router.post(
  '/communities/:communityId/ai/conversations/:conversationId/messages',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.postConversationMessage
);

router.get(

  '/communities/:communityId/ai/context',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getContext
);
router.get(
  '/communities/:communityId/ai/recommendations',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getRecommendations
);
router.post(
  '/communities/:communityId/ai/actions/plan',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.planActions
);
router.post(
  '/communities/:communityId/ai/actions/create-plan',
  requireTenantAccess('communityId'),
  requirePermission('community.manage'),
  AiCommunityManagerController.createPlan
);
router.post(
  '/communities/:communityId/ai/actions/dry-run',
  requireTenantAccess('communityId'),
  requirePermission('community.manage'),
  AiCommunityManagerController.dryRunAction
);
router.post(
  '/communities/:communityId/ai/actions/preview',
  requireTenantAccess('communityId'),
  requirePermission('community.manage'),
  AiCommunityManagerController.previewAction
);
router.post(
  '/communities/:communityId/ai/actions/confirm',
  requireTenantAccess('communityId'),
  requirePermission('community.manage'),
  AiCommunityManagerController.confirmAction
);
router.post(
  '/communities/:communityId/ai/actions/execute',
  requireTenantAccess('communityId'),
  requirePermission('community.manage'),
  AiCommunityManagerController.executeAction
);
router.get(
  '/communities/:communityId/ai/actions/:actionId',
  requireTenantAccess('communityId'),
  requirePermission('community.view'),
  AiCommunityManagerController.getAction
);
router.get(
  '/communities/:communityId/ai/usage',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getUsage
);
router.post(
  '/communities/:communityId/ai/export',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.exportReport
);

// --- TASK 94: COMMUNITY BRAIN COPILOT & ADAPTIVE OPERATIONS ENGINE ROUTES ---
router.get(
  '/community/:communityId/command-center',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getCommandCenter
);
router.get(
  '/communities/:communityId/command-center',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getCommandCenter
);
router.get(
  '/communities/:communityId/ai/needs-attention',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getNeedsAttention
);
router.get(
  '/communities/:communityId/ai/dashboard',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getDashboard
);
router.post(
  '/communities/:communityId/ai/dashboard/update',
  requireTenantAccess('communityId'),
  requirePermission('community.manage'),
  AiCommunityManagerController.updateDashboard
);
router.post(
  '/communities/:communityId/ai/dashboard/propose',
  requireTenantAccess('communityId'),
  requirePermission('community.manage'),
  AiCommunityManagerController.proposeDashboard
);
router.get(
  '/communities/:communityId/ai/dashboard/cards',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getDashboardCards
);
router.post(
  '/communities/:communityId/ai/reports/generate',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.generateReport
);
router.post(
  '/communities/:communityId/ai/reports/schedule',
  requireTenantAccess('communityId'),
  requirePermission('settings.manage'),
  AiCommunityManagerController.scheduleReport
);
router.get(
  '/communities/:communityId/ai/reports/scheduled',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.listScheduledReports
);
router.post(
  '/communities/:communityId/ai/workflow/propose',
  requireTenantAccess('communityId'),
  requirePermission('settings.manage'),
  AiCommunityManagerController.proposeWorkflow
);
router.get(
  '/communities/:communityId/ai/features',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.getFeatureOverview
);
router.post(
  '/communities/:communityId/ai/setup/guided',
  requireTenantAccess('communityId'),
  requirePermission('reports.view'),
  AiCommunityManagerController.guidedSetup
);

// --- TASK 46: RECRUITMENT INTELLIGENCE & TALENT OPERATIONS ROUTES ---
import { RecruitmentIntelligenceController } from '../controllers/recruitmentIntelligence.controller.js';

router.get(
  '/communities/:communityId/recruitment/score-config',
  requireTenantAccess('communityId'),
  requirePermission('settings.view'),
  RecruitmentIntelligenceController.getScoreConfig
);
router.post(
  '/communities/:communityId/recruitment/score-config',
  requireTenantAccess('communityId'),
  requirePermission('settings.manage'),
  RecruitmentIntelligenceController.updateScoreConfig
);
router.post(
  '/communities/:communityId/recruitment/applications/:applicationId/recalculate',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.recalculateScore
);
router.get(
  '/communities/:communityId/recruitment/applications/:applicationId/score',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getScoreBreakdown
);
router.get(
  '/communities/:communityId/recruitment/applications/:applicationId/ai-summary',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getAiSummary
);
router.post(
  '/communities/:communityId/recruitment/applications/:applicationId/ai-summary/refresh',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.refreshAiSummary
);
router.get(
  '/communities/:communityId/recruitment/segments',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listSegments
);
router.post(
  '/communities/:communityId/recruitment/segments',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.createSegment
);
router.delete(
  '/communities/:communityId/recruitment/segments/:segmentId',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.deleteSegment
);
router.get(
  '/communities/:communityId/recruitment/campaigns',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listCampaigns
);
router.post(
  '/communities/:communityId/recruitment/campaigns',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.createCampaign
);
router.get(
  '/communities/:communityId/recruitment/campaigns/:campaignId',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getCampaignDetails
);
router.patch(
  '/communities/:communityId/recruitment/campaigns/:campaignId',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateCampaign
);
router.patch(
  '/communities/:communityId/recruitment/campaigns/:campaignId/status',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateCampaignStatus
);

// --- Attribution & Conversion ---
router.post(
  '/communities/:communityId/recruitment/applications/:applicationId/correct-attribution',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.correctAttribution
);
router.post(
  '/communities/:communityId/recruitment/applications/:applicationId/record-success',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.recordSuccess
);

// --- Versioned Forms ---
router.get(
  '/communities/:communityId/recruitment/forms',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listForms
);
router.get(
  '/communities/:communityId/recruitment/forms/:formId',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getForm
);
router.post(
  '/communities/:communityId/recruitment/forms',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.createForm
);
router.patch(
  '/communities/:communityId/recruitment/forms/:formId',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateForm
);
router.patch(
  '/communities/:communityId/recruitment/forms/:formId/status',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateFormStatus
);
router.get(
  '/communities/:communityId/recruitment/alerts',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listAlerts
);
router.post(
  '/communities/:communityId/recruitment/alerts/:alertId/resolve',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.resolveAlert
);
router.get(
  '/communities/:communityId/recruitment/workload',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getWorkload
);
router.post(
  '/communities/:communityId/recruitment/applications/:applicationId/assign',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.assignReviewer
);
router.post(
  '/communities/:communityId/recruitment/applications/:applicationId/tags',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateTags
);
router.post(
  '/communities/:communityId/recruitment/applications/:applicationId/pool',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateTalentPool
);

// --- Task 48 Recruiter Network, Referral Ecosystem & Talent Acquisition Routes ---
router.get(
  '/communities/:communityId/recruitment/recruiters',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listRecruiters
);
router.get(
  '/communities/:communityId/recruitment/recruiters/:recruiterId',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getRecruiterDetails
);
router.post(
  '/communities/:communityId/recruitment/recruiters',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.createRecruiter
);
router.patch(
  '/communities/:communityId/recruitment/recruiters/:recruiterId',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateRecruiter
);

router.get(
  '/communities/:communityId/recruitment/referrals',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listReferrals
);
router.post(
  '/communities/:communityId/recruitment/referrals',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.createReferral
);
router.patch(
  '/communities/:communityId/recruitment/referrals/:referralId/status',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateReferralStatus
);

router.get(
  '/communities/:communityId/recruitment/rewards',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listRewards
);
router.post(
  '/communities/:communityId/recruitment/rewards',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.createReward
);
router.post(
  '/communities/:communityId/recruitment/rewards/:rewardId/claim',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.claimReward
);

router.get(
  '/communities/:communityId/recruitment/goals',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.listGoals
);
router.post(
  '/communities/:communityId/recruitment/goals',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.createGoal
);
router.patch(
  '/communities/:communityId/recruitment/goals/:goalId/progress',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.updateGoalProgress
);

router.get(
  '/communities/:communityId/recruitment/leaderboard',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getLeaderboard
);
router.get(
  '/communities/:communityId/recruitment/abuse-check',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.detectAbuse
);
router.get(
  '/communities/:communityId/recruitment/overview',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentIntelligenceController.getOverview
);
router.post(
  '/communities/:communityId/recruitment/brain',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentIntelligenceController.askCommunityBrain
);

// ==========================================
// TASK 51: MEMBER LIFECYCLE & ONBOARDING HANDOFF
// ==========================================
import { memberLifecycleController } from '../controllers/memberLifecycle.controller.js';

router.get('/lifecycle/funnel', (req, res) => memberLifecycleController.getUnifiedFunnel(req, res));
router.get('/communities/:communityId/lifecycle/funnel', (req, res) => memberLifecycleController.getUnifiedFunnel(req, res));
router.get('/lifecycle/:discordUserId/profile', (req, res) => memberLifecycleController.getProfile(req, res));
router.get('/communities/:communityId/lifecycle/:discordUserId/profile', (req, res) => memberLifecycleController.getProfile(req, res));
router.get('/lifecycle/:discordUserId/checklist', (req, res) => memberLifecycleController.getChecklist(req, res));
router.post('/lifecycle/:discordUserId/checklist/complete', (req, res) => memberLifecycleController.completeChecklistItem(req, res));
router.post('/lifecycle/:discordUserId/handoff/retry', (req, res) => memberLifecycleController.retryHandoff(req, res));
router.post('/lifecycle/:discordUserId/engagement', (req, res) => memberLifecycleController.recordEngagement(req, res));
router.get('/lifecycle/:discordUserId/upcoming-events', (req, res) => memberLifecycleController.getUpcomingEvents(req, res));

// ==========================================
// TASK 52: RECRUITMENT RETENTION & LIFECYCLE INTELLIGENCE
// ==========================================
import { RecruitmentRetentionController } from '../controllers/recruitmentRetention.controller.js';

// Cohorts
router.post(
  '/communities/:communityId/retention/cohorts',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentRetentionController.createCohort
);
router.get(
  '/communities/:communityId/retention/cohorts',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.listCohorts
);
router.get(
  '/communities/:communityId/retention/cohorts/:cohortId',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getCohort
);
router.post(
  '/communities/:communityId/retention/cohorts/:cohortId/correct',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentRetentionController.correctCohort
);

// Retention Funnel & Executive Overview
router.get(
  '/communities/:communityId/retention/funnel',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getFunnel
);
router.get(
  '/communities/:communityId/retention/overview',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getExecutiveOverview
);

// Recruiter, Campaign & Source Quality
router.get(
  '/communities/:communityId/retention/recruiters',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getRecruiterQuality
);
router.get(
  '/communities/:communityId/retention/campaigns',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getCampaignQuality
);
router.get(
  '/communities/:communityId/retention/sources',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getSourceQuality
);
router.post(
  '/communities/:communityId/retention/sources/correct',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentRetentionController.correctRecruitmentSource
);

// Early Signals, Alerts, Onboarding Quality & Crossovers
router.get(
  '/communities/:communityId/retention/signals',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getEarlySignals
);
router.get(
  '/communities/:communityId/retention/alerts',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getAlerts
);
router.get(
  '/communities/:communityId/retention/onboarding',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getOnboardingQuality
);
router.get(
  '/communities/:communityId/retention/crossovers/moderation',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getModerationCrossover
);
router.get(
  '/communities/:communityId/retention/crossovers/events',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getEventCrossover
);
router.get(
  '/communities/:communityId/retention/crossovers/automation',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getAutomationCrossover
);
router.get(
  '/communities/:communityId/retention/ltv',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getLtvFoundation
);
router.post(
  '/communities/:communityId/retention/brain',
  requireTenantAccess('communityId'),
  requirePermission('applications.review'),
  RecruitmentRetentionController.askBrain
);
router.get(
  '/communities/:communityId/retention/members/:discordUserId/evidence',
  requireTenantAccess('communityId'),
  requirePermission('applications.view'),
  RecruitmentRetentionController.getMemberEvidence
);

import {
  getBillingStatus,
  getInvoices,
  requestCheckout,
  cancelSubscription,
  handleWebhook,
} from '../controllers/billing.controller.js';

import {
  getSystemHealth as getOpsSystemHealth,
  getIncidents,
  getIncidentDetail,
  addIncidentNoteHandler,
  updateIncident,
  getSchedulerStatus,
  getTenantHealth,
  getProductionMetrics,
  getTenantIncidentsHandler,
  checkAlertConditionsHandler,
  getAvailableActionsHandler,
  getActionHistoryHandler,
  executeRecoveryActionHandler,
  getHealthSnapshotsHandler,
  getLatencyDistributionHandler,
  getAlertRulesHandler,
  getIncidentTimelineHandler,
  getServiceLevelObjectivesHandler,
  getOperationalTrendsHandler,
  getNotificationPreferencesHandler,
  updateNotificationPreferencesHandler,
  recordOperationalMetricHandler,
  listOperationalMetricsHandler,
  acknowledgeIncidentHandler,
  assignIncidentHandler,
  reassignIncidentHandler,
  unassignIncidentHandler,
  resolveIncidentHandler,
  reopenIncidentHandler,
  getIncidentCommunicationsHandler,
  addIncidentCommunicationHandler,
  getIncidentEscalationHandler,
  pauseEscalationHandler,
  resumeEscalationHandler,
  listMaintenanceWindowsHandler,
  createMaintenanceWindowHandler,
  cancelMaintenanceWindowHandler,
} from '../controllers/observability.controller.js';

import { standardErrorHandler } from '../middleware/errorHandler.js';

// Billing Endpoints
router.get('/billing/status', getBillingStatus);
router.get('/billing/invoices', getInvoices);
router.post('/billing/checkout', requestCheckout);
router.post('/billing/cancel', cancelSubscription);
router.post('/billing/webhook/:provider', handleWebhook);

// Production Observability & Operations Control Endpoints (Task 131, 132, 133, 134, 135)
router.get('/ops/health', getOpsSystemHealth);
router.get('/ops/incidents', getIncidents);
router.get('/ops/incidents/:id', getIncidentDetail);
router.post('/ops/incidents/:id/notes', addIncidentCommunicationHandler);
router.get('/ops/incidents/:id/notes', getIncidentCommunicationsHandler);
router.patch('/ops/incidents/:id', updateIncident);
router.post('/ops/incidents/:id/acknowledge', acknowledgeIncidentHandler);
router.post('/ops/incidents/:id/assign', assignIncidentHandler);
router.post('/ops/incidents/:id/reassign', reassignIncidentHandler);
router.post('/ops/incidents/:id/unassign', unassignIncidentHandler);
router.post('/ops/incidents/:id/resolve', resolveIncidentHandler);
router.post('/ops/incidents/:id/reopen', reopenIncidentHandler);
router.get('/ops/incidents/:id/timeline', getIncidentTimelineHandler);
router.get('/ops/incidents/:id/escalation', getIncidentEscalationHandler);
router.post('/ops/incidents/:id/escalation/pause', pauseEscalationHandler);
router.post('/ops/incidents/:id/escalation/resume', resumeEscalationHandler);

// Maintenance Windows (Task 135)
router.get('/ops/maintenance', listMaintenanceWindowsHandler);
router.post('/ops/maintenance', createMaintenanceWindowHandler);
router.post('/ops/maintenance/:id/cancel', cancelMaintenanceWindowHandler);

router.get('/ops/scheduler', getSchedulerStatus);
router.get('/ops/tenant-health', getTenantHealth);
router.get('/ops/metrics', getProductionMetrics);
router.get('/ops/tenant-incidents', getTenantIncidentsHandler);
router.post('/ops/check-alerts', checkAlertConditionsHandler);
router.get('/ops/actions', getAvailableActionsHandler);
router.get('/ops/actions/history', getActionHistoryHandler);
router.post('/ops/actions/:actionId/execute', executeRecoveryActionHandler);

// Task 134 Observability Endpoints
router.get('/ops/health/snapshots', getHealthSnapshotsHandler);
router.get('/ops/latency', getLatencyDistributionHandler);
router.get('/ops/alerts/rules', getAlertRulesHandler);
router.get('/ops/slos', getServiceLevelObjectivesHandler);
router.get('/ops/trends', getOperationalTrendsHandler);
router.get('/ops/notifications/preferences', getNotificationPreferencesHandler);
router.put('/ops/notifications/preferences', updateNotificationPreferencesHandler);
router.post('/ops/telemetry/metrics', recordOperationalMetricHandler);
router.get('/ops/telemetry/metrics', listOperationalMetricsHandler);

// Task 137 Production Release Control & Handoff Endpoints
import {
  getReleaseStatusHandler,
  executePostDeploymentValidationHandler,
  getValidationHistoryHandler,
  getRollbackReadinessHandler,
  getReleaseHandoffHandler,
  createReleaseHandoffHandler,
  getPostReleaseMonitoringHandler,
  executeProductionAcceptanceHandler,
  getLatestAcceptanceRecordHandler,
  getAcceptanceHistoryHandler,
  getAttestationHandler,
  createAttestationHandler,
  getEvidenceHandler,
  listChangeControlHandler,
  requestChangeHandler,
  approveChangeHandler,
  rejectChangeHandler,
  executeChangeHandler,
  getPostReleaseLockHandler,
  setPostReleaseLockHandler,
} from '../controllers/opsRelease.controller.js';

router.get('/ops/release/status', getReleaseStatusHandler);
router.post('/ops/release/validation', executePostDeploymentValidationHandler);
router.get('/ops/release/validation/history', getValidationHistoryHandler);
router.get('/ops/release/rollback-readiness', getRollbackReadinessHandler);
router.get('/ops/release/handoff', getReleaseHandoffHandler);
router.post('/ops/release/handoff', createReleaseHandoffHandler);
router.post('/ops/release/post-release-validation', executePostDeploymentValidationHandler);
router.get('/ops/release/monitoring', getPostReleaseMonitoringHandler);
router.post('/ops/release/acceptance', executeProductionAcceptanceHandler);
router.get('/ops/release/acceptance', getLatestAcceptanceRecordHandler);
router.get('/ops/release/acceptance/history', getAcceptanceHistoryHandler);
router.get('/ops/release/attestation', getAttestationHandler);
router.post('/ops/release/attestation', createAttestationHandler);
router.get('/ops/release/evidence', getEvidenceHandler);
router.get('/ops/release/change-control', listChangeControlHandler);
router.post('/ops/release/change-control', requestChangeHandler);
router.post('/ops/release/change-control/:id/approve', approveChangeHandler);
router.post('/ops/release/change-control/:id/reject', rejectChangeHandler);
router.post('/ops/release/change-control/:id/execute', executeChangeHandler);
router.get('/ops/release/post-release-lock', getPostReleaseLockHandler);
router.post('/ops/release/post-release-lock', setPostReleaseLockHandler);

// Task 143 Production Verification Bridge endpoints
router.get('/ops/production/verification', runLiveVerification);
router.get('/ops/production/verification/read-only-check', runDiscordReadOnlyCheck);
router.get('/ops/production/verification/report', getVerificationReport);
router.get('/ops/production/verification/token-status', verifyDiscordBotTokenStatus);
router.get('/ops/production/verification/discord-credential-isolation', runDiscordCredentialIsolationDiagnostic);

// Discord Operations & Server Control Engine (Task 95)
import * as DiscordOpsController from '../controllers/discordOperations.controller.js';

router.get('/communities/:communityId/discord-ops/server', DiscordOpsController.inspectServer);
router.post('/communities/:communityId/discord-ops/server/sync', DiscordOpsController.syncServerData);
router.get('/communities/:communityId/discord-ops/roles', DiscordOpsController.listRoles);
router.post('/communities/:communityId/discord-ops/roles', DiscordOpsController.createRole);
router.patch('/communities/:communityId/discord-ops/roles/:roleId', DiscordOpsController.renameRole);
router.put('/communities/:communityId/discord-ops/roles/:roleId', DiscordOpsController.updateRole);
router.post('/communities/:communityId/discord-ops/roles/apply-template', DiscordOpsController.applyRoleTemplate);
router.post('/communities/:communityId/discord-ops/roles/assign', DiscordOpsController.assignRole);
router.post('/communities/:communityId/discord-ops/roles/remove', DiscordOpsController.removeRole);
router.get('/communities/:communityId/discord-ops/roles/diagnostics', DiscordOpsController.getRoleDiagnostics);
router.get('/communities/:communityId/discord-ops/channels', DiscordOpsController.listChannels);
router.post('/communities/:communityId/discord-ops/channels', DiscordOpsController.createChannel);
router.patch('/communities/:communityId/discord-ops/channels/:channelId', DiscordOpsController.renameChannel);
router.post('/communities/:communityId/discord-ops/channels/apply-template', DiscordOpsController.applyChannelTemplate);
router.get('/communities/:communityId/discord-ops/channels/:channelId/diagnostics', DiscordOpsController.getChannelDiagnostics);
router.post('/communities/:communityId/discord-ops/members/bulk-role', DiscordOpsController.bulkMemberRoleOperation);
router.get('/communities/:communityId/discord-ops/hygiene', DiscordOpsController.analyzeHygiene);
router.post('/communities/:communityId/discord-ops/hygiene/fix', DiscordOpsController.applyHygieneFix);
router.get('/communities/:communityId/discord-ops/blueprint', DiscordOpsController.generateBlueprint);
router.post('/communities/:communityId/discord-ops/blueprint/apply', DiscordOpsController.applyBlueprint);

// Standardized Error Middleware
router.use(standardErrorHandler);

export { router as v1Router };

