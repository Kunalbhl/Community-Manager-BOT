import {
  CommunityConfiguration,
  RecruiterIdentityConfig,
  DEFAULT_RECRUITER_NAME,
  DEFAULT_RECRUITER_GREETING,
} from '../../shared/types/community.js';
import { UserRole } from '../../shared/types/rbac.js';
import { communityConfigurationRepository } from '../repositories/index.js';
import { auditService } from './audit.service.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';

export class CommunityConfigurationService {
  /**
   * Validates a candidate community recruiter display name.
   * Rules:
   * - 2 to 40 characters
   * - Trimmed string, not empty
   * - No control characters
   * - No raw HTML or script tags
   * - No Discord mass mentions (@everyone, @here)
   */
  validateRecruiterName(name: string): string {
    if (typeof name !== 'string') {
      throw new BadRequestError('Recruiter display name must be a string');
    }

    const trimmed = name.trim();

    if (trimmed.length < 2) {
      throw new BadRequestError('Recruiter display name must be at least 2 characters long');
    }

    if (trimmed.length > 40) {
      throw new BadRequestError('Recruiter display name must not exceed 40 characters');
    }

    // Control characters check
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      throw new BadRequestError('Recruiter display name contains invalid control characters');
    }

    // Malicious HTML / script injection check
    if (/<[^>]*>|javascript:|data:/i.test(trimmed)) {
      throw new BadRequestError('Recruiter display name contains disallowed markup or scripts');
    }

    // Discord mass mentions check
    if (/@everyone|@here/i.test(trimmed)) {
      throw new BadRequestError('Recruiter display name cannot contain mass Discord mentions');
    }

