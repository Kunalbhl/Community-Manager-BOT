import { config } from '../../config/env.js';
import { UserAuthContext, UserRole } from '../../../shared/types/rbac.js';
import { AiCommunityContext } from '../../../shared/types/ai.js';
import { AiAuditService } from './aiAudit.service.js';
import { logger } from '../../logging/logger.js';

export type InputSafetyClassification =
  | 'SAFE'
  | 'PROMPT_INJECTION'
  | 'INDIRECT_INJECTION'
  | 'SYSTEM_PROMPT_EXTRACTION'
  | 'SECRET_EXTRACTION'
  | 'ROLE_SPOOFING'
  | 'CROSS_TENANT_MANIPULATION'
  | 'UNSAFE_INSTRUCTION'
  | 'CONFIRMATION_BYPASS';

export interface RedactionResult<T> {
  sanitized: T;
  redactedCount: number;
}

export interface InputValidationResult {
  valid: boolean;
  sanitizedPrompt: string;
  classification: InputSafetyClassification;
  errorCode?:
    | 'PROMPT_REQUIRED'
    | 'PROMPT_TOO_LONG'
    | 'PROMPT_INJECTION_DETECTED'
    | 'UNSAFE_INSTRUCTION_DETECTED'
    | 'SECRET_EXTRACTION_DETECTED'
    | 'ROLE_SPOOFING_DETECTED'
    | 'CROSS_TENANT_VIOLATION'
    | 'CONFIRMATION_BYPASS_ATTEMPT';
  message?: string;
  violations?: string[];
}

export interface OutputValidationResult {
  valid: boolean;
  sanitized: string;
  violations: string[];
  redactedCount: number;
  hasGuaranteedClaims: boolean;
  hasUnverifiedActionClaim: boolean;
}

export class AiSecurityPolicyService {
  /**
   * Injection patterns (direct prompt injection, jailbreaks, instruction overrides)
   */
  private static readonly DIRECT_INJECTION_PATTERNS: Array<{
    regex: RegExp;
    classification: InputSafetyClassification;
    reason: string;
  }> = [
    // 1. Direct instruction overrides & jailbreaks
    {
      regex: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules|directives)/i,
      classification: 'PROMPT_INJECTION',
      reason: 'Attempted to override previous system instructions',
    },
    {
      regex: /disregard\s+(all\s+)?(safety|system|security)\s+(rules|guidelines|policies|directives)/i,
      classification: 'PROMPT_INJECTION',
      reason: 'Attempted to disregard safety guidelines',
    },
    {
      regex: /\b(?:dan|developer|jailbreak|god|unrestricted)\s+mode\b/i,
      classification: 'PROMPT_INJECTION',
      reason: 'Attempted jailbreak mode activation',
    },
    {
      regex: /(?:you\s+are\s+now\s+in|switch\s+to)\s+(?:developer|dan|god|jailbreak|unrestricted)\s+mode/i,
      classification: 'PROMPT_INJECTION',
      reason: 'Attempted jailbreak persona activation',
    },
    {
      regex: /\bsystem\s+(?:override|reset|mode|bypass)\b/i,
      classification: 'PROMPT_INJECTION',
      reason: 'Attempted system override directive',
    },

    // 2. System prompt extraction
    {
      regex: /(?:system\s+prompt|system\s+instructions?)\s*(?:reveal|leak|show|dump|print|output|display|echo|verbatim)/i,
      classification: 'SYSTEM_PROMPT_EXTRACTION',
      reason: 'Attempted to extract system prompt',
    },
    {
      regex: /(?:reveal|show|dump|print|leak|output|display|echo|verbatim)\s+(?:all\s+)?(?:the\s+)?(?:hidden|system|initial|base)?\s*(?:prompts?|instructions?|directives?)/i,
      classification: 'SYSTEM_PROMPT_EXTRACTION',
      reason: 'Attempted to extract system instructions',
    },
    {
      regex: /(?:what\s+(?:are|were)\s+(?:your|the)\s+(?:initial|system|hidden)\s+instructions)/i,
      classification: 'SYSTEM_PROMPT_EXTRACTION',
      reason: 'Attempted to inquire about system instructions',
    },
    {
      regex: /system\s+prompt\s+leak/i,
      classification: 'SYSTEM_PROMPT_EXTRACTION',
      reason: 'Attempted system prompt leak',
    },

