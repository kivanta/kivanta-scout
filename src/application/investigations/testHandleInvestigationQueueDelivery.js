/*
 * Handle Investigation Queue Delivery Test
 *
 * Tests:
 *
 *   handleInvestigationQueueDelivery()
 *
 *
 * This verifies Scout's neutral Queue decision layer.
 *
 * It does NOT call Cloudflare Queue directly.
 *
 *
 * PREPARATION DECISIONS
 *
 * 1. missing Queue processor → RETRY
 * 2. missing Scout executor → RETRY
 * 3. runtime clock failure → RETRY
 * 4. Queue processor throw → RETRY
 *
 * ACK preparation states:
 *
 * 5. rejected Queue message → ACK
 * 6. missing investigation → ACK
 * 7. non-resumable investigation → ACK
 * 8. already-active execution → ACK
 *
 * RETRY preparation states:
 *
 * 9. preparation not ready → RETRY
 * 10. investigation load failure → RETRY
 * 11. lease acquisition failure → RETRY
 * 12. PREPARING_REVIEW state failure → RETRY
 *
 * 13. unknown preparation result → RETRY
 *
 *
 * PREPARED EXECUTION
 *
 * 14. prepared result reaches Scout executor
 * 15. execution repository is forwarded
 * 16. execution lease is forwarded
 * 17. execution ID factory is forwarded
 * 18. startedAt is forwarded
 * 19. runtime clock function is forwarded
 *
 *
 * EXECUTION DECISIONS
 *
 * 20. durable successful execution → ACK
 * 21. durably recorded FAILED execution → ACK
 * 22. FAILED execution without durable outcome → RETRY
 * 23. outcome-state failure → RETRY
 * 24. execution not started → RETRY
 * 25. execution not ready → RETRY
 * 26. execution rejected → RETRY
 * 27. Scout composition unavailable → RETRY
 * 28. unknown execution result → RETRY
 * 29. Scout executor throw → RETRY
 *
 *
 * TRUST RULE
 *
 * A Methodology failure is ACKed only when its FAILED
 * execution outcome is durably recorded.
 */

import { handleInvestigationQueueDelivery } from "./handleInvestigationQueueDelivery.js";

/*
 * ------------------------------------------------
 * Shared Queue message
 * ------------------------------------------------
 */

const investigationId = "inv_queue_delivery_001";

function createMessage() {
  return {
    version: 1,

    type: "investigation_requested",

    investigationId,
  };
}

/*
 * ------------------------------------------------
 * Prepared investigation fixture
 * ------------------------------------------------
 */

function createPreparedResult() {
  return {
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
          repositoryId: "42424242",

          owner: "kivanta",

          repo: "fixture-agent",

          commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

          treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
    },

    execution: {
      leaseToken: "lease_queue_delivery_001",

      attempt: 1,

      acquiredAt: "2026-09-07T13:00:00.000Z",

      expiresAt: "2026-09-07T13:05:00.000Z",
    },
  };
}

/*
 * ------------------------------------------------
 * Runtime dependency fixtures
 * ------------------------------------------------
 */

const investigationRepository = {
  fixture: "investigationRepository",
};

const executionLease = {
  fixture: "executionLease",
};

const executionRepository = {
  fixture: "executionRepository",
};

const createLeaseToken = () => "lease_fixture_token";

const createExecutionId = () => "exec_fixture_id";

const startedAt = "2026-09-07T13:10:00.000Z";

/*
 * ------------------------------------------------
 * TEST 1
 * Missing Queue processor
 * ------------------------------------------------
 */

console.log("\n===== MISSING QUEUE PROCESSOR =====");

const missingQueueProcessorResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),
  },

  {
    queueProcessor: null,
  },
);

console.dir(missingQueueProcessorResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 2
 * Missing Scout executor
 * ------------------------------------------------
 */

console.log("\n===== MISSING SCOUT EXECUTOR =====");

const missingScoutExecutorResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: null,
  },
);

console.dir(missingScoutExecutorResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Runtime clock throws
 * ------------------------------------------------
 */

console.log("\n===== RUNTIME CLOCK FAILURE =====");

const clockFailureResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => {
      throw new Error("fixture clock failure");
    },
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: async () => ({
      status: "should_not_run",
    }),
  },
);

