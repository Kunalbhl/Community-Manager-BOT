/**
 * The website can be mid-reconnect to the bot for a second or two (a bot update, a network blip).
 * Instead of showing "Something went wrong" or "offline" for that blink, retry the request quietly.
 *
 *  - GET/HEAD: retried on a network error and on 502/503/504.
 *  - Anything else: retried only when the server says nothing was processed (retrySafe: true).
 */
const nativeFetch = window.fetch.bind(window);
const MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isApi(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const u = new URL(raw, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith('/api/');
  } catch { return false; }
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!isApi(input)) return nativeFetch(input, init);
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD';
  const body = init?.body;
  // A body that can only be read once cannot be sent twice.
  const replayable = idempotent || body == null || typeof body === 'string';
  if (!replayable || input instanceof Request) return nativeFetch(input, init);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await nativeFetch(input, init);
      const transient = res.status === 502 || res.status === 503 || res.status === 504;
      if (!transient || attempt >= MAX_RETRIES) return res;
      let safe = idempotent;
      if (!safe) safe = Boolean((await res.clone().json().catch(() => null))?.retrySafe);
      if (!safe) return res;
      const ra = Number(res.headers.get('Retry-After'));
      await sleep(Math.min(4000, (ra > 0 ? ra * 1000 : 800) + attempt * 400));
    } catch (err) {
      if (!idempotent || attempt >= MAX_RETRIES) throw err;
      await sleep(Math.min(4000, 600 + attempt * 500));
    }
  }
};
