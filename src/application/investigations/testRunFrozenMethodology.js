/*
 * Run Frozen Methodology Test
 *
 * Tests:
 *
 *   runFrozenMethodology()
 *
 * This is an application-level unit test.
 *
 * It does NOT contact:
 *
 * - GitHub
 * - Technocore
 * - Cloudflare
 * - D1
 * - the real Methodology checks
 *
 *
 * We verify:
 *
 * 1. missing target is rejected
 * 2. incomplete frozen source is rejected
 * 3. Methodology identity mismatch fails closed
 * 4. Technocore reference version mismatch fails
 * 5. reference repository identity mismatch fails
 * 6. reference coordinates mismatch fails
 * 7. reference commit mismatch fails
 * 8. reference tree mismatch fails
 * 9. reference canonical URL mismatch fails
 * 10. missing frozen registry digest fails
 * 11. registry digest mismatch fails
 *
 * Execution ownership:
 *
 * 12. heartbeat is required
 * 13. source assessment does not begin when the
 *     first heartbeat fails
 * 14. unsupported frozen source fails
 * 15. second heartbeat occurs before Methodology
 * 16. Methodology is not called if second heartbeat
 *     fails
 * 17. Methodology throw becomes operational failure
 * 18. third heartbeat occurs after Methodology
 * 19. result is rejected if post-Methodology
 *     heartbeat fails
 *
 * Methodology bridge:
 *
 * 20. frozen source assessment is injected into the
 *     existing Methodology runner
 * 21. owner/repo come from frozen target
 * 22. injected source assessor refuses different
 *     coordinates
 * 23. methodology_not_run is rejected
 * 24. unrecognized execution status is rejected
 *
 * Happy path:
 *
 * 25. existing Methodology result is preserved
 * 26. COMPLETE/PASS semantics are preserved
 * 27. three lease heartbeats occur
 * 28. frozen execution provenance is returned
 * 29. Methodology identity provenance is preserved
 * 30. source repo/commit/tree provenance is preserved
 * 31. Technocore reference provenance is preserved
 * 32. registry digest provenance is preserved
 */

import { runFrozenMethodology } from "./runFrozenMethodology.js";

/*
 * ------------------------------------------------
 * Fixture identities
 * ------------------------------------------------
 */

const SOURCE_REPOSITORY_ID = "42424242";

const SOURCE_COMMIT_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SOURCE_TREE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const TECHNOCORE_REPOSITORY_ID = "1332656411";

const TECHNOCORE_COMMIT_SHA = "9861d01cb42e10a5ffdffe3880338feaa4f56b3f";

const TECHNOCORE_TREE_SHA = "89db587b5c598697451e77f387ef5b9d1d9f9ef7";

const REGISTRY_DIGEST = "fixture-registry-digest-001";

/*
 * ------------------------------------------------
 * Current Methodology / registry fixtures
 * ------------------------------------------------
 */

const currentMethodologyIdentity = {
  id: "kivanta-scout-methodology",

  version: "1.0",
};

const currentReferenceRegistry = {
  technocore: {
    version: "1.0",

    sourceRepo: {
      owner: "flop-labs",

      repo: "technocore-chat",

      canonicalUrl: "https://github.com/flop-labs/technocore-chat",

      repositoryId: Number(TECHNOCORE_REPOSITORY_ID),

      defaultBranch: "main",

      commitSha: TECHNOCORE_COMMIT_SHA,

      treeSha: TECHNOCORE_TREE_SHA,
    },

    repoSurfaces: ["scripts/sign.py", "SKILL.md", "src/manifest.py"],

    liveReference: {
      origin: "https://technocore.chat",

      surfaces: [
        "/llms.txt",
        "/skill.md",
        "/patterns.md",
        "/.well-known/agent.json",
        "/openapi.json",
      ],
    },
  },
};

/*
 * ------------------------------------------------
 * Frozen target fixture
 * ------------------------------------------------
 */

