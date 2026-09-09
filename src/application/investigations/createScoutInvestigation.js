import { prepareInvestigation } from "./prepareInvestigation.js";

import { freezeInvestigationTarget } from "./freezeInvestigationTarget.js";

import { createInvestigationRecord } from "./createInvestigationRecord.js";

import { validateInvestigationRepository } from "../ports/investigationRepository.js";

/*
 * Kivanta Scout
 * Create Scout Investigation
 *
 * Application-layer orchestration for one
 * visitor investigation request.
 *
 *
 * Flow:
 *
 * public reference
 *      ↓
 * prepareInvestigation()
 *      ↓
 * freezeInvestigationTarget()
 *      ↓
 * createInvestigationRecord()
 *      ↓
 * investigationRepository.claimActiveInvestigation()
 *      ↓
 * durable D1 investigation + active claim + outbox
 *
 *
 * This service does NOT:
 *
 * - know about Astro
 * - know about Cloudflare env bindings
 * - send HTTP responses
 * - send Queue messages directly
 * - run Methodology 1.0
 * - publish a result
 */

export async function createScoutInvestigation(
  value,
  {
    discoveryRunner,

    investigationRepository,

    targetFreezer = freezeInvestigationTarget,

    recordCreator = createInvestigationRecord,
  } = {},
) {
  /*
   * ------------------------------------------------
   * Validate dependencies
   * ------------------------------------------------
   */

  if (typeof discoveryRunner !== "function") {
    return {
      status: "investigation_request_failed",

      reason: "discovery_runner_required",

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,
    };
  }

  const repositoryValidation = validateInvestigationRepository(
    investigationRepository,
  );

  if (repositoryValidation.status !== "repository_ready") {
    return {
      status: "investigation_request_failed",

      reason: "investigation_repository_not_ready",

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,

      details: repositoryValidation,
    };
  }

  /*
   * ------------------------------------------------
   * Discovery / supported-source gate
   * ------------------------------------------------
   */

  const prepared = await prepareInvestigation(value, {
    discoveryRunner,
  });

  /*
   * Empty / malformed request.
   */
  if (prepared.status === "invalid_request") {
    return {
      status: "invalid_request",

      reason: prepared.reason,

      inputType: prepared.inputType,

      methodologyEligible: false,

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,

      discovery: null,
    };
  }

  /*
   * Discovery completed, but Scout could not
   * establish a supported V1 source.
   *
   * IMPORTANT:
   *
   * This is not an operational failure.
   *
   * No investigation is persisted and no
   * Methodology findings are created.
   */
  if (prepared.status === "discovery_only") {
    return {
      status: "discovery_only",

      reason: prepared.reason,

      inputType: prepared.inputType,

      methodologyEligible: false,

      canonicalSource: prepared.canonicalSource ?? null,

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,

      discovery: prepared.discovery ?? null,
    };
  }

  /*
   * Fail closed if the preparation boundary
   * returned an unexpected state.
   */
  if (prepared.status !== "source_ready") {
    return {
      status: "investigation_request_failed",

      reason: "unexpected_preparation_state",

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,
    };
  }

  /*
   * ------------------------------------------------
   * Freeze exact immutable target
   * ------------------------------------------------
   */

  const frozen = await targetFreezer(prepared);

  if (frozen?.status !== "target_frozen" || !frozen?.target) {
    return {
      status: "investigation_request_failed",

      reason: frozen?.reason || "investigation_target_not_frozen",

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,
    };
  }

  /*
   * ------------------------------------------------
   * Create opaque investigation identity
   * ------------------------------------------------
   */

  const created = recordCreator(frozen);

  if (created?.status !== "investigation_created" || !created?.investigation) {
    return {
      status: "investigation_request_failed",

      reason: created?.reason || "investigation_record_not_created",

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,
    };
  }

  /*
   * ------------------------------------------------
   * Durable claim
   * ------------------------------------------------
   *
   * The D1 repository atomically:
   *
   * 1. persists the investigation
   * 2. claims the exact active review
   * 3. creates the PENDING dispatch outbox row
   *
   * If the exact review is already active,
   * the repository returns that existing
   * investigation instead.
   */

  const claimed = await investigationRepository.claimActiveInvestigation(
    created.investigation,
  );

  if (claimed?.status !== "investigation_claimed" || !claimed?.investigation) {
    return {
      status: "investigation_request_failed",

      reason: claimed?.reason || "investigation_not_claimed",

      investigationId: null,

      lifecycleState: null,

      joinedExisting: false,
    };
  }

  /*
   * ------------------------------------------------
   * Public/application result
   * ------------------------------------------------
   */

  return {
    status: "investigation_accepted",

    reason: claimed.reason ?? null,

    investigationId: claimed.investigation.investigationId,

    lifecycleState: claimed.investigation.lifecycleState ?? "CREATED",

    joinedExisting: claimed.joinedExisting === true,

    methodologyEligible: true,

    inputType: prepared.inputType ?? null,

    canonicalSource: prepared.canonicalSource ?? null,
  };
}
