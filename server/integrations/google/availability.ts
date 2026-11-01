import { config } from '../../config/env.js';

/**
 * Real Google API calls (OAuth token exchange, Calendar events, Sheets writes) are not built yet.
 * Until they are, production reports these integrations as "not available" instead of pretending
 * to succeed. Development simulation keeps the old behaviour so the legacy test suite still runs.
 */
export const GOOGLE_APIS_IMPLEMENTED = false;

export function googleIntegrationsAvailable(): boolean {
  return GOOGLE_APIS_IMPLEMENTED || config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION';
}

export const GOOGLE_NOT_AVAILABLE_MESSAGE =
  'Google Calendar and Google Sheets are not available yet. Interviews and applications still work inside Discord and the dashboard.';
