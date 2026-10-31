import { Permission, UserRole } from './rbac.js';

export type SearchResourceType =
  // Community Resource Types
  | 'member'
  | 'applicant'
  | 'candidate'
  | 'recruiter'
  | 'recruiter_code'
  | 'application'
  | 'announcement'
  | 'template'
  | 'scheduled_message'
  | 'campaign'
  | 'poll'
  | 'reminder'
  | 'event'
  | 'schedule'
  | 'automation'
  | 'warning'
  | 'incident'
  | 'restriction'
  | 'blacklist'
  | 'integration'
  | 'setting'
  | 'navigation'
  | 'command'
  // Platform Resource Types
  | 'platform_server'
  | 'platform_user'
  | 'platform_incident'
  | 'platform_setting'
  | 'platform_integration'
  | 'platform_audit';

export type SearchCategory =
  | 'Navigation'
  | 'Members'
  | 'Recruitment'
  | 'Engagement'
  | 'Moderation'
  | 'Events & Automation'
  | 'Integrations'
  | 'Settings'
  | 'Platform'
  | 'Commands';

export interface SearchResultItem {
  id: string;
  resourceId: string;
  type: SearchResourceType;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  context?: string;
  route: string;
  status?: string;
  permissionRequired?: Permission;
  tags?: string[];
  score: number;
  metadata?: Record<string, any>;
}

export interface SearchQueryOptions {
  query: string;
  communityId?: string;
  scope?: 'community' | 'platform';
  types?: SearchResourceType[];
  category?: SearchCategory;
  limit?: number;
  cursor?: number;
  includeCommands?: boolean;
  includeNavigation?: boolean;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  total: number;
  groupedResults: Record<SearchCategory, SearchResultItem[]>;
  results: SearchResultItem[];
  categories: SearchCategory[];
  hasMore: boolean;
  nextCursor?: number;
  searchTimeMs: number;
}

export interface CommandDefinition {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchCategory;
  permissionRequired?: Permission;
  route: string;
  actionId?: string;
  isDestructive?: boolean;
  confirmationPrompt?: string;
  shortcut?: string;
  keywords: string[];
}
