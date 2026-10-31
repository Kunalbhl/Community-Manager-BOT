export type OperationalErrorCategory =
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'TENANT_CONTEXT_FAILED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DISCORD_UNAVAILABLE'
  | 'DISCORD_PERMISSION_FAILED'
  | 'DATABASE_UNAVAILABLE'
  | 'AI_PROCESSING_FAILED'
  | 'BILLING_FAILED'
  | 'WEBHOOK_FAILED'
  | 'AUTOMATION_FAILED'
  | 'TIMEOUT'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'FIRESTORE_UNAVAILABLE'
  | 'FIRESTORE_PERMISSION_FAILURE'
  | 'DISCORD_GATEWAY_DISCONNECTED'
  | 'DISCORD_REST_AUTHENTICATION_FAILED'
  | 'DISCORD_REST_UNAVAILABLE'
  | 'SCHEDULER_STALLED'
  | 'REPEATED_SCHEDULER_FAILURES'
  | 'REPEATED_ENGAGEMENT_DELIVERY_FAILURES'
  | 'DISCORD_RATE_LIMITING'
  | 'AUTHENTICATION_FAILURE_SPIKE'
  | 'AUTHORIZATION_FAILURE_SPIKE'
  | 'UNEXPECTED_SIMULATION_ACTIVATION_ATTEMPT'
  | 'CROSS_TENANT_ACCESS_REJECTED';

export type DependencyStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';

export interface DependencyHealthReport {
  name: string;
  status: DependencyStatus;
  lastCheckedAt: string;
  latencyMs?: number;
  details?: string;
  recoveryAction?: string;
}

export interface SystemHealthOverview {
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  uptimeSeconds: number;
  metrics: {
    totalRequests: number;
    totalErrors: number;
    errorRatePercent: number;
    avgLatencyMs: number;
    activeIncidents: number;
  };
  dependencies: Record<string, DependencyHealthReport>;
}

export type IncidentSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'LOW' | 'MEDIUM' | 'HIGH';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED';

export interface IncidentOperatorNote {
  noteId: string;
  authorUserId: string;
  note: string;
  createdAt: string;
}

export interface IncidentHistoryEntry {
  action: string;
  actorUserId: string;
  timestamp: string;
  details?: string;
}

export interface IncidentDocument {
  id: string;
  incidentId?: string;
  type?: string;
  category?: OperationalErrorCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt?: string;
  resolvedAt?: string;
  reopenedAt?: string;
  communityId?: string;
  component?: string;
  safeSummary?: string;
  technicalReference?: string;
  correlationId: string;
  occurrenceCount: number;
  dependency?: string;
  summary?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  workspaceId?: string;
  recoveryInstructions?: string;
  operatorNotes?: IncidentOperatorNote[];
  history?: IncidentHistoryEntry[];

  // Task 135 Incident Ownership & Lifecycle Extensions
  ownerId?: string;
  ownerRole?: string;
  assignedAt?: string;
  assignedBy?: string;
  ownershipState?: 'UNASSIGNED' | 'ASSIGNED';
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgementCorrelationId?: string;
  resolutionReason?: string;
  resolutionCorrelationId?: string;
  resolvedBy?: string;
  reopenedBy?: string;
  suppressionReason?: string;
  suppressedBy?: string;
  suppressedAt?: string;
  suppressedUntil?: string;
  escalationPaused?: boolean;
  escalationPausedAt?: string;
  escalationPausedBy?: string;
  escalationPolicyId?: string;
}

export type OperationalActionId =
  | 'DISCORD_RECONNECT'
  | 'SCHEDULER_RESTART'
  | 'SCHEDULER_RECONCILE'
  | 'FIRESTORE_READINESS_RECHECK'
  | 'HEALTH_RECHECK'
  | 'CLEAR_STALE_OPERATIONAL_LOCK';

