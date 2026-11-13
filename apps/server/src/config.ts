import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolveServerRoot(): string {
  let current = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const pkgPath = resolve(current, 'package.json');
    if (existsSync(pkgPath)) {
      const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (parsed.name === '@quest-forge/server') {
        return current;
      }
    }
    current = dirname(current);
  }
  return resolve(__dirname, '..');
}

export function readAppVersion(): string {
  let current = __dirname;
  for (let i = 0; i < 8; i += 1) {
    const pkgPath = resolve(current, 'package.json');
    if (existsSync(pkgPath)) {
      const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (parsed.name === 'quest-forge' && parsed.version) {
        return parsed.version;
      }
    }
    current = dirname(current);
  }
  throw new Error('Could not locate root package.json for app version');
}

const EnvSchema = z.object({
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_PATH: z.string().trim().min(1).default('./data/quest-forge.db'),
  ADMIN_USERNAME: z.string().trim().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().default(''),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().positive().default(24),
  GAME_SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(180),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  TRUSTED_PROXIES: z.string().default(''),
  STATIC_DIR: z.string().optional(),
  SEED_DEMOS: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
});

export type AppConfig = {
  version: string;
  host: string;
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databasePath: string;
  adminUsername: string;
  adminPassword: string;
  authEnabled: boolean;
  adminSessionTtlMs: number;
  gameSessionTtlMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  trustedProxies: Set<string>;
  staticDir: string | null;
  seedDemos: boolean;
};

export function loadConfig(overrides: Partial<Record<string, string>> = {}): AppConfig {
  const merged = { ...process.env, ...overrides };
  const parsed = EnvSchema.parse(merged);
  const trustedProxies = new Set(
    parsed.TRUSTED_PROXIES.split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

  const staticCandidate = parsed.STATIC_DIR?.trim() || resolve(resolveServerRoot(), '../web/dist');

  return {
    version: readAppVersion(),
    host: parsed.HOST,
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    databasePath: parsed.DATABASE_PATH,
    adminUsername: parsed.ADMIN_USERNAME,
    adminPassword: parsed.ADMIN_PASSWORD,
    authEnabled: parsed.ADMIN_PASSWORD.length > 0,
    adminSessionTtlMs: Math.round(parsed.ADMIN_SESSION_TTL_HOURS * 3_600_000),
    gameSessionTtlMs: Math.round(parsed.GAME_SESSION_TTL_HOURS * 3_600_000),
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    trustedProxies,
    staticDir: existsSync(staticCandidate) ? staticCandidate : null,
    seedDemos: parsed.SEED_DEMOS,
  };
}