console.dir(clockFailureResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 4
 * Queue processor throws
 * ------------------------------------------------
 */

console.log("\n===== QUEUE PROCESSOR THROW =====");

const queueProcessorThrowResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T13:20:00.000Z",
  },

  {
    queueProcessor: async () => {
      throw new Error("fixture queue processor failure");
    },

    scoutExecutor: async () => ({
      status: "should_not_run",
    }),
  },
);

console.dir(queueProcessorThrowResult, {
  depth: null,
});

/*
 * =================================================
 * PREPARATION ACK STATES
 * =================================================
 */

const preparationAckCases = [
  {
    name: "MESSAGE REJECTED",

    result: {
      status: "queued_message_rejected",

      reason: "unsupported_queue_message_version",
    },
  },

  {
    name: "INVESTIGATION NOT FOUND",

    result: {
      status: "queued_investigation_not_found",

      reason: "investigation_record_not_found",

      investigationId,
    },
  },

  {
    name: "INVESTIGATION NOT PROCESSABLE",

    result: {
      status: "queued_investigation_not_processable",

      reason: "investigation_lifecycle_not_resumable",

      investigationId,

      lifecycleState: "COMPLETE",
    },
  },

  {
    name: "INVESTIGATION ALREADY ACTIVE",

    result: {
      status: "queued_investigation_already_active",

      reason: "active_execution_lease_exists",

      investigationId,

      activeAttempt: 1,
    },
  },
];

const preparationAckResults = [];

let preparationAckScoutCalls = 0;

for (const fixture of preparationAckCases) {
  console.log(`\n===== ${fixture.name} =====`);

  const result = await handleInvestigationQueueDelivery(
    {
      message: createMessage(),

      now: () => "2026-09-07T13:30:00.000Z",
    },

    {
      queueProcessor: async () => fixture.result,

      scoutExecutor: async () => {
        preparationAckScoutCalls += 1;

        return {
          status: "should_not_run",
        };
      },
    },
  );

  preparationAckResults.push({
    fixture,
    result,
  });

  console.dir(result, {
    depth: null,
  });
}

/*
 * =================================================
 * PREPARATION RETRY STATES
 * =================================================
 */

const preparationRetryCases = [
  {
    name: "INVESTIGATION NOT READY",

    result: {
      status: "queued_investigation_not_ready",

      reason: "execution_lease_not_ready",

      investigationId,
    },
  },

  {
    name: "INVESTIGATION LOAD FAILED",

    result: {
      status: "queued_investigation_load_failed",

      reason: "investigation_repository_read_failed",

      investigationId,
    },
  },

  {
    name: "INVESTIGATION LEASE FAILED",

    result: {
      status: "queued_investigation_lease_failed",

      reason: "execution_lease_acquisition_failed",

      investigationId,
    },
  },

  {
    name: "INVESTIGATION STATE FAILED",

    result: {
      status: "queued_investigation_state_failed",

      reason: "preparing_review_state_not_recorded",

      investigationId,
    },
  },
];

const preparationRetryResults = [];

let preparationRetryScoutCalls = 0;

for (const fixture of preparationRetryCases) {
  console.log(`\n===== ${fixture.name} =====`);

  const result = await handleInvestigationQueueDelivery(
    {
      message: createMessage(),

      now: () => "2026-09-07T13:40:00.000Z",
    },

    {
      queueProcessor: async () => fixture.result,

      scoutExecutor: async () => {
        preparationRetryScoutCalls += 1;

        return {
          status: "should_not_run",
        };
      },
    },
  );

  preparationRetryResults.push({
    fixture,
    result,
  });

  console.dir(result, {
    depth: null,
  });
}

/*
 * ------------------------------------------------
 * TEST 13
 * Unknown preparation status
 * ------------------------------------------------
 */

console.log("\n===== UNKNOWN PREPARATION RESULT =====");

const unknownPreparationResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T13:50:00.000Z",
  },

  {
    queueProcessor: async () => ({
      status: "mystery_preparation_state",

      investigationId,
    }),

    scoutExecutor: async () => ({
      status: "should_not_run",
    }),
  },
);

