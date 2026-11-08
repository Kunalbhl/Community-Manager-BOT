import { Request, Response } from 'express';
import { postgresStore } from '../repositories/postgres.store.js';
import { logger } from '../logging/logger.js';

/** Lists leftover local-dev demo records. Nothing is changed. */
export async function listDemoRecords(_req: Request, res: Response) {
  try {
    const rows = await postgresStore.findDemoRecords();
    const byCollection: Record<string, string[]> = {};
    for (const r of rows) (byCollection[r.collection] ||= []).push(r.id);
    res.json({ success: true, data: { total: rows.length, byCollection } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
}

/** Deletes exactly the records the listing shows. The caller must send the total it saw, so nothing unexpected is removed. */
export async function deleteDemoRecords(req: Request, res: Response) {
  try {
    const rows = await postgresStore.findDemoRecords();
    if (Number(req.body?.confirmTotal) !== rows.length) {
      return res.status(409).json({ success: false, error: `The list changed: it now has ${rows.length} records. Review it again first.` });
    }
    const deleted = await postgresStore.deleteMany(rows);
    logger.info(`[Cleanup] Deleted ${deleted} demo records at the platform owner's request.`);
    res.json({ success: true, data: { deleted } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
}
