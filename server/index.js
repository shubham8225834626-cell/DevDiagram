import dns from 'dns';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createApp } from './app.js';

// Fix Atlas SRV resolution on Windows — Node's resolver prefers IPv6 by default
// which causes querySrv ECONNREFUSED even when the OS DNS works fine.
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const app = createApp();
const PORT = process.env.PORT || 3001;

// ── Database + boot ───────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/repomap';

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
