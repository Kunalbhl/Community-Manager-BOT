import { logger } from '../../logging/logger.js';
import {
  applicationsRepository,
  googleFormsConfigsRepository,
  integrationEventsRepository,
  auditLogsRepository,
} from '../../repositories/index.js';
import { GoogleFormsConfig, ApplicationDocument } from '../../../shared/types/models.js';

export class GoogleFormsService {
  async configureForm(
    communityId: string,
    formId: string,
    formTitleSnapshot = 'Recruitment Application Form',
    enabled = true
  ): Promise<GoogleFormsConfig> {
    const existingConfigs = await googleFormsConfigsRepository.listForTenant(communityId);
    const now = new Date().toISOString();

    let config: GoogleFormsConfig;
    if (existingConfigs.length > 0) {
      config = await googleFormsConfigsRepository.update(existingConfigs[0].id, {
        formId,
        formTitleSnapshot,
        enabled,
        lastSyncStatus: enabled ? 'CONNECTED' : 'DISCONNECTED',
        updatedAt: now,
      });
    } else {
      config = await googleFormsConfigsRepository.create({
        communityId,
        formId,
        formTitleSnapshot,
        enabled,
        lastSyncStatus: enabled ? 'CONNECTED' : 'DISCONNECTED',
        createdAt: now,
        updatedAt: now,
      });
    }

    await auditLogsRepository.create({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'OWNER',
      action: enabled ? 'GOOGLE_FORM_CONNECTED' : 'GOOGLE_FORM_DISCONNECTED',
      targetType: 'formsConfiguration',
      targetId: config.id,
      metadata: { formId, formTitleSnapshot, enabled },
      timestamp: now,
    });

    logger.info(`[GoogleForms] Configured form ${formId} for community ${communityId}`);
    return config;
  }

  async getFormConfig(communityId: string): Promise<GoogleFormsConfig | null> {
    const configs = await googleFormsConfigsRepository.listForTenant(communityId);
    return configs[0] || null;
  }

  async importFormSubmission(
    communityId: string,
    submission: {
      submissionId: string;
      applicantDiscordUserId?: string;
      applicantUsername: string;
      answers: Record<string, string>;
      submittedAt?: string;
    }
  ): Promise<{ application: ApplicationDocument; isDuplicate: boolean }> {
    const now = new Date().toISOString();
    const formConfig = await this.getFormConfig(communityId);
    const formId = formConfig?.formId || 'form_default';

    // 1. Idempotency check via Integration Event Ledger
    const existingEvents = await integrationEventsRepository.listForTenant(communityId, {
      where: [
        { field: 'provider', operator: '==', value: 'GOOGLE_FORMS' },
        { field: 'externalEventId', operator: '==', value: submission.submissionId },
      ],
    });

    if (existingEvents.length > 0) {
      logger.info(`[GoogleForms] Duplicate submission ID ${submission.submissionId} detected. Idempotent return.`);
      const existingApps = await applicationsRepository.listForTenant(communityId, {
        where: [{ field: 'applicantUsernameSnapshot', operator: '==', value: submission.applicantUsername }],
      });
      if (existingApps.length > 0) {
        return { application: existingApps[0], isDuplicate: true };
      }
    }

    // Audit Import Started
    await auditLogsRepository.create({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'APPLICANT',
      action: 'GOOGLE_FORM_IMPORT_STARTED',
      targetType: 'googleFormsSubmission',
      targetId: submission.submissionId,
      metadata: { submissionId: submission.submissionId, username: submission.applicantUsername },
      timestamp: now,
    });

    // 2. Identity Resolution
    let resolvedDiscordUserId = 'IDENTITY_UNRESOLVED';
    const rawDiscordId = submission.applicantDiscordUserId || submission.answers['discordUserId'] || submission.answers['discordId'];

    if (rawDiscordId && typeof rawDiscordId === 'string') {
      const trimmed = rawDiscordId.trim();
      if (/^\d{17,20}$/.test(trimmed) || trimmed.startsWith('disc_') || trimmed.startsWith('usr_')) {
        resolvedDiscordUserId = trimmed;
      }
    }

    const processedAnswers = Object.entries(submission.answers || {}).map(([questionId, answerText]) => ({
      questionId,
      questionText: questionId,
      answerText: String(answerText || ''),
    }));

    // 3. Create Application
    const application = await applicationsRepository.create({
      communityId,
      applicantUserId: resolvedDiscordUserId,
      applicantDiscordUserId: resolvedDiscordUserId,
      applicantDiscordId: resolvedDiscordUserId,
      applicantUsernameSnapshot: submission.applicantUsername,
      applicantUsername: submission.applicantUsername,
      status: 'SUBMITTED',
      answers: processedAnswers,
      submittedAt: submission.submittedAt || now,
      source: 'GOOGLE_FORMS',
      createdAt: now,
      updatedAt: now,
    });

    // 4. Record Integration Event Ledger Entry
    await integrationEventsRepository.create({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      provider: 'GOOGLE_FORMS',
      eventType: 'FORM_SUBMISSION_IMPORTED',
      communityId,
      externalResourceId: formId,
      externalEventId: submission.submissionId,
      status: 'PROCESSED',
      receivedAt: now,
      processedAt: now,
      retryCount: 0,
    });

    // 5. Audit Import Completed
    await auditLogsRepository.create({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'APPLICANT',
      action: 'GOOGLE_FORM_IMPORT_COMPLETED',
      targetType: 'application',
      targetId: application.id,
      metadata: { submissionId: submission.submissionId, resolvedDiscordUserId },
      timestamp: now,
    });

    return { application, isDuplicate: false };
  }
}

export const googleFormsService = new GoogleFormsService();
