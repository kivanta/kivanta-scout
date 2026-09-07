/*
 * Recover Stale Queued Investigations
 *
 * Application service for recovering investigations
 * that remain in QUEUED state after their Queue
 * delivery has become stale.
 *
 *
 * Flow:
 *
 * scheduled sweep
 *      ↓
 * queuedRecovery
 *   .getRecoverableQueuedInvestigations()
 *      ↓
 * stale QUEUED candidates
 *      ↓
 * queue.sendInvestigation()
 *      ↓
 * Queue accepts message
 *      ↓
 * queuedRecovery
 *   .markQueuedRecoveryDispatched()
 *      ↓
 * refresh durable cooldown clock
 *
 *
 * IMPORTANT:
 *
 * This service does NOT:
 *
 * - reopen the outbox to PENDING
 * - change investigation lifecycle state
 * - acquire an execution lease
 * - create an execution
 * - publish an investigation
 *
 *
 * The normal Queue consumer remains responsible
 * for acquiring execution ownership.
 */

import { validateInvestigationQueuedRecovery } from "../ports/investigationQueuedRecovery.js";

import { validateInvestigationQueue } from "../ports/investigationQueue.js";

/*
 * =================================================
 * Constants
 * =================================================
 */

/*
 * A freshly queued investigation should not be
 * treated as lost merely because a scheduled sweep
 * happens shortly after dispatch.
 *
 * V1 default:
 *
 * 30 minutes
 */
const DEFAULT_STALE_GRACE_MS = 30 * 60 * 1000;

const DEFAULT_RECOVERY_LIMIT = 25;

const MAX_RECOVERY_LIMIT = 100;

/*
 * =================================================
 * Helpers
 * =================================================
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

function isValidOutboxId(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizeLimit(value) {
  if (!Number.isInteger(value)) {
    return DEFAULT_RECOVERY_LIMIT;
  }

  return Math.min(Math.max(value, 1), MAX_RECOVERY_LIMIT);
}

function normalizeGraceMs(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_STALE_GRACE_MS;
  }

  return Math.floor(value);
}

/*
 * =================================================
 * recoverStaleQueuedInvestigations
 * =================================================
 *
 * Required dependencies:
 *
 * {
 *   queuedRecovery,
 *   queue
 * }
 *
 *
 * Optional controls:
 *
 * {
 *   now,
 *   staleGraceMs,
 *   limit
 * }
 */