export type OperationalActionResultStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'NOT_CONFIGURED'
  | 'ALREADY_CONNECTED'
  | 'OPERATION_NOT_SUPPORTED'
  | 'CONFIRMATION_REQUIRED'
  | 'LOCK_NOT_FOUND'
  | 'LOCK_ACTIVE_NOT_STALE'
  | 'OPERATION_IN_PROGRESS';

export interface OperationalActionDefinition {
  actionId: OperationalActionId;
  label: string;
  description: string;
  requiredRole: 'PLATFORM_OWNER';
  supportedComponents: string[];
  targetComponent?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confirmationRequired: boolean;
  supported?: boolean;
}

export type OperationalExecutionState =
  | 'REQUESTED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'NOT_SUPPORTED'
  | 'BLOCKED'
  | 'ALREADY_CONNECTED'
  | 'ALREADY_RESOLVED'
  | 'CANCELLED';

export interface OperationalExecutionRecord {
  id: string;
  actionId: string;
  actorId: string;
  actorRole: string;
  targetComponent?: string;
  riskLevel: string;
  confirmationRequired: boolean;
  confirmationProvided: boolean;
  idempotencyKey?: string;
  status: OperationalExecutionState;
  resultCode: OperationalActionResultStatus | string;
  message: string;
  correlationId: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, any>;
  errorCode?: string;
  createdAt: string;
  incidentId?: string;
}

export interface OperationalLockRecord {
  id: string; // e.g. op_lock_${actionId}
  actionId: string;
  ownerId: string;
  correlationId: string;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}

export interface OperationalActionResult {
  actionId: string;
  status: OperationalActionResultStatus;
  message: string;
  correlationId: string;
  timestamp: string;
  details?: Record<string, any>;
  idempotentReplay?: boolean;
  executionId?: string;
  incidentId?: string;
}

export interface OperationalActionHistoryEntry {
  id: string;
  actionId: string;
  actorUserId: string;
  status: OperationalActionResultStatus;
  correlationId: string;
  timestamp: string;
  summary: string;
  details?: Record<string, any>;
  incidentId?: string;
  executionState?: OperationalExecutionState;
}

export interface ProductionOperationalMetrics {
  application: {
    uptimeSeconds: number;
    memoryUsageMb: number;
    nodeVersion: string;
    environment: string;
    status: 'HEALTHY' | 'DEGRADED';
  };
  database: {
    availability: boolean;
    status: string;
    mode: string;
    failClosed: boolean;
  };
  discord: {
    gatewayState: string;
    restOutcome: 'VERIFIED' | 'BLOCKED_BY_ENVIRONMENT' | 'FAILED';
    restClassification: string;
    pingMs: number;
    isConfigured: boolean;
  };
  scheduler: {
    state: 'RUNNING' | 'STOPPED' | 'STALLED';
    isHeartbeatStale: boolean;
    lastHeartbeatAt: string | null;
    activeScheduledJobs: number;
    failedScheduledJobs: number;
    stuckProcessingJobs: number;
  };
  engagement: {
    deliverySuccessCount: number;
    deliveryFailureCount: number;
    rateLimitedCount: number;
    recentOutcomes: Record<string, number>;
  };
  authentication: {
    failuresCount: number;
    lastFailureAt?: string;
  };
  tenancy: {
    isolationViolationsCount: number;
    boundaryRejectionsCount: number;
    lastViolationAt?: string;
  };
  entitlements: {
    operationsAccountedCount: number;
    rejectionsCount: number;
  };
  audit: {
    eventsLoggedCount: number;
    redactionEngineActive: boolean;
  };
  backgroundWorkers: {
    activeWorkersCount: number;
    workerFailuresCount: number;
  };
  timestamp: string;
}

