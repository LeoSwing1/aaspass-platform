import { loadEnvFile } from 'node:process';
import { z } from 'zod';
// Load backend/.env before validating the environment.
try {
    loadEnvFile('.env');
}
catch { /* Host/CI environment variables may be supplied without a file. */ }
const booleanFromEnv = (defaultValue) => z.preprocess((value) => {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true')
            return true;
        if (normalized === 'false')
            return false;
    }
    return value;
}, z.boolean().default(defaultValue));
const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4100),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: booleanFromEnv(false),
    TRUST_PROXY: booleanFromEnv(false),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
    JWT_SECRET: z.string().min(32).default('dev-only-change-this-secret-before-production-please-123456'),
    JWT_ISSUER: z.string().default('aaspass-api'),
    JWT_AUDIENCE: z.string().default('aaspass-client'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    DEV_AUTH_ENABLED: booleanFromEnv(true),
    DEV_OTP: z.string().regex(/^\d{6}$/).default('270303'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(180),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    CASHFREE_MODE: z.enum(['sandbox', 'production']).default('sandbox'),
    CASHFREE_API_VERSION: z.string().default('2025-01-01'),
    CASHFREE_CLIENT_ID: z.string().optional(),
    CASHFREE_CLIENT_SECRET: z.string().optional(),
    DEFAULT_ZONE_NAME: z.string().default('Lucknow Pilot'),
    DEFAULT_ZONE_LATITUDE: z.coerce.number().default(26.8467),
    DEFAULT_ZONE_LONGITUDE: z.coerce.number().default(80.9462),
    DEFAULT_SERVICE_RADIUS_KM: z.coerce.number().positive().default(10),
    MAPS_PROVIDER: z.enum(['haversine', 'google-routes']).default('haversine'),
    GOOGLE_ROUTES_API_KEY: z.string().optional(),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),
    KYC_PROVIDER: z.string().default('not-configured'),
    KYC_API_KEY: z.string().optional(),
    STORAGE_PROVIDER: z.string().default('not-configured'),
    STORAGE_BUCKET: z.string().optional(),
    NOTIFICATION_DISPATCH_BATCH_SIZE: z.coerce.number().int().positive().default(25),
    NOTIFICATION_DISPATCH_ENABLED: booleanFromEnv(true),
    WHATSAPP_API_VERSION: z.string().default('v23.0'),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    DELIVERY_OTP_SECRET: z.string().min(32).default('dev-only-delivery-otp-secret-change-this-before-production-123456789')
});
export const env = schema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
export const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
if (isProduction) {
    if (env.DEV_AUTH_ENABLED)
        throw new Error('DEV_AUTH_ENABLED must be false in production');
    if (env.JWT_SECRET === 'dev-only-change-this-secret-before-production-please-123456')
        throw new Error('JWT_SECRET must be rotated before production');
}
