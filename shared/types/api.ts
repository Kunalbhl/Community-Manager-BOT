export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export interface HealthResponse {
  success: true;
  service: 'community-recruiter';
  status: 'healthy' | 'degraded';
  environment: string;
  freeMode: boolean;
  timestamp: string;
  version: string;
}

export interface ModuleNotImplementedResponse {
  success: false;
  code: 'MODULE_NOT_IMPLEMENTED';
  message: string;
  module: string;
  phase: 'TASK_1_FOUNDATION';
}

export interface PlatformOverviewMetrics {
  totalRegisteredServers: number;
  activeServers: number;
  inactiveServers: number;
  totalRegisteredUsers: number;
  activeUsers: number;
  totalApplications: number;
  applicationsToday: number;
  applicationsThisWeek: number;
  applicationsThisMonth: number;
  totalRecruiters: number;
  totalReferrals: number;
  botInstallations: number;
  failedOperations: number;
  pendingFeedback: number;
  systemHealthStatus: 'HEALTHY' | 'DEGRADED' | 'OPERATIONAL_SAFE';
}

export interface PlatformOverviewResponse extends ApiResponse<PlatformOverviewMetrics> {
  data: PlatformOverviewMetrics;
  recentActivity: Array<{
    id: string;
    action: string;
    timestamp: string;
    description: string;
  }>;
}

export interface ServiceAdapterHealth {
  name: string;
  status: 'HEALTHY' | 'ACTIVE' | 'NOT_CONFIGURED' | 'ERROR' | 'DEGRADED';
  configured: boolean;
  details: string;
  lastCheck: string;
}

export type ServiceHealthItem = ServiceAdapterHealth;

export interface SystemHealthData {
  status: 'HEALTHY' | 'OPERATIONAL_SAFE' | 'DEGRADED';
  freeMode: boolean;
  adapters: {
    appServer: ServiceAdapterHealth;
    database: ServiceAdapterHealth;
    discord: ServiceAdapterHealth;
    gemini: ServiceAdapterHealth;
    googleSheets: ServiceAdapterHealth;
    notifications: ServiceAdapterHealth;
    quotaService: ServiceAdapterHealth;
  };
}
