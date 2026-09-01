import { runMethodology } from "./runMethodology.js";

async function fixtureSourceAssessor() {
  return {
    status: "supported_source",
    reason: "v1_source_requirements_established",

    repository: {
      fullName: "fixture-owner/fixture-tool",
      defaultBranch: "main",
      archived: false,
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

async function fixtureCheck1Runner() {
  return {
    status: "PASS",
    title: "What does this tool actually do?",
    conclusion: "Controlled fixture successfully reached Check 1.",
    evidence: [],
  };
}

async function fixtureCheck2Runner() {
  return {
    status: "PASS",
    title: "Your Key, Password & Sensitive Information",
    conclusion: "Controlled fixture successfully reached Check 2.",
    evidence: [],
  };
}

async function fixtureCheck3Runner() {
  return {
    status: "PASS",
    title: "Where Does It Connect?",
    conclusion: "Controlled fixture successfully reached Check 3.",
    evidence: [],
  };
}

async function fixtureCheck4Runner() {
  return {
    status: "PASS",
    title: "Does It Match the Official Technocore Reference?",
    conclusion: "Controlled fixture successfully reached Check 4.",
    evidence: [],
  };
}

async function fixtureCheck5Runner({ priorChecks }) {
  return {
    status: "PASS",
    title: "What Should I Know Before I Use It?",
    conclusion: "Controlled fixture successfully reached Check 5.",
    priorCheckCount: priorChecks.length,
    evidence: [],
  };
}

const result = await runMethodology("fixture-owner", "fixture-tool", {
  sourceAssessor: fixtureSourceAssessor,

  check1Runner: fixtureCheck1Runner,

  check2Runner: fixtureCheck2Runner,

  check3Runner: fixtureCheck3Runner,

  check4Runner: fixtureCheck4Runner,

  check5Runner: fixtureCheck5Runner,
});

console.dir(result, {
  depth: null,
});
