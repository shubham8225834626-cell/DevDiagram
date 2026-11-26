import crypto from 'crypto';
import { Router } from 'express';
import User from '../models/User.js';

const router = Router();

const COOKIE_NAME = 'devdiagram_session';
const STATE_COOKIE = 'devdiagram_oauth_state';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Derive a stable signing secret (prefer AUTH_SECRET in .env)
function getSecret() {
  return process.env.AUTH_SECRET || process.env.LLM_API_KEY || 'devdiagram-local-secret';
}

function signPayload(payloadObj) {
  const data = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    cookies[k] = decodeURIComponent(v);
  }
  return cookies;
}

function setSessionCookie(res, user) {
  const token = signPayload({ ...user, exp: Date.now() + SESSION_MAX_AGE_MS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

function getBaseUrl(req) {
  return process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
}

function sanitizeReturnTo(raw) {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/';
}

// ── GET /api/auth/providers ───────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  });
});

// ── Helper for other routes ───────────────────────────────────────────────────
export function getSessionUser(req) {
  const cookies = parseCookies(req);
  const session = verifyToken(cookies[COOKIE_NAME]);
  if (!session) return null;
  const { id, name, username, email, avatar, provider } = session;
  return { id, name, username: username || '', email: email || '', avatar, provider };
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.json({ user: null });

  try {
    const fallbackUsername =
      sessionUser.username ||
      (sessionUser.email ? sessionUser.email.split('@')[0] : '') ||
      sessionUser.name ||
      '';

    const userDoc = await User.findOneAndUpdate(
      { authId: sessionUser.id },
      {
        $setOnInsert: {
          authId: sessionUser.id,
          provider: sessionUser.provider || 'github',
          name: sessionUser.name || 'User',
          username: fallbackUsername,
          email: sessionUser.email || '',
          avatar: sessionUser.avatar || '',
          lastLoginAt: new Date(),
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.json({
      user: {
        id: sessionUser.id,
        name: userDoc.name,
        username: userDoc.username,
        email: userDoc.email,
        avatar: userDoc.avatar,
        provider: userDoc.provider,
      },
    });
  } catch (err) {
    console.warn('[Auth /me] DB sync warning:', err.message);
    return res.json({ user: sessionUser });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

async function upsertUserRecord(user) {
  try {
    await User.findOneAndUpdate(
      { authId: user.id },
      {
        $set: {
          provider: user.provider,
          name: user.name,
          username: user.username || '',
          email: user.email || '',
          avatar: user.avatar || '',
          lastLoginAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Auth] Failed to persist user:', err.message);
  }
}

// ── POST /api/auth/demo ───────────────────────────────────────────────────────
router.post('/demo', async (req, res) => {
  const provider = req.body?.provider === 'google' ? 'google' : 'github';
  const user = {
    id: `demo-${provider}`,
    name: provider === 'google' ? 'Google Demo User' : 'GitHub Demo User',
    username: `demo_${provider}`,
    email: 'demo@devdiagram.local',
    avatar: '',
    provider,
  };
  await upsertUserRecord(user);
  setSessionCookie(res, user);
  res.json({ user });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({ error: 'Google OAuth is not configured on the server.' });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const state = signPayload({ nonce: crypto.randomBytes(16).toString('hex'), returnTo, exp: Date.now() + 600000 });
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 600000, path: '/' });

  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookies = parseCookies(req);
  const savedState = verifyToken(cookies[STATE_COOKIE]);
  res.clearCookie(STATE_COOKIE, { path: '/' });

  if (!code || !state || !savedState || state !== cookies[STATE_COOKIE]) {
    return res.redirect('/?auth_error=invalid_state');
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userRes.json();

    const user = {
      id: `google:${profile.id}`,
      name: profile.name || profile.email,
      username: profile.email ? profile.email.split('@')[0] : '',
      email: profile.email || '',
      avatar: profile.picture || '',
      provider: 'google',
    };
    await upsertUserRecord(user);
    setSessionCookie(res, user);

    return res.redirect(sanitizeReturnTo(savedState.returnTo));
  } catch (err) {
    console.error('[Auth Google]', err.message);
    return res.redirect('/?auth_error=google_failed');
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────
router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    return res.status(501).json({ error: 'GitHub OAuth is not configured on the server.' });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const state = signPayload({ nonce: crypto.randomBytes(16).toString('hex'), returnTo, exp: Date.now() + 600000 });
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 600000, path: '/' });

  const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookies = parseCookies(req);
  const savedState = verifyToken(cookies[STATE_COOKIE]);
  res.clearCookie(STATE_COOKIE, { path: '/' });

  if (!code || !state || !savedState || state !== cookies[STATE_COOKIE]) {
    return res.redirect('/?auth_error=invalid_state');
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DevDiagram-App',
      },
    });
    const profile = await userRes.json();

    // GitHub /user may omit private email; fetch /user/emails as fallback
    let email = profile.email || '';
    if (!email) {
      try {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'DevDiagram-App',
          },
        });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
          email = primary?.email || '';
        }
      } catch {
        // email remains ''
      }
    }

    const user = {
      id: `github:${profile.id}`,
      name: profile.name || profile.login,
      username: profile.login || '',
      email,
      avatar: profile.avatar_url || '',
      provider: 'github',
    };
    await upsertUserRecord(user);
    setSessionCookie(res, user);

    return res.redirect(sanitizeReturnTo(savedState.returnTo));
  } catch (err) {
    console.error('[Auth GitHub]', err.message);
    return res.redirect('/?auth_error=github_failed');
  }
});

export default router;
