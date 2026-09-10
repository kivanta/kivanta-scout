import assert from "node:assert/strict";

import { getScoutInvestigationResult } from "./getScoutInvestigationResult.js";

/*
 * Kivanta Scout
 * Get Scout Investigation Result
 *
 * Focused application-boundary regression test.
 *
 * We deliberately use small in-memory repository
 * doubles here.
 *
 * No D1.
 * No Queue.
 * No network.
 */

/*
 * ------------------------------------------------
 * Fixtures
 * ------------------------------------------------
 */

const investigationId = "inv_public_result_001";

const completeInvestigation = {
  investigationId,

  lifecycleState: "COMPLETE",

  createdAt: "2026-09-10T10:00:00.000Z",

  updatedAt: "2026-09-10T10:01:00.000Z",

  /*
   * Internal fields intentionally exist so the
   * test proves the public service does not return
   * them.
   */
  failureReason: "must_not_escape",

  reviewKey: {
    secretInternalReviewIdentity: true,
  },

  target: {
    secretInternalFrozenTarget: true,
  },
};

const fiveChecks = [
  {
    title: "What does this tool actually do?",

    status: "UNKNOWN",

    conclusion: "Behavior remains unresolved.",

    reason: null,

    evidence: [
      {
        category: "behavior",

        labels: ["room_api"],

        observationCount: 1,

        examples: [
          {
            path: "main.py",

            line: 12,

            label: "room_api",

            sourceExcerptPersisted: false,
          },
        ],
      },
    ],
  },

  {
    title: "Your Key, Password & Sensitive Information",

    status: "UNKNOWN",

    conclusion: null,

    reason: "insufficient_evidence",

    limitation: null,

    lifecycle: {
      sensitiveInput: true,

      sensitiveStorage: false,

      sensitiveTransmission: false,

      sensitiveExposure: false,

      sensitiveProcessUse: false,
    },

    evidence: [],
  },

  {
    title: "Where Does It Connect?",

    status: "PASS",

    conclusion: "Observed destinations were established.",

    reason: null,

    limitation: null,

    mechanisms: ["https"],

    destinations: [
      {
        url: "https://example.com",

        host: "example.com",

        technocore: false,

        evidence: [
          {
            path: "main.py",

            line: 20,

            label: "remote",

            sourceExcerptPersisted: false,
          },
        ],
      },
    ],

    externalDestinations: [],
  },

  {
    title: "Does It Match the Official Technocore Reference?",

    status: "UNKNOWN",

    conclusion: null,

    reason: "comparison_unresolved",

    limitation: null,

    authority: {
      registryVersion: "1",

      repositoryId: "1332656411",

      owner: "flop-labs",

      repo: "technocore-chat",

      canonicalUrl: "https://github.com/flop-labs/technocore-chat",

      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

      treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",

      surfaces: ["room_api"],
    },

    dimensions: [],

    differences: [],

    unresolved: [],
  },

  {
    title: "What Should I Know Before I Use It?",

    status: "UNKNOWN",

    conclusion: "A material fact remains unresolved.",

    reason: null,

    limitation: null,

    considerations: [
      {
        type: "material_fact",

        sourceCheck: "What does this tool actually do?",

        sourceStatus: "UNKNOWN",

        kind: "limitation",

        text: "Behavior remains unresolved.",
      },
    ],

    unresolved: [],

    materialConcerns: [],

    precautions: [],
  },
];

const analysisOutcome = {
  schema: "scout-methodology-outcome-v1",

  status: "methodology_run",

  executionStatus: "complete",

  resultStatus: "UNKNOWN",

  checks: fiveChecks,

  aggregation: {
    status: "aggregation_ready",

    counts: {
      PASS: 1,

      UNKNOWN: 4,
    },

    unknownChecks: [],

    cautionChecks: [],

    notApplicableChecks: [],

    partialChecks: [],

    failedChecks: [],

    notRunChecks: [],
  },

  frozenExecution: {
    methodology: {
      id: "kivanta-scout-methodology",

      version: "1.0",
    },

    source: {
      repositoryId: "1363107590",

      owner: "kivanta",

      repo: "scout-v1-fixture",

      commitSha: "a301eb9936cb0de0d7eaddf107fd45405edc0a40",

      treeSha: "cccccccccccccccccccccccccccccccccccccccc",
    },

    technocoreReference: {
      registryVersion: "1",

      repositoryId: "1332656411",

      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

      treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },

    referenceRegistryDigest: {
      algorithm: "sha256",

      canonicalization: "json",

      value: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    },
  },
};