console.dir(unknownPreparationResult, {
  depth: null,
});

/*
 * =================================================
 * PREPARED EXECUTION WIRING
 * =================================================
 */

console.log("\n===== PREPARED EXECUTION WIRING =====");

const preparedResult = createPreparedResult();

const queueProcessorInputs = [];

const scoutExecutorInputs = [];

const runtimeNow = () => "2026-09-07T14:00:00.000Z";

async function wiringQueueProcessor(input) {
  queueProcessorInputs.push(input);

  return preparedResult;
}

async function wiringScoutExecutor(input) {
  scoutExecutorInputs.push(input);

  return {
    status: "prepared_execution_finished",

    reason: null,

    investigationId,

    executionId: "exec_wiring",

    attempt: 1,

    executionStatus: "COMPLETE",

    publicationState: "NOT_PUBLISHED",
  };
}

const wiringResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    investigationRepository,

    executionLease,

    executionRepository,

    now: runtimeNow,

    leaseDurationMs: 300000,

    createLeaseToken,

    createExecutionId,

    startedAt,
  },

  {
    queueProcessor: wiringQueueProcessor,

    scoutExecutor: wiringScoutExecutor,
  },
);

console.dir(wiringResult, {
  depth: null,
});

console.log("\n===== QUEUE PROCESSOR INPUT =====");

console.dir(queueProcessorInputs, {
  depth: null,
});

console.log("\n===== SCOUT EXECUTOR INPUT =====");

console.dir(scoutExecutorInputs, {
  depth: null,
});

/*
 * =================================================
 * EXECUTION RESULT CLASSIFICATION
 * =================================================
 */

/*
 * ------------------------------------------------
 * Successful durable execution → ACK
 * ------------------------------------------------
 */

console.log("\n===== SUCCESSFUL EXECUTION =====");

const successfulExecutionResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T14:10:00.000Z",
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: async () => ({
      status: "prepared_execution_finished",

      investigationId,

      executionId: "exec_success",

      executionStatus: "COMPLETE",

      publicationState: "NOT_PUBLISHED",
    }),
  },
);

console.dir(successfulExecutionResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Durably recorded FAILED execution → ACK
 * ------------------------------------------------
 */

console.log("\n===== DURABLY RECORDED FAILURE =====");

const recordedFailureResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T14:20:00.000Z",
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: async () => ({
      status: "prepared_execution_failed",

      reason: "methodology_execution_failed",

      investigationId,

      executionId: "exec_failed_recorded",

      outcomeResult: {
        status: "execution_outcome_recorded",
      },

      releaseResult: {
        status: "execution_lease_released",
      },
    }),
  },
);

console.dir(recordedFailureResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FAILED but D1 outcome missing → RETRY
 * ------------------------------------------------
 */

console.log("\n===== FAILURE NOT DURABLY RECORDED =====");

const unrecordedFailureResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T14:30:00.000Z",
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: async () => ({
      status: "prepared_execution_failed",

      reason: "methodology_execution_failed",

      investigationId,

      executionId: "exec_failed_unrecorded",

      outcomeResult: {
        status: "execution_outcome_not_recorded",

        reason: "database_write_failed",
      },
    }),
  },
);

console.dir(unrecordedFailureResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Durable outcome state write failed → RETRY
 * ------------------------------------------------
 */

console.log("\n===== EXECUTION STATE FAILURE =====");

const executionStateFailureResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T14:40:00.000Z",
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: async () => ({
      status: "prepared_execution_state_failed",

      reason: "execution_outcome_not_recorded",

      investigationId,

      executionId: "exec_state_failed",

      executionStatus: "PARTIAL",
    }),
  },
);

