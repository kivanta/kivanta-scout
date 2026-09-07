/*
 * Handle Cloudflare Scheduled Recovery
 *
 * Cloudflare infrastructure composition boundary
 * for Scout's complete scheduled recovery system.
 *
 *
 * One scheduled run performs THREE independent
 * recovery jobs:
 *
 * 1. Pending initial dispatch recovery
 *
 *    CREATED
 *      +
 *    PENDING outbox
 *      ↓
 *    Queue dispatch / retry
 *
 *
 * 2. Stale QUEUED recovery
 *
 *    QUEUED
 *      +
 *    DISPATCHED outbox
 *      +
 *    stale recovery clock
 *      +
 *    no usable lease
 *      +
 *    no terminal execution
 *      ↓
 *    Queue re-send
 *
 *
 * 3. Stranded execution recovery
 *
 *    PREPARING_REVIEW
 *      +
 *    missing / released / expired lease
 *      +
 *    no terminal execution
 *      ↓
 *    Queue re-send
 *
 *
 * IMPORTANT:
 *
 * Each recovery job runs independently.
 *
 * Failure in one job must not prevent the
 * remaining recovery jobs from running.
 *
 *
 * This file contains:
 *
 * - no Methodology logic
 * - no direct SQL
 * - no publication logic
 * - no execution ownership logic
 *
 * It only composes already-tested application
 * services and Cloudflare adapters.
 */

import { dispatchPendingInvestigations } from "../../../application/investigations/dispatchPendingInvestigations.js";

import { recoverStaleQueuedInvestigations } from "../../../application/investigations/recoverStaleQueuedInvestigations.js";

import { recoverStrandedInvestigations } from "../../../application/investigations/recoverStrandedInvestigations.js";

import { createD1InvestigationDispatchOutbox } from "../d1/d1InvestigationDispatchOutbox.js";

import { createD1InvestigationQueuedRecovery } from "../d1/d1InvestigationQueuedRecovery.js";

import { createD1InvestigationExecutionRecovery } from "../d1/d1InvestigationExecutionRecovery.js";

import { createCloudflareInvestigationQueue } from "../queue/cloudflareInvestigationQueue.js";

/*
 * =================================================
 * Constants
 * =================================================
 */

const DEFAULT_DISPATCH_LIMIT = 25;

const DEFAULT_QUEUED_RECOVERY_LIMIT = 25;

const DEFAULT_EXECUTION_RECOVERY_LIMIT = 25;

/*
 * Stale QUEUED grace period:
 *
 * 30 minutes
 */
const DEFAULT_QUEUED_STALE_GRACE_MS = 30 * 60 * 1000;

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

/*
 * =================================================
 * handleCloudflareScheduledRecovery
 * =================================================
 *
 * Runtime inputs:
 *
 * {
 *   db,
 *   queueBinding,
 *   now,
 *
 *   dispatchLimit,
 *
 *   queuedRecoveryLimit,
 *   queuedStaleGraceMs,
 *
 *   recoveryLimit
 * }
 *
 *
 * recoveryLimit is retained for the existing
 * PREPARING_REVIEW execution-recovery sweep.
 *
 *
 * Test seams:
 *
 * {
 *   dispatchOutboxFactory,
 *   queuedRecoveryFactory,
 *   executionRecoveryFactory,
 *   queueFactory,
 *
 *   dispatchService,
 *   staleQueuedRecoveryService,
 *   strandedRecoveryService
 * }
 */

