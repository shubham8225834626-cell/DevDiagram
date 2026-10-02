import dns from 'dns';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import diagramRouter from './routes/diagram.js';
import chatRouter from './routes/chat.js';

// Fix Atlas SRV resolution on Windows — Node's resolver prefers IPv6 by default
// which causes querySrv ECONNREFUSED even when the OS DNS works fine.
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// Global rate limit: 60 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api', limiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/diagram', diagramRouter);
app.use('/api/chat', chatRouter);

// 404 catch-all
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Database + boot ───────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/repomap';

// Atlas SRV URIs need retryWrites; append if not already present
const mongoUri = MONGO_URI.includes('retryWrites')
  ? MONGO_URI
  : MONGO_URI + (MONGO_URI.includes('?') ? '&' : '?') + 'retryWrites=true&w=majority';

const mongooseOpts = mongoUri.startsWith('mongodb+srv')
  ? {
      serverApi: { version: '1', strict: true, deprecationErrors: true },
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    }
  : {};

mongoose
  .connect(mongoUri, mongooseOpts)
  .then(() => {
    console.log('[DB] Connected to MongoDB Atlas ✓');
    app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  });
