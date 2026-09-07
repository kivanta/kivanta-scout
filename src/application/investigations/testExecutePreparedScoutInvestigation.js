/*
 * Execute Prepared Scout Investigation Test
 *
 * Tests the production composition boundary:
 *
 *   executePreparedScoutInvestigation()
 *
 *
 * We verify:
 *
 * 1. missing executor is rejected
 * 2. missing frozen Methodology runner is rejected
 * 3. missing persistable outcome preparer is rejected
 *
 * Composition wiring:
 *
 * 4. prepared investigation is forwarded
 * 5. execution repository is forwarded
 * 6. execution lease is forwarded
 * 7. execution ID factory is forwarded
 * 8. startedAt is forwarded
 * 9. now() is forwarded
 * 10. real runFrozenMethodology is injected by default
 * 11. real preparePersistableMethodologyOutcome is
 *     injected by default
 * 12. executor result is returned unchanged
 *
 * Real executor integration:
 *
 * 13. executePreparedInvestigation actually runs
 * 14. durable RUNNING execution is created
 * 15. composed Methodology runner is called
 * 16. heartbeat works through the composition layer
 * 17. composed persistence-safe preparer is called
 * 18. COMPLETE outcome is written
 * 19. lease is released
 * 20. execution remains NOT_PUBLISHED
 */

import { executePreparedScoutInvestigation } from "./executePreparedScoutInvestigation.js";

import { runFrozenMethodology } from "./runFrozenMethodology.js";

import { preparePersistableMethodologyOutcome } from "./preparePersistableMethodologyOutcome.js";

/*
 * ------------------------------------------------
 * Shared fixture
 * ------------------------------------------------
 */

const investigationId = "inv_scout_composition_001";

const leaseToken = "lease_scout_composition_001";

function createPreparedInvestigation() {
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
        frozenAt: "2026-09-07T13:00:00.000Z",

        source: {
          repositoryId: "42424242",

          owner: "kivanta",

          repo: "fixture-agent",

          canonicalUrl: "https://github.com/kivanta/fixture-agent",

          defaultBranch: "main",

          commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

          treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },

        methodology: {
          id: "kivanta-scout-methodology",

          version: "1.0",
        },

        technocoreReference: {
          registryVersion: "1.0",

          repositoryId: "1332656411",

          owner: "flop-labs",

          repo: "technocore-chat",

          canonicalUrl: "https://github.com/flop-labs/technocore-chat",

          commitSha: "9861d01cb42e10a5ffdffe3880338feaa4f56b3f",

          treeSha: "89db587b5c598697451e77f387ef5b9d1d9f9ef7",
        },

        referenceRegistryDigest: {
          algorithm: "SHA-256",

          canonicalization: "scout-stable-json-v1",

          value: "fixture-digest",
        },
      },
    },

    execution: {
      leaseToken,

      attempt: 1,

      acquiredAt: "2026-09-07T13:01:00.000Z",

      expiresAt: "2026-09-07T13:06:00.000Z",
    },
  };
}

/*
 * =================================================
 * TEST 1
 * Missing executor
 * =================================================
 */

console.log("\n===== MISSING EXECUTOR =====");

const missingExecutorResult = await executePreparedScoutInvestigation(
  {
    prepared: createPreparedInvestigation(),
  },

  {
    executor: null,
  },
);

