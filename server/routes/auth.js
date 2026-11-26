import crypto from 'crypto';
import { Router } from 'express';

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

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const cookies = parseCookies(req);
  const session = verifyToken(cookies[COOKIE_NAME]);
  if (!session) return res.json({ user: null });
  const { id, name, email, avatar, provider } = session;
  return res.json({ user: { id, name, email, avatar, provider } });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// ── POST /api/auth/demo ───────────────────────────────────────────────────────
router.post('/demo', (req, res) => {
  const provider = req.body?.provider === 'google' ? 'google' : 'github';
  const user = {
    id: `demo-${provider}`,
    name: provider === 'google' ? 'Google Demo User' : 'GitHub Demo User',
    email: 'demo@devdiagram.local',
    avatar: '',
    provider,
  };
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
    if (!tokenData.access_token) throw new Error('Token exchange failed');

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userRes.json();

    setSessionCookie(res, {
      id: `google:${profile.id}`,
      name: profile.name || profile.email,
      email: profile.email || '',
      avatar: profile.picture || '',
      provider: 'google',
    });

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
    if (!tokenData.access_token) throw new Error('Token exchange failed');

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DevDiagram-App',
      },
    });
    const profile = await userRes.json();

    setSessionCookie(res, {
      id: `github:${profile.id}`,
      name: profile.name || profile.login,
      email: profile.email || '',
      avatar: profile.avatar_url || '',
      provider: 'github',
    });

    return res.redirect(sanitizeReturnTo(savedState.returnTo));
  } catch (err) {
    console.error('[Auth GitHub]', err.message);
    return res.redirect('/?auth_error=github_failed');
  }
});

export default router;
