/*
 * Recover Stranded Investigations
 *
 * Scheduled application service for investigations
 * that entered PREPARING_REVIEW but became stranded
 * after execution ownership disappeared.
 *
 *
 * Flow:
 *
 * scheduled recovery sweep
 *        ↓
 * executionRecovery
 *   .getRecoverableInvestigations()
 *        ↓
 * PREPARING_REVIEW
 * + missing / released / expired lease
 * + no terminal execution
 *        ↓
 * investigationQueue.sendInvestigation()
 *        ↓
 * existing Queue consumer
 *        ↓
 * processQueuedInvestigation()
 *        ↓
 * acquire new lease / next attempt
 *
 *
 * IMPORTANT:
 *
 * This service does NOT:
 *
 * - change investigation lifecycle state
 * - alter or delete the old lease
 * - rewrite historical execution attempts
 * - create a new execution directly
 * - publish a review
 *
 *
 * Recovery ownership is still established only
 * through the normal Queue execution path.
 */

import { validateInvestigationExecutionRecovery } from "../ports/investigationExecutionRecovery.js";

import { validateInvestigationQueue } from "../ports/investigationQueue.js";

/*
 * ------------------------------------------------
 * Constants
 * ------------------------------------------------
 */

const DEFAULT_RECOVERY_LIMIT = 25;

const MAX_RECOVERY_LIMIT = 100;

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