export interface ScheduledJobStatus {
  id: string;
  jobName: string;
  module: 'announcements' | 'reminders' | 'campaigns' | 'events' | 'automation' | 'billing_webhook';
  lastExecutionAt?: string;
  nextExecutionAt?: string;
  lastStatus: 'SUCCESS' | 'FAILURE' | 'RUNNING' | 'IDLE';
  executionCount: number;
  failureCount: number;
  lastError?: string;
  intervalMs?: number;
}

export interface TenantHealthReport {
  communityId: string;
  status: 'HEALTHY' | 'DEGRADED' | 'ATTENTION_REQUIRED';
  discordConnected: boolean;
  botPermissionsValid: boolean;
  sheetsConnected: boolean;
  activeIncidentsCount: number;
  lastSyncAt: string;
  issues: string[];
}

// ==========================================
// TASK 134 — Observability, Alerting & SLO Integrity Types
// ==========================================

export type ObservabilityDomain =
  | 'APPLICATION'
  | 'DATABASE'
  | 'DISCORD'
  | 'SCHEDULER'
  | 'ENGAGEMENT'
  | 'AUTHENTICATION'
  | 'TENANCY'
  | 'ENTITLEMENTS'
  | 'AUDIT'
  | 'BACKGROUND_WORKERS'
  | 'OPERATIONS';

export interface DurableOperationalMetric {
  id: string;
  metricName: string;
  component: ObservabilityDomain | string;
  value: number;
  unit: string;
  timestamp: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'INSUFFICIENT_DATA';
  source: string;
  correlationId?: string;
  communityId?: string;
  actionId?: string;
  incidentId?: string;
  labels?: Record<string, string>;
}

export type ServiceHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'BLOCKED_BY_ENVIRONMENT'
  | 'INSUFFICIENT_DATA';

export interface ServiceHealthSnapshot {
  id: string;
  component:
    | 'APPLICATION'
    | 'DATABASE'
    | 'DISCORD_GATEWAY'
    | 'DISCORD_REST'
    | 'SCHEDULER'
    | 'ENGAGEMENT_DELIVERY'
    | 'AUTHENTICATION'
    | 'OPERATIONS'
    | string;
  status: ServiceHealthStatus;
  checkedAt: string;
  latencyMs?: number;
  lastSuccessfulCheck?: string;
  failureCount: number;
  message: string;
  correlationId: string;
  details?: Record<string, any>;
}

export interface LatencyRecord {
  id: string;
  operation: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILURE' | 'ERROR';
  timestamp: string;
  correlationId?: string;
  component?: string;
}

export interface LatencyDistribution {
  operation: string;
  sampleCount: number;
  p50: number | 'INSUFFICIENT_DATA';
  p95: number | 'INSUFFICIENT_DATA';
  p99: number | 'INSUFFICIENT_DATA';
  avgMs: number | 'INSUFFICIENT_DATA';
  minMs: number | 'INSUFFICIENT_DATA';
  maxMs: number | 'INSUFFICIENT_DATA';
}

export type AlertLifecycleState =
  | 'DETECTED'
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'SUPPRESSED'
  | 'RESOLVED'
  | 'REOPENED';

export interface AlertRuleDefinition {
  ruleId: string;
  name: string;
  component: ObservabilityDomain | string;
  condition: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  enabled: boolean;
  cooldownMs: number;
  deduplicationKey: string;
  description: string;
}

export type IncidentTimelineEventType =
  | 'DETECTED'
  | 'ALERT_TRIGGERED'
  | 'OPENED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'UNASSIGNED'
  | 'ESCALATION_TRIGGERED'
  | 'ESCALATION_SENT'
  | 'ESCALATION_FAILED'
  | 'SUPPRESSION_STARTED'
  | 'SUPPRESSION_ENDED'
  | 'OPERATION_REQUESTED'
  | 'OPERATION_STARTED'
  | 'OPERATION_SUCCEEDED'
  | 'OPERATION_FAILED'
  | 'NOTE_ADDED'
  | 'STATUS_UPDATED'
  | 'REOPENED'
  | 'RESOLVED'
  | 'RECOVERY_ATTEMPTED'
  | 'RECOVERY_SUCCEEDED'
  | 'RECOVERY_FAILED'
  | 'SEVERITY_CHANGED';

