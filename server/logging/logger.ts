export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  requestId?: string;
  correlationId?: string;
  workspaceId?: string;
  communityId?: string;
  context?: Record<string, unknown>;
}

export interface OperationalLogEntry {
  correlationId: string;
  requestId?: string;
  workspaceId?: string;
  communityId?: string;
  operation: string;
  status: 'SUCCESS' | 'FAILURE' | 'RETRYING' | 'SKIPPED';
  durationMs?: number;
  errorCategory?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// Patterns that must never be written to logs
const SENSITIVE_KEY_PATTERNS = [
  /bot\s*token/i,
  /gemini.*key/i,
  /secret/i,
  /authorization/i,
  /password/i,
  /bearer/i,
  /credential/i,
  /private_key/i,
  /stripe.*key/i,
  /whsec/i,
  /client_secret/i,
  /access_token/i,
  /refresh_token/i,
  /oauth_secret/i,
  /rawPrompt/i,
  /conversationContext/i,
  /privateMessage/i,
];

export function sanitizeLogValue(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[MaxDepthExceeded]';
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Redact explicit token prefixes or auth headers
    if (
      obj.startsWith('sk_live_') ||
      obj.startsWith('sk_test_') ||
      obj.startsWith('whsec_') ||
      obj.startsWith('Bearer ') ||
      obj.startsWith('Bot ')
    ) {
      return '[REDACTED_SECRET]';
    }
    if (obj.length > 32 && /^[A-Za-z0-9-_=.]+$/.test(obj)) {
      return `${obj.substring(0, 4)}...[REDACTED]`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogValue(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const isKeySensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isKeySensitive) {
        sanitizedObj[key] = '[REDACTED_SECRET]';
      } else {
        sanitizedObj[key] = sanitizeLogValue(value, depth + 1);
      }
    }
    return sanitizedObj;
  }

  return obj;
}

export class Logger {
  private service: string;

  constructor(service = 'community-manager') {
    this.service = service;
  }

  private log(
    level: LogLevel,
    message: string,
    requestId?: string,
    context?: Record<string, unknown>
  ) {
    const entry: LogPayload = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...(requestId ? { requestId } : {}),
      ...(context ? { context: sanitizeLogValue(context) as Record<string, unknown> } : {}),
    };

    const formatted = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.service}]${
      entry.requestId ? ` [req:${entry.requestId}]` : ''
    } ${entry.message}`;

    if (level === 'error') {
      console.error(formatted, entry.context ? JSON.stringify(entry.context) : '');
    } else if (level === 'warn') {
      console.warn(formatted, entry.context ? JSON.stringify(entry.context) : '');
    } else if (level === 'debug') {
      console.debug(formatted, entry.context ? JSON.stringify(entry.context) : '');
    } else {
      console.log(formatted, entry.context ? JSON.stringify(entry.context) : '');
    }
  }

  logOperational(op: OperationalLogEntry) {
    const level: LogLevel = op.status === 'FAILURE' ? 'error' : op.status === 'RETRYING' ? 'warn' : 'info';
    const message = `[OPERATIONAL_LOG] Op: ${op.operation} | Status: ${op.status}${
      op.durationMs !== undefined ? ` | ${op.durationMs}ms` : ''
    }${op.errorCategory ? ` | ErrorCat: ${op.errorCategory}` : ''}`;

    this.log(level, message, op.requestId, {
      correlationId: op.correlationId,
      workspaceId: op.workspaceId,
      communityId: op.communityId,
      operation: op.operation,
      status: op.status,
      durationMs: op.durationMs,
      errorCategory: op.errorCategory,
      errorMessage: op.errorMessage,
      metadata: op.metadata,
    });
  }

  debug(message: string, requestId?: string, context?: Record<string, unknown>) {
    this.log('debug', message, requestId, context);
  }

  info(message: string, requestId?: string, context?: Record<string, unknown>) {
    this.log('info', message, requestId, context);
  }

  warn(message: string, requestId?: string, context?: Record<string, unknown>) {
    this.log('warn', message, requestId, context);
  }

  error(message: string, requestId?: string, context?: Record<string, unknown>) {
    this.log('error', message, requestId, context);
  }
}

export const logger = new Logger();
