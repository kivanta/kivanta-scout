/*
 * Kivanta Scout
 * Hardened Public Reference Request
 *
 * This is Scout's outbound HTTP boundary for
 * visitor-supplied public references such as:
 *
 * - project websites
 * - Technocore public references
 * - websites discovered through ENS
 *
 * It is deliberately separate from the
 * GitHub-specific hardened request boundary.
 *
 *
 * Security / reliability rules:
 *
 * - HTTP and HTTPS only
 * - no URL credentials
 * - no localhost / internal-style hostnames
 * - no direct IP-literal destinations
 * - GET / HEAD only
 * - sensitive caller headers are stripped
 * - redirects are followed manually
 * - every redirect destination is revalidated
 * - redirect count is bounded
 * - total request time is bounded
 * - final response body size is bounded
 *
 *
 * Cloudflare's global_fetch_strictly_public
 * compatibility flag remains an additional
 * runtime defense.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

const DEFAULT_MAX_REDIRECTS = 3;

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

const BODYLESS_STATUS_CODES = new Set([101, 204, 205, 304]);

/*
 * ------------------------------------------------
 * Stable error helper
 * ------------------------------------------------
 */

function createPublicReferenceError(code, message = code) {
  const error = new Error(message);

  error.code = code;

  return error;
}

/*
 * ------------------------------------------------
 * Configuration helpers
 * ------------------------------------------------
 */

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/*
 * ------------------------------------------------
 * Host validation
 * ------------------------------------------------
 */

/*
 * Scout deliberately rejects direct IP-literal
 * destinations for generic public references.
 *
 * This keeps visitor input constrained to normal
 * public DNS names and avoids direct addressing of
 * private, loopback, link-local, metadata, or other
 * infrastructure addresses.
 */

function isIpLiteral(hostname) {
  const normalized = hostname.trim().toLowerCase();

  /*
   * WHATWG URL parsing normally keeps IPv6
   * hostnames wrapped in square brackets.
   */
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return true;
  }

  /*
   * URL parsing normalizes common IPv4 forms
   * into dotted-decimal form.
   */
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized);
}

function isInternalStyleHostname(hostname) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");

  if (!normalized) {
    return true;
  }

  /*
   * Single-label hostnames are not accepted as
   * public website destinations.
   */
  if (!normalized.includes(".")) {
    return true;
  }

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa")
  ) {
    return true;
  }

  return false;
}

/*
 * ------------------------------------------------
 * URL validation
 * ------------------------------------------------
 */

function validatePublicReferenceUrl(value) {
  let url;

  try {
    url = value instanceof URL ? new URL(value.toString()) : new URL(value);
  } catch {
    throw createPublicReferenceError("public_reference_url_invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw createPublicReferenceError("public_reference_protocol_not_allowed");
  }

  /*
   * Credentials in visitor-controlled URLs can
   * create confusing authority boundaries and
   * must not be forwarded.
   */
  if (url.username || url.password) {
    throw createPublicReferenceError(
      "public_reference_credentials_not_allowed",
    );
  }

  if (!url.hostname) {
    throw createPublicReferenceError("public_reference_hostname_required");
  }

  if (isIpLiteral(url.hostname)) {
    throw createPublicReferenceError("public_reference_ip_literal_not_allowed");
  }

  if (isInternalStyleHostname(url.hostname)) {
    throw createPublicReferenceError("public_reference_hostname_not_allowed");
  }

  return url;
}

/*
 * ------------------------------------------------
 * Header boundary
 * ------------------------------------------------
 */

function createSafeHeaders(inputHeaders) {
  const headers = new Headers(inputHeaders || {});

  /*
   * Never forward caller authentication or
   * infrastructure identity to a discovered
   * public destination.
   */
  headers.delete("authorization");

  headers.delete("proxy-authorization");

  headers.delete("cookie");

  headers.delete("host");

  headers.delete("cf-connecting-ip");

  headers.delete("x-forwarded-for");

  return headers;
}

/*
 * ------------------------------------------------
 * Bounded response reader
 * ------------------------------------------------
 */

async function readBoundedResponseBody(response, maxBodyBytes) {
  const contentLength = response.headers?.get?.("content-length");

  if (contentLength) {
    const declaredLength = Number.parseInt(contentLength, 10);

    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
      throw createPublicReferenceError("public_reference_response_too_large");
    }
  }

  if (!response.body) {
    return new Uint8Array(0);
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

      if (totalBytes > maxBodyBytes) {
        try {
          await reader.cancel();
        } catch {
          /*
           * Cancellation failure does not change
           * the size-boundary result.
           */
        }

        throw createPublicReferenceError("public_reference_response_too_large");
      }

      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /*
       * Nothing else is required here.
       */
    }
  }

  const body = new Uint8Array(totalBytes);

  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);

    offset += chunk.byteLength;
  }

  return body;
}