const completeExecution = {
  executionId: "exec_internal_secret",

  investigationId,

  leaseToken: "lease_token_must_not_escape",

  attempt: 7,

  executionStatus: "COMPLETE",

  startedAt: "2026-09-10T10:00:30.000Z",

  completedAt: "2026-09-10T10:01:00.000Z",

  analysisOutcome,

  failureReason: "internal_failure_must_not_escape",

  createdAt: "2026-09-10T10:00:30.000Z",

  updatedAt: "2026-09-10T10:01:00.000Z",
};

/*
 * ------------------------------------------------
 * Repository doubles
 * ------------------------------------------------
 */

function createInvestigationRepository({
  investigation = completeInvestigation,
  status = "investigation_found",
} = {}) {
  return {
    async claimActiveInvestigation() {
      throw new Error("not used");
    },

    async getInvestigation() {
      if (status === "investigation_not_found") {
        return {
          status: "investigation_not_found",

          reason: null,

          investigation: null,
        };
      }

      return {
        status,

        reason: null,

        investigation,
      };
    },

    async updateInvestigation() {
      throw new Error("not used");
    },
  };
}

function createExecutionRepository({
  execution = completeExecution,
  status = "execution_found",
} = {}) {
  return {
    async createExecution() {
      throw new Error("not used");
    },

    async getExecution() {
      throw new Error("not used");
    },

    async getLatestExecutionForInvestigation() {
      if (status === "execution_not_found") {
        return {
          status: "execution_not_found",

          reason: null,

          execution: null,
        };
      }

      return {
        status,

        reason: null,

        execution,
      };
    },

    async recordExecutionOutcome() {
      throw new Error("not used");
    },
  };
}

/*
 * =================================================
 * TEST 1
 * COMPLETE RESULT
 * =================================================
 */

const ready = await getScoutInvestigationResult(investigationId, {
  investigationRepository: createInvestigationRepository(),

  investigationExecutionRepository: createExecutionRepository(),
});

assert.equal(ready.status, "investigation_result_ready");

assert.equal(ready.investigation.lifecycleState, "COMPLETE");

assert.equal(ready.result.schema, "scout-public-investigation-result-v1");

assert.equal(ready.result.resultStatus, "UNKNOWN");

assert.equal(ready.result.methodology.id, "kivanta-scout-methodology");

assert.equal(ready.result.methodology.version, "1.0");

assert.equal(ready.result.source.repo, "scout-v1-fixture");

assert.equal(
  ready.result.source.commitSha,
  "a301eb9936cb0de0d7eaddf107fd45405edc0a40",
);

assert.equal(ready.result.checks.length, 5);

assert.equal(ready.result.checks[3].status, "UNKNOWN");

assert.equal(ready.result.checks[3].conclusion, null);

/*
 * Internal execution data must not escape.
 */

const readyJson = JSON.stringify(ready);

assert.equal(readyJson.includes("exec_internal_secret"), false);

assert.equal(readyJson.includes("lease_token_must_not_escape"), false);

assert.equal(readyJson.includes("internal_failure_must_not_escape"), false);

assert.equal(readyJson.includes("secretInternalFrozenTarget"), false);

assert.equal(readyJson.includes("secretInternalReviewIdentity"), false);

/*
 * =================================================
 * TEST 2
 * NON-TERMINAL INVESTIGATION
 * =================================================
 */

const notReady = await getScoutInvestigationResult(investigationId, {
  investigationRepository: createInvestigationRepository({
    investigation: {
      ...completeInvestigation,

      lifecycleState: "PREPARING_REVIEW",
    },
  }),

  investigationExecutionRepository: createExecutionRepository(),
});

assert.equal(notReady.status, "result_not_ready");

assert.equal(notReady.result, null);

/*
 * =================================================
 * TEST 3
 * FAILED INVESTIGATION
 * =================================================
 *
 * Operational failure must not become UNKNOWN.
 */

const failed = await getScoutInvestigationResult(investigationId, {
  investigationRepository: createInvestigationRepository({
    investigation: {
      ...completeInvestigation,

      lifecycleState: "FAILED",

      failureReason: "repository_not_available_private_detail",
    },
  }),

  investigationExecutionRepository: createExecutionRepository({
    execution: {
      ...completeExecution,

      executionStatus: "FAILED",
    },
  }),
});

assert.equal(failed.status, "investigation_failed");

assert.equal(failed.result, null);

