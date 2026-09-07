/*
 * Execute Prepared Investigation Test
 *
 * Tests the application service that wraps the
 * existing Scout Methodology engine with durable
 * execution state.
 *
 * This test uses application fakes only.
 *
 * It does NOT contact Cloudflare, D1, GitHub,
 * Technocore, ENS, or the real Methodology engine.
 *
 *
 * We verify:
 *
 * 1. missing dependencies are rejected
 * 2. missing Methodology runner is rejected
 * 3. missing persistence-safe outcome preparer is rejected
 * 4. invalid prepared investigation is rejected
 *
 * Happy path:
 *
 * 5. execution attempt is created as RUNNING
 * 6. Methodology receives the frozen target
 * 7. heartbeat can extend the execution lease
 * 8. COMPLETE is persisted
 * 9. persistence-safe outcome is stored
 * 10. lease is released
 * 11. result remains NOT_PUBLISHED
 *
 * Failure paths:
 *
 * 12. Methodology throw becomes operational FAILED
 * 13. thrown failure is NOT converted to UNKNOWN
 * 14. unrecognized execution status becomes FAILED
 * 15. persistence-safe outcome preparation failure
 *     becomes FAILED
 * 16. durable outcome write failure is surfaced
 */

import { executePreparedInvestigation } from "./executePreparedInvestigation.js";

/*
 * ------------------------------------------------
 * Shared prepared investigation fixture
 * ------------------------------------------------
 */

const investigationId = "inv_execute_prepared_001";

const leaseToken = "lease_execute_prepared_001";

function createPreparedInvestigation() {
  return {
    status: "queued_investigation_prepared",

    reason: null,

    investigationId,

    lifecycleState: "PREPARING_REVIEW",

    resumed: false,

    investigation: {
      investigationId,

      lifecycleState: "QUEUED",

      reviewKey: {
        provider: "github",

        repositoryId: "repo_execute_prepared",

        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

        methodologyId: "kivanta-scout-methodology",

        methodologyVersion: "1.0",
      },

      target: {
        status: "target_frozen",

        frozenAt: "2026-09-07T11:00:00.000Z",

        source: {
          repositoryId: "repo_execute_prepared",

          owner: "kivanta",

          repo: "fixture",

          canonicalUrl: "https://github.com/kivanta/fixture",

          defaultBranch: "main",

          commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

          treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },

        methodology: {
          id: "kivanta-scout-methodology",

          version: "1.0",
        },
      },
    },

    execution: {
      leaseToken,

      attempt: 1,

      acquiredAt: "2026-09-07T11:15:00.000Z",

      expiresAt: "2026-09-07T11:20:00.000Z",
    },

    lifecycleResult: {
      status: "investigation_updated",
    },
  };
}

/*
 * ------------------------------------------------
 * Repository and lease helpers
 * ------------------------------------------------
 */

function createExecutionRepository({
  createExecutionImpl,
  recordOutcomeImpl,
} = {}) {
  return {
    async createExecution(input) {
      if (createExecutionImpl) {
        return createExecutionImpl(input);
      }

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
      if (recordOutcomeImpl) {
        return recordOutcomeImpl(input);
      }

      return {
        status: "execution_outcome_recorded",

        reason: null,

        execution: {
          executionId: input.executionId,

          investigationId: input.investigationId,

          leaseToken: input.leaseToken,

          attempt: 1,

          executionStatus: input.executionStatus,

          startedAt: "2026-09-07T11:16:00.000Z",

          completedAt: input.completedAt,

          analysisOutcome: input.analysisOutcome,

          failureReason: input.failureReason,
        },
      };
    },
  };
}

function createExecutionLease({ heartbeatImpl, releaseImpl } = {}) {
  return {
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
      if (heartbeatImpl) {
        return heartbeatImpl(input);
      }

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
      if (releaseImpl) {
        return releaseImpl(input);
      }

      return {
        status: "execution_lease_released",

        reason: null,

        investigationId: input.investigationId,

        leaseToken: input.leaseToken,

        releasedAt: input.releasedAt,
      };
    },
  };
}

/*
 * ------------------------------------------------
 * TEST 1
 * Missing dependencies.
 * ------------------------------------------------
 */

console.log("\n===== MISSING DEPENDENCIES =====");

const missingDependenciesResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),
});

console.dir(missingDependenciesResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 2
 * Methodology runner missing.
 * ------------------------------------------------
 */

const basicRepository = createExecutionRepository();

const basicLease = createExecutionLease();

console.log("\n===== MISSING METHODOLOGY RUNNER =====");

const missingRunnerResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),

  executionRepository: basicRepository,

  executionLease: basicLease,
});

