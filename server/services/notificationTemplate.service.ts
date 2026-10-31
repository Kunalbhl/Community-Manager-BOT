import { communityConfigurationService } from './communityConfiguration.service.js';

export class NotificationTemplateService {
  /**
   * Sanitizes text to strictly exclude secrets, access tokens, credentials, or dangerous scripts.
   */
  static sanitizeText(text: string): string {
    if (!text || typeof text !== 'string') return '';
    // Strip script and html tags
    let sanitized = text.replace(/<[^>]*>/g, '');
    // Mask potential bearer tokens or secrets
    sanitized = sanitized.replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{15,}/gi, '$1[REDACTED]');
    sanitized = sanitized.replace(/(client_secret|api_key|token|password)=['"]?[a-zA-Z0-9_\-\.]{10,}['"]?/gi, '$1=[REDACTED]');
    return sanitized;
  }

  /**
   * Synchronous HTML/script tag sanitizer.
   */
  static sanitizeHtml(html: string): string {
    return this.sanitizeText(html);
  }

  /**
   * Synchronous template resolution with variable replacement.
   */
  static resolveTemplate(template: string, variables: Record<string, string | undefined> = {}): string {
    if (!template) return '';
    let result = template;
    for (const [key, val] of Object.entries(variables)) {
      if (val !== undefined && val !== null) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        result = result.replace(regex, String(val));
      }
    }
    result = result.replace(/{{\s*[\w\.\-]+\s*}}/g, '');
    return this.sanitizeText(result.trim());
  }

  /**
   * Safely formats template string substituting variables.
   */
  static async format(
    communityId: string | undefined,
    template: string,
    variables: Record<string, string | undefined> = {}
  ): Promise<string> {
    if (!template) return '';
    
    let recruiterName = 'Community Recruiter';
    if (communityId) {
      try {
        recruiterName = await communityConfigurationService.getRecruiterDisplayName(communityId);
      } catch {
        // Fallback safely
      }
    }

    const mergedVars: Record<string, string | undefined> = {
      recruiterName,
      ...variables,
    };

    let result = template;
    for (const [key, val] of Object.entries(mergedVars)) {
      if (val !== undefined && val !== null) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        result = result.replace(regex, String(val));
      }
    }

    // Clean up any remaining unresolved {{...}} tags gracefully
    result = result.replace(/{{\s*[\w\.\-]+\s*}}/g, '');

    return this.sanitizeText(result.trim());
  }
}