export async function handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now = new Date().toISOString(),

    dispatchLimit = DEFAULT_DISPATCH_LIMIT,

    queuedRecoveryLimit = DEFAULT_QUEUED_RECOVERY_LIMIT,

    queuedStaleGraceMs = DEFAULT_QUEUED_STALE_GRACE_MS,

    recoveryLimit = DEFAULT_EXECUTION_RECOVERY_LIMIT,
  } = {},

  {
    dispatchOutboxFactory = createD1InvestigationDispatchOutbox,

    queuedRecoveryFactory = createD1InvestigationQueuedRecovery,

    executionRecoveryFactory = createD1InvestigationExecutionRecovery,

    queueFactory = createCloudflareInvestigationQueue,

    dispatchService = dispatchPendingInvestigations,

    staleQueuedRecoveryService = recoverStaleQueuedInvestigations,

    strandedRecoveryService = recoverStrandedInvestigations,
  } = {},
) {
  /*
   * =================================================
   * Validate composition dependencies
   * =================================================
   */

  if (
    typeof dispatchOutboxFactory !== "function" ||
    typeof queuedRecoveryFactory !== "function" ||
    typeof executionRecoveryFactory !== "function" ||
    typeof queueFactory !== "function" ||
    typeof dispatchService !== "function" ||
    typeof staleQueuedRecoveryService !== "function" ||
    typeof strandedRecoveryService !== "function"
  ) {
    return {
      status: "scheduled_recovery_not_ready",

      reason: "scheduled_recovery_dependencies_required",

      dispatchResult: null,

      queuedRecoveryResult: null,

      executionRecoveryResult: null,
    };
  }

  /*
   * =================================================
   * Validate scheduled timestamp
   * =================================================
   */

  if (!isValidTimestamp(now)) {
    return {
      status: "scheduled_recovery_not_ready",

      reason: "valid_now_timestamp_required",

      dispatchResult: null,

      queuedRecoveryResult: null,

      executionRecoveryResult: null,
    };
  }

  const normalizedNow = now.trim();

  /*
   * =================================================
   * Construct Cloudflare adapters
   * =================================================
   */

  let outbox;

  let queuedRecovery;

  let executionRecovery;

  let queue;

  try {
    outbox = dispatchOutboxFactory(db);

    queuedRecovery = queuedRecoveryFactory(db);

    executionRecovery = executionRecoveryFactory(db);

    queue = queueFactory(queueBinding);
  } catch {
    /*
     * Do not expose arbitrary infrastructure
     * exception text through this boundary.
     */

    return {
      status: "scheduled_recovery_not_ready",

      reason: "scheduled_recovery_adapter_composition_failed",

      dispatchResult: null,

      queuedRecoveryResult: null,

      executionRecoveryResult: null,
    };
  }

  /*
   * =================================================
   * JOB 1
   *
   * Pending initial dispatch recovery
   * =================================================
   *
   * Repairs:
   *
   * CREATED + PENDING outbox
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
   * JOB 2
   *
   * Stale QUEUED recovery
   * =================================================
   *
   * Run even if JOB 1 failed.
   *
   * Repairs work whose original Queue delivery may
   * have disappeared before PREPARING_REVIEW.
   */

  let queuedRecoveryResult;

  try {
    queuedRecoveryResult = await staleQueuedRecoveryService({
      queuedRecovery,

      queue,

      now: normalizedNow,

      staleGraceMs: queuedStaleGraceMs,

      limit: queuedRecoveryLimit,
    });
  } catch {
    queuedRecoveryResult = {
      status: "stale_queued_recovery_failed",

      reason: "scheduled_stale_queued_recovery_sweep_threw",

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
   * JOB 3
   *
   * Stranded PREPARING_REVIEW recovery
   * =================================================
   *
   * Run even if JOB 1 or JOB 2 failed.
   *
   * Repairs work that had already started execution
   * preparation but lost ownership.
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
   * Classify JOB 1
   * =================================================
   */

  const dispatchSucceeded =
    dispatchResult?.status === "dispatch_sweep_complete";

  const dispatchPartial = dispatchResult?.status === "dispatch_sweep_partial";

  const dispatchFailed = !dispatchSucceeded && !dispatchPartial;

  /*
   * =================================================
   * Classify JOB 2
   * =================================================
   */

  const queuedRecoverySucceeded =
    queuedRecoveryResult?.status === "stale_queued_recovery_complete";

  const queuedRecoveryPartial =
    queuedRecoveryResult?.status === "stale_queued_recovery_partial";

  const queuedRecoveryFailed =
    !queuedRecoverySucceeded && !queuedRecoveryPartial;

  /*
   * =================================================
   * Classify JOB 3
   * =================================================
   */

  const executionRecoverySucceeded =
    executionRecoveryResult?.status === "recovery_sweep_complete";

  const executionRecoveryPartial =
    executionRecoveryResult?.status === "recovery_sweep_partial";

  const executionRecoveryFailed =
    !executionRecoverySucceeded && !executionRecoveryPartial;

  /*
   * =================================================
   * Aggregate scheduled recovery
   * =================================================
   *
   * COMPLETE:
   *
   * all three jobs completed without partial work.
   *
   *
   * FAILED:
   *
   * all three jobs failed at the sweep level.
   *
   *
   * PARTIAL:
   *
   * every other combination.
   */

  let status;

  let reason;

  if (
    dispatchSucceeded &&
    queuedRecoverySucceeded &&
    executionRecoverySucceeded
  ) {
    status = "scheduled_recovery_complete";

    reason = null;
  } else if (
    dispatchFailed &&
    queuedRecoveryFailed &&
    executionRecoveryFailed
  ) {
    status = "scheduled_recovery_failed";

    reason = "all_recovery_sweeps_failed";
  } else {
    status = "scheduled_recovery_partial";

    reason = "one_or_more_recovery_sweeps_incomplete";
  }

  /*
   * =================================================
   * Bounded operational summary
   * =================================================
   *
   * No Queue bodies.
   * No source evidence.
   * No Methodology output.
   * No user-provided content.
   */

  return {
    status,

    reason,

    now: normalizedNow,

    /*
     * ---------------------------------------------
     * Initial dispatch summary
     * ---------------------------------------------
     */

    dispatch: {
      status: dispatchResult?.status ?? null,

      reason: dispatchResult?.reason ?? null,

      checked: dispatchResult?.checked ?? 0,

      dispatched: dispatchResult?.dispatched ?? 0,

      retriesScheduled: dispatchResult?.retriesScheduled ?? 0,

      stateErrors: dispatchResult?.stateErrors ?? 0,
    },

    /*
     * ---------------------------------------------
     * Stale QUEUED summary
     * ---------------------------------------------
     */

    queuedRecovery: {
      status: queuedRecoveryResult?.status ?? null,

      reason: queuedRecoveryResult?.reason ?? null,

      checked: queuedRecoveryResult?.checked ?? 0,

      requeued: queuedRecoveryResult?.requeued ?? 0,

      queueFailures: queuedRecoveryResult?.queueFailures ?? 0,

      stateFailures: queuedRecoveryResult?.stateFailures ?? 0,

      invalidRecords: queuedRecoveryResult?.invalidRecords ?? 0,

      staleBefore: queuedRecoveryResult?.staleBefore ?? null,
    },

    /*
     * ---------------------------------------------
     * PREPARING_REVIEW execution summary
     * ---------------------------------------------
     */

    executionRecovery: {
      status: executionRecoveryResult?.status ?? null,

      reason: executionRecoveryResult?.reason ?? null,

      checked: executionRecoveryResult?.checked ?? 0,

      requeued: executionRecoveryResult?.requeued ?? 0,

      queueFailures: executionRecoveryResult?.queueFailures ?? 0,

      invalidRecords: executionRecoveryResult?.invalidRecords ?? 0,
    },

    /*
     * Full immediate application results remain
     * available to the Worker/test boundary.
     *
     * Worker logging should use only bounded
     * summaries above.
     */

    dispatchResult,

    queuedRecoveryResult,

    executionRecoveryResult,
  };
}