console.dir(executionStateFailureResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Retryable execution-start states
 * ------------------------------------------------
 */

const executionRetryCases = [
  {
    name: "EXECUTION NOT STARTED",

    result: {
      status: "prepared_execution_not_started",

      reason: "durable_execution_not_created",

      executionId: "exec_not_started",
    },
  },

  {
    name: "EXECUTION NOT READY",

    result: {
      status: "prepared_execution_not_ready",

      reason: "execution_repository_not_ready",
    },
  },

  {
    name: "EXECUTION REJECTED",

    result: {
      status: "prepared_execution_rejected",

      reason: "prepared_investigation_required",
    },
  },

  {
    name: "SCOUT EXECUTION NOT READY",

    result: {
      status: "scout_execution_not_ready",

      reason: "frozen_methodology_runner_required",
    },
  },
];

const executionRetryResults = [];

for (const fixture of executionRetryCases) {
  console.log(`\n===== ${fixture.name} =====`);

  const result = await handleInvestigationQueueDelivery(
    {
      message: createMessage(),

      now: () => "2026-09-07T14:50:00.000Z",
    },

    {
      queueProcessor: async () => createPreparedResult(),

      scoutExecutor: async () => fixture.result,
    },
  );

  executionRetryResults.push({
    fixture,
    result,
  });

  console.dir(result, {
    depth: null,
  });
}

/*
 * ------------------------------------------------
 * Unknown execution status → RETRY
 * ------------------------------------------------
 */

console.log("\n===== UNKNOWN EXECUTION RESULT =====");

const unknownExecutionResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T15:00:00.000Z",
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: async () => ({
      status: "mystery_execution_state",

      executionId: "exec_mystery",
    }),
  },
);

