/*
 * Investigation Execution Lease Port
 *
 * This defines the application contract used to
 * make Queue execution safe.
 *
 * Cloudflare Queues are at-least-once, which means
 * the same investigation may be delivered more
 * than once.
 *
 * The execution lease ensures only one current
 * worker owns the right to execute an
 * investigation at a time.
 *
 *
 * Example:
 *
 * Queue delivery A
 *      ↓
 * acquires lease token "abc"
 *      ↓
 * runs investigation
 *
 * Queue delivery B
 *      ↓
 * sees active lease
 *      ↓
 * does NOT start duplicate execution
 *
 *
 * If worker A disappears:
 *
 * lease expires
 *      ↓
 * another worker may acquire a new lease
 *      ↓
 * new token "xyz"
 *
 * The old worker must not be allowed to renew,
 * release, or later persist authoritative work
 * using token "abc".
 *
 *
 * D1 will implement this contract later.
 */

/*
 * Methods every execution-lease implementation
 * must provide.
 */
const requiredMethods = [
  "acquireExecutionLease",
  "getExecutionLease",
  "heartbeatExecutionLease",
  "releaseExecutionLease",
];

/*
 * ------------------------------------------------
 * Validate an execution-lease adapter.
 * ------------------------------------------------
 */

export function validateInvestigationExecutionLease(executionLease) {
  if (!executionLease || typeof executionLease !== "object") {
    return {
      status: "execution_lease_not_ready",

      reason: "execution_lease_required",

      missingMethods: [...requiredMethods],
    };
  }

  const missingMethods = requiredMethods.filter(
    (method) => typeof executionLease[method] !== "function",
  );

  if (missingMethods.length > 0) {
    return {
      status: "execution_lease_not_ready",

      reason: "execution_lease_methods_missing",

      missingMethods,
    };
  }

  return {
    status: "execution_lease_ready",

    reason: null,

    missingMethods: [],
  };
}

/*
 * =================================================
 * CONTRACT
 * =================================================
 */

/*
 * ------------------------------------------------
 * acquireExecutionLease(input)
 * ------------------------------------------------
 *
 * Attempts to claim execution ownership.
 *
 * Expected input:
 *
 * {
 *   investigationId: "inv_...",
 *
 *   leaseToken:
 *     "opaque-random-token",
 *
 *   acquiredAt:
 *     "2026-09-07T10:00:00.000Z",
 *
 *   expiresAt:
 *     "2026-09-07T10:05:00.000Z"
 * }
 *
 *
 * Possible successful acquisition:
 *
 * {
 *   status:
 *     "execution_lease_acquired",
 *
 *   investigationId:
 *     "inv_...",
 *
 *   leaseToken:
 *     "opaque-random-token",
 *
 *   attempt: 1,
 *
 *   expiresAt:
 *     "..."
 * }
 *
 *
 * If another unexpired lease already owns the
 * investigation:
 *
 * {
 *   status:
 *     "execution_lease_busy",
 *
 *   reason:
 *     "active_execution_lease_exists",
 *
 *   investigationId:
 *     "inv_...",
 *
 *   expiresAt:
 *     "..."
 * }
 *
 *
 * If an older lease has expired, D1 may replace
 * it with the new token and increment the attempt
 * number.
 *
 * Example:
 *
 * old attempt = 1
 * old lease expired
 *
 * new acquisition:
 *
 * attempt = 2
 */

/*
 * ------------------------------------------------
 * getExecutionLease(investigationId)
 * ------------------------------------------------
 *
 * Reads the current durable lease record.
 *
 * Expected result:
 *
 * {
 *   status:
 *     "execution_lease_found",
 *
 *   lease: {
 *     investigationId:
 *       "inv_...",
 *
 *     leaseToken:
 *       "...",
 *
 *     attempt: 1,
 *
 *     acquiredAt:
 *       "...",
 *
 *     heartbeatAt:
 *       "...",
 *
 *     expiresAt:
 *       "...",
 *
 *     releasedAt:
 *       null
 *   }
 * }
 *
 *
 * If no lease exists:
 *
 * {
 *   status:
 *     "execution_lease_not_found",
 *
 *   lease: null
 * }
 */

/*
 * ------------------------------------------------
 * heartbeatExecutionLease(input)
 * ------------------------------------------------
 *
 * Extends an active lease while the worker is
 * still executing.
 *
 * Expected input:
 *
 * {
 *   investigationId:
 *     "inv_...",
 *
 *   leaseToken:
 *     "opaque-random-token",
 *
 *   heartbeatAt:
 *     "2026-09-07T10:03:00.000Z",
 *
 *   expiresAt:
 *     "2026-09-07T10:08:00.000Z"
 * }
 *
 *
 * The D1 adapter MUST update the lease only when
 * the supplied token still owns that lease.
 *
 * Successful result:
 *
 * {
 *   status:
 *     "execution_lease_renewed"
 * }
 *
 *
 * If the token no longer owns the lease:
 *
 * {
 *   status:
 *     "execution_lease_not_renewed",
 *
 *   reason:
 *     "stale_execution_lease"
 * }
 *
 *
 * This protects us from an old worker waking up
 * after another worker has taken ownership.
 */

/*
 * ------------------------------------------------
 * releaseExecutionLease(input)
 * ------------------------------------------------
 *
 * Releases the lease after the owning worker has
 * completed or deliberately stopped execution.
 *
 * Expected input:
 *
 * {
 *   investigationId:
 *     "inv_...",
 *
 *   leaseToken:
 *     "opaque-random-token",
 *
 *   releasedAt:
 *     "2026-09-07T10:04:00.000Z"
 * }
 *
 *
 * The adapter MUST release the lease only when
 * the supplied token still owns it.
 *
 * Successful result:
 *
 * {
 *   status:
 *     "execution_lease_released"
 * }
 *
 *
 * Stale token:
 *
 * {
 *   status:
 *     "execution_lease_not_released",
 *
 *   reason:
 *     "stale_execution_lease"
 * }
 */

/*
 * =================================================
 * IMPORTANT SAFETY RULE
 * =================================================
 *
 * Checking the lease before an authoritative
 * result write is NOT enough by itself.
 *
 * Example:
 *
 * worker checks lease     ✅
 * lease changes           ⚠️
 * old worker writes       ❌
 *
 * Therefore future execution-result persistence
 * must ALSO condition its D1 write on the current
 * lease token.
 *
 * In other words:
 *
 * UPDATE result...
 * WHERE investigation_id = ?
 *   AND current_lease_token = ?
 *
 * That final database condition is what prevents
 * stale workers from writing authoritative state.
 *
 * This port establishes lease ownership.
 *
 * The later result/publication persistence layer
 * will enforce ownership again at write time.
 */

/*
 * Export the contract so tests and infrastructure
 * adapters can inspect it.
 */
export const investigationExecutionLeaseContract = Object.freeze({
  requiredMethods: [...requiredMethods],
});
