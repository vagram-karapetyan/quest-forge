import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

export function registerHealthRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/health', () => ({
    ok: true,
    version: config.version,
    authEnabled: config.authEnabled,
    uptimeSeconds: Math.floor(process.uptime()),
  }));
}
