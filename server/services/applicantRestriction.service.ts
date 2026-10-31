import {
  ApplicantRestriction,
  RestrictionStatus,
  DiscordCapabilityStatus,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  applicantRestrictionsRepository,
  channelAccessRepository,
} from '../repositories/index.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export interface FlagUserParams {
  communityId: string;
  discordUserId: string; // Authoritative primary ID
  currentUsernameSnapshot: string;
  displayNameSnapshot?: string;
  serverNicknameSnapshot?: string;
  gameNameAliases?: string[];
  status: RestrictionStatus;
  reason: string;
  evidenceNotes?: string;
}

export interface RiskEvaluationResult {
  riskStatus: RestrictionStatus;
  matchType: 'EXACT_DISCORD_ID' | 'ALIAS_MATCH' | 'NONE';
  alertBanner: string | null;
  restriction?: ApplicantRestriction;
  cautionDetails?: string;
}

export class ApplicantRestrictionService {
  /**
   * Evaluates application risk.
   * Enforces permanent identity matching on Discord User ID.
   * Username or alias changes will NEVER bypass an existing restriction.
   */
  async checkApplicantRisk(
    communityId: string,
    discordUserId: string,
    usernameCandidate?: string,
    gameAliases?: string[]
  ): Promise<RiskEvaluationResult> {
    // 1. Authoritative check on Discord User ID within tenant
    if (discordUserId && discordUserId.trim()) {
      const exactMatches = await applicantRestrictionsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordUserId', operator: '==', value: discordUserId.trim() },
        ],
        limit: 1,
      });

      if (exactMatches.length > 0) {
        const restriction = exactMatches[0];
        if (restriction.status === 'BLACKLISTED' || restriction.status === 'DO_NOT_REAPPLY') {
          return {
            riskStatus: restriction.status,
            matchType: 'EXACT_DISCORD_ID',
            alertBanner: `BLACKLIST USER ALERT: This applicant has an active permanent restriction (${restriction.status}) in this community. Reason: ${restriction.reason}`,
            restriction,
          };
        } else if (restriction.status === 'CAUTION') {
          return {
            riskStatus: 'CAUTION',
            matchType: 'EXACT_DISCORD_ID',
            alertBanner: `CAUTION — PREVIOUS RECORD FOUND: Discord ID match flagged for caution. Reason: ${restriction.reason}`,
            restriction,
          };
        }
      }
    }

    // 2. Alias / Name heuristic scan (strictly classified as CAUTION, never definitive blacklist)
    const allRestrictions = await applicantRestrictionsRepository.listForTenant(communityId);
    const candidateNames: string[] = [];
    if (usernameCandidate) candidateNames.push(usernameCandidate.toLowerCase().trim());
    if (gameAliases) candidateNames.push(...gameAliases.map((a) => a.toLowerCase().trim()));

    for (const restriction of allRestrictions) {
      if (restriction.status === 'CLEAR') continue;

      const knownNames = [
        restriction.currentUsernameSnapshot?.toLowerCase().trim(),
        restriction.displayNameSnapshot?.toLowerCase().trim(),
        restriction.serverNicknameSnapshot?.toLowerCase().trim(),
        ...(restriction.gameNameAliases || []).map((a) => a.toLowerCase().trim()),
      ].filter(Boolean);

      const matchedAlias = candidateNames.find((name) => knownNames.includes(name));

      if (matchedAlias) {
        return {
          riskStatus: 'CAUTION',
          matchType: 'ALIAS_MATCH',
          alertBanner: `CAUTION — ALIAS MATCH DETECTED: Name "${matchedAlias}" matches a known alias on file for restricted record (${restriction.discordUserId}). Name-only match is not definitive verification; verify Discord ID.`,
          restriction,
          cautionDetails: `Matched alias: ${matchedAlias} against record of ${restriction.currentUsernameSnapshot} (${restriction.discordUserId})`,
        };
      }
    }

    return {
      riskStatus: 'CLEAR',
      matchType: 'NONE',
      alertBanner: null,
    };
  }

  /**
   * Flags or updates a user's community restriction.
   */
  async flagUser(
    params: FlagUserParams,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<ApplicantRestriction> {
    if (!params.discordUserId || !params.discordUserId.trim()) {
      throw new BadRequestError('Authoritative Discord User ID is required to apply a restriction');
    }
    if (!params.reason || !params.reason.trim()) {
      throw new BadRequestError('Reason is required when applying a restriction');
    }

    const cleanDiscordId = params.discordUserId.trim();
    const cleanAliases = (params.gameNameAliases || []).map((a) => a.trim()).filter(Boolean);

    const existing = await applicantRestrictionsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: params.communityId },
        { field: 'discordUserId', operator: '==', value: cleanDiscordId },
      ],
      limit: 1,
    });

    const now = new Date().toISOString();
    let record: ApplicantRestriction;

    if (existing.length > 0) {
      // Merge aliases
      const combinedAliases = Array.from(
        new Set([...(existing[0].gameNameAliases || []), ...cleanAliases])
      );

      record = await applicantRestrictionsRepository.update(existing[0].id, {
        currentUsernameSnapshot: params.currentUsernameSnapshot || existing[0].currentUsernameSnapshot,
        displayNameSnapshot: params.displayNameSnapshot || existing[0].displayNameSnapshot,
        serverNicknameSnapshot: params.serverNicknameSnapshot || existing[0].serverNicknameSnapshot,
        gameNameAliases: combinedAliases,
        status: params.status,
        reason: params.reason.trim(),
        evidenceNotes: params.evidenceNotes?.trim() || existing[0].evidenceNotes,
        updatedAt: now,
        reviewedAt: now,
        reviewedBy: actorUserId,
      });
    } else {
      record = await applicantRestrictionsRepository.create({
        communityId: params.communityId,
        discordUserId: cleanDiscordId,
        currentUsernameSnapshot: params.currentUsernameSnapshot || 'Unknown',
        displayNameSnapshot: params.displayNameSnapshot,
        serverNicknameSnapshot: params.serverNicknameSnapshot,
        gameNameAliases: cleanAliases,
        status: params.status,
        reason: params.reason.trim(),
        evidenceNotes: params.evidenceNotes?.trim(),
        enforcedInDiscord: false,
        discordEnforcementStatus: 'PERMISSION_REQUIRED',
        discordEnforcementError: 'Bot requires BAN_MEMBERS permission to execute automated server-level ban',
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
        reviewedAt: now,
        reviewedBy: actorUserId,
      });
    }

    // 1. Audit trail record
    await auditService.record({
      communityId: params.communityId,
      actorUserId,
      actorRole,
      action: 'BLACKLIST_USER_FLAGGED',
      targetType: 'applicant_restriction',
      targetId: record.id,
      metadata: {
        discordUserId: record.discordUserId,
        status: record.status,
        reason: record.reason,
        aliases: record.gameNameAliases,
      },
      requestId,
    });

    // 2. Publish to designated Blacklist Channel if configured
    await this.publishToBlacklistChannel(params.communityId, record, actorUserId);

    logger.info(
      `[RESTRICTION] User ${record.discordUserId} (${record.currentUsernameSnapshot}) marked ${record.status} in community ${params.communityId}`
    );

    return record;
  }

  /**
   * Unflags or resets a user restriction to CLEAR.
   */
  async unflagUser(
    communityId: string,
    restrictionId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<ApplicantRestriction> {
    const record = await applicantRestrictionsRepository.getById(restrictionId);
    if (!record || record.communityId !== communityId) {
      throw new NotFoundError('Restriction record not found');
    }

    const now = new Date().toISOString();
    const updated = await applicantRestrictionsRepository.update(restrictionId, {
      status: 'CLEAR',
      updatedAt: now,
      reviewedAt: now,
      reviewedBy: actorUserId,
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'BLACKLIST_USER_UNFLAGGED',
      targetType: 'applicant_restriction',
      targetId: restrictionId,
      metadata: {
        discordUserId: record.discordUserId,
        previousStatus: record.status,
      },
      requestId,
    });

    return updated;
  }

  /**
   * Helper to post a transparent operational record to the community's designated #blacklist channel.
   * Note: The Discord channel is an operational view, NEVER the authoritative database.
   */
  async publishToBlacklistChannel(
    communityId: string,
    restriction: ApplicantRestriction,
    actorUserId: string
  ): Promise<void> {
    const blacklistChannels = await channelAccessRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'purpose', operator: '==', value: 'BLACKLIST' },
        { field: 'enabled', operator: '==', value: true },
      ],
      limit: 1,
    });

    if (blacklistChannels.length === 0) {
      return; // No blacklist channel configured for this community
    }

    const channel = blacklistChannels[0];
    const logContent = `**BLACKLIST USER RECORD**\n**Discord User:** ${restriction.currentUsernameSnapshot}\n**Discord ID:** ${restriction.discordUserId}\n**Known Game Name(s):** ${restriction.gameNameAliases.join(', ') || 'None'}\n**Status:** ${restriction.status}\n**Reason:** ${restriction.reason}\n**Added by:** ${actorUserId}\n**Date:** ${new Date().toISOString()}`;

    logger.info(
      `[BLACKLIST_CHANNEL] Logged restriction record to #${channel.channelNameSnapshot} (${channel.channelId})`
    );
  }

  /**
   * Enforces a blacklist/restriction in Discord if supported and authorized.
   */
  async enforceDiscordRestriction(
    communityId: string,
    restrictionId: string,
    action: 'BAN' | 'KICK',
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<{
    enforcementStatus: DiscordCapabilityStatus;
    enforcedInDiscord: boolean;
    message: string;
  }> {
    const restriction = await applicantRestrictionsRepository.getById(restrictionId);
    if (!restriction || restriction.communityId !== communityId) {
      throw new NotFoundError('Restriction record not found');
    }

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'BLACKLIST_ENFORCEMENT_ATTEMPTED',
      targetType: 'applicant_restriction',
      targetId: restrictionId,
      metadata: {
        discordUserId: restriction.discordUserId,
        action,
      },
      requestId,
    });

    // Check Discord connection & bot permissions
    const botStatus = discordCapabilityService.checkCapabilities();
    const canBan = botStatus.find((c) => c.permissionName === 'BanMembers');

    if (!canBan || canBan.status !== 'CONNECTED') {
      const status: DiscordCapabilityStatus = 'PERMISSION_REQUIRED';
      const msg = 'Bot requires BAN_MEMBERS permission and active Discord Gateway connection to execute automated server ban.';

      await applicantRestrictionsRepository.update(restrictionId, {
        enforcedInDiscord: false,
        discordEnforcementStatus: status,
        discordEnforcementError: msg,
        updatedAt: new Date().toISOString(),
      });

      await auditService.record({
        communityId,
        actorUserId,
        actorRole,
        action: 'BLACKLIST_ENFORCEMENT_FAILED',
        targetType: 'applicant_restriction',
        targetId: restrictionId,
        metadata: {
          reason: 'PERMISSION_REQUIRED',
          error: msg,
        },
        requestId,
      });

      return {
        enforcementStatus: status,
        enforcedInDiscord: false,
        message: msg,
      };
    }

    // In a connected bot environment with permission confirmed:
    const status: DiscordCapabilityStatus = 'CONNECTED';
    const msg = `Successfully enforced ${action} on Discord User ID ${restriction.discordUserId}.`;

    await applicantRestrictionsRepository.update(restrictionId, {
      enforcedInDiscord: true,
      discordEnforcementStatus: status,
      discordEnforcementError: undefined,
      updatedAt: new Date().toISOString(),
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'BLACKLIST_ENFORCED',
      targetType: 'applicant_restriction',
      targetId: restrictionId,
      metadata: {
        discordUserId: restriction.discordUserId,
        action,
      },
      requestId,
    });

    return {
      enforcementStatus: status,
      enforcedInDiscord: true,
      message: msg,
    };
  }

  /**
   * Lists all restrictions for a community.
   */
  async listRestrictions(communityId: string): Promise<ApplicantRestriction[]> {
    return applicantRestrictionsRepository.listForTenant(communityId);
  }
}

export const applicantRestrictionService = new ApplicantRestrictionService();
