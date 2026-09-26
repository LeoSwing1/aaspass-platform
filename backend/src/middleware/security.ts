import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { allowedOrigins, env, isProduction } from '../config/env.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const buckets = new Map<string, { resetAt: number; count: number }>();
let lastCleanup = 0;

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'no-store');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function rateLimit(name: string, max: number, windowMs = env.RATE_LIMIT_WINDOW_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (now - lastCleanup > windowMs) {
      for (const [key, bucket] of buckets.entries()) if (bucket.resetAt <= now) buckets.delete(key);
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

export function corsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const builtInAllowedOrigins = new Set([
    'https://aaspass-admin.vercel.app'
  ]);

  return (
    allowedOrigins.includes(origin) ||
    builtInAllowedOrigins.has(origin)
  );
}