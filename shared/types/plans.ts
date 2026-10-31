export type PlanType = 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';

export interface PlanDefinition {
  id: PlanType;
  name: string;
  description: string;
  priceMonthly: number;
  priceFormatted: string;
  billingInterval: string;
  isDefault?: boolean;
  features: string[];
  limits: Record<string, number>;
  status: 'AVAILABLE' | 'BILLING_NOT_CONFIGURED' | 'ENTERPRISE_CONTACT';
}

export const AUTHORITATIVE_PLANS: Record<PlanType, PlanDefinition> = {
  FREE: {
    id: 'FREE',
    name: 'Free Plan',
    description: 'Essential community management, basic recruitment, moderation, and Community Brain features.',
    priceMonthly: 0,
    priceFormatted: '$0',
    billingInterval: 'forever free',
    isDefault: true,
    status: 'AVAILABLE',
    features: [
      '1 Community Server',
      '100 Community Brain AI requests/day',
      '100 Automation executions/day',
      '500 Member Limit',
      '10 Report Exports/day',
      'Basic Recruitment & Moderation',
      'Standard Community Analytics',
    ],
    limits: {
      MAX_COMMUNITIES: 1,
      MAX_AI_REQUESTS_PER_DAY: 100,
      MAX_AUTOMATION_EXECUTIONS_PER_DAY: 100,
      MAX_MEMBERS: 500,
      MAX_EXPORTS_PER_DAY: 10,
      MAX_SCHEDULED_ACTIONS: 20,
      MAX_APPLICATIONS_PER_DAY: 100,
      MAX_SHEET_WRITES_PER_DAY: 100,
      MAX_AI_TOKENS_PER_REQUEST: 4000,
    },
  },
  PRO: {
    id: 'PRO',
    name: 'Pro Plan',
    description: 'Advanced analytics, automations, multi-community support, and expanded Community Brain capabilities.',
    priceMonthly: 29,
    priceFormatted: '$29',
    billingInterval: 'per month',
    status: 'AVAILABLE',
    features: [
      'Up to 5 Community Servers',
      '500 Community Brain AI requests/day',
      '1,000 Automation executions/day',
      '10,000 Member Limit',
      '100 Report Exports/day',
      'Advanced Analytics Intelligence',
      'Direct Discord Moderation Actions',
      'Google Workspace Integrations',
    ],
    limits: {
      MAX_COMMUNITIES: 5,
      MAX_AI_REQUESTS_PER_DAY: 500,
      MAX_AUTOMATION_EXECUTIONS_PER_DAY: 1000,
      MAX_MEMBERS: 10000,
      MAX_EXPORTS_PER_DAY: 100,
      MAX_SCHEDULED_ACTIONS: 200,
      MAX_APPLICATIONS_PER_DAY: 1000,
      MAX_SHEET_WRITES_PER_DAY: 1000,
      MAX_AI_TOKENS_PER_REQUEST: 16000,
    },
  },
  BUSINESS: {
    id: 'BUSINESS',
    name: 'Business Plan',
    description: 'Enterprise-grade limits, API access, multi-admin capabilities, and priority capabilities.',
    priceMonthly: 99,
    priceFormatted: '$99',
    billingInterval: 'per month',
    status: 'AVAILABLE',
    features: [
      'Up to 50 Community Servers',
      '5,000 Community Brain AI requests/day',
      '10,000 Automation executions/day',
      '100,000 Member Limit',
      '1,000 Report Exports/day',
      'Multi-Admin Role Governance',
      'REST API & Webhooks Access',
      'Priority Queue Processing',
    ],
    limits: {
      MAX_COMMUNITIES: 50,
      MAX_AI_REQUESTS_PER_DAY: 5000,
      MAX_AUTOMATION_EXECUTIONS_PER_DAY: 10000,
      MAX_MEMBERS: 100000,
      MAX_EXPORTS_PER_DAY: 1000,
      MAX_SCHEDULED_ACTIONS: 2000,
      MAX_APPLICATIONS_PER_DAY: 10000,
      MAX_SHEET_WRITES_PER_DAY: 10000,
      MAX_AI_TOKENS_PER_REQUEST: 32000,
    },
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise Plan',
    description: 'Custom SLAs, unlimited scaling, dedicated infrastructure support, and custom agreements.',
    priceMonthly: 0,
    priceFormatted: 'Custom',
    billingInterval: 'per year',
    status: 'ENTERPRISE_CONTACT',
    features: [
      'Unlimited Community Servers (999+)',
      '50,000 Community Brain AI requests/day',
      '100,000 Automation executions/day',
      '1,000,000 Member Limit',
      'Dedicated Infrastructure Support',
      'Custom SLAs & Agreements',
      'Custom Security Audits',
    ],
    limits: {
      MAX_COMMUNITIES: 999,
      MAX_AI_REQUESTS_PER_DAY: 50000,
      MAX_AUTOMATION_EXECUTIONS_PER_DAY: 100000,
      MAX_MEMBERS: 1000000,
      MAX_EXPORTS_PER_DAY: 10000,
      MAX_SCHEDULED_ACTIONS: 20000,
      MAX_APPLICATIONS_PER_DAY: 100000,
      MAX_SHEET_WRITES_PER_DAY: 100000,
      MAX_AI_TOKENS_PER_REQUEST: 64000,
    },
  },
};
