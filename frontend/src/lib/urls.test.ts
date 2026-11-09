import { describe, it, expect } from 'vitest';
import { getPublicInvoiceUrl, DEFAULT_PRODUCTION_APP_URL } from './urls';

describe('getPublicInvoiceUrl — Production Safety and Canonical URL Resolution', () => {
  const token = 'tok_test_secure_token_123';

  describe('Production Edge Cases', () => {
    it('generates canonical goom-invoice.vercel.app URL when no custom URL is configured', () => {
      const url = getPublicInvoiceUrl(token, 'http://localhost:5173/i/' + token, {
        isProd: true,
      });
      expect(url).toBe(`${DEFAULT_PRODUCTION_APP_URL}/i/${token}`);
      expect(url).not.toContain('localhost');
      expect(url).not.toContain('127.0.0.1');
    });

    it('rejects localhost configuredUrl in production and falls back to canonical domain', () => {
      const url = getPublicInvoiceUrl(token, 'http://localhost:5173/i/' + token, {
        isProd: true,
        configuredUrl: 'http://localhost:5173',
      });
      expect(url).toBe(`${DEFAULT_PRODUCTION_APP_URL}/i/${token}`);
      expect(url).not.toContain('localhost');
    });

    it('rejects localhost with HTTPS and custom port in production and falls back', () => {
      const url = getPublicInvoiceUrl(token, null, {
        isProd: true,
        configuredUrl: 'https://localhost:3000',
      });
      expect(url).toBe(`${DEFAULT_PRODUCTION_APP_URL}/i/${token}`);
      expect(url).not.toContain('localhost');
    });

    it('rejects 127.0.0.1 configuredUrl in production and falls back to canonical domain', () => {
      const url = getPublicInvoiceUrl(token, 'http://127.0.0.1:5173/i/' + token, {
        isProd: true,
        configuredUrl: 'http://127.0.0.1:5173',
      });
      expect(url).toBe(`${DEFAULT_PRODUCTION_APP_URL}/i/${token}`);
      expect(url).not.toContain('127.0.0.1');
      expect(url).not.toContain('localhost');
    });

    it('accepts a valid custom production domain', () => {
      const customDomain = 'https://billing.example.com';
      const url = getPublicInvoiceUrl(token, 'http://localhost:5173/i/' + token, {
        isProd: true,
        configuredUrl: customDomain,
      });
      expect(url).toBe(`${customDomain}/i/${token}`);
      expect(url).not.toContain('localhost');
      expect(url).not.toContain('127.0.0.1');
    });

    it('strips single or multiple trailing slashes from production URLs', () => {
      const urlSingleSlash = getPublicInvoiceUrl(token, null, {
        isProd: true,
        configuredUrl: 'https://goom-invoice.vercel.app/',
      });
      expect(urlSingleSlash).toBe('https://goom-invoice.vercel.app/i/' + token);

      const urlMultiSlash = getPublicInvoiceUrl(token, null, {
        isProd: true,
        configuredUrl: 'https://billing.example.com///',
      });
      expect(urlMultiSlash).toBe('https://billing.example.com/i/' + token);
      expect(urlMultiSlash).not.toContain('///');
    });

    it('strictly guarantees no production-generated public invoice URL can contain localhost', () => {
      const testCases = [
        undefined,
        '',
        'http://localhost:5173',
        'https://localhost:5173',
        'http://localhost:3000/',
        'http://127.0.0.1:8080',
        'https://127.0.0.1:5173/',
      ];

      for (const configuredUrl of testCases) {
        const url = getPublicInvoiceUrl(token, 'http://localhost:5173/i/' + token, {
          isProd: true,
          configuredUrl,
        });
        expect(url).not.toContain('localhost');
        expect(url).not.toContain('127.0.0.1');
        expect(url).toBe(`${DEFAULT_PRODUCTION_APP_URL}/i/${token}`);
      }
    });

    it('guarantees public token is never altered or truncated in production', () => {
      const complexToken = 'cZ5uFG1FhBJMVLlVd0lh5Lvit7Ma_4TapmMWWo5Z1nk';
      const prodUrl = getPublicInvoiceUrl(complexToken, null, { isProd: true });
      expect(prodUrl).toBe(`${DEFAULT_PRODUCTION_APP_URL}/i/${complexToken}`);
      expect(prodUrl.endsWith(`/i/${complexToken}`)).toBe(true);
    });
  });

  describe('Local Development Mode', () => {
    it('preserves localhost URL in local development mode', () => {
      const localBackendUrl = `http://localhost:5173/i/${token}`;
      const url = getPublicInvoiceUrl(token, localBackendUrl, {
        isProd: false,
      });
      expect(url).toBe(localBackendUrl);
      expect(url).toContain('localhost');
    });

    it('falls back to default localhost:5173 in local development if backend url is missing', () => {
      const url = getPublicInvoiceUrl(token, null, {
        isProd: false,
      });
      expect(url).toBe(`http://localhost:5173/i/${token}`);
      expect(url).toContain('localhost');
    });
  });
});