console.dir(unknownExecutionResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Scout executor throws → RETRY
 * ------------------------------------------------
 */

console.log("\n===== SCOUT EXECUTOR THROW =====");

const scoutExecutorThrowResult = await handleInvestigationQueueDelivery(
  {
    message: createMessage(),

    now: () => "2026-09-07T15:10:00.000Z",
  },

  {
    queueProcessor: async () => createPreparedResult(),

    scoutExecutor: async () => {
      throw new Error("fixture Scout execution failure");
    },
  },
);

console.dir(scoutExecutorThrowResult, {
  depth: null,
});

/*
 * =================================================
 * FINAL ASSERTIONS
 * =================================================
 */

const queueProcessorInput = queueProcessorInputs[0];

const scoutExecutorInput = scoutExecutorInputs[0];

const tests = {
  /*
   * Dependency / runtime failures
   */
  missingQueueProcessorRetries:
    missingQueueProcessorResult.status === "queue_delivery_retry" &&
    missingQueueProcessorResult.reason === "queue_processor_required",

  missingScoutExecutorRetries:
    missingScoutExecutorResult.status === "queue_delivery_retry" &&
    missingScoutExecutorResult.reason === "scout_executor_required",

  clockFailureRetries:
    clockFailureResult.status === "queue_delivery_retry" &&
    clockFailureResult.reason === "queue_runtime_clock_failed",

  queueProcessorThrowRetries:
    queueProcessorThrowResult.status === "queue_delivery_retry" &&
    queueProcessorThrowResult.reason ===
      "queued_investigation_processing_threw",

  /*
   * Preparation ACK classification
   */
  allPermanentPreparationStatesAck: preparationAckResults.every(
    ({ result }) =>
      result.status === "queue_delivery_ack" && result.decision === "ACK",
  ),

  preparationAckPreservesStatus: preparationAckResults.every(
    ({ fixture, result }) => result.preparationStatus === fixture.result.status,
  ),

  preparationAckDoesNotExecuteScout: preparationAckScoutCalls === 0,

  /*
   * Preparation RETRY classification
   */
  allTransientPreparationStatesRetry: preparationRetryResults.every(
    ({ result }) =>
      result.status === "queue_delivery_retry" && result.decision === "RETRY",
  ),

  preparationRetryPreservesStatus: preparationRetryResults.every(
    ({ fixture, result }) => result.preparationStatus === fixture.result.status,
  ),

  preparationRetryDoesNotExecuteScout: preparationRetryScoutCalls === 0,

  unknownPreparationRetries:
    unknownPreparationResult.status === "queue_delivery_retry" &&
    unknownPreparationResult.reason === "unrecognized_queue_processing_result",

  /*
   * Preparation wiring
   */
  queueProcessorCalledOnce: queueProcessorInputs.length === 1,

  messageForwardedToProcessor:
    queueProcessorInput?.message?.investigationId === investigationId,

  investigationRepositoryForwarded:
    queueProcessorInput?.investigationRepository === investigationRepository,

  executionLeaseForwardedToProcessor:
    queueProcessorInput?.executionLease === executionLease,

  leaseDurationForwarded: queueProcessorInput?.leaseDurationMs === 300000,

  leaseTokenFactoryForwarded:
    queueProcessorInput?.createLeaseToken === createLeaseToken,

  preparationTimestampResolved:
    queueProcessorInput?.now === "2026-09-07T14:00:00.000Z",

  /*
   * Scout execution wiring
   */
  scoutExecutorCalledOnce: scoutExecutorInputs.length === 1,

  preparedResultForwarded: scoutExecutorInput?.prepared === preparedResult,

  executionRepositoryForwarded:
    scoutExecutorInput?.executionRepository === executionRepository,

  executionLeaseForwardedToExecutor:
    scoutExecutorInput?.executionLease === executionLease,

  executionIdFactoryForwarded:
    scoutExecutorInput?.createExecutionId === createExecutionId,

  startedAtForwarded: scoutExecutorInput?.startedAt === startedAt,

  runtimeClockFunctionForwarded: scoutExecutorInput?.now === runtimeNow,

  wiringExecutionAcked:
    wiringResult.status === "queue_delivery_ack" &&
    wiringResult.reason === "investigation_execution_finished",

  /*
   * Successful execution
   */
  successfulExecutionAcked:
    successfulExecutionResult.status === "queue_delivery_ack" &&
    successfulExecutionResult.decision === "ACK",

  successfulExecutionIdPreserved:
    successfulExecutionResult.executionId === "exec_success",

  successfulDurableStatusPreserved:
    successfulExecutionResult.durableExecutionStatus === "COMPLETE",

  /*
   * Durable FAILED outcome
   */
  recordedFailureAcked:
    recordedFailureResult.status === "queue_delivery_ack" &&
    recordedFailureResult.reason === "investigation_failure_recorded",

  recordedFailureDurableStatusFailed:
    recordedFailureResult.durableExecutionStatus === "FAILED",

  /*
   * Failure not persisted
   */
  unrecordedFailureRetries:
    unrecordedFailureResult.status === "queue_delivery_retry" &&
    unrecordedFailureResult.reason ===
      "investigation_failure_not_durably_recorded",

  /*
   * Final state write failed
   */
  stateFailureRetries:
    executionStateFailureResult.status === "queue_delivery_retry" &&
    executionStateFailureResult.reason === "execution_outcome_not_recorded",

  stateFailurePreservesPartialStatus:
    executionStateFailureResult.durableExecutionStatus === "PARTIAL",

  /*
   * Other execution retry states
   */
  allExecutionStartupFailuresRetry: executionRetryResults.every(
    ({ result }) =>
      result.status === "queue_delivery_retry" && result.decision === "RETRY",
  ),

  retryReasonsPreserved: executionRetryResults.every(
    ({ fixture, result }) => result.reason === fixture.result.reason,
  ),

  unknownExecutionRetries:
    unknownExecutionResult.status === "queue_delivery_retry" &&
    unknownExecutionResult.reason === "unrecognized_scout_execution_result",

  scoutExecutorThrowRetries:
    scoutExecutorThrowResult.status === "queue_delivery_retry" &&
    scoutExecutorThrowResult.reason === "scout_execution_threw",

  /*
   * Prepared status remains attached to final
   * execution decisions.
   */
  successfulDecisionIncludesPreparationStatus:
    successfulExecutionResult.preparationStatus ===
    "queued_investigation_prepared",

  recordedFailureIncludesPreparationStatus:
    recordedFailureResult.preparationStatus === "queued_investigation_prepared",

  unrecordedFailureIncludesPreparationStatus:
    unrecordedFailureResult.preparationStatus ===
    "queued_investigation_prepared",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== HANDLE INVESTIGATION QUEUE DELIVERY TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Handle investigation Queue delivery test failed.");
}

console.log("\n===== HANDLE INVESTIGATION QUEUE DELIVERY TEST PASSED =====");