/*
 * ------------------------------------------------
 * Factory
 * ------------------------------------------------
 */

export function createHardenedPublicReferenceRequest({
  fetcher = globalThis.fetch,

  timeoutMs = DEFAULT_TIMEOUT_MS,

  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,

  maxRedirects = DEFAULT_MAX_REDIRECTS,
} = {}) {
  if (typeof fetcher !== "function") {
    throw new Error(
      "A fetch-compatible public reference requester is required.",
    );
  }

  const normalizedTimeoutMs = normalizePositiveInteger(
    timeoutMs,
    DEFAULT_TIMEOUT_MS,
  );

  const normalizedMaxBodyBytes = normalizePositiveInteger(
    maxBodyBytes,
    DEFAULT_MAX_BODY_BYTES,
  );

  const normalizedMaxRedirects =
    Number.isInteger(maxRedirects) && maxRedirects >= 0
      ? maxRedirects
      : DEFAULT_MAX_REDIRECTS;

  /*
   * ------------------------------------------------
   * Hardened request
   * ------------------------------------------------
   */

  return async function hardenedPublicReferenceRequest(value, init = {}) {
    const method = String(init?.method || "GET").toUpperCase();

    /*
     * Discovery only needs read operations.
     */
    if (method !== "GET" && method !== "HEAD") {
      throw createPublicReferenceError("public_reference_method_not_allowed");
    }

    let currentUrl = validatePublicReferenceUrl(value);

    const headers = createSafeHeaders(init?.headers);

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, normalizedTimeoutMs);

    let redirectsFollowed = 0;

    try {
      while (true) {
        let response;

        try {
          response = await fetcher(currentUrl.toString(), {
            method,

            headers,

            /*
             * Redirects must never be followed
             * automatically because every new
             * destination must pass Scout's
             * validation boundary first.
             */
            redirect: "manual",

            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) {
            throw createPublicReferenceError(
              "public_reference_request_timeout",
            );
          }

          if (
            error?.code &&
            String(error.code).startsWith("public_reference_")
          ) {
            throw error;
          }

          throw createPublicReferenceError("public_reference_request_failed");
        }

        /*
         * ------------------------------------------
         * Redirect handling
         * ------------------------------------------
         */

        if (REDIRECT_STATUS_CODES.has(response.status)) {
          const location = response.headers?.get?.("location");

          /*
           * A redirect response with no Location
           * is returned as-is after normal body
           * bounding.
           */
          if (location) {
            if (redirectsFollowed >= normalizedMaxRedirects) {
              throw createPublicReferenceError(
                "public_reference_redirect_limit_exceeded",
              );
            }

            let nextUrl;

            try {
              nextUrl = new URL(location, currentUrl);
            } catch {
              throw createPublicReferenceError(
                "public_reference_redirect_invalid",
              );
            }

            /*
             * Critical:
             *
             * Re-run the complete destination
             * validation for every redirect.
             */
            currentUrl = validatePublicReferenceUrl(nextUrl);

            redirectsFollowed += 1;

            continue;
          }
        }

        /*
         * ------------------------------------------
         * Final response body boundary
         * ------------------------------------------
         */

        const responseHasBody =
          method !== "HEAD" && !BODYLESS_STATUS_CODES.has(response.status);

        let boundedBody = null;

        if (responseHasBody) {
          boundedBody = await readBoundedResponseBody(
            response,
            normalizedMaxBodyBytes,
          );
        }

        /*
         * Return a normal readable Response so
         * existing discovery callers can continue
         * using:
         *
         * response.ok
         * response.status
         * response.headers
         * response.text()
         */

        return new Response(boundedBody, {
          status: response.status,

          statusText: response.statusText,

          headers: new Headers(response.headers),
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw createPublicReferenceError("public_reference_request_timeout");
      }

      if (error?.code && String(error.code).startsWith("public_reference_")) {
        throw error;
      }

      throw createPublicReferenceError("public_reference_request_failed");
    } finally {
      clearTimeout(timeout);
    }
  };
}
