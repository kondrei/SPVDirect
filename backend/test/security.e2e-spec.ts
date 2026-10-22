import { Logger, Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { RegistrationsController } from '../src/auth/registrations/registrations.controller.js';
import { RegistrationsService } from '../src/auth/registrations/services/registrations.service.js';
import { HealthController } from '../src/health.controller.js';
import { PublicStatsController } from '../src/public-stats/public-stats.controller.js';
import { PublicStatsService } from '../src/public-stats/public-stats.service.js';

const stats = {
  accountants: 3,
  companies: 40,
  invoices: 500,
  efacturaUploads: 120,
  spvMessages: 900,
  anafConnections: 12,
  updatedAt: '2026-10-12T10:00:00.000Z',
};

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [
    HealthController,
    PublicStatsController,
    RegistrationsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: PublicStatsService,
      useValue: { getStats: () => Promise.resolve(stats) },
    },
    {
      provide: RegistrationsService,
      useValue: { findPending: () => Promise.resolve(null) },
    },
  ],
})
class TestModule {}

describe('API security (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, {
      frontendUrl: 'http://localhost:5173',
      production: false,
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends the helmet headers and forbids caching by default', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('allows only the frontend origin with credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('serves the public stats without a session and makes browsers revalidate them', async () => {
    const res = await request(app.getHttpServer())
      .get('/public/stats?id=1%20OR%201=1')
      .expect(200);
    expect(res.body).toEqual(stats);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('rate-limits the public stats endpoint even with spoofed proxy headers', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 30; i++) {
      await request(server)
        .get('/public/stats')
        .set('X-Forwarded-For', `203.0.113.${i}`)
        .expect(200);
    }
    const res = await request(server)
      .get('/public/stats')
      .set('X-Forwarded-For', '203.0.113.200')
      .expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('logs every request by route pattern, with the error, never the token', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const server = app.getHttpServer();
    await request(server).get('/public/stats').expect(200);
    await request(server).get('/auth/registrations/t0k3n/approve').expect(400);
    const closed = () =>
      [...log.mock.calls, ...warn.mock.calls].filter(
        ([entry]) => typeof entry === 'object' && 'route' in entry,
      ).length;
    await vi.waitFor(() => expect(closed()).toBe(2));
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/public/stats', statusCode: 200 }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/auth/registrations/:token/approve',
        statusCode: 400,
        error: expect.any(String),
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('t0k3n');
    vi.restoreAllMocks();
  });

  it('rate-limits guessing of registration approval tokens', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 20; i++) {
      await request(server)
        .get(`/auth/registrations/t${i}/approve`)
        .expect(400);
    }
    await request(server).get('/auth/registrations/t99/approve').expect(429);
  });
});
