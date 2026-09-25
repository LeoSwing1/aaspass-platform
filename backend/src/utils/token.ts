import crypto from 'node:crypto';
import type { AccessTokenPayload, AuthUser } from '../types/auth.js';

function sign(input: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export function createAccessToken(user: AuthUser, secret: string, ttlSeconds: number, issuer = 'aaspass-api', audience = 'aaspass-client'): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    ...user,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomUUID(),
    iss: issuer,
    aud: audience
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.${sign(`${header}.${body}`, secret)}`;
}

export function verifyAccessToken(token: string, secret: string, issuer = 'aaspass-api', audience = 'aaspass-client'): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, bodyPart, signaturePart] = parts;
  if (!headerPart || !bodyPart || !signaturePart) return null;
  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
  } catch {
    return null;
  }
  const expected = sign(`${headerPart}.${bodyPart}`, secret);
  const a = Buffer.from(signaturePart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(bodyPart, 'base64url').toString('utf8')) as AccessTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.id || !payload.name || !payload.role || !payload.jti) return null;
    if (!payload.iat || !payload.exp || payload.exp <= now || payload.iat > now + 60) return null;
    if (payload.iss !== issuer || payload.aud !== audience) return null;
    return payload;
  } catch {
    return null;
  }
}
