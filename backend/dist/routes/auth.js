import { Router } from 'express';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { env, isProduction } from '../config/env.js';
import { query } from '../db/pool.js';
import { createAccessToken } from '../utils/token.js';
import { ROLES } from '../types/auth.js';
import { audit } from '../services/audit.js';
import { rateLimit } from '../middleware/security.js';
import { requireAuth } from '../middleware/auth.js';
import { sendWhatsAppText, whatsappConfigured } from '../services/notifications/service.js';
const router = Router();
/**
 * TEMPORARY DEVELOPMENT LOGIN
 * ----------------------------
 * Used only until real WhatsApp OTP authentication is connected.
 *
 * This allows the AasPass HQ Super Admin to enter the application
 * while the production WhatsApp OTP integration remains disabled.
 *
 * REMOVE THIS BLOCK when real OTP authentication is connected.
 */
const DEMO_ADMIN_PHONE = '8840751012';
const DEMO_ADMIN_OTP = '270303';
const DEMO_ADMIN_ENABLED = true;
/**
 * Development login
 * ------------------
 * Kept for local development and temporary HQ demo access.
 */
const login = z.object({
    phone: z.string().regex(/^\+?[0-9]{8,15}$/),
    otp: z.string().regex(/^\d{6}$/),
    role: z.enum(ROLES).default('CUSTOMER'),
    name: z.string().trim().min(2).max(100).default('AasPass User')
});
router.post('/dev/login', rateLimit('auth-dev-login', env.AUTH_RATE_LIMIT_MAX), async (req, res, next) => {
    try {
        const input = login.parse(req.body);
        const normalizedPhone = input.phone.replace(/\D/g, '');
        /**
         * Temporary production Super Admin access.
         *
         * This is intentionally restricted to:
         * - one phone number
         * - one OTP
         * - SUPER_ADMIN role
         */
        const isTemporaryDemoAdmin = DEMO_ADMIN_ENABLED &&
            normalizedPhone === DEMO_ADMIN_PHONE &&
            input.otp === DEMO_ADMIN_OTP &&
            input.role === 'SUPER_ADMIN';
        /**
         * Normal development authentication remains protected.
         *
         * Production may only pass when the request is the temporary
         * hard-coded Super Admin login above.
         */
        if ((isProduction || !env.DEV_AUTH_ENABLED) &&
            !isTemporaryDemoAdmin) {
            res.status(404).json({
                error: 'NOT_FOUND',
                requestId: req.requestId
            });
            return;
        }
        /**
         * For the temporary demo admin we use the hard-coded OTP.
         *
         * For normal development accounts we continue using DEV_OTP.
         */
        if (!isTemporaryDemoAdmin && input.otp !== env.DEV_OTP) {
            res.status(401).json({
                error: 'INVALID_OTP',
                requestId: req.requestId
            });
            return;
        }
        const existing = await query('SELECT id,role,name FROM users WHERE phone=$1 LIMIT 1', [input.phone]);
        if (existing.rows[0] &&
            existing.rows[0].role !== input.role &&
            !isTemporaryDemoAdmin) {
            res.status(409).json({
                error: 'ROLE_MISMATCH',
                message: 'This development phone is already provisioned for a different AasPass role. Use a separate test account for another surface.',
                requestId: req.requestId
            });
            return;
        }
        const result = await query(`INSERT INTO users(phone,name,role)
   VALUES($1,$2,$3)
   ON CONFLICT(phone)
   DO UPDATE SET
     name=EXCLUDED.name,
     updated_at=NOW()
   RETURNING id,role,name`, [input.phone, input.name, input.role]);
        const existingUser = result.rows[0];
        if (!existingUser) {
            throw new Error('User creation failed');
        }
        /**
         * Temporary HQ demo login:
         * Do NOT modify the production database user's stored role.
         * The temporary login receives SUPER_ADMIN privileges through
         * the JWT only.
         */
        const user = isTemporaryDemoAdmin
            ? {
                ...existingUser,
                role: 'SUPER_ADMIN'
            }
            : existingUser;
        if (!user) {
            throw new Error('User creation failed');
        }
        const accessToken = createAccessToken(user, env.JWT_SECRET, env.ACCESS_TOKEN_TTL_SECONDS, env.JWT_ISSUER, env.JWT_AUDIENCE);
        /**
         * Development-only provisioning keeps the multi-surface workspace
         * connected on a fresh DB.
         */
        if (user.role === 'VENDOR_OWNER') {
            const plan = await query("SELECT id FROM vendor_plans WHERE code='BUSINESS' LIMIT 1");
            const vendor = await query(`INSERT INTO vendors(
            owner_user_id,
            plan_id,
            name,
            slug,
            status,
            rating,
            review_count,
            is_open,
            phone
          )
          VALUES(
            $1,
            $2,
            $3,
            $4,
            'PENDING',
            0,
            0,
            FALSE,
            $5
          )
          ON CONFLICT(owner_user_id)
          DO UPDATE SET
            name=EXCLUDED.name,
            updated_at=NOW()
          RETURNING id`, [
                user.id,
                plan.rows[0]?.id ?? null,
                input.name,
                `aaspass-dev-store-${user.id.slice(0, 8)}`,
                input.phone
            ]);
            const vendorId = vendor.rows[0]?.id;
            if (vendorId && plan.rows[0]?.id) {
                await query(`INSERT INTO vendor_members(
              vendor_id,
              user_id,
              role
            )
            VALUES($1,$2,'VENDOR_OWNER')
            ON CONFLICT(vendor_id,user_id) DO NOTHING`, [vendorId, user.id]);
                await query(`INSERT INTO vendor_kyc(vendor_id,status)
             VALUES($1,'PENDING')
             ON CONFLICT(vendor_id) DO NOTHING`, [vendorId]);
                await query(`INSERT INTO vendor_subscriptions(
              vendor_id,
              plan_id,
              status,
              starts_at
            )
            VALUES($1,$2,'PENDING',NOW())
            ON CONFLICT DO NOTHING`, [vendorId, plan.rows[0].id]);
            }
        }
        if (user.role === 'DELIVERY_PARTNER') {
            await query(`INSERT INTO delivery_partners(
            user_id,
            status,
            mode,
            kyc_status,
            last_seen_at
          )
          VALUES(
            $1,
            'OFFLINE',
            NULL,
            'PENDING',
            NOW()
          )
          ON CONFLICT(user_id)
          DO UPDATE SET
            last_seen_at=NOW()`, [user.id]);
        }
        let customerCode;
        if (user.role === 'CUSTOMER') {
            const profile = await query(`SELECT customer_code
           FROM customer_profiles
           WHERE user_id=$1
           LIMIT 1`, [user.id]);
            customerCode = profile.rows[0]?.customer_code;
        }
        const tokenParts = accessToken.split('.');
        const payloadPart = tokenParts[1];
        if (!payloadPart) {
            throw new Error('Token payload missing');
        }
        const decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
        await query(`INSERT INTO auth_sessions(
          jti,
          user_id,
          expires_at,
          last_seen_at,
          ip_address,
          user_agent
        )
        VALUES(
          $1,
          $2,
          to_timestamp($3),
          NOW(),
          $4,
          $5
        )
        ON CONFLICT(jti) DO NOTHING`, [
            decoded.jti,
            user.id,
            decoded.exp,
            req.ip ?? null,
            req.header('user-agent') ?? null
        ]);
        try {
            await audit('AUTH_DEV_LOGIN', 'users', user.id, user.id, {
                role: user.role,
                requestId: req.requestId
            });
        }
        catch {
            // Audit logging must never block temporary HQ authentication.
        }
        res.json({
            accessToken,
            user,
            ...(customerCode
                ? { customer: { customerCode } }
                : {})
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * Production OTP authentication
 * -----------------------------
 */
const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
/**
 * Admin/supervisor roles allowed to enter the Admin application.
 */
const ADMIN_LOGIN_ROLES = [
    'SUPER_ADMIN',
    'ADMIN',
    'OPERATIONS_ADMIN',
    'FINANCE_ADMIN',
    'VENDOR_MANAGER',
    'DELIVERY_MANAGER',
    'SUPPORT_LEAD',
    'SUPPORT_AGENT'
];
const requestLoginOtp = z.object({
    phone: z.string().trim().min(8).max(15),
    role: z.enum(ADMIN_LOGIN_ROLES).default('SUPER_ADMIN')
});
const verifyLoginOtp = z.object({
    phone: z.string().trim().min(8).max(15),
    otp: z.string().regex(/^\d{6}$/),
    role: z.enum(ADMIN_LOGIN_ROLES).default('SUPER_ADMIN')
});
function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    let last10 = digits;
    if (digits.length > 10) {
        last10 = digits.slice(-10);
    }
    if (last10.length !== 10) {
        throw new Error('INVALID_PHONE');
    }
    return {
        dbPhone: last10,
        whatsappPhone: `91${last10}`
    };
}
function hashOtp(otp, salt) {
    return createHash('sha256')
        .update(`${salt}:${otp}:${env.JWT_SECRET}`)
        .digest('hex');
}
function otpMatches(otp, salt, expectedHash) {
    const actualHash = hashOtp(otp, salt);
    return actualHash === expectedHash;
}
/**
 * Request a production login OTP.
 */
router.post('/login/request', rateLimit('auth-login-request', env.AUTH_RATE_LIMIT_MAX), async (req, res, next) => {
    try {
        const input = requestLoginOtp.parse(req.body);
        const { dbPhone, whatsappPhone } = normalizePhone(input.phone);
        if (!whatsappConfigured()) {
            res.status(503).json({
                error: 'OTP_SERVICE_NOT_CONFIGURED',
                message: 'WhatsApp authentication is not configured.',
                requestId: req.requestId
            });
            return;
        }
        /**
         * Only existing accounts can request production login OTPs.
         * We never create an administrative account from the login endpoint.
         */
        const userResult = await query(`SELECT id, role, name, phone
         FROM users
         WHERE RIGHT(
           regexp_replace(phone::text, '\\D', '', 'g'),
           10
         ) = $1
         AND role = $2
         AND is_active = TRUE
         LIMIT 1`, [dbPhone, input.role]);
        const user = userResult.rows[0];
        if (!user) {
            res.status(401).json({
                error: 'INVALID_LOGIN',
                message: 'The supplied account is not authorized for this application.',
                requestId: req.requestId
            });
            return;
        }
        /**
         * Prevent OTP spam.
         */
        const recentOtp = await query(`SELECT id, last_sent_at
         FROM auth_login_otps
         WHERE phone=$1
           AND consumed_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`, [dbPhone]);
        if (recentOtp.rows[0]) {
            const lastSent = new Date(recentOtp.rows[0].last_sent_at).getTime();
            const elapsedSeconds = (Date.now() - lastSent) / 1000;
            if (elapsedSeconds <
                OTP_RESEND_COOLDOWN_SECONDS) {
                const retryAfter = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS -
                    elapsedSeconds);
                res.status(429).json({
                    error: 'OTP_COOLDOWN',
                    message: `Please wait ${retryAfter} seconds before requesting another OTP.`,
                    retryAfter,
                    requestId: req.requestId
                });
                return;
            }
        }
        /**
         * Invalidate any previous active OTP.
         */
        await query(`UPDATE auth_login_otps
         SET consumed_at=NOW()
         WHERE phone=$1
           AND consumed_at IS NULL`, [dbPhone]);
        const otp = randomInt(100000, 1000000).toString();
        const salt = randomBytes(16).toString('hex');
        const otpHash = hashOtp(otp, salt);
        await query(`INSERT INTO auth_login_otps(
          phone,
          otp_hash,
          otp_salt,
          attempts,
          max_attempts,
          expires_at,
          last_sent_at,
          ip_address,
          user_agent
        )
        VALUES(
          $1,
          $2,
          $3,
          0,
          $4,
          NOW() + INTERVAL '5 minutes',
          NOW(),
          $5,
          $6
        )`, [
            dbPhone,
            otpHash,
            salt,
            OTP_MAX_ATTEMPTS,
            req.ip ?? null,
            req.header('user-agent') ?? null
        ]);
        const message = `Your AasPass Admin login OTP is ${otp}. ` +
            `It expires in ${OTP_EXPIRY_MINUTES} minutes. ` +
            `Do not share this OTP with anyone.`;
        try {
            await sendWhatsAppText(whatsappPhone, message);
        }
        catch (whatsappError) {
            /**
             * Do not leave an unusable OTP active when delivery fails.
             */
            await query(`UPDATE auth_login_otps
           SET consumed_at=NOW()
           WHERE phone=$1
             AND consumed_at IS NULL`, [dbPhone]);
            throw whatsappError;
        }
        await audit('AUTH_LOGIN_OTP_REQUESTED', 'users', user.id, user.id, {
            role: user.role,
            channel: 'WHATSAPP',
            requestId: req.requestId
        });
        res.json({
            ok: true,
            message: 'OTP sent successfully.',
            expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
            retryAfter: OTP_RESEND_COOLDOWN_SECONDS,
            requestId: req.requestId
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * Verify production login OTP and issue JWT.
 */
router.post('/login/verify', rateLimit('auth-login-verify', env.AUTH_RATE_LIMIT_MAX), async (req, res, next) => {
    try {
        const input = verifyLoginOtp.parse(req.body);
        const { dbPhone } = normalizePhone(input.phone);
        const userResult = await query(`SELECT id, role, name, phone
         FROM users
         WHERE RIGHT(
           regexp_replace(phone::text, '\\D', '', 'g'),
           10
         ) = $1
         AND role = $2
         AND is_active = TRUE
         LIMIT 1`, [dbPhone, input.role]);
        const user = userResult.rows[0];
        if (!user) {
            res.status(401).json({
                error: 'INVALID_LOGIN',
                requestId: req.requestId
            });
            return;
        }
        const otpResult = await query(`SELECT
          id,
          otp_hash,
          otp_salt,
          attempts,
          max_attempts,
          expires_at
         FROM auth_login_otps
         WHERE phone=$1
           AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`, [dbPhone]);
        const otpRecord = otpResult.rows[0];
        if (!otpRecord) {
            res.status(401).json({
                error: 'OTP_EXPIRED',
                message: 'No active OTP was found. Please request a new OTP.',
                requestId: req.requestId
            });
            return;
        }
        if (new Date(otpRecord.expires_at).getTime() <= Date.now()) {
            await query(`UPDATE auth_login_otps
           SET consumed_at=NOW()
           WHERE id=$1`, [otpRecord.id]);
            res.status(401).json({
                error: 'OTP_EXPIRED',
                message: 'This OTP has expired.',
                requestId: req.requestId
            });
            return;
        }
        if (otpRecord.attempts >=
            otpRecord.max_attempts) {
            await query(`UPDATE auth_login_otps
           SET consumed_at=NOW()
           WHERE id=$1`, [otpRecord.id]);
            res.status(429).json({
                error: 'OTP_ATTEMPTS_EXCEEDED',
                message: 'Too many incorrect OTP attempts. Please request a new OTP.',
                requestId: req.requestId
            });
            return;
        }
        if (!otpMatches(input.otp, otpRecord.otp_salt, otpRecord.otp_hash)) {
            const nextAttempts = otpRecord.attempts + 1;
            await query(`UPDATE auth_login_otps
           SET
             attempts=$2,
             consumed_at=CASE
               WHEN $2 >= max_attempts
               THEN NOW()
               ELSE consumed_at
             END
           WHERE id=$1`, [
                otpRecord.id,
                nextAttempts
            ]);
            res.status(401).json({
                error: 'INVALID_OTP',
                message: 'The OTP is incorrect.',
                attemptsRemaining: Math.max(0, otpRecord.max_attempts -
                    nextAttempts),
                requestId: req.requestId
            });
            return;
        }
        /**
         * Consume OTP before issuing the session.
         */
        await query(`UPDATE auth_login_otps
         SET consumed_at=NOW()
         WHERE id=$1
           AND consumed_at IS NULL`, [otpRecord.id]);
        const accessToken = createAccessToken({
            id: user.id,
            role: user.role,
            name: user.name
        }, env.JWT_SECRET, env.ACCESS_TOKEN_TTL_SECONDS, env.JWT_ISSUER, env.JWT_AUDIENCE);
        const tokenParts = accessToken.split('.');
        const payloadPart = tokenParts[1];
        if (!payloadPart) {
            throw new Error('Token payload missing');
        }
        const decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
        await query(`INSERT INTO auth_sessions(
          jti,
          user_id,
          expires_at,
          last_seen_at,
          ip_address,
          user_agent
        )
        VALUES(
          $1,
          $2,
          to_timestamp($3),
          NOW(),
          $4,
          $5
        )
        ON CONFLICT(jti) DO NOTHING`, [
            decoded.jti,
            user.id,
            decoded.exp,
            req.ip ?? null,
            req.header('user-agent') ?? null
        ]);
        await audit('AUTH_LOGIN', 'users', user.id, user.id, {
            role: user.role,
            channel: 'WHATSAPP_OTP',
            requestId: req.requestId
        });
        res.json({
            accessToken,
            user: {
                id: user.id,
                role: user.role,
                name: user.name
            }
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * Logout
 */
router.post('/logout', requireAuth, async (req, res, next) => {
    try {
        if (process.env.DATABASE_URL &&
            req.authTokenJti) {
            await query(`UPDATE auth_sessions
           SET
             revoked_at=NOW(),
             revoke_reason=$2
           WHERE jti=$1
             AND revoked_at IS NULL`, [
                req.authTokenJti,
                'USER_LOGOUT'
            ]);
            await audit('AUTH_LOGOUT', 'auth_sessions', req.authTokenJti, req.authUser?.id ?? null, {
                requestId: req.requestId
            });
        }
        res.status(204).send();
    }
    catch (e) {
        next(e);
    }
});
export default router;
