import { rateLimit, securityHeaders, sensitivePaths } from '@rexezuge/http';
import type { RateLimitHandler } from '@rexezuge/http';

/**
 * Response headers, and the one request ceiling in this worker.
 *
 * ## Why `/user/*` is keyed on the account and not the address
 *
 * Cloudflare Access has already authenticated this caller, so the threat here is
 * not anonymity — it is a client that loops. The account is the right key
 * because an address is shared: a corporate NAT puts a whole office in one
 * bucket, and the ceiling below would then throttle the office rather than the
 * loop. The kit's limiter prefers an identity over `CF-Connecting-IP` for
 * exactly that reason, and this repo publishes it as
 * `AuthenticatedUserEmailAddress`.
 *
 * **The limiter must therefore be registered after `userAuthentication`.** Hono
 * runs middleware in registration order, so a limiter installed first sees no
 * identity, silently degrades to a per-IP bucket, and every operator behind one
 * NAT ends up sharing a budget. That is the failure the identity key exists to
 * avoid, and it is invisible in a test that authenticates one identity.
 *
 * 300/minute is roughly five requests a second sustained. The SPA's heaviest
 * screen issues a handful of calls on load and then nothing until a click, so
 * this leaves an interactive client three orders of magnitude of headroom while
 * still bounding a runaway loop.
 *
 * ## Why `/api/*` is deliberately unlimited
 *
 * `/api/:api_key/email` and `/api/:api_key/sns` are the delivery endpoints —
 * the entire reason a customer runs this. They are authenticated by a secret in
 * the path, so a limiter here buys no security the key lookup does not already
 * provide, and costs the one thing that must not be rationed: a sender's
 * throughput during its own peak. Mail-Meow's callers are mail systems, whose
 * volume is spiky and largely outside the operator's control. A 429 on this
 * path is a bounced email that the sender will retry into a second bounce.
 *
 * If delivery ever needs a ceiling, the honest place is a per-key limit in
 * `ApiKeyService`, where the key is known and the operator set the number.
 */
const USER_API_LIMIT: RateLimitHandler = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyPrefix: 'user-api',
});

/**
 * Baseline response headers.
 *
 * `isSensitive` is required rather than defaulted by the kit, because both wrong
 * answers are silent: a predicate that returns `true` for everything attaches
 * `no-store` to the SPA shell and the docs page, and one that returns `false`
 * for everything leaves authenticated JSON cacheable by a shared proxy.
 *
 * `/user/` covers the SPA shell and every authenticated API response. The
 * delivery endpoints are not sensitive — their responses are status codes, and
 * marking them `no-store` would only defeat a CDN in front of nothing.
 */
const securityHeadersMiddleware = securityHeaders(sensitivePaths('/user/'));

export { securityHeadersMiddleware, USER_API_LIMIT };