function createFrozenTarget() {
  return {
    frozenAt: "2026-09-07T12:00:00.000Z",

    source: {
      repositoryId: SOURCE_REPOSITORY_ID,

      owner: "kivanta",

      repo: "fixture-agent",

      canonicalUrl: "https://github.com/kivanta/fixture-agent",

      defaultBranch: "main",

      commitSha: SOURCE_COMMIT_SHA,

      treeSha: SOURCE_TREE_SHA,
    },

    methodology: {
      id: "kivanta-scout-methodology",

      version: "1.0",
    },

    technocoreReference: {
      registryVersion: "1.0",

      repositoryId: TECHNOCORE_REPOSITORY_ID,

      owner: "flop-labs",

      repo: "technocore-chat",

      canonicalUrl: "https://github.com/flop-labs/technocore-chat",

      commitSha: TECHNOCORE_COMMIT_SHA,

      treeSha: TECHNOCORE_TREE_SHA,
    },

    referenceRegistryDigest: {
      algorithm: "SHA-256",

      canonicalization: "scout-stable-json-v1",

      value: REGISTRY_DIGEST,
    },
  };
}

/*
 * ------------------------------------------------
 * Frozen source assessment fixture
 * ------------------------------------------------
 */

function createFrozenSourceAssessment() {
  return {
    status: "supported_source",

    reason: null,

    methodologyEligible: true,

    repository: {
      repositoryId: Number(SOURCE_REPOSITORY_ID),

      fullName: "kivanta/fixture-agent",

      defaultBranch: "future-moving-branch",

      archived: false,

      commitSha: SOURCE_COMMIT_SHA,

      treeSha: SOURCE_TREE_SHA,
    },

    tree: {
      status: "tree_found",

      truncated: false,

      items: [
        {
          path: "agent.py",

          type: "blob",
        },
      ],
    },

    python: {
      status: "python_surfaces_found",
    },

    technocoreEvidence: {
      status: "technocore_evidence_found",
    },

    toolIdentity: {
      status: "single_tool_identified",
    },

    frozenSnapshot: {
      repositoryId: SOURCE_REPOSITORY_ID,

      commitSha: SOURCE_COMMIT_SHA,

      treeSha: SOURCE_TREE_SHA,
    },
  };
}

/*
 * ------------------------------------------------
 * Successful Methodology fixture
 * ------------------------------------------------
 */

