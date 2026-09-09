import { createScoutInvestigation } from "./createScoutInvestigation.js";

/*
 * Kivanta Scout
 * Create Scout Investigation Tests
 *
 * Proves:
 *
 * 1. empty input does not write to D1
 * 2. unsupported discovery does not write to D1
 * 3. supported source creates a durable investigation
 * 4. duplicate active review joins the existing investigation
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function test(name, callback) {
  try {
    await callback();

    passed += 1;

    console.log(`PASS — ${name}`);
  } catch (error) {
    failed += 1;

    console.error(
      `FAIL — ${name}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/*
 * ------------------------------------------------
 * Shared repository factory
 * ------------------------------------------------
 *
 * validateInvestigationRepository() requires:
 *
 * - claimActiveInvestigation
 * - getInvestigation
 * - updateInvestigation
 */

function createRepository({ claimActiveInvestigation } = {}) {
  return {
    claimActiveInvestigation:
      claimActiveInvestigation ||
      (async () => ({
        status: "investigation_claimed",
        reason: null,
        joinedExisting: false,
        investigation: null,
      })),

    getInvestigation: async () => ({
      status: "investigation_not_found",
      reason: null,
      investigation: null,
    }),

    updateInvestigation: async () => ({
      status: "investigation_not_updated",
      reason: "not_used_in_test",
      investigation: null,
    }),
  };
}

/*
 * ------------------------------------------------
 * Shared supported discovery result
 * ------------------------------------------------
 */