console.dir(missingRunnerResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Persistence-safe outcome preparer missing.
 * ------------------------------------------------
 */

console.log("\n===== MISSING OUTCOME PREPARER =====");

const missingPreparerResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),

  executionRepository: basicRepository,

  executionLease: basicLease,

  runMethodology: async () => ({
    executionStatus: "complete",
  }),
});

console.dir(missingPreparerResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 4
 * Invalid prepared investigation.
 * ------------------------------------------------
 */

console.log("\n===== INVALID PREPARED INVESTIGATION =====");

const invalidPreparedResult = await executePreparedInvestigation({
  prepared: {
    status: "something_else",
  },

  executionRepository: basicRepository,

  executionLease: basicLease,

  runMethodology: async () => null,

  preparePersistableOutcome: async () => null,
});

console.dir(invalidPreparedResult, {
  depth: null,
});

/*
 * =================================================
 * HAPPY PATH
 * =================================================
 */

const happyCreateInputs = [];

const happyOutcomeInputs = [];

const happyHeartbeatInputs = [];

const happyReleaseInputs = [];

const happyMethodologyInputs = [];

const happyPreparerInputs = [];

/*
 * Deterministic runtime timestamps.
 *
 * First now():
 * heartbeat at 11:17
 *
 * Second now():
 * completion at 11:18
 */
const happyTimes = ["2026-09-07T11:17:00.000Z", "2026-09-07T11:18:00.000Z"];

function happyNow() {
  return happyTimes.shift();
}

const happyRepository = createExecutionRepository({
  createExecutionImpl: async (input) => {
    happyCreateInputs.push(input);

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

  recordOutcomeImpl: async (input) => {
    happyOutcomeInputs.push(input);

    return {
      status: "execution_outcome_recorded",

      reason: null,

      execution: {
        executionId: input.executionId,

        investigationId: input.investigationId,

        leaseToken: input.leaseToken,

        attempt: 1,

        executionStatus: input.executionStatus,

        startedAt: "2026-09-07T11:16:00.000Z",

        completedAt: input.completedAt,

        analysisOutcome: input.analysisOutcome,

        failureReason: input.failureReason,
      },
    };
  },
});

const happyLease = createExecutionLease({
  heartbeatImpl: async (input) => {
    happyHeartbeatInputs.push(input);

    return {
      status: "execution_lease_renewed",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      heartbeatAt: input.heartbeatAt,

      expiresAt: input.expiresAt,
    };
  },

  releaseImpl: async (input) => {
    happyReleaseInputs.push(input);

    return {
      status: "execution_lease_released",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      releasedAt: input.releasedAt,
    };
  },
});

async function happyMethodologyRunner(input) {
  happyMethodologyInputs.push(input);

  /*
   * Simulate one heartbeat during Methodology.
   */
  const heartbeatResult = await input.heartbeat();

  if (heartbeatResult.status !== "execution_lease_renewed") {
    throw new Error("Heartbeat failed during fixture Methodology.");
  }

  return {
    executionStatus: "complete",

    resultStatus: "PASS",

    checks: [
      {
        checkId: "check-1",

        status: "PASS",
      },

      {
        checkId: "check-4",

        status: "PASS",
      },

      {
        checkId: "check-5",

        status: "PASS",
      },
    ],

    evidence: [
      {
        type: "fixture-evidence",

        sensitiveValue: "remove-this-before-persistence",
      },
    ],
  };
}

async function happyOutcomePreparer(input) {
  happyPreparerInputs.push(input);

  /*
   * Simulate the future redaction/projection layer.
   *
   * Notice sensitiveValue is deliberately omitted.
   */
  return {
    status: "persistable_outcome_ready",

    reason: null,

    outcome: {
      executionStatus: "complete",

      resultStatus: "PASS",

      checks: input.methodologyResult.checks,

      evidence: [
        {
          type: "fixture-evidence",

          redacted: true,
        },
      ],
    },

    failureReason: null,
  };
}

console.log("\n===== HAPPY EXECUTION PATH =====");

const happyResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),

  executionRepository: happyRepository,

  executionLease: happyLease,

  runMethodology: happyMethodologyRunner,

  preparePersistableOutcome: happyOutcomePreparer,

  createExecutionId: () => "exec_happy_path",

  startedAt: "2026-09-07T11:16:00.000Z",

  now: happyNow,
});

console.dir(happyResult, {
  depth: null,
});

console.log("\n===== HAPPY CREATE INPUT =====");

console.dir(happyCreateInputs, {
  depth: null,
});

console.log("\n===== HAPPY HEARTBEAT INPUT =====");

console.dir(happyHeartbeatInputs, {
  depth: null,
});

console.log("\n===== HAPPY OUTCOME INPUT =====");

console.dir(happyOutcomeInputs, {
  depth: null,
});

console.log("\n===== HAPPY RELEASE INPUT =====");

