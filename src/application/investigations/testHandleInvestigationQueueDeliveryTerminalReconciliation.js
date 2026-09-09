/*
 * Handle Investigation Queue Delivery
 * Terminal Reconciliation Regression Test
 *
 * This test covers the real production failure
 * discovered during Scout V1 end-to-end testing.
 *
 *
 * Original failure:
 *
 * investigation lifecycle
 *   PREPARING_REVIEW
 *
 * durable execution attempt 1
 *   FAILED
 *
 * lease
 *   released
 *
 * Queue delivery
 *   already ACKed
 *
 * Result:
 *
 * parent investigation remained permanently
 * PREPARING_REVIEW even though a terminal execution
 * already existed.
 *
 *
 * Required behavior:
 *
 * terminal execution already durable
 *        ↓
 * Queue redelivery
 *        ↓
 * detect terminal execution BEFORE new lease
 *        ↓
 * reconcile parent lifecycle
 *        ↓
 * ACK
 *
 *
 * Most important trust rule:
 *
 * A durable terminal execution must NOT cause
 * Methodology to run again merely because parent
 * lifecycle finalization previously failed.
 */

import { handleInvestigationQueueDelivery } from "./handleInvestigationQueueDelivery.js";

/*
 * ------------------------------------------------
 * Shared fixtures
 * ------------------------------------------------
 */

const investigationId = "inv_terminal_reconciliation_001";

const failedExecutionId = "exec_terminal_reconciliation_failed";

function createMessage() {
  return {
    version: 1,

    type: "investigation_requested",

    investigationId,
  };
}

/*
 * =================================================
 * SCENARIO 1
 *
 * Existing FAILED execution is reconciled.
 * =================================================
 */

console.log("\n===== EXISTING FAILED EXECUTION RECONCILIATION =====");

let failedScenarioQueueProcessorCalls = 0;

let failedScenarioScoutExecutorCalls = 0;

const failedScenarioUpdates = [];

const failedInvestigationRepository = {
  async updateInvestigation(requestedInvestigationId, changes) {
    failedScenarioUpdates.push({
      investigationId: requestedInvestigationId,

      changes,
    });

    return {
      status: "investigation_updated",

      reason: null,

      investigation: {
        investigationId: requestedInvestigationId,

        lifecycleState: changes.lifecycleState,

        updatedAt: changes.updatedAt,

        failureReason: changes.failureReason,
      },
    };
  },
};

const failedExecutionRepository = {
  async getLatestExecutionForInvestigation(requestedInvestigationId) {
    return {
      status: "execution_found",

      reason: null,

      execution: {
        executionId: failedExecutionId,

        investigationId: requestedInvestigationId,

        leaseToken: "lease_terminal_failed",

        attempt: 1,

        executionStatus: "FAILED",

        startedAt: "2026-09-09T20:10:29.811Z",

        completedAt: "2026-09-09T20:10:30.337Z",

        analysisOutcome: {
          status: "execution_failed",
        },

        failureReason: "repository_not_available",

        createdAt: "2026-09-09T20:10:29.811Z",

        updatedAt: "2026-09-09T20:10:30.337Z",
      },
    };
  },
};

const failedReconciliationResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    investigationRepository: failedInvestigationRepository,

    executionRepository: failedExecutionRepository,

    now: () => "2026-09-09T20:20:00.000Z",
  },

  {
    queueProcessor: async () => {
      failedScenarioQueueProcessorCalls += 1;

      return {
        status: "should_not_run",
      };
    },

    scoutExecutor: async () => {
      failedScenarioScoutExecutorCalls += 1;

      return {
        status: "should_not_run",
      };
    },
  },
);

console.dir(failedReconciliationResult, {
  depth: null,
});

console.log("\n===== FAILED RECONCILIATION UPDATE =====");

console.dir(failedScenarioUpdates, {
  depth: null,
});

/*
 * =================================================
 * SCENARIO 2
 *
 * Parent lifecycle write fails.
 *
 * Queue must RETRY but must still NOT run
 * Methodology.
 * =================================================
 */