export interface IncidentTimelineEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  event: IncidentTimelineEventType;
  actorId: string;
  actorRole?: string;
  message: string;
  details?: Record<string, any>;
  correlationId?: string;
}

export type SloStatus = 'MEETING' | 'BREACHED' | 'AT_RISK' | 'INSUFFICIENT_DATA';

export interface ServiceLevelObjective {
  sloId: string;
  name: string;
  targetPercent: number; // e.g. 99.9 or 99.0
  periodDays: number; // e.g. 30
  currentPercent: number | 'INSUFFICIENT_DATA';
  status: SloStatus;
  component: ObservabilityDomain | string;
  description: string;
  measurementUnit: string;
  totalEvents: number;
  failedEvents: number;
  errorBudget: {
    allowedFailures: number | 'INSUFFICIENT_DATA';
    consumedFailures: number;
    remainingFailures: number | 'INSUFFICIENT_DATA';
    budgetExhausted: boolean;
  };
}

export interface PlatformNotificationPreference {
  id: string; // e.g. "pref_${userId}" or "pref_global"
  userId: string;
  emailAlertsEnabled: boolean;
  discordDmAlertsEnabled: boolean;
  minSeverity: 'INFO' | 'WARNING' | 'CRITICAL';
  componentsMuted: string[];
  updatedAt: string;
}

export interface OperationalTrendAnalysis {
  timeframe: string;
  requestVolumeTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
  errorRateTrend: 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'INSUFFICIENT_DATA';
  avgLatencyTrend: 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'INSUFFICIENT_DATA';
  incidentFrequency: {
    totalPast24h: number;
    resolvedPast24h: number;
    criticalPast24h: number;
  };
  sloSummary: {
    totalSloCount: number;
    meetingCount: number;
    breachedCount: number;
    insufficientDataCount: number;
  };
}

// ==========================================
// TASK 135 — Incident Response, Alert Routing & Maintenance Windows
// ==========================================

export interface EscalationPolicy {
  id: string; // policyId
  policyId: string;
  name: string;
  enabled: boolean;
  severity: IncidentSeverity | string;
  component: ObservabilityDomain | string;
  initialDelayMs: number;
  repeatIntervalMs: number;
  maxEscalations: number;
  recipients: Array<'PLATFORM_OWNER' | 'INCIDENT_OWNER' | 'AUTHORIZED_OPERATOR' | string>;
  createdAt: string;
  updatedAt: string;
}

export type EscalationStatus = 'PENDING' | 'ESCALATED' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'NOT_CONFIGURED';

export interface EscalationState {
  id: string; // esc_${incidentId}
  incidentId: string;
  policyId: string;
  currentLevel: number;
  lastEscalatedAt?: string;
  nextEscalationAt?: string;
  escalationCount: number;
  status: EscalationStatus;
  lastError?: string;
  idempotencyKey?: string;
  updatedAt: string;
}

export interface AlertRoutingDecision {
  id: string;
  incidentId: string;
  policyId?: string;
  recipientType: string;
  recipientContext?: string;
  decision: 'ROUTED' | 'SUPPRESSED_MAINTENANCE' | 'SUPPRESSED_RULE' | 'PAUSED' | 'NOT_CONFIGURED';
  reason: string;
  timestamp: string;
  correlationId: string;
}

export type IncidentCommunicationType =
  | 'NOTE'
  | 'STATUS_UPDATE'
  | 'RECOVERY_UPDATE'
  | 'RESOLUTION_UPDATE'
  | 'SYSTEM_UPDATE';

export interface IncidentCommunicationRecord {
  id: string;
  incidentId: string;
  actorId: string;
  actorRole: string;
  message: string;
  type: IncidentCommunicationType;
  createdAt: string;
  correlationId: string;
}

