/*
 * Investigation Execution Repository Port
 *
 * This defines Scout's application contract for
 * durable Methodology execution attempts.
 *
 * It is deliberately separate from:
 *
 * - investigationRepository
 * - investigationExecutionLease
 * - publication/review storage
 *
 *
 * Why?
 *
 * An investigation is the durable request.
 *
 * An execution is one attempt to perform the
 * frozen Methodology against that investigation.
 *
 *
 * Example:
 *
 * investigation
 *     ↓
 * execution attempt 1
 *     ↓
 * worker crashes
 *     ↓
 * lease expires
 *     ↓
 * execution attempt 2
 *
 *
 * We must preserve both attempts rather than
 * silently rewriting attempt 1.
 *
 *
 * IMPORTANT TRUST RULE
 *
 * Execution outcome is not the same thing as a
 * Methodology finding.
 *
 * For example:
 *
 * executionStatus = FAILED
 *
 * does NOT mean:
 *
 * resultStatus = UNKNOWN
 *
 * Operational failure must remain operational
 * failure.
 */

/*
 * ------------------------------------------------
 * Required repository methods
 * ------------------------------------------------
 */

const requiredMethods = [
  "createExecution",
  "getExecution",
  "recordExecutionOutcome",
];

/*
 * ------------------------------------------------
 * Validate repository implementation
 * ------------------------------------------------
 */

export function validateInvestigationExecutionRepository(repository) {
  if (!repository || typeof repository !== "object") {
    return {
      status: "execution_repository_not_ready",

      reason: "execution_repository_required",

      missingMethods: [...requiredMethods],
    };
  }

  const missingMethods = requiredMethods.filter(
    (method) => typeof repository[method] !== "function",
  );

  if (missingMethods.length > 0) {
    return {
      status: "execution_repository_not_ready",

      reason: "execution_repository_methods_missing",

      missingMethods,
    };
  }

  return {
    status: "execution_repository_ready",

    reason: null,

    missingMethods: [],
  };
}

/*
 * =================================================
 * EXECUTION MODEL
 * =================================================
 *
 * A durable execution record should preserve:
 *
 * {
 *   executionId: "exec_...",
 *
 *   investigationId: "inv_...",
 *
 *   leaseToken: "...",
 *
 *   attempt: 1,
 *
 *   executionStatus:
 *     "RUNNING",
 *
 *   startedAt:
 *     "...",
 *
 *   completedAt:
 *     null,
 *
 *   analysisOutcome:
 *     null,
 *
 *   failureReason:
 *     null
 * }
 *
 *
 * executionStatus is operational state.
 *
 * Initial V1 statuses:
 *
 * RUNNING
 * COMPLETE
 * PARTIAL
 * FAILED
 *
 *
 * COMPLETE / PARTIAL / FAILED are execution
 * outcomes.
 *
 * They are NOT automatically equivalent to:
 *
 * PASS
 * CAUTION
 * UNKNOWN
 * N/A
 *
 * Those remain Methodology finding semantics.
 */

/*
 * =================================================
 * CONTRACT
 * =================================================
 */

/*
 * ------------------------------------------------
 * createExecution(input)
 * ------------------------------------------------
 *
 * Creates one immutable execution-attempt identity
 * for the worker that currently owns the execution
 * lease.
 *
 *
 * Expected input:
 *
 * {
 *   executionId:
 *     "exec_...",
 *
 *   investigationId:
 *     "inv_...",
 *
 *   leaseToken:
 *     "opaque-current-lease-token",
 *
 *   attempt:
 *     1,
 *
 *   startedAt:
 *     "2026-09-07T12:00:00.000Z"
 * }
 *
 *
 * Expected success:
 *
 * {
 *   status:
 *     "execution_created",
 *
 *   execution: {
 *     ...
 *   }
 * }
 *
 *
 * IMPORTANT:
 *
 * The D1 implementation must verify that:
 *
 * - the investigation exists
 * - the supplied lease token is the CURRENT lease
 * - the supplied attempt matches the current lease
 * - the lease has not expired or been released
 *
 *
 * A stale worker must NOT be allowed to create a
 * new authoritative execution record.
 *
 *
 * Duplicate creation for the same durable attempt
 * should not silently create another execution.
 */

