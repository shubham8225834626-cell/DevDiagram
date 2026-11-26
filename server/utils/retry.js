/**
 * Retry helper with exponential backoff and optional jitter.
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = 2,
    baseDelayMs = 200,
    maxDelayMs = 2500,
    jitter = true,
    signal = null,
    shouldRetry = (err) => {
      const status = err?.status;
      if (status === 400 || status === 401 || status === 403 || status === 404) return false;
      return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || !status;
    },
  } = options;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      const abortErr = new Error('Operation aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !shouldRetry(err)) {
        throw err;
      }
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delay = jitter ? Math.round(exp * (0.5 + Math.random() * 0.5)) : exp;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            const abortErr = new Error('Operation aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  }

  throw lastErr;
}
