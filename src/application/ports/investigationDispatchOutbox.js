/*
 * Investigation Dispatch Outbox Port
 *
 * This defines what the Scout application needs
 * from durable dispatch-outbox storage.
 *
 * D1 will implement this contract.
 *
 * The outbox exists because saving an
 * investigation in D1 and sending a Cloudflare
 * Queue message cannot happen in one atomic
 * transaction.
 *
 * Flow:
 *
 * D1 transaction
 *   ├─ investigation
 *   ├─ active review claim
 *   └─ PENDING outbox row
 *
 * Later:
 *
 * PENDING outbox
 *      ↓
 * dispatcher
 *      ↓
 * Cloudflare Queue
 *      ↓
 * DISPATCHED
 *
 * If Queue sending fails, the row stays
 * recoverable and can be retried later.
 */

/*
 * Methods every investigation dispatch-outbox
 * implementation must provide.
 */
const requiredMethods = [
  "getPendingDispatches",
  "markDispatchSucceeded",
  "markDispatchFailed",
];

/*
 * Validate that an outbox adapter satisfies
 * Scout's application contract.
 */
export function validateInvestigationDispatchOutbox(outbox) {
  if (!outbox || typeof outbox !== "object") {
    return {
      status: "dispatch_outbox_not_ready",
      reason: "dispatch_outbox_required",
      missingMethods: requiredMethods,
    };
  }

  const missingMethods = requiredMethods.filter(
    (method) => typeof outbox[method] !== "function",
  );

  if (missingMethods.length > 0) {
    return {
      status: "dispatch_outbox_not_ready",
      reason: "dispatch_outbox_methods_missing",
      missingMethods,
    };
  }

  return {
    status: "dispatch_outbox_ready",
    reason: null,
    missingMethods: [],
  };
}

/*
 * CONTRACT
 *
 * ------------------------------------------------
 * getPendingDispatches(options)
 * ------------------------------------------------
 *
 * Finds outbox rows that are ready to be
 * dispatched.
 *
 * Expected input:
 *
 * {
 *   now: "2026-09-07T09:00:00.000Z",
 *   limit: 25
 * }
 *
 * Expected successful result shape:
 *
 * {
 *   status: "pending_dispatches_found",
 *   dispatches: [
 *     {
 *       outboxId: 1,
 *       investigationId: "inv_...",
 *       eventType:
 *         "INVESTIGATION_REQUESTED",
 *       dispatchState: "PENDING",
 *       attemptCount: 0,
 *       availableAt: "...",
 *       createdAt: "...",
 *       updatedAt: "..."
 *     }
 *   ]
 * }
 *
 * D1 remains authoritative for whether an
 * outbox event is still pending.
 */

/*
 * ------------------------------------------------
 * markDispatchSucceeded(input)
 * ------------------------------------------------
 *
 * Called only AFTER Cloudflare Queue confirms
 * that queue.send(...) completed successfully.
 *
 * Expected input:
 *
 * {
 *   outboxId: 1,
 *   dispatchedAt:
 *     "2026-09-07T09:00:00.000Z",
 *   updatedAt:
 *     "2026-09-07T09:00:00.000Z"
 * }
 *
 * The D1 adapter should:
 *
 * - change dispatch_state to DISPATCHED
 * - increment attempt_count
 * - set dispatched_at
 * - clear last_error
 * - update updated_at
 *
 * We do NOT mark an outbox row DISPATCHED
 * before Queue sending succeeds.
 */

/*
 * ------------------------------------------------
 * markDispatchFailed(input)
 * ------------------------------------------------
 *
 * Called when the Queue send attempt fails.
 *
 * Expected input:
 *
 * {
 *   outboxId: 1,
 *   error: "queue unavailable",
 *   availableAt:
 *     "2026-09-07T09:01:00.000Z",
 *   updatedAt:
 *     "2026-09-07T09:00:00.000Z"
 * }
 *
 * The D1 adapter should:
 *
 * - keep dispatch_state recoverable
 * - increment attempt_count
 * - store a bounded last_error
 * - move available_at forward for retry
 * - update updated_at
 *
 * The dispatcher or scheduled recovery process
 * can later find the row again.
 */

/*
 * Duplicate Queue delivery is possible.
 *
 * That is intentional and expected because:
 *
 * - Cloudflare Queue is at-least-once
 * - D1 and Queue are not one atomic system
 * - a worker can crash after Queue send but
 *   before marking the outbox DISPATCHED
 *
 * Therefore downstream Queue consumption must
 * eventually be idempotent.
 *
 * This port does NOT promise exactly-once
 * delivery.
 */

/*
 * Export the contract so infrastructure
 * adapters and tests can inspect it.
 */
export const investigationDispatchOutboxContract = Object.freeze({
  requiredMethods: [...requiredMethods],
});
