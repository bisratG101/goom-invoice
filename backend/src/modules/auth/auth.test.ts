import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import { env } from '../../config/env';
import { createTestDbHelper, TestDbHelper } from '../../db/testDb';
import { signUserToken } from '../../utils/jwt';

// Run against live test DB when TEST_DATABASE_URL is provided
const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describe('Authentication & Business Unit/Mock Tests (always runs)', () => {
  it('rejects register request with invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'invalid-email',
        password: 'password123',
        name: 'John Doe',
        businessName: 'Acme Corp',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('email');
  });

  it('rejects register request with short password (< 8 chars)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'john@example.com',
        password: 'short',
        name: 'John Doe',
        businessName: 'Acme Corp',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('password');
  });

  it('rejects login request with missing fields', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects protected routes when Authorization header is missing', async () => {
    const res1 = await request(app).get('/api/v1/auth/me');
    expect(res1.status).toBe(401);
    expect(res1.body.error.code).toBe('UNAUTHORIZED');

    const res2 = await request(app).get('/api/v1/business');
    expect(res2.status).toBe(401);
    expect(res2.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects protected routes with malformed Authorization header (missing Bearer prefix)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Basic 123456');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects protected routes with tampered JWT signature', async () => {
    const validToken = signUserToken({ userId: 'some-uuid', email: 'user@test.com' });
    const tamperedToken = validToken.slice(0, -6) + 'abcdef';

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('Invalid or expired');
  });

  it('rejects expired JWT token', async () => {
    // Generate token signed with correct key but expired in the past
    const expiredToken = jwt.sign(
      { userId: 'some-uuid', email: 'user@test.com' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describeDb('Authentication & Business Integration Tests (Live PostgreSQL)', () => {
  let dbHelper: TestDbHelper;

  beforeAll(async () => {
    dbHelper = createTestDbHelper(testDbUrl);
  });

  beforeEach(async () => {
    await dbHelper.resetSchema();
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.close();
    }
  });

  it('POST /auth/register creates user, business, and invoice_counters in one transaction', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'TestOwner@example.com', // citext test
        password: 'SecurePassword123!',
        name: 'Abebe Bikila',
        businessName: 'Bikila Logistics',
        defaultCurrency: 'ETB',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: 'TestOwner@example.com',
      name: 'Abebe Bikila',
    });
    expect(res.body.business).toEqual({
      id: expect.any(String),
      name: 'Bikila Logistics',
      defaultCurrency: 'ETB',
      invoicePrefix: 'INV',
      timezone: 'Africa/Addis_Ababa',
    });
    // Ensure password_hash is NEVER returned in response
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('password_hash');

    // Verify database rows directly
    const client = await dbHelper.pool.connect();
    try {
      const uRes = await client.query('SELECT * FROM users WHERE email = $1', ['testowner@example.com']);
      expect(uRes.rowCount).toBe(1);
      expect(uRes.rows[0].password_hash).not.toBe('SecurePassword123!');
      expect(uRes.rows[0].password_hash).toMatch(/^\$2[aby]\$\d+\$/); // valid bcrypt hash

      const bRes = await client.query('SELECT * FROM businesses WHERE owner_id = $1', [uRes.rows[0].id]);
      expect(bRes.rowCount).toBe(1);
      expect(bRes.rows[0].name).toBe('Bikila Logistics');

      const cRes = await client.query('SELECT * FROM invoice_counters WHERE business_id = $1', [bRes.rows[0].id]);
      expect(cRes.rowCount).toBe(1);
      expect(cRes.rows[0].last_number).toBe(0);
    } finally {
      client.release();
    }
  });

  it('POST /auth/register rolls back completely if business creation fails', async () => {
    // Provide business name exceeding 120 chars to trigger database CHECK constraint violation
    const longBusinessName = 'A'.repeat(125);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'rollback@example.com',
        password: 'Password123!',
        name: 'Rollback User',
        businessName: longBusinessName,
      });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('REGISTRATION_FAILED');

    // Confirm that the user insert was rolled back and does not exist in the database
    const client = await dbHelper.pool.connect();
    try {
      const uRes = await client.query('SELECT * FROM users WHERE email = $1', ['rollback@example.com']);
      expect(uRes.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it('POST /auth/register returns 409 for duplicate email (case-insensitive citext)', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        name: 'User 1',
        businessName: 'Biz 1',
      });

    // Attempt registration with same email in different case
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'DUPLICATE@EXAMPLE.COM',
        password: 'Password456!',
        name: 'User 2',
        businessName: 'Biz 2',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('POST /auth/login returns generic 401 on non-existent email or wrong password', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'valid@example.com',
        password: 'CorrectPassword123!',
        name: 'Valid User',
        businessName: 'Valid Biz',
      });

    // Case 1: Non-existent email
    const res1 = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      });
    expect(res1.status).toBe(401);
    expect(res1.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res1.body.error.message).toBe('Invalid email or password');

    // Case 2: Wrong password
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'valid@example.com',
        password: 'WrongPassword!',
      });
    expect(res2.status).toBe(401);
    expect(res2.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res2.body.error.message).toBe('Invalid email or password');

    // Case 3: Correct login succeeds
    const res3 = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'valid@example.com',
        password: 'CorrectPassword123!',
      });
    expect(res3.status).toBe(200);
    expect(res3.body).toHaveProperty('token');
    expect(res3.body.user.email).toBe('valid@example.com');
  });

  it('GET /auth/me returns authenticated user and business info', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'me_test@example.com',
        password: 'Password123!',
        name: 'Me User',
        businessName: 'Me Business',
      });

    const token = regRes.body.token;

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('me_test@example.com');
    expect(meRes.body.business.name).toBe('Me Business');
    expect(meRes.body.user).not.toHaveProperty('password_hash');
  });

  it('GET and PATCH /api/v1/business updates only authorized fields with Zod validation', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'biz@example.com',
        password: 'Password123!',
        name: 'Biz Owner',
        businessName: 'Initial Biz Name',
      });
    const token = regRes.body.token;

    // 1. GET business
    const getRes = await request(app)
      .get('/api/v1/business')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.business.name).toBe('Initial Biz Name');

    // 2. PATCH invalid timezone rejected by Intl validator
    const invalidTzRes = await request(app)
      .patch('/api/v1/business')
      .set('Authorization', `Bearer ${token}`)
      .send({ timezone: 'Invalid/City_Timezone_123' });
    expect(invalidTzRes.status).toBe(422);
    expect(invalidTzRes.body.error.code).toBe('VALIDATION_ERROR');

    // 3. PATCH invalid prefix pattern rejected
    const invalidPrefixRes = await request(app)
      .patch('/api/v1/business')
      .set('Authorization', `Bearer ${token}`)
      .send({ invoice_prefix: 'inv-lowercase!' });
    expect(invalidPrefixRes.status).toBe(422);

    // 4. Valid PATCH
    const validPatchRes = await request(app)
      .patch('/api/v1/business')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Updated Biz Name',
        default_currency: 'USD',
        invoice_prefix: 'BILL',
        timezone: 'America/New_York',
      });
    expect(validPatchRes.status).toBe(200);
    expect(validPatchRes.body.business.name).toBe('Updated Biz Name');
    expect(validPatchRes.body.business.defaultCurrency).toBe('USD');
    expect(validPatchRes.body.business.invoicePrefix).toBe('BILL');
    expect(validPatchRes.body.business.timezone).toBe('America/New_York');
  });

  it('Tenant Isolation: client cannot tamper with or spoof business_id via body or query', async () => {
    // Register Business A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'ownerA@example.com',
        password: 'Password123!',
        name: 'Owner A',
        businessName: 'Business A',
      });
    const tokenA = resA.body.token;
    const bizAId = resA.body.business.id;

    // Register Business B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'ownerB@example.com',
        password: 'Password123!',
        name: 'Owner B',
        businessName: 'Business B',
      });
    const tokenB = resB.body.token;
    const bizBId = resB.body.business.id;

    // Owner B attempts to update Business A by injecting business_id or id into body/query
    const attackRes = await request(app)
      .patch(`/api/v1/business?business_id=${bizAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        id: bizAId,
        business_id: bizAId,
        owner_id: 'arbitrary-uuid',
        name: 'Malicious Hijack Name',
      });

    expect(attackRes.status).toBe(200);
    // Verified: Only Owner B's own business was updated, Business A was completely untouched
    expect(attackRes.body.business.id).toBe(bizBId);
    expect(attackRes.body.business.name).toBe('Malicious Hijack Name');

    // Check Business A in database to confirm no tampering occurred
    const client = await dbHelper.pool.connect();
    try {
      const checkA = await client.query('SELECT name FROM businesses WHERE id = $1', [bizAId]);
      expect(checkA.rows[0].name).toBe('Business A');
    } finally {
      client.release();
    }
  });
});
