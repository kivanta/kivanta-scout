import { getScoutInvestigationStatus } from "./getScoutInvestigationStatus.js";

/*
 * Kivanta Scout
 * Investigation Status Tests
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

function createRepository({ getInvestigation } = {}) {
  return {
    claimActiveInvestigation: async () => ({
      status: "investigation_not_claimed",
    }),

    getInvestigation:
      getInvestigation ||
      (async () => ({
        status: "investigation_not_found",

        reason: null,

        investigation: null,
      })),

    updateInvestigation: async () => ({
      status: "investigation_not_updated",
    }),
  };
}

/*
 * ------------------------------------------------
 * 1. Missing ID
 * ------------------------------------------------
 */

await test("missing investigation ID is rejected", async () => {
  let reads = 0;

  const repository = createRepository({
    getInvestigation: async () => {
      reads += 1;

      throw new Error("repository should not run");
    },
  });

  const result = await getScoutInvestigationStatus("   ", {
    investigationRepository: repository,
  });

  assert(
    result.status === "invalid_request",
    `Expected invalid_request, received ${result.status}.`,
  );

  assert(
    result.reason === "investigation_id_required",
    `Unexpected reason: ${result.reason}.`,
  );

  assert(reads === 0, `Expected 0 repository reads, received ${reads}.`);
});

/*
 * ------------------------------------------------
 * 2. Unknown investigation
 * ------------------------------------------------
 */

await test("unknown investigation returns not found", async () => {
  const repository = createRepository({
    getInvestigation: async () => ({
      status: "investigation_not_found",

      reason: null,

      investigation: null,
    }),
  });

  const result = await getScoutInvestigationStatus("investigation-missing", {
    investigationRepository: repository,
  });

  assert(
    result.status === "investigation_not_found",
    `Expected investigation_not_found, received ${result.status}.`,
  );

  assert(result.investigation === null, "Expected no investigation.");
});

/*
 * ------------------------------------------------
 * 3. Durable investigation found
 * ------------------------------------------------
 */

await test("durable investigation returns public status projection", async () => {
  const repository = createRepository({
    getInvestigation: async () => ({
      status: "investigation_found",

      reason: null,

      investigation: {
        investigationId: "investigation-123",

        lifecycleState: "RUNNING",

        createdAt: "2026-09-09T12:00:00.000Z",

        updatedAt: "2026-09-09T12:05:00.000Z",

        /*
         * These fields must NOT leak through
         * the public application projection.
         */
        target: {
          secretInternalTarget: true,
        },

        reviewKey: {
          repositoryId: 123456,
        },

        failureReason: "internal detail",
      },
    }),
  });

  const result = await getScoutInvestigationStatus("investigation-123", {
    investigationRepository: repository,
  });

  assert(
    result.status === "investigation_found",
    `Expected investigation_found, received ${result.status}.`,
  );

  assert(
    result.investigation.investigationId === "investigation-123",
    "Expected investigation ID.",
  );

  assert(
    result.investigation.lifecycleState === "RUNNING",
    "Expected RUNNING lifecycle.",
  );

  assert(
    !("target" in result.investigation),
    "Frozen target must not be public.",
  );

  assert(
    !("reviewKey" in result.investigation),
    "Review key must not be public.",
  );

  assert(
    !("failureReason" in result.investigation),
    "Raw failure reason must not be public.",
  );
});

/*
 * ------------------------------------------------
 * 4. Durable read failure
 * ------------------------------------------------
 */

await test("repository read failure becomes bounded application failure", async () => {
  const repository = createRepository({
    getInvestigation: async () => ({
      status: "investigation_query_failed",

      reason: "d1_investigation_query_failed",

      investigation: null,

      error: "raw database information",
    }),
  });

  const result = await getScoutInvestigationStatus("investigation-123", {
    investigationRepository: repository,
  });

  assert(
    result.status === "investigation_status_failed",
    `Expected investigation_status_failed, received ${result.status}.`,
  );

  assert(result.investigation === null, "Expected no investigation.");

  assert(!("error" in result), "Raw repository error must not escape.");
});

/*
 * ------------------------------------------------
 * Result
 * ------------------------------------------------
 */

console.log("");

console.log(`${passed}/${passed + failed} PASS`);

if (failed > 0) {
  process.exitCode = 1;
}