export type MaintenanceWindowStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface MaintenanceWindow {
  id: string;
  maintenanceWindowId: string;
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  components: string[];
  rules: string[];
  createdBy: string;
  createdAt: string;
  status: MaintenanceWindowStatus;
  cancelledAt?: string;
  cancelledBy?: string;
  communityId?: string;
}

export type OperationalNotificationStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'NOT_CONFIGURED';

export interface OperationalNotificationRecord {
  id: string;
  notificationId: string;
  incidentId: string;
  recipient: string;
  context: string;
  channel: 'NOTIFICATION_CENTER' | 'EMAIL' | 'DISCORD_DM' | 'WEBHOOK';
  status: OperationalNotificationStatus;
  failureCode?: string;
  createdAt: string;
  deliveredAt?: string;
  correlationId: string;
}

// =========================================================================
// TASK 137: PRODUCTION RELEASE CONTROL & POST-RELEASE VALIDATION TYPES
// =========================================================================

export type ReleaseState =
  | 'CORE_READY_WITH_EXTERNAL_LIMITATION'
  | 'EXTERNAL_VERIFICATION_REQUIRED'
  | 'RELEASE_READY'
  | 'RELEASE_BLOCKED'
  | 'POST_RELEASE_VALIDATION'
  | 'RELEASE_OPERATIONAL';

export type ValidationCheckStatus =
  | 'PASS'
  | 'FAIL'
  | 'NOT_CONFIGURED'
  | 'BLOCKED_BY_ENVIRONMENT'
  | 'INSUFFICIENT_DATA'
  | 'NOT_RUN';

export interface PostDeploymentValidationCheck {
  id: string;
  name: string;
  category: string;
  status: ValidationCheckStatus;
  message: string;
  executedAt: string;
  details?: Record<string, any>;
}

export interface ReleaseValidationRecord {
  id: string;
  releaseId: string;
  releaseVersion: string;
  releaseLocked: boolean;
  startedAt: string;
  completedAt: string;
  actor: string;
  environment: string;
  validationResults: PostDeploymentValidationCheck[];
  externalDependencyResults: Record<string, string>;
  testCount: number;
  failedTests: number;
  blockedTests: number;
  typescriptStatus: 'PASS' | 'FAIL';
  lintStatus: 'PASS' | 'FAIL';
  buildStatus: 'SUCCESS' | 'FAILED';
  smokeStatus: 'PASS' | 'FAIL' | 'BLOCKED_BY_ENVIRONMENT';
  finalStatus: ReleaseState;
  correlationId: string;
}

export interface RollbackReadinessResult {
  releaseVersion: string;
  status: 'READY' | 'RELEASE_BLOCKED';
  checks: Record<string, { status: 'PASS' | 'FAIL'; message: string }>;
  reason?: string;
  checkedAt: string;
  correlationId: string;
}

export interface ReleaseHandoffRecord {
  id: string;
  releaseVersion: string;
  certificationStatus: 'CERTIFIED_INTERNAL' | 'RELEASE_READY' | 'RELEASE_BLOCKED';
  deploymentStatus: string;
  externalDependencyStatus: string;
  knownLimitations: string[];
  activeIncidentsCount: number;
  openOperationalActionsCount: number;
  rollbackReadinessStatus: 'READY' | 'RELEASE_BLOCKED';
  postReleaseValidationState: ReleaseState;
  timestamp: string;
  correlationId: string;
}

