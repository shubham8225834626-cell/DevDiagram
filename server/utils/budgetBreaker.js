/**
 * Daily Gemini budget breaker: prevents runaway API spend when daily limit is reached.
 * Resets automatically on UTC day rollover.
 */
export function createBudgetBreaker(options = {}) {
  const getLimit = () =>
    Number(options.maxDailyCalls ?? process.env.DAILY_GEMINI_LIMIT ?? 1000);

  let currentDay = new Date().toISOString().slice(0, 10);
  let count = 0;

  function rolloverIfNeeded(now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    if (today !== currentDay) {
      currentDay = today;
      count = 0;
    }
  }

  function consume(units = 1) {
    rolloverIfNeeded();
    const limit = getLimit();
    if (count + units > limit) {
      const err = new Error('Daily AI budget limit exceeded. Please try again tomorrow.');
      err.status = 429;
      err.code = 'BUDGET_EXCEEDED';
      throw err;
    }
    count += units;
    return { count, limit, remaining: Math.max(0, limit - count) };
  }

  function getStatus() {
    rolloverIfNeeded();
    const limit = getLimit();
    return { day: currentDay, count, limit, remaining: Math.max(0, limit - count) };
  }

  function reset() {
    currentDay = new Date().toISOString().slice(0, 10);
    count = 0;
  }

  return { consume, getStatus, reset };
}

export const geminiBudgetBreaker = createBudgetBreaker();
