import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { envSchema } from './config/env';

describe('Backend Skeleton Tests', () => {
  describe('GET /health', () => {
    it('returns status ok and database status at root /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('database');
    });

    it('returns status ok at /api/v1/health', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
    });
  });

  describe('GET /config', () => {
    it('returns demoMode boolean and contains no secrets at /config', async () => {
      const res = await request(app).get('/config');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('demoMode');
      expect(typeof res.body.demoMode).toBe('boolean');
      expect(res.body).not.toHaveProperty('JWT_SECRET');
      expect(res.body).not.toHaveProperty('CHAPA_SECRET_KEY');
      expect(res.body).not.toHaveProperty('DATABASE_URL');
    });

    it('returns demoMode at /api/v1/config', async () => {
      const res = await request(app).get('/api/v1/config');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('demoMode');
    });
  });

  describe('Malformed JSON', () => {
    it('returns 400 INVALID_JSON on malformed JSON payload', async () => {
      const res = await request(app)
        .post('/health') // Any endpoint using json body
        .set('Content-Type', 'application/json')
        .send('{ invalid json payload');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON in request body',
        },
      });
    });
  });

  describe('Zod Environment Validation', () => {
    it('refuses to validate if required variables are missing or malformed', () => {
      const invalidEnv = {
        // Missing JWT_SECRET, CORS_ORIGIN, etc.
        PORT: 'not-a-number',
      };
      const result = envSchema.safeParse(invalidEnv);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('JWT_SECRET');
        expect(paths).toContain('CORS_ORIGIN');
        expect(paths).toContain('APP_BASE_URL');
        expect(paths).toContain('API_BASE_URL');
      }
    });

    it('rejects JWT_SECRET shorter than 32 characters', () => {
      const shortSecretEnv = {
        JWT_SECRET: 'short_secret',
        CORS_ORIGIN: 'http://localhost:5173',
        APP_BASE_URL: 'http://localhost:5173',
        API_BASE_URL: 'http://localhost:4000',
      };
      const result = envSchema.safeParse(shortSecretEnv);
      expect(result.success).toBe(false);
      if (!result.success) {
        const secretIssue = result.error.issues.find((i) => i.path.includes('JWT_SECRET'));
        expect(secretIssue?.message).toContain('at least 32 characters');
      }
    });
  });
});
