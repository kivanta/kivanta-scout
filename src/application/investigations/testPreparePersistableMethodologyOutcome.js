/*
 * Prepare Persistable Methodology Outcome Test
 *
 * Tests the final trust boundary before Scout
 * Methodology results are allowed into D1.
 *
 *
 * We verify:
 *
 * HAPPY PATH
 *
 * 1. valid Methodology 1.0 result is accepted
 * 2. safe schema is produced
 * 3. execution/result status are preserved
 * 4. all five checks are preserved
 * 5. source excerpts are removed
 * 6. Check 1 evidence references remain useful
 * 7. Check 2 sensitive boolean is preserved
 * 8. Check 3 URL credentials are removed
 * 9. Check 3 path/query/fragment are removed
 * 10. destination host is preserved
 * 11. Check 4 trusted URL query/fragment are removed
 * 12. Check 5 material facts are preserved
 * 13. raw sourceAssessment is NOT persisted
 * 14. arbitrary unknown Methodology fields are dropped
 * 15. arbitrary unknown check fields are dropped
 * 16. frozen execution provenance is preserved
 * 17. output size is measured
 *
 *
 * FAIL-CLOSED BEHAVIOR
 *
 * 18. missing execution context is rejected
 * 19. invalid result status is rejected
 * 20. wrong number of Methodology checks is rejected
 * 21. unknown Methodology check is rejected
 * 22. duplicate Methodology check is rejected
 * 23. missing frozen provenance is rejected
 * 24. source provenance mismatch is rejected
 * 25. registry digest mismatch is rejected
 *
 *
 * OPERATIONAL FAILURE
 *
 * 26. frozen_methodology_not_run can be persisted
 * 27. it remains executionStatus=failed
 * 28. it remains resultStatus=null
 * 29. raw exception text is discarded
 *
 *
 * DEFENSE IN DEPTH
 *
 * 30. high-confidence secret material remaining
 *     after projection is rejected
 * 31. oversized output is rejected
 */

import { preparePersistableMethodologyOutcome } from "./preparePersistableMethodologyOutcome.js";

/*
 * ------------------------------------------------
 * Frozen identities
 * ------------------------------------------------
 */

const SOURCE_REPOSITORY_ID = "42424242";

const SOURCE_COMMIT_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SOURCE_TREE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const TECHNOCORE_REPOSITORY_ID = "1332656411";

const TECHNOCORE_COMMIT_SHA = "9861d01cb42e10a5ffdffe3880338feaa4f56b3f";

const TECHNOCORE_TREE_SHA = "89db587b5c598697451e77f387ef5b9d1d9f9ef7";

const REGISTRY_DIGEST =
  "b0837449b53f4d31bce1a8b8491f16fcd294dfc127382d136241b95bb0793960";

const investigationId = "inv_persistable_fixture";

const executionId = "exec_persistable_fixture";

/*
 * ------------------------------------------------
 * Investigation fixture
 * ------------------------------------------------
 */

function createInvestigation() {
  return {
    investigationId,

    lifecycleState: "PREPARING_REVIEW",

    target: {
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
    },
  };
}

/*
 * ------------------------------------------------
 * Frozen execution fixture
 * ------------------------------------------------
 */

