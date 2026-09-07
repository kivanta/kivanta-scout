/*
 * Handle Cloudflare Scheduled Recovery Test
 *
 * Tests:
 *
 *   handleCloudflareScheduledRecovery()
 *
 *
 * We verify:
 *
 * 1. missing composition dependency is rejected
 * 2. invalid timestamp is rejected
 * 3. adapter construction failure is rejected
 *
 * Successful composition:
 *
 * 4. D1 binding reaches outbox factory
 * 5. D1 binding reaches execution-recovery factory
 * 6. Queue binding reaches Queue factory
 * 7. pending-dispatch service receives real adapters
 * 8. stranded-recovery service receives real adapters
 * 9. timestamp is forwarded
 * 10. dispatch limit is forwarded
 * 11. recovery limit is forwarded
 * 12. both successful sweeps → scheduled_recovery_complete
 *
 * Independence / failure handling:
 *
 * 13. dispatch throw does not stop execution recovery
 * 14. execution recovery throw does not erase dispatch result
 * 15. dispatch partial → scheduled_recovery_partial
 * 16. execution recovery partial → scheduled_recovery_partial
 * 17. one failed sweep → scheduled_recovery_partial
 * 18. both failed sweeps → scheduled_recovery_failed
 *
 * Summary:
 *
 * 19. bounded dispatch counters are preserved
 * 20. bounded recovery counters are preserved
 * 21. full immediate results remain available
 */

import assert from "node:assert/strict";

import { handleCloudflareScheduledRecovery } from "./handleCloudflareScheduledRecovery.js";

/*
 * =================================================
 * SHARED FIXTURES
 * =================================================
 */

const NOW = "2026-09-07T18:45:00.000Z";

const db = {
  fixture: "db",
};

const queueBinding = {
  fixture: "queueBinding",
};

const outbox = {
  fixture: "outbox",
};

const executionRecovery = {
  fixture: "executionRecovery",
};

const queue = {
  fixture: "queue",
};

/*
 * ------------------------------------------------
 * Default successful application results
 * ------------------------------------------------
 */

function createDispatchSuccess({
  checked = 2,

  dispatched = 1,

  retriesScheduled = 1,

  stateErrors = 0,
} = {}) {
  return {
    status: "dispatch_sweep_complete",

    reason: null,

    checked,

    dispatched,

    retriesScheduled,

    stateErrors,

    results: [],
  };
}

function createRecoverySuccess({
  checked = 3,

  requeued = 2,

  queueFailures = 1,

  invalidRecords = 0,
} = {}) {
  /*
   * For testing the composition boundary,
   * we allow these counters independently of
   * the status.
   *
   * The application service itself already has
   * its own detailed tests.
   */

  return {
    status: "recovery_sweep_complete",

    reason: null,

    checked,

    requeued,

    queueFailures,

    invalidRecords,

    results: [],
  };
}

/*
 * =================================================
 * TEST 1
 * Missing composition dependency
 * =================================================
 */

console.log("\n===== MISSING COMPOSITION DEPENDENCY =====");

const missingDependencyResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchService: null,
  },
);

console.dir(missingDependencyResult, {
  depth: null,
});

assert.equal(missingDependencyResult.status, "scheduled_recovery_not_ready");

assert.equal(
  missingDependencyResult.reason,
  "scheduled_recovery_dependencies_required",
);

/*
 * =================================================
 * TEST 2
 * Invalid timestamp
 * =================================================
 */

console.log("\n===== INVALID SCHEDULED TIMESTAMP =====");

const invalidTimestampResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: "not-a-date",
  },

  {
    dispatchOutboxFactory: () => outbox,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => createDispatchSuccess(),

    strandedRecoveryService: async () => createRecoverySuccess(),
  },
);

console.dir(invalidTimestampResult, {
  depth: null,
});

assert.equal(invalidTimestampResult.status, "scheduled_recovery_not_ready");

assert.equal(invalidTimestampResult.reason, "valid_now_timestamp_required");

/*
 * =================================================
 * TEST 3
 * Adapter composition failure
 * =================================================
 */

console.log("\n===== ADAPTER COMPOSITION FAILURE =====");

const adapterFailureResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => {
      throw new Error("fixture adapter failure");
    },

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => createDispatchSuccess(),

    strandedRecoveryService: async () => createRecoverySuccess(),
  },
);

console.dir(adapterFailureResult, {
  depth: null,
});

assert.equal(adapterFailureResult.status, "scheduled_recovery_not_ready");

assert.equal(
  adapterFailureResult.reason,
  "scheduled_recovery_adapter_composition_failed",
);

/*
 * =================================================
 * TEST 4–12
 * Successful composition + wiring
 * =================================================
 */

console.log("\n===== SUCCESSFUL SCHEDULED RECOVERY =====");

const outboxFactoryInputs = [];

const recoveryFactoryInputs = [];

const queueFactoryInputs = [];

const dispatchInputs = [];

const strandedRecoveryInputs = [];

const expectedDispatchResult = createDispatchSuccess({
  checked: 4,

  dispatched: 3,

  retriesScheduled: 1,

  stateErrors: 0,
});

