import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the DB so the test is hermetic (no Postgres needed) — we still exercise
// the real HTTP layer: routing, global prefix, ValidationPipe, and the SCIM
// controller's bearer-token authentication against the (mocked) ApiKey store.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    apiKey: { findFirst: vi.fn() },
    user: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    group: { findMany: vi.fn(), count: vi.fn() },
    userGroup: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock('@chista/db', () => ({ prisma: prismaMock }));
vi.mock('@chista/crypto', () => ({ hashToken: (t: string) => `hashed:${t}`, randomToken: () => 'rand' }));

import { ScimController } from './scim.controller';
import { ScimService } from './scim.service';

// vitest's esbuild transform does not emit `emitDecoratorMetadata`, so Nest's
// reflective DI can't see the controller's constructor types. Supply the
// constructor param metadata explicitly so the real DI container wires it.
Reflect.defineMetadata('design:paramtypes', [ScimService], ScimController);

describe('SCIM HTTP integration', () => {
  let app: INestApplication;
  const ORG = 'org1';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ScimController],
      providers: [ScimService],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the production global prefix (apps/api/src/main.ts). SCIM
    // controllers use plain @Body, not the global ValidationPipe.
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const http = () => request(app.getHttpServer());

  it('serves ServiceProviderConfig without auth', async () => {
    const res = await http().get('/api/v1/scim/v2/ServiceProviderConfig').expect(200);
    expect(res.body.schemas[0]).toContain('ServiceProviderConfig');
    expect(res.body.patch.supported).toBe(true);
  });

  it('lists resource types', async () => {
    const res = await http().get('/api/v1/scim/v2/ResourceTypes').expect(200);
    expect(res.body.totalResults).toBe(2);
  });

  it('rejects Users listing without a bearer token (401)', async () => {
    await http().get(`/api/v1/scim/v2/${ORG}/Users`).expect(401);
  });

  it('rejects an invalid bearer token (401)', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(null);
    await http()
      .get(`/api/v1/scim/v2/${ORG}/Users`)
      .set('Authorization', 'Bearer nope')
      .expect(401);
  });

  it('lists Users with a valid SCIM token (200 + SCIM envelope)', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue({ id: 'k1', expiresAt: null });
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x.io', username: 'a', displayName: null, externalId: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() },
    ]);
    prismaMock.user.count.mockResolvedValue(1);

    const res = await http()
      .get(`/api/v1/scim/v2/${ORG}/Users`)
      .set('Authorization', 'Bearer good')
      .expect(200);

    expect(res.body.schemas[0]).toContain('ListResponse');
    expect(res.body.Resources[0].userName).toBe('a');
    expect(prismaMock.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ hashedKey: 'hashed:good' }) }),
    );
  });

  it('creates a User via POST and returns 201', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue({ id: 'k1', expiresAt: null });
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'u2', email: 'b@x.io', username: 'b', displayName: null, externalId: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(),
    });

    const res = await http()
      .post(`/api/v1/scim/v2/${ORG}/Users`)
      .set('Authorization', 'Bearer good')
      .send({ userName: 'b', emails: [{ value: 'b@x.io', primary: true }] })
      .expect(201);

    expect(res.body.id).toBe('u2');
    expect(res.body.active).toBe(true);
  });
});
