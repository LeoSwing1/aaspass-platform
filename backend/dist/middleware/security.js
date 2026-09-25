import crypto from 'node:crypto';
import { allowedOrigins, env, isProduction } from '../config/env.js';
const buckets = new Map();
let lastCleanup = 0;
export function securityHeaders(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cache-Control', 'no-store');
    if (isProduction)
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
}
export function requestId(req, res, next) {
    const incoming = req.header('x-request-id');
    const id = incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
}
export function rateLimit(name, max, windowMs = env.RATE_LIMIT_WINDOW_MS) {
    return (req, res, next) => {
        const now = Date.now();
        if (now - lastCleanup > windowMs) {
            for (const [key, bucket] of buckets.entries())
                if (bucket.resetAt <= now)
                    buckets.delete(key);
            lastCleanup = now;
        }
        const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
        const ip = forwarded || req.ip || req.socket.remoteAddress || 'unknown';
        const key = `${name}:${ip}`;
        const existing = buckets.get(key);
        if (!existing || existing.resetAt <= now) {
            buckets.set(key, { resetAt: now + windowMs, count: 1 });
            next();
            return;
        }
        existing.count += 1;
        if (existing.count > max) {
            const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
            res.setHeader('Retry-After', retryAfter);
            res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests. Please retry later.', requestId: req.requestId });
            return;
        }
        next();
    };
}
export function corsOrigin(origin) {
    if (!origin)
        return true;
    return allowedOrigins.includes(origin);
}
