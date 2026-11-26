import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import diagramRouter from './routes/diagram.js';
import chatRouter from './routes/chat.js';
import authRouter from './routes/auth.js';
import historyRouter from './routes/history.js';
import { createRateLimiters } from './middleware/rateLimit.js';

export function getAllowedOrigins() {
  const configured = [
    process.env.CLIENT_URL,
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]
    .map((o) => (o || '').trim())
    .filter(Boolean);

  return Array.from(new Set(configured));
}

export function createApp(options = {}) {
  const app = express();

  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Security headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
          frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Strict CORS origin allowlist (never origin: '*')
  const allowedOrigins = getAllowedOrigins();
  app.use(
    cors({
      origin(origin, callback) {
        // Allow requests with no Origin header (curl, server-to-server, same-origin)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        const err = new Error(`Origin "${origin}" is not allowed by CORS`);
        err.status = 403;
        return callback(err);
      },
      credentials: true,
    })
  );

  // Strict 10 KB JSON body limit
  app.use(express.json({ limit: '10kb' }));

  // Tiered rate limiting (disabled only if explicitly opted out in a specific benchmark)
  if (!options.disableRateLimit) {
    const { globalLimiter, diagramLimiter } = createRateLimiters();
    app.use('/api', globalLimiter);
    app.use('/api/diagram', diagramLimiter);
  }

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/diagram', diagramRouter);
  app.use('/api/chat', chatRouter);

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // 404 catch-all
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Global error handler (including body size & JSON parse errors)
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload exceeds 10 KB limit.' });
    }
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Malformed JSON body.' });
    }
    console.error('[Server Error]', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}