console.dir(happyReleaseInputs, {
  depth: null,
});

/*
 * =================================================
 * METHODOLOGY THROW
 * =================================================
 *
 * Operational failure must become FAILED.
 *
 * It must NOT manufacture an UNKNOWN finding.
 */

const thrownOutcomeInputs = [];

const thrownReleaseInputs = [];

const thrownRepository = createExecutionRepository({
  recordOutcomeImpl: async (input) => {
    thrownOutcomeInputs.push(input);

    return {
      status: "execution_outcome_recorded",

      reason: null,

      execution: {
        executionStatus: input.executionStatus,

        analysisOutcome: input.analysisOutcome,

        failureReason: input.failureReason,
      },
    };
  },
});

const thrownLease = createExecutionLease({
  releaseImpl: async (input) => {
    thrownReleaseInputs.push(input);

    return {
      status: "execution_lease_released",
    };
  },
});

console.log("\n===== METHODOLOGY THROW =====");

const thrownResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),

  executionRepository: thrownRepository,

  executionLease: thrownLease,

  runMethodology: async () => {
    throw new Error("simulated upstream failure");
  },

  preparePersistableOutcome: async () => {
    throw new Error("Should not be called.");
  },

  createExecutionId: () => "exec_methodology_throw",

  startedAt: "2026-09-07T12:00:00.000Z",

  now: () => "2026-09-07T12:01:00.000Z",
});

console.dir(thrownResult, {
  depth: null,
});

/*
 * =================================================
 * UNRECOGNIZED EXECUTION STATUS
 * =================================================
 */

const unrecognizedOutcomeInputs = [];

const unrecognizedRepository = createExecutionRepository({
  recordOutcomeImpl: async (input) => {
    unrecognizedOutcomeInputs.push(input);

    return {
      status: "execution_outcome_recorded",

      execution: {
        executionStatus: input.executionStatus,

        analysisOutcome: input.analysisOutcome,

        failureReason: input.failureReason,
      },
    };
  },
});

console.log("\n===== UNRECOGNIZED METHODOLOGY STATUS =====");

const unrecognizedResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),

  executionRepository: unrecognizedRepository,

  executionLease: createExecutionLease(),

  runMethodology: async () => ({
    executionStatus: "mystery-status",

    resultStatus: "PASS",
  }),

  preparePersistableOutcome: async () => ({
    status: "persistable_outcome_ready",

    outcome: {},
  }),

  createExecutionId: () => "exec_unrecognized_status",

  startedAt: "2026-09-07T12:10:00.000Z",

  now: () => "2026-09-07T12:11:00.000Z",
});

console.dir(unrecognizedResult, {
  depth: null,
});

/*
 * =================================================
 * OUTCOME PREPARATION FAILURE
 * =================================================
 */

const preparationFailureOutcomeInputs = [];

const preparationFailureRepository = createExecutionRepository({
  recordOutcomeImpl: async (input) => {
    preparationFailureOutcomeInputs.push(input);

    return {
      status: "execution_outcome_recorded",

      execution: {
        executionStatus: input.executionStatus,

        failureReason: input.failureReason,
      },
    };
  },
});

console.log("\n===== OUTCOME PREPARATION FAILURE =====");

const preparationFailureResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),

  executionRepository: preparationFailureRepository,

  executionLease: createExecutionLease(),

  runMethodology: async () => ({
    executionStatus: "complete",

    resultStatus: "PASS",
  }),

  preparePersistableOutcome: async () => ({
    status: "persistable_outcome_failed",

    reason: "simulated_redaction_failure",
  }),

  createExecutionId: () => "exec_preparation_failure",

  startedAt: "2026-09-07T12:20:00.000Z",

  now: () => "2026-09-07T12:21:00.000Z",
});

console.dir(preparationFailureResult, {
  depth: null,
});

/*
 * =================================================
 * DURABLE OUTCOME WRITE FAILURE
 * =================================================
 *
 * Methodology succeeds, but authoritative D1
 * result persistence fails.
 *
 * The service must not claim success.
 */

const stateFailureReleaseInputs = [];

const stateFailureRepository = createExecutionRepository({
  recordOutcomeImpl: async () => ({
    status: "execution_outcome_not_recorded",

    reason: "stale_execution_lease_or_execution_not_running",
  }),
});

const stateFailureLease = createExecutionLease({
  releaseImpl: async (input) => {
    stateFailureReleaseInputs.push(input);

    return {
      status: "execution_lease_not_released",

      reason: "stale_execution_lease",
    };
  },
});

console.log("\n===== DURABLE OUTCOME WRITE FAILURE =====");

