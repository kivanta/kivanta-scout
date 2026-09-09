/*
 * Kivanta Scout
 * POST /api/investigations
 *
 * Public HTTP boundary for creating one Scout
 * investigation.
 *
 *
 * Responsibilities:
 *
 * - accept a small JSON request
 * - validate the visitor reference
 * - compose Cloudflare/D1 runtime dependencies
 * - compose hardened outbound request boundaries
 * - call the application investigation service
 * - return a bounded public response
 *
 *
 * This route does NOT:
 *
 * - run Methodology 1.0 directly
 * - send Queue messages directly
 * - contain SQL
 * - expose secrets
 * - expose raw application errors
 */

import { env } from "cloudflare:workers";

import { createD1InvestigationRepository } from "../../infrastructure/cloudflare/d1/d1InvestigationRepository.js";

import { createHardenedGitHubRequest } from "../../infrastructure/github/createHardenedGitHubRequest.js";

import { createHardenedPublicReferenceRequest } from "../../infrastructure/public-reference/createHardenedPublicReferenceRequest.js";

import { createDiscoveryRunner } from "../../application/discovery/createDiscoveryRunner.js";

import { createScoutInvestigation } from "../../application/investigations/createScoutInvestigation.js";

/*
 * This endpoint must always execute in the
 * Cloudflare Worker runtime.
 */
export const prerender = false;

/*
 * Keep anonymous request bodies intentionally
 * small.
 *
 * The visitor only needs to send:
 *
 * {
 *   "reference": "..."
 * }
 */
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

const MAX_REFERENCE_LENGTH = 2048;

/*
 * ------------------------------------------------
 * JSON response helper
 * ------------------------------------------------
 */

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,

    headers: {
      "content-type": "application/json; charset=utf-8",

      /*
       * Investigation creation responses
       * must never be cached.
       */
      "cache-control": "no-store",
    },
  });
}

/*
 * ------------------------------------------------
 * Bounded request reader
 * ------------------------------------------------
 */

async function readBoundedRequestBody(request) {
  /*
   * Fast rejection when Content-Length already
   * proves the body is too large.
   */
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredLength = Number.parseInt(contentLength, 10);

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_REQUEST_BODY_BYTES
    ) {
      return {
        status: "request_body_too_large",

        text: null,
      };
    }
  }

  /*
   * Some requests may not contain a streaming
   * body object.
   */
  if (!request.body) {
    return {
      status: "body_read",

      text: "",
    };
  }

  const reader = request.body.getReader();

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

      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /*
           * Cancellation failure does not change
           * the request-size result.
           */
        }

        return {
          status: "request_body_too_large",

          text: null,
        };
      }

      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /*
       * Nothing else required.
       */
    }
  }

  const bytes = new Uint8Array(totalBytes);

  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);

    offset += chunk.byteLength;
  }

  return {
    status: "body_read",

    text: new TextDecoder().decode(bytes),
  };
}

/*
 * ------------------------------------------------
 * POST
 * ------------------------------------------------
 */