const expectedExecutionRecoveryResult = createRecoverySuccess({
  checked: 5,

  requeued: 4,

  queueFailures: 0,

  invalidRecords: 1,
});

const successfulResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,

    dispatchLimit: 11,

    recoveryLimit: 12,
  },

  {
    dispatchOutboxFactory: (receivedDb) => {
      outboxFactoryInputs.push(receivedDb);

      return outbox;
    },

    executionRecoveryFactory: (receivedDb) => {
      recoveryFactoryInputs.push(receivedDb);

      return executionRecovery;
    },

    queueFactory: (receivedQueueBinding) => {
      queueFactoryInputs.push(receivedQueueBinding);

      return queue;
    },

    dispatchService: async (input) => {
      dispatchInputs.push(input);

      return expectedDispatchResult;
    },

    strandedRecoveryService: async (input) => {
      strandedRecoveryInputs.push(input);

      return expectedExecutionRecoveryResult;
    },
  },
);

console.dir(successfulResult, {
  depth: null,
});

console.log("\n===== DISPATCH SERVICE INPUT =====");

console.dir(dispatchInputs, {
  depth: null,
});

console.log("\n===== STRANDED RECOVERY INPUT =====");

console.dir(strandedRecoveryInputs, {
  depth: null,
});

/*
 * =================================================
 * TEST 13
 * Dispatch throws — execution recovery still runs
 * =================================================
 */

console.log("\n===== DISPATCH THROW =====");

let recoveryAfterDispatchThrowCalls = 0;

const dispatchThrowResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => {
      throw new Error("fixture dispatch exception");
    },

    strandedRecoveryService: async () => {
      recoveryAfterDispatchThrowCalls += 1;

      return createRecoverySuccess({
        checked: 1,

        requeued: 1,

        queueFailures: 0,

        invalidRecords: 0,
      });
    },
  },
);

console.dir(dispatchThrowResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 14
 * Execution recovery throws
 * =================================================
 */

console.log("\n===== EXECUTION RECOVERY THROW =====");

let dispatchBeforeRecoveryThrowCalls = 0;

const recoveryThrowResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => {
      dispatchBeforeRecoveryThrowCalls += 1;

      return createDispatchSuccess({
        checked: 1,

        dispatched: 1,

        retriesScheduled: 0,

        stateErrors: 0,
      });
    },

    strandedRecoveryService: async () => {
      throw new Error("fixture recovery exception");
    },
  },
);

console.dir(recoveryThrowResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 15
 * Dispatch partial
 * =================================================
 */

console.log("\n===== DISPATCH PARTIAL =====");

const dispatchPartialResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => ({
      status: "dispatch_sweep_partial",

      reason: "dispatch_state_errors_present",

      checked: 2,

      dispatched: 1,

      retriesScheduled: 0,

      stateErrors: 1,

      results: [],
    }),

    strandedRecoveryService: async () =>
      createRecoverySuccess({
        checked: 0,

        requeued: 0,

        queueFailures: 0,

        invalidRecords: 0,
      }),
  },
);

console.dir(dispatchPartialResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 16
 * Execution recovery partial
 * =================================================
 */

console.log("\n===== EXECUTION RECOVERY PARTIAL =====");

const recoveryPartialResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () =>
      createDispatchSuccess({
        checked: 0,

        dispatched: 0,

        retriesScheduled: 0,

        stateErrors: 0,
      }),

    strandedRecoveryService: async () => ({
      status: "recovery_sweep_partial",

      reason: "one_or_more_recoveries_not_requeued",

      checked: 2,

      requeued: 1,

      queueFailures: 1,

      invalidRecords: 0,

      results: [],
    }),
  },
);

console.dir(recoveryPartialResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 17
 * One sweep fails
 * =================================================
 */

console.log("\n===== ONE RECOVERY SWEEP FAILED =====");

const oneFailedResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => ({
      status: "dispatch_sweep_failed",

      reason: "pending_dispatch_query_failed",

      checked: 0,

      dispatched: 0,

      retriesScheduled: 0,

      stateErrors: 0,

      results: [],
    }),

    strandedRecoveryService: async () =>
      createRecoverySuccess({
        checked: 2,

        requeued: 2,

        queueFailures: 0,

        invalidRecords: 0,
      }),
  },
);

console.dir(oneFailedResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 18
 * Both sweeps fail
 * =================================================
 */

console.log("\n===== BOTH RECOVERY SWEEPS FAILED =====");

const bothFailedResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => ({
      status: "dispatch_sweep_failed",

      reason: "pending_dispatch_query_failed",

      checked: 0,

      dispatched: 0,

      retriesScheduled: 0,

      stateErrors: 0,

      results: [],
    }),

    strandedRecoveryService: async () => ({
      status: "recovery_sweep_failed",

      reason: "recoverable_investigation_query_failed",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      invalidRecords: 0,

      results: [],
    }),
  },
);

console.dir(bothFailedResult, {
  depth: null,
});

/*
 * =================================================
 * FINAL ASSERTIONS
 * =================================================
 */

const dispatchInput = dispatchInputs[0];

const strandedInput = strandedRecoveryInputs[0];

