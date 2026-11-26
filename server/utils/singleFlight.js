/**
 * Single-flight deduplicator: concurrent callers for the same key share
 * one in-flight promise, then the entry is cleaned up once settled.
 */
export function createSingleFlight() {
  const inFlight = new Map();

  async function run(key, fn) {
    if (inFlight.has(key)) {
      return inFlight.get(key);
    }

    const promise = (async () => fn())();
    inFlight.set(key, promise);

    try {
      return await promise;
    } finally {
      if (inFlight.get(key) === promise) {
        inFlight.delete(key);
      }
    }
  }

  function size() {
    return inFlight.size;
  }

  function clear() {
    inFlight.clear();
  }

  return { run, size, clear };
}
