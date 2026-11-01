import { config } from '../../config/env.js';
import { googleOAuthConfigured } from './googleApi.js';

/**
 * Google Calendar is real: available once GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are set.
 * Google Sheets writes are not built yet and report "not available" in production.
 * Development simulation keeps the old behaviour so the legacy test suite still runs.
 */
const isSimulation = () => config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION';

export function calendarAvailable(): boolean {
  return googleOAuthConfigured() || isSimulation();
}

/** Real Google Calendar API calls should be made (not simulation). */
export function calendarIsReal(): boolean {
  return googleOAuthConfigured() && !isSimulation();
}

export function googleIntegrationsAvailable(): boolean {
  return isSimulation();
}

export const GOOGLE_NOT_AVAILABLE_MESSAGE =
  'Google Sheets is not available yet. Applications still work inside Discord and the dashboard.';
export const CALENDAR_NOT_CONFIGURED_MESSAGE =
  'Google Calendar is not set up on this server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing).';