const stateFailureResult = await executePreparedInvestigation({
  prepared: createPreparedInvestigation(),

  executionRepository: stateFailureRepository,

  executionLease: stateFailureLease,

  runMethodology: async () => ({
    executionStatus: "partial",

    resultStatus: "UNKNOWN",

    limitations: ["fixture limitation"],
  }),

  preparePersistableOutcome: async ({ methodologyResult }) => ({
    status: "persistable_outcome_ready",

    reason: null,

    outcome: methodologyResult,

    failureReason: null,
  }),

  createExecutionId: () => "exec_state_failure",

  startedAt: "2026-09-07T12:30:00.000Z",

  now: () => "2026-09-07T12:31:00.000Z",
});

console.dir(stateFailureResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  missingDependenciesRejected:
    missingDependenciesResult.status === "prepared_execution_not_ready",

  missingRunnerRejected:
    missingRunnerResult.status === "prepared_execution_not_ready" &&
    missingRunnerResult.reason === "methodology_runner_required",

  missingPreparerRejected:
    missingPreparerResult.status === "prepared_execution_not_ready" &&
    missingPreparerResult.reason === "persistable_outcome_preparer_required",

  invalidPreparedRejected:
    invalidPreparedResult.status === "prepared_execution_rejected",

  happyExecutionFinished: happyResult.status === "prepared_execution_finished",

  happyExecutionIdCorrect: happyResult.executionId === "exec_happy_path",

  happyAttemptCorrect: happyResult.attempt === 1,

  happyDurableStatusComplete: happyResult.executionStatus === "COMPLETE",

  happyNotPublished: happyResult.publicationState === "NOT_PUBLISHED",

  durableRunningExecutionCreated:
    happyCreateInputs.length === 1 &&
    happyCreateInputs[0].executionId === "exec_happy_path" &&
    happyCreateInputs[0].investigationId === investigationId &&
    happyCreateInputs[0].leaseToken === leaseToken &&
    happyCreateInputs[0].attempt === 1,

  frozenTargetPassedToMethodology:
    happyMethodologyInputs.length === 1 &&
    happyMethodologyInputs[0].target?.status === "target_frozen",

  heartbeatCalled: happyHeartbeatInputs.length === 1,

  heartbeatUsesCorrectLease: happyHeartbeatInputs[0]?.leaseToken === leaseToken,

  heartbeatExpiryExtendedFiveMinutes:
    happyHeartbeatInputs[0]?.heartbeatAt === "2026-09-07T11:17:00.000Z" &&
    happyHeartbeatInputs[0]?.expiresAt === "2026-09-07T11:22:00.000Z",

  outcomePreparerCalled: happyPreparerInputs.length === 1,

  rawSensitiveEvidenceNotPersisted:
    happyOutcomeInputs[0]?.analysisOutcome?.evidence?.[0]?.sensitiveValue ===
    undefined,

  preparedOutcomePersisted:
    happyOutcomeInputs[0]?.analysisOutcome?.evidence?.[0]?.redacted === true,

  completeOutcomePersisted:
    happyOutcomeInputs[0]?.executionStatus === "COMPLETE",

  happyLeaseReleased:
    happyReleaseInputs.length === 1 &&
    happyReleaseInputs[0].leaseToken === leaseToken,

  methodologyThrowSurfaced:
    thrownResult.status === "prepared_execution_failed" &&
    thrownResult.reason === "methodology_execution_failed",

  methodologyThrowPersistedAsFailed:
    thrownOutcomeInputs.length === 1 &&
    thrownOutcomeInputs[0].executionStatus === "FAILED",

  methodologyThrowDidNotInventUnknown:
    thrownOutcomeInputs[0]?.analysisOutcome === null,

  methodologyThrowLeaseReleased: thrownReleaseInputs.length === 1,

  unrecognizedStatusFailsClosed:
    unrecognizedResult.status === "prepared_execution_failed" &&
    unrecognizedResult.reason === "methodology_execution_status_unrecognized",

  unrecognizedStatusPersistedFailed:
    unrecognizedOutcomeInputs[0]?.executionStatus === "FAILED",

  preparationFailureSurfaced:
    preparationFailureResult.status === "prepared_execution_failed" &&
    preparationFailureResult.reason === "analysis_outcome_preparation_failed",

  preparationFailurePersistedFailed:
    preparationFailureOutcomeInputs[0]?.executionStatus === "FAILED",

  stateFailureSurfaced:
    stateFailureResult.status === "prepared_execution_state_failed" &&
    stateFailureResult.reason === "execution_outcome_not_recorded",

  stateFailureNotPublished:
    stateFailureResult.status !== "prepared_execution_finished",

  stateFailureReleaseAttempted: stateFailureReleaseInputs.length === 1,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== EXECUTE PREPARED INVESTIGATION TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Execute prepared investigation test failed.");
}

console.log("\n===== EXECUTE PREPARED INVESTIGATION TEST PASSED =====");