export async function recoverStaleQueuedInvestigations({
  queuedRecovery,

  queue,

  now = new Date().toISOString(),

  staleGraceMs = DEFAULT_STALE_GRACE_MS,

  limit = DEFAULT_RECOVERY_LIMIT,
} = {}) {
  /*
   * =================================================
   * Validate queued-recovery dependency
   * =================================================
   */

  const queuedRecoveryValidation =
    validateInvestigationQueuedRecovery(queuedRecovery);

  if (queuedRecoveryValidation.status !== "queued_recovery_ready") {
    return {
      status: "stale_queued_recovery_not_ready",

      reason: "queued_recovery_not_ready",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

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
      status: "stale_queued_recovery_not_ready",

      reason: "investigation_queue_not_ready",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Validate current time
   * =================================================
   */

  if (!isValidTimestamp(now)) {
    return {
      status: "stale_queued_recovery_not_ready",

      reason: "valid_now_timestamp_required",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  const normalizedNow = now.trim();

  const normalizedGraceMs = normalizeGraceMs(staleGraceMs);

  const normalizedLimit = normalizeLimit(limit);

  /*
   * =================================================
   * Compute stale threshold
   * =================================================
   *
   * Example:
   *
   * now = 19:00
   * grace = 30 minutes
   *
   * staleBefore = 18:30
   */

  const staleBefore = new Date(
    Date.parse(normalizedNow) - normalizedGraceMs,
  ).toISOString();

  /*
   * =================================================
   * Query durable stale QUEUED candidates
   * =================================================
   */

  let recoverableResult;

  try {
    recoverableResult = await queuedRecovery.getRecoverableQueuedInvestigations(
      {
        now: normalizedNow,

        staleBefore,

        limit: normalizedLimit,
      },
    );
  } catch {
    return {
      status: "stale_queued_recovery_failed",

      reason: "recoverable_queued_query_threw",

      now: normalizedNow,

      staleBefore,

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  if (recoverableResult?.status !== "recoverable_queued_investigations_found") {
    return {
      status: "stale_queued_recovery_failed",

      reason: "recoverable_queued_query_failed",

      now: normalizedNow,

      staleBefore,

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  const candidates = Array.isArray(recoverableResult.investigations)
    ? recoverableResult.investigations
    : [];

  /*
   * =================================================
   * Nothing stale
   * =================================================
   */

  if (candidates.length === 0) {
    return {
      status: "stale_queued_recovery_complete",

      reason: null,

      now: normalizedNow,

      staleBefore,

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Sequential recovery
   * =================================================
   *
   * Sequential processing keeps V1 bounded and
   * easier to reason about.
   *
   *
   * Important at-least-once case:
   *
   * Queue send succeeds
   * but cooldown write fails
   *
   *      ↓
   *
   * next sweep may send a duplicate
   *
   *      ↓
   *
   * normal lease/idempotency protections handle it
   *
   *
   * We prefer a possible duplicate over losing the
   * investigation permanently.
   */

  const results = [];

  for (const candidate of candidates) {
    const investigationId = isNonEmptyString(candidate?.investigationId)
      ? candidate.investigationId.trim()
      : null;

    const outboxId = candidate?.outboxId;

    /*
     * ------------------------------------------------
     * Defensive candidate validation
     * ------------------------------------------------
     */

    if (!investigationId || !isValidOutboxId(outboxId)) {
      results.push({
        status: "stale_queued_recovery_record_invalid",

        reason: !investigationId
          ? "investigation_id_required"
          : "valid_outbox_id_required",

        investigationId,

        outboxId: isValidOutboxId(outboxId) ? outboxId : null,
      });

      continue;
    }

    /*
     * ------------------------------------------------
     * Re-send investigation ID to Queue
     * ------------------------------------------------
     */

    let queueResult;

    try {
      queueResult = await queue.sendInvestigation({
        investigationId,
      });
    } catch {
      results.push({
        status: "stale_queued_recovery_queue_failed",

        reason: "recovery_queue_send_threw",

        investigationId,

        outboxId,
      });

      continue;
    }

    if (queueResult?.status !== "investigation_queued") {
      results.push({
        status: "stale_queued_recovery_queue_failed",

        reason: queueResult?.reason ?? "recovery_queue_send_failed",

        investigationId,

        outboxId,

        queueResult,
      });

      continue;
    }

    /*
     * ------------------------------------------------
     * Queue accepted recovery message.
     *
     * Record the cooldown durably.
     * ------------------------------------------------
     */

    let stateResult;

    try {
      stateResult = await queuedRecovery.markQueuedRecoveryDispatched({
        outboxId,

        recoveredAt: normalizedNow,
      });
    } catch {
      /*
       * Queue message already exists.
       *
       * Do NOT pretend the send failed.
       *
       * We report the durable state failure
       * separately so the next scheduled sweep may
       * retry if necessary.
       */

      results.push({
        status: "stale_queued_recovery_state_failed",

        reason: "recovery_dispatch_record_threw",

        investigationId,

        outboxId,

        queueAccepted: true,
      });

      continue;
    }

    if (stateResult?.status !== "queued_recovery_dispatch_recorded") {
      results.push({
        status: "stale_queued_recovery_state_failed",

        reason: stateResult?.reason ?? "recovery_dispatch_not_recorded",

        investigationId,

        outboxId,

        queueAccepted: true,

        stateResult,
      });

      continue;
    }

    /*
     * ------------------------------------------------
     * Fully successful recovery send
     * ------------------------------------------------
     */

    results.push({
      status: "stale_queued_investigation_requeued",

      reason: null,

      investigationId,

      outboxId,

      leaseState: candidate?.leaseState ?? null,

      leaseAttempt: candidate?.leaseAttempt ?? null,

      latestExecutionStatus: candidate?.latestExecutionStatus ?? null,

      recoveryClockAt: normalizedNow,
    });
  }

  /*
   * =================================================
   * Aggregate results
   * =================================================
   */

  const requeued = results.filter(
    (result) => result.status === "stale_queued_investigation_requeued",
  ).length;

  const queueFailures = results.filter(
    (result) => result.status === "stale_queued_recovery_queue_failed",
  ).length;

  const stateFailures = results.filter(
    (result) => result.status === "stale_queued_recovery_state_failed",
  ).length;

  const invalidRecords = results.filter(
    (result) => result.status === "stale_queued_recovery_record_invalid",
  ).length;

  const problems = queueFailures + stateFailures + invalidRecords;

  return {
    status:
      problems === 0
        ? "stale_queued_recovery_complete"
        : "stale_queued_recovery_partial",

    reason:
      problems === 0 ? null : "one_or_more_stale_queued_recoveries_incomplete",

    now: normalizedNow,

    staleBefore,

    checked: candidates.length,

    requeued,

    queueFailures,

    stateFailures,

    invalidRecords,

    results,
  };
}