function createSupportedDiscoveryResult() {
  return {
    status: "supported_source",

    inputType: "github_repo",

    methodologyEligible: true,

    canonicalSource: {
      owner: "example",
      repo: "scout-tool",
      canonicalUrl: "https://github.com/example/scout-tool",
    },

    source: {
      status: "supported_source",

      sourceAssessment: {
        status: "supported_source",

        repository: {
          repositoryId: 123456,

          fullName: "example/scout-tool",

          defaultBranch: "main",

          archived: false,

          commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

          treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      },
    },
  };
}

/*
 * ------------------------------------------------
 * Shared frozen result
 * ------------------------------------------------
 */

function createFrozenResult() {
  return {
    status: "target_frozen",

    reason: null,

    target: {
      frozenAt: "2026-09-09T12:00:00.000Z",

      source: {
        repositoryId: 123456,

        owner: "example",

        repo: "scout-tool",

        canonicalUrl: "https://github.com/example/scout-tool",

        defaultBranch: "main",

        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

        treeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },

      methodology: {
        id: "kivanta-scout-methodology",

        version: "1.0",
      },
    },
  };
}

/*
 * ------------------------------------------------
 * Shared created record
 * ------------------------------------------------
 */

function createCreatedRecord(investigationId = "investigation-new") {
  return {
    status: "investigation_created",

    reason: null,

    investigation: {
      investigationId,

      createdAt: "2026-09-09T12:00:00.000Z",

      updatedAt: "2026-09-09T12:00:00.000Z",

      reviewKey: {
        provider: "github",

        repositoryId: 123456,

        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

        methodologyId: "kivanta-scout-methodology",

        methodologyVersion: "1.0",
      },

      target: createFrozenResult().target,
    },
  };
}

/*
 * =================================================
 * TEST 1
 * Empty input
 * =================================================
 */

await test("empty input does not create durable investigation", async () => {
  let claimCalls = 0;

  let discoveryCalls = 0;

  const repository = createRepository({
    claimActiveInvestigation: async () => {
      claimCalls += 1;

      throw new Error("claim should not run");
    },
  });

  const discoveryRunner = async () => {
    discoveryCalls += 1;

    throw new Error("discovery should not run");
  };

  const result = await createScoutInvestigation("   ", {
    discoveryRunner,

    investigationRepository: repository,
  });

  assert(
    result.status === "invalid_request",
    `Expected invalid_request, received ${result.status}.`,
  );

  assert(
    result.reason === "input_required",
    `Expected input_required, received ${result.reason}.`,
  );

  assert(result.investigationId === null, "Expected no investigation ID.");

  assert(
    discoveryCalls === 0,
    `Expected 0 discovery calls, received ${discoveryCalls}.`,
  );

  assert(
    claimCalls === 0,
    `Expected 0 durable claim calls, received ${claimCalls}.`,
  );
});

/*
 * =================================================
 * TEST 2
 * Unsupported / discovery-only input
 * =================================================
 */

await test("unsupported discovery does not create durable investigation", async () => {
  let claimCalls = 0;

  let freezerCalls = 0;

  let recordCreatorCalls = 0;

  const repository = createRepository({
    claimActiveInvestigation: async () => {
      claimCalls += 1;

      throw new Error("claim should not run");
    },
  });

  const discoveryRunner = async () => ({
    status: "discovery_only",

    reason: "supported_source_not_established",

    inputType: "website_url",

    methodologyEligible: false,

    canonicalSource: null,

    source: null,
  });

  const targetFreezer = async () => {
    freezerCalls += 1;

    throw new Error("freezer should not run");
  };

  const recordCreator = () => {
    recordCreatorCalls += 1;

    throw new Error("record creator should not run");
  };

  const result = await createScoutInvestigation("https://example.com", {
    discoveryRunner,

    investigationRepository: repository,

    targetFreezer,

    recordCreator,
  });

  assert(
    result.status === "discovery_only",
    `Expected discovery_only, received ${result.status}.`,
  );

  assert(
    result.methodologyEligible === false,
    "Expected methodologyEligible false.",
  );

  assert(result.investigationId === null, "Expected no investigation ID.");

  assert(
    freezerCalls === 0,
    `Expected 0 freezer calls, received ${freezerCalls}.`,
  );

  assert(
    recordCreatorCalls === 0,
    `Expected 0 record creator calls, received ${recordCreatorCalls}.`,
  );

  assert(
    claimCalls === 0,
    `Expected 0 durable claim calls, received ${claimCalls}.`,
  );
});

/*
 * =================================================
 * TEST 3
 * Supported source creates durable investigation
 * =================================================
 */

await test("supported source creates durable investigation", async () => {
  let claimCalls = 0;

  let claimedRecord = null;

  const frozen = createFrozenResult();

  const created = createCreatedRecord("investigation-new");

  const repository = createRepository({
    claimActiveInvestigation: async (investigation) => {
      claimCalls += 1;

      claimedRecord = investigation;

      return {
        status: "investigation_claimed",

        reason: null,

        joinedExisting: false,

        investigation: {
          ...investigation,

          lifecycleState: "CREATED",

          failureReason: null,
        },
      };
    },
  });

  const result = await createScoutInvestigation(
    "https://github.com/example/scout-tool",
    {
      discoveryRunner: async () => createSupportedDiscoveryResult(),

      investigationRepository: repository,

      targetFreezer: async () => frozen,

      recordCreator: () => created,
    },
  );

  assert(
    result.status === "investigation_accepted",
    `Expected investigation_accepted, received ${result.status}.`,
  );

  assert(
    result.investigationId === "investigation-new",
    `Expected investigation-new, received ${result.investigationId}.`,
  );

  assert(
    result.lifecycleState === "CREATED",
    `Expected CREATED, received ${result.lifecycleState}.`,
  );

  assert(
    result.joinedExisting === false,
    "Expected a newly claimed investigation.",
  );

  assert(
    result.methodologyEligible === true,
    "Expected methodologyEligible true.",
  );

  assert(
    claimCalls === 1,
    `Expected 1 durable claim call, received ${claimCalls}.`,
  );

  assert(
    claimedRecord === created.investigation,
    "Expected created investigation record to be claimed.",
  );
});

/*
 * =================================================
 * TEST 4
 * Duplicate active review joins existing work
 * =================================================
 */

await test("duplicate active review joins existing investigation", async () => {
  let claimCalls = 0;

  const frozen = createFrozenResult();

  const created = createCreatedRecord("investigation-discarded");

  const existingInvestigation = {
    ...created.investigation,

    investigationId: "investigation-existing",

    lifecycleState: "QUEUED",
  };

  const repository = createRepository({
    claimActiveInvestigation: async () => {
      claimCalls += 1;

      return {
        status: "investigation_claimed",

        reason: "active_investigation_exists",

        joinedExisting: true,

        investigation: existingInvestigation,
      };
    },
  });

  const result = await createScoutInvestigation(
    "https://github.com/example/scout-tool",
    {
      discoveryRunner: async () => createSupportedDiscoveryResult(),

      investigationRepository: repository,

      targetFreezer: async () => frozen,

      recordCreator: () => created,
    },
  );

  assert(
    result.status === "investigation_accepted",
    `Expected investigation_accepted, received ${result.status}.`,
  );

  assert(
    result.investigationId === "investigation-existing",
    `Expected existing investigation ID, received ${result.investigationId}.`,
  );

  assert(
    result.lifecycleState === "QUEUED",
    `Expected QUEUED, received ${result.lifecycleState}.`,
  );

  assert(result.joinedExisting === true, "Expected joinedExisting true.");

  assert(
    result.reason === "active_investigation_exists",
    `Expected active_investigation_exists, received ${result.reason}.`,
  );

  assert(
    claimCalls === 1,
    `Expected 1 durable claim call, received ${claimCalls}.`,
  );
});

/*
 * =================================================
 * RESULT
 * =================================================
 */

console.log("");

console.log(`${passed}/${passed + failed} PASS`);

if (failed > 0) {
  process.exitCode = 1;
}
