import { runCheck1 } from "./runCheck1.js";

const result = await runCheck1({
  owner: "psf",
  repo: "requests",
  branch: "main",

  sourceAssessment: {
    status: "source_not_established",
  },

  tree: {},
  python: {},
  technocoreEvidence: {},
  toolIdentity: {},
});

console.log(result);