    // 3. Role spoofing & privilege escalation
    {
      regex: /\b(?:i\s+am|acting\s+as|pretend\s+(?:you\s+are|to\s+be))\s+(?:the\s+)?(?:root|superadmin|platform\s+owner|system\s+administrator|platform\s+admin)\b/i,
      classification: 'ROLE_SPOOFING',
      reason: 'Attempted role spoofing or administrative privilege claim',
    },
    {
      regex: /pretend\s+you\s+are\s+(root|superadmin|platform\s+owner|god\s+mode|dan\s+mode|developer\s+mode|unrestricted)/i,
      classification: 'ROLE_SPOOFING',
      reason: 'Attempted role spoofing or persona adoption',
    },
    {
      regex: /(?:elevate|grant|assign)\s+(?:user\s+)?(?:permissions|roles?|superadmin|admin\s+access)/i,
      classification: 'ROLE_SPOOFING',
      reason: 'Attempted unauthorized permission elevation',
    },

    // 4. Confirmation & action bypass
    {
      regex: /\b(?:without|skip|skipping|bypass|bypassing)\s+(?:admin\s+)?(?:confirmation|approval|preview|revalidation)\b/i,
      classification: 'CONFIRMATION_BYPASS',
      reason: 'Attempted to bypass action confirmation lifecycle',
    },
    {
      regex: /\b(?:force\s+execute|force-execute|auto-confirm|auto-execute|direct-execute)\b/i,
      classification: 'CONFIRMATION_BYPASS',
      reason: 'Attempted forced execution without confirmation',
    },
    {
      regex: /(?:execute|run|perform|publish)\s+(?:this\s+)?(?:action|step|event|plan)\s+(?:immediately\s+)?without\s+(?:confirmation|approval)/i,
      classification: 'CONFIRMATION_BYPASS',
      reason: 'Attempted execution without confirmation',
    },

    // 5. Secret extraction
    {
      regex: /(?:what\s+is|give|tell|reveal|show|print|dump)\s+(?:me\s+)?(?:the\s+)?(?:gemini[_\s]api[_\s]key|discord[_\s]bot[_\s]token|platform[_\s]admin[_\s]key|platform[_\s]admin[_\s]secret[_\s]key|platform\s+admin\s+secret\s+key|platform\s+admin\s+key|[a-z_]*api[_\s]*key|[a-z_]*bot[_\s]*token|[a-z_]*client[_\s]*secret|[a-z_]*jwt[_\s]*secret|database\s+password|database\s+url|jwt\s+secret|jwt|password|secret\s*key|secrets?|tokens?)/i,
      classification: 'SECRET_EXTRACTION',
      reason: 'Attempted secret extraction query',
    },
    {
      regex: /\b(?:gemini_api_key|discord_bot_token|platform_admin_key|jwt_secret)\b/i,
      classification: 'SECRET_EXTRACTION',
      reason: 'Attempted secret keyword query',
    },
    {
      regex: /(?:reveal|give|dump|output|show)\s+(?:me\s+)?(?:the\s+)?(?:api\s*key|bot\s*token|client\s*secret|database\s*url|database\s*password|secret\s*key|platform\s+admin\s+secret|jwt|password|secrets?)/i,
      classification: 'SECRET_EXTRACTION',
      reason: 'Attempted secret extraction',
    },
    {
      regex: /dump\s+(?:the\s+)?(?:entire\s+)?(?:database|schema|tokens?|secrets?|keys?)/i,
      classification: 'SECRET_EXTRACTION',
      reason: 'Attempted database or secret dump',
    },

    // 6. Cross-tenant manipulation
    {
      regex: /leak\s+(other\s+|all\s+)?tenants?(?:'s)?\s+data/i,
      classification: 'CROSS_TENANT_MANIPULATION',
      reason: 'Attempted to access other tenant data',
    },
    {
      regex: /(?:switch\s+to|show\s+me\s+data\s+for|query)\s+(?:tenant|community)\s+([a-zA-Z0-9_-]+)/i,
      classification: 'CROSS_TENANT_MANIPULATION',
      reason: 'Attempted cross-tenant query injection',
    },

    // 7. Unsafe destructive instructions
    {
      regex: /bypass\s+(tenant|security|isolation|sandbox|authorization|rbac|permission|entitlement|quota)/i,
      classification: 'UNSAFE_INSTRUCTION',
      reason: 'Attempted to bypass authorization or security sandbox',
    },
    {
      regex: /(?:delete|drop|wipe|prune|destroy)\s+(?:all\s+)?(?:communities|tenants|database|tables|guilds|users|channels)/i,
      classification: 'UNSAFE_INSTRUCTION',
      reason: 'Attempted destructive system command execution',
    },
  ];

