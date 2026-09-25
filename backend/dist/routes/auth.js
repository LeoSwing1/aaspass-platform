import { Router } from 'express';
import { z } from 'zod';
import { env, isProduction } from '../config/env.js';
import { query } from '../db/pool.js';
import { createAccessToken } from '../utils/token.js';
import { ROLES } from '../types/auth.js';
import { audit } from '../services/audit.js';
import { rateLimit } from '../middleware/security.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
const login = z.object({
    phone: z.string().regex(/^\+?[0-9]{8,15}$/),
    otp: z.string().regex(/^\d{6}$/),
    role: z.enum(ROLES).default('CUSTOMER'),
    name: z.string().trim().min(2).max(100).default('AasPass User')
});
router.post('/dev/login', rateLimit('auth-dev-login', env.AUTH_RATE_LIMIT_MAX), async (req, res, next) => {
    try {
        if (isProduction || !env.DEV_AUTH_ENABLED) {
            res.status(404).json({ error: 'NOT_FOUND', requestId: req.requestId });
            return;
        }
        const input = login.parse(req.body);
        if (input.otp !== env.DEV_OTP) {
            res.status(401).json({ error: 'INVALID_OTP', requestId: req.requestId });
            return;
        }
        const existing = await query('SELECT id,role,name FROM users WHERE phone=$1 LIMIT 1', [input.phone]);
        if (existing.rows[0] && existing.rows[0].role !== input.role) {
            res.status(409).json({ error: 'ROLE_MISMATCH', message: 'This development phone is already provisioned for a different AasPass role. Use a separate test account for another surface.', requestId: req.requestId });
            return;
        }
        const result = await query(`INSERT INTO users(phone,name,role) VALUES($1,$2,$3) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,updated_at=NOW() RETURNING id,role,name`, [input.phone, input.name, input.role]);
        const user = result.rows[0];
        if (!user)
            throw new Error('User creation failed');
        const accessToken = createAccessToken(user, env.JWT_SECRET, env.ACCESS_TOKEN_TTL_SECONDS, env.JWT_ISSUER, env.JWT_AUDIENCE);
        // Development-only provisioning keeps the multi-surface workspace connected on a fresh DB.
        if (user.role === 'VENDOR_OWNER') {
            const plan = await query("SELECT id FROM vendor_plans WHERE code='BUSINESS' LIMIT 1");
            const vendor = await query("INSERT INTO vendors(owner_user_id,plan_id,name,slug,status,rating,review_count,is_open,phone) VALUES($1,$2,$3,$4,'PENDING',0,0,FALSE,$5) ON CONFLICT(owner_user_id) DO UPDATE SET name=EXCLUDED.name,updated_at=NOW() RETURNING id", [user.id, plan.rows[0]?.id ?? null, input.name, `aaspass-dev-store-${user.id.slice(0, 8)}`, input.phone]);
            const vendorId = vendor.rows[0]?.id;
            if (vendorId && plan.rows[0]?.id) {
                await query("INSERT INTO vendor_members(vendor_id,user_id,role) VALUES($1,$2,'VENDOR_OWNER') ON CONFLICT(vendor_id,user_id) DO NOTHING", [vendorId, user.id]);
                await query("INSERT INTO vendor_kyc(vendor_id,status) VALUES($1,'PENDING') ON CONFLICT(vendor_id) DO NOTHING", [vendorId]);
                await query("INSERT INTO vendor_subscriptions(vendor_id,plan_id,status,starts_at) VALUES($1,$2,'PENDING',NOW()) ON CONFLICT DO NOTHING", [vendorId, plan.rows[0].id]);
            }
        }
        if (user.role === 'DELIVERY_PARTNER') {
            await query("INSERT INTO delivery_partners(user_id,status,mode,kyc_status,last_seen_at) VALUES($1,'OFFLINE',NULL,'PENDING',NOW()) ON CONFLICT(user_id) DO UPDATE SET last_seen_at=NOW()", [user.id]);
        }
        let customerCode;
        if (user.role === 'CUSTOMER') {
            const profile = await query(`SELECT customer_code FROM customer_profiles WHERE user_id=$1 LIMIT 1`, [user.id]);
            customerCode = profile.rows[0]?.customer_code;
        }
        const tokenParts = accessToken.split('.');
        const payloadPart = tokenParts[1];
        if (!payloadPart)
            throw new Error('Token payload missing');
        const decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
        await query(`INSERT INTO auth_sessions(jti,user_id,expires_at,last_seen_at,ip_address,user_agent) VALUES($1,$2,to_timestamp($3),NOW(),$4,$5) ON CONFLICT(jti) DO NOTHING`, [decoded.jti, user.id, decoded.exp, req.ip ?? null, req.header('user-agent') ?? null]);
        await audit('AUTH_DEV_LOGIN', 'users', user.id, user.id, { role: user.role, requestId: req.requestId });
        res.json({ accessToken, user, ...(customerCode ? { customer: { customerCode } } : {}) });
    }
    catch (e) {
        next(e);
    }
});
router.post('/logout', requireAuth, async (req, res, next) => {
    try {
        if (process.env.DATABASE_URL && req.authTokenJti) {
            await query('UPDATE auth_sessions SET revoked_at=NOW(), revoke_reason=$2 WHERE jti=$1 AND revoked_at IS NULL', [req.authTokenJti, 'USER_LOGOUT']);
            await audit('AUTH_LOGOUT', 'auth_sessions', req.authTokenJti, req.authUser?.id ?? null, { requestId: req.requestId });
        }
        res.status(204).send();
    }
    catch (e) {
        next(e);
    }
});
export default router;
