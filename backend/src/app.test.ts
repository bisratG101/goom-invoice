import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, createApp } from './app';
import { envSchema } from './config/env';
import { createRateLimiter } from './middleware/rateLimit';

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

  describe('Oversized Payload', () => {
    it('returns 413 PAYLOAD_TOO_LARGE on body exceeding 100kb limit', async () => {
      const oversizedPayload = JSON.stringify({ data: 'a'.repeat(105 * 1024) });
      const res = await request(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send(oversizedPayload);

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds 100kb limit',
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

  describe('Reverse Proxy Trust & Rate Limiting Behavior', () => {
    it('correctly resolves client IP behind a single-hop reverse proxy and ignores spoofed headers', async () => {
      const testApp = createApp();
      testApp.set('trust proxy', 1);

      let capturedIp = '';
      testApp.get('/test-proxy-ip', (req, res) => {
        capturedIp = req.ip || '';
        res.status(200).json({ ip: req.ip });
      });

      // Client sends spoofed IP 198.51.100.1; proxy appends real client IP 203.0.113.195
      const res = await request(testApp)
        .get('/test-proxy-ip')
        .set('X-Forwarded-For', '198.51.100.1, 203.0.113.195');

      expect(res.status).toBe(200);
      expect(capturedIp).toBe('203.0.113.195');
      expect(res.body.ip).toBe('203.0.113.195');
    });

    it('enforces rate limiting on real client IP even when spoofed X-Forwarded-For headers rotate', async () => {
      const testApp = createApp();
      testApp.set('trust proxy', 1);

      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: 'Rate limit reached',
      });

      testApp.get('/test-rate-limit', limiter, (_req, res) => {
        res.status(200).json({ status: 'ok' });
      });

      const realIp = '198.51.100.42';

      // First 3 requests from same real IP (with varying spoofed client headers) should succeed
      for (let i = 1; i <= 3; i++) {
        const res = await request(testApp)
          .get('/test-rate-limit')
          .set('x-test-rate-limit', 'true')
          .set('X-Forwarded-For', `10.0.0.${i}, ${realIp}`);
        expect(res.status).toBe(200);
      }

      // 4th request from same real IP should be rate limited (429) regardless of new spoofed IP
      const blockedRes = await request(testApp)
        .get('/test-rate-limit')
        .set('x-test-rate-limit', 'true')
        .set('X-Forwarded-For', `10.0.0.99, ${realIp}`);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

      // Request from a different real client IP should succeed
      const diffRealIpRes = await request(testApp)
        .get('/test-rate-limit')
        .set('x-test-rate-limit', 'true')
        .set('X-Forwarded-For', '10.0.0.1, 198.51.100.43');
      expect(diffRealIpRes.status).toBe(200);
    });
  });
});
