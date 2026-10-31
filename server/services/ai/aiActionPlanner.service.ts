import {
  AiCommunityContext,
  AiPlannedAction,
  AiActionPlan,
  AiActionPlanStep,
  AiRecommendation,
  AiModuleType,
} from '../../../shared/types/ai.js';
import { AiSafetyService } from './aiSafety.service.js';
import { BadRequestError } from '../../utils/errors.js';

export class AiActionPlannerService {
  /**
   * Plans structured candidate actions based on prompt context and community facts.
   * Actions are strictly drafted and marked REQUIRES_APPROVAL / DRAFT / DRY_RUN.
   */
  static planCandidateActions(
    prompt: string,
    context: AiCommunityContext
  ): AiPlannedAction[] {
    const planned: AiPlannedAction[] = [];
    const lower = prompt.toLowerCase();
    const communityName = context.tenant.communityName;

    // 1. Plan Announcement Draft
    if (
      lower.includes('announcement') ||
      lower.includes('announce') ||
      lower.includes('message') ||
      lower.includes('broadcast') ||
      lower.includes('engagement')
    ) {
      const title = `Community Update: ${communityName}`;
      const preview = `📢 **${communityName} Community Update**\n\nHello everyone! We are excited to announce our upcoming schedule and weekly highlights. Check the event calendar for updates and react to this message to show support!`;

      planned.push({
        id: `plan_announcement_${Date.now()}`,
        title: 'Draft Community Announcement',
        module: 'ENGAGEMENT',
        actionType: 'DRAFT_ANNOUNCEMENT',
        status: 'DRAFT',
        parameters: {
          title,
          content: preview,
          targetChannelId: '',
        },
        preview,
        safetyNotes: [
          'Requires community.manage permission to send.',
          'Verify target channel permissions before publishing.',
          'Execution is strictly restricted to safe DRAFT / DRY-RUN mode.',
        ],
      });
    }

    // 2. Plan Event Reminder
    if (
      lower.includes('event') ||
      lower.includes('meetup') ||
      lower.includes('calendar') ||
      lower.includes('rsvp')
    ) {
      const preview = `⏰ **Upcoming Event Reminder: ${communityName} Community Session**\nJoin us for our scheduled community session! Confirm your RSVP in #events.`;

      planned.push({
        id: `plan_event_reminder_${Date.now()}`,
        title: 'Schedule Event Reminder',
        module: 'EVENTS',
        actionType: 'SCHEDULE_EVENT_REMINDER',
        status: 'DRAFT',
        parameters: {
          leadTime: '1H',
          reminderTemplate: preview,
        },
        preview,
        safetyNotes: [
          'Requires events.manage permission.',
          'Ensures no duplicate reminders sent within a 1-hour window.',
          'Execution is strictly restricted to safe DRAFT / DRY-RUN mode.',
        ],
      });
    }

    // 3. Plan Workflow Automation Draft
    if (
      lower.includes('workflow') ||
      lower.includes('automate') ||
      lower.includes('automation') ||
      lower.includes('trigger')
    ) {
      planned.push({
        id: `plan_workflow_${Date.now()}`,
        title: 'Suggest Member Onboarding Workflow',
        module: 'AUTOMATION',
        actionType: 'SUGGEST_WORKFLOW',
        status: 'DRAFT',
        parameters: {
          trigger: { type: 'MEMBER_JOIN' },
          actions: [
            { type: 'SEND_DISCORD_MESSAGE', channel: 'welcome' },
            { type: 'ASSIGN_DISCORD_ROLE', role: 'Member' },
          ],
        },
        preview:
          'Trigger: Member Joins Community -> Action: Send Welcome Message -> Action: Assign Default Member Role',
        safetyNotes: [
          'Requires automation.manage permission.',
          'Workflow executes in dry-run mode until published.',
          'Execution is strictly restricted to safe DRAFT / DRY-RUN mode.',
        ],
      });
    }

    // 4. Plan Recruitment Review
    if (
      lower.includes('recruit') ||
      lower.includes('application') ||
      lower.includes('candidate') ||
      lower.includes('interview')
    ) {
      planned.push({
        id: `plan_recruitment_${Date.now()}`,
        title: 'Batch Review Pending Applications',
        module: 'COMMUNITY',
        actionType: 'NAVIGATE_APPLICATIONS',
        status: 'DRAFT',
        parameters: {
          status: 'PENDING',
          filter: 'AWAITING_REVIEW',
        },
        preview: 'Review and assign pending candidate applications to designated interviewers.',
        safetyNotes: [
          'Requires community.manage permission.',
          'Candidate status updates remain in draft mode until confirmed by operator.',
        ],
      });
    }

    // Sanitize any planned actions against secrets
    const { sanitized } = AiSafetyService.redactSecrets(planned);
    return sanitized;
  }

