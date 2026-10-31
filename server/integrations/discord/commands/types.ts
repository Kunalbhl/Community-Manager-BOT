import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import { UserRole, Permission } from '../../../../shared/types/rbac.js';

export type CommandCategory =
  | 'PORTAL_SETUP'
  | 'COMMUNITY_MEMBER'
  | 'RECRUITMENT_REFERRALS'
  | 'INTERVIEWS_REVIEW'
  | 'SECURITY_MODERATION';

export interface SlashCommandDefinition {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  category: CommandCategory;
  minimumRole: UserRole;
  status?: 'ACTIVE' | 'ALIAS' | 'DEPRECATED';
  requiredPermission?: Permission;
  requiredRoles?: UserRole[];
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

export interface CommandContext {
  communityId: string;
  guildId: string;
  discordUserId: string;
  discordUsername: string;
  effectiveRole: UserRole;
  permissions: Permission[];
}
