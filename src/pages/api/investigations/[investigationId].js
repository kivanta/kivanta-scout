/*
 * Kivanta Scout
 * GET /api/investigations/:investigationId
 *
 * Public polling boundary for one Scout
 * investigation.
 *
 * Responsibilities:
 *
 * - read the opaque investigation ID
 * - compose the D1 repository
 * - call the application status service
 * - return a bounded public response
 *
 * This route does NOT expose:
 *
 * - frozen targets
 * - review keys
 * - raw D1 errors
 * - source code
 * - Methodology evidence
 */

import { env } from "cloudflare:workers";

import { createD1InvestigationRepository } from "../../../infrastructure/cloudflare/d1/d1InvestigationRepository.js";

import { getScoutInvestigationStatus } from "../../../application/investigations/getScoutInvestigationStatus.js";

export const prerender = false;

/*
 * ------------------------------------------------
 * JSON helper
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
   * ------------------------------------------------
   * Compose durable repository
   * ------------------------------------------------
   */

  let investigationRepository;

  try {
    investigationRepository = createD1InvestigationRepository(env.DB);
  } catch {
    console.error({
      status: "scout_http_runtime_not_ready",

      reason: "investigation_repository_composition_failed",
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
    result = await getScoutInvestigationStatus(investigationId, {
      investigationRepository,
    });
  } catch {
    console.error({
      status: "scout_investigation_status_failed",

      reason: "investigation_status_boundary_threw",
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
   * Invalid ID
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

        reason: null,

        investigation: null,
      },
      {
        status: 404,
      },
    );
  }

  /*
   * ------------------------------------------------
   * Investigation found
   * ------------------------------------------------
   */

  if (result.status === "investigation_found") {
    return jsonResponse(
      {
        status: "investigation_found",

        investigation: result.investigation,
      },
      {
        status: 200,
      },
    );
  }

  /*
   * ------------------------------------------------
   * Operational failure
   * ------------------------------------------------
   */

  console.error({
    status: "scout_investigation_status_failed",

    reason: result?.reason ?? "unknown_status_failure",
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
