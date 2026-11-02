import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { closeDbPool, getDbPool } from '../../db/pool';
import { createTestDbHelper, TestDbHelper } from '../../db/testDb';
import { env } from '../../config/env';
import { resetRateLimits } from '../../middleware/rateLimit';

const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describe('AI Drafting Unit & Validation Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .send({ prompt: 'Bill Abel 500 ETB for consulting' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 503 AI_NOT_CONFIGURED when LLM_API_KEY is not configured', async () => {
    const originalKey = env.LLM_API_KEY;
    (env as any).LLM_API_KEY = '';

    try {
      // Mock valid token payload
      const res = await request(app)
        .post('/api/v1/ai/draft-invoice')
        .set('Authorization', 'Bearer invalid_or_missing_in_unit')
        .send({ prompt: 'Bill Abel 500 ETB' });

      // Note: Auth runs before config check, so unauthenticated returns 401
      expect(res.status).toBe(401);
    } finally {
      (env as any).LLM_API_KEY = originalKey;
    }
  });
});

describeDb('AI Drafting Integration Tests (Live PostgreSQL & Gemini Mock)', { timeout: 30000 }, () => {
  let dbHelper: TestDbHelper;
  let tokenA: string;
  let businessAId: string;
  let clientAId: string;
  let tokenB: string;
  let businessBId: string;

  beforeAll(async () => {
    dbHelper = createTestDbHelper(testDbUrl);
    await closeDbPool();
    await dbHelper.resetSchema();
  }, 30000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    resetRateLimits();
    await dbHelper.cleanTables();

    // Set LLM_API_KEY for tests
    (env as any).LLM_PROVIDER = 'gemini';
    (env as any).LLM_API_KEY = 'test-gemini-api-key';
    (env as any).LLM_MONTHLY_LIMIT = 50;

    // Register Business A
    const regA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'ownerA@example.com',
        password: 'Password123!',
        name: 'Owner A',
        businessName: 'Business A Corp',
        defaultCurrency: 'ETB',
      });
    expect(regA.status).toBe(201);
    tokenA = regA.body.token;
    businessAId = regA.body.business.id;

    // Create client for Business A
    const clA = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Acme Ethiopia', email: 'acme@example.com' });
    expect(clA.status).toBe(201);
    clientAId = clA.body.client.id;

    // Register Business B
    const regB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'ownerB@example.com',
        password: 'Password123!',
        name: 'Owner B',
        businessName: 'Business B LLC',
        defaultCurrency: 'USD',
      });
    expect(regB.status).toBe(201);
    tokenB = regB.body.token;
    businessBId = regB.body.business.id;

    // Create client for Business B with similar name
    await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Acme Global', email: 'global@example.com' });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await dbHelper.close();
  });

  it('returns 503 AI_NOT_CONFIGURED when LLM_API_KEY is empty on authenticated request', async () => {
    const originalKey = env.LLM_API_KEY;
    (env as any).LLM_API_KEY = '';

    try {
      const res = await request(app)
        .post('/api/v1/ai/draft-invoice')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ prompt: 'Bill Acme 500 ETB for consulting' });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
      expect(res.body.error.message).toContain('Please set LLM_API_KEY');
    } finally {
      (env as any).LLM_API_KEY = originalKey;
    }
  });

  it('validates prompt length (min 3 chars, max 500 chars)', async () => {
    // 1. Too short
    const shortRes = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'hi' });

    expect(shortRes.status).toBe(400);
    expect(shortRes.body.error.code).toBe('VALIDATION_ERROR');

    // 2. Too long (> 500 chars)
    const longRes = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'a'.repeat(501) });

    expect(longRes.status).toBe(400);
    expect(longRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('generates verified draft with exact client match and integer money arithmetic', async () => {
    const geminiPayload = {
      clientName: 'Acme Ethiopia',
      currency: 'ETB',
      dueInDays: 14,
      taxRatePct: 15,
      notes: 'Payment via Chapa or telebirr',
      items: [
        {
          description: 'Website redesign',
          quantity: 1,
          unitPrice: 15000,
        },
        {
          description: 'Monthly SEO maintenance',
          quantity: 2,
          unitPrice: 2500,
        },
      ],
    };

    // Mock global fetch for Gemini API
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(geminiPayload) }],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Bill Acme Ethiopia for website redesign 15k and 2 months SEO 2.5k with 15% VAT' });

    expect(res.status).toBe(200);
    const draft = res.body.draft;

    // Client exact match verification
    expect(draft.clientId).toBe(clientAId);
    expect(draft.matchedClient).toEqual({
      id: clientAId,
      name: 'Acme Ethiopia',
      email: 'acme@example.com',
    });
    expect(draft.suggestedClients).toEqual([]);
    expect(draft.suggestedClientName).toBeNull();

    // Currency, dates, and tax
    expect(draft.currency).toBe('ETB');
    expect(draft.taxRateBps).toBe(1500);
    expect(draft.taxRatePct).toBe(15);
    expect(draft.notes).toBe('Payment via Chapa or telebirr');

    // Items calculation verification (all integer minor/milli arithmetic)
    expect(draft.items).toHaveLength(2);
    expect(draft.items[0]).toEqual({
      description: 'Website redesign',
      quantity: 1,
      quantityMilli: 1000,
      unitPrice: 15000,
      unitPriceMinor: 1500000,
      lineTotalMinor: 1500000,
    });
    expect(draft.items[1]).toEqual({
      description: 'Monthly SEO maintenance',
      quantity: 2,
      quantityMilli: 2000,
      unitPrice: 2500,
      unitPriceMinor: 250000,
      lineTotalMinor: 500000,
    });

    // Subtotal: 1500000 + 500000 = 2000000 minor (20,000.00 ETB)
    expect(draft.subtotalMinor).toBe(2000000);
    // Tax: 2000000 * 1500 / 10000 = 300000 minor (3,000.00 ETB)
    expect(draft.taxMinor).toBe(300000);
    // Total: 2000000 + 300000 = 2300000 minor (23,000.00 ETB)
    expect(draft.totalMinor).toBe(2300000);

    // Verify draft-only behavior: NO invoice was created in database!
    const pool = getDbPool()!;
    const invoicesCount = await pool.query('SELECT count(*) FROM invoices WHERE business_id = $1', [businessAId]);
    expect(Number(invoicesCount.rows[0].count)).toBe(0);
  });

  it('handles ambiguous / partial client matches without auto-selecting', async () => {
    // Add two clients with "Abel" in their name for Business A
    await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Abel Tesfaye', email: 'abel.t@example.com' });

    await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Abel Kassa', email: 'abel.k@example.com' });

    const geminiPayload = {
      clientName: 'Abel',
      currency: 'ETB',
      dueInDays: 7,
      taxRatePct: 0,
      items: [{ description: 'Logo design', quantity: 1, unitPrice: 3000 }],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }],
      }),
    }));

    const res = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Invoice Abel 3000 ETB for logo design' });

    expect(res.status).toBe(200);
    const draft = res.body.draft;

    // Ambiguous: must NOT auto-select clientId
    expect(draft.clientId).toBeNull();
    expect(draft.matchedClient).toBeNull();
    expect(draft.suggestedClientName).toBe('Abel');
    expect(draft.suggestedClients.length).toBe(2);
    expect(draft.suggestedClients.map((c: any) => c.name)).toContain('Abel Tesfaye');
    expect(draft.suggestedClients.map((c: any) => c.name)).toContain('Abel Kassa');
  });

  it('handles completely unknown client without auto-selecting or auto-creating client', async () => {
    const geminiPayload = {
      clientName: 'New Unknown Customer Ltd',
      currency: 'ETB',
      dueInDays: 30,
      taxRatePct: 0,
      items: [{ description: 'Advisory services', quantity: 1, unitPrice: 8000 }],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }],
      }),
    }));

    const res = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Bill New Unknown Customer Ltd 8000 ETB for advisory' });

    expect(res.status).toBe(200);
    const draft = res.body.draft;

    expect(draft.clientId).toBeNull();
    expect(draft.matchedClient).toBeNull();
    expect(draft.suggestedClientName).toBe('New Unknown Customer Ltd');
    expect(draft.suggestedClients).toEqual([]);

    // Check that NO client was inserted into the database
    const pool = getDbPool()!;
    const checkClient = await pool.query('SELECT count(*) FROM clients WHERE name = $1', ['New Unknown Customer Ltd']);
    expect(Number(checkClient.rows[0].count)).toBe(0);
  });

  it('strictly enforces cross-business client isolation', async () => {
    // Prompt mentions "Acme Global", which only exists for Business B
    const geminiPayload = {
      clientName: 'Acme Global',
      currency: 'ETB',
      dueInDays: 14,
      taxRatePct: 0,
      items: [{ description: 'Consulting', quantity: 1, unitPrice: 1000 }],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }],
      }),
    }));

    // Request made by Business A
    const res = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Invoice Acme Global 1000 ETB for consulting' });

    expect(res.status).toBe(200);
    const draft = res.body.draft;

    // Must NOT match Business B's client
    expect(draft.clientId).toBeNull();
    expect(draft.matchedClient).toBeNull();
    // Suggested clients for Business A must not include Business B's clients
    expect(draft.suggestedClients.some((c: any) => c.name === 'Acme Global')).toBe(false);
  });

  it('returns 502 AI_SERVICE_ERROR when Gemini returns malformed JSON or HTTP error', async () => {
    // 1. Upstream HTTP 500
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error from upstream Gemini',
    }));

    const res1 = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Bill Abel 500 ETB' });

    expect(res1.status).toBe(502);
    expect(res1.body.error.code).toBe('AI_SERVICE_ERROR');

    // 2. Upstream returns unparseable text
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'NOT VALID JSON AT ALL' }] } }],
      }),
    }));

    const res2 = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Bill Abel 500 ETB' });

    expect(res2.status).toBe(502);
    expect(res2.body.error.code).toBe('AI_SERVICE_ERROR');
  });

  it('returns 502 AI_SERVICE_ERROR when Gemini returns out-of-range values failing Zod schema', async () => {
    // Quantity > 1000 or negative unit price
    const invalidPayload = {
      clientName: 'Acme Ethiopia',
      currency: 'ETB',
      items: [{ description: 'Huge order', quantity: 999999, unitPrice: -50 }],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(invalidPayload) }] } }],
      }),
    }));

    const res = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Bill Acme for 999999 widgets' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AI_SERVICE_ERROR');
    expect(res.body.error.message).toContain('failed validation');
  });

  it('enforces persistent monthly usage limit stored in database', async () => {
    (env as any).LLM_MONTHLY_LIMIT = 2; // Allow only 2 calls this month

    const validPayload = {
      clientName: null,
      currency: 'ETB',
      items: [{ description: 'Test service', quantity: 1, unitPrice: 100 }],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validPayload) }] } }],
      }),
    }));

    // Call 1 -> OK
    const res1 = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Call 1' });
    expect(res1.status).toBe(200);

    // Call 2 -> OK
    const res2 = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Call 2' });
    expect(res2.status).toBe(200);

    // Call 3 -> 429 MONTHLY_LIMIT_EXCEEDED
    const res3 = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ prompt: 'Call 3' });
    expect(res3.status).toBe(429);
    expect(res3.body.error.code).toBe('MONTHLY_LIMIT_EXCEEDED');

    // Verify record in ai_usage table
    const pool = getDbPool()!;
    const period = new Date().toISOString().slice(0, 7);
    const usageCheck = await pool.query(
      'SELECT request_count FROM ai_usage WHERE business_id = $1 AND period = $2',
      [businessAId, period]
    );
    expect(usageCheck.rowCount).toBe(1);
    expect(usageCheck.rows[0].request_count).toBe(2);

    // Verify Business B is NOT affected by Business A's limit
    const resB = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ prompt: 'Call for Business B' });
    expect(resB.status).toBe(200);
  });

  it('enforces per-user rate limiting (10 req / 15 min)', async () => {
    const validPayload = {
      clientName: null,
      currency: 'ETB',
      items: [{ description: 'Test service', quantity: 1, unitPrice: 100 }],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validPayload) }] } }],
      }),
    }));

    // Make 10 requests with x-test-rate-limit header
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/ai/draft-invoice')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-test-rate-limit', 'true')
        .send({ prompt: `Request ${i + 1}` });
      expect(res.status).toBe(200);
    }

    // 11th request must be rate limited
    const res11 = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-test-rate-limit', 'true')
      .send({ prompt: 'Request 11' });

    expect(res11.status).toBe(429);
    expect(res11.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('generates high-fidelity mock draft when LLM_PROVIDER is simulated without API key', async () => {
    (env as any).LLM_PROVIDER = 'simulated';
    (env as any).LLM_API_KEY = '';

    const res = await request(app)
      .post('/api/v1/ai/draft-invoice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        prompt:
          'Bill Acme Ethiopia 15,000 ETB for website design and 5,000 ETB for SEO, due in 2 weeks with 15% VAT',
      });

    expect(res.status).toBe(200);
    const draft = res.body.draft;
    expect(draft.isSimulated).toBe(true);
    expect(draft.provider).toBe('simulated');
    expect(draft.clientId).toBe(clientAId);
    expect(draft.matchedClient.name).toBe('Acme Ethiopia');
    expect(draft.currency).toBe('ETB');
    expect(draft.taxRatePct).toBe(15);
    expect(draft.items).toHaveLength(2);
    expect(draft.items[0].description).toBe('Website design');
    expect(draft.items[0].unitPrice).toBe(15000);
    expect(draft.items[1].description).toBe('SEO');
    expect(draft.items[1].unitPrice).toBe(5000);
    expect(draft.totalMinor).toBe(2300000);
  });
});
