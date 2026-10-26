import { app } from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`Backend server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server terminated');
  });
});
