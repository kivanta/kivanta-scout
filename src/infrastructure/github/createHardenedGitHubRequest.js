/*
 * Create Hardened GitHub Request
 *
 * Infrastructure boundary for Scout's outbound
 * GitHub HTTP reads.
 *
 *
 * Responsibilities:
 *
 * - HTTPS only
 * - GitHub host allowlist
 * - bounded request timeout
 * - bounded response body
 * - current GitHub REST API headers
 * - fixed GitHub User-Agent
 * - optional server-side GitHub token
 *
 *
 * IMPORTANT:
 *
 * This module contains NO Methodology logic.
 *
 * It also does not know about Cloudflare env.
 *
 * The Worker may later create this client using:
 *
 *   env.GITHUB_TOKEN
 *
 * but the token itself never enters:
 *
 * - frozen investigation state
 * - Methodology results
 * - D1
 * - public output
 */

const ALLOWED_GITHUB_HOSTS = new Set([
  "api.github.com",
  "raw.githubusercontent.com",
]);

const GITHUB_API_HOST = "api.github.com";

const DEFAULT_API_VERSION = "2026-03-10";

const DEFAULT_TIMEOUT_MS = 8_000;

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const DEFAULT_USER_AGENT = "Kivanta-Scout/1.0";

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

function cleanString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function createRequestError(code) {
  const error = new Error(code);

  error.code = code;

  return error;
}

/*
 * ------------------------------------------------
 * Read one bounded response body
 * ------------------------------------------------
 *
 * We read incrementally instead of calling:
 *
 *   response.arrayBuffer()
 *
 * first.
 *
 * That means Scout can stop reading as soon as the
 * configured byte limit is exceeded.
 */

async function readBoundedResponse(response, maxBytes) {
  const contentLengthHeader = response.headers.get("content-length");

  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);

    if (
      Number.isFinite(contentLength) &&
      contentLength >= 0 &&
      contentLength > maxBytes
    ) {
      try {
        await response.body?.cancel();
      } catch {
        /*
         * Cancellation failure is not more important
         * than enforcing the size limit.
         */
      }

      throw createRequestError("github_response_too_large");
    }
  }

  /*
   * Some responses legitimately have no body.
   */

  if (!response.body) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const reader = response.body.getReader();

  const chunks = [];

  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /*
           * Size limit remains authoritative.
           */
        }

        throw createRequestError("github_response_too_large");
      }

      chunks.push(value);
    }
  } finally {
    /*
     * releaseLock() is safe after completion and
     * keeps the reader lifecycle explicit.
     */

    try {
      reader.releaseLock();
    } catch {
      /*
       * Nothing else to do here.
       */
    }
  }

  const body = new Uint8Array(totalBytes);

  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);

    offset += chunk.byteLength;
  }

  /*
   * Return a normal Response so existing Scout
   * functions may continue using:
   *
   *   response.ok
   *   response.status
   *   response.json()
   *   response.text()
   *
   * without knowing about this infrastructure layer.
   */

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/*
 * ------------------------------------------------
 * createHardenedGitHubRequest
 * ------------------------------------------------
 */

export function createHardenedGitHubRequest({
  token = null,

  fetchImpl = globalThis.fetch,

  apiVersion = DEFAULT_API_VERSION,

  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,

  defaultMaxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw createRequestError("github_fetch_implementation_required");
  }

  const normalizedToken = cleanString(token);

  const normalizedApiVersion = cleanString(apiVersion) || DEFAULT_API_VERSION;

  const normalizedDefaultTimeoutMs = normalizePositiveInteger(
    defaultTimeoutMs,
    DEFAULT_TIMEOUT_MS,
  );

  const normalizedDefaultMaxBytes = normalizePositiveInteger(
    defaultMaxBytes,
    DEFAULT_MAX_BYTES,
  );

  /*
   * ------------------------------------------------
   * requestGitHub
   * ------------------------------------------------
   */

  return async function requestGitHub(
    input,
    {
      timeoutMs = normalizedDefaultTimeoutMs,

      maxBytes = normalizedDefaultMaxBytes,

      headers = {},
    } = {},
  ) {
    /*
     * =================================================
     * Validate destination
     * =================================================
     */

    let url;

    try {
      url = new URL(input);
    } catch {
      throw createRequestError("github_url_invalid");
    }

    if (url.protocol !== "https:") {
      throw createRequestError("github_https_required");
    }

    if (!ALLOWED_GITHUB_HOSTS.has(url.hostname)) {
      throw createRequestError("github_host_not_allowed");
    }

    const effectiveTimeoutMs = normalizePositiveInteger(
      timeoutMs,
      normalizedDefaultTimeoutMs,
    );

    const effectiveMaxBytes = normalizePositiveInteger(
      maxBytes,
      normalizedDefaultMaxBytes,
    );

    /*
     * =================================================
     * Build request headers
     * =================================================
     */

    const requestHeaders = new Headers(headers);

    /*
     * Authentication is owned entirely by this
     * infrastructure boundary.
     *
     * Delete any caller-provided Authorization first
     * so it cannot accidentally be forwarded to a
     * different GitHub host.
     */

    requestHeaders.delete("Authorization");

    if (url.hostname === GITHUB_API_HOST) {
      if (!requestHeaders.has("Accept")) {
        requestHeaders.set("Accept", "application/vnd.github+json");
      }

      /*
       * GitHub REST requires a valid User-Agent.
       *
       * Set it here rather than relying on Node,
       * Cloudflare, or another runtime to provide one.
       *
       * Set it unconditionally so callers cannot
       * replace Scout's application identity.
       */

      requestHeaders.set("User-Agent", DEFAULT_USER_AGENT);

      requestHeaders.set("X-GitHub-Api-Version", normalizedApiVersion);

      if (normalizedToken) {
        requestHeaders.set("Authorization", `Bearer ${normalizedToken}`);
      }
    }

    /*
     * =================================================
     * Timeout controller
     * =================================================
     */

    const controller = new AbortController();

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;

      controller.abort();
    }, effectiveTimeoutMs);

    /*
     * =================================================
     * Perform request
     * =================================================
     */

    let response;

    try {
      response = await fetchImpl(url.toString(), {
        method: "GET",

        headers: requestHeaders,

        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw createRequestError("github_request_timeout");
      }

      /*
       * Preserve a stable operational error code
       * rather than exposing arbitrary fetch/runtime
       * exception text.
       */

      throw createRequestError("github_request_failed");
    } finally {
      clearTimeout(timeout);
    }

    /*
     * =================================================
     * Enforce response-size bound
     * =================================================
     */

    return readBoundedResponse(response, effectiveMaxBytes);
  };
}
