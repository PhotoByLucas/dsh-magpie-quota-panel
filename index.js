/**
 * Host half of the Magpie quota bundle.
 *
 * Owns one authenticated HTTP route, `/__local/magpie-quota`, that reads the
 * live account quota from the local magpie gateway (`GET /v1/magpie/quotas`)
 * and returns it to the browser. The browser cannot call the gateway directly
 * because it runs on a different origin and the gateway sends no CORS headers;
 * fetching it here, server-side, keeps the client a same-origin request.
 *
 * The trust fence is the same one `dsh-host-open-in-app` and
 * `@local/enhance-prompt` use: the composition's `connection` service rejects
 * cross-site, DNS-rebound, and unauthenticated callers before the outbound
 * request is made. Nothing is appended to a Session log and no Agent runs.
 */

export const name = 'magpie-quota'

/** The web server and the shared request trust fence. */
export const inject = ['webServer', 'connection']

/** Absolute pathname registered with the web server. */
export const QUOTA_PATH = '/__local/magpie-quota'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3425'
const DEFAULTS = {
  /** magpie gateway root; `/v1/magpie/quotas` is appended. */
  baseUrl: DEFAULT_BASE_URL,
  /** Upper bound on the outbound read, in milliseconds. */
  timeoutMs: 8000,
}

/** JSON response; live facts, never cached. */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Validate and detach the optional row configuration.
 * @param raw - untrusted config from the bundle row, when present.
 * @returns the resolved `{ baseUrl, timeoutMs }`.
 * @throws when a value is out of range.
 */
function resolveConfig(raw) {
  const config = { ...DEFAULTS }
  if (raw === undefined || raw === null) return config
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('magpie-quota: config must be an object')
  }
  if (raw.baseUrl !== undefined) {
    if (typeof raw.baseUrl !== 'string' || !/^https?:\/\//i.test(raw.baseUrl)) {
      throw new Error('magpie-quota: baseUrl must be an http(s) URL')
    }
    config.baseUrl = raw.baseUrl
  }
  if (raw.timeoutMs !== undefined) {
    if (!Number.isInteger(raw.timeoutMs) || raw.timeoutMs < 500 || raw.timeoutMs > 60000) {
      throw new Error('magpie-quota: timeoutMs must be an integer between 500 and 60000')
    }
    config.timeoutMs = raw.timeoutMs
  }
  return config
}

/**
 * Mount the quota route.
 * @param ctx - Host runtime owning the web server and the trust fence.
 * @param rawConfig - optional per-row overrides from the bundle patch.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const connection = ctx.get('connection')
  const base = config.baseUrl.replace(/\/+$/, '')
  const quotasUrl = `${base}/v1/magpie/quotas`

  /** Answer an untrusted or unauthenticated request; true when it was rejected. */
  const rejected = (req, res) => {
    const rejection = connection && typeof connection.requestRejection === 'function'
      ? connection.requestRejection(req)
      : undefined
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: QUOTA_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('allow', 'GET')
        res.end()
        return
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs)
      try {
        const upstream = await fetch(quotasUrl, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
        const text = await upstream.text()
        if (!upstream.ok) {
          // Do not echo the upstream body to the browser; it can carry account
          // details. A stable code plus the HTTP status is enough for the UI.
          sendJson(res, 502, { code: 'gateway-error', status: upstream.status })
          return
        }
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          sendJson(res, 502, { code: 'bad-json' })
          return
        }
        // Pass the gateway's payload through unchanged and stamp the read time
        // so the popover can show how fresh the figures are.
        sendJson(res, 200, { ...parsed, fetchedAt: new Date().toISOString() })
      } catch (error) {
        const aborted = controller.signal.aborted
        // Log the internal cause server-side; return only a stable code/message
        // so the gateway URL and stack never reach the browser.
        console.warn('[magpie-quota] quota read failed:', error instanceof Error ? error.message : String(error))
        sendJson(res, aborted ? 504 : 502, { code: aborted ? 'timeout' : 'unreachable' })
      } finally {
        clearTimeout(timer)
      }
    },
  }), `magpie-quota: GET ${QUOTA_PATH}`)
}
