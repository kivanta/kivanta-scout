import { prepareInvestigation } from "./prepareInvestigation.js";

/*
 * TEST 1
 * Empty input should stop before discovery.
 */
const invalidResult = await prepareInvestigation("   ");

console.log("\n===== INVALID REQUEST =====");

console.dir(invalidResult, {
  depth: null,
});

/*
 * TEST 2
 * Discovery runs, but Scout cannot establish
 * a supported source.
 */
const discoveryOnlyResult = await prepareInvestigation("did:key:test-example", {
  discoveryRunner: async () => ({
    status: "discovery_required",
    reason: "supported_source_not_established",

    inputType: "technocore_did",

    methodologyEligible: false,

    canonicalSource: null,
  }),
});

console.log("\n===== DISCOVERY ONLY =====");

console.dir(discoveryOnlyResult, {
  depth: null,
});

/*
 * TEST 3
 * Discovery establishes a supported
 * canonical GitHub source.
 */
const sourceReadyResult = await prepareInvestigation(
  "https://github.com/kivanta/example",
  {
    discoveryRunner: async () => ({
      status: "supported_source",
      reason: null,

      inputType: "github_repo",

      methodologyEligible: true,

      canonicalSource: {
        owner: "kivanta",
        repo: "example",
      },

      source: {
        sourceAssessment: {
          status: "supported_source",
        },
      },
    }),
  },
);

console.log("\n===== SOURCE READY =====");

console.dir(sourceReadyResult, {
  depth: null,
});
