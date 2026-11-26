import { Router } from 'express';
import User from '../models/User.js';
import UserHistory from '../models/UserHistory.js';
import Diagram from '../models/Diagram.js';
import { getSessionUser } from './auth.js';

const router = Router();

async function ensureUserDoc(sessionUser) {
  const fallbackUsername =
    sessionUser.username ||
    (sessionUser.email ? sessionUser.email.split('@')[0] : '') ||
    sessionUser.name ||
    '';

  return User.findOneAndUpdate(
    { authId: sessionUser.id },
    {
      $set: {
        name: sessionUser.name || 'User',
        username: fallbackUsername,
        email: sessionUser.email || '',
        ...(sessionUser.avatar ? { avatar: sessionUser.avatar } : {}),
      },
      $setOnInsert: {
        authId: sessionUser.id,
        provider: sessionUser.provider || 'github',
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

// ── GET /api/history ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userDoc = await User.findOne({ authId: sessionUser.id }).select('_id').lean();
    if (!userDoc) {
      return res.json({ history: [] });
    }

    const items = await UserHistory.find({ user: userDoc._id })
      .sort({ visitedAt: -1 })
      .limit(15)
      .populate('user', 'name username email avatar provider')
      .populate('diagram', 'branch truncated')
      .lean();

    res.json({ history: items });
  } catch (err) {
    console.error('[History GET]', err.message);
    res.status(500).json({ error: 'Failed to load history.' });
  }
});

// ── POST /api/history ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { owner, repo } = req.body;
    if (!owner || !repo) {
      return res.status(400).json({ error: 'owner and repo are required.' });
    }

    const repoKey = `${owner}/${repo}`;
    const [userDoc, diagramDoc] = await Promise.all([
      ensureUserDoc(sessionUser),
      Diagram.findOne({ repoKey }).select('_id').lean(),
    ]);

    await UserHistory.findOneAndUpdate(
      { user: userDoc._id, repoKey },
      {
        user: userDoc._id,
        username: userDoc.username || sessionUser.username || userDoc.name || '',
        email: userDoc.email || sessionUser.email || '',
        diagram: diagramDoc?._id || null,
        repoKey,
        owner,
        repo,
        visitedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[History POST]', err.message);
    res.status(500).json({ error: 'Failed to save history.' });
  }
});

// ── DELETE /api/history ───────────────────────────────────────────────────────
router.delete('/', async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userDoc = await User.findOne({ authId: sessionUser.id }).select('_id').lean();
    if (userDoc) {
      await UserHistory.deleteMany({ user: userDoc._id });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[History DELETE]', err.message);
    res.status(500).json({ error: 'Failed to clear history.' });
  }
});

export default router;