console.dir(missingExecutorResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 2
 * Missing frozen Methodology runner
 * =================================================
 */

console.log("\n===== MISSING FROZEN METHODOLOGY RUNNER =====");

const missingRunnerResult = await executePreparedScoutInvestigation(
  {
    prepared: createPreparedInvestigation(),
  },

  {
    executor: async () => ({
      status: "should_not_run",
    }),

    methodologyRunner: null,
  },
);

console.dir(missingRunnerResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 3
 * Missing persistence-safe outcome preparer
 * =================================================
 */

console.log("\n===== MISSING PERSISTABLE OUTCOME PREPARER =====");

const missingPreparerResult = await executePreparedScoutInvestigation(
  {
    prepared: createPreparedInvestigation(),
  },

  {
    executor: async () => ({
      status: "should_not_run",
    }),

    methodologyRunner: async () => ({
      status: "methodology_run",
    }),

    persistableOutcomePreparer: null,
  },
);

console.dir(missingPreparerResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 4–12
 * Composition wiring
 * =================================================
 */

console.log("\n===== DEFAULT COMPOSITION WIRING =====");

const wiringPrepared = createPreparedInvestigation();

const wiringRepository = {
  fixture: "repository",
};

const wiringLease = {
  fixture: "lease",
};

const wiringCreateExecutionId = () => "exec_wiring_fixture";

const wiringStartedAt = "2026-09-07T13:10:00.000Z";

const wiringNow = () => "2026-09-07T13:11:00.000Z";

const executorCalls = [];

const expectedExecutorResult = {
  status: "fixture_executor_finished",

  value: 42,
};

async function wiringExecutor(input) {
  executorCalls.push(input);

  return expectedExecutorResult;
}

const wiringResult = await executePreparedScoutInvestigation(
  {
    prepared: wiringPrepared,

    executionRepository: wiringRepository,

    executionLease: wiringLease,

    createExecutionId: wiringCreateExecutionId,

    startedAt: wiringStartedAt,

    now: wiringNow,
  },

  {
    executor: wiringExecutor,
  },
);

console.dir(wiringResult, {
  depth: null,
});

console.log("\n===== EXECUTOR COMPOSITION INPUT =====");

console.dir(executorCalls, {
  depth: null,
});

/*
 * =================================================
 * TEST 13–20
 * Real executePreparedInvestigation integration
 * =================================================
 *
 * Here we use the REAL executor through the
 * composition service.
 *
 * Only the expensive Methodology and persistence
 * projection boundaries are replaced with fakes.
 */

const createdExecutions = [];

const recordedOutcomes = [];

const heartbeatCalls = [];

const releaseCalls = [];

const methodologyCalls = [];

const preparerCalls = [];

/*
 * ------------------------------------------------
 * Durable execution repository fake
 * ------------------------------------------------
 */

const integrationExecutionRepository = {
  async createExecution(input) {
    createdExecutions.push(input);

    return {
      status: "execution_created",

      reason: null,

      execution: {
        executionId: input.executionId,

        investigationId: input.investigationId,

        leaseToken: input.leaseToken,

        attempt: input.attempt,

        executionStatus: "RUNNING",

        startedAt: input.startedAt,

        completedAt: null,

        analysisOutcome: null,

        failureReason: null,
      },
    };
  },

  async getExecution() {
    return {
      status: "execution_found",

      execution: null,
    };
  },

  async recordExecutionOutcome(input) {
    recordedOutcomes.push(input);

    return {
      status: "execution_outcome_recorded",

      reason: null,

      execution: {
        executionId: input.executionId,

        investigationId: input.investigationId,

        leaseToken: input.leaseToken,

        attempt: 1,

        executionStatus: input.executionStatus,

        startedAt: "2026-09-07T13:20:00.000Z",

        completedAt: input.completedAt,

        analysisOutcome: input.analysisOutcome,

        failureReason: input.failureReason,
      },
    };
  },
};

/*
 * ------------------------------------------------
 * Execution lease fake
 * ------------------------------------------------
 */

const integrationExecutionLease = {
  async acquireExecutionLease() {
    return {
      status: "execution_lease_acquired",
    };
  },

  async getExecutionLease() {
    return {
      status: "execution_lease_found",

      lease: null,
    };
  },

  async heartbeatExecutionLease(input) {
    heartbeatCalls.push(input);

    return {
      status: "execution_lease_renewed",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      heartbeatAt: input.heartbeatAt,

      expiresAt: input.expiresAt,
    };
  },

  async releaseExecutionLease(input) {
    releaseCalls.push(input);

    return {
      status: "execution_lease_released",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      releasedAt: input.releasedAt,
    };
  },
};

/*
 * ------------------------------------------------
 * Composed Methodology runner fake
 * ------------------------------------------------
 */

async function integrationMethodologyRunner(input) {
  methodologyCalls.push(input);

  /*
   * Prove that the heartbeat created by the real
   * executePreparedInvestigation() reaches the
   * Methodology boundary through this composition.
   */

  const heartbeatResult = await input.heartbeat();

  if (heartbeatResult.status !== "execution_lease_renewed") {
    throw new Error("Fixture heartbeat was not renewed.");
  }

  return {
    status: "methodology_run",

    executionStatus: "complete",

    resultStatus: "PASS",

    checks: [
      {
        status: "PASS",

        title: "fixture-check",
      },
    ],
  };
}

/*
 * ------------------------------------------------
 * Persistence-safe outcome preparer fake
 * ------------------------------------------------
 */

async function integrationOutcomePreparer(input) {
  preparerCalls.push(input);

  return {
    status: "persistable_outcome_ready",

    reason: null,

    outcome: {
      schema: "fixture-safe-outcome-v1",

      executionStatus: input.methodologyResult.executionStatus,

      resultStatus: input.methodologyResult.resultStatus,

      safelyProjected: true,
    },

    failureReason: null,
  };
}

/*
 * First now():
 * Methodology heartbeat
 *
 * Second now():
 * execution completion
 */

const integrationTimes = [
  "2026-09-07T13:21:00.000Z",
  "2026-09-07T13:22:00.000Z",
];

function integrationNow() {
  return integrationTimes.shift();
}

console.log("\n===== REAL EXECUTOR COMPOSITION =====");

const integrationResult = await executePreparedScoutInvestigation(
  {
    prepared: createPreparedInvestigation(),

    executionRepository: integrationExecutionRepository,

    executionLease: integrationExecutionLease,

    createExecutionId: () => "exec_scout_composition",

    startedAt: "2026-09-07T13:20:00.000Z",

    now: integrationNow,
  },

  {
    /*
     * executor intentionally omitted:
     *
     * use the real
     * executePreparedInvestigation()
     */

    methodologyRunner: integrationMethodologyRunner,

    persistableOutcomePreparer: integrationOutcomePreparer,
  },
);

console.dir(integrationResult, {
  depth: null,
});

console.log("\n===== CREATED EXECUTION =====");

console.dir(createdExecutions, {
  depth: null,
});

console.log("\n===== RECORDED OUTCOME =====");

console.dir(recordedOutcomes, {
  depth: null,
});

/*
 * =================================================
 * FINAL ASSERTIONS
 * =================================================
 */

const wiringInput = executorCalls[0];

const tests = {
  /*
   * Validation
   */
  missingExecutorRejected:
    missingExecutorResult.status === "scout_execution_not_ready" &&
    missingExecutorResult.reason === "prepared_execution_service_required",

  missingMethodologyRunnerRejected:
    missingRunnerResult.status === "scout_execution_not_ready" &&
    missingRunnerResult.reason === "frozen_methodology_runner_required",

  missingOutcomePreparerRejected:
    missingPreparerResult.status === "scout_execution_not_ready" &&
    missingPreparerResult.reason === "persistable_outcome_preparer_required",

  /*
   * Composition wiring
   */
  executorCalledOnce: executorCalls.length === 1,

  preparedForwarded: wiringInput?.prepared === wiringPrepared,

  executionRepositoryForwarded:
    wiringInput?.executionRepository === wiringRepository,

  executionLeaseForwarded: wiringInput?.executionLease === wiringLease,

  executionIdFactoryForwarded:
    wiringInput?.createExecutionId === wiringCreateExecutionId,

  startedAtForwarded: wiringInput?.startedAt === wiringStartedAt,

  nowForwarded: wiringInput?.now === wiringNow,

  realFrozenMethodologyWiredByDefault:
    wiringInput?.runMethodology === runFrozenMethodology,

  realPersistablePreparerWiredByDefault:
    wiringInput?.preparePersistableOutcome ===
    preparePersistableMethodologyOutcome,

  executorResultReturnedUnchanged: wiringResult === expectedExecutorResult,

  /*
   * Real executor integration
   */
  realExecutorFinished:
    integrationResult.status === "prepared_execution_finished",

  integrationExecutionIdCorrect:
    integrationResult.executionId === "exec_scout_composition",

  integrationExecutionStatusComplete:
    integrationResult.executionStatus === "COMPLETE",

  durableRunningExecutionCreated:
    createdExecutions.length === 1 &&
    createdExecutions[0]?.executionId === "exec_scout_composition" &&
    createdExecutions[0]?.investigationId === investigationId &&
    createdExecutions[0]?.leaseToken === leaseToken &&
    createdExecutions[0]?.attempt === 1,

  composedMethodologyCalledOnce: methodologyCalls.length === 1,

  frozenTargetReachedMethodology:
    methodologyCalls[0]?.target?.source?.commitSha ===
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

  heartbeatReachedLeaseAdapter:
    heartbeatCalls.length === 1 && heartbeatCalls[0]?.leaseToken === leaseToken,

  heartbeatExtendedLease:
    heartbeatCalls[0]?.heartbeatAt === "2026-09-07T13:21:00.000Z" &&
    heartbeatCalls[0]?.expiresAt === "2026-09-07T13:26:00.000Z",

  persistencePreparerCalledOnce: preparerCalls.length === 1,

  methodologyResultReachedPreparer:
    preparerCalls[0]?.methodologyResult?.executionStatus === "complete",

  investigationReachedPreparer:
    preparerCalls[0]?.investigation?.target?.source?.repositoryId ===
    "42424242",

  executionContextReachedPreparer:
    preparerCalls[0]?.investigationId === investigationId &&
    preparerCalls[0]?.executionId === "exec_scout_composition" &&
    preparerCalls[0]?.attempt === 1,

  durableOutcomeRecorded: recordedOutcomes.length === 1,

  completeOutcomeRecorded: recordedOutcomes[0]?.executionStatus === "COMPLETE",

  safeOutcomeRecorded:
    recordedOutcomes[0]?.analysisOutcome?.schema ===
      "fixture-safe-outcome-v1" &&
    recordedOutcomes[0]?.analysisOutcome?.safelyProjected === true,

  noFailureReasonOnComplete: recordedOutcomes[0]?.failureReason === null,

  leaseReleased:
    releaseCalls.length === 1 && releaseCalls[0]?.leaseToken === leaseToken,

  completionTimeUsedForRelease:
    releaseCalls[0]?.releasedAt === "2026-09-07T13:22:00.000Z",

  resultStillNotPublished:
    integrationResult.publicationState === "NOT_PUBLISHED",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== EXECUTE PREPARED SCOUT INVESTIGATION TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Execute prepared Scout investigation test failed.");
}

console.log("\n===== EXECUTE PREPARED SCOUT INVESTIGATION TEST PASSED =====");
