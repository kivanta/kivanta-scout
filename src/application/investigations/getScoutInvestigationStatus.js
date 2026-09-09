import { validateInvestigationRepository } from "../ports/investigationRepository.js";

/*
 * Kivanta Scout
 * Get Scout Investigation Status
 *
 * Application-layer read boundary for one
 * investigation's durable state.
 *
 *
 * It does NOT:
 *
 * - know about Astro
 * - know about Cloudflare bindings
 * - expose the frozen target
 * - expose raw D1 errors
 * - expose source code or evidence
 * - publish Methodology results
 */

export async function getScoutInvestigationStatus(
  investigationId,
  { investigationRepository } = {},
) {
  /*
   * ------------------------------------------------
   * Validate investigation ID
   * ------------------------------------------------
   */

  if (typeof investigationId !== "string" || investigationId.trim() === "") {
    return {
      status: "invalid_request",

      reason: "investigation_id_required",

      investigation: null,
    };
  }

  const normalizedInvestigationId = investigationId.trim();

  /*
   * Opaque IDs should remain small.
   *
   * Current Scout IDs are UUIDs, but the
   * application contract deliberately does not
   * require callers to understand their format.
   */
  if (normalizedInvestigationId.length > 128) {
    return {
      status: "invalid_request",

      reason: "investigation_id_too_long",

      investigation: null,
    };
  }

  /*
   * ------------------------------------------------
   * Validate repository dependency
   * ------------------------------------------------
   */

  const repositoryValidation = validateInvestigationRepository(
    investigationRepository,
  );

  if (repositoryValidation.status !== "repository_ready") {
    return {
      status: "investigation_status_failed",

      reason: "investigation_repository_not_ready",

      investigation: null,
    };
  }

  /*
   * ------------------------------------------------
   * Durable lookup
   * ------------------------------------------------
   */

  const result = await investigationRepository.getInvestigation(
    normalizedInvestigationId,
  );

  /*
   * Investigation does not exist.
   */
  if (result?.status === "investigation_not_found") {
    return {
      status: "investigation_not_found",

      reason: null,

      investigation: null,
    };
  }

  /*
   * Durable read failed.
   */
  if (result?.status !== "investigation_found" || !result?.investigation) {
    return {
      status: "investigation_status_failed",

      reason: result?.reason || "investigation_query_failed",

      investigation: null,
    };
  }

  const investigation = result.investigation;

  /*
   * ------------------------------------------------
   * Public-safe status projection
   * ------------------------------------------------
   *
   * Deliberately expose only what a polling
   * visitor needs right now.
   *
   * Do NOT expose:
   *
   * - target
   * - review key
   * - repository IDs
   * - raw operational failure details
   */

  return {
    status: "investigation_found",

    reason: null,

    investigation: {
      investigationId: investigation.investigationId,

      lifecycleState: investigation.lifecycleState,

      createdAt: investigation.createdAt ?? null,

      updatedAt: investigation.updatedAt ?? null,
    },
  };
}
