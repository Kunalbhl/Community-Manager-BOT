import { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { createRecruiterCodeCommand, recruiterCodeCommand } from './recruiterCode.command.js';
import { recruiterCommand } from './recruiter.command.js';
import { applicationsCommand, applicationCommand } from './application.command.js';
import { interviewCommand } from './interview.command.js';
import { referralCommand } from './referral.command.js';
import { blacklistCommand } from './blacklist.command.js';
import { recruiterBenefitsCommand } from './recruiterBenefits.command.js';
import { rulesCommand } from './rules.command.js';
import { supportCommand } from './support.command.js';
import { helpCommand } from './help.command.js';
import { userStatusCommand } from './userStatus.command.js';
import { communityManagerPortalCommand } from './portal.command.js';
import { approveCommand, rejectCommand, escalateCommand } from './reviewDecision.command.js';
import { ticketCommand, warnCommand, warningsCommand } from './toolkit.command.js';
import { communitiesRepository } from '../../../repositories/index.js';
import { resolveUserCommunityRole } from '../../../services/authorization.service.js';
import { auditService } from '../../../services/audit.service.js';
import { logger } from '../../../logging/logger.js';

export * from './types.js';

export const discordCommands: SlashCommandDefinition[] = [
  communityManagerPortalCommand, // /community-manager
  userStatusCommand,            // /user-status
  applicationsCommand,          // /applications
  applicationCommand,           // /application (alias)
  interviewCommand,             // /interview
  approveCommand,               // /approve
  rejectCommand,                // /reject
  escalateCommand,              // /escalate
  createRecruiterCodeCommand,   // /create-recruiter-code
  recruiterCodeCommand,         // /recruiter-code (alias)
  blacklistCommand,             // /blacklist
  recruiterCommand,             // /recruiter
  referralCommand,              // /referral
  recruiterBenefitsCommand,     // /recruiter-benefits
  rulesCommand,                 // /rules
  supportCommand,               // /support
  ticketCommand,                // /ticket
  warnCommand,                  // /warn
  warningsCommand,              // /warnings
  helpCommand,                  // /help
];

const ROLE_ORDER: Record<string, number> = {
  APPLICANT: 0,
  MEMBER: 1,
  RECRUITER: 2,
  INTERVIEWER: 3,
  CONTROLLER: 4,
  OWNER: 5,
  PLATFORM_OWNER: 6,
};

export interface CanonicalCommandRegistryItem {
  command: string;
  description: string;
  category: string;
  minimumRole: string;
  permission?: string;
  status: 'ACTIVE' | 'ALIAS' | 'DEPRECATED';
}

export function getCanonicalCommandRegistry(): CanonicalCommandRegistryItem[] {
  return discordCommands.map((cmd) => ({
    command: `/${cmd.data.name}`,
    description: cmd.data.description,
    category: cmd.category,
    minimumRole: cmd.minimumRole,
    permission: cmd.requiredPermission,
    status: cmd.status || 'ACTIVE',
  }));
}

export function getRoleAwareCommands(userRole: string, userPermissions: string[] = []): CanonicalCommandRegistryItem[] {
  const userLevel = ROLE_ORDER[userRole] ?? 0;
  return getCanonicalCommandRegistry().filter((item) => {
    if (item.status !== 'ACTIVE') return false;
    const requiredLevel = ROLE_ORDER[item.minimumRole] ?? 0;
    if (userLevel >= requiredLevel) return true;
    if (item.permission && userPermissions.includes(item.permission as any)) return true;
    if (['PLATFORM_OWNER', 'OWNER'].includes(userRole)) return true;
    return false;
  });
}

const commandMap = new Map<string, SlashCommandDefinition>();
for (const cmd of discordCommands) {
  commandMap.set(cmd.data.name, cmd);
}

/**
 * Dispatches an incoming slash command interaction with authoritative guild/tenant binding,
 * real Discord User ID resolution, server-side role resolution, and security audit logging.
 */
export async function handleCommandInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  const commandName = interaction.commandName;
  const command = commandMap.get(commandName);

  if (!command) {
    await interaction.reply({
      content: `❌ Unknown command \`/${commandName}\`.`,
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: `⚠️ Community Manager commands must be executed within a Discord server.`,
      ephemeral: true,
    });
    return;
  }

  // Look up authoritative communityId by guildId
  const communities = await communitiesRepository.list({
    where: [{ field: 'guildId', operator: '==', value: guildId }],
    limit: 1,
  });

  let communityId: string;
  if (communities.length > 0) {
    communityId = communities[0].id;
  } else {
    logger.warn(`[DiscordCommand] Blocked execution of /${commandName}: Guild ${guildId} is not linked to an active Community workspace.`);
    await interaction.reply({
      content: `❌ **Error: GUILD_NOT_LINKED / COMMUNITY_NOT_FOUND**\n\nThis Discord server has not been linked to a Community workspace yet. Please complete the setup via the onboarding portal first.`,
      ephemeral: true,
    });
    return;
  }

  // Extract member's actual Discord roles from interaction
  const memberRoles: string[] = [];
  if (interaction.member && 'roles' in interaction.member) {
    const rolesProp = interaction.member.roles;
    if (Array.isArray(rolesProp)) {
      memberRoles.push(...rolesProp);
    } else if (rolesProp && 'cache' in rolesProp) {
      memberRoles.push(...Array.from((rolesProp as any).cache.keys()).map((k: any) => String(k)));
    }
  }

  // Authoritative server-side role resolution
  const access = await resolveUserCommunityRole(interaction.user.id, communityId, memberRoles);

  const context: CommandContext = {
    communityId,
    guildId,
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.username,
    effectiveRole: access.role,
    permissions: access.permissions,
  };

  // Enforce required roles or permissions if specified on the command definition
  if (command.requiredRoles && command.requiredRoles.length > 0) {
    if (!command.requiredRoles.includes(access.role) && !['PLATFORM_OWNER', 'OWNER'].includes(access.role)) {
      await auditService.record({
        communityId,
        guildId,
        actorUserId: `usr_${interaction.user.id}`,
        discordUserId: interaction.user.id,
        actorRole: access.role,
        effectiveRole: access.role,
        action: 'PERMISSION_DENIED',
        targetType: 'bot_command',
        targetId: commandName,
        metadata: {
          commandName,
          requiredRoles: command.requiredRoles,
          userRole: access.role,
        },
      });

      await interaction.reply({
        content: `⛔ **PERMISSION_REQUIRED**: This command requires one of the following roles: \`${command.requiredRoles.join(', ')}\`. Your effective role is \`${access.role}\`.`,
        ephemeral: true,
      });
      return;
    }
  }

  if (command.requiredPermission) {
    const isAllowed =
      access.role === 'PLATFORM_OWNER' ||
      access.role === 'OWNER' ||
      access.permissions.includes(command.requiredPermission);

    if (!isAllowed) {
      await auditService.record({
        communityId,
        guildId,
        actorUserId: `usr_${interaction.user.id}`,
        discordUserId: interaction.user.id,
        actorRole: access.role,
        effectiveRole: access.role,
        action: 'PERMISSION_DENIED',
        targetType: 'bot_command',
        targetId: commandName,
        metadata: {
          commandName,
          requiredPermission: command.requiredPermission,
          userRole: access.role,
        },
      });

      await interaction.reply({
        content: `⛔ **PERMISSION_REQUIRED**: You lack the \`${command.requiredPermission}\` permission required for \`/${commandName}\`.`,
        ephemeral: true,
      });
      return;
    }
  }

  try {
    await command.execute(interaction, context);

    // Audit log successful command execution
    await auditService.record({
      communityId,
      guildId,
      actorUserId: `usr_${interaction.user.id}`,
      discordUserId: interaction.user.id,
      actorRole: access.role,
      effectiveRole: access.role,
      action: 'BOT_COMMAND_EXECUTED',
      targetType: 'bot_command',
      targetId: commandName,
      metadata: {
        commandName,
        options: interaction.options.data.map((o) => ({ name: o.name, value: o.value })),
      },
      source: 'DISCORD_GATEWAY',
    });
  } catch (err) {
    logger.error(`[DiscordCommand] Error executing /${commandName}:`, undefined, {
      error: (err as Error).message,
      guildId,
      userId: interaction.user.id,
    });

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: `⚠️ An error occurred while executing this command: ${(err as Error).message}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `⚠️ An error occurred while executing this command: ${(err as Error).message}`,
        ephemeral: true,
      });
    }
  }
}