  /**
   * Delimiter breakout patterns (used to inject fake system prompt sections or break out of prompt containers)
   */
  private static readonly DELIMITER_BREAKOUT_PATTERNS: RegExp[] = [
    /\[\/?(?:SYSTEM|SYSTEM_PROMPT|INSTRUCTION|DEVELOPER_MODE|ADMIN_OVERRIDE|SYSTEM_MESSAGE)\]/gi,
    /<\/?(?:system|instruction|admin_override|jailbreak|prompt|untrusted_community_data|conversation_memory|user_query)>/gi,
    /```(?:system|instruction|prompt)\b/gi,
    /<\|im_start\|>system/gi,
    /\[VERIFIED COMMUNITY INSIGHTS CONTEXT\]/gi,
  ];

  /**
   * Secret patterns for detection and redaction
   */
  private static readonly SECRET_PATTERNS: Array<{ regex: RegExp; placeholder: string; name: string }> = [
    // Discord Bot tokens (strict format + general format + assignments)
    {
      regex: /[MNO][a-zA-Z0-9_-]{20,28}\.[a-zA-Z0-9_-]{3,10}\.[a-zA-Z0-9_.-]{3,45}/g,
      placeholder: '[REDACTED_DISCORD_TOKEN]',
      name: 'Discord Bot Token',
    },
    {
      regex: /(?:discord_token|discord_bot_token|token|bot_token)\s*=\s*[a-zA-Z0-9_.-]+/gi,
      placeholder: '[REDACTED_DISCORD_TOKEN]',
      name: 'Discord Token Assignment',
    },
    // Google / Gemini API Keys
    {
      regex: /AIza[0-9A-Za-z-_]{30,40}/g,
      placeholder: '[REDACTED_API_KEY]',
      name: 'Google API Key',
    },
    // GitHub Personal Access Tokens
    {
      regex: /ghp_[a-zA-Z0-9]{20,}/g,
      placeholder: '[REDACTED_GITHUB_TOKEN]',
      name: 'GitHub Token',
    },
    // Session / Secret Key assignments
    {
      regex: /(?:session_secret|secret_key|api_key|client_secret|access_token|password)\s*=\s*[a-zA-Z0-9_.-]+/gi,
      placeholder: '[REDACTED_SECRET]',
      name: 'Secret Assignment',
    },
    // Bearer / JWT Tokens
    {
      regex: /Bearer\s+ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/gi,
      placeholder: 'Bearer [REDACTED_JWT]',
      name: 'JWT Bearer Token',
    },
    // Raw JWT strings
    {
      regex: /ey[A-Za-z0-9-_]{20,}\.ey[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}/g,
      placeholder: '[REDACTED_JWT]',
      name: 'Raw JWT Token',
    },
    // Discord Webhooks
    {
      regex: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi,
      placeholder: '[REDACTED_WEBHOOK_URL]',
      name: 'Discord Webhook URL',
    },
    // Private keys
    {
      regex: /-----BEGIN\s+[A-Z ]*PRIVATE\s+KEY-----[\s\S]*?-----END\s+[A-Z ]*PRIVATE\s+KEY-----/gi,
      placeholder: '[REDACTED_PRIVATE_KEY]',
      name: 'Private Key',
    },
    // Database connection strings (Postgres, Mongo, etc.)
    {
      regex: /(?:postgres|postgresql|mongodb|mysql):\/\/[^\s"']+/gi,
      placeholder: '[REDACTED_DB_CONNECTION_STRING]',
      name: 'Database URL',
    },
    // Generic secrets in JSON/YAML/Assignments
    {
      regex: /("(?:clientSecret|botToken|apiKey|secretKey|password|accessToken)"\s*:\s*)"[^"]+"/gi,
      placeholder: '$1"[REDACTED_SECRET]"',
      name: 'JSON Secret Assignment',
    },
    // Generic named secret tokens and variables (e.g. bot_token_*, discord_bot_token_*, api_key_*)
    {
      regex: /(?:bot_token|discord_bot_token|discord_token|api_key|client_secret|access_token|session_secret|secret_key|password)_[a-zA-Z0-9_-]+/gi,
      placeholder: '[REDACTED_SECRET_TOKEN]',
      name: 'Named Secret Token',
    },
    // System Prompt and Internal Security instructions leaks
    {
      regex: /(?:System Prompt|Internal Security Rules|Strict Directives):[^\n,;]+/gi,
      placeholder: '[REDACTED_SYSTEM_INSTRUCTIONS]',
      name: 'System Prompt Instruction',
    },
  ];

  /**
   * Guaranteed outcome claims prohibited in AI outputs
   */
  private static readonly GUARANTEE_PATTERNS = [
    /\b(will\s+definitely|guarantee|guaranteed|guarantees|100%\s+certain|100%\s+assured|fail-?safe|without\s+fail|absolute\s+certainty)\b/i,
  ];

  /**
   * Fake action execution claims (e.g. AI falsely claiming it directly deleted a channel or modified Discord)
   */
  private static readonly FAKE_ACTION_EXECUTION_PATTERNS = [
    /\b(?:i\s+have\s+(?:deleted|banned|kicked|created|modified|updated|executed|wiped)\s+(?:the\s+)?(?:channel|role|user|guild|server|database|workflow))\b/i,
    /\b(?:action\s+has\s+been\s+(?:executed|performed|completed)\s+in\s+discord)\b/i,
  ];

  /**
   * Classify user input and validate security boundaries.
   */
  static validateInput(
    prompt: unknown,
    options?: {
      communityId?: string;
      userContext?: UserAuthContext;
    }
  ): InputValidationResult {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return {
        valid: false,
        sanitizedPrompt: '',
        classification: 'SAFE',
        errorCode: 'PROMPT_REQUIRED',
        message: 'Prompt must be a non-empty string.',
      };
    }

    const trimmed = prompt.trim();
    if (trimmed.length > 2000) {
      return {
        valid: false,
        sanitizedPrompt: '',
        classification: 'SAFE',
        errorCode: 'PROMPT_TOO_LONG',
        message: 'Prompt exceeds maximum permitted length of 2000 characters.',
      };
    }

    // 1. Check for direct injection and unsafe patterns
    for (const rule of this.DIRECT_INJECTION_PATTERNS) {
      if (rule.regex.test(trimmed)) {
        let errorCode: InputValidationResult['errorCode'] = 'PROMPT_INJECTION_DETECTED';
        if (rule.classification === 'SECRET_EXTRACTION') errorCode = 'SECRET_EXTRACTION_DETECTED';
        if (rule.classification === 'ROLE_SPOOFING') errorCode = 'ROLE_SPOOFING_DETECTED';
        if (rule.classification === 'CROSS_TENANT_MANIPULATION') errorCode = 'CROSS_TENANT_VIOLATION';
        if (rule.classification === 'CONFIRMATION_BYPASS') errorCode = 'CONFIRMATION_BYPASS_ATTEMPT';
        if (rule.classification === 'UNSAFE_INSTRUCTION') errorCode = 'UNSAFE_INSTRUCTION_DETECTED';

        return {
          valid: false,
          sanitizedPrompt: '',
          classification: rule.classification,
          errorCode,
          message: `Security Policy Violation: ${rule.reason}.`,
          violations: [rule.reason],
        };
      }
    }

    // 2. Check for delimiter breakout attempts
    for (const delimiterPattern of this.DELIMITER_BREAKOUT_PATTERNS) {
      if (delimiterPattern.test(trimmed)) {
        return {
          valid: false,
          sanitizedPrompt: '',
          classification: 'PROMPT_INJECTION',
          errorCode: 'PROMPT_INJECTION_DETECTED',
          message: 'The query contains unauthorized system delimiter tags.',
          violations: ['Delimiter breakout attack detected'],
        };
      }
    }

    // 3. Redact any accidental secrets contained in prompt
    const { sanitized } = this.redactSecrets(trimmed);

    return {
      valid: true,
      sanitizedPrompt: sanitized,
      classification: 'SAFE',
    };
  }

  /**
   * Sanitizes untrusted external and community content (Discord names, templates, applicant text, etc.)
   * before placing into LLM context prompts to prevent Indirect Prompt Injections.
   */
  static sanitizeUntrustedContent(content: string): string {
    if (!content || typeof content !== 'string') return '';

    let result = content;

    // 1. Redact secrets first
    result = this.redactSecrets(result).sanitized;

    // 2. Strip script tags and HTML injection elements
    result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // 3. Neutralize delimiter tags that might mimic prompt wrappers
    for (const pattern of this.DELIMITER_BREAKOUT_PATTERNS) {
      result = result.replace(pattern, '');
    }

    // 4. Defang known indirect injection phrases within untrusted strings
    for (const rule of this.DIRECT_INJECTION_PATTERNS) {
      if (rule.regex.test(result)) {
        result = result.replace(rule.regex, '[UNTRUSTED_CONTENT_DEFANGED]');
      }
    }

    return result.trim();
  }

  /**
   * Redacts known application secrets, credentials, and API keys.
   */
  static redactSecrets<T = unknown>(input: T): RedactionResult<T> {
    let redactedCount = 0;

    const sanitizeString = (str: string): string => {
      let result = str;

      for (const pattern of this.SECRET_PATTERNS) {
        const matches = result.match(pattern.regex);
        if (matches) {
          redactedCount += matches.length;
          result = result.replace(pattern.regex, pattern.placeholder);
        }
      }

      // Check configured environment secrets
      const knownSecrets = [
        config.DISCORD_BOT_TOKEN,
        config.DISCORD_CLIENT_SECRET,
        config.GEMINI_API_KEY,
        config.PLATFORM_ADMIN_KEY,
        process.env.SESSION_SECRET,
      ].filter((s): s is string => typeof s === 'string' && s.length > 5);

      for (const secret of knownSecrets) {
        if (result.includes(secret)) {
          redactedCount++;
          result = result.split(secret).join('[REDACTED_CONFIG_SECRET]');
        }
      }

      return result;
    };

    const sanitizeObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return sanitizeString(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      if (obj !== null && typeof obj === 'object') {
        const out: Record<string, any> = {};
        for (const key of Object.keys(obj)) {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey.includes('secret') ||
            lowerKey.includes('token') ||
            lowerKey.includes('password') ||
            lowerKey.includes('apikey')
          ) {
            redactedCount++;
            out[key] = '[REDACTED_CREDENTIAL]';
          } else {
            out[key] = sanitizeObject(obj[key]);
          }
        }
        return out;
      }
      return obj;
    };

    const sanitized = sanitizeObject(input) as T;
    return { sanitized, redactedCount };
  }

  /**
   * Validates that the provided context payload is strictly bounded to the target tenant.
   */
  static validateContextBoundary(context: AiCommunityContext, expectedCommunityId: string): void {
    if (!context || !context.tenant) {
      throw new Error('Invalid context structure: missing tenant metadata');
    }
    if (context.tenant.communityId !== expectedCommunityId) {
      throw new Error(
        `Context boundary violation: Context belongs to tenant ${context.tenant.communityId}, expected ${expectedCommunityId}`
      );
    }
  }

  /**
   * Validates the generated AI model output for security, privacy, and correctness.
   */
  static validateOutput(output: string, context?: AiCommunityContext): OutputValidationResult {
    const violations: string[] = [];

    // 1. Redact any leaked secrets in the response
    const { sanitized, redactedCount } = this.redactSecrets(output || '');

    // 2. Check for prohibited guaranteed claims
    const hasGuaranteedClaims = this.GUARANTEE_PATTERNS.some((p) => p.test(sanitized));
    if (hasGuaranteedClaims) {
      violations.push('Output contains ungrounded guaranteed outcome claims');
    }

    // 3. Check for fake direct action execution claims
    const hasUnverifiedActionClaim = this.FAKE_ACTION_EXECUTION_PATTERNS.some((p) => p.test(sanitized));
    if (hasUnverifiedActionClaim) {
      violations.push('Output falsely claims authoritative execution of actions without pipeline confirmation');
    }

    // 4. Check for system prompt leaks
    if (
      (sanitized.includes('You are the AI Community Manager') || sanitized.includes('Strict Directives')) &&
      (sanitized.includes('TENANT GROUNDING') ||
        sanitized.includes('system instructions') ||
        sanitized.includes('initial prompt') ||
        sanitized.includes('Strict Directives:'))
    ) {
      violations.push('Output contains system prompt instructions');
    }

    return {
      valid: violations.length === 0,
      sanitized,
      violations,
      redactedCount,
      hasGuaranteedClaims,
      hasUnverifiedActionClaim,
    };
  }

  /**
   * Records a security violation audit event with exact classification.
   */
  static async recordSecurityAudit(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    action:
      | 'AI_PROMPT_INJECTION_BLOCKED'
      | 'AI_SECRET_REDACTION'
      | 'AI_UNSAFE_REQUEST_BLOCKED'
      | 'AI_CONTEXT_BOUNDARY_VIOLATION'
      | 'AI_OUTPUT_VALIDATION_FAILED'
      | 'AI_SAFETY_VIOLATION';
    reason: string;
    details?: Record<string, unknown>;
    requestId?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await AiAuditService.logSecurityEvent({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: params.action,
        reason: params.reason,
        details: params.details,
        requestId: params.requestId,
        ipAddress: params.ipAddress,
      });
    } catch (err) {
      logger.warn('[AiSecurityPolicyService] Failed to record security audit log:', err);
    }
  }
}
