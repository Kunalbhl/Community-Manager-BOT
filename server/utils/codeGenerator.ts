/**
 * Generates unique recruiter codes with human-readable prefixes and numerical suffixes.
 * Example: "KRP-001", "ALEX-002"
 */
export function generateRecruiterCode(username: string, existingCodes: string[] = []): string {
  // Extract alphanumeric prefix from username (2-5 characters)
  const cleanName = username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const prefix = cleanName.length >= 2 ? cleanName.slice(0, 4) : 'REC';

  const existingSet = new Set(existingCodes.map((c) => c.toUpperCase()));

  let suffix = 1;
  let candidate = `${prefix}-${String(suffix).padStart(3, '0')}`;

  while (existingSet.has(candidate)) {
    suffix++;
    candidate = `${prefix}-${String(suffix).padStart(3, '0')}`;
  }

  return candidate;
}
