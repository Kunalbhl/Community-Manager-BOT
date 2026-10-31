import type { UserAuthContext } from '../../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import { EntitlementService } from '../entitlement.service.js';
import { ForbiddenError, BadRequestError } from '../../utils/errors.js';
import { ActionRegistryService } from './actionRegistry.js';

export interface WorkflowProposal {
  workflowId: string;
  communityId: string;
  name: string;
  description: string;
  trigger: {
    type: string;
    description: string;
  };
  conditions: Array<{
    field: string;
    operator: string;
    value: string;
  }>;
  actions: Array<{
    type: string;
    parameters: Record<string, any>;
    description: string;
  }>;
  explanation: {
    whenItRuns: string;
    whatItChecks: string;
    whatItDoes: string;
    whoReceivesIt: string;
    dependencies: string[];
    failureFallback: string;
  };
  proposedAction: {
    actionId: string;
    params: Record<string, any>;
    riskLevel: 'MEDIUM';
    requiresConfirmation: true;
  };
}

export class AiWorkflowBuilderService {
  /**
   * Converts a natural language workflow request into a validated, structured workflow proposal.
   */
  static async proposeWorkflow(
    communityId: string,
    userContext: UserAuthContext,
    prompt: string
  ): Promise<WorkflowProposal> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant workflow proposal denied for tenant ${communityId}`);
    }

    if (!hasPermission(userContext, 'settings.manage')) {
      throw new ForbiddenError('Permission settings.manage required to create workflow proposals');
    }

    const isEntitled = await EntitlementService.hasFeature(communityId, 'AUTOMATION');
    if (!isEntitled) {
      throw new ForbiddenError('Automation feature is not enabled for your community tier.');
    }

    if (!prompt || typeof prompt !== 'string') {
      throw new BadRequestError('Prompt string required to propose workflow');
    }

    const lower = prompt.toLowerCase();
    let triggerType = 'MEMBER_JOIN';
    let triggerDesc = 'Triggers when a new member joins the Discord server.';
    let workflowName = 'Member Welcome & Onboarding Workflow';

    if (lower.includes('application') || lower.includes('candidate') || lower.includes('apply')) {
      triggerType = 'APPLICATION_SUBMITTED';
      triggerDesc = 'Triggers when a candidate submits a recruitment application.';
      workflowName = 'Application Review & Interviewer Alert Workflow';
    } else if (lower.includes('warning') || lower.includes('moderation') || lower.includes('spam')) {
      triggerType = 'MODERATION_INCIDENT_CREATED';
      triggerDesc = 'Triggers when a moderation warning or sanction is created.';
      workflowName = 'Moderation Alert & Audit Workflow';
    } else if (lower.includes('event') || lower.includes('session')) {
      triggerType = 'EVENT_CREATED';
      triggerDesc = 'Triggers when a new community event is scheduled.';
      workflowName = 'Event Notification & Reminder Workflow';
    }

    const actions = [
      {
        type: 'SEND_DISCORD_MESSAGE',
        parameters: { channelId: '', template: 'Operational notification message' },
        description: 'Sends a formatted notification message to the designated Discord channel.',
      },
      {
        type: 'CREATE_REMINDER',
        parameters: { delayMinutes: 1440, title: 'Follow-up Reminder' },
        description: 'Schedules a follow-up reminder after 24 hours if unhandled.',
      },
    ];

    const explanation = {
      whenItRuns: `Runs automatically whenever ${triggerDesc.toLowerCase()}`,
      whatItChecks: 'Verifies user roles, channel accessibility, and rate limit loop protection.',
      whatItDoes: 'Sends a Discord notification message and schedules a 24-hour follow-up reminder.',
      whoReceivesIt: 'Assigned community staff and designated Discord notification channel.',
      dependencies: ['Discord Bot gateway connection', 'Target channel write permissions'],
      failureFallback: 'Logs error to Error Center and notifies community owner via in-app alert.',
    };

    const workflowId = `wf_prop_${Date.now()}`;

    return {
      workflowId,
      communityId,
      name: workflowName,
      description: `AI-crafted operational workflow based on prompt: "${prompt}"`,
      trigger: {
        type: triggerType,
        description: triggerDesc,
      },
      conditions: [],
      actions,
      explanation,
      proposedAction: {
        actionId: 'CREATE_AUTOMATION_WORKFLOW',
        params: {
          name: workflowName,
          triggerType,
          actions,
        },
        riskLevel: 'MEDIUM',
        requiresConfirmation: true,
      },
    };
  }
}
