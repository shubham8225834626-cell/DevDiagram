import rateLimit from 'express-rate-limit';
import { getSessionUser } from '../routes/auth.js';

/**
 * Tiered rate limiters:
 * - Global API limiter
 * - Diagram generation limiter: lower for anonymous users (3 -> 429 on 4th),
 *   higher for authenticated users.
 */
export function createRateLimiters() {
  const globalLimiter = rateLimit({
    windowMs: Number(process.env.GLOBAL_RATE_WINDOW_MS || 60 * 1000),
    max: Number(process.env.GLOBAL_RATE_MAX || 200),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  });

  const diagramLimiter = rateLimit({
    windowMs: Number(process.env.DIAGRAM_RATE_WINDOW_MS || 15 * 60 * 1000),
    max: (req) => {
      const user = getSessionUser(req);
      if (user) {
        return Number(process.env.AUTH_DIAGRAM_RATE_LIMIT || 100);
      }
      return Number(process.env.ANON_DIAGRAM_RATE_LIMIT || 3);
    },
    keyGenerator: (req) => {
      const user = getSessionUser(req);
      if (user) return `user:${user.id}`;
      return `anon:${req.headers['cf-connecting-ip'] || req.ip}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Diagram generation limit reached. Sign in to raise your limit or try again later.',
    },
  });

  return { globalLimiter, diagramLimiter };
}