console.log("\n===== TERMINAL RECONCILIATION WRITE FAILURE =====");

let retryScenarioQueueProcessorCalls = 0;

let retryScenarioScoutExecutorCalls = 0;

const retryInvestigationRepository = {
  async updateInvestigation() {
    return {
      status: "investigation_update_failed",

      reason: "fixture_database_write_failed",
    };
  },
};

const retryExecutionRepository = {
  async getLatestExecutionForInvestigation(requestedInvestigationId) {
    return {
      status: "execution_found",

      reason: null,

      execution: {
        executionId: failedExecutionId,

        investigationId: requestedInvestigationId,

        leaseToken: "lease_terminal_failed",

        attempt: 1,

        executionStatus: "FAILED",

        startedAt: "2026-09-09T20:10:29.811Z",

        completedAt: "2026-09-09T20:10:30.337Z",

        analysisOutcome: null,

        failureReason: "repository_not_available",

        createdAt: "2026-09-09T20:10:29.811Z",

        updatedAt: "2026-09-09T20:10:30.337Z",
      },
    };
  },
};

const reconciliationRetryResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    investigationRepository: retryInvestigationRepository,

    executionRepository: retryExecutionRepository,

    now: () => "2026-09-09T20:21:00.000Z",
  },

  {
    queueProcessor: async () => {
      retryScenarioQueueProcessorCalls += 1;

      return {
        status: "should_not_run",
      };
    },

    scoutExecutor: async () => {
      retryScenarioScoutExecutorCalls += 1;

      return {
        status: "should_not_run",
      };
    },
  },
);

console.dir(reconciliationRetryResult, {
  depth: null,
});

/*
 * =================================================
 * SCENARIO 3
 *
 * Fresh investigation has no existing execution.
 *
 * Normal execution proceeds and then parent
 * lifecycle is finalized.
 * =================================================
 */

console.log("\n===== FRESH COMPLETE EXECUTION FINALIZATION =====");

let freshQueueProcessorCalls = 0;

let freshScoutExecutorCalls = 0;

const freshUpdates = [];

const freshInvestigationRepository = {
  async updateInvestigation(requestedInvestigationId, changes) {
    freshUpdates.push({
      investigationId: requestedInvestigationId,

      changes,
    });

    return {
      status: "investigation_updated",

      reason: null,

      investigation: {
        investigationId: requestedInvestigationId,

        lifecycleState: changes.lifecycleState,

        updatedAt: changes.updatedAt,

        failureReason: changes.failureReason,
      },
    };
  },
};

const freshExecutionRepository = {
  async getLatestExecutionForInvestigation() {
    return {
      status: "execution_not_found",

      reason: null,

      execution: null,
    };
  },
};

const freshPreparedResult = {
  status: "queued_investigation_prepared",

  reason: null,

  investigationId,

  lifecycleState: "PREPARING_REVIEW",

  resumed: false,

  investigation: {
    investigationId,

    lifecycleState: "PREPARING_REVIEW",

    target: {
      source: {
        repositoryId: "1363107590",

        owner: "kivanta",

        repo: "scout-v1-fixture",

        commitSha: "29d6f23d5671d19e776b48064de5149aa5c4c666",

        treeSha: "0b4cbcc182c410cd932aa256d2234d051f51e36a",
      },
    },
  },

  execution: {
    leaseToken: "lease_fresh_execution",

    attempt: 1,

    acquiredAt: "2026-09-09T20:30:00.000Z",

    expiresAt: "2026-09-09T20:35:00.000Z",
  },
};

const freshExecutionResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    investigationRepository: freshInvestigationRepository,

    executionRepository: freshExecutionRepository,

    executionLease: {
      fixture: "executionLease",
    },

    now: () => "2026-09-09T20:30:00.000Z",
  },

  {
    queueProcessor: async () => {
      freshQueueProcessorCalls += 1;

      return freshPreparedResult;
    },

    scoutExecutor: async () => {
      freshScoutExecutorCalls += 1;

      return {
        status: "prepared_execution_finished",

        reason: null,

        investigationId,

        executionId: "exec_fresh_complete",

        attempt: 1,

        executionStatus: "COMPLETE",

        execution: {
          executionId: "exec_fresh_complete",

          investigationId,

          attempt: 1,

          executionStatus: "COMPLETE",

          completedAt: "2026-09-09T20:31:00.000Z",

          failureReason: null,
        },

        publicationState: "NOT_PUBLISHED",
      };
    },
  },
);

console.dir(freshExecutionResult, {
  depth: null,
});

console.log("\n===== FRESH FINALIZATION UPDATE =====");

console.dir(freshUpdates, {
  depth: null,
});

/*
 * =================================================
 * FINAL ASSERTIONS
 * =================================================
 */

const tests = {
  /*
   * Existing FAILED execution:
   *
   * parent becomes FAILED and Queue ACKs.
   */
  existingFailedExecutionAcked:
    failedReconciliationResult.status === "queue_delivery_ack" &&
    failedReconciliationResult.decision === "ACK",

  existingFailedExecutionReconciled:
    failedReconciliationResult.reason === "terminal_execution_reconciled",

  existingFailedStatusPreserved:
    failedReconciliationResult.durableExecutionStatus === "FAILED",

  existingFailedExecutionIdPreserved:
    failedReconciliationResult.executionId === failedExecutionId,

  failedParentUpdatedOnce: failedScenarioUpdates.length === 1,

  failedParentLifecycleIsFailed:
    failedScenarioUpdates[0]?.changes?.lifecycleState === "FAILED",

  failedParentFailureReasonPreserved:
    failedScenarioUpdates[0]?.changes?.failureReason ===
    "repository_not_available",

  failedParentUsesExecutionCompletionTime:
    failedScenarioUpdates[0]?.changes?.updatedAt === "2026-09-09T20:10:30.337Z",

  /*
   * Most important regression assertion:
   *
   * no new preparation
   * no Methodology rerun
   */
  existingTerminalSkipsQueueProcessor: failedScenarioQueueProcessorCalls === 0,

  existingTerminalSkipsScoutExecutor: failedScenarioScoutExecutorCalls === 0,

  /*
   * Failed parent reconciliation:
   *
   * retry the Queue delivery, but still do not
   * create another Methodology attempt.
   */
  reconciliationFailureRetries:
    reconciliationRetryResult.status === "queue_delivery_retry" &&
    reconciliationRetryResult.decision === "RETRY",

  reconciliationFailureReasonPreserved:
    reconciliationRetryResult.reason ===
    "investigation_terminal_state_not_recorded",

  retryStillSkipsQueueProcessor: retryScenarioQueueProcessorCalls === 0,

  retryStillSkipsScoutExecutor: retryScenarioScoutExecutorCalls === 0,

  /*
   * Fresh investigation:
   *
   * normal execution still occurs.
   */
  freshQueueProcessorRunsOnce: freshQueueProcessorCalls === 1,

  freshScoutExecutorRunsOnce: freshScoutExecutorCalls === 1,

  freshExecutionAcked:
    freshExecutionResult.status === "queue_delivery_ack" &&
    freshExecutionResult.decision === "ACK",

  freshExecutionStatusComplete:
    freshExecutionResult.durableExecutionStatus === "COMPLETE",

  freshParentUpdatedOnce: freshUpdates.length === 1,

  freshParentLifecycleComplete:
    freshUpdates[0]?.changes?.lifecycleState === "COMPLETE",

  freshParentFailureReasonCleared:
    freshUpdates[0]?.changes?.failureReason === null,

  freshParentUsesExecutionCompletionTime:
    freshUpdates[0]?.changes?.updatedAt === "2026-09-09T20:31:00.000Z",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== TERMINAL RECONCILIATION REGRESSION TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Terminal reconciliation regression test failed.");
}

console.log("\n===== TERMINAL RECONCILIATION REGRESSION TEST PASSED =====");
