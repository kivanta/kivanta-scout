import { evaluateSourceSupport } from "./evaluateSourceSupport.js";

const pythonRepoOnly = evaluateSourceSupport({
  repo: {
    status: "repo_found",
  },

  tree: {
    status: "tree_found",
    truncated: false,
  },

  python: {
    hasPython: true,
  },

  technocoreEvidence: {
    established: false,
    singleTool: false,
  },
});

console.log("PYTHON REPO ONLY:");
console.log(pythonRepoOnly);

const supportedExample = evaluateSourceSupport({
  repo: {
    status: "repo_found",
  },

  tree: {
    status: "tree_found",
    truncated: false,
  },

  python: {
    hasPython: true,
  },

  technocoreEvidence: {
    established: true,
    singleTool: true,
  },
});

console.log("SUPPORTED EXAMPLE:");
console.log(supportedExample);
