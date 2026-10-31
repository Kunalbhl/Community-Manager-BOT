import { auditService } from '../audit.service.js';
import { UserRole } from '../../../shared/types/rbac.js';
import { DateRangeType } from '../../../shared/types/insights.js';

export interface ExportOptions {
  communityId: string;
  actorUserId: string;
  actorRole: UserRole;
  domain: string;
  format: 'csv' | 'json';
  data: Record<string, unknown>;
  rangeType: DateRangeType;
  rangeStart: string;
  rangeEnd: string;
  ipAddress?: string;
  requestId?: string;
}

export class InsightsExportService {
  /**
   * Generates sanitized export data in CSV or JSON format and records audit event.
   */
  static async generateExport(options: ExportOptions): Promise<{
    filename: string;
    contentType: string;
    content: string;
  }> {
    const {
      communityId,
      actorUserId,
      actorRole,
      domain,
      format,
      data,
      rangeType,
      rangeStart,
      rangeEnd,
      ipAddress,
      requestId,
    } = options;

    // Sanitize any potential sensitive fields recursively
    const sanitized = this.sanitizeObject(data);

    let content = '';
    let contentType = 'application/json';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `insights-${domain.toLowerCase()}-${rangeType.toLowerCase()}-${timestamp}.${format}`;

    if (format === 'json') {
      contentType = 'application/json';
      content = JSON.stringify(sanitized, null, 2);
    } else {
      contentType = 'text/csv';
      content = this.convertToCsv(sanitized);
    }

    // Record authoritative audit event
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'INSIGHTS_EXPORT_CREATED',
      targetType: 'INSIGHTS_EXPORT',
      targetId: `${domain}_${rangeType}`,
      metadata: {
        domain,
        format,
        rangeType,
        rangeStart,
        rangeEnd,
        filename,
      },
      ipAddressIfAvailable: ipAddress,
      requestId,
    });

    return {
      filename,
      contentType,
      content,
    };
  }

  /**
   * Sanitizes object to ensure secrets, webhook URLs, or tokens are never leaked
   */
  private static sanitizeObject(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('webhook') ||
        lowerKey.includes('apikey')
      ) {
        clean[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        clean[key] = this.sanitizeObject(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  /**
   * Converts a structured metric object or array of objects into CSV
   */
  private static convertToCsv(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return 'Key,Value\nData,Empty\n';
    }

    const lines: string[] = [];

    // Header metadata lines
    lines.push('# Community Manager Insights Authoritative Export');
    lines.push(`# GeneratedAt: ${new Date().toISOString()}`);
    lines.push('');

    // If data has trend or breakdown arrays
    const flattenKeyValues: Array<{ key: string; value: string }> = [];

    const recurseFlatten = (prefix: string, current: unknown) => {
      if (!current || typeof current !== 'object') {
        flattenKeyValues.push({
          key: prefix,
          value: current === null || current === undefined ? '' : String(current),
        });
        return;
      }

      if (Array.isArray(current)) {
        if (current.length > 0 && typeof current[0] === 'object') {
          // Table section
          return;
        }
        flattenKeyValues.push({
          key: prefix,
          value: current.join('; '),
        });
        return;
      }

      for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k;
        recurseFlatten(path, v);
      }
    };

    recurseFlatten('', data);

    lines.push('Metric Key,Value');
    flattenKeyValues.forEach((row) => {
      const escapedKey = `"${row.key.replace(/"/g, '""')}"`;
      const escapedVal = `"${row.value.replace(/"/g, '""')}"`;
      lines.push(`${escapedKey},${escapedVal}`);
    });

    return lines.join('\n');
  }
}