  /**
   * Creates a structured AiActionPlan from an evidence-based recommendation or query goal.
   *
   * Enforces:
   * - Goal, observed issue, recommended steps, expected objective, confidence, affected module
   * - Strict DRAFT / DRY-RUN status (no automatic live execution)
   * - Anti-guarantee validation
   * - Tenant boundary isolation
   */
  static createActionPlan(
    params: {
      recommendation?: AiRecommendation;
      goal?: string;
      issue?: string;
      module?: AiModuleType;
      prompt?: string;
    },
    context: AiCommunityContext
  ): AiActionPlan {
    const rec = params.recommendation;
    const communityId = context.tenant.communityId;

    const module: AiModuleType =
      rec?.affectedModule ||
      params.module ||
      'COMMUNITY';

    const goal =
      params.goal ||
      (rec ? `Execute Action Plan: ${rec.title}` : `Optimize Community Performance: ${module}`);

    const observedIssue =
      params.issue ||
      rec?.reason ||
      `Identified operational friction or improvement opportunity in ${module} module.`;

    const expectedObjective = rec
      ? `Address observed ${rec.type.toLowerCase()} in ${rec.affectedModule} and improve operational throughput.`
      : `Resolve operational bottleneck and maintain community stability.`;

    // Reject ungrounded guaranteed outcome claims
    if (
      AiSafetyService.checkForGuaranteedClaims(goal) ||
      AiSafetyService.checkForGuaranteedClaims(observedIssue) ||
      AiSafetyService.checkForGuaranteedClaims(expectedObjective)
    ) {
      throw new BadRequestError('Action plans cannot contain ungrounded or guaranteed outcome claims.');
    }

    // Construct recommended steps based on module
    const { steps, structuredSteps } = this.generateStepsForModule(module, rec, context);

    const confidence = rec?.confidence || 'HIGH';
    const confidenceScore = rec?.confidenceScore || 0.85;

    const actionPlan: AiActionPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      communityId,
      goal,
      observedIssue,
      recommendedSteps: steps,
      structuredSteps,
      expectedObjective,
      confidence,
      confidenceScore,
      affectedModule: module,
      status: 'DRAFT', // STRICTLY DRAFT - live execution is prohibited
      associatedRecommendationId: rec?.id,
      createdAt: new Date().toISOString(),
      safetyCheck: {
        passed: true,
        guaranteedClaimsFound: false,
        safetyNotes: [
          'Action plan is in DRAFT state. Automatic live execution is strictly disabled.',
          'All action steps must be reviewed and tested via dry-run before deployment.',
          `Tenant scope bound to community: ${context.tenant.communityName} (${communityId}).`,
        ],
      },
    };

