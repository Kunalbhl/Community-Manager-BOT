import {
  discordMembersRepository,
  recruiterCodesRepository,
  auditLogsRepository,
  communitiesRepository,
} from '../repositories/index.js';
import {
  DiscordMemberDocument,
  MemberSyncState,
  AttributionType,
} from '../../shared/types/models.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordResourceService } from './discordResource.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { UserRole } from '../../shared/types/rbac.js';

export interface BulkImportRow {
  discordUserId: string;
  recruiterCode?: string;
  username?: string;
}

export interface BulkImportPreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  unchangedRows: number;
  details: {
    rowIndex: number;
    discordUserId: string;
    username?: string;
    recruiterCode?: string;
    status: 'VALID' | 'INVALID' | 'UNCHANGED';
    reason?: string;
  }[];
}

export class DiscordMemberSyncService {
  /**
   * Synchronizes server members from Discord into local repository.
   * Truthful states, real gateway records, idempotent updates.
   */
  async syncGuildMembers(
    communityId: string,
    discordGuildId: string
  ): Promise<{ syncedCount: number; state: MemberSyncState; syncedAt: string }> {
    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const syncedAt = new Date().toISOString();
    const effectiveGuildId = discordGuildId || community.guildId || community.discordGuildId;

    if (!effectiveGuildId) {
      return { syncedCount: 0, state: 'DISCONNECTED', syncedAt };
    }

    // Check if Discord bot is connected and can access guild
    if (!discordService.isConnected()) {
      logger.info(`[DiscordMemberSync] Bot gateway offline for community ${communityId}. Cannot sync members with live Discord server.`);
      const gatewayState = discordService.getConnectionState();
      const state = gatewayState === 'AUTHENTICATION_REQUIRED' ? 'AUTHENTICATION_FAILED' : 'DISCONNECTED';
      return { syncedCount: 0, state: state as MemberSyncState, syncedAt };
    }

    try {
      logger.info(`[DiscordMemberSync] Syncing members for community ${communityId} (Guild: ${effectiveGuildId})`);
      const membersRes = await discordResourceService.getMembers(effectiveGuildId, { limit: 1000 });
      if (!membersRes.success) {
        return { syncedCount: 0, state: membersRes.state === 'DISCONNECTED' ? 'DISCONNECTED' : 'FAILED', syncedAt };
      }

      let count = 0;
      for (const m of membersRes.items) {
        const memberId = `${communityId}_${m.discordUserId}`;
        const existing = await discordMembersRepository.getById(memberId);
        if (existing) {
          await discordMembersRepository.update(memberId, {
            usernameSnapshot: m.username,
            displayNameSnapshot: m.displayName,
            discordRoleIds: m.roleIds,
            syncedAt,
            syncState: 'SYNCED',
            avatarSnapshot: m.avatarUrl || undefined,
          });
        } else {
          await discordMembersRepository.create({
            id: memberId,
            communityId,
            discordGuildId: effectiveGuildId,
            discordUserId: m.discordUserId,
            usernameSnapshot: m.username,
            displayNameSnapshot: m.displayName,
            discordRoleIds: m.roleIds,
            syncedAt,
            source: 'DISCORD_SYNC',
            membershipStatus: 'ACTIVE',
            syncState: 'SYNCED',
            avatarSnapshot: m.avatarUrl || undefined,
            createdAt: syncedAt,
            updatedAt: syncedAt,
          } as any);
        }
        count++;
      }

      return { syncedCount: count, state: 'SYNCED', syncedAt };
    } catch (err) {
      logger.error(`[DiscordMemberSync] Member sync failed for community ${communityId}:`, undefined, { error: (err as Error).message });
      return { syncedCount: 0, state: 'FAILED', syncedAt };
    }
  }

