import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { checkDbHealth } from './db/pool';
import { authRouter } from './modules/auth/auth.routes';
import { businessRouter } from './modules/business/business.routes';
import { clientsRouter } from './modules/clients/clients.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { webhookHandler, publicInvoicesRouter, demoRouter } from './modules/payments/public.routes';

export function createApp() {
  const app = express();

  // Reverse proxy trust configuration:
  // Render deployment topology routes inbound traffic through a single-hop edge proxy.
  // In production, or when TRUST_PROXY is explicitly configured, trust the verified hop count.
  const trustProxySetting = env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? '1' : undefined);
  if (trustProxySetting !== undefined && trustProxySetting !== '') {
    const numericHop = Number(trustProxySetting);
    app.set('trust proxy', isNaN(numericHop) ? trustProxySetting : numericHop);
  }

  // Security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );

  // Raw body parser for webhooks (must be BEFORE express.json())
  app.post(
    ['/webhooks/:provider', '/api/v1/webhooks/:provider'],
    express.raw({ type: 'application/json', limit: '100kb' }),
    webhookHandler
  );

  // Body parser with 100kb limit
  app.use(express.json({ limit: '100kb' }));

  // Health check handler
  const healthHandler = async (_req: express.Request, res: express.Response) => {
    const db = await checkDbHealth();
    if (db.configured && !db.connected) {
      res.status(503).json({
        status: 'error',
        database: 'disconnected',
      });
      return;
    }

    res.status(200).json({
      status: 'ok',
      database: db.configured ? 'connected' : 'not_configured',
    });
  };

  // Config handler (public, no secrets)
  const configHandler = (_req: express.Request, res: express.Response) => {
    res.status(200).json({
      demoMode: env.DEMO_MODE,
    });
  };

  // Routes available at root and under /api/v1
  app.get('/health', healthHandler);
  app.get('/config', configHandler);

  app.get('/api/v1/health', healthHandler);
  app.get('/api/v1/config', configHandler);

  // Auth, Business, Clients, and Invoices routers
  app.use('/auth', authRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/business', businessRouter);
  app.use('/api/v1/business', businessRouter);
  app.use('/clients', clientsRouter);
  app.use('/api/v1/clients', clientsRouter);
  app.use('/invoices', invoicesRouter);
  app.use('/api/v1/invoices', invoicesRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/api/v1/dashboard', dashboardRouter);

  // Public invoice endpoints and Demo endpoints
  app.use('/public/invoices', publicInvoicesRouter);
  app.use('/api/v1/public/invoices', publicInvoicesRouter);
  app.use('/demo', demoRouter);
  app.use('/api/v1/demo', demoRouter);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
