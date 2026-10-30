import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { createTestDbHelper, TestDbHelper } from '../../db/testDb';
import { formatClient } from './clients.routes';

const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describe('Clients Unit & Validation Tests (Always runs)', () => {
  it('rejects unauthenticated requests to all clients endpoints', async () => {
    const fakeId = '11111111-1111-4111-8111-111111111111';

    const resList = await request(app).get('/api/v1/clients');
    expect(resList.status).toBe(401);
    expect(resList.body.error.code).toBe('UNAUTHORIZED');

    const resCreate = await request(app).post('/api/v1/clients').send({ name: 'Acme' });
    expect(resCreate.status).toBe(401);
    expect(resCreate.body.error.code).toBe('UNAUTHORIZED');

    const resGet = await request(app).get(`/api/v1/clients/${fakeId}`);
    expect(resGet.status).toBe(401);
    expect(resGet.body.error.code).toBe('UNAUTHORIZED');

    const resPatch = await request(app).patch(`/api/v1/clients/${fakeId}`).send({ name: 'Acme 2' });
    expect(resPatch.status).toBe(401);
    expect(resPatch.body.error.code).toBe('UNAUTHORIZED');

    const resArchive = await request(app).post(`/api/v1/clients/${fakeId}/archive`);
    expect(resArchive.status).toBe(401);
    expect(resArchive.body.error.code).toBe('UNAUTHORIZED');

    const resUnarchive = await request(app).post(`/api/v1/clients/${fakeId}/unarchive`);
    expect(resUnarchive.status).toBe(401);
    expect(resUnarchive.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects DELETE /api/v1/clients/:id as non-existent (no DELETE endpoint)', async () => {
    const fakeId = '11111111-1111-4111-8111-111111111111';
    const res = await request(app).delete(`/api/v1/clients/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it('correctly formats client entity rows with camelCase and snake_case compatibility', () => {
    const rawRow = {
      id: '11111111-1111-4111-8111-111111111111',
      business_id: '22222222-2222-4222-8222-222222222222',
      name: 'Client X',
      email: 'x@example.com',
      phone: '+123456789',
      address: 'Addis Ababa',
      archived_at: new Date('2026-01-01T00:00:00.000Z'),
      created_at: new Date('2025-01-01T00:00:00.000Z'),
    };
    const formatted = formatClient(rawRow);
    expect(formatted.id).toBe(rawRow.id);
    expect(formatted.businessId).toBe(rawRow.business_id);
    expect(formatted.business_id).toBe(rawRow.business_id);
    expect(formatted.name).toBe('Client X');
    expect(formatted.archivedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(formatted.archived_at).toBe('2026-01-01T00:00:00.000Z');
    expect(formatted.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });
});

describeDb('Clients Integration Tests (Live PostgreSQL)', () => {
  let dbHelper: TestDbHelper;
  let tokenA: string;
  let businessAId: string;
  let tokenB: string;
  let businessBId: string;

  beforeAll(async () => {
    dbHelper = createTestDbHelper(testDbUrl);
  });

  beforeEach(async () => {
    await dbHelper.resetSchema();

    // Register Business A
    const regResA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'businessA@example.com',
        password: 'Password123!',
        name: 'Owner A',
        businessName: 'Business A',
        defaultCurrency: 'ETB',
      });
    tokenA = regResA.body.token;
    businessAId = regResA.body.business.id;

    // Register Business B
    const regResB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'businessB@example.com',
        password: 'Password123!',
        name: 'Owner B',
        businessName: 'Business B',
        defaultCurrency: 'USD',
      });
    tokenB = regResB.body.token;
    businessBId = regResB.body.business.id;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.close();
    }
  });

  it('validates client input on create and update', async () => {
    // Missing name
    const res1 = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'client@example.com' });
    expect(res1.status).toBe(422);
    expect(res1.body.error.code).toBe('VALIDATION_ERROR');
    expect(res1.body.error.details).toHaveProperty('name');

    // Empty name
    const res2 = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: '   ' });
    expect(res2.status).toBe(422);
    expect(res2.body.error.code).toBe('VALIDATION_ERROR');

    // Invalid email
    const res3 = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Client 1', email: 'invalid-email-format' });
    expect(res3.status).toBe(422);
    expect(res3.body.error.code).toBe('VALIDATION_ERROR');

    // Address exceeding 300 characters
    const res4 = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Client 1', address: 'a'.repeat(301) });
    expect(res4.status).toBe(422);
    expect(res4.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates pagination query parameters (limit <= 100, page >= 1)', async () => {
    // limit exceeds 100
    const res1 = await request(app)
      .get('/api/v1/clients?limit=101')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res1.status).toBe(422);
    expect(res1.body.error.code).toBe('VALIDATION_ERROR');

    // page < 1
    const res2 = await request(app)
      .get('/api/v1/clients?page=0')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res2.status).toBe(422);
    expect(res2.body.error.code).toBe('VALIDATION_ERROR');

    // invalid archived filter value
    const res3 = await request(app)
      .get('/api/v1/clients?archived=maybe')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res3.status).toBe(422);
    expect(res3.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('performs full client CRUD (create, list, get, update)', async () => {
    // 1. Create client
    const createRes = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Ethiopian Airlines',
        email: 'info@ethiopianairlines.com',
        phone: '+251-11-665-2222',
        address: 'Bole International Airport, Addis Ababa',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.client).toMatchObject({
      id: expect.any(String),
      businessId: businessAId,
      name: 'Ethiopian Airlines',
      email: 'info@ethiopianairlines.com',
      phone: '+251-11-665-2222',
      address: 'Bole International Airport, Addis Ababa',
      archivedAt: null,
      createdAt: expect.any(String),
    });

    const clientId = createRes.body.client.id;

    // 2. Get client by id
    const getRes = await request(app)
      .get(`/api/v1/clients/${clientId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.client.id).toBe(clientId);
    expect(getRes.body.client.name).toBe('Ethiopian Airlines');

    // 3. Update client
    const updateRes = await request(app)
      .patch(`/api/v1/clients/${clientId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Ethiopian Airlines Group',
        phone: '+251-11-000-0000',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.client.name).toBe('Ethiopian Airlines Group');
    expect(updateRes.body.client.phone).toBe('+251-11-000-0000');
    expect(updateRes.body.client.email).toBe('info@ethiopianairlines.com'); // untouched

    // 4. List clients
    const listRes = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.clients).toHaveLength(1);
    expect(listRes.body.clients[0].id).toBe(clientId);
    expect(listRes.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('searches clients by name and email (case-insensitive)', async () => {
    // Create 3 clients
    await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Alpha Logistics', email: 'contact@alpha.et' });

    await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Beta Trading', email: 'sales@beta.com' });

    await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Gamma Corp', email: 'alpha.person@gamma.com' });

    // Search by name
    const searchByName = await request(app)
      .get('/api/v1/clients?search=beta')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(searchByName.status).toBe(200);
    expect(searchByName.body.clients).toHaveLength(1);
    expect(searchByName.body.clients[0].name).toBe('Beta Trading');

    // Search by email substring matching two clients (contact@alpha.et and alpha.person@gamma.com)
    const searchByEmail = await request(app)
      .get('/api/v1/clients?q=alpha')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(searchByEmail.status).toBe(200);
    expect(searchByEmail.body.clients).toHaveLength(2);
  });

  it('paginates client listings with default limit 20 and custom pages', async () => {
    // Insert 25 clients
    for (let i = 1; i <= 25; i++) {
      await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: `Client #${String(i).padStart(2, '0')}` });
    }

    // Default pagination: page 1, limit 20
    const defaultPage = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body.clients).toHaveLength(20);
    expect(defaultPage.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 25,
      totalPages: 2,
    });

    // Page 2: remaining 5
    const secondPage = await request(app)
      .get('/api/v1/clients?page=2&limit=20')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.clients).toHaveLength(5);
    expect(secondPage.body.pagination.page).toBe(2);

    // Custom limit
    const customLimit = await request(app)
      .get('/api/v1/clients?limit=10')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(customLimit.status).toBe(200);
    expect(customLimit.body.clients).toHaveLength(10);
    expect(customLimit.body.pagination.totalPages).toBe(3);
  });

  it('hides archived clients from default list, supports explicit filtering, and unarchives', async () => {
    const createRes = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Active to Archive Client' });
    const clientId = createRes.body.client.id;

    // Archive client
    const archiveRes = await request(app)
      .post(`/api/v1/clients/${clientId}/archive`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archiveRes.status).toBe(204);

    // Default list excludes archived clients
    const defaultList = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(defaultList.body.clients.find((c: any) => c.id === clientId)).toBeUndefined();
    expect(defaultList.body.pagination.total).toBe(0);

    // Filter archived=true shows archived client
    const archivedOnly = await request(app)
      .get('/api/v1/clients?archived=true')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archivedOnly.body.clients).toHaveLength(1);
    expect(archivedOnly.body.clients[0].id).toBe(clientId);
    expect(archivedOnly.body.clients[0].archivedAt).not.toBeNull();

    // Filter archived=all shows archived client
    const allClients = await request(app)
      .get('/api/v1/clients?archived=all')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(allClients.body.clients).toHaveLength(1);

    // Unarchive client
    const unarchiveRes = await request(app)
      .post(`/api/v1/clients/${clientId}/unarchive`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(unarchiveRes.status).toBe(200);
    expect(unarchiveRes.body.client.id).toBe(clientId);
    expect(unarchiveRes.body.client.archivedAt).toBeNull();

    // Now present in default list again
    const restoredList = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(restoredList.body.clients).toHaveLength(1);
    expect(restoredList.body.clients[0].id).toBe(clientId);
  });

  it('cross-business tenant isolation: Business A attempts to read, update, archive, and unarchive Business B client; every operation returns 404', async () => {
    // Create client under Business B
    const bClientRes = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        name: 'Business B Exclusive Client',
        email: 'exclusive@business-b.com',
      });
    const bClientId = bClientRes.body.client.id;

    // 1. Business A attempts GET Business B's client -> 404
    const getRes = await request(app)
      .get(`/api/v1/clients/${bClientId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe('CLIENT_NOT_FOUND');

    // 2. Business A attempts PATCH Business B's client -> 404
    const patchRes = await request(app)
      .patch(`/api/v1/clients/${bClientId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Name' });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe('CLIENT_NOT_FOUND');

    // 3. Business A attempts archive Business B's client -> 404
    const archiveRes = await request(app)
      .post(`/api/v1/clients/${bClientId}/archive`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(archiveRes.status).toBe(404);
    expect(archiveRes.body.error.code).toBe('CLIENT_NOT_FOUND');

    // 4. Business A attempts unarchive Business B's client -> 404
    const unarchiveRes = await request(app)
      .post(`/api/v1/clients/${bClientId}/unarchive`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(unarchiveRes.status).toBe(404);
    expect(unarchiveRes.body.error.code).toBe('CLIENT_NOT_FOUND');

    // Verify Business B's client remains intact and untouched
    const verifyRes = await request(app)
      .get(`/api/v1/clients/${bClientId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.client.name).toBe('Business B Exclusive Client');
    expect(verifyRes.body.client.archivedAt).toBeNull();
  });

  it('prevents request-supplied business_id or other protected fields from bypassing tenant isolation', async () => {
    // 1. Attempt to inject business_id on client creation
    const createRes = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Injected Client',
        business_id: businessBId, // Maliciously attempt to assign client to Business B
        archived_at: new Date().toISOString(), // Attempt to bypass soft-delete rules
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.client.businessId).toBe(businessAId); // Strictly assigned to Business A
    expect(createRes.body.client.archivedAt).toBeNull(); // archived_at cannot be set on creation

    const clientId = createRes.body.client.id;

    // 2. Attempt to update business_id or archived_at via PATCH
    const patchRes = await request(app)
      .patch(`/api/v1/clients/${clientId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Updated Name',
        business_id: businessBId,
        businessId: businessBId,
        id: '99999999-9999-4999-8999-999999999999',
        archived_at: new Date().toISOString(),
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.client.id).toBe(clientId); // id unchanged
    expect(patchRes.body.client.businessId).toBe(businessAId); // business_id unchanged
    expect(patchRes.body.client.archivedAt).toBeNull(); // archived_at unchanged
  });
});
