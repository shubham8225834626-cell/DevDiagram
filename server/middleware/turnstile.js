/**
 * Cloudflare Turnstile verification middleware.
 * Active when TURNSTILE_SECRET_KEY is configured in environment.
 */
export async function verifyTurnstile(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return next();
  }

  const token = req.headers['cf-turnstile-response'] || req.body?.turnstileToken;
  if (!token || typeof token !== 'string') {
    return res.status(403).json({ error: 'Turnstile verification required.' });
  }

  try {
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const form = new URLSearchParams({
      secret,
      response: token,
      ...(ip ? { remoteip: String(ip) } : {}),
    });

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    const outcome = await verifyRes.json();
    if (!outcome.success) {
      return res.status(403).json({ error: 'Turnstile verification failed.' });
    }
    return next();
  } catch (err) {
    console.warn('[Turnstile] Verification error:', err.message);
    return res.status(503).json({ error: 'Unable to verify Turnstile challenge.' });
  }
}