function createFrozenExecution() {
  return {
    methodology: {
      id: "kivanta-scout-methodology",

      version: "1.0",
    },

    source: {
      repositoryId: SOURCE_REPOSITORY_ID,

      owner: "kivanta",

      repo: "fixture-agent",

      commitSha: SOURCE_COMMIT_SHA,

      treeSha: SOURCE_TREE_SHA,
    },

    technocoreReference: {
      registryVersion: "1.0",

      repositoryId: TECHNOCORE_REPOSITORY_ID,

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
 * Check fixtures
 * ------------------------------------------------
 */

function createCheck1() {
  return {
    status: "PASS",

    title: "What does this tool actually do?",

    conclusion: "Source evidence establishes the fixture tool behavior.",

    evidence: [
      {
        category: "identity",

        labels: ["did_key"],

        observationCount: 1,

        examples: [
          {
            path: "src/agent.py",

            line: 18,

            label: "did_key",

            /*
             * MUST NEVER REACH D1.
             */
            excerpt: `private_key = "SUPER-SECRET-FIXTURE-VALUE"`,

            /*
             * Unknown future/raw field.
             * MUST also disappear.
             */
            rawDebug: "should-not-persist",
          },
        ],
      },

      {
        category: "signing",

        labels: ["ed25519"],

        observationCount: 1,

        examples: [
          {
            path: "src/agent.py",

            line: 24,

            label: "ed25519",

            excerpt: "signing_key.sign(payload)",
          },
        ],
      },
    ],

    /*
     * Unknown arbitrary raw property.
     */
    debugRaw: `api_key="CHECK1-RAW-SECRET"`,
  };
}

function createCheck2() {
  return {
    status: "PASS",

    title: "Your Key, Password & Sensitive Information",

    conclusion:
      "Sensitive information handling was established within the inspected source scope.",

    limitation: "PASS is limited to the inspected source evidence.",

    lifecycle: {
      sensitiveInput: true,

      sensitiveStorage: false,

      sensitiveTransmission: false,

      sensitiveExposure: false,

      sensitiveProcessUse: true,

      /*
       * Unknown lifecycle property.
       * MUST not be projected.
       */
      secretDebug: "should-not-persist",
    },

    evidence: [
      {
        category: "input",

        count: 2,

        sensitiveCount: 1,

        labels: ["environment_read", "sensitive_identifier"],

        evidence: [
          {
            path: "src/agent.py",

            line: 31,

            label: "environment_read",

            sensitive: true,

            /*
             * The extractor already redacts this,
             * but the persistence boundary must
             * remove it entirely anyway.
             */
            excerpt: "[sensitive value redacted]",
          },

          {
            path: "src/agent.py",

            line: 33,

            label: "sensitive_identifier",

            sensitive: true,

            excerpt: "[sensitive value redacted]",
          },
        ],
      },
    ],
  };
}

function createCheck3() {
  const unsafeDestination = {
    /*
     * Arbitrary source URL intentionally contains:
     *
     * - username
     * - password
     * - path
     * - query secret
     * - fragment
     */
    url: "https://user:password@example.com/private/api?token=SUPERSECRET123#debug",

    host: "example.com",

    technocore: false,

    evidence: [
      {
        path: "src/network.py",

        line: 44,

        label: "http_url",

        /*
         * Should never persist.
         */
        excerpt: "requests.get(secret_url)",
      },
    ],
  };

  return {
    status: "CAUTION",

    title: "Where Does It Connect?",

    conclusion:
      "The tool communicates with an external destination beyond Technocore.",

    mechanisms: ["http_client"],

    destinations: [
      unsafeDestination,

      {
        url: "https://technocore.chat/r/example",

        host: "technocore.chat",

        technocore: true,

        evidence: [
          {
            path: "src/network.py",

            line: 50,

            label: "http_url",
          },
        ],
      },
    ],

    externalDestinations: [unsafeDestination],

    limitation:
      "Scout identifies observed destinations but does not audit receiving services.",
  };
}

function createCheck4() {
  return {
    status: "PASS",

    title: "Does It Match the Official Technocore Reference?",

    conclusion:
      "Observed material behavior is consistent with the authoritative reference.",

    authority: {
      registryVersion: "1.0",

      repositoryId: TECHNOCORE_REPOSITORY_ID,

      owner: "flop-labs",

      repo: "technocore-chat",

      /*
       * Trusted registry URL.
       *
       * Query and fragment should still be removed.
       */
      canonicalUrl:
        "https://github.com/flop-labs/technocore-chat?debug=value#section",

      commitSha: TECHNOCORE_COMMIT_SHA,

      treeSha: TECHNOCORE_TREE_SHA,

      surfaces: ["scripts/sign.py", "SKILL.md", "src/manifest.py"],

      raw: "must-not-persist",
    },

    dimensions: [
      {
        category: "signing",

        status: "PASS",

        reason: "observed_behavior_consistent",

        targetLabels: ["ed25519"],

        referenceLabels: ["ed25519"],

        unknownDebugField: "must-not-persist",
      },
    ],

    differences: [],

    unresolved: [],

    limitation:
      "Matching the reference does not imply official status or endorsement.",
  };
}

function createCheck5() {
  return {
    status: "CAUTION",

    title: "What Should I Know Before I Use It?",

    conclusion:
      "One established material fact should be considered before use.",

    considerations: [
      {
        type: "external_connections",

        sourceCheck: "Where Does It Connect?",

        sourceStatus: "CAUTION",

        kind: "destination",

        host: "example.com",

        technocore: false,

        /*
         * Unknown property.
         */
        rawEvidence: "must-not-persist",
      },

      {
        type: "external_connections",

        sourceCheck: "Where Does It Connect?",

        sourceStatus: "CAUTION",

        kind: "finding",

        text: "The tool communicates with an external destination beyond Technocore.",
      },
    ],

    materialConcerns: [
      {
        type: "external_connections",

        sourceCheck: "Where Does It Connect?",

        sourceStatus: "CAUTION",

        kind: "destination",

        host: "example.com",

        technocore: false,
      },
    ],

    unresolved: [],

    precautions: [],

    limitation: "CAUTION is not an overall unsafe verdict.",
  };
}

/*
 * ------------------------------------------------
 * Full Methodology result fixture
 * ------------------------------------------------
 */

function createMethodologyResult() {
  return {
    status: "methodology_run",

    executionStatus: "complete",

    resultStatus: "CAUTION",

    /*
     * This deliberately contains dangerous-looking
     * raw data.
     *
     * The WHOLE sourceAssessment must be omitted.
     */
    sourceAssessment: {
      status: "supported_source",

      rawFileContent: `api_key="SOURCE-ASSESSMENT-SECRET"`,

      files: [
        {
          content: "PRIVATE SOURCE BODY",
        },
      ],
    },

    checks: [
      createCheck1(),
      createCheck2(),
      createCheck3(),
      createCheck4(),
      createCheck5(),
    ],

    aggregation: {
      status: "methodology_aggregated",

      counts: {
        PASS: 3,

        CAUTION: 2,

        UNKNOWN: 0,
      },

      unknownChecks: [],

      cautionChecks: [
        {
          title: "Where Does It Connect?",

          status: "CAUTION",

          reason: "fixture_caution",
        },

        {
          title: "What Should I Know Before I Use It?",

          status: "CAUTION",
        },
      ],

      notApplicableChecks: [],

      partialChecks: [],

      failedChecks: [],

      notRunChecks: [],
    },

    frozenExecution: createFrozenExecution(),

    /*
     * Unknown top-level data must never be copied.
     */
    debugPayload: {
      password: "TOP-LEVEL-SHOULD-DISAPPEAR",
    },
  };
}

/*
 * ------------------------------------------------
 * Main happy-path test
 * ------------------------------------------------
 */

console.log("\n===== HAPPY PERSISTABLE OUTCOME =====");

const happyMethodologyResult = createMethodologyResult();

const happyResult = await preparePersistableMethodologyOutcome({
  methodologyResult: happyMethodologyResult,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(happyResult, {
  depth: null,
});

/*
 * Serialize once so we can prove forbidden raw
 * values/fields never survived projection.
 */

const happyJson = JSON.stringify(happyResult.outcome);

/*
 * ------------------------------------------------
 * Missing execution context
 * ------------------------------------------------
 */

console.log("\n===== MISSING EXECUTION CONTEXT =====");

const missingContextResult = await preparePersistableMethodologyOutcome({
  methodologyResult: createMethodologyResult(),

  investigation: createInvestigation(),

  investigationId: "",

  executionId,

  attempt: 1,
});

console.dir(missingContextResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Invalid overall result status
 * ------------------------------------------------
 */

console.log("\n===== INVALID RESULT STATUS =====");

const invalidResultStatus = createMethodologyResult();

invalidResultStatus.resultStatus = "SAFE";

const invalidResultStatusResult = await preparePersistableMethodologyOutcome({
  methodologyResult: invalidResultStatus,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(invalidResultStatusResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Wrong check count
 * ------------------------------------------------
 */

console.log("\n===== WRONG CHECK COUNT =====");

const wrongCheckCount = createMethodologyResult();

wrongCheckCount.checks = wrongCheckCount.checks.slice(0, 4);

const wrongCheckCountResult = await preparePersistableMethodologyOutcome({
  methodologyResult: wrongCheckCount,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(wrongCheckCountResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Unknown Methodology check
 * ------------------------------------------------
 */

console.log("\n===== UNKNOWN METHODOLOGY CHECK =====");

const unknownCheckResultInput = createMethodologyResult();

unknownCheckResultInput.checks[4] = {
  status: "PASS",

  title: "Some Future Unrecognized Check",

  conclusion: "Fixture",
};

const unknownCheckResult = await preparePersistableMethodologyOutcome({
  methodologyResult: unknownCheckResultInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(unknownCheckResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Duplicate Methodology check
 * ------------------------------------------------
 */

console.log("\n===== DUPLICATE METHODOLOGY CHECK =====");

const duplicateCheckInput = createMethodologyResult();

duplicateCheckInput.checks[4] = createCheck4();

const duplicateCheckResult = await preparePersistableMethodologyOutcome({
  methodologyResult: duplicateCheckInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(duplicateCheckResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Missing frozen execution provenance
 * ------------------------------------------------
 */

console.log("\n===== MISSING FROZEN EXECUTION =====");

const missingFrozenInput = createMethodologyResult();

delete missingFrozenInput.frozenExecution;

const missingFrozenResult = await preparePersistableMethodologyOutcome({
  methodologyResult: missingFrozenInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(missingFrozenResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Frozen source provenance mismatch
 * ------------------------------------------------
 */

console.log("\n===== FROZEN SOURCE PROVENANCE MISMATCH =====");

const sourceMismatchInput = createMethodologyResult();

sourceMismatchInput.frozenExecution.source.commitSha =
  "cccccccccccccccccccccccccccccccccccccccc";

const sourceMismatchResult = await preparePersistableMethodologyOutcome({
  methodologyResult: sourceMismatchInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(sourceMismatchResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Registry digest mismatch
 * ------------------------------------------------
 */

console.log("\n===== REGISTRY DIGEST PROVENANCE MISMATCH =====");

const digestMismatchInput = createMethodologyResult();

digestMismatchInput.frozenExecution.referenceRegistryDigest.value =
  "different-registry-digest";

const digestMismatchResult = await preparePersistableMethodologyOutcome({
  methodologyResult: digestMismatchInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(digestMismatchResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Operational Methodology failure
 * ------------------------------------------------
 *
 * Important:
 *
 * The raw exception field below intentionally
 * contains secret-looking data.
 *
 * It MUST NOT be persisted.
 */

console.log("\n===== OPERATIONAL METHODOLOGY FAILURE =====");

const operationalFailureInput = {
  status: "frozen_methodology_not_run",

  executionStatus: "failed",

  resultStatus: null,

  reason: "execution_lease_not_renewed",

  checks: [],

  error: `api_key="RAW-EXCEPTION-SECRET-12345"`,

  sourceAssessment: {
    content: "raw failure source content",
  },
};

const operationalFailureResult = await preparePersistableMethodologyOutcome({
  methodologyResult: operationalFailureInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(operationalFailureResult, {
  depth: null,
});

const operationalFailureJson = JSON.stringify(operationalFailureResult.outcome);

/*
 * ------------------------------------------------
 * Second sensitive-data scan
 * ------------------------------------------------
 *
 * This secret is placed in an otherwise allowlisted
 * Check 5 string.
 *
 * Projection alone would allow the string.
 *
 * The SECOND scan must stop it.
 */

console.log("\n===== SECOND SENSITIVE-DATA SCAN =====");

const secretScanInput = createMethodologyResult();

secretScanInput.checks[4].precautions = [`api_key="SHOULD-BE-BLOCKED-123456"`];

const secretScanResult = await preparePersistableMethodologyOutcome({
  methodologyResult: secretScanInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(secretScanResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * Serialized size guard
 * ------------------------------------------------
 */

console.log("\n===== OVERSIZED PERSISTABLE OUTCOME =====");

const oversizedInput = createMethodologyResult();

oversizedInput.checks[4].precautions = ["a".repeat(300 * 1024)];

const oversizedResult = await preparePersistableMethodologyOutcome({
  methodologyResult: oversizedInput,

  investigation: createInvestigation(),

  investigationId,

  executionId,

  attempt: 1,
});

console.dir(oversizedResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const persistedCheck1 = happyResult.outcome?.checks?.find(
  (check) => check.title === "What does this tool actually do?",
);

const persistedCheck2 = happyResult.outcome?.checks?.find(
  (check) => check.title === "Your Key, Password & Sensitive Information",
);

const persistedCheck3 = happyResult.outcome?.checks?.find(
  (check) => check.title === "Where Does It Connect?",
);

const persistedCheck4 = happyResult.outcome?.checks?.find(
  (check) => check.title === "Does It Match the Official Technocore Reference?",
);

const persistedCheck5 = happyResult.outcome?.checks?.find(
  (check) => check.title === "What Should I Know Before I Use It?",
);

const externalDestination = persistedCheck3?.destinations?.find(
  (destination) => destination.host === "example.com",
);

const tests = {
  /*
   * Happy envelope
   */
  happyOutcomeReady: happyResult.status === "persistable_outcome_ready",

  safeSchemaProduced:
    happyResult.outcome?.schema === "scout-methodology-outcome-v1",

  executionStatusPreserved: happyResult.outcome?.executionStatus === "complete",

  resultStatusPreserved: happyResult.outcome?.resultStatus === "CAUTION",

  fiveChecksPersisted: happyResult.outcome?.checks?.length === 5,

  /*
   * Source excerpts
   */
  noExcerptFieldPersisted: !happyJson.includes(`"excerpt"`),

  check1SecretExcerptRemoved: !happyJson.includes("SUPER-SECRET-FIXTURE-VALUE"),

  check2ExcerptRemoved: !happyJson.includes("[sensitive value redacted]"),

  check3ExcerptRemoved: !happyJson.includes("requests.get(secret_url)"),

  /*
   * Check 1 evidence references
   */
  check1EvidencePathPreserved:
    persistedCheck1?.evidence?.[0]?.examples?.[0]?.path === "src/agent.py",

  check1EvidenceLinePreserved:
    persistedCheck1?.evidence?.[0]?.examples?.[0]?.line === 18,

  check1EvidenceLabelPreserved:
    persistedCheck1?.evidence?.[0]?.examples?.[0]?.label === "did_key",

  check1ExplicitExcerptFlag:
    persistedCheck1?.evidence?.[0]?.examples?.[0]?.sourceExcerptPersisted ===
    false,

  /*
   * Check 2
   */
  check2SensitiveLifecyclePreserved:
    persistedCheck2?.lifecycle?.sensitiveInput === true &&
    persistedCheck2?.lifecycle?.sensitiveProcessUse === true,

  check2UnknownLifecycleFieldDropped:
    persistedCheck2?.lifecycle?.secretDebug === undefined,

  check2SensitiveBooleanPreserved:
    persistedCheck2?.evidence?.[0]?.evidence?.[0]?.sensitive === true,

  /*
   * Check 3 URL safety
   */
  externalDestinationPreserved: externalDestination !== undefined,

  destinationReducedToOrigin:
    externalDestination?.url === "https://example.com",

  destinationHostPreserved: externalDestination?.host === "example.com",

  destinationUsernameRemoved: !happyJson.includes("user:password"),

  destinationPasswordRemoved: !happyJson.includes("password@example.com"),

  destinationPathRemoved: !happyJson.includes("/private/api"),

  destinationQueryRemoved: !happyJson.includes("SUPERSECRET123"),

  destinationFragmentRemoved: !happyJson.includes("#debug"),

  /*
   * Check 4
   */
  trustedReferencePathPreserved:
    persistedCheck4?.authority?.canonicalUrl ===
    "https://github.com/flop-labs/technocore-chat",

  trustedReferenceQueryRemoved:
    !persistedCheck4?.authority?.canonicalUrl?.includes("?"),

  trustedReferenceFragmentRemoved:
    !persistedCheck4?.authority?.canonicalUrl?.includes("#"),

  check4UnknownAuthorityFieldDropped:
    persistedCheck4?.authority?.raw === undefined,

  /*
   * Check 5
   */
  check5MaterialFactsPreserved:
    persistedCheck5?.considerations?.some(
      (fact) => fact.host === "example.com",
    ) === true,

  check5UnknownRawEvidenceDropped:
    persistedCheck5?.considerations?.[0]?.rawEvidence === undefined,

  /*
   * Whole raw structures
   */
  rawSourceAssessmentDropped:
    happyResult.outcome?.sourceAssessment === undefined,

  rawSourceAssessmentSecretDropped: !happyJson.includes(
    "SOURCE-ASSESSMENT-SECRET",
  ),

  topLevelUnknownFieldDropped: happyResult.outcome?.debugPayload === undefined,

  topLevelUnknownSecretDropped: !happyJson.includes(
    "TOP-LEVEL-SHOULD-DISAPPEAR",
  ),

  checkUnknownFieldDropped: !happyJson.includes("CHECK1-RAW-SECRET"),

  /*
   * Frozen provenance
   */
  frozenMethodologyPreserved:
    happyResult.outcome?.frozenExecution?.methodology?.version === "1.0",

  frozenRepositoryPreserved:
    happyResult.outcome?.frozenExecution?.source?.repositoryId ===
    SOURCE_REPOSITORY_ID,

  frozenCommitPreserved:
    happyResult.outcome?.frozenExecution?.source?.commitSha ===
    SOURCE_COMMIT_SHA,

  frozenTreePreserved:
    happyResult.outcome?.frozenExecution?.source?.treeSha === SOURCE_TREE_SHA,

  frozenTechnocoreReferencePreserved:
    happyResult.outcome?.frozenExecution?.technocoreReference?.commitSha ===
    TECHNOCORE_COMMIT_SHA,

  frozenRegistryDigestPreserved:
    happyResult.outcome?.frozenExecution?.referenceRegistryDigest?.value ===
    REGISTRY_DIGEST,

  /*
   * Size
   */
  byteLengthMeasured:
    Number.isInteger(happyResult.byteLength) && happyResult.byteLength > 0,

  /*
   * Validation
   */
  missingExecutionContextRejected:
    missingContextResult.status === "persistable_outcome_failed" &&
    missingContextResult.reason === "investigation_id_required",

  invalidResultStatusRejected:
    invalidResultStatusResult.status === "persistable_outcome_failed" &&
    invalidResultStatusResult.reason ===
      "unrecognized_methodology_result_status",

  wrongCheckCountRejected:
    wrongCheckCountResult.status === "persistable_outcome_failed" &&
    wrongCheckCountResult.reason === "methodology_1_0_checks_required",

  unknownCheckRejected:
    unknownCheckResult.status === "persistable_outcome_failed" &&
    unknownCheckResult.reason === "unrecognized_methodology_check",

  duplicateCheckRejected:
    duplicateCheckResult.status === "persistable_outcome_failed" &&
    duplicateCheckResult.reason === "duplicate_methodology_check",

  missingFrozenExecutionRejected:
    missingFrozenResult.status === "persistable_outcome_failed" &&
    missingFrozenResult.reason === "frozen_execution_provenance_required",

  frozenSourceMismatchRejected:
    sourceMismatchResult.status === "persistable_outcome_failed" &&
    sourceMismatchResult.reason === "frozen_source_identity_mismatch",

  digestMismatchRejected:
    digestMismatchResult.status === "persistable_outcome_failed" &&
    digestMismatchResult.reason === "reference_registry_digest_mismatch",

  /*
   * Operational failure
   */
  operationalFailurePersistable:
    operationalFailureResult.status === "persistable_outcome_ready",

  operationalFailureRemainsFailed:
    operationalFailureResult.outcome?.executionStatus === "failed",

  operationalFailureResultStatusNull:
    operationalFailureResult.outcome?.resultStatus === null,

  operationalFailureReasonPreserved:
    operationalFailureResult.outcome?.reason === "execution_lease_not_renewed",

  operationalFailureReasonReturnedForExecutionRow:
    operationalFailureResult.failureReason === "execution_lease_not_renewed",

  rawOperationalErrorDropped:
    operationalFailureResult.outcome?.error === undefined &&
    !operationalFailureJson.includes("RAW-EXCEPTION-SECRET-12345"),

  rawFailureSourceAssessmentDropped:
    operationalFailureResult.outcome?.sourceAssessment === undefined,

  /*
   * Defense in depth
   */
  secondSensitiveScanRejectsSecret:
    secretScanResult.status === "persistable_outcome_failed" &&
    secretScanResult.reason === "sensitive_data_scan_failed",

  sensitiveScanDoesNotReturnSecretValue:
    JSON.stringify(secretScanResult).includes("SHOULD-BE-BLOCKED-123456") ===
    false,

  oversizedOutcomeRejected:
    oversizedResult.status === "persistable_outcome_failed" &&
    oversizedResult.reason === "persistable_outcome_too_large",

  oversizedResultReportsLimit: oversizedResult.maximumByteLength === 256 * 1024,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== PREPARE PERSISTABLE METHODOLOGY OUTCOME TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Prepare persistable Methodology outcome test failed.");
}

console.log(
  "\n===== PREPARE PERSISTABLE METHODOLOGY OUTCOME TEST PASSED =====",
);