/*
 * ------------------------------------------------
 * getExecution(executionId)
 * ------------------------------------------------
 *
 * Reads one durable execution attempt.
 *
 *
 * Expected success:
 *
 * {
 *   status:
 *     "execution_found",
 *
 *   execution: {
 *     executionId,
 *     investigationId,
 *     leaseToken,
 *     attempt,
 *     executionStatus,
 *     startedAt,
 *     completedAt,
 *     analysisOutcome,
 *     failureReason
 *   }
 * }
 *
 *
 * Not found:
 *
 * {
 *   status:
 *     "execution_not_found",
 *
 *   execution: null
 * }
 */

/*
 * ------------------------------------------------
 * recordExecutionOutcome(input)
 * ------------------------------------------------
 *
 * Completes or partially completes one execution
 * attempt.
 *
 *
 * Expected input:
 *
 * {
 *   executionId:
 *     "exec_...",
 *
 *   investigationId:
 *     "inv_...",
 *
 *   leaseToken:
 *     "opaque-current-lease-token",
 *
 *   executionStatus:
 *     "COMPLETE",
 *
 *   completedAt:
 *     "2026-09-07T12:03:00.000Z",
 *
 *   analysisOutcome: {
 *     ...
 *   },
 *
 *   failureReason:
 *     null
 * }
 *
 *
 * IMPORTANT:
 *
 * The D1 write MUST succeed only when the supplied
 * lease token is still the CURRENT execution owner.
 *
 *
 * It is not enough to:
 *
 * 1. check lease
 * 2. return to JavaScript
 * 3. update execution
 *
 *
 * because:
 *
 * worker checks lease               ✅
 *        ↓
 * lease expires / ownership changes ⚠️
 *        ↓
 * old worker writes                 ❌
 *
 *
 * Instead the authoritative D1 mutation itself
 * must condition the write on the current lease.
 *
 *
 * Conceptually:
 *
 * UPDATE investigation_executions
 * SET ...
 * WHERE execution_id = ?
 *   AND investigation_id = ?
 *   AND lease_token = ?
 *   AND EXISTS (
 *     SELECT 1
 *     FROM investigation_execution_leases
 *     WHERE investigation_id = ?
 *       AND lease_token = ?
 *       AND released_at IS NULL
 *       AND expires_at > ?
 *   )
 *
 *
 * If that condition no longer matches:
 *
 * {
 *   status:
 *     "execution_outcome_not_recorded",
 *
 *   reason:
 *     "stale_execution_lease"
 * }
 *
 *
 * This is one of Scout's most important
 * stale-worker protections.
 */

/*
 * =================================================
 * ANALYSIS OUTCOME
 * =================================================
 *
 * The analysisOutcome field is the durable output
 * of Methodology execution.
 *
 * It may eventually include:
 *
 * {
 *   executionStatus:
 *     "complete",
 *
 *   resultStatus:
 *     "PASS",
 *
 *   checks: [...],
 *
 *   evidence: [...],
 *
 *   limitations: [...]
 * }
 *
 *
 * But this repository does NOT publish anything.
 *
 * Publication remains a separate later stage:
 *
 * execution
 *      ↓
 * analysis outcome
 *      ↓
 * redaction
 *      ↓
 * canonicalization
 *      ↓
 * fingerprint
 *      ↓
 * publication state
 *      ↓
 * public review
 *
 *
 * Keeping these boundaries separate prevents an
 * execution record from automatically becoming a
 * public claim.
 */

/*
 * =================================================
 * HISTORICAL RECORD RULE
 * =================================================
 *
 * Completed executions should be treated as
 * historical records.
 *
 * If an investigation must be retried:
 *
 * attempt 1 stays preserved
 *        ↓
 * attempt 2 gets a NEW execution record
 *
 * We do not silently overwrite attempt 1.
 */

/*
 * Export the contract so tests and infrastructure
 * adapters can inspect it.
 */

export const investigationExecutionRepositoryContract = Object.freeze({
  requiredMethods: [...requiredMethods],
});