function createMethodologyResult() {
  return {
    status: "methodology_run",

    executionStatus: "complete",

    resultStatus: "PASS",

    sourceAssessment: createFrozenSourceAssessment(),

    checks: [
      {
        checkId: "check-1",

        status: "PASS",
      },

      {
        checkId: "check-2",

        status: "PASS",
      },

      {
        checkId: "check-3",

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

    aggregation: {
      status: "methodology_aggregated",

      counts: {
        PASS: 5,
      },

      unknownChecks: [],

      cautionChecks: [],

      notApplicableChecks: [],

      partialChecks: [],

      failedChecks: [],

      notRunChecks: [],
    },
  };
}

/*
 * ------------------------------------------------
 * Dependency helper
 * ------------------------------------------------
 */

function createDependencies({
  methodologyRunnerImpl,

  frozenSourceAssessorImpl,

  methodologyIdentityOverride,

  referenceRegistryOverride,

  registryDigestCreatorImpl,
} = {}) {
  return {
    methodologyRunner:
      methodologyRunnerImpl || (async () => createMethodologyResult()),

    frozenSourceAssessor:
      frozenSourceAssessorImpl || (async () => createFrozenSourceAssessment()),

    currentMethodologyIdentity:
      methodologyIdentityOverride || currentMethodologyIdentity,

    currentReferenceRegistry:
      referenceRegistryOverride || currentReferenceRegistry,

    registryDigestCreator:
      registryDigestCreatorImpl ||
      (async () => ({
        algorithm: "SHA-256",

        canonicalization: "scout-stable-json-v1",

        value: REGISTRY_DIGEST,
      })),
  };
}

/*
 * ------------------------------------------------
 * Heartbeat helper
 * ------------------------------------------------
 */

function createHeartbeat({ results, calls } = {}) {
  let index = 0;

  return async () => {
    if (calls) {
      calls.push(index + 1);
    }

    const result = results?.[index];

    index += 1;

    if (result) {
      return result;
    }

    return {
      status: "execution_lease_renewed",

      reason: null,
    };
  };
}

/*
 * =================================================
 * TEST 1
 * Missing frozen target
 * =================================================
 */

console.log("\n===== MISSING FROZEN TARGET =====");

const missingTargetResult = await runFrozenMethodology(
  {},
  createDependencies(),
);

console.dir(missingTargetResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 2
 * Incomplete frozen source
 * =================================================
 */

console.log("\n===== INCOMPLETE FROZEN SOURCE =====");

const incompleteSourceTarget = createFrozenTarget();

delete incompleteSourceTarget.source.commitSha;

const incompleteSourceResult = await runFrozenMethodology(
  {
    target: incompleteSourceTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(incompleteSourceResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 3
 * Methodology identity mismatch
 * =================================================
 */

console.log("\n===== METHODOLOGY IDENTITY MISMATCH =====");

const methodologyMismatchTarget = createFrozenTarget();

methodologyMismatchTarget.methodology.version = "0.9";

const methodologyMismatchResult = await runFrozenMethodology(
  {
    target: methodologyMismatchTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(methodologyMismatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 4
 * Reference version mismatch
 * =================================================
 */

console.log("\n===== REFERENCE VERSION MISMATCH =====");

const referenceVersionTarget = createFrozenTarget();

referenceVersionTarget.technocoreReference.registryVersion = "0.9";

const referenceVersionResult = await runFrozenMethodology(
  {
    target: referenceVersionTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(referenceVersionResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 5
 * Reference repository identity mismatch
 * =================================================
 */

console.log("\n===== REFERENCE REPOSITORY IDENTITY MISMATCH =====");

const referenceRepositoryTarget = createFrozenTarget();

referenceRepositoryTarget.technocoreReference.repositoryId = "999999999";

const referenceRepositoryResult = await runFrozenMethodology(
  {
    target: referenceRepositoryTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(referenceRepositoryResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 6
 * Reference coordinates mismatch
 * =================================================
 */

console.log("\n===== REFERENCE COORDINATES MISMATCH =====");

const referenceCoordinatesTarget = createFrozenTarget();

referenceCoordinatesTarget.technocoreReference.repo =
  "different-technocore-repo";

const referenceCoordinatesResult = await runFrozenMethodology(
  {
    target: referenceCoordinatesTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(referenceCoordinatesResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 7
 * Reference commit mismatch
 * =================================================
 */

console.log("\n===== REFERENCE COMMIT MISMATCH =====");

const referenceCommitTarget = createFrozenTarget();

referenceCommitTarget.technocoreReference.commitSha =
  "cccccccccccccccccccccccccccccccccccccccc";

const referenceCommitResult = await runFrozenMethodology(
  {
    target: referenceCommitTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(referenceCommitResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 8
 * Reference tree mismatch
 * =================================================
 */

console.log("\n===== REFERENCE TREE MISMATCH =====");

const referenceTreeTarget = createFrozenTarget();

referenceTreeTarget.technocoreReference.treeSha =
  "dddddddddddddddddddddddddddddddddddddddd";

const referenceTreeResult = await runFrozenMethodology(
  {
    target: referenceTreeTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(referenceTreeResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 9
 * Reference canonical URL mismatch
 * =================================================
 */

console.log("\n===== REFERENCE CANONICAL URL MISMATCH =====");

const referenceUrlTarget = createFrozenTarget();

referenceUrlTarget.technocoreReference.canonicalUrl =
  "https://github.com/example/different-reference";

const referenceUrlResult = await runFrozenMethodology(
  {
    target: referenceUrlTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(referenceUrlResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 10
 * Missing frozen registry digest
 * =================================================
 */

console.log("\n===== MISSING FROZEN REGISTRY DIGEST =====");

const missingDigestTarget = createFrozenTarget();

delete missingDigestTarget.referenceRegistryDigest;

const missingDigestResult = await runFrozenMethodology(
  {
    target: missingDigestTarget,

    heartbeat: createHeartbeat(),
  },

  createDependencies(),
);

console.dir(missingDigestResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 11
 * Registry digest mismatch
 * =================================================
 */

console.log("\n===== REGISTRY DIGEST MISMATCH =====");

const digestMismatchResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat(),
  },

  createDependencies({
    registryDigestCreatorImpl: async () => ({
      algorithm: "SHA-256",

      canonicalization: "scout-stable-json-v1",

      value: "different-registry-digest",
    }),
  }),
);

console.dir(digestMismatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 12–13
 * First heartbeat failure
 * =================================================
 */

console.log("\n===== FIRST HEARTBEAT FAILURE =====");

let firstHeartbeatAssessorCalls = 0;

const firstHeartbeatFailureResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat({
      results: [
        {
          status: "execution_lease_not_renewed",

          reason: "stale_execution_lease",
        },
      ],
    }),
  },

  createDependencies({
    frozenSourceAssessorImpl: async () => {
      firstHeartbeatAssessorCalls += 1;

      return createFrozenSourceAssessment();
    },
  }),
);

console.dir(firstHeartbeatFailureResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 14
 * Unsupported frozen source
 * =================================================
 */

console.log("\n===== FROZEN SOURCE NOT SUPPORTED =====");

const unsupportedSourceResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat(),
  },

  createDependencies({
    frozenSourceAssessorImpl: async () => ({
      status: "unsupported_source",

      reason: "single_supported_tool_not_established",
    }),
  }),
);

console.dir(unsupportedSourceResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 15–16
 * Second heartbeat failure
 * =================================================
 */

console.log("\n===== SECOND HEARTBEAT FAILURE =====");

let secondHeartbeatMethodologyCalls = 0;

const secondHeartbeatCalls = [];

const secondHeartbeatFailureResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat({
      calls: secondHeartbeatCalls,

      results: [
        {
          status: "execution_lease_renewed",
        },

        {
          status: "execution_lease_not_renewed",

          reason: "stale_execution_lease",
        },
      ],
    }),
  },

  createDependencies({
    methodologyRunnerImpl: async () => {
      secondHeartbeatMethodologyCalls += 1;

      return createMethodologyResult();
    },
  }),
);

console.dir(secondHeartbeatFailureResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 17
 * Methodology throw
 * =================================================
 */

console.log("\n===== METHODOLOGY THROW =====");

const methodologyThrowResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat(),
  },

  createDependencies({
    methodologyRunnerImpl: async () => {
      throw new Error("simulated methodology failure");
    },
  }),
);

console.dir(methodologyThrowResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 18–19
 * Third heartbeat failure
 * =================================================
 */

console.log("\n===== POST-METHODOLOGY HEARTBEAT FAILURE =====");

const thirdHeartbeatCalls = [];

let thirdHeartbeatMethodologyCalls = 0;

const thirdHeartbeatFailureResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat({
      calls: thirdHeartbeatCalls,

      results: [
        {
          status: "execution_lease_renewed",
        },

        {
          status: "execution_lease_renewed",
        },

        {
          status: "execution_lease_not_renewed",

          reason: "stale_execution_lease",
        },
      ],
    }),
  },

  createDependencies({
    methodologyRunnerImpl: async () => {
      thirdHeartbeatMethodologyCalls += 1;

      return createMethodologyResult();
    },
  }),
);

console.dir(thirdHeartbeatFailureResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 20–22
 * Methodology source-assessor injection
 * =================================================
 */

console.log("\n===== METHOD SOURCE ASSESSOR INJECTION =====");

const injectionFrozenAssessment = createFrozenSourceAssessment();

const injectionMethodologyCalls = [];

let coordinateMismatchResult = null;

const injectionResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat(),
  },

  createDependencies({
    frozenSourceAssessorImpl: async () => injectionFrozenAssessment,

    methodologyRunnerImpl: async (owner, repo, options) => {
      injectionMethodologyCalls.push({
        owner,
        repo,
        options,
      });

      /*
       * This is what the real runMethodology()
       * does internally.
       */
      const injectedAssessment = await options.sourceAssessor(owner, repo);

      /*
       * Also verify the injected source assessor
       * refuses coordinates other than the exact
       * frozen target.
       */
      coordinateMismatchResult = await options.sourceAssessor(
        "different-owner",
        "different-repo",
      );

      if (injectedAssessment !== injectionFrozenAssessment) {
        throw new Error("Injected frozen assessment was not returned.");
      }

      return createMethodologyResult();
    },
  }),
);

console.dir(injectionResult, {
  depth: null,
});

console.log("\n===== INJECTED COORDINATE MISMATCH =====");

console.dir(coordinateMismatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 23
 * Existing Methodology reports not-run
 * =================================================
 */

console.log("\n===== METHODOLOGY NOT RUN =====");

const methodologyNotRunResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat(),
  },

  createDependencies({
    methodologyRunnerImpl: async () => ({
      status: "methodology_not_run",

      reason: "fixture_methodology_not_run",

      checks: [],
    }),
  }),
);

console.dir(methodologyNotRunResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 24
 * Unrecognized execution status
 * =================================================
 */

console.log("\n===== UNRECOGNIZED EXECUTION STATUS =====");

const unrecognizedStatusResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat(),
  },

  createDependencies({
    methodologyRunnerImpl: async () => ({
      status: "methodology_run",

      executionStatus: "mystery",

      resultStatus: "PASS",

      checks: [],
    }),
  }),
);

console.dir(unrecognizedStatusResult, {
  depth: null,
});

/*
 * =================================================
 * HAPPY PATH
 * =================================================
 */

console.log("\n===== HAPPY FROZEN METHODOLOGY =====");

const happyHeartbeatCalls = [];

const happySourceAssessorCalls = [];

const happyMethodologyCalls = [];

const happySourceAssessment = createFrozenSourceAssessment();

const happyMethodologyResult = createMethodologyResult();

const happyResult = await runFrozenMethodology(
  {
    target: createFrozenTarget(),

    heartbeat: createHeartbeat({
      calls: happyHeartbeatCalls,
    }),
  },

  createDependencies({
    frozenSourceAssessorImpl: async (target) => {
      happySourceAssessorCalls.push(target);

      return happySourceAssessment;
    },

    methodologyRunnerImpl: async (owner, repo, options) => {
      happyMethodologyCalls.push({
        owner,
        repo,
        options,
      });

      /*
       * Simulate the existing Methodology engine
       * asking its sourceAssessor dependency for
       * the source assessment.
       */
      const sourceAssessment = await options.sourceAssessor(owner, repo);

      if (sourceAssessment !== happySourceAssessment) {
        throw new Error("Happy path did not receive frozen source assessment.");
      }

      return happyMethodologyResult;
    },
  }),
);

console.dir(happyResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  /*
   * Target validation
   */
  missingTargetRejected:
    missingTargetResult.status === "frozen_methodology_not_run" &&
    missingTargetResult.reason === "frozen_target_required" &&
    missingTargetResult.executionStatus === "failed",

  incompleteSourceRejected:
    incompleteSourceResult.status === "frozen_methodology_not_run" &&
    incompleteSourceResult.reason === "frozen_source_snapshot_not_available",

  /*
   * Methodology identity
   */
  methodologyMismatchRejected:
    methodologyMismatchResult.status === "frozen_methodology_not_run" &&
    methodologyMismatchResult.reason === "frozen_methodology_identity_mismatch",

  methodologyMismatchIsOperationalFailure:
    methodologyMismatchResult.executionStatus === "failed" &&
    methodologyMismatchResult.resultStatus === null,

  /*
   * Reference identity
   */
  referenceVersionMismatchRejected:
    referenceVersionResult.reason === "frozen_reference_version_mismatch",

  referenceRepositoryMismatchRejected:
    referenceRepositoryResult.reason ===
    "frozen_reference_repository_identity_mismatch",

  referenceCoordinatesMismatchRejected:
    referenceCoordinatesResult.reason ===
    "frozen_reference_coordinates_mismatch",

  referenceCommitMismatchRejected:
    referenceCommitResult.reason === "frozen_reference_commit_mismatch",

  referenceTreeMismatchRejected:
    referenceTreeResult.reason === "frozen_reference_tree_mismatch",

  referenceCanonicalUrlMismatchRejected:
    referenceUrlResult.reason === "frozen_reference_canonical_url_mismatch",

  /*
   * Registry digest
   */
  missingFrozenDigestRejected:
    missingDigestResult.reason === "frozen_reference_registry_digest_required",

  registryDigestMismatchRejected:
    digestMismatchResult.reason === "frozen_reference_registry_digest_mismatch",

  digestMismatchReturnsExpectedDigest:
    digestMismatchResult.expectedDigest?.value === REGISTRY_DIGEST,

  digestMismatchReturnsCurrentDigest:
    digestMismatchResult.currentDigest?.value === "different-registry-digest",

  /*
   * First heartbeat
   */
  firstHeartbeatFailureRejected:
    firstHeartbeatFailureResult.reason === "execution_lease_not_renewed",

  firstHeartbeatFailurePreventsAssessment: firstHeartbeatAssessorCalls === 0,

  /*
   * Frozen source support
   */
  unsupportedFrozenSourceRejected:
    unsupportedSourceResult.status === "frozen_methodology_not_run" &&
    unsupportedSourceResult.reason === "single_supported_tool_not_established",

  unsupportedSourceDoesNotInventUnknown:
    unsupportedSourceResult.resultStatus === null &&
    unsupportedSourceResult.executionStatus === "failed",

  /*
   * Second heartbeat
   */
  secondHeartbeatAttempted: secondHeartbeatCalls.length === 2,

  secondHeartbeatFailureRejected:
    secondHeartbeatFailureResult.reason === "execution_lease_not_renewed",

  secondHeartbeatFailurePreventsMethodology:
    secondHeartbeatMethodologyCalls === 0,

  /*
   * Methodology exception
   */
  methodologyThrowRejected:
    methodologyThrowResult.status === "frozen_methodology_not_run" &&
    methodologyThrowResult.reason === "methodology_execution_failed",

  methodologyThrowIsFailedNotUnknown:
    methodologyThrowResult.executionStatus === "failed" &&
    methodologyThrowResult.resultStatus === null,

  methodologyThrowErrorPreserved:
    methodologyThrowResult.error === "simulated methodology failure",

  /*
   * Third heartbeat
   */
  methodologyRanBeforeThirdHeartbeatFailure:
    thirdHeartbeatMethodologyCalls === 1,

  threeHeartbeatBoundariesReached: thirdHeartbeatCalls.length === 3,

  thirdHeartbeatFailureRejected:
    thirdHeartbeatFailureResult.reason === "execution_lease_not_renewed",

  /*
   * Source-assessor injection
   */
  injectionMethodologyCalledOnce: injectionMethodologyCalls.length === 1,

  frozenOwnerPassedToMethodology:
    injectionMethodologyCalls[0]?.owner === "kivanta",

  frozenRepoPassedToMethodology:
    injectionMethodologyCalls[0]?.repo === "fixture-agent",

  sourceAssessorInjected:
    typeof injectionMethodologyCalls[0]?.options?.sourceAssessor === "function",

  injectedSourceAssessorRefusesOtherCoordinates:
    coordinateMismatchResult?.status === "source_not_established" &&
    coordinateMismatchResult?.reason ===
      "methodology_source_coordinates_mismatch",

  injectionPathStillSucceeds: injectionResult.status === "methodology_run",

  /*
   * Existing Methodology failure modes
   */
  methodologyNotRunRejected:
    methodologyNotRunResult.status === "frozen_methodology_not_run" &&
    methodologyNotRunResult.reason === "fixture_methodology_not_run",

  methodologyNotRunIsOperationalFailure:
    methodologyNotRunResult.executionStatus === "failed" &&
    methodologyNotRunResult.resultStatus === null,

  unrecognizedExecutionStatusRejected:
    unrecognizedStatusResult.status === "frozen_methodology_not_run" &&
    unrecognizedStatusResult.reason ===
      "methodology_execution_status_unrecognized",

  /*
   * Happy path
   */
  happyMethodologyCompleted: happyResult.status === "methodology_run",

  happyExecutionStatusPreserved: happyResult.executionStatus === "complete",

  happyResultStatusPreserved: happyResult.resultStatus === "PASS",

  happyChecksPreserved: happyResult.checks === happyMethodologyResult.checks,

  happyAggregationPreserved:
    happyResult.aggregation === happyMethodologyResult.aggregation,

  frozenSourceAssessmentCalledOnce: happySourceAssessorCalls.length === 1,

  frozenTargetPassedToSourceAssessment:
    happySourceAssessorCalls[0]?.source?.commitSha === SOURCE_COMMIT_SHA,

  methodologyCalledOnce: happyMethodologyCalls.length === 1,

  happyThreeHeartbeats: happyHeartbeatCalls.length === 3,

  /*
   * Frozen execution provenance
   */
  frozenExecutionReturned: happyResult.frozenExecution !== undefined,

  frozenMethodologyIdentityPreserved:
    happyResult.frozenExecution?.methodology?.id ===
      "kivanta-scout-methodology" &&
    happyResult.frozenExecution?.methodology?.version === "1.0",

  frozenSourceRepositoryPreserved:
    happyResult.frozenExecution?.source?.repositoryId === SOURCE_REPOSITORY_ID,

  frozenSourceCoordinatesPreserved:
    happyResult.frozenExecution?.source?.owner === "kivanta" &&
    happyResult.frozenExecution?.source?.repo === "fixture-agent",

  frozenSourceCommitPreserved:
    happyResult.frozenExecution?.source?.commitSha === SOURCE_COMMIT_SHA,

  frozenSourceTreePreserved:
    happyResult.frozenExecution?.source?.treeSha === SOURCE_TREE_SHA,

  technocoreReferenceVersionPreserved:
    happyResult.frozenExecution?.technocoreReference?.registryVersion === "1.0",

  technocoreRepositoryIdentityPreserved:
    happyResult.frozenExecution?.technocoreReference?.repositoryId ===
    TECHNOCORE_REPOSITORY_ID,

  technocoreCommitPreserved:
    happyResult.frozenExecution?.technocoreReference?.commitSha ===
    TECHNOCORE_COMMIT_SHA,

  technocoreTreePreserved:
    happyResult.frozenExecution?.technocoreReference?.treeSha ===
    TECHNOCORE_TREE_SHA,

  registryDigestAlgorithmPreserved:
    happyResult.frozenExecution?.referenceRegistryDigest?.algorithm ===
    "SHA-256",

  registryCanonicalizationPreserved:
    happyResult.frozenExecution?.referenceRegistryDigest?.canonicalization ===
    "scout-stable-json-v1",

  registryDigestValuePreserved:
    happyResult.frozenExecution?.referenceRegistryDigest?.value ===
    REGISTRY_DIGEST,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== RUN FROZEN METHODOLOGY TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Run frozen Methodology test failed.");
}

console.log("\n===== RUN FROZEN METHODOLOGY TEST PASSED =====");