    // Sanitize any accidentally included credentials
    const { sanitized } = AiSafetyService.redactSecrets(actionPlan);
    return sanitized;
  }

  /**
   * Helper to construct modular, grounded steps.
   */
  private static generateStepsForModule(
    module: AiModuleType,
    rec: AiRecommendation | undefined,
    context: AiCommunityContext
  ): { steps: string[]; structuredSteps: AiActionPlanStep[] } {
    const communityName = context.tenant.communityName;

    switch (module) {
      case 'RECRUITMENT':
        return {
          steps: [
            'Audit pending candidate applications in the Recruitment dashboard.',
            'Assign open applications to available interviewers with review deadlines.',
            'Dry-run notification template to verify applicant communication channels.',
            'Record evaluation stage transitions upon review completion.',
          ],
          structuredSteps: [
            {
              stepNumber: 1,
              title: 'Audit Pending Applications',
              description: 'Open recruitment list and filter by pending status.',
              actionType: 'NAVIGATE_APPLICATIONS',
              targetModule: 'RECRUITMENT',
              parameters: { status: 'PENDING' },
              status: 'DRAFT',
            },
            {
              stepNumber: 2,
              title: 'Assign Interviewers',
              description: 'Distribute candidate review workload across active team members.',
              actionType: 'ASSIGN_REVIEWER',
              targetModule: 'RECRUITMENT',
              status: 'DRAFT',
            },
            {
              stepNumber: 3,
              title: 'Verify Candidate Notifications',
              description: 'Dry-run applicant status notification dispatch.',
              actionType: 'DRY_RUN_NOTIFICATION',
              targetModule: 'RECRUITMENT',
              status: 'DRY_RUN',
            },
          ],
        };

      case 'ENGAGEMENT':
        return {
          steps: [
            'Audit Discord bot permissions across target broadcast channels.',
            'Draft engagement announcement content in safe draft mode.',
            'Execute dry-run broadcast simulation to verify message formatting.',
            'Publish announcement and monitor real-time delivery telemetry.',
          ],
          structuredSteps: [
            {
              stepNumber: 1,
              title: 'Check Channel Permissions',
              description: 'Ensure Send Messages and Embed Links are enabled.',
              actionType: 'RUN_DISCORD_PERMISSIONS_CHECK',
              targetModule: 'ENGAGEMENT',
              status: 'DRY_RUN',
            },
            {
              stepNumber: 2,
              title: 'Draft Announcement Content',
              description: `Draft community update for ${communityName}.`,
              actionType: 'DRAFT_ANNOUNCEMENT',
              targetModule: 'ENGAGEMENT',
              status: 'DRAFT',
            },
          ],
        };

      case 'EVENTS':
        return {
          steps: [
            'Confirm session agenda, speaker availability, and voice channel allocation.',
            'Draft event schedule entry in community calendar.',
            'Configure automated event reminder with 1-hour lead time.',
            'Track member registrations and log session attendance.',
          ],
          structuredSteps: [
            {
              stepNumber: 1,
              title: 'Draft Community Event',
              description: 'Configure event title, date, duration, and channel.',
              actionType: 'DRAFT_EVENT',
              targetModule: 'EVENTS',
              parameters: { eventType: 'COMMUNITY_SESSION' },
              status: 'DRAFT',
            },
            {
              stepNumber: 2,
              title: 'Schedule Event Reminder',
              description: 'Set automated 1-hour reminder dispatch.',
              actionType: 'SCHEDULE_EVENT_REMINDER',
              targetModule: 'EVENTS',
              status: 'DRAFT',
            },
          ],
        };

      case 'MODERATION':
        return {
          steps: [
            'Audit recent automod trigger logs and safety incident flags.',
            'Review member blacklist and adjust trigger violation thresholds.',
            'Dry-run updated moderation filter rules in staging channel.',
            'Save updated rule set and log audit trail entry.',
          ],
          structuredSteps: [
            {
              stepNumber: 1,
              title: 'Audit Automod Logs',
              description: 'Inspect incident log entries and violation counts.',
              actionType: 'AUDIT_MODERATION',
              targetModule: 'MODERATION',
              status: 'DRY_RUN',
            },
          ],
        };

      case 'AUTOMATION':
        return {
          steps: [
            'Review pre-configured welcome and role assignment workflow templates.',
            'Configure MEMBER_JOIN trigger condition and target welcome channel.',
            'Execute workflow dry-run simulation to verify step order.',
            'Activate workflow and observe execution telemetry.',
          ],
          structuredSteps: [
            {
              stepNumber: 1,
              title: 'Configure Onboarding Workflow',
              description: 'Draft welcome message and default role trigger.',
              actionType: 'SUGGEST_WORKFLOW',
              targetModule: 'AUTOMATION',
              status: 'DRAFT',
            },
          ],
        };

      default:
        return {
          steps: [
            `Analyze ${module} metrics in the community analytics dashboard.`,
            rec?.suggestedNextStep || 'Review operational signals and historical comparison trends.',
            'Test recommended operational changes in dry-run simulation mode.',
            'Re-evaluate metrics following next observation window.',
          ],
          structuredSteps: [
            {
              stepNumber: 1,
              title: `Inspect ${module} Dashboard`,
              description: `Open ${module} view to examine trends.`,
              actionType: rec?.suggestedAction?.actionType || 'NAVIGATE_MODULE',
              targetModule: module,
              status: 'DRAFT',
            },
          ],
        };
    }
  }
}