export interface ProductionAcceptanceRecord {
  id: string;
  releaseVersion: string;
  releaseLocked: boolean;
  acceptanceTimestamp: string;
  coreRuntimeStatus: 'HEALTHY' | 'OPERATIONAL_SAFE' | 'DEGRADED';
  firestoreStatus: 'VERIFIED' | 'UNAVAILABLE' | 'BLOCKED_BY_INFRASTRUCTURE';
  discordGatewayStatus: 'VERIFIED' | 'DISCONNECTED' | 'NOT_CONFIGURED';
  discordRestStatus: 'VERIFIED' | 'AUTHENTICATION_FAILED' | 'PERMISSION_REQUIRED' | 'RATE_LIMITED' | 'DISCORD_API_UNAVAILABLE' | 'BLOCKED_BY_ENVIRONMENT' | 'NOT_CONFIGURED';
  guildAuthorityStatus: 'VERIFIED' | 'NOT_CONFIGURED' | 'BLOCKED_BY_ENVIRONMENT';
  engagementStatus: 'VERIFIED_AUTHENTIC' | 'NOT_CONFIGURED' | 'FAILED';
  schedulerStatus: 'VERIFIED_DURABLE' | 'STALLED' | 'STOPPED';
  observabilityStatus: 'VERIFIED_TRUTHFUL' | 'DEGRADED';
  incidentResponseStatus: 'CERTIFIED_PASS' | 'DEGRADED';
  securityStatus: 'VERIFIED_HARDENED';
  tenantIsolationStatus: 'VERIFIED_ENFORCED';
  rollbackReadinessStatus: 'READY' | 'RELEASE_BLOCKED';
  postReleaseMonitoringStatus: 'SUFFICIENT_DATA' | 'INSUFFICIENT_DATA';
  finalStatus: ReleaseState;
  genuineLimitations: string[];
  correlationId: string;
}

export type DeploymentTruthStatus = 'DEPLOYED' | 'NOT_DEPLOYED' | 'UNKNOWN';

export type PostReleaseLockState = 'ACTIVE' | 'MAINTENANCE' | 'EMERGENCY_CHANGE' | 'LOCKED';

export type ChangeType = 'MAINTENANCE' | 'BUG_FIX' | 'SECURITY' | 'CONFIGURATION' | 'EMERGENCY' | 'ROLLBACK';

export type ChangeStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';

export interface ProductionReleaseEvidenceRecord {
  id: string;
  releaseId: string;
  releaseVersion: string;
  releaseLocked: boolean;
  attestationId: string;
  attestedAt: string;
  environment: string;
  deploymentStatus: DeploymentTruthStatus;
  runtimeStatus: string;
  coreReadiness: 'HEALTHY' | 'OPERATIONAL_SAFE' | 'DEGRADED';
  externalDiscordStatus: string;
  firestoreStatus: string;
  gatewayStatus: string;
  schedulerStatus: string;
  engagementStatus: string;
  observabilityStatus: string;
  incidentResponseStatus: string;
  securityStatus: string;
  tenantIsolationStatus: string;
  rollbackReadiness: 'READY' | 'RELEASE_BLOCKED';
  testCount: number;
  failedTests: number;
  blockedTests: number;
  typescriptStatus: 'PASS' | 'FAIL';
  lintStatus: 'PASS' | 'FAIL';
  buildStatus: 'SUCCESS' | 'FAILED';
  smokeStatus: 'PASS' | 'FAIL' | 'BLOCKED_BY_ENVIRONMENT';
  sourceAuditStatus: 'VERIFIED_CLEAN' | 'ISSUES_FOUND';
  finalStatus: ReleaseState | 'EVIDENCE_INCONSISTENT';
  genuineLimitations: string[];
  correlationId: string;
}

export interface ChangeControlRecord {
  id: string;
  changeId: string;
  releaseId: string;
  requestedBy: string;
  authorizedBy?: string;
  changeType: ChangeType;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  status: ChangeStatus;
  createdAt: string;
  approvedAt?: string;
  executedAt?: string;
  completedAt?: string;
  rollbackPlan?: string;
  verificationResult?: string;
  correlationId: string;
}

export interface PostReleaseLockRecord {
  id: string;
  state: PostReleaseLockState;
  updatedBy: string;
  updatedAt: string;
  reason?: string;
  correlationId: string;
}