const tests = {
  /*
   * Validation
   */
  missingDependencyRejected:
    missingDependencyResult.status === "scheduled_recovery_not_ready" &&
    missingDependencyResult.reason ===
      "scheduled_recovery_dependencies_required",

  invalidTimestampRejected:
    invalidTimestampResult.status === "scheduled_recovery_not_ready" &&
    invalidTimestampResult.reason === "valid_now_timestamp_required",

  adapterFailureRejected:
    adapterFailureResult.status === "scheduled_recovery_not_ready" &&
    adapterFailureResult.reason ===
      "scheduled_recovery_adapter_composition_failed",

  /*
   * Adapter factory wiring
   */
  outboxFactoryCalledOnce: outboxFactoryInputs.length === 1,

  dbForwardedToOutboxFactory: outboxFactoryInputs[0] === db,

  recoveryFactoryCalledOnce: recoveryFactoryInputs.length === 1,

  dbForwardedToRecoveryFactory: recoveryFactoryInputs[0] === db,

  queueFactoryCalledOnce: queueFactoryInputs.length === 1,

  queueBindingForwarded: queueFactoryInputs[0] === queueBinding,

  /*
   * Dispatch service wiring
   */
  dispatchServiceCalledOnce: dispatchInputs.length === 1,

  dispatchReceivesOutbox: dispatchInput?.outbox === outbox,

  dispatchReceivesQueue: dispatchInput?.queue === queue,

  dispatchReceivesTimestamp: dispatchInput?.now === NOW,

  dispatchReceivesLimit: dispatchInput?.limit === 11,

  /*
   * Stranded recovery wiring
   */
  strandedRecoveryCalledOnce: strandedRecoveryInputs.length === 1,

  recoveryReceivesAdapter: strandedInput?.recovery === executionRecovery,

  recoveryReceivesSameQueue: strandedInput?.queue === queue,

  recoveryReceivesTimestamp: strandedInput?.now === NOW,

  recoveryReceivesLimit: strandedInput?.limit === 12,

  /*
   * Successful aggregate
   */
  successfulSweepComplete:
    successfulResult.status === "scheduled_recovery_complete" &&
    successfulResult.reason === null,

  successfulTimestampPreserved: successfulResult.now === NOW,

  /*
   * Bounded summaries
   */
  dispatchSummaryPreserved:
    successfulResult.dispatch.status === "dispatch_sweep_complete" &&
    successfulResult.dispatch.checked === 4 &&
    successfulResult.dispatch.dispatched === 3 &&
    successfulResult.dispatch.retriesScheduled === 1 &&
    successfulResult.dispatch.stateErrors === 0,

  executionRecoverySummaryPreserved:
    successfulResult.executionRecovery.status === "recovery_sweep_complete" &&
    successfulResult.executionRecovery.checked === 5 &&
    successfulResult.executionRecovery.requeued === 4 &&
    successfulResult.executionRecovery.queueFailures === 0 &&
    successfulResult.executionRecovery.invalidRecords === 1,

  fullDispatchResultPreserved:
    successfulResult.dispatchResult === expectedDispatchResult,

  fullExecutionRecoveryResultPreserved:
    successfulResult.executionRecoveryResult ===
    expectedExecutionRecoveryResult,

  /*
   * Independence
   */
  recoveryStillRunsAfterDispatchThrow: recoveryAfterDispatchThrowCalls === 1,

  dispatchThrowBecomesPartial:
    dispatchThrowResult.status === "scheduled_recovery_partial" &&
    dispatchThrowResult.dispatch.reason === "scheduled_dispatch_sweep_threw" &&
    dispatchThrowResult.executionRecovery.status === "recovery_sweep_complete",

  dispatchStillRunsBeforeRecoveryThrow: dispatchBeforeRecoveryThrowCalls === 1,

  recoveryThrowBecomesPartial:
    recoveryThrowResult.status === "scheduled_recovery_partial" &&
    recoveryThrowResult.dispatch.status === "dispatch_sweep_complete" &&
    recoveryThrowResult.executionRecovery.reason ===
      "scheduled_execution_recovery_sweep_threw",

  /*
   * Partial sweeps
   */
  dispatchPartialAggregatesPartial:
    dispatchPartialResult.status === "scheduled_recovery_partial" &&
    dispatchPartialResult.reason === "one_or_more_recovery_sweeps_incomplete",

  recoveryPartialAggregatesPartial:
    recoveryPartialResult.status === "scheduled_recovery_partial" &&
    recoveryPartialResult.reason === "one_or_more_recovery_sweeps_incomplete",

  /*
   * Failed sweeps
   */
  oneFailedSweepAggregatesPartial:
    oneFailedResult.status === "scheduled_recovery_partial",

  bothFailedSweepsAggregateFailed:
    bothFailedResult.status === "scheduled_recovery_failed" &&
    bothFailedResult.reason === "both_recovery_sweeps_failed",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== HANDLE CLOUDFLARE SCHEDULED RECOVERY TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Handle Cloudflare scheduled recovery test failed.");
}

console.log("\n===== HANDLE CLOUDFLARE SCHEDULED RECOVERY TEST PASSED =====");