export async function POST({ request }) {
  /*
   * =================================================
   * Request Content-Type
   * =================================================
   */

  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      {
        status: "invalid_request",

        reason: "application_json_required",
      },
      {
        status: 415,
      },
    );
  }

  /*
   * =================================================
   * Bounded JSON body
   * =================================================
   */

  let bodyResult;

  try {
    bodyResult = await readBoundedRequestBody(request);
  } catch {
    return jsonResponse(
      {
        status: "invalid_request",

        reason: "request_body_not_readable",
      },
      {
        status: 400,
      },
    );
  }

  if (bodyResult.status === "request_body_too_large") {
    return jsonResponse(
      {
        status: "invalid_request",

        reason: "request_body_too_large",
      },
      {
        status: 413,
      },
    );
  }

  let payload;

  try {
    payload = JSON.parse(bodyResult.text);
  } catch {
    return jsonResponse(
      {
        status: "invalid_request",

        reason: "invalid_json",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * =================================================
   * Public reference validation
   * =================================================
   */

  const reference = payload?.reference;

  if (typeof reference !== "string" || reference.trim() === "") {
    return jsonResponse(
      {
        status: "invalid_request",

        reason: "reference_required",
      },
      {
        status: 400,
      },
    );
  }

  const normalizedReference = reference.trim();

  if (normalizedReference.length > MAX_REFERENCE_LENGTH) {
    return jsonResponse(
      {
        status: "invalid_request",

        reason: "reference_too_long",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * =================================================
   * Runtime bindings
   * =================================================
   */

  if (!env?.DB) {
    console.error({
      status: "scout_http_runtime_not_ready",

      reason: "d1_binding_required",
    });

    return jsonResponse(
      {
        status: "scout_unavailable",

        reason: "service_temporarily_unavailable",
      },
      {
        status: 503,
      },
    );
  }

  /*
   * =================================================
   * Runtime composition
   * =================================================
   */

  let investigationRepository;

  let discoveryRunner;

  try {
    /*
     * Authoritative investigation storage.
     */
    investigationRepository = createD1InvestigationRepository(env.DB);

    /*
     * GitHub-controlled network boundary.
     *
     * GITHUB_TOKEN remains optional.
     */
    const githubRequest = createHardenedGitHubRequest({
      token: env?.GITHUB_TOKEN ?? null,
    });

    /*
     * Generic public-reference boundary.
     */
    const publicRequest = createHardenedPublicReferenceRequest();

    /*
     * Bind both hardened boundaries through
     * Scout's existing discovery pipeline.
     */
    discoveryRunner = createDiscoveryRunner({
      githubRequest,

      publicRequest,
    });
  } catch {
    console.error({
      status: "scout_http_runtime_not_ready",

      reason: "investigation_runtime_composition_failed",
    });

    return jsonResponse(
      {
        status: "scout_unavailable",

        reason: "service_temporarily_unavailable",
      },
      {
        status: 503,
      },
    );
  }

  /*
   * =================================================
   * Create durable investigation
   * =================================================
   */

  let result;

  try {
    result = await createScoutInvestigation(normalizedReference, {
      discoveryRunner,

      investigationRepository,
    });
  } catch {
    /*
     * Never return raw operational exceptions
     * to an anonymous visitor.
     */
    console.error({
      status: "scout_investigation_request_failed",

      reason: "investigation_application_boundary_threw",
    });

    return jsonResponse(
      {
        status: "scout_unavailable",

        reason: "service_temporarily_unavailable",
      },
      {
        status: 503,
      },
    );
  }

  /*
   * =================================================
   * Invalid visitor request
   * =================================================
   */

  if (result.status === "invalid_request") {
    return jsonResponse(
      {
        status: "invalid_request",

        reason: result.reason ?? "invalid_request",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * =================================================
   * Discovery completed without supported source
   * =================================================
   *
   * This is a successful Scout discovery response,
   * not an operational error.
   *
   * No investigation has been persisted.
   */

  if (result.status === "discovery_only") {
    return jsonResponse(
      {
        status: "discovery_only",

        reason: result.reason ?? "supported_source_not_established",

        inputType: result.inputType ?? null,

        methodologyEligible: false,

        investigationId: null,
      },
      {
        status: 200,
      },
    );
  }

  /*
   * =================================================
   * Durable investigation accepted
   * =================================================
   */

  if (result.status === "investigation_accepted") {
    return jsonResponse(
      {
        status: "investigation_accepted",

        investigationId: result.investigationId,

        lifecycleState: result.lifecycleState,

        joinedExisting: result.joinedExisting,

        methodologyEligible: true,

        inputType: result.inputType ?? null,

        canonicalSource: result.canonicalSource
          ? {
              owner: result.canonicalSource.owner,

              repo: result.canonicalSource.repo,

              canonicalUrl: result.canonicalSource.canonicalUrl ?? null,
            }
          : null,
      },
      {
        status: 202,
      },
    );
  }

  /*
   * =================================================
   * Operational failure
   * =================================================
   */

  console.error({
    status: "scout_investigation_request_failed",

    reason: result?.reason ?? "unknown_investigation_failure",
  });

  return jsonResponse(
    {
      status: "scout_unavailable",

      reason: "service_temporarily_unavailable",
    },
    {
      status: 503,
    },
  );
}
