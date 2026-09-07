/*
 * Handle Cloudflare Scheduled Recovery
 *
 * Cloudflare infrastructure composition boundary
 * for Scout's scheduled recovery sweep.
 *
 *
 * One scheduled run performs TWO independent
 * recovery jobs:
 *
 * 1. Pending dispatch recovery
 *
 *    CREATED investigation
 *          ↓
 *    PENDING outbox
 *          ↓
 *    Queue send / retry
 *
 *
 * 2. Stranded execution recovery
 *
 *    PREPARING_REVIEW
 *          ↓
 *    lease missing / released / expired
 *          ↓
 *    no terminal execution
 *          ↓
 *    Queue re-send
 *
 *
 * IMPORTANT:
 *
 * This file contains:
 *
 * - no SQL
 * - no Methodology logic
 * - no lease mutation logic
 * - no publication logic
 *
 * It only composes already-tested adapters and
 * application services.
 */

import { dispatchPendingInvestigations } from "../../../application/investigations/dispatchPendingInvestigations.js";

import { recoverStrandedInvestigations } from "../../../application/investigations/recoverStrandedInvestigations.js";

import { createD1InvestigationDispatchOutbox } from "../d1/d1InvestigationDispatchOutbox.js";

import { createD1InvestigationExecutionRecovery } from "../d1/d1InvestigationExecutionRecovery.js";

import { createCloudflareInvestigationQueue } from "../queue/cloudflareInvestigationQueue.js";

/*
 * ------------------------------------------------
 * Constants
 * ------------------------------------------------
 */

const DEFAULT_DISPATCH_LIMIT = 25;

const DEFAULT_RECOVERY_LIMIT = 25;

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

/*
 * ------------------------------------------------
 * handleCloudflareScheduledRecovery
 * ------------------------------------------------
 *
 * Runtime inputs:
 *
 * {
 *   db,
 *   queueBinding,
 *   now,
 *   dispatchLimit,
 *   recoveryLimit
 * }
 *
 *
 * Test seams:
 *
 * {
 *   dispatchOutboxFactory,
 *   executionRecoveryFactory,
 *   queueFactory,
 *   dispatchService,
 *   strandedRecoveryService
 * }
 */

