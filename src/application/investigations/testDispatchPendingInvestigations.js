import { dispatchPendingInvestigations } from "./dispatchPendingInvestigations.js";

/*
 * ------------------------------------------------
 * TEST FIXTURE TIME
 * ------------------------------------------------
 */

const now = "2026-09-07T09:30:00.000Z";

/*
 * ------------------------------------------------
 * TEST 1
 * Missing dependencies should be rejected.
 * ------------------------------------------------
 */

console.log("\n===== MISSING DEPENDENCIES =====");

const missingDependenciesResult = await dispatchPendingInvestigations({
  now,
});

console.dir(missingDependenciesResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 2
 * Empty PENDING outbox.
 *
 * A sweep with no work should complete cleanly.
 * ------------------------------------------------
 */

const emptyOutbox = {
  async getPendingDispatches() {
    return {
      status: "pending_dispatches_found",

      reason: null,

      dispatches: [],

      count: 0,
    };
  },

  async markDispatchSucceeded() {
    throw new Error("Should not be called.");
  },

  async markDispatchFailed() {
    throw new Error("Should not be called.");
  },
};

const emptyQueue = {
  async sendInvestigation() {
    throw new Error("Should not be called.");
  },
};

console.log("\n===== EMPTY DISPATCH SWEEP =====");

const emptyResult = await dispatchPendingInvestigations({
  outbox: emptyOutbox,

  queue: emptyQueue,

  now,
});

console.dir(emptyResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Mixed dispatch sweep.
 *
 * Investigation 1:
 * Queue succeeds.
 *
 * Investigation 2:
 * Queue fails and must be scheduled for retry.
 * ------------------------------------------------
 */

const pendingDispatches = [
  {
    outboxId: 1,

    investigationId: "inv_dispatch_001",

    eventType: "INVESTIGATION_REQUESTED",

    dispatchState: "PENDING",

    attemptCount: 0,

    availableAt: "2026-09-07T09:00:00.000Z",
  },

  {
    outboxId: 2,

    investigationId: "inv_dispatch_002",

    eventType: "INVESTIGATION_REQUESTED",

    dispatchState: "PENDING",

    attemptCount: 1,

    availableAt: "2026-09-07T09:00:00.000Z",
  },
];

const succeededUpdates = [];

const failedUpdates = [];

const testOutbox = {
  async getPendingDispatches() {
    return {
      status: "pending_dispatches_found",

      reason: null,

      dispatches: pendingDispatches,

      count: pendingDispatches.length,
    };
  },

  async markDispatchSucceeded(input) {
    succeededUpdates.push(input);

    return {
      status: "dispatch_succeeded",

      reason: null,

      outboxId: input.outboxId,

      dispatchState: "DISPATCHED",

      lifecycleState: "QUEUED",
    };
  },

  async markDispatchFailed(input) {
    failedUpdates.push(input);

    return {
      status: "dispatch_retry_scheduled",

      reason: null,

      outboxId: input.outboxId,

      dispatchState: "PENDING",

      availableAt: input.availableAt,
    };
  },
};

const sentMessages = [];

const testQueue = {
  async sendInvestigation(message) {
    sentMessages.push(message);

    if (message.investigationId === "inv_dispatch_001") {
      return {
        status: "investigation_queued",

        reason: null,

        investigationId: message.investigationId,

        messageVersion: 1,
      };
    }

    return {
      status: "queue_send_failed",

      reason: "cloudflare_queue_send_failed",

      investigationId: message.investigationId,

      error: "simulated Queue failure",
    };
  },
};

console.log("\n===== MIXED DISPATCH SWEEP =====");

const mixedResult = await dispatchPendingInvestigations({
  outbox: testOutbox,

  queue: testQueue,

  now,

  /*
   * Use one minute as the base retry delay.
   */
  retryDelayMs: 60 * 1000,
});

console.dir(mixedResult, {
  depth: null,
});

console.log("\n===== SENT QUEUE MESSAGES =====");

console.dir(sentMessages, {
  depth: null,
});

console.log("\n===== SUCCESSFUL D1 UPDATES =====");

console.dir(succeededUpdates, {
  depth: null,
});

console.log("\n===== FAILED D1 UPDATES =====");

console.dir(failedUpdates, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 4
 * Queue succeeds but durable success update fails.
 *
 * This is the important:
 *
 * Queue accepted ✅
 * D1 state update ❌
 *
 * case.
 * ------------------------------------------------
 */

const stateFailureOutbox = {
  async getPendingDispatches() {
    return {
      status: "pending_dispatches_found",

      reason: null,

      dispatches: [
        {
          outboxId: 3,

          investigationId: "inv_state_failure",

          attemptCount: 0,
        },
      ],

      count: 1,
    };
  },

  async markDispatchSucceeded(input) {
    return {
      status: "dispatch_success_not_recorded",

      reason: "d1_dispatch_success_update_failed",

      outboxId: input.outboxId,
    };
  },

  async markDispatchFailed() {
    throw new Error("Should not be called.");
  },
};

const successfulQueue = {
  async sendInvestigation(message) {
    return {
      status: "investigation_queued",

      reason: null,

      investigationId: message.investigationId,

      messageVersion: 1,
    };
  },
};

console.log("\n===== QUEUE SENT / STATE UPDATE FAILED =====");

const stateFailureResult = await dispatchPendingInvestigations({
  outbox: stateFailureOutbox,

  queue: successfulQueue,

  now,
});

console.dir(stateFailureResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const retryUpdate = failedUpdates[0];

const tests = {
  missingDependenciesRejected:
    missingDependenciesResult.status === "dispatch_not_ready",

  emptySweepCompleted:
    emptyResult.status === "dispatch_sweep_complete" &&
    emptyResult.checked === 0,

  mixedSweepCompleted: mixedResult.status === "dispatch_sweep_complete",

  twoDispatchesChecked: mixedResult.checked === 2,

  oneDispatchSucceeded: mixedResult.dispatched === 1,

  oneRetryScheduled: mixedResult.retriesScheduled === 1,

  noMixedStateErrors: mixedResult.stateErrors === 0,

  twoQueueMessagesSent: sentMessages.length === 2,

  durableIdOnlySent: sentMessages.every(
    (message) =>
      Object.keys(message).length === 1 &&
      typeof message.investigationId === "string",
  ),

  successUpdateRecorded:
    succeededUpdates.length === 1 &&
    succeededUpdates[0].outboxId === 1 &&
    succeededUpdates[0].dispatchedAt === now,

  failureUpdateRecorded:
    failedUpdates.length === 1 && retryUpdate.outboxId === 2,

  retryAttemptUsesBackoff:
    retryUpdate.availableAt === "2026-09-07T09:32:00.000Z",

  stateFailureSurfaced: stateFailureResult.status === "dispatch_sweep_partial",

  stateFailureCounted: stateFailureResult.stateErrors === 1,

  queueSentStateFailureExplicit:
    stateFailureResult.results[0]?.status === "queue_sent_state_not_recorded",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== DISPATCHER TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Pending investigation dispatcher test failed.");
}

console.log("\n===== DISPATCHER TEST PASSED =====");