function isValidTimestamp(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeLimit(value) {
  if (!Number.isInteger(value)) {
    return DEFAULT_RECOVERY_LIMIT;
  }

  return Math.min(
    Math.max(value, 1),

    MAX_RECOVERY_LIMIT,
  );
}

/*
 * ------------------------------------------------
 * recoverStrandedInvestigations
 * ------------------------------------------------
 *
 * Expected dependencies:
 *
 * {
 *   recovery,
 *   queue
 * }
 *
 *
 * Optional controls:
 *
 * {
 *   now,
 *   limit
 * }
 */

export async function recoverStrandedInvestigations({
  recovery,

  queue,

  now = new Date().toISOString(),

  limit = DEFAULT_RECOVERY_LIMIT,
} = {}) {
  /*
   * =================================================
   * Validate execution-recovery dependency
   * =================================================
   */

  const recoveryValidation = validateInvestigationExecutionRecovery(recovery);

  if (recoveryValidation.status !== "execution_recovery_ready") {
    return {
      status: "recovery_not_ready",

      reason: "execution_recovery_not_ready",

      details: recoveryValidation,

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Validate Queue dependency
   * =================================================
   */

  const queueValidation = validateInvestigationQueue(queue);

  if (queueValidation.status !== "queue_ready") {
    return {
      status: "recovery_not_ready",

      reason: "investigation_queue_not_ready",

      details: queueValidation,

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Validate runtime timestamp
   * =================================================
   */

  if (!isValidTimestamp(now)) {
    return {
      status: "recovery_not_ready",

      reason: "valid_now_timestamp_required",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  const normalizedNow = now.trim();

  const normalizedLimit = normalizeLimit(limit);

  /*
   * =================================================
   * Query authoritative stranded work
   * =================================================
   */

  let recoverableResult;

  try {
    recoverableResult = await recovery.getRecoverableInvestigations({
      now: normalizedNow,

      limit: normalizedLimit,
    });
  } catch {
    /*
     * Never expose arbitrary infrastructure
     * exception text through this boundary.
     */

    return {
      status: "recovery_sweep_failed",

      reason: "recoverable_investigation_query_threw",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  if (recoverableResult?.status !== "recoverable_investigations_found") {
    return {
      status: "recovery_sweep_failed",

      reason: "recoverable_investigation_query_failed",

      recoveryResult: recoverableResult,

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  const recoverableInvestigations = Array.isArray(
    recoverableResult.investigations,
  )
    ? recoverableResult.investigations
    : [];

  /*
   * =================================================
   * Nothing stranded
   * =================================================
   */

  if (recoverableInvestigations.length === 0) {
    return {
      status: "recovery_sweep_complete",

      reason: null,

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Requeue sequentially
   * =================================================
   *
   * Sequential processing is deliberate for V1.
   *
   * It keeps scheduled recovery bounded and easy
   * to reason about.
   *
   *
   * IMPORTANT RACE SAFETY:
   *
   * Another recovery sweep or Queue consumer may
   * act on the same investigation after this query.
   *
   * That is safe because:
   *
   * - Queue delivery is idempotent
   * - active leases reject duplicate ownership
   * - stale workers cannot write outcomes
   */

  const results = [];

  for (const candidate of recoverableInvestigations) {
    const investigationId = isNonEmptyString(candidate?.investigationId)
      ? candidate.investigationId.trim()
      : null;

    /*
     * ------------------------------------------------
     * Defensive malformed-row handling
     * ------------------------------------------------
     */

    if (!investigationId) {
      results.push({
        status: "recovery_record_invalid",

        reason: "recoverable_investigation_id_required",

        investigationId: null,

        leaseState: candidate?.leaseState ?? null,

        leaseAttempt: candidate?.leaseAttempt ?? null,
      });

      continue;
    }

    /*
     * ------------------------------------------------
     * Send investigation ID back to Queue
     * ------------------------------------------------
     */

    let queueResult;

    try {
      queueResult = await queue.sendInvestigation({
        investigationId,
      });
    } catch {
      results.push({
        status: "recovery_queue_failed",

        reason: "recovery_queue_send_threw",

        investigationId,

        leaseState: candidate?.leaseState ?? null,

        leaseAttempt: candidate?.leaseAttempt ?? null,

        latestExecutionStatus: candidate?.latestExecutionStatus ?? null,
      });

      continue;
    }

    /*
     * Queue producer contract:
     *
     * investigation_queued
     * means Cloudflare accepted the message.
     */

    if (queueResult?.status === "investigation_queued") {
      results.push({
        status: "stranded_investigation_requeued",

        reason: null,

        investigationId,

        leaseState: candidate?.leaseState ?? null,

        leaseAttempt: candidate?.leaseAttempt ?? null,

        leaseExpiresAt: candidate?.leaseExpiresAt ?? null,

        latestExecutionStatus: candidate?.latestExecutionStatus ?? null,

        queueResult,
      });

      continue;
    }

    /*
     * Queue did not accept the recovery message.
     *
     * We deliberately do NOT mutate the old lease
     * or investigation.
     *
     * Because the durable recovery predicate remains
     * true, the next scheduled sweep can try again.
     */

    results.push({
      status: "recovery_queue_failed",

      reason: queueResult?.reason ?? "recovery_queue_send_failed",

      investigationId,

      leaseState: candidate?.leaseState ?? null,

      leaseAttempt: candidate?.leaseAttempt ?? null,

      latestExecutionStatus: candidate?.latestExecutionStatus ?? null,

      queueResult,
    });
  }

  /*
   * =================================================
   * Aggregate sweep
   * =================================================
   */

  const requeued = results.filter(
    (result) => result.status === "stranded_investigation_requeued",
  ).length;

  const queueFailures = results.filter(
    (result) => result.status === "recovery_queue_failed",
  ).length;

  const invalidRecords = results.filter(
    (result) => result.status === "recovery_record_invalid",
  ).length;

  const problems = queueFailures + invalidRecords;

  /*
   * Queue-send failure does not corrupt state.
   *
   * The investigation remains recoverable and can
   * be found again by the next scheduled sweep.
   */

  return {
    status: problems > 0 ? "recovery_sweep_partial" : "recovery_sweep_complete",

    reason: problems > 0 ? "one_or_more_recoveries_not_requeued" : null,

    checked: recoverableInvestigations.length,

    requeued,

    queueFailures,

    invalidRecords,

    results,
  };
}
