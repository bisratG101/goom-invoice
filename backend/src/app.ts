import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { checkDbHealth } from './db/pool';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
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

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
