/*
 * Kivanta Scout
 * GET /api/investigations/:investigationId/result
 *
 * Public result boundary for one completed
 * Scout investigation.
 *
 *
 * Responsibilities:
 *
 * - read the opaque investigation ID
 * - compose authoritative D1 repositories
 * - call the public-safe application service
 * - return only the approved public projection
 *
 *
 * This route must NEVER expose:
 *
 * - execution IDs
 * - lease tokens
 * - frozen internal targets
 * - review keys
 * - raw D1 errors
 * - raw malformed analysis JSON
 * - operational failure reasons
 * - source-code contents
 *
 *
 * Operational failure is also NOT converted into
 * an UNKNOWN Methodology finding.
 */

import { env } from "cloudflare:workers";

import { createD1InvestigationRepository } from "../../../../infrastructure/cloudflare/d1/d1InvestigationRepository.js";

import { createD1InvestigationExecutionRepository } from "../../../../infrastructure/cloudflare/d1/d1InvestigationExecutionRepository.js";

import { getScoutInvestigationResult } from "../../../../application/investigations/getScoutInvestigationResult.js";

export const prerender = false;

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

      "cache-control": "no-store",
    },
  });
}

/*
 * ------------------------------------------------
 * GET
 * ------------------------------------------------
 */

export async function GET({ params }) {
  const investigationId = params?.investigationId;

  /*
   * ------------------------------------------------
   * Runtime binding
   * ------------------------------------------------
   */

  if (!env?.DB) {
    console.error({
      status: "scout_result_runtime_not_ready",

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
   * ------------------------------------------------
   * Compose durable repositories
   * ------------------------------------------------
   */

  let investigationRepository;

  let investigationExecutionRepository;

  try {
    investigationRepository = createD1InvestigationRepository(env.DB);

    investigationExecutionRepository = createD1InvestigationExecutionRepository(
      env.DB,
    );
  } catch {
    console.error({
      status: "scout_result_runtime_not_ready",

      reason: "result_repository_composition_failed",
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
   * ------------------------------------------------
   * Application lookup
   * ------------------------------------------------
   */

  let result;

  try {
    result = await getScoutInvestigationResult(investigationId, {
      investigationRepository,

      investigationExecutionRepository,
    });
  } catch {
    console.error({
      status: "scout_investigation_result_failed",

      reason: "investigation_result_boundary_threw",
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
   * ------------------------------------------------
   * Invalid investigation ID
   * ------------------------------------------------
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
   * ------------------------------------------------
   * Investigation not found
   * ------------------------------------------------
   */

  if (result.status === "investigation_not_found") {
    return jsonResponse(
      {
        status: "investigation_not_found",

        investigation: null,

        result: null,
      },
      {
        status: 404,
      },
    );
  }

  /*
   * ------------------------------------------------
   * Investigation exists but is still running
   * ------------------------------------------------
   *
   * HTTP 202 communicates:
   *
   * Scout accepted the investigation, but the
   * public result is not ready yet.
   */

  if (result.status === "result_not_ready") {
    return jsonResponse(
      {
        status: "result_not_ready",

        investigation: result.investigation,

        result: null,
      },
      {
        status: 202,
      },
    );
  }

  /*
   * ------------------------------------------------
   * Investigation ended in operational failure
   * ------------------------------------------------
   *
   * The lookup itself succeeded, so this is HTTP
   * 200 with a domain-level failed state.
   *
   * We deliberately expose no internal
   * failureReason.
   */

  if (result.status === "investigation_failed") {
    return jsonResponse(
      {
        status: "investigation_failed",

        investigation: result.investigation,

        result: null,
      },
      {
        status: 200,
      },
    );
  }

  /*
   * ------------------------------------------------
   * Public Methodology result ready
   * ------------------------------------------------
   */

  if (result.status === "investigation_result_ready") {
    return jsonResponse(
      {
        status: "investigation_result_ready",

        investigation: result.investigation,

        result: result.result,
      },
      {
        status: 200,
      },
    );
  }

  /*
   * ------------------------------------------------
   * Internal consistency / durable read failure
   * ------------------------------------------------
   *
   * The application service may know the precise
   * reason, but that reason stays server-side.
   */

  console.error({
    status: "scout_investigation_result_failed",

    reason: result?.reason ?? "unknown_result_failure",
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
