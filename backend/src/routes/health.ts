import { Router } from 'express';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';

const router = Router();
router.get('/', (_req, res) => res.json({ ok: true, service: 'aaspass-api', version: '0.3.0', environment: env.NODE_ENV }));
router.get('/live', (_req, res) => res.json({ ok: true }));
router.get('/ready', async (_req, res) => {
  if (!process.env.DATABASE_URL) { res.status(503).json({ ok: false, database: 'not_configured' }); return; }
  try { await query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'error' }); }
});
export default router;
