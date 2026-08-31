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

const result = await runMethodology("fixture-owner", "fixture-tool", {
  sourceAssessor: fixtureSourceAssessor,

  check1Runner: fixtureCheck1Runner,
});

console.log(result);