  /**
   * Assigns a recruiter code manually to an existing member.
   */
  async assignManualRecruiterCode(params: {
    communityId: string;
    discordUserId: string;
    recruiterCode: string;
    actorUserId: string;
    actorRole: UserRole;
  }): Promise<DiscordMemberDocument> {
    const { communityId, discordUserId, recruiterCode, actorUserId, actorRole } = params;

    const memberId = `${communityId}_${discordUserId}`;
    let member = await discordMembersRepository.getById(memberId);

    if (!member) {
      const community = await communitiesRepository.getById(communityId);
      const guildId = community?.guildId || community?.discordGuildId || '';
      const liveMember = guildId ? await discordResourceService.getMember(guildId, discordUserId) : null;

      member = {
        id: memberId,
        communityId,
        discordGuildId: guildId,
        discordUserId,
        usernameSnapshot: liveMember?.username || `discord_user_${discordUserId}`,
        displayNameSnapshot: liveMember?.displayName || `Discord Member (${discordUserId})`,
        discordRoleIds: liveMember?.roleIds || [],
        syncedAt: new Date().toISOString(),
        source: 'MANUAL_ADD',
        membershipStatus: 'ACTIVE',
        syncState: 'SYNCED',
      };
    }

    // Validate code exists and belongs to this community
    const allCodes = await recruiterCodesRepository.listForTenant(communityId);
    const validCode = allCodes.find((c) => c.code.trim().toUpperCase() === recruiterCode.trim().toUpperCase());

    if (!validCode) {
      throw new BadRequestError(`Recruiter code '${recruiterCode}' not found in community ${communityId}`);
    }

    const oldCode = member.recruiterCode;
    const newCode = validCode.code.toUpperCase();

    member.recruiterCode = newCode;
    member.recruiterUserId = validCode.recruiterUserId;
    member.attributionType = 'HISTORICAL';
    member.syncedAt = new Date().toISOString();

    const existingMember = await discordMembersRepository.getById(memberId);
    if (existingMember) {
      await discordMembersRepository.update(memberId, member);
    } else {
      await discordMembersRepository.create(member);
    }

    // Audit log
    await auditLogsRepository.create({
      id: `audit_attr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      communityId,
      actorUserId,
      actorRole,
      action: 'RECRUITER_DISPLAY_NAME_CHANGED', // or attribution event
      targetType: 'member_attribution',
      targetId: memberId,
      metadata: {
        discordUserId,
        oldRecruiterCode: oldCode || null,
        newRecruiterCode: newCode,
        source: 'MANUAL',
        attributionType: 'HISTORICAL',
      },
      timestamp: new Date().toISOString(),
    });

    return member;
  }

  /**
   * Validates bulk CSV/XLSX import rows before applying.
   */
  async previewBulkMemberImport(
    communityId: string,
    rows: BulkImportRow[]
  ): Promise<BulkImportPreviewResult> {
    const allCodes = await recruiterCodesRepository.listForTenant(communityId);
    const validCodesSet = new Set(allCodes.map((c) => c.code.toUpperCase()));

    let validRows = 0;
    let invalidRows = 0;
    let unchangedRows = 0;

    const details: BulkImportPreviewResult['details'] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dUserId = (row.discordUserId || '').trim();
      const code = (row.recruiterCode || '').trim().toUpperCase();

      if (!dUserId) {
        invalidRows++;
        details.push({
          rowIndex: i + 1,
          discordUserId: dUserId,
          username: row.username,
          recruiterCode: code,
          status: 'INVALID',
          reason: 'Missing required Discord User ID',
        });
        continue;
      }

      if (code && !validCodesSet.has(code)) {
        invalidRows++;
        details.push({
          rowIndex: i + 1,
          discordUserId: dUserId,
          username: row.username,
          recruiterCode: code,
          status: 'INVALID',
          reason: `Recruiter code '${code}' does not exist in community ${communityId}`,
        });
        continue;
      }

      const memberId = `${communityId}_${dUserId}`;
      const existingMember = await discordMembersRepository.getById(memberId);

      if (existingMember && existingMember.recruiterCode === code) {
        unchangedRows++;
        details.push({
          rowIndex: i + 1,
          discordUserId: dUserId,
          username: row.username || existingMember.usernameSnapshot,
          recruiterCode: code,
          status: 'UNCHANGED',
          reason: 'Member already assigned this recruiter code',
        });
        continue;
      }

      validRows++;
      details.push({
        rowIndex: i + 1,
        discordUserId: dUserId,
        username: row.username || existingMember?.usernameSnapshot || `User_${dUserId.slice(-4)}`,
        recruiterCode: code,
        status: 'VALID',
      });
    }

    return {
      totalRows: rows.length,
      validRows,
      invalidRows,
      unchangedRows,
      details,
    };
  }

  /**
   * Applies validated bulk import rows.
   */
  async confirmBulkMemberImport(params: {
    communityId: string;
    rows: BulkImportRow[];
    actorUserId: string;
    actorRole: UserRole;
  }): Promise<{ appliedCount: number; failedCount: number }> {
    const { communityId, rows, actorUserId, actorRole } = params;

    const preview = await this.previewBulkMemberImport(communityId, rows);
    let appliedCount = 0;
    let failedCount = 0;

    for (const item of preview.details) {
      if (item.status === 'VALID') {
        try {
          await this.assignManualRecruiterCode({
            communityId,
            discordUserId: item.discordUserId,
            recruiterCode: item.recruiterCode || '',
            actorUserId,
            actorRole,
          });
          appliedCount++;
        } catch (err) {
          failedCount++;
          logger.warn(`[BulkImport] Failed to apply row ${item.rowIndex}: ${(err as Error).message}`);
        }
      }
    }

    // Audit bulk import event
    await auditLogsRepository.create({
      id: `audit_bulk_${Date.now()}`,
      communityId,
      actorUserId,
      actorRole,
      action: 'GOOGLE_SHEET_SYNCED', // or bulk attribution
      targetType: 'bulk_member_import',
      targetId: `bulk_${communityId}`,
      metadata: {
        totalRows: rows.length,
        appliedCount,
        failedCount,
        source: 'BULK_IMPORT',
      },
      timestamp: new Date().toISOString(),
    });

    return { appliedCount, failedCount };
  }

  /**
   * Export community members to CSV format.
   */
  async exportMembersCsv(communityId: string): Promise<string> {
    const members = await discordMembersRepository.listForTenant(communityId);

    const headers = [
      'Discord User ID',
      'Username',
      'Display Name',
      'Nickname',
      'Joined At',
      'Current Recruiter Code',
      'Recruiter',
      'Recruiter Code Status',
      'Last Synced',
      'Membership Status',
    ];

    const csvRows = [headers.join(',')];

    for (const m of members) {
      const row = [
        m.discordUserId,
        `"${(m.usernameSnapshot || '').replace(/"/g, '""')}"`,
        `"${(m.displayNameSnapshot || '').replace(/"/g, '""')}"`,
        `"${(m.nicknameSnapshot || '').replace(/"/g, '""')}"`,
        m.joinedAt || '',
        m.recruiterCode || '',
        m.recruiterUserId || '',
        m.recruiterCode ? 'ASSIGNED' : 'UNASSIGNED',
        m.syncedAt || '',
        m.membershipStatus || 'ACTIVE',
      ];
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }
}

export const discordMemberSyncService = new DiscordMemberSyncService();
