/**
 * Live Google Sheets record of every application.
 *
 * The owner pastes a small Apps Script into their own Google Sheet and deploys it as a web app.
 * We POST each application (one row per applicant, one column per question) whenever it changes.
 * No Google sign-in on our side, no stored Google credentials, and the script checks a secret token.
 */
import crypto from 'crypto';
import { logger } from '../../logging/logger.js';
import { applicationsRepository } from '../../repositories/index.js';
import { getToolkit, saveToolkit } from '../toolkit/toolkitConfig.js';

const ALLOWED = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
export const isSheetUrl = (u: unknown) => typeof u === 'string' && ALLOWED.test(u.trim());
export const newSheetToken = () => crypto.randomBytes(18).toString('base64url');

function row(app: any) {
  const answers: Record<string, string> = {};
  for (const a of Array.isArray(app.answers) ? app.answers : []) answers[String(a.questionText || a.questionId)] = String(a.answerText ?? '');
  return {
    'Application ID': app.id,
    'Submitted': app.submittedAt || app.createdAt || '',
    'Status': app.status,
    'Applicant': app.applicantDisplayNameSnapshot || app.applicantUsername || '',
    'Discord username': app.applicantUsernameSnapshot || app.applicantUsername || '',
    'Discord ID': app.applicantDiscordUserId || app.applicantDiscordId || '',
    'Source': app.source === 'DISCORD' ? 'Discord' : app.source || 'Website',
    'Recruiter code': app.recruiterCodeUsed || '',
    'Recruiter Discord ID': String(app.recruiterDiscordUserId || '').replace(/^usr_/, ''),
    'Screening score %': app.screeningScore ?? '',
    'Screening passed': app.screeningPassed === undefined ? '' : app.screeningPassed ? 'Yes' : 'No',
    'Interview summary': app.interviewSummary || '',
    'Reviewed at': app.reviewedAt || '',
    'Rejection reason': app.rejectionReason || '',
    'Discord link': app.discordReviewUrl || '',
    'Last updated': app.updatedAt || '',
    ...answers,
  };
}

async function post(url: string, token: string, rows: any[]) {
  const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, rows }) });
  const text = await res.text().catch(() => '');
  if (!res.ok || /"ok"\s*:\s*false/.test(text)) throw new Error(`Sheet answered ${res.status}: ${text.slice(0, 160)}`);
  return text;
}

export const sheetsSync = {
  async push(applicationId: string) {
    try {
      const app: any = await applicationsRepository.getById(applicationId);
      if (!app) return;
      const cfg = (await getToolkit(app.communityId)).recruitment;
      if (!isSheetUrl(cfg.sheetWebhookUrl) || !cfg.sheetToken) return;
      await post(cfg.sheetWebhookUrl!, cfg.sheetToken, [row(app)]);
    } catch (err: any) {
      logger.warn(`[Sheets] push ${applicationId} failed: ${err?.message}`);
    }
  },

  /** Send every application (used by "Sync now" and as a test). */
  async resync(communityId: string) {
    const t = await getToolkit(communityId);
    const cfg = t.recruitment;
    if (!isSheetUrl(cfg.sheetWebhookUrl) || !cfg.sheetToken) throw new Error('Connect your Google Sheet first.');
    const apps = await applicationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] } as any);
    const rows = (apps as any[]).filter((a) => a.status !== 'DRAFT').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(row);
    try {
      for (let i = 0; i < Math.max(1, rows.length); i += 100) await post(cfg.sheetWebhookUrl!, cfg.sheetToken, rows.slice(i, i + 100));
      await saveToolkit(communityId, { recruitment: { ...cfg, sheetLastSync: { at: new Date().toISOString(), ok: true } } });
      return rows.length;
    } catch (err: any) {
      await saveToolkit(communityId, { recruitment: { ...cfg, sheetLastSync: { at: new Date().toISOString(), ok: false, error: err.message } } });
      throw err;
    }
  },

  /** The script the owner pastes into Extensions → Apps Script. */
  script(token: string) {
    return `// Community Manager → Google Sheets (paste into Extensions → Apps Script, then Deploy → New deployment → Web app)
const TOKEN = '${token}';
const SHEET = 'Applications';

function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');
  if (body.token !== TOKEN) return out({ ok: false, error: 'bad token' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
    let headers = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    (body.rows || []).forEach(function (r) {
      Object.keys(r).forEach(function (k) { if (headers.indexOf(k) === -1) headers.push(k); });
    });
    if (headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (x) { return String(x[0]); }) : [];
    (body.rows || []).forEach(function (r) {
      const values = headers.map(function (h) { return r[h] === undefined ? '' : r[h]; });
      const at = ids.indexOf(String(r['Application ID']));
      if (at >= 0) sh.getRange(at + 2, 1, 1, headers.length).setValues([values]);
      else { sh.appendRow(values); ids.push(String(r['Application ID'])); }
    });
    return out({ ok: true, rows: (body.rows || []).length });
  } finally {
    lock.releaseLock();
  }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
`;
  },
};
