/*
 * Investigation Queued Recovery Port
 *
 * Defines the application-facing contract for
 * recovering investigations that became stranded
 * while still in QUEUED state.
 *
 *
 * Why this exists:
 *
 * A Queue message can disappear after exhausting
 * delivery retries before Scout reaches
 * PREPARING_REVIEW.
 *
 * In that case D1 may still contain:
 *
 * investigation.lifecycle_state = QUEUED
 * outbox.dispatch_state = DISPATCHED
 *
 * but no useful Queue message remains.
 *
 *
 * Recovery rule:
 *
 * QUEUED
 * + previously DISPATCHED
 * + older than a grace threshold
 * + no usable active lease at current time
 * + no terminal execution
 *        ↓
 * safe candidate for Queue re-send
 *
 *
 * This port deliberately does NOT:
 *
 * - reopen the original outbox row to PENDING
 * - change investigation lifecycle state
 * - create an execution
 * - acquire a lease
 * - publish a result
 *
 *
 * After a recovery Queue send succeeds, the
 * infrastructure implementation may refresh the
 * DISPATCHED outbox row's recovery clock while
 * keeping it DISPATCHED.
 */

/*
 * =================================================
 * CONTRACT
 * =================================================
 *
 * Required implementation:
 *
 * {
 *   getRecoverableQueuedInvestigations,
 *   markQueuedRecoveryDispatched
 * }
 *
 *
 * -------------------------------------------------
 * getRecoverableQueuedInvestigations
 * -------------------------------------------------
 *
 * Input:
 *
 * {
 *   now: ISO timestamp,
 *   staleBefore: ISO timestamp,
 *   limit: integer
 * }
 *
 *
 * Why both timestamps are required:
 *
 * now
 *   → determines whether a lease is usable now
 *
 * staleBefore
 *   → determines whether Queue delivery activity
 *     is old enough to qualify for recovery
 *
 *
 * Expected success:
 *
 * {
 *   status:
 *     "recoverable_queued_investigations_found",
 *
 *   reason:
 *     null,
 *
 *   investigations: [
 *     {
 *       investigationId,
 *       lifecycleState,
 *
 *       outboxId,
 *       dispatchState,
 *       attemptCount,
 *
 *       dispatchedAt,
 *       recoveryClockAt,
 *
 *       leaseState,
 *       leaseAttempt,
 *       leaseExpiresAt,
 *
 *       latestExecutionStatus
 *     }
 *   ],
 *
 *   count
 * }
 *
 *
 * -------------------------------------------------
 * markQueuedRecoveryDispatched
 * -------------------------------------------------
 *
 * Called only AFTER Queue send succeeds.
 *
 * Input:
 *
 * {
 *   outboxId,
 *   recoveredAt
 * }
 *
 *
 * Expected success:
 *
 * {
 *   status:
 *     "queued_recovery_dispatch_recorded",
 *
 *   reason:
 *     null,
 *
 *   outboxId,
 *   dispatchState:
 *     "DISPATCHED"
 * }
 *
 *
 * The durable implementation should:
 *
 * - keep dispatch_state = DISPATCHED
 * - keep original dispatched_at unchanged
 * - increment attempt_count
 * - set updated_at = recoveredAt
 *
 *
 * That updated_at timestamp becomes the cooldown
 * clock before the same QUEUED investigation may
 * qualify for another recovery send.
 */

/*
 * =================================================
 * validateInvestigationQueuedRecovery
 * =================================================
 */

export function validateInvestigationQueuedRecovery(implementation) {
  if (!implementation || typeof implementation !== "object") {
    return {
      status: "queued_recovery_not_ready",

      reason: "queued_recovery_required",
    };
  }

  if (
    typeof implementation.getRecoverableQueuedInvestigations !== "function" ||
    typeof implementation.markQueuedRecoveryDispatched !== "function"
  ) {
    return {
      status: "queued_recovery_not_ready",

      reason: "queued_recovery_methods_missing",
    };
  }

  return {
    status: "queued_recovery_ready",

    reason: null,
  };
}

/*
 * =================================================
 * Port Contract Metadata
 * =================================================
 */

export const investigationQueuedRecoveryContract = {
  methods: [
    "getRecoverableQueuedInvestigations",
    "markQueuedRecoveryDispatched",
  ],

  recoverableQuery: {
    successStatus: "recoverable_queued_investigations_found",

    lifecycleState: "QUEUED",

    dispatchState: "DISPATCHED",

    terminalExecutionStatuses: ["COMPLETE", "PARTIAL", "FAILED"],

    usableLeaseExcluded: true,

    currentTimestampRequired: true,

    staleThresholdRequired: true,
  },

  recoveryDispatch: {
    successStatus: "queued_recovery_dispatch_recorded",

    dispatchStateRemains: "DISPATCHED",

    preserveOriginalDispatchedAt: true,

    incrementAttemptCount: true,

    refreshUpdatedAt: true,
  },
};
