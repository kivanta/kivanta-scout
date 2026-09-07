/*
 * Handle Cloudflare Scheduled Recovery Test
 *
 * Tests the Cloudflare composition boundary that
 * runs all THREE Scout recovery jobs:
 *
 *
 * JOB 1
 * CREATED + PENDING outbox
 *        ↓
 * pending dispatch recovery
 *
 *
 * JOB 2
 * stale QUEUED + DISPATCHED outbox
 *        ↓
 * stale queued recovery
 *
 *
 * JOB 3
 * stranded PREPARING_REVIEW
 *        ↓
 * execution recovery
 *
 *
 * We verify:
 *
 * 1. missing composition dependency is rejected
 * 2. invalid timestamp is rejected
 * 3. adapter composition failure is rejected
 *
 * Successful composition:
 *
 * 4. D1 reaches outbox factory
 * 5. D1 reaches queued-recovery factory
 * 6. D1 reaches execution-recovery factory
 * 7. Queue binding reaches Queue factory
 *
 * 8. dispatch service receives outbox + Queue
 * 9. stale QUEUED service receives queued adapter + Queue
 * 10. execution recovery receives execution adapter + Queue
 *
 * 11. current timestamp reaches all three jobs
 * 12. dispatch limit is forwarded
 * 13. queued recovery limit is forwarded
 * 14. queued stale grace is forwarded
 * 15. execution recovery limit is forwarded
 *
 * 16. all three complete => scheduled_recovery_complete
 * 17. bounded summaries are preserved
 * 18. full immediate results are preserved
 *
 * Independence:
 *
 * 19. dispatch throw does not stop jobs 2 or 3
 * 20. queued recovery throw does not stop jobs 1 or 3
 * 21. execution recovery throw does not erase jobs 1 or 2
 *
 * Partial/failure classification:
 *
 * 22. dispatch partial => scheduled partial
 * 23. queued recovery partial => scheduled partial
 * 24. execution recovery partial => scheduled partial
 * 25. one failed sweep => scheduled partial
 * 26. all three failed => scheduled failed
 */

import assert from "node:assert/strict";

import { handleCloudflareScheduledRecovery } from "./handleCloudflareScheduledRecovery.js";

/*
 * =================================================
 * Shared fixtures
 * =================================================
 */

const NOW = "2026-09-07T19:30:00.000Z";

const db = {
  fixture: "db",
};

const queueBinding = {
  fixture: "queue-binding",
};

const outbox = {
  fixture: "dispatch-outbox",
};

const queuedRecovery = {
  fixture: "queued-recovery",
};

const executionRecovery = {
  fixture: "execution-recovery",
};

const queue = {
  fixture: "application-queue",
};

/*
 * =================================================
 * Result fixture helpers
 * =================================================
 */