assert.equal(
  JSON.stringify(failed).includes("repository_not_available_private_detail"),
  false,
);

/*
 * =================================================
 * TEST 4
 * MISSING INVESTIGATION
 * =================================================
 */

const missing = await getScoutInvestigationResult(investigationId, {
  investigationRepository: createInvestigationRepository({
    status: "investigation_not_found",
  }),

  investigationExecutionRepository: createExecutionRepository(),
});

assert.equal(missing.status, "investigation_not_found");

assert.equal(missing.result, null);

/*
 * =================================================
 * TEST 5
 * MALFORMED STORED JSON FALLBACK
 * =================================================
 *
 * The repository can internally produce:
 *
 * {
 *   status: "analysis_outcome_parse_failed",
 *   raw: "..."
 * }
 *
 * The public result boundary must reject it and
 * must never return the raw value.
 */

const malformedRaw = "RAW_INTERNAL_JSON_MUST_NEVER_ESCAPE";

const malformed = await getScoutInvestigationResult(investigationId, {
  investigationRepository: createInvestigationRepository(),

  investigationExecutionRepository: createExecutionRepository({
    execution: {
      ...completeExecution,

      analysisOutcome: {
        status: "analysis_outcome_parse_failed",

        raw: malformedRaw,
      },
    },
  }),
});

assert.equal(malformed.status, "investigation_result_failed");

assert.equal(malformed.reason, "analysis_outcome_not_readable");

assert.equal(malformed.result, null);

assert.equal(JSON.stringify(malformed).includes(malformedRaw), false);

/*
 * =================================================
 * TEST 6
 * PARENT / EXECUTION STATE MISMATCH
 * =================================================
 */

const mismatch = await getScoutInvestigationResult(investigationId, {
  investigationRepository: createInvestigationRepository(),

  investigationExecutionRepository: createExecutionRepository({
    execution: {
      ...completeExecution,

      executionStatus: "PARTIAL",

      analysisOutcome: {
        ...analysisOutcome,

        executionStatus: "partial",
      },
    },
  }),
});

assert.equal(mismatch.status, "investigation_result_failed");

assert.equal(mismatch.reason, "terminal_state_mismatch");

/*
 * =================================================
 * TEST 7
 * EXACT FIVE CHECKS REQUIRED
 * =================================================
 */

const missingCheck = await getScoutInvestigationResult(investigationId, {
  investigationRepository: createInvestigationRepository(),

  investigationExecutionRepository: createExecutionRepository({
    execution: {
      ...completeExecution,

      analysisOutcome: {
        ...analysisOutcome,

        checks: analysisOutcome.checks.slice(0, 4),
      },
    },
  }),
});

assert.equal(missingCheck.status, "investigation_result_failed");

assert.equal(missingCheck.reason, "methodology_1_0_checks_required");

/*
 * =================================================
 * TEST 8
 * INVALID ID
 * =================================================
 */

const invalid = await getScoutInvestigationResult("   ", {
  investigationRepository: createInvestigationRepository(),

  investigationExecutionRepository: createExecutionRepository(),
});

assert.equal(invalid.status, "invalid_request");

assert.equal(invalid.reason, "investigation_id_required");

/*
 * ------------------------------------------------
 * Summary
 * ------------------------------------------------
 */

console.log("\n===== GET SCOUT INVESTIGATION RESULT TEST =====");

console.log({
  completeResultReady: ready.status === "investigation_result_ready",

  fiveChecksProjected: ready.result?.checks?.length === 5,

  nullConclusionPreserved: ready.result?.checks?.[3]?.conclusion === null,

  executionIdHidden: !readyJson.includes("exec_internal_secret"),

  leaseTokenHidden: !readyJson.includes("lease_token_must_not_escape"),

  internalFailureHidden: !readyJson.includes(
    "internal_failure_must_not_escape",
  ),

  nonTerminalBlocked: notReady.status === "result_not_ready",

  failedNotConvertedToUnknown:
    failed.status === "investigation_failed" && failed.result === null,

  malformedRawBlocked:
    malformed.status === "investigation_result_failed" &&
    !JSON.stringify(malformed).includes(malformedRaw),

  stateMismatchRejected: mismatch.reason === "terminal_state_mismatch",

  exactFiveChecksRequired:
    missingCheck.reason === "methodology_1_0_checks_required",

  invalidIdRejected: invalid.status === "invalid_request",
});

console.log("\n===== PUBLIC RESULT BOUNDARY TEST PASSED =====");
