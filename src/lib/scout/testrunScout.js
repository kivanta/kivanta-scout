import { runScout } from "./runScout.js";
import { runMethodology } from "./runMethodology.js";

/*
 * SUPPORTED DISCOVERY FIXTURE
 */

async function supportedDiscoveryRunner() {
  return {
    status: "supported_source",

    inputType: "website_url",

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

        reason: "v1_source_requirements_established",

        repository: {
          repositoryId: 123456789,

          fullName: "example/scout-tool",

          defaultBranch: "main",

          archived: false,

          /*
           * Frozen candidate snapshot.
           */
          commitSha: "1111111111111111111111111111111111111111",

          treeSha: "2222222222222222222222222222222222222222",
        },

        tree: {
          status: "tree_found",

          truncated: false,

          items: [],
        },

        python: {
          hasPython: true,
        },

        technocoreEvidence: {
          established: true,
        },

        toolIdentity: {
          singleTool: true,
        },
      },
    },
  };
}

/*
 * CONTROLLED CHECK FIXTURES
 */

async function fixtureCheck1Runner() {
  return {
    status: "PASS",

    title: "What does this tool actually do?",

    conclusion: "Controlled fixture reached Check 1.",

    evidence: [],
  };
}

async function fixtureCheck2Runner() {
  return {
    status: "PASS",

    title: "Your Key, Password & Sensitive Information",

    conclusion: "Controlled fixture reached Check 2.",

    evidence: [],
  };
}

async function fixtureCheck3Runner() {
  return {
    status: "PASS",

    title: "Where Does It Connect?",

    conclusion: "Controlled fixture reached Check 3.",

    evidence: [],
  };
}

async function fixtureCheck4Runner() {
  return {
    status: "PASS",

    title: "Does It Match the Official Technocore Reference?",

    conclusion: "Controlled fixture reached Check 4.",

    evidence: [],
  };
}

async function fixtureCheck5Runner({ priorChecks }) {
  return {
    status: "PASS",

    title: "What Should I Know Before I Use It?",

    conclusion: "Controlled fixture reached Check 5.",

    priorCheckCount: priorChecks.length,

    evidence: [],
  };
}

/*
 * Use the real runMethodology(),
 * but replace its individual checks
 * with controlled fixtures.
 */

async function fixtureMethodologyRunner(owner, repo, options) {
  return runMethodology(owner, repo, {
    ...options,

    check1Runner: fixtureCheck1Runner,

    check2Runner: fixtureCheck2Runner,

    check3Runner: fixtureCheck3Runner,

    check4Runner: fixtureCheck4Runner,

    check5Runner: fixtureCheck5Runner,
  });
}

/*
 * DISCOVERY-ONLY FIXTURE
 */

async function discoveryOnlyRunner() {
  return {
    status: "discovery_only",

    reason: "multiple_github_repositories_found",

    inputType: "website_url",

    methodologyEligible: false,
  };
}

async function methodologyMustNotRun() {
  throw new Error("Methodology should not run for discovery-only input.");
}

/*
 * TEST 1
 *
 * Supported discovery reaches
 * Methodology 1.0 using a frozen
 * repository snapshot.
 */

console.log("SUPPORTED END-TO-END:");

console.dir(
  await runScout("https://example.com", {
    discoveryRunner: supportedDiscoveryRunner,

    methodologyRunner: fixtureMethodologyRunner,
  }),
  {
    depth: null,
  },
);

/*
 * TEST 2
 *
 * Ambiguous discovery stops before
 * Methodology 1.0.
 */

console.log("\nDISCOVERY ONLY:");

console.dir(
  await runScout("https://example.com", {
    discoveryRunner: discoveryOnlyRunner,

    methodologyRunner: methodologyMustNotRun,
  }),
  {
    depth: null,
  },
);