function createDispatchSuccess({
  checked = 2,
  dispatched = 2,
  retriesScheduled = 0,
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

function createQueuedRecoverySuccess({
  checked = 2,
  requeued = 2,
  queueFailures = 0,
  stateFailures = 0,
  invalidRecords = 0,
  staleBefore = "2026-09-07T19:00:00.000Z",
} = {}) {
  return {
    status: "stale_queued_recovery_complete",

    reason: null,

    now: NOW,

    staleBefore,

    checked,

    requeued,

    queueFailures,

    stateFailures,

    invalidRecords,

    results: [],
  };
}

function createExecutionRecoverySuccess({
  checked = 2,
  requeued = 2,
  queueFailures = 0,
  invalidRecords = 0,
} = {}) {
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
    staleQueuedRecoveryService: null,
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

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => createDispatchSuccess(),

    staleQueuedRecoveryService: async () => createQueuedRecoverySuccess(),

    strandedRecoveryService: async () => createExecutionRecoverySuccess(),
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
    dispatchOutboxFactory: () => outbox,

    queuedRecoveryFactory: () => {
      throw new Error("fixture queued adapter failure");
    },

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => createDispatchSuccess(),

    staleQueuedRecoveryService: async () => createQueuedRecoverySuccess(),

    strandedRecoveryService: async () => createExecutionRecoverySuccess(),
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
 * TEST 4–18
 * Successful three-job composition
 * =================================================
 */

console.log("\n===== SUCCESSFUL THREE-JOB SCHEDULED RECOVERY =====");

const outboxFactoryInputs = [];

const queuedRecoveryFactoryInputs = [];

const executionRecoveryFactoryInputs = [];

const queueFactoryInputs = [];

const dispatchInputs = [];

const queuedRecoveryInputs = [];

const executionRecoveryInputs = [];

const expectedDispatchResult = createDispatchSuccess({
  checked: 4,

  dispatched: 3,

  retriesScheduled: 1,

  stateErrors: 0,
});

const expectedQueuedRecoveryResult = createQueuedRecoverySuccess({
  checked: 5,

  requeued: 4,

  queueFailures: 0,

  stateFailures: 1,

  invalidRecords: 0,

  staleBefore: "2026-09-07T19:00:00.000Z",
});

const expectedExecutionRecoveryResult = createExecutionRecoverySuccess({
  checked: 6,

  requeued: 5,

  queueFailures: 1,

  invalidRecords: 0,
});

const successfulResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,

    dispatchLimit: 11,

    queuedRecoveryLimit: 12,

    queuedStaleGraceMs: 30 * 60 * 1000,

    recoveryLimit: 13,
  },

  {
    dispatchOutboxFactory: (receivedDb) => {
      outboxFactoryInputs.push(receivedDb);

      return outbox;
    },

    queuedRecoveryFactory: (receivedDb) => {
      queuedRecoveryFactoryInputs.push(receivedDb);

      return queuedRecovery;
    },

    executionRecoveryFactory: (receivedDb) => {
      executionRecoveryFactoryInputs.push(receivedDb);

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

    staleQueuedRecoveryService: async (input) => {
      queuedRecoveryInputs.push(input);

      return expectedQueuedRecoveryResult;
    },

    strandedRecoveryService: async (input) => {
      executionRecoveryInputs.push(input);

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

console.log("\n===== STALE QUEUED SERVICE INPUT =====");

console.dir(queuedRecoveryInputs, {
  depth: null,
});

console.log("\n===== EXECUTION RECOVERY SERVICE INPUT =====");

console.dir(executionRecoveryInputs, {
  depth: null,
});

/*
 * =================================================
 * TEST 19
 * Dispatch throws
 *
 * Jobs 2 + 3 must still run.
 * =================================================
 */

console.log("\n===== DISPATCH THROW INDEPENDENCE =====");

let queuedAfterDispatchThrowCalls = 0;

let executionAfterDispatchThrowCalls = 0;

const dispatchThrowResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => {
      throw new Error("fixture dispatch throw");
    },

    staleQueuedRecoveryService: async () => {
      queuedAfterDispatchThrowCalls += 1;

      return createQueuedRecoverySuccess({
        checked: 1,

        requeued: 1,
      });
    },

    strandedRecoveryService: async () => {
      executionAfterDispatchThrowCalls += 1;

      return createExecutionRecoverySuccess({
        checked: 1,

        requeued: 1,
      });
    },
  },
);

console.dir(dispatchThrowResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 20
 * Stale QUEUED recovery throws
 *
 * Jobs 1 + 3 must still complete.
 * =================================================
 */

console.log("\n===== STALE QUEUED THROW INDEPENDENCE =====");

let dispatchBeforeQueuedThrowCalls = 0;

let executionAfterQueuedThrowCalls = 0;

const queuedThrowResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => {
      dispatchBeforeQueuedThrowCalls += 1;

      return createDispatchSuccess({
        checked: 1,

        dispatched: 1,
      });
    },

    staleQueuedRecoveryService: async () => {
      throw new Error("fixture stale queued throw");
    },

    strandedRecoveryService: async () => {
      executionAfterQueuedThrowCalls += 1;

      return createExecutionRecoverySuccess({
        checked: 1,

        requeued: 1,
      });
    },
  },
);

console.dir(queuedThrowResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 21
 * Execution recovery throws
 *
 * Jobs 1 + 2 must remain successful.
 * =================================================
 */

console.log("\n===== EXECUTION RECOVERY THROW INDEPENDENCE =====");

let dispatchBeforeExecutionThrowCalls = 0;

let queuedBeforeExecutionThrowCalls = 0;

const executionThrowResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => {
      dispatchBeforeExecutionThrowCalls += 1;

      return createDispatchSuccess({
        checked: 1,

        dispatched: 1,
      });
    },

    staleQueuedRecoveryService: async () => {
      queuedBeforeExecutionThrowCalls += 1;

      return createQueuedRecoverySuccess({
        checked: 1,

        requeued: 1,
      });
    },

    strandedRecoveryService: async () => {
      throw new Error("fixture execution recovery throw");
    },
  },
);

console.dir(executionThrowResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 22
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

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () => ({
      status: "dispatch_sweep_partial",

      reason: "one_or_more_dispatches_incomplete",

      checked: 2,

      dispatched: 1,

      retriesScheduled: 0,

      stateErrors: 1,

      results: [],
    }),

    staleQueuedRecoveryService: async () =>
      createQueuedRecoverySuccess({
        checked: 0,

        requeued: 0,
      }),

    strandedRecoveryService: async () =>
      createExecutionRecoverySuccess({
        checked: 0,

        requeued: 0,
      }),
  },
);

