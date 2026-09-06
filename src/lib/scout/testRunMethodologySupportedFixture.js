import { runMethodology } from "./runMethodology.js";

/*
 * Controlled supported-source fixture.
 *
 * This gives Methodology 1.0 a stable,
 * frozen source snapshot without making
 * live GitHub requests.
 */
async function fixtureSourceAssessor() {
  return {
    status: "supported_source",
    reason: "v1_source_requirements_established",

    repository: {
      fullName: "fixture-owner/fixture-tool",
      defaultBranch: "main",
      archived: false,

      // Frozen candidate snapshot.
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
  };
}

/*
 * CHECK 1 FIXTURE
 */
async function fixtureCheck1Runner() {
  return {
    status: "PASS",

    title: "What does this tool actually do?",

    conclusion: "Controlled fixture successfully reached Check 1.",

    evidence: [],
  };
}

/*
 * CHECK 2 FIXTURE
 */
async function fixtureCheck2Runner() {
  return {
    status: "PASS",

    title: "Your Key, Password & Sensitive Information",

    conclusion: "Controlled fixture successfully reached Check 2.",

    evidence: [],
  };
}

/*
 * CHECK 3 FIXTURE
 */
async function fixtureCheck3Runner() {
  return {
    status: "PASS",

    title: "Where Does It Connect?",

    conclusion: "Controlled fixture successfully reached Check 3.",

    evidence: [],
  };
}

/*
 * CHECK 4 FIXTURE
 */
async function fixtureCheck4Runner() {
  return {
    status: "PASS",

    title: "Does It Match the Official Technocore Reference?",

    conclusion: "Controlled fixture successfully reached Check 4.",

    evidence: [],
  };
}

/*
 * CHECK 5 FIXTURE
 *
 * Check 5 receives the results from
 * Checks 1–4.
 */
async function fixtureCheck5Runner({ priorChecks }) {
  return {
    status: "PASS",

    title: "What Should I Know Before I Use It?",

    conclusion: "Controlled fixture successfully reached Check 5.",

    priorCheckCount: priorChecks.length,

    evidence: [],
  };
}

/*
 * Run Methodology 1.0 against the
 * controlled supported-source fixture.
 */
const result = await runMethodology("fixture-owner", "fixture-tool", {
  sourceAssessor: fixtureSourceAssessor,

  check1Runner: fixtureCheck1Runner,

  check2Runner: fixtureCheck2Runner,

  check3Runner: fixtureCheck3Runner,

  check4Runner: fixtureCheck4Runner,

  check5Runner: fixtureCheck5Runner,
});

/*
 * Show the full result.
 */
console.dir(result, {
  depth: null,
});