    return trimmed;
  }

  /**
   * Validates an optional custom greeting.
   */
  validateGreeting(greeting?: string): string | undefined {
    if (!greeting) return undefined;
    const trimmed = greeting.trim();
    if (trimmed.length < 5) {
      throw new BadRequestError('Welcome greeting must be at least 5 characters long');
    }
    if (trimmed.length > 300) {
      throw new BadRequestError('Welcome greeting must not exceed 300 characters');
    }
    if (/<[^>]*>|javascript:|data:/i.test(trimmed)) {
      throw new BadRequestError('Welcome greeting contains disallowed markup or scripts');
    }
    if (/@everyone|@here/i.test(trimmed)) {
      throw new BadRequestError('Welcome greeting cannot contain mass Discord mentions');
    }
    return trimmed;
  }

  /**
   * Retrieves the community recruiter identity persona for a given tenant.
   * Safe fallback: Never returns null, undefined, or empty string for recruiterDisplayName.
   */
  async getCommunityRecruiterIdentity(communityId: string): Promise<RecruiterIdentityConfig> {
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    const config = await communityConfigurationRepository.getById(communityId);

    const displayName =
      config?.recruiterDisplayName && config.recruiterDisplayName.trim().length >= 2
        ? config.recruiterDisplayName.trim()
        : DEFAULT_RECRUITER_NAME;

    const welcomeGreeting =
      config?.recruiterWelcomeGreeting && config.recruiterWelcomeGreeting.trim().length >= 5
        ? config.recruiterWelcomeGreeting.trim()
        : DEFAULT_RECRUITER_GREETING;

    return {
      recruiterDisplayName: displayName,
      recruiterWelcomeGreeting: welcomeGreeting,
      recruiterAvatarUrl: config?.recruiterAvatarUrl,
      recruiterPersonaEnabled: config?.recruiterPersonaEnabled !== false,
      recruiterCodeRequired: config?.recruiterCodeRequired !== false,
      updatedAt: config?.updatedAt,
      updatedBy: config?.updatedBy,
    };
  }

  /**
   * Helper to retrieve only the resolved recruiter display name for a community.
   */
  async getRecruiterDisplayName(communityId: string): Promise<string> {
    const identity = await this.getCommunityRecruiterIdentity(communityId);
    return identity.recruiterDisplayName;
  }

  /**
   * Updates the community recruiter identity for a tenant.
   * Enforces validation, tenant isolation, and audit logging.
   */
  async updateCommunityRecruiterIdentity(
    communityId: string,
    updates: {
      recruiterDisplayName?: string;
      recruiterWelcomeGreeting?: string;
      recruiterAvatarUrl?: string;
      recruiterPersonaEnabled?: boolean;
    },
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<RecruiterIdentityConfig> {
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    let validatedName: string | undefined;
    if (updates.recruiterDisplayName !== undefined) {
      validatedName = this.validateRecruiterName(updates.recruiterDisplayName);
    }

    let validatedGreeting: string | undefined;
    if (updates.recruiterWelcomeGreeting !== undefined) {
      validatedGreeting = this.validateGreeting(updates.recruiterWelcomeGreeting);
    }

    let config = await communityConfigurationRepository.getById(communityId);
    const previousName = config?.recruiterDisplayName || DEFAULT_RECRUITER_NAME;
    const now = new Date().toISOString();

    const patch: Partial<CommunityConfiguration> = {
      updatedAt: now,
      updatedBy: actorUserId,
    };

    if (validatedName !== undefined) {
      patch.recruiterDisplayName = validatedName;
    }
    if (validatedGreeting !== undefined) {
      patch.recruiterWelcomeGreeting = validatedGreeting;
    }
    if (updates.recruiterAvatarUrl !== undefined) {
      patch.recruiterAvatarUrl = updates.recruiterAvatarUrl;
    }
    if (updates.recruiterPersonaEnabled !== undefined) {
      patch.recruiterPersonaEnabled = updates.recruiterPersonaEnabled;
    }

    if (!config) {
      // Initialize full configuration record for tenant if not already present
      const initialDoc: CommunityConfiguration = {
        id: communityId,
        communityId,
        communityName: 'Discord Community',
        description: 'Community recruitment pipeline',
        mission: 'Recruit and onboard exceptional community members.',
        rules: ['Be respectful', 'Follow community guidelines'],
        guidelines: ['Active participation'],
        requirements: ['Verified Discord account'],
        applicationEnabled: true,
        interviewEnabled: true,
        recruiterCodeRequired: true,
        automaticRecruiterCodeGeneration: true,
        manualRecruiterCodesAllowed: true,
        aiAnalysisEnabled: true,
        dmNotificationsEnabled: true,
        welcomeMessageEnabled: true,
        publicInformation: [],
        memberInformation: [],
        applicantInformation: [],
        recruiterInformation: [],
        recruiterDisplayName: validatedName || DEFAULT_RECRUITER_NAME,
        recruiterWelcomeGreeting: validatedGreeting || DEFAULT_RECRUITER_GREETING,
        recruiterAvatarUrl: updates.recruiterAvatarUrl,
        recruiterPersonaEnabled: updates.recruiterPersonaEnabled !== false,
        createdAt: now,
        updatedAt: now,
        updatedBy: actorUserId,
      };

      config = await communityConfigurationRepository.create(initialDoc);
    } else {
      config = await communityConfigurationRepository.update(communityId, patch);
    }

    const newName = config.recruiterDisplayName || DEFAULT_RECRUITER_NAME;

    // Record structured audit event for recruiter persona personalization
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'RECRUITER_DISPLAY_NAME_CHANGED',
      targetType: 'community_configuration',
      targetId: communityId,
      metadata: {
        previousName,
        newName,
        newRecruiterDisplayName: newName,
        recruiterPersonaEnabled: config.recruiterPersonaEnabled,
      },
      requestId,
    });

    logger.info(
      `[RECRUITER_PERSONA] Community ${communityId} recruiter persona updated to "${newName}" by ${actorUserId} (${actorRole})`
    );

    return {
      recruiterDisplayName: newName,
      recruiterWelcomeGreeting: config.recruiterWelcomeGreeting || DEFAULT_RECRUITER_GREETING,
      recruiterAvatarUrl: config.recruiterAvatarUrl,
      recruiterPersonaEnabled: config.recruiterPersonaEnabled !== false,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    };
  }

  /**
   * Resets community recruiter persona back to system default ("Community Recruiter").
   */
  async resetCommunityRecruiterIdentity(
    communityId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<RecruiterIdentityConfig> {
    return this.updateCommunityRecruiterIdentity(
      communityId,
      {
        recruiterDisplayName: DEFAULT_RECRUITER_NAME,
        recruiterWelcomeGreeting: DEFAULT_RECRUITER_GREETING,
        recruiterPersonaEnabled: true,
      },
      actorUserId,
      actorRole,
      requestId
    );
  }

  /**
   * Resolves notification template variables, ensuring {{recruiterName}} is dynamically
   * substituted from the community's personalized identity.
   */
  resolveTemplate(
    template: string,
    variables: {
      recruiterName?: string;
      applicantName?: string;
      applicationId?: string;
      communityName?: string;
      [key: string]: string | undefined;
    }
  ): string {
    let output = template;
    for (const [key, val] of Object.entries(variables)) {
      if (val !== undefined) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        output = output.replace(regex, val);
      }
    }
    return output;
  }

  /**
   * Resolves notification template variables for a given community, automatically
   * substituting the community's personalized {{recruiterName}}.
   */
  async resolveCommunityTemplate(
    communityId: string,
    template: string,
    variables: {
      applicantName?: string;
      applicationId?: string;
      communityName?: string;
      [key: string]: string | undefined;
    } = {}
  ): Promise<string> {
    const recruiterName = await this.getRecruiterDisplayName(communityId);
    return this.resolveTemplate(template, {
      recruiterName,
      ...variables,
    });
  }
}

export const communityConfigurationService = new CommunityConfigurationService();
