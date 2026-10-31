import { discordCapabilityService } from './discordCapability.service.js';
import { integrationCenterService } from './integrationCenter.service.js';
import { onboardingService } from './onboarding.service.js';
import { retentionIntelligenceService } from './retentionIntelligence.service.js';
import {
  automationWorkflowsRepository,
  remindersRepository,
  applicationsRepository,
  interviewsRepository,
  warningsRepository,
  campaignsRepository,
} from '../repositories/index.js';

export interface PrioritySignal {
  id: string;
  source: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  evidence: string;
  timestamp: string;
  recommendedNextStep: string;
  actionId?: string;
  metadata?: Record<string, unknown>;
}

export interface NeedsAttentionReport {
  communityId: string;
  evaluatedAt: string;
  status: 'HEALTHY' | 'NEEDS_ATTENTION' | 'INSUFFICIENT_DATA';
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  signals: PrioritySignal[];
}

export class NeedsAttentionService {
  /**
   * Evaluates deterministic priority signals across all sub-systems before any AI interpretation.
   */
  static async evaluateSignals(communityId: string): Promise<NeedsAttentionReport> {
    const signals: PrioritySignal[] = [];
    const nowIso = new Date().toISOString();

    // 1. Discord Connection Status
    try {
      const discordDiag = await discordCapabilityService.getConnectionCenterStatus(communityId);
      if (!discordDiag.guild || discordDiag.guild.status !== 'CONNECTED') {
        signals.push({
          id: `sig_discord_conn_${Date.now()}`,
          source: 'Discord Integration Gateway',
          severity: 'CRITICAL',
          title: 'Discord Guild Disconnected or Out of Sync',
          description: 'The target Discord server is not properly linked or the bot gateway is offline.',
          evidence: `Linked Guild Status: ${discordDiag.guild?.status || 'UNLINKED'}. Gateway state: ${discordDiag.gateway?.state || 'OFFLINE'}.`,
          timestamp: nowIso,
          recommendedNextStep: 'Re-authorize Discord bot permissions or run link sync in Integration Center.',
          actionId: 'RUN_PERMISSION_DIAGNOSTICS',
        });
      }
    } catch {
      // Graceful fallback if checking discord status encounters error
    }

    // 2. Integration Health
    try {
      const report = await integrationCenterService.getUnifiedStatus(communityId);
      if (report.overallHealth !== 'HEALTHY') {
        signals.push({
          id: `sig_integration_${Date.now()}`,
          source: 'Integration Center',
          severity: report.overallHealth === 'CONFIG_REQUIRED' ? 'HIGH' : 'MEDIUM',
          title: 'Integration Gateway Issue',
          description: `Integration status is currently ${report.overallHealth}.`,
          evidence: `Overall Health: ${report.overallHealth}`,
          timestamp: nowIso,
          recommendedNextStep: 'Check OAuth credentials and permissions in Integration Center.',
          actionId: 'REAUTHORIZE_INTEGRATION',
        });
      }
    } catch {
      // Fallback
    }

    // 3. Automation Workflow Failures
    try {
      const workflows = await automationWorkflowsRepository.listForTenant(communityId);
      const failingWorkflows = workflows.filter((w) => w.status === 'ACTIVE' && (w as any).failureCount && (w as any).failureCount > 0);
      if (failingWorkflows.length > 0) {
        signals.push({
          id: `sig_auto_failures_${Date.now()}`,
          source: 'Automation Workflow Engine',
          severity: 'HIGH',
          title: 'Active Workflows Experiencing Repeated Failures',
          description: `${failingWorkflows.length} active automation workflow(s) failed during execution.`,
          evidence: `Failing workflows: ${failingWorkflows.map((w) => w.name).join(', ')}.`,
          timestamp: nowIso,
          recommendedNextStep: 'Review workflow execution logs and verify channel/role target permissions.',
          actionId: 'REVIEW_AUTOMATION_FAILURES',
        });
      }
    } catch {
      // Fallback
    }

    // 4. Scheduled Task Failures
    try {
      const reminders = await remindersRepository.listForTenant(communityId);
      const failedReminders = reminders.filter((r) => r.status === 'FAILED');
      if (failedReminders.length > 0) {
        signals.push({
          id: `sig_task_failures_${Date.now()}`,
          source: 'Schedule Service',
          severity: 'MEDIUM',
          title: 'Scheduled Reminders Failed Delivery',
          description: `${failedReminders.length} scheduled reminder(s) encountered delivery failures.`,
          evidence: `Failed reminder IDs: ${failedReminders.map((r) => r.id).join(', ')}.`,
          timestamp: nowIso,
          recommendedNextStep: 'Check target Discord channel access and bot permissions.',
          actionId: 'CREATE_REMINDER',
        });
      }
    } catch {
      // Fallback
    }

    // 5. Application Review Backlog
    try {
      const pendingApps = await applicationsRepository.listForTenant(communityId, { where: [{ field: 'status', operator: '==', value: 'SUBMITTED' }] });
      if (pendingApps.length >= 5) {
        signals.push({
          id: `sig_app_backlog_${Date.now()}`,
          source: 'Recruitment Engine',
          severity: pendingApps.length >= 10 ? 'HIGH' : 'MEDIUM',
          title: 'Recruitment Application Review Backlog Increasing',
          description: `There are ${pendingApps.length} pending candidate applications awaiting interviewer review.`,
          evidence: `${pendingApps.length} applications in SUBMITTED status.`,
          timestamp: nowIso,
          recommendedNextStep: 'Assign pending applications to recruiters or set up automated review routing.',
          actionId: 'CREATE_AUTOMATION_WORKFLOW',
        });
      }
    } catch {
      // Fallback
    }

    // 6. Pending Interview Backlog
    try {
      const pendingInterviews = await interviewsRepository.listForTenant(communityId, { where: [{ field: 'status', operator: '==', value: 'SCHEDULED' }] });
      const overdueInterviews = pendingInterviews.filter((i) => (i as any).scheduledAt && new Date((i as any).scheduledAt).getTime() < Date.now());
      if (overdueInterviews.length > 0) {
        signals.push({
          id: `sig_interview_backlog_${Date.now()}`,
          source: 'Interview Engine',
          severity: 'HIGH',
          title: 'Overdue Scheduled Candidate Interviews',
          description: `${overdueInterviews.length} candidate interview(s) are past their scheduled time.`,
          evidence: `${overdueInterviews.length} interviews overdue.`,
          timestamp: nowIso,
          recommendedNextStep: 'Send interview reminders to assigned recruiters or reschedule candidate sessions.',
          actionId: 'CREATE_REMINDER',
        });
      }
    } catch {
      // Fallback
    }

    // 7. Active Unresolved Moderation Incidents
    try {
      const activeWarnings = await warningsRepository.listForTenant(communityId, { where: [{ field: 'status', operator: '==', value: 'ACTIVE' }] });
      if (activeWarnings.length > 0) {
        signals.push({
          id: `sig_mod_incidents_${Date.now()}`,
          source: 'Moderation & Safety Engine',
          severity: activeWarnings.length >= 5 ? 'HIGH' : 'MEDIUM',
          title: 'Active Moderation Warnings & Restrictions',
          description: `There are ${activeWarnings.length} active moderation warnings or restrictions recorded for members.`,
          evidence: `${activeWarnings.length} active member warnings.`,
          timestamp: nowIso,
          recommendedNextStep: 'Review active warnings and confirm moderation appeal status.',
          actionId: 'CONFIGURE_AUTO_MODERATION',
        });
      }
    } catch {
      // Fallback
    }

    // 8. Low Welcome Onboarding Completion
    try {
      const obStatus = await onboardingService.getOnboardingStatus('system', 'OWNER', communityId);
      if (obStatus && obStatus.onboardingRequired) {
        signals.push({
          id: `sig_onboarding_incomplete_${Date.now()}`,
          source: 'Community Onboarding',
          severity: 'LOW',
          title: 'Community Onboarding Setup Incomplete',
          description: 'Initial community setup and Discord guild linking wizard steps are still pending.',
          evidence: `Onboarding progress: ${obStatus.setupStatus?.completionPercentage || 0}% complete.`,
          timestamp: nowIso,
          recommendedNextStep: 'Complete community onboarding steps to unlock automated member onboarding.',
          actionId: 'SET_WELCOME_ONBOARDING',
        });
      }
    } catch {
      // Fallback
    }

    // 9. Retention Deterioration Alert
    try {
      const alerts = await retentionIntelligenceService.getRetentionAlerts(communityId);
      const highAlerts = alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'WARNING');
      for (const alert of highAlerts) {
        signals.push({
          id: `sig_retention_${alert.id}`,
          source: 'Retention Intelligence Engine',
          severity: alert.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          title: alert.alertType,
          description: alert.affectedCohortOrSource,
          evidence: alert.evidence,
          timestamp: nowIso,
          recommendedNextStep: alert.recommendedAction,
          actionId: 'CREATE_ANNOUNCEMENT_DRAFT',
        });
      }
    } catch {
      // Fallback
    }

    // Aggregate counts
    const criticalCount = signals.filter((s) => s.severity === 'CRITICAL').length;
    const highCount = signals.filter((s) => s.severity === 'HIGH').length;
    const mediumCount = signals.filter((s) => s.severity === 'MEDIUM').length;
    const lowCount = signals.filter((s) => s.severity === 'LOW').length;

    let overallStatus: 'HEALTHY' | 'NEEDS_ATTENTION' | 'INSUFFICIENT_DATA' = 'HEALTHY';
    if (criticalCount > 0 || highCount > 0 || mediumCount > 0) {
      overallStatus = 'NEEDS_ATTENTION';
    }

    return {
      communityId,
      evaluatedAt: nowIso,
      status: overallStatus,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      signals,
    };
  }
}