console.dir(dispatchPartialResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 23
 * Stale QUEUED recovery partial
 * =================================================
 */

console.log("\n===== STALE QUEUED PARTIAL =====");

const queuedPartialResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () =>
      createDispatchSuccess({
        checked: 0,

        dispatched: 0,
      }),

    staleQueuedRecoveryService: async () => ({
      status: "stale_queued_recovery_partial",

      reason: "one_or_more_stale_queued_recoveries_incomplete",

      now: NOW,

      staleBefore: "2026-09-07T19:00:00.000Z",

      checked: 2,

      requeued: 1,

      queueFailures: 1,

      stateFailures: 0,

      invalidRecords: 0,

      results: [],
    }),

    strandedRecoveryService: async () =>
      createExecutionRecoverySuccess({
        checked: 0,

        requeued: 0,
      }),
  },
);

console.dir(queuedPartialResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 24
 * Execution recovery partial
 * =================================================
 */

console.log("\n===== EXECUTION RECOVERY PARTIAL =====");

const executionPartialResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () =>
      createDispatchSuccess({
        checked: 0,

        dispatched: 0,
      }),

    staleQueuedRecoveryService: async () =>
      createQueuedRecoverySuccess({
        checked: 0,

        requeued: 0,
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

console.dir(executionPartialResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 25
 * One failed sweep
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

    queuedRecoveryFactory: () => queuedRecovery,

    executionRecoveryFactory: () => executionRecovery,

    queueFactory: () => queue,

    dispatchService: async () =>
      createDispatchSuccess({
        checked: 1,

        dispatched: 1,
      }),

    staleQueuedRecoveryService: async () => ({
      status: "stale_queued_recovery_failed",

      reason: "recoverable_queued_query_failed",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

      invalidRecords: 0,

      results: [],
    }),

    strandedRecoveryService: async () =>
      createExecutionRecoverySuccess({
        checked: 1,

        requeued: 1,
      }),
  },
);

console.dir(oneFailedResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 26
 * All three sweeps fail
 * =================================================
 */

console.log("\n===== ALL THREE RECOVERY SWEEPS FAILED =====");

const allFailedResult = await handleCloudflareScheduledRecovery(
  {
    db,

    queueBinding,

    now: NOW,
  },

  {
    dispatchOutboxFactory: () => outbox,

    queuedRecoveryFactory: () => queuedRecovery,

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

    staleQueuedRecoveryService: async () => ({
      status: "stale_queued_recovery_failed",

      reason: "recoverable_queued_query_failed",

      checked: 0,

      requeued: 0,

      queueFailures: 0,

      stateFailures: 0,

      invalidRecords: 0,

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

console.dir(allFailedResult, {
  depth: null,
});

/*
 * =================================================
 * Final assertions
 * =================================================
 */

const dispatchInput = dispatchInputs[0];

const queuedInput = queuedRecoveryInputs[0];

const executionInput = executionRecoveryInputs[0];

const tests = {
  /*
   * ---------------------------------------------
   * Validation
   * ---------------------------------------------
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
   * ---------------------------------------------
   * Factory wiring
   * ---------------------------------------------
   */

  outboxFactoryCalledOnce: outboxFactoryInputs.length === 1,

  dbForwardedToOutboxFactory: outboxFactoryInputs[0] === db,

  queuedRecoveryFactoryCalledOnce: queuedRecoveryFactoryInputs.length === 1,

  dbForwardedToQueuedRecoveryFactory: queuedRecoveryFactoryInputs[0] === db,

  executionRecoveryFactoryCalledOnce:
    executionRecoveryFactoryInputs.length === 1,

  dbForwardedToExecutionRecoveryFactory:
    executionRecoveryFactoryInputs[0] === db,

  queueFactoryCalledOnce: queueFactoryInputs.length === 1,

  queueBindingForwarded: queueFactoryInputs[0] === queueBinding,

  /*
   * ---------------------------------------------
   * JOB 1 wiring
   * ---------------------------------------------
   */

  dispatchServiceCalledOnce: dispatchInputs.length === 1,

  dispatchReceivesOutbox: dispatchInput?.outbox === outbox,

  dispatchReceivesQueue: dispatchInput?.queue === queue,

  dispatchReceivesNow: dispatchInput?.now === NOW,

  dispatchReceivesLimit: dispatchInput?.limit === 11,

  /*
   * ---------------------------------------------
   * JOB 2 wiring
   * ---------------------------------------------
   */

  queuedRecoveryServiceCalledOnce: queuedRecoveryInputs.length === 1,

  queuedRecoveryReceivesAdapter: queuedInput?.queuedRecovery === queuedRecovery,

  queuedRecoveryReceivesSameQueue: queuedInput?.queue === queue,

  queuedRecoveryReceivesNow: queuedInput?.now === NOW,

  queuedRecoveryReceivesGrace: queuedInput?.staleGraceMs === 30 * 60 * 1000,

  queuedRecoveryReceivesLimit: queuedInput?.limit === 12,

  /*
   * ---------------------------------------------
   * JOB 3 wiring
   * ---------------------------------------------
   */

  executionRecoveryServiceCalledOnce: executionRecoveryInputs.length === 1,

  executionRecoveryReceivesAdapter:
    executionInput?.recovery === executionRecovery,

  executionRecoveryReceivesSameQueue: executionInput?.queue === queue,

  executionRecoveryReceivesNow: executionInput?.now === NOW,

  executionRecoveryReceivesLimit: executionInput?.limit === 13,

  /*
   * ---------------------------------------------
   * Successful aggregate
   * ---------------------------------------------
   */

  successfulAggregateComplete:
    successfulResult.status === "scheduled_recovery_complete" &&
    successfulResult.reason === null,

  successfulTimestampPreserved: successfulResult.now === NOW,

  /*
   * ---------------------------------------------
   * Bounded summaries
   * ---------------------------------------------
   */

  dispatchSummaryPreserved:
    successfulResult.dispatch.status === "dispatch_sweep_complete" &&
    successfulResult.dispatch.checked === 4 &&
    successfulResult.dispatch.dispatched === 3 &&
    successfulResult.dispatch.retriesScheduled === 1 &&
    successfulResult.dispatch.stateErrors === 0,

  queuedRecoverySummaryPreserved:
    successfulResult.queuedRecovery.status ===
      "stale_queued_recovery_complete" &&
    successfulResult.queuedRecovery.checked === 5 &&
    successfulResult.queuedRecovery.requeued === 4 &&
    successfulResult.queuedRecovery.stateFailures === 1 &&
    successfulResult.queuedRecovery.staleBefore === "2026-09-07T19:00:00.000Z",

  executionRecoverySummaryPreserved:
    successfulResult.executionRecovery.status === "recovery_sweep_complete" &&
    successfulResult.executionRecovery.checked === 6 &&
    successfulResult.executionRecovery.requeued === 5 &&
    successfulResult.executionRecovery.queueFailures === 1,

  /*
   * ---------------------------------------------
   * Full immediate results
   * ---------------------------------------------
   */

  fullDispatchResultPreserved:
    successfulResult.dispatchResult === expectedDispatchResult,

  fullQueuedRecoveryResultPreserved:
    successfulResult.queuedRecoveryResult === expectedQueuedRecoveryResult,

  fullExecutionRecoveryResultPreserved:
    successfulResult.executionRecoveryResult ===
    expectedExecutionRecoveryResult,

  /*
   * ---------------------------------------------
   * Independence
   * ---------------------------------------------
   */

  queuedRunsAfterDispatchThrow: queuedAfterDispatchThrowCalls === 1,

  executionRunsAfterDispatchThrow: executionAfterDispatchThrowCalls === 1,

  dispatchThrowAggregatesPartial:
    dispatchThrowResult.status === "scheduled_recovery_partial" &&
    dispatchThrowResult.dispatch.reason === "scheduled_dispatch_sweep_threw" &&
    dispatchThrowResult.queuedRecovery.status ===
      "stale_queued_recovery_complete" &&
    dispatchThrowResult.executionRecovery.status === "recovery_sweep_complete",

  dispatchRunsBeforeQueuedThrow: dispatchBeforeQueuedThrowCalls === 1,

  executionRunsAfterQueuedThrow: executionAfterQueuedThrowCalls === 1,

  queuedThrowAggregatesPartial:
    queuedThrowResult.status === "scheduled_recovery_partial" &&
    queuedThrowResult.queuedRecovery.reason ===
      "scheduled_stale_queued_recovery_sweep_threw" &&
    queuedThrowResult.dispatch.status === "dispatch_sweep_complete" &&
    queuedThrowResult.executionRecovery.status === "recovery_sweep_complete",

  dispatchRunsBeforeExecutionThrow: dispatchBeforeExecutionThrowCalls === 1,

  queuedRunsBeforeExecutionThrow: queuedBeforeExecutionThrowCalls === 1,

  executionThrowAggregatesPartial:
    executionThrowResult.status === "scheduled_recovery_partial" &&
    executionThrowResult.executionRecovery.reason ===
      "scheduled_execution_recovery_sweep_threw" &&
    executionThrowResult.dispatch.status === "dispatch_sweep_complete" &&
    executionThrowResult.queuedRecovery.status ===
      "stale_queued_recovery_complete",

  /*
   * ---------------------------------------------
   * Partial classification
   * ---------------------------------------------
   */

  dispatchPartialAggregatesPartial:
    dispatchPartialResult.status === "scheduled_recovery_partial" &&
    dispatchPartialResult.reason === "one_or_more_recovery_sweeps_incomplete",

  queuedPartialAggregatesPartial:
    queuedPartialResult.status === "scheduled_recovery_partial" &&
    queuedPartialResult.reason === "one_or_more_recovery_sweeps_incomplete",

  executionPartialAggregatesPartial:
    executionPartialResult.status === "scheduled_recovery_partial" &&
    executionPartialResult.reason === "one_or_more_recovery_sweeps_incomplete",

  /*
   * ---------------------------------------------
   * Failure classification
   * ---------------------------------------------
   */

  oneFailedSweepAggregatesPartial:
    oneFailedResult.status === "scheduled_recovery_partial",

  allFailedSweepsAggregateFailed:
    allFailedResult.status === "scheduled_recovery_failed" &&
    allFailedResult.reason === "all_recovery_sweeps_failed",
};

/*
 * =================================================
 * Pass / fail
 * =================================================
 */

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== HANDLE CLOUDFLARE SCHEDULED RECOVERY TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Handle Cloudflare scheduled recovery test failed.");
}

console.log("\n===== HANDLE CLOUDFLARE SCHEDULED RECOVERY TEST PASSED =====");