export async function handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now = new Date().toISOString(),

    dispatchLimit = DEFAULT_DISPATCH_LIMIT,

    recoveryLimit = DEFAULT_RECOVERY_LIMIT,
  } = {},

  {
    dispatchOutboxFactory = createD1InvestigationDispatchOutbox,

    executionRecoveryFactory = createD1InvestigationExecutionRecovery,

    queueFactory = createCloudflareInvestigationQueue,

    dispatchService = dispatchPendingInvestigations,

    strandedRecoveryService = recoverStrandedInvestigations,
  } = {},
) {
  /*
   * =================================================
   * Validate composition functions
   * =================================================
   */

  if (
    typeof dispatchOutboxFactory !== "function" ||
    typeof executionRecoveryFactory !== "function" ||
    typeof queueFactory !== "function" ||
    typeof dispatchService !== "function" ||
    typeof strandedRecoveryService !== "function"
  ) {
    return {
      status: "scheduled_recovery_not_ready",

      reason: "scheduled_recovery_dependencies_required",

      dispatchResult: null,

      executionRecoveryResult: null,
    };
  }

  /*
   * =================================================
   * Validate runtime timestamp
   * =================================================
   */

  if (!isValidTimestamp(now)) {
    return {
      status: "scheduled_recovery_not_ready",

      reason: "valid_now_timestamp_required",

      dispatchResult: null,

      executionRecoveryResult: null,
    };
  }

  const normalizedNow = now.trim();

  /*
   * =================================================
   * Construct Cloudflare infrastructure adapters
   * =================================================
   */

  let outbox;

  let executionRecovery;

  let queue;

  try {
    outbox = dispatchOutboxFactory(db);

    executionRecovery = executionRecoveryFactory(db);

    queue = queueFactory(queueBinding);
  } catch {
    /*
     * Fail closed.
     *
     * Do not expose arbitrary adapter exception text.
     */

    return {
      status: "scheduled_recovery_not_ready",

      reason: "scheduled_recovery_adapter_composition_failed",

      dispatchResult: null,

      executionRecoveryResult: null,
    };
  }

  /*
   * =================================================
   * Recovery job 1
   *
   * Pending dispatch outbox
   * =================================================
   *
   * This repairs work that was created durably but
   * was never successfully dispatched to Queue.
   */

  let dispatchResult;

  try {
    dispatchResult = await dispatchService({
      outbox,

      queue,

      now: normalizedNow,

      limit: dispatchLimit,
    });
  } catch {
    dispatchResult = {
      status: "dispatch_sweep_failed",

      reason: "scheduled_dispatch_sweep_threw",

      checked: 0,

      dispatched: 0,

      retriesScheduled: 0,

      stateErrors: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Recovery job 2
   *
   * Stranded execution recovery
   * =================================================
   *
   * IMPORTANT:
   *
   * Run this even if dispatch recovery failed.
   *
   * The two recovery paths repair different durable
   * failure modes and should not block one another.
   */

  let executionRecoveryResult;

  try {
    executionRecoveryResult = await strandedRecoveryService({
      recovery: executionRecovery,

      queue,

      now: normalizedNow,

      limit: recoveryLimit,
    });
  } catch {
    executionRecoveryResult = {
      status: "recovery_sweep_failed",

      reason: "scheduled_execution_recovery_sweep_threw",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Classify each scheduled job
   * =================================================
   */

  const dispatchSucceeded =
    dispatchResult?.status === "dispatch_sweep_complete";

  const dispatchPartial = dispatchResult?.status === "dispatch_sweep_partial";

  const executionRecoverySucceeded =
    executionRecoveryResult?.status === "recovery_sweep_complete";

  const executionRecoveryPartial =
    executionRecoveryResult?.status === "recovery_sweep_partial";

  /*
   * A partial result means the sweep ran but one or
   * more individual records still need later retry.
   *
   * A failed result means the sweep itself could not
   * complete correctly.
   */

  const dispatchFailed = !dispatchSucceeded && !dispatchPartial;

  const executionRecoveryFailed =
    !executionRecoverySucceeded && !executionRecoveryPartial;

  /*
   * =================================================
   * Aggregate scheduled recovery
   * =================================================
   */

  let status;

  let reason;

  if (
    !dispatchFailed &&
    !executionRecoveryFailed &&
    !dispatchPartial &&
    !executionRecoveryPartial
  ) {
    status = "scheduled_recovery_complete";

    reason = null;
  } else if (dispatchFailed && executionRecoveryFailed) {
    status = "scheduled_recovery_failed";

    reason = "both_recovery_sweeps_failed";
  } else {
    status = "scheduled_recovery_partial";

    reason = "one_or_more_recovery_sweeps_incomplete";
  }

  /*
   * =================================================
   * Bounded summary
   * =================================================
   *
   * Do not copy raw evidence, Queue bodies, source
   * content, or persisted Methodology output here.
   */

  return {
    status,

    reason,

    now: normalizedNow,

    dispatch: {
      status: dispatchResult?.status ?? null,

      reason: dispatchResult?.reason ?? null,

      checked: dispatchResult?.checked ?? 0,

      dispatched: dispatchResult?.dispatched ?? 0,

      retriesScheduled: dispatchResult?.retriesScheduled ?? 0,

      stateErrors: dispatchResult?.stateErrors ?? 0,
    },

    executionRecovery: {
      status: executionRecoveryResult?.status ?? null,

      reason: executionRecoveryResult?.reason ?? null,

      checked: executionRecoveryResult?.checked ?? 0,

      requeued: executionRecoveryResult?.requeued ?? 0,

      queueFailures: executionRecoveryResult?.queueFailures ?? 0,

      invalidRecords: executionRecoveryResult?.invalidRecords ?? 0,
    },

    /*
     * Keep full application results available to
     * the immediate Worker caller for testing and
     * bounded operational handling.
     *
     * The Worker should log only the summaries above.
     */
    dispatchResult,

    executionRecoveryResult,
  };
}
