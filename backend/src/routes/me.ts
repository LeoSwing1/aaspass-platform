import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';

const router = Router();
router.use(requireAuth);
router.get('/', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.DATABASE_URL && req.authUser) {
      const result = await query('SELECT id,phone,name,role,is_active,created_at FROM users WHERE id=$1 LIMIT 1', [req.authUser.id]);
      if (!result.rows[0]) { res.status(404).json({ error: 'USER_NOT_FOUND', requestId: req.requestId }); return; }
      res.json({ user: result.rows[0], environment: env.NODE_ENV });
      return;
    }
    res.json({ user: req.authUser, environment: env.NODE_ENV });
  } catch (e) { next(e); }
});

export default router;
