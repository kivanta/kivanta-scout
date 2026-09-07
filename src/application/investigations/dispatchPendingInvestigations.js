/*
 * Dispatch Pending Investigations
 *
 * Application service that connects:
 *
 * D1 dispatch outbox
 *        ↓
 * Cloudflare Queue
 *
 * This file does NOT know anything about
 * Cloudflare bindings directly.
 *
 * It works only through Scout's application
 * ports:
 *
 * - investigationDispatchOutbox
 * - investigationQueue
 *
 * D1 remains authoritative.
 */

import { validateInvestigationDispatchOutbox } from "../ports/investigationDispatchOutbox.js";

import { validateInvestigationQueue } from "../ports/investigationQueue.js";

/*
 * Default retry behavior.
 *
 * Failed Queue sends are retried later with
 * a small bounded exponential delay:
 *
 * attempt 1 → 1 minute
 * attempt 2 → 2 minutes
 * attempt 3 → 4 minutes
 * attempt 4 → 8 minutes
 * later     → max 15 minutes
 */
const DEFAULT_RETRY_DELAY_MS = 60 * 1000;

const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

/*
 * Calculate the next durable retry time.
 *
 * attemptCount is the number already stored
 * before this new failed attempt is recorded.
 */
function calculateRetryAvailableAt({
  now,
  attemptCount,
  baseRetryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  const safeAttemptCount =
    Number.isInteger(attemptCount) && attemptCount >= 0 ? attemptCount : 0;

  const exponentialDelay =
    baseRetryDelayMs * 2 ** Math.min(safeAttemptCount, 4);

  const boundedDelay = Math.min(exponentialDelay, MAX_RETRY_DELAY_MS);

  return new Date(Date.parse(now) + boundedDelay).toISOString();
}

/*
 * ------------------------------------------------
 * dispatchPendingInvestigations
 * ------------------------------------------------
 *
 * Runs one bounded dispatch sweep.
 *
 * Expected dependencies:
 *
 * {
 *   outbox,
 *   queue
 * }
 *
 * Optional execution controls:
 *
 * {
 *   now,
 *   limit,
 *   retryDelayMs
 * }
 *
 * The dispatcher:
 *
 * 1. reads PENDING outbox rows
 * 2. sends each investigation ID to Queue
 * 3. records success or retry state in D1
 */
export async function dispatchPendingInvestigations({
  outbox,
  queue,
  now = new Date().toISOString(),
  limit = 25,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
  /*
   * ------------------------------------------------
   * Validate application dependencies.
   * ------------------------------------------------
   */

  const outboxValidation = validateInvestigationDispatchOutbox(outbox);

  if (outboxValidation.status !== "dispatch_outbox_ready") {
    return {
      status: "dispatch_not_ready",

      reason: "dispatch_outbox_not_ready",

      details: outboxValidation,

      results: [],
    };
  }

  const queueValidation = validateInvestigationQueue(queue);

  if (queueValidation.status !== "queue_ready") {
    return {
      status: "dispatch_not_ready",

      reason: "investigation_queue_not_ready",

      details: queueValidation,

      results: [],
    };
  }

  /*
   * Validate the dispatcher timestamp.
   */
  if (typeof now !== "string" || Number.isNaN(Date.parse(now))) {
    return {
      status: "dispatch_not_ready",

      reason: "valid_now_timestamp_required",

      results: [],
    };
  }

  /*
   * ------------------------------------------------
   * Load durable PENDING work from D1.
   * ------------------------------------------------
   */

  const pendingResult = await outbox.getPendingDispatches({
    now,
    limit,
  });

  if (pendingResult.status !== "pending_dispatches_found") {
    return {
      status: "dispatch_sweep_failed",

      reason: "pending_dispatch_query_failed",

      pendingResult,

      results: [],
    };
  }

  const dispatches = Array.isArray(pendingResult.dispatches)
    ? pendingResult.dispatches
    : [];

  /*
   * Nothing to send is a successful sweep.
   */
  if (dispatches.length === 0) {
    return {
      status: "dispatch_sweep_complete",

      reason: null,

      checked: 0,
      dispatched: 0,
      retriesScheduled: 0,
      stateErrors: 0,

      results: [],
    };
  }

  /*
   * ------------------------------------------------
   * Process each durable outbox event.
   * ------------------------------------------------
   *
   * We process sequentially for V1.
   *
   * This keeps behavior simple, bounded,
   * and easier to reason about.
   */
  const results = [];

  for (const dispatch of dispatches) {
    const { outboxId, investigationId, attemptCount = 0 } = dispatch;

    /*
     * Send only the durable investigation ID.
     *
     * The future Queue consumer will reload
     * the complete frozen target from D1.
     */
    const queueResult = await queue.sendInvestigation({
      investigationId,
    });

    /*
     * ==============================================
     * QUEUE SEND SUCCEEDED
     * ==============================================
     */
    if (queueResult.status === "investigation_queued") {
      /*
       * Only now do we mark:
       *
       * outbox       → DISPATCHED
       * investigation → QUEUED
       */
      const durableResult = await outbox.markDispatchSucceeded({
        outboxId,

        dispatchedAt: now,

        updatedAt: now,
      });

      if (durableResult.status === "dispatch_succeeded") {
        results.push({
          status: "dispatch_recorded",

          reason: null,

          outboxId,
          investigationId,

          queueResult,
          durableResult,
        });

        continue;
      }

      /*
       * IMPORTANT:
       *
       * Queue accepted the message, but D1 could
       * not record DISPATCHED.
       *
       * We MUST NOT pretend nothing happened.
       *
       * The PENDING outbox row may be retried,
       * producing another Queue delivery.
       *
       * That is why the future Queue consumer
       * must be idempotent.
       */
      results.push({
        status: "queue_sent_state_not_recorded",

        reason: "durable_dispatch_success_update_failed",

        outboxId,
        investigationId,

        queueResult,
        durableResult,
      });

      continue;
    }

    /*
     * ==============================================
     * QUEUE SEND FAILED
     * ==============================================
     *
     * Keep the row PENDING and move its
     * available_at time forward.
     */

    const retryAvailableAt = calculateRetryAvailableAt({
      now,
      attemptCount,
      baseRetryDelayMs: retryDelayMs,
    });

    const failureMessage =
      queueResult.error ?? queueResult.reason ?? "queue send failed";

    const durableFailureResult = await outbox.markDispatchFailed({
      outboxId,

      error: failureMessage,

      availableAt: retryAvailableAt,

      updatedAt: now,
    });

    if (durableFailureResult.status === "dispatch_retry_scheduled") {
      results.push({
        status: "dispatch_retry_scheduled",

        reason: queueResult.reason ?? "queue_send_failed",

        outboxId,
        investigationId,

        retryAvailableAt,

        queueResult,
        durableResult: durableFailureResult,
      });

      continue;
    }

    /*
     * Queue failed AND D1 could not persist the
     * retry state.
     *
     * We surface this explicitly.
     */
    results.push({
      status: "dispatch_failure_state_not_recorded",

      reason: "durable_dispatch_failure_update_failed",

      outboxId,
      investigationId,

      retryAvailableAt,

      queueResult,
      durableResult: durableFailureResult,
    });
  }

  /*
   * ------------------------------------------------
   * Aggregate the sweep.
   * ------------------------------------------------
   */

  const dispatched = results.filter(
    (result) => result.status === "dispatch_recorded",
  ).length;

  const retriesScheduled = results.filter(
    (result) => result.status === "dispatch_retry_scheduled",
  ).length;

  const stateErrors = results.filter(
    (result) =>
      result.status === "queue_sent_state_not_recorded" ||
      result.status === "dispatch_failure_state_not_recorded",
  ).length;

  /*
   * The sweep itself completed even when an
   * individual Queue send failed, provided the
   * failure was durably scheduled for retry.
   *
   * State recording failures are surfaced
   * separately because they require recovery.
   */
  return {
    status:
      stateErrors > 0 ? "dispatch_sweep_partial" : "dispatch_sweep_complete",

    reason: stateErrors > 0 ? "dispatch_state_errors_present" : null,

    checked: dispatches.length,

    dispatched,

    retriesScheduled,

    stateErrors,

    results,
  };
}
