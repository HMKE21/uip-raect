/** The cloud account needs the student to sign in / approve again (token expired, permission revoked, popup blocked…). */
export class CloudAuthError extends Error {
  constructor(message = 'Sign in again to continue.', code = 'auth') { super(message); this.name = 'CloudAuthError'; this.code = code; }
}
/** The student's cloud storage is full. */
export class CloudQuotaError extends Error {
  constructor(message = 'Your cloud storage is full.') { super(message); this.name = 'CloudQuotaError'; }
}
/** A temporary problem (network, rate limit, 5xx): worth retrying. */
export class CloudRetryError extends Error {
  constructor(message = 'Temporary problem, will retry.', status = 0) { super(message); this.name = 'CloudRetryError'; this.status = status; }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs fn(), retrying temporary failures (network, 429, 5xx) with growing delays. */
export async function withRetry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!(e instanceof CloudRetryError) || i === tries - 1) throw e;
      // eslint-disable-next-line no-await-in-loop
      await sleep(Math.min(8000, 600 * 2 ** i) + Math.random() * 300);
    }
  }
  throw last;
}

/** fetch() that maps failures to the error classes above. */
export async function cloudFetch(url, init) {
  let res;
  try { res = await fetch(url, init); } catch { throw new CloudRetryError('Network problem.', 0); }
  if (res.ok) return res;
  if (res.status === 401) throw new CloudAuthError('Your cloud session expired.', 'expired');
  if (res.status === 403) {
    const t = await res.clone().text().catch(() => '');
    if (/quota|storageQuotaExceeded|insufficient/i.test(t)) throw new CloudQuotaError();
    if (/rateLimit|userRateLimit|dailyLimit/i.test(t)) throw new CloudRetryError('Rate limited.', 403);
    throw new CloudAuthError('Permission was not granted.', 'denied');
  }
  if (res.status === 507) throw new CloudQuotaError();
  if (res.status === 429 || res.status >= 500) throw new CloudRetryError(`Cloud error ${res.status}.`, res.status);
  throw Object.assign(new Error(`Cloud error ${res.status}.`), { status: res.status });
}
