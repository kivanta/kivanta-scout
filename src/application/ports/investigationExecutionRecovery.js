/*
 * Investigation Execution Recovery Port
 *
 * Defines Scout's application contract for finding
 * investigations whose execution work became
 * stranded and may safely be requeued.
 *
 *
 * This port is deliberately separate from:
 *
 * - investigationRepository
 * - investigationExecutionLease
 * - investigationExecutionRepository
 * - investigationDispatchOutbox
 * - investigationQueue
 *
 *
 * Why?
 *
 * The dispatch outbox answers:
 *
 *   "Was this investigation successfully sent
 *    to the Queue?"
 *
 * Execution recovery answers:
 *
 *   "Was this investigation sent and started,
 *    but later stranded after execution ownership
 *    disappeared?"
 *
 *
 * These are different durable facts and should
 * not be mixed together.
 */

/*
 * ------------------------------------------------
 * Required recovery methods
 * ------------------------------------------------
 */

const requiredMethods = ["getRecoverableInvestigations"];

/*
 * ------------------------------------------------
 * Validate recovery implementation
 * ------------------------------------------------
 */

export function validateInvestigationExecutionRecovery(recovery) {
  if (!recovery || typeof recovery !== "object") {
    return {
      status: "execution_recovery_not_ready",

      reason: "execution_recovery_required",

      missingMethods: [...requiredMethods],
    };
  }

  const missingMethods = requiredMethods.filter(
    (method) => typeof recovery[method] !== "function",
  );

  if (missingMethods.length > 0) {
    return {
      status: "execution_recovery_not_ready",

      reason: "execution_recovery_methods_missing",

      missingMethods,
    };
  }

  return {
    status: "execution_recovery_ready",

    reason: null,

    missingMethods: [],
  };
}

/*
 * =================================================
 * RECOVERY MODEL
 * =================================================
 *
 * A recoverable investigation is one where:
 *
 * 1. investigation.lifecycleState
 *      === "PREPARING_REVIEW"
 *
 * AND
 *
 * 2. there is no currently usable execution lease
 *
 *    meaning:
 *
 *    - no lease exists
 *      OR
 *
 *    - lease was explicitly released
 *      OR
 *
 *    - lease expired at or before `now`
 *
 * AND
 *
 * 3. no durable terminal execution outcome exists
 *
 *    terminal execution statuses:
 *
 *    - COMPLETE
 *    - PARTIAL
 *    - FAILED
 *
 *
 * Historical RUNNING attempts do NOT block recovery.
 *
 * Example:
 *
 * attempt 1
 * RUNNING
 *      ↓
 * worker dies
 *      ↓
 * lease expires
 *      ↓
 * investigation remains PREPARING_REVIEW
 *      ↓
 * scheduled recovery finds it
 *      ↓
 * investigation ID is requeued
 *      ↓
 * attempt 2 receives a new lease
 *
 *
 * Attempt 1 remains preserved as historical state.
 */

/*
 * =================================================
 * IMPORTANT NON-RECOVERY CASES
 * =================================================
 *
 * Do NOT return:
 *
 * CREATED
 * QUEUED
 * COMPLETE
 * PARTIAL
 * FAILED
 * or any other lifecycle state.
 *
 *
 * Do NOT return PREPARING_REVIEW when an active,
 * unexpired, unreleased lease currently exists.
 *
 *
 * Do NOT return an investigation when ANY durable
 * execution already has a terminal status:
 *
 * COMPLETE
 * PARTIAL
 * FAILED
 *
 *
 * This prevents scheduled recovery from creating
 * unnecessary new attempts after a durable outcome
 * already exists.
 */

/*
 * =================================================
 * CONTRACT
 * =================================================
 */

/*
 * ------------------------------------------------
 * getRecoverableInvestigations(options)
 * ------------------------------------------------
 *
 * Expected input:
 *
 * {
 *   now:
 *     "2026-09-07T16:00:00.000Z",
 *
 *   limit:
 *     25
 * }
 *
 *
 * The implementation should keep the query bounded.
 *
 * Suggested V1 maximum:
 *
 * 100 rows per sweep.
 *
 *
 * Expected success:
 *
 * {
 *   status:
 *     "recoverable_investigations_found",
 *
 *   reason:
 *     null,
 *
 *   investigations: [
 *     {
 *       investigationId:
 *         "inv_...",
 *
 *       lifecycleState:
 *         "PREPARING_REVIEW",
 *
 *       leaseState:
 *         "EXPIRED",
 *
 *       leaseAttempt:
 *         1,
 *
 *       leaseExpiresAt:
 *         "...",
 *
 *       latestExecutionStatus:
 *         "RUNNING"
 *     }
 *   ],
 *
 *   count:
 *     1
 * }
 *
 *
 * Zero recoverable rows is still success:
 *
 * {
 *   status:
 *     "recoverable_investigations_found",
 *
 *   reason:
 *     null,
 *
 *   investigations:
 *     [],
 *
 *   count:
 *     0
 * }
 *
 *
 * Query failure:
 *
 * {
 *   status:
 *     "recoverable_investigations_query_failed",
 *
 *   reason:
 *     "...",
 *
 *   investigations:
 *     [],
 *
 *   count:
 *     0
 * }
 */

/*
 * =================================================
 * LEASE STATE
 * =================================================
 *
 * The infrastructure adapter may describe why the
 * investigation is recoverable using:
 *
 * MISSING
 * RELEASED
 * EXPIRED
 *
 *
 * This metadata is for bounded operational
 * reasoning only.
 *
 * The scheduled application service should not
 * manipulate the old lease.
 *
 * Re-execution ownership is still established only
 * through the normal Queue path:
 *
 * Queue
 *   ↓
 * processQueuedInvestigation()
 *   ↓
 * acquireExecutionLease()
 *   ↓
 * attempt increments safely
 */

/*
 * =================================================
 * TRUST / SAFETY RULE
 * =================================================
 *
 * Recovery discovery does NOT:
 *
 * - create an execution
 * - change an investigation lifecycle
 * - alter a lease
 * - rewrite historical RUNNING executions
 * - publish a review
 * - manufacture UNKNOWN findings
 *
 *
 * It only identifies durable investigation IDs that
 * satisfy the recovery predicate.
 *
 * The later application recovery sweep decides
 * whether to send those IDs back to the Queue.
 */

/*
 * ------------------------------------------------
 * Export inspectable contract
 * ------------------------------------------------
 */

export const investigationExecutionRecoveryContract = Object.freeze({
  requiredMethods: [...requiredMethods],
});
