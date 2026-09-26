import { loadEnvFile } from 'node:process';
import { z } from 'zod';

try {
  loadEnvFile('.env');
} catch {
  /* Host/CI environment variables may be supplied without a file. */
}

/**
 * Treat blank environment variables as undefined.
 * This is important because Vercel can contain an environment
 * variable whose value is an empty string.
 */
const blankAsUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === ''
    ? undefined
    : value;

/**
 * String environment variable helper.
 */
const stringFromEnv = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();

      return trimmed === ''
        ? undefined
        : trimmed;
    },
    schema,
  );

/**
 * Enum environment variable helper.
 *
 * Behavior:
 * - trims whitespace
 * - normalizes to lowercase
 * - blank values become undefined
 * - valid values are preserved
 * - invalid values fall back to the supplied default
 *
 * This prevents a bad optional Vercel configuration value
 * from crashing the entire API during startup.
 */
const enumFromEnv = <T extends [string, ...string[]]>(
  values: T,
  fallback: T[number],
): z.ZodType<T[number]> =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const normalized = value.trim().toLowerCase();

      if (normalized === '') {
        return undefined;
      }

      if (values.includes(normalized as T[number])) {
        return normalized;
      }

      return undefined;
    },
    z.enum(values).default(fallback),
  );

/**
 * Number environment variable helper.
 */
const numberFromEnv = <T>(schema: z.ZodType<T>) =>
  z.preprocess(
    blankAsUndefined,
    schema,
  );

/**
 * Boolean environment variable helper.
 *
 * Accepted:
 * true / 1
 * false / 0
 *
 * Blank values use the supplied default.
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();

        if (
          normalized === 'true' ||
          normalized === '1'
        ) {
          return true;
        }

        if (
          normalized === 'false' ||
          normalized === '0'
        ) {
          return false;
        }

        if (normalized === '') {
          return undefined;
        }
      }

      return value;
    },
    z.boolean().default(defaultValue),
  );

const schema = z.object({
  NODE_ENV: enumFromEnv(
    [
      'development',
      'test',
      'production',
    ],
    'development',
  ),

  PORT: numberFromEnv(
    z.coerce
      .number()
      .int()
      .positive()
      .default(4100),
  ),

  DATABASE_URL: stringFromEnv(
    z.string().min(1),
  ),

  DATABASE_SSL: booleanFromEnv(false),

  TRUST_PROXY: booleanFromEnv(false),

  ALLOWED_ORIGINS: stringFromEnv(
    z.string().default(
      'http://localhost:3000,http://localhost:5173',
    ),
  ),

  JWT_SECRET: stringFromEnv(
    z.string().min(32).default(
      'dev-only-change-this-secret-before-production-please-123456',
    ),
  ),

  JWT_ISSUER: stringFromEnv(
    z.string().default('aaspass-api'),
  ),

  JWT_AUDIENCE: stringFromEnv(
    z.string().default('aaspass-client'),
  ),

  ACCESS_TOKEN_TTL_SECONDS: numberFromEnv(
    z.coerce
      .number()
      .int()
      .positive()
      .default(3600),
  ),

  DEV_AUTH_ENABLED: booleanFromEnv(true),

  DEV_OTP: stringFromEnv(
    z.string()
      .regex(/^\d{6}$/)
      .default('270303'),
  ),

  RATE_LIMIT_WINDOW_MS: numberFromEnv(
    z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
  ),

  RATE_LIMIT_MAX: numberFromEnv(
    z.coerce
      .number()
      .int()
      .positive()
      .default(180),
  ),

  AUTH_RATE_LIMIT_MAX: numberFromEnv(
    z.coerce
      .number()
      .int()
      .positive()
      .default(10),
  ),

  WEBHOOK_RATE_LIMIT_MAX: numberFromEnv(
    z.coerce
      .number()
      .int()
      .positive()
      .default(120),
  ),

  CASHFREE_MODE: enumFromEnv(
    [
      'sandbox',
      'production',
    ],
    'sandbox',
  ),

  CASHFREE_API_VERSION: stringFromEnv(
    z.string().default('2025-01-01'),
  ),

  CASHFREE_CLIENT_ID: stringFromEnv(
    z.string().optional(),
  ),

  CASHFREE_CLIENT_SECRET: stringFromEnv(
    z.string().optional(),
  ),

  DEFAULT_ZONE_NAME: stringFromEnv(
    z.string().default('Lucknow Pilot'),
  ),

  DEFAULT_ZONE_LATITUDE: numberFromEnv(
    z.coerce.number().default(26.8467),
  ),

  DEFAULT_ZONE_LONGITUDE: numberFromEnv(
    z.coerce.number().default(80.9462),
  ),

  DEFAULT_SERVICE_RADIUS_KM: numberFromEnv(
    z.coerce
      .number()
      .positive()
      .default(10),
  ),

  /**
   * IMPORTANT:
   * Any blank or invalid MAPS_PROVIDER value now safely
   * falls back to haversine instead of crashing startup.
   */
  MAPS_PROVIDER: enumFromEnv(
    [
      'haversine',
      'google-routes',
    ],
    'haversine',
  ),

  GOOGLE_ROUTES_API_KEY: stringFromEnv(
    z.string().optional(),
  ),

  FCM_PROJECT_ID: stringFromEnv(
    z.string().optional(),
  ),

  FCM_CLIENT_EMAIL: stringFromEnv(
    z.string().optional(),
  ),

  FCM_PRIVATE_KEY: stringFromEnv(
    z.string().optional(),
  ),

  KYC_PROVIDER: stringFromEnv(
    z.string().default('not-configured'),
  ),

  KYC_API_KEY: stringFromEnv(
    z.string().optional(),
  ),

  STORAGE_PROVIDER: stringFromEnv(
    z.string().default('not-configured'),
  ),

  STORAGE_BUCKET: stringFromEnv(
    z.string().optional(),
  ),

  NOTIFICATION_DISPATCH_BATCH_SIZE: numberFromEnv(
    z.coerce
      .number()
      .int()
      .positive()
      .default(25),
  ),

  NOTIFICATION_DISPATCH_ENABLED: booleanFromEnv(true),

  WHATSAPP_API_VERSION: stringFromEnv(
    z.string().default('v23.0'),
  ),

  WHATSAPP_PHONE_NUMBER_ID: stringFromEnv(
    z.string().optional(),
  ),

  WHATSAPP_ACCESS_TOKEN: stringFromEnv(
    z.string().optional(),
  ),

  DELIVERY_OTP_SECRET: stringFromEnv(
    z.string().min(32).default(
      'dev-only-delivery-otp-secret-change-this-secret-before-production-123456789',
    ),
  ),
});

export const env = schema.parse(process.env);

export const isProduction =
  env.NODE_ENV === 'production';

export const allowedOrigins =
  env.ALLOWED_ORIGINS
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

/**
 * Production safety checks.
 */
if (isProduction) {
  if (env.DEV_AUTH_ENABLED) {
    throw new Error(
      'DEV_AUTH_ENABLED must be false in production',
    );
  }

  if (
    env.JWT_SECRET ===
    'dev-only-change-this-secret-before-production-please-123456'
  ) {
    throw new Error(
      'JWT_SECRET must be rotated before production',
    );
  }
}